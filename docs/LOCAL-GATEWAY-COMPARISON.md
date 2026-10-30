# LOCAL-GATEWAY-COMPARISON.md — 单机本地模型网关对比

> 目标：为人人可用的本地模型路由选一个“当前内核”，同时保留未来换内核的能力。
> 范围：单机 / 回环地址运行的本地网关；不含 New API、Higress、Envoy/Kong 等服务端或 K8s 网关。
> 数据截止：2026-10-30。规模数据来自 GitHub API；能力来自 README/官方文档；性能除注明外均为厂商口径，未在本机复测。
> 关联：[`DECISIONS.md`](./DECISIONS.md) §1.4 / §1.5 / [`ARCHITECTURE.md`](./ARCHITECTURE.md) / [`ROUTING.md`](./ROUTING.md)

---

## 0. 结论先行

| 角色 | 推荐 | 一句话理由 |
|---|---|---|
| **当前综合内核** | **CLIProxyAPI（core）+ EasyCLIProxyAPI（参考 GUI）** | 协议/账号覆盖最全、Go 单二进制、可嵌入、官方 GUI，且已迭代 15 个月 |
| **性能内核备选** | **Bifrost** | 公开 benchmark 最强（厂商口径 11µs @5k RPS）、23+ Provider、Apache-2.0 |
| **体验/协议对标** | **Magpie** | 4 协议互转 + 60+ Agent 配置 + 菜单栏/CLI/Web；但只有 5 周，不能直接当生产内核 |
| **现有控制面** | **OMR/CCR** | 多 Key 池化、国产 Provider、9 个 Agent、安装器/License；协议/性能不是第一 |
| **Provider 广度参考** | **LiteLLM** | 100+ Provider、端点最全；但重、复杂，不像“人人可用”的本机产品 |
| **只做“有界面的本地代理”** | **CLIProxyAPI core + 自研 UI；OMR 作为可选适配器** | 产品价值在 UI/安装/配置/诊断，不在维护 fork；内核可换 |
| **不建议做内核** | Magpie（太年轻）、CliGate（样本太小）、Portkey（不本地优先）、New API/Higress（服务端） | 见 §6、§8 |

**核心判断：**  
“人人可用”不等于“功能最多”，而是 **安装后 10 分钟内能跑通第一个请求，并且换模型/换 Provider 不需要读 YAML**。按这个标准，Magpie 的体验最好，但成熟度不够；CLIProxyAPI 是当前“体验、协议、成熟度”最均衡的底座；Bifrost 适合把性能/吞吐放在第一位的阶段。

---

## 1. 目标、边界与评分

### 1.1 产品目标

我们要做的是：

1. **人人可用**：非技术用户能安装、添加 Provider、选模型、连接 Agent。
2. **管理好本地模型路由**：Provider、Key/账号、模型、路由、降级、日志在一个地方管。
3. **简单易用**：常用操作不依赖 YAML；错误信息能看懂；改路由不用重启整个应用。
4. **协议多样性与转换**：至少覆盖 OpenAI Chat / Responses、Anthropic Messages、Gemini；流式、tool calls、reasoning 不能丢。
5. **内核可替换**：当前选择只对当前阶段负责，不能把产品配置和某个内核绑死。

### 1.2 评分维度

| 维度 | 权重 | 说明 |
|---|---:|---|
| 协议覆盖与转换 | 40% | 客户端 ingress、上游 egress、流式/tool calls/reasoning/图片保真度 |
| 性能 | 25% | 单用户 p95 开销、启动、内存；高并发 RPS/p99 |
| 管理体验 | 25% | 首次跑通时间、配置复杂度、路由可视性、日志、Agent 接入 |
| 稳定性 / 许可 | 10% | 维护活跃度、发布节奏、Issue/PR、License、升级路径 |

### 1.3 不纳入主评分

以下能力是加分项或约束项，不进入主评分，避免把“产品功能”误当成“路由内核能力”：

- Agent 配置数量（Magpie 的 60+ 是产品优势，但不是网关协议能力）
- 商业计费、套餐、发票、备案
- License 校验、安装器、品牌
- MCP / 工具生态（有价值，但不是本轮“模型路由”的核心）

### 1.4 “单机本地网关”的纳入标准

- 默认监听 `127.0.0.1` 或本机回环；
- 个人可安装，不要求 Kubernetes；
- 基础使用不要求 PostgreSQL/Redis（团队版另算）；
- 至少支持两种客户端协议；
- 能管理多个 Provider / Key / 账号，并做路由或故障转移。

按这个标准，New API、Higress、Envoy AI Gateway、Kong/APISIX 不进入主榜；CliRelay 因依赖 PostgreSQL + Redis，列入“团队向 / 邻近项目”。

---

## 2. 候选清单

### 2.1 主榜

