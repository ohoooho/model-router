// Shared runtime virtual-model materialization for OMR install/migration.
//
// `app_config.virtual_models` is legacy metadata. The gateway reads
// `default.virtualModelProfiles`, so every install (fresh or existing) needs
// concrete profiles with a fixed base model.
//
// Taoxian seeds the five public aliases with Baozi defaults. The upstream
// provider name must not be added by the default installer, and the aliases
// stay configured even when Baozi has no usable key yet. User-added providers
// (including tai) and user-selected alias models are preserved: this file only
// fills missing Baozi scene profiles and missing base models.

const MANAGED_PROVIDER = 'baozi';

const TAOXIAN_VIRTUAL_MODELS = {
  'coding-auto': {
    display_name: 'Coding Auto (编程通用)',
    strategy: 'manual',
    defaultBaseModel: 'baozi/coding-auto',
    match: { exactAliases: ['coding-auto'] },
    key_id: 'baozi-coding-auto',
    profileKey: 'baozi-coding-auto',
  },
  'assist-auto': {
    display_name: 'Assist Auto (通用助手)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/assist-auto',
    match: { exactAliases: ['assist-auto'] },
    key_id: 'baozi-assist-auto',
    profileKey: 'baozi-assist-auto',
  },
  'chat-auto': {
    display_name: 'Chat Auto (日常聊天)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/chat-auto',
    match: { exactAliases: ['chat-auto'] },
    key_id: 'baozi-chat-auto',
    profileKey: 'baozi-chat-auto',
  },
  'team-auto': {
    display_name: 'Team Auto (团队协作)',
    strategy: 'priority',
    defaultBaseModel: 'baozi/team-auto',
    match: { exactAliases: ['team-auto'] },
    key_id: 'baozi-team-auto',
    profileKey: 'baozi-team-auto',
  },
  'trial-auto': {
    display_name: 'Trial Auto (体验配额)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/trial-auto',
    match: { exactAliases: ['trial-auto'] },
    // trial-auto intentionally shares assist's upstream API key. The profile
    // key is the UI/runtime identity and must not be shared: editing one
    // scene by key would otherwise overwrite the other.
    key_id: 'baozi-assist-auto',
    profileKey: 'baozi-trial-auto',
  },
};

const TAOXIAN_MANAGED_MODELS = Object.keys(TAOXIAN_VIRTUAL_MODELS);

// REMOVAL BLACKLIST — these names are never added to a provider. The
// pre-0.2.0 installer and OMR's built-in default config seeded them; they are
// stale now that Baozi exposes the five `*-auto` aliases. `normalizeBaoziModels`
// filters them out while preserving user-added models.
const LEGACY_BAOZI_MODELS_TO_REMOVE = [
  'MiniMax-M3',
  'claude-sonnet-4-5',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'deepseek-v3',
  'qwen3-max',
  'glm-4.6',
];

// One concrete upstream model is useful in the UI as a non-auto example.
// `minimax-m3` is present in the current Baozi catalog. Operators can override
// it with BAOZI_EXAMPLE_MODEL (set to `none` to omit the example).
const DEFAULT_BAOZI_EXAMPLE_MODEL = 'minimax-m3';

function uniqueModelNames(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim()),
  ));
}

function normalizeBaoziModels(existingModels, options = {}) {
  const requestedExample = String(
    options.exampleModel ?? process.env.BAOZI_EXAMPLE_MODEL ?? DEFAULT_BAOZI_EXAMPLE_MODEL,
  ).trim();
  const exampleModels = requestedExample && requestedExample.toLowerCase() !== 'none'
    ? [requestedExample]
    : [];
  const legacy = new Set(LEGACY_BAOZI_MODELS_TO_REMOVE);
  const preserved = uniqueModelNames(existingModels).filter((model) => !legacy.has(model));
  return uniqueModelNames([...preserved, ...TAOXIAN_MANAGED_MODELS, ...exampleModels]);
}

function isLegacyBaoziModelRef(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return LEGACY_BAOZI_MODELS_TO_REMOVE.some((model) =>
    text === model || text === `baozi/${model}` || text === `baozi,${model}`,
  );
}

function normalizeFallbackModels(models) {
  const next = uniqueModelNames(models).map((model) =>
    isLegacyBaoziModelRef(model) ? 'baozi/chat-auto' : model,
  );
  return next.length > 0 ? next : ['baozi/chat-auto'];
}

/**
 * Enable Taoxian's managed Baozi provider when it exists. User-owned providers
 * are left exactly as the user configured them.
 */
function applyManagedProviderVisibility(providers) {
  return (Array.isArray(providers) ? providers : []).map((provider) => {
    if (!provider || typeof provider !== 'object') return provider;
    if (provider.name === MANAGED_PROVIDER && provider.enabled === false) {
      return { ...provider, enabled: true };
    }
    return provider;
  });
}

