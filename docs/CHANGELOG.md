# CHANGELOG.md - OMR 变更日志

> 这个文档解决什么问题？
> OMR 仓的 commit 历史跨两个阶段：上游 CCR v3.0.18（4560c6c 之前）和 OMR fork（4560c6c 之后）。**这个文档对 fork 后的 commit 做人工分类**，让读者快速找到"改了什么"和"为什么改"。
>
> 读的人：OMR 维护者 / 评估升级的人 / 查 bug 引入点的人。
>
> 关联：[`PATCHES.md`](./PATCHES.md)（patch 索引）/ [`DECISIONS.md`](./DECISIONS.md)（决策日志）。

---

## 分类说明

| 标签 | 含义 |
|------|------|
| `fork-change` | OMR fork 的核心变更（有 change-id） |
| `bug-fix` | fork 后发现的 bug 修复 |
| `docs` | 文档变更 |
| `chore` | 构建 / 配置 / 发布脚本 |
| `upstream` | 来自上游 CCR 的 commit（fork 基线之前） |

---

## Fork 后变更（OMR 专属）

### OMR-FORK-CHANGE-005c — 2026-08-12
- **commit**: `1906ed3`
- **类型**: bug-fix
- **标题**: 补漏 4 处 codex spawn env 残留
- **改动文件**:
  - `packages/core/src/agents/codex/app-launch.ts` — 2 处写路径 CCR_ -> OMR_
  - `packages/core/src/agents/codex/cli-middleware-runtime.ts` — 2 处读路径改 dual-read
- **原因**: 005b 之后 grep 又发现 4 处残留
- **影响**: 无行为变化（纯命名修复）

### OMR-FORK-CHANGE-005b — 2026-08-12
- **commit**: `acf6a6d`
- **类型**: bug-fix
- **标题**: 补漏 9 处 codex/zcode spawn env 残留
- **改动文件**:
  - `packages/core/src/agents/codex/app-launch.ts` — 12 行改动（9 处 CCR_ZCODE_* / CCR_CODEX_* -> OMR_）
- **原因**: commit 97fe211 后 grep 又发现 9 处残留
- **影响**: 无行为变化（纯命名修复）

### OMR-FORK-CHANGE-005 — 2026-08-12
- **commit**: `97fe211`
- **类型**: fork-change
- **标题**: 全面去 CCR 化（用户可见 env 名 + dual-read 兼容）
- **改动**: 17 个文件 / 净 212 行
- **核心**:
  - 写路径 CCR_ -> OMR_（30+ env 变量）
  - 读路径 dual-read（OMR_ 优先 + CCR_ 兜底）
  - 配置目录迁移 ~/.claude-code-router -> ~/.omr（含幂等迁移函数）
  - key id IN ('local-gateway', 'key-1') 兼容新老 db
- **保留**: HTTP 写方向协议头 / bin alias ccr / Deep link ccr:// / npm 包名 / Import 路径 @ccr/core
- **验证**: /v1/models 16 模型无前缀、chat 场景成功、omr-health state=ok

### OMR-FORK-CHANGE-004b — 2026-08-11
- **commit**: `6f6bd56`
- **类型**: fork-change
- **标题**: 重写 auto-balance 为 effective_weight 公式
- **改动**: 2 个文件 / 净 29 行
- **核心**:
  - 删除死代码 providerCredentialSpilloverThreshold
  - 新公式: effective_weight = weight × (1 - utilization)
  - 加测试 case 验证 weight 区分
- **原因**: 老板拍板方案 B，比 "priority + spillover" 更直觉
- **测试**: 13/13 PASS

### OMR-FORK-CHANGE-004 — 2026-08-11
- **commit**: `300d3f4`
- **类型**: fork-change
- **标题**: multi-credential routing strategies
- **改动**: 3 个文件 / 净 533 行
- **核心**:
  - 4 策略架构: auto-balance / waterfall / priority / manual
  - 策略绑在 virtualModelProfile.strategy 上
  - per-credential 策略覆盖
  - 完整测试套件（12 test cases）
- **测试**: 12/12 PASS

### OMR-FORK-CHANGE（deccr） — 2026-08-11
- **commit**: `96a21a8`
- **类型**: fork-change
- **标题**: 全面去 CCR 化 - 配置目录迁移 + 双读 header + 品牌清理
- **改动**: 74 个文件 / 净 2797 行（含 patches/ 8 个文件）
- **核心**:
  - 配置目录 ~/.claude-code-router -> ~/.omr（含幂等迁移函数）
  - 读方向双兼容: x-omr-* 优先，x-ccr-* 兜底
  - 写方向 client/profile headers 改为 x-omr-*
  - CLI 默认命令 ccr -> omr（保留 ccr alias）
  - 内部标识符 ccr-* -> omr-*
  - 默认 provider ID -> omr
  - README 中英文重写
