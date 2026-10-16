---
phase: 35-electron-cutover-remove-the-electron-build
plan: 26
subsystem: ui
tags: [eos-overlay, showDialogModal, ipc, gap-closure, live-gate]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "D-35-11-01's structural analysis (showDialogBoxModalAuto returns void and cannot round-trip a user's choice; ButtonOptions.action is a closed one-literal enum) and the house showDialogModal confirmation pattern from AllowInstallationBrokenAnticheat.tsx"
provides:
  - "Both EOS overlay confirmations (remove, enable/install-now) render through the app's own showDialogModal path instead of dialog.showMessageBox"
  - "remove() is fail-closed on a strict === true identity check across five separately-named refusal cases (undefined, false, 'true', 1, an object)"
  - "The Settings -> Advanced Install and Update buttons, found bare (no confirmation of any kind) by the Task 3 live gate on its first attempt, now gate through confirmInstallEosOverlay/confirmUpdateEosOverlay on the same house pattern"
  - "D-35-11-01's blocking question -- may a settings-surface destructive confirmation be gated renderer-side -- is answered YES, conditioned on a fail-closed backend gate"
affects: [35-28]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Renderer-side confirmation via showDialogModal, backend fail-closed on a strict === true identity check rather than a truthiness test, so a malformed IPC payload cannot reach a destructive command"
    - "A source-text guard that asserts NO destructive action is wired bare to an onClick (EosActionConfirmationGuard) is a different and complementary check to one asserting an existing wrapped call stays wrapped (EosDeclineCallSiteGuard) -- the latter structurally cannot see a call site that was never wrapped in the first place"

key-files:
  created:
    - src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx
    - src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosActionConfirmationGuard.test.ts
  modified:
    - src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts
    - src/backend/storeManagers/legendary/eos_overlay/ipc_handler.ts
    - src/backend/sidecar/eosOverlayFlowRegistration.ts
    - src/backend/sidecar/__tests__/eosOverlayFlows.test.ts
    - src/common/types/ipc.ts
    - src/preload/api/settings.ts
    - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
    - src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "Backend gate is a strict `=== true` identity check, never a truthiness test -- a malformed or absent confirmation (undefined, false, the string 'true', the number 1, an object) refuses and removes nothing, RED-proven by substituting a truthiness test"
  - "The negative button in every EOS confirmation carries no onClick at all, rather than a no-op handler -- cancel is the absence of a handler, not a handler that does nothing"
  - "Remediation added a NEW guard (EosActionConfirmationGuard.test.ts) rather than extending the existing EosDeclineCallSiteGuard, because the two check structurally different properties: one censuses that a wrapped call stays wrapped, the other censuses that a destructive action is never wired bare to a button"
  - "New confirmation strings for Install/Update went into public/locales/en/gamelib.json, never translation.json, per this project's standing convention"

requirements-completed: [REQ-35-17]

# Metrics
duration: ~50min across two gate attempts (this session: verification + close only; tasks 1-3 executed by a prior session)
completed: 2026-08-30
---

# Phase 35 Plan 26: Move the EOS overlay confirmations off native dialogs and prove it live Summary

**Both EOS overlay confirmations (remove, install/enable) now render through the app's own `showDialogModal` instead of a native `dialog.showMessageBox`, gated fail-closed on a strict `=== true` backend check -- and a first live-gate attempt caught a real defect (Install/Update in Settings -> Advanced had zero confirmation of any kind) that a 5/5-green test suite could not see, because that suite censused the wrong property.**

## Performance

- **Tasks:** 3 (2 auto, 1 blocking human-verify) plus 1 remediation task added mid-gate
- **Files modified:** 10 (6 backend/common in Task 1, 4 frontend in Task 2, 3 frontend in the remediation, with `AdvancedSettings/index.tsx` and `gamelib.json` touched twice across those)
- **Completed:** 2026-08-30

## Task Commits

