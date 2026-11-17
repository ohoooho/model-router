# CCR 3.1.5 Upgrade Assessment

Status: **assessment only**. This branch does not ship, publish, or deploy anything.

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

## First Merge Result

`git merge 7d049cdc` produced **24 conflicts**:

- Documentation: `README.md`, `README_zh.md`, `docs/src/content/docs/{en,zh}/...`
- Version/dependency metadata: `package.json`, `package-lock.json`,
  `packages/cli/package.json`, `packages/core/package.json`,
  `packages/electron/package.json`, `packages/ui/package.json`
- Code:
  - `packages/core/src/profiles/launch-core.ts`
  - `packages/core/src/providers/account-service.ts`

Most documentation conflicts are OMR branding vs upstream wording. The
metadata conflicts are OMR package names/versions vs upstream 3.1.5 versions.
The two code conflicts need behavior review and tests.

## Relevant Upstream Changes

- **3.1.4**: Docker management-token security fix (do not hand the management
  token to unauthenticated clients).
- **3.1.5**: provider credential fallback, vendor-qualified model routing,
  stale profile model selections, context-window/reasoning metadata discovery,
  Anthropic safeguards/classifier/tool-use ID preservation, restore original
  settings, Codex workspace routing, clearer client errors, request-log bounds,
  Windows/Pi/ToolHub fixes, Electron 42.11.18, non-root Docker.

## Plan

1. Resolve metadata/version conflicts first; keep OMR versioning and package
   names.
2. Resolve the two code conflicts with behavior-level review, not textual
   conflict picking.
3. Run typecheck, core/UI tests, and the OMR fork-specific tests.
4. Compare packaged output against 0.2.x; do not regenerate the model catalog
   unless intentionally updating it.
5. Only after verification, decide whether the upgrade belongs in a release.
6. Never publish or deploy from this branch without explicit authorization.

## Why This Is Separate

The pure-gateway work is a product/UI change. The CCR upgrade is an upstream
rebase. Bundling them makes regressions harder to attribute. This branch is the
isolated place to evaluate 3.1.5; the gateway-only changes stay on their own
branch.
