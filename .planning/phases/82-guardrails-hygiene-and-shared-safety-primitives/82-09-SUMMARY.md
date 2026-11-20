---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 09
subsystem: infra
tags: [safety, steam, bottle, copy-removal, cancel-install, fail-closed, refusal-notice, source-gate]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-05 rustSafety adapter, knownInstalls, protectedRoots, fakeSafetyRustInvoke; 82-06 pushRemovalRefusal; 82-08 steamSafetyRequest and refuseWithRemovalNotice; 82-13 un-exported Steam symbols"
provides:
  - "uninstallBottleGameDirectly deletes the install root only through guardedRemoveTree (trust root: the bottle's steamapps/common from settings), after every existing refusal"
  - "removeCopyViaRust asks checkRemoval on the copy root (cross-store known installs) before Rust remove_copy; a non-yes verdict returns refused with a typed safety field and remove_copy is never called"
  - "removeNativeInstallDirectly turns a safety refusal into the generic removal notice"
  - "deleteCancelledSteamInstall checks the partial root before its final in-flight re-check; the delete stays one synchronous Node delete"
  - "src/backend/storeManagers/steam/installdirShape.ts: installdirShape and rawInstalldirFromInstallPath, shared by gameUninstall and acfState"
  - "steamDirectRemovalSafety.test.ts (12 cases) and steamDeleteGate.test.ts (Steam raw recursive-delete source gate)"
affects: [82-11, 82-12, 83-gamelib-core]

actuals:
  tokens: 11200
  tasks: 3
  commits: 4
plan_head_before: 25283194c8aadfd53b1ba787e6711f721d14e6e6
plan_head_after: 7800d5a70c6c8c1171bc77bb0170a555fbae893b

tech-stack:
  added: []
  patterns:
    - "A Steam copy-removal refusal from gamelib-safety rides on RemoveCopyResult.safety, so Phase 80's own refusal reasons keep today's behaviour and only a safety refusal gets the generic notice"
    - "The copy pre-check places the copy only when installPath is exactly <steamapps>/common/<one plain folder>; anything else is left to remove_copy's own installdir_shape refusal (D-21)"
    - "A cancel-cleanup refusal pushes the notice without a tile done: the cancel route's removeFromQueue already settled the tile"

key-files:
  created:
    - src/backend/storeManagers/steam/installdirShape.ts
    - src/backend/storeManagers/steam/__tests__/steamDirectRemovalSafety.test.ts
    - src/backend/safety/__tests__/steamDeleteGate.test.ts
  modified:
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
    - src/backend/storeManagers/steam/__tests__/staleQueueHeadCancel.regression.test.ts

key-decisions:
  - "The copy pre-check reads readAcfState for the installPath and derives the trust root from it only when the installdir is one plain folder under a folder named common; Rust builds installPath unnormalised, so that parent is the steamapps dir Rust scanned, not a manifest-supplied value"
  - "cancelDelete runs checkRemoval only when conflicting is empty, i.e. only when the root is about to be deleted; a shared installdir removes the manifests alone and never asks the guard"
  - "installdirShape and rawInstalldirFromInstallPath moved to their own module (gamesModuleSurface forbids a lifted module re-exporting), which also took ~40 lines off gameUninstall.ts (953 lines, under the 1000 ceiling)"
  - "The bottle-direct request reuses commonRoot already derived from the bottle settings in the function, rather than recomputing it"

patterns-established:
  - "removeSteamInstallCopy's refused variant carries safety?: { reason, otherKey? } for a gamelib-safety refusal"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "The bottle-direct uninstall deletes the install root only on a guard yes, with the bottle common dir as trust root; a rejected check or remove keeps root and manifest, pushes one generic notice (kind uninstall) and sends done once"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "steamDirectRemovalSafety.test.ts 'bottle-direct uninstall' (yes, trust-root pin, D-12 check rejection, D-12 remove rejection)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-09 nested-installdir row at the TS call site: another known install under common/Studio/GameB refuses naming it and deletes nothing, with the request carrying the other game's folder"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "steamDirectRemovalSafety.test.ts 'D-09 nested installdir row' (fake verdict case and an end-to-end case whose verdict is computed from the request's knownInstalls)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Copy removal (native uninstall, remove-copies) runs checkRemoval before Rust remove_copy; a non-yes verdict returns refused and remove_copy is not invoked; an absent or unplaceable copy skips the check"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "steamDirectRemovalSafety.test.ts 'copy removal pre-check' (yes order, D-12 rejection, D-16 other store, sweep counts refused, absent, nested installdir)"
        status: pass
      - kind: unit
        ref: "games.test.ts 'Phase 82 D-13/D-16: a copy refused by gamelib-safety pushes the generic removal notice and sends done once'"
        status: pass
    human_judgment: false
  - id: D4
    description: "The cancelled-install cleanup checks the partial root before its final in-flight re-check; a non-yes verdict keeps files and breadcrumb and pushes a cancel-install notice; a symlinked partial root is unlinked and its referent survives"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "cancelDelete.test.ts 'Phase 82 safety pre-check' (trust-root pin, D-12 rejection, D-16 other store, shared installdir asks nothing, D-15 symlink)"
        status: pass
    human_judgment: false
  - id: D5
    description: "gamelib-steampoll's remove_copy and guard_install_root are unchanged (D-21)"
    requirement: FND-02
    verification:
      - kind: command
        ref: "git diff --quiet 58a0c1c7a -- src-tauri/crates/gamelib-steampoll/src exits 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Steam guarded files cannot regain an unguarded recursive delete: only cancelDelete's allowlisted critical-section delete is found"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/safety/__tests__/steamDeleteGate.test.ts (floor 4, empty input throws, allowlist not stale, seeded delete caught in each file)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A live sidecar-to-shell round trip through the Steam guard sites in a running app with the real Rust crate, including the crate's own answers for a real nested install and a real symlinked partial root"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Not exercised. Every test answers the two safety channels with fakeSafetyRustInvoke (or a request-derived variant in the test file); the crate's nested-install and link logic is covered in gamelib-safety (82-03). The sidecar-to-shell channel is still unexercised live (carried from 82-05, 82-07 and 82-08)."

