# OMR 0.2.4 Release Candidate

- Date: 2026-11-26
- Branch: `release/omr-0.2.4`
- Base: `integration/next-omr-build` @ `5ff59618` (CCR 3.1.5)
- Package: `@ohoooho/model-router@0.2.4`
- Artifact: `ohoooho-model-router-0.2.4.tgz`
- SHA256: `fe33c0efda523dbce1c757a1bbd8e9b0984e0a5a7dfed77dd19dd2bf772af5cc`
- Size: `6654015` bytes
- npm integrity: `sha512-YksNaEosG7uae86jEqRyQOzOg+J59wwZZn4wrLzVCUl+sVDdnZRGNmtZJFT/7iBtCcDVFjCEty2lhy8ZaubbJQ==`
- npm shasum: `a7b3247dd9d6ab58e8450ed07706a0bad893f2ce`

## Highlights

- Codex Responses history compatibility:
  - `function_call.id` values using `call_*` are normalized to `fc_*`.
  - `function_call_output.id` values are normalized to `fco_*`.
  - `call_id` pairing is unchanged.
  - Reasoning item `rs_*` ids are removed when `store` is not `true`;
    reasoning content is preserved.
- Virtual model fixed targets prefer the native Responses protocol when the
  provider supports it. The same virtual id works through
  `/v1/chat/completions`, `/v1/responses`, and `/v1/messages` without falling
  back to another model.
- Model-entry profile keys are unique; migration repairs duplicates, and the
  UI edits entries by model id, so `assist-auto` / `trial-auto` cannot overwrite
  each other.
- `*-auto` aliases and the global fallback chain are unchanged.
- Missing OpenCode models return an explicit 400 instead of silently falling
  back to MiniMax.

## Build

- Node `v24.16.0`, npm `11.13.0`.
- `npm run typecheck` passed.
- Two clean packs from the same tree were byte-identical:
  `fe33c0ef...`.
- `install/component.yaml` records the artifact SHA256, size, and npm integrity
  above.

## Verification

Source gates:

- Architecture: `8/8` passed.
- CLI: `6/6` passed.
- Core Responses compatibility suite: `5/5` passed.
- Core gateway virtual-model suite: `43/45` passed; the two failures are the
  same known baseline failures present on `5ff59618`:
  - `issue 1480 Fusion vision config injects core auth token into MCP gateway
    runtime`
  - `gateway fallback explains In-app Browser web search requires Desktop
    integration` (test still expects the old `CCR Desktop` string)
- Installer regressions:
  - `install/test-baozi-runtime-profiles.sh` passed.
  - `install/test-reinstall-preserves-config.sh` passed.

Packaged runtime:

- Installed the tarball into an isolated prefix and temporary HOME.
- `/health` returned `status: "running"`; UI returned HTTP `200`.
- Exact Codex history replay through the packaged build:
  - `store: false`
  - reasoning id `rs_293293c2565d4f308cdd4a28b9bb8a6f`
  - function-call id `call_NAkoOzN04TLL6GReUhSmxVAM`
  - function-call-output id uses the same `call_*` value
  - result: HTTP `200`, `model: gpt-6-luna`, text `OK`
- `install/install.sh` offline mode installed the same tarball using
  `component.yaml`:
  - installed version `0.2.4`
  - artifact SHA256 matched
  - `better-sqlite3` loaded under the current Node ABI
  - config schema and `installed+configured` checks passed
- The installer-installed package also passed the same exact Codex history
  request through a real OpenCode upstream.
- `/v1/chat/completions` with `opencode/gpt-6-luna` returned HTTP `200`.
- Virtual model `opencode-code` returned `deepseek-v4.1-flash` through all three
  protocols: `/v1/responses`, `/v1/chat/completions`, `/v1/messages`.
- `opencode/gpt-6.2-sol` is not in the current Go model set and returns an
  explicit 400; no fallback model is returned.

## Release Gates Still Pending

Production publication and deployment must run on wuxian:

1. Publish `@ohoooho/model-router@0.2.4` to npm.
2. Rebuild the tarball from the final release commit and confirm SHA256/size.
3. Regenerate the Taoxian catalog and `versions/stable.json` for OMR `0.2.4`;
   update the feed sequence.
4. Sign the catalog and feed with production keys.
5. Assemble and verify the Taoxian installer release.
6. Deploy `stable.json` and `stable.json.sig.json` together.

Do not reuse the 0.2.3 OMR artifact or feed signature for this release.
