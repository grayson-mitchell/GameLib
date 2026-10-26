---
phase: quick-261027-gtd
plan: 01
subsystem: steam-bridge-routing
tags: [known-fixes, drm, ceg, bridge-route]
requires: [quick-261027-bqe]
provides: [tier-1 drm key, knownFixSaysCeg, BridgeRouteInput.knownFixDrm, CEG seed files]
key-files:
  created:
    - src/backend/storeManagers/steam/drmKnownFix.ts
    - public/fixes/200510-steam.json
    - public/fixes/203140-steam.json
    - public/fixes/205930-steam.json
  modified:
    - src/backend/knownFixes.ts
    - src/common/types.ts
    - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
    - src/backend/storeManagers/steam/games.ts
metrics:
  completed: 2026-10-27
---

# Quick 261027-gtd: tier-1 known-fix `drm: "ceg"` Summary

A tier-1 known-fix file can now say `drm: "ceg"`. The bridge router then treats the title as a `drm-wrapped` known-bad and sends it to bottled Steam before any download. XCOM: Enemy Unknown (200510), Hitman: Absolution (203140) and Hitman: Sniper Challenge (205930) ship bundled files with `macArch: "32"` and `drm: "ceg"`, citing spike 045.

## Commits

- 3f39ef537: `drm` key (only "ceg" survives the filter at every layer, including remote), `KnowFixesInfo.drm`, never-throwing `knownFixSaysCeg`.
- 8364af3f2: `BridgeRouteInput.knownFixDrm` folded into the row-4 `knownBadReason` derivation, wired from `assembleBridgeRouteInput()`. User `bridge` and `bottle` overrides still win.
- bed8264c8: the three fix files, `TIER1_ROUTING_KEYS` and `isRoutingOnlyTier1Fix`, and the routing-only exclusion in `readGamelibFixStatus`.

## Behavior change (operator-approved 2026-10-27): GameLib fix row

A winning tier-1 file whose only keys are `title`, `notes`, `macArch` and `drm`, with at least one routing key, no longer shows the GameLib fix row. A routing hint is not a fix. Unchanged: a title-only file still shows the row (the existing ch9 test is untouched), any other tier-1 key including `launchNotice` still shows it, a tier-2 profile still shows it, and the remote layer never counts. If a local routing-only file shadows a bundled real fix, the row is hidden, because the local file wins whole-file.

Titles that now show NO GameLib row:

- 57300, 63000 and 402060. These are the macArch-only seeds from quick 261027-bqe. This is a deliberate consequence for titles that already shipped.
- 200510, 203140 and 205930, the new files.

## Deviations from Plan

None to the code. In Task 1 I wrote the tests and implementation together and did not run the RED step separately.

## Deferred Issues

`src/backend/__tests__/steamBridgeKnownFixes.test.ts` L545 ("bundled 63000 profile") fails. It asserts that `public/fixes/63000-steam.json` does not exist, but quick 261027-bqe (commit 6a158a41b) added that file. It is not caused by this plan and its test is outside `files_modified`, so I did not touch it. Logged in `deferred-items.md`. It needs a fix: drop or update that assertion.

## Verification

- Prettier `--check` was clean on all touched paths. Each path was confirmed not prettier-ignored.
- `pnpm codecheck` passes.
- Jest: the knownFixes suites, `bridgeRoute`, `games`, `macArchKnownFixRouting`, `drmKnownFix`, `library`, `macArchKnownFix` and `gamelibFixDisplay` all pass. The only failure is the pre-existing one above.
- `graphify update .` was run; its output was not committed.
- The other session's uncommitted files were not touched or staged.

## Known Stubs

None.

## Self-Check: PASSED
