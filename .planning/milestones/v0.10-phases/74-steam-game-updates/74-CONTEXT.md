# Phase 74: Steam game updates - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

GameLib tells you when an installed Steam game has an update, and can apply it.

- **Detection, both kinds of install.** Shown on the card and the game page. Checked on library
  refresh and before launch, and never as an unbounded boot task (sidecar exit contract).
  - **Bridge games:** compare the ACF `buildid` and per-depot manifest GIDs with the branch in
    PICS appinfo.
  - **Steam-registered games:** use the ACF (`StateFlags` bit 0x2, `TargetBuildID` ≠
    `buildid`, `BytesToDownload`, `ScheduledAutoUpdate`) or IPC (`BIsAppUpToDate`, install
    state 6). PICS is a cross-check for when Steam isn't running.
- **Bridge games: GameLib updates them itself** with a chunk-level delta in the Phase 73 Rust
  pipeline (`gamelib-depot`, `DepotRef.fromManifest`). After the update it rewrites the ACF
  and redoes the GID-keyed follow-ups: the shim, the redist ledger, and the DRM/known-fix
  verdicts.
- **Steam-registered games: Steam updates them.** The Update button is
  `IClientAppManager::InstallApp(appId)` (spike 069) when that path is enabled, and a hand-off
  to the Steam client otherwise.

Requirements: STEAM-01 ("Update available" on an installed Steam game) and STEAM-02 (update a
bridge-installed game from GameLib).

Out of scope: a Verify action, Move install, a per-game auto-update override, and an in-place
patch mode for short disk.
</domain>

<decisions>
## Implementation Decisions

### Locked by roadmap and spikes (not re-asked)
- **Delta mechanics (spike 076):**
  - The delta is **chunk-level**, not file-level.
  - New files are built beside the old tree, then committed: temp files, a `sha_content`
    check, rename, and only then delete removed files. No old file is overwritten or deleted
    until every new file that reads from it has been built.
  - Every reused chunk is SHA-1 checked from its local bytes. A chunk that fails becomes a CDN
    chunk.
  - The free-space check is for the peak extra disk, which is the total size of the changed
    files, not the download size.
  - Only paths the manifest owns are ever written or deleted. Unowned files are kept: the
    shim's `.gamelib-orig`, `gamelib_bridge.cfg`, DXVK caches, logs. Game-modified files that
    the update doesn't change are left alone.
- **Old manifest:** the CDN still serves old manifests (6/6 in spike 076). Even so, cache each
  install's manifest in `ManifestStore` at install time and protect it from `KEEP_GIDS`
  pruning while the game is installed.
- **Shim handover (spike 076, step 6):** if a shimmed `steam_api*.dll` is in the change set,
  write the new genuine DLL to `.gamelib-orig`, then re-place the shim and rewrite
  `gamelib_bridge.cfg`. If it isn't in the change set, leave the shim alone.
- **After every bridge update, redo the GID-keyed follow-ups:** the steam_api shim rescan and
  re-placement, the per-GID redist ledger (`bridge/sharedRedistInstall.ts`), and the
  DRM/known-fix verdicts. The ACF gets the new `buildid` and the new `InstalledDepots` GIDs.
- **Read manifest GIDs as strings, never through `@node-steam/vdf` number coercion.** That
  coercion loses precision on 19-digit GIDs (spike 070, step 1).
- **Bridge detection** compares the ACF `buildid` with PICS `depots.branches.<branch>.buildid`.
  Spike 070 found it matched the per-GID check 28/28. Don't use `timeupdated`; older apps
  don't have it.
- **Refuse to update while the game is running.** A bridge update resumes through the download
  queue the same way an install does (Phase 73 D-07: pause = abort, and resume reconciles).
- **The delta updater is for bridge games only.** Steam-registered games are always updated by
  Steam.

### Auto-update policy
- **D-01:** **Bridge games follow the global `autoUpdateGames` setting.** When it's on, a stale
  bridge game is queued for its delta update automatically, through the same
  `checkGameUpdates` → `autoUpdate` path the other stores use. When it's off, the game gets
  only the badge and the button.
- **D-02:** **GameLib never starts Steam-registered updates on its own.** Even with
  `autoUpdateGames` on, it doesn't call `InstallApp` automatically. Steam's own schedule and
  any deferral you set (for example "only update when launched") are respected. GameLib only
  shows the state and the Update button. In practice `listUpdateableGames()` must not feed
  Steam-registered apps into the auto-queue: either split them out, or have `autoUpdate`
  skip them.
- **D-03:** **No per-game auto-update override** in this phase. Global setting only, as the
  other stores work today.

### Launching a stale game
- **D-04:** **Bridge game with a pending update + Play → prompt "Update now / Play anyway".**
  "Update now" queues the update. "Play anyway" launches the current build.
