---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 08
subsystem: infra
tags: [safety, steam, bridge, bottle, symlink, fail-closed, refusal-notice, cxbottle]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-05 rustSafety adapter, knownInstalls, protectedRoots, fakeSafetyRustInvoke; 82-06 pushRemovalRefusal and removalRefusedNotice; 82-07 guard-site pattern on the non-Steam path; 82-13 un-exported Steam store-manager symbols"
provides:
  - "src/backend/storeManagers/steam/safeSteamRemove.ts: steamSafetyRequest and refuseWithRemovalNotice, the Steam half of the shared guard (reused by 82-09)"
  - "uninstallBridgeGame shared-bottle branch deletes the install root only through guardedRemoveTree (trust root steamapps/common of the bridge bottle, from settings)"
  - "removePerGameBridgeBottle asks the guard before the wineserver stop and cxbottle --delete; new result status 'refused'; a symlinked bottle is only unlinked"
  - "BottleRemovalDeps (BottleLifecycleDeps + SteamSafetyDeps + RustInvokeDeps), taken by removePerGameBridgeBottle, removeSteamInstallCopy and removeAllSteamInstallCopies"
  - "bridgeRemovalSafety.test.ts: 12 cases over the real uninstall entry and the real bottle remover on tmp trees"
affects: [82-09, 82-11, 83-gamelib-core]

actuals:
  tokens: 10500
  tasks: 2
  commits: 5
plan_head_before: 20043cf5e128fd41ef78913a91fcdf94b5ae6a46
plan_head_after: 08e863eb5e6014418739c6656fdfd004beba8f0c

tech-stack:
  added: []
  patterns:
    - "A Steam guard site builds its request with steamSafetyRequest({ deps, appId }, targets), so a caller that holds only deps (the bottle remover) and one that holds the SteamGame use the same builder"
    - "The bottle remover is check, then (link: unlink | real dir: stop wineserver, cxbottle, guarded delete of whatever survived), then an existence confirmation; every non-yes step maps to refused (guard stopped it) or error (a delete ran, unconfirmed)"
    - "Guard-site tests drive the real gameUninstall.uninstall with a structural SteamGame stand-in over createTestManagerDeps, a tmp bottle tree and fakeSafetyRustInvoke; no jest.mock in the new suite"

key-files:
  created:
    - src/backend/storeManagers/steam/safeSteamRemove.ts
    - src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts
  modified:
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/removeAllCopies.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.acf.test.ts

key-decisions:
  - "The shared-bottle manifest is unlinked only after the guarded install-root delete returns removed; a refused or failed delete keeps the manifest so a second click re-runs the same checks (same ordering rule as 82-07)"
  - "removePerGameBridgeBottle takes a new BottleRemovalDeps instead of widening BottleLifecycleDeps, so the stop/kill/provision helpers and their callers keep the narrow type"
  - "steamSafetyRequest takes { appId, deps } rather than a SteamGame, which a SteamGame satisfies structurally; the bottle remover has deps and an appId but no SteamGame"
  - "A 'failed' guard outcome on the shared-bottle uninstall returns { failed: true } with the removal notice (outcome failed), replacing the old steamRequestNotice 'uninstall-failed' for the install-root delete; the manifest-unlink failure keeps failUninstall"
  - "Title for the notice is read from the raw library Map, never getGameInfo(), whose lazy metadata fetch is forbidden on the uninstall path"

patterns-established:
  - "refuseWithRemovalNotice pushes the generic notice, sends the terminal done itself (uninstaller.ts suppresses the tail done for Steam) and returns refused or failed for the callback"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "The bridge shared-bottle uninstall deletes the install root only on a guard yes; a rejected check or remove leaves the root and manifest, shows the generic removal notice (not steamRequestNotice) and returns the tile to done"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts 'shared-bottle uninstall' (5 cases incl. D-12 check rejection, remove rejection, D-16 nested install, trust-root pin)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts 'quick 261108-anw ... manifest' (updated)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-game bridge bottle removal checks the bottle before the wineserver is stopped or cxbottle runs; a non-yes verdict returns 'refused' and touches nothing; another store's install inside it is refused naming it"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "bridgeRemovalSafety.test.ts 'per-game bridge bottle removal' (yes order, D-12 rejection, D-16)"
        status: pass
      - kind: unit
        ref: "bridgeBottleLifecycle.test.ts removePerGameBridgeBottle (guarded-delete fallback, failed delete returns error)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A symlinked bridge bottle is only unlinked; its referent survives and cxbottle --delete is never run on it"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "bridgeRemovalSafety.test.ts 'D-15: a symlinked bottle is only unlinked' (precious file survives, no spawn)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every caller of removePerGameBridgeBottle handles 'refused' (uninstallBridgeGame notice, two install rollbacks and removeSteamInstallCopy log it with the reason and never count it removed)"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "pnpm codecheck (the union member is exhaustively narrowed at each site); pollsRustBranch.acf.test.ts 'folds a failed bottle removal into bottleRemoved false' with a 'refused' reason; bridgeRemovalSafety.test.ts uninstall-route cases"
        status: pass
    human_judgment: false
  - id: D5
    description: "A live sidecar-to-shell round trip through the bridge guard sites in a running app with the real Rust crate, including the crate's own isLink answer for a real symlinked bottle"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Not exercised. Every test answers the two safety channels with fakeSafetyRustInvoke; the isLink value in the symlink case is derived from lstat in the test transport, not from the crate. The crate's link handling is covered in gamelib-safety (82-03); the sidecar-to-shell channel is still unexercised live (carried from 82-05/82-07)."

