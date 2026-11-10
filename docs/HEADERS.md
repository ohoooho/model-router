# HEADERS.md - OMR HTTP 协议头体系

> 这个文档解决什么问题？
> OMR 仓代码里同时存在 `x-ccr-*` 和 `x-omr-*` 两套 HTTP 协议头。**这个文档解释每一类 header 的用途、保留理由、dual-read 兼容策略**，让写 client 的人知道该发哪个 header。
>
> 读的人：写 OMR client 的人 / 调试 HTTP 请求的人 / 评估协议兼容性的人。
>
> 关联：[`ARCHITECTURE.md`](./ARCHITECTURE.md)（架构总览）/ [`ROUTING.md`](./ROUTING.md)（路由策略）。

---

## 1. 协议头总览

OMR 的 HTTP 协议头分 3 类：

| 类别 | 前缀 | 方向 | 保留理由 |
|------|------|------|----------|
| **OMR 新协议头** | `x-omr-*` | 读写双向 | OMR fork 新增的协议头，OMR 1.0+ 默认 |
| **CCR 兼容协议头** | `x-ccr-*` | 只读 | dual-read 兼容：老 CCR 客户端发的 header OMR 仍然接收 |
| **标准协议头** | `authorization` / `content-type` / 等 | 读写 | HTTP 标准，不归 OMR 管 |

---

## 2. `x-omr-*` 新协议头

### 2.1 `x-omr-web-auth`

**用途**：Web Management Server 的 RPC 认证 token。

**写入位置**：`packages/core/src/web/management-server.ts`
**读取位置**：同文件，验证 RPC 请求的 `x-omr-web-auth` header。

```http
POST /api/ccr/rpc HTTP/1.1
Host: 127.0.0.1:3458
Content-Type: application/json
x-omr-web-auth: <base64url-token>

{"method":"openProfile","args":[...]}
```

**为什么是 `x-omr-` 而不是 `x-ccr-`**：这是 OMR fork 新增的写方向 header（commit 96a21a8），不是 CCR 原有的。**新客户端发 `x-omr-web-auth`**，老客户端发 `ccr_web_token` query param（dual-read 兼容）。

### 2.2 `x-omr-*` spawn env（环境变量，不是 HTTP header）

**注意**：以下 `OMR_*` 环境变量是 spawn env（子进程环境变量），**不是 HTTP header**。但它们与协议头体系密切相关，放在一起说明。

| env 名 | 写入方向 | 用途 |
|--------|----------|------|
| `OMR_API_KEY` | 写 → spawn | agent 子进程的 API key |
| `OMR_API_BASE` | 写 → spawn | agent 子进程的 API base URL |
| `OMR_RUNTIME_PROFILE_ID` | 写 → spawn | 当前 profile ID |
| `OMR_PROFILE_SURFACE` | 写 → spawn | 当前 surface（cli / app） |
| `OMR_CONFIG_DIR` | 写 → spawn | 配置目录路径 |
| `OMR_GATEWAY_ENTRY` | 写 → spawn | gateway 入口 URL |
| `OMR_CORE_GATEWAY_AUTH_TOKEN` | 写 → spawn | gateway 认证 token |
| `OMR_CLAUDE_CODE_BIN` | 写 → spawn | claude-code binary 路径 |
| `OMR_CODEX_CLI_PATH` | 写 → spawn | codex CLI 路径 |
| `OMR_ZCODE_*` | 写 → spawn | zcode 相关路径 |
| `OMR_REMOTE_SYNC_*` | 写 → spawn | 远程同步配置 |
| `OMR_UPSTREAM_PROXY_URL` | 写 → spawn | 上游 proxy URL |
| `OMR_UNDICI_MODULE` | 写 → spawn | undici 模块路径 |
| `OMR_GATEWAY_RUNTIME_ID` | 写 → spawn | runtime ID |
| `OMR_BUNDLED_CODEX_CLI_PATH` | 写 → spawn | 内置 codex CLI 路径 |
| `OMR_REAL_CODEX_CLI_PATH` | 写 → spawn | 真实 codex CLI 路径 |
| `OMR_REAL_CLAUDE_CODE_BIN` | 写 → spawn | 真实 claude-code binary |
| `OMR_NODE_BIN` | 写 → spawn | node binary 路径 |
| `OMR_KIMI_SOURCE_HOME` | 写 → spawn | kimi 源码 home |
| `OMR_GROK_BIN` | 写 → spawn | grok binary |
| `OMR_KILO_BIN` | 写 → spawn | kilo binary |
| `OMR_PI_BIN` | 写 → spawn | pi binary |
| `OMR_SERVICE_INSTANCE_TOKEN` | 写 → spawn | service instance token |

