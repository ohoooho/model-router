#!/usr/bin/env bash
# omr rollback: 回滚到指定备份 (默认最近)
set -euo pipefail
LABEL="${1:-}"
if [ -z "$LABEL" ]; then
    LABEL=$(ls -t /root/.omr/config.json.bak-* 2>/dev/null | head -1 | sed 's|.*\.bak-||')
fi
[ -n "$LABEL" ] || { echo "ERR: 无备份可回滚"; exit 1; }
SRC="/root/.omr/config.json.bak-${LABEL}"
[ -f "$SRC" ] || { echo "ERR: $SRC 不存在"; exit 1; }
echo "==> 回滚到 $LABEL"
cp -a "$SRC" /root/.omr/config.json
chmod 600 /root/.omr/config.json
systemctl restart omr
sleep 3
echo "✅ 回滚完, verify:"
bash "$(dirname "$0")/verify.sh"