| 项目 | 为什么纳入 |
|---|---|
| **CLIProxyAPI** | 57k stars、Go、MIT、4+ 协议、OAuth 多账号、官方 EasyCLIProxyAPI GUI、可嵌入 Go SDK |
| **Magpie** | 2026 年最强本机多 Agent 网关新秀，4 协议互转、60+ Agent、菜单栏/CLI/Web |
| **OpenCodex** | 18k stars、本地 Web 控制台、40+ Provider、Codex/Claude Code 体验好 |
| **OMR/CCR** | 我们当前的控制面；多 Key 池化、国产 Provider、9 个 Agent、桌面 UI |
| **Bifrost** | 性能最强候选；Go、23+ Provider、OpenAI/Anthropic/Gemini SDK 入口、Web UI |
| **LiteLLM** | Provider/端点广度标杆；100+ Provider、成熟的企业功能 |

### 2.2 邻近 / 观察名单

| 项目 | 定位 | 为什么不做主榜 |
|---|---|---|
| **CliGate** | 本地 AI 控制面，5 种端点，账号池 + API Key 池，Web Dashboard | 134 stars、AGPL-3.0、2026-03 起，样本太小 |
| **CliRelay** | CLIProxyAPI 的团队向 fork；PostgreSQL + Redis、多租户、配额、审计 | 不是“单机简单”产品；团队/服务端更合适 |
| **Portkey Gateway** | 1,600+ 模型、Guardrails、配置化路由 | 不本地优先；本地无完整 Dashboard；2026-05 后主仓更新放缓 |
| **CCPG** | Claude Code Provider Gateway，桌面 App，40+ Provider | 100 stars、2026-05 起，证据不足 |
| **VibeProxy** | macOS 菜单栏，Claude/ChatGPT 订阅接入 | 订阅包装器，不是完整多协议路由内核 |
| **ProxyPal** | CLIProxyAPI 的桌面 GUI 包装 | 是外壳，不是内核；可作为 EasyCLIProxyAPI 的替代参考 |

---

## 3. 核心事实表

> `open issues+PRs` 使用 GitHub `open_issues_count`，包含 PR；不同项目 Issue 文化不同，不能直接当 bug 数。

| 项目 | 形态 | 语言 / 许可 | 规模（stars / forks / open issues+PRs） | 最新版本 | 成熟度 |
|---|---|---|---|---|---|
| **CLIProxyAPI** | 本地代理 + 管理 API/GUI | Go / MIT | 56,960 / 8,714 / 789 | v8.0.47（2026-10-29） | 2025-07 起，成熟 |
| **Magpie** | 菜单栏/桌面/CLI 本地网关 | Go / MIT | 25,661 / 2,121 / 2,373 | v0.1.2151（2026-10-30） | 2026-09 起，极年轻 |
| **OpenCodex** | 本地代理 + Web 控制台 | TypeScript / MIT | 18,045 / 1,418 / 109 | v2.94.0（2026-10-29） | 2026-06 起，成长中 |
| **OMR/CCR** | 本地控制面 | TypeScript / MIT | CCR 37,909 / 3,183 / 1,182 | CCR v3.1.3；OMR 基于 v3.0.18 | 2025-02 起，稳定 |
| **Bifrost** | 本地/服务端网关 | Go / Apache-2.0 | 9,211 / 1,492 / 1,441 | 活跃（open core；企业版 v2.4.0 base） | 2025-03 起，稳定 |
| **LiteLLM** | 本地/服务端代理 | Python + Rust core / NOASSERTION | 62,336 / 12,834 / 5,572 | v1.106.6（2026-10-28） | 2023-07 起，成熟 |
| **CliGate** | 本地 AI 控制面 | JavaScript / AGPL-3.0 | 134 / 21 / 4 | v1.4.2（2026-06-23） | 2026-03 起，早期 |
| **CliRelay** | 团队自托管网关 | Go / MIT | 1,046 / 132 / 37 | v0.5.9（2026-10-11） | 2026-02 起，团队向 |

---

## 4. 协议覆盖与转换

### 4.1 协议矩阵

| 项目 | 客户端 ingress | 协议转换 | 上游 / 账号 | 备注 |
|---|---|---|---|---|
| **CLIProxyAPI** | OpenAI Chat、OpenAI Responses、Gemini（含 Interactions）、Claude Messages、Codex、Grok | 是；EasyCLIProxyAPI 明确支持 OpenAI/Claude/Gemini 兼容格式互转 | OAuth CLI 账号（Codex/Claude/Gemini/Antigravity/Kimi/xAI 等）+ OpenAI 兼容 API Key | 流式/非流式/WebSocket、function calling；协议面最宽 |
| **Magpie** | OpenAI Chat、OpenAI Responses、Anthropic Messages、Gemini；另有 audio、Ollama、MCP | 是；README 明确“四种协议互转，streaming/tool calls/reasoning included” | 20+ 预设 + Claude/ChatGPT/Copilot/Gemini/Grok 订阅 + 本地 Ollama/LM Studio + 任意 OpenAI/Anthropic 兼容端点 | 消费级协议覆盖最强；`40+ Provider` 口径见 §7.1 |
| **OpenCodex** | OpenAI Responses、OpenAI Chat Completions、Anthropic Messages | 是；翻译成 Provider 原生协议 | 40+ 内置 Provider + ChatGPT 账号池 + 任意 OpenAI 兼容端点 | 无 Gemini 客户端 ingress；Codex/Claude Code 场景强 |
| **OMR/CCR** | OpenAI Chat、OpenAI Responses、Anthropic Messages、Gemini | 是；OpenAI ↔ Anthropic ↔ Google | OpenAI 兼容、Anthropic、Google、DeepSeek/Ark/MiniMax/Qwen 等；多 Key 池 | 4 种端点风格；9 个 Agent；Node/TS |
| **Bifrost** | OpenAI、Anthropic、Google GenAI SDK 三个入口 | 是；SDK drop-in | 23+ Provider；failover/负载均衡/语义缓存/MCP | OpenAI Responses 未在 README 明确，需实测 |
| **LiteLLM** | OpenAI 格式为主；`/responses`、`/messages`、embeddings、images、audio、batches、rerank、A2A 等 | 以 OpenAI 格式统一；原生协议保真度按 Provider 而异 | 100+ Provider | 端点/Provider 最全，但不是“四协议互转”主打 |
| **CliGate** | Anthropic Messages、OpenAI Chat、OpenAI Responses、Codex、Gemini | 是 | ChatGPT/Claude/Antigravity 账号池 + 多家 API Key 池 | 5 种端点；早期 |
| **CliRelay** | OpenAI Chat/Responses、Anthropic、Gemini | 是 | OAuth + API Key + 任意 OpenAI 兼容上游；团队多租户 | 依赖 PostgreSQL/Redis |

