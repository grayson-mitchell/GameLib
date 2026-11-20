---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 11
subsystem: types
tags: [gameinfo, discriminated-union, drift-guard, contract-step]
requires: [70-10]
provides:
  - "GameInfo = SteamGameInfo | GogGameInfo | LegendaryGameInfo | NileGameInfo | SideloadGameInfo"
  - "ExtraInfo / InstalledInfo carry shared keys only"
  - "Expect<Equal<GameInfoByRunner[Runner], GameInfo>> drift guard with negative control"
affects: [phase-70-verification]
key-files:
  modified:
    - src/common/types.ts
    - src/common/types/steam.ts
    - src/common/types/gog.ts
    - src/common/__tests__/gameInfoNarrowing.test.ts
    - meta/__tests__/gameInfoNarrowingCeiling.test.ts
    - package.json
    - src/backend/storeManagers/gog/__tests__/library.test.ts
    - src/backend/storeManagers/legendary/__tests__/legendaryRuntime.test.ts
    - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  deleted:
    - meta/gameInfoFlipProbe.cjs
    - meta/__tests__/gameInfoFlipProbe.test.ts
key-decisions:
  - "The filterEngine stray-is_delisted GOG fixture is built by spreading is_delisted onto a GOG makeGame result (no cast, assertion unchanged), keeping the test's intent: a non-Steam record carrying is_delisted."
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 11: Flip GameInfo to the union Summary

`GameInfo` is now the flat discriminated union over the five store members, the fat interface and all `*Core` nested names are gone, the drift guard is in place, and the temporary flip probe is removed.

## Commits

- 21f076f6d test(70-11): type fixtures as their union member so tests compile under the flip
- 8dd198b40 feat(70-11): flip GameInfo to the union, fold core names, drop the flip probe

## What changed

- Task 1: by the time this plan ran, earlier plans had already fixed most listed test files. The probe reported only three: `gog/__tests__/library.test.ts` (typed as `GogInstalledInfo`), `legendary/__tests__/legendaryRuntime.test.ts` (the pre-flip tsc error; typed as `LegendaryGameInfo`), `filterEngine.test.ts` (is_delisted fixture). No `expect(` line changed. Probe `--only src/` was 0 across the repo before the flip.
- Task 2: `GameInfo` union replaces the fat region; `ExtraInfoCore`/`InstalledInfoCore` folded into `ExtraInfo`/`InstalledInfo`; Steam and GOG members extend them; store-keys regions deleted. Drift guard with `@ts-expect-error` negative control added. Probe script, test and package.json script removed.

## Deviations from Plan

**1. [Rule 1 - Bug] Stale test from 70-10** `meta/__tests__/gameInfoNarrowingCeiling.test.ts` "exits 1 naming the baseline when it is missing" ran the CLI with no args, assuming no baseline; 70-10 froze the baseline so it exited 0. Now passes an absent `--baseline` path. Not in the plan's file list.

**2. [Rule 1] Unused import** `GameMetadataInner` in `src/common/types.ts` became unused after the fold (lint error); removed.

No baseline JSON change was needed (ratchet reports PASS, 783 files, 18 allowlisted).

## Acceptance-grep notes

- `grep -cE "steamPlaytimeMinutes|steamResumePending|isDosbox|buildId" src/common/types.ts` returns 2 not 0: both hits are in the unrelated `GOGImportData` interface (a doc comment sample and `buildId: string`), present before and after the edit. No store key remains on `InstalledInfo`/`ExtraInfo`; this check cannot distinguish them, so it is not a clean pass.
- `git diff -U0 -- '*.test.ts' | grep -c "^[-+].*expect("` was run before staging and counted 0 changed expect lines, but only over the Task 1 files; the ceiling-test edit in Task 2 changed a `run([...])` call, not an expect.

## Verification

`pnpm codecheck` clean (tsc incl. meta); `pnpm find-deadcode`, `pnpm boundaries`, `pnpm gameinfo-narrowing-ceiling` pass; `pnpm lint` 0 errors (994 warnings, pre-existing kind). `npx jest --selectProjects Backend Common Frontend Meta`: remaining failures are all outside this plan's surface and not touched by it: shimCoverage/shimGenerate and epicOfflineMode (known), and tauriShellSource (Rust dispatch counts), dxvkInstallRemove, genI18nGateScope, gamelibCatalogParity, lintTranslations (missing gamelib locale keys), x86CallbackWineHarness (Wine crash). Not investigated further and not fixed.

## Known Stubs

None.

## Self-Check: PASSED
