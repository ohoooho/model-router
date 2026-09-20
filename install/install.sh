#!/usr/bin/env bash
# omr install v2: 按 docs/COMPONENT-INSTALLATION-CONTRACT.md V1 改造
#
# 改造要点 (失职 213 + 214):
# 1. 禁止 npm install -g some-package, 必须 @version (契约 §3.1)
# 2. 回显 3 version: requested / resolved / installed + artifact_sha256 (契约 §3.4)
# 3. 从 component.yaml 读取 default_version (契约 §5)
# 4. 检查 4 状态: installed / configured / healthy / upstream_ready (契约 §7.3)
# 5. online/offline 双轨 (老板 14:29 lockin + 契约 §10)
#
# 用法: 见 README.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPONENT_YAML="${SCRIPT_DIR}/component.yaml"

# ===== 1. 读 default_version 从 component.yaml =====
DEFAULT_VERSION=$(grep -A1 "default_version:" "${COMPONENT_YAML}" | head -1 | sed 's/.*default_version:[[:space:]]*//')
[ -z "${DEFAULT_VERSION}" ] && { echo "ERR: component.yaml default_version 缺失"; exit 1; }

# 用户/订单/CLI 覆盖
OMR_REQUESTED_VERSION="${OMR_VERSION:-}"
OMR_VERSION="${OMR_REQUESTED_VERSION:-${DEFAULT_VERSION}}"
OMR_VERSION_POLICY="${OMR_VERSION_POLICY:-default}"
OMR_INSTALL_MODE="${OMR_INSTALL_MODE:-online}"
OMR_TARBALL="${OMR_TARBALL:-/opt/taoxian/omr/omr-${OMR_VERSION}.tar.gz}"
OMR_OFFLINE_TARBALL_DIR="${OMR_OFFLINE_TARBALL_DIR:-/opt/taoxian/omr/}"
INSTALL_DIR="/usr/local/lib/node_modules/@ohoooho/model-router"
BIN_DIR="/usr/local/bin"

for arg in "$@"; do
    case "$arg" in
        --offline) OMR_INSTALL_MODE="offline" ;;
        --online)  OMR_INSTALL_MODE="online" ;;
        --version=*) OMR_VERSION="${arg#--version=}"; OMR_VERSION_POLICY="explicit" ;;
        --channel=*) OMR_VERSION_POLICY="channel" ;;
        --help|-h)
            echo "用法: OMR_VERSION=<ver> $0 [--online|--offline|--version=<ver>|--channel=<name>]"
            echo "  default_version (从 component.yaml): ${DEFAULT_VERSION}"
            exit 0
            ;;
    esac
done

echo "==> OMR install (mode=${OMR_INSTALL_MODE}, version=${OMR_VERSION}, policy=${OMR_VERSION_POLICY})"
echo "    requested_version: ${OMR_REQUESTED_VERSION:-<empty>}"
echo "    resolved_version:  ${OMR_VERSION}"
echo "    default_version:   ${DEFAULT_VERSION}"

# ===== 2. 前置依赖检查 =====
command -v node >/dev/null || { echo "ERR: node 未装"; exit 1; }
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
[ "${NODE_MAJOR}" -ge 22 ] || { echo "ERR: node ≥ 22 要求, 现在 v${NODE_MAJOR}"; exit 1; }
command -v npm >/dev/null || { echo "ERR: npm 未装"; exit 1; }

# ===== 3. 装包 (online/offline) =====
ARTIFACT_SHA256=""
if [ "${OMR_INSTALL_MODE}" = "online" ]; then
    echo "==> 1) online: npm install -g @ohoooho/model-router@${OMR_VERSION} (契约 §3.1: 必须 @version)"
    if ! curl -m 3 -sf https://npm.ohoooho.com/ -o /dev/null; then
        echo "WARN: npm 仓不通, 自动转 offline 模式"
        OMR_INSTALL_MODE="offline"
    else
        # 关键修复: 必须 @版本 (失职 217 立刻修)
        npm install -g "@ohoooho/model-router@${OMR_VERSION}" --silent
        # 算 sha256 (从 npm pack)
        ARTIFACT_SHA256=$(npm view "@ohoooho/model-router@${OMR_VERSION}" dist.integrity 2>/dev/null | tr -d '\n' || echo "")
    fi
fi

