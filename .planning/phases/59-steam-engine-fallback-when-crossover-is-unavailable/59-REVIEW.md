---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-03T00:00:00Z
depth: standard
scope: gap-closure round 5, plans 59-44 to 59-48 (git diff 6039a5d20..HEAD per file; committed hunks only; src/frontend/screens/Game/GamePage/index.css excluded as unrelated quick task 843d75b58)
history: round 4 review (plans 59-40 to 59-43, diff f333a61ba..HEAD) replaced by this round-5 review; round 4 had itself replaced the round-2 review (plans 59-24 to 59-30, diff 4cf305b51..HEAD)
files_reviewed: 14
files_reviewed_list:
  - src/backend/connectivityNow.ts
  - src/backend/online_monitor.ts
  - src/backend/storeManagers/steam/engine/offlineRefusal.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/state/dialogQueue.ts
  - src/frontend/types.ts
  - src/frontend/components/UI/DialogHandler/index.tsx
  - public/locales/en/gamelib.json
  - src/backend/__tests__/connectivityNow.test.ts
  - src/backend/__tests__/onlineMonitor.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/offlineRefusal.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/state/__tests__/dialogQueue.test.ts
  - src/frontend/helpers/library.ts (read for cross-file impact of the G28 change only; not in the round-5 diff)
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 59: Code Review Report (gap-closure round 5)

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

_History: this file previously held the round-4 review (plans 59-40 to 59-43, diff
f333a61ba..HEAD). It now covers round 5 only._

## Summary

Round 5 changes four things:

- **CR-01, WR-01, WR-03 and IN-01..03 from round 4.** `checkConnectivityNow` now reads the
  monitor's three-state status, uses two DNS hosts, and isolates the fresh-offline hook.
  `offlineLaunchCertainlyBlocked` now refuses under a CrossOver override.
- **G28.** Each dialog request carries a `dialogKey`, and `DialogHandler` remounts
  `MessageBoxModal` by that key.
- **G26.** A per-appId `bridgeLaunchesInFlight` guard sits in front of the bridge launch body.
- **G27.** Accepted. No source change.

The backend fixes are correct as written:

- Only a definite `'offline'` short-circuits. `'check-online'` goes on to the OS check.
- A throwing hook can no longer erase an offline finding.
- `dns-failed` needs every host to fail.
- The new `restore-needs-pin` arm under override `crossover` matches `restoreNeedsAbsentPin`.
  That function falls back to `ENGINE_PINS.current` only for non-pinned markers, so an
  installed current pin correctly clears it.
- The G26 guard is set before the first await and released only by its owner. The joiner never
  runs the `clearEngineSelection` cleanup.

The main defect is in the frontend. The G28 remount fixes the bug it targets, but it also makes
queued dialogs visible again, and one caller relied on them staying hidden. The launch-option
picker in `helpers/library.ts` calls `showDialogModal` once a second to update its countdown
title. Each call is queued behind the open picker. Before round 5, the promoted copies were
invisible (G28). Now each one mounts and shows, and every option button in a stale copy calls
`window.api.launch` again (CR-01). G28 also has a second cause that round 5 does not fix:
buttons that close the dialog in their own `onClick` close it twice, which silently drops the
next queued dialog (WR-01).

Sidecar exit contract: no new timers, watchers or boot-time work. The two-host race shares the
existing cap timer (`unref?.()` and cleared in `finally`). A lookup abandoned at the cap is
bounded by the OS resolver, as the header comment now records.

Interaction with known gaps (not re-filed):

- **G29** (a transient demo-status failure reclassifies CrossOver as cx-broken). Round 5 neither
  causes nor changes it. The G26 guard does not cover it: the guard is released when a launch
  settles, and the item-40 G29 probe ran about 2 s after the previous session ended, when no
  launch was in flight.
- **G30** (about 20 s of DXVK removal). This widens the window that the G26 guard protects, but
  it does not interact with round-5 code.

## Critical Issues

### CR-01: The G28 remount turns the launch-option countdown's queued copies into visible, live duplicate launch pickers

**File:** `src/frontend/state/dialogQueue.ts:32-40` and `src/frontend/components/UI/DialogHandler/index.tsx:140`. The trigger is in `src/frontend/helpers/library.ts:381-410` and `:463-471`. Button order is set in `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx:50-52`.

