---
phase: 74-steam-game-updates
reviewed: 2026-11-14T03:30:50Z
depth: standard
scope: "Gap-closure round 4 only: plans 74-34 and 74-35 (commits 5e55d2e36, 81851b9c1, 5bfce41a8, f0befaeac) since 61fd8e699. Concurrent phase-70 retyping commits in library/index.ts excluded. Earlier rounds' review is in git history."
files_reviewed: 6
files_reviewed_list:
  - src/backend/storeManagers/steam/library/updatePollOnce.ts
  - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
  - src/backend/utils/checkGameUpdates.ts
  - src/backend/utils/__tests__/checkGameUpdates.test.ts
  - src/backend/storeManagers/steam/library/index.ts
  - src/backend/storeManagers/steam/__tests__/library.updates.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 74: Code Review Report (gap-closure round 4: 74-34, 74-35)

**Reviewed:** 2026-11-14T03:30:50Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Scope

This review covers only the round-4 gap-closure diffs since `61fd8e699`:

- 74-34 (`5e55d2e36`, `81851b9c1`): `retryInstallApp` no longer disarms on `awaiting.sawPending`; a new `atStaleStart` guard blocks the non-quiet `finished` completion while the ACF still reports the starting build and a different target is known.
- 74-35 (`5bfce41a8`, `f0befaeac`): an `autoUpdateGames off` log line in `checkGameUpdates`, and a `Steam: auto-update candidates=<n>` log line in `SteamLibraryManager.listAutoUpdateableGames`.

The phase-70 retyping commits that touch `library/index.ts` at the same time are not reviewed here. Earlier rounds' review is in the git history of this file.

## Summary

The 74-35 logging is correct and has no side effects. The two lines are mutually exclusive per check, so together they tell you which branch ran. One gap remains: the count is taken before `checkGameUpdates` filters it against the badge list (IN-01).

The 74-34 change fixes the false `finished (build 100)` and the disarm-on-idle bug it targets. It also adds a liveness gap. The poll's only early exits are the activity-gated quiet end and the completion branch that `atStaleStart` now blocks. So a poll that has seen activity and then settles back at its starting build never terminates before the 6-hour `MAX_TICKS` cap (WR-01).

The guard also does nothing when the hand-off's `targetBuild` equals `fromBuild`. `updateNative` can produce that value, and then the original UAT 25 symptom comes back (WR-02). The new tests pin only one tick of each scenario, and they do not cover either case (WR-03).

## Warnings

### WR-01: `atStaleStart` can leave an update poll stuck at 'updating' for up to 6 h once activity was seen

**File:** `src/backend/storeManagers/steam/library/updatePollOnce.ts:137-162, 207-232`
**Issue:** An update poll has two early exits:
1. The non-quiet completion at line 151.
2. The no-activity quiet end at line 207, which runs only while `!awaiting.sawActivity`.

Before 74-34, a poll that had seen activity always left through (1) once the ACF went non-pending with bit 4 set. Now (1) is blocked whenever `buildid === fromBuild && buildid !== targetBuild`. Once `sawActivity` is true, (2) can never fire.

So consider any sequence where Steam shows `0x100`/`0x400` (or growing bytes under `0x2`) and the ACF then settles at `StateFlags 4`, `buildid = fromBuild`, `TargetBuildID = fromBuild`. In that case the poll keeps sending `gameStatusUpdate: updating` plus a progress bar, made from Steam's leftover byte counters, on every tick until `MAX_TICKS` (7200 ticks, about 6 h).

Realistic triggers:
- Steam starts and then abandons the update.
- The developer rolls the branch back, so the PICS target captured at hand-off is no longer what Steam serves.
- InstallApp makes Steam briefly flag the app as running and then conclude that it is current.

While this lasts, the game card is held in 'updating'. Before this change the poll ended, though with a misleading log line. Now it hangs.

None of the 74-34 tests cover the case where activity is seen and the ACF then lands at the stale build. Test E (`never logs finished at the stale starting build`) runs one tick with `sawActivity` false, and asserts only that the poll is still alive.

**Fix:** Give the stale-start case its own bounded exit that does not depend on `sawActivity`. For example, count consecutive settled-at-stale-start ticks and end quietly, invalidating the cached state as the quiet end already does:
```ts
if (!pending && atStaleStart && (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0) {
  awaiting.staleSettledTicks = (awaiting.staleSettledTicks ?? 0) + 1
} else {
  awaiting.staleSettledTicks = 0
}
...
if (
  (awaiting.staleSettledTicks ?? 0) >= STEAM_REQUEST_NO_ACTIVITY_TICKS ||
  (!awaiting.sawActivity && poll.ticks - poll.delegatedSinceTick >= STEAM_REQUEST_NO_ACTIVITY_TICKS)
) { /* existing quiet-end block */ }
```
Add a test: tick with `0x106`, then repeated ticks at `{stateFlags:4, buildid:'100', targetBuildId:'100'}`. Assert that the poll stops and sends `done`, and never logs `finished (build 100)`.

