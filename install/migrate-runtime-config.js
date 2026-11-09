#!/usr/bin/env node
// Idempotently add missing runtime virtual-model profiles to an existing OMR
// database. This intentionally touches only `app_config.default`; providers,
// API keys, router settings and user-owned profile fields stay untouched.

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TAOXIAN_VIRTUAL_MODELS, mergeVirtualModelProfiles } = require('./runtime-profiles');

const OMR_DATA_DIR = (process.env.OMR_DATA_DIR && process.env.OMR_DATA_DIR.trim())
  ? process.env.OMR_DATA_DIR.trim().replace(/\/$/, '')
  : path.join(os.homedir(), '.omr');
const CONFIG_DB = path.join(OMR_DATA_DIR, 'config.sqlite');

if (!fs.existsSync(CONFIG_DB)) {
  console.log(`omr migrate: no config database at ${CONFIG_DB}; skip`);
  process.exit(0);
}

function backupDatabase() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const backup = `${CONFIG_DB}.bak-${stamp}`;
  fs.copyFileSync(CONFIG_DB, backup);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${CONFIG_DB}${suffix}`;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${backup}${suffix}`);
  }
  try { fs.chmodSync(backup, 0o600); } catch {}
  return backup;
}

const db = new DatabaseSync(CONFIG_DB);
try {
  db.exec('PRAGMA busy_timeout = 5000');
  const row = db.prepare("SELECT value_json FROM app_config WHERE key='default'").get();
  if (!row?.value_json) {
    console.log('omr migrate: no default config row; fresh install will create profiles');
    process.exit(0);
  }

  let config;
  try {
    config = JSON.parse(row.value_json);
  } catch {
    console.error('omr migrate: app_config.default is not valid JSON; left unchanged');
    process.exit(1);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    console.error('omr migrate: app_config.default is not an object; left unchanged');
    process.exit(1);
  }

  const { profiles, changed } = mergeVirtualModelProfiles(config, TAOXIAN_VIRTUAL_MODELS);
  if (!changed) {
    console.log('omr migrate: runtime virtual-model profiles already current');
    process.exit(0);
  }

  const backup = backupDatabase();
  db.prepare("UPDATE app_config SET value_json=?, updated_at=datetime('now') WHERE key='default'")
    .run(JSON.stringify({ ...config, virtualModelProfiles: profiles }));
  console.log(`omr migrate: added missing virtual-model profiles (backup: ${backup})`);
} finally {
  db.close();
}
