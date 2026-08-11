# OMR CLI

[English](README.md) · [完整文档](https://ccrdesk.top/) · [GitHub](https://github.com/musistudio/claude-code-router)

> **OMR**（ohoooho Model Router）是一个本地模型路由网关，fork 自 [claude-code-router](https://github.com/musistudio/claude-code-router)。

`@ohoooho/model-router` 是 OMR 的 Node.js 发行版。它通过 `omr` 命令提供浏览器管理界面、本地模型网关和 Agent 配置启动能力，不需要安装 Electron。`ccr` 命令保留为向后兼容的别名。

CLI 适合开发机和无桌面的服务器。如果你需要系统托盘、桌面通知、应用自动更新或桌面端专属的浏览器集成，请安装桌面应用。

## 环境要求与安装

- Node.js 22 及以上
- 至少一个可用的上游模型 provider，或一个本地已登录且 OMR 能导入的 Agent 账号
- 使用 Agent 启动命令时需要一个已安装的 Agent 可执行文件

全局安装：

```sh
npm install -g @ohoooho/model-router
omr --help
```

用 npm 升级或卸载：

```sh
npm install -g @ohoooho/model-router@latest
npm uninstall -g @ohoooho/model-router
```

卸载不会删除 OMR 的本地配置和数据库。

## 快速开始

启动后台服务并打开管理界面：

```sh
omr ui
```

然后：

1. 添加上游 provider 和至少一个模型。
2. 在「API Keys」中创建一个 OMR 客户端密钥。
3. 如果默认 provider/模型不能满足需求，配置路由规则。
4. 在「Server」中确认网关正在运行。
5. 将客户端指向 UI 显示的网关地址。默认网关为 `http://127.0.0.1:3456`，管理 UI 默认为 `http://127.0.0.1:3458`。

管理令牌和 OMR 客户端 API Key 是不同的凭据。管理令牌用于保护浏览器 UI 和 RPC API，OMR 客户端 Key 用于验证发送到网关的模型请求。

## 服务命令

| 命令 | 行为 |
| --- | --- |
| `omr start` | 启动一个分离的后台管理服务和网关，然后打印带认证的管理 URL。 |
| `omr ui` | 复用或启动后台服务并打开管理界面。 |
| `omr stop` | 停止由 `omr start` 或 `omr ui` 启动的分离服务。 |
| `omr serve` | 前台运行管理服务和网关。`omr web` 是别名。 |
| `omr <profile>` | 按名称或 ID 打开一个已启用的 Agent Profiles 配置。 |

### `omr start`

```text
omr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

- `--host <host>`：管理监听地址，默认 `127.0.0.1`。
- `--port <port>`：首选管理端口，默认 `3458`。
- `--open` / `--no-open`：启用或禁用自动打开浏览器。
- `--gateway`：显式请求启动网关；此为默认行为。
- `--no-gateway`：仅启动管理服务。

### `omr ui`

```text
omr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` 默认打开浏览器。在 SSH 或其他无桌面环境使用 `--no-open`。

### `omr serve`

```text
omr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` 保持依附在当前终端并响应 `SIGINT`/`SIGTERM`。适合进程管理器使用。`omr stop` 仅管理分离服务；通过终端或管理器停止前台服务。

如果首选管理端口被占用，OMR 会尝试下一个可用端口并打印实际 URL。当 `start` 或 `ui` 复用了现有服务时，新的 host、port 和 `--no-gateway` 不会重新配置该进程。如需更改，先执行 `omr stop`。

## Agent Profiles

在「Agent Profiles」中创建并启用 Profile，然后按名称或 ID 启动：

```sh
omr "Codex - Work"
omr "Codex - Work" app
omr "Claude - Review" cli -- --model sonnet
omr profile-id -- --help
```

语法：

```text
omr <profile-name-or-id> [cli|app] [-- <agent arguments>]
```

- `--cli` 和 `--app` 也可以放在位置参数的位置。
- 将 agent 专用参数放在 `--` 之后，避免与 OMR 选项混淆。
- 省略 surface 时，OMR 使用 profile 允许的第一个 surface：CLI 用于 Claude Code、Codex、Grok CLI、Kimi CLI 和 Pi；App 用于 ZCode。
- Grok CLI、Kimi CLI 和 Pi 仅支持 CLI。ZCode 仅支持 App。Claude App 和 ZCode App 不接受尾部 agent 参数。
- 桌面 App 启动需要对应应用已安装且有图形会话。
- 打开大多数 profile 前请先启动 OMR 服务。Grok CLI、Kimi CLI 和 Pi profile 可自动启动临时共享服务，并在最后一个托管 session 退出后停止。

桌面应用安装了一个名为 `ccr-app` 的相关命令。从桌面 Agent Profiles 卡片复制的命令使用 `ccr-app`；本文档记录的 npm 包安装的是 `omr`。

## 配置与运行时文件

| 平台 | 配置目录 |
| --- | --- |
| macOS / Linux | `~/.omr` |
| Windows | `%APPDATA%\omr` |

重要文件包括：

- `config.sqlite`：当前应用配置。
- `app-data/`：API 密钥、用量、请求日志、证书和其他运行时数据库/文件。
- `service.json`：分离 CLI 服务的状态和私有令牌。
- `gateway.config.json`：生成的网关运行时配置。
- `profiles/` 和 `bin/`：隔离的 profile 配置和启动包装器。

请勿在 OMR 运行时编辑或复制正在写入的 SQLite 文件。使用 UI 导出功能，或在停止 OMR 后进行文件系统备份。

## 环境变量与安全

| 变量 | 说明 |
| --- | --- |
| `CCR_WEB_HOST` | 省略 `--host` 时的默认管理监听地址。 |
| `CCR_WEB_PORT` | 省略 `--port` 时的默认管理端口。 |
| `CCR_WEB_AUTH_TOKEN` | 固定管理 UI/RPC 令牌，替代每次进程随机生成的令牌。 |

带认证的管理 URL 的查询字符串中包含 `ccr_web_token`。请将该 URL 视为密码，避免复制到日志、工单或 shell 历史中。除非有意开放远程访问，否则请绑定到 `127.0.0.1`。远程访问时请使用防火墙或私有网络，并在可信反向代理处配置 TLS。

不要在未创建 OMR 客户端 API Key 的情况下暴露网关。上游 provider 凭据存储在 OMR 的本地数据目录中，请保护好该目录及其备份。

## 故障排查

### 找不到 `omr` 命令

确认 Node.js 版本为 22 或以上，且 npm 全局 bin 目录在 `PATH` 中：

```sh
node --version
npm prefix -g
```

如果 shell 缓存了命令路径，安装后请打开新 shell。

### 管理 URL 端口变了

请求的端口已被占用。使用 OMR 打印的 URL，或停止冲突进程后重启 OMR。

### UI 可以打开但网关不可用

管理服务可以在没有可用网关的情况下运行。添加 provider 和 model，创建客户端 API Key，然后在「Server」中启动或重启网关。排查启动错误时查看 `omr serve` 的前台输出。

### 找不到某个 profile

只有已启用的 profile 才能启动。名称匹配不区分大小写，接受 sanitized 名称，但歧义名称需要使用 profile ID。如果生成的启动器丢失，请重新保存该 profile。

### 后台服务使用了旧配置

停止并重新创建：

```sh
omr stop
omr start --host 127.0.0.1 --port 3458
```

## Docker

仓库还提供面向模型网关和浏览器 UI 的 Docker 镜像。运行时镜像不会安装 npm 的 `omr` 命令。请参阅 [Docker 部署文档](https://github.com/musistudio/claude-code-router/blob/main/docker/README.md)。

## 许可证

[MIT](LICENSE)
