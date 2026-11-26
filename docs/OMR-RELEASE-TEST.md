# OMR Release Test

Reusable acceptance checklist for OMR releases. This is **not** a benchmark
and **not** a model-quality evaluation.

| Term | Meaning here |
| --- | --- |
| Benchmark | Performance comparison: latency, throughput, tokens/sec, memory. Not covered by this document. |
| Evaluation | Model capability/quality scoring. Not covered by this document. |
| Baseline comparison | Compare the test failure set before and after a change. Used because OMR currently has known pre-existing failures. |
| Release acceptance / smoke test | Prove the packaged build starts, routes real requests, and does not regress the upgrade-specific behavior. This is what this document covers. |

## Current Reference

| Item | Value |
| --- | --- |
| OMR package version | `0.2.4` |
| CCR target | `3.1.5` |
| Reference branch | `upgrade/ccr-3.1.5` |
| Reference commit at first write | `94dfe813` |
| Baseline worktree | `d7ae246f` (same code as `origin/main` @ `c65007f5`) |
| Last local runtime check | macOS, isolated HOME, alternate ports `13456/13457/13458` |
| Runtime check coverage | health, UI, `/v1/models`, chat/completions, responses, messages with a local mock upstream |

Use the Git commit and the tarball SHA256 to identify the build. Do not rely on
`omr --version` alone.

## 1. Record The Build Identity

Run this before testing and paste the values into the result template in
section 9.

```bash
git status --short --branch
git rev-parse HEAD
node --version
uname -a
```

After packing:

```bash
shasum -a 256 "$TARBALL"
```

## 2. Source Gate

```bash
npm ci
npm run typecheck
npm run test:architecture
npm run test:cli
npm run test:core
npm run test:ui
```

Expected on the CCR 3.1.5 branch:

- Typecheck: pass
- Architecture: 8 tests, 0 failures
- CLI: 6 tests, 0 failures
- UI: same 4 failures as the baseline, no additional names
- Core: no upgrade-only failures; compare failure names with the baseline
- Electron: may fail because the Electron binary download fails in this
  environment; reproduce on baseline before treating it as a regression

Known baseline UI failures:

- `profileSummaryItems omits disabled...`
- `TrayStatusStrip...`
- `a save response preserves newer settings...`
- `an imported Grok Agent supplies default API media models`

Do not require a fully green suite. Require **no new failure names**.

## 3. Build And Pack

Release builds are offline and byte-reproducible by default. `build:assets`
uses the committed generated catalogs:

- `packages/core/models.json`
- `packages/ui/src/generated/claude-code-config-options.json`

Do not refresh either catalog while preparing a release. The network refresh is
only for an intentional catalog update:

```bash
OMR_BUILD_REFRESH=1 npm run build:assets
git add packages/core/models.json \
  packages/ui/src/generated/claude-code-config-options.json
git commit -m "chore(models): refresh generated catalogs"
```

For the release artifact, use a clean checkout at the release commit and the
same Node/npm versions as the signing machine:

```bash
set -euo pipefail

cd /path/to/model-router
npm ci
git status --short  # must be empty

PACKDIR=$(mktemp -d)
npm pack --workspace @ohoooho/model-router --pack-destination "$PACKDIR"
TARBALL=$(ls "$PACKDIR"/*.tgz)

printf 'tarball=%s\n' "$TARBALL"
shasum -a 256 "$TARBALL"
```

Build note: `npm pack` runs `prepack` -> `build:assets`, which now uses the
committed catalogs and does not fetch model or documentation APIs. Build from a
clean tree and discard any generated `dist/` output before packing.

To prove reproducibility, pack twice from the same commit and compare the bytes:

```bash
A=$(mktemp -d)
B=$(mktemp -d)
npm pack --workspace @ohoooho/model-router --pack-destination "$A"
npm pack --workspace @ohoooho/model-router --pack-destination "$B"
cmp "$A"/*.tgz "$B"/*.tgz
shasum -a 256 "$A"/*.tgz "$B"/*.tgz
```

The two SHA256 values must match. If they do not, stop and investigate before
assembling the release.

## 4. Install In Isolation

Do not install over a running OMR. Use a temporary prefix and a temporary HOME.

```bash
PREFIX=$(mktemp -d)
npm install --prefix "$PREFIX" -g "$TARBALL"
export PATH="$PREFIX/bin:$PATH"

omr --help
```

## 5. Start On Alternate Ports

Use `13456` (gateway), `13457` (core runtime), and `13458` (UI) so the real
OMR on `3456/3457/3458` is untouched.

