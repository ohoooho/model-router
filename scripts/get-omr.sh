#!/bin/bash
# ============================================================================
# get.ohoooho.com/omr — 桃仙 OMR 装机脚本 (1 行 curl 装)
# 用法:
#   curl -fsSL https://get.ohoooho.com/omr | bash
#   curl -fsSL https://get.ohoooho.com/omr | bash -s -- --dry-run
#   curl -fsSL https://get.ohoooho.com/omr | bash -s -- --no-license
#
# 装什么 (老板 09-14 拍板):
#   1. Node.js 22 检查 (无自动装, 干净机器先 npm/手动装)
#   2. OMR (dopple 物料源, 下载后按声明的 sha256 校验)
#   3. Taoxian License v1.2 验签 (可选, --no-license 跳过)
#   4. 启动 OMR gateway + UI (http://127.0.0.1:3456/#v2)
#
# 物料与版本的唯一真源 = dopple 上的 component.yaml:
#   - 版本   : release.default_version
#   - 文件名 : artifacts[].path   (扁平命名, 不在脚本里拼版本号)
#   - 完整性 : artifacts[].sha256 (hex sha256; npm 的 dist.integrity 是
#              base64 SRI, 两种编码, 不能拿来当 sha256 比)
#
# 物料源只有 dopple 一路。github release / npm 公开包两路已删:
#   - github.com/ohoooho/model-router  → 0 个 release
#   - registry.npmjs.org/@ohoooho/model-router → E404
# 留着这两路只会在 dopple 故障时把人带进必然失败的死路, 掩盖真实故障点。
# dopple 挂了就是挂了, 这里会直说。
#
# v0.1.0 (K-273, 2026-09-14) — 老板 09-14 16:41 lockin
# v0.1.0 (2026-10-30) — 物料源收敛为 dopple 一路; 版本/文件名/哈希统一读
#                       component.yaml; 下载后按声明 sha256 校验再装
# ============================================================================
set -e

DOPPLE_BASE="${DOPPLE_BASE:-https://dopple.ohoooho.com}"
COMPONENT_YAML_URL="${DOPPLE_BASE}/omr/component.yaml"
OMR_VERSION="${OMR_VERSION:-}"
LICENSE_OPTIONAL=true
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true; shift ;;
    --no-license) export TAOXIAN_LICENSE_SKIP=1; shift ;;
    --version)    OMR_VERSION="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