### 4.2 判断

- **客户端协议最全**：CLIProxyAPI、Magpie、OMR/CCR、CliGate 都覆盖 4 种以上；其中 Magpie 的“四协议互转 + 60+ Agent”最贴近“人人可用”的体验。
- **上游 Provider 最全**：LiteLLM（100+）> CLIProxyAPI（OAuth CLI + 兼容 API）≈ Magpie（20+ 预设 + 订阅/本地/自定义）> OpenCodex（40+）> Bifrost（23+）。
- **协议数量不等于保真度**：必须测 streaming、tool calls、reasoning、图片、usage、stop reason、错误映射；README 的“支持”只能当候选，不能当验收。

### 4.3 关键差异

1. **CLIProxyAPI 的强项是“账号 + 协议”**：它把 Codex/Claude/Gemini 等 CLI 的 OAuth 账号变成 API，再做多账号轮询；对“已有订阅、不想买 API”的用户价值最大。
2. **Magpie 的强项是“Agent + 体验”**：它不是只做协议转换，而是把 60+ Agent 的配置文件改好；对“不想读文档”的用户价值最大。
3. **OpenCodex 的强项是“Codex/Claude Code 即插即用”**：Web Dashboard + 40+ Provider，比 CLIProxyAPI 更消费级，但协议入口少一个 Gemini。
4. **OMR/CCR 的强项是“多 Key 池化 + 国产 Provider”**：它不是协议覆盖冠军，但把 N 个 API Key 池化、按权重/利用率路由做得很细。
5. **Bifrost/LiteLLM 是“网关引擎”**：协议/Provider 强，但不负责 Agent 配置和消费级引导；适合做内核，不适合直接当“人人可用”的成品。

---

## 5. 性能对比

### 5.1 公开数据

| 项目 | 语言/运行时 | 公开性能数据 | 评价 |
|---|---|---|---|
| **Bifrost** | Go | 厂商：5,000 RPS 下增加 11µs/请求；另有 <200µs 口径 | 公开数据最强；需在目标机型复测 |
| **LiteLLM** | Python + Rust core | 厂商：1,000 RPS 下 P95 8ms | 比 Node/Python 旧版好，但仍重于 Go/Rust |
| **CLIProxyAPI** | Go | 无公开 benchmark | Go 单二进制，理论上低开销；需实测 |
| **Magpie** | Go | 无公开 benchmark | Go，理论上低开销；需实测 |
| **OpenCodex** | TypeScript/Bun | 无公开 benchmark | 本地单用户够用；高并发未知 |
| **OMR/CCR** | Node/TypeScript | OMR 文档：p50 <50ms、p99 <200ms（含上游）；idle 100–200MB | 单用户够用；高并发不是强项 |
| **CliGate** | JavaScript | 无 | 早期，未验证 |
| **CliRelay** | Go | 无 | 团队向，依赖 PG/Redis |

> 注意：Bifrost 的 11µs 和 LiteLLM 的 8ms 不是同一测试条件，不能直接相减。所有厂商 benchmark 都要在目标机器、目标并发、真实 Provider 下复测。

### 5.2 单用户 vs 高并发

- **单用户**：模型首 token 通常几百毫秒到几秒，网关 10ms 还是 50ms 对体验影响很小。此时 **启动速度、内存、安装包大小、管理体验** 比 5k RPS 更重要。
- **高并发/团队**：Bifrost 明显领先；LiteLLM 次之；CLIProxyAPI/Magpie 的 Go 内核有潜力，但没有公开高并发数据；OMR/CCR 的 Node 热路径不适合作为高 RPS 网关。
- **结论**：如果产品只服务一个人/一台电脑，不要把“性能”权重放得比“管理”高；如果要做团队/多租户，Bifrost 或 CliRelay 更合适。

---

## 6. 管理体验对比

