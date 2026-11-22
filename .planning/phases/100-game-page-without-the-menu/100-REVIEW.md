---
phase: 100-game-page-without-the-menu
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src-tauri/src/main.rs
  - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
  necessity: 0
status: issues_found
---

# Phase 100: Code Review Report

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

Round 3, scoped to changes since d5950073e. The round-2 report (WR-06..08, IN-07..11) stays available in git at d5950073e.

## Summary

Reviewed the diff d5950073e..HEAD for the six files. Three bodies of change:

- `installActionGates.ts` (quick 261122-9sl): `steamMove` shows Move for an installed, non-third-party Steam game on macOS, routed through the same `conflicting()` helper as every other Move. Correct and covered by tests (idle, playing, moving, not installed, third-party managed). No findings.
- `src-tauri/src/main.rs` (phase 85): the hunks add the store host boot, the `store` exit drain plus a second post-sidecar drain, `shell_log_detail`, the bridge-install warning, and the keyring-name pin test. `LONG_RUNNING_CHANNELS` is untouched: `moveInstall`, `changeInstallPath` and `steamRemoveAllCopies` are still members (main.rs lines 317, 325, 331) and still pinned by the `timeout_for(...) == None` asserts (lines 3091-3093). No findings against Phase 100's contract. The drain timing arithmetic (`grace.saturating_sub(stage.elapsed())`, `remaining_now()`) is sound.
- `OptInDlcRows.tsx` (quick 261122-rgi), new, mounted from `InstallTab/index.tsx`: this is where the findings are. It was built with its own pending/failure state machine and its own busy test instead of the Phase 100 shared pieces, and it breaks three of the design contracts.

Positive notes, so the scope of the problems is clear: the noun label never flips (only the aside text does, as `SwitchRow` allows), the failure text is fixed and translated with the raw error going to the log, and the Steam-managed case is inert in both `SwitchRow` and `change`.

## Warnings

### WR-09: Opt-in DLC switches ignore `installActionGates`, so they stay live during a move, verify, uninstall, folder change, sync, launch, and while the game is running

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx:39,126`
**Issue:** The row is the only Install-tab action that does not take `gates`. `InstallTab/index.tsx` computes `gates` (line 39) and hands them to every other row, but mounts `<OptInDlcRows gameInfo={gameInfo} />` (line 89) without them. Its own busy test is `is.updating || is.queued || is.installing` (line 39), a strict subset of `activeLongAction` (uninstalling > moving > verifying > updating > installing > settingFolder > syncing > launching > queued) and it has no `is.playing` check at all.

Consequences, each a Phase 100 D-11 violation:
- Toggling a switch during a Steam Move (newly possible on macOS since 9sl) or during Verify queues an update that downloads or deletes depot files in the same install folder while the move or verify is rewriting it. Switching off during a move deletes files from a folder that is being relocated.
- Toggling while the game is playing queues a `steamOptInDlc` update that can delete depot files out from under the running game. `update` is gated `conflicting(managedStore)`, and `conflicting` disables on `is.playing`; this row has no equivalent.
- Toggling during an uninstall races the removal.

The disabled tooltip also can only ever say "Wait for the current download or update to finish", so the gate reasons from `gateReasonText.ts` are never shown for these rows.

**Fix:** Add one gate to `installActionGates` for the opt-in DLC rows (shown for an installed Steam game, `conflicting(...)`), pass `gates` into `OptInDlcRows`, and derive `disabled`/`disabledReason` from it, keeping `pending` as the extra local lock:

```ts
// installActionGates.ts
optInDlc: conflicting(isInstalled && isSteam && !isThirdPartyManaged),
// OptInDlcRows.tsx
const gate = gates.optInDlc
const disabled = steamManaged || gate.disabled || (pending !== null && !isPending)
const disabledReason = steamManaged ? steamText : gateReasonText(t, gate.reason)
```

Add the id to `InstallActionId` and a test per reason (moving, verifying, playing, uninstalling).

### WR-10: A failed or unavailable re-read replaces `info` with `null`, which removes the whole group together with the failure message it just set

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx:65-84,89`
**Issue:** After a change, the effect calls `setInfo(answer)` unconditionally. `getSteamOptInDlc` documents that it answers `null` on any failure (PICS timeout, no appinfo, thrown error; `optInDlc.ts` `return null` at the not-reader branch and in the catch). When the answer is `null`, `row?.installed !== want` is true, so `setFailed` runs, but the next line of the component is `if (!applies || !info) return null`. The user sees the busy row, then the entire "Optional content" group disappears with no failure text and no Retry, even though the update may have succeeded or failed. The same happens on the `.catch` branch only if the earlier `setInfo` had already run, which it has not, so there `info` is kept; the two branches disagree.

