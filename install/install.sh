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
COMPONENT_YAML="${COMPONENT_YAML:-${SCRIPT_DIR}/component.yaml}"
NPM_COMMAND="${NPM_COMMAND:-npm}"
NODE_COMMAND="${NODE_COMMAND:-node}"

# 从 component.yaml 的 artifacts 段按 artifact id 读一个字段.
#
# 修 bug: 旧写法 `grep -A5 "<id>" component.yaml | grep "sha256:"` 是空转 ——
# sha256 字段在 "- id:" 之后第 7 行, 落在 -A5 窗口外, 永远取不到,
# 契约 §9.2 "物料 sha256 必须校验" 实际从来没生效过.
# 现在按 block 解析: 命中 "- id: <id>" 之后, 只在该 block 内找目标字段.
#
# 用法: artifact_field <component.yaml> <artifact-id> <field>
artifact_field() {
    local yaml="$1" artifact_id="$2" field="$3"
    awk -v want="${artifact_id}" -v field="${field}" '
        /^[ \t]*-[ \t]*id:[ \t]*/ {
            id = $0
            sub(/^[ \t]*-[ \t]*id:[ \t]*/, "", id)
            gsub(/"/, "", id)
            gsub(/[ \t\r]+$/, "", id)
            inblock = (id == want)
            next
        }
        inblock && $0 ~ ("^[ \t]*" field "[ \t]*:") {
            val = $0
            sub("^[ \t]*" field "[ \t]*:[ \t]*", "", val)
            sub(/[ \t]*#.*$/, "", val)     # 去掉行尾注释
            gsub(/"/, "", val)
            gsub(/[ \t\r]+$/, "", val)
            print val
            exit
        }
        inblock && /^[A-Za-z_][A-Za-z0-9_]*[ \t]*:/ { inblock = 0 }
    ' "${yaml}"
}

# ===== 1. 读 default_version 从 component.yaml =====
DEFAULT_VERSION=$(grep -A1 "default_version:" "${COMPONENT_YAML}" | head -1 | sed 's/.*default_version:[[:space:]]*//')
[ -z "${DEFAULT_VERSION}" ] && { echo "ERR: component.yaml default_version 缺失"; exit 1; }

# 用户/订单/CLI 覆盖
OMR_REQUESTED_VERSION="${OMR_VERSION:-}"
OMR_VERSION="${OMR_REQUESTED_VERSION:-${DEFAULT_VERSION}}"
OMR_VERSION_POLICY="${OMR_VERSION_POLICY:-default}"
OMR_INSTALL_MODE="${OMR_INSTALL_MODE:-online}"
OMR_OFFLINE_TARBALL_DIR="${OMR_OFFLINE_TARBALL_DIR:-${SCRIPT_DIR}/../artifacts}"
# 两份物料结构不同, 哈希各归各的, 不能互相替代 (契约 §5 artifacts / §9.2):
#   omr-npm-package     -> ohoooho-model-router-0.1.0.tgz  (package/ 根, npm install -g 用)
#   omr-offline-package -> omr-<version>.tar.gz              (ohoooho/model-router/ 前缀目录树, 离线解包用)
# 文件名以 component.yaml 的 artifacts[].path 为准, 不在脚本里拼版本号.
OMR_NPM_TARBALL="${OMR_NPM_TARBALL:-${OMR_OFFLINE_TARBALL_DIR}/$(artifact_field "${COMPONENT_YAML}" "omr-npm-package" "path")}"
OMR_TARBALL="${OMR_TARBALL:-${OMR_OFFLINE_TARBALL_DIR}/$(artifact_field "${COMPONENT_YAML}" "omr-offline-package" "path")}"

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
command -v "${NODE_COMMAND}" >/dev/null || { echo "ERR: node 未装"; exit 1; }
NODE_MAJOR=$("${NODE_COMMAND}" -e "console.log(process.versions.node.split('.')[0])")
[ "${NODE_MAJOR}" -ge 22 ] || { echo "ERR: node ≥ 22 要求, 现在 v${NODE_MAJOR}"; exit 1; }
command -v "${NPM_COMMAND}" >/dev/null || { echo "ERR: npm 未装"; exit 1; }

# Do not change npm's prefix. Resolve the active installation locations from
# the user's current Node/npm distribution (Homebrew, nvm, system Node, ...).
NPM_PREFIX="$("${NPM_COMMAND}" prefix -g)"
NPM_ROOT="$("${NPM_COMMAND}" root -g)"
NPM_REGISTRY="${OMR_NPM_REGISTRY:-$("${NPM_COMMAND}" config get registry)}"
INSTALL_DIR="${NPM_ROOT}/@ohoooho/model-router"
BIN_DIR="${NPM_PREFIX}/bin"
echo "    npm_prefix: ${NPM_PREFIX}"
echo "    npm_root:   ${NPM_ROOT}"
echo "    npm_registry: ${NPM_REGISTRY}"
echo "    npm_offline: $("${NPM_COMMAND}" config get offline)"
echo "    proxy: ${HTTPS_PROXY:-${HTTP_PROXY:-<not set>}}"

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
    INSTALLED_VERSION=$("${NODE_COMMAND}" -e 'console.log(require(process.argv[1]).version)' "${INSTALL_DIR}/package.json")
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
    if "${NPM_COMMAND}" view "@ohoooho/model-router@${OMR_VERSION}" version \
        --registry="${NPM_REGISTRY}" --fetch-timeout=5000 --fetch-retries=0 >/dev/null 2>&1; then
        # 在线装的物料也要按声明的 hex sha256 校验, 且**先校验后安装**。
        # npm view dist.integrity 是 base64 SRI, 与 component.yaml 声明的
        # hex sha256 编码不同, 不能拿来比 —— 取 dist.shasum。
        EXPECTED_NPM_SHA=$(artifact_field "${COMPONENT_YAML}" "omr-npm-package" "sha256")
        ACTUAL_SHA=$("${NPM_COMMAND}" view "@ohoooho/model-router@${OMR_VERSION}" dist.shasum \
            --registry="${NPM_REGISTRY}" 2>/dev/null | tr -d '\n' || echo "")
        if [ -z "${ACTUAL_SHA}" ]; then
            echo "ERR: 拿不到 registry 上的 dist.shasum, 物料无法校验, 拒绝安装"
            exit 3
        fi
        if [ -n "${EXPECTED_NPM_SHA}" ] && [ "${EXPECTED_NPM_SHA}" != "<generated-sha256-by-build>" ] && [ "${EXPECTED_NPM_SHA}" != "${ACTUAL_SHA}" ]; then
            echo "ERR: npm tarball sha256 不匹配"
            echo "    expected: ${EXPECTED_NPM_SHA}"
            echo "    actual:   ${ACTUAL_SHA}"
            exit 3
        fi
        ARTIFACT_SHA256="${ACTUAL_SHA}"
        "${NPM_COMMAND}" install -g "@ohoooho/model-router@${OMR_VERSION}" \
            --registry="${NPM_REGISTRY}" --offline=false --no-audit --no-fund
    elif [ -f "${OMR_NPM_TARBALL}" ]; then
        echo "WARN: npm registry 未能查询目标版本；不据此判断版本不存在或强制离线。"
        echo "      使用本地 OMR npm tarball，并通过 registry 在线解析/下载依赖。"
        # npm 物料用 omr-npm-package 的哈希 (契约 §9.2)
        EXPECTED_NPM_SHA=$(artifact_field "${COMPONENT_YAML}" "omr-npm-package" "sha256")
        ACTUAL_SHA=$(sha256_file "${OMR_NPM_TARBALL}")
        if [ -n "${EXPECTED_NPM_SHA}" ] && [ "${EXPECTED_NPM_SHA}" != "<generated-sha256-by-build>" ] && [ "${EXPECTED_NPM_SHA}" != "${ACTUAL_SHA}" ]; then
            echo "ERR: npm tarball sha256 不匹配"
            echo "    expected: ${EXPECTED_NPM_SHA}"
            echo "    actual:   ${ACTUAL_SHA}"
            exit 3
        fi
        ARTIFACT_SHA256="${ACTUAL_SHA}"
        "${NPM_COMMAND}" install -g "${OMR_NPM_TARBALL}" \
            --registry="${NPM_REGISTRY}" --offline=false --no-audit --no-fund
    else
        echo "ERR: 无法从 npm registry 查询 @ohoooho/model-router@${OMR_VERSION}，且没有本地 tarball。"
        echo "    registry: ${NPM_REGISTRY}"
        echo "    请检查 npm registry/代理，或提供 ${OMR_NPM_TARBALL}"
        exit 9
    fi
fi

if [ "${SKIPPED_EXISTING}" -eq 0 ] && [ "${OMR_INSTALL_MODE}" = "offline" ]; then
    echo "==> 1) offline: 本地离线包安装 (契约 §10: 必须含 sha256 校验)"
    if [ ! -f "${OMR_TARBALL}" ]; then
        echo "ERR: 离线包不存在: ${OMR_TARBALL}"
        echo "    把 $(basename "${OMR_TARBALL}") 放到 ${OMR_OFFLINE_TARBALL_DIR}，或设置 OMR_TARBALL"
        exit 2
    fi
    # sha256 校验 (契约 §9.2): 离线物料用 omr-offline-package 自己的哈希.
    # 不能拿 omr-npm-package 的哈希比 —— 两份物料结构不同, 哈希各归各的.
    EXPECTED_SHA=$(artifact_field "${COMPONENT_YAML}" "omr-offline-package" "sha256")
    if [ -z "${EXPECTED_SHA}" ]; then
        echo "ERR: component.yaml 里找不到 omr-offline-package.sha256"
        exit 3
    fi
    ACTUAL_SHA=$(sha256_file "${OMR_TARBALL}")
    if [ "${EXPECTED_SHA}" != "<generated-sha256-by-build>" ]; then
        if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
            echo "ERR: 离线包 sha256 不匹配"
            echo "    expected: ${EXPECTED_SHA}"
            echo "    actual:   ${ACTUAL_SHA}"
            exit 3
        fi
        ARTIFACT_SHA256="${ACTUAL_SHA}"
    else
        echo "WARN: component.yaml 里 omr-offline-package.sha256 还是占位符, 跳过校验"
    fi
    # 离线物料是 ohoooho/model-router/ 前缀的目录树 (自带运行时依赖),
    # 直接解到 npm root, 不走 npm —— 离线机器没有 registry.
    STAGE_DIR=$(mktemp -d)
    tar -xzf "${OMR_TARBALL}" -C "${STAGE_DIR}"
    if [ ! -d "${STAGE_DIR}/ohoooho/model-router" ]; then
        echo "ERR: 离线包结构不对: 期望 ohoooho/model-router/ 前缀"
        exit 3
    fi
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    if [ -e "${INSTALL_DIR}" ]; then
        BACKUP_DIR="${INSTALL_DIR}.bak-$(date +%Y%m%d-%H%M%S)"
        echo "WARN: ${INSTALL_DIR} 已存在但不是标准安装, 备份为 ${BACKUP_DIR}"
        mv "${INSTALL_DIR}" "${BACKUP_DIR}"
    fi
    mv "${STAGE_DIR}/ohoooho/model-router" "${INSTALL_DIR}"
    rm -rf "${STAGE_DIR}"
    for BIN_NAME in ccr omr model-router; do
        ln -sf "${INSTALL_DIR}/dist/main/cli.js" "${BIN_DIR}/${BIN_NAME}"
    done
    echo "    offline package installed: ${INSTALL_DIR}"
fi

# ===== 4. 验证装好 + 回显 installed_version (契约 §3.4) =====
echo "==> 2) verify install (契约 §7.3: installed 状态)"
NODE_BIN="${INSTALL_DIR}/dist/main/cli.js"
[ -f "${NODE_BIN}" ] || { echo "ERR: ${NODE_BIN} 不存在"; exit 4; }
"${NODE_COMMAND}" "${NODE_BIN}" --help >/dev/null || { echo "ERR: OMR CLI 不可执行"; exit 5; }

if [ -z "${INSTALLED_VERSION}" ]; then
    INSTALLED_VERSION=$("${NODE_COMMAND}" -e 'console.log(require(process.argv[1]).version)' "${INSTALL_DIR}/package.json" 2>/dev/null || echo "${OMR_VERSION}")
fi
echo "    installed_version: ${INSTALLED_VERSION}"

# resolved_version vs installed_version 必须一致 (契约 §3.4 死规)
if [ "${SKIPPED_EXISTING}" -eq 0 ] && [ "${OMR_VERSION}" != "${INSTALLED_VERSION}" ]; then
    echo "ERR: resolved_version (${OMR_VERSION}) 与 installed_version (${INSTALLED_VERSION}) 不一致"
    exit 6
fi

# better-sqlite3 是 OMR 的运行时必需原生依赖。npm 可能复用由另一
# Node ABI 构建的 .node 文件：npm install 会成功，但 OMR 启动时才失败。
# 新安装和已有安装都必须在“当前 node”下验证，失败时只重建这个组件，
# 不改 npm prefix，也不覆盖用户的其他全局包。
verify_native_sqlite() {
    "${NODE_COMMAND}" - "${INSTALL_DIR}" <<'NODE'
const installDir = process.argv[2];
try {
  const modulePath = require.resolve("better-sqlite3", { paths: [installDir] });
  const Database = require(modulePath);
  const db = new Database(":memory:");
  db.prepare("select 1 as ok").get();
  db.close();
  console.log(`    better-sqlite3: ${modulePath} (Node ABI ${process.versions.modules})`);
} catch (error) {
  console.error(`    better-sqlite3 load failed: ${error && error.message ? error.message : error}`);
  process.exit(1);
}
NODE
}

NODE_MODULES_VERSION=$("${NODE_COMMAND}" -p 'process.versions.modules')
echo "==> 2a) verify native dependency (better-sqlite3, Node ABI ${NODE_MODULES_VERSION})"
if ! verify_native_sqlite; then
    echo "WARN: better-sqlite3 不是当前 Node ABI，尝试在 OMR 安装目录重建"
    if ! "${NPM_COMMAND}" rebuild --prefix "${INSTALL_DIR}" better-sqlite3 --foreground-scripts --no-audit --no-fund; then
        echo "ERR: better-sqlite3 重建失败"
        echo "    请手动执行: ${NPM_COMMAND} rebuild --prefix '${INSTALL_DIR}' better-sqlite3 --foreground-scripts --no-audit --no-fund"
        exit 8
    fi
    if ! verify_native_sqlite; then
        echo "ERR: better-sqlite3 重建后仍无法被当前 Node 加载"
        echo "    请手动执行: ${NPM_COMMAND} rebuild --prefix '${INSTALL_DIR}' better-sqlite3 --foreground-scripts --no-audit --no-fund"
        exit 8
    fi
    echo "    better-sqlite3 已按当前 Node ABI 重建"
else
    echo "    better-sqlite3 已可用，无需重建"
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
