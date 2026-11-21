---
phase: 100-game-page-without-the-menu
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src-tauri/src/main.rs
  - src/backend/__tests__/longRunningChannels.test.ts
  - src/frontend/components/UI/UninstallModal/index.tsx
  - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
  - src/frontend/screens/Game/GamePage/actions/rowAction.ts
  - src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts
  - src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/rowAction.test.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  - meta/backendDiCeilings/frontend-screens-game.json
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
  necessity: 1
status: issues_found
---

# Phase 100: Code Review Report (round 2, gap-closure round)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This round reviews the diff from `b65ca20a9` (plans 100-11..14), which fixed round-1 CR-01, CR-02, WR-02, WR-04 and WR-05.

**ID numbering.** Round 1 ended at CR-02 / WR-05 / IN-06. This round starts after those: no new critical findings (the next would be CR-03), warnings are WR-06..WR-08, info items are IN-07..IN-11. None of these collide with ids in `100-REVIEW-DISPOSITION.md`.

**Round-1 fixes, verified:**
- CR-01 (Version row vanishing): fixed. `VersionRow` no longer keys on `install.version`, reads Unknown, and keeps Verify, Update and What's new reachable. The hooks sit above the early return.
- CR-02 (Move over 60 s): fixed at the root. `moveInstall`, `changeInstallPath` and `steamRemoveAllCopies` are now in `LONG_RUNNING_CHANNELS`, so `timeout_for` returns `None`. Each is pinned by a Rust test and by the TS drift test. Move Retry is gated on `gates.move.disabled`, and the failure is hidden while `is.moving`. See WR-06 for a regression in that hiding and WR-07 for the now-dead hand-off.
- WR-02 (Browse Files for third-party games): fixed. `open` is `unaffected(isInstalled)`, matching the old menu. The `isBrowserGame` input was removed from the type, the call site and the tests consistently.
- WR-04 (sticky failures): fixed for the Location row only, via mutual dismissal plus an effect on `install_path`. See IN-11 for the rows it does not cover.
- WR-05 (danger-zone unhandled rejections): fixed. Both confirms run through `useRowAction`, and `UninstallModal` has a runner path and a catch-and-log fallback. The partial-sweep-is-failure rule and the Retry-re-asks rule are tested.

No critical defects found in the changed code. The i18n baseline delta (+240 pairs = 5 new keys x 48 locales), the ceiling file (3 `jest.mock` calls in `installTabRows.test.tsx`) and the new `en` keys are consistent with each other. The Rust change adds list entries and one test only, so the shutdown convention in CLAUDE.md is not engaged.

## Warnings

### WR-06: A real Move rejection leaves the game stuck on "moving", and the new `!is.moving` suppression then hides the failure

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx:35-39` (backend cause: `src/backend/sidecar/installFlowRegistration.ts:527-531` and `544-581`)
**Issue:** `LocationRow` now shows no Move failure while `is.moving` (D-10). That is right for a timeout, but a genuine rejection of `moveInstall` also leaves the status at `moving`. The sidecar handler sends status `moving`, then awaits `getGame(appName).moveInstall(path)`, and only afterwards sends `done`. Only a returned `{status:'error'}` reaches that `done`. If the call throws, the handler rethrows with no `done` and the status stays `moving`. Legendary's `moveInstall` awaits `changeGameInstallPath` (which runs the runner) after a successful copy, outside any try, so a throw is reachable.

In the renderer, `moveRow.run` takes the `fail` branch and logs the error, as the test "reports a real rejection as a failure even while the game reads moving" asserts. `moveFailed` is true, but `LocationRow` hides it because `is.moving` is still true. The user sees "Moving…" indefinitely and every conflicting action reads "Wait for the move to finish". Nothing in the renderer clears the status.

The backend never resetting the status is older than this phase. What the gap round added is the suppression, which removes the only visible symptom. The test asserts `actions.moveFailed`, not what the row renders, so it does not catch this. I did not find another code path that resets the `moving` status on a rejected invoke; if one exists elsewhere, the cost here is only the missing test.
**Fix:** Preferably fix the cause: wrap the `moveInstall` handler body after the `moving` status in `try { ... } finally { sendGameStatusUpdate(..., 'done') }`. In the renderer, if the cause stays, only suppress the message for the hand-off case instead of every rejection. For example, `moveRow` could record whether the last rejection was the timeout hand-off, and `LocationRow` hides the failure only then. Add a render-level test: a rejected move with status `moving` still shows the message.

### WR-07: The move-timeout hand-off (`isInvokeTimeout`, `stillRunning`, `release`) cannot fire in the shipped stack

**Category:** necessity
**File:** `src/frontend/screens/Game/GamePage/actions/rowAction.ts:49-66`, `115-123`, `149-159`; `src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts:29-39`, `83`
**Issue:** `moveInstall` is now exempt from the shell's bound (`timeout_for("moveInstall") == None`, pinned by `install_location_and_remove_all_copies_channels_are_exempt` in `main.rs`). `sidecar invoke timed out: <channel>` is produced only by the bounded path, so no `moveInstall` invoke can reject with it. Only `moveInstall` passes `stillRunning`. The `release` event, the `isStatusMoving` store read, the info log and the tests for them guard a state that cannot occur. They also read as proof that a timeout is still possible, which contradicts the Rust comment that exempted the channel. The Rust comment says a wedged invoke now surfaces as a never-settling promise, not a timeout.

If it is kept as a second line of defence, that decision is not recorded anywhere.
**Fix:** Remove `isInvokeTimeout`, `stillRunning`, `release` and `isStatusMoving` along with their tests. Or keep them and state in the `useInstallLocationActions` header that they are deliberate redundancy, so a later reader does not infer that moves can time out. Removing is preferable: it also deletes the unguarded `stillRunning?.(error)` call, which sits inside `catch` in a function documented as "Never rethrows".

### WR-08: The two danger-zone buttons do not gate each other, and Remove all copies emits no status

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx:47-49`, `64-96`; `src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts:42-43`
**Issue:** Each button disables itself from its own row (`uninstallIsBusy`, `removingAllCopies`) and from the shared gate. The gate reads `is.uninstalling` and other game-status flags. `removeAllSteamInstallCopies` does not send any game status (nothing in `removeAllCopies.ts` emits one). So during a sweep, which can now run without a timeout, `gates.uninstall` is live and "Uninstall…" can be clicked and confirmed. The opposite also holds: "Remove all copies…" stays live while an Uninstall row is busy, unless the backend status has reached `uninstalling`. Both delete the same install roots, and D-11 says conflicting actions are disabled with a reason.
**Fix:** In `DangerZone`, add the other row's busy state to each button's inert condition. For example, `uninstallInert = uninstallGate.disabled || uninstallIsBusy || removingAllCopies` and `allCopiesInert = allCopiesGate.disabled || removingAllCopies || uninstallBusy`. Include both in the Retry `retryDisabled` conditions too. Add a test that the Uninstall button is `aria-disabled` while a sweep is pending.