The test suite pins the null case only for the initial mount (`renders nothing for ... a null answer`), not for the post-change re-read.

**Fix:** Keep the last good answer, and treat `null` as an unconfirmed result that fails the row:

```ts
.then((answer) => {
  if (cancelled) return
  if (answer) setInfo(answer)
  const row = answer?.entries.find((e) => e.appId === appId)
  if (row?.installed !== want) { /* log, setFailed */ }
  setPending(null)
})
```

Add a test: re-read resolves `null`, group still rendered, one failure shown.

### WR-11: Pending/failure handling is hand-rolled instead of `useRowAction` / `reportRowActionFailure`; an unguarded `logError` in a catch can leave every row stuck busy

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx:44-50,75-82,86-92,115-124`
**Issue:** Phase 100's contract is that row pending and error states go through `useRowAction` and that failures are logged with `reportRowActionFailure`, which is written to never throw (it wraps `String(error)`, `console.error` and `window.api.logError` in separate try blocks). This component uses neither:
- `window.api.logError(...)` is called bare in four `.catch`/`.then` handlers, with the error interpolated into a template string (`${error}`, `String(error)`), and with no `console.error` signal.
- In `change()`'s `.catch`, `logError` runs first and `setPending(null)` / `setFailed(...)` after it. If `logError` throws synchronously (or the error's `toString` throws, which `reportRowActionFailure` specifically guards against), the state resets are skipped: `pending` stays non-null, the switch stays busy, and `otherBusy` disables every other row with no failure and no Retry. The same ordering exists in the re-read `.catch` (line 90-91).
- There is no way out of `pending` if the busy edge is never observed. The effect only advances when it has seen `gameBusy` true; if status events coalesce into one render (queued -> error within one batch) or the queue refuses without a status, the row stays busy indefinitely. `useRowAction` rows always end in `succeed`/`fail`.

**Fix:** At minimum, call `reportRowActionFailure({ action: 'Optional content update', appName, error })` first (it cannot throw) and make the state resets unconditional (`finally`, or reset before logging). Better, drive the dispatch through `useRowAction` with `isFailure` set from the re-read, and add a bounded fallback (for example, clear `pending` and fail the row if the game has not been seen busy within a few seconds of the dispatch resolving).

## Info

### IN-12: `desired` is computed from the `info` snapshot taken at mount, and the update treats it as the complete set to keep

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx:96-101`
**Issue:** `change` builds `steamOptInDlc` from `info.entries.filter(e => e.installed ...)`. `info` is refreshed only on mount, on game change, and after this component's own change. If the installed depot set changed in between by another route (a second window, an update queued from the Downloads screen, Steam itself on a copy that later became GameLib-managed), the stale list is sent as the full desired set, and per the component's own contract ("switching it off ... deletes them") the backend retires every opt-in depot not in the list. This is a judgement item: it needs a second writer to trigger, and I did not trace the backend's treatment of an absent id.
**Fix:** Re-read immediately before dispatch and build `desired` from that answer, or send a delta (`add`/`remove`) instead of the whole set.

### IN-13: Test coverage for the new rows skips the cases that carry the findings above

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx:889-1024`
**Issue:** The OptInDlcRows suite covers render rules, dispatch payloads, the Adding/Removing cycle, a contradicting re-read, a rejected dispatch, and the generic busy hold. It has no case for: a `null` re-read after a change (WR-10), a throwing `window.api.logError` (WR-11), a row toggled while `moving`/`reparing`/`playing`/`uninstalling` (WR-09), or the Retry link being inert while another action runs. The "held while the game is busy for another reason" test only uses `{ updating: true }`, which is exactly the one input the current code already handles.
**Fix:** Add the four cases when WR-09..WR-11 are fixed.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
