#!/usr/bin/env bash
# Regression: backup.sh/rollback.sh must work under set -u even when their
# human-readable messages place Chinese punctuation after a variable.
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/omr-backup-test.XXXXXX")"
trap 'rm -rf "${tmp}"' EXIT

command -v sqlite3 >/dev/null || { echo "SKIP: sqlite3 not installed"; exit 0; }

export OMR_DATA_DIR="${tmp}/data"
mkdir -p "${OMR_DATA_DIR}"
sqlite3 "${OMR_DATA_DIR}/config.sqlite" "create table t(v text); insert into t values ('before');"

bash "${script_dir}/backup.sh" "regression-$(date +%s)" >/dev/null
backup_count=$(find "${OMR_DATA_DIR}" -maxdepth 1 -type f -name 'config.sqlite.bak-*' | wc -l | tr -d '[:space:]')
[ "${backup_count}" -ge 1 ] || { echo "FAIL: no backup created"; exit 1; }

sqlite3 "${OMR_DATA_DIR}/config.sqlite" "update t set v='after';"
label=$(find "${OMR_DATA_DIR}" -maxdepth 1 -type f -name 'config.sqlite.bak-*' | sort | tail -1 | sed 's#.*config.sqlite.bak-##')
bash "${script_dir}/rollback.sh" "${label}" >/dev/null

value=$(sqlite3 "${OMR_DATA_DIR}/config.sqlite" "select v from t;")
[ "${value}" = "before" ] || { echo "FAIL: expected before, got ${value}"; exit 1; }
echo "PASS: backup.sh/rollback.sh restore SQLite config"