| 项目 | 安装 | 添加 Provider | 选模型 / 路由 | 连接 Agent | 观测/日志 | 总评 |
|---|---|---|---|---|---|---|
| **Magpie** | 下载 App / 安装脚本 / Docker | 预设 + 订阅登录 + 本地/自定义 | 菜单栏/Agents 页/Routing 组；intent routing | 60+ Agent 一键改写，保留注释/格式 | Usage/Quota/Sessions/Trace | **消费级第一** |
| **CLIProxyAPI + Easy** | 单二进制 + Tauri 桌面 GUI | OAuth 登录 + API Provider 聚合 | Provider/模型/别名；多账号轮询 | Easy GUI 内置 Agent 配置 | 管理 API + 第三方 Dashboard；核心无内置统计 | **成熟 GUI 第一梯队** |
| **OpenCodex** | npm / 桌面安装包 | Web Dashboard 添加 40+ Provider | 模型选择/账号池/自动路由 | Connect 页 + `ocx claude` / `ocx codex` | Dashboard 请求/配额 | 简单，偏 coding |
| **OMR/CCR** | 安装器 / 桌面 App | UI 预设 + 自定义 + 多 Key | 4 策略 + Profile + 日志 | 9 个 Agent + 环境变量 | 请求日志/延迟/Token/成本 | 一体化好，偏专业 |
| **Bifrost** | 单二进制 / Docker / npx | Web UI / 配置 | Provider/模型/fallback/负载均衡 | 手动 base URL | Web UI + 日志 | 服务端管理，不是 Agent 向导 |
| **LiteLLM** | pip/Docker | YAML + Admin UI | 虚拟 Key/路由/Guardrails | 手动配置 | Admin UI + 日志 | 功能强但最复杂 |
| **CliGate** | 安装包 / 源码 | Web Dashboard | 账号池/Key 池/路由 | 一键 Claude Code/Codex/Gemini/OpenClaw | Dashboard | 功能全，但早期 |
| **CliRelay** | Docker + PG/Redis | Web 控制台 | 渠道组/调度/配额/多租户 | 手动/文档 | 监控中心/审计 | 团队向 |

### 6.1 “人人可用”的关键不是功能，而是路径

一个非技术用户的实际路径是：

```
安装 → 添加一个 Provider → 选一个模型 → 点“连接 Claude Code/Codex” → 发一句话
```

按这个路径：

- **Magpie** 最短：菜单栏 + Agents 页 + 一键改写。
- **CLIProxyAPI + Easy** 次短：GUI 能完成大部分操作，但 OAuth/Provider 概念比 Magpie 多。
- **OpenCodex** 很短，但主要面向 Codex/Claude Code，不是所有 Agent。
- **OMR/CCR** 对已有用户友好，但 Agent 覆盖少于 Magpie。
- **Bifrost/LiteLLM** 更像“管理员工具”，不是“消费者 App”。

---

## 7. 稳定性、许可与事实核对

### 7.1 Magpie（独立核对）

用户给的资料说：24,627 stars / 1,995 forks / 2,167 open issues（2026-10-29）。我在 2026-10-30 读到：

- **25,661 stars / 2,121 forks / 2,373 open issues+PRs**；
- 其中 **2,357 open issues + 16 open PRs**（GitHub Search API）；
- 创建于 **2026-09-23**；最新 **v0.1.2151（2026-10-30）**；
- 5 周内 2,151 个 release，几乎每天多次发版；
- MIT、Go、`127.0.0.1:3425`；
- README 明确：OpenAI Chat / Responses、Anthropic Messages、Gemini 四协议互转，streaming/tool calls/reasoning included；
- 60+ Agent 配置表可在 `docs/reference.md` 核对；
- 没有公开的 p95/吞吐 benchmark；
- README 列出的 Provider **预设约 20+**（Anthropic/OpenAI/Gemini/Vertex/Bedrock/DeepSeek/Kimi/GLM/MiniMax/StepFun/Qwen/Qianfan/Tencent/Huawei/Volcengine/Mistral/Groq/Nous/xAI/OpenRouter/Together 等），另有 5 类订阅、Ollama/LM Studio 本地和任意兼容端点。  
  **“40+ Provider”不是 README 直接给出的硬数字，应按版本复核；不要把它当验收指标。**

**判断**：Magpie 的能力描述基本可信，产品完成度惊人；但“5 周 / 2,151 releases / 2,357 open issues”说明它还在高速重构期。**可以作为体验和协议对标，不适合作为需要长期稳定的生产内核。**

### 7.2 CLIProxyAPI（独立核对）

- 56,960 stars / 8,714 forks / 789 open issues+PRs；MIT、Go；
- 创建于 2025-07-01，最新 v8.0.47（2026-10-29）；
- 4+ 协议：OpenAI Chat/Responses、Gemini/Interactions、Claude、Codex、Grok；
- 多账号 round-robin、流式/非流式/WebSocket、function calling；
- 官方 EasyCLIProxyAPI（3,287 stars，MIT，Rust/Tauri）提供桌面 GUI、OAuth、Provider 聚合、协议转换、额度、用量、模型别名、Agent 配置；
- 提供可嵌入 Go SDK；
- 没有公开高并发 benchmark；
- 开放 PR 744 个，合并/维护压力不小；OAuth 订阅复用存在 Provider ToS 风险。

