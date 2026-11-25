#!/usr/bin/env bash
# Regression: existing OMR configs must keep user-selected alias models, add
# missing managed aliases with Baozi defaults, and enable Baozi, while
# preserving user-added providers (including tai) and user-selected
# preferred/fallback routes. Migration must stay idempotent even when Baozi has
# no real key.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

DATA_DIR="${TMP_DIR}/data"
mkdir -p "${DATA_DIR}"
export OMR_DATA_DIR="${DATA_DIR}"

sha_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
db.exec('CREATE TABLE app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT)');
const config = {
  Providers: [
    {
      name: 'baozi',
      enabled: false,
      baseUrl: 'https://llm.ohoooho.com/v1',
      apiKey: 'fake_baozi_***',
      models: ['coding-auto', 'assist-auto', 'chat-auto', 'team-auto', 'trial-auto'],
    },
    {
      name: 'tai',
      enabled: true,
      baseUrl: 'https://tai.example/v1',
      apiKey: 'fake_tai_***',
      models: ['deepseek-v4.1-flash-1017', 'glm-5.3-flash', 'qwen3.8-max'],
    },
  ],
  preferredProvider: 'tai',
  Router: { fallback: { models: ['tai/glm-5.3-flash'] } },
  virtualModelProfiles: [
    { id: 'coding-auto', name: 'old', baseModel: { mode: 'fixed', fixedModel: 'tai/deepseek-v4.1-flash-1017' }, custom: 1 },
    { id: 'chat-auto', name: 'old', baseModel: { mode: 'fixed', fixedModel: 'tai/glm-5.3-flash' } },
  ],
};
db.prepare("INSERT INTO app_config (key, value_json, updated_at) VALUES ('default', ?, datetime('now'))")
  .run(JSON.stringify(config));
db.close();
NODE

node "${SCRIPT_DIR}/migrate-runtime-config.js" >/dev/null

node - "${DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const config = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='default'").get().value_json);
db.close();

const baozi = config.Providers.find((provider) => provider.name === 'baozi');
const tai = config.Providers.find((provider) => provider.name === 'tai');
if (!baozi || baozi.enabled !== true) throw new Error('baozi was not enabled');
if (!tai || tai.enabled !== true) throw new Error('user-added tai provider was changed');
if (config.preferredProvider !== 'tai') throw new Error(`user preferredProvider was changed to ${config.preferredProvider}`);
if (JSON.stringify(config.Router.fallback.models) !== JSON.stringify(['tai/glm-5.3-flash'])) {
  throw new Error(`user fallback was changed to ${JSON.stringify(config.Router.fallback.models)}`);
}
const aliases = {
  // User-selected models win; migration must not pull them back to Baozi.
  'coding-auto': 'tai/deepseek-v4.1-flash-1017',
  'chat-auto': 'tai/glm-5.3-flash',
  // Missing managed aliases are seeded with their Baozi scene defaults.
  'assist-auto': 'baozi/assist-auto',
  'team-auto': 'baozi/team-auto',
  'trial-auto': 'baozi/trial-auto',
};
for (const [id, expected] of Object.entries(aliases)) {
  const profile = config.virtualModelProfiles.find((item) => item.id === id);
  if (!profile) throw new Error(`missing profile ${id}`);
  const fixed = profile.baseModel && profile.baseModel.fixedModel;
  if (fixed !== expected) throw new Error(`${id} is ${fixed}, expected ${expected}`);
}
if (!baozi.models.includes('trial-auto')) throw new Error('baozi trial-auto model was not added');
if (config.virtualModelProfiles.find((item) => item.id === 'trial-auto').key !== 'baozi-trial-auto') {
  throw new Error('trial-auto must have its own profile key');
}
const profileKeys = config.virtualModelProfiles.map((item) => item.key);
if (new Set(profileKeys).size !== profileKeys.length) {
  throw new Error(`duplicate virtual-model profile keys: ${JSON.stringify(profileKeys)}`);
}
const coding = config.virtualModelProfiles.find((item) => item.id === 'coding-auto');
if (coding.custom !== 1) throw new Error('user-owned profile field was lost');
NODE

before="$(sha_file "${DATA_DIR}/config.sqlite")"
node "${SCRIPT_DIR}/migrate-runtime-config.js" >/dev/null
after="$(sha_file "${DATA_DIR}/config.sqlite")"
[ "${before}" = "${after}" ] || {
  echo "FAIL: second migration was not idempotent" >&2
  exit 1
}

