#!/usr/bin/env bash
# Restore the most recent component-owned SQLite backup. User data is kept.
set -Eeuo pipefail

data_dir="${OMR_DATA_DIR:-${HOME}/.omr}"
db="${data_dir}/config.sqlite"
label="${1:-}"
if [[ -z "$label" ]]; then
  label=$(find "$data_dir" -maxdepth 1 -type f -name 'config.sqlite.bak-*' -print 2>/dev/null | sort | tail -1 | sed 's#.*config.sqlite.bak-##')
fi
[[ -n "$label" ]] || { echo "ERR: 无 config.sqlite 备份可回滚" >&2; exit 1; }
source="${db}.bak-${label}"
[[ -f "$source" ]] || { echo "ERR: $source 不存在" >&2; exit 1; }
mkdir -p "$data_dir"
cp -p "$source" "$db"
for suffix in -wal -shm; do
  side_source="${source}${suffix}"
  [[ -f "$side_source" ]] && cp -p "$side_source" "${db}${suffix}"
done
chmod 600 "$db"
echo "✅ OMR 配置已回滚到 $label；请重新运行 install/verify.sh。"
