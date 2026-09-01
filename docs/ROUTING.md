# ROUTING.md - OMR 路由策略与 effective_weight 公式

> 这个文档解决什么问题？
> OMR 有 4 种路由策略和 1 个 effective_weight 公式。**这个文档解释每种策略的行为、适用场景、配置方法**，让调路由的工程师能正确选择策略。
>
> 读的人：调路由的工程师 / 配置多 key 池化的人 / 评估 OMR 路由能力的人。
>
> 关联：[`ARCHITECTURE.md`](./ARCHITECTURE.md)（Layer 5 Routing）/ [`HEADERS.md`](./HEADERS.md)（协议头）/ [`DECISIONS.md`](./DECISIONS.md)（§4.5 被否方案）。

---

## 1. 路由总览

OMR 的路由分 2 层：

```
Layer 1: Model Routing（模型路由）
  agent 请求 model = "MiniMax-M3"
  ↓ 查 virtualModelProfile 匹配
  ↓ 得到 routed model = "mm-ap/MiniMax-M3"（provider/model）
  ↓
Layer 2: Credential Routing（凭据路由）
  provider = "mm-ap" 有 N 个 credential（key）
  ↓ 按 strategy 排序
  ↓ 得到 ordered credential list
  ↓ 依次尝试（第一个失败用下一个）
```

**关键文件**：`packages/core/src/gateway/upstream/executor.ts`

---

## 2. 4 种路由策略

### 2.1 `auto-balance`（默认）

**行为**：按 `effective_weight = weight × (1 - utilization)` DESC 排序。剩余容量多的优先，平滑用满所有 key。

**适用场景**：多 key 池化，希望所有 key 均匀使用，避免单 key 被打爆。

**示例**：
```
credential A: weight=5, utilization=0.5 -> effective_weight = 5 × 0.5 = 2.5
credential B: weight=1, utilization=0.0 -> effective_weight = 1 × 1.0 = 1.0
credential C: weight=3, utilization=0.8 -> effective_weight = 3 × 0.2 = 0.6

排序结果: A (2.5) > B (1.0) > C (0.6)
```

**直觉**：权重高且剩余容量多的优先。weight=5 的 key 即使已用 50%，有效权重仍然比 weight=1 的全新 key 高。

**配置**：
```json
{
  "virtualModelProfiles": [{
    "key": "minimax-m3",
    "match": { "exactAliases": ["MiniMax-M3"] },
    "baseModel": { "mode": "fixed", "fixedModel": "MiniMax-M3" },
    "strategy": "auto-balance"
  }]
}
```

### 2.2 `waterfall`

**行为**：按 `priority` ASC 排序；同优先级内 `utilization` DESC（用得多的继续用，榨干再换）。

**适用场景**：有主备 key，希望先用主 key 用完再切备 key。

**示例**：
```
credential A: priority=1, utilization=0.9
credential B: priority=1, utilization=0.3
credential C: priority=2, utilization=0.0

排序结果: A (pri=1, util=0.9) > B (pri=1, util=0.3) > C (pri=2, util=0.0)
```

**直觉**：先把 priority=1 的 key A 用到 100%（触发 blocked），再切 key B，全部用完才切 priority=2 的 key C。

**配置**：
```json
{
  "strategy": "waterfall",
  "credentials": [
    { "id": "A", "priority": 1 },
    { "id": "B", "priority": 1 },
    { "id": "C", "priority": 2 }
  ]
}
```

### 2.3 `priority`

**行为**：严格按 `priority` ASC 排序，第一个没 cooldown 就用，A 挂了（cooldown/blocked）才换 B。

**适用场景**：有明确优先级的 key（如付费 key 优先，免费 key 兜底）。

**示例**：
```
credential A: priority=1, status=active
credential B: priority=2, status=active
credential C: priority=3, status=active

-> 总是用 A。A 挂了（cooldown）才用 B。B 挂了才用 C。
```

**与 waterfall 的区别**：
- `waterfall`：同优先级内 utilization DESC（用得多的继续用）
- `priority`：同优先级内不排序（第一个能用就用）

**配置**：
```json
{
  "strategy": "priority",
  "credentials": [
    { "id": "paid-key", "priority": 1 },
    { "id": "free-key-1", "priority": 2 },
    { "id": "free-key-2", "priority": 3 }
  ]
}
```

### 2.4 `manual`

**行为**：不排序，原序返回，由调用方决定用哪个。

