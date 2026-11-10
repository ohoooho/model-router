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
  applyManagedProviderVisibility,
  mergeVirtualModelProfiles,
};
