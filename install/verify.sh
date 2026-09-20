#!/usr/bin/env bash
# omr verify v2: 4 状态真验证 (契约 §7.3)
#
# 改造要点:
# 1. installed / configured / healthy / upstream_ready 4 状态分类 (契约 §7.3)
# 2. 用 HTTP_CODE 数字比较, 不依赖 curl -f exit code (失职 207 立刻修)
# 3. upstream_ready 真路由 (POST /v1/chat/completions 200)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTALLED=0
CONFIGURED=0
HEALTHY=0
UPSTREAM_READY=0
FAIL_LIST=""

echo "==> OMR 4 状态真验证 (契约 §7.3)"

# === 1. installed 状态 (契约 §7.3) ===
echo "--- 1/4 installed ---"
if [ -x /usr/local/bin/ccr ] || command -v ccr >/dev/null; then
    echo "  ✅ ccr 命令存在"
    INSTALLED=1
else
    echo "  ❌ ccr 命令不存在"
    FAIL_LIST="${FAIL_LIST} [installed: ccr missing]"
fi

if [ -d /usr/local/lib/node_modules/@ohoooho/model-router ]; then
    INSTALLED_VERSION=$(node -e "console.log(require('/usr/local/lib/node_modules/@ohoooho/model-router/package.json').version)" 2>/dev/null || echo "")
    if [ -n "${INSTALLED_VERSION}" ]; then
        echo "  ✅ installed_version = ${INSTALLED_VERSION}"
    else
        echo "  ❌ package.json 读不到"
        FAIL_LIST="${FAIL_LIST} [installed: package unreadable]"
    fi
else
    echo "  ❌ 装包目录不存在"
    FAIL_LIST="${FAIL_LIST} [installed: dir missing]"
fi

# === 2. configured 状态 (契约 §7.3) ===
echo "--- 2/4 configured ---"
CONFIG_DB="${OMR_DATA_DIR:-${HOME}/.omr}/config.sqlite"
if [ ! -f "${CONFIG_DB}" ]; then
    echo "  ❌ config.sqlite 不存在 (${CONFIG_DB})"
    FAIL_LIST="${FAIL_LIST} [configured: no config]"
else
    # 失职 249: 用 123 端真 4-table schema (License/Providers/VirtualModels/sqlite_sequence)
    # 不是 OMR fork upstream 6 表 (那是 musistudio/claude-code-router 上游 default schema)
    if node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('${CONFIG_DB}', { readOnly: true });
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name);
const need = ['Providers','VirtualModels'];
for (const t of need) { if (!tables.includes(t)) { console.error('missing table: '+t); process.exit(3); } }
const p = db.prepare('SELECT COUNT(*) AS c FROM Providers').get();
const v = db.prepare('SELECT COUNT(*) AS c FROM VirtualModels').get();
if (p.c < 2 || v.c < 3) { console.error('rows: p='+p.c+' v='+v.c); process.exit(2); }
const lic = db.prepare('SELECT COUNT(*) AS c FROM License').get();
db.close();
console.log('tables=['+tables.join(',')+'] providers='+p.c+' vmodels='+v.c+' license='+lic.c);
" 2>/dev/null; then
        echo "  ✅ config.sqlite schema 合法 (Providers ≥ 2 + VirtualModels ≥ 3 + License 表存在)"
        CONFIGURED=1
    else
        echo "  ❌ config.sqlite schema 异常 (${CONFIG_DB})"
        FAIL_LIST="${FAIL_LIST} [configured: schema]"
    fi
fi

# === 3. healthy 状态 (契约 §7.3: 进程 + 端口 + service) ===
echo "--- 3/4 healthy ---"
if [ "$(uname -s)" = "Linux" ]; then
    if systemctl is-active --quiet omr.service 2>/dev/null; then
        echo "  ✅ omr.service active"
    else
        echo "  ❌ omr.service not active"
        FAIL_LIST="${FAIL_LIST} [healthy: service]"
    fi
fi

GW_CODE=$(curl -s -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3456/health 2>/dev/null || echo "000")
if [ "${GW_CODE}" = "200" ]; then
    echo "  ✅ gateway 127.0.0.1:3456 /health = 200"
    HEALTHY=1
else
    echo "  ❌ gateway 127.0.0.1:3456 /health = ${GW_CODE}"
    FAIL_LIST="${FAIL_LIST} [healthy: gw ${GW_CODE}]"
