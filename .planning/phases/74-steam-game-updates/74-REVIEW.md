---
phase: 74-steam-game-updates
depth: standard
files_reviewed: 53
diff_base: d4676c751
findings: { critical: 0, warning: 10, info: 3, total: 13 }
status: issues_found
reviewed: 2026-11-13
---

# Phase 74 code review (standard)

Scope: the 53 non-test source files touched by Phase 74 commits (d4676c751..HEAD), excluding files changed only by the concurrent quick task 261113-8m6. delta.rs was read in full; the other 52 files were read as Phase 74 diffs. There are no blockers; WR-01 is the closest call.

## Warnings

### WR-01: Retired-depot logic treats any unselected depot as retired, which can delete installed content
- File: `src/backend/storeManagers/steam/depotRust/install.ts:200-224`
- Issue:
  - `selected` is built only from `refs.depots`. Every ACF-installed depot not in it is sent to Rust as a retired depot, and delta.rs `removed_paths` deletes its files.
  - A depot can be absent from `refs.depots` without the new build dropping it. `refs.skippedDepots` holds EResult-40 blocked depots, and `selectAllDepots` can omit a depot for language, OS or DLC ownership. A transient or partial ownership answer, or a language change, would delete DLC or language content.
  - The retired depot key is fetched with `ownerAppId: appId`, which is wrong for DLC or shared depots.
- Fix: retire only depots absent from the branch's PICS depot list for this build. Exclude `skippedDepots`, and never delete a depot the selector skipped for ownership or language.

### WR-02: Estimate over-counts reused chunks and under-counts new depots (UAT gap: estimate 3-7x high)
- File: `src-tauri/crates/gamelib-depot/src/manifest.rs:88-98` and `src/backend/storeManagers/steam/depotRust/updateEstimate.ts:117-130`
- Issue:
  - `unique_chunk_bytes(ws.changed)` counts every chunk of every changed file. It does not subtract chunks whose SHA already exists anywhere in the old manifest, which delta.rs reuses via `OldIndex`.
  - A depot with no old GID (`d.delta === undefined`) is skipped in TS. Its bytes are missing from both download and peak, so the free-space check can pass wrongly.
- Fix: subtract old-manifest chunk SHAs, which needs no local hashing. For new depots, add `total_bytes` to the download figure and the peak.

### WR-03: Pause discards completed temps, so resume re-downloads the whole delta (UAT gap)
- File: `src-tauri/crates/gamelib-depot/src/delta.rs:1273-1287` and `1527-1535`
- Issue: temps are deleted at the start of every run and on any cancel or failure before commit. Pause maps to cancel, so every built and SHA-verified temp is thrown away.
- Fix: on cancel, keep temps that passed the whole-file SHA. Reuse a temp whose size matches and whose re-hash matches. Delete temps only on error or when the target build changes.

### WR-04: Update-state cache is not refreshed for registered games, so completion is not reflected (UAT gap, item 12)
- File: `src/backend/storeManagers/steam/updateInfo.ts:33-44`, `updateDetection.ts:140`, `library/updatePollOnce.ts:106-118`
- Issue:
  - `getLastKnownSteamUpdateState` has no TTL and no ACF re-read.
  - The poll's quiet end (40 ticks) fires even when `sawPending` is true, and it does not invalidate the cache.
  - `SteamUpdateInfo.tsx` refetches only when `[appName, hasUpdate]` change.
- Fix: recompute registered state from the ACF on every call. Do not end the poll quietly after `sawPending`, or at least invalidate the cache when it ends. Refetch in the frontend on the 'done' transition.

### WR-04b: The pre-launch "bounded 3 s" PICS wait is not bounded
- File: `src/backend/storeManagers/steam/updateDetection.ts:231-241`
- Issue: `anonymousClient.get('update-check')` sits outside `withTimeout`, and its own connect timeout is 15 s. Play on a slow network can block about 18 s, because `force: true` bypasses the cache.
- Fix: wrap the client connect and `getProductInfo` in one `withTimeout(…, timeoutMs)`.

### WR-05: Launch is allowed while a bridge update is queued or running
- File: `src/backend/storeManagers/steam/updateLaunchPrompt.ts:51-55`
- Issue: a queued or in-flight update returns 'launch'. During commit the ACF still has bit 4, so Play can start the game on a half-renamed tree.
- Fix: when an update is queued or in flight, notify and abort. Key prompt suppression on the ack instead.