**Issue:** `launchGame`'s launch-option picker calls `updateCountdown()` once at start and then
once a second for 9 ticks. Each call is `showDialogModal({ title: 'Select Launch Option (Ns)',
buttons: optionButtons, onClose })`. `reduceDialogRequest` never replaces an open dialog: a
request that arrives while one is open goes into the queue. So after k seconds the queue holds k
copies of the picker, each with its own `dialogKey`.

When the user picks an option:

1. `MessageBoxModal` calls `props.onClose()` first. That is the picker's `onClose`, which clears
   the timers, closes the dialog (pop 1) and calls `res({status:'done'})`.
2. It then calls the button's `onClick`, which closes the dialog again (pop 2) and calls
   `window.api.launch(...)`.

The next queued copy is promoted. Before round 5 it reused the closed `Dialog` instance with
`open=false` and stayed invisible (the G28 bug). Now `key={dialogKey}` mounts it fresh, so it
**appears**: a stale "Select Launch Option (Ns)" picker shows up right after the user chose.
Clicking an option in it runs the same closure. `res` has already settled, but
`window.api.launch(...)` is called again, so the game launches a second time and
`lastUsedLaunchOption` is overwritten. This repeats for each remaining copy, about k/2 of them
because every click pops twice.

The auto-select path (`autoSelectFirstOption` at 10 s) leaves 9 queued copies behind.

This is a round-5 regression. The queue made the copies (509bcb01b), but the remount made them
visible and clickable. None of the `dialogQueue.test.ts` G28 tests covers an update to the open
dialog.

**Fix:** Let a request update the open dialog in place instead of queueing it. Keep its
`dialogKey` so it is not remounted.

```ts
// types.ts
/** Same id as the open dialog: update it in place (no queue, no remount). */
dialogId?: string

// dialogQueue.ts
if (state.current.showDialog) {
  if (options.dialogId && state.current.dialogId === options.dialogId) {
    return {
      current: { ...state.current, ...options, showDialog: true },
      queue: state.queue
    }
  }
  return { current: state.current, queue: [...state.queue, request] }
}
```

Pass `dialogId: 'launch-option-picker'` from `updateCountdown`. Add a reducer test: an update
with the same `dialogId` keeps `dialogKey` and leaves the queue empty. Add a `library.ts` test:
pick an option at 3 s, then expect no dialog open and `launch` called once.

## Warnings

### WR-01: Buttons that close the dialog in their own `onClick` drop the next queued dialog (a G28 cause round 5 leaves in place)

**File:** `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx:50-52` together with `src/frontend/components/UI/DialogHandler/index.tsx:146-152`. Callers: `src/frontend/helpers/library.ts:263, 270, 440`, `src/frontend/screens/Humble/Keys/index.tsx:362, 373`.

**Issue:** A button click runs `props.onClose()` and then `button.onClick()`. With no custom
`onClose`, the first call already dispatches `{ showDialog: false }`, which promotes queued
dialog B. A button whose `onClick` also calls `showDialogModal({ showDialog: false })` pops a
second time in the same batch. B is discarded before it renders, and its `ackId` is never acked.

That produces exactly the G28 symptom ("display=unconfirmed", a queued notice that never shows),
but from a cause the dialogKey fix does not touch. The Offline Warning's OK and Play Anyway
buttons (`library.ts:263/270`) are on the offline Play path that phase 59 exercises.

The new `[dialog] closed` log is written once (first pop only), so the logs will not show the
second pop either.

**Fix:** Make the close idempotent per dialog. Have the close request carry the key it closes,
and ignore a close whose key is no longer current.

```ts
// DialogHandler onClose
showDialogModal({ showDialog: false, dialogKey: dialogModalOptions.dialogKey })
// dialogQueue.ts
if (!showDialog) {
  if (options.dialogKey !== undefined && options.dialogKey !== state.current.dialogKey) return state
  ...
}
```

Alternatively, remove the redundant `showDialogModal({ showDialog: false })` calls from those
`onClick` handlers.

### WR-02: The G26 guard is keyed by appId, but engine switches race per bottle, and the legacy shared bridge bottle hosts many appIds

**File:** `src/backend/storeManagers/steam/games.ts:294, 4843-4872` (bottle resolution: `src/backend/storeManagers/steam/bottle.ts:1379-1405`)

