<div align="center">

# OMR — Model Router

### 所有 AI 编程工具，共用一个本地模型入口。

OMR 是面向 AI 编程工具的本地模型网关与控制平面。它让 Claude Code、Codex 和所有兼容 API 客户端共用一个**稳定的本地网关**，供应商、模型、账号、路由规则、故障降级全在一个地方管。

<p>
  <a href="#快速开始"><img alt="快速开始" src="https://img.shields.io/badge/快速开始-Quick_Start-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/English-README-2563EB?style=flat" /></a>
</p>

</div>

## OMR 是什么？

OMR 是面向 AI 编程工具的本地模型网关与控制平面。

不用给每个 AI 工具单独配模型，配一次 OMR，所有工具都指过来：

- **Claude Code / Codex / Cursor / Aider** 等兼容客户端 → `http://127.0.0.1:3456`
- 供应商、模型、API Key、路由规则、降级链，一个地方全管
- 预置常用供应商预设：**DeepSeek / 火山方舟 / MiniMax / 通义千问 / Anthropic / 任意 OpenAI 兼容端点**
- 智能降级：一个供应商挂了，请求自动切到链上下一个

## 核心能力

| 领域 | 亮点 |
| --- | --- |
| **Agents** | 支持 Claude Code、Codex 等工具的配置档；模型覆盖；环境变量；CLI / App 启动入口 |
| **供应商** | 预设 + 自定义端点；协议探测；模型发现；单 Key 与多 Key 凭据池 |
| **模型与路由** | 模型目录；基于请求头/体的路由条件；前缀；改写；重试；有序降级链 |
| **工具与扩展** | Fusion 模型；ToolHub；浏览器自动化；Chrome 登录态导入；网关插件；虚拟模型 |
| **访问与配额** | 每客户端独立 API Key，支持过期时间与本地请求/Token 限额 |
| **可观测** | 请求日志；最终命中的供应商/模型/凭据；状态；延迟；Token；预估成本；Agent 轨迹 |

## 快速开始

### CLI（推荐）

需要 Node.js 22+：

```sh
npm install -g @ohoooho/model-router
model-router ui
```

首次启动会打开管理界面 `http://127.0.0.1:3458`，模型网关监听 `http://127.0.0.1:3456`。

流程：**Providers → 添加供应商与 Key → Server → Start → Agent Profiles → 选择工具与模型 → 应用**。

> 旧的 `ccr` 命令仍可用（等价于 `model-router`），老环境平滑迁移，不会断。

### Docker

```sh
docker compose up -d --build
```

默认通过 `http://127.0.0.1:3458` 暴露管理界面与网关。未配置认证时不要将 OMR 暴露到公网。

## 支持的 Agent

Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode，以及任何兼容 OpenAI / Anthropic 协议的客户端。

## 工作原理

```text
Claude Code · Codex · 其他 AI 工具 · 兼容 API 客户端
                              │
                              ▼
                      OMR :3456
          Profiles · Routing · Credentials · Tools · Logs
                              │
                              ▼
             命中的供应商、模型、账号
```

## 构建

安装 Node.js 22+ 后：

```sh
npm ci
npm run build:assets
```

桌面端（macOS / Windows / Linux）可用 `npm run build:app:mac` / `npm run build:app:win` / electron-builder 打包。

## Fork 来源

OMR fork 自 [claude-code-router](https://github.com/musistudio/claude-code-router) v3.0.18（MIT License，© 2025 musistudio）。保留上游 MIT 许可并追加我们自己的版权声明，详见 [LICENSE](LICENSE)。

## License

[MIT License](LICENSE) — © 2025 musistudio，© 2026 ohoooho。
