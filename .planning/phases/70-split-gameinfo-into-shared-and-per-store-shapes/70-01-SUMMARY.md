---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 01
subsystem: types
tags: [typescript, gameinfo, narrowing]
requires: []
provides:
  - GameInfoCore, ExtraInfoCore, InstalledInfoCore, GameInfoByRunner
  - SteamGameInfo, GogGameInfo, LegendaryGameInfo, NileGameInfo, SideloadGameInfo
  - isStoreGame, asStoreGame
affects: [70-02, 70-03, 70-04, 70-11]
key-files:
  created:
    - src/common/types/sideload.ts
    - src/common/gameInfoNarrowing.ts
    - src/common/__tests__/gameInfoNarrowing.test.ts
  modified:
    - src/common/types.ts
    - src/common/types/steam.ts
    - src/common/types/gog.ts
    - src/common/types/legendary.ts
    - src/common/types/nile.ts
    - src/backend/storeManagers/nile/library.ts
key-decisions:
  - "Expand step: fat GameInfo unchanged, wrapped in PHASE70-FLIP-PROBE fat-begin/fat-end markers"
  - "Raw Amazon entry renamed NileLibraryEntry; NileGameInfo is now the member"
  - "Unconsumed new exports tagged @public (knip) until 70-10"
requirements-completed: [ARCH-03, ARCH-03.1, ARCH-03.3]
completed: 2026-11-14
---

# Phase 70 Plan 01: GameInfo core, per-store members and narrowing Summary

Expand step of the GameInfo split: shared core, five store members born in their store files, split nested shapes, and the `isStoreGame`/`asStoreGame` guards, with the fat `GameInfo` untouched so tsc stays green.

## D-14 evidence

Phase 69 `69-VERIFICATION.md` has `status: passed`; `69-HUMAN-UAT.md` has `result: pass` at lines 19, 23, 27 (items 1-3).

## Re-measured facts (vs RESEARCH)

- Fat `GameInfo` top-level fields: 38 (matches).
- `phase70Passthrough(` call sites: 6 in 5 files (install.ts x2, gameDetails.ts, settings.ts, steam.ts, wineTools.ts), matches. (A seventh grep hit is a doc comment in schemaTypes.ts.)
- Store-only field readers outside storeManagers: a word-grep of the 20 store-only names over non-test src/frontend and src/backend lists 51 files. This is noisier than RESEARCH's 19-file inventory because it matches common words (`namespace`, `installable`, `version`-like tokens) and includes backend non-manager files (save_sync, downloadqueue, launcher, etc.). Not reconciled file by file; plan 03's flip probe gives the exact tsc count.
- Nested key setters (grep under storeManagers): every GOG nested key (isDosbox, dosboxConf, installedWithDLCs, installedDLCs, versionEtag, buildId, pinnedVersion, cyberpunk) is referenced only under `gog/`; every `steamResume*` key only under `steam/`. All classified store-only; none shared.

## Deviations from Plan

- Tasks 1 and 2 share one commit (0afdf64cb): the NileLibraryEntry rename and the NileGameInfo member live in the same file, so they were not split.
- [Rule 3] knip flagged `SteamExtraInfo`, `SteamInstalledInfo`, `GogInstalledInfo` as new dead types; tagged `@public` (same justification as the narrowing exports; baseline untouched).
- `GameInfoByRunner` was not flagged by knip, so it carries no tag.

## Commits

- 0afdf64cb: core, members, nested split, NileLibraryEntry rename
- c2bb004a3: narrowing module and tests (27 tests)

## Verification

tsc clean; `jest src/common` 550 pass; rendererZodGuard 8 pass; `pnpm find-deadcode` PASS with `meta/knip-baseline.txt` unchanged; prettier and eslint clean (warnings pre-existing). `storeCapabilities.ts` unmodified. Did not run `pnpm lint` or `pnpm boundaries` in full.

## Known Stubs

None.

## Self-Check: PASSED
