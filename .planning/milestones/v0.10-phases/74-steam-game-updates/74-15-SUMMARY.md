---
phase: 74-steam-game-updates
plan: 15
subsystem: steam-depot-update
tags: [steam, depot, delta-update, retire, gap-closure]
requires: []
provides:
  - "DepotRefsResult.branchDepotIds / depotOwners / fetchedDlcAppIds / branchDepotListComplete"
  - "branchManifestGid shared gid rule"
  - "decideRetirement branch-aware retire rule"
  - "committed-wins outcome mapping"
affects: [74-22]
key-files:
  created:
    - src/backend/storeManagers/steam/depotRust/retire.ts
  modified:
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/acfInstalledDepots.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts
    - src/backend/storeManagers/steam/__tests__/updateBridge.test.ts
decisions:
  - "Retire rule lives in a new pure module retire.ts (keeps install.ts under the line ceiling)"
  - "Missing DLC appinfo or empty base depots makes the list incomplete: nothing retired"
metrics:
  tasks: 2
  completed: 2026-11-13
requirements: [STEAM-02]
---

# Phase 74 Plan 15: Retire rule and committed-wins Summary

An update now retires only depots absent from the branch's full PICS depot list (base + DLC), fetches their keys with the real owner app id, and a Rust-committed delta is always reported done so follow-ups run even if abort fired.

## Work

- WR-01: `buildDepotRefs` now returns the unfiltered branch depot list, declaring owners, fetched DLC ids and a completeness flag (no extra network calls). `branchManifestGid` is shared by `selectDepots` and the plan. `decideRetirement` (new `depotRust/retire.ts`) keeps selected, EResult-40-skipped, still-on-branch, list-incomplete and ACF-`dlcappid`-not-fetched depots, logs a `retire appId=... retired=[...] kept=[...]` line, and resolves owner as `depotOwners ?? ACF dlcappid ?? appId`. `AcfInstalledDepot.dlcAppId` is parsed from `dlcappid`.
- WR-06: install.ts no longer rewrites an outcome with `delta.committed === true` to cancelled; updateBridge.ts treats a committed delta (even a `cancelled` status) as done and runs follow-ups, cache invalidation and the notification.

## Commits

- 25f43b9e9: fix(74-15): branch-aware retire rule with real owners; committed delta wins over abort (both tasks, one commit since the code is interdependent)

## Deviations from Plan

- Both tasks committed together as one commit (Task 1 plan.ts fields are consumed by Task 2 in the same change). New file `depotRust/retire.ts` added (plan allowed extracting helpers). `rustDepot.ts` needed no change: runDepotJob only short-circuits to cancelled before the job starts.

## Verification

Steam jest tree: 158 suites, 4386 passed, 5 skipped. codecheck, lint (exit 0, warnings only), steam-line-ceiling, scoped prettier all pass. `graphify update .` not run.

## Self-Check: PASSED
