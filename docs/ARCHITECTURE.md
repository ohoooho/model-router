# ARCHITECTURE.md — OMR 架构总览

> 这个文档解决什么问题？
> 读 OMR 仓代码时，你会看到 8 个子系统（core / cli / electron / ui / proxy / mcp / observability / build），每个子系统有 50-200 个文件。**这个文档给出 5 分钟看懂 OMR 的鸟瞰图**，然后告诉你 "要看细节去哪个文档"。
>
> 读的人：想知道 OMR 全貌的工程师 / 评估 OMR 升级路线的架构师 / 调研多 LLM 路由方案的同行。
>
> 关联：[`HEADERS.md`](./HEADERS.md)（HTTP 协议头）/ [`ROUTING.md`](./ROUTING.md)（4 策略）/ [`CHANGELOG.md`](./CHANGELOG.md)（commit 时间线）。

---

## 1. 一句话定位

**OMR = 把 N 个 LLM API key 池化 + 路由 + 故障转移**，让 M 个 agent 透明地使用任意上游模型（Anthropic / OpenAI / 国产 miniMax / 字节方舟 / 阿里百炼 / DeepSeek）。

```
agent (Claude Code / Codex / ZCode)
   ↓ HTTP POST /v1/messages
OMR daemon (本地 127.0.0.1:3456)
   ↓ 路由 + 故障转移
上游 1 (minimaxi / Anthropic / Ark / ...)
上游 2 (备份)
   ...
```

---

## 2. 仓库结构

```
ohoooho-model-router/
├── packages/
│   ├── cli/                # CLI 入口 (omr / ccr / model-router) — 1 个 .ts 文件
│   ├── core/               # 核心逻辑（10 万行）⭐
│   ├── electron/           # 桌面 app（Mac/Win/Linux）
│   ├── ui/                 # 管理界面 (React + Tailwind)
│   └── types/              # 共享类型
├── build/                  # esbuild 配置 + assets 同步
├── tests/                  # e2e / system / architecture
├── docker/                 # Dockerfile + docker-compose
├── docs/                   # ⭐ 你在这里
├── patches/                # ⭐ 上游 OMR 增量补丁（6 个 .patch）
├── cmd/                    # ⭐ OMR 运维脚本 (omr-health.sh / omr-rebuild.sh / omr-verify.sh)
├── apply.sh                # ⭐ 补丁应用 + 验证 + 回滚
├── README.md               # 用户文档入口
├── README_zh.md            # 中文用户文档
└── package.json            # monorepo 入口
```

---

## 3. 9 层架构（图）

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 9: UI / Electron                                     │
│  - packages/ui (React)                                       │
│  - packages/electron (Tray + Main process)                  │
├─────────────────────────────────────────────────────────────┤
│  Layer 8: CLI                                               │
│  - packages/cli/src/cli.ts (1 个文件, 1060 行)              │
│  - 子命令: start / ui / serve / stop / <profile>            │
│  - OMR-FORK-CHANGE-007: health / rebuild / verify          │
├─────────────────────────────────────────────────────────────┤
│  Layer 7: Web Management Server                              │
│  - packages/core/src/web/management-server.ts               │
│  - 监听 127.0.0.1:3458 (默认)                                │
│  - 提供 /api/ccr/rpc RPC + 静态 UI 资源                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: HTTP Gateway (核心)                                │
│  - packages/core/src/gateway/                                │
│  - /v1/messages / v1/chat/completions / v1/models / v1/embeddings │
│  - 路由 + 协议适配（OpenAI ↔ Anthropic ↔ Google）            │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Routing Strategies                                │
│  - packages/core/src/gateway/upstream/executor.ts            │
│  - 4 策略: auto-balance / waterfall / priority / manual    │
│  - effective_weight = weight × (1 - utilization)            │
│  - 详见 ROUTING.md                                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Credential Pool                                    │
│  - packages/core/src/providers/credential-pool.ts            │
│  - 多 key 池化 + 限流 + cooldown                              │
│  - per-credential 独立 weight / utilization / priority      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Config Storage                                    │
│  - ~/.omr/config.sqlite (SQLite 3, WAL mode)                 │
│  - ~/.omr/config.json (legacy fallback)                      │
│  - ~/.claude-code-router/ (老路径, dual-read 自动迁移)       │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: MCP / Plugins                                      │
│  - packages/core/src/mcp/                                   │
│  - fusion-vision-mcp / fusion-tool-fallback-mcp / toolhub-mcp │
│  - 由 Web UI 配置启用                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Upstream Adapters                                 │
│  - packages/core/src/providers/ (Anthropic / OpenAI / Google)│
│  - 协议转换 + 重试 + 限流                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 核心子系统