## Info

### IN-07: The hook's docblock is detached by the new helper's docblock

**File:** `src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts:9-39`
**Issue:** The main JSDoc for `useInstallLocationActions` (D-01, D-13, D-18, CR-02, WR-04) is now followed directly by a second JSDoc and the `isStatusMoving` function, so it attaches to nothing. The hook itself has no docblock.
**Fix:** Move the helper above the first docblock, or place the helper's comment inside the function body. Folds away if WR-07 removes `isStatusMoving`.

### IN-08: Move and Set-folder Retry skip the confirmation that the danger-zone Retry keeps

**File:** `src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts:137-138`
**Issue:** `retryMove` is `onMoveInstallYesClick` and `retrySetFolder` is `onChangeInstallYesClick`, so Retry goes straight to the folder picker. D-13 keeps the yes/no confirmation for Move and Set folder, and the danger zone's Retry re-asks (`retryRemoveAllCopies = startRemoveAllCopies`). The picker is arguably a confirmation in itself, but the two Retry paths are inconsistent and the decision is undocumented.
**Fix:** Either route both Retries through `startMove` and `startSetFolder`, or say in a comment why the picker suffices for these two.

### IN-09: New list entries are admitted "on shape", against the list's own stated rule, and `changeInstallPath` has no recovery if it wedges

**File:** `src-tauri/src/main.rs:187-198` and `301-325`
**Issue:** The list's docblock says membership "is not free and is not granted on reasoning". The three new entries are explicitly "Added on shape, not timed". The `uninstall` entry has the same precedent, so this is not new, but `changeInstallPath` is weaker: the comment concedes that GOG's and Nile's versions only rewrite a record. `changeInstallPath` also feeds `settingFolder`, which `activeLongAction` treats as a long action that disables every conflicting action. With no bound, a wedged invoke leaves the install tab disabled until the sidecar dies.
**Fix:** Record the measurement when UAT item 20 times a Move, or leave `changeInstallPath` bounded and accept a rare false failure. Optionally limit `settingFolder` to the picker phase.

### IN-10: `UninstallModal`'s fallback catch calls `window.api.logError` unguarded, and has no behavioural test

**File:** `src/frontend/components/UI/UninstallModal/index.tsx:134-144`; `installTabSource.test.ts` (new modal test)
**Issue:** The fallback exists so a rejection does not become unhandled. If `window.api.logError` throws, the catch itself throws and the rejection is unhandled again. `reportRowActionFailure` already wraps both log signals for this reason. The new test only greps the source (`catch[\s\S]*window\.api\.logError\(`), so it passes with the dead-simple shape but proves no behaviour. The Library `GameCard` and `DLC` callers use this path. `GameCard` shares the page's flow only in the `runUninstall` case.
**Fix:** Call `reportRowActionFailure({ action: 'uninstall', appName, error })` from the catch. Add a render-level test of the no-`runUninstall` rejection, in the style of `installTabRows.test.tsx`.

### IN-11: Failure-clearing covers only the Location row

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx:72-85`; `src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts`
**Issue:** The WR-04 fix dismisses failures for Move and Set folder. A failed Verify, Uninstall or Remove all copies still leaves its message until the user retries it. For example, an Uninstall failure remains visible after the user cancels the confirm that Retry reopened. The round-1 finding named "after Verify succeeded"; that case persists for Verify when the verification is restarted elsewhere. Low impact because the other entry points to these actions were removed with the menu.
**Fix:** Dismiss the Verify failure when `is.reparing` becomes true, and dismiss the Uninstall failure when its confirm modal closes without confirming.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