duration: 70min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 08: Guard adoption on the Steam bridge removal paths Summary

**The Steam bridge's two destructive paths now ask the Rust guard first: the shared-bottle install-root delete goes through `guardedRemoveTree`, and per-game bottle removal is checked before its wineserver is stopped or `cxbottle --delete` runs, unlinking (never following) a symlinked bottle, with a new `'refused'` status that every caller handles.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-11-20
- **Tasks:** 2 (tracer, auto)
- **Files modified:** 10 (2 created, 8 modified), plus `removeAllCopies.ts` which the plan did not list (see Deviations)

## Accomplishments

- **Shared Steam helpers (`safeSteamRemove.ts`).** `steamSafetyRequest` builds the request (cross-store known installs without this game, self key `steam:<appId>`, protected roots from settings and app paths); `refuseWithRemovalNotice` pushes the generic `removalRefusedNotice`, sends the terminal `done`, and returns `refused` or `failed`. `gameUninstall.ts` is 970 lines, under the 1000-line steam ceiling.
- **Shared-bottle uninstall (D-10, D-13).** The install root is deleted through `guardedRemoveTree` with trust root `<bridge bottle steamapps>/common`, derived from the bottle name and paths, never the manifest. A refusal returns before the manifest is touched and before the poll; no `steamRequestNotice` is sent, so there is one notice, not two.
- **Bottle removal order (D-11, D-15, D-16).** `removePerGameBridgeBottle`: name guard, absent check, `checkRemoval` (kind `bottle`, trust root the CrossOver Bottles dir), then a link goes through `guardedRemoveTree` only and a real directory gets the wineserver stop, `cxbottle --delete` and a guarded delete of anything that survived. The raw `rmSync(bottleDir)` fallback is gone. A non-yes check returns `{ status: 'refused', reason, otherKey? }` having spawned nothing.
- **Callers.** `uninstallBridgeGame` returns `refuseWithRemovalNotice(...)` for `'refused'` and keeps `failUninstall` for `'error'`; both rollback sites in `gameInstallBridge.ts` and `removeSteamInstallCopy` log the reason like an error and never treat it as removed.
- **Tests.** `bridgeRemovalSafety.test.ts` (12 cases, no `jest.mock`, jestMock ceiling unchanged at 1865) covers yes, check rejection, remove rejection, nested other-store install (with the other game named in the notice), the trust-root pin against a hostile manifest, per-game yes ordering, per-game rejection, D-16, the symlink case and both uninstall-route outcomes.

## Task Commits

1. **Task 1 (tracer): shared-bottle uninstall through the guard, with its rejection test** - `c4e51620d` (feat)
2. **Task 2: per-game bottle removal guarded, `'refused'` handled by every caller** - `7fb556d22` (feat)

Tracer gate: Task 1's `<verify>` chain (jest over `bridgeRemovalSafety` and `games`, `steam-line-ceiling`, `backend-di-ceilings`, prettier file-info and check) passed before expansion; `codecheck` was re-run clean at the end of Task 2. The task has no `gate="blocking-human"`. Tracer verified end-to-end, expanded.

`commits: 5` is the measured `rev-list` count over `plan_head_before..HEAD`; two are this plan's (`c4e51620d`, `7fb556d22`). The other three (`4e920290d`, `f747e126e`, `08e863eb5`) are another session's quick-261120-ux8 commits that landed on main in between.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `removeAllCopies.ts` needed the widened deps type**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Issue:** `removeAllSteamInstallCopies` forwards its deps to `removeSteamInstallCopy`, which now needs `BottleRemovalDeps`; the file is not in the plan's `files_modified`.
- **Fix:** its deps type changed from `BottleLifecycleDeps` to `BottleRemovalDeps`; no runtime change. Its callers already pass full manager deps, so codecheck needed nothing further. I did not need to stop for a missing `libraryManagers`: every caller reaches it.
- **Files modified:** `src/backend/storeManagers/steam/removeAllCopies.ts`
- **Commit:** `7fb556d22`

**2. [Rule 3 - Blocking] A separate `BottleRemovalDeps` instead of extending `BottleLifecycleDeps`**
- The plan said to extend `BottleLifecycleDeps`. That type is also taken by `stopPerGameBridgeBottle`, `endPerGameBridgeBottleSession`, `killBridgeBottleWineServer` and the provision helpers, none of which need the guard. A distinct intersection type keeps them narrow and the test doubles for them unchanged; every caller of `removePerGameBridgeBottle` still threads the new fields, with a real `knownInstalls` list (no `null` or `[]` shortcut).