duration: 65min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 09: Steam direct, copy and cancel removal guarded Summary

**The three remaining Steam delete paths now ask gamelib-safety first: the bottle-direct install root goes through `guardedRemoveTree` with the nested-installdir row proven at its TS call site, every copy removal is checked against other stores' installs before Rust `remove_copy`, and the cancelled-install cleanup is pre-checked inside its Phase 75 critical section, with a source gate holding all four Steam files free of raw recursive deletes.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-11-20
- **Tasks:** 3 (tracer, auto, auto)
- **Files:** 11 changed (3 created, 8 modified)

## Accomplishments

- **Bottle-direct uninstall (D-09, D-12, D-13).** After every existing refusal (numeric appId, location, ACF unknown/downloading, installdir shape, other-manifest conflict), `uninstallBottleGameDirectly` deletes the root through `guardedRemoveTree` with trust root `commonRoot` (derived from the bottle settings). A `refused`/`failed` outcome returns `refuseWithRemovalNotice` with the manifest kept; `removed` unlinks the manifest and finishes through `pollUninstallOnce`. The raw `rmSync(installRoot` is gone.
- **Copy removal pre-check (D-16, D-21).** `removeCopyViaRust` reads the copy's state, places `<steamapps>/common/<folder>` and runs `checkRemoval` with the cross-store known installs before Rust `remove_copy`. A non-yes verdict returns `{ status: 'refused', reason, safety: { reason, otherKey? } }` and `remove_copy` is not called; an absent, mid-download, unreadable or unplaceable (nested/dotted installdir) copy goes to `remove_copy` as before. `removeNativeInstallDirectly` pushes the generic notice for a `safety` refusal and keeps today's behaviour for Phase 80's own reasons. `removeAllSteamInstallCopies` counts the refusal. `gamelib-steampoll` is untouched.
- **Cancel-delete pre-check (D-16).** `deleteCancelledSteamInstall` runs `checkRemoval` (kind `game-install`, trust root `common`) after the conflicting-manifest scan and before the final in-flight re-check; a non-yes verdict keeps files and breadcrumb and pushes a `cancel-install` notice. The delete stays a synchronous Node delete directly after the re-check, commented as pre-checked. `downloadqueue.ts` threads `libraryManagers` and the protected-roots path fields into the cleanup's deps.
- **Source gate.** `steamDeleteGate.test.ts` scans `gameUninstall.ts`, `cancelDelete.ts`, `bridgeBottleLifecycle.ts` and `library/acfState.ts` (floor 4); the only offender is cancelDelete's critical-section delete, allowlisted by function name with its reason and asserted still present.

## Task Commits

1. **Task 1 (tracer): bottle-direct final delete through the guard, with the nested-installdir row** - `4cd9ebfd1` (feat)
2. **Task 2: copy-removal and cancel-delete pre-checks** - `9b0486bbb` (feat), plus `7800d5a70` (fix, see Deviations)
3. **Task 3: Steam raw recursive-delete source gate** - `6eeb4f11d` (test)

Tracer gate: Task 1's `<verify>` chain (jest over `steamDirectRemovalSafety`, `games` and `bridgeRemovalSafety`, codecheck, steam-line-ceiling, backend-di-ceilings, prettier file-info and check) passed before expansion; no `gate="blocking-human"` on the task. Tracer verified end-to-end, expanded.

