#!/usr/bin/env node
// Idempotently materialize Taoxian's runtime virtual-model profiles in an
// existing OMR database. This intentionally touches only `app_config.default`:
// provider visibility (Baozi on, tai hidden), the four alias profiles, and the
// Baozi preferred/fallback route are updated; API keys and user-owned profile
// fields stay untouched.

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  TAOXIAN_VIRTUAL_MODELS,
  applyManagedProviderVisibility,
  mergeVirtualModelProfiles,
} = require('./runtime-profiles');

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

  const managedProviders = Array.isArray(config.Providers)
    ? applyManagedProviderVisibility(config.Providers)
    : config.Providers;
  const providersChanged = Array.isArray(config.Providers)
    && JSON.stringify(managedProviders) !== JSON.stringify(config.Providers);
  const hasBaozi = Array.isArray(managedProviders)
    && managedProviders.some((provider) => provider && provider.name === 'baozi');

  const { profiles, changed } = mergeVirtualModelProfiles({
    ...config,
    Providers: managedProviders,
  }, TAOXIAN_VIRTUAL_MODELS);

  const router = config.Router && typeof config.Router === 'object' ? config.Router : {};
  const fallback = router.fallback && typeof router.fallback === 'object' ? router.fallback : {};
  const fallbackModels = Array.isArray(fallback.models)
    ? fallback.models.filter((model) => typeof model === 'string' && model.trim())
    : [];
  const nextFallbackModels = hasBaozi && fallbackModels.length === 0
    ? ['baozi/MiniMax-M3']
    : fallbackModels;
  const routerChanged = JSON.stringify(nextFallbackModels) !== JSON.stringify(fallback.models ?? []);
  // Preserve a user-selected preferred provider; only seed Baozi when the
  // default is unset.
  const preferredProvider = config.preferredProvider || (hasBaozi ? 'baozi' : config.preferredProvider);
  const preferredChanged = preferredProvider !== config.preferredProvider;

  if (!changed && !providersChanged && !routerChanged && !preferredChanged) {
    console.log('omr migrate: runtime virtual-model profiles already current');
    process.exit(0);
  }

  const backup = backupDatabase();
  db.prepare("UPDATE app_config SET value_json=?, updated_at=datetime('now') WHERE key='default'")
    .run(JSON.stringify({
      ...config,
      Providers: managedProviders,
      virtualModelProfiles: profiles,
      preferredProvider,
      Router: {
        ...router,
        fallback: {
          ...fallback,
          models: nextFallbackModels,
        },
      },
    }));
  console.log(`omr migrate: updated Baozi-backed virtual-model profiles and provider visibility (backup: ${backup})`);
} finally {
  db.close();
}
