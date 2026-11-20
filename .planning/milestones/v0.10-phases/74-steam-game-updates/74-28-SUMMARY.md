---
phase: 74-steam-game-updates
plan: 28
subsystem: steam-depot-update
tags: [gap-closure, i18n, dead-code, IN-02, IN-03, IN-04]
requires: [74-25]
provides:
  - "delta size estimate reads 'about', not 'up to', in en + 48 catalogs"
  - "retire owner = dlc ?? appId; depotOwners removed"
  - "quiet branch depot list pass (branchManifestGid log opt-out)"
affects: [depot/plan.ts, depot/select.ts, depotRust/retire.ts, public/locales/*/gamelib.json]
key-files:
  modified:
    - src/backend/storeManagers/steam/depotRust/retire.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/frontend/helpers/steamUpdateConfirm.ts
    - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
    - public/locales/*/gamelib.json (49 files, one line each)
  created:
    - .planning/phases/74-steam-game-updates/74-28-i18n-fill.json
key-decisions:
  - "KeptReason is exported and tagged @public: export alone did not satisfy knip (no importer)"
  - "collectBranchDepotList lost its now-unused appId parameter"
requirements-completed: [STEAM-01]
completed: 2026-11-13
---

# Phase 74 Plan 28: Estimate copy, retire owner, quiet branch list Summary

The delta estimate line now says "about" everywhere; the file-level fallback keeps "up to". Retire ownership is `dlc ?? appId` with the dead `depotOwners` map gone, and the branch-list pass no longer logs the public-manifest fallback.

## Commits
- 54106ebf9 fix(74-28): retire owner, KeptReason export, quiet branch list (IN-03, IN-04)
- d51b4ce54 fix(74-28): drop unused appId param from collectBranchDepotList
- 8aad62c53 fix(74-28): 'about' for the delta size estimate in all catalogs (IN-02)

## Validation
- validateTranslation (meta/machineFillGamelib.ts, meta/i18nGlossary.json): 48 pairs, 0 failures; sabotage control (dropped `{{peak}}`) rejected.
- Apply script (scratchpad, not committed) asserted byte-for-byte round trip of all 49 files first; 49 files changed, exactly one line each. No mt manifest touched (all locales already had the key).
- jest: steam backend suite 4428 passed; steamUpdateConfirm, SteamUpdateInfo, updateEstimate 21 passed. New tests: quiet branch list vs one log from branchManifestGid, decideRetirement owners (base vs DLC).
- Scoped prettier and eslint on written .ts/.tsx: clean. i18n-churn-guard: clean (exit 0).
- lint-translations:gamelib: 240 hard failures, none for sizesEstimate. They are 5 keys x 48 locales (box.error.launch.epic.{credentials,loginFailed,network}, steam.engine.markerNewer, steam.bridge.setup.steamClientUpdated); the first four were pre-existing per 74-20; steamClientUpdated is from another plan. All out of scope.

## Deviations from Plan
**1. [Rule 3] `pnpm find-deadcode` not green** - exporting KeptReason alone left a knip finding (no importer), so it is tagged `@public`. That finding is gone. The command still exits 1 on `AUTO_UPDATE_ANY_BUILD` in autoUpdateAttempts.ts, which is not from this plan (out of scope, not fixed).
**2. [Rule 1] Lint error from my own change** - first commit left `appId`/`dlcId` unused in collectBranchDepotList; fixed in a follow-up commit by removing the parameter.
Pre-existing, untouched: `pnpm codecheck` meta/gen_vtables.ts errors.

## Self-Check: PASSED
