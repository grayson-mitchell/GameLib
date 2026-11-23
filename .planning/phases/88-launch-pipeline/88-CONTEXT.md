# Phase 88: Launch pipeline - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Launching any game builds the same command line and environment from Rust (SVC-03), and Rust
spawns it. The phase ports `launcher.ts` (1.75k lines), `commandRunner.ts` (748), `spawnAsync.ts`,
`gamescopeCommand.ts`, `launchSingleFlight.ts`, `launchEngineStep.ts`, the known-fixes modules
(`knownFixes`, `knownFixesRegistry`, `knownFixesFetcher`, `knownFixLaunch`, `knownFixOverlays`,
`knownFixOverlayArchive`, `knownFixOverlayInstall`, `knownFixReport`; about 2.4k lines), anti-cheat
at launch, GPU system info with the `pci_ids_*` caches (moved here by 87 D-05), and the
`utils.ts` rows the Phase 82 inventory assigns to 88 (`errorHandler` + `ErrorHandlerDeps`,
`askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher`, `removeQuoteIfNecessary`, the
Wine window raiser; `quoteIfNecessary` and `constructAndUpdateRPC` are deleted with their owners).
Their TS and sidecar registrations are deleted in this phase, except the scheduled shims below.

In scope: the outer launch funnel (single-flight, per-game log writer, pre/post scripts, status
updates, cleanup), every argv/env builder (`prepareLaunch`, `prepareWineLaunch`, `setupEnvVars`
extensions over 87's wine core, wrapper env, `setupWrappers`, gamescope/mangohud/gamemode,
known-fix env and exe override, `verifyWinePrefix`), the runner spawn for launches and for the
managers' non-launch runner commands, the quit-time kill of running games, and re-adoption of a
game that survived a GameLib crash (D-08..D-10, an explicit addition beyond parity).

Out of scope: the managers' own `launch()` orchestration and output parsers (Epic 91; GOG, Amazon,
sideload 92), the Steam launch dispatch and `steamLaunchWatch` (90), bridge launch and DRM/overlay
known-fix routing (95–97), and the engine step itself (ported in 87, D-01/D-22 there).

</domain>

<decisions>
## Implementation Decisions

### Where 88 ends
- **D-01:** **Rust owns the shared pipeline and every spawn. The managers' `launch()` stays TS until
  91/92.** Rust owns `launchEventCallback` (single-flight, log writer, pre/post scripts, status,
  cleanup), all argv/env builders, wrappers, gamescope, known-fix env/overlays, and the final
  spawn. `storeManagers/{legendary,gog,nile,sideload,storeManagerCommon}` keep their `launch()`
  orchestration and call the `Launcher` members through typed same-signature `rustInvoke` shims,
  each a schedule-test row with deleting phase 91 or 92 (86 D-05/D-06, 87 D-03/D-15). Research
  counts the sync call sites (`setupEnvVars`, `setupWrapperEnvVars` and `setupWrappers` are sync
  today) and shows each async ripple, or keeps a sync pure twin pinned by shared test vectors
  (87 D-24 shape). — **Reversibility:** costly — every shim and ripple lives in manager code until
  91/92.
- **D-02:** **`commandRunner` is fully ported and deleted in 88, through a streaming shim.** Rust
  owns every runner spawn: launches as `SpawnClass::Game`, and install/update/list/auth runner
  commands (legendary, gogdl, nile, comet) as `SpawnClass::Helper`. It also owns abort by id, the
  `getRunnerCallWithoutCredentials` redaction in logs, `errorHandler`, and the per-runner log
  writer. The TS shim streams stdout/stderr lines back to the existing `onOutput` callbacks so the
  TS progress parsers keep working until 91/92 move them. SC4 holds as written for
  `commandRunner`. — **Reversibility:** costly — the streaming shim is the contract every manager
  uses until 91/92.
- **D-03:** **All of known-fixes moves in 88, and the bridge reaches it through shims.** This covers
  the reader and layering, the remote fetcher, registry fixes, the overlay archive and install,
  exe overrides and the report URL. `storeManagers/steam/{bridgeKnownFixes,drmKnownFix,macArchKnownFix}`
  call Rust through scheduled shims (deleting phase 97), so the fix data has one owner. On-disk
  overlay state and the fetched-fixes cache stay byte-compatible (87 D-07 shape).
- **D-04:** **The launch single-flight table has one owner, in Rust.** The TS Steam dispatch
  (`dispatchSteamLaunch`, ported in 90) joins it through a shim, so a second Play from any entry
  point still joins the first.

### Game lifetime and quit
- **D-05:** **Games spawn through `gamelib_proc::spawn::spawn_game` (`SpawnClass::Game`).** A
  Force Quit, `kill -9` or crash of GameLib no longer kills a running game. This resolves todo
  `2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix` for every non-bridge launch. Bridge
  launches stay on the D-15 interim until 95–97. On Windows a Game-class tree also leaves the
  kill-on-close Job, so the game survives a crash there too.