- **D-05:** **The pre-launch check has a short timeout and never blocks Play on the network.**
  It waits a few seconds at most. If PICS is slow or you're offline, it uses the last known
  state and continues. The planner picks the exact timeout.
- **D-06:** **"Don't ask again for this build."** The prompt offers it, keyed by the target
  build ID. The prompt stays hidden until a newer public build ships. The badge stays.
- **D-07:** **No GameLib prompt for Steam-registered games.** They launch through
  `steam://rungameid` as they do today, and Steam applies its own update-on-launch behaviour.

### Update UI and queue
- **D-08:** **The card reuses the existing "update available" indicator.** That's the
  `gameUpdates` list in `libraryState.ts`, plus the existing "updates" filter in
  `filterEngine.ts`. No new Steam-specific badge design.
- **D-09:** **The game page and the update confirmation show both sizes.** For example:
  "Download 916 MB · needs 13 GB free during update". The download and the temp-disk peak
  differ a lot (Manor Lords: 0.9 GB against about 13 GB).
- **D-10:** **Bridge updates go in the same download queue, labelled "Update".** They get the
  same pause, resume, cancel and progress as installs. The plan/hash phase and the commit
  phase show as status text. The UI-facing progress shape stays as it is (Phase 73 D-06).
- **D-11:** **Steam-registered updates show progress in GameLib.** After `InstallApp`, the
  card shows "Updating…" with progress. It reuses the Steam-download progress polling that
  installs already use (`library/installPolling.ts`), until Steam finishes.
- **D-12:** **The Steam-registered Update button respects the InstallApp opt-in.**
  `InstallApp` sits behind "Steam Experimental InstallApp Feature"
  (`isSteamExperimentalInstallAppEnabled`), which is off by default and macOS-only.
  - When that setting is on, Update calls `InstallApp` through the existing helper, with
    spike 065's runtime slot check.
  - When it's off, or on Windows/Linux, Update **hands off to the Steam client**: it opens the
    game in Steam (a `steam://` deep link to the game's page; the planner picks the exact
    URI) so you can update it there.
  - Detection and the badge work either way, because they read the ACF.

### Failure and fallback
- **D-13:** **Short disk → refuse with a clear message.** For example: "Needs 13 GB free,
  4 GB available." Nothing is touched, and the badge stays. There's no in-place patch mode.
- **D-14:** **Old manifest unavailable → file-level reconcile, automatically.** If the old
  manifest is neither cached nor served by the CDN, point the Phase 73 reconcile at the new
  manifest. It keeps files whose SHA-1 matches and re-downloads the rest. Before starting,
  show the larger download size this means.
- **D-15:** **Beta branches are tracked.** If the ACF has a `BetaKey`, detection and update
  use that branch. A branch that can't be resolved (password-protected, or not visible
  anonymously) shows as "unknown", never as "update available".
- **D-16:** **A mid-update failure leaves the old build intact and resumable.** Build-beside
  then commit keeps the old tree playable until the commit. The queue entry shows the error
  with Resume, and the game still launches on its old build. There's no extra automatic retry
  beyond the pipeline's existing host failover and stall handling.

### Claude's Discretion
- **How D-09's sizes are computed before you click.** One option is a manifest-to-manifest
  diff, with no local hashing, as a cheap estimate. The exact plan comes at update time,
  because local hashing takes about 8 s on Manor Lords. The estimate must say it's an
  estimate if the two can differ.
- **The pre-launch timeout value (D-05)** and how stale-state results are cached between
  refreshes.
- **Where the "don't ask again for this build" acknowledgement is stored (D-06).**
- **The `fromManifest` job schema** and the event/status names for the plan and commit phases.
- **How resume after an interrupted commit works.** Spike 076: each file is whole-old or
  whole-new, so a SHA-1 reconcile against the new manifest finishes the job. The planner
  confirms this and tests it.
- **Removed-file deletion, multi-depot apps, and file-mode flags under delta.** None of these
  was tested in spike 076. Cover them with fixtures or unit tests.
- **The exact `steam://` URI for the D-12 hand-off.**

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 74: Steam game updates": the goal, the two cases and the live
  gate.
- `.planning/REQUIREMENTS.md`: STEAM-01 and STEAM-02.

### Spikes that lock the mechanics
- `.planning/spikes/076-bridge-delta-update/README.md`: chunk-level delta requirements,
  measurements on the six stale installs, the shim handover, and what wasn't tested.
- `.planning/spikes/076-bridge-delta-update/src/`: the working plan/apply harness on top of
  production `gamelib_depot`.
