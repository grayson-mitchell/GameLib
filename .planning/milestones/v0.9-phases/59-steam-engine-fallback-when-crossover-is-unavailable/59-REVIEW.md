---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-03T00:00:00Z
depth: standard
scope: gap-closure round 6, plans 59-49 to 59-52 plus post-wave fix 5edf28415 and lint fix e4c37b02c (git diff 3f470bceb..HEAD per file; committed hunks only)
history: round 5 review (plans 59-44 to 59-48, diff 6039a5d20..HEAD) replaced by this round-6 review; round 5 had itself replaced the round-4 review (plans 59-40 to 59-43, diff f333a61ba..HEAD), which had replaced the round-2 review (plans 59-24 to 59-30, diff 4cf305b51..HEAD)
files_reviewed: 12
files_reviewed_list:
  - src/backend/connectivityNow.ts
  - src/backend/storeManagers/steam/engine/demoStatus.ts
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/engine/engineSwitch.ts
  - src/backend/storeManagers/steam/engine/offlineRefusal.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/tools/index.ts
  - src/frontend/components/UI/DialogHandler/index.tsx
  - src/frontend/helpers/library.ts
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/state/dialogQueue.ts
  - src/frontend/types.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 12 (test files read for context, not counted)
**Status:** issues_found

## Summary

Round 6 closes the round-5 findings it targeted. The dialogId in-place update and targeted close in `dialogQueue.ts` is correct on every path I traced (current match, queued match, no-match no-op, untargeted close unchanged). The per-bottle switch serialisation in `engineSwitch.ts` does not deadlock: the body never re-enters `prepareBottleForEngine`, the waiter swallows the predecessor's rejection with `.catch`, the map entry is cleared only by its own tail, and the marker, game-running and shared-bottle checks all sit in the body so a waiter re-evaluates them. The new demo-status settle timer is unref'd, as the sidecar exit contract requires. No critical defects found.

Round-5 status:
- CR-01 (live duplicate pickers): closed by `dialogId`.
- WR-01 (double close dropping the next dialog): closed. `library.ts` and `Humble/Keys` no longer close a second time, and `DialogHandler` closes by `dialogKey`.
- WR-02 (guard keyed by appId, switches race per bottle): closed by the `inFlightSwitches` chain.
- WR-03 (joined second Play re-runs launcher pre/post-launch): not touched by round 6, still open. `games.ts` changed only in the refusal log text.
- IN-01, IN-02, IN-03: closed (log wording, empty-hosts early return, refusal log and header text).
- IN-04 (G26 tests drive the private `launchBridgeGame`): not touched, still open.

The "Aborting not possible. Could not find a matching abort controller" log on SteamGame.stop is not in the round-6 diff (the only `games.ts` hunk is the refusal log), so it is not reported.

## Warnings

### WR-01: Strict DXVK restore reads "unable to find" from output that `resolveOnExit` may have cut short

**File:** `src/backend/tools/index.ts:359-373` (mechanism in `src/backend/launcher.ts:1670-1680`)
**Issue:** With `resolveOnExit: strict`, `runWineCommand` settles 250 ms after `exit` by destroying the stdout and stderr pipes if `close` has not arrived. The lingering wineserver holds those pipes open, so under CrossOver `close` is the case that does not arrive. The "Unable to find" tolerance on the next lines depends on the text of that stderr or stdout. If the message is flushed after the grace window, or the reg process is slow to drain, the regex misses, `reg delete` exits nonzero, and a retried restore (value already gone) is recorded as a failure. The failure then writes marker `dxvk: 'failed'`, which forces another repair on the next launch. The window is small but is the one place the new settle mode changes the semantics of captured output.
**Fix:** Do not rely on captured text alone for the already-gone case. Either treat the delete as satisfied by checking the registry value (or `user.reg`) directly, or accept a nonzero exit when the override is absent from `user.reg` after the call. Add a test where stderr arrives after `exit`.

### WR-02: WR-03 from round 5 (joined second Play re-runs the launcher-level sequence) remains open

**File:** `src/backend/storeManagers/steam/games.ts:4843-4872`, duplicated work in `src/backend/launcher.ts:181-337`
**Issue:** Round 6 did not change the G26 guard placement, so the finding stands as written in the round-5 review. It is carried here so the replacement of the review file does not lose it.
**Fix:** As in round 5: move the join check ahead of the launcher-level pre/post-launch sequence, or make that sequence idempotent per appId.

## Info

### IN-01: Launch-option picker resolves `{ status: 'done' }` before the chosen launch result, discarding it

**File:** `src/frontend/helpers/library.ts:407-415` and `:425-455`, ordering in `MessageBoxModal/index.tsx:50-53`
**Issue:** `MessageBoxModal` calls `props.onClose()` before the button's `onClick`. For the picker, `onClose` runs `res({ status: 'done' })` and sets `launchCanceled`, so the later `res(window.api.launch(...))` in the option `onClick` is a no-op on an already-settled promise. The launch still happens, but its result (including an abort or error status) never reaches the caller. Pre-existing, and round 6's new comment documents the ordering without noticing the consequence.
**Fix:** In the option `onClick`, have the `onClose` path skip `res` when a selection is in flight (for example, check `hasSelected` in `onClose`, which `onClose` cannot see yet because `onClose` runs first), or have `onClose` defer its `res` by a microtask.

### IN-02: Retry detail text mislabels a mixed-kind failure

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:296-303`
**Issue:** If attempt 1 times out and attempt 2 exits nonzero (or the reverse), the broken detail reads "`--demo-status nonzero-exit on 2 consecutive attempts`", naming only the second reason. Diagnostic only, but this log is what UAT triage reads.
**Fix:** Track the first attempt's reason and report both, e.g. `${firstReason} then ${probe.reason}`.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