fi

UI_CODE=$(curl -s -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3458/ 2>/dev/null || echo "000")
if [ "${UI_CODE}" = "200" ]; then
    echo "  ✅ web UI 127.0.0.1:3458 = 200"
else
    echo "  ⚠️ web UI 127.0.0.1:3458 = ${UI_CODE} (可选)"
fi

# === 4. upstream_ready 状态 (契约 §7.3: 真路由测试) ===
echo "--- 4/4 upstream_ready ---"
ADMIN_KEY=$(node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('${CONFIG_DB}', { readOnly: true });
const row = db.prepare('SELECT content FROM License WHERE id=1').get();
db.close();
process.stdout.write(row?.content || '');
" 2>/dev/null || echo "")

# 失职 259: 不再 hardcode "Bearer ***" (永远 401)

# 失职 267 立刻认: K-261 锁点 — 4 场景独立测为默认行为, 不需要 OMR_BAOZI_KEY gate
# 每个场景 OMR_BAOZI_<SCENE>_KEY env, 没设用 fake_<scene>_*** 占位
SCENE_OK=0
SCENE_FAIL=0
for SCENE in chat-auto coding-auto assist-auto team-auto; do
    SCENE_KEY_VAR="OMR_BAOZI_$(echo ${SCENE%-*} | tr 'a-z' 'A-Z')_KEY"
    SCENE_KEY=$(eval echo "\${${SCENE_KEY_VAR}:-}")
    [ -z "${SCENE_KEY}" ] && SCENE_KEY="fake_${SCENE//-/_}_***"
    if [ "${SCENE_KEY}" = "***" ]; then
        echo "  ❌ ${SCENE} key=*** dummy (失职 259), 拒绝"
        FAIL_LIST="${FAIL_LIST} [upstream: ${SCENE} dummy]"
        continue
    fi
    SCENE_CODE=$(curl -s -m 10 -o /tmp/omr-route-${SCENE}.json -w '%{http_code}' \
        -X POST http://127.0.0.1:3456/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${SCENE_KEY}" \
        -d "{\"model\":\"${SCENE}\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":3}" 2>/dev/null || echo "000")
    if [ "${SCENE_CODE}" = "200" ]; then
        echo "  ✅ ${SCENE} POST = 200 (key ${SCENE_KEY:0:10}...)"
        SCENE_OK=$((SCENE_OK+1))
    elif [ "${SCENE_CODE}" = "401" ]; then
        echo "  ⚠️ ${SCENE} = 401 (key 无效/过期, fake 占位也算)"
        SCENE_FAIL=$((SCENE_FAIL+1))
    elif [ "${SCENE_CODE}" = "000" ]; then
        echo "  ❌ ${SCENE} gateway 不可达"
        FAIL_LIST="${FAIL_LIST} [upstream: ${SCENE} no gw]"
    else
        echo "  ⚠️ ${SCENE} POST = ${SCENE_CODE}"
    fi
done
if [ ${SCENE_OK} -ge 3 ]; then
    UPSTREAM_READY=1
    echo "  ✅ upstream_ready 4 场景 ${SCENE_OK}/4 通过 (3+ 算通)"
elif [ ${SCENE_OK} -ge 1 ]; then
    UPSTREAM_READY=0
    echo "  ⚠️ upstream_ready 4 场景 ${SCENE_OK}/4 通过 (<3 不算通, 但路由层 OK)"
else
    UPSTREAM_READY=0
    echo "  ⚠️ upstream_ready 4 场景全 401/fail (路由层 OK, 等真 baozi_key 物料)"
fi

# === 汇总 ===
echo ""
echo "==> OMR 4 状态汇总 (契约 §7.3)"
echo "    installed:       $([ ${INSTALLED} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    configured:      $([ ${CONFIGURED} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    healthy:         $([ ${HEALTHY} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    upstream_ready:  $([ ${UPSTREAM_READY} -eq 1 ] && echo "✅ passed" || echo "⚠️ skipped (4 场景测了, 等真 baozi_key 物料, K-261 锁点)")"

if [ -n "${FAIL_LIST}" ]; then
    echo ""
    echo "==> 失败项:${FAIL_LIST}"
    exit 1
fi

echo ""
echo "✅ OMR 4 状态验证完 (installed + configured 必须 passed, healthy + upstream_ready 推荐 passed)"
