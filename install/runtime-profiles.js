// Shared runtime virtual-model materialization for OMR install/migration.
//
// `app_config.virtual_models` is legacy metadata. The gateway reads
// `default.virtualModelProfiles`, so every install (fresh or existing) needs
// concrete profiles with a fixed base model.
//
// Taoxian deliberately routes the four public aliases through Baozi. The
// upstream provider name must not be added by the default installer, and the
// aliases stay configured even when Baozi has no usable key yet. User-added
// providers (including tai) are preserved: this file only manages Baozi and
// the four Taoxian aliases.

const MANAGED_PROVIDER = 'baozi';

const TAOXIAN_VIRTUAL_MODELS = {
  'coding-auto': {
    display_name: 'Coding Auto (编程通用)',
    strategy: 'manual',
    defaultBaseModel: 'baozi/coding-auto',
    match: { exactAliases: ['coding-auto'] },
    key_id: 'baozi-coding-auto',
  },
  'assist-auto': {
    display_name: 'Assist Auto (通用助手)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/assist-auto',
    allowedBaseModels: ['baozi/assist-auto', 'baozi/trial-auto'],
    match: { exactAliases: ['assist-auto'] },
    key_id: 'baozi-assist-auto',
  },
  'chat-auto': {
    display_name: 'Chat Auto (日常聊天)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/chat-auto',
    match: { exactAliases: ['chat-auto'] },
    key_id: 'baozi-chat-auto',
  },
  'team-auto': {
    display_name: 'Team Auto (团队协作)',
    strategy: 'priority',
    defaultBaseModel: 'baozi/team-auto',
    match: { exactAliases: ['team-auto'] },
    key_id: 'baozi-team-auto',
  },
  'trial-auto': {
    display_name: 'Trial Auto (体验配额)',
    strategy: 'auto-balance',
    defaultBaseModel: 'baozi/trial-auto',
    allowedBaseModels: ['baozi/trial-auto', 'baozi/assist-auto'],
    match: { exactAliases: ['trial-auto'] },
    key_id: 'baozi-assist-auto',
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

/**
 * Merge the four Taoxian scene profiles into `defaultConfig` without touching
 * user-owned fields. Existing profiles win, except that each managed alias
 * must keep its matching Baozi auto model (assist-auto may use trial-auto).
 * Returns a new profiles array and whether anything changed.
 */
function mergeVirtualModelProfiles(defaultConfig, virtualModels = TAOXIAN_VIRTUAL_MODELS) {
  const existingProfiles = Array.isArray(defaultConfig?.virtualModelProfiles)
    ? [...defaultConfig.virtualModelProfiles]
    : [];
  const profileById = new Map(
    existingProfiles
      .filter((profile) => profile && typeof profile === 'object' && profile.id)
      .map((profile) => [profile.id, profile]),
  );
  let changed = false;

  for (const [id, scene] of Object.entries(virtualModels)) {
    const generated = {
      id,
      name: scene.display_name,
      displayName: scene.display_name,
      enabled: true,
      baseModel: { mode: 'fixed', fixedModel: scene.defaultBaseModel },
      strategy: scene.strategy,
      key: scene.key_id,
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
      const allowedModels = [scene.defaultBaseModel, ...(scene.allowedBaseModels || [])];
      if (!allowedModels.includes(currentModel)) {
        // Taoxian owns the four public aliases. They must route to the matching
        // Baozi auto model; assist-auto may also use the trial-auto model.
        // User-owned providers and user-created virtual profiles are untouched.
        existing.baseModel = { ...existing.baseModel, mode: 'fixed', fixedModel: scene.defaultBaseModel };
        changed = true;
      }
    }
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
