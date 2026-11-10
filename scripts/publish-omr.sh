#!/bin/bash
# ============================================================
# publish-omr.sh — 构建 + 打包 + 发布 OMR tarball 到云端
#
# 用法：
#   publish-omr.sh              # 构建 → npm pack → 上传 → 验证 URL
#   publish-omr.sh --skip-build # 跳过构建，只打包上传（源码没改时用）
#
# 产物：https://dopple.ohoooho.com/omr/ohoooho-model-router-<version>.tgz
# 被 install.sh 引用（CCR_NPM_PACKAGE）
# ============================================================

set -e
SRC="/root/ohoooho-model-router"
CLI="$SRC/packages/cli"
SSH_KEY="$HOME/.ssh/id_ed25519_orangepi"
SERVER="root@140.143.246.15"
REMOTE_DIR="/var/www/dopple/omr"
BASE_URL="https://dopple.ohoooho.com/omr"

cd "$SRC"
[ "${1:-}" != "--skip-build" ] && {
  echo "==> 构建..."
  npm run build:assets
}

cd "$CLI"
echo "==> npm pack..."
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "==> 产物: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

echo "==> 上传到 $SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" -o ConnectTimeout=15 "$TARBALL" "$SERVER:$REMOTE_DIR/"

VERSION=$(basename "$TARBALL" .tgz)
URL="$BASE_URL/$TARBALL"
echo "==> 验证: $URL"
curl -s -o /dev/null -w "  HTTP %{http_code}, %{size_download} bytes\n" "$URL"

echo "==> 完成。install.sh 引用的 URL 应为:"
echo "  CCR_NPM_PACKAGE=\"$URL\""
echo "（如果版本号变了，记得同步改 install.sh 的 CCR_NPM_PACKAGE）"
