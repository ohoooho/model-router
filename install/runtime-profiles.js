// Shared runtime virtual-model materialization for OMR install/migration.
//
// `app_config.virtual_models` is legacy metadata. The gateway reads
// `default.virtualModelProfiles`, so every install (fresh or existing) needs
// concrete profiles with a fixed base model.

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

function buildBaseModelSelectors(providers) {
  return (Array.isArray(providers) ? providers : [])
    .filter((provider) => provider && provider.enabled !== false && provider.name)
    .flatMap((provider) => (Array.isArray(provider.models) ? provider.models : [])
      .map(providerModelName)
      .filter(providerIsTextModel)
      .map((model) => `${provider.name}/${model}`));
}

function pickBaseModel(selectors, patterns) {
  return selectors.find((selector) => patterns.some((pattern) => pattern.test(selector)))
    || selectors[0]
    || 'baozi/MiniMax-M3';
}

/**
 * Merge the four Taoxian scene profiles into `defaultConfig` without touching
 * user-owned fields. Existing profiles win; only a missing fixed base model is
 * repaired. Returns a new profiles array and whether anything changed.
 */
function mergeVirtualModelProfiles(defaultConfig, virtualModels = TAOXIAN_VIRTUAL_MODELS) {
  const providers = Array.isArray(defaultConfig?.Providers) ? defaultConfig.Providers : [];
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
    } else if (!existing.baseModel || (existing.baseModel.mode === 'fixed' && !existing.baseModel.fixedModel)) {
      // Old installs may have a profile without a fixed base model. Repair only
      // the missing field; keep every user-owned setting intact.
      existing.baseModel = generated.baseModel;
      changed = true;
    }
  }

  return { profiles: existingProfiles, changed };
}

module.exports = {
  TAOXIAN_VIRTUAL_MODELS,
  mergeVirtualModelProfiles,
};
