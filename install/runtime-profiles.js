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
    match: { exactAliases: ['coding-auto'] },
    key_id: 'baozi-coding-auto',
  },
  'assist-auto': {
    display_name: 'Assist Auto (通用助手)',
    strategy: 'auto-balance',
    match: { exactAliases: ['assist-auto'] },
    key_id: 'baozi-assist-auto',
  },
  'chat-auto': {
    display_name: 'Chat Auto (日常聊天)',
    strategy: 'auto-balance',
    match: { exactAliases: ['chat-auto'] },
    key_id: 'baozi-chat-auto',
  },
  'team-auto': {
    display_name: 'Team Auto (团队协作)',
    strategy: 'priority',
    match: { exactAliases: ['team-auto'] },
    key_id: 'baozi-team-auto',
  },
};

function providerModelName(model) {
  if (typeof model === 'string') return model.trim();
  if (model && typeof model === 'object') return String(model.id || model.name || '').trim();
  return '';
}

function providerIsTextModel(model) {
  return model && !/image|video|seedance|seedream|wan|vision|embed|rerank/i.test(model);
}

function providerModelSelectors(provider) {
  return (Array.isArray(provider?.models) ? provider.models : [])
    .map(providerModelName)
    .filter(providerIsTextModel)
    .map((model) => `${provider.name}/${model}`);
}

function buildBaseModelSelectors(providers) {
  const list = Array.isArray(providers) ? providers : [];
  const baozi = list.filter((provider) => provider && provider.name === MANAGED_PROVIDER);
  // Baozi wins even when the user disabled it or its key is a placeholder.
  // Only fall back to enabled providers when no Baozi provider exists at all.
  const source = baozi.length > 0
    ? baozi
    : list.filter((provider) => provider && provider.enabled !== false && provider.name);
  return source.flatMap(providerModelSelectors);
}

function pickBaseModel(selectors, patterns) {
  return selectors.find((selector) => patterns.some((pattern) => pattern.test(selector)))
    || selectors[0]
    || 'baozi/MiniMax-M3';
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
 * user-owned fields. Existing profiles win, except that their fixed base model
 * is forced back to Baozi so the Taoxian aliases keep the default route.
 * Returns a new profiles array and whether anything changed.
 */
function mergeVirtualModelProfiles(defaultConfig, virtualModels = TAOXIAN_VIRTUAL_MODELS) {
  const providers = applyManagedProviderVisibility(defaultConfig?.Providers);
  const selectors = buildBaseModelSelectors(providers);
  const sceneBaseModels = {
    'coding-auto': pickBaseModel(selectors, [/deepseek/i, /kimi/i, /claude/i, /code/i]),
    'chat-auto': pickBaseModel(selectors, [/doubao/i, /qwen/i, /glm/i, /minimax/i]),
    'assist-auto': pickBaseModel(selectors, [/qwen/i, /glm/i, /doubao/i, /minimax/i]),
    'team-auto': pickBaseModel(selectors, [/claude/i, /gpt/i, /qwen/i, /doubao/i]),
  };

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
      baseModel: { mode: 'fixed', fixedModel: sceneBaseModels[id] },
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
    } else if (!existing.baseModel) {
      existing.baseModel = generated.baseModel;
      changed = true;
    } else if (
      existing.baseModel.mode === 'fixed'
      && !String(existing.baseModel.fixedModel || '').startsWith(`${MANAGED_PROVIDER}/`)
    ) {
      // Repair tai/* and other fixed routes. The alias table is Taoxian-owned;
      // user-owned fields on the profile are preserved.
      existing.baseModel = { ...existing.baseModel, fixedModel: generated.baseModel.fixedModel };
      changed = true;
    }
  }

  return { profiles: existingProfiles, changed };
}

module.exports = {
  MANAGED_PROVIDER,
  TAOXIAN_VIRTUAL_MODELS,
  applyManagedProviderVisibility,
  mergeVirtualModelProfiles,
};
