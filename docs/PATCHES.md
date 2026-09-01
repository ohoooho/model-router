# PATCHES.md - OMR Fork Patch 索引

> 这个文档解决什么问题？
> OMR 仓的 `patches/` 目录有 6 个 `.patch` 文件，对应 6 个 fork commit。**这个文档是每个 patch 的索引**--change-id、commit hash、改了什么、为什么、冲突风险、应用顺序。
>
> 读的人：升级 OMR 的人 / cherry-pick 上游 fix 的人 / 审计 fork 改动的人。
>
> 关联：[`CHANGELOG.md`](./CHANGELOG.md)（commit 时间线）/ [`DECISIONS.md`](./DECISIONS.md)（决策日志）。

---

## 1. 应用顺序（必须按编号）

| # | 补丁文件 | commit | change-id | 冲突风险 |
|---|---------|--------|-----------|----------|
| 001 | `001-omr-deccr-config-dir.patch` | `96a21a8` | deccr | **高**（74 文件，核心迁移） |
| 002 | `002-multi-credential-routing.patch` | `300d3f4` | 004 | 中（3 文件，新增路由） |
| 003 | `003-auto-balance-formula.patch` | `6f6bd56` | 004b | 低（2 文件，算法重写） |
| 004 | `004-deccr-spawn-env.patch` | `97fe211` | 005 | **高**（17 文件，env 名清理） |
| 005b | `005b-deccr-codex-spawn.patch` | `acf6a6d` | 005b | 低（1 文件，补漏） |
| 005c | `005c-deccr-read-path.patch` | `1906ed3` | 005c | 低（2 文件，补漏） |

**应用顺序是关键**：001 -> 002 -> 003 -> 004 -> 005b -> 005c。不能乱序。

---

## 2. 依赖关系

```
001 (deccr 配置目录迁移)
  └─ 必在 004 之前：004 改 env 名，如果 001 没改配置路径，004 写到老路径

002 (multi-credential 4 策略)
  └─ 必在 003 之前：003 是 002 的算法重写

003 (effective_weight 公式)
  └─ 必在 004 之后：004 改 credential env 名

004 (env 名清理)
  └─ 必在 005b / 005c 之前：005b / 005c 是 004 的 grep 补漏

005b (9 处 codex spawn 补漏)
  └─ 必在 005c 之前：005c 是 005b 的 grep 补漏

005c (4 处 codex 补漏)
  └─ 终点：之后 grep 确认 0 残留
```

---

## 3. 各 Patch 详情

### 001 - omr-deccr-config-dir

- **commit**: `96a21a80da7d86f50762d697e06f59bd7d053b50`
- **change-id**: OMR-FORK-CHANGE（deccr）
- **改动**: 74 文件 / 净 2797 行
- **核心内容**:
  - 配置目录 `~/.claude-code-router` -> `~/.omr`（含幂等迁移函数）
  - 读方向双兼容：`x-omr-*` 优先，`x-ccr-*` 兜底
  - 写方向 client/profile headers 改为 `x-omr-*`
  - CLI 默认命令 `ccr` -> `omr`（保留 ccr alias）
  - 内部标识符 `ccr-*` -> `omr-*`
  - 默认 provider ID -> `omr`
  - README 中英文重写
  - patches/ 目录首次建立（含旧 7 个 patch 文件）
- **冲突风险**: **高**。改了 74 个文件，包括核心的 `profiles/service.ts`（800+ 行）、`management-server.ts`、`app-paths.ts` 等。如果上游大改这些文件，补丁几乎必定冲突。
- **冲突处理**: 手动重新实现。对照本文件的「核心内容」清单逐个核对，不要硬 `git apply`。

### 002 - multi-credential-routing

- **commit**: `300d3f468c92a91d3fbebe78c0a866c76b17c893`
- **change-id**: OMR-FORK-CHANGE-004
- **改动**: 3 文件 / 净 533 行
- **核心内容**:
  - `packages/core/src/contracts/app.ts` - 加 `CredentialRoutingStrategy` 类型 + `strategy` 字段
  - `packages/core/src/gateway/upstream/executor.ts` - 4 策略排序逻辑
  - `packages/core/test/routing-strategies.test.ts` - 12 个测试用例