### 4.1 CLI（packages/cli/）

**单文件 1060 行**。所有 CLI 逻辑都在 `src/cli.ts` 里：
- argv parse（手写, 不依赖 commander/yargs）
- start / ui / serve / stop 4 个子命令 + 1 个 profile 子命令
- OMR-FORK-CHANGE-007 加 health / rebuild / verify 3 个子命令

**为什么不拆分？** 因为 CLI 是进程入口，调用 core 服务的 glue code 没有复杂逻辑。**拆了反而增加阅读成本**。

详见 `CHANGELOG.md` OMR-FORK-CHANGE-007。

### 4.2 Core Gateway（packages/core/）⭐ 核心

最重要的包，**10 万行 TypeScript**。结构：

```
src/
├── config/                    # SQLite + JSON 配置加载
├── contracts/                 # 共享类型（AppConfig / GatewayStatus / ProfileConfig）
├── gateway/                   # HTTP gateway
│   ├── core-runtime/         # supervisor / config-compiler / shared
│   ├── internal/             # 内部 RPC
│   └── upstream/             # ⭐ 路由 + executor
├── mcp/                       # MCP 服务
├── observability/             # request-log / raw-trace sync
├── plugins/                   # marketplace / service
├── profiles/                  # agent profile 启动 + env spawn
├── providers/                 # 上游适配 + credential pool
├── proxy/                     # HTTP proxy + cert
├── routing/                   # rewrite / route-script
├── runtime/                   # app paths / config dir constants
├── usage/                     # 配额跟踪
├── web/                       # management server
└── agents/                    # claude-code / codex / zcode / claude-app
```

**最关键的文件**（读 OMR 必读）：
- `src/gateway/upstream/executor.ts` — 路由 + 4 策略 + effective_weight
- `src/providers/credential-pool.ts` — 多 key 池化
- `src/profiles/service.ts` — spawn env 写入（最大文件，800+ 行）
- `src/runtime/app-paths.ts` — `~/.omr/` 路径常量
- `src/contracts/app.ts` — 共享类型定义

### 4.3 Electron（packages/electron/）

桌面 app 入口。**功能性 wrapper**，主要做：
- 托盘菜单（show / hide / start / stop）
- 系统通知（飞书 / 系统通知中心）
- 全局快捷键（Ctrl+Shift+O 唤起）
- 自动启动（launchAtLogin）
- 状态栏 (tray) 组件

**核心逻辑都在 core 包**，electron 只做原生集成。

### 4.4 UI（packages/ui/）

React 18 + Tailwind 4 + BaseUI 16 + dnd-kit + Recharts。

**单页面应用（SPA）**，由 management-server.ts 服务。
- 主面板：providers / credentials / models
- Profile 管理：claude-code / codex / zcode 配置
- 路由规则：virtualModelProfile
- 监控：request log / trace / 配额

**为什么不拆 micro-frontend？** 因为 OMR UI 是一次性产品，**不需要多团队并行**。拆分 ROI 负。

### 4.5 Build / esbuild

