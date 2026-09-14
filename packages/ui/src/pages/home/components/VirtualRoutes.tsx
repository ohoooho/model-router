/**
 * OMR UI v2 — Virtual Routes (4 档虚拟路由卡片)
 *
 * 老板 09-14 00:12 lockin: 简单创建模型/路由 + 轻易切换模型
 * 老板 09-14 00:35 lockin: 美观又简单
 * 老板 09-14 13:55 lockin: 项目体系不更新, 部署有屁用
 *
 * 4 档虚拟路由 (老板 09-10 锁死):
 *   - 日常 doubao-2.0 (虚拟 ID 不变, 切底层 provider)
 *   - 办公 qwen3.8-max
 *   - 编程 baozi
 *   - 团队 team
 *
 * 用户视角: 只看到虚拟 ID, 切 fallback 链 → 后端 hot reload (reloadConfig RPC)
 *
 * 走 window.ccr RPC 桥 (老 UI 的 getState 兼容), 不引新依赖
 */

import { useEffect, useState } from "react";
import { RefreshCw as Reload, Settings, Zap, CheckCircle2, AlertTriangle, Plus, Trash2 } from "lucide-react";

// 桃仙品牌色 (老板 09-14 00:35 lockin: 美观又简单)
const BRAND = {
  sky: "#0EA5E9",
  emerald: "#10B981",
  amber: "#F59E0B",
  zinc: "#71717A",
};

const TIERS_DEFAULT = [
  { id: "daily", label: "日常", virtualId: "doubao-2.0", desc: "聊天、问答、写作", icon: "☀️", color: "sky" },
  { id: "office", label: "办公", virtualId: "qwen3.8-max", desc: "文档、表格、邮件", icon: "📋", color: "emerald" },
  { id: "code", label: "编程", virtualId: "baozi", desc: "代码、调试、重构", icon: "⌨️", color: "amber" },
  { id: "team", label: "团队", virtualId: "team", desc: "自定义档位", icon: "👥", color: "zinc" },
];

function Pill({ status, children }) {
  const cls = status === "healthy" ? "bg-emerald-500/15 text-emerald-400" : status === "warning" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs ${cls}`}>{children}</span>;
}

function TierCard({ tier, active, onClick, profile }) {
  const colorMap = { sky: "border-sky-500", emerald: "border-emerald-500", amber: "border-amber-500", zinc: "border-zinc-500" };
  const ringMap = { sky: "ring-sky-500/30", emerald: "ring-emerald-500/30", amber: "ring-amber-500/30", zinc: "ring-zinc-500/30" };
  const models = profile?.models || [];
  const healthy = profile?.healthy !== false;
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-6 cursor-pointer transition-all hover:scale-[1.02] ${
        active ? `bg-zinc-900 border-2 ${colorMap[tier.color]} ring-4 ${ringMap[tier.color]}` : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-2xl mb-1">{tier.icon}</div>
          <h3 className="text-xl font-semibold text-white">{tier.label}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{tier.desc}</p>
        </div>
        <Pill status={healthy ? "healthy" : "warning"}>
          {healthy ? <><CheckCircle2 className="inline w-3 h-3 mr-1" />健康</> : <><AlertTriangle className="inline w-3 h-3 mr-1" />注意</>}
        </Pill>
      </div>
      <div className="font-mono text-xs text-zinc-500 mb-3">{tier.virtualId}</div>
      <div className="space-y-2 mt-4">
        {models.length === 0 ? (
          <div className="text-sm text-zinc-500 italic py-2">暂无 fallback, 点击 + 添加</div>
        ) : (
          models.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{i === 0 ? "▣ 主要" : `备用${i}`}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono ${i === 0 ? `border ${colorMap[tier.color]} text-white` : "bg-zinc-800 text-zinc-400"}`}>
                {m}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBar({ gateway, reloading, reloadResult }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900 border border-zinc-800">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${gateway?.state === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />
        <div>
          <h3 className="text-sm font-medium text-zinc-300">OMR Gateway</h3>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{gateway?.host || "127.0.0.1"}:{gateway?.port || 3456}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${gateway?.state === "running" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {gateway?.state || "unknown"}
        </span>
        {reloadResult && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${reloadResult.hotReload ? "bg-sky-500/15 text-sky-400" : "bg-amber-500/15 text-amber-400"}`}>
            {reloadResult.hotReload ? "🔥 Hot Reload" : "🔄 Restarted"}
          </span>
        )}
      </div>
    </div>
  );
}

function ProviderRow({ provider, onToggle }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${provider.enabled ? "bg-emerald-500" : "bg-zinc-600"}`} />
        <span className="font-mono text-sm text-white">{provider.name}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{provider.modelCount} 模型</span>
        <span className="text-xs text-zinc-500 font-mono truncate max-w-xs">{provider.baseUrl}</span>
      </div>
      <button onClick={() => onToggle(provider.name)} className="text-xs px-3 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300">
        {provider.enabled ? "停用" : "启用"}
      </button>
    </div>
  );
}

