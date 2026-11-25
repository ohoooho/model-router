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
const roleSuggestions = ["code", "chat", "office", "team", "trial"];

const roleLabels: Record<string, { en: string; zh: string }> = {
  code: { en: "Code", zh: "编程" },
  chat: { en: "Chat", zh: "对话" },
  office: { en: "Office", zh: "办公" },
  team: { en: "Team", zh: "团队" },
  trial: { en: "Trial", zh: "体验" },
  custom: { en: "Custom", zh: "自定义" }
};

function roleDisplayName(role: string, zh: boolean): string {
  const normalized = role.trim();
  if (!normalized) {
    return zh ? "自定义" : "Custom";
  }
  return roleLabels[normalized.toLowerCase()]?.[zh ? "zh" : "en"] ?? normalized;
}

type SceneKey = "code" | "chat" | "office" | "team" | "trial" | "custom";

const sceneMeta: Record<SceneKey, {
  accent: string;
  badge: string;
  descEn: string;
  descZh: string;
  dot: string;
  labelEn: string;
  labelZh: string;
  panel: string;
}> = {
  code: {
    accent: "border-l-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    descEn: "Writing code, debugging, refactoring",
    descZh: "写代码、调试、重构",
    dot: "bg-amber-500",
    labelEn: "Code",
    labelZh: "编程",
    panel: "border-amber-500/25 bg-amber-500/[0.06]"
  },
  chat: {
    accent: "border-l-sky-500",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    descEn: "Chat, Q&A, writing",
    descZh: "聊天、问答、写作",
    dot: "bg-sky-500",
    labelEn: "Chat",
    labelZh: "对话",
    panel: "border-sky-500/25 bg-sky-500/[0.06]"
  },
  office: {
    accent: "border-l-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    descEn: "Documents, spreadsheets, email",
    descZh: "文档、表格、邮件",
    dot: "bg-emerald-500",
    labelEn: "Office",
    labelZh: "办公",
    panel: "border-emerald-500/25 bg-emerald-500/[0.06]"
  },
  team: {
    accent: "border-l-violet-500",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    descEn: "Team collaboration and shared quota",
    descZh: "团队协作、共享配额",
    dot: "bg-violet-500",
    labelEn: "Team",
    labelZh: "团队",
    panel: "border-violet-500/25 bg-violet-500/[0.06]"
  },
  trial: {
    accent: "border-l-rose-500",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    descEn: "Trial quota",
    descZh: "体验额度",
    dot: "bg-rose-500",
    labelEn: "Trial",
    labelZh: "体验",
    panel: "border-rose-500/25 bg-rose-500/[0.06]"
  },
  custom: {
    accent: "border-l-primary",
    badge: "bg-primary/10 text-primary",
    descEn: "Your own use case",
    descZh: "你自己定义的用途",
    dot: "bg-primary",
    labelEn: "Custom",
    labelZh: "自定义",
    panel: "border-primary/20 bg-primary/[0.04]"
  }
};

