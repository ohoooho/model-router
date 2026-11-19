# CCR 3.1.5 Upgrade

Status: **merged and verified on `upgrade/ccr-3.1.5`**. Not released or
published. OMR package names and versions are unchanged until a release
decision is made.

## Baseline

| Item | Value |
| --- | --- |
| OMR base branch | `origin/main` @ `c65007f5` (OMR 0.2.0 release line) |
| Current CCR base | `v3.1.3` @ `3b0aebf3` |
| Target CCR | `v3.1.5` @ `da96d5d` |
| Upstream source | GitHub archive `v3.1.5` (codeload) |
| Synthetic upstream snapshot | `7d049cdc` (parent `3b0aebf3`) |

The snapshot commit is local only. It contains the exact `v3.1.5` source tree and
exists so Git can perform a three-way merge against the OMR patches.

## Merge Result

`git merge 7d049cdc` produced **24 conflicts**. Resolutions:

- **Branding/docs**: kept OMR `README.md` / `README_zh.md`; kept the legacy
  upstream docs deleted by OMR; updated the recognised fork base to `v3.1.5`.
- **Package metadata**: kept OMR package names and OMR versions. Adopted
  upstream Electron `^42.11.18` in `package.json` and both lockfiles.
- **Docker**: kept OMR image/volume names, adopted the loopback-only publish
  `127.0.0.1:3458:8080`.
- **Claude Code launch**: use upstream `claudeCodeConfigDirEnv()` so the
  default `~/.claude` home is not forced through `CLAUDE_CONFIG_DIR`; export
  both `OMR_PROFILE_SURFACE` and `CCR_PROFILE_SURFACE` for compatibility.
- **Codex OAuth**: keep the OMR fallback plugin key and add upstream
  `requiredScopes: []`; accept both `omr-local-agent-` and legacy
  `ccr-local-agent-` prefixes when identifying imported Codex plugins.
- **Hidden-provider discovery**: OMR exposes bare model IDs (no
  `Provider/model` prefix). Added bare-ID provider resolution so discovery
  still attaches configured context-window, reasoning, and capability
  metadata. The upstream reasoning-metadata test now asserts OMR bare IDs.

## Relevant Upstream Changes

- **3.1.4**: Docker management-token security fix (do not hand the management
  token to unauthenticated clients).
- **3.1.5**: provider credential fallback, vendor-qualified model routing,
  stale profile model selections, context-window/reasoning metadata discovery,
  Anthropic safeguards/classifier/tool-use ID preservation, restore original
  settings, Codex workspace routing, clearer client errors, request-log bounds,
  Windows/Pi/ToolHub fixes, Electron 42.11.18, non-root Docker.

## Verification

Runtime acceptance procedure: [`docs/OMR-RELEASE-TEST.md`](OMR-RELEASE-TEST.md).
It covers isolated installation, the gateway protocols, Agent Profiles, Docker
loopback, baseline comparison, and the release decision checklist.

Compared against the unmerged OMR baseline `d7ae246f` (same code as
`origin/main` @ `c65007f5`):

| Check | Baseline | Upgrade |
| --- | --- | --- |
| Typecheck | pass | pass |
| Architecture | 5 tests, 0 fail | 8 tests, 0 fail |
| CLI | 6 tests, 0 fail | 6 tests, 0 fail |
| UI | 212 tests, 4 fail | 217 tests, 4 fail (same names) |
| Core | 142 fail | 130 fail after rerun, no upgrade-only failures |
| Electron | binary download fails | binary download fails (environmental) |

The remaining core/UI failures reproduce unchanged on the baseline. They are
pre-existing OMR environment failures, not CCR 3.1.5 regressions. The upgrade
also fixes several baseline metadata-discovery failures. One core test
(`OpenCode free-tier user agent reads the installed CLI version`) timed out
under the full parallel run and passed when rerun alone.

## Boundaries

1. Do not publish or deploy from this branch without explicit authorization.
2. Do not bump the OMR version or regenerate the model catalog as part of this
   merge; those are release decisions.
3. The pure-gateway work is a product/UI change and stays on its own branch.
   The CCR upgrade remains isolated so regressions are attributable.