**关键文件**：`packages/core/src/profiles/service.ts`（800+ 行，写方向的主逻辑）。

---

## 3. `x-ccr-*` 兼容协议头

### 3.1 为什么保留

**dual-read 兼容策略**：OMR 仓 = CCR v3.0.18 fork。CCR v3.0.x era 的客户端（老版本 Claude Code / Codex / ZCode）会发 `x-ccr-*` header。如果 OMR 不接收这些 header，**老客户端连接 OMR 会失败**。

**保留期**：≥ 6 个月（2026-08-11 老板拍板）。6 个月后评估是否删除。

### 3.2 `x-ccr-*` header 清单

以下 header 在 OMR 代码中**只读不写**（读方向保留 CCR 老名，写方向改为 OMR 新名）：

| header | 读位置 | 用途 |
|--------|--------|------|
| `x-ccr-profile-id` | profile 解析 | 老 CCR 客户端的 profile ID |
| `x-ccr-surface` | profile 解析 | 老 CCR 客户端的 surface |
| `x-ccr-gateway-runtime-id` | runtime | 老 CCR 客户端的 runtime ID |
| `x-ccr-core-gateway-auth-token` | gateway | 老 CCR 客户端的 gateway auth token |
| `x-ccr-gateway-entry` | gateway | 老 CCR 客户端的 gateway entry |
| `x-ccr-upstream-proxy-url` | proxy | 老 CCR 客户端的 proxy URL |
| `x-ccr-undici-module` | undici | 老 CCR 客户端的 undici 模块 |
| `x-ccr-service-instance-token` | service | 老 CCR 客户端的 service token |

### 3.3 dual-read 实现模式

OMR 的 dual-read 模式是 **OMR 优先 + CCR 兜底**：

```typescript
// 简化示意（实际代码在 packages/core/src/profiles/service.ts 等）
function readEnv(key: string): string | undefined {
  // OMR_ 优先
  const omrValue = process.env[`OMR_${key}`];
  if (omrValue) return omrValue;
  
  // CCR_ 兜底（dual-read 兼容）
  const ccrValue = process.env[`CCR_${key}`];
  return ccrValue;
}
```

**写方向**：**只写 OMR_**，不写 CCR_。新代码不允许写 `CCR_*`。

**读方向**：**OMR_ 优先**，找不到才读 `CCR_`。

### 3.4 `ccr_web_token` query param

**用途**：Web Management Server 的 URL 认证（老方式）。

**老方式**（CCR v3.0.x）：
```
http://127.0.0.1:3458/?ccr_web_token=<base64url-token>
```

**新方式**（OMR 1.0+）：
```
http://127.0.0.1:3458/?omr_web_token=<base64url-token>
```

**dual-read**：management-server.ts 同时认两种 query param。

### 3.5 `ccr` npm bin alias

**保留**：`package.json` 的 `bin` 字段同时暴露 `omr` / `model-router` / `ccr` 三个命令。

```json
{
  "bin": {
    "model-router": "dist/main/cli.js",
    "omr": "dist/main/cli.js",
    "ccr": "dist/main/cli.js"
  }
}
```

**为什么保留 `ccr`**：老用户的 cron / shell 脚本里写的是 `ccr stop` / `ccr start`。如果删掉 `ccr` alias，**所有老脚本都会报 command not found**。