function profileKeyForScene(scene, id) {
  return String(scene.profileKey || scene.key_id || `baozi-${id}`).trim();
}

function uniqueProfileKey(base, usedKeys) {
  const normalized = String(base || 'profile').trim() || 'profile';
  if (!usedKeys.has(normalized)) {
    return normalized;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${normalized}-${index}`;
    if (!usedKeys.has(candidate)) {
      return candidate;
    }
  }
  return `${normalized}-${Date.now()}`;
}

/**
 * Merge the five Taoxian scene profiles into `defaultConfig` without touching
 * user-owned fields. Existing profiles win, including a user-selected fixed
 * base model; only missing profiles and missing base models are filled with
 * the Baozi scene defaults. Returns a new profiles array and whether anything
 * changed.
 *
 * `key` is the profile identity used by the UI and runtime; it must be unique.
 * `key_id` only selects the upstream API key and may be shared (trial-auto
 * intentionally reuses assist-auto's key).
 */
function mergeVirtualModelProfiles(defaultConfig, virtualModels = TAOXIAN_VIRTUAL_MODELS) {
  const sourceProfiles = Array.isArray(defaultConfig?.virtualModelProfiles)
    ? [...defaultConfig.virtualModelProfiles]
    : [];
  const existingProfiles = [];
  const profileById = new Map();
  let changed = false;

  // Repair configs written by older installers that keyed profiles by
  // `key_id`, which created duplicate keys for assist-auto and trial-auto.
  // Keep the first profile for a duplicated id and drop later copies so
  // editing one entry can never overwrite another.
  for (const profile of sourceProfiles) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      existingProfiles.push(profile);
      continue;
    }
    const id = typeof profile.id === 'string' ? profile.id.trim() : '';
    if (id) {
      if (profileById.has(id)) {
        changed = true;
        continue;
      }
      profileById.set(id, profile);
    }
    existingProfiles.push(profile);
  }

  for (const [id, scene] of Object.entries(virtualModels)) {
    const desiredKey = profileKeyForScene(scene, id);
    const generated = {
      id,
      name: scene.display_name,
      displayName: scene.display_name,
      enabled: true,
      baseModel: { mode: 'fixed', fixedModel: scene.defaultBaseModel },
      strategy: scene.strategy,
      key: desiredKey,
      match: scene.match,
      tools: [],
      execution: { mode: 'tool_loop', clientToolsPolicy: 'allow', streamMode: 'optimistic' },
      materialization: { enabled: true, includeInGatewayModels: true },
    };
    const existing = profileById.get(id);
    if (!existing) {
      existingProfiles.push(generated);
      profileById.set(id, generated);
      changed = true;
    } else {
      const currentModel = existing.baseModel?.mode === 'fixed'
        ? String(existing.baseModel.fixedModel || '').trim()
        : '';
      if (!currentModel) {
        // The user may have changed this alias to any provider/model through
        // the Model Entries page. Preserve that choice; only seed the Baozi
        // default when the profile has no fixed base model yet.
        existing.baseModel = { ...existing.baseModel, mode: 'fixed', fixedModel: scene.defaultBaseModel };
        changed = true;
      }
      if (existing.key !== desiredKey) {
        existing.key = desiredKey;
        changed = true;
      }
    }
  }

  // Reserve managed scene keys first, then repair any other duplicate keys.
  // This keeps assist-auto and trial-auto distinct even on an old config.
  const managedIds = new Set(Object.keys(virtualModels));
  const usedKeys = new Set();
  const normalizeKey = (profile, index) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return;
    }
    const currentKey = typeof profile.key === 'string' ? profile.key.trim() : '';
    const base = currentKey
      || (typeof profile.id === 'string' && profile.id.trim())
      || `profile-${index + 1}`;
    const nextKey = uniqueProfileKey(base, usedKeys);
    if (nextKey !== profile.key) {
      profile.key = nextKey;
      changed = true;
    }
    usedKeys.add(nextKey);
  };
  for (const id of managedIds) {
    const profile = profileById.get(id);
    if (profile) {
      normalizeKey(profile, existingProfiles.indexOf(profile));
    }
  }
  for (let index = 0; index < existingProfiles.length; index += 1) {
    const profile = existingProfiles[index];
    if (profile && typeof profile === 'object' && !Array.isArray(profile) && managedIds.has(profile.id)) {
      continue;
    }
    normalizeKey(profile, index);
  }

  return { profiles: existingProfiles, changed };
}

module.exports = {
  MANAGED_PROVIDER,
  TAOXIAN_VIRTUAL_MODELS,
  TAOXIAN_MANAGED_MODELS,
  LEGACY_BAOZI_MODELS_TO_REMOVE,
  DEFAULT_BAOZI_EXAMPLE_MODEL,
  applyManagedProviderVisibility,
  mergeVirtualModelProfiles,
  normalizeBaoziModels,
  normalizeFallbackModels,
};