### WR-06: A committed delta that raced an abort is reported as cancelled
- File: `src/backend/storeManagers/steam/depotRust/install.ts:~266-274`, `src/backend/storeManagers/steam/updateBridge.ts:150-153`
- Issue: if `signal.aborted` is set when Rust returns completed, the result is rewritten to cancelled. Follow-ups (shim re-handover, redists, DRM) and the state invalidation are skipped on an updated tree, and the shim may already be replaced by the new genuine DLL.
- Fix: when `outcome.delta?.committed` is true, report done and run the follow-ups.

### WR-07: Planning context is never cleared; hero label (UAT gap, hypothesis)
- File: `src/backend/storeManagers/steam/depotRust/progressBridge.ts:45-58`, `src/backend/downloadmanager/utils.ts:486`
- Issue: `stage:delta_planning` sets context `steam-update-planning`, and nothing clears it on `planned`. The long pre-job TS work (estimate with the lease, buildDepotRefs, retired-key fetches) runs before any stage event, under the generic `updating` status. The root cause of the missing label is not confirmed from source.
- Fix: emit the planning status from TS before the estimate. Send a plain `updating` status on `planned`.

### WR-08: Auto-update can start an authenticated logon unattended and re-queue failing updates on every refresh
- File: `src/backend/utils/checkGameUpdates.ts:50-63`, `src/backend/storeManagers/index.ts`, `src/backend/storeManagers/steam/updateBridge.ts:120-125`
- Issue:
  - `estimateBridgeUpdate` takes `acquireAuthenticated(guidedAction: 'install')` with no user gesture, against the rule that authentication happens only on demand.
  - A failing update is re-queued on every refresh, with an error dialog each time.
  - Detection runs twice per refresh.
- Fix: make the auto path non-interactive (no guided sign-in, no error dialog), record a per-build "auto-update attempted" marker, and share one detection result.

### WR-09: Fallback is taken on any old-manifest load failure, including transient ones
- File: `src-tauri/crates/gamelib-depot/src/delta.rs:1082-1087`
- Issue: a timeout, a 5xx or `not_signed_in` silently becomes a whole-install file-level reconcile. That reconcile also clears `retired_depots`, so obsolete files stay.
- Fix: fall back only on a definitive unavailable or decode error. Propagate transient failures so the user can retry.

### WR-10: `estimateBridgeUpdate` can collide on the active-job key and has no bound
- File: `src/backend/storeManagers/steam/depotRust/updateEstimate.ts:100-110`, `updateInfo.ts:75`
- Issue: the fixed key `summary-${appId}` collides between "Show update size" and a queued update's estimate, so one dispose can unregister the other's refresher. There is no signal or timeout, so a hung lease stays held.
- Fix: use a unique key. Pass an AbortSignal with a timeout of about 60 s.

## Info

### IN-01: `ManifestStore::prune(protected)` has no production caller
- File: `src-tauri/crates/gamelib-depot/src/manifest.rs:529`. The installed-GID protection is dead, and the cache grows unbounded.

### IN-02: A cancel after the journal write leaves an orphan journal
- File: `src-tauri/crates/gamelib-depot/src/delta.rs:1509-1527`. On a fresh run, the next run treats the orphan as a resume and hashes every file. If the next run targets a newer build, it forces the whole-install fallback.

### IN-03: Commit deletes retired files even after a rename failed
- File: `src-tauri/crates/gamelib-depot/src/delta.rs:690-703`. Skip the removals once `failures` is non-empty.

## UAT gaps located
- Stacked pre-launch prompts: confirmed. `src-tauri/src/dialogs.rs:151` renders custom buttons only when there are exactly 2. The 3-button `updateLaunchPrompt.ts:57-70` falls back to OK-only, and OK = response 0 = Update now. Fix: use 2 buttons or a renderer modal, and remove the duplicate (inherited Heroic frontend prompt plus backend gate).
- Registered completion not reflected: WR-04. Estimate high: WR-02. Resume re-downloads: WR-03. Hero planning label: WR-07.

## Checked and sound
- Journal: resume matching, numeric validation, the 0o700 directory and `deny_unknown_fields`.
- Path containment: `resolve_contained_path` on every read, write, rename and delete.
- GIDs: kept as strings end to end.
- Sidecar exit contract: no new timers or handles. The update poll reuses the existing interval.
- Detection: bounded to one batched PICS read.