- **冲突风险**: 中。`executor.ts` 是核心路由文件，如果上游重构路由架构，补丁会冲突。
- **冲突处理**: 如果上游重构了 executor，**手动重新实现 4 策略**（auto-balance / waterfall / priority / manual），不改上游的请求转发逻辑。

### 003 - auto-balance-formula

- **commit**: `6f6bd56b1aedec163ac33f38c9269c1d3854f7d5`
- **change-id**: OMR-FORK-CHANGE-004b
- **改动**: 2 文件 / 净 29 行
- **核心内容**:
  - `packages/core/src/gateway/upstream/executor.ts` - 删除 `providerCredentialSpilloverThreshold` 死代码，加 `effective_weight = weight × (1 - utilization)` 排序
  - `packages/core/test/routing-strategies.test.ts` - 加 weight 区分测试
- **冲突风险**: 低。只改了 2 个文件，且是 002 的增量补丁。
- **冲突处理**: 如果 002 已成功应用，003 几乎不会冲突。

### 004 - deccr-spawn-env

- **commit**: `97fe2113acf614a2469edfbd5649d2139009f024`
- **change-id**: OMR-FORK-CHANGE-005
- **改动**: 17 文件 / 净 212 行
- **核心内容**:
  - 写路径 `CCR_` -> `OMR_`（30+ env 变量）
  - 读路径 dual-read（`OMR_` 优先 + `CCR_` 兜底）
  - 配置目录迁移 `~/.claude-code-router` -> `~/.omr`（含迁移函数）
  - key id 兼容 `local-gateway` / `key-1`
- **改动文件**:
  - `packages/core/src/agents/claude-code/environment.ts`
  - `packages/core/src/agents/codex/app-launch.ts`
  - `packages/core/src/agents/codex/cli-middleware-runtime.ts`
  - `packages/core/src/agents/codex/media-preview-bridge.ts`
  - `packages/core/src/gateway/core-runtime/config-compiler.ts`
  - `packages/core/src/gateway/core-runtime/supervisor.ts`
  - `packages/core/src/gateway/internal/shared.ts`
  - `packages/core/src/mcp/fusion-config.ts`
  - `packages/core/src/mcp/fusion-vision-mcp.ts`
  - `packages/core/src/mcp/grok-media-config.ts`
  - `packages/core/src/mcp/media-tools-proxy-mcp.ts`
  - `packages/core/src/observability/raw-trace-sync.ts`
  - `packages/core/src/plugins/marketplace.ts`
  - `packages/core/src/profiles/launch-core.ts`
  - `packages/core/src/profiles/launch-service.ts`
  - `packages/core/src/profiles/service.ts`
  - `packages/core/src/web/management-server.ts`
- **冲突风险**: **高**。改了 17 个文件，包括 `profiles/service.ts`（最大文件）。如果上游改了 spawn env 逻辑，补丁会冲突。
- **冲突处理**: 如果 001 已应用，004 的迁移函数部分可以跳过。env 名清理部分手动核对。
- **保留**: HTTP 写方向协议头 / bin alias / Deep link / npm 包名 / Import 路径

### 005b - deccr-codex-spawn

- **commit**: `acf6a6d592423e80d88663618e3ba45c77ce7b70`
- **change-id**: OMR-FORK-CHANGE-005b
- **改动**: 1 文件 / 12 行
- **核心内容**:
  - `packages/core/src/agents/codex/app-launch.ts` - 9 处 `CCR_ZCODE_*` / `CCR_CODEX_*` -> `OMR_`
- **冲突风险**: 低。只改了 1 个文件 12 行。
- **冲突处理**: 如果 004 已应用，005b 几乎不会冲突。如果冲突，手动改 `app-launch.ts` 里的 `CCR_` -> `OMR_`。

### 005c - deccr-read-path

- **commit**: `1906ed380d5792317cd5017f60b9fd01a917bb5b`
- **change-id**: OMR-FORK-CHANGE-005c
- **改动**: 2 文件 / 7 行
- **核心内容**:
  - `packages/core/src/agents/codex/app-launch.ts` - 2 处写路径 `CCR_BUNDLED_CODEX_CLI_PATH` / `CCR_REAL_CODEX_CLI_PATH` -> `OMR_`
  - `packages/core/src/agents/codex/cli-middleware-runtime.ts` - 4 处读路径改 dual-read（`OMR_` 优先 + `CCR_` 兜底）
