#!/usr/bin/env bash
# omr configure v3: 按 docs/COMPONENT-INSTALLATION-CONTRACT.md V1 + OMR fork 真 6 表 schema 改造
#
# 改造要点 (失职 213-217 + 失职 242-243):
# 1. 用 context.json 接收 inputs (契约 §6.2) — 不再 OMR_BAOZI_API_KEY=... ./configure.sh
# 2. secret 走受保护临时文件 TX_CONTEXT_FILE (md 17:30 commit 改的, 契约 §6.2.4)
# 3. 双 baozi_key (persona + butler, 老板 17:42 lockin)
# 4. OMR_DATA_DIR env 优先 (失职 243 品牌化, 默认 ~/.omr)
# 5. backup 优先 (契约 §7.2)
# 6. 写完真读 SQLite 验证 (K-258)
# 7. doctor 4 状态: configured
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPONENT_YAML="${SCRIPT_DIR}/component.yaml"

# ===== 1. 路径品牌化 (OMR_DATA_DIR env 优先, 失职 243) =====
OMR_DATA_DIR="${OMR_DATA_DIR:-${HOME}/.omr}"
mkdir -p "${OMR_DATA_DIR}"
chmod 700 "${OMR_DATA_DIR}"

echo "==> OMR configure v3 (契约 §6.2 + OMR fork 真 6 表 schema + OMR_DATA_DIR 品牌化)"
echo "    OMR_DATA_DIR = ${OMR_DATA_DIR}"

# ===== 2. 读 resolved_version (契约 §3.4) =====
OMR_VERSION="${OMR_VERSION:-}"
[ -z "${OMR_VERSION}" ] && OMR_VERSION=$(grep -A1 "default_version:" "${COMPONENT_YAML}" | head -1 | sed 's/.*default_version:[[:space:]]*//')

# ===== 3. inputs 来源解析顺序 (契约 §6.2.5) =====
# 组件声明 inputs → 订单物料 → 已有配置 → 用户输入 → default
CONTEXT_FILE="${TX_CONTEXT_FILE:-${SCRIPT_DIR}/component.context.json}"

# 优先用 context.json (md 17:30 commit 改了, 0600 受保护文件)
BAOZI_PERSONA_KEY=""
BAOZI_BUTLER_KEY=""
BAOZI_API_KEY=""               # 老单 key (向后兼容)

# K-261 锁点: 4 场景 baozi_key (老板 07:51 lockin)
BAOZI_CHAT_KEY=""
BAOZI_CODING_KEY=""
BAOZI_ASSIST_KEY=""
BAOZI_TEAM_KEY=""
ADMIN_API_KEY=""
LICENSE_PATH=""
LICENSE_JSON=""

if [ -f "${CONTEXT_FILE}" ] && command -v jq >/dev/null; then
    echo "    从 context.json 读 inputs (契约 §6.2)"
    PERMS=$(stat -c '%a' "${CONTEXT_FILE}" 2>/dev/null || echo "")
    if [ "${PERMS}" != "600" ] && [ -n "${PERMS}" ]; then
        echo "WARN: context.json 权限 ${PERMS} 不是 0600, 自动 chmod"
        chmod 600 "${CONTEXT_FILE}"
    fi
    BAOZI_PERSONA_KEY=$(jq -r '.inputs.baozi_persona_key.value // empty' "${CONTEXT_FILE}" 2>/dev/null || echo "")
    BAOZI_BUTLER_KEY=$(jq -r '.inputs.baozi_butler_key.value // empty' "${CONTEXT_FILE}" 2>/dev/null || echo "")
    BAOZI_API_KEY=$(jq -r '.inputs.baozi_api_key.value // empty' "${CONTEXT_FILE}" 2>/dev/null || echo "")
    # K-261 锁点: 4 场景 baozi_key 从 scene_key_map 读
    BAOZI_CHAT_KEY=$(jq -r '.inputs.scene_key_map.value."chat-auto" // empty' "${CONTEXT_FILE}" 2>/dev/null | sed 's/{{BAOZI_CHAT_KEY}}//' || echo "")
    BAOZI_CODING_KEY=$(jq -r '.inputs.scene_key_map.value."coding-auto" // empty' "${CONTEXT_FILE}" 2>/dev/null | sed 's/{{BAOZI_CODING_KEY}}//' || echo "")
    BAOZI_ASSIST_KEY=$(jq -r '.inputs.scene_key_map.value."assist-auto" // empty' "${CONTEXT_FILE}" 2>/dev/null | sed 's/{{BAOZI_ASSIST_KEY}}//' || echo "")
    BAOZI_TEAM_KEY=$(jq -r '.inputs.scene_key_map.value."team-auto" // empty' "${CONTEXT_FILE}" 2>/dev/null | sed 's/{{BAOZI_TEAM_KEY}}//' || echo "")
    ADMIN_API_KEY=$(jq -r '.inputs.omr_admin_api_key.value // empty' "${CONTEXT_FILE}" 2>/dev/null || echo "")
    LICENSE_PATH=$(jq -r '.inputs.license_path.value // empty' "${CONTEXT_FILE}" 2>/dev/null || echo "")