# Regression: older installs keyed profiles by key_id, so assist-auto and
# trial-auto both used `baozi-assist-auto`. The new Model Entries page edits by
# profile key; saving one scene must never overwrite the other. The same UI bug
# could also leave two assist-auto rows and no trial-auto row.
LEGACY_DATA_DIR="${TMP_DIR}/legacy-data"
mkdir -p "${LEGACY_DATA_DIR}"
export OMR_DATA_DIR="${LEGACY_DATA_DIR}"
node - "${LEGACY_DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
db.exec('CREATE TABLE app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT)');
const config = {
  Providers: [
    { name: 'baozi', enabled: true, baseUrl: 'https://llm.ohoooho.com/v1', apiKey: 'fake_baozi_***', models: ['assist-auto', 'trial-auto'] },
    { name: 'tai', enabled: true, baseUrl: 'https://tai.example/v1', apiKey: 'fake_tai_***', models: ['glm-5.3-flash', 'qwen3.8-max'] },
  ],
  preferredProvider: 'tai',
  virtualModelProfiles: [
    { id: 'coding-auto', key: 'baozi-coding-auto', displayName: 'Coding', enabled: true, baseModel: { mode: 'fixed', fixedModel: 'tai/glm-5.3-flash' }, match: { exactAliases: ['coding-auto'] }, execution: {}, tools: [], materialization: {} },
    { id: 'assist-auto', key: 'baozi-assist-auto', displayName: 'Assist', enabled: true, baseModel: { mode: 'fixed', fixedModel: 'tai/glm-5.3-flash' }, match: { exactAliases: ['assist-auto'] }, execution: {}, tools: [], materialization: {} },
    { id: 'assist-auto', key: 'baozi-assist-auto', displayName: 'Assist duplicate', enabled: true, baseModel: { mode: 'fixed', fixedModel: 'tai/glm-5.3-flash' }, match: { exactAliases: ['assist-auto'] }, execution: {}, tools: [], materialization: {} },
    { id: 'trial-auto', key: 'baozi-assist-auto', displayName: 'Trial', enabled: true, baseModel: { mode: 'fixed', fixedModel: 'tai/qwen3.8-max' }, match: { exactAliases: ['trial-auto'] }, execution: {}, tools: [], materialization: {} },
  ],
};
db.prepare("INSERT INTO app_config (key, value_json, updated_at) VALUES ('default', ?, datetime('now'))")
  .run(JSON.stringify(config));
db.close();
NODE
node "${SCRIPT_DIR}/migrate-runtime-config.js" >/dev/null
node - "${LEGACY_DATA_DIR}/config.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const config = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='default'").get().value_json);
db.close();
const profiles = config.virtualModelProfiles;
const ids = profiles.map((item) => item.id);
if (ids.filter((id) => id === 'assist-auto').length !== 1) {
  throw new Error(`expected one assist-auto profile, got ${JSON.stringify(ids)}`);
}
const assist = profiles.find((item) => item.id === 'assist-auto');
const trial = profiles.find((item) => item.id === 'trial-auto');
if (!trial) throw new Error('trial-auto profile was lost');
if (assist.key !== 'baozi-assist-auto') throw new Error(`assist-auto key is ${assist.key}`);
if (trial.key !== 'baozi-trial-auto') throw new Error(`trial-auto key is ${trial.key}`);
if (assist.baseModel.fixedModel !== 'tai/glm-5.3-flash') throw new Error('assist-auto model was overwritten');
if (trial.baseModel.fixedModel !== 'tai/qwen3.8-max') throw new Error('trial-auto model was overwritten');
const keys = profiles.map((item) => item.key);
if (new Set(keys).size !== keys.length) throw new Error(`duplicate profile keys: ${JSON.stringify(keys)}`);
NODE
legacy_before="$(sha_file "${LEGACY_DATA_DIR}/config.sqlite")"
node "${SCRIPT_DIR}/migrate-runtime-config.js" >/dev/null
legacy_after="$(sha_file "${LEGACY_DATA_DIR}/config.sqlite")"
[ "${legacy_before}" = "${legacy_after}" ] || {
  echo "FAIL: legacy duplicate-key repair was not idempotent" >&2
  exit 1
}

echo "PASS: user-selected alias models, user-added tai, user routes, and legacy duplicate profile keys are preserved or repaired"