**适用场景**：调用方有自己的路由逻辑（如自定义 round-robin）。

**配置**：
```json
{
  "strategy": "manual"
}
```

---

## 3. effective_weight 公式（OMR-FORK-CHANGE-004b）

### 3.1 公式

```
effective_weight = weight × (1 - utilization)
```

- `weight`：credential 的权重（用户配置，默认 1）
- `utilization`：credential 的当前利用率（0.0 - 1.0）

### 3.2 排序

按 `effective_weight` DESC 排序。effective_weight 高的优先。

### 3.3 拍板历史

**2026-08-11 16:47 老板拍板**：

> "按 (weight × (1-utilization)) DESC 排序（方案 B），比之前的 'priority + spillover' 更直觉。"

**被否方案**（方案 A）：`priority + spillover threshold`
- 旧逻辑：priority 升序 + spillover threshold（top key 已用 80% 才切下一个）
- 否决理由：用户搞不清楚 80% 是什么意思，spillover / priority / threshold 概念太复杂

### 3.4 实现代码

```typescript
// packages/core/src/gateway/upstream/executor.ts

// auto-balance (默认): 按 effective_weight = weight × (1 - utilization) DESC 排序
function autoBalanceSort<T extends { weight: number; utilization: number; priority: number }>(
  candidates: T[]
): T[] {
  return [...candidates].sort((left, right) => {
    const leftEW = left.weight * (1 - left.utilization);
    const rightEW = right.weight * (1 - right.utilization);
    return rightEW - leftEW;
  });
}
```

### 3.5 测试用例

```
Test case: weight=5 util=0.5 vs weight=1 util=0
  A: effective_weight = 5 × 0.5 = 2.5
  B: effective_weight = 1 × 1.0 = 1.0
  -> A 赢（虽然 A 已用 50%，但权重高仍然优先）

Test case: weight=5 util=0.9 vs weight=1 util=0
  A: effective_weight = 5 × 0.1 = 0.5
  B: effective_weight = 1 × 1.0 = 1.0
  -> B 赢（A 已用 90%，有效权重低于全新 B）

Test case: weight=1 util=0.5 vs weight=1 util=0.5
  A: effective_weight = 1 × 0.5 = 0.5
  B: effective_weight = 1 × 0.5 = 0.5
  -> 平局，保持原序
```

测试文件：`packages/core/test/routing-strategies.test.ts`（13/13 PASS）

---

## 4. 策略配置

### 4.1 全局策略

在 `virtualModelProfile.strategy` 上配置：

```json
{
  "virtualModelProfiles": [{
    "key": "minimax-m3",
    "match": { "exactAliases": ["MiniMax-M3"] },
    "baseModel": { "mode": "fixed", "fixedModel": "MiniMax-M3" },
    "strategy": "auto-balance"
  }]
}
```

### 4.2 Per-credential 策略覆盖

```json
{
  "credentials": [
    {
      "id": "cred-A",
      "weight": 5,
      "priority": 1,
      "strategy": "auto-balance"
    },
    {
      "id": "cred-B",
      "weight": 1,
      "priority": 2,
      "strategy": "waterfall"
    }
  ]
}
```

**注意**：per-credential strategy 覆盖 virtualModelProfile.strategy。

### 4.3 策略解析优先级

```
1. credential.strategy（per-credential 覆盖）
2. virtualModelProfile.strategy（全局策略）
3. "auto-balance"（默认）
```

实现代码（`executor.ts`）：
```typescript
function resolveRoutingStrategy(
  config: AppConfig,
  routedModel: { provider: string; model: string }
): CredentialRoutingStrategy {
  const model = findVirtualModelProfile(config, routedModel);
  if (!model) return "auto-balance";
  const normalized = normalizeModelMatch(model);
  if (!normalized) return "auto-balance";
  // 匹配 exactAliases / prefixes / suffixes
  for (const profile of normalized) {
    if (matches(profile, routedModel.model)) {
      return profile.strategy ?? "auto-balance";
    }
  }
  return "auto-balance";
}
```

---

## 5. Multi-credential 链路

### 5.1 完整流程