- **保留**: HTTP 写方向协议头 / bin alias / Deep link / npm 包名 / Import 路径

### OMR-FORK-CHANGE-002 — 2026-08-11
- **commit**: `262981e`
- **类型**: fork-change
- **标题**: ccr-* -> omr-* 内部命名清理
- **改动**: 10 个文件 / 16 处
- **核心**: 内部标识符 ccr-* -> omr-*（非用户可见）

### OMR-FORK-CHANGE-001 + 003 — 2026-08-11
- **commit**: `99b049f`
- **类型**: fork-change
- **标题**: 隐藏 Provider
- **改动**: model-discovery.ts 核心逻辑
- **核心**: /v1/models 端点不再暴露 provider 前缀

### API key 前缀 — 2026-08-10
- **commit**: `4749c5e`
- **类型**: fork-change
- **标题**: 全部 API key 前缀 ccr- -> omr-
- **原因**: 老板拍板 2026-08-10 14:56

---

## 构建 / 配置变更

### docker + scripts 品牌 OMR 化 — 2026-08-11
- **commit**: `98b896c`
- **类型**: chore

### 发布脚本 publish-omr.sh — 2026-08-11
- **commit**: `c75506a`
- **类型**: chore
- **内容**: 构建+打包+上传+验证一条命令

---

## 文档变更

### README 去品牌化 — 2026-08-11
- **commit**: `8988dca`
- **类型**: docs
- **内容**: 删除桃仙/Peach/分身/baozi 商业话术，改为纯开源技术项目文案

### README 重写为 OMR 产品文案 — 2026-08-11
- **commit**: `f0eea49`
- **类型**: docs
- **内容**: 删除上游赞助横幅/社区链接/赞助商列表/ccrdesk 文档引用

---

## Fork 基线

### fork claude-code-router v3.0.18 — 2026-08-11
- **commit**: `4560c6c`
- **类型**: fork
- **内容**: fork @musistudio/claude-code-router v3.0.18 -> @ohoooho/model-router (OMR)

---

## 上游 commit（fork 之前，仅列关键）

以下 commit 来自上游 `musistudio/claude-code-router`，OMR fork 基线是 `4560c6c`（即 fork 时的 HEAD）。

| commit | 类型 | 标题 |
|--------|------|------|
| `4a152d9` | upstream | feat: update ai-gateway version |
| `6a3509d` | upstream | Merge dev/3.1 into main for v3.0.18 |
| `3f566d9` | upstream | Preserve API keys across provider probes |
| `39a5712` | upstream | Prepare Claude App VM storage before launch |
| `43f99b2` | upstream | Use Token consistently in Chinese UI labels |
| `2bceead` | upstream | Merge pull request #1605 - fix/abort-retry-backoff |
| `7fcdeef` | upstream | fix(gateway): restore retry executor |
| `5467190` | upstream | fix(gateway): abort retry backoff on disconnect |
| `70d31ab` | upstream | fix(claude-code): never resolve a token from inside mcpOAuth |
| `3b99fa2` | upstream | Release v3.0.17 |

---

## OMR-FORK-CHANGE-007（规划中）

- **类型**: fork-change
- **标题**: CLI 子命令 health / rebuild / verify
- **内容**:
  - `omr health` — 端点检查 + daemon 状态 + SQLite 状态
  - `omr rebuild` — 重启 OMR daemon + 验证端口起来
  - `omr verify` — 检查 5 provider 配置完整性 + key 完整性
- **状态**: 本 Phase 5 实现

---

## 升级指南

从上游 CCR v3.0.x 升级到 OMR 1.0：

1. `git fetch origin && git checkout main`
2. 应用 patches/（见 `PATCHES.md`）
3. `npm run build:assets`
4. `omr stop && omr start`
5. 验证: `omr health`（OMR-FORK-CHANGE-007）
6. 老配置自动迁移: `~/.claude-code-router/` -> `~/.omr/`

---

## 关联文档

- [`PATCHES.md`](./PATCHES.md) — patch 索引
- [`DECISIONS.md`](./DECISIONS.md) — 决策日志
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — 架构总览
- [`HEADERS.md`](./HEADERS.md) — 协议头体系
- [`ROUTING.md`](./ROUTING.md) — 路由策略

---

## 元数据

- 创建时间：2026-08-12 13:45 GMT+8
- 创建者：CC（Claude Code subagent）
- 数据来源：`git log --oneline -50` + 人工分类
- 下次更新：每次 OMR 仓 commit 后