- **冲突风险**: 低。只改了 2 个文件 7 行。
- **冲突处理**: 如果 005b 已应用，005c 几乎不会冲突。

---

## 4. 应用命令

```bash
cd /root/ohoooho-model-router
git checkout upstream/main -b upgrade/v4.x

for p in patches/0*.patch; do
  echo "=== 应用 $p ==="
  git apply --check "$p" && git apply "$p" || echo "⚠️ $p 冲突，需手动处理"
done
```

---

## 5. 冲突处理策略

### 5.1 高冲突补丁（001 / 004）

**不要硬 `git apply`**。改为手动重新实现：

1. 打开对应源文件看改动点
2. 查本文件的「核心内容」清单
3. 逐个核对并手动修改
4. `git add + git commit`

**为什么**：补丁的语义比补丁的文本重要。如果上游大改了 `profiles/service.ts`，硬 apply 会产生大量假冲突，手动实现更稳。

### 5.2 中冲突补丁（002）

如果上游重构了路由架构：
- **跳过 002**，标记「上游已重构」
- 手动在新架构上实现 4 策略（auto-balance / waterfall / priority / manual）
- 重新写测试

### 5.3 低冲突补丁（003 / 005b / 005c）

直接 `git apply`。如果冲突，手动改对应的 `CCR_` -> `OMR_`。

---

## 6. 升级后验证

```bash
# 1. 编译
npm run build:assets

# 2. 启动 OMR
node packages/cli/dist/main/cli.js serve --daemon-child --no-open &

# 3. 验证 /v1/models 无 provider 前缀
curl -H "Authorization: Bearer <key>" http://127.0.0.1:3456/v1/models

# 4. 验证 chat 路由
curl -X POST http://127.0.0.1:3456/v1/messages \
  -H "x-api-key: <key>" -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","max_tokens":15,"messages":[{"role":"user","content":"hi"}]}'

# 5. 验证 omr health（OMR-FORK-CHANGE-007）
node packages/cli/dist/main/cli.js health

# 6. grep 确认无 CCR_ 写路径残留
grep -rn "CCR_" packages/core/src/ --include="*.ts" | grep -v "dual-read\|兼容\|fallback\|legacy" | head -20
```

---

## 7. 旧补丁归档

以下 7 个补丁是 OMR fork 早期产物（commit 96a21a8 之前的 fork commit），已归档到 `patches-archive/`：

| 旧文件 | 对应 commit | 说明 |
|--------|------------|------|
| `001-readme-fork.md.patch` | `f0eea49` | README fork 来源声明 |
| `002-readme-omr-brand.patch` | `8988dca` | README OMR 品牌化 |
| `003-publish-omr-script.patch` | `c75506a` | 发布脚本 |
| `004-docker-omr-brand.patch` | `98b896c` | docker OMR 化 |
| `005-api-key-prefix.patch` | `4749c5e` | API key 前缀 |
| `006-hide-provider.patch` | `99b049f` | 隐藏 Provider |
| `007-internal-rename.patch` | `262981e` | 内部命名清理 |

这些补丁已经被 001（deccr 配置目录迁移）覆盖或合并，**不需要单独应用**。保留在 `patches-archive/` 作为历史记录。

---

## 8. 关联文档

- [`CHANGELOG.md`](./CHANGELOG.md) - commit 时间线
- [`DECISIONS.md`](./DECISIONS.md) - 决策日志（§3 决策依赖）
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - 架构总览
- [`HEADERS.md`](./HEADERS.md) - 协议头体系（dual-read 详情）
- [`ROUTING.md`](./ROUTING.md) - 路由策略（4 策略 + effective_weight）

---

## 9. 元数据

- 创建时间：2026-08-12 13:50 GMT+8
- 创建者：CC（Claude Code subagent）
- 数据来源：`git log --stat` + commit message
- 下次更新：每次新增 fork commit 后