function sceneKeyForProfile(profile: VirtualModelProfileConfig): SceneKey {
  const alias = entryAlias(profile).toLowerCase();
  if (alias.includes("trial")) return "trial";
  if (alias.includes("team")) return "team";
  if (alias.includes("coding") || alias.includes("code")) return "code";
  if (alias.includes("assist") || alias.includes("office")) return "office";
  if (alias.includes("chat")) return "chat";
  const role = (entryRole(profile) ?? "").toLowerCase();
  if (role.includes("code") || role.includes("coding")) return "code";
  if (role.includes("chat")) return "chat";
  if (role.includes("office") || role.includes("assist")) return "office";
  if (role.includes("team")) return "team";
  if (role.includes("trial")) return "trial";
  return "custom";
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

function entryDisplayName(profile: VirtualModelProfileConfig, zh: boolean): string {
  const metadata = modelEntryMetadata(profile);
  const provider = metadata.providerName?.trim() || metadata.providerId?.trim();
  if (provider && metadata.role?.trim()) {
    return `${provider} · ${roleDisplayName(metadata.role, zh)}`;
  }
  return profile.displayName;
}

function modelLabelForProfile(
  profile: VirtualModelProfileConfig,
  providers: GatewayProviderConfig[]
): string {
  const fixedModel = profile.baseModel?.fixedModel?.trim() || "";
  if (!fixedModel) {
    return "—";
  }
  const slash = fixedModel.indexOf("/");
  if (slash <= 0) {
    return fixedModel;
  }
  const providerName = fixedModel.slice(0, slash);
  const modelName = fixedModel.slice(slash + 1);
  const provider = providers.find((item) => item.name === providerName);
  const displayName = provider ? providerModelDisplayName(provider, modelName) : modelName;
  return displayName && displayName !== modelName ? `${providerName} · ${displayName}` : fixedModel;
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
    return zh ? "请输入调用 ID。" : "Enter a call ID.";
  }
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(alias)) {
    return zh
      ? "调用 ID 只能使用小写字母、数字和连字符，且必须以字母或数字开头，最多 48 个字符。"
      : "Call IDs use lowercase letters, numbers, and hyphens only, start with a letter or number, and are at most 48 characters.";
  }
  if (alias.includes("--")) {
    return zh ? "调用 ID 不能包含连续的连字符。" : "Call IDs cannot contain consecutive hyphens.";
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

function ModelEntryCard({
  copiedAlias,
  onCopy,
  onDelete,
  onEdit,
  onToggle,
  profile,
  providers,
  zh
}: {
  copiedAlias: string;
  onCopy: (value: string) => void;
  onDelete: (profile: VirtualModelProfileConfig) => void;
  onEdit: (profile: VirtualModelProfileConfig) => void;
  onToggle: (profile: VirtualModelProfileConfig, enabled: boolean) => void;
  profile: VirtualModelProfileConfig;
  providers: GatewayProviderConfig[];
  zh: boolean;
}) {
  const alias = entryAlias(profile);
  const builtin = isBuiltinSceneProfile(profile);
  const scene = sceneMeta[sceneKeyForProfile(profile)];
  const enabled = profile.enabled !== false;
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", !enabled && "opacity-60")}>
      <div className={cn("h-1 w-full", scene.dot)} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-foreground">{entryDisplayName(profile, zh)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", scene.badge)}>
                {zh ? scene.labelZh : scene.labelEn}
              </span>
              {builtin ? (
                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {zh ? "推荐场景" : "Recommended"}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {zh ? scene.descZh : scene.descEn}
            </div>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => onToggle(profile, checked)}
            />
            {enabled ? (zh ? "使用中" : "In use") : (zh ? "已停用" : "Disabled")}
          </label>
        </div>

        <div className={cn("mt-3 rounded-lg border px-3 py-2", scene.panel)}>
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {zh ? "调用 ID" : "Call ID"}
          </div>
          <div className="mt-0.5 break-all font-mono text-[13px] font-semibold text-foreground">{alias}</div>
        </div>

        <div className="mt-2 flex min-w-0 items-start justify-between gap-2 text-[11px]">
          <span className="shrink-0 text-muted-foreground">{zh ? "当前指向" : "Current model"}</span>
          <span
            className="min-w-0 break-all text-right font-mono text-muted-foreground"
            title={profile.baseModel?.fixedModel || undefined}
          >
            {modelLabelForProfile(profile, providers)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => onEdit(profile)} size="sm" type="button">
            <Pencil className="h-3.5 w-3.5" />
            {zh ? "选配模型" : "Choose model"}
          </Button>
          <Button onClick={() => onCopy(alias)} size="sm" type="button" variant="outline">
            {copiedAlias === alias ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedAlias === alias ? (zh ? "已复制" : "Copied") : (zh ? "复制调用 ID" : "Copy call ID")}
          </Button>
          {builtin ? null : (
            <Button onClick={() => onDelete(profile)} size="sm" type="button" variant="ghost">
              <Trash2 className="h-3.5 w-3.5" />
              {zh ? "移除" : "Remove"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
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
  const [editingId, setEditingId] = useState<string>();
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
  const editingProfile = editingId
    ? (config?.virtualModelProfiles ?? []).find((profile) => profile.id === editingId)
    : undefined;
  const editingBuiltin = Boolean(editingProfile && isBuiltinSceneProfile(editingProfile));
  const selectedProvider = providers.find((provider) => provider.name === providerName);
  const providerIndex = providers.findIndex((provider) => provider.name === providerName);

  const reservedAliases = useMemo(() => {
    const reserved = new Set(globalAliases);
    for (const profile of config?.virtualModelProfiles ?? []) {
      if (editingId && profile.id === editingId) {
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
  }, [config?.virtualModelProfiles, editingId, providers]);

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
    setEditingId(undefined);
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
    setEditingId(profile.id);
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
    setEditingId(undefined);
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
    if (!editingId && reservedAliases.has(normalizedAlias)) {
      setError(zh ? `调用 ID “${normalizedAlias}” 已被占用，请换一个。` : `Call ID “${normalizedAlias}” is already in use. Choose another.`);
      return;
    }
    if (editingId && !editingProfile) {
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
          editingProfile?.key,
          zh
        );
    if (!editingId) {
      profile.id = uniqueVirtualModelId(currentProfiles, profile.id);
    }
    const nextProfiles = editingId
      ? currentProfiles.map((item) => item.id === editingId ? profile : item)
      : [...currentProfiles, profile];
    if (await persistProfiles(nextProfiles, editingId ? undefined : normalizedAlias)) {
      setDialog(undefined);
      setEditingId(undefined);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    const nextProfiles = (config?.virtualModelProfiles ?? []).filter((profile) => profile.id !== deleteTarget.id);
    if (await persistProfiles(nextProfiles)) {
      setDeleteTarget(undefined);
    }
  }

  async function toggleEntry(profile: VirtualModelProfileConfig, enabled: boolean): Promise<void> {
    const nextProfiles = (config?.virtualModelProfiles ?? []).map((item) =>
      item.id === profile.id ? { ...item, enabled } : item
    );
    await persistProfiles(nextProfiles);
  }

  async function copyAlias(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedAlias(value);
      window.setTimeout(() => setCopiedAlias((current) => current === value ? "" : current), 1600);
    } catch {
      setError(zh ? "复制失败，请手动选择调用 ID。" : "Copy failed. Select the call ID manually.");
    }
  }

  const providerOptions = providers.map((provider) => ({ label: provider.name, value: provider.name }));
  const modelOptions = (selectedProvider?.models ?? []).map((modelName) => ({
    label: providerModelDisplayName(selectedProvider!, modelName),
    value: modelName
  }));
  const aliasConflict = !editingId && Boolean(alias.trim()) && reservedAliases.has(alias.trim().toLowerCase());
  const validationError = dialog && !loading
    ? validateAlias(alias, zh) || (aliasConflict
      ? (zh ? `调用 ID “${alias.trim().toLowerCase()}” 已被占用，请换一个。` : `Call ID “${alias.trim().toLowerCase()}” is already in use. Choose another.`)
      : "")
    : "";
  const canSubmit = Boolean(selectedProvider && model && alias.trim() && !validationError && !saving);
  const builtinEntries = entries.filter(({ profile }) => isBuiltinSceneProfile(profile));
  const customEntries = entries.filter(({ profile }) => !isBuiltinSceneProfile(profile));

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-3"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="min-w-0">
            <CardTitle className="min-w-0 truncate">{zh ? "工具模型选配" : "Tool Model Setup"}</CardTitle>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {zh
                ? "给 Codex / OpenCode / Claude Code 选模型，调用 ID 不变。"
                : "Choose models for Codex, OpenCode, and Claude Code without changing call IDs."}
            </div>
          </div>
          <div className="min-w-0 flex-1" />
          <Button disabled={providers.length === 0} onClick={openCreate} type="button">
            <Plus className="h-4 w-4" />
            {zh ? "新增工具模型" : "New tool model"}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
            <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {zh ? "推荐" : "Recommended"}
                </span>
                <span className="text-[13px] font-semibold text-foreground">
                  {zh ? "给工具选模型" : "Choose a model for your tools"}
                </span>
              </div>
              <div className="mt-1 max-w-[760px] text-[12px] leading-5 text-muted-foreground">
                {zh
                  ? "先选一个推荐场景，或者新建一个调用 ID；再选供应商和模型。工具里只认这个 ID，换模型不用改工具配置。"
                  : "Start with a recommended scene or create a call ID, then choose a provider and model. Tools only need the call ID; changing the model does not require a tool config change."}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { n: "1", zh: "选场景", en: "Choose a scene" },
                  { n: "2", zh: "选供应商和模型", en: "Pick a provider and model" },
                  { n: "3", zh: "复制调用 ID 到工具", en: "Copy the call ID into your tool" }
                ].map((step) => (
                  <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2" key={step.n}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                      {step.n}
                    </span>
                    <span className="text-[11px] text-foreground">{zh ? step.zh : step.en}</span>
                  </div>
                ))}
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
                    ? "工具模型选配需要基于供应商的模型创建。添加完供应商后，再回来给工具创建调用 ID。"
                    : "Tool model setup uses models from a provider. Add a provider, then come back and create call IDs for your tools."}
                </div>
                <Button className="mt-4" onClick={onOpenProviders} type="button">
                  {zh ? "去添加供应商" : "Add a provider"}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <div className="text-[14px] font-semibold text-foreground">
                  {zh ? "还没有可用的模型" : "No models configured yet"}
                </div>
                <div className="mx-auto mt-1 max-w-[460px] text-[12px] leading-5 text-muted-foreground">
                  {zh
                    ? "先创建一个模型选配，再把调用 ID 同步到工具。"
                    : "Create a model setup, then sync the call ID to your tools."}
                </div>
                <Button className="mt-4" onClick={openCreate} type="button">
                  <Plus className="h-4 w-4" />
                  {zh ? "新增工具模型" : "New tool model"}
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {builtinEntries.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold text-foreground">{zh ? "推荐场景" : "Recommended scenes"}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {zh
                            ? "安装器已经配好，点“选配模型”就能换底层模型。"
                            : "Preconfigured. Click Choose model to change the model behind each ID."}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {builtinEntries.length} {zh ? "个场景" : "scenes"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {builtinEntries.map(({ profile }) => (
                        <ModelEntryCard
                          copiedAlias={copiedAlias}
                          key={profile.id}
                          onCopy={(value) => void copyAlias(value)}
                          onDelete={setDeleteTarget}
                          onEdit={openEdit}
                          onToggle={(item, enabled) => void toggleEntry(item, enabled)}
                          profile={profile}
                          providers={providers}
                          zh={zh}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">{zh ? "我的模型" : "My models"}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {zh
                          ? "为特定工具或用途创建的自定义调用 ID。"
                          : "Custom call IDs for a specific tool or use case."}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {customEntries.length} {zh ? "个入口" : "entries"}
                    </span>
                  </div>
                  {customEntries.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {customEntries.map(({ profile }) => (
                        <ModelEntryCard
                          copiedAlias={copiedAlias}
                          key={profile.id}
                          onCopy={(value) => void copyAlias(value)}
                          onDelete={setDeleteTarget}
                          onEdit={openEdit}
                          onToggle={(item, enabled) => void toggleEntry(item, enabled)}
                          profile={profile}
                          providers={providers}
                          zh={zh}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/15 px-4 py-4">
                      <span className="text-[12px] text-muted-foreground">
                        {zh
                          ? "还没有自定义模型。推荐场景已经可以直接用；需要新的调用 ID 时再新增。"
                          : "No custom models yet. The recommended scenes are ready to use; add a new call ID when you need one."}
                      </span>
                      <Button onClick={openCreate} size="sm" type="button" variant="outline">
                        <Plus className="h-3.5 w-3.5" />
                        {zh ? "新增" : "Add"}
                      </Button>
                    </div>
                  )}
                </section>
              </div>
            )}

            {savedAlias ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">
                  {zh ? `调用 ID 已创建：${savedAlias}` : `Call ID created: ${savedAlias}`}
                </div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {zh
                    ? "现在去工具的模型选择器里选择这个 ID。已有 ID 换模型时不需要再改工具配置。"
                    : "Select this ID in your tool's model picker. Changing the model behind an existing ID does not require a tool config change."}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => void copyAlias(savedAlias)} size="sm" type="button" variant="outline">
                    {copiedAlias === savedAlias ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedAlias === savedAlias ? (zh ? "已复制" : "Copied") : (zh ? "复制调用 ID" : "Copy call ID")}
                  </Button>
                </div>
              </div>
            ) : null}

            {syncResult ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{zh ? "已同步到工具" : "Synced to tools"}</div>
                <div className="mt-2 space-y-1.5">
                  {syncResult.clients.length === 0 ? (
                    <div className="text-[12px] text-muted-foreground">
                      {zh ? "没有启用的 Agent 配置档案。" : "No enabled agent profiles."}
                    </div>
                  ) : null}
                  {syncResult.clients.map((client) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]" key={`${client.client}-${client.path}`}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", client.ok ? "bg-emerald-500" : "bg-destructive")} />
                      <span className="font-medium text-foreground">{clientLabels[client.client] ?? client.client}</span>
                      <span className="text-muted-foreground">{client.message}</span>
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
                    ? (zh ? "调整推荐场景模型" : "Adjust recommended scene model")
                    : dialog === "edit"
                      ? (zh ? "调整工具模型" : "Adjust tool model")
                      : (zh ? "新增工具模型" : "New tool model")}
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
                <div className="-mt-2 text-[11px] leading-4 text-muted-foreground">
                  {zh
                    ? "供应商是模型的来源（例如 tai、baozi）。Codex / OpenCode / Claude Code 是使用这个调用 ID 的工具。"
                    : "The provider is where the model comes from (for example tai or baozi). Codex, OpenCode, and Claude Code are the tools that use the call ID."}
                </div>
                {editingBuiltin ? null : (
                  <>
                    <Field label={zh ? "用途标签（可选）" : "Usage label (optional)"}>
                      <Input
                        onChange={(event) => setRole(event.target.value)}
                        placeholder={zh ? "code / chat / office / 自定义" : "code / chat / office / custom"}
                        value={role}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-1.5">
                      {roleSuggestions.map((value) => (
                        <button
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                            role.trim().toLowerCase() === value
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                          )}
                          key={value}
                          onClick={() => setRole(value)}
                          type="button"
                        >
                          <span className="font-mono">{value}</span>
                          <span className="ml-1">{roleDisplayName(value, zh)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="-mt-2 text-[11px] leading-4 text-muted-foreground">
                      {zh
                        ? "点击常用标签，或直接输入任意文字；不限制取值，推荐调用 ID 会根据它生成。"
                        : "Click a common label or type any text; values are not restricted. The recommended call ID uses it."}
                    </div>
                  </>
                )}
                <Field label={zh ? "模型" : "Model"} requirement="required">
                  <SelectControl onChange={setModel} options={modelOptions} value={model} />
                </Field>
                <div className="-mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
                  <div>
                    {zh
                      ? "这里只显示所选供应商的模型。找不到时，先确认这个模型属于哪个供应商。"
                      : "Only models from the selected provider are listed. If yours is missing, first check which provider owns it."}
                  </div>
                  <button
                    className="text-left font-medium text-primary hover:underline"
                    onClick={() => {
                      closeDialog();
                      onOpenProviders();
                    }}
                    type="button"
                  >
                    {zh ? "去供应商页面手动添加模型" : "Add a model on the Providers page"}
                  </button>
                </div>

                {dialog === "create" ? (
                  <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2">
                    <Checkbox checked={bindProvider} onCheckedChange={setBindProvider} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium text-foreground">
                        {zh ? "在调用 ID 中绑定供应商（默认开启）" : "Include the provider in the call ID (on by default)"}
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
                  label={zh ? "调用 ID（工具里选择的名字）" : "Call ID (name used by tools)"}
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
                      ? "推荐场景的调用 ID 固定；可以在上面换供应商 / 模型。安装器重配会保留你选中的模型。"
                      : "Recommended scene call IDs are fixed. Pick a different provider or model above; reinstalling keeps your selected model."
                  ) : dialog === "edit" ? (
                    zh
                      ? "已创建的调用 ID 不能改名。需要新名字时请新建一个入口；已有 ID 可以换背后的模型。"
                      : "An existing call ID cannot be renamed. Create a new entry for a new name; you can change the model behind an existing ID."
                  ) : (
                    zh
                      ? `推荐调用 ID：${recommendedAlias}。不要把模型版本或日期写进 ID；模型会换，ID 不要换。`
                      : `Recommended call ID: ${recommendedAlias}. Do not put model versions or dates in the ID; models change, IDs should not.`
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