`commits: 4` is the measured `rev-list` count over `plan_head_before..HEAD`, all this plan's.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] installdirShape moved to its own module, and a fix commit for its import**
- **Found during:** Task 2
- **Issue:** `acfState.ts` needs the installdir shape check, and importing it from `gameUninstall.ts` would be circular (gameUninstall imports acfState). The first fix re-exported the two functions from `gameUninstall.ts`, which `gamesModuleSurface.test.ts` forbids (lifted modules re-export nothing).
- **Fix:** `installdirShape.ts` holds `installdirShape` and `rawInstalldirFromInstallPath` (pure, no state); `gameUninstall.ts` and `acfState.ts` import them, and `games.test.ts` imports them from the new module.
- **Files modified:** `installdirShape.ts` (new), `gameUninstall.ts`, `acfState.ts`, `games.test.ts`
- **Commits:** `9b0486bbb`, `7800d5a70`

**2. [Rule 3 - Blocking] Existing test doubles answer the safety channels**
- `removeCopies.test.ts`, `cancelDelete.test.ts` (both its `steamTestDeps` and the rust-branch `run` helper, which replaced `requestRustInvoke` with the bare stub) and `staleQueueHeadCancel.regression.test.ts` now wrap their transport in `fakeSafetyRustInvoke({ base })`. `downloadqueue.test.ts`, `pollsRustBranch.acf.test.ts` and `macArchKnownFixRouting.test.ts` needed no edit. `games.test.ts` gained one case (native fallback with a safety refusal) rather than a deps change.

**3. [Rule 2 - Scope choice, informational] cancel-delete asks the guard only when it will delete the root**
- The plan says to run `checkRemoval` on the install root; when `conflicting` is non-empty the root is kept and only the manifests go, so asking the guard would block a harmless manifest cleanup on an unknown verdict. The check is skipped on that branch (tested).

**4. [Informational] The cancel refusal sends no `done`**
- The plan says to send `done` "where the route owns it". The cancel route's `removeFromQueue(..., true)` already settles the tile, so the cancel refusal pushes the notice only (via `pushRemovalRefusal`, not `refuseWithRemovalNotice`).

**5. [Informational] Native-copy notice covered through `games.test.ts`**
- `removeNativeInstallDirectly` is private and its entry routes need a running-Steam decision; its notice mapping is proven in `games.test.ts` with a mocked `removeSteamInstallCopy` result, and the copy-removal function itself is proven in `steamDirectRemovalSafety.test.ts`.

---

**Total deviations:** 5 (1 structural move, 1 test-double update, 3 informational)
**Impact on plan:** none on truths; every plan truth is met.

## Issues Encountered

- Hoard's appId `63000` is seeded as a 32-bit Mac title by the curated known-fix table, which routes `uninstall()` to guided bottle setup; `steamDirectRemovalSafety.test.ts` uses `4242001` and a native-Mac metadata record so the route reaches the bottle-direct branch. `jest.replaceProperty(environment, 'isMac', true)` makes the routing host-independent without a new `jest.mock` (jestMock ceiling unchanged at 1865).
- `moduleStateCensus.test.ts` and `diPhaseGates.test.ts` are the known pre-existing reds (`X86_NULL_OBJECT_VERSION_SET`) and were not touched. Full `storeManagers/steam`, `safety` and `downloadmanager` jest runs: 187 suites, 4562 passed, 3 skipped.
- `pnpm planning-gates` was not re-run beyond the known 11/12 STATE.md anchor owned by 82-11.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema; the two safety channels are the ones T-82-13..16 cover. T-82-28 (bottle-direct), T-82-29 (copy removal) and T-82-30 (cancel-delete) are mitigated and tested.

## Next Phase Readiness

- The live sidecar-to-shell round trip through a guarded Steam call site is still owed (carried from 82-05, 82-07 and 82-08).
- `gameUninstall.ts` is 953 lines; the Steam raw-delete gate now exists for 82-11/82-12 to extend.

## Self-Check: PASSED

Created files exist (`installdirShape.ts`, `steamDirectRemovalSafety.test.ts`, `steamDeleteGate.test.ts`); commits `4cd9ebfd1`, `9b0486bbb`, `6eeb4f11d` and `7800d5a70` are ancestors of HEAD. Re-run green: jest over `storeManagers/steam`, `safety` and `downloadmanager` (4562 passed); `pnpm codecheck`, `pnpm steam-line-ceiling` (PASS), `pnpm backend-di-ceilings` (jestMock 1865), `pnpm find-deadcode` (PASS), prettier file-info and check and eslint (0 errors) over every TS path written. Acceptance greps: `rmSync(installRoot` outside comments in `gameUninstall.ts` 0, `nested-known-install` in `steamDirectRemovalSafety.test.ts` 4, `gameUninstall.ts` 953 lines, `checkRemoval` in `acfState.ts` and `cancelDelete.ts` 2 each, cancelDelete `checkRemoval` (line 228) before the last in-flight re-check (line 263), `git diff --quiet 58a0c1c7a -- src-tauri/crates/gamelib-steampoll/src` exit 0, the copy tests assert the remove_copy channel is not invoked on a rejection.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