### 3.6 `ccr://` deep link

**保留**：OMR 的 deep link 仍然是 `ccr://`，不是 `omr://`。

**为什么**：老 Web UI 的跳转链接用的是 `ccr://`。改 deep link 需要同时改 Web UI + Electron 注册 + 操作系统注册表，**ROI 太低**。

### 3.7 `/api/ccr/rpc` RPC 端点

**保留**：RPC 端点路径仍然是 `/api/ccr/rpc`，不是 `/api/omr/rpc`。

**为什么**：CLI 代码 `packages/cli/src/cli.ts` 的 `serviceRpcEndpoint()` 函数硬编码了 `/api/ccr/rpc`。改路径需要同时改 CLI + management-server，**且老 CLI 实例连新 server 会 404**。

---

## 4. `CCR_*` 环境变量保留清单

### 4.1 读方向（dual-read 兜底）

以下 env 在 OMR 代码中**只读不写**：

| env 名 | 读位置 | 用途 |
|--------|--------|------|
| `CCR_CONFIG_DIR` | cli-middleware-runtime.ts | 老配置目录路径 |
| `CCR_REAL_CLAUDE_CODE_BIN` | cli-middleware-runtime.ts | 老 claude-code binary |
| `CCR_CLAUDE_CODE_BIN` | cli-middleware-runtime.ts | 老 claude-code binary |
| `CCR_REMOTE_SYNC_PROFILE_NAME` | cli-middleware-runtime.ts | 老远程同步 profile |
| `CCR_SERVICE_INSTANCE_TOKEN` | cli.ts | 老 service token |
| `CCR_WEB_HOST` | cli.ts | 老 web host |
| `CCR_WEB_PORT` | cli.ts | 老 web port |
| `CCR_WEB_AUTH_TOKEN` | cli.ts | 老 web auth token |
| `CCR_CLI_COMMAND_NAME` | cli.ts | 老 CLI 命令名 |
| `CCR_CLI_PREPARE_PROFILE_ONLY` | cli.ts | 老 prepare-only flag |
| `CCR_UPSTREAM_PROXY_URL` | config-compiler.ts | 老 proxy URL |
| `CCR_UNDICI_MODULE` | config-compiler.ts | 老 undici 模块 |

### 4.2 写方向（OMR_* 新名）

以下 env 在 OMR 代码中**只写 OMR_**，不写 CCR_：

- 所有 `profiles/service.ts` 里的 spawn env
- 所有 `launch-core.ts` / `launch-service.ts` 里的 spawn env
- 所有 `app-launch.ts` 里的 spawn env
- 所有 `config-compiler.ts` 里的 spawn env
- 所有 `supervisor.ts` 里的 runtime env
- 所有 `fusion-config.ts` / `grok-media-config.ts` 里的 spawn env

**关键原则**：**写方向不允许出现 `CCR_*`**。如果 grep 发现写方向的 `CCR_*`，那是 bug（参考 OMR-FORK-CHANGE-005b / 005c 补漏）。

---

## 5. 客户端兼容性矩阵

| 客户端版本 | 协议头 | 兼容性 |
|-----------|--------|--------|
| OMR 1.0+ client | `x-omr-*` + `OMR_*` env | ✅ 完全兼容 |
| CCR v3.0.x client | `x-ccr-*` + `CCR_*` env | ✅ dual-read 兼容 |
| CCR v3.0.x client + OMR daemon | `x-ccr-*` → dual-read | ✅ 兼容（老客户端连新 daemon） |
| OMR 1.0+ client + CCR daemon | `x-omr-*` → CCR 不认 | ❌ 不兼容（新客户端连老 daemon） |
| 任意 client + 标准 Anthropic API | `authorization` + `x-api-key` | ✅ 完全兼容 |

**关键**：**OMR daemon 兼容老客户端，但老 daemon 不兼容新客户端**。升级时先升 daemon，再升客户端。

---