```
1. agent POST /v1/messages { model: "MiniMax-M3" }
   ↓
2. Gateway 解析 model -> 查 virtualModelProfile
   ↓ match "MiniMax-M3" -> routed model "mm-ap/MiniMax-M3"
3. Executor 拿 provider "mm-ap" 的 credential list
   ↓ resolveRoutingStrategy -> "auto-balance"
4. autoBalanceSort(credentials)
   ↓ 按 effective_weight DESC 排序
5. 尝试 credential[0]
   ↓ 如果 429 (rate limit) -> 标记 cooldown -> 尝试 credential[1]
   ↓ 如果 401 (auth fail) -> 标记 blocked -> 尝试 credential[1]
   ↓ 如果 500 (server error) -> 重试 1 次 -> 尝试 credential[1]
6. 成功 -> 返回 response 给 agent
   ↓ 失败 -> 所有 credential 都失败 -> 返回 502 给 agent
```

### 5.2 Cooldown 机制

当一个 credential 返回 429（rate limit）时：
1. 标记 credential 为 `cooldown` 状态
2. 设置 `cooldownUntil` = 当前时间 + retry-after（或默认 60s）
3. 后续请求跳过 cooldown 中的 credential
4. cooldown 到期后自动恢复

### 5.3 Blocked 机制

当一个 credential 返回 401（auth fail）时：
1. 标记 credential 为 `blocked` 状态
2. 后续请求跳过 blocked 的 credential
3. blocked 不会自动恢复（需要用户在 Web UI 手动恢复）

---

## 6. Credential 属性

| 属性 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `id` | string | 必填 | 唯一 ID |
| `api_key` | string | 必填 | API key（不 echo） |
| `enabled` | boolean | true | 是否启用 |
| `weight` | number | 1 | auto-balance 权重 |
| `priority` | number | 1 | waterfall/priority 优先级 |
| `utilization` | number | 0 | 当前利用率（0.0-1.0，自动计算） |
| `cooldown` | boolean | false | 是否在 cooldown 中 |
| `cooldownUntil` | number | - | cooldown 到期时间戳 |
| `blocked` | boolean | false | 是否被 blocked |
| `label` | string | "" | 用户可读标签 |

---

## 7. 5 Provider 配置示例

桃仙 install.sh 默认配置 5 个 provider：

| Provider | 用途 | API | 模型 | 策略 |
|----------|------|-----|------|------|
| minimax-agent-plan | MiniMax agent | anthropic-messages | MiniMax-M3 | auto-balance |
| ark-agent-plan | 字节方舟 agent | openai-completions | claude-sonnet-4-5 等 | auto-balance |
| ark-coding-plan | 字节方舟 coding | openai-completions | deepseek 等 | auto-balance |
| ali-agent-plan | 阿里百炼 agent | openai-completions | qwen 等 | auto-balance |
| deepseek-plan | DeepSeek | openai-completions | deepseek-chat 等 | auto-balance |

**Fallback 链**（virtualModelProfile）：
```
minimax-agent-plan/MiniMax-M3 -> ark-agent-plan/claude-sonnet-4-5 -> ark-coding-plan/deepseek-coder
```

---

## 8. 调试路由

### 8.1 查看路由结果

```bash
# 查看所有模型
curl -H "Authorization: Bearer <key>" http://127.0.0.1:3456/v1/models | jq

# 发一个测试请求
curl -X POST http://127.0.0.1:3456/v1/messages \
  -H "x-api-key: <key>" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","max_tokens":15,"messages":[{"role":"user","content":"hi"}]}'
```

### 8.2 查看credential状态

```bash
# Web UI
open http://127.0.0.1:3458

# 或用 SQLite
sqlite3 ~/.omr/config.sqlite "SELECT value_json FROM app_config WHERE key='default'" | jq '.Providers[].credentials[] | {id, enabled, weight, priority}'
```

### 8.3 omr verify

```bash
omr verify
# 检查 5 provider 配置完整性 + key 完整性
```

---

## 9. 关联文档

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - 架构总览（Layer 5 Routing）
- [`HEADERS.md`](./HEADERS.md) - 协议头体系
- [`DECISIONS.md`](./DECISIONS.md) - §4.5 被否方案（priority + spillover）
- [`CHANGELOG.md`](./CHANGELOG.md) - commit 300d3f4 / 6f6bd56 详情
- [`PATCHES.md`](./PATCHES.md) - patch 002 / 003

---

## 10. 元数据

- 创建时间：2026-08-12 13:40 GMT+8
- 创建者：CC（Claude Code subagent）
- 关联 commit：300d3f4（4 策略架构）/ 6f6bd56（effective_weight 公式）
- 测试：13/13 PASS（routing-strategies.test.ts）
- 下次回顾：2026-12（cherry-pick 上游 v3.1.x 时评估策略扩展）
