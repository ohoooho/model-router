# OMR 0.2.3 Release

- Date: 2026-11-22
- Status: published to npm; Taoxian feed signing/deploy pending
- Branch: `release/omr-0.2.3`
- Base: `upgrade/ccr-3.1.5` @ `dc39d7b` (CCR 3.1.5)
- Package: `@ohoooho/model-router@0.2.3`
- Artifact: `ohoooho-model-router-0.2.3.tgz`
- SHA256: `441ac72aa4247c5cf0793533e41eedb7b31c9fa336189e1039774dc1dca81077`
- Size: `6653716` bytes
- npm integrity: `sha512-0dvJcZBk1e3li8qBxpH6UJVOyPQiJUevxjEWfeZxiRylHyXxCeiI6tmZJDjLfLN0u78knqY5lTVbn87qnimArg==`
- npm shasum: `ea966aaa0fe1a2e15d169af0f2c83f98d4d36830`

## Highlights

- New **工具模型选配** page with card layout for stable model call IDs.
- Built-in scenes (`coding-auto`, `assist-auto`, `chat-auto`, `team-auto`,
  `trial-auto`) are shown as editable recommended entries.
- Provider refresh now reads the provider `name` field as a model display name.
  OpenCode `deepseek-v4.1-flash` is shown as `DeepSeek V4.1 Flash 1017`.
- Codex catalog exposes model-entry and scene aliases without the `Fusion/`
  prefix; legacy Fusion profiles keep it.
- Installer re-runs preserve user-selected scene models and only fill missing
  profiles / `baseModel` values.
- 401 handling shows a re-authentication screen while retaining CLI guidance.
- Local console uses OHO branding and the `omr://open` protocol.

No database tables or columns were added. Model entries continue to use the
existing `virtualModelProfiles` JSON array.

## Build

- Node `v24.16.0`, npm `11.13.0`.
- `npm run typecheck` passed.
- Two clean packs from the same tree were byte-identical.
- `install/component.yaml` now records the artifact SHA256, size, and npm
  integrity above.

## Registry Publication

- `@ohoooho/model-router@0.2.3` is published under the `latest` dist-tag.
- The registry tarball was downloaded and hashed after propagation:
  `441ac72aa4247c5cf0793533e41eedb7b31c9fa336189e1039774dc1dca81077`
  (`6653716` bytes), matching the tested artifact byte-for-byte.
- Registry `dist.shasum` is `ea966aaa0fe1a2e15d169af0f2c83f98d4d36830`;
  `dist.integrity` is
  `sha512-0dvJcZBk1e3li8qBxpH6UJVOyPQiJUevxjEWfeZxiRylHyXxCeiI6tmZJDjLfLN0u78knqY5lTVbn87qnimArg==`.

## Verification

Source gates:

- Architecture: `8/8` passed.
- CLI: `6/6` passed.
- UI: `219` tests, `215` passed, `4` known baseline failures.
- Core targeted suites:
  - Codex model catalog: `31/32` passed; the existing local-cache fallback
    test remains the only failure.
  - Provider probe: `23/26` passed, including the new display-name test; the
    three OAuth-default tests are pre-existing failures.
- Installer regressions:
  - `install/test-baozi-runtime-profiles.sh` passed.
  - `install/test-reinstall-preserves-config.sh` passed.

Packaged runtime:

- Installed the `0.2.3` tarball into an isolated prefix and temporary HOME.
- `/health` returned `status: "running"`; UI returned HTTP `200`.
- Real model output through OMR:
  - model: `coding-auto`
  - content: `OMR_023_OK`
  - upstream: `deepseek-v4.1-flash-1017`
  - usage: `39` prompt tokens, `44` completion tokens, `83` total.
- UI smoke check:
  - 8 model cards rendered.
  - Provider binding default checked.
  - All five usage chips visible.
  - OpenCode model selector contains `DeepSeek V4.1 Flash 1017`.
  - `page_errors=0`.

## Remaining Release Gates

Production signing and deployment must run on wuxian:

1. Rebuild/confirm the exact tarball from the final release commit.
2. Regenerate the Taoxian catalog and `versions/stable.json` for OMR `0.2.3`,
   feed sequence `5`.
3. Sign the catalog and feed with production keys.
4. Assemble and verify the Taoxian installer release.
5. Deploy `stable.json` and `stable.json.sig.json` together.

Do not reuse the stale `versions/stable.json.sig.json` or the 0.2.2 OMR
artifact for this release.