**判断**：**当前最均衡的“内核”候选**。它不是最消费级的 UI，但 core + Easy GUI 的组合最接近“可产品化”。

### 7.3 OpenCodex

- 18,045 stars / 1,418 forks / 109 open issues+PRs；MIT、TypeScript；
- 创建于 2026-06-18，最新 v2.94.0（2026-10-29）；
- 接受 Responses / Chat Completions / Anthropic Messages，翻译到 Provider；
- 40+ 内置 Provider、Web Dashboard、`localhost:10100`、ChatGPT 账号池；
- 无 Gemini 客户端 ingress；无公开 benchmark。

**判断**：Codex/Claude Code 用户的“简单本地网关”很强；如果产品只服务 coding agent，值得重点对标。但它不是四协议全入口，且同样年轻。

### 7.4 OMR/CCR

- CCR：37,909 stars / 3,183 forks / 1,182 open issues+PRs；MIT、TypeScript；2025-02 起；
- OMR fork 增加：多 Key 池化、4 策略、`effective_weight`、桌面 UI、Profile、安装器/License；
- 4 种端点风格：OpenAI Chat/Responses、Anthropic、Gemini；
- 9 个 Agent：Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode；
- OMR 文档性能：p50 <50ms、p99 <200ms（含上游）、idle 100–200MB；无独立 benchmark；
- 无公开四协议 conformance 测试。

**判断**：**最好的“国产 API Key + 多 Key 池化 + 一体化控制面”**，但不是协议/性能冠军。适合继续做控制面，不必为了“协议最多”而换掉；如果目标是“人人可用的纯路由内核”，它的 Node 热路径和 Agent 覆盖是短板。

### 7.5 Bifrost

- 9,211 stars / 1,492 forks / 1,441 open issues+PRs；Apache-2.0、Go；2025-03 起；
- 23+ Provider；OpenAI/Anthropic/Google GenAI SDK 三个入口；
- failover、负载均衡、语义缓存、MCP、虚拟 Key、预算、Web UI；
- 厂商：5k RPS 下 11µs overhead；
- 无 Agent 配置层；UI 偏服务端管理；部分能力企业版。

**判断**：**性能/吞吐第一候选**，适合作为“数据面内核”；如果产品第一阶段就把高并发/团队放在第一位，选它。对“人人可用”的消费级路径，它需要自建 UI/Agent 层。

### 7.6 LiteLLM

- 62,336 stars / 12,834 forks / 5,572 open issues+PRs；Python + Rust core；NOASSERTION（含企业条款，需法务确认）；2023-07 起；
- 100+ Provider；OpenAI 格式为主；端点最全；
- 厂商：1k RPS 下 P95 8ms；
- YAML + Admin UI；生产虚拟 Key/预算通常需要 PostgreSQL；
- 复杂，概念多。

**判断**：**Provider 广度/企业功能标杆**，不是“人人可用”的本机产品。适合做服务端参考或 Provider 覆盖兜底。

### 7.7 邻近项目

- **CliGate**：134 stars、AGPL-3.0、5 种端点、账号池/Key 池、Web Dashboard；功能很像“全能型”，但样本太小，且 AGPL 对商业闭源产品有约束。**观察，不做当前内核。**
- **CliRelay**：1,046 stars、MIT、Go、PostgreSQL + Redis、多租户/配额/审计/监控；是 CLIProxyAPI 的团队向 fork。**如果做团队版，参考它的管理面；单机产品不用。**
- **Portkey Gateway**：13,291 stars、MIT、TypeScript、1,600+ 模型、Guardrails；不本地优先，主仓 2026-05 后更新放缓；**不做本机内核。**
- **CCPG / VibeProxy / ProxyPal**：桌面包装器/订阅工具，不是完整协议内核；**可作为 UX 参考。**

---

## 8. 评分与排序

> 评分为 1–5 的**示意分**，用于排序，不是实测结果；最终以 §10 的 benchmark 为准。

| 项目 | 协议 40% | 性能 25% | 管理 25% | 稳定/许可 10% | 加权 | 排序 |
|---|---:|---:|---:|---:|---:|---:|
| **CLIProxyAPI** | 5.0 | 4.0 | 4.5 | 5.0 | **4.63** | 1 |
| **Magpie** | 5.0 | 4.0 | 5.0 | 2.0 | **4.45** | 2 |
| **Bifrost** | 4.0 | 5.0 | 3.5 | 4.5 | **4.18** | 3 |
| **OpenCodex** | 3.5 | 4.0 | 5.0 | 4.0 | **4.05** | 4 |
| **OMR/CCR** | 4.5 | 3.0 | 4.0 | 4.0 | **3.95** | 5 |
| **LiteLLM** | 5.0 | 3.0 | 2.0 | 4.0 | **3.65** | 6 |

### 8.1 排序解释