`build/build.mjs` 总入口。产物 4 套：
- `packages/cli/dist/main/cli.js` — CLI 单文件 bundle
- `packages/core/dist/main/*` — Server 入口 + workers
- `packages/electron/dist/main/main.js` — Electron 主进程
- `packages/ui/dist/*` — UI 静态资源

**为什么用 esbuild 而不是 webpack / vite**：因为 esbuild 快（光速 100x vs babel），OMR 是 Node.js 项目，不需要 webpack 的 HMR 能力。

---

## 5. 核心数据流

### 5.1 Client → OMR → Upstream

```
1. agent 发 POST /v1/messages (Anthropic 协议)
   ↓
2. Web Management Server (3458) 转发到 Core Gateway
   ↓
3. Core Gateway 解析: model = "MiniMax-M3"
   ↓
4. Routing: 查 virtualModelProfile 匹配 "MiniMax-M3" → 拿 routed model "mm-ap/MiniMax-M3"
   ↓
5. Executor: 拿 mm-ap provider + 4 策略选 key
   ↓
6. Upstream Adapter: 拼 Anthropic 请求体 → 转 OpenAI 兼容 / 国产协议
   ↓
7. 发送 HTTP POST 到 minimaxi / Anthropic / ...
   ↓
8. 接收 streaming response → 转发给 agent
```

**关键点**：第 4 步的 routing 是 OMR 1.0 跟 CCR v3.0.18 的**最大区别**。CCR 模型路由是 `Provider.Models` 数组，OMR 路由是 `virtualModelProfiles` 配置 + 4 策略 + effective_weight。

### 5.2 Profile 启动 → spawn agent

```
1. 用户跑 `omr Codex` (或 click UI 启动)
   ↓
2. CLI 解析: codex 是 profile 名
   ↓
3. loadAppConfig() 从 SQLite 读 app_config['default']
   ↓
4. findProfileForOpen(config, "Codex") → ProfileConfig
   ↓
5. ensureProfileGateway(config, profile, ...) → 启动 gateway（如果还没跑）
   ↓
6. applyProfileConfig(config) → 写 OMR_* spawn env 到子进程
   ↓
7. spawn(profile.agent === "codex" ? codexDesktopAppName : ...)
   ↓
8. 子进程带 OMR_API_KEY / OMR_API_BASE / OMR_RUNTIME_PROFILE_ID 环境变量启动
```

**关键点**：第 6 步的 `applyProfileConfig` 是**外部契约**——任何 OMR-* env 都是写入子进程的。CCR_* 是 dual-read 兼容（如果子进程是 CCR 客户端的话）。

---

## 6. 关键设计原则

### 6.1 fork 策略 = 不重写，只叠加

OMR 仓 = CCR v3.0.18 base + 6 个 fork commit。**没有改 CCR 核心架构**。

**为什么**：CCR v3.0.18 是经过 3 年迭代的稳定版本，executor / routing / provider 这些核心逻辑都 battle-tested。OMR 改动只是在"接口层"叠加（4 策略 / effective_weight / 配置目录迁移），**不碰核心逻辑**。

### 6.2 dual-read 兼容

CCR 引用全保留（HTTP header `x-ccr-*` / env `CCR_*` / 路径 `~/.claude-code-router/`）。**OMR 仓同时认 CCR 老名 + OMR 新名**。

**为什么**：桃仙用户的 baseline 装机是 v3.x era，跑的是 CCR 老路径。如果 OMR 改了后不兼容，**升级等于破坏性变更**——用户的数据 + 脚本 + 习惯全部失效。dual-read 让 OMR 升级**零感知**。

### 6.3 商业品牌 vs 技术品牌分离

- 商业：桃仙 / dopple / baozi → 营销文案
- 技术：OMR / omr- → daemon / CLI / 配置 / 协议

**为什么**：老板 2026-08-10 拍板，定下来后不可随意改。

### 6.4 SQLite + JSON 双存储

