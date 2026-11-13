---
phase: 74-steam-game-updates
reviewed: 2026-11-13T05:09:24Z
depth: standard
diff_base: 1ef53a785
files_reviewed: 51
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - src-tauri/crates/gamelib-depot/src/delta.rs
  - src-tauri/crates/gamelib-depot/src/manifest.rs
  - src-tauri/crates/gamelib-depot/tests/delta_fallback.rs
  - src-tauri/crates/gamelib-depot/tests/summarize_delta.rs
  - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
  - src-tauri/src/dialogs.rs
  - src-tauri/src/main.rs
  - src/backend/downloadmanager/__tests__/updateElement.test.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/downloadmanager/updateElement.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/storeManagers/__tests__/createStoreManagers.test.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/index.ts
  - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
  - src/backend/storeManagers/steam/__tests__/updateBridge.test.ts
  - src/backend/storeManagers/steam/__tests__/updateDetection.test.ts
  - src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts
  - src/backend/storeManagers/steam/__tests__/updateInfo.test.ts
  - src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts
  - src/backend/storeManagers/steam/__tests__/updateNative.test.ts
  - src/backend/storeManagers/steam/acfInstalledDepots.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
  - src/backend/storeManagers/steam/depotRust/install.ts
  - src/backend/storeManagers/steam/depotRust/retire.ts
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library/installPolling.ts
  - src/backend/storeManagers/steam/library/installRoot.ts
  - src/backend/storeManagers/steam/library/pollState.ts
  - src/backend/storeManagers/steam/library/updatePollOnce.ts
  - src/backend/storeManagers/steam/updateBridge.ts
  - src/backend/storeManagers/steam/updateDetection.ts
  - src/backend/storeManagers/steam/updateInfo.ts
  - src/backend/storeManagers/steam/updateLaunchPrompt.ts
  - src/backend/storeManagers/steam/updateNative.ts
  - src/common/types.ts
  - src/common/types/game_manager.ts
  - src/frontend/helpers/__tests__/libraryLaunchSteamUpdatePrompt.test.ts
  - src/frontend/helpers/library.ts
  - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx
  - src/frontend/state/__tests__/libraryState.test.ts
  - src/frontend/state/libraryState.ts
findings:
  critical: 2
  warning: 3
  info: 6
  total: 11
status: issues_found
---

# Phase 74: Code Review Report (gap-closure re-review, plans 74-14..74-21)

**Reviewed:** 2026-11-13T05:09:24Z
**Depth:** standard
**Files Reviewed:** 51
**Status:** issues_found

## Summary

This re-review covers the gap-closure diff `1ef53a785..HEAD` over the 51 files that plans 74-14 to 74-21 touched. It replaces the first-pass review, which stays in git history. Most prior findings are fixed and their fixes look sound: the retire rule, the committed-wins race, the IN-03 removal gate, the bounded pre-launch PICS read, the in-flight/queued launch block and the three-button dialog mapping.

Two plans brought in new defects:

- **74-18's "already current" short-circuit** in `updateRegisteredSteamGame` makes a Steam-registered update impossible when Steam is closed (CR-01).
- **74-19 and 74-18 together** (unattended failure, then the queue's `done`, then a refresh-with-update-check, which the new re-run slot now always delivers) form a self-feeding auto-update retry loop under the default `autoUpdateGames: true`. This makes the deferred re-queue todo more severe (CR-02).

WR-09 is only partly fixed: a transient Node request-code failure still takes the whole-install fallback.

These already-recorded issues are not re-reported: Esc not dismissing the macOS three-button box, the `depotJobEvent` IPC `invalid_union`, the update-button flash, and the todos deferred by 74-21.

## Prior findings disposition

| Prior ID | Disposition | Verified against current code |
| --- | --- | --- |
| WR-01 retire deletes unselected depots | **Fixed** | `depotRust/retire.ts` retires only depots absent from the unfiltered branch list (`collectBranchDepotList`). It keeps selected, skipped, still-on-branch, list-incomplete and DLC-not-fetched depots. The key is fetched with the real owner (`install.ts:207-227`). |
| WR-02 estimate over/under-count | **Fixed** (see IN-02) | `manifest.rs` `unique_new_chunk_bytes` excludes old-manifest SHAs. `updateEstimate.ts:139-171` adds new-depot `totalBytes` to download and peak. |
| WR-03 pause discards temps | **Deferred to todo** | `2026-11-13-bridge-update-resume-keeps-verified-temps.md`; `delta.rs` is unchanged here. |
| WR-04 registered completion not reflected | **Fixed**, but a new defect was introduced (CR-01, WR-02) | `updateInfo.ts:47-55` re-reads registered state. `updatePollOnce.ts` completes on target build or on quiet end with a current ACF, and invalidates on quiet end. `SteamUpdateInfo.tsx` refetches on status change. `libraryState.ts` adds a re-run slot. |
| WR-04b pre-launch PICS wait unbounded | **Fixed** | `updateDetection.ts:231-243`: connect and read are inside one `withTimeout`, and the late rejection is swallowed. |
| WR-05 launch while update queued/running | **Fixed** | `updateLaunchPrompt.ts:53-80`: blocks on `nativeInstallsInFlight` (not aborted), and on a queued update while the queue is `running`. |
| WR-06 committed delta reported cancelled | **Fixed** | `install.ts:297-311` and `updateBridge.ts:187-191`: a committed delta bypasses the abort rewrite and runs follow-ups. |
| WR-07 planning label | **Deferred to todo** | `2026-11-13-bridge-update-hero-planning-label.md` |
| WR-08 unattended logon / re-queue / double detection | **Partially fixed** | Unattended auth is fixed: no `guidedAction`, no Keychain-gate unlock, registered games refused. The re-queue and double-detection remainder is deferred to `2026-11-13-auto-update-requeue-churn-and-double-detection.md`. CR-02 shows the remainder is a self-feeding loop, so the todo understates it. |
| WR-09 fallback on any old-manifest failure | **Partially fixed** | `delta.rs:879-885`: 5xx, network and io errors now fail the run. But `ManifestUnavailable` stays "definitive", and a failed or refused Node request-code call degrades into it (`fetch.rs:341` then `fetch.rs:290-294`). See WR-01. |
| WR-10 estimate job-key collision / no bound | **Deferred to todo** | `2026-11-13-update-estimate-job-key-collision-and-bound.md`; `summary-${appId}` key unchanged (`updateEstimate.ts:104`). |
| IN-01 `prune` has no caller | **Deferred to todo** | `2026-11-13-manifest-store-prune-has-no-caller.md` |
| IN-02 orphan journal after cancel | **Deferred to todo** | `2026-11-13-orphan-delta-journal-after-cancel.md` |
| IN-03 removals after a failed rename | **Fixed** | `delta.rs:690-708`: removals run only when `failures.is_empty()`, with a warning otherwise. Covered by `commit_rename_failure_removes_no_retired_file`. |
| UAT 7 stacked prompts / OK = Update now | **Fixed** (Esc is a known open issue) | `dialogs.rs` `YesNoCancelCustom` plus `three_button_choice` (no `Ok` guess). Play anyway is index 0 and `cancelId` is 0. `library.ts:178-183` suppresses the inherited prompt for Steam. |

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Updating a Steam-registered game while Steam is closed does nothing (74-18 regression)

**File:** `src/backend/storeManagers/steam/updateNative.ts:51-65`
**Issue:**
- The new short-circuit treats "ACF not pending and bit 4 set" as "already current" and returns `{ status: 'done' }` without handing anything to Steam. That is not what makes a registered game stale.
- `updateDetection.ts:206-209` asks PICS about a registered game exactly when **Steam is not running and the ACF is not pending**. It marks the game `stale` when PICS reports a newer build (`updateDetection.ts:300-305`). The ACF does not know about the update yet because Steam has not run to learn of it.
- With the short-circuit, clicking Update on such a game:
  1. logs "already current",
  2. invalidates the cache,
  3. returns done; the queue then sends updating and done, and the badge clears,
  4. on the next refresh, PICS re-detects `stale` and the badge comes back.
- Before 74-18 this path opened `steam://nav/games/details/<id>`, which started Steam so it could see the update. The user can now never update a registered game from GameLib while Steam is closed.
- The new test only covers an ACF with no PICS knowledge (`updateNative.test.ts`, "already-current ACF"). It does not cover the PICS-stale case.

**Fix:** Short-circuit only when no cached PICS target contradicts the ACF:
```ts
const known = getLastKnownSteamUpdateState(deps, appId)
const picsSaysNewer =
  known?.targetBuild !== undefined && known.targetBuild !== acfFields?.buildid
if (acfFields && !isAcfUpdatePending(acfFields) &&
    (acfFields.stateFlags & 0x4) !== 0 && !picsSaysNewer) { ...already current... }
```
Add a test: ACF says current with buildid 777, the cached state is `{ kind: 'registered', state: 'stale', targetBuild: '800' }`, and the result must be a hand-off (openExternal or InstallApp) plus a poll with `targetBuild: '800'`.

### CR-02: A failing unattended bridge auto-update re-triggers itself with no limit (escalates the deferred WR-08 todo)

**File:** `src/backend/downloadmanager/utils.ts:485-530`, `src/frontend/state/libraryState.ts:346-366` and `:223-255`, `src/backend/utils/checkGameUpdates.ts:50-61`, `src/backend/storeManagers/steam/updateBridge.ts:140-148`
**Issue:**
- `autoUpdateGames` defaults to `true` (`backend/config.ts:321`). Take a stale bridge game in a boot where the Keychain gate is still locked. 74-19 made the unattended lease refuse at once: no guided sign-in, no gate unlock.
- The failure then feeds itself:
  1. `updateQueueElement` sends `updating`, and `estimateBridgeUpdate` fails fast.
  2. The `finally` sends `done`, and the queue notifies "Update Failed".
  3. In the frontend, a `done` that follows `updating` calls `refreshLibrary({ checkForUpdates: true })` (`libraryState.ts:349-355`).
  4. `checkGameUpdates` asks `listAutoUpdateableGames`, which still says stale, and `autoUpdate` re-queues the game ("Update Started").
  5. The cycle starts again.
- Before 74-18, a `done` that landed while that refresh was still in flight hit the `refreshing` guard and was dropped, which could break the cycle by accident. The new `pendingUpdateCheckRerun` slot now guarantees every such request gets its re-check.
- Each cycle costs two OS notifications plus a detection pass. The deferred todo frames this as "re-queued on every refresh". In fact each failure causes the next refresh, so it is a loop, not churn.

**Fix:** Pull the todo's per-build "auto-update attempted" marker into this phase. Record `{appId, targetBuild}` when an unattended update fails, and have `listAutoUpdateableGames` (or `autoUpdate`) skip that pair until the target build changes or the user acts. As a cheap backstop, skip the `checkForUpdates` refresh in `libraryState` for a `done` whose element was unattended, or pass `unattended` through the status so the frontend can tell.

## Warnings

### WR-01: WR-09 only partly fixed: transient request-code failures still force the whole-install fallback

**File:** `src-tauri/crates/gamelib-depot/src/delta.rs:874-885`, `src-tauri/crates/gamelib-depot/src/fetch.rs:290-294,341`
**Issue:**
- The old-manifest ref is loaded with `request_code: None`, so `fetch_manifest` asks Node.
- Any Node-side failure becomes `Ok(None)`: CM disconnected, not signed in, a lease refused, a timeout. `Ok(None)` then becomes `ManifestUnavailable` ("no manifest request code"), and `is_definitive_old_manifest_failure` treats `ManifestUnavailable` as definitive. The doc comment says so explicitly.
- The prior finding named `not_signed_in` as exactly the transient case that must not fall back. The fallback still clears `retired_depots`, so a transient CM blip still leaves obsolete files behind and turns a 1 GB delta into a whole-install SHA reconcile.
- The tests use HTTP status replies, so they do not cover this path.

**Fix:** Make the Node failure distinguishable. Have `request_code_from_node` return `Err(Failed{kind: CmUnavailable | NotSignedIn, ..})` for a refused or failed Node call, and keep `Ok(None)` only for "Steam answered with no code". Or tag the "no manifest request code" failure with a distinct kind that `is_definitive_old_manifest_failure` excludes. Add a delta_fallback test whose fake host refuses `manifest_request_code`.

### WR-02: Game-page re-read with a 3 s bound can flip a stale registered game to "current"

**File:** `src/backend/storeManagers/steam/updateInfo.ts:47-55` (with `updateDetection.ts:306-308`)
**Issue:**
- The new registered re-read calls `detectSteamUpdates` with `STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS` (3 000 ms) instead of the 20 000 ms refresh bound. It is not forced, but the PICS TTL expires.
- When Steam is closed, the ACF is not pending and PICS is needed, the anonymous connect plus read now has 3 s (cold connects routinely exceed that).
- On timeout, a registered candidate falls into "PICS could not cross-check: the ACF alone says current". That writes `state: 'current'` into the cache and hides the update line on a game that is actually stale. It is the same Steam-closed case as CR-01.
- This contradicts the module contract "A PICS failure never produces 'stale' or 'current'". The tighter timeout makes the path far more likely than the refresh path.

**Fix:** Use `STEAM_UPDATE_REFRESH_TIMEOUT_MS` here, or skip the re-read when the ACF is unchanged since the cached `installedBuild`. Separately, make the registered timeout branch keep `prior` (as the bridge branch does) instead of writing `current`.

### WR-03: An auto-update re-queue silently downgrades a user-queued update to unattended

**File:** `src/backend/storeManagers/index.ts:259-270` with `src/backend/downloadmanager/downloadqueue.ts:310-317`
**Issue:**
- `addToQueue` replaces an existing element for the same app (`elements[elementIndex] = element`).
- Suppose the user clicks Update (or "Update now" in the launch prompt) and the element waits behind another download. Any refresh then runs `autoUpdate`, which replaces it with a `{ unattended: true }` element.
- When it runs, the user's update gets no guided sign-in, no Keychain-gate unlock, and for a registered game an outright `abort` (`games.ts:811-817`). The user asked for that update.

**Fix:** In `autoUpdate`, skip apps that already have a queue element. Or in `addToQueue`, never let an `unattended` element replace an attended one (merge as `unattended = existing.unattended && incoming.unattended`).

## Info

### IN-01: `awaitingUpdate.targetBuild` completion clause is redundant

**File:** `src/backend/storeManagers/steam/library/updatePollOnce.ts:75-77`
**Issue:**
- `targetBuild` is a stale target, so it always differs from the installed `fromBuild`. That means `fields.buildid === targetBuild` already implies `fields.buildid !== fromBuild`, and the new clause can never change the result.
- The plumbing through `pollState`, `installPolling` and `installRoot` buys nothing for completion. The UAT 12 fix actually comes from the `updateNative` short-circuit and the quiet-end branch.

**Fix:** Drop the clause, or document it as defensive.

### IN-02: `max_download_bytes` is no longer a maximum

**File:** `src-tauri/crates/gamelib-depot/src/manifest.rs:113-130`
**Issue:**
- After WR-02, the figure assumes every old file is intact. The doc comment says local damage "can only raise it, which the 'up to' wording covers", but "up to X" promises the real figure will not exceed X.
- New depots also add uncompressed `totalBytes` to a compressed-bytes download figure (`updateEstimate.ts:157`), which is inconsistent in the other direction.

**Fix:** Rename the field or the UI copy (for example "about X"), or keep the old figure as the bound and show the new one as the expected value.

### IN-03: `depotOwners[depotId]` lookup in the retire owner is dead

**File:** `src/backend/storeManagers/steam/depotRust/retire.ts:714`
**Issue:** A depot reaches the retire arm only when it is absent from `branchDepotIds`. `depotOwners` has keys only for branch depots, so `refs.depotOwners[depotId]` is always `undefined` there. The owner for a retired base-app depot is always `appId`. This is correct, but the expression suggests otherwise. Also, `KeptReason` is a non-exported type used in an exported interface, which knip flags (`pnpm find-deadcode` fails, per 74-19-SUMMARY).

**Fix:** Use `ownerAppId: dlc ?? appId` and export `KeptReason`.

### IN-04: `collectBranchDepotList` repeats the "using its public manifest" log for every depot

**File:** `src/backend/storeManagers/steam/depot/plan.ts:418-425` via `select.ts:496-514`
**Issue:** `branchManifestGid` logs on every public fallback. It now runs twice per plan (once in `selectDepots`, once in `collectBranchDepotList`, which also covers unselected and DLC depots). On a beta branch, every non-beta depot logs twice per estimate and per update.

**Fix:** Pass a `log: false` flag from `collectBranchDepotList`.

### IN-05: Unattended failure log says "update not started" for failures after the job ran

**File:** `src/backend/storeManagers/steam/updateBridge.ts:104-111,201`
**Issue:**
- `logUnattendedFailure` is also called when `downloadSteamDepotsRust` returns `error`, which can happen after download or a commit failure. The fixed message "update not started" is then wrong.
- The disk-space and branch-unresolved refusals do not log the unattended marker at all.

**Fix:** Take the phase as a parameter (`'not started' | 'failed'`), and call it on every unattended error return.

### IN-06: `deps as unknown as SteamUpdateDeps` double cast and magic `0x4`

**File:** `src/backend/storeManagers/steam/updateNative.ts:58,69`
**Issue:**
- `getLastKnownSteamUpdateState` only needs `Pick<SteamUpdateDeps, 'steamInstallRuntime'>`, so the `unknown` cast hides any future type drift.
- `0x4` duplicates `STATE_FLAG_FULLY_INSTALLED` from `updatePollOnce.ts`.

**Fix:** Pass `deps` directly (it carries `steamInstallRuntime`), and export or share the flag constant.

---

_Reviewed: 2026-11-13T05:09:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