**3. [Rule 1 - Behaviour change, informational] Install-root delete failure now reports through the removal notice**
- Before, an error on the install-root `rmSync` pushed `steamRequestNotice` `uninstall-failed` via `failUninstall`. A `failed` guard outcome now pushes `removalRefusedNotice` with `outcome: 'failed'` (D-13 says the generic notice replaces the steam notice), still returning `{ failed: true }` and polling nothing. The manifest-unlink failure keeps `failUninstall` unchanged. `games.test.ts` case `261108-anw` was re-pointed at the manifest unlink (the only plain `rmSync` left on that path); the install-root failure is covered in `bridgeRemovalSafety.test.ts`.

**4. [Rule 3 - Blocking] Existing test doubles**
- `games.test.ts`: `steamTestDeps.requestRustInvoke` is now `fakeSafetyRustInvoke({ base: rustSteamFiles.requestRustInvoke })`, so the Steam-files channels still reach the recording fake. `bridgeBottleLifecycle.test.ts`: `spawnDeps` carries `libraryManagers` (each manager answers an empty list) and a default yes transport; the two cases that asserted a raw `rmSync` fallback now assert the guarded delete on the safety channel and a rejected delete returning `error`. `pollsRustBranch.acf.test.ts`: the mocked refused result carries a reason. `removeCopies.test.ts`, `macArchKnownFixRouting.test.ts` and `bridgeUpdateFollowUps.test.ts` needed no edit (they mock the remover or never reach it); all pass unchanged.

---

**Total deviations:** 4 (1 unlisted file, 1 type-shape choice, 1 behaviour note, 1 test-double update)
**Impact on plan:** none on scope or truths. Every plan truth is met; the type-shape choice narrows the blast radius.

## Issues Encountered

- A dangling symlinked bottle (`existsSync` follows the link, so a link to a missing target reads absent) returns `'absent'` at the existing step 2 and the link itself is left in place. This is the pre-existing absent check, unchanged; a dangling link holds nothing to lose, but it is not removed here.
- The first yes-path pass for a link runs the check twice on the wire (once in `removePerGameBridgeBottle`, once inside `guardedRemoveTree`), then the remove re-checks inside Rust (D-14). The extra read-only call is intentional and pinned in the symlink test.
- `moduleStateCensus.test.ts` and `diPhaseGates.test.ts` are the known pre-existing reds and were not touched; the full `storeManagers/steam` and `safety` jest run (180 suites, 4439 tests) is green.
- `pnpm planning-gates` is 11/12 on the pre-existing STATE.md `Progress` field anchor (owned by 82-11); not re-run for the STATE edit below beyond that known state.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; the two sidecar-to-shell safety channels are the ones T-82-13..16 already cover. T-82-25 (cxbottle on a symlinked bottle), T-82-26 (the `'refused'` union member) and T-82-27 (bridge install root) are mitigated and tested.

## Next Phase Readiness

- 82-09 can call `steamSafetyRequest(steamGame, targets)` and `refuseWithRemovalNotice(steamGame, ..., kind)` directly; `uninstallBottleGameDirectly`'s raw `rmSync(installRoot` is the one occurrence left in `gameUninstall.ts` (plan acceptance greps for exactly 1).
- A Steam raw-delete source gate (in the style of `nonSteamDeleteGate.test.ts`) is not part of this plan; `bridgeBottleLifecycle.ts` now has zero `rmSync`, so it can join a gate in 82-09 or 82-11 with no allowlist entry.
- The live sidecar-to-shell round trip through a guarded call site is still owed (carried from 82-05 and 82-07).

## Self-Check: PASSED

Created files exist (`safeSteamRemove.ts`, `bridgeRemovalSafety.test.ts`), commits `c4e51620d` and `7fb556d22` are ancestors of HEAD, and the chain was re-run green: jest over `bridgeRemovalSafety`, `bridgeBottleLifecycle`, `removeCopies`, `pollsRustBranch.acf`, `macArchKnownFixRouting`, `bridgeUpdateFollowUps` and `games` (908 tests) and over all of `storeManagers/steam` plus `safety` (4439 passed); `pnpm codecheck`, `pnpm steam-line-ceiling` (PASS), `pnpm backend-di-ceilings` (jestMock 1865), `pnpm find-deadcode` (PASS), prettier file-info and check and eslint (0 errors) over every TS path written. Acceptance greps: `rmSync(installRoot` in `gameUninstall.ts` 1 (the bottle-direct one, 82-09's), `refuseWithRemovalNotice` in `gameUninstall.ts` 3, `gameUninstall.ts` 970 lines, `rmSync(bottleDir` in `bridgeBottleLifecycle.ts` 0, `status: 'refused'` there 6, `checkRemoval(` at line 218 before `killBottleWineServer(deps, name)` at line 245.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