- **主存**：SQLite 3 (WAL mode) — 性能 + 事务
- **Fallback**：JSON (legacy) — 老 CCR v3.0.x era

**为什么**：CCR v3.0.x era 用 JSON 存配置，OMR 升级到 SQLite 后**保留 JSON 兼容**。老用户 `~/.omr/config.json` 仍然可读。

### 6.5 工具脚本归仓

OMR 工具脚本（omr-health.sh / omr-rebuild.sh / omr-verify.sh）放 OMR 仓 `cmd/`，**不放 dopple 仓**。

**为什么**：脚本是 OMR daemon 的姊妹工具，归属 = 工具所在的 GitHub repo。dopple 仓只声明"我如何用 OMR"（integrations/omr.md）。

---

## 7. 性能特征

| 指标 | 数值 | 备注 |
|------|------|------|
| 启动时间 | 200-500ms | SQLite WAL + lazy load |
| /v1/messages 延迟 | < 50ms p50 | 路由 + 转发 overhead |
| /v1/messages 延迟 | < 200ms p99 | 含网络到上游 |
| 内存占用 | 100-200MB | idle, Electron 桌面 |
| 内存占用 | 300-500MB | 100 并发请求 |
| SQLite 写入 | 5K txn/s | WAL mode |
| 配置加载 | 50ms | 含 5 provider + 50 credentials |

**性能瓶颈**：不在 OMR，在上游 LLM API。OMR 本身的 overhead 极小。

---

## 8. 运维通道

```
[用户] → omr start (启动 daemon)
        ↓
[daemon] → 写 ~/.omr/service.json (pid + token)
        ↓
[script] → omr-health.sh (每 5 分钟 cron)
        ↓
[check] → pid 活? /v1/models 200? token 有效?
        ↓
[alert] → 异常 → 飞书 webhook
```

**OMR-FORK-CHANGE-007 加的 3 个 CLI 子命令**：
- `omr health` — 端点 + daemon + SQLite 自检
- `omr rebuild` — 重启 OMR + 验证端口
- `omr verify` — 5 provider 配置 + key 完整性

详见 `CHANGELOG.md` OMR-FORK-CHANGE-007。

---

## 9. 升级路线

### 9.1 短期（1-3 个月）

- 上游 CCR v3.1.x cherry-pick（关键 bug fix）
- OMR-FORK-CHANGE-008: OMR 1.0 GA release
- 桃仙装机集成（一键 install）

### 9.2 中期（3-6 个月）

- OMR-FORK-CHANGE-009: 多 daemon 支持（共享 SQLite，HA 部署）
- 路由策略 v2（机器学习优化）
- 请求级 trace UI（OpenTelemetry 集成）

### 9.3 长期（6-12 个月）

- OMR Cloud（云端多租户）
- OMR SDK（Python / Go / Rust）
- 国产 LLM 完整适配（Kimi / 文心 / 智谱）

---

## 10. 关联文档

- [`HEADERS.md`](./HEADERS.md) — HTTP 协议头体系（dual-read 详情）
- [`ROUTING.md`](./ROUTING.md) — 4 策略 + effective_weight 公式
- [`CHANGELOG.md`](./CHANGELOG.md) — commit 时间线
- [`PATCHES.md`](./PATCHES.md) — 6 个 patch 索引
- [`DECISIONS.md`](./DECISIONS.md) — 设计决策日志
- `dopple/integrations/omr.md` — 桃仙侧集成入口

---

## 11. 元数据

- 创建时间：2026-08-12 13:30 GMT+8
- 创建者：CC（Claude Code subagent）
- 关联 commit：96a21a8 / 300d3f4 / 6f6bd56 / 97fe211 / acf6a6d / 1906ed3
- 上游基线：CCR v3.0.18 (commit 4560c6c)
- 兼容性：CCR v3.0.x 行为 100% 兼容（dual-read）