- **CLIProxyAPI 第一**：不是每一项都第一，但协议、性能（Go）、管理（Easy GUI）、成熟度最均衡；而且有 Go SDK，适合做“内核 + 自研 UI”。
- **Magpie 第二**：协议和体验都是第一，但稳定性拖累总分；如果只做个人 beta，它可以是第一。
- **Bifrost 第三**：性能第一，但协议入口少一个、管理偏服务端；如果性能是硬门槛，它升到第一。
- **OpenCodex 第四**：体验很好，但只有 3 个客户端协议，且偏 Codex/Claude Code。
- **OMR/CCR 第五**：国产 Provider/多 Key 池化最好，但协议覆盖、Agent 数、性能都不是第一；它是“控制面”，不是“协议内核”。
- **LiteLLM 第六**：Provider 最全，但复杂度和资源占用不适合“人人可用”。

### 8.2 分场景推荐

| 场景 | 推荐 | 说明 |
|---|---|---|
| 最快做“人人可用”的桌面 MVP | **CLIProxyAPI + EasyCLIProxyAPI** | 现成 GUI、协议全、OAuth/API Key 都能接 |
| 自研 UI，内核要可嵌入 | **CLIProxyAPI core（Go SDK）** | 比 fork 整个 Magpie 更可控 |
| 性能/团队/高并发 | **Bifrost** | 公开 benchmark 最强；需要自建 Agent/消费级 UI |
| 国产 API Key + 多 Key 池化 | **OMR/CCR** | 现有能力最贴合；继续补协议/Agent，不必换底座 |
| Provider 数量/企业功能 | **LiteLLM** | 100+ Provider；重、复杂 |
| 只服务 Codex/Claude Code | **OpenCodex** | Web Dashboard + 40+ Provider，简单 |
| 团队多租户/配额/审计 | **CliRelay** | CLIProxyAPI fork，PG/Redis，控制面板强 |

**一个必须明确的分支**：如果商业产品决定**不做订阅 OAuth、只做 API Key**，CLIProxyAPI 的差异化优势会缩小（它最强的是 OAuth 账号池），此时 **Bifrost 的性能、Apache-2.0 和通用网关能力更适合做数据面**；CLIProxyAPI 仍可作为协议/账号适配的参考实现。

---

## 9. 换内核策略

“换内核是各个时期的事”——这句话要落成架构约束，而不是口号。

### 9.1 稳定契约

产品层不要把某个内核的配置格式当自己的配置格式。至少定义四层契约：

1. **客户端 API 契约**：OpenAI Chat/Responses、Anthropic Messages、Gemini generateContent；版本化。
2. **内部配置契约**：Provider、Credential/Account、Model、Route/Policy、Log；自有 schema，可导出/导入。
3. **Kernel Adapter**：`start/stop/health`、`applyConfig`、`proxyRequest`、`events/logs`、`export/import`。
4. **Conformance Suite**：协议矩阵 + 性能基线 + 管理路径；换内核必须先跑同一套测试。

### 9.2 换内核触发条件

满足任意两条，进入评估：

- 缺一个主流客户端协议（OpenAI Responses / Anthropic / Gemini），或 conformance 通过率 <99%；
- 单用户 p95 网关开销 >100ms，或高并发目标达不到；
- 首次跑通时间 >10 分钟，或配置类支持工单持续上升；
- 上游 6 个月无 release、关键 CVE、或 breaking change 频率不可接受；
- License/ToS 与商业产品冲突（AGPL、订阅转售、OAuth 复用）；
- 候选加权分比当前高 ≥15%，且迁移成本 <6 周。

### 9.3 迁移方式

1. **影子流量**：同一批请求同时发旧/新内核，只比较不返回；
2. **配置导出/导入**：Provider/Key/Route 全量迁移，保留 ID 映射；
3. **按 Agent 灰度**：先迁 1 个 Agent/1 个 Provider，再扩大；
4. **保留回滚**：旧内核至少保留一个版本周期；
5. **验收**：协议矩阵、p95、首通时间、故障注入、7 天 soak。

### 9.4 当前建议

- **不要现在就把 OMR/CCR 换掉**：它是控制面/国产 Key 池化的资产，不是纯协议内核。
- **把“内核”与“控制面”拆开**：控制面继续做安装、Provider 管理、Profile、License、诊断；数据面用 CLIProxyAPI/Bifrost 这类可嵌入内核。
- **Magpie 只做对标**：每 3 个月复评一次；如果它能稳定到 v1.0、Issue 收敛、协议 conformance 可验证，再考虑作为消费级前端/内核候选。
- **每季度复评**：用同一套 benchmark，不靠 star 数或 README 判断。

---

## 10. 两周实测计划

### 10.1 协议矩阵

- 客户端：OpenAI Chat、OpenAI Responses、Anthropic Messages、Gemini generateContent；
- Provider：DeepSeek（OpenAI 兼容）、Anthropic、Gemini、Qwen/Ark（OpenAI 兼容）、Ollama（本地）；
- 能力：streaming、tool calls、reasoning、图片、usage、stop reason、错误映射；
- 用例数：4 客户端 × 5 Provider × 4 能力，至少 80 条；每条记录请求/响应差异。

**通过线（建议）**：基础 chat 100%；streaming/tool/reasoning ≥99%；不允许字段静默丢失。

### 10.2 性能

