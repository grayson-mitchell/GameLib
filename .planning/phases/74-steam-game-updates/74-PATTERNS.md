# Phase 74: Steam game updates - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 22 new/modified (grouped where a family shares one analog)
**Analogs found:** 20 / 22 (2 partial, listed at the end)

Phase 73 built the Rust pipeline this phase extends. Most "new" code here is a variant of an existing Phase 73 file or of the existing `'update'` queue plumbing. Line numbers are from this session's reads.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-depot/src/delta.rs` (NEW) | service | file-I/O + streaming | `.planning/spikes/076-bridge-delta-update/src/bin/apply.rs` + `download.rs` | exact (spike harness to productionise) |
| `.../src/download.rs` (route to delta; remove reject at :822) | service | file-I/O | itself, `run_install_inner` :822-830 | exact |
| `.../src/manifest.rs` (`summarize` reject :98; `prune` :459 protected GID) | service | transform | itself | exact |
| `.../src/job.rs`, `events.rs`, `outcome.rs` (phase names, keep `DeltaUnsupported`) | model | event-driven | itself | exact |
| `.../tests/delta.rs` (NEW) | test | file-I/O | `tests/job_install.rs` (`Env`, `setup`, `job`) + `tests/support/fixture_builder.rs` | exact |
| `.../tests/manifest.rs` (extend prune test ~:280) | test | file-I/O | itself | exact |
| `src/backend/storeManagers/steam/updateDetection.ts` (NEW) | service | request-response | `library/acfState.ts` (ACF read) + `depot/betaBranch.ts` (`readAcfBetaKey`) + `anonymousClient.ts` | role-match |
| `.../steam/updateBridge.ts` (NEW) | service | file-I/O + request-response | `depotRust/install.ts` `downloadSteamDepotsRust` + `gameInstallBridge.ts` `installBridgeGame` | role-match |
| `.../steam/updateNative.ts` (NEW) | service | request-response | `gameInstall.ts` :418-470 (InstallApp + `steam://` fallback + polling) | exact |
| `.../steam/depotRust/jobBuilder.ts` (`toRustDepotRefs` old-GID map) | utility | transform | itself :52-62 | exact |
| `.../steam/depotRust/install.ts` (`requestCodeRefresher` for old GID) | service | request-response | itself :90-125 | exact |
| `.../steam/games.ts` (`update()` :447) and `library/index.ts` (`listUpdateableGames` :296) | service | request-response | the stubs, delegating like `install()`/`uninstall()` do | exact |
| `.../steam/gameProtocolUrl.ts` (optional new verb) | utility | transform | itself :16-35 | exact |
| `src/backend/storeManagers/index.ts` (`autoUpdate` :277) + `utils/checkGameUpdates.ts` (D-02 split) | service | batch | itself | exact |
| `.../steam/launchDispatch.ts` / `gameBridgeLaunchGate.ts` (D-04 prompt, D-05 timeout) | controller | request-response | `launchDispatch.ts` `dispatchSteamLaunch` + `utils.ts` :962 `showMessageBox` confirm | role-match |
| D-06 "don't ask again" ack store | store | CRUD | `steam/titleSettings.ts` (`readStoredTitleConfig`) | role-match |
| Bridge follow-ups after update (shim, cfg, redist, verdict) | service | file-I/O | `gameInstallBridge.ts` :19-34 imports + `bridge/shimGenerate.ts` `placeShimForGame`, `bridge/bridgeConfig.ts` `writeBridgeConfig` | exact |
| `library/installPolling.ts` / `acfState.ts` (update-aware completion, D-11) | service | polling | itself | role-match |
| Frontend: `GameCard/index.tsx` badge + Update menu item | component | request-response | itself :417, :543, :581 | exact (already wired for `hasUpdate`) |
| Frontend: `GamePage/index.tsx` + `components/MainButton.tsx` + `DownloadSizeInfo.tsx` (both sizes, D-09) | component | request-response | `GamePage/index.tsx` :364-392, `components/DownloadSizeInfo.tsx` | role-match |
| Frontend: `libraryState.ts` `gameUpdates`, `filterEngine.ts` :361 | store | CRUD | itself | exact (no change expected) |
| `__tests__` for the TS files above | test | n/a | `steam/__tests__/*`, `depotRust/__tests__/*`, `bridge/__tests__/*` | role-match |

## Pattern Assignments

### `src-tauri/crates/gamelib-depot/src/delta.rs` (service, file-I/O + streaming)

**Analog:** `.planning/spikes/076-bridge-delta-update/src/bin/apply.rs` for the algorithm, `src/download.rs` for the runtime plumbing (Fetcher, limiter, stall, cancel, emitter, finalize).

**Imports pattern** (`download.rs` :15-45), reuse these, not the spike's raw `std::fs`/`sha1` shortcuts:
```rust
use crate::acf::{self, AcfWritten, AttemptedDepot, RunOutcome, RunResult};
use crate::container::{decode_chunk, ContainerKind};
use crate::events::{ProgressEmitter, Snapshot};
use crate::fetch::{FetchError, Fetcher, ERESULT_BLOCKED};
use crate::inflight::{InflightLimiter, TARGET_INFLIGHT_CHUNKS};
use crate::job::{DepotJob, DepotRef, JobMode, PlannedDepot};
use crate::manifest::{normalize_depot_path, ManifestStore};
use crate::model::{ChunkRef, DepotManifest, ManifestFile};
use crate::post::{apply_file_modes, apply_macho_fallback, check_symlink_target,
    resolve_contained_path, CUSTOM_EXECUTABLE_FLAG, DIRECTORY_FLAG, EXECUTABLE_FLAG, SYMLINK_FLAG};
use crate::reconcile::{reconcile_partial_state, sha1_file};
use crate::stall::StallTracker;
```

**Job setup pattern** (`download.rs` :826-880): `outcome_shell`, `plain_failure`, `pick(limits...)`, `StallTracker`, `InflightLimiter::new`, `Fetcher::new(host, &job.job_id, &job.app_id, job.hosts.clone(), limiter, stall)`, `ManifestStore::new(jctx.cache_dir.clone(), fetcher.clone())`, then `stream::iter(job.depots.iter()).map(|d| store.load(d, &cancel)).buffered(4)`. For a delta, load the new manifest via `d` and the old via a `DepotRef` clone with `manifest_id = from_manifest` (cache hit or CDN request code). Old unavailable falls to D-14: `reconcile_partial_state` against the new manifest.

**Entry gate to change** (`download.rs` :821-830). Replace the blanket reject with routing; keep `DeltaUnsupported` for a malformed or unsupported shape (for example a mixed `Some`/`None` set not yet decided):
```rust
// D-05: the delta shape is accepted on the wire and refused here, before any network use.
if job.depots.iter().any(|d| d.from_manifest.is_some()) {
    let mut o = outcome_shell(&job.job_id, Status::Error, started);
    o.failures.push(plain_failure(
        ErrorKind::DeltaUnsupported,
        "fromManifest delta installs are not supported",
    ));
    return o;
}
```

**Core algorithm** (spike `apply.rs` :27-60, :95-140). Work set, old-chunk index, SHA-checked local read, build-beside, commit:
```rust
fn work_set(c: &Ctx) -> Vec<&ManifestFile> {
    let om: HashMap<String, &ManifestFile> = c.old.files.iter().filter(|f| is_file(f))
        .map(|f| (normalize_depot_path(&f.filename), f)).collect();
    c.new.files.iter().filter(|f| is_file(f)).filter(|f| match om.get(&normalize_depot_path(&f.filename)) {
        Some(o) => o.sha_content != f.sha_content, None => true }).collect()
}
fn read_verified(cands: &[(PathBuf, u64, u32)], sha: &[u8; 20], fh: &mut HashMap<PathBuf, Option<File>>) -> Option<Vec<u8>> {
    for (p, off, len) in cands {
        // read_exact_at(&mut buf, *off); if Sha1::digest(&buf).as_slice() == sha { return Some(buf); }
    }
    None
}
// build: <path>.<tmp>, set_len(f.size), write chunks at ch.offset, sync_all, sha1_file(tmp) == f.sha_content
// on any error: remove all temps, return, old tree untouched
// commit: rename temps; delete old-manifest-owned paths absent from the new manifest; then verify
```

**Deltas from the spike the planner must add** (spike was `std::process::exit`, unix-only, single depot, no modes):
- Route every read, write, rename and delete through `resolve_contained_path` (`post.rs` :114) and `check_symlink_target` (`post.rs` :131). Spike used `root.join(filename.replace('\\','/'))`, which is a traversal hole.
- Replace `std::os::unix::fs::FileExt::read_exact_at` with a cfg-gated or portable positional read (Windows needs `seek_read`), and do blocking hashing/IO in `spawn_blocking` behind the existing decode semaphore (see `download.rs` module doc :7-9).
- CDN chunks come from `Fetcher::fetch_chunk` then `decode_chunk(&raw, &key, cb_original, &sha)`, not `chunkDir` files.
- After commit call `apply_file_modes` / `apply_macho_fallback` (`post.rs` :185, :388). Flag-only changes on an unchanged file are a mode apply, not a rebuild (RESEARCH Pitfall 8).
- Every exit goes through the single `finalize` call (Phase 73 D-11), including cancel and failure. Check `cancel` before every file and chunk as `run_install_inner` does.
- Free-space check after the plan phase, before any temp is built: sum of `f.size` over the work set (D-09, D-13). No statvfs helper exists in `gamelib-depot` (grep found none), so this is a new small helper; check `src-tauri/src` before adding a dependency, and gate any new crate with `cargo search` plus slopcheck.

**Error handling:** `Failure`/`plain_failure(ErrorKind::..., msg)` and `Outcome`; do not invent a parallel error type. `ERROR_KINDS` in `outcome.rs` (:58) is mirrored by TS `depotRustErrorMap.test.ts`, so any new kind needs both sides.

---

### `.../src/manifest.rs` (service, transform)

**Analog:** itself.

**`summarize` rejection** (:98-103) must accept `fromManifest` and return changed-file bytes (exact disk peak) plus a CDN-byte upper bound (RESEARCH open question 2, recommendation: extend `summarize`, 45 s timeout at :137-140 stays).

**`prune` protected-GID guard** (:456-487). `prune` has no production caller (only `tests/manifest.rs`), so add the guard rather than an eviction scheme:
```rust
/// Keeps `keep_gid` plus the newest other GID (by mtime); removes the rest.
pub fn prune(&self, depot_id: &str, keep_gid: &str) {
    if !is_numeric_id(depot_id) || !is_numeric_id(keep_gid) { return; }
    ...
    for (_, p) in others.into_iter().skip(KEEP_GIDS - 1) { let _ = std::fs::remove_file(p); }
}
```
Extend with a `protected: &[&str]` argument whose stems are `continue`d before the sort, and extend the test at `tests/manifest.rs` ~:280-300 (it builds `1..4.manifest` with staggered mtimes via `set_modified` and asserts `["1.manifest","4.manifest"]`).

---

### `src-tauri/crates/gamelib-depot/tests/delta.rs` (test, file-I/O)

**Analog:** `tests/job_install.rs`.

Copy the `#[path = "support/..."]` module block (:4-14), the `Env` struct and `setup(case)` that scripts the `FakeCdn` for `/depot/{d}/chunk/{sha}` and `/depot/{d}/manifest/{g}/5/123` (:60-130), and `Env::job(job_id, from_manifest)` which already takes a `from_manifest: Value` parameter. Fixture pairs (old/new manifest, multi-depot, removed file, flag-only change, symlink, corrupt-local-chunk, case collision) are new builders on `FixtureFile::new(...).flags(...)` / `::symlink` / `::directory` in `tests/support/fixture_builder.rs` (:43-77). Pass `from_manifest` as the old GID string, and assert on `chunk_targets` to prove reused chunks were not fetched.

Fake-HOME rule applies only to child-process spawns in `src/`/`meta/`; Rust tests use `tempfile::tempdir()` as `Env` does.

---

### `src/backend/storeManagers/steam/updateDetection.ts` (service, request-response)

**Analogs:** `library/acfState.ts` (ACF read), `depot/betaBranch.ts` (branch), `anonymousClient.ts` (PICS).

**ACF read pattern** (`acfState.ts` :1-90). Imports and per-root scan; corrupt manifests are skipped without throwing:
```ts
import { parse } from '@node-steam/vdf'
import { type AcfSource, getBottleSteamappsRoot, getBridgeBottleSteamappsRoot } from './installRoot'
const steamappsDirs = source === 'bridge'
  ? [getBridgeBottleSteamappsRoot(deps, appId)]
  : (await getSteamLibraries(deps)).map((libPath) => join(libPath, 'steamapps'))
const parsed = parse(readFileSync(manifestFile, 'utf-8')); const state = parsed?.AppState
const stateFlags = parseInt(state.StateFlags, 10)
```
`readAcfState` returns `'installed'` for any bit-4 ACF and only fills byte counters on the `'downloading'` branch, so a StateFlags 6 pending update is invisible. Write a separate reader for `StateFlags & 0x2`, `TargetBuildID`, `BytesToDownload`, `ScheduledAutoUpdate`, `BetaKey` instead of widening `readAcfState`'s return (its callers depend on the current shape).

**GID-as-string:** `parse()` coerces `InstalledDepots.<depot>.manifest` to a number and loses 19-digit GIDs (spike 070). Do not use `parse` for GIDs; regex the raw ACF text. There is no existing helper; this is a no-analog item (see bottom).

**Branch pattern** (`betaBranch.ts` :109-125): reuse `readAcfBetaKey(steamappsDir, appId)`. Do not reuse `chooseInstallBranch` (:204) for detection, since it falls back to `public` for a missing branch where detection must return `unknown` (D-15).

**Exit contract:** detection runs on refresh and launch only, one batched anonymous `getProductInfo` bounded with `withTimeout.ts`, nothing left pending at stdin EOF. Verify `anonymousClient.ts` idle-close timer is `unref()`'d.

---

### `.../steam/updateBridge.ts` (service)

**Analog:** `depotRust/install.ts` `downloadSteamDepotsRust` (:128-250); queue return shape from `gameInstallBridge.ts` `installBridgeGame`.

**Lease, refs, hosts, token cache, job, bridge, run** (`install.ts` :128-215). Copy this sequence; the update variant differs only in `fromManifest` and the follow-ups:
```ts
lease = await opts.steamUser.acquireAuthenticated({ reason: opts.sessionReason ?? 'user-install', guidedAction: 'install', appName: appId })
if (!lease.ok) { throw new Error(`... no authenticated Steam CM connection ... (${lease.reason})`) }
const refs = await buildDepotRefs(appId, opts)
const client = getDepotClient(opts.steamUser)
const hosts = await getContentServerHosts(client, Number(appId))
const tokenCache = new CdnAuthTokenCache(client, Number(appId), opts.installRuntime.cdnSchema)
const job = buildDepotJob({ appId, mode: 'install', installRoot: resolve(opts.targetSteamappsDir, 'common', opts.installdir), refs: refs.depots, hosts, finalize })
const bridge = createProgressBridge(opts.installRuntime.depotJobs.transport, appId)
const outcome = await runDepotJob(job, { registry, signal: opts.signal, tokenCache,
  refreshRequestCode: requestCodeRefresher(client, new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])), appId, refs.branch),
  onEvent: (ev) => bridge.onEvent(ev) })
...
} finally { if (lease?.ok) lease.release() }
```
`catch`: `if (opts.signal?.aborted) return { status: 'cancelled' }` then `classifyDepotError(err)`.

**Branch for detection and update** comes from `refs.branch` / ACF `BetaKey`, finalize passes `betaKey: refs.branch === 'public' ? undefined : refs.branch`.

**Refuse while running:** use the session state in `gameSessionState.ts` / `bottleProcessMonitor.ts`, not a UI flag (RESEARCH Pitfall 9).

**Follow-ups after a committed update** (GID-keyed). Import block pattern from `gameInstallBridge.ts` :15-34:
```ts
import { placeShimForGame } from './bridge/shimGenerate'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import { writeBridgeScanVerdict, setBridgeSteamApiPrescreen, setBridgeUserRoute } from './bridge/bridgeVerdict'
import { persistBridgeDrmSignal, reconcileBridgePrescreen, resolveBridgeGameInstallRoot, markBridgeGameInstalled } from './bridgeInstallState'
```
Shim re-placement signature (`shimGenerate.ts` :151): `placeShimForGame(rust, paths, appId, gameExePath, opts?)`, byte-identity no-op when unchanged. `.gamelib-orig` handling lives in `bridge/shimOriginals.ts` (`ORIGINAL_BACKUP_SUFFIX` :104, `backupOriginalBeforeOverwrite` :197, `restoreOriginalIfBackedUp` :293); config rewrite is `bridge/bridgeConfig.ts` `writeBridgeConfig` (:137, file `gamelib_bridge.cfg`). Redist ledger: `bridge/sharedRedistInstall.ts` `createSharedRedistInstaller` (:482).

---

### `.../steam/updateNative.ts` (service, request-response)

**Analog:** `gameInstall.ts` :418-470 (exact; reuse the call and its three outcomes).

```ts
if (isSteamExperimentalInstallAppEnabled(steamGame.deps.config)) {
  const libraryPath = await resolveSteamLibraryRoot(steamGame.deps, args?.path).catch(() => undefined)
  const outcome = await requestSteamInstallApp(steamGame.appId, { libraryPath },
    { paths: steamGame.deps.paths, run: createSteamInstallAppRun({ runner: steamGame.deps.runner }) })
  if (outcome.kind === 'ok') { startInstallPolling(steamGame.deps, steamGame.appId, { delegatedToSteamClient: true }); return { status: 'done' } }
  if (outcome.kind === 'error') { return { status: 'error', error: `Steam refused ... (EAppUpdateError ${outcome.code})` } }
  // 'unavailable' falls through to the hand-off
}
await steamGame.deps.openExternal.openExternal(url)
startInstallPolling(steamGame.deps, steamGame.appId, { delegatedToSteamClient: true })
```
Hand-off URL: build with `buildSteamProtocolUrl` (`gameProtocolUrl.ts` :16-35), the single numeric-guard chokepoint (T-03-01). `steam://install/<appId>` is already in its verb union (zero new code); `steam://nav/games/details/<appId>` needs a new verb added to the union (guard still covers every variable byte). RESEARCH A1: neither is verified for updates, test live before locking.

**D-11 caveat:** the poller treats bit-4 as completion, so an update poll would finish instantly (RESEARCH Pitfall 6). Add an update-aware completion test (buildid equals TargetBuildID and no update bits) in `installPolling.ts` / `installPollOnce.ts` rather than reusing the install check.

---

### `.../steam/depotRust/jobBuilder.ts` and `install.ts` `requestCodeRefresher` (utility / service)

**Analog:** themselves.

`toRustDepotRefs` (:52-62) hardcodes `fromManifest: null`. Add an optional `oldGidByDepot: Map<string, string>` argument and set `fromManifest: oldGidByDepot.get(r.depotId) ?? null`. Thread it through `buildDepotJob` (:64-85). `requestCodeRefresher` (`install.ts` :90-125) already resolves a code for `(depotId, manifestId)`; the Rust host callback must be able to call it for the old GID (spike 076 did this for all six old GIDs). Keep the EResult-40 rethrow behaviour. `RustDepotRef` in `depotRust/types.ts` already has `fromManifest`.

---

### `src/backend/utils/checkGameUpdates.ts` and `storeManagers/index.ts` `autoUpdate` (D-02)

**Analog:** themselves. Key finding: `autoUpdate` (index.ts :277-303) uses `gamesToUpdate.forEach(async ...)` and returns the array synchronously, so the `gamesToUpdate = gamesToUpdate.filter(...)` reassignment inside the async callback is never seen by the caller. D-02 therefore cannot be implemented as a skip inside the callback.

```ts
// checkGameUpdates.ts :39-42
let gamesToUpdate = await library[runner].listUpdateableGames()
if (autoUpdateGames) { gamesToUpdate = autoUpdate(runner, gamesToUpdate) }
oldGames = [...oldGames, ...gamesToUpdate]
```
Structural approach: give `LibraryManager` a second method (for example `listAutoUpdateableGames`, defaulting to `listUpdateableGames` for other stores) and have `checkGameUpdates` pass only that to `autoUpdate`, while the badge list stays the full `listUpdateableGames()`. The existing `autoUpdate` body is the pattern for the queue element (`getDMElement(gameInfo, appName)` then `deps.getDownloadQueue().addToQueue(...)` with the `.catch` warning).

Per-runner `try/catch` isolation (WR-05, :32-52) must be preserved.

---

### `.../steam/games.ts` `update()` and `library/index.ts` `listUpdateableGames()`

**Analog:** the stubs, plus how `games.ts` delegates `uninstall` (`return uninstall(this, _args)`, :444).

```ts
// games.ts :447-459 (stub to replace; keep the first statement)
async update(): Promise<InstallResult> {
  this.deps.steamSession.authTrigger.noteSteamAuthTrigger('user-install')   // quick-260817-d61: unlock keyring gate
  ...
}
// library/index.ts :296
async listUpdateableGames(): Promise<string[]> { return [] }
```
Keep the `noteSteamAuthTrigger('user-install')` line, delegate to `updateBridge`/`updateNative` by install kind, and return the same `{ status }` shape `updateQueueElement` consumes. `pnpm steam-line-ceiling` limits growth of these two files, so put logic in new files.

**Queue contract** (`downloadmanager/utils.ts` :452-545): `updateQueueElement` already does the offline gate, `sendGameStatusUpdate('updating')`, notification `notify.update.started`, `library[runner].getGame(appName).update({build, branch, language, dlcs, dependencies})`, and `'done'` in `finally`. `status === 'error'` logs; the queue skips head revalidation for update elements. No change needed in `utils.ts` for D-10 beyond the "Update" label on the queue entry.

---

### `.../steam/launchDispatch.ts` / `gameBridgeLaunchGate.ts` (D-04, D-05, D-06)

**Analog:** `launchDispatch.ts` `dispatchSteamLaunch` (:51-64, single-flight via `launchFlights.singleFlightLaunch`) and the awaited-confirm pattern.

Put the prompt before `launchBridgeGame` in the dispatcher. `launchBridgeGame` stores `run` in `bridgeLaunchesInFlight` (gameBridgeLaunchGate.ts :40-70), so holding that entry across a dialog wait would make a second Play click join a promise that is waiting on a dialog.

**Awaited choice pattern** (`utils.ts` :962-972; same shape at `protocol.ts` :320, `quitHandler.ts` :41):
```ts
const { response } = await deps.dialogs.showMessageBox({
  title: i18next.t('box.warning.wine-change.title', 'Wine not found!'),
  message: i18next.t('box.warning.wine-change.message', { defaultValue: '...', ... }),
  buttons: [tOrFallback('box.yes', 'Yes'), tOrFallback('box.no', 'No')]
})
```
`showDialogBoxModalAuto` (`dialog/dialog.ts` :53) is fire-and-forget (returns `boolean`, buttons carry no awaited result), so use `dialogs.showMessageBox` for the "Update now / Play anyway" choice. If a "Don't ask again for this build" checkbox is wanted, `showMessageBox` options need checking; otherwise add a third button. Verify before planning.

**D-05 timeout:** bound the pre-launch PICS check with `withTimeout.ts` and fall back to the cached last-known `UpdateState`.

**D-06 ack store:** analog `titleSettings.ts` `readStoredTitleConfig(appId, deps)` (reads `GamesConfig/<appId>.json`, validates `^[0-9]{1,10}$`); RESEARCH recommends per-game settings keyed by `{appId, targetBuildId}`. Reads go through that helper; check how writes are done for `GameSettings` keys before adding a field (the file's `settingsKeys` helper checks keys against `GameSettings`, so a new key must be added to that type).

**Running-session notifications:** `notify(deps, {title, body})` + `i18next.t('gamelib:steam.bridge.alreadyLaunching', 'default text')` (gameBridgeLaunchGate.ts :53-62) is the copy pattern for status text.

---

### Frontend: card, game page, queue (STEAM-01c, D-08, D-09, D-10)

**Card badge (D-08): no new design.** `GameCard/index.tsx` already consumes `hasUpdate`:
```tsx
// :413-419
{ label: t('button.update', 'Update'), onclick: async () => handleUpdate(), show: hasUpdate && !isUpdating && !isQueued, icon: <Upgrade /> },
// :543   const showUpdateBadge = hasUpdate && !isUpdating && !isQueued && !notAvailable
// :578-583
{showUpdateBadge && (<span className="gameCardUpdateBadge">{t('status.hasUpdates')}</span>)}
```
`GamesList/index.tsx` :110 derives it: `const hasUpdate = is_installed && gameUpdates?.includes(app_name)`. The same derivation is at `GamePage/index.tsx` :392. So populating `listUpdateableGames()` is enough for badge and filter; `filterEngine.ts` :361 (`state.showUpdatesOnly && !deps.gameUpdates.includes(game.app_name)`) and `libraryState.ts` (`gameUpdates` :65, persisted to localStorage `'updates'` :770-778) need no change.

**Game page sizes (D-09):** `GamePage/index.tsx` :364-366 `handleUpdate() { updateGame({ appName, runner, gameInfo }) }`; `hasUpdate` passed to `MainButton` at :574-575. Model the two-size line ("Download 916 MB, needs 13 GB free during update") on `GamePage/components/DownloadSizeInfo.tsx` (read it first; not read this session). The size estimate must be labelled an estimate where it can differ (download is an upper bound, disk peak is exact).

**Unknown / failure states:** D-15 "unknown" must never render as an update. D-13 short-disk message and D-16 queue-entry error with Resume reuse the Downloads screen's existing error + Resume path (no new component).

**Sketch-findings rules (`Skill("sketch-findings-gamelib")`):** tokens are `--brand-primary` for accent and progress, `--neutral-0x` surfaces; 6px control radius, 10px containers, pills `9999px`; transitions `.12s-.22s ease`. Notices and toasts follow `references/notices-and-toasts.md` (bottom-right stack). Because the card badge and Update item already exist, there is no new visual surface except the pre-launch prompt, which is a backend `showMessageBox` (native dialog), and the two-size line. Load `references/notices-and-toasts.md` if the update progress/"Updating..." status should surface as a toast. Multi-theme survival: do not hardcode cyan; use the tokens.

---

## Shared Patterns

### Phase 73 pipeline invariants (apply to every Rust change)
**Source:** `download.rs` module doc :1-15, `73-CONTEXT.md` D-01..D-17.
- Depot selection and PICS stay in TypeScript; per-file/per-chunk work in Rust; bytes never cross the pipe.
- Cancel token checked before every file and chunk; a failed file drains its in-flight tasks.
- Every exit goes through the one `finalize` (ACF write). Do not add a third ACF writer (73-VERIFICATION Truth 9).
- Network concurrency is pinned by `InflightLimiter` (`TARGET_INFLIGHT_CHUNKS`); do not raise it.

### Path safety
**Source:** `post.rs` `resolve_contained_path` :114, `check_symlink_target` :131.
**Apply to:** every read, write, rename and delete in `delta.rs`. A traversal is an error. Only old-manifest-owned paths are ever deleted.

### Numeric ID guards
**Source:** `acf.rs` `assert_numeric` / `assert_numeric_buildid` :82-93, `manifest.rs` `is_numeric_id`, TS `NUMERIC_APP_ID` (`gameConstants.ts`), `buildSteamProtocolUrl`.
**Apply to:** appId, depot id, GID, buildid anywhere they reach a path, URL or ACF.

### Secret hygiene
**Source:** `job.rs` redacted `Debug` for `DepotRef` (:36-45); `jobBuilder.ts` header "Never logs the job: it carries depot keys".
**Apply to:** all new logging. Log `logOutcome`-style one-liners (`install.ts` :60-70), never a `DepotRef`/job.

### Sidecar exit contract
**Source:** `Skill("gamelib-conventions")`; `install.ts` header ("no timers or handles are created here").
**Apply to:** `updateDetection.ts`, the pre-launch check, any poller. `unref()` timers and sockets, bound all CM calls, nothing in-flight at boot.

### Error classification (TS)
**Source:** `depotRust/errorMap.ts`, `classifyDepotError` (`depotErrors.ts`).
**Apply to:** `updateBridge.ts` catch blocks; `depotRustErrorMap.test.ts` equates TS kinds to Rust `ERROR_KINDS`.

### Test conventions
**Source:** `73-VALIDATION.md` command set. Jest: `pnpm exec jest <paths>`; Rust: `cd src-tauri && cargo test -p gamelib-depot`; also `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm steam-line-ceiling`, `pnpm smoke:sidecar`. Any test that spawns a child process in `src/` or `meta/` uses `createFakeHomeProfile()`. `<verify>` blocks run `npx prettier --check` on exact paths after a `--file-info` check. `74-UAT.md` items: `### N.` heading at column 0, `expected:` inline, `result:` opening with a status word.

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| String-preserving read of ACF `InstalledDepots` GIDs | utility | transform | Every existing reader uses `@node-steam/vdf` `parse`, which loses 19-digit GIDs. Write a raw-text regex reader; spike 070 step 1 is the reference. |
| Free-disk-space query in Rust | utility | file-I/O | No statvfs/available-space helper in `gamelib-depot` or checked `src-tauri` files. Write a small cross-platform helper, or find one in `src-tauri/src` before adding a crate. |
| Interrupted-commit resume marker (A3) | service | file-I/O | No analog; `library/resume.ts` (verify_only on partial ACFs) was not read here and may "repair" a half-updated tree back to the old manifest. Read `resume.ts` and `resumeBreadcrumbs.ts` first. |
| Awaited prompt with "don't ask again" | component/controller | request-response | Only plain button-index `showMessageBox` confirms exist in the backend; no checkbox-capable prompt was found. |

## Metadata

**Analog search scope:** `src-tauri/crates/gamelib-depot/{src,tests}`, `src/backend/storeManagers/steam/**`, `src/backend/{utils,downloadmanager,dialog}`, `src/frontend/screens/{Library,Game}`, `src/frontend/state`, `.planning/spikes/076-bridge-delta-update/src`, `73-PATTERNS.md`, `sketch-findings-gamelib/SKILL.md`.
**Files scanned:** about 40 (targeted reads/greps; not read in depth: `DownloadSizeInfo.tsx`, `installPolling.ts`, `library/resume.ts`, `anonymousClient.ts`, `fixture_builder.rs` internals).
**Pattern extraction date:** 2026-11-12