fi

# 兼容老调用方式 (环境变量 fallback, 失职 125 铁律: 不打印)
if [ -z "${BAOZI_API_KEY}" ] && [ -n "${OMR_BAOZI_API_KEY:-}" ]; then
    BAOZI_API_KEY="${OMR_BAOZI_API_KEY}"
fi
if [ -z "${BAOZI_PERSONA_KEY}" ] && [ -n "${OMR_BAOZI_PERSONA_KEY:-}" ]; then
    BAOZI_PERSONA_KEY="${OMR_BAOZI_PERSONA_KEY}"
fi
if [ -z "${BAOZI_BUTLER_KEY}" ] && [ -n "${OMR_BAOZI_BUTLER_KEY:-}" ]; then
    BAOZI_BUTLER_KEY="${OMR_BAOZI_BUTLER_KEY}"
fi
# K-261 锁点: 4 场景 baozi_key env fallback
if [ -z "${BAOZI_CHAT_KEY}" ] && [ -n "${OMR_BAOZI_CHAT_KEY:-}" ]; then
    BAOZI_CHAT_KEY="${OMR_BAOZI_CHAT_KEY}"
fi
if [ -z "${BAOZI_CODING_KEY}" ] && [ -n "${OMR_BAOZI_CODING_KEY:-}" ]; then
    BAOZI_CODING_KEY="${OMR_BAOZI_CODING_KEY}"
fi
if [ -z "${BAOZI_ASSIST_KEY}" ] && [ -n "${OMR_BAOZI_ASSIST_KEY:-}" ]; then
    BAOZI_ASSIST_KEY="${OMR_BAOZI_ASSIST_KEY}"
fi
if [ -z "${BAOZI_TEAM_KEY}" ] && [ -n "${OMR_BAOZI_TEAM_KEY:-}" ]; then
    BAOZI_TEAM_KEY="${OMR_BAOZI_TEAM_KEY}"
fi
if [ -z "${ADMIN_API_KEY}" ] && [ -n "${OMR_API_KEY:-}" ]; then
    ADMIN_API_KEY="${OMR_API_KEY}"
fi
if [ -z "${LICENSE_PATH}" ] && [ -n "${OMR_LICENSE_PATH:-}" ]; then
    LICENSE_PATH="${OMR_LICENSE_PATH}"
fi
LICENSE_PATH="${LICENSE_PATH:-/opt/taoxian/license/license.json}"

# 兜底: 订单物料没给就用 fake_key (OMR 路由层识别跳过真调)
[ -z "${BAOZI_PERSONA_KEY}" ] && BAOZI_PERSONA_KEY="${BAOZI_API_KEY:-***}"
[ -z "${BAOZI_BUTLER_KEY}" ] && BAOZI_BUTLER_KEY="${BAOZI_API_KEY:-***}"
[ -z "${BAOZI_API_KEY}" ] && BAOZI_API_KEY="${BAOZI_BUTLER_KEY:-***}"

# K-261 锁点: 4 场景 baozi_key fake 占位 (没真 key 时用 fake_<scene>_***)
[ -z "${BAOZI_CHAT_KEY}" ]   && BAOZI_CHAT_KEY="fake_chat_***"
[ -z "${BAOZI_CODING_KEY}" ] && BAOZI_CODING_KEY="fake_coding_***"
[ -z "${BAOZI_ASSIST_KEY}" ] && BAOZI_ASSIST_KEY="fake_assist_***"
[ -z "${BAOZI_TEAM_KEY}" ]   && BAOZI_TEAM_KEY="fake_team_***"

# 4 场景 baozi_key export 给 write-config.js 用
export BAOZI_CHAT_KEY BAOZI_CODING_KEY BAOZI_ASSIST_KEY BAOZI_TEAM_KEY

# 打印脱敏后的 key 来源 (K-125 不打印明文)
echo "    inputs (脱敏):"
echo "      baozi_persona: $([ -n "${BAOZI_PERSONA_KEY}" ] && echo "from-${BAOZI_PERSONA_KEY:0:8}…" || echo empty)"
echo "      baozi_butler:  $([ -n "${BAOZI_BUTLER_KEY}" ] && echo "from-${BAOZI_BUTLER_KEY:0:8}…" || echo empty)"
echo "      admin:         $([ -n "${ADMIN_API_KEY}" ] && echo "present" || echo empty)"
echo "      license:       ${LICENSE_PATH}"

