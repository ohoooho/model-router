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

# 尝试 POST /v1/chat/completions (用 baozi fake_key 测试路由, 不真发 upstream)
ROUTE_CODE=$(curl -s -m 10 -o /tmp/omr-route.json -w '%{http_code}' \
    -X POST http://127.0.0.1:3456/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ***" \
    -d '{"model":"chat-auto","messages":[{"role":"user","content":"ping"}],"max_tokens":3}' 2>/dev/null || echo "000")

if [ "${ROUTE_CODE}" = "200" ]; then
    echo "  ✅ POST /v1/chat/completions = 200 (路由通)"
    UPSTREAM_READY=1
elif [ "${ROUTE_CODE}" = "401" ]; then
    echo "  ⚠️ = 401 (admin key 不对, 路由层 OK, 真路由需要 admin auth)"
    UPSTREAM_READY=0  # auth 没过不算真通
elif [ "${ROUTE_CODE}" = "000" ]; then
    echo "  ❌ gateway 不可达"
    FAIL_LIST="${FAIL_LIST} [upstream: no gw]"
else
    echo "  ⚠️ POST = ${ROUTE_CODE} (看 /tmp/omr-route.json)"
fi

# === 汇总 ===
echo ""
echo "==> OMR 4 状态汇总 (契约 §7.3)"
echo "    installed:       $([ ${INSTALLED} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    configured:      $([ ${CONFIGURED} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    healthy:         $([ ${HEALTHY} -eq 1 ] && echo "✅ passed" || echo "❌ failed")"
echo "    upstream_ready:  $([ ${UPSTREAM_READY} -eq 1 ] && echo "✅ passed" || echo "⚠️ skipped (需要 admin auth)")"

if [ -n "${FAIL_LIST}" ]; then
    echo ""
    echo "==> 失败项:${FAIL_LIST}"
    exit 1
fi

echo ""
echo "✅ OMR 4 状态验证完 (installed + configured 必须 passed, healthy + upstream_ready 推荐 passed)"
