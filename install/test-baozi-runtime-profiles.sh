#!/usr/bin/env bash
# Regression: existing OMR configs must move the four public aliases to Baozi
# and enable Baozi, while preserving user-added providers (including tai) and
# user-selected preferred/fallback routes. Migration must stay idempotent even
# when Baozi has no real key.
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
      models: ['MiniMax-M3', 'claude-sonnet-4-5', 'kimi-k2.6', 'kimi-k2.7-code', 'deepseek-v3', 'qwen3-max', 'glm-4.6'],
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
const aliases = ['coding-auto', 'chat-auto', 'assist-auto', 'team-auto'];
for (const id of aliases) {
  const profile = config.virtualModelProfiles.find((item) => item.id === id);
  if (!profile) throw new Error(`missing profile ${id}`);
  const fixed = profile.baseModel && profile.baseModel.fixedModel;
  if (!fixed || !fixed.startsWith('baozi/')) throw new Error(`${id} is ${fixed}`);
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

echo "PASS: aliases use Baozi; user-added tai and user routes are preserved"
