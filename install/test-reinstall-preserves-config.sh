#!/usr/bin/env bash
# Regression: a repeat deploy/configure must not wipe existing providers, keys,
# virtual models, or one-time legacy limit cleanup.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

DATA_DIR="${TMP_DIR}/data"
CONTEXT_FILE="${TMP_DIR}/context.json"
mkdir -p "${DATA_DIR}"
printf '{}\n' > "${CONTEXT_FILE}"

export OMR_DATA_DIR="${DATA_DIR}"
export OMR_VERSION="0.1.0"

sha_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

write_config() {
  env \
    PERSONA_BAOZI_KEY="${PERSONA_BAOZI_KEY:-real-persona}" \
    BUTLER_BAOZI_KEY="${BUTLER_BAOZI_KEY:-real-butler}" \
    BAOZI_CHAT_KEY="${BAOZI_CHAT_KEY:-real-chat}" \
    BAOZI_CODING_KEY="${BAOZI_CODING_KEY:-real-coding}" \
    BAOZI_ASSIST_KEY="${BAOZI_ASSIST_KEY:-real-assist}" \
    BAOZI_TEAM_KEY="${BAOZI_TEAM_KEY:-real-team}" \
    ADMIN_KEY="${ADMIN_KEY:-real-admin}" \
    node "${SCRIPT_DIR}/write-config.js" >/dev/null
}

# 1. Seed a "real" install.
write_config

# 2. Add user-owned provider/model/virtual model changes.
node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
const row = db.prepare("SELECT value_json FROM app_config WHERE key='default'").get();
const config = JSON.parse(row.value_json);
config.Providers = [
  {
    name: 'baozi',
    baseUrl: 'https://custom.example/v1',
    apiKey: 'real-butler',
    models: ['my-custom-model'],
  },
  {
    name: 'my-provider',
    baseUrl: 'https://other.example/v1',
    apiKey: 'other',
    models: ['x'],
  },
];
db.prepare("UPDATE app_config SET value_json=? WHERE key='default'").run(JSON.stringify(config));
db.prepare("UPDATE app_config SET value_json=? WHERE key='virtual_models'").run(JSON.stringify({
  'my-virtual': { display_name: 'Mine' },
}));
db.close();
NODE

before="$(sha_file "${DATA_DIR}/config.sqlite")"

# 3. Plain configure must skip an existing config (repeat deploy path).
TX_CONTEXT_FILE="${CONTEXT_FILE}" bash "${SCRIPT_DIR}/configure.sh" >/dev/null
after_skip="$(sha_file "${DATA_DIR}/config.sqlite")"
[ "${before}" = "${after_skip}" ] || {
  echo "FAIL: plain configure changed existing config" >&2
  exit 1
}

# 4. Explicit reconfigure without keys must preserve existing keys/provider/models.
TX_CONTEXT_FILE="${CONTEXT_FILE}" OMR_RECONFIGURE_EXISTING=1 \
  bash "${SCRIPT_DIR}/configure.sh" >/dev/null

node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
const config = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='default'").get().value_json);
const baozi = config.Providers.find((provider) => provider.name === 'baozi');
if (!baozi) throw new Error('baozi provider missing');
if (baozi.apiKey !== 'real-butler') throw new Error(`baozi key changed: ${baozi.apiKey}`);
if (baozi.baseUrl !== 'https://custom.example/v1') throw new Error(`baozi baseUrl changed: ${baozi.baseUrl}`);
if (!baozi.models.includes('my-custom-model')) throw new Error('custom baozi model missing');
if (!config.Providers.some((provider) => provider.name === 'my-provider')) throw new Error('custom provider missing');

const persona = db.prepare("SELECT encrypted_key FROM api_keys WHERE id='baozi-persona'").get();
const admin = db.prepare("SELECT encrypted_key FROM api_keys WHERE id='local-gateway'").get();
if (persona?.encrypted_key !== 'real-persona') throw new Error('persona key changed');
if (admin?.encrypted_key !== 'real-admin') throw new Error('admin key changed');

const virtual = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='virtual_models'").get().value_json);
if (!virtual['my-virtual']) throw new Error('custom virtual model missing');
db.close();
NODE

# 5. Legacy 60/100000 seeds are removed exactly once, then user values survive.
node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
db.prepare("UPDATE api_keys SET limits_json=? WHERE id='baozi-persona'").run(JSON.stringify({ rpm: 60, tpm: 100000 }));
db.prepare("DELETE FROM config_schema_migrations WHERE id='limits-seed-cleanup-v1'").run();
db.close();
NODE
write_config
node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
const row = db.prepare("SELECT limits_json FROM api_keys WHERE id='baozi-persona'").get();
if (row.limits_json !== '{}') throw new Error(`legacy limits not cleaned: ${row.limits_json}`);
db.prepare("UPDATE api_keys SET limits_json=? WHERE id='baozi-persona'").run(JSON.stringify({ rpm: 60, tpm: 100000 }));
db.close();
NODE
write_config
node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
const row = db.prepare("SELECT limits_json FROM api_keys WHERE id='baozi-persona'").get();
const limits = JSON.parse(row.limits_json);
if (limits.rpm !== 60 || limits.tpm !== 100000) throw new Error(`user limits were changed: ${row.limits_json}`);
db.close();
NODE

echo "PASS: repeat deploy/configure preserves config; legacy limits cleaned once"
