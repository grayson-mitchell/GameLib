---
phase: 15-store-overlay-expiration-alerts
plan: 05
subsystem: discounts-badges
tags: [discounts, humble, badges, cr-01, tdd]
dependency-graph:
  requires: []
  provides:
    - "buildDiscountBadgeMaps(steamLibrary, humbleKeys) shared map-building helper (common/discounts/badges.ts)"
  affects:
    - "src/frontend/screens/Discounts/index.tsx badge rendering path"
tech-stack:
  added: []
  patterns:
    - "Shared pure helper consumed by both container and test — kills hand-decoupled fixture masking"
key-files:
  created: []
  modified:
    - src/common/discounts/badges.ts
    - src/frontend/screens/Discounts/index.tsx
    - src/backend/discounts/__tests__/badges.test.ts
decisions:
  - "steam.library entries always win on normalized-title collision when merging in waiting Humble keys (preserves D-83/D-85 owned precedence)"
  - "ownedAppIds stays derived from steam.library ONLY, never merged with Humble keys — this is what keeps an unowned-but-keyed AppID reachable as key-available instead of owned"
metrics:
  duration: ~15min
  completed: 2026-07-10
---

# Phase 15 Plan 05: Fix CR-01 — Discounts 'Key available' Badge Unreachable Summary

Extracted `buildDiscountBadgeMaps` as the single shared map-building helper consumed by both the Discounts container and its test suite, closing the structural bug where `titleToAppId` and `ownedAppIds` were both derived solely from `steam.library`, making the `'key-available'` branch of `resolveDiscountBadge` dead code.

## What Was Built

**Task 1 (RED → GREEN):** Added `buildDiscountBadgeMaps(steamLibrary, humbleKeys)` to `src/common/discounts/badges.ts`. It builds `titleToAppId` from `steam.library` first (first-wins on duplicate normalized title, unchanged from prior container logic), then merges in each waiting Humble key's `steamAppId` for titles NOT already present — guarded against falsy `steamAppId` values (`''`, `'0'`, `undefined`) using the same guard `resolveDiscountBadge` already applies. `ownedAppIds` is built from `steam.library` only, never merged with Humble keys.

Six new integration tests were added to `badges.test.ts` in a `describe('buildDiscountBadgeMaps + resolveDiscountBadge (integration)', ...)` block. These build their maps via the real helper (not hand-decoupled fixtures like the pre-existing unit tests) and were confirmed to fail before the helper existed (`buildDiscountBadgeMaps is not a function`), then pass after implementation:
- CR-01 regression: an unowned-but-keyed title now resolves to `'key-available'`.
- D-83/D-85: an owned title with a waiting key still resolves to `'owned'` (precedence preserved).
- D-79/D-82: no match in either source resolves to `null`.
- WR-01 (×3, `.each`): falsy `steamAppId` values contribute no map entry and yield `null`.

**Task 2:** Rewired `src/frontend/screens/Discounts/index.tsx` to replace the two separate `titleToSteamAppId`/`ownedSteamAppIds` `useMemo`s (both previously derived from `steam.library` alone) with a single `useMemo` calling `buildDiscountBadgeMaps(steam.library, humble.keys ?? [])`, destructured to the same variable names so the downstream `discountBadges` memo required no further changes. Dependency array: `[steam.library, humble.keys]`.

## Verification

- `npx jest badges.test.ts` — 15/15 pass (9 pre-existing unit tests + 6 new integration tests).
- `pnpm codecheck` (`tsc --noEmit`) — clean, both before and after Task 2's wiring change.
- `npx eslint` on both modified source files — clean, no warnings.
- Manual trace confirmed: a waiting Humble key whose `steamAppId` is absent from `steam.library` now produces `'key-available'` through the real container's map-building path, not just the pure resolver in isolation.

## Deviations from Plan

None — plan executed exactly as written. `buildDiscountBadgeMaps`'s parameter shape, merge order, and falsy-guard behavior match the `<behavior>` spec precisely. The container wiring in Task 2 required no changes to the downstream `discountBadges` memo or its dependency array beyond what the destructuring already provided, since the destructured names (`titleToSteamAppId`, `ownedSteamAppIds`) were kept identical to the pre-existing variable names used further down in the file.

## TDD Gate Compliance

Gate sequence confirmed in git log:
1. `test(15-05): add failing integration tests for buildDiscountBadgeMaps` (3f89ab67) — RED gate, 6 tests confirmed failing.
2. `feat(15-05): add buildDiscountBadgeMaps to make key-available reachable` (b0c3b251) — GREEN gate, all 15 tests pass.
3. `fix(15-05): wire Discounts container to buildDiscountBadgeMaps (CR-01)` (cd0eb63f) — Task 2 wiring (not part of the TDD task; `type="auto"` without `tdd="true"`).

No REFACTOR commit was needed — the GREEN implementation required no follow-up cleanup.

## Known Stubs

None.

## Threat Flags

None — this plan only touches existing display-safe fields (`title`, `app_name`, `steamAppId`) already covered by the plan's `<threat_model>` (T-15-05-01, T-15-05-02); no new network endpoints, auth paths, or schema changes were introduced.

## Self-Check: PASSED

- FOUND: src/common/discounts/badges.ts (buildDiscountBadgeMaps exported)
- FOUND: src/frontend/screens/Discounts/index.tsx (buildDiscountBadgeMaps wired)
- FOUND: src/backend/discounts/__tests__/badges.test.ts (integration describe block present)
- FOUND commit: 3f89ab67
- FOUND commit: b0c3b251
- FOUND commit: cd0eb63f