info()  { printf '\033[36m[omr]\033[0m %s\n' "$*"; }
ok()    { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m[warn]\033[0m %s\n' "$*"; }
err()   { printf '\033[31m[err]\033[0m %s\n' "$*" >&2; }
die()   { err "$*"; exit 1; }

run() {
  if $DRY_RUN; then echo "  [DRY-RUN] $*"; else eval "$@"; fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# 从 component.yaml 的 artifacts 段按 artifact id 读一个字段.
# 与 install/install.sh 里同名函数保持一致: 只在 "- id: <id>" 之后的 block 内找字段.
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
      sub(/[ \t]*#.*$/, "", val)
      gsub(/"/, "", val)
      gsub(/[ \t\r]+$/, "", val)
      print val
      exit
    }
    inblock && /^[A-Za-z_][A-Za-z0-9_]*[ \t]*:/ { inblock = 0 }
  ' "${yaml}"
}

# 1. Node.js 22 检查 (跟 install-v4.3.sh 同源)
info "检查 Node.js 22+ ..."
if ! command -v node >/dev/null 2>&1; then
  die "node 没装, 请先装 Node.js 22+ (https://nodejs.org)"
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  die "Node.js $NODE_MAJOR 太老, 需要 22+"
fi
ok "Node.js $(node -v) ✅"

# 2. 取 component.yaml —— 版本/文件名/哈希的唯一真源
info "读物料清单 ${COMPONENT_YAML_URL} ..."
WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT
COMPONENT_YAML="${WORK_DIR}/component.yaml"

if ! curl -fsSL --max-time 30 "${COMPONENT_YAML_URL}" -o "${COMPONENT_YAML}"; then
  die "拿不到物料清单: ${COMPONENT_YAML_URL}
    dopple 是当前唯一物料源, 它挂了就是挂了 (github release 与 npm 公开包都没有发布过本包)。
    稍后重试, 或改用离线包: 见 install/README.md 的 offline 流程。"
fi

DEFAULT_VERSION=$(grep -A1 "default_version:" "${COMPONENT_YAML}" | head -1 | sed 's/.*default_version:[[:space:]]*//' | tr -d '"'"'"' \r')
[ -n "${DEFAULT_VERSION}" ] || die "component.yaml 里没有 default_version"
OMR_VERSION="${OMR_VERSION:-${DEFAULT_VERSION}}"

TARBALL_NAME=$(artifact_field "${COMPONENT_YAML}" "omr-npm-package" "path")
EXPECTED_SHA=$(artifact_field "${COMPONENT_YAML}" "omr-npm-package" "sha256")
[ -n "${TARBALL_NAME}" ] || die "component.yaml 里找不到 omr-npm-package.path"
[ -n "${EXPECTED_SHA}" ] || die "component.yaml 里找不到 omr-npm-package.sha256"

TARBALL_URL="${DOPPLE_BASE}/omr/${TARBALL_NAME}"
TARBALL_PATH="${WORK_DIR}/${TARBALL_NAME}"

info "装 OMR v${OMR_VERSION} (dopple 物料: ${TARBALL_NAME}) ..."

if ! $DRY_RUN; then
  echo "==> 1) 下载物料"
  if ! curl -fsSL --max-time 300 "${TARBALL_URL}" -o "${TARBALL_PATH}"; then
    die "物料下载失败: ${TARBALL_URL}
    dopple 是当前唯一物料源。"
  fi

  # 2) 校验 —— 下载物必须等于清单声明的那一份 (契约 §9.2)
  echo "==> 2) 校验 sha256"
  ACTUAL_SHA=$(sha256_file "${TARBALL_PATH}")
  if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
    err "物料 sha256 不匹配, 拒绝安装"
    err "    expected: ${EXPECTED_SHA}"
    err "    actual:   ${ACTUAL_SHA}"
    err "    来源:     ${TARBALL_URL}"
    exit 3
  fi
  ok "sha256 一致 (${ACTUAL_SHA})"

  # 3) 装
  echo "==> 3) npm install -g (本地已校验的 tarball)"
  if ! npm i -g "${TARBALL_PATH}" --build-from-source=false --no-audit --no-fund 2>&1 | tail -3; then
    die "npm install -g 失败: ${TARBALL_PATH}"
  fi
  ok "OMR 装好 (v${OMR_VERSION}, 物料 ${TARBALL_NAME})"

  # PATH 修正 (跟 install-v4.3.sh 同 BUG FIX)
  NPM_BIN=$(npm config get prefix 2>/dev/null)/bin
  if [[ ":$PATH:" != *":$NPM_BIN:"* ]]; then
    export PATH="$NPM_BIN:$PATH"
    hash -r
  fi
fi

# 3. License verify (K-251 已接 cli, 自动跑)
if [[ -z "$TAOXIAN_LICENSE_SKIP" ]]; then
  info "Taoxian License v1.2 验签 (cli 启动时自动跑)..."
  ok "License: cli 启动时会查 /etc/taoxian/license.bin + /root/.taoxian/license.bin + \$HOME/.taoxian/license.bin"
  ok "跳过: TAOXIAN_LICENSE_SKIP=1 (dev only)"
else
  warn "License 验签跳过 (--no-license)"
fi

# 4. 启动 OMR gateway + UI
info "启动 OMR gateway + UI ..."
if ! $DRY_RUN; then
  if command -v model-router >/dev/null 2>&1; then
    nohup model-router start > /tmp/omr.log 2>&1 &
    sleep 2
    ok "OMR started (pid $!)"
  elif command -v ccr >/dev/null 2>&1; then
    nohup ccr start > /tmp/omr.log 2>&1 &
    sleep 2
    ok "OMR started via ccr (pid $!)"
  else
    die "model-router / ccr command 没找到"
  fi
fi

cat <<EOF

✅ OMR 装机完成!

📌 下一步:
  - 打开 UI:    http://127.0.0.1:3456/#v2
  - gateway:    http://127.0.0.1:3456
  - management: http://127.0.0.1:3458
  - log:        tail -f /tmp/omr.log

🛡 桃仙 License:
  - 默认验证 /etc/taoxian/license.bin (root)
  - 或 \$HOME/.taoxian/license.bin (用户)
  - 或 \$TAOXIAN_LICENSE_PATH 指定
  - 跳过: TAOXIAN_LICENSE_SKIP=1 (dev only)

🆘 报问题: 跟 doc https://dopple.ohoooho.com/taoxian-omr
EOF