### WR-02: The stale-build guard does nothing when the hand-off target equals `fromBuild`

**File:** `src/backend/storeManagers/steam/library/updatePollOnce.ts:137-140, 211-218` (target produced by `src/backend/storeManagers/steam/updateNative.ts:92-98`)
**Issue:** `atStaleStart` requires `fields.buildid !== awaiting.targetBuild`. `updateNative` computes `targetBuild = acfTarget ?? known?.targetBuild` whenever the ACF is pending.

Take an ACF that is pending through `StateFlags & 0x2` or through `ScheduledAutoUpdate`, but whose `TargetBuildID` still equals `buildid`. The code comment at `updateNative.ts:89-90` describes exactly this ACF for the Steam-closed case. For that ACF, `acfTarget === fromBuild`, so the hand-off records `targetBuild === fromBuild` and ignores the newer PICS build.

Then `atStaleStart` is always false. Once `sawPending` is set, the line-151 completion fires at the stale build, and the quiet end at line 215 also treats `buildid === targetBuild` as current. This is the UAT 25 symptom, `finished (build 100)` at the old build with the badge dropped, on a different code path.

**Fix:** Do not let a placeholder ACF target hide the PICS target. In `updateNative.ts`:
```ts
const acfTarget =
  acfFields?.targetBuildId &&
  acfFields.targetBuildId !== '0' &&
  acfFields.targetBuildId !== acfFields.buildid
    ? acfFields.targetBuildId
    : undefined
```
Then pin it with a test: a pending ACF with `TargetBuildID == buildid` and a known PICS target must hand off with `targetBuild` set to the PICS build.

### WR-03: Retrying on pending-but-idle can resume or re-prioritise a download the user queued or paused in Steam

**File:** `src/backend/storeManagers/steam/library/updatePollOnce.ts:48-56, 141-149`
**Issue:** With `sawPending` removed, only `sawActivity` disarms the retry. `sawActivity` is set by the `0x100`/`0x400` flags, or by growing bytes under `0x2`.

Two states look the same as "required but idle" from the ACF alone (`StateFlags 6`, bytes not growing):
- An update that Steam has queued behind another download.
- An update the user paused in Steam before any tick saw it running.

The retry then sends InstallApp on the next due tick (at most once on `ok`, up to 13 times otherwise). That can move the app to the front of Steam's download queue, or resume a download the user paused. The plan's rationale (`AutoUpdateBehavior 1`, nothing downloaded) holds for the UAT 25 capture, but the guard does not check those preconditions.

**Fix:** Narrow the re-arm to the state UAT 25 actually captured: pending with `bytesDownloaded === 0`, and no partial progress ever seen. Keep the old disarm when bytes are non-zero but not growing:
```ts
if (fields.bytesDownloaded > 0) awaiting.sawPartial = true
// in retryInstallApp guard:
awaiting.sawActivity || awaiting.sawPartial ||
```
Add a test that `{stateFlags:6, bytesDownloaded:500, bytesToDownload:1000}` held steady does not retry.

## Info

### IN-01: The candidate count is logged before `checkGameUpdates` drops non-badge entries

**File:** `src/backend/storeManagers/steam/library/index.ts:344`; `src/backend/utils/checkGameUpdates.ts:64-67`
**Issue:** `candidates=<n>` is logged inside `listAutoUpdateableGames`. The caller then applies `autoSource.filter((a) => badge.includes(a))`, which can remove entries without logging anything. A `candidates=2` line followed by no queued updates would point the UAT 28 diagnosis the wrong way. The count also leaves out the appIds.
**Fix:** Log the appIds (`candidates=${out.length} [${out.join(',')}]`). Alternatively, log the post-filter list handed to `autoUpdate` in `checkGameUpdates`.

### IN-02: The off-branch line is logged on every library refresh

**File:** `src/backend/utils/checkGameUpdates.ts:41-46`
**Issue:** `checkGameUpdates` runs on every frontend refresh (`libraryState.ts:563`). With auto-update off, which is a normal user choice, the same info line is written every refresh. That is noise, not a defect.
**Fix:** Consider logging it only when the value changes, or accept it as intentional for the UAT 28 diagnosis.

### IN-03: The 74-34 tests pin one tick and leave the guarded paths unexercised

**File:** `src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts` (UAT 25 block added in `5e55d2e36`)
**Issue:** The `never logs finished at the stale starting build` test asserts only that the poll exists after one extra tick. The tests do not cover:
- What happens at or after `STEAM_REQUEST_NO_ACTIVITY_TICKS`.
- `sawActivity` true combined with the stale start (WR-01).
- `targetBuild === fromBuild` (WR-02).

So the regression these tests pin is narrower than the code change they cover.
**Fix:** Add the WR-01 and WR-02 tests above. Also extend test E to drive `p.ticks` to `STEAM_REQUEST_NO_ACTIVITY_TICKS`, and assert the quiet end: `done` sent, `invalidateSteamUpdateState` called, no `finished` line.

---

_Reviewed: 2026-11-14T03:30:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
