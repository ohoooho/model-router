import type {
  AppConfig,
  GatewayProviderConfig,
  ProfileClientKind,
  ProfileApplyResult,
  VirtualModelProfileConfig
} from "@ccr/core/contracts/app";
import {
  Boxes,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Check,
  Checkbox,
  Copy,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  LoaderCircle,
  Pencil,
  Plus,
  SelectControl,
  Trash2,
  X,
  cn,
  isGatewayProviderEnabled,
  motion,
  providerModelDisplayName,
  useAppErrorText,
  useResolvedAppLanguage,
  useEffect,
  uniqueVirtualModelId,
  useMemo,
  useState
} from "../shared/index";

type ModelEntryRole = string;
type ModelEntryMetadata = {
  providerId?: string;
  providerName?: string;
  role?: ModelEntryRole;
  source?: string;
};

const modelEntrySource = "model-entry";
const builtinSceneAliases = ["coding-auto", "assist-auto", "chat-auto", "team-auto", "trial-auto"];
const globalAliases = builtinSceneAliases;
const roleSuggestions = ["code", "chat", "office"];

const roleLabels: Record<string, { en: string; zh: string }> = {
  code: { en: "Code", zh: "编程" },
  chat: { en: "Chat", zh: "对话" },
  office: { en: "Office", zh: "办公" }
};

function roleDisplayName(role: string, zh: boolean): string {
  const normalized = role.trim();
  if (!normalized) {
    return zh ? "自定义" : "Custom";
  }
  return roleLabels[normalized.toLowerCase()]?.[zh ? "zh" : "en"] ?? normalized;
}

const clientLabels: Record<ProfileClientKind, string> = {
  "claude-code": "Claude Code",
  "claude-design": "Claude Design",
  codex: "Codex",
  grok: "Grok",
  kilo: "Kilo",
  kimi: "Kimi",
  opencode: "OpenCode",
  pi: "Pi",
  workbuddy: "WorkBuddy",
  zcode: "ZCode"
};

const clientRestartHints: Partial<Record<ProfileClientKind, { en: string; zh: string }>> = {
  "claude-code": { en: "Reopen Claude Code", zh: "重新打开 Claude Code" },
  "claude-design": { en: "Open through OMR Desktop", zh: "通过 OMR Desktop 打开" },
  codex: { en: "Reopen Codex", zh: "重新打开 Codex" },
  grok: { en: "Refresh the Grok model list", zh: "刷新 Grok 模型列表" },
  kilo: { en: "Reopen Kilo", zh: "重新打开 Kilo" },
  kimi: { en: "Reopen Kimi", zh: "重新打开 Kimi" },
  opencode: { en: "Exit all OpenCode TUIs and reopen", zh: "退出所有 OpenCode TUI 后重开" },
  pi: { en: "Reopen Pi", zh: "重新打开 Pi" },
  workbuddy: { en: "Reopen WorkBuddy", zh: "重新打开 WorkBuddy" },
  zcode: { en: "Reopen ZCode", zh: "重新打开 ZCode" }
};

function modelEntryMetadata(profile: VirtualModelProfileConfig): ModelEntryMetadata {
  const metadata = profile.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as ModelEntryMetadata;
}

export function isBuiltinSceneProfile(profile: VirtualModelProfileConfig): boolean {
  return builtinSceneAliases.includes(entryAlias(profile).toLowerCase());
}

export function isModelEntry(profile: VirtualModelProfileConfig): boolean {
  return modelEntryMetadata(profile).source === modelEntrySource || isBuiltinSceneProfile(profile);
}

function entryAlias(profile: VirtualModelProfileConfig): string {
  return profile.match?.exactAliases?.[0]?.trim() || profile.key;
}

function entryRole(profile: VirtualModelProfileConfig): ModelEntryRole | undefined {
  const role = modelEntryMetadata(profile).role;
  if (typeof role === "string" && role.trim()) {
    return role.trim();
  }
  const alias = entryAlias(profile).toLowerCase();
  if (alias.includes("coding") || alias.includes("code")) {
    return "code";
  }
  if (alias.includes("assist") || alias.includes("office")) {
    return "office";
  }
  if (alias.includes("chat")) {
    return "chat";
  }
  return undefined;
}