**Issue:** G26's failure was two `prepareBottleForEngine` runs in the same bottle (DXVK removal
failed, marker `dxvk:"failed"`). Both the engine marker and the DXVK DLLs are per bottle.
`findBridgeInstallBottle` returns `DEFAULT_BRIDGE_BOTTLE_NAME` for any appId whose manifest
lives in the legacy shared bottle. Two different games there can each get past the
`bridgeLaunchesInFlight` check (different keys) and run concurrent engine switches in one
bottle, which is the G26 failure again. The install path's `resolveInstallEngineSettings`
(`games.ts:2580-2614`) also calls `prepareBottleForEngine` with no guard.

**Fix:** Serialise per bottle as well as per appId. A simple version: key a second map by
`findBridgeInstallBottle(appId)` (synchronous, already computed in `launch()` at line 3908) and
await or refuse when the bottle is busy. A sturdier version: put a per-bottle mutex inside
`prepareBottleForEngine`, which covers launch and install alike.

### WR-03: The joined second Play still runs the whole launcher-level pre- and post-launch sequence

**File:** `src/backend/storeManagers/steam/games.ts:4843-4860` (guard placement). Duplicated work is in `src/backend/launcher.ts:181-337`.

**Issue:** The guard sits inside `SteamGame.launchBridgeGame`, below `launcher.ts`. A joining
Play still runs, a second time:

- `createGameLogWriter` (a second writer for the same game log)
- `checkWineBeforeLaunch` and `persistBottleWineVersion`
- the user's `beforeLaunchScript` and `afterLaunchScript`
- the `'launching'` and `'done'` status updates

The summary of 59-46 says the second click "joins" the launch. In fact it is a second launch
session that only shares the bridge body. A user before/after script that is not idempotent
(mount, VPN toggle) runs twice for one game start.

**Fix:** Either move the single-flight check up to the launch IPC entry (keyed per
`appName`/runner, returning `{ status: 'abort' }` or the shared result before any launcher
work), or document that the guard covers only the bridge body and file the launcher-level
duplication with the open "second entry point" todo from 59-48.

## Info

### IN-01: `[dialog] shown` logs the state, not visibility, so it cannot confirm a G28 fix

**File:** `src/frontend/components/UI/DialogHandler/index.tsx:126-130`

**Issue:** The effect fires whenever `showDialog` is true with a new key. The G28 fault was
exactly "state says open, nothing visible". 59-45 says these lines "will prove" the fix, but they
cannot. Only the ack (`display=confirmed`) proves visibility. Dialogs with a custom `onClose` (the
launch-option picker) also never write `[dialog] closed` (line 147 returns first).

**Fix:** Rename the log to `[dialog] current`, or write it from inside the mounted modal. Log the
close on both branches.

### IN-02: An empty `hosts` list fails closed (offline), against the module's fail-open rule

**File:** `src/backend/connectivityNow.ts:118-121, 145-150`

**Issue:** `pending === 0` resolves `failed`, giving `offline: true, source: 'dns-failed',
detail: 'undefined'` and, while online, a monitor recheck. It is reachable only through deps
injection today, but the header says anything other than a definite failure must not refuse.

**Fix:** With no hosts, return `{ kind: 'ok' }`, or report `source: 'error'`, `offline: false`.

### IN-03: The refusal log and the `offlineRefusal.ts` header are inaccurate after WR-02

**File:** `src/backend/storeManagers/steam/games.ts:4310-4313`, `src/backend/storeManagers/steam/engine/offlineRefusal.ts:10-17`

**Issue:** The log says "offline and the built-in engine is not installed". On the new override
`crossover` arm the current pin *is* installed, and the missing one is the marker's own older
pin. The header's inserted sentence runs on ("...so it never refuses; a surviving DXVK copy
means...") past the line width. It also states "never refuses" for `automatic` with the pin
installed, which is true only of the `restore-needs-pin` arm.

**Fix:** Log `arm` together with the missing pin id. Rewrap and narrow the header sentence.

### IN-04: The G26 tests drive the private `launchBridgeGame` directly, not `launch()`

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:14727-14838`

**Issue:** Every G26 case calls `(game as any).launchBridgeGame()`, so the routing in `launch()`
is never exercised with two concurrent callers. That routing is the
`getBottleProcessMonitorPhase` single-flight, then `findBridgeInstallBottle`, then
`bridgeFailedThisSession`. 59-48 item 41 could not reach the join path live either, so the whole
guard rests on these tests. One case through `launch()` would pin the integration.

**Fix:** Add one test that calls `game.launch()` twice with a deferred body and asserts one body
run and one notify.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