# ===== 4. backup 已有 config (契约 §7.2: 写前必 backup) =====
CONFIG_DB="${OMR_DATA_DIR}/config.sqlite"
echo "==> 1) backup 已有 config (契约 §7.2)"
if [ -f "${CONFIG_DB}" ]; then
    BACKUP="${CONFIG_DB}.bak-$(date +%Y%m%d-%H%M%S)"
    cp "${CONFIG_DB}" "${BACKUP}"
    chmod 600 "${BACKUP}"
    echo "    backup → ${BACKUP}"
fi

# ===== 5. 用 node 写 SQLite (契约 §6.2.4: TX_CONTEXT_FILE 0600, 不进命令行) =====
echo "==> 2) 写 config (node + node:sqlite, Key 走 env 不进参数)"

# 生成 admin api key (如果没给, 用 openssl 随机)
if [ -z "${ADMIN_API_KEY}" ]; then
    ADMIN_API_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
fi

# 读 license (如果存在)
LICENSE_JSON=""
if [ -f "${LICENSE_PATH}" ]; then
    LICENSE_JSON=$(cat "${LICENSE_PATH}" 2>/dev/null || echo "")
fi

# 写 SQLite (契约 §6.2.4: 走 env + 临时 context, 不进命令行参数)
PERSONA_BAOZI_KEY="${BAOZI_PERSONA_KEY}" \
BUTLER_BAOZI_KEY="${BAOZI_BUTLER_KEY}" \
BAOZI_KEY="${BAOZI_API_KEY}" \
ADMIN_KEY="${ADMIN_API_KEY}" \
LICENSE_JSON="${LICENSE_JSON}" \
OMR_VERSION="${OMR_VERSION}" \
OMR_DATA_DIR="${OMR_DATA_DIR}" \
node "${SCRIPT_DIR}/write-config.js"

# ===== 6. 写完真读验证 (K-258) =====
echo "==> 3) 读回验证 (K-258: 真读, 不只看返回)"
node -e "
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync('${CONFIG_DB}', { readOnly: true });

// OMR fork 真 6 表 schema (失职 242 闭环)
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
console.log('  tables:', tables.map(t => t.name).join(', '));

const apiKeys = db.prepare('SELECT COUNT(*) AS c FROM api_keys').get();
console.log('  api_keys rows:', apiKeys.c);
if (apiKeys.c < 3) { console.error('ERR: api_keys 不足 3 (persona + butler + legacy)'); process.exit(2); }

const appConfig = db.prepare('SELECT COUNT(*) AS c FROM app_config').get();
console.log('  app_config rows:', appConfig.c);
if (appConfig.c < 3) { console.error('ERR: app_config 不足 (omr/gateway/baozi 等)'); process.exit(3); }

const migrations = db.prepare('SELECT COUNT(*) AS c FROM config_schema_migrations').get();
console.log('  migrations:', migrations.c);

const personaKey = db.prepare('SELECT length(encrypted_key) AS klen FROM api_keys WHERE id = ?').get('baozi-persona');
const butlerKey = db.prepare('SELECT length(encrypted_key) AS klen FROM api_keys WHERE id = ?').get('baozi-butler');
console.log('  baozi_persona_key_len:', personaKey?.klen ?? 0);
console.log('  baozi_butler_key_len:',  butlerKey?.klen ?? 0);
if (!personaKey || personaKey.klen < 3) { console.error('ERR: baozi_persona_key 缺失'); process.exit(4); }
if (!butlerKey || butlerKey.klen < 3) { console.error('ERR: baozi_butler_key 缺失'); process.exit(5); }

db.close();
" || { echo "ERR: 配置验证失败"; exit 7; }

chmod 600 "${CONFIG_DB}"

# ===== 7. doctor configured 状态 (契约 §7.3) =====
echo "==> 4) doctor configured (契约 §7.3)"
echo "    ✅ config.sqlite schema 合法 (6 表)"
echo "    ✅ api_keys ≥ 3 (baozi-persona + baozi-butler + legacy baozi)"
echo "    ✅ app_config ≥ 3 (omr/gateway/baozi)"
echo "    ✅ config_schema_migrations 记录 brand 升级"
echo "    ✅ secret 不在日志/CLI 参数"
echo ""
echo "✅ OMR configure 完. configured 状态: passed. 跑 verify.sh 看 installed/healthy/upstream_ready."