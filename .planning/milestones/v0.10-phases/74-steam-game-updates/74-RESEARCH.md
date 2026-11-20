# Phase 74: Steam game updates - Research

**Researched:** 2026-11-12
**Domain:** Steam update detection (ACF + PICS), chunk-level delta in the Rust `gamelib-depot` crate, download-queue integration, Mac Steam `InstallApp` hand-off
**Confidence:** HIGH on mechanics (spikes 069/070/076 are live-measured and the code was read this session); MEDIUM on resume-after-interrupted-commit and on the frontend wiring (not exercised); LOW only on the `steam://` hand-off URI.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by roadmap and spikes (not re-asked)**
- **Delta mechanics (spike 076):**
  - The delta is **chunk-level**, not file-level.
  - New files are built beside the old tree, then committed: temp files, a `sha_content` check, rename, and only then delete removed files. No old file is overwritten or deleted until every new file that reads from it has been built.
  - Every reused chunk is SHA-1 checked from its local bytes. A chunk that fails becomes a CDN chunk.
  - The free-space check is for the peak extra disk, which is the total size of the changed files, not the download size.
  - Only paths the manifest owns are ever written or deleted. Unowned files are kept: the shim's `.gamelib-orig`, `gamelib_bridge.cfg`, DXVK caches, logs. Game-modified files that the update doesn't change are left alone.
- **Old manifest:** the CDN still serves old manifests (6/6 in spike 076). Even so, cache each install's manifest in `ManifestStore` at install time and protect it from `KEEP_GIDS` pruning while the game is installed.
- **Shim handover (spike 076, step 6):** if a shimmed `steam_api*.dll` is in the change set, write the new genuine DLL to `.gamelib-orig`, then re-place the shim and rewrite `gamelib_bridge.cfg`. If it isn't in the change set, leave the shim alone.
- **After every bridge update, redo the GID-keyed follow-ups:** the steam_api shim rescan and re-placement, the per-GID redist ledger (`bridge/sharedRedistInstall.ts`), and the DRM/known-fix verdicts. The ACF gets the new `buildid` and the new `InstalledDepots` GIDs.
- **Read manifest GIDs as strings, never through `@node-steam/vdf` number coercion.** That coercion loses precision on 19-digit GIDs (spike 070, step 1).
- **Bridge detection** compares the ACF `buildid` with PICS `depots.branches.<branch>.buildid`. Spike 070 found it matched the per-GID check 28/28. Don't use `timeupdated`; older apps don't have it.
- **Refuse to update while the game is running.** A bridge update resumes through the download queue the same way an install does (Phase 73 D-07: pause = abort, and resume reconciles).
- **The delta updater is for bridge games only.** Steam-registered games are always updated by Steam.

**Auto-update policy**
- **D-01:** Bridge games follow the global `autoUpdateGames` setting. When it's on, a stale bridge game is queued for its delta update automatically, through the same `checkGameUpdates` -> `autoUpdate` path the other stores use. When it's off, the game gets only the badge and the button.
- **D-02:** GameLib never starts Steam-registered updates on its own. Even with `autoUpdateGames` on, it doesn't call `InstallApp` automatically. Steam's own schedule and any deferral you set (for example "only update when launched") are respected. GameLib only shows the state and the Update button. In practice `listUpdateableGames()` must not feed Steam-registered apps into the auto-queue: either split them out, or have `autoUpdate` skip them.
- **D-03:** No per-game auto-update override in this phase. Global setting only, as the other stores work today.

**Launching a stale game**
- **D-04:** Bridge game with a pending update + Play -> prompt "Update now / Play anyway". "Update now" queues the update. "Play anyway" launches the current build.
- **D-05:** The pre-launch check has a short timeout and never blocks Play on the network. It waits a few seconds at most. If PICS is slow or you're offline, it uses the last known state and continues. The planner picks the exact timeout.
- **D-06:** "Don't ask again for this build." The prompt offers it, keyed by the target build ID. The prompt stays hidden until a newer public build ships. The badge stays.
- **D-07:** No GameLib prompt for Steam-registered games. They launch through `steam://rungameid` as they do today, and Steam applies its own update-on-launch behaviour.

**Update UI and queue**
- **D-08:** The card reuses the existing "update available" indicator: the `gameUpdates` list in `libraryState.ts`, plus the existing "updates" filter in `filterEngine.ts`. No new Steam-specific badge design.
- **D-09:** The game page and the update confirmation show both sizes. For example: "Download 916 MB - needs 13 GB free during update". The download and the temp-disk peak differ a lot (Manor Lords: 0.9 GB against about 13 GB).
- **D-10:** Bridge updates go in the same download queue, labelled "Update". They get the same pause, resume, cancel and progress as installs. The plan/hash phase and the commit phase show as status text. The UI-facing progress shape stays as it is (Phase 73 D-06).
- **D-11:** Steam-registered updates show progress in GameLib. After `InstallApp`, the card shows "Updating..." with progress. It reuses the Steam-download progress polling that installs already use (`library/installPolling.ts`), until Steam finishes.
- **D-12:** The Steam-registered Update button respects the InstallApp opt-in. `InstallApp` sits behind "Steam Experimental InstallApp Feature" (`isSteamExperimentalInstallAppEnabled`), which is off by default and macOS-only.
  - When that setting is on, Update calls `InstallApp` through the existing helper, with spike 065's runtime slot check.
  - When it's off, or on Windows/Linux, Update hands off to the Steam client: it opens the game in Steam (a `steam://` deep link to the game's page; the planner picks the exact URI) so you can update it there.
  - Detection and the badge work either way, because they read the ACF.

**Failure and fallback**
- **D-13:** Short disk -> refuse with a clear message. For example: "Needs 13 GB free, 4 GB available." Nothing is touched, and the badge stays. There's no in-place patch mode.
- **D-14:** Old manifest unavailable -> file-level reconcile, automatically. If the old manifest is neither cached nor served by the CDN, point the Phase 73 reconcile at the new manifest. It keeps files whose SHA-1 matches and re-downloads the rest. Before starting, show the larger download size this means.
- **D-15:** Beta branches are tracked. If the ACF has a `BetaKey`, detection and update use that branch. A branch that can't be resolved (password-protected, or not visible anonymously) shows as "unknown", never as "update available".
- **D-16:** A mid-update failure leaves the old build intact and resumable. Build-beside then commit keeps the old tree playable until the commit. The queue entry shows the error with Resume, and the game still launches on its old build. There's no extra automatic retry beyond the pipeline's existing host failover and stall handling.

### Claude's Discretion
- How D-09's sizes are computed before you click. One option is a manifest-to-manifest diff, with no local hashing, as a cheap estimate. The exact plan comes at update time, because local hashing takes about 8 s on Manor Lords. The estimate must say it's an estimate if the two can differ.
- The pre-launch timeout value (D-05) and how stale-state results are cached between refreshes.
- Where the "don't ask again for this build" acknowledgement is stored (D-06).
- The `fromManifest` job schema and the event/status names for the plan and commit phases.
- How resume after an interrupted commit works. Spike 076: each file is whole-old or whole-new, so a SHA-1 reconcile against the new manifest finishes the job. The planner confirms this and tests it.
- Removed-file deletion, multi-depot apps, and file-mode flags under delta. None of these was tested in spike 076. Cover them with fixtures or unit tests.
- The exact `steam://` URI for the D-12 hand-off.

### Deferred Ideas (OUT OF SCOPE)
- Per-game auto-update override, for example to pin a build for mods. Not in this phase (D-03).
- An in-place patch mode for low disk space (D-13 refuses instead).
- Verify (`StartValidatingApp` / `verify_only` as a user action) and Move install (todo `2026-11-07-implement-steam-verify-and-move-install.md`). Kept as its own todo.
</user_constraints>

<phase_requirements>
## Phase Requirements

STEAM-01 and STEAM-02 are milestone-level. This research proposes phase-level IDs so plans and VALIDATION.md can reference them. They are suggestions for the planner to mint, not already in REQUIREMENTS.md.

| ID | Description | Research Support |
|----|-------------|------------------|
| STEAM-01 | "Update available" on an installed Steam game | |
| STEAM-01a (proposed) | Bridge detection: ACF `buildid` vs PICS branch `buildid`, BetaKey-aware, "unknown" for unresolvable branch | Spike 070 (28/28 agreement); `betaBranch.ts` helpers; anonymous `getProductInfo` |
| STEAM-01b (proposed) | Steam-registered detection from the ACF (`StateFlags` 0x2, `TargetBuildID` != `buildid`, `BytesToDownload`, `ScheduledAutoUpdate`); PICS cross-check when Steam isn't running | Spike 069 step 4/5 |
| STEAM-01c (proposed) | Surfaces: `gameUpdates`, card, game page, sizes (D-09), refresh + pre-launch check (D-04..D-06), no boot task | `checkGameUpdates.ts`, `libraryState.ts`, `filterEngine.ts`, `gameBridgeLaunchGate.ts` |
| STEAM-01d (proposed) | Steam-registered auto-queue exclusion (D-02) | `storeManagers/index.ts` `autoUpdate` |
| STEAM-02 | Update a bridge-installed game from GameLib | |
| STEAM-02a (proposed) | Rust `fromManifest` chunk-level delta: plan, CDN fetch, build-beside, commit, removed files, modes | Spike 076 + `apply.rs`; `download.rs`, `manifest.rs`, `post.rs`, `acf.rs` |
| STEAM-02b (proposed) | Queue integration: `SteamGame.update()`, `updateQueueElement`, pause/resume/cancel, refuse-while-running, disk check (D-13), D-14 fallback | `downloadmanager/utils.ts`, `gameInstallBridge.ts` |
| STEAM-02c (proposed) | GID-keyed follow-ups: shim handover, `gamelib_bridge.cfg`, redist ledger, DRM/known-fix verdicts, ACF rewrite | `bridge/*` modules |
| STEAM-02d (proposed) | Steam-registered Update button: `InstallApp` helper + fallback + `steam://` hand-off (D-12), progress polling (D-11) | `steamInstallApp.ts`, `gameInstall.ts:418-470`, `installPolling.ts` |
</phase_requirements>

## Summary

Most of the machinery already exists. Phase 73 shipped the whole Rust pipeline (`gamelib-depot`: manifest parse and cache, chunk fetch with host failover, decode, file write, sha1 reconcile, ACF write, modes), and the wire shape reserves `DepotRef.fromManifest` but refuses it in two places (`download.rs` `run_install_inner` top, and `manifest.rs` `summarize`). Spike 076 proved the algorithm end-to-end on APFS clones with production's `parse_manifest` and `decode_chunk` (`.planning/spikes/076-bridge-delta-update/src/bin/apply.rs`, 136 lines). The phase is therefore: (1) productionise that harness as a new delta job path inside `gamelib-depot` using the Fetcher, limiter, stall tracker and cancel token already there; (2) implement detection in TypeScript (ACF for both kinds, PICS buildid for bridge) behind the existing `listUpdateableGames` / `checkGameUpdates` plumbing; (3) wire `SteamGame.update()` into the existing `updateQueueElement` so the queue, progress bridge and resume path work like an install; (4) redo the bridge follow-ups after a commit.

Three facts from reading the code change the plan versus the CONTEXT's wording. First, `ManifestStore::prune` (with `KEEP_GIDS = 2`) has **no production caller**: only `tests/manifest.rs:297` calls it [VERIFIED: grep of `src-tauri`]. Every manifest `load()` already caches the raw bytes at `<cache_dir>/<depotId>/<gid>.manifest`, so "cache the installed manifest at install time" is already true for every install since Phase 73. The "protect from pruning" requirement is only a guard to add to `prune` (a `protected_gids` argument) and a regression test; do not build an eviction scheme. Second, `autoUpdate()` in `storeManagers/index.ts` is `forEach(async ...)` and returns the array synchronously, so its `gamesToUpdate = gamesToUpdate.filter(...)` reassignment is never observed by the caller. Auto-queued games therefore still come back in the badge list, which is what D-08 wants, but it means D-02 cannot be implemented by relying on its return value. Third, an `'update'` queue element is already supported end to end (`updateQueueElement` calls `library[runner].getGame(appName).update(...)`, sets `status: 'updating'`, emits notifications, and the queue explicitly does not revalidate update heads), so `SteamGame.update()` is the only entry point to fill.

**Primary recommendation:** Build the delta as a new Rust module (`delta.rs`) invoked from `run_install_inner` when every `DepotRef.fromManifest` is `Some`, reusing `Fetcher`, `InflightLimiter`, `container::decode_chunk` and `post::apply_file_modes`; keep PICS/depot selection/ACF-policy/follow-ups in TypeScript; split Steam into "badge list" (bridge + registered) and "auto-queue list" (bridge only) so D-02 is structural rather than a skip inside `autoUpdate`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bridge stale detection (ACF vs PICS buildid) | Sidecar (TS, `steam/`) | Frontend (display) | PICS runs through the sidecar's anonymous CM client; Rust is not in the CM path (73 D-01..D-04) |
| Steam-registered stale detection | Sidecar (TS ACF read, optional helper IPC) | Native helper (`BIsAppUpToDate`) | ACF read needs no helper and works when Steam is closed (069) |
| Delta plan / fetch / build / commit | Rust (`gamelib-depot`) | Sidecar (job description, keys, hosts, tokens) | Per-file/per-chunk work stays in Rust; bytes never cross the pipe (73 D-01) |
| Depot selection, build ids, branch choice, depot keys | Sidecar (TS `depot/plan.ts`, `betaBranch.ts`) | | Established TS ownership |
| Disk-space check (peak extra disk) | Rust (plan phase knows the change set) | Sidecar (message copy) | Only Rust knows the exact changed-file bytes after planning; sidecar needs an estimate beforehand (manifest diff) |
| ACF rewrite after update | Rust (`acf.rs` finalize) | Sidecar (policy inputs via `FinalizeSpec`) | 73 D-11 |
| Shim/redist/DRM follow-ups | Sidecar (`bridge/*`) | | GID-keyed TS modules; Wine/bottle access lives there |
| Queue, pause/resume/cancel, progress | Sidecar (`downloadqueue.ts`, `progressBridge`) | Frontend (Downloads screen) | Existing; update elements already supported |
| Update badge, filter, confirmation sizes | Frontend (`libraryState`, `filterEngine`, GamePage) | Sidecar (IPC to supply sizes) | Existing `gameUpdates` list |
| Play-time prompt (D-04) | Sidecar decides, frontend dialog | | `launchBridgeGame` is backend; use the existing dialog mechanism |
| Steam-registered Update button | Sidecar -> native helper (`InstallApp`) | OS (`steam://` hand-off) | `steamInstallApp.ts` |

## Standard Stack

No new dependencies are needed. Everything below is already in the repo.

### Core
| Library / module | Version | Purpose | Why Standard |
|---|---|---|---|
| `gamelib-depot` (Rust crate, in-repo) | in-repo | Delta job, Fetcher, ManifestStore, decode, reconcile, ACF, modes | Phase 73's pipeline; `fromManifest` slot reserved for this phase |
| `sha1` / `tokio` / `tokio-util` / `futures` (already crate deps) | pinned in `src-tauri/Cargo.lock` | Chunk hashing, async fetch, cancel | Already used by `reconcile.rs` and `download.rs` |
| `steam-user` (anonymous client wrapper) | pinned (frozen stack) | PICS `getProductInfo` for the branch `buildid` | `CLAUDE.md` frozen stack; `anonymousClient.ts` |
| `@node-steam/vdf` | pinned | ACF read (`buildid`, `StateFlags`, `BetaKey`) | Frozen stack. Not for `InstalledDepots` GIDs (see Pitfall 1) |
| Jest 29 + ts-jest; `cargo test` | in-repo | Tests | `73-VALIDATION.md` |

Alternatives considered: file-level reconcile alone (rejected by spike 076: 6.7 GB vs 7.0 GB on Manor Lords), in-place patching (rejected, D-13, deferred). Package legitimacy: no external packages are added, so no slopcheck audit is required. If the planner wants a new crate (for example `filetime` or a temp-file helper), gate it with `cargo search` and slopcheck first.

**Versions:** the crate set is unchanged; `cargo test -p gamelib-depot` ran 260 pass / 0 fail at Phase 73 verification [CITED: 73-VERIFICATION.md].

## Architecture Patterns

### System Architecture Diagram

```
 library refresh / launch / explicit Check
          |
          v
 checkGameUpdates() ----> library.steam.listUpdateableGames()
          |                    |
          |                    +--> installed map (bridge ACFs + native ACFs)
          |                    |      native: ACF flags 0x2 / TargetBuildID != buildid   (no network)
          |                    |      bridge: ACF buildid ---+
          |                    |                             v
          |                    |        ONE batched anon getProductInfo([appIds]) with timeout
          |                    |        -> depots.branches.<BetaKey|public>.buildid
          |                    +--> UpdateState{appId, kind: bridge|registered, state: stale|current|unknown, target buildid}
          |                    v
          |         badge list (all stale)         auto-queue list (bridge only, D-02)
          |                v                                  |
          |        frontend gameUpdates (D-08)                v   if autoUpdateGames (D-01)
          |                                         addToQueue({type:'update'})
          v
 user clicks Update / "Update now" at Play (D-04)
          |
   +------+--------------------------+
   v                                 v
 bridge game                         Steam-registered game
 SteamGame.update()                  SteamGame.update()
   |  refuse if running                |  InstallApp helper (opt-in, mac)  --> poll ACF (D-11)
   |  build refs: new GIDs (TS)        |  else steam:// hand-off (D-12)
   |  old GIDs from ACF (string)       v
   |  free-space check (D-13)        Steam updates itself
   v
 runDepotJob({depots[].fromManifest = oldGid})  ---- Rust ----
   load old+new manifests (cache | CDN request code)   [old missing -> D-14 reconcile]
   work set = new files whose sha_content differs / new
   index old chunks sha -> (file, offset); read + SHA-1 candidates; miss -> CDN list
   fetch CDN chunks (Fetcher) -> decode_chunk
   build <path>.<tmp> beside old tree, sync, verify sha_content
   COMMIT: rename temps, delete removed (old-manifest-owned only), apply modes, finalize ACF
          |
          v
 TS follow-ups (GID-keyed): shim handover + gamelib_bridge.cfg, redist ledger, DRM/known-fix verdicts
          |
          v
 sendGameStatusUpdate('done'); gameUpdates entry cleared
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-depot/src/
├── delta.rs            # NEW: plan (old-chunk index), build-beside, commit, removed files
├── download.rs         # route to delta when every DepotRef.fromManifest is Some
├── manifest.rs         # prune(): add protected-GID guard; summarize(): accept fromManifest for estimates
├── job.rs / events.rs  # new phase/status names (plan, commit) kept inside the existing event shape
└── outcome.rs          # keep DeltaUnsupported for mixed/partial shapes; add delta-specific kinds only if needed
src-tauri/crates/gamelib-depot/tests/delta.rs      # NEW (fixtures via fixtures_gen.rs)
src/backend/storeManagers/steam/
├── updateDetection.ts  # NEW: ACF + PICS comparison, per-app UpdateState, bounded
├── updateBridge.ts     # NEW: bridge update orchestration (refs, free-space, job, follow-ups)
├── updateNative.ts     # NEW or in games.ts: InstallApp / hand-off
├── games.ts            # update() delegates
└── library/index.ts    # listUpdateableGames() delegates
```
File names are suggestions; follow the repo's `steam/` flat layout and the steam line ceiling (`pnpm steam-line-ceiling`) when `games.ts`/`library/index.ts` grow.

### Pattern 1: Delta job shape
**What:** In `DepotRef`, `fromManifest` already exists as an `Option<String>` (`job.rs`, `deny_unknown_fields`, snake->camelCase). Today `jobBuilder.ts` hardcodes `fromManifest: null`. For an update, `manifestId` = new GID, `fromManifest` = old GID, `key` = depot key (same for both manifests of a depot), `requestCode` for the new one. The old manifest's request code is needed only if it isn't cached; extend the `refreshRequestCode` path to also resolve the old GID's code (spike 076 got codes for all six old GIDs via `getManifestRequestCode`).
**When:** every depot in the job is `Some` (an update). A mix of `Some`/`None` (for example a depot added in the new build) should be treated as: new depot = full fetch of all its files, old-less. Decide and test explicitly; spike 076 had only single-depot apps.
**Source:** `job.rs` DepotRef, `download.rs` run_install_inner, 076 README "Requirements".

### Pattern 2: Build-beside then commit (Rust)
**What:** Per spike 076 steps 2-6 of the skill reference `rust-migration-steam.md`:
1. Work set = new-manifest regular files (skip `DIRECTORY_FLAG` 64 and `SYMLINK_FLAG` 512) whose `sha_content` differs from the old entry or that are new. Match paths with `normalize_depot_path`.
2. Index old-manifest chunks `sha -> [(old file, offset, cb_original)]`; for every work-set chunk read candidates with `read_exact_at`, SHA-1, take the first that matches; otherwise add to the CDN list.
3. Fetch the CDN list via `Fetcher::fetch_chunk`, `decode_chunk`.
4. Build each work file as `<path>.<tmp>`: `set_len`, write chunks at offsets, `sync_all`, verify `sha_content`. Failure deletes temps and leaves the old tree intact.
5. Commit: rename temps over targets; delete files the new manifest dropped (old-manifest-owned paths only); `apply_file_modes`; finalize ACF.
Route every path through `post::resolve_contained_path` (traversal is an error). Reuse `Fetcher` host failover and `StallTracker` so D-16's "no extra retry" holds.
**Source:** `.planning/spikes/076-bridge-delta-update/src/bin/apply.rs`.

### Pattern 3: Update detection state (TS)
**What:** One function produces `{appId, kind: 'bridge' | 'registered', state: 'stale' | 'current' | 'unknown', installedBuild, targetBuild, branch}`.
- Bridge: ACF `buildid` (string compare) vs `depots.branches.<branch>.buildid` from a **single batched** anonymous `getProductInfo(ids, [], true)` for all bridge-installed apps, wrapped in a timeout. Branch = ACF `BetaKey` (via `readAcfBetaKey`) else `public`. If the branch is missing from appinfo or has `pwdrequired`, state is `unknown` (D-15). Note `betaBranch.ts` currently falls back to `public` for a missing branch at install time (`chooseInstallBranch`); do not reuse that fallback for detection.
- Registered: ACF only. `StateFlags & 2`, or `TargetBuildID != buildid`, or `BytesToDownload > 0`, or `ScheduledAutoUpdate` set. Add these fields to a new reader; `readAcfState` today only returns bytes counters on the 'downloading' branch and treats any bit-4 manifest as `installed`. A registered game with an update pending has StateFlags 6 (bit 4 still set), so `readAcfState` reports 'installed' and drops the update fields. PICS cross-check is only for "Steam isn't running", per CONTEXT.
- Keep results in memory keyed by appId with the target buildid, so the pre-launch path (D-05) can return last-known state instantly.
**Source:** 069 step 4/5/results, 070 results, `acfState.ts`, `betaBranch.ts`.

### Pattern 4: `update()` through the existing queue
`updateQueueElement` already: offline gate, `sendGameStatusUpdate('updating')`, notification, `library[runner].getGame(appName).update(...)`, and `'done'` in `finally`. `SteamGame.update()` must return `{status}` meaning done/error/abort the same way the install path returns it (see `installBridgeGame` return shapes). Pause = abort the signal (73 D-07); resume re-enters `update()` and the delta must detect its own prior state (see Pitfall 5). The head-revalidation code explicitly skips `'update'` elements.

### Anti-Patterns to Avoid
- **PICS in a boot task.** Sidecar exit contract: a timer, socket or in-flight CM request left pending at stdin EOF delays exit. Detection runs on refresh/launch only, with a bounded timeout, and anything it creates is `unref()`'d. `smoke:sidecar` misses slow exit, so add a test that asserts no handle outlives the call.
- **Relying on `autoUpdate`'s return value to exclude Steam-registered apps** (it is unobservable, see Summary).
- **Reading InstalledDepots GIDs with `vdf.parse`** (19-digit loss).
- **File-level fallback as the primary path** (spike 076: no better than a full download on Unreal).
- **Branch switch to fabricate a pending-update fixture** (069: Steam downloads at once).
- **Using `timeupdated`** (missing on older apps).
- **Treating a failed PICS call as "current" or "stale".** It is `unknown`/last-known.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Chunk fetch with host failover, token refresh, stall | A new HTTP loop | `fetch.rs` `Fetcher::fetch_chunk` + `InflightLimiter` + `StallTracker` | Pinned to 32 inflight (067a: 96 gave no gain and 57 timeouts) |
| Chunk decode | A new decoder | `container::decode_chunk` | decrypt, decompress, size and SHA-1 gate; Rust codec flags matter (`aes_armv8`, `zlib-rs`) |
| File-level fallback (D-14) | New verify code | Existing `reconcile_partial_state` against the new manifest | Same sha1-gated skip logic |
| Mode flags, symlinks, Mach-O exec fallback | New chmod logic | `post::apply_file_modes`, `apply_macho_fallback` | 076 harness ignored modes; production has them |
| Path containment / traversal | String checks | `post::resolve_contained_path` | Security-relevant, already tested |
| ACF writing | A second writer | Rust `acf::finalize` | Two writers already exist and can drift (73-VERIFICATION Truth 9). Do not add a third |
| Free-space query | `df` parsing | An existing statvfs wrapper if present, else a small cross-platform call in Rust where the plan is computed | Check at plan time for the changed-file total |
| Steam-registered progress | New poller | `startInstallPolling(..., { delegatedToSteamClient: true })` | Already used by the InstallApp install path |
| steam:// URL building | String concat | `buildSteamProtocolUrl` (numeric guard, T-03-01) | Single chokepoint; extend its verb union if a new verb is needed |
| Update list persistence | New store | `gameUpdates` + localStorage `'updates'` | D-08 |

**Key insight:** the only new algorithm is the chunk index + build-beside + commit; everything it touches (network, decode, hashing, modes, ACF, cancel) has a Phase 73 owner.

## Runtime State Inventory

This phase is not a rename, but update handling touches state keyed by build/GID that must be reconciled after every bridge update.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Bridge ACF (`appmanifest_<id>.acf` in `getBridgeBottleSteamappsRoot`): `buildid`, `InstalledDepots.<depot>.manifest`, `TargetBuildID`, `SizeOnDisk`. Manifest cache `depot-manifests/<depot>/<gid>.manifest` (app data dir, `depot_dispatch.rs`). Persisted per-appId shim scan verdict (`writeBridgeScanVerdict`), per-GID redist ledger (`bridge/sharedRedistInstall.ts`), DRM/known-fix verdicts (`bridgeVerdict.ts`, `drmKnownFix.ts`, `bridgeKnownFixes.ts`). New: "don't ask again" acknowledgement keyed by target buildid (D-06). | Data migration of ACF at commit (Rust finalize). Code edits for verdict/ledger rescan. New persisted ack store (Claude's discretion where). |
| Live service config | Mac Steam never reads bridge ACFs (070), so nothing external. For registered games, Steam owns its ACF; GameLib must never rewrite it. | None for bridge. Read-only for registered. |
| OS-registered state | None. | None, verified by reading the bridge path (no `steam.exe` updater in the bottle, 070 step 5). |
| Secrets/env vars | Depot keys and CDN tokens come through the existing job path (`key` is redacted in `Debug`). No new secrets. | Ensure the old-manifest request path logs no keys/codes. |
| Build artifacts | `gamelib_bridge.cfg` (two copies in Manor Lords), `.gamelib-orig`, shimmed `steam_api*.dll`, DXVK caches, `_d3d11.log`. These are unowned by the manifest and must survive. | Shim handover rules in Pattern 2 / Pitfall 3. |

## Common Pitfalls

### Pitfall 1: 19-digit GID precision loss
**What goes wrong:** `@node-steam/vdf` parses `InstalledDepots` manifest IDs as numbers; digits are lost, the old manifest id is wrong, old-manifest fetch fails or fetches a different GID.
**Why:** JS number coercion above 2^53.
**Avoid:** Read GIDs from the raw ACF text with a string regex or a string-preserving parser; the wire shape is already `String`. `decodeUserAppConfigBetaKey`-style helpers do not help here.
**Warning signs:** a "manifest_unavailable" on a game whose CDN old manifest should exist; GID values ending in zeros.

### Pitfall 2: The ACF is not what the delta thinks the tree is
**What goes wrong:** The tree has a swapped `steam_api*.dll` (shim, all six stale games), a game-modified `stagedbuild_manorlords.ini` and `version.txt`, and unowned files. Treating any mismatch against the **old manifest** as "needs update" would clobber the shim and the user's modified files, and the diff base must be old-manifest-vs-new-manifest, not disk-vs-new-manifest.
**Avoid:** Work set is computed from manifest A vs manifest B only. Files unchanged between A and B are never touched. Files changed between A and B are rebuilt, and during their build the old on-disk bytes are only a chunk source after SHA-1 verification.
**Detail (shim):** if a shimmed DLL is in the change set, the new genuine DLL must land in `.gamelib-orig` and the shim must be re-placed (`shimPlacement`/`shimOriginals`/`originalRestore`), otherwise the game runs without the bridge and a later "restore originals" downgrades the DLL. 076 step 6.

### Pitfall 3: Peak disk is the changed-file total
Manor Lords: 916 MiB download, about 13 GB of temp files. The free-space check happens before starting, after the plan phase knows the change set but before building. A pre-click estimate (manifest diff, no hashing) is computed in TS or via `summarize` extended for `fromManifest`; label it an estimate because local hashing can only shrink or equal the CDN list, never change the changed-file total. So the disk-peak number from a manifest diff is exact (sum of sizes of work-set files), while the download number is an upper bound. Say that on the UI.

### Pitfall 4: `fromManifest` rejected in two places
`download.rs` rejects at `run_install_inner` entry and `manifest.rs::summarize` rejects too. Both must change, and `tests` that assert `delta_unsupported` (see `tests/job_*.rs`, `depotRustErrorMap.test.ts` reads `ERROR_KINDS` from `outcome.rs`) must be updated, not just deleted: keep `DeltaUnsupported` for malformed shapes (for example a mix that is not supported) so the TS error map still has a kind for it. The error-map test equates TS kinds to Rust `ERROR_KINDS`.

### Pitfall 5: Resume after an interrupted commit
**What goes wrong:** Interrupted mid-commit leaves some files new, some old, and the ACF still saying the old build. A naive resume re-runs the delta against old-manifest and finds new-file hashes in places it expects old ones.
**Recommendation (needs a test, tagged ASSUMED until proven):** before the commit begins write a marker (an ACF with StateFlags including update-required, `TargetBuildID` = new) or a sidecar-side persisted "update in progress {oldGid, newGid}" record. On resume, if the marker exists, do a file-level SHA-1 reconcile against the **new** manifest only (existing `reconcile_partial_state`), which finishes whole-old/whole-new files correctly; otherwise re-plan from scratch. Interrupted before commit: temps exist; delete stale `<path>.<tmp>` files at job start (this is Phase 73 resume territory: `library/resume.ts` runs `verify_only` for partial ACFs, so check how it treats a bit-4 ACF with TargetBuildID != buildid so it does not "repair" a half-updated tree to the old manifest).
**Warning signs:** after a killed update, the game is neither old nor new build; Verify shows widespread diffs.

### Pitfall 6: `readAcfState` hides pending updates
Bit 4 set means 'installed' even at StateFlags 6. The poller used for D-11 progress (`installPolling.ts` / `installPollOnce.ts`) decides completion from state 'installed', so an update poll would complete immediately. Add an update-aware completion test (ACF `buildid == TargetBuildID` and StateFlags without 0x2/0x100/0x400 bits) rather than reusing the install completion check as-is. [ASSUMED: exact flag bits Steam sets during update; 069 observed StateFlags 6 pending and 4 after, and "Update Required,Fully Installed,Update Queued,Update Running,Update Started" in the content log.] Verify the 0x100/0x400 bits against the live fixture.

### Pitfall 7: Auto-queue leakage (D-02)
`listUpdateableGames()` feeds both the badge and `autoUpdate`. If it returns Steam-registered apps, `autoUpdate` (with `autoUpdateGames` on) will queue an `'update'` element and call `SteamGame.update()` which would then call `InstallApp`: exactly what D-02 forbids. Structural fix: give the `LibraryManager` contract a second method (for example `listAutoUpdateableGames`) or a per-app predicate that `autoUpdate` consults, and test that a registered stale app is in the badge list and not in the queue with `autoUpdateGames: true`. Also `autoUpdate` checks `ignoreGameUpdates` and `isGameAvailable()`; for bridge games, `isGameAvailable` semantics should be checked (it may depend on the install path in the bridge bottle).

### Pitfall 8: Multi-depot, removed files, and modes untested
076 covered only single-depot apps with no removals. Fixtures must cover: a file removed in the new manifest (delete only if owned by the old manifest and unchanged on disk? decide: delete old-manifest-owned paths; keep a user-modified file? CONTEXT says delete files that are gone, keep files the old manifest did not own); a depot added or dropped between builds; shared paths across depots (`detect_path_collisions` ordering); an executable-flag change on an unchanged file (flags can change without `sha_content` changing: treat a flag-only change as a mode apply, not a rebuild); a symlink changed or added; case-insensitive filesystem collisions on macOS.

### Pitfall 9: Running-game refusal
Refuse in `update()` itself as well as in the UI. Use the existing running-state source (`runningPoll.ts` / game session state) and the bridge helper's process monitor, not just a UI flag. Spike 076 did not test updating while running.

### Pitfall 10: PICS availability and token-gated apps
Anonymous `getProductInfo` may return no usable `depots.branches` for apps that need a token. Treat as `unknown` (do not badge). Batch all appIds in one call and bound it; the anonymous client already connects with a 15 s timeout and 60 s idle close (`anonymousClient.ts` `ANON_*`), so ensure the idle-close timer is `unref()`'d (verify rather than assume).

## Code Examples

### Where the stubs are
```ts
// src/backend/storeManagers/steam/library/index.ts:296
async listUpdateableGames(): Promise<string[]> { return [] }
// src/backend/storeManagers/steam/games.ts:~447
async update(): Promise<InstallResult> { ... return { status: 'error', error: 'Steam library not implemented until Phase 2' } }
```

### The reserved wire field (Rust)
```rust
// src-tauri/crates/gamelib-depot/src/job.rs
pub struct DepotRef {
    pub depot_id: String, pub manifest_id: String, pub request_code: Option<String>,
    pub key: String, pub owner_app_id: String,
    #[serde(default)] pub from_manifest: Option<String>,   // Some => delta
}
```
`jobBuilder.ts` (`toRustDepotRefs`) sets `fromManifest: null` for every depot today; extend `buildDepotRefs`/`toRustDepotRefs` with an optional old-GID map.

### Hand-off and InstallApp call site (reuse)
```ts
// gameInstall.ts:418-470 (install path; update reuses the same helper call and fallback)
if (isSteamExperimentalInstallAppEnabled(steamGame.deps.config)) {
  const outcome = await requestSteamInstallApp(appId, { libraryPath }, { paths, run: createSteamInstallAppRun({ runner }) })
  // 'ok' -> startInstallPolling(deps, appId, { delegatedToSteamClient: true }); 'error' -> surface EAppUpdateError;
  // 'unavailable' -> fall back
}
```
For the fall back on update, `buildSteamProtocolUrl` only knows `'rungameid' | 'launch' | 'install' | 'uninstall'`. `steam://install/<appId>` on an installed app opens Steam's install/update dialog and is already guarded; it is the zero-new-code hand-off. The alternative, `steam://nav/games/details/<appId>`, opens the library page but needs a new verb in the union (still numeric-guarded). Neither has been verified for updates in a spike. [ASSUMED: URI behaviour; test live on Windows/Linux/macOS before locking.]

### Pre-launch prompt placement
`launchBridgeGame(steamGame)` in `gameBridgeLaunchGate.ts` wraps `runBridgeLaunch`; the in-flight dedupe `bridgeLaunchesInFlight` means the prompt must not hold the map entry across a dialog wait without joining semantics (a second click would join a promise waiting on a dialog). Put the D-04 prompt before `launchBridgeGame` is called from the launch dispatcher (`launchDispatch.ts`), or cleanly release the dedupe entry when the prompt resolves "Update now".

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| TS depot pipeline | Rust `gamelib-depot` (TS pipeline deleted) | Phase 73 (2026-11-09/10) | Delta lands in Rust; no TS fallback to maintain |
| `update()` stub | Queue-driven delta (bridge) / InstallApp (registered) | This phase | `'update'` queue element is the integration point |
| Stale bridge games invisible | ACF buildid vs PICS | Spike 070 | 6 live fixtures |

**Deprecated/outdated:** `ManifestStore::prune` as an eviction mechanism: it exists and is tested but is never called in production.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `steam://install/<appId>` is an acceptable update hand-off for an installed app (versus `steam://nav/games/details`) | Code Examples | A hand-off that opens nothing useful on Windows/Linux; confirm live (D-12 leaves the URI to the planner) |
| A2 | Steam sets 0x100/0x400 style bits during an update (so a poller can tell progress from completion) | Pitfall 6 | Wrong completion test; 069 only recorded StateFlags 6 pending and 4 done. Verify with the ADOM-style fixture |
| A3 | A pre-commit marker (ACF with update-required + `TargetBuildID`, or a persisted record) is the cleanest resume discriminator | Pitfall 5 | Could conflict with 73's resume (`resume.ts` verify_only behaviour on partially-updated ACFs); needs a decision and a test |
| A4 | Manifest-diff estimate gives an exact disk-peak and an upper-bound download | Pitfall 3 | Wrong only if the work set is computed differently at plan time; unit-test the two against one fixture |
| A5 | Anonymous PICS returns `depots.branches.<branch>.buildid` for the 28 bridge apps without tokens | Pattern 3 | Spike 070 did this for all 28 (cited), but a future token-gated app would be `unknown`; handled by D-15 behaviour |
| A6 | Pre-launch check timeout of roughly 3 s is acceptable | D-05 | Discretionary; UX choice |

## Open Questions

1. **Resume discriminator for an interrupted commit (Pitfall 5).**
   - Known: each file is whole-old or whole-new; a SHA-1 reconcile against the new manifest finishes it; `library/resume.ts` runs verify_only for partial ACFs.
   - Unclear: how `resume.ts` treats a bit-4 ACF with a stale buildid, and where the in-progress marker lives.
   - Recommendation: read `library/resume.ts` and `resumeBreadcrumbs.ts` in the first plan, decide marker, write the kill-mid-commit test before the implementation.
2. **Pre-click size estimate transport.** Extend Rust `summarize` to accept `fromManifest` (returns changed-file bytes and a CDN-byte upper bound), or compute the diff in TS? Recommendation: extend `summarize` (it already loads manifests without shipping them across the pipe, 45 s bound) and return `changedBytes`/`maybeDownloadBytes`.
3. **Where D-06 ack is stored.** Recommendation: per-game settings (`getSettings`/`titleSettings.ts`) keyed by `{appId, targetBuildId}`, not a new store.
4. **Flag-only changes** (executable bit changes with the same content hash) need a defined behaviour (mode apply only).
5. **Does the Rust shell expose free disk space already?** If not, add it inside the delta plan step; check `post.rs`/`acf.rs` for an existing helper before writing one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (`cargo`) | `gamelib-depot` tests | ✓ expected (Phase 73 ran 260 tests) | not probed in this session | none, blocks execution |
| Node + pnpm + Jest | TS tests | ✓ expected | not probed | none |
| Mac Steam client, signed in | live gate (registered fixture, InstallApp) | operator machine | n/a | live gate only |
| Six stale bridge installs (Manor Lords 1363080, Core Keeper 1621690, Abiotic Factor 427410, Planet Crafter 1284190, Hell Clock 1782460, Mining Mechs 1603180) | live gate | ✓ per spikes 070/076 on the operator machine (state can change if the operator reinstalls) | n/a | re-create stale fixtures from an old manifest if needed |
| Free disk >= 13 GB | Manor Lords live update | operator check | n/a | use Mining Mechs (5.7 MiB) for the quick path |

I did not run probe commands for cargo/node; treat them as expected, not verified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `cargo test` (`gamelib-depot`, `gamelib-depot-cli`) and Jest 29 + ts-jest (`jest.config.js`, project list) |
| Config file | `src-tauri/Cargo.toml` (workspace), `jest.config.js` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-depot delta` ; `pnpm exec jest src/backend/storeManagers/steam/__tests__/<touched>` |
| Full suite command | `pnpm test:ci && cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli && cargo test --bin gamelib-shell` |
| Also | `pnpm check:ipc-contract` (any new IPC channel), `pnpm find-deadcode`, `pnpm steam-line-ceiling`, `pnpm smoke:sidecar`, `pnpm planning-gates`, clippy ratchet (`meta/clippyRatchet.cjs`) |

Source for the command set: `73-VALIDATION.md` (same infra). Rust integration tests live in `src-tauri/crates/gamelib-depot/tests/` (`job_install.rs`, `job_modes.rs`, `manifest.rs`, `post.rs`, `golden.rs`, `acf.rs`, `fetch.rs`, `container.rs`) with `fixtures_gen.rs`; add `delta.rs` there.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEAM-01a | Bridge stale iff ACF buildid != PICS branch buildid; BetaKey branch used; unresolved branch -> unknown; PICS timeout -> last-known/unknown, never stale | Jest unit | `pnpm exec jest src/backend/storeManagers/steam/__tests__/updateDetection.test.ts` | ❌ Wave 0 |
| STEAM-01a | Detection leaves no live handle at exit (exit contract) | Jest + `smoke:sidecar` | `pnpm exec jest ...updateDetection.exit.test.ts`; `pnpm smoke:sidecar` | ❌ Wave 0 |
| STEAM-01b | ACF fields -> registered stale (StateFlags 6, TargetBuildID != buildid, BytesToDownload, ScheduledAutoUpdate); up-to-date ACF -> current | Jest unit with real ACF fixtures (`069 acf-pending.acf`) | `pnpm exec jest ...updateDetection.acf.test.ts` | ❌ Wave 0 |
| STEAM-01c | `listUpdateableGames` result reaches `gameUpdates`; updates filter shows it; card/game page render sizes (D-09) | Jest (backend) + frontend tests | `pnpm exec jest src/backend/utils src/frontend/state/__tests__/libraryState.test.ts src/frontend/screens/Library` | partial (libraryState/filterEngine tests exist) |
| STEAM-01c | Pre-launch check: timeout falls back to last-known and launches; "don't ask again" keyed by build id | Jest | `pnpm exec jest ...gameBridgeLaunch*.test.ts` | ❌ Wave 0 |
| STEAM-01d | `autoUpdateGames: true` queues stale bridge game, never a stale registered game, both stay in badge list | Jest | `pnpm exec jest src/backend/utils/__tests__/checkGameUpdates.test.ts` | partial |
| STEAM-02a | Delta result equals new manifest byte-for-byte; reused chunks SHA-verified; corrupt local chunk -> CDN; removed files deleted only if owned; unowned files kept; modes applied | cargo integration | `cd src-tauri && cargo test -p gamelib-depot --test delta` | ❌ Wave 0 |
| STEAM-02a | Interrupted before commit: old tree intact, temps cleaned; interrupted mid-commit: reconcile finishes | cargo integration | `cargo test -p gamelib-depot --test delta resume` | ❌ Wave 0 |
| STEAM-02a | Peak-disk check refuses before any write (D-13) | cargo + Jest | `cargo test -p gamelib-depot --test delta disk` | ❌ Wave 0 |
| STEAM-02a | Multi-depot, depot added/dropped, flag-only change, symlink, case-collision | cargo integration | `cargo test -p gamelib-depot --test delta multi_depot` | ❌ Wave 0 |
| STEAM-02a | `ManifestStore::prune` never removes a protected GID | cargo | `cargo test -p gamelib-depot --test manifest prune` | partial (test exists, extend) |
| STEAM-02a | `fromManifest` no longer yields `delta_unsupported`; schema still `deny_unknown_fields`; error-kind parity | cargo + Jest | `cargo test -p gamelib-depot job_schema`; `pnpm exec jest src/backend/storeManagers/steam/depotRust/__tests__` | exists, must be updated |
| STEAM-02b | `update()` refuses while running; queues as 'update'; pause/resume/cancel; D-14 fallback when old manifest unavailable; error leaves old build launchable | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/updateBridge.test.ts` | ❌ Wave 0 |
| STEAM-02c | After update: shim handover when DLL in change set (and untouched when not), `gamelib_bridge.cfg` rewritten, redist ledger and DRM/known-fix verdicts re-keyed, ACF new buildid + GIDs (GID read as string) | Jest | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__` | partial (bridge tests exist; add update cases) |
| STEAM-02d | Registered Update: InstallApp ok -> polling `delegatedToSteamClient`; 'unavailable' -> hand-off; opt-in off / non-mac -> hand-off; refuse while running | Jest | `pnpm exec jest ...updateNative.test.ts` | ❌ Wave 0 |
| STEAM-01/02 live | Live gate: a bridge game with a pending update shows "Update available", updates, keeps saves/user files, launches through the bridge; a Mac-native game shows the state and Update gets Steam to update it | manual UAT (Manor Lords, Mining Mechs; registered fixture per 069 step 4) | `74-UAT.md` | ❌ create with UAT shape rule |

### Sampling Rate
- **Per task commit:** the quick command for the touched layer, plus `npx prettier --check` over the exact written paths (check `--file-info` first, per `gamelib-conventions`).
- **Per wave merge:** full suite + clippy ratchet + `pnpm check:ipc-contract` + `pnpm find-deadcode` + `pnpm steam-line-ceiling`.
- **Phase gate:** full suite green and live gate done before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-depot/tests/delta.rs` plus fixture builders (old/new manifest pair, multi-depot, removed file, flag-only change, symlink, corrupt-local-chunk) via `fixtures_gen.rs`.
- [ ] `updateDetection.test.ts` (+ acf and exit-contract variants) and ACF fixtures copied from the 069 spike.
- [ ] `updateBridge.test.ts`, `updateNative.test.ts`, launch-gate prompt tests.
- [ ] Fake-HOME isolation: any new test that spawns a process in `src/` or `meta/` must use `createFakeHomeProfile()` (never a hand-rolled `env` literal); `fakeHomeIsolation.test.ts` enforces it for in-repo spawn sites.
- [ ] `74-UAT.md` items: `### N.` heading at column 0, `expected:` inline, `result:` beginning with a bare or bracketed status word.
- [ ] Framework install: none (infra exists).

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so it applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (reuses existing lease/logon path; no new auth) | existing `acquireAuthenticated`, macOS go-offline wrap |
| V3 Session Management | no | |
| V4 Access Control | yes (low) | refuse to write outside the install root; only ever touch manifest-owned paths |
| V5 Input Validation | yes | numeric appId/depot/GID guards (`is_numeric_id`, `NUMERIC_APP_ID`, `buildSteamProtocolUrl`); `assertNumericBuildid` for ACF; `resolve_contained_path` for every manifest path |
| V6 Cryptography | yes | existing `container.rs` AES/SHA-1; never hand-roll; depot key never logged (redacted `Debug`) |
| V12 Files | yes | temp files beside targets with restrictive handling; no following of symlinks out of the root (`check_symlink_target`) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via malicious manifest filename in the delta work set or removed-file delete | Tampering | `resolve_contained_path` on every read, write, rename and delete; a traversal is an error |
| Symlink in the old tree redirecting a delta read/delete | Tampering | `check_symlink_target`; never follow links when reading candidate chunks or deleting |
| Deleting user data by treating unowned files as removed | Tampering/DoS | delete only old-manifest-owned paths absent from the new manifest |
| steam:// URL injection via appId | Spoofing | `buildSteamProtocolUrl` numeric guard |
| Secret leakage (depot key, request code, CDN token) in new logs/events | Info disclosure | reuse redacted `Debug`; no new log of `DepotRef` fields beyond existing |
| Tampered chunk from CDN or corrupted local chunk | Tampering | `decode_chunk` SHA-1 gate; local-candidate SHA-1 check; `sha_content` check before rename |
| TOCTOU between plan hashing and build reading old files | Tampering | refuse while running; re-verify chunk SHA when actually read for the build, not only at plan time |

## Project Constraints (from CLAUDE.md)
- Stack is React + TypeScript on a Rust/Tauri shell. GameLib is independent of upstream Heroic; do not raise deviation from Heroic as a concern.
- Steam stack is frozen (`STEAM-STACK.md`): steam-session / steam-user (anonymous by default, authenticated on demand, wrapped on macOS), `@node-steam/vdf`, axios, `steam://rungameid` launch. Do not re-propose rejected alternatives.
- Conventions (load `Skill("gamelib-conventions")`):
  - Todo files in `.planning/todos/pending/` need `severity:`, `platform:`, `ready:` frontmatter, exact and in order (CI: `pnpm planning-gates`).
  - Spawned child processes in `src/` or `meta/` tests use `createFakeHomeProfile()`; never a hand-rolled `env` literal.
  - Sidecar timers, watchers, sockets and child handles: `unref()` them and leave no unbounded in-flight work at boot. Exit is by event-loop drain at stdin EOF.
  - `*-UAT.md` items: `### N.` heading at column 0, `expected:` inline, `result:` opening with a status word.
  - Every `<verify>` block runs `npx prettier --check` over the exact paths written (never `.`); if all are prettier-ignored, say so and omit.
- Use `/gsd-` hyphen command names; dev launch is `pnpm tauri:dev` (never `tauri:dev:run`); restart dev before live-testing backend changes (sidecar is not rebuilt by `tauri dev`; Steam-shortcut tests only need `pnpm build:sidecar`); a fresh worktree needs `build:sidecar-sea` + vite build first.
- Bottled Steam is a narrow fallback for DRM only; do not route a stale bridge game to bottled Steam.
- Bridge "verified" is strict (HELLO + clean game Steam-init log); the live gate's "still launches through the bridge" must meet it.
- Use `graphify query` for codebase orientation; never read `GRAPH_REPORT.md` or `graph.json` whole. Run `graphify update .` after code changes.
- `gsd-sdk commit` sweeps all dirty `.planning` files; commit by `git add <file>` plus `git commit` when the tree has unrelated planning changes (it does).

## Sources

### Primary (HIGH confidence)
- `.planning/phases/74-steam-game-updates/74-CONTEXT.md` (locked decisions)
- `.planning/spikes/076-bridge-delta-update/README.md` (algorithm, measurements, what is untested)
- `.planning/spikes/069-steamclient-update-installed/README.md` (InstallApp on an installed app, ACF pending fields, fixture recipe)
- `.planning/spikes/070-bridge-games-stay-stale/README.md` (detection, GID-as-string, fixtures)
- `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md` (delta section, constraints)
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-VERIFICATION.md`, `73-VALIDATION.md`
- Code read this session: `src-tauri/crates/gamelib-depot/src/{job,manifest,download,outcome,acf,reconcile}.rs`; `src/backend/utils/checkGameUpdates.ts`; `src/backend/storeManagers/index.ts` (`autoUpdate`); `src/backend/downloadmanager/utils.ts` (`updateQueueElement`); `src/backend/storeManagers/steam/{games,gameInstall,gameInstallBridge,gameBridgeLaunchGate,steamInstallApp,experimentalInstallAppSetting,gameProtocolUrl}.ts`; `steam/library/{acfState,installedMap,index}.ts`; `steam/depotRust/{install,jobBuilder}.ts`; `steam/depot/betaBranch.ts`

### Secondary (MEDIUM)
- Phase 73 summaries and parity notes (not individually re-read; referenced via the verification report)

### Tertiary (LOW)
- None. No web sources were used; this phase is internal-codebase and spike driven.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new dependencies; all pieces in-repo)
- Architecture: HIGH for delta and detection, MEDIUM for frontend and prompt placement (frontend files not read in depth)
- Pitfalls: MEDIUM-HIGH (1-4, 7 verified in code or spikes; 5, 6, 8 are reasoned and need tests)

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 (stable internal code; re-check if Phase 75 or the CM-client slice lands first, since both touch the Steam session and appinfo paths)