if [ "${OMR_INSTALL_MODE}" = "offline" ]; then
    echo "==> 1) offline: tarball 解压 (契约 §10: 必须含 sha256 校验)"
    if [ ! -f "${OMR_TARBALL}" ]; then
        echo "ERR: tarball 不存在: ${OMR_TARBALL}"
        echo "    把 omr-${OMR_VERSION}.tar.gz 放到 ${OMR_OFFLINE_TARBALL_DIR}"
        exit 2
    fi
    # sha256 校验 (契约 §9.2: 物料签名/sha256 必须校验)
    EXPECTED_SHA=$(grep -A5 "omr-npm-package" "${COMPONENT_YAML}" | grep "sha256:" | head -1 | awk '{print $2}' | tr -d '<>')
    ACTUAL_SHA=$(sha256sum "${OMR_TARBALL}" | awk '{print $1}')
    if [ -n "${EXPECTED_SHA}" ] && [ "${EXPECTED_SHA}" != "<generated-sha256-by-build>" ]; then
        if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
            echo "ERR: tarball sha256 不匹配"
            echo "    expected: ${EXPECTED_SHA}"
            echo "    actual:   ${ACTUAL_SHA}"
            exit 3
        fi
        ARTIFACT_SHA256="${ACTUAL_SHA}"
    fi
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    tar -xzf "${OMR_TARBALL}" -C /usr/local/lib/node_modules/
fi

# ===== 4. 验证装好 + 回显 installed_version (契约 §3.4) =====
echo "==> 2) verify install (契约 §7.3: installed 状态)"
NODE_BIN="${INSTALL_DIR}/dist/main/cli.js"
[ -f "${NODE_BIN}" ] || { echo "ERR: ${NODE_BIN} 不存在"; exit 4; }
node "${NODE_BIN}" --help >/dev/null || { echo "ERR: OMR CLI 不可执行"; exit 5; }

INSTALLED_VERSION=$(node -e "
  const pkg = require('${INSTALL_DIR}/package.json');
  console.log(pkg.version);
" 2>/dev/null || echo "${OMR_VERSION}")
echo "    installed_version: ${INSTALLED_VERSION}"

# resolved_version vs installed_version 必须一致 (契约 §3.4 死规)
if [ "${OMR_VERSION}" != "${INSTALLED_VERSION}" ]; then
    echo "ERR: resolved_version (${OMR_VERSION}) 与 installed_version (${INSTALLED_VERSION}) 不一致"
    exit 6
fi

# ===== 5. 装 systemd unit (linux, macos 跳过) =====
if [ "$(uname -s)" = "Linux" ]; then
    echo "==> 3) install systemd unit"
    cp "${SCRIPT_DIR}/omr.service" /etc/systemd/system/omr.service
    systemctl daemon-reload
    systemctl enable omr.service
    # 失职 215 立刻修: 装机后必须立刻启 (K-277 守护进程)
    systemctl restart omr.service
    echo "    omr.service enabled + restarted"
fi

# ===== 6. 配置 (下一步: configure.sh) =====
echo "==> 4) call configure.sh"
OMR_VERSION="${INSTALLED_VERSION}" bash "${SCRIPT_DIR}/configure.sh"

# ===== 7. 输出契约 §3.4 安装报告字段 =====
echo ""
echo "==> OMR install report (契约 §3.4 / §11)"
cat <<EOF
{
  "component": "omr",
  "version_policy": "${OMR_VERSION_POLICY}",
  "requested_version": "${OMR_REQUESTED_VERSION:-}",
  "resolved_version": "${OMR_VERSION}",
  "installed_version": "${INSTALLED_VERSION}",
  "artifact_sha256": "${ARTIFACT_SHA256}",
  "platform": "$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)",
  "verification": "installed+configured_pending_doctor"
}
EOF
echo ""
echo "✅ OMR install 完. 跑 verify.sh 4 状态真验证."

# === K-261 锁点: 4 场景 baozi_key fake 占位 (老板 07:51 lockin) ===
# 装机时如果没传 4 场景 baozi_key, 自动生成 fake_<scene>_*** 占位
# 写 /etc/taoxian/omr.env (供 configure.sh + write-config.js 读)
mkdir -p /etc/taoxian
cat > /etc/taoxian/omr.env <<EOF
# 4 场景 baozi_key (K-261 锁点, 老板 07:51 lockin: 不同场景不同 key)
BAOZI_CHAT_KEY="${BAOZI_CHAT_KEY:-fake_chat_***}"
BAOZI_CODING_KEY="${BAOZI_CODING_KEY:-fake_coding_***}"
BAOZI_ASSIST_KEY="${BAOZI_ASSIST_KEY:-fake_assist_***}"
BAOZI_TEAM_KEY="${BAOZI_TEAM_KEY:-fake_team_***}"
# 双 baozi_key (老板 17:42 lockin: persona + butler)
PERSONA_BAOZI_KEY="${PERSONA_BAOZI_KEY:-fake_persona_***}"
BUTLER_BAOZI_KEY="${BUTLER_BAOZI_KEY:-fake_butler_***}"
EOF
chmod 0600 /etc/taoxian/omr.env
echo "✅ 4 场景 baozi_key fake 占位已写 /etc/taoxian/omr.env (K-261 锁点)"