## 6. `@ccr/core` import 路径

### 6.1 为什么保留

OMR 代码里大量使用 `@ccr/core/*` import 路径：

```typescript
import { CONFIGDIR } from "@ccr/core/config/constants";
import { loadAppConfig } from "@ccr/core/config/config";
```

**保留理由**：这是 esbuild alias（`build/esbuild.config.mjs` 的 `packageAliasPlugin()`），不是 npm 包名。**改 import 路径需要改 500+ 文件**，ROI 极低。

### 6.2 alias 实现

```javascript
// build/esbuild.config.mjs
function packageAliasPlugin() {
  return {
    name: "ccr-package-alias",
    setup(build) {
      build.onResolve({ filter: /^@ccr\/cli\// }, (args) => {
        return { path: resolvePackageImport(cliSourceRoot, args.path.slice("@ccr/cli/".length)) };
      });
      build.onResolve({ filter: /^@ccr\/core\// }, (args) => {
        return { path: resolvePackageImport(coreSourceRoot, args.path.slice("@ccr/core/".length)) };
      });
      // ...
    }
  };
}
```

**编译后**：`@ccr/core/*` 被 esbuild 打包成相对路径，**运行时不存在 `@ccr/core` 这个包**。只是 build-time alias。

---

## 7. 协议头变更流程

如果未来要加新协议头或删除老协议头：

1. **新加 `x-omr-*` header**：
   - 写方向直接用 `x-omr-*`
   - 读方向 dual-read（`x-omr-*` 优先 + `x-ccr-*` 兜底）
   - 更新本文档

2. **删除 `x-ccr-*` header**：
   - 评估：6 个月 dual-read 期满？
   - grep 确认无客户端发送 `x-ccr-*`
   - 删除读方向代码
   - 更新本文档
   - CHANGELOG.md 记录

3. **改名 `x-omr-*` → `x-omrx-*`**：
   - 新老 dual-read（`x-omrx-*` 优先 + `x-omr-*` 兜底）
   - 6 个月后删 `x-omr-*`
   - 更新文档

---

## 8. 调试技巧

### 8.1 查看实际 HTTP 请求

```bash
# 启动 OMR 并开启 verbose
omr start --no-open

# 另一个终端，抓 OMR 的 HTTP 流量
# OMR gateway 端口 3456, web 端口 3458
curl -v -H "Authorization: Bearer <key>" http://127.0.0.1:3456/v1/models
```

### 8.2 检查 spawn env

```bash
# 查看子进程的环境变量
ps aux | grep cli.js
cat /proc/<pid>/environ | tr '\0' '\n' | grep -E "^(OMR_|CCR_)"
```

### 8.3 验证 dual-read

```bash
# 发老 CCR header，应该工作
curl -H "x-ccr-profile-id: default" -H "Authorization: Bearer <key>" \
  http://127.0.0.1:3456/v1/models

# 发新 OMR header，应该工作
curl -H "x-omr-profile-id: default" -H "Authorization: Bearer <key>" \
  http://127.0.0.1:3456/v1/models
```

---

## 9. 关联文档

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - 架构总览（Layer 6 Gateway）
- [`ROUTING.md`](./ROUTING.md) - 路由策略（header 如何影响路由）
- [`DECISIONS.md`](./DECISIONS.md) - 决策日志（§5 故意保留的 CCR 引用）
- [`CHANGELOG.md`](./CHANGELOG.md) - commit 96a21a8 / 97fe211 详情
- [`PATCHES.md`](./PATCHES.md) - patch 001 / 004 / 005b / 005c

---

## 10. 元数据

- 创建时间：2026-08-12 13:35 GMT+8
- 创建者：CC（Claude Code subagent）
- 关联 commit：96a21a8（dual-read 体系）/ 97fe211（env 名清理）/ acf6a6d / 1906ed3
- 兼容性：CCR v3.0.x 协议头 100% 兼容（dual-read）
- 下次回顾：2027-02（6 个月 dual-read 期满评估）
