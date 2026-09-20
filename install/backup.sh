#!/usr/bin/env bash
# omr backup: 备份 config.json 到 .bak-<label>
set -euo pipefail
LABEL="${1:-manual-$(date +%s)}"
SRC="/root/.omr/config.json"
DST="/root/.omr/config.json.bak-${LABEL}"
if [ -f "$SRC" ]; then
    cp -a "$SRC" "$DST"
    chmod 600 "$DST"
    echo "✅ 备份到 $DST"
else
    echo "ERR: $SRC 不存在"
    exit 1
fi
