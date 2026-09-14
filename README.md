<div align="center">

# OMR — Model Router

### One local gateway for all your coding agents and models.

OMR is a local model gateway and control plane for AI coding agents. It gives Claude Code, Codex, and compatible API clients **one stable local endpoint**, while you manage providers, models, accounts, routing rules, and failover from a single place.

<p>
  <a href="#quick-start"><img alt="Quick Start" src="https://img.shields.io/badge/Get_Started-Quick_Start-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="README_zh.md"><img alt="中文版" src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87%E7%89%88-README_zh-ff0000?style=flat" /></a>
</p>

</div>

## What is OMR?

OMR is a local model gateway and control plane for AI coding agents.

Instead of configuring a separate model endpoint for every AI tool, you configure OMR **once**, then point all your agents at it:

- **Claude Code / Codex / Cursor / Aider** and other compatible clients → `http://127.0.0.1:3456`
- One place to manage providers, models, API keys, routing rules, and failover chains
- Pre-configured presets for common providers: **DeepSeek / Ark (Volcano) / MiniMax / Qwen (Alibaba) / Anthropic / OpenAI-compatible endpoints**
- Smart fallback: if one provider fails, requests automatically roll to the next in the chain

## Core capabilities

| Area | Highlights |
| --- | --- |
| **Agents** | Profiles for Claude Code, Codex, and other AI tools; model overrides; environment settings; CLI and app launch entries |
| **Providers** | Presets and custom endpoints; protocol probing; model discovery; single keys and credential pools |
| **Models & routing** | Model catalog; routing conditions on headers and bodies; prefixes; rewrites; retries; ordered fallback chains |
| **Tools & extensions** | Fusion models; ToolHub; browser automation; Chrome login-state import; gateway plugins; virtual models |
| **Access & quotas** | Per-client API keys with expiration and local request / token limits |
| **Observability** | Request logs; resolved provider / model / credential; status; latency; tokens; estimated cost; agent traces |

## Quick Start

### 1. Peach install (recommended — Taoxian 桃仙 deployment)

One-line install for 桃仙 / Taoxian customer deployment (Windows / macOS / Linux):

```sh
curl -fsSL https://get.ohoooho.com/omr | bash
```

- Bundles Node.js 22 runtime check + OMR model router + license verification (Taoxian License v1.2) + SQLite config + auto-start
- After install: open `http://127.0.0.1:3456/#v2` (new UI)
- License verification is **offline** (RS256 + L2 only, no machine binding) — see `LICENSE` and Taoxian license spec

### 2. CLI (npm fallback)

Requires Node.js 22+:

```sh
npm install -g @ohoooho/model-router
model-router ui
```

The first launch opens the management UI at `http://127.0.0.1:3458`. The model gateway listens at `http://127.0.0.1:3456`.

Workflow: **Providers → add provider & API key → Server → Start → Agent Profiles → pick agent & model → apply**.

> The legacy `ccr` command still works as an alias for `model-router`, so existing setups keep running during migration.

### Docker

```sh
docker compose up -d --build
```

The management UI and gateway are exposed through `http://127.0.0.1:3458` by default. Do not expose OMR to the public internet without authentication.

## Supported agents

Claude Code, Claude Design, Codex, Grok CLI, Kimi CLI, Kilo Code, OpenCode, Pi, ZCode, and any client compatible with the OpenAI / Anthropic protocols.

## How it works

```text
Claude Code · Codex · other AI agents · compatible API clients
                              │
                              ▼
                      OMR :3456
          Profiles · Routing · Credentials · Tools · Logs
                              │
                              ▼
             Selected provider, model, and account
```

## Build

Install Node.js 22+, then:

```sh
npm ci
npm run build:assets
```

Desktop app packages (macOS / Windows / Linux) can be built with `npm run build:app:mac` / `npm run build:app:win` / electron-builder.

## Fork source

OMR is a fork of [claude-code-router](https://github.com/musistudio/claude-code-router) v3.0.18 (MIT License, © 2025 musistudio). We keep the upstream MIT license and add our own copyright notice. See [LICENSE](LICENSE).

## License

[MIT License](LICENSE) — © 2025 musistudio, © 2026 ohoooho.
