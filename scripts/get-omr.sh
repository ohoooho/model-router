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
#   2. OMR (桃仙 tarball 优先 → github release fallback → npm 公开包 fallback)
#   3. Taoxian License v1.2 验签 (可选, --no-license 跳过)
#   4. 启动 OMR gateway + UI (http://127.0.0.1:3456/#v2)
#
# v0.1.0 (K-273, 2026-09-14) — 老板 09-14 16:41 lockin
# ============================================================================
set -e

OMR_VERSION="${OMR_VERSION:-0.1.0}"
DOPPLE_BASE="${DOPPLE_BASE:-https://dopple.ohoooho.com}"
GITHUB_BASE="${GITHUB_BASE:-https://github.com/ohoooho/model-router/releases/download/v${OMR_VERSION}}"
NPM_FALLBACK="@ohoooho/model-router"
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

run() {
  if $DRY_RUN; then echo "  [DRY-RUN] $*"; else eval "$@"; fi
}

# 1. Node.js 22 检查 (跟 install-v4.3.sh 同源)
info "检查 Node.js 22+ ..."
if ! command -v node >/dev/null 2>&1; then
  err "node 没装, 请先装 Node.js 22+ (https://nodejs.org)"
  exit 1
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  err "Node.js $NODE_MAJOR 太老, 需要 22+"
  exit 1
fi
ok "Node.js $(node -v) ✅"

# 2. OMR 装机 (3 路 fallback)
info "装 OMR v$OMR_VERSION (桃仙 tarball → github release → npm 公开包)..."

if ! $DRY_RUN; then
  # 路 A: 桃仙 tarball (跟 install-v4.3.sh OMR_NPM_PACKAGE 同源)
  if npm i -g "$DOPPLE_BASE/omr/ohoooho-model-router-${OMR_VERSION}.tgz" --build-from-source=false 2>/dev/null | tail -3; then
    ok "OMR 装好 (桃仙 tarball v$OMR_VERSION)"
  # 路 B: github release
  elif npm i -g "$GITHUB_BASE/ohoooho-model-router-${OMR_VERSION}.tgz" --build-from-source=false 2>/dev/null | tail -3; then
    ok "OMR 装好 (github release v$OMR_VERSION)"
  # 路 C: npm 公开包
  elif npm i -g "$NPM_FALLBACK" --build-from-source=false 2>/dev/null | tail -3; then
    ok "OMR 装好 (npm $NPM_FALLBACK)"
  else
    err "OMR 装失败 (3 路 fallback 全 fail)"
    exit 1
  fi

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
    err "model-router / ccr command 没找到"
    exit 1
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