export default function VirtualRoutes({ rpc }) {
  const [tab, setTab] = useState("home"); // home | route | provider
  const [state, setState] = useState({ providers: [], virtualModelProfile: {}, gateway: {} });
  const [activeTier, setActiveTier] = useState("daily");
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchState = async () => {
    try {
      const result = await rpc("getConfigState");
      setState(result || { providers: [], virtualModelProfile: {}, gateway: {} });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      const result = await rpc("reloadConfig");
      setReloadResult(result);
      await fetchState();
    } catch (e) {
      setError(String(e));
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => { fetchState(); }, []);

  const tierProfile = (tierId) => {
    const tier = TIERS_DEFAULT.find((t) => t.id === tierId);
    const profile = state.virtualModelProfile?.[tier?.virtualId];
    return profile || { models: [], healthy: false };
  };

  return (
    <div className="max-w-7xl mx-auto p-8 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: BRAND.sky }}>桃</div>
          <div>
            <h1 className="text-xl font-semibold text-white">桃仙 · 模型路由</h1>
            <p className="text-xs text-zinc-500">OMR UI v2 · 老板 lockin: 美观又简单 + 项目体系更新</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReload}
            disabled={reloading}
            className="text-sm px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1"
          >
            <Reload className={`w-3 h-3 ${reloading ? "animate-spin" : ""}`} />
            {reloading ? "热重载中..." : "Hot Reload"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-zinc-800">
        <button onClick={() => setTab("home")} className={`px-4 py-2 rounded-t-lg text-sm ${tab === "home" ? "bg-zinc-900 text-white border-b-2 border-sky-500" : "text-zinc-400 hover:text-white"}`}>
          🏠 主页
        </button>
        <button onClick={() => setTab("route")} className={`px-4 py-2 rounded-t-lg text-sm ${tab === "route" ? "bg-zinc-900 text-white border-b-2 border-sky-500" : "text-zinc-400 hover:text-white"}`}>
          🔀 路由编辑器
        </button>
        <button onClick={() => setTab("provider")} className={`px-4 py-2 rounded-t-lg text-sm ${tab === "provider" ? "bg-zinc-900 text-white border-b-2 border-sky-500" : "text-zinc-400 hover:text-white"}`}>
          🔌 Provider 管理
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Home tab */}
      {tab === "home" && (
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">模型路由</h2>
          <p className="text-sm text-zinc-400 mb-6">
            4 个虚拟档位, 一键切换底层模型. 你的代码永远只引用虚拟 ID, 例如 <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs font-mono">doubao-2.0</code>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {TIERS_DEFAULT.map((t) => (
              <TierCard key={t.id} tier={t} active={activeTier === t.id} onClick={() => { setActiveTier(t.id); setTab("route"); }} profile={tierProfile(t.id)} />
            ))}
          </div>
          <StatusBar gateway={state.gateway} reloading={reloading} reloadResult={reloadResult} />
        </div>
      )}

      {/* Route editor tab */}
      {tab === "route" && (
        <div>
          <h2 className="text-2xl font-semibold text-white mb-6">路由编辑器</h2>
          <div className="flex gap-2 mb-6">
            {TIERS_DEFAULT.map((t) => (
              <button key={t.id} onClick={() => setActiveTier(t.id)} className={`px-4 py-2 rounded-lg text-sm ${activeTier === t.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.icon} {t.label}
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500">{t.virtualId}</span>
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-white">{TIERS_DEFAULT.find((t) => t.id === activeTier)?.label}档 · fallback 链</h3>
                <p className="text-xs text-zinc-500 mt-1">拖动重排, 提交后热重载 (无需重启 OMR daemon)</p>
              </div>
            </div>
            <div className="space-y-2">
              {(tierProfile(activeTier).models || []).map((m, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${i === 0 ? "border border-sky-500/30 bg-sky-500/5" : "bg-zinc-950"}`}>
                  <div className="flex flex-col gap-1">
                    <button disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-30">▲</button>
                    <button disabled={i === tierProfile(activeTier).models.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-30">▼</button>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-zinc-500">{i === 0 ? "▣ 主要模型" : `备用模型 ${i}`}</div>
                    <div className="font-mono text-sm text-white">{m}</div>
                  </div>
                </div>
              ))}
              <button className="w-full text-sm px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center gap-1">
                <Plus className="w-3 h-3" /> 添加 fallback 模型
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="text-sm px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300">取消</button>
              <button onClick={handleReload} disabled={reloading} className="text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1" style={{ backgroundColor: BRAND.sky }}>
                <Zap className="w-3 h-3" /> {reloading ? "提交中..." : "💾 提交 (Hot Reload)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider tab */}
      {tab === "provider" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-white">Provider 管理</h2>
            <button className="text-sm px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ backgroundColor: BRAND.sky }}>
              <Plus className="w-3 h-3" /> 添加 Provider
            </button>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            {(state.providers || []).length} 个 Provider, 软停用不删, 改完 API key 立即生效
          </p>
          <div className="space-y-2">
            {(state.providers || []).map((p) => (
              <ProviderRow key={p.name} provider={p} onToggle={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