- `.planning/spikes/069-steamclient-update-installed/README.md`: `InstallApp` on an installed
  app, the IPC slot table, the ACF pending-update fields, and how to make a deferred-update
  fixture (don't use a branch switch).
- `.planning/spikes/070-bridge-games-stay-stale/README.md`: proof that bridge installs go
  stale, the buildid-vs-GID agreement, GID-as-string, and the six live-gate fixtures (Manor
  Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs).
- `.planning/spikes/065-steamclient-installapp/README.md`: the `InstallApp` helper call and the
  runtime slot verification and fallback.

### Phase 73 (the pipeline this builds on)
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-CONTEXT.md`: D-01 to D-17. Of
  these, D-05 (delta-ready shape), D-06 (events), D-07 (pause = abort + reconcile), D-09
  (error taxonomy) and D-11 (ACF writing in Rust) matter most here.
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-VERIFICATION.md`: what shipped.

### Project skills
- `Skill("spike-findings-gamelib")`: the Steam-client integration and depot pipeline sections.
- `Skill("gamelib-conventions")`: the sidecar exit contract (detection must not be an
  unbounded boot task), fake-HOME isolation, and the `<verify>` prettier check.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/utils/checkGameUpdates.ts`: a runner-generic update check over
  `library[runner].listUpdateableGames()`, with `autoUpdate` queueing when `autoUpdateGames`
  is on. Steam's implementation is a stub returning `[]`
  (`steam/library/index.ts:296`).
- `SteamGame.update()` (`src/backend/storeManagers/steam/games.ts:447`): a stub returning an
  error. This is the entry point to implement.
- `src-tauri/crates/gamelib-depot/`: `manifest.rs` (`ManifestStore`, `KEEP_GIDS = 2` at :146,
  the `fromManifest` rejection at :101), `download.rs` (:826 `delta_unsupported`),
  `job.rs` (`fromManifest` field), `outcome.rs` (`DeltaUnsupported` kind), `reconcile.rs`,
  `acf.rs`, `post.rs` (modes and flags).
- `src/backend/storeManagers/steam/steamInstallApp.ts` and
  `experimentalInstallAppSetting.ts`: the `InstallApp` helper and its opt-in gate.
- `src/backend/storeManagers/steam/library/installPolling.ts` / `acfState.ts`: Steam-side
  download progress and ACF state reading. Reuse these for D-11 and for ACF-based detection.
- `src/backend/storeManagers/steam/bridge/shimPlacement.ts`, `shimOriginals.ts`,
  `originalRestore.ts`, `bridgeConfig.ts`, `sharedRedistInstall.ts`, `bridgeVerdict.ts`: the
  GID-keyed follow-ups to redo after an update.
- `src/backend/downloadmanager/downloadqueue.ts`: the queue that bridge updates join (D-10).
- Frontend: `gameUpdates` in `src/frontend/state/libraryState.ts`, the "updates" filter in
  `src/frontend/screens/Library/filterEngine.ts`, and the Game page in
  `src/frontend/screens/Game/GamePage/index.tsx`.

### Established Patterns
- Depot selection and PICS stay in TypeScript, and per-file/per-chunk work happens in Rust.
  Bytes never cross the pipe (Phase 73 D-01 to D-04).
- Every outcome, including cancel, failure and success, goes through finalize, which runs the
  ACF write.
- The bridge steamapps root comes from `getBridgeBottleSteamappsRoot()` /
  `getBottleSteamappsDir()`.

### Integration Points
- Library refresh (`libraryState.refresh(…, checkForUpdates)`) → `window.api.checkGameUpdates`.
- The launch path for bridge games (`gameBridgeLaunchGate.ts` `launchBridgeGame`): this is
  where the D-04 prompt and the D-05 pre-launch check go.

</code_context>

<specifics>
## Specific Ideas

- Live-gate fixtures are ready: the six stale bridge installs from spike 070. Manor Lords
  covers the hard case (3.7 GB of cross-file reuse, plus the shim being replaced). Mining
  Mechs covers the quick case.
- For a Steam-registered pending-update fixture, follow spike 069 step 4: quit Steam, edit the
  ACF, relaunch. Don't use a branch switch.
- The size copy should be honest about the temp-disk spike (D-09). It's the most likely reason
  an update fails.

</specifics>

<deferred>
## Deferred Ideas

- Per-game auto-update override, for example to pin a build for mods. Not in this phase (D-03).
- An in-place patch mode for low disk space (D-13 refuses instead).

### Reviewed Todos (not folded)
- `2026-11-07-implement-steam-verify-and-move-install.md`: Verify (`StartValidatingApp` and
  the Phase 73 `verify_only` mode) and Move install. Kept as its own todo, so Phase 74 stays on
  detecting and applying updates. Spike 076 notes that Verify is where game-modified files
  left alone by an update would get repaired.
- Other keyword matches (Windows signing, blank-render fix, launch toast theming, launch
  without Steam, refresh via the running client, RunningAppID poller, x86 shim parity,
  optionaldlc, protonfixes, winebus, store-exit refresh, source ports, restart hold, Humble
  login splits, toast overlap) are unrelated to Steam updates and weren't folded.

</deferred>

---

*Phase: 74-steam-game-updates*
*Context gathered: 2026-11-12*
