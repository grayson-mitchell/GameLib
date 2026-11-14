---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 10
subsystem: tooling
tags: [gameinfo, ratchet, ci, knip]
requires: [70-02, 70-04, 70-05, 70-06, 70-07, 70-08, 70-09]
provides:
  - frozen D-15 narrowing baseline with reasons
  - ratchet wired into lint.yml and .husky/pre-push, pinned by a wiring test
affects: [70-11]
key-files:
  created:
    - meta/gameInfoNarrowingBaseline.json
    - meta/__tests__/gameInfoNarrowingWiring.test.ts
  modified:
    - package.json
    - .github/workflows/lint.yml
    - .husky/pre-push
    - src/common/gameInfoNarrowing.ts
    - src/common/types/steam.ts
    - src/common/types/gog.ts
    - src/frontend/hooks/hasStatus.ts
key-decisions:
  - "SteamExtraInfo is no longer exported (used only inside steam.ts) rather than keeping an @public tag"
requirements-completed: []
duration: 25min
completed: 2026-11-14
---

# Phase 70 Plan 10: Freeze narrowing baseline and wire the ratchet Summary

Non-test tree proven flip-ready (probe `--non-test --only src/` exits 0), D-15 baseline frozen at 18 files with a reason each, ratchet enforced in CI and pre-push.

## Commits
- c4e63cda3: freeze baseline, fix hasStatus straggler, remove @public tags from gameInfoNarrowing.ts
- 95e7156ed: remove remaining 70-01 @public tags (steam.ts, gog.ts)
- fabe5188e: package.json script, lint.yml step, pre-push line 2, wiring test

## Readiness proof
Probe initially failed on one straggler: `src/frontend/hooks/hasStatus.ts` (3 errors, spread-destructure of `{ ...newGameInfo }` of an optional union). Fixed with optional-chained reads (`newGameInfo?.thirdPartyManagedApp`, `?.is_installed`, `?.runner ?? 'sideload'`), behavior unchanged. Within the 3-file straggler allowance. Remaining probe findings are tests only (owned by later plans).

## Frozen allowlist (file: count, reason)
- downloadmanager/downloadqueue.ts: 1, Legendary isEAManaged/isUbisoftManaged routing
- launcher.ts: 1, Legendary namespace in shared launch path
- macArch/recovery.ts: 1, GOG install.installedDLCs
- frontend/helpers/stores.ts: 4, per-store typed cache stores (all four member types)
- hooks/hasAnticheatInfo.ts: 1, Legendary namespace
- hooks/hasStatus.ts: 2, Legendary EA/Ubisoft flags; Steam install.steamResumePending
- GamePage/components/AppleWikiInfo.tsx: 1, Steam steamPlatformsCaptured
- GamePage/components/DownloadSizeInfo.tsx: 1, Legendary isEAManaged
- GamePage/components/InstalledInfo.tsx: 1, Legendary isEAManaged
- GamePage/components/MainButton.tsx: 2, Steam steamResumePending + is_delisted
- GamePage/index.tsx: 1, Legendary fields
- GameSubMenu/index.tsx: 1, Steam is_delisted
- TimeContainer/index.tsx: 2, Steam extra playtime fields
- Library/components/GameCard/index.tsx: 2, Steam installable + is_delisted
- InstallModal/ThirdPartyDialog/index.tsx: 1, Legendary application_name
- InstallModal/index.tsx: 1, Steam fields select Steam dialog
- Library/filterEngine.ts: 1, Steam is_delisted
- Library/librarySort.ts: 1, Steam extra.steamLastPlayed

Shrink candidates (not refactored here): the Legendary isEAManaged readers (DownloadSizeInfo, InstalledInfo, hasStatus, GamePage) could take a core/structural prop; the Steam is_delisted readers (MainButton, GameSubMenu, GameCard, filterEngine) could share one helper or a core field; stores.ts could be exempted as store-typed cache plumbing.

## Deviations
- [Rule 3] The plan named `@public` tags in gameInfoNarrowing.ts and types.ts; 70-01 actually placed them in gameInfoNarrowing.ts, types/steam.ts and types/gog.ts. All removed. Removing the tag on `SteamExtraInfo` made knip flag it (no external consumer), so it was un-exported. SteamInstalledInfo and GogInstalledInfo have real production consumers.
- The plan listed src/common/types.ts as modified; it was not touched.

## Acceptance-grep notes
`grep -c "@public" src/common/gameInfoNarrowing.ts src/common/types.ts` was already 0 for types.ts before and after, so it cannot detect regressions there; the real check was `grep -rn "@public" src/common`, which showed the three leftovers fixed above.

## Verification
Probe exit 0; ratchet PASS (783 files, 18 allowlisted); find-deadcode PASS; tsc has exactly the 1 known legendaryRuntime.test.ts error; four wiring/tsconfig jest suites pass (25 tests); prettier clean on all checked paths. .husky/pre-push is not prettier-checkable.

## Self-Check: PASSED
