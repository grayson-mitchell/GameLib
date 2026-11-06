---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 13
subsystem: steam-bridge
tags: [drm, removal, i18n, build]
requires: [56-12]
provides: [Phase 52 forwarder fully removed]
affects: [56-14, 56-15]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/constants/paths.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - meta/i18nCatalogPresenceBaseline.json
    - public/locales/*/gamelib.json
    - public/locales/*/gamelib.mt.json
  deleted:
    - src/backend/storeManagers/steam/bridge/steamClientSetup.ts
    - src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts
    - native/steam-bridge/steamclient/steamclient_fwd.c
    - native/steam-bridge/steamclient/steamclient_fwd.rc
decisions:
  - "D-14 done: no forwarder fallback remains; the DRM mode is the only .bind route"
metrics:
  tasks: 3
  completed: 2026-10-28
---

# Phase 56 Plan 13: Phase 52 forwarder removal Summary

The Phase 52 SteamStub forwarder is gone from the sidecar, the i18n catalogs and the shim build; the 56-12 DRM branch is the only route for a `.bind` exe.

## Commits
- 553ff6781 test: games.test.ts forwarder describe replaced by `D-14 (56-13): Phase 52 forwarder removed` (RED)
- f8a00423a feat: sidecar removal (GREEN)
- 34a1e4e0f chore: steamstub keys removed from catalogs
- bdf1a378c test: buildSteamBridgeShims absence tests and B5 count 4 (RED)
- d5827a33e feat: forwarder compile code and native source removed (GREEN)

## Removed
- Files: steamClientSetup.ts + test, native/steam-bridge/steamclient/ (2 files).
- games.ts: import, two session Sets, `maybeNotifySteamStubUnforwarded/Forwarded`, the `drmWrapper` local, the no-steam-api/withheld notice call, the forwarder block (about 170 lines net removed). The stale-clear block (`freshDrm`) is kept with a rewritten comment.
- paths.ts: `builtBridgeSteamClient64Path`.
- buildSteamBridgeShims.ts: forwarder consts, argv, byproducts, `compileSteamClient64`; `main` runs compileHelper, stageSteamAppId, compileShim, compileShim64.
- Stale artifacts: `public/bin/arm64/darwin/steamclient64.dll` deleted (no .pdb/.lib present).

## i18n sweep
49 gamelib.json and 48 gamelib.mt.json edited by a canonical-serialisation-asserting script: 6 lines removed per catalog, 4 per manifest, 0 trailing-comma repairs. `pnpm i18n` left en byte-identical. Baseline diff: `generatedAt` only; steam.bridge.drm.* intact.

## For 56-15
- Release bundle no longer contains steamclient64.dll.
- The first DRM launch of a previously forwarder-set-up bottle is where 56-09's forwarder cleanup runs live.

## Remaining forwarder mentions outside this plan
- `src/backend/storeManagers/steam/bridgeKnownFixes.ts:198`: comment cites deleted `steamClientSetup.ts` (not edited).
- `public/bin/.gitignore:40` `**/steamclient64.dll` (kept on purpose).
- 56-14-owned comments (gen_vtables.ts, peSections.ts, electronStores.ts) were not touched.
- The outline grep `setupSteamClientForwarder|builtBridgeSteamClient64Path|forwardedTitle|steamclient_fwd` over src meta native public/locales/en is clean.

## Deviations from Plan
- The games.test.ts `steamStubTrace` helper builds its search tokens by concatenation (`'steam' + 'stub'`) so the plan's own grep gate over src finds no literal.
- Removed the one `setupSteamClientForwarder` reference in the 56-12 Phase 56 describe (`shimLike` list), as the plan directed.

## Verification
- games.test.ts + fakeHomeIsolation: only the known quick 261024-tny failure. buildSteamBridgeShims 44/44; drm suites + bridgeCensus pass; gamelibCatalogParity, lintTranslations, churn guard pass.
- codecheck, scoped prettier and eslint (0 errors), lint-translations:gamelib pass. findDeadcode: only the 3 known pre-existing findings. Repo-wide `pnpm lint` and `pnpm find-deadcode` not run to green (pre-existing worktree pollution/known findings).
- `requirements.mark-complete`: REQUIREMENTS.md missing (known).

## Known Stubs
None.

## Self-Check: PASSED
Commits above exist; deleted paths absent.