- mock upstream，隔离 Provider 波动；
- 并发 1 / 10 / 100；
- 指标：p50/p95/p99 网关开销、首 token 延迟、RPS、错误率、RSS、启动时间；
- 单用户通过线：p95 开销 <50ms，启动 <2s，idle RSS <300MB；
- 高并发通过线：按产品目标另定（例如 1k RPS、P99 <100ms）。

### 10.3 管理体验

- 找 3 个非技术用户，从零开始：
  - 安装；
  - 添加一个 Provider；
  - 选一个模型；
  - 连接 Claude Code/Codex；
  - 改一次路由/降级；
  - 看一次日志。
- 指标：首次跑通时间、卡点、是否需要读文档、错误信息可理解度。
- 通过线：<10 分钟跑通；常见错误能在 UI 内解决。

### 10.4 稳定性

- 24 小时 soak；
- 429/500/timeout/断网注入；
- 重启/升级/配置迁移；
- 记录 failover 时间、崩溃、内存泄漏、日志可诊断性。

### 10.5 参与实测的四个

优先顺序：

1. **CLIProxyAPI + EasyCLIProxyAPI**（当前内核候选）
2. **Magpie**（体验/协议对标）
3. **Bifrost**（性能对标）
4. **OMR/CCR**（当前控制面基线）

OpenCodex 作为第二梯队；CliGate/CliRelay 作为观察。

---

## 11. 产品形态：有界面的本地代理 + 可选内核

### 11.1 问题

“我们不需要 OMR，只需要部署一个有界面的本地代理”是一个合理的产品方向，但要先拆清楚：

- **界面/安装/配置/诊断** 是产品价值；
- **协议转换/路由/故障转移** 是内核能力；
- 两者可以分离，且应该分离。

如果只是“给某个内核套一层 UI”，产品仍然依赖该内核的协议覆盖、性能和稳定性；如果做“多内核列表”，产品就变成网关管理器，QA/支持矩阵会迅速膨胀。

### 11.2 三种形态

| 形态 | 首屏体验 | 内核 | 优点 | 风险 | 建议 |
|---|---|---|---|---|---|
| **A. 单内核 + 自研 UI** | 安装 → 加 Provider → 选模型 → 连接 Agent | 默认 CLIProxyAPI core（API-Key-only 时可用 Bifrost） | 最简单、最快形成产品；内核可替换 | 依赖上游内核；需要自己做 UI/安装/升级 | **首选** |
| **B. 单默认内核 + OMR 可选适配器** | 新用户走默认内核；老用户可“接入现有 OMR” | CLIProxyAPI/Bifrost + OMR adapter | 保留 OMR 存量/国产多 Key 价值；迁移平滑 | 需要维护 OMR adapter；两套配置/诊断 | **推荐作为过渡** |
| **C. 多内核选择器** | 首屏让用户选 OMR/Magpie/CLIProxyAPI/Bifrost | 多个 | 灵活、未来-proof | 选择困难；每个内核的协议/配置/日志/升级都不同；QA 爆炸 | **只放高级设置**，首版不超过 2–3 个 |

### 11.3 推荐

**A + B，不做 C 的首屏。**

- 新用户默认使用 **CLIProxyAPI core**（或 API-Key-only 场景的 Bifrost）；
- 已经有 OMR 的用户，通过 **OMR Adapter** 接入现有 daemon，不强制迁移；
- 高级用户可以在“设置 → 高级 → 内核”切换 Bifrost/OMR，但默认隐藏；
- **Magpie 不作为可插拔内核**：它是完整的菜单栏/Agent 配置产品，控制面与 App 耦合；除非只接它的本地 `3425` 端点，否则不要把它放进“内核列表”；
- 无论选哪个内核，客户端始终连接同一个稳定端点（例如 `127.0.0.1:3456`），Agent 配置不变。

### 11.4 一个有界面的本地代理 MVP 应该有什么

| 模块 | MVP 必须 | 可以后置 |
|---|---|---|
| 安装/启动 | 桌面 App / 托盘；启动/停止/重启；端口检测 | 开机自启、自动更新、崩溃上报 |
| Provider | 添加 API Key / OAuth；预设；模型发现 | 多账号池、配额窗口、代理设置 |
| 模型/路由 | 默认模型、fallback、按请求头/体路由 | 意图路由、成本优化、A/B |
| Agent 接入 | Claude Code / Codex 一键配置 | 60+ Agent 全覆盖、WSL |
| 观测 | 请求日志、延迟、Token、错误 | 成本报表、Trace、告警 |
| 配置 | 导出/导入、备份 | 云同步、团队策略 |
| 安全 | 仅回环监听、本地 token、Key 存 Keychain | LAN 共享、企业 SSO |

**技术形态建议**：Tauri/Electron 桌面壳 + Go sidecar（CLIProxyAPI/Bifrost）；SQLite 存配置/日志；Key 存 OS Keychain；默认只监听 `127.0.0.1`；不要默认依赖 PostgreSQL/Redis。

### 11.5 不做什么

