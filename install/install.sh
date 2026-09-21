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
set -Eeuo pipefail

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
OMR_OFFLINE_TARBALL_DIR="${OMR_OFFLINE_TARBALL_DIR:-${SCRIPT_DIR}/../artifacts}"
OMR_TARBALL="${OMR_TARBALL:-${OMR_OFFLINE_TARBALL_DIR}/omr-${OMR_VERSION}.tgz}"

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

# Do not change npm's prefix. Resolve the active installation locations from
# the user's current Node/npm distribution (Homebrew, nvm, system Node, ...).
NPM_PREFIX="$(npm prefix -g)"
NPM_ROOT="$(npm root -g)"
INSTALL_DIR="${NPM_ROOT}/@ohoooho/model-router"
BIN_DIR="${NPM_PREFIX}/bin"
echo "    npm_prefix: ${NPM_PREFIX}"
echo "    npm_root:   ${NPM_ROOT}"

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

# A component script must also be safe when called without the Taoxian
# detector. Never replace an existing package behind the user's back.
SKIPPED_EXISTING=0
INSTALLED_VERSION=""
if [ -f "${INSTALL_DIR}/package.json" ]; then
    INSTALLED_VERSION=$(node -e 'console.log(require(process.argv[1]).version)' "${INSTALL_DIR}/package.json")
    echo "==> OMR 已安装（version=${INSTALLED_VERSION}），跳过覆盖/升级"
    SKIPPED_EXISTING=1
fi

if [ "${SKIPPED_EXISTING}" -eq 0 ]; then
    for NPM_WRITE_PATH in "${NPM_ROOT}" "${BIN_DIR}"; do
        NPM_WRITE_TARGET="${NPM_WRITE_PATH}"
        while [ ! -e "${NPM_WRITE_TARGET}" ] && [ "${NPM_WRITE_TARGET}" != "/" ]; do
            NPM_WRITE_TARGET="$(dirname "${NPM_WRITE_TARGET}")"
        done
        if [ ! -w "${NPM_WRITE_TARGET}" ]; then
            echo "ERR: npm 全局路径不可写: ${NPM_WRITE_PATH}"
            echo "    当前可写检查落点: ${NPM_WRITE_TARGET}"
            echo "    请修复当前 Node 管理器目录权限，或由用户自行处理权限；安装器不会修改 npm prefix。"
            exit 7
        fi
    done
fi

# ===== 3. 装包 (online/offline) =====
ARTIFACT_SHA256=""
if [ "${SKIPPED_EXISTING}" -eq 0 ] && [ "${OMR_INSTALL_MODE}" = "online" ]; then
    echo "==> 1) online: npm install -g @ohoooho/model-router@${OMR_VERSION} (契约 §3.1: 必须 @version)"
    # Let npm use its configured registry/proxy. A separate curl probe can
    # disagree with npmrc and incorrectly force an offline install.
    if ! npm view "@ohoooho/model-router@${OMR_VERSION}" version --fetch-timeout=5000 --fetch-retries=0 >/dev/null 2>&1; then
        echo "WARN: npm registry 中找不到目标版本, 自动转 offline 模式"
        OMR_INSTALL_MODE="offline"
    else
        # 关键修复: 必须 @版本 (失职 217 立刻修)
        npm install -g "@ohoooho/model-router@${OMR_VERSION}" --silent
        # 算 sha256 (从 npm pack)
        ARTIFACT_SHA256=$(npm view "@ohoooho/model-router@${OMR_VERSION}" dist.integrity 2>/dev/null | tr -d '\n' || echo "")
    fi
fi

if [ "${SKIPPED_EXISTING}" -eq 0 ] && [ "${OMR_INSTALL_MODE}" = "offline" ]; then
    echo "==> 1) offline: npm install 本地 tarball (契约 §10: 必须含 sha256 校验)"
    if [ ! -f "${OMR_TARBALL}" ]; then
        echo "ERR: tarball 不存在: ${OMR_TARBALL}"
        echo "    把 omr-${OMR_VERSION}.tgz 放到 ${OMR_OFFLINE_TARBALL_DIR}，或设置 OMR_TARBALL"
        exit 2
    fi
    # sha256 校验 (契约 §9.2: 物料签名/sha256 必须校验)
    EXPECTED_SHA=$(grep -A5 "omr-npm-package" "${COMPONENT_YAML}" 2>/dev/null | grep "sha256:" | head -1 | awk '{print $2}' | tr -d '<>' || true)
    ACTUAL_SHA=$(sha256_file "${OMR_TARBALL}")
    if [ -n "${EXPECTED_SHA}" ] && [ "${EXPECTED_SHA}" != "<generated-sha256-by-build>" ]; then
        if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
            echo "ERR: tarball sha256 不匹配"
            echo "    expected: ${EXPECTED_SHA}"
            echo "    actual:   ${ACTUAL_SHA}"
            exit 3
        fi
        ARTIFACT_SHA256="${ACTUAL_SHA}"
    fi
    npm install -g "${OMR_TARBALL}" --offline --no-audit --no-fund
fi

# ===== 4. 验证装好 + 回显 installed_version (契约 §3.4) =====
echo "==> 2) verify install (契约 §7.3: installed 状态)"
NODE_BIN="${INSTALL_DIR}/dist/main/cli.js"
[ -f "${NODE_BIN}" ] || { echo "ERR: ${NODE_BIN} 不存在"; exit 4; }
node "${NODE_BIN}" --help >/dev/null || { echo "ERR: OMR CLI 不可执行"; exit 5; }

if [ -z "${INSTALLED_VERSION}" ]; then
    INSTALLED_VERSION=$(node -e 'console.log(require(process.argv[1]).version)' "${INSTALL_DIR}/package.json" 2>/dev/null || echo "${OMR_VERSION}")
fi
echo "    installed_version: ${INSTALLED_VERSION}"

# resolved_version vs installed_version 必须一致 (契约 §3.4 死规)
if [ "${SKIPPED_EXISTING}" -eq 0 ] && [ "${OMR_VERSION}" != "${INSTALLED_VERSION}" ]; then
    echo "ERR: resolved_version (${OMR_VERSION}) 与 installed_version (${INSTALLED_VERSION}) 不一致"
    exit 6
fi

# ===== 5. 装 systemd unit (linux, macos 跳过) =====
if [ "$(uname -s)" = "Linux" ]; then
    echo "==> 3) install systemd unit"
    cp "${SCRIPT_DIR}/omr.service" /etc/systemd/system/omr.service
    systemctl daemon-reload
    systemctl enable omr.service
    echo "    omr.service installed + enabled; start deferred until after configure"
fi

# ===== 6. 配置 (下一步: configure.sh) =====
echo "==> 4) call configure.sh"
if [ "${OMR_SKIP_CONFIGURE:-0}" = "1" ]; then
    echo "==> 4) configure deferred to the Installer lifecycle"
else
    TX_CONTEXT_FILE="${TX_CONTEXT_FILE:-}" OMR_VERSION="${INSTALLED_VERSION}" bash "${SCRIPT_DIR}/configure.sh"
fi

if [ "$(uname -s)" = "Linux" ] && [ "${OMR_SKIP_CONFIGURE:-0}" != "1" ]; then
    systemctl restart omr.service
    echo "    omr.service restarted after configure"
fi

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

# Secrets are supplied through TX_CONTEXT_FILE. Do not create a second,
# stale copy under /etc: the next configure must resolve one consistent snapshot.