Set a **test** upstream before seeding the config. Leave these unset if you only
want the health/models/UI smoke; the protocol commands in section 6 then need a
model from the default config.

```bash
export OMR_TEST_BASE_URL='https://your-test-endpoint/v1'
export OMR_TEST_API_KEY='test-key'
export OMR_TEST_MODEL='your-test-model'
```

Never use production credentials here.

```bash
TEST_HOME=$(mktemp -d)
mkdir -p "$TEST_HOME/.omr"

python3 - "$TEST_HOME/.omr/config.sqlite" <<'PY'
import json, os, sqlite3, sys

db = sqlite3.connect(sys.argv[1])
db.execute("""
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
""")

base_url = os.environ.get("OMR_TEST_BASE_URL", "").strip()
api_key = os.environ.get("OMR_TEST_API_KEY", "").strip()
model = os.environ.get("OMR_TEST_MODEL", "").strip()

cfg = {
    "PORT": 13456,
    "HOST": "127.0.0.1",
    "gateway": {
        "enabled": True,
        "host": "127.0.0.1",
        "port": 13456,
        "coreHost": "127.0.0.1",
        "corePort": 13457,
    },
}

if base_url and model:
    cfg["Providers"] = [{
        "name": "test",
        "baseUrl": base_url,
        "apiKey": api_key,
        "models": [model],
    }]
    cfg["preferredProvider"] = "test"
    cfg["Router"] = {
        "fallback": {
            "mode": "model-chain",
            "models": [f"test,{model}"],
            "retryCount": 1,
        },
        "rules": [],
        "builtInRules": {
            "claude-code": {"enabled": True},
            "codex": {"enabled": True},
        },
    }

db.execute(
    "INSERT OR REPLACE INTO app_config(key,value_json,updated_at) VALUES('default',?,datetime('now'))",
    (json.dumps(cfg),),
)
db.commit()
db.close()
PY
```

Start:

```bash
export HOME="$TEST_HOME"
export TAOXIAN_LICENSE_SKIP=1

omr start --no-open --port 13458
sleep 3

curl -fsS http://127.0.0.1:13456/health
curl -s -o /dev/null -w 'UI HTTP %{http_code}\n' http://127.0.0.1:13458/
```

Pass:

- `/health` returns `status: "running"`
- UI returns `200`
- only `13456/13457/13458` are bound by the test instance
- the real OMR still owns `3456/3457/3458`

`TAOXIAN_LICENSE_SKIP=1` is for local test only. Never use it in production.

## 6. Runtime Smoke

### 6.1 Model discovery

```bash
KEY=$(sqlite3 -readonly "$TEST_HOME/.omr/config.sqlite" \
  "SELECT encrypted_key FROM api_keys WHERE id='local-gateway';")
test -n "$KEY"

curl -fsS http://127.0.0.1:13456/v1/models \
  -H "Authorization: Bearer $KEY" \
  | python3 -m json.tool
```

Pass:

- configured models are present
- model IDs are bare names or scenario IDs, not `Provider/model`
- models with configured context metadata expose `context_window` /
  `max_input_tokens`
- reasoning metadata is preserved when configured

### 6.2 OpenAI Chat Completions

```bash
curl -sS -N http://127.0.0.1:13456/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"model\":\"$OMR_TEST_MODEL\",
    \"stream\":true,
    \"max_tokens\":64,
    \"messages\":[{\"role\":\"user\",\"content\":\"只回复两个字：通了\"}]
  }"
```

### 6.3 Responses

```bash
curl -sS http://127.0.0.1:13456/v1/responses \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"model\":\"$OMR_TEST_MODEL\",
    \"max_output_tokens\":64,
    \"input\":\"只回复两个字：通了\"
  }"
```

### 6.4 Anthropic Messages

```bash
curl -sS http://127.0.0.1:13456/v1/messages \
  -H "x-api-key: $KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' \
  -d "{
    \"model\":\"$OMR_TEST_MODEL\",
    \"max_tokens\":64,
    \"messages\":[{\"role\":\"user\",\"content\":\"只回复两个字：通了\"}]
  }"
```

Each protocol must return `200` and actual generated text, not only a health
response or an empty stream.

### 6.5 UI

```bash
python3 -c 'import json;print(json.load(open("'"$TEST_HOME"'/.omr/service.json"))["url"])'
```

Open the printed URL in a browser. Do not paste the tokenized URL into tickets,
chat, or logs. Check:

- Providers page loads
- Agents/Profiles page loads
- save a provider/profile change
- restart OMR
- the change persists
- request logs show the smoke requests

