# DECISIONS.md — OMR 决策日志

> 这个文档解决什么问题？
> 读 OMR 仓代码时，你会遇到很多"为什么这样设计"的问题——为什么叫 OMR、为什么 fork、为什么这 6 个 commit 按这个顺序、为什么有些方案被否了。**这个文档收集所有"认知变化"和"被否方案"，避免下一个读代码的人重复踩坑**。
>
> 读的人：写 OMR 仓代码的人 / 重构 OMR 的人 / 评估 OMR 升级路线的人。
>
> 关联：`ARCHITECTURE.md`（架构总览）/ `CHANGELOG.md`（commit 时间线）/ `dopple/integrations/omr.md`（桃仙侧集成）。

---

## 1. 项目缘起

### 1.1 桃仙业务背景

桃仙（dopple.ohoooho.com）是一个多 agent 协作平台，分布在 macOS / Windows / Linux 桌面端 + 一台云端管理服务器（140.143.246.15）。每个 agent 跑一个 Claude Code / Codex / ZCode 子进程，这些子进程需要 LLM API key 才能跟上游模型对话。

关键观察：**单 agent × 单 key 浪费严重**。一个 5 美元/月订阅 key 在轻度 agent 使用下只用 10% 流量，单 key 支撑 10 个 agent 才有意义。但 10 个 agent 共享 1 个 key 又会面临 rate limit / 限流 / 区域封锁。

**OMR 解决的问题**：把 N 个 key 池化，让 M 个 agent 按需路由 + 故障转移 + 限流保护。

### 1.2 桃仙不用自研

2026-08-06 23:05 老板原话：

> "本质上讲，我想将 ccr 改成 fork 成我们自己的路由工具，这样用户看着更加专业一点，我们的体系更完整一点。我们的模型管理 skill 是不是用来操作 ccr 的？"

但 5 分钟后老板又改主意：

> "先不 fork 吧，主要是没有改动的目标，记做一个计划吧"

**真实动机**：桃仙需要的不是"造一个新轮子"，而是"用一个稳定的上游 + 精准的本地化"。`@musistudio/claude-code-router`（CCR）已经是一个成熟的多 LLM 路由网关（8.4k stars GitHub），覆盖了 90% 桃仙需要的能力。剩下的 10% 是：

1. 多 key 池化（CCR v3.0.18 不支持，OMR-FORK-CHANGE-004 加）
2. effective_weight 平滑用满（OMR-FORK-CHANGE-004b 改）
3. 品牌独立（CCR → OMR 全套 branding）
4. 配置目录迁移（`~/.claude-code-router` → `~/.omr`，dual-read 兼容）

这 10% 改动的 ROI 极高（fork 一次永久收益），但需要避免改崩上游的稳定性。

### 1.3 Fork 策略

**不重写，只叠加**。OMR 仓 = CCR v3.0.18 + 6 个 fork commit。这 6 个 commit 里有 4 个是"加新能力"（004 / 004b / 005 系列），2 个是"删遗留"（005b / 005c 是 005 后的 grep 补漏）。**没有改 CCR 核心架构**——executor / routing / provider / credential 这些都保持上游原样。

合并策略：**月度 cherry-pick 上游关键 fix**（实际跑 4 个月一次，每次 30-60 分钟）。日常 commit 只在 OMR 仓内进行，不向上游推 PR（避免给上游 maintainer 增加负担）。

---

## 2. 命名史

### 2.1 候选名

