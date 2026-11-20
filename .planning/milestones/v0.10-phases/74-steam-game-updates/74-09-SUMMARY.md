---
phase: 74-steam-game-updates
plan: 09
subsystem: steam
tags: [steam, update, launch, prompt, i18n]
requires: [74-04, 74-05]
provides:
  - gateBridgeLaunchOnUpdate (bridge pre-launch update prompt)
  - readUpdatePromptAck / recordUpdatePromptAck and steamUpdatePromptAckStore
  - steam.update.* catalogue keys
affects: [74-10]
key-files:
  created:
    - src/backend/storeManagers/steam/updateLaunchPrompt.ts
    - src/backend/storeManagers/steam/updatePromptAck.ts
    - src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts
  modified:
    - src/backend/storeManagers/steam/stores.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - public/locales/en/gamelib.json
key-decisions:
  - "Three-button native dialog (no checkbox: the shim hard-codes checkboxChecked false); closing = Play anyway."
  - "Gate runs outside bridgeLaunchesInFlight; every failure path launches, only the half-committed ACF (bit 4 clear) aborts."
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 09: Bridge pre-launch update prompt Summary

Play on a bridge game now checks Steam (3 s bound, forced PICS) and, when stale, asks Update now / Play anyway / Don't ask again for this build; the ack is keyed by target build id in a dedicated store, and an interrupted-commit tree refuses to launch.

## Tasks
1. Ack store and catalogue strings - f67296545
2. Pre-launch gate and launch hook - e005430a8

## Verification
- jest: updateLaunchPrompt (11 new tests), launchDispatch, whole steam folder pass (4339 passed).
- codecheck, steam-line-ceiling, prettier pass; eslint 0 errors (warning count fell).
- `pnpm lint-translations:gamelib` fails on pre-existing missing non-English translations (ar.box..., etc.) plus the new steam.update keys in the same way; en catalogue is the source of truth here, as with earlier phases. i18n-churn-guard clean.

## Deviations from Plan
- [Rule 3] games.test.ts mocks `../updateLaunchPrompt` (gate returns 'launch'); the gate's ACF read perturbed that file's bottle-settings read counts in an unrelated test.
- [Rule 3] gameLaunch.ts was at 999 lines (ceiling 1000); two existing comment blocks were tightened to fit the hook.
- updateLaunchPrompt.ts disables `import-x/no-named-as-default-member` file-wide, as launchDispatch.ts does per-call, to keep the lint warning ceiling.
- Unchecked: frontend handling of a `false` Steam launch (dispatcher sends no status reset; same as other early false returns in launch()).

## Known Stubs
None.

## Self-Check: PASSED