- **D-06:** **A graceful quit behaves exactly as before.** The same "pending operations" dialog
  (with `cancelId: 0`, CR-04) appears when a game is running, and Yes kills that game's process
  tree explicitly through `gamelib-proc`. No hand-rolled kill. Because Game-class trees are not in
  the sidecar group, the kill must be explicit, and the gate proves it.
- **D-07:** **Rust owns the running-game registry that the quit check reads** (today
  `runner.killAllTracked()`'s tracked Wine children and `isRunning`). The TS quit handler (98)
  reads it through a shim.

### Re-adoption after a crash (new capability, beyond parity)
- **D-08:** **A game that survived a GameLib crash is re-adopted on the next boot.** Each Game-class
  launch writes a per-launch record (runner, appName, pid, process start time, launch start time,
  the after-script path). At boot, Rust matches each record against live processes by pid **and**
  start time, so a reused pid never matches. A match shows the game as Playing. When it exits,
  Rust records the playtime and runs the after-launch script. A record without a match is removed.
  — **Reversibility:** reversible — a new record file with no consumer outside 88.
- **D-09:** **Log capture is not resumed for a re-adopted game** (the stdout pipe died with the old
  process). The per-game log gets a line saying the session was re-adopted.
- **D-10:** Re-adoption is outside the golden oracle (D-11 only covers what the TS did). It gets
  its own Rust tests and a live-gate item (D-17 item 3). Boot work for re-adoption is bounded and
  holds a `gamelib_core::shutdown::global()` Registrant for the exit watch (Rust shutdown
  contract).

### Golden trace oracle
- **D-11:** **Goldens are recorded from TS at the spawn boundary before any Rust for a sub-slice.** A
  TS harness drives the launch path with an injected `ProcessRunner`, probes and filesystem, and
  records argv, env, cwd, spawn class and the order of spawns (pre-script → game → post-script,
  `wineboot`/prefix steps, registry fixes, overlay install) per scenario. Rust replays the same
  inputs and must match. Goldens carry the Phase 82 D-05 vacuous-pass guards.
- **D-12:** **Pinned base env, full compare.** The harness runs on a fixed synthetic base env (fake
  HOME from `createFakeHomeProfile()`, fixed `PATH`/`LANG`/`USER`). The golden stores the full
  resulting env, so a dropped, leaked or wrongly stripped variable is a diff.
- **D-13:** **Platform is injected, so every target is recorded on one machine.** Linux
  (gamescope, mangohud, gamemode, Proton/umu, Flatpak paths) and Windows (native exe quoting,
  `.bat`/`.cmd` handling) scenarios are recorded with `platform` and probes injected, and Rust
  replays every golden on the three-OS CI matrix. Research lists behaviour that injection can't
  fake (the real gamescope/umu binaries, Windows `CreateProcess` quoting against a real exe), and
  each becomes a CI smoke or a Phase 99 live item.
- **D-14:** **Matrix = per-axis + pairwise + named incidents.** Axes: runner
  (legendary/gog/nile/sideload), engine (native, Wine, Proton/umu, CrossOver, Staging fallback),
  OS, and toggles (gamescope, mangohud, gamemode, custom wrappers, known-fix env and exe override,
  overlay present, pre/post scripts, offline, anti-cheat present, `isMacSonomaOrHigher` both
  ways). Every axis value appears at least once, all toggle pairs are generated pairwise, and every
  incident scenario in the existing launcher/known-fix/commandRunner tests becomes a named
  scenario. Runner-command goldens (D-02) record argv/env plus the redacted log line and the
  streamed line sequence for a recorded transcript.
- **D-15:** Behavioural TS tests that record incidents port as Rust tests (at minimum
  `launcher_launchSingleFlight`, `commandRunner` abort and redaction, the `knownFix*` layering,
  registry, overlay archive and install cases, and `gamescopeCommand`'s help-probe forms).
  Source-text gate tests are dropped (87 D-08).

### Live gate
- **D-16:** **macOS is live. Windows and Linux are CI plus Phase 99.** SC2's Windows/Linux arm is
  proven by golden replay plus a three-OS CI smoke that launches a stub "game" binary through the
  real Rust launch op: native and Wine-shaped where the runner allows, plus single-flight join and
  quit-kill. Real-title live checks on Windows and Linux move to Phase 99. **Amend ROADMAP SC2** to
  say so, as 86 D-16 and 87 D-13 did.
- **D-17:** **The macOS operator gate is a signed Phase 88 build installed over a signed Phase 87
  build** (87 D-12), authored as `88-HUMAN-UAT.md` before coding, with four items:
  1. **Launches.** A native macOS game (GOG or Epic), a Windows game on CrossOver and one on the
     Staging fallback each start and run. The per-game log has the header and game output, and
     playtime is recorded on exit.
  2. **Single flight + quit.** A double Play joins one launch. Quitting GameLib with a game running
     shows the dialog, and Yes kills the game's tree (D-06).
  3. **Force Quit survival + re-adopt.** `kill -9` GameLib mid-game leaves the game running.
     Reopening GameLib shows it as Playing, and on game exit playtime and the after-script run
     (D-08).
  4. **Known fix + scripts.** A title with a known-fix overlay and env or exe override applies them
     on launch. Pre/post scripts run in order with their output in the log.
  Any offline step follows the offline-UAT memory shape (network off only for the action).

### Carried forward (already decided, not re-asked)
- **D-18:** No `GAMELIB_LAUNCH` flag. Each sub-slice's TS is deleted once its goldens pass, and a
  gate failure is fixed in Rust and never revived (87 D-06).
- **D-19:** A native channel never falls back to the sidecar. Its Rust serde struct is the schema,
  the zod entry is deleted with the TS registration, and the IPC snapshot is regenerated
  (83 D-04/D-06/D-07).
- **D-20:** Quirks are copied for parity and each is filed as a todo with the three triage keys. A
  golden diff never mixes a port with a fix (86 D-03).
- **D-21:** Every spawn goes through `gamelib-proc`. Games are `Game`. Runner commands, scripts,
  probes and the window raiser are `Helper`. In-flight work holds a Shutdown Registrant, exit work
  fits `ExitBudget::DEFAULT`, boot work is bounded, and there is no `PR_SET_PDEATHSIG` and no
  hand-rolled kill. Load `Skill("gamelib-conventions")` before planning.
- **D-22:** Two-profile rule: the harness and the Rust spawns are isolated by default. Any
  real-profile arm (for example the pre/post scripts' HOME, or the per-game log location) is named
  and justified.
- **D-23:** Rust events keep the same names and payload shapes (`gameStatusUpdate`, launch
  notices), so the renderer is untouched (86 D-08, 87 D-10).
- **D-24:** Amend `82-STATE-OWNERSHIP.md`: the `pci_ids_device`/`pci_ids_vendor` rows were moved to 88
  by 87 D-05. Confirm every 88-scheduled row (and the `utils.ts` inventory rows destined for 88)
  in one amendment.
- **D-25:** v0.11 rules: live gates are authored before coding, goldens are recorded from TS before
  porting, and the phase's last plan leaves no TS or registrations for any ported module except
  scheduled shims and resolvers.

### Claude's Discretion
- The crate layout: a new `gamelib-launch` (+cli) crate, or launch modules inside `gamelib-engine`/
  `gamelib-wine`, keeping 87 D-04's one-way dependency. Known-fixes may be its own crate.
- The sub-slice order (research may suggest known-fixes and builders first, then runner spawn, then
  the funnel and single-flight, then re-adoption).
- Op names, the streaming shim's transport (event channel versus chunked replies), and the
  per-launch record's format and location.
- The recorder and fixture format, the pairwise generator, and redaction.
- How anti-cheat at launch is covered: goldens plus Rust tests. A live check is only needed if
  research finds a macOS-visible path.

### Folded Todos
- `2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix` (process-lifetime): resolved for
  non-bridge launches by D-05, and verified by D-17 item 3. The todo stays open for bridge launches
  (95–97); update its body when 88 lands rather than closing it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 88: Launch pipeline": the goal and 4 success criteria (amend SC2 per D-16); § "v0.11 Phase Details": the rules for every port phase
- `.planning/REQUIREMENTS-v0.11.md`: SVC-03 (also FND-02, FND-04, FND-06)
- `.planning/research/v0.11/SUMMARY.md`: item 88, ruling 2 (ProcessRunner placement: commandRunner ports in 87/88), ruling 5 (launcher placement)
- `.planning/research/v0.11/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`: the launch slice and Windows quoting pitfalls

### Inventories and ownership
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md`: every `utils.ts` row with destination 88, and the boot steps `command-runner`, `app-runtime` (launch single-flight), `abort-registry` (window raiser) and `store-managers` (launcher)
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the `pci_ids_*` rows (amend per D-24)

### Prior contracts
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no-fallback, schema authority, D-08 (Game vs Helper; a game's tree survives), D-10/D-11/D-15 (the SIGKILL reaper and its interim)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md`: "Known behaviour change (D-15)"
- `.planning/phases/86-pure-leaf-services/86-CONTEXT.md`: the shim/resolver pattern and schedule test (D-05, D-06, D-24), the TS golden harness (D-11), the signed upgrade gate (D-15), CI-only Windows/Linux (D-16)
- `.planning/phases/87-engine-wine-and-tools/87-CONTEXT.md`: D-01 (the engine step is already Rust; 88 owns only argv/env), D-03/D-24 (bridge shims and the sync pure twin), D-05 (GPU info moved here), D-06 (no flag), D-12 (signed gate), D-22 (the wine command core and env builders are already in `gamelib-wine`; 88 extends them, never re-ports)
- `.planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md`

### Patterns to copy
- `src/backend/__tests__/*PortComplete.test.ts` and the 87 schedule test (`src/backend/__tests__/engineWineShimSchedule.test.ts`): delete gates and shim schedule rows
- `src-tauri/crates/gamelib-proc` (`spawn_game`, `SpawnClass`), `gamelib-engine`, `gamelib-wine`, `gamelib-log`, `gamelib-testutil` (`FakeHome`), `gamelib-safety`
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`

</canonical_refs>

<code_context>
## Existing Code Insights

### Modules (TS source lines)
- `launcher.ts` 1751: `prepareLaunch` (696), `prepareWineLaunch` (922), `installFixes` (1198), `getKnownFixesEnvVariables` (1256), `setupEnvVars` (1271), `setupWrapperEnvVars` (1318), `setupWineEnvVars` (1336), `setupWrappers` (1556), `verifyWinePrefix` (1589), `launchCleanup`, `runBeforeLaunchScript`/`runAfterLaunchScript`, `launchEventCallback`, `createLauncher`
- `commandRunner.ts` 748 (`createCommandRunner`, `getRunnerCallWithoutCredentials`), `spawnAsync.ts` 114, `gamescopeCommand.ts` 89, `launchSingleFlight.ts` 56, `launchEngineStep.ts` 106
- Known fixes: `knownFixesRegistry` 607, `knownFixes` 454, `knownFixOverlayInstall` 326, `knownFixReport` 264, `knownFixOverlays` 256, `knownFixOverlayArchive` 188, `knownFixesFetcher` 179, `knownFixLaunch` 107
- `process/` (TS `ProcessRunner`, registry, runner 391) and `quitHandler.ts` (the running-game dialog, `killAllTracked`)
- `info/anticheat.ts` (ported data leaf from 86); anti-cheat at launch lives in `launcher.ts`

### Callers that become shims (D-01..D-04)
- `Launcher` members: `storeManagers/{legendary,gog,nile}/games.ts`, `{gog,nile,legendary}/setup.ts`, `storeManagerCommon/games.ts`, `sideload/games.ts`, `sidecar/steamFlowRegistration.ts`, `protocol.ts`, `save_sync.ts`, `services/managerDeps.ts`
- `commandRunner`: the same managers plus `steam/bridge/{sharedRedistInstall,bottleDllOverrides,drm/stageDrmTypes}.ts`, `services/{engineServices,managerDeps,types}.ts`, `storeManagers/index.ts`
- Known fixes: `storeManagers/steam/{bridgeKnownFixes,drmKnownFix,macArchKnownFix}.ts` (deleting phase 97)

### Integration points
- Rust already holds the engine launch step and the wine core (`src/backend/enginewine/{launch,wineCore,wineDiscovery}.ts` are the 87 shims/resolvers that 88's shims sit beside)
- `sidecar/bootstrap.ts` boot steps `command-runner`, `app-runtime` and `store-managers` lose their launch pieces; `sidecar/runnerMiscFlowRegistration.ts` and `runnerAuthFlowRegistration.ts` hold runner channels for research to map
- Per-game logs go through `gamelib-log` (todo `2026-11-21-gamelib-log-golden-fails-on-windows-path-separator` touches the wine-header path, so watch for it in D-13's Windows replay)

</code_context>

<specifics>
## Specific Ideas

- Gate titles: one native macOS game (GOG or Epic), one CrossOver title, one Staging-fallback
  title, and one title with a known-fix overlay. The operator picks the exact titles.
- The Force Quit item uses `kill -9` on the GameLib app process, not on the game.

</specifics>

<deferred>
## Deferred Ideas

- Real-title Windows and Linux launch checks → Phase 99 (D-16).
- Resuming log capture for a re-adopted game: not possible without the original pipe. Revisit
  only if a later phase routes game output through a file the game writes itself.
- Fixing any quirk the port copies → individual todos (D-20).

### Reviewed Todos (not folded)
- `2026-10-29-protonfixes-import-dev-tool` (known-fixes): an offline dev tool that is a new
  capability, not part of the port.
- `2026-11-21-gamelib-log-golden-fails-on-windows-path-separator`: a logger test (84); it is only
  noted under code_context.
- Keyword matches outside the domain: unsigned Windows releases, packaged-app blank render, the
  RUSTSEC chrono audit, x86 flat API parity, the PCGW cargoquery lookup, and "Play here on the other
  device".

</deferred>

---

*Phase: 88-launch-pipeline*
*Context gathered: 2026-11-24*