1. **不要首屏让用户选内核**——这会把“人人可用”变成“先读一篇对比文”。
2. **不要承诺 OMR 全功能平移到新壳**——多 Key 池化/effective_weight 需要在新控制面或内核里重新实现，不能假设自动继承。
3. **不要把 OAuth 订阅复用默认商业化**——CLIProxyAPI/Magpie/OpenCodex 的订阅接入适合个人自用；商业产品默认走 API Key，订阅模式先过法务。
4. **不要把 Magpie 当可插拔内核**——它是完整 App，不是 headless engine；把它放进“可选列表”会带来控制面耦合。
5. **不要在没跑通 Conformance Suite 前支持第 3、第 4 个内核**——每加一个内核，协议/配置/日志/升级都要重新验。

### 11.6 粗估工作量

| 形态 | 粗估 | 说明 |
|---|---|---|
| A. 单内核 + 自研 UI | 4–6 周 MVP | 安装器/托盘、Provider/模型/路由、Agent 接入、日志、自动更新 |
| B. A + OMR Adapter | +1–2 周 | 依赖 OMR 是否有稳定本地 API/配置导出 |
| C. 多内核选择器 | +4–8 周，且长期 QA | 每个内核都要适配配置、日志、升级、协议差异 |

> 以上是工程粗估，不是承诺；实际取决于是否复用 OMR 现有 UI、是否要求 Windows 签名/公证、是否做自动更新。

### 11.7 结论

**“不需要 OMR，只要一个有界面的本地代理”是成立的，但前提是承认：产品的工作量从“维护 fork”转移到了“做控制面/安装/诊断”。**  
如果目标是快速推出一个可用、可维护、可换内核的产品，**A + B** 比“继续维护 OMR 作为唯一底座”更轻；如果目标是保留 OMR 的国产多 Key 池化差异化，则把 OMR 降为可选适配器，而不是直接删掉。

---

## 12. 风险与未知

- **Star/Issue 不是质量**：CLIProxyAPI 57k、Magpie 25k 都受社区热度影响；Issue 文化不同，不能直接比较。
- **厂商 benchmark 不可直接横比**：Bifrost 11µs @5k RPS、LiteLLM 8ms P95 @1k RPS 的测试条件不同。
- **Magpie 仍在高频重构**：5 周 2,151 releases；API/配置/行为可能随时变化。
- **OAuth 订阅复用有 ToS 风险**：CLIProxyAPI/Magpie/OpenCodex 的订阅接入适合个人自用；商业产品默认应走 API Key 模式，订阅模式需法务评估。
- **AGPL 风险**：CliGate 是 AGPL-3.0；如果产品闭源分发，需法务确认。
- **未实测**：本文是桌面研究 + GitHub API，不是安装实测；所有“性能/体验”结论都要用 §10 验证。
- **Magpie “40+ Provider”**：README 只直接列出 20+ 预设；不要把第三方口径当硬指标。
- **CLIProxyAPI 的 PR 积压**：744 open PR，说明社区活跃，也说明合并/维护压力。
- **Bifrost/LiteLLM 的服务端假设**：本地单机可用，但生产功能（虚拟 Key、预算、团队）通常假设数据库/服务端；不要低估部署复杂度。

---

## 13. 参考

### 13.1 仓库与文档

- CLIProxyAPI：<https://github.com/router-for-me/CLIProxyAPI>
- EasyCLIProxyAPI：<https://github.com/router-for-me/EasyCLIProxyAPI>
- Magpie：<https://github.com/yetone/magpie>
- Magpie Reference：<https://github.com/yetone/magpie/blob/main/docs/reference.md>
- OpenCodex：<https://github.com/lidge-jun/opencodex>
- Bifrost：<https://github.com/maximhq/bifrost>
- LiteLLM：<https://github.com/BerriAI/litellm>
- CCR：<https://github.com/musistudio/claude-code-router>
- CliGate：<https://github.com/codeking-ai/cligate>
- CliRelay：<https://github.com/kittors/CliRelay>
- Portkey Gateway：<https://github.com/Portkey-AI/gateway>

### 13.2 本地文档

- [`DECISIONS.md`](./DECISIONS.md) — 网关内核评估目标与可替换性
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — OMR 架构与协议适配
- [`ROUTING.md`](./ROUTING.md) — 4 策略与 `effective_weight`

### 13.3 数据口径

- GitHub API `repos/{owner}/{repo}`：stars/forks/open_issues/language/license/created_at/pushed_at；
- GitHub Search API：Issue/PR 拆分；
- 版本：GitHub Releases API；
- 截止：2026-10-30（UTC）。

---

## 14. 变更日志

- 2026-10-30：首版。按“人人可用、简单易用、协议多样性/转换、内核可替换”的目标重做单机对比；独立核对 Magpie/CLIProxyAPI/OpenCodex/Bifrost/LiteLLM 的 GitHub 数据与 README；给出 CLIProxyAPI 当前内核建议、Bifrost 性能备选、Magpie 体验对标、OMR/CCR 控制面定位，以及两周实测计划。
- 2026-10-30：追加 §11“有界面的本地代理 + 可选内核”。记录“也许不需要 OMR，只需要一个有界面的本地代理”的产品假设；推荐 A（单内核 + 自研 UI）+ B（OMR 可选适配器），C（多内核选择器）只放高级设置。
