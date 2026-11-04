---
phase: quick-261104-rvy
plan: 01
subsystem: steam-settings
tags: [steam, macos, settings, getSettings]
key-files:
  created:
    - src/backend/storeManagers/steam/titleSettings.ts
    - src/backend/storeManagers/steam/__tests__/titleSettings.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts
    - src/backend/storeManagers/steam/engine/engineDecision.ts
completed: 2026-11-04
---

# Quick 261104-rvy: Bottle-eligible Steam per-title settings

`getSettings()` for bottle-eligible Steam titles now merges 11 allowlisted per-title keys from `GamesConfig/<appId>.json` over the bottle settings, so saved values survive reopen and apply at launch.

## Commits
- 3f820c7b5 feat: titleSettings.ts (readStoredTitleConfig, TITLE_AUTHORITATIVE_KEYS, pickTitleSettings); overlay/engine readers delegate
- 1cc26ea94 fix: getSettings() merge + per-key regression tests
- 545c6a806 docs: todo moved to completed/ with status + Resolution

## Allowlist correction
`alternativeExe` and `preferedLanguage` were frontend component names, not GameSettings keys. Mapped to `targetExe` (already listed) and `language`. Final list is 11 keys. `TITLE_AUTHORITATIVE_KEYS` is `as const satisfies readonly (keyof GameSettings)[]` so the test value map is exhaustive at typecheck.

## Behaviour
- Title value wins only for allowlisted keys, when `!== undefined`.
- wineVersion/winePrefix/wineCrossoverBottle never taken from the title file (tested).
- With nothing stored, the bottle settings object itself is returned (D1 `toBe` passes).
- G11/G3 semantics unchanged.

## Verification
- `npx jest src/backend/storeManagers/steam`: 118 suites passed, 4529 tests passed, 2 skipped.
- `pnpm codecheck`: clean (after typing the allowlist `as const satisfies`).
- `pnpm planning-gates`: 12/12 passed.
- Prettier clean on all code paths; the todo file is prettier-ignored (`--file-info` ignored: true), check omitted.

## Deviations
Allowlist-type tweak: initial `readonly (keyof GameSettings)[]` made the test's `Record<...>` demand every GameSettings key; changed to `as const satisfies` (Rule 3). Otherwise as planned. games.ts/games.test.ts had concurrent 60-20 changes that were committed by another agent before my edits, so my commits contain only my hunks.

## Self-Check: PASSED