function entryProviderName(profile: VirtualModelProfileConfig): string {
  const metadata = modelEntryMetadata(profile);
  const provider = metadata.providerName?.trim() || metadata.providerId?.trim();
  if (provider) {
    return provider;
  }
  const fixedModel = profile.baseModel?.fixedModel ?? "";
  const slash = fixedModel.indexOf("/");
  return slash > 0 ? fixedModel.slice(0, slash) : "";
}

function slugify(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function providerSlug(provider: GatewayProviderConfig, index: number): string {
  return slugify(provider.name) || slugify(provider.id) || `provider-${index + 1}`;
}

function uniqueAlias(base: string, reserved: Set<string>): string {
  if (!reserved.has(base)) {
    return base;
  }
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

function validateAlias(value: string, zh: boolean): string {
  const alias = value.trim();
  if (!alias) {
    return zh ? "请输入模型 ID。" : "Enter a model ID.";
  }
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(alias)) {
    return zh
      ? "模型 ID 只能使用小写字母、数字和连字符，且必须以字母或数字开头，最多 48 个字符。"
      : "Model IDs use lowercase letters, numbers, and hyphens only, start with a letter or number, and are at most 48 characters.";
  }
  if (alias.includes("--")) {
    return zh ? "模型 ID 不能包含连续的连字符。" : "Model IDs cannot contain consecutive hyphens.";
  }
  return "";
}

function buildModelEntryProfile(
  provider: GatewayProviderConfig,
  role: ModelEntryRole,
  model: string,
  alias: string,
  existingKey: string | undefined,
  zh: boolean
): VirtualModelProfileConfig {
  const fixedModel = `${provider.name}/${model}`;
  const normalizedRole = role.trim();
  const metadata: ModelEntryMetadata = {
    providerId: provider.name,
    providerName: provider.name,
    role: normalizedRole || undefined,
    source: modelEntrySource
  };
  return {
    baseModel: {
      fixedModel,
      mode: "fixed"
    },
    description: zh ? "由模型入口创建" : "Created from Model Entries",
    displayName: `${provider.name} · ${roleDisplayName(normalizedRole, zh)}`,
    enabled: true,
    execution: {
      clientToolsPolicy: "allow",
      mode: "decorate_only",
      streamMode: "optimistic"
    },
    id: alias,
    key: existingKey || `model-entry:${alias}`,
    match: {
      exactAliases: [alias],
      prefixes: [],
      suffixes: []
    },
    materialization: {
      displayNameTemplate: "{profileDisplayName}",
      enabled: true,
      includeInGatewayModels: true
    },
    metadata,
    tools: []
  };
}

export function ModelEntriesView({ onOpenProviders }: { onOpenProviders: () => void }) {
  const language = useResolvedAppLanguage();
  const zh = language === "zh";
  const formatError = useAppErrorText();
  const [config, setConfig] = useState<AppConfig>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"create" | "edit" | undefined>();
  const [editingKey, setEditingKey] = useState<string>();
  const [providerName, setProviderName] = useState("");
  const [role, setRole] = useState<ModelEntryRole>("code");
  const [model, setModel] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasTouched, setAliasTouched] = useState(false);
  const [bindProvider, setBindProvider] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<VirtualModelProfileConfig>();
  const [savedAlias, setSavedAlias] = useState("");
  const [copiedAlias, setCopiedAlias] = useState("");
  const [syncResult, setSyncResult] = useState<ProfileApplyResult>();

  const providers = useMemo(
    () => (config?.Providers ?? []).filter((provider) => isGatewayProviderEnabled(provider) && provider.models.length > 0),
    [config?.Providers]
  );
  const entries = useMemo(
    () => (config?.virtualModelProfiles ?? [])
      .map((profile, index) => ({ index, profile }))
      .filter(({ profile }) => isModelEntry(profile)),
    [config?.virtualModelProfiles]
  );
  const editingProfile = editingKey
    ? (config?.virtualModelProfiles ?? []).find((profile) => profile.key === editingKey)
    : undefined;
  const editingBuiltin = Boolean(editingProfile && isBuiltinSceneProfile(editingProfile));
  const selectedProvider = providers.find((provider) => provider.name === providerName);
  const providerIndex = providers.findIndex((provider) => provider.name === providerName);

  const reservedAliases = useMemo(() => {
    const reserved = new Set(globalAliases);
    for (const profile of config?.virtualModelProfiles ?? []) {
      if (editingKey && profile.key === editingKey) {
        continue;
      }
      for (const aliasValue of profile.match?.exactAliases ?? []) {
        if (aliasValue.trim()) {
          reserved.add(aliasValue.trim().toLowerCase());
        }
      }
    }
    for (const provider of providers) {
      for (const modelName of provider.models) {
        if (modelName.trim()) {
          reserved.add(modelName.trim().toLowerCase());
        }
      }
    }
    return reserved;
  }, [config?.virtualModelProfiles, editingKey, providers]);

  const recommendedAlias = useMemo(() => {
    const rolePart = slugify(role) || "custom";
    const base = bindProvider && selectedProvider
      ? `${providerSlug(selectedProvider, providerIndex)}-${rolePart}`
      : rolePart;
    return uniqueAlias(base, reservedAliases);
  }, [bindProvider, providerIndex, reservedAliases, role, selectedProvider]);

  useEffect(() => {
    if (dialog && dialog === "create" && !aliasTouched) {
      setAlias(recommendedAlias);
    }
  }, [aliasTouched, dialog, recommendedAlias]);

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig(): Promise<void> {
    if (!window.ccr) {
      setError(zh ? "当前环境不支持 OMR Web API。" : "The OMR web API is unavailable.");
      setLoading(false);
      return;
    }
    try {
      const next = await window.ccr.getConfig();
      setConfig(next);
      setError("");
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }

  function openCreate(): void {
    const provider = providers[0];
    setDialog("create");
    setEditingKey(undefined);
    setProviderName(provider?.name ?? "");
    setRole("code");
    setModel(provider?.models[0] ?? "");
    setAliasTouched(false);
    setBindProvider(true);
    setAlias(provider ? uniqueAlias(`${providerSlug(provider, 0)}-code`, reservedAliases) : "code");
    setError("");
  }

  function openEdit(profile: VirtualModelProfileConfig): void {
    const metadata = modelEntryMetadata(profile);
    const provider = metadata.providerName || metadata.providerId || entryProviderName(profile);
    const fixedModel = profile.baseModel?.fixedModel ?? "";
    const slash = fixedModel.indexOf("/");
    const selectedModel = slash >= 0 ? fixedModel.slice(slash + 1) : fixedModel;
    const selectedRole = entryRole(profile) ?? "code";
    setDialog("edit");
    setEditingKey(profile.key);
    setProviderName(provider);
    setRole(selectedRole);
    setModel(selectedModel);
    setAlias(entryAlias(profile));
    setAliasTouched(true);
    setBindProvider(true);
    setError("");
  }

  function closeDialog(): void {
    if (saving) {
      return;
    }
    setDialog(undefined);
    setEditingKey(undefined);
    setError("");
  }

  function changeProvider(nextProviderName: string): void {
    const provider = providers.find((item) => item.name === nextProviderName);
    setProviderName(nextProviderName);
    setModel(provider?.models[0] ?? "");
    if (!aliasTouched) {
      setAlias("");
    }
  }

  async function persistProfiles(nextProfiles: VirtualModelProfileConfig[], nextSavedAlias?: string): Promise<boolean> {
    if (!window.ccr) {
      setError(zh ? "当前环境不支持 OMR Web API。" : "The OMR web API is unavailable.");
      return false;
    }
    setSaving(true);
    setError("");
    try {
      const current = await window.ccr.getConfig();
      await window.ccr.saveConfig({
        ...current,
        virtualModelProfiles: nextProfiles
      }, { applyProfile: false });
      const applyResult = await window.ccr.applyProfile();
      setSyncResult(applyResult);
      setSavedAlias(nextSavedAlias ?? "");
      setCopiedAlias("");
      await loadConfig();
      window.dispatchEvent(new CustomEvent("omr:config-refresh"));
      return true;
    } catch (saveError) {
      setError(formatError(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitDialog(): Promise<void> {
    if (!selectedProvider || !model) {
      setError(zh ? "请选择供应商和模型。" : "Select a provider and model.");
      return;
    }
    const validation = validateAlias(alias, zh);
    if (validation) {
      setError(validation);
      return;
    }
    const normalizedAlias = alias.trim().toLowerCase();
    if (!editingKey && reservedAliases.has(normalizedAlias)) {
      setError(zh ? `模型 ID “${normalizedAlias}” 已被占用，请换一个。` : `Model ID “${normalizedAlias}” is already in use. Choose another.`);
      return;
    }
    if (editingKey && !editingProfile) {
      setError(zh ? "这个入口已经不存在，请刷新后再试。" : "This entry no longer exists. Refresh and try again.");
      return;
    }
    const fixedModel = `${selectedProvider.name}/${model}`;
    const currentProfiles = config?.virtualModelProfiles ?? [];
    const profile = editingBuiltin && editingProfile
      ? {
          ...editingProfile,
          baseModel: {
            ...(editingProfile.baseModel ?? {}),
            fixedModel,
            mode: "fixed" as const
          }
        }
      : buildModelEntryProfile(
          selectedProvider,
          role,
          model,
          normalizedAlias,
          editingKey,
          zh
        );
    if (!editingKey) {
      profile.id = uniqueVirtualModelId(currentProfiles, profile.id);
    }
    const nextProfiles = editingKey
      ? currentProfiles.map((item) => item.key === editingKey ? profile : item)
      : [...currentProfiles, profile];
    if (await persistProfiles(nextProfiles, editingKey ? undefined : normalizedAlias)) {
      setDialog(undefined);
      setEditingKey(undefined);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    const nextProfiles = (config?.virtualModelProfiles ?? []).filter((profile) => profile.key !== deleteTarget.key);
    if (await persistProfiles(nextProfiles)) {
      setDeleteTarget(undefined);
    }
  }

  async function toggleEntry(profile: VirtualModelProfileConfig, enabled: boolean): Promise<void> {
    const nextProfiles = (config?.virtualModelProfiles ?? []).map((item) =>
      item.key === profile.key ? { ...item, enabled } : item
    );
    await persistProfiles(nextProfiles);
  }

  async function copyAlias(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedAlias(value);
      window.setTimeout(() => setCopiedAlias((current) => current === value ? "" : current), 1600);
    } catch {
      setError(zh ? "复制失败，请手动选择模型 ID。" : "Copy failed. Select the model ID manually.");
    }
  }

  const providerOptions = providers.map((provider) => ({ label: provider.name, value: provider.name }));
  const modelOptions = (selectedProvider?.models ?? []).map((modelName) => ({
    label: providerModelDisplayName(selectedProvider!, modelName),
    value: modelName
  }));
  const aliasConflict = !editingKey && Boolean(alias.trim()) && reservedAliases.has(alias.trim().toLowerCase());
  const validationError = dialog && !loading
    ? validateAlias(alias, zh) || (aliasConflict
      ? (zh ? `模型 ID “${alias.trim().toLowerCase()}” 已被占用，请换一个。` : `Model ID “${alias.trim().toLowerCase()}” is already in use. Choose another.`)
      : "")
    : "";
  const canSubmit = Boolean(selectedProvider && model && alias.trim() && !validationError && !saving);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-3"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle className="min-w-0 shrink-0 truncate">{zh ? "模型入口" : "Model Entries"}</CardTitle>
          <div className="min-w-0 flex-1" />
          <Button disabled={providers.length === 0} onClick={openCreate} type="button">
            <Plus className="h-4 w-4" />
            {zh ? "新建模型入口" : "New model entry"}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
            <div className="rounded-xl border border-border bg-muted/35 px-4 py-3">
              <div className="text-[13px] font-semibold text-foreground">
                {zh ? "模型 ID 只需要创建一次。" : "Create the model ID once."}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                {zh
                  ? "以后换供应商、换模型，只改这里的入口，Codex / OpenCode 不用再改配置。"
                  : "When you change providers or models later, update the entry here. Codex and OpenCode keep using the same model ID."}
              </div>
            </div>

            {error && !dialog ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                {zh ? "加载中…" : "Loading…"}
              </div>
            ) : providers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <div className="text-[14px] font-semibold text-foreground">
                  {zh ? "先添加一个供应商" : "Add a provider first"}
                </div>
                <div className="mx-auto mt-1 max-w-[460px] text-[12px] leading-5 text-muted-foreground">
                  {zh
                    ? "模型入口需要基于供应商的模型创建。添加完供应商后，再回来给工具创建模型 ID。"
                    : "Model entries use the models from a provider. Add a provider, then come back and create model IDs for your tools."}
                </div>
                <Button className="mt-4" onClick={onOpenProviders} type="button">
                  {zh ? "去添加供应商" : "Add a provider"}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <div className="text-[14px] font-semibold text-foreground">
                  {zh ? "还没有模型入口" : "No model entries yet"}
                </div>
                <div className="mx-auto mt-1 max-w-[460px] text-[12px] leading-5 text-muted-foreground">
                  {zh
                    ? "先创建一个 code / chat / office 入口，再把模型 ID 同步到工具。"
                    : "Create a code, chat, or office entry, then sync the model ID to your tools."}
                </div>
                <Button className="mt-4" onClick={openCreate} type="button">
                  <Plus className="h-4 w-4" />
                  {zh ? "新建模型入口" : "New model entry"}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {entries.map(({ profile }) => {
                  const entryId = entryAlias(profile);
                  const metadata = modelEntryMetadata(profile);
                  const builtin = isBuiltinSceneProfile(profile);
                  return (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm" key={profile.key}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="truncate text-[14px] font-semibold text-foreground">{profile.displayName}</div>
                            {builtin ? (
                              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                {zh ? "内置场景" : "Built-in"}
                              </span>
                            ) : null}
                            <span className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              profile.enabled === false
                                ? "border-border bg-muted text-muted-foreground"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            )}>
                              {profile.enabled === false ? (zh ? "已停用" : "Disabled") : (zh ? "已启用" : "Enabled")}
                            </span>
                          </div>
                        </div>
                        <Checkbox
                          checked={profile.enabled !== false}
                          onCheckedChange={(checked) => void toggleEntry(profile, checked)}
                        />
                      </div>
                      <div className="mt-3 rounded-lg border border-border bg-muted/35 px-3 py-2">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {zh ? "工具里选择的名字" : "Name used by tools"}
                        </div>
                        <div className="mt-1 break-all font-mono text-[13px] font-semibold text-foreground">{entryId}</div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {zh ? "当前模型" : "Current model"}: <span className="font-mono">{profile.baseModel?.fixedModel || "—"}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => void copyAlias(entryId)} size="sm" type="button" variant="outline">
                          {copiedAlias === entryId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedAlias === entryId ? (zh ? "已复制" : "Copied") : (zh ? "复制 ID" : "Copy ID")}
                        </Button>
                        <Button onClick={() => openEdit(profile)} size="sm" type="button" variant="outline">
                          <Pencil className="h-3.5 w-3.5" />
                          {zh ? "编辑" : "Edit"}
                        </Button>
                        {builtin ? null : (
                          <Button onClick={() => setDeleteTarget(profile)} size="sm" type="button" variant="ghost">
                            <Trash2 className="h-3.5 w-3.5" />
                            {zh ? "删除" : "Delete"}
                          </Button>
                        )}
                      </div>
                      {metadata.source === modelEntrySource && !metadata.providerId ? (
                        <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                          {zh ? "这个入口没有供应商元数据，可能是旧数据。" : "This entry has no provider metadata and may be legacy data."}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {savedAlias ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">
                  {zh ? `已创建 ${savedAlias}` : `Created ${savedAlias}`}
                </div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {zh
                    ? "现在去工具的模型选择器里选择这个 ID。已有 ID 换模型时不需要再改工具配置。"
                    : "Select this ID in your tool's model picker. Changing the model behind an existing ID does not require a tool config change."}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => void copyAlias(savedAlias)} size="sm" type="button" variant="outline">
                    {copiedAlias === savedAlias ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedAlias === savedAlias ? (zh ? "已复制" : "Copied") : (zh ? "复制模型 ID" : "Copy model ID")}
                  </Button>
                </div>
              </div>
            ) : null}

            {syncResult ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{zh ? "同步结果" : "Sync result"}</div>
                <div className="mt-2 space-y-1.5">
                  {syncResult.clients.length === 0 ? (
                    <div className="text-[12px] text-muted-foreground">{zh ? "没有启用的 Agent Profile。" : "No enabled agent profiles."}</div>
                  ) : null}
                  {syncResult.clients.map((client) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]" key={`${client.client}-${client.path}`}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", client.ok ? "bg-emerald-500" : "bg-destructive")} />
                      <span className="font-medium text-foreground">{clientLabels[client.client] ?? client.client}</span>
                      <span className="text-muted-foreground">{client.ok ? client.message : client.message}</span>
                      {client.ok && clientRestartHints[client.client] ? (
                        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {clientRestartHints[client.client]?.[zh ? "zh" : "en"]}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && closeDialog()}>
        {dialog ? (
          <DialogContent className="max-w-[560px]">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>
                  {editingBuiltin
                    ? (zh ? "切换内置场景模型" : "Switch built-in model")
                    : dialog === "edit"
                      ? (zh ? "编辑模型入口" : "Edit model entry")
                      : (zh ? "新建模型入口" : "New model entry")}
                </DialogTitle>
              </div>
              <Button aria-label={zh ? "关闭" : "Close"} onClick={closeDialog} size="iconSm" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <Field label={zh ? "供应商" : "Provider"} requirement="required">
                  <SelectControl onChange={changeProvider} options={providerOptions} value={providerName} />
                </Field>
                {editingBuiltin ? null : (
                  <>
                    <Field label={zh ? "用途标签（可选）" : "Usage label (optional)"}>
                      <Input
                        list="model-entry-role-suggestions"
                        onChange={(event) => setRole(event.target.value)}
                        placeholder={zh ? "code / chat / office / 自定义" : "code / chat / office / custom"}
                        value={role}
                      />
                    </Field>
                    <datalist id="model-entry-role-suggestions">
                      {roleSuggestions.map((value) => <option key={value} value={value} />)}
                    </datalist>
                    <div className="-mt-2 text-[11px] leading-4 text-muted-foreground">
                      {zh
                        ? "自由填写，不限制取值；推荐模型 ID 会根据它生成。"
                        : "Free-form; the recommended model ID uses it."}
                    </div>
                  </>
                )}
                <Field label={zh ? "模型" : "Model"} requirement="required">
                  <SelectControl onChange={setModel} options={modelOptions} value={model} />
                </Field>

                {dialog === "create" ? (
                  <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2">
                    <Checkbox checked={bindProvider} onCheckedChange={setBindProvider} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium text-foreground">
                        {zh ? "在模型 ID 中绑定供应商" : "Include the provider in the model ID"}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                        {zh
                          ? "涉及国内/海外、安全、计费或网络路径时建议绑定；只做同类模型切换时可以不绑定。"
                          : "Bind it when provider choice matters for region, security, billing, or network path. Leave it off for easy model switching."}
                      </span>
                    </span>
                  </label>
                ) : null}

                <Field
                  label={zh ? "模型 ID（工具里选择的名字）" : "Model ID (name used by tools)"}
                  requirement="required"
                >
                  <Input
                    disabled={dialog === "edit"}
                    onChange={(event) => {
                      setAlias(event.target.value.toLowerCase());
                      setAliasTouched(true);
                    }}
                    placeholder={zh ? "例如 baozi-code" : "e.g. baozi-code"}
                    value={alias}
                  />
                </Field>
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                  {editingBuiltin ? (
                    zh
                      ? "内置场景的 ID 固定；可以在上面换供应商 / 模型。安装器重配会保留你选中的模型。"
                      : "Built-in scene IDs are fixed. Pick a different provider or model above; reinstalling keeps your selected model."
                  ) : dialog === "edit" ? (
                    zh
                      ? "已创建的模型 ID 不能改名。需要新名字时请新建一个入口；已有 ID 可以换背后的模型。"
                      : "An existing model ID cannot be renamed. Create a new entry for a new name; you can change the model behind an existing ID."
                  ) : (
                    zh
                      ? `推荐：${recommendedAlias}。不要把模型版本或日期写进 ID；模型会换，ID 不要换。`
                      : `Recommended: ${recommendedAlias}. Do not put model versions or dates in the ID; models change, IDs should not.`
                  )}
                </div>
                {validationError && alias.trim() ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                    {validationError}
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                    {error}
                  </div>
                ) : null}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button disabled={saving} onClick={closeDialog} type="button" variant="outline">
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button disabled={!canSubmit || saving} onClick={() => void submitDialog()} type="button">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : dialog === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {dialog === "edit" ? (zh ? "保存并同步" : "Save and sync") : (zh ? "创建并同步" : "Create and sync")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(undefined)}>
        {deleteTarget ? (
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{zh ? "删除模型入口" : "Delete model entry"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="text-[12px] leading-5 text-muted-foreground">
                {zh
                  ? `确定删除 ${entryAlias(deleteTarget)}？使用这个 ID 的工具之后将找不到它。`
                  : `Delete ${entryAlias(deleteTarget)}? Tools using this ID will no longer find it.`}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button disabled={saving} onClick={() => setDeleteTarget(undefined)} type="button" variant="outline">
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button disabled={saving} onClick={() => void confirmDelete()} type="button" variant="destructive">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {zh ? "删除" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </motion.div>
  );
}