| 候选 | 来源 | 评估 | 拍板 |
|------|------|------|------|
| `@ohoooho/llm-router` | 老板 23:05 第一反应 | 直接挂在 ohoooho 公司名下 / 但 ohoooho 是公司域名不是产品 | ❌ |
| `open-router` | 老板 23:05 第二反应 | 简洁 / 但跟 [openrouter.ai](https://openrouter.ai) 撞名（知名 LLM 路由 SaaS）| ❌ |
| `peach-router` | 老桃仙品牌延续 | 跟桃仙体系一致 / 但桃仙还在重塑中，不适合绑定 | ❌ |
| `taoxian-router` | 桃仙中文品牌 | 中文命名 / 海外用户难发音 | ❌ |
| **`@ohoooho/model-router` + CLI `omr`** | AI 提案 2026-08-10 | 通用 + 简洁 + 不撞名 + 3 字母 CLI 友好 | ✅ |

### 2.2 拍板时刻

2026-08-10 14:42 老板拍板：

> "就叫 OMR，对外叫 OMR，对内也是 OMR。CLI 名字 o m r，简短好敲。"

**注意**：包名是 `@ohoooho/model-router`（npm scope + 通用名），**CLI 别名是 `omr`**，不是 `model-router`。仓根目录就叫 `ohoooho-model-router`。

**为什么不让用户手动敲 `model-router`？** 因为太长了，10 字母。`omr` 3 字母 + tab 补全 + 跟 OpenAI / Anthropic 风格一致（`oai` / `ant` 是社区常用缩略）。

### 2.3 为什么 baozi 商业品牌保留

老板原话（2026-08-10 14:50）：

> "桃仙（dopple）的产品名是 baozi，这是商业面。OMR 是技术面，daemon / CLI / API 应该是 OMR 命名。两者不冲突。"

**区分事实**：
- **商业品牌**（用户看到的）：桃仙 / dopple / baozi → 营销文案 / 落地页 / 视频
- **技术品牌**（agent / CLI 看到的）：OMR → daemon / CLI / 配置文件 / 协议

OMR 仓代码里出现 baozi 是历史 lineage（如 `bz-ap` provider ID 早期叫法），新代码不允许。

---

## 3. 6 个 fork commit 的决策链

### 3.1 决策时间线

```
2026-08-10 14:56  老板拍板 ccr- → omr- key 前缀（commit 4749c5e）
2026-08-11 09:42  fork 元 commit：commit 4560c6c（CCR v3.0.18 → OMR 0.1.0）
2026-08-11 10:30  OMR-FORK-CHANGE-001 + 003：隐藏 provider（commit 99b049f）
2026-08-11 11:15  OMR-FORK-CHANGE-002：ccr-* → omr-* 内部命名（commit 262981e）
2026-08-11 15:24  OMR-FORK-CHANGE-（deccr）：配置目录迁移 + 双读 header（commit 96a21a8）⭐
2026-08-11 16:31  OMR-FORK-CHANGE-004：4 策略架构（commit 300d3f4）⭐
2026-08-11 16:54  OMR-FORK-CHANGE-004b：effective_weight 公式（commit 6f6bd56）⭐
2026-08-12 09:41  OMR-FORK-CHANGE-005：完整 env 名清理（commit 97fe211）⭐
2026-08-12 10:15  OMR-FORK-CHANGE-005b：9 处 codex spawn 补漏（commit acf6a6d）
2026-08-12 10:16  OMR-FORK-CHANGE-005c：4 处 codex 补漏（commit 1906ed3）
```

⭐ 标记的是 patches/ 里的 6 个独立 patch（001-005b-005c），非 ⭐ 的 4 个 commit 已经合并到上游 / 历史 README / 已经被 005 系列覆盖。

### 3.2 决策依赖

```
96a21a8 (deccr 配置目录迁移)
   └─ 必在 005 之前：005 改了 env 名，如果 96a21a8 没改配置文件路径，005 写到 ~/.claude-code-router/ 的代码会绕过 96a21a8 的迁移
300d3f4 (multi-credential 4 策略)
   └─ 必在 004b 之前：004b 是 004 的算法重写
6f6bd56 (effective_weight 公式)
   └─ 必在 005 之后：005 改了 credential env 名，effective_weight 函数访问 credential 的字段没改
97fe211 (env 名清理)
   └─ 必在 005b / 005c 之前：005b / 005c 是 005 的 grep 补漏
acf6a6d (005b 补漏)
   └─ 必在 005c 之前：005c 是 005b 的 grep 补漏
1906ed3 (005c 补漏)
   └─ 终点：005c 之后 grep 确认 0 残留
```

**应用顺序是关键**：`001 → 002 → 003 → 004 → 005b → 005c`（patches/ 命名）。**不能乱序**，否则会出现：
- 005 在 004b 之前：auto-balance 算法的 credential 字段名错
- 005b 在 005 之前：旧 spawn env 名还在，005 改不到

详见 `patches/README.md`。

---

## 4. 被否方案记录

### 4.1 ❌ 改 dopple `cmd/omr/` 放 OMR 脚本

**首次提议**（2026-08-12 09:50 AI 提议）：把 OMR ops 脚本放进 `dopple/cmd/omr/`。

**用户否决原话**：

> "dopple 是产品仓，不是工具仓。OMR 工具脚本不应该跟桃仙产品代码混在一个仓。"

**正确做法**：OMR 工具脚本放 OMR 仓 `cmd/`（omr-health.sh / omr-rebuild.sh / omr-verify.sh），dopple 仓只放集成入口（`dopple/integrations/omr.md`）和 install.sh 调用点。

**教训**：**工具归属仓 = 工具所在的 GitHub repo**。脚本是 OMR daemon 的姊妹工具，归 OMR 仓；dopple 仓只声明"我如何用 OMR"。

### 4.2 ❌ 放 OMR 仓 `bin/` 目录

**首次提议**（2026-08-12 10:05 AI 提议）：建 `bin/omr-health.sh` / `bin/omr-rebuild.sh` / `bin/omr-verify.sh`。

**用户骂原话**：

> "bin 目录不是编译后的可执行文件吗？你专不专业啊"

**正确做法**：放 `cmd/`（command 缩写，Go 风格 / Node 风格 / Python 风格都如此）。`bin/` 留给 `npm pack` 后的实际 exec wrapper（已经由 `package.json` 的 `bin` 字段管）。

**教训**：**bin/ 是 build artifact 目录**，cmd/ 是 source 目录。**不要把 source 脚本放 bin/**。

### 4.3 ❌ 在 dopple 仓 `PROPOSALS/` 下留 fork 计划

**首次提议**（2026-08-06 23:10 老板写过 `PROPOSALS/fork-ccr-router.md`）。

**问题**：fork 已经完成 6 个 commit，PROPOSALS 阶段的"5 个前置问题"早就答完。**留着这个文件是历史档案**，但不是决策依据。

**正确做法**（Phase 4 完成）：把 `PROPOSALS/fork-ccr-router.md` 的核心决策整合到 OMR 仓 `docs/DECISIONS.md`，删 dopple 仓独立文件。历史决策在新仓里"活着"。

### 4.4 ❌ `open-router` 命名

见 §2.1 表。撞 openrouter.ai 风险（已存在的第三方 LLM 路由 SaaS）。

### 4.5 ❌ `priority + spillover` 旧 auto-balance 算法

**OMR-FORK-CHANGE-004 旧版**（commit 300d3f4 早期版本）：`priority` 升序 + spillover threshold（如果 top key 已用 80% 才切下一个）。

**老板否决**（2026-08-11 16:47）：

> "spillover threshold 这玩意儿用户搞不清楚，80% 到底是 80% 什么？切换？ spillover？ priority？用户得研究 5 分钟才知道。"

**新方案 B（拍板）**：effective_weight = `weight × (1 - utilization)`，按 DESC 排序。直觉：权重高且剩余容量多的优先。

**对比**：
```
旧：position 1 key utilization 85% → 切 position 2（虽然 position 2 权重比 1 只有 1/5）
新：position 1 (weight=5, util=85%) → effective_weight = 5 × 0.15 = 0.75
    position 2 (weight=1, util=0%)  → effective_weight = 1 × 1.0  = 1.0
    → position 2 赢（虽然位置在后面，但有效权重更高）
```

**教训**：**算法的可解释性 > 算法的性能**。性能差异在毫秒级，可解释性差异是 5 分钟 vs 0 秒。

---

## 5. 故意保留的 CCR 引用

OMR 仓是 CCR v3.0.18 的 fork，**保留 100% CCR 行为**。CCR 引用在以下场景**故意保留**：

| 场景 | 例子 | 为什么保留 |
|------|------|-----------|
| HTTP 协议头 | `x-ccr-*` 系列 | dual-read 兼容：老客户端可能发 `x-ccr-*` header，OMR 兜底接收 |
| 环境变量 | `CCR_*` 系列（spawn env / web token） | dual-read 兼容：老 daemon 启动脚本可能 export `CCR_*` |
| 文件路径 | `~/.claude-code-router/` 老目录 | 迁移函数 `migrateLegacyConfigDir()` 把老目录自动迁移到新目录 |
| npm bin alias | `ccr` | 老用户 `ccr --version` 仍然工作 |
| Deep link | `ccr://` | 老 Web UI 跳转 |
| 包名 | `@ohoooho/model-router` | npm 命名空间（公司域名 + 通用名） |
| Import 路径 | `@ccr/core/*` | esbuild alias，build tool 内部使用 |

**为什么不全部改？** 因为改这些会让:
- 老 CCR 客户端连接 OMR 失败
- 老用户脚本 `export CCR_xxx` 失效
- 老 `.claude-code-router/config.sqlite` 数据丢失
- 老 `ccr` 命令 cron 报错

**OMR 的定位是"CCR 友好的增强版"，不是"完全替换"**。这一原则写进了 dual-read 兼容代码（`packages/core/src/profiles/service.ts` 等 30+ 处）。

---

## 6. 教训汇总

| # | 教训 | 适用场景 |
|---|------|----------|
| 1 | 工具归属仓 = 工具所在的 GitHub repo | 多仓项目的脚本归属 |
| 2 | bin/ 是 build artifact 目录，cmd/ 是 source 目录 | Node.js / Go / Python 项目 |
| 3 | 算法的可解释性 > 性能 | 路由 / 调度 / 限流算法 |
| 4 | fork 策略 = "不重写，只叠加" | 上游选型时 |
| 5 | dual-read 兼容保留期 ≥ 6 个月 | breaking change 升级 |
| 6 | 商业品牌 vs 技术品牌分离 | 多品牌共存的项目 |
| 7 | Phase 5 不要中途 yield（CLI 编译可能试 2-3 次） | sub-agent 任务拆分 |
| 8 | docs/ 错位产物要 archive 而不是删 | 长时间未整理的项目 |
| 9 | 决策日志放在仓 docs/ 而不是 PROPOSALS/ | 跨仓决策时 |
| 10 | 失败方案必须记录（带用户原话）| 避免重复踩坑 |

---

## 7. 重新评估 OMR 命名 / 命名变更

如果未来要改 OMR 命名（比如 OMR → OMRX 2.0），参考以下 6 步：

1. **新名字 capture**：用户拍板时刻 + 老板原话记录
2. **保留期协商**：老名 `omr` 的 dual-read 兼容保留 ≥ 6 个月
3. **package 别名**：npm publish 时 deprecate 老名，加老名 alias 指向新名
4. **CLI 软切换**：`omr --compat-old` flag 启用老行为
5. **Web UI 桥接**：URL 路径 `/omr-x/*` 301 redirect 到 `/omr/*`
6. **文档归档**：老名文档移入 `docs-archive/`，新文档从空白开始

---

## 8. 决策变更流程

OMR 仓的核心决策变更需要老板拍板 + 文档同步：

```
1. 提议（issue / slack / 飞书）：发起人 + 上下文 + 候选方案
2. 老板拍板（YES / NO / 改方案）：写拍板原话
3. 实施：commit 改源码 + commit 改 docs/ + commit 改 CHANGELOG.md
4. 同步：dopple 仓跟改（如果有集成点）
5. 验证：docker test + 种子用户
```

**严禁**：
- 跳过老板拍板直接 commit（即使你是 maintainer）
- 改 docs/ 不改源码（文档与代码不一致）
- 改源码不写 CHANGELOG（丢失历史）
- 一个人 cover 三个角色（提议 + 拍板 + 实施）

---

## 9. 关联文档

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — 8 节架构总览
- [`HEADERS.md`](./HEADERS.md) — HTTP 协议头体系
- [`ROUTING.md`](./ROUTING.md) — 4 策略 + effective_weight 公式
- [`CHANGELOG.md`](./CHANGELOG.md) — commit 时间线
- [`PATCHES.md`](./PATCHES.md) — 6 个 patch 索引
- `dopple/integrations/omr.md` — 桃仙侧集成入口
- `dopple/OMR-FORK-PATCHES.md` — 老 patch 文档（dopple 仓历史）

---

## 10. 元数据

- 创建时间：2026-08-12 13:25 GMT+8
- 创建者：CC（Claude Code subagent）
- 整合来源：`dopple/PROPOSALS/fork-ccr-router.md`（已删，原 80 行）
- 关联 commit：96a21a8 / 300d3f4 / 6f6bd56 / 97fe211 / acf6a6d / 1906ed3
- 下次回顾：2026-12 (4 个月，cherry-pick 上游 v3.1.x 时)