1. **Task 1: Make the backend EOS confirmations explicit and fail-closed** - `81794b7bd` (feat)
2. **Task 2: Put the app-styled confirmations in the renderer and repair the call-site guard** - `a5333be6` (feat)
3. **Task 3: Live human verification** - blocking checkpoint, no file modified, no commit
4. **Remediation (added after Task 3's first attempt FAILED): gate Install/Update buttons** - `ad07e8ff6` (fix)

No plan-metadata commit precedes this one -- this SUMMARY and the STATE/ROADMAP/REQUIREMENTS updates below are that commit.

## Accomplishments

- `eos_overlay.ts`'s `remove()` no longer imports or calls `dialog.showMessageBox`. It takes an explicit `confirmed: boolean` parameter and runs `legendary eos-overlay remove` only when that parameter is literally `true`. Five separately-named refusal cases (`undefined`, `false`, `'true'`, `1`, an object) each assert zero calls to `runRunnerCommand`; RED-proven by substituting a truthiness test and confirming the string/number cases go red by name.
- `enable()`'s not-installed branch no longer asks via a native dialog either -- it returns the not-installed condition to the renderer, which raises its own `showDialogModal` confirmation and only calls the install path on the affirmative button.
- The renderer's Remove and Enable/Install-now confirmations are wired through `showDialogModal` at `AdvancedSettings/index.tsx`, on the same `AllowInstallationBrokenAnticheat.tsx` house pattern: an affirmative button whose `onClick` performs the action, and a negative button with no `onClick` at all.
- `EosDeclineCallSiteGuard.test.ts`'s literal source-string assertion was updated to match the new call shape rather than deleted or weakened.

## Gate History -- Both Attempts (record honestly, this is the plan's most durable finding)

### Attempt 1: FAILED

The operator drove Task 3's live gate against a build independently confirmed to carry both `81794b7bd` and `a5333be60` (dev server started 22:12:22, both commits landed earlier, sidecar rebuilt 22:07 -- a stale build was ruled out). Clicking **Install** in Settings -> Advanced started the install **immediately**, with no confirmation of any kind. Reproduced twice; `gamelib.log` shows `eos-overlay install -y` firing unguarded at 22:14:23 and 22:18:52. The operator's own words: *"there is a confirmation when uninstalling, not when installing."*

**Root cause:** `AdvancedSettings/index.tsx` had `onClick={installEosOverlay}` (line 461) and `onClick={updateEosOverlay}` (line 413) wired bare -- Task 2 had added a confirmation for `GameSubMenu`'s install-now path and for Settings' Remove button, but never touched these two Settings -> Advanced buttons.

**Why the test suite missed it -- the durable lesson.** `EosDeclineCallSiteGuard.test.ts` passed 5/5 with the unguarded call site sitting in the exact file it scans. That guard censuses whether an *already-wrapped* `window.api` call stays wrapped in `callOrDeclare` -- it is structurally incapable of seeing a call site that was **never wrapped in anything** to begin with. It could only confirm what was already true; it could not detect an absence. A two-minute human click found what 5/5 green tests could not. This is the same shape as this project's other "census by the wrong property" findings (a gate can only see the property it was written to check).

**Remediation** (`ad07e8ff6`): added `EosActionConfirmationGuard.test.ts` as a *new*, complementary guard -- RED-proven first against pre-fix HEAD (6/10 cases failing, naming `installEosOverlay` and `updateEosOverlay` specifically; `removeEosOverlay` passed throughout, confirming the guard was correctly scoped and not vacuous) -- then wired both buttons through `confirmInstallEosOverlay`/`confirmUpdateEosOverlay` on the house pattern. New strings went into `public/locales/en/gamelib.json` only; `translation.json` is untouched (verified via `git diff-tree --name-only`).

### Attempt 2: PASSED

Driven by the operator on the remediation build. The orchestrator independently corroborated every step from `~/Library/Logs/GameLib/gamelib.log` (rotated at launch, so it holds only this session) and from disk state.

Timeline:
```
22:42:47  eos-overlay remove -y      <- Remove -> Confirm
22:45:59  eos-overlay install -y     <- Install -> Confirm
22:46:19  status update              <- install SUCCEEDED
22:50:00  eos-overlay remove -y      <- Remove -> Confirm, while inspecting dialogs in the 2nd theme
```

| Step | Verdict | Evidence |
|---|---|---|
| Update -> Cancel | PASS | dialog appeared; no install/update command in the log |
| Install -> Cancel | PASS | dialog appeared; **zero** `eos-overlay install` invocations -- this is exactly the attempt-1 defect, now fixed |
| Install -> Confirm | PASS | `install -y` at 22:45:59, status confirmed 22:46:19 -- the non-vacuity check: a gate that never opens would also yield zero installs on cancel, so proving BOTH directions is what makes the cancel-PASS meaningful |
| Remove -> Cancel | PASS (carried from the earlier round) | verified before attempt 2; not re-litigated |
| Remove -> Confirm | PASS | 22:42:47 and 22:50:00 |
| Light + dark theme rendering | PASS | operator viewed both dialogs in both themes: legible, and confirmed they are app dialogs drawn in-window, not native macOS alerts |

**Caveats, recorded so the evidence is not overstated:**
- **No screenshots were captured**, though the plan's `<how-to-verify>` asked for one per theme. The theme verdict is the operator's direct visual confirmation, reported verbally -- there are no screenshot artifacts backing it.
- Pixel values were not measured; legibility and app-vs-native chrome were judged by eye by the operator, not measured.
- This SUMMARY does **not** claim the in-app `Dialog` primitive is styled in general. Its stylesheet is close to entirely dead (only `.Dialog__footer` is live) and its ~25 other consumers fall back to MUI defaults -- a separate, already-known issue. What is proven here is narrower: the EOS dialogs render as app-drawn dialogs rather than native OS alerts, nothing about the primitive's own styling quality.
- No claim is made about sidecar build freshness. The remediation (`ad07e8ff6`) is frontend-only; the deployed sidecar binary predates it and did not need rebuilding for this gate.

## Untriaged Observation (record, do not chase)

Immediately after the successful install, four ERROR lines fired at 22:46:15-18:
`Could not get game info for 98bc04bc842e4906993fd6d6644ffb8d, returning empty object. Something is probably gonna go wrong`, interleaved with `Requested game 98bc04bc... was not found in library`. That appName is `eosOverlayAppName`. Almost certainly pre-existing noise on the overlay's pseudo-game library lookup, and **not caused by this plan**, but it was observed during this gate and has not been triaged. Recorded here as an **UNTRIAGED, UNOWNED** observation -- not chased, not claimed pre-existing without evidence, and not folded into REQ-35-17's closure.

## D-35-11-01 Resolution

Appended a dated RESOLVED note to `D-35-11-01` in `deferred-items.md` (see that file). Its blocking question -- "may a settings-surface destructive confirmation be gated renderer-side?" -- is answered **YES**, conditioned on the fail-closed backend gate this plan implements (a malformed or absent confirmation refuses, never proceeds).

## Scope Boundary -- What This Plan Does NOT Close

`D-35-11-01`'s own source todo named a ~14-site census of **native** `showMessageBox`/`showMessageBoxSync` call sites across `src/backend`, of which EOS's two (`remove`, `enable`'s not-installed branch) were members. This plan converts those two. **Approximately 13 other native dialog sites remain in `src/backend`, untouched.** This plan closes the EOS half of `REQ-35-17` only; it does not close the general native-dialog-vs-app-dialog inconsistency the source todo's Step 1 asks about, and does not claim to.

## Decisions Made

- Backend gate uses `=== true`, never truthiness -- a malformed IPC payload refuses rather than destructively proceeding (T-35-122).
- Cancel is implemented as the absence of an `onClick`, not a no-op handler (T-35-124).
- The remediation guard (`EosActionConfirmationGuard.test.ts`) was added as a new file rather than folded into `EosDeclineCallSiteGuard.test.ts`, because the two guards check different properties and conflating them would have hidden the exact miss attempt 1 found.
- New Install/Update confirmation strings went into `gamelib.json`, never `translation.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, caught by the plan's own Task 3 gate] Settings -> Advanced Install and Update buttons had zero confirmation**
- **Found during:** Task 3, attempt 1 (live human gate)
- **Issue:** `onClick={installEosOverlay}` / `onClick={updateEosOverlay}` were wired bare in `AdvancedSettings/index.tsx`; clicking Install fired `legendary eos-overlay install -y` immediately, with no dialog raised at all. This is a data-loss-adjacent gap in the same family REQ-35-17 exists to close, missed by Task 2's own acceptance criteria because Task 2 scoped its testing to the Remove flow and `GameSubMenu`'s install-now path only.
- **Fix:** Added `confirmInstallEosOverlay`/`confirmUpdateEosOverlay` on the house `showDialogModal` pattern; added a new complementary source-text guard (`EosActionConfirmationGuard.test.ts`) RED-proven against pre-fix HEAD; new strings added to `gamelib.json`.
- **Files modified:** `public/locales/en/gamelib.json`, `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx`, `src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosActionConfirmationGuard.test.ts`
- **Verification:** Live gate attempt 2, PASSED all steps (see Gate History above).
- **Committed in:** `ad07e8ff6`

---

**Total deviations:** 1 auto-fixed (Rule 1, caught by the plan's own designed blocking checkpoint rather than by an automated test)
**Impact on plan:** Necessary for correctness -- this was the exact data-loss risk the requirement and the plan's threat register (T-35-122/T-35-45) exist to prevent. No scope creep beyond the two buttons the defect was on.

## Issues Encountered

None beyond the gate-attempt-1 finding documented above, which the plan's own checkpoint design (a live human gesture, not a mock render tree) exists to catch.

## User Setup Required

None.

## Next Phase Readiness

- `REQ-35-17`'s EOS half is closed. Combined with plan `35-11`'s prior closure of the path-rejection dialog and the two SEAM convergence items (Phase 33 D-04 boot auto-resume, Phase 31 D-02), `REQ-35-17`'s named scope is now fully addressed -- see the REQUIREMENTS.md amendment for the exact wording and caveats (no-screenshots, theme-verification-by-eye).
- `D-35-11-01` is RESOLVED and no longer blocks anything.
- The ~13 remaining native `showMessageBox`/`showMessageBoxSync` sites in `src/backend` are NOT closed by this plan and are not implicitly claimed to be. They remain the source todo's Step 1 scope, unowned.
- The untriaged post-install `eosOverlayAppName` "not found in library" ERROR observation is unowned and not filed against this plan.
- Plan `35-28` (records hygiene) still owns the pre-existing `completed_plans` counter lag for `35-21`/`35-22`/`35-23`; this plan's own bump is applied correctly below and does not touch that lag.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-26-SUMMARY.md`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md` (D-35-11-01 RESOLVED note appended)
- FOUND: `.planning/REQUIREMENTS.md` (REQ-35-17 bullet + traceability row updated)
- FOUND: `.planning/ROADMAP.md` (35-26 plan bullet + narrative paragraph updated)
- FOUND: `.planning/STATE.md` (progress comment, counter, Current Position bullet added; snapshot-diff verified additive-only)
- FOUND commit: `81794b7bd` (feat, Task 1)
- FOUND commit: `a5333be60` (feat, Task 2)
- FOUND commit: `ad07e8ff6` (fix, remediation)
