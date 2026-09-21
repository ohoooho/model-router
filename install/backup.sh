#!/usr/bin/env bash
# Backup the component-owned SQLite configuration, including WAL sidecars.
set -Eeuo pipefail

data_dir="${OMR_DATA_DIR:-${HOME}/.omr}"
db="${data_dir}/config.sqlite"
label="${1:-manual-$(date +%s)}"
[[ -f "$db" ]] || { echo "ERR: $db 不存在" >&2; exit 1; }
destination="${db}.bak-${label}"
cp -p "$db" "$destination"
for sidecar in "${db}-wal" "${db}-shm"; do
  [[ -f "$sidecar" ]] && cp -p "$sidecar" "${destination}${sidecar#"$db"}"
done
chmod 600 "$destination"*
echo "✅ OMR SQLite 备份到 $destination（含存在的 WAL sidecar）"