### 6.6 Taoxian install onboarding state

The Taoxian installer writes `onboardingFinishedAt` through the OMR install
scripts (`install/write-config.js` and `install/migrate-runtime-config.js`), so
a fresh Taoxian backend opens the normal Overview page instead of the
"Connect agent" onboarding wizard. The write is idempotent and keeps an existing
timestamp.

Verify an installer-based install with:

```bash
sqlite3 -readonly "$HOME/.omr/config.sqlite" \
  "SELECT value_json FROM app_config WHERE key='onboardingFinishedAt';"
```

Pass:

- a non-empty timestamp is returned
- opening the UI lands on Overview, not Onboarding
- Agents/Profiles pages are still reachable and usable

A direct npm install does not have this Taoxian-specific seed; it will show
Onboarding until the user finishes it or `setOnboardingFinished` is called.
This difference is expected.

## 7. Agent And Upgrade-Specific Checks

### 7.1 Claude Code

```bash
omr default-claude-code cli -- -p "只回复两个字：通了"
```

Pass:

- real response
- no "Two Claude Code config files exist" warning
- default `~/.claude` is not forced through `CLAUDE_CONFIG_DIR`

### 7.2 Codex

```bash
omr default-codex cli -- exec "只回复两个字：通了"
```

Pass:

- real response
- no connector scope / `requiredScopes` error when using an imported
  Codex OAuth profile

Use the actual profile name from the test configuration. These commands require
the corresponding agent executable to be installed.

### 7.3 Provider credential fallback

If the test setup has a credential pool:

- disable or invalidate the primary credential
- send a request
- confirm the fallback credential is used and the request succeeds

### 7.4 Docker loopback

On a Linux test machine with Docker:

```bash
npm run test:docker
docker ps --format '{{.Names}}  {{.Ports}}'
```

Pass:

- published port is loopback-only, such as `127.0.0.1:3458->8080/tcp`
- no `0.0.0.0:3456` or `0.0.0.0:3458`

The Docker system test may require the local `next-ai/gateway` source, or
`CCR_DOCKER_GATEWAY_SOURCE_DIR` pointing at it.

## 8. Real Upstream Versus Mock

A local mock upstream proves the gateway wiring, routing, protocol conversion,
and streaming. It does **not** prove compatibility with a real vendor.

Before release, repeat sections 6.2-6.4 and 7.1-7.2 against a real test
provider and a real agent login. Use test credentials only. Never put a
production key into the test HOME, shell history, screenshots, or tickets.

## 9. Result Template

```text
Date:
Tester:
Platform:
Node:
Branch:
Commit:
Tarball SHA256:
Test upstream: real / mock
Test model:
Agent versions: Claude Code / Codex

Source gate:
  typecheck:
  architecture:
  cli:
  core:
  ui:
  electron:

Packaged runtime:
  install:
  health:
  ui:
  models:
  chat/completions:
  responses:
  messages:
  claude-code:
  codex:
  docker:
  ui save/restart:
  onboardingFinishedAt:

New failures vs baseline:
Evidence/log paths:
Decision: pass / fail / blocked
```

## 10. Release Decision

Treat the release as **blocked** if any of these fail:

- `/health` does not return `running`
- UI does not return `200`
- `/v1/models` returns provider-prefixed IDs or loses configured metadata
- any of the three protocols cannot produce real text
- Claude Code or Codex cannot complete one real request
- UI cannot save or loses the change after restart
- Docker binds to `0.0.0.0`
- a new test failure appears that is not on the baseline list

## 11. Cleanup

```bash
omr stop
rm -rf "$TEST_HOME" "$PREFIX" "$PACKDIR"
```

Confirm the real instance is still healthy:

```bash
curl -fsS http://127.0.0.1:3456/health
```

## 12. Troubleshooting

| Symptom | Check |
| --- | --- |
| `omr` not found | `PATH="$PREFIX/bin:$PATH"`; Node.js 22+ |
| Port already in use | choose different `13456/13457/13458` values |
| Orphan daemon | `lsof -nP -iTCP -sTCP:LISTEN \| grep -E ':(345[0-9]\|1345[0-9])'` |
| `sqlite3` missing | install `sqlite3`, or read the key from the UI API Keys page |
| `/v1/models` empty | check `app_config` provider/model seed and restart |
| 401 from gateway | use the `local-gateway` key, not the provider key |
| model not found | model ID must match the configured model exactly |
| agent fails but gateway works | check agent profile, executable, login, and request logs |
