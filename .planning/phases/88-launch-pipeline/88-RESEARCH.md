# Phase 88: Launch pipeline - Research

**Researched:** 2026-11-24
**Domain:** Porting the TypeScript launch pipeline (`launcher.ts`, `commandRunner.ts`, known-fixes, utils pieces) to Rust, behind golden argv/env traces recorded from the TS first
**Confidence:** MEDIUM-HIGH (the TS inventory, the 87 seams and the `gamelib-proc` gaps are read from source this session; the funnel-to-manager callback design, Windows tree-kill and shlex parity are recommendations that need a plan-time spike or vectors)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Where 88 ends**
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

**Game lifetime and quit**
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

**Re-adoption after a crash (new capability, beyond parity)**
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

**Golden trace oracle**
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

**Live gate**
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

**Carried forward (already decided, not re-asked)**
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

### Deferred Ideas (OUT OF SCOPE)
- Real-title Windows and Linux launch checks → Phase 99 (D-16).
- Resuming log capture for a re-adopted game: not possible without the original pipe. Revisit
  only if a later phase routes game output through a file the game writes itself.
- Fixing any quirk the port copies → individual todos (D-20).
- Reviewed todos not folded: `2026-10-29-protonfixes-import-dev-tool` (an offline dev tool, new capability);
  `2026-11-21-gamelib-log-golden-fails-on-windows-path-separator` (a logger test, 84; only noted for D-13's Windows replay).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-03 | Launching any game produces the same command line and environment as before (golden traces): native, Wine/Proton/CrossOver, gamescope/mangohud, known-fix overlays, pre/post scripts | Sections "TS inventory", "Golden-trace harness and launch matrix", "Architecture Patterns" (builders, runner spawn, funnel), "Validation Architecture"; also FND-02, FND-04, FND-06 through the `gamelib-proc` Game-class and shutdown-contract sections |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GameLib is an independent project, not a fork tracking Heroic.** Do not raise upstream mergeability as a concern. [VERIFIED: CLAUDE.md "Constraints"]
- **Conventions table** (load `Skill("gamelib-conventions")`, loaded this session): (1) any file created in `.planning/todos/pending/` carries `severity:`, `platform:`, `ready:` bare, lowercase, in that order (D-20 files a todo per copied quirk); (2) a spawn from `src/` or `meta/` uses `createFakeHomeProfile()`, never a hand-rolled `env` literal, with a named real-profile arm where a defect only arms under a populated profile (D-22); (3) sidecar handles `unref()` and no unbounded boot work; (4) Rust spawns go through `gamelib-proc` (`SpawnClass::Helper`; `Game` only for what must outlive GameLib), hold a `gamelib_core::shutdown::global()` Registrant for in-flight work, exit work fits `ExitBudget::DEFAULT` (5 s), boot work is bounded, never `PR_SET_PDEATHSIG`, never a hand-rolled kill; (5) a `*-UAT.md` item is a `### N.` heading at column 0, `expected:` inline, `result:` opening with a bare or bracketed status word (matters for `88-HUMAN-UAT.md`); (6) every task `<verify>` that writes a prettier-visible file runs `npx prettier --check` over the exact paths (after `--file-info`); `.planning`, `public/locales/`, `.claude`, `graphify-out` are prettier-ignored, so a check there is vacuous and must be omitted.
- **Steam stack is Rust** (steam-session/steam-user retired in 79). Launch of Steam titles stays `shell.openExternal("steam://rungameid/{appId}")`; the Steam dispatch is Phase 90 and is out of scope here.
- **Do not run `generate-claude-md`** against CLAUDE.md. [VERIFIED: CLAUDE.md header]
- **graphify**: use `graphify query` before grepping code; never read `graphify-out/GRAPH_REPORT.md` or `graph.json`. Use `gsd-graph ask` for planning questions.
- **GSD workflow**: no direct repo edits outside a GSD workflow; `/gsd-...` commands use a hyphen (memory).
- **Memory constraints that touch this phase:** dev launch is `pnpm tauri:dev`, never `tauri:dev:run` (skips the dev-vault flag); `tauri dev` does not rebuild the sidecar (restart before live-testing backend changes); fresh worktree needs `build:sidecar-sea` + `vite build` before `cargo`; offline UAT steps turn the network off only for the action; Steam engine order is CrossOver first, Staging fallback; a GSD `commit "msg" path` sweeps all dirty `.planning` (only `--files` scopes it); round-2 review IDs must continue WR/IN numbering.

## Summary

Phase 88 is the largest single port in v0.11 by surface (TS to delete: `launcher.ts` 1733 lines, `commandRunner.ts` 748, the eight known-fix modules about 2.4k, `gamescopeCommand`, `launchSingleFlight`, `launchEngineStep`, `spawnAsync`, the 837-line `utils/systeminfo` tree, and the `utils.ts` rows). The 87 phase already put the pieces under it: the wine command core (`setup_env_vars`, `build_wine_env_vars`, `run_wine_command`, `verify_wine_prefix`, umu) is in `gamelib-wine`, the engine launch step (`select_engine_for_launch`) is in `gamelib-engine`, and a TS oracle harness exists (`src/backend/testUtils/engineWineOracle/`) with goldens for `runWineCommand` (16 cases) and the env builders (40+ vectors). 88 extends those crates; it never re-ports them. What 87 explicitly deferred to 88 is on record: the launch variant of `run_wine_command` (game log header, `killTracked`-style registry, `trackKey`, `resolveOnExit`, chunked output) is listed in `golden/wine_command/deltas.json` as "accepted and ignored until Phase 88".

The hard problems are not the argv builders (pure, vector-testable) but four structural ones that CONTEXT does not resolve. (1) The funnel (`launchEventCallback`) is interleaved with manager-owned TS calls (`game.launch`, `syncSaves`, `updateGOGPlaytime`, `setPresence`, `forceUninstall`, `getSettings`), so a Rust-owned funnel needs a Rust-to-TS callback seam; the pattern this milestone's own research calls an anti-pattern. I recommend defining the funnel in Rust over a `ManagerHooks` trait that the shell implements by TS callback until 91/92 implement it in-process. (2) `gamelib_proc::spawn::spawn_game` gives the game no pipe (stdout and stderr to null or an append file), but the legendary launch classifies login failures from captured output and the per-game log must carry the game's output; a private capture file that Rust tails solves both, and makes D-09's "no resume" a choice rather than a limit. (3) `gamelib-proc` has no explicit Game-tree kill on Windows, no Windows `start_time` (D-08 needs pid plus start time), and no way to kill a re-adopted game on unix except by pgid; 88 must extend `gamelib-proc`. (4) D-06 says the quit dialog "appears when a game is running", but the dialog today is gated on the download queue, the lock file and bridge hosting only, never on a running game; that is a behaviour change, not parity.

Prerequisite chain: plans 87-61 (shell `EngineLog`) and 87-63 (offline gate fix, edits `launcher.ts` and `bootstrap.ts`) are on disk, unexecuted. 88 should not start coding until both land; 87-64 (Winetricks on the game's own bottle) and 87-65 (CrossOver `shutdownWine`) change code 88 deletes or calls, and 87-62 changes the wine-manager shims 88 deletes. Details and a sequencing table are in "Phase 87 seams 88 consumes".

**Primary recommendation:** New crates `gamelib-knownfix` and `gamelib-launch` (with systeminfo going into `gamelib-info`); record every TS golden first (a new `launchOracle` harness reusing the 87 `engineWineOracle` tooling, with a pairwise generator in-repo); port in the order known-fixes, builders and prepare ops, command runner with the streaming shim, Game-class spawn and registry, funnel and single-flight, re-adoption, systeminfo, deletion; make the async ripple (all launcher call sites are already in `async` functions) rather than keeping sync twins, except for the five synchronous known-fix readers in `storeManagers/steam/*`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Launch funnel (single-flight, status, scripts, playtime, cleanup) | Rust crate `gamelib-launch` | TS manager via `ManagerHooks` callback until 91/92 | D-01/D-04: one owner for the table and the sequence |
| argv/env builders, wrappers, gamescope, known-fix env | Rust crate (pure functions) | TS shims (async) | Pure, vector-pinned; every caller is in an async function |
| Runner and wine process spawn (launch and non-launch) | Rust `gamelib-proc` (Game / Helper) | TS streaming shim for `onOutput`/`onSpawn` | D-02/D-05/D-21 |
| Running-game registry, kill, quit check | Rust `gamelib-launch` + `gamelib-proc` | TS quit handler reads via shim until 98 | D-06/D-07 |
| Re-adoption record and boot match | Rust shell boot (bounded task) | none | D-08/D-10 |
| Known-fix files, layering, remote fetch, overlays, report | Rust crate `gamelib-knownfix` | TS bridge shims (97), sync reader twin for Steam library code | D-03 |
| Per-game log writing | Rust `gamelib-log` (typed `LogTarget::Game`) | TS `LogWriter` facade used by managers | Already Rust since Phase 84 |
| Game settings, game info, global settings facts | TS (config 98, managers 91/92) | passed to Rust as facts | 87 pattern: `gatherGameCommandFacts` |
| System information (GPU, OS, memory, pci.ids caches) | Rust `gamelib-info` | TS shim for `getSystemInfo` channel until it is native | D-24, 82-STATE-OWNERSHIP |
| UI dialogs (askForceUninstall, errorHandler, launch aborted) | Rust shell (`dialogs.rs` seam) | none | Awaited answers need the shell's dialog |

## Phase 87 seams 88 consumes (state after the gap plans land)

Phase 87 is not closed. Its live gate (87-59) scored issues F1 to F5. Gap-closure plans 87-60 to 87-65 exist on disk, untracked and unexecuted [VERIFIED: `ls .planning/phases/87-engine-wine-and-tools/`: `87-60-PLAN.md` to `87-65-PLAN.md`, no `87-66` or later]. The 87-60 plan text names plans up to 87-69 (a gap build 87-68 and a re-run 87-69), which are not on disk. The planner for 88 must treat everything below as "will exist after", and gate on it.

### What the 87 gap plans change, and what 88 depends on

| Plan (wave) | Change | Files 88 shares | 88 dependency | Gate |
|-------------|--------|-----------------|---------------|------|
| 87-61 (w2, needs 87-60) | `ShellEngineLog` (`src-tauri/src/engine_log.rs`) implementing `gamelib_engine::sinks::EngineLog`; `build_ctx` calls `.with_log(...)`; `shell_log_at(level, msg)` in `main.rs`; redactor (home to `~`, account name, secret-shaped `key=value`, full args line to a count, URL query dropped, length cap) | `src-tauri/src/engine_dispatch.rs` (`build_ctx`), `main.rs` | **HARD for any 88 Rust code that writes through `ctx.log`**, and for the 88 live gate. Today `build_ctx` has no `with_log`, so every crate line (`[engine-notice]`, `Engine: downloading`, deadline, the offline warning) is dropped [VERIFIED: 87-61-PLAN.md truths; 87-HUMAN-UAT.md "Deferred gap"]. gamelib.log is uploaded to a public paste service, so 88's new log lines obey the `EngineLog` rule: "A line is fixed text (an op name, a short tag, a count); it never carries a URL, a query, a header, a token or a profile path" [VERIFIED: `gamelib-engine/src/sinks.rs:28-29`] | Start 88 coding after it lands; plan 0 of 88 re-reads `engine_log.rs` |
| 87-63 (w3, needs 87-60, 87-61, 87-64) | Finds and fixes why the offline refusal did not fire (F1). Touches `launch/step.rs`, `decision/preflight.rs`, `crossover/locate.rs`, `offline.rs`, `config.rs`, `engine_dispatch.rs`, **`src/backend/launcher.ts`, `launcher.engineStep.test.ts`, `sidecar/bootstrap.ts`** | `step.rs` (the funnel calls it in-process), `launcher.ts` (88 deletes it) | **HARD.** (a) 88's "offline" golden scenarios (D-14) record the engine step's answer; recorded before the fix they would encode the defect. (b) The Rust funnel reads online from `EngineCtx.online` (an `Arc<AtomicBool>` starting `false`, set by op `engine_set_online` as the TS monitor changes [VERIFIED: `gamelib-engine/src/ctx.rs:192-196`]); if 87-63's root cause is the TS request's `offline` value (its hypothesis H1) the Rust funnel must take the flag from the same source and treat `check-online` as offline. (c) Editing `launcher.ts` while 88 rewrites it invites rebase pain | Sequence 88 strictly after 87-63; carry its three-monitor-state guard cases into a Rust funnel test |
| 87-64 (w2, needs 87-60) | F3: Winetricks and `callTool` on a CrossOver per-game bottle use `WINEPREFIX` = the bottle directory and `CX_BOTTLE`; touches `wine_cmd/env.rs`, `tools/call_tool.rs`, `tool_settings.rs`, `winetricks/*`, `config.rs` | `wine_cmd/env.rs` (88 extends env builders), `winetricks/install.rs` (known-fix verbs) | **HARD for env-builder plans**: 88 adds to `wine_cmd/env.rs`; start those after 87-64. The `golden_winetricks` and `wine_env.json` expectations may be re-recorded; 88's known-fix winetricks scenario is recorded after | Same wave constraint |
| 87-65 (w2, needs 87-60) | `shutdownWine` in `utils.ts` routes the CrossOver bottle overlay to `killBottleWineServerWith` (op `engine_bottle_kill_wineserver`); edits `engineWineShimSchedule.test.ts` | `utils.ts`, the shim schedule test | Soft. `shutdownWine` has four manager callers (`stop()` of legendary, gog, nile, sideload) and is not in CONTEXT's 88 `utils.ts` list: see Open Question 4 | Land before 88 edits `utils.ts` |
| 87-62 (w2, needs 87-60) | F2/F4: wine-manager arg decoder accepts a never-installed entry; list refresh after install/remove; touches `wine_dispatch.rs`, `store_native.rs`, `manager/*`, `tauriTransport.ts`, `WineManager/index.tsx` | `enginewine/wineManager.ts` shims (rows `deletedBy: 88`) | Soft. 88 deletes three wine-manager shim rows; `golden_wine_manager` may be re-recorded | Land first, no ordering inside 88 |
| 87-60 (w1) | Authors the re-run UAT contract and six todos; no code | none | none, but 88 reads its "Kept from 87-59" results | none |
| F5 (no UI route removes a per-game bottle) | No plan on disk | none | none (UI route, not launch code) | none |

Other 87 gate observations that touch launch code, none with a plan on disk: Isaac relaunches exited about 1 s after the wine command four times on CrossOver (`launcher exited before any game process matched`) while CrossOver's own `wine cmd /c` in the same bottle worked, unexplained and possibly one pattern with Trash Goblin's first CrossOver launch [VERIFIED: 87-HUMAN-UAT.md "Non-gate observations"]. 88's live gate item 1 (CrossOver title) can hit the same symptom; it is a todo, not an 88 finding, unless it reproduces with Rust spawns. Also: `Stop` on a Steam bridge title logs `Aborting not possible. Could not find a matching abort controller for 206060` (`aborthandler.ts:44`), a todo; the abort registry is not 88's.

### The 87 API 88 calls in-process (read this session)

- `gamelib_engine::launch::step::select_engine_for_launch(ctx: &EngineCtx, deps: &dyn StepDeps, args: &SelectArgs) -> SelectReply` [VERIFIED: `launch/step.rs:410`]. `SelectArgs` is `{runner, app_name, title, install_path, platform, is_native, settings: Value, offline, purpose}` and `SelectReply { kind: Skip|Legacy|Use|Refused, key, selection, prefix, log_lines, launch_settings }` [VERIFIED: `step.rs:99-185`]. Production deps are `CtxStepDeps`. `arm_engine_launch_deadline` and `end_engine_launch(ctx, key)` are the arm and release (`step.rs:830`, `:904`).
- `EngineCtx` fields the funnel reuses: `launch: LaunchState` (ledger bottle, deadlines, watchers), `registry` (selection per key), `launch_settings`, `online`, `proc: SpecProcRunner` (Helper), `fetch: Fetch`, `emitter`, `ui: EngineUi`, `paths: EnginePaths`, and after 87-61 `log` [VERIFIED: `ctx.rs`, `launch/mod.rs`, `engine_dispatch.rs:build_ctx`]. The shell stores the one shared context in `ENGINE_CTX` (set in `install` from `run_setup`, after the store host opens; skipped when there is no home directory) [VERIFIED: `engine_dispatch.rs` `install`].
- The wine command core: `gamelib_wine::wine_cmd::{env::setup_env_vars, env::build_wine_env_vars, command::run_wine_command, prefix::verify_wine_prefix, valid::valid_wine}` and `umu_path`/`umu_supported` (`command.rs`). Its module header says "A launched game's wine is not spawned here (Phase 88): the launch path owns its log writer, its tracked registry and its exit handling" [VERIFIED: `wine_cmd/command.rs` header]. `deltas.json` records three accepted differences 88 now closes: output is returned once at the end instead of streamed to `logWriters`/`onOutput` with a `Wine Command: ...` header; `trackKey` and `resolveOnExit` accepted and ignored [VERIFIED: `golden/wine_command/deltas.json` keys `chunked-output-and-log-writers`, `command-parts-not-mutated`, `track-and-resolve-on`].
- The TS twins 88 deletes (`setupEnvVars`, `setupWineEnvVars`, `createCommandRunner`) are pinned to the Rust goldens by one oracle test, `src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts` (16 `wine_command` cases, MANIFEST floor 16; 40 env vectors; 14 `validWine` vectors). The harness it uses (`testUtils/engineWineOracle/`) "is deleted with these twins' vector test in Phase 88" [VERIFIED: `harness.ts` header]. **88 reuses that harness for its own goldens first and deletes it only in the last plan.**

### The 13 shim-schedule rows that say `deletedBy: 88`

[VERIFIED: parse of `src/backend/__tests__/engineWineShimSchedule.test.ts`: 13 rows]. Rows and the callers that block deletion today:

| Row (file) | Shape | Importers beyond the launcher | Consequence |
|------------|-------|------------------------------|-------------|
| `isRuntimeInstalled`, `downloadRuntime` (`enginewine/runtimes.ts`) | shim | launcher only | deletable in 88 |
| `installWineVersion`, `listWineReleases`, `wineReleasesInfoReady` (`enginewine/wineManager.ts`) | shim | `sidecar/engineWineResolvers.ts`, `utils.ts` (`downloadDefaultWine`) | `utils.ts`'s default-wine download must move to Rust with `checkWineBeforeLaunch` (Open Question 4) |
| `validWine` (`enginewine/wineCore.ts`) | shim | `bootstrap.ts` (command-runner binding, deleted), `utils.ts` (`checkWineBeforeLaunch`) | same |
| `armEngineLaunchDeadline` (`enginewine/launch.ts`) | shim | `launchEngineStep.ts`, `appShellFlowRegistration.ts`, `gog/setup.ts`, `nile/setup.ts` import the file | the arm moves into the Rust funnel; the row is the launcher's only |
| `dxvkInstallRemove`, `winetricksInstallVerbs`, `winetricksListInstalled` (`enginewine/tools.ts`) | shim | `storeManagers/steam/bridgeKnownFixes.ts` (97) | **stale `deletedBy`**: the bridge still imports them; re-schedule to 97 or move the bridge to the Rust known-fix shim first (the schedule test compares by file and name) |
| `setupEnvVars`, `setupWineEnvVars` (`launcher.ts`), `createCommandRunner` (`commandRunner.ts`) | twin | `services/types.ts`, `bootstrap.ts`, `storeManagers/index.ts` | deleted with their files; the vectors test goes with them |

The planner needs a Wave-0 task that re-reads the schedule test and either re-schedules or deletes each row in the same commit that removes its last caller (the schedule test checks both directions).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-proc` (in repo) | 0.x workspace | `spawn_game` (Game), `spawn_helper_tokio` (Helper), `SpecProcRunner`, `probe::{is_alive,start_time}`, `kill_tree::{terminate_group, kill_process_group}` | D-21; the only allowed spawn path |
| `gamelib-engine`, `gamelib-wine` (in repo) | workspace | engine step, wine env builders, wine command core, umu | 87 D-22: 88 extends, never re-ports |
| `gamelib-log` (in repo) | workspace | per-game log via `LogTarget::Game { app_name, runner, kind }` and `TargetBatch` | Per-game logs are already Rust-written (Phase 84) [VERIFIED: `gamelib-core/src/paths.rs:170-179`, `gamelib-log/src/writer.rs:94-98`] |
| `gamelib-store` (in repo) | workspace | `tsStore` playtime keys, `runsForMe` store, fetched-fixes cache | Rust is the only disk writer since 85 |
| `gamelib-safety` (in repo) | workspace | guarded deletes (overlay removal, record removal) | 82 destructive-path rules |
| `gamelib-info` (in repo) | workspace | `info_recent_add`, anti-cheat info, umu; home for the systeminfo port | 86 leaf crate; already holds caches and `reqwest` |
| `serde` / `serde_json` | 1.0.151 (lock) | typed op args (`deny_unknown_fields`), byte-compatible JSON | schema authority is the serde struct (D-19) |
| `tokio` / `tokio-util` | 1.54.1 / 0.7 (lock) | async funnel, `CancellationToken` | one runtime |
| `reqwest` via `gamelib_engine::fetch::Fetch` | 0.13.4 (lock) | known-fixes fetch, overlay archive download | the existing seam (`ReqwestFetch`, `Replay` in tests) [VERIFIED: `fetch.rs:214-231`] |
| `sha2` | 0.10.9 (lock) | overlay archive sha256 pin | already locked |
| `flate2` | 1.1.9 (lock) | overlay `tar.gz` gunzip/gzip | already locked; the ustar reader/writer is own code (strict, deterministic) |
| `shlex` | 2.0.1 (lock, transitive; add as a direct dep) | `shlex.split`/`join` of wrapper args | the npm module in use is `shlex ^2.1.2` [VERIFIED: `package.json:146`]; edge-case parity needs vectors (A2) |
| `libc` / `windows-sys` | 0.2.186 / 0.61 (proc's pins) | Windows `GetProcessTimes`, Job without kill-on-close, `setsid` | proc already depends on both |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gamelib-testutil` `FakeHome` | workspace | fake HOME for every spawn test | D-22 |
| `gamelib-i18n` | workspace | dialog strings (`box.error.launchAborted`, `box.error.folder-not-found.title`, etc.) | funnel dialogs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `gamelib-launch` and `gamelib-knownfix` crates | launch modules inside `gamelib-wine` | `gamelib-wine` is already a large crate (wine manager, tools, winetricks, runtimes); 91's Rust legendary manager must call the funnel in-process, and a launch crate depending on `engine <- wine` keeps 87 D-04's one-way rule while giving 91/92 a clean dependency |
| Own in-repo pairwise generator (about 60 lines, with a coverage assertion) | an npm pairwise package | a new npm dependency discovered by search would be `[ASSUMED]` and needs a legitimacy check; the generator is trivial and the assertion proves coverage |
| `tar` crate for the overlay archive | own ustar reader/writer | the TS reader accepts only regular files whose paths are exactly an expected set, and the writer must be deterministic byte-for-byte; the `tar` crate's unpack API does not enforce that |
| `which` crate | `gamelib_wine::wine_cmd::command::find_on_path` pattern | `which` is not in `Cargo.lock`; the PATH scan already exists |

**Installation:** no new third-party crate enters the lockfile (shlex, flate2, sha2, libc, windows-sys, reqwest, serde_json, tokio are locked). Add the new workspace crates to the explicit `-p` list in `.github/workflows/rust-test.yml` (workspace crates are not default members) [VERIFIED: `crates/README.md` section 8].

**Version verification:** versions above are the `Cargo.lock` entries read this session. Registry verdicts: `gsd-tools query package-legitimacy check --ecosystem crates shlex which flate2 tar libc windows-sys sha2` returned `OK` for all seven.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| shlex | crates.io | first published 2015 | 30.1M/wk | github.com/comex/rust-shlex | [OK] | Approved (already in lock) |
| flate2 | crates.io | 2014 | 19.4M/wk | github.com/rust-lang/flate2-rs | [OK] | Approved (already in lock) |
| sha2 | crates.io | long-lived | 32.2M/wk | RustCrypto | [OK] | Approved (already in lock) |
| libc | crates.io | long-lived | 40.1M/wk | rust-lang/libc | [OK] | Approved (already in lock) |
| windows-sys | crates.io | long-lived | 42.0M/wk | microsoft/windows-rs | [OK] | Approved (already in lock) |
| tar | crates.io | long-lived | 6.6M/wk | alexcrichton/tar-rs | [OK] | Not used (own strict reader) |
| which | crates.io | 2015 | 7.0M/wk | github.com/harryfei/which-rs | [OK] | Not used (not in lock; PATH scan exists) |

**Packages removed due to [SLOP] verdict:** none. **Packages flagged [SUS]:** none. No npm package is added.

## Architecture Patterns

### System Architecture Diagram

```
 renderer ──Play──▶ sidecar `launch` handler (steamFlowRegistration.ts, TS until 90)
                      │ non-Steam runner
                      ▼
        TS shim  launcher.launchEventCallback(params)  ──rustInvoke(unbounded)──▶ op launch_run
                                                                          │
              ┌───────────────────────── Rust: gamelib-launch funnel ─────┴──────────────────────┐
              │ 1 single-flight table (runner:appName): join ─▶ await leader's result            │
              │ 2 facts ◀── ManagerHooks.facts() (gameInfo, game settings, isNative, global cfg) │  ◀── TS manager (until 91/92)
              │ 3 askForceUninstall / saves-down (hook) / status 'launching' / hide / wake-lock  │
              │ 4 open per-game log (gamelib-log LogTarget::Game, rotate once) + header lines    │
              │ 5 engine step  ──▶ gamelib-engine select_engine_for_launch(ctx) (in-process)     │
              │ 6 wine check (checkWineBeforeLaunch port) ─▶ pre-script (Helper) ─▶ status       │
              │ 7 ManagerHooks.launch(logHandle, args) ─────────────────────────────▶ TS manager launch()
              │        TS builds the runner command via async shims:                              │
              │        prepare_launch / prepare_wine_launch / setup_* / known-fix readers (Rust)  │
              │        then shim callRunner / runWineCommand ──rustInvoke(stream)──▶ runner::call │
              │ 8 runner::call (Game class) ─▶ spawn_game(cmd, capture file) ─▶ record + registry │
              │        Rust tails capture file ─▶ per-game log, `onOutput` frames to the shim     │
              │ 9 exit ─▶ result ─▶ post-script ─▶ release engine ─▶ playtime/tsStore/runsForMe  │
              │        ─▶ GOG playtime (hook) ─▶ recent game ─▶ saves-up (hook) ─▶ 'done'         │
              └──────────────────────────────────────────────────────────────────────────────────┘
 boot: re-adoption task (bounded, Registrant) reads records ─▶ matches pid+start_time ─▶ registry (Playing)
 quit: TS quitHandler ─▶ shim ─▶ registry.is_game_running() ─▶ dialog ─▶ Yes ─▶ registry.kill_all (explicit tree kill)
```

### Recommended Project Structure
```
src-tauri/crates/
├── gamelib-knownfix/        # reader+layers, registry fixes, overlays env/install/archive, fetcher, report, launch overrides
├── gamelib-launch/
│   ├── src/builders/        # env.rs (extends wine_cmd), wrappers.rs, gamescope.rs, prepare.rs (prepare_launch, prepare_wine_launch)
│   ├── src/runner/          # call_runner.rs, redact.rs, script.rs, get_wine_path.rs, error_handler.rs, stream.rs
│   ├── src/game/            # spawn.rs (Game class + capture file), registry.rs, kill.rs, record.rs, readopt.rs
│   ├── src/funnel/          # single_flight.rs, hooks.rs (ManagerHooks), run.rs, playtime.rs, check_wine.rs
│   └── tests/               # golden_*.rs replays, stub_game.rs smoke, incidents_*.rs
├── gamelib-info/src/sysinfo/ # gpu (pci_ids caches), os, memory (UTILS inventory: pci_ids rows go to 88)
└── gamelib-proc/            # + windows game job, start_time on Windows, game tree kill (see Pitfall 3)
src-tauri/src/launch_dispatch.rs   # glue: ops, ManagerHooks over the sidecar, quit hook, boot task
src/backend/launchOracle/          # the new TS recorder (reuses testUtils/engineWineOracle), deleted in the last plan
```

(Directory names are discretion; D-01 only fixes the ownership.)

### Pattern 1: Funnel over a `ManagerHooks` trait (recommended; resolves the Rust-to-TS problem)

**What:** The funnel is a Rust `async fn run_launch(deps, params, hooks: &dyn ManagerHooks)`. `ManagerHooks` is the exact set of manager-owned calls the TS funnel makes today: `facts(runner, app) -> {gameInfo, gameSettings, isNative, title, installPath, platform, canRunOffline, thirdPartyManagedApp, ...}`, `launch(logHandle, launchArguments, args, skipVersionCheck) -> bool`, `sync_saves(direction, savesPath, gogSaves)`, `update_gog_playtime(start, end)`, `set_presence`, `clear_presence`, `persist_bottle_wine_version`, `force_uninstall`. The shell implements it by `SidecarState::invoke("launchManagerCall", [op, args])` into one sidecar-registered handler; 91/92 replace each runner's implementation with in-process Rust, and the registered channel is deleted in 92.
**When to use:** always for D-01. It keeps the funnel testable with a fake `ManagerHooks` and makes 91/92 a drop-in.
**Why a decision is needed:** the milestone research lists "Rust calling into TS for settings/state" as an anti-pattern [VERIFIED: `research/v0.11/SUMMARY.md` "Anti-patterns"]. The funnel has no way around it while the managers are TS, because `game.launch(...)` must run in TS. The TS-driven alternative (a TS shim that sequences `launch_begin`, `game.launch`, `launch_end`) keeps the choreography in TS and breaks D-01/D-25. Whichever is chosen is a "costly" reversibility item; make it the first plan's checkpoint.
**Transport facts to design around** [all VERIFIED this session]:
- Rust to sidecar invoke exists: `SidecarState::invoke(channel, args)` blocks for the reply, bounded by `timeout_for(channel)` = `INVOKE_TIMEOUT` unless the channel is in `LONG_RUNNING_CHANNELS` (`main.rs:447-459`). A `launch` hook spans a whole play session, so its channel goes in `LONG_RUNNING_CHANNELS`, and the blocked thread must be a dedicated thread (not the shared blocking pool).
- The reverse leg (sidecar to Rust `rustInvoke`) is bounded to `RUST_INVOKE_TIMEOUT_MS = 60_000` unless the channel is in `UNBOUNDED_RUST_CHANNELS` (`sidecarRpc.ts:110`, `:707`). `runner_call` for a launch, and every streaming runner call, joins that list (precedent: `depot_job_run`).
- On sidecar EOF the shell's `drain_pending_invokes` fails every pending invoke with `sidecar closed before responding` (`main.rs:380-405`). A funnel parked in `ManagerHooks.launch` then gets an error while the game, a Game-class process, keeps running: that is exactly the re-adoption case, so the funnel must hand the session to the same exit watch re-adoption uses instead of reporting a launch failure.
- Other precedent for Rust asking TS: `invoke_until` (depot poll host) and the `kind: "send"` frame (`engineSelectionChanged`).
- Single-flight must run before the first `await`/callback (WR-03: "a plain (non-async) arrow so the in-flight check precedes runLaunchEventCallback's first await" [VERIFIED: `launcher.ts:507-510`]).

### Pattern 2: Pure builders as async shims with golden vectors
`setupEnvVars`, `setupWrapperEnvVars`, `setupWineEnvVars`, `setupWrappers`, `getKnownFixesEnvVariables` are synchronous today. **Every call site is inside an `async` function** [VERIFIED by reading: `legendary/games.ts:960` (async `launch`), `gog/games.ts:694-713`, `storeManagerCommon/games.ts:171-190` (`launchGame` async), `save_sync.ts:80-100` (awaits at 82 and 100); nile `launch` awaits `prepareLaunch` at `nile/games.ts:363`], and the object-spread sites become `...(await shim(...))`. So the ripple is mechanical: make the five shims async and delete the TS twins. The sync-twin escape (87 D-24) is only needed for the known-fix **readers** called synchronously by Steam library code (Pattern 5). Count of call sites to touch: `setupEnvVars` x5 (legendary, gog, nile, storeManagerCommon, plus the commandRunner binding that dies), `setupWrapperEnvVars` x4, `setupWrappers` x4, `getKnownFixesEnvVariables` x4, `setupWineEnvVars` x1 outside the runner (`save_sync.ts:100`), `verifyWinePrefix` x3 (`save_sync.ts:83`, `gog/setup.ts:211`, `nile/setup.ts:168`) [VERIFIED: grep of `launcher\.` call sites]. The `ManagerDeps.launcher` type and `createLauncher` shrink to those shims plus `launchEventCallback` and `requestRustInvoke`.

### Pattern 3: Command runner as Rust ops with a streaming shim
`callRunner`, `runWineCommand`, `getWinePath`, `runScriptForGame` are Rust ops. The shim keeps `commandRunner`'s TS signatures so the ~30 call sites do not change. Contract (derived from `CallRunnerOptions`, `commandRunner.ts`, and the callers) [VERIFIED: `common/types.ts:551-574`]:
- Options that cannot cross the boundary and how the shim handles them: `onOutput(chunk, child)` (the shim holds a `streamId` to callback map; Rust sends ordered `runnerOutput` frames to a sidecar `ipc.on` listener); `logWriters` (TS `LogWriter` objects: the shim forwards their `target` so Rust writes the same targets, or keeps writing from the chunk callback; decide per caller); `logSanitizer` (function: only used by a few; apply in the shim's chunk path or port the named sanitizers); `onSpawn(child)` and `child.kill()` (shim returns a handle `{pid, kill}` driven by a `spawned` frame and a `runner_kill(spawnId)` op; used by registry fixes (`knownFixesRegistry.ts:591`), `bridgeKnownFixes.ts:245`, `launchWithoutSteam.ts:89`).
- Ordering: chunks and the reply both travel on the sidecar's stdin pipe in write order under one lock (`write_raw`), so every `runnerOutput` frame precedes the invoke reply if Rust writes them in order [VERIFIED: `shell_state.rs` `write_raw`/`write_frame`]. Test it with a transcript replay (D-14 asks for "streamed line sequence").
- The in-flight dedup (`commandsRunning` keyed `runner + commandParts`, a caller with `onOutput` neither joins nor registers) and abort-by-id (`aborts.create(abortId)`, `AbortController` to cancel) become Rust-side tables.
- Result contract: `ExecResult { stdout, stderr, fullCommand, error?, abort? }` where `stdout` is the last 50 chunks joined (see Pitfall 6).
- `errorHandler` and `askForceUninstall` need `libraryManagers[runner].getGame(appName).forceUninstall()` (TS, `ManagerHooks`) and a dialog; the regexes (`legendary.*\.py`, `No saved credentials`, `appears to be deleted`, the ignore list) and the i18n keys port as-is.
- `getRunnerCallWithoutCredentials` redaction (exact-element match for eight flags, the PowerShell `-ArgumentList` branch, env diff against `process.env`) becomes a Rust function with the TS tests as vectors.

### Pattern 4: Game-class spawn with a private capture file
`spawn_game(cmd, log: Option<&Path>)` opens `log` for append and hands it to the child as stdout and stderr; stdin is null; unix `setsid`; no Job; never registered [VERIFIED: `gamelib-proc/src/spawn.rs:109-143`]. Use a **private per-launch capture file** (for example `<launches>/<runner>-<appName>.out`, mode 0600) as `log`, and tail it from Rust: each new chunk is (a) written to the per-game log as a raw entry (`Entry::Raw`), (b) framed to the TS shim's `onOutput`, (c) kept in the bounded buffer the legendary login-failure classifier reads. Reasons it beats writing the game's output straight into the per-game log file: the Rust log writer rotates the file on the launch's first batch asynchronously, and a handle the game opened before the rename would write into `.old`; and the per-game log is silent when `verboseLogs` is off while the classifier still needs the text. A capture file also makes D-09 a choice: after a crash the file still exists and still grows, so a re-adopted game's log capture could resume from the recorded offset (CONTEXT's Deferred Ideas explicitly allows revisiting "if a later phase routes game output through a file the game writes itself"). Respect D-09 as locked (write the "re-adopted" line, do not tail) and file the resume as an optional todo.

### Pattern 5: Known-fix readers have synchronous Steam callers
`readKnownFixes`/`readKnownFixProfile` are synchronous file reads. Synchronous consumers outside 88: `drmKnownFix.ts:22` (`knownFixSaysCeg`), `macArchKnownFix.ts:40,167` (`knownFixSaysMac32`, a mac-arch lookup) and `listKnownFixMac32AppIds` (walks three layers, hands the list to the Rust Refresh as data), `gameLaunchOverlay.ts:67`, `sharedRedistInstall.ts:572`, and four sites in `bridgeKnownFixes.ts` (111, 208, 209, 443) [VERIFIED: grep]. Async-rippling them reaches Steam library/install code owned by 89/90. Recommended: keep ONE sync TS reader twin (`readKnownFixes`, `readKnownFixProfile`, `filterTier1KnownFixes`, about 150 lines) pinned to the Rust reader by shared vectors (87 D-24 shape), scheduled `deletedBy` the phase that moves its last sync caller (89 for macArch, 97 for the bridge), and make everything else (launcher, the legendary/gog/nile `readKnownFixLaunchOverrides` call sites, `getKnownFixes`/`getGamelibFixStatus` channels) Rust. `listKnownFixMac32AppIds` is an obvious 89 candidate to call the Rust reader in-process.

### Anti-Patterns to Avoid
- **Reading the game's output through a pipe from a Game-class child.** `spawn_game` forbids it (SIGPIPE if the reader dies, "Pitfall 5"); do not add a pipe variant to `gamelib-proc`.
- **Porting `launchEventCallback` as a TS-sequenced shim and calling it "owned by Rust".** It leaves the choreography in TS and fails D-25's end state.
- **Letting the Rust writer and a TS `LogWriter` each claim the per-game log rotation.** The TS `LogWriter` sends `rotate: true` on its first accepted entry [VERIFIED: `targetWriter.ts` header "the first accepted entry of each non-general writer instance carries `rotate: true`"]. Two writers for one launch rotate twice and drop the funnel's header lines. The `LogWriter` facade handed to a manager must be constructed with rotation already claimed (or the funnel writes only after the facade's first batch).
- **Fixing a quirk inside a golden-parity plan** (D-20): file the todo, keep the diff clean.
- **Recording goldens from the Rust side or hand-typing expected bytes.** `GAMELIB_WRITE_ENGINE_GOLDEN=1` writes from TS; compare mode is the default [VERIFIED: `harness.ts` header].

## TS inventory being ported, callers, and what must be deleted

Line numbers below are the current ones; CONTEXT's (`prepareLaunch` 696, `prepareWineLaunch` 922, ...) are stale because 87 edited `launcher.ts` (now 1733 lines). [VERIFIED: `wc -l` and reads]

### `launcher.ts` (1733 lines)

| Piece | Lines | What it does that a port must reproduce | Notes |
|-------|-------|------------------------------------------|-------|
| `runLaunchEventCallback` | 185-505 | folder-missing `askForceUninstall` then `{status:'abort'}`; read settings once (before the engine step); `lastUsedLaunchOption` default; `firstPlayed` on first launch; saves-down when `autoSyncSaves` and online; status `launching`; hide window (`minimizeOnLaunch && (isMac || !noTrayIcon)`); display wake lock once per launcher; per-game log writer with the two forced "Logs are disabled" warnings when `verboseLogs` is off; engine step (refused: `done`, close log, abort); `checkWineBeforeLaunch` only when `!isNative && !engineControlled`; pre-script; status `launching`; `launchedAt = Date.now()`; `game.launch`; `setPresence`; `.catch` logs and writes the exception to the game log; `.finally` runs the after-script, closes the log, releases the engine; `recordPlaySession` unless `playtimeTrackedExternally`; `clearPresence`; stop wake lock; `lastPlayed`, `totalPlayed` (floor of minutes since `startPlayingDate`, which precedes pre-launch work); GOG playtime post unless `disablePlaytimeSync`; `addRecentGame` (a rejection is logged, the launch still finishes, CR-41); saves-up (`done` then `syncing-saves`); `done`; `isCLINoGui` then `appState.exit()`; result `done`/`error` | the playtime keys are `${appName}.firstPlayed`, `.lastPlayed`, `.totalPlayed` in `stores.kvs.tsStore` [VERIFIED: 221-222, 441-447] |
| `launchEventCallback` (single-flight wrapper) | 511-525 | `singleFlightLaunch(runner, appName, onJoin, run)`; a joiner logs `Launch of ... already in progress; joining it (WR-03)` and gets the leader's promise | 5 tests in `launcher_launchSingleFlight.test.ts`, 5 in `launchSingleFlight.test.ts` |
| `filterGameSettingsForLog` | 527-676 | per-platform deletion of irrelevant keys; its JSON appears in the per-game log (`Game Settings:`) | log-text parity, goldened as a transcript |
| `prepareLaunch` | 678-873 | `offlineMode = settings.offlineMode \|\| !isOnline`; Epic service check for legendary; `resolveOfflineMode` hook; Discord RPC (deleted by operator decision); log lines (Launching, Native?, Installed in / third-party, System Info, Game Settings, anti-cheat status lines); Linux-only: mangohud (`--dlsym`), gamemode, gamescope (help probe 5 s, forms by `-F, --filter` presence); umu runtime download | returns `{success, failureReason?, rpcClient?, mangoHudCommand?, gameModeBin?, gameScopeCommand?, offlineMode?}` |
| `getCrossoverBottleFolder` | 876-902 | `wine --bottle <b> --verbose whoami` and a regex over stderr (`WINEPREFIX = "(.*)"\n`) | a spawn the goldens must record |
| `prepareWineLaunch` | 904-1178 | settings overlay, `validWine` (then default wine), CrossOver bottle existence dialog, Winetricks list log line, EOS overlay status (Linux), offline-not-supported warning, `verifyWinePrefix`, `installed_games` file in the prefix or bottle, `installFixes` when updated, tier-2 registry fixes every launch, tier-2 overlays env merged last, GOG `GalaxyCommunication` dummy install (`getWinePath`, copy, `sc create`), DXVK/NVAPI/VKD3D auto-install, EAC and BattlEye runtime downloads, `setupWineEnvVars`, deadline arm | returns `{success, failureReason?, envVars?, knownFixEnv?}` |
| `installFixes` | 1180-1236 | `winetricks` verbs, then `runInPrefix` programs through `runWineCommandForGame` | uses 87 shims |
| `setupEnvVars` | 1253-1284 | `nvidiaPrime` triple, mac `MTL_HUD_ENABLED`, Linux `STEAM_COMPAT_INSTALL_PATH`, `enviromentOptions` with `removeQuoteIfNecessary`, `LD_PRELOAD=''` default | a `process.env.LD_PRELOAD` read |
| `setupWrapperEnvVars` | 1300-1310 | `HEROIC_APP_NAME`, `HEROIC_APP_RUNNER`, `GAMEID=umu-0`, per-store `HEROIC_APP_SOURCE`/`STORE` | |
| `setupWineEnvVars` | 1318-1536 | already ported (`build_wine_env_vars`); the TS twin is deleted | vectors exist (`wine_env.json`) |
| `setupWrappers` | 1538-1564 | gamescope first, then user wrappers (`shlex.split`), mangohud only when gamescope is empty, gamemode last | |
| `verifyWinePrefix` | 1571-1619 | already ported (`verify_wine_prefix`); the TS twin goes | |
| scripts, `launchCleanup`, `createLauncher` | 1621-1733 | `runBeforeLaunchScript`/`runAfterLaunchScript` write `Running script before|after <title> (<path>)\n` then `runScriptForGame` | |

### `commandRunner.ts` (748 lines) and friends

- `createCommandRunner` (248): `runWineCommand` (253, already in `run_wine_command`), `callRunner` (416), `getWinePath` (645), `runScriptForGame` (696: env block `HEROIC_GAME_APP_NAME`, `HEROIC_GAME_EXEC`, `HEROIC_GAME_PREFIX`, `HEROIC_GAME_RUNNER`, `HEROIC_GAME_SCRIPT_STAGE`, `HEROIC_GAME_TITLE`, `HEROIC_GAME_SETTINGS` and `HEROIC_GAME_INFO` as JSON, then `...process.env`; `resolveOn: 'exit'`; cwd the install path; output forwarded only when `verboseLogs`) [VERIFIED: 696-745]. `getRunnerCallWithoutCredentials` (167). Tests: 70 in `commandRunner.test.ts`.
- `spawnAsync.ts` (114): a generic helper (`cwd`, `env`, `timeout`, `signal`, `windowsHide`; the result is the last 50 chunks) used by 25 non-test files including many Steam bridge files. It becomes a Rust Helper op with the same streaming shim, scheduled to the phase that removes its last Steam caller.
- `gamescopeCommand.ts` (89): `buildGameScopeCommand` is pure; `probeGamescopeHelp` runs `gamescope --help` with a 5 s timeout and degrades to `''` (the old-CLI flag set) on timeout or error [VERIFIED: `gamescopeCommand.ts:80-88`]. 11 tests.
- `launchSingleFlight.ts` (56), `launchEngineStep.ts` (106, the TS narrowing of the 87 reply: dies when the funnel calls the engine step in-process; the setup runs of gog/nile keep using `selectEngineForLaunch` through `enginewine/launch.ts` until 92), `quitHandler.ts` (104, stays until 98; only its `isRunning`/`killAllTracked` inputs change).
- `process/` (TS `ProcessRunner`, tracked registry, 391-line `runner.ts`) **stays**: 20+ non-test files outside 88 call `runner.run` (Steam probes, `utils.ts` probes, shortcuts, `knownFolders`), and comet and the bridge helper use `spawnLongLived`. CONTEXT lists it only as context. Its `killTracked({runner,key})` callers in the four managers' `stop()` (legendary 1220, nile 668, sideload 127/130) and `steam/games.ts:641` need a Rust kill shim for tracked launches.

### Known-fixes modules (about 2.4k lines) and where their data lives

| Module (lines) | Data and behaviour to port | Paths and formats |
|----------------|----------------------------|-------------------|
| `knownFixes` (454) | tier-1 `<id>-<store>.json` with an allow-list of 12 keys (`title, notes, winetricks, runInPrefix, envVariables, wikiLink, launchNotice, macArch, drm, launchArgs, exeOverride, steamGameOverlay`); layers local > bundled > remote, first parsed object wins whole-file; tier-2 `<id>-<store>.profile.json` local > bundled only, never remote; `readGamelibFixStatus`; `isValidExeOverrideShape` | `fixesPath = <appFolder>/fixes`, `localFixesPath = <fixesPath>/local`, `knownFixOverlaysPath = <appFolder>/overlays`, `bundledFixesPath = <publicDir>/fixes` [VERIFIED: `process/appPaths.ts:130-173`]; the bundled dir has 10 files today (`ls public/fixes`) |
| `knownFixesFetcher` (179) | GameLib feed first (`https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main`), Heroic's feed only on a 404 and only for legendary/gog/nile; any indeterminate answer (network error, timeout, 5xx, 403, malformed) writes and deletes nothing; a stale downloaded file is deleted only when every applicable source answers 404; bodies filtered at write and at read; 10 s timeout [VERIFIED: file header and `defaultGet`] | callers: `downloadmanager/utils.ts:561` (install time, 93) |
| `knownFixesRegistry` (607) | tier-2 `registry` and `dllOverrides`: `reg add /f` through `runWineCommand`, values already present in `system.reg`/`user.reg` skipped (same type and data), 15 s per fix, `AppDefaults\<exe>\DllOverrides`, views `[64]` | uses `runWineCommand` with `onSpawn` kill on timeout |
| `knownFixOverlays` (256), `knownFixOverlayInstall` (326), `knownFixOverlayArchive` (188) | tier-2 `overlays` (max 8 entries, ids `^[a-z0-9][a-z0-9.-]{0,63}$`), catalogue in `common/knownFixOverlayCatalogue.ts` (140 lines, TS data: id, url, sha256s), sha256-pinned 120 s download, deterministic ustar+gzip writer, strict reader (regular files, exact path set, no `..`, ASCII, 99-byte names), extraction in-process (no `tar` spawn), `GST_PLUGIN_PATH` append, darwin + CrossOver only | `<overlays>/<id>/...`; the catalogue becomes a shared JSON like `common/enginePins.json` |
| `knownFixLaunch` (107) | `launchArgs`, `exeOverride` realpath containment inside the realpath'd install path, regular file, failures warn and keep the default exe | 10 tests |
| `knownFixReport` (264) | opt-in report client to `https://gamelib-fix-relay.gamelib.workers.dev/v1/reports`, 8 s timeout, one-shot, `common/knownFixReport.ts` (87 lines) pairs/versions | callers: `bridgeInstallState.ts` (90), `steam/library/macArch.ts` (89) |

Consumers outside the launcher (every one needs a Rust entry point and a shim row): `downloadmanager/utils.ts` (`fetchRemoteKnownFixes`, 93), `sidecar/enrichmentFlowRegistration.ts` (the `getKnownFixes` and `getGamelibFixStatus` renderer channels, **become native channels**), `storeManagers/steam/{gameLaunchOverlay,bridgeKnownFixes,drmKnownFix,macArchKnownFix,bridgeInstallState,library/macArch,bridge/sharedRedistInstall,bridge/drm/steamclientLayerInstall}.ts`, and the three runner managers' `readKnownFixLaunchOverrides` (sync today). `readOverlayTarGz` is also called by `steamclientLayerInstall.ts` (97).

### Channels and registrations to delete or convert (the 88 share)

| Surface | Today | After 88 |
|---------|-------|----------|
| `getKnownFixes`, `getGamelibFixStatus` (`enrichment.ts` zod, `enrichmentFlowRegistration.ts`) | sidecar handlers | native channels in `nativeChannels.json` (Rust serde struct is the schema; the zod entry and the registration are deleted; regenerate `ipcSchemaSnapshot.json` and `ipc_contract.rs` with `pnpm gen:ipc-contract`, guarded by `pnpm check:ipc-contract`) |
| `getSystemInfo` (`settings.ts`, `settingsFlowRegistration.ts:258`), `copySystemInfoToClipboard` (`clipboard.ts`) | sidecar handlers over `infoCaches.systemInfo` | native; the system-info cache and `pci_ids_*` caches move to `gamelib-info` (D-24 row amendment) |
| `launch` | `steamFlowRegistration.ts:499`, a shared Steam/non-Steam handler | stays TS until 90; the non-Steam arm calls the `launchEventCallback` shim. One channel, one owner (D-19): do not split it in 88 |
| Boot steps in `sidecar/bootstrap.ts` | `command-runner`, `app-runtime` (launch flights), `abort-registry` (window raiser), `store-managers` (launcher), `info-caches` (systemInfo) | lose their launch pieces; `createStores`/`services/types.ts` lose `createPciIdCaches` |
| Sidecar to Rust op channels | none for these yet | new `RUST_LAUNCH_*` constants in `sidecarTransport.ts`, request schemas in `ipc/rustInvoke.ts`, arms in `rust_dispatch.rs`, generated `ipc_contract.rs`; every long-lived op goes in `UNBOUNDED_RUST_CHANNELS` |
| Rust to sidecar | `engineSelectionChanged` (send), `invoke` | one new invoke channel for `ManagerHooks`, one `runnerOutput` send channel; both deleted when 91/92 land |

The wine window raiser (`utils/wineWindowRaise.ts`, 164 lines, AppleScript `System Events` with constant script text, pids and names only as argv, 12 attempts at 1500 ms plus a 2500 ms settle, `isMac` only) is a Helper spawn; its callers outside the launcher are the Steam bottle monitors (96), so it ports with a shim `deletedBy` 96. It is not fakeable by injection (needs a real window server): macOS live gate or a documented non-gate.

### Callers outside 88 that Rust must serve (interface and delete phase)

| Consumer | Needs | Delete phase |
|----------|-------|--------------|
| `storeManagers/{legendary,gog,nile}/games.ts` `launch()`, `storeManagerCommon/games.ts` `launchGame` | async `prepare_launch`, `prepare_wine_launch`, `setup_env_vars`, `setup_wrapper_env_vars`, `setup_wrappers`, `known_fix_env`, `known_fix_launch_overrides`, `launch_cleanup`, `call_runner` (Game), `run_wine_command` (Game, `waitforexitandrun`) | 91 (legendary), 92 (gog, nile, sideload, common) |
| managers' non-launch runner commands (`runRunnerCommand` etc.), `signInProbe/*`, `gog/library.ts:1671`, `nile/library.ts:562`, `legendary/library.ts:798` | `call_runner` (Helper) with `onOutput`, `abortId`, `skipErrorHandler`; unjoined when `onOutput` is set | 91/92 |
| `storeManagers/{gog,nile}/setup.ts`, `legendary/setup.ts` | `verify_wine_prefix`, `run_wine_command`, `selectEngineForLaunch` (stays until 92) | 92 |
| `save_sync.ts` | `verify_wine_prefix`, `setup_wine_env_vars` | 92 |
| `protocol.ts` deep link `gamelib://launch` and `steamFlowRegistration.ts` `launch` | the `launchEventCallback` shim | 98 / 90 |
| Steam dispatch (`steam/launchDispatch.ts` 66 and 88, `adoptionStatus.ts:300`) | `singleFlightLaunch(runner, appName, onJoin, run)` as a join-or-lead shim over the Rust table (D-04) | 90.2 |
| Steam bridge (96/97): `bottledSteam`, `provisionBottle`, `stageDrmBottle`, `sharedRedistInstall`, `bottleDllOverrides`, `bridgeKnownFixes`, `drmKnownFix`, `macArchKnownFix`, `gameLaunchOverlay` | `run_wine_command` with `onSpawn`+`resolveOnExit`+`onOutput`; sync known-fix readers (Pattern 5); `checkWineBeforeLaunch` (`provisionBottle.ts:444`) | 96/97 |
| Lane B Phase 91 (Rust legendary) | in-process: `gamelib_launch::{builders, runner::call_runner, funnel::run_launch, ManagerHooks}` and `gamelib_knownfix::launch_overrides`; the roadmap says 91 "needs `knownFixLaunch` from 88" | n/a |
| `quitHandler.ts` (98) | `is_game_running()` and `kill_all_games()` | 98 |

Therefore the Rust API must be a **library first** (pure functions plus the funnel over traits), with ops as thin `dispatch` wrappers, so 91/92 call it in-process without going through a shim.

### On-disk and in-memory state 88 reads or writes (byte-compat checklist)

| State | Today's owner | Format and path | 88 action |
|-------|---------------|-----------------|-----------|
| Per-game launch log | Rust writer (84) via TS facade | `LogTarget::Game { app_name, runner, kind: launch }`, raw chunks plus formatted lines; rotates on the first accepted batch of a writer instance | Rust funnel writes it; one rotation per launch |
| `tsStore` keys `<app>.firstPlayed/.lastPlayed/.totalPlayed` | Rust store host with TS mirror | ISO strings and integer minutes | write through `StoreHost`; TS mirror reads may lag (85's read-your-writes finding): any TS reader right after a launch ends can see stale values |
| `runsForMeStore` | Rust store host since 85 (`RH*` in the 85 column), TS mirror deleted at 96 per 82-STATE-OWNERSHIP | `common/runsForMe.ts` state machine (`nextRunsForMeAfterSession`) | port the small state machine into the funnel's playtime step; the 86-01 amendment states "runsForMe is not an 86 slice (D-01). Its non-test importers are `launcher.ts` (Phase 88)" [VERIFIED: 82-STATE-OWNERSHIP.md:184] |
| `<prefix or bottle>/installed_games` | launcher | JSON array of appNames, written when absent or when the game is missing from it | keep byte-compatible (`JSON.stringify(array)`, no trailing newline) |
| `fixes/`, `fixes/local/`, `overlays/` trees | known-fix modules | see table above | unchanged; the fetched-fixes cache must be readable by a rollback to a released build (87 D-07 shape) |
| `pci_ids_device`, `pci_ids_vendor` caches | TS cache stores | 7-day TTL, `store_cache/<name>.json` | move to Rust owner; D-24 amendment |
| Per-launch record (new) | none | discretion; recommend `<appFolder>/launches/<runner>-<appName>.json`, mode 0600, write-temp-rename, plain file, not a store kind (a store kind would need `EXPECTED_KINDS` and ownership-table rows) | new, no TS consumer |
| `last 50 chunks` of runner stdout/stderr | `memoryLog` | in-memory | see Pitfall 6 |

## Golden-trace harness and launch matrix

### What exists and is reusable (read this session)

- `src/backend/testUtils/engineWineOracle/{harness,recorder,spawnTrace,treeSnapshot}.ts`: fake HOME profile with fixed layout (`<HOME>`, `<USERDATA>`, `<APPFOLDER>`, `<TOOLS>`, `<TMP>`), `mockPlatform('mac'|'linux'|'windows')` through `jest.replaceProperty` on `backend/constants/environment` (not `jest.mock`, which a ratchet counts), `normalisePaths`/`expandPlaceholders`, `writeOrCompareGolden`, `syncManifest`/`assertManifest` (vacuous-pass guard, 82 D-05: floor in the test file and in `MANIFEST.json`, one `expected/<case>` folder per case, an empty list must fail), `createSpawnTracer` (a `ProcessRunner` and `SpawnAsync` recording `{program, argv, envDiff, cwd, stdin, via, result}` with scripted outputs) [VERIFIED: file headers and `export` lists].
- The tracer traces `run` and `runSync` only; `spawnLongLived` throws by name (`spawnTrace.ts:274`). Launches use `run`, so this is enough for 88 (comet is a manager `launch()` concern).
- Rust replay pattern: `gamelib-wine/tests/golden_wine_core.rs` reads the same fixtures under `tests/fixtures/golden/<slice>/` (`cases.json`, `deltas.json`, `MANIFEST.json`, `expected/<case>/{result,events,requests,spawns,tree}.json`) [VERIFIED: directory listing].
- The oracle is **TS-only at record time and Rust-only at compare time** for the same inputs. `GAMELIB_WRITE_ENGINE_GOLDEN=1` writes from TS; `GAMELIB_EW_ORACLE=record` is the one network mode.

### What 88 must add

1. A `launchOracle` harness beside it that drives the **real** TS entry points with an injected `ProcessRunner`, probes (`searchForExecutableOnPath`, `os.release`, `existsSync`), clock and online monitor: `prepareLaunch`, `prepareWineLaunch`, `setupWrappers`/`setupEnvVars`/`setupWrapperEnvVars`, `createCommandRunner().callRunner/runScriptForGame/getWinePath`, the known-fix modules, `runLaunchEventCallback` with a scripted `Game`, and each manager's `launch()` (legendary, gog, nile) and `launchGame` (sideload and common) to record the **runner argv the manager builds** (the Rust side does not build it until 91/92, but the shim contract is "TS passes these args to `call_runner`", so the golden pins them on the TS side).
2. Two golden layers: **(a) vectors** (op input to op output) for the pure and prepare ops, like `wine_env.json`; **(b) traces** (a scenario's spawn sequence with `{program, argv, env (full), cwd, class, order}` plus status events, log transcript and tree) recorded at the spawn boundary. The spawn class (Game or Helper) is **not observable in the TS** (the TS runner has no class), so the harness records the class the Rust design assigns per call site in a hand-authored `classes.json`, and the Rust replay asserts it. This is the one non-oracle column in an otherwise TS-recorded golden; call it out in the manifest.
3. Real-launch-function replays in Rust that **start from the recorded shim-call arguments**, not from game settings: for manager-built commands the input is the TS-recorded `call_runner` args. This keeps the Rust golden independent of 91/92.
4. **Pinned base env (D-12):** `createFakeHomeProfile()` plus fixed `PATH`, `LANG`, `USER`; the golden stores the full env. Known deltas to put in `deltas.json` from the start: the TS sidecar's `process.env` includes four variables the shell injects into it (`GAMELIB_SHELL_EXE`, `GAMELIB_APP_ROOT`, `GAMELIB_STEAM_ROOT_DEFAULT`, `GAMELIB_STORE_BOOT`) [VERIFIED: `src-tauri/src/sidecar.rs:35-45`], so a Rust spawn from the shell's own environment will not carry them, a benign but real difference from today's game environment.
5. **Pairwise generator**: about 60 lines in the harness (greedy all-pairs over the toggle axes within each feasible `(OS, engine)` cell, deterministic order, plus a test asserting every legal pair appears). Floors (discretion, tuned by the planner; 87 used 16 / 40 / 14): scenario floor at least 120 launch traces, 60 builder vectors, 40 runner-command traces, plus 30 known-fix vectors.
6. A **second TS oracle** for the funnel: `runLaunchEventCallback` with a scripted `Game`, recording the ordered event list (`gameStatusUpdate` payloads, log entries, store writes, hook calls, the single-flight log line) per scenario. The funnel's order is the behaviour; spawn goldens do not cover it.

### The matrix (per OS; the planner generates it, this is the axis table)

| Axis | Values | Feasible on |
|------|--------|-------------|
| runner | legendary, gog, nile, sideload (steam is out: 90) | all |
| engine (`gameSettings.wineVersion.type` + engine step) | native; wine (Linux, mac Staging fallback); proton with and without umu (Linux); crossover (mac); toolkit (mac, retained code path) | native: all; wine/proton: Linux; crossover/toolkit/wine: mac; Windows has every wine key deleted by `filterGameSettingsForLog` and runs native |
| toggles | gamescope (limiter, upscaling, force-grab-cursor, additional options), mangohud, gamemode (Linux; `isSteamDeckGameMode` suppresses mangohud and gamescope), `wrapperOptions` with quoted args, tier-1 env, `exeOverride` (valid, escaping, symlink, missing), `launchArgs`, tier-2 registry fix, tier-2 `dllOverrides`, tier-2 overlay (present/absent/download fail/hash mismatch), winetricks fix, `runInPrefix` fix, pre-script, after-script, `offlineMode` (setting, monitor, Epic service), anti-cheat (`eacRuntime`, `battlEyeRuntime`, status log lines), `verboseLogs` on/off, flatpak, `enableMsync` and `-DXMT` names, `preferSystemLibs` | per OS as above |
| `isMacSonomaOrHigher` both ways | `os.release()` major `>= 14` [VERIFIED: `utils.ts:1592`] | mac; it only changes which default wine `downloadDefaultWine` picks (`Game-Porting-Toolkit` vs `Wine-Crossover`) and the toolkit `validWine` |
| incident scenarios | every `it(...)` in `commandRunner.test.ts` (70), `launcher_launchSingleFlight` (5), `launchSingleFlight` (5), `launcher.engineStep` (7), `launcher_wineLibFolders` (3), `gamescopeCommand` (11), `spawnAsync` (9), `knownFixes*` (about 250 across `knownFixes`, `Layered`, `Registry`, `Overlays`, `OverlayInstall`, `OverlayArchive`, `Fetcher`, `Launch`, `Report`), `quitHandler` (5) | as named; `launcherOverlayCensus` (6) is a source-text gate and is dropped (D-15) |

There is **no existing TS behavioural test** for `prepareLaunch`, `prepareWineLaunch`, `setupWrappers`, `setupEnvVars` outside the 87 oracle, or the main `runLaunchEventCallback` sequence [VERIFIED: the launcher-related test files listed above]. Those goldens are new work, not a port of existing tests.

### What injection cannot fake (D-13 asks for this list; each becomes a CI smoke or a Phase 99 item)

| Behaviour | Why | Covered by |
|-----------|-----|-----------|
| Windows `CreateProcess` command-line quoting against a real exe | Rust `Command` and libuv implement the MSVCRT rules separately; argv arrays match while the final command line may not | **Windows CI cross-check**: build a tiny stub exe that prints `GetCommandLineW()`; spawn it with the same argv list from Node and from Rust and assert equality over a table (spaces, embedded `"`, trailing backslash, empty arg, non-ASCII). No recording needed: Node is the oracle on the Windows leg. Also include a `.bat` and a `.cmd` target: Rust's std refuses or escapes cmd.exe metacharacters in batch args, and Node refuses `.bat` spawns without a shell (assumption A4) |
| PowerShell `Start-Process -Wait -NoNewWindow` tree wait (Windows runner commands) | `callRunner` wraps every runner in PowerShell when it is on PATH, so a game's "exit" is the whole tree's exit [VERIFIED: `commandRunner.ts:438-459`] | Windows CI stub game that spawns a grandchild; assert the funnel waits for it; keep the wrapper for parity (golden records the `-NoProfile Start-Process ... -ArgumentList` argv) |
| real `gamescope --help`, `umu-run`, `mangohud`, `gamemoderun` | not installed on CI | probe results injected; the forms are vectors; a Linux CI smoke with a stub `gamescope` script on PATH that prints both help texts |
| `setsid`, process groups, `SIGTERM` to a group, orphan survival | OS behaviour | `cargo test -p gamelib-proc` orphan harness (already runs on three legs) extended with the launch smoke |
| macOS `osascript` window raise, CrossOver, Staging, Metal | needs the device | macOS live gate (D-17) |
| case-insensitive file systems for `exeOverride` realpath containment | FS behaviour | table with mixed case on the macOS CI leg |
| `os.release()` / Flatpak / Steam Deck game mode | host facts | injected |

## Suggested sub-slice order (CONTEXT leaves it to research)

0. **Authoring, no product code:** `88-HUMAN-UAT.md` (four items, D-17, UAT item shape rule), the ROADMAP SC2 amendment (D-16), the `82-STATE-OWNERSHIP.md` amendment (D-24: `pci_ids_*`, `info-caches:systemInfo`, and every 88-scheduled row), and the re-read of the shim schedule (13 rows). Confirm 87-61 and 87-63 have landed.
1. **TS oracle first (D-11/D-25):** the `launchOracle` harness, the pairwise generator, goldens for every sub-slice below, `classes.json`. Nothing in Rust yet. The recorded set is committed and the Rust plans start from it.
2. **`gamelib-knownfix`:** reader and layering, `launchArgs`/`exeOverride`, registry fixes, overlay archive, overlay install, fetcher, report. Native channels `getKnownFixes`/`getGamelibFixStatus`. The sync TS reader twin and the bridge shims. (Lane B's 91 needs `knownFixLaunch` from here, so this slice unblocks 91's planning first.)
3. **Builders and prepare ops:** `setup_env_vars` additions, `setup_wrapper_env_vars`, `setup_wrappers`, gamescope, `prepare_launch`, `prepare_wine_launch` (including `installFixes`, the GOG dummy, EAC/BattlEye runtimes, deadline arm), `get_crossover_bottle_folder`, `check_wine_before_launch` port. Async shims; delete the twins and the oracle test.
4. **Command runner:** `call_runner` (Helper first, then Game), redaction, `run_script_for_game`, `get_wine_path`, `error_handler`, the streaming shim, abort by id, dedup. Delete `commandRunner.ts`, `spawnAsync.ts` shim policy decided.
5. **`gamelib-proc` extensions and the Game registry:** Windows `start_time`, Windows Game job without kill-on-close, explicit tree kill, capture-file tail, the running-game registry, `is_game_running`, `kill_all_games`. Orphan harness arms for each.
6. **Funnel, single-flight and `ManagerHooks`:** the Rust funnel, the TS `launchEventCallback` shim, the Steam dispatch join shim, the quit shim. Funnel oracle replay.
7. **Re-adoption:** per-launch record, boot task, exit watch, "re-adopted" log line, playtime and after-script on exit.
8. **System information and the `utils.ts` rows** (`errorHandler`, `askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher`, `removeQuoteIfNecessary`, window raiser, GPU/os/memory probes, `getSystemInfo` native channel).
9. **Three-OS CI smoke** (stub game binary), then the **deletion plan**: `git rm` the TS and tests, the harness, registrations and boot-step pieces, regenerate the IPC snapshot, `launchPortComplete.test.ts` gate (forbidden symbols, intended survivors), schedule rows re-scheduled, `pnpm find-deadcode`.
10. **Live gate run** by a different plan than the author, on the signed 88 build over the signed 87 build; then the todo updates (the SIGKILL todo body updated, not closed).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawning a game, a runner or a probe | `Command::spawn`, a bespoke kill | `gamelib_proc::{spawn_game, spawn_helper_tokio, SpecProcRunner}`, `kill_tree::terminate_group` | D-21; the group/Job logic and the pgid <= 1 refusal live in one place |
| Per-game log files, rotation, framing | a second file writer | `gamelib-log` `LogTarget::Game` + `TargetBatch` | rotation and 0600 modes are product behaviour (84) |
| HTTP for fixes and overlays | a new reqwest client | `gamelib_engine::fetch::Fetch` (`ReqwestFetch`, `Replay`) | one TLS provider, golden replay seam, `.without_url()` error rule |
| Guarded recursive delete (overlay removal, record cleanup) | `remove_dir_all` | `gamelib-safety` | 82 destructive-path rules |
| Store writes (`tsStore`, `runsForMe`, fixes cache metadata) | direct file I/O | `gamelib-store` `StoreHost` | Rust is the one disk writer |
| Env builders and the wine command | a second copy | `gamelib_wine::wine_cmd::*` (extend in place) | 87 D-22 |
| Engine selection at launch | re-deriving a decision | `select_engine_for_launch` | 87 D-01 |
| Process liveness and start stamp | `kill(pid, 0)` | `gamelib_proc::probe::{is_alive, start_time}` (add the Windows `start_time`) | zombies and pid reuse are handled there |
| Dialog with an answer | a new modal | the shell's `dialogs.rs` (`rpc_dialog_message`) behind a trait | CR-04 `cancelId: 0` fail-safe semantics |
| Sandbox of known-fix paths | a prefix check | the TS algorithm ported with its 10 `knownFixLaunch` tests, realpath on both sides | symlink escape is the incident class |

**Key insight:** every deceptively simple piece here has an incident behind it (WR-01 non-joinable `onOutput` runs, CR-41 a rejected recent-games write, the 49-REVIEW dedup, 34.5-61 PowerShell redaction). The TS tests record the incidents; porting them as named scenarios is the work.

## Common Pitfalls

### Pitfall 1: The funnel cannot be Rust-owned without a manager callback
**What goes wrong:** a plan "ports `launchEventCallback`" and discovers mid-way that nine steps call TS manager code (`game.launch`, `syncSaves` twice, `updateGOGPlaytime`, `setPresence`, `clearPresence`, `persistBottleWineVersion`, `forceUninstall`, `getSettings`).
**Why:** managers are TS until 91/92; CONTEXT D-01 does not say how Rust reaches them.
**How to avoid:** Pattern 1 (`ManagerHooks`), decided in plan 1 as a checkpoint. Timeouts: hook invoke channel in `LONG_RUNNING_CHANNELS`, runner-call channel in `UNBOUNDED_RUST_CHANNELS`. A sidecar death mid-launch must hand the live game to the exit watch, not report failure.
**Warning signs:** a plan that adds a `launch_begin`/`launch_end` pair driven by TS; a 60 s `rustInvoke timed out` during a play session.

### Pitfall 2: `spawn_game` gives the game no pipe
**What goes wrong:** the legendary launch classifies login failures from the captured output (`createBoundedOutputCapture`, `classifyLegendaryLaunchFailure`), and `logWriters` receive each chunk; with `spawn_game(cmd, None)` there is nothing to read. With `spawn_game(cmd, Some(per_game_log))` the Rust writer's asynchronous rotation can rename the file after the game opened it, so output lands in `.old`.
**How to avoid:** Pattern 4 (private capture file, tail it, flush the log writer's rotate batch before spawning). D-09's premise ("the stdout pipe died with the old process") is wrong for this design; ask whether to keep D-09 as locked (recommended) or enable resume.
**Warning signs:** an Epic title that fails sign-in shows no dialog; the per-game log lacks game output after a first launch.

### Pitfall 3: `gamelib-proc` cannot do what D-06 and D-08 need on Windows, and cannot kill a re-adopted game by handle on unix
**What goes wrong:** (a) `kill_tree` is "empty" on Windows: "Windows has no group-signal equivalent; its tree kill is the per-helper Job Object" [VERIFIED: `kill_tree.rs:1-2`], and a Game is never in a Job [VERIFIED: `spawn.rs:109-143`]; so an explicit "Yes kills the game's tree" has no primitive on Windows. (b) `start_time` returns `None` on Windows [VERIFIED: `probe.rs:118`, the Windows `imp`], so D-08's pid plus start time check cannot run there. (c) `terminate_group(pgid, &mut Child, grace)` needs the `Child`; a re-adopted game has none, only `kill_process_group(pgid)`, which is safe only after the start time proves the pid is the recorded process (the setsid leader's pid equals its pgid).
**How to avoid:** extend `gamelib-proc` in 88: Windows `start_time` from `GetProcessTimes` (process creation time as the stamp), a per-game Job **without** `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` so a crash leaves the game alone but `TerminateJobObject` kills the tree explicitly (re-opening the Job by name after a crash is an assumption, A5; otherwise fall back to a tree walk by parent pid), and a `kill_game_tree(pid, start)` that checks the stamp then signals the group on unix. Add orphan-harness arms (SIGKILL of the parent leaves the game; explicit kill removes the tree) on all three legs.
**Warning signs:** a plan whose Windows quit-kill is "`taskkill /T`" (a hand-rolled kill, forbidden) or "TODO on Windows".

### Pitfall 4: D-06's premise about the quit dialog is not true today
**What goes wrong:** D-06 says "the same pending operations dialog appears when a game is running". The dialog is shown when `isLocked || isRunning || isBridgeHosting` [VERIFIED: `quitHandler.ts:40`], and `isRunning` is `downloadQueue.isRunning()` [VERIFIED: `bootstrap.ts:1913`]; a running non-Steam game by itself shows no dialog today, and a graceful quit kills it silently through the sidecar's process group. After D-05, a Game-class game is outside that group, so without a new condition a graceful quit would **leave the game running** with no prompt.
**How to avoid:** add `isGameRunning()` (the Rust registry through a shim, D-07) to the dialog condition, with the existing message and `cancelId: 0`, and record it as a deliberate behaviour change with a UAT row (D-17 item 2 already asserts the dialog). Do not describe it as parity. Open Question 2.

### Pitfall 5: Exit budget and the after-script on quit-kill
**What goes wrong:** Yes kills the game within the one 5 s exit budget. The funnel's tail (after-script, playtime, saves-up, `done`) would run after the kill, but the after-script is unbounded user code and the saves upload is network.
**How to avoid:** the quit path kills and records playtime from the registry's own start stamp, and leaves the per-launch record in place marked `quit-killed` so the next boot runs the after-script (a bounded, registrant-held task). State this in `88-HUMAN-UAT.md` item 2 and 3. No new wait in `handle_exit`; hold a registrant only for the kill itself.

### Pitfall 6: `ExecResult.stdout` is "the last 50 chunks", and chunk boundaries are an OS artefact
**What goes wrong:** `memoryLog(50)` keeps the last 50 messages, "the number of messages kept, not lines" [VERIFIED: `commandRunner.ts:99-108`]. Node's pipe reads are up to 64 KiB; the Rust `SpecProcRunner` pumps 8 KiB (`CHUNK`) [VERIFIED: `gamelib-proc/src/spec.rs` constant `CHUNK = 8 * 1024`]. A long output yields a different window, and managers parse `stdout` (library lists, JSON). The `stderr` join uses `'\n'`, the stdout join `''` [VERIFIED: `commandRunner.ts:580-581`].
**How to avoid:** specify the Rust window deterministically (for example the last 50 chunks of 64 KiB), record the difference in `deltas.json`, and test a transcript larger than 50 chunks. Do not "fix" the quirk (D-20): file a todo.

### Pitfall 7: The funnel mutates settings and writes per-game config it does not own
**What goes wrong:** `checkWineBeforeLaunch` mutates `gameSettings.wineVersion` in place and persists through `gameConfigs.get(app).setSetting('wineVersion', ...)` (`utils.ts:1170-1230`), and `downloadDefaultWine` calls `config.setSetting('wineVersion', ...)`. Game and global config are TS-owned until 98 (the settings store is Rust-hosted, but `GameConfigs`/`createGlobalConfig` logic is TS). A Rust funnel therefore needs `ManagerHooks`-style `set_game_setting` and a facts read for global settings, and the in-place mutation must become an explicit return value.
**How to avoid:** list these as hook ops, goldens record the write calls.

### Pitfall 8: A joiner or leader that never settles
**What goes wrong:** the TS `singleFlightLaunch` releases in `.finally` of the leader's promise [VERIFIED: `launchSingleFlight.ts:41-47`]. In Rust, a leader that panics or whose hook channel dies must release the entry (RAII guard), and a joiner must not hang past the leader. The existing never-settles test class (v0.11 pitfall P17) applies.
**How to avoid:** RAII guard, a test with an injected hook that never answers plus sidecar EOF, and a joiner test with the leader cancelled.

### Pitfall 9: A re-adopted "Playing" event emitted before the renderer listens
**What goes wrong:** the renderer sends `frontendReady` as the last step of its boot ("renderer listeners mounted" [VERIFIED: `initStateSubscriptions.ts:14-16, 606`]); a `gameStatusUpdate` Rust emits at boot is lost.
**How to avoid:** emit (or re-emit) the re-adopted status after `frontendReady`, or on every `frontendReady`; put it in the live-gate item 3 expectation ("reopening shows Playing").

### Pitfall 10: Re-adoption keyed on the leader pid misses Wine launches whose leader exits
**What goes wrong:** for a wine or CrossOver launch the recorded pid is the loader; if the leader exits while wineserver and the game live on (87's gate saw launcher exits about 1 s after the wine command), the boot match finds no process and removes the record while the game runs.
**How to avoid:** match by pid and start stamp first, then by a live **group** (unix: any member of the recorded session or pgid), and record the engine's game-process hints the 87 deadline watcher already uses (install-dir match). Treat "group alive, leader gone" as running. This is a design item for the re-adoption plan (Open Question 7).

### Pitfall 11: Golden traps
- Dedup keys and abort ids use `Math.random()` when no app name exists; pin them or normalise.
- `runWineCommand` mutated the caller's `commandParts` in place (87 finding 3); Rust takes by value; record both sides in `deltas.json`.
- Windows replay: the open todo `2026-11-21-gamelib-log-golden-fails-on-windows-path-separator` touches the wine-header path [CITED: 88-CONTEXT code_context]; keep recorded paths as placeholders and compare normalised separators.
- The env diff is against the fake-HOME base; a variable inherited from the real shell (for example `DYLD_*`, `LD_PRELOAD`) leaks into a golden unless the base is replaced (`replaceEnv`).
- `wineserver --wait` after a waited command has a 30-minute cap (`WINESERVER_WAIT_TIMEOUT_MS = 1_800_000`) [VERIFIED: `commandRunner.ts:97`]; scripted runs must not wait it out.

### Pitfall 12: `shlex` parity
`shlex.split` of `wrapperOptions[].args` and `shlex.join(wrappers)` (used by the managers to build `--wrapper`) are npm `shlex ^2.1.2`; the locked Rust crate is `shlex 2.0.1`. They differ on malformed quoting (Rust returns `None`, the npm module's behaviour is `[ASSUMED]` to throw or degrade). Vectors for unterminated quotes, backslashes, empty strings, non-ASCII and `$`/backtick are mandatory before any wrapper golden is trusted.

## Code Examples

Sketches only; names are discretion and are not repo values unless quoted.

### Capture-file Game spawn (Pattern 4)
```rust
// spawn_game's real signature (gamelib-proc/src/spawn.rs): pub fn spawn_game(mut cmd: Command, log: Option<&Path>) -> std::io::Result<Child>
let capture = launches_dir.join(format!("{runner}-{app}.out"));      // 0600, created by the funnel
gamelib_log::flush(Duration::from_secs(2));                          // the game-log rotate batch is on disk first
let child = gamelib_proc::spawn_game(cmd, Some(&capture))?;
let record = LaunchRecord { runner, app, pid: child.id(), start: probe::start_time(child.id()), /* ... */ };
record.write_atomic(&launches_dir)?;                                 // before the funnel awaits anything else
tail_capture(&capture, |chunk| { game_log.raw(chunk); stream.send(chunk); bounded.push(chunk); });
```

### Funnel over hooks (Pattern 1) [ASSUMED names]
```rust
#[async_trait] trait ManagerHooks: Send + Sync {
    async fn facts(&self, runner: &str, app: &str) -> Result<LaunchFacts, HookError>;
    async fn launch(&self, log: LogHandle, args: LaunchArgs) -> Result<bool, HookError>; // spans the session
    async fn sync_saves(&self, dir: SyncDir, path: Option<&str>, gog_saves: &[GogSave]);
    async fn update_gog_playtime(&self, start: Ts, end: Ts);
    async fn set_presence(&self, app: &str); async fn clear_presence(&self);
    async fn persist_bottle_wine_version(&self, wine: &Value);
    async fn force_uninstall(&self, app: &str);
    async fn set_game_setting(&self, app: &str, key: &str, value: &Value);
}
```

### Replay test shape (follow `golden_wine_core.rs`)
Read `tests/fixtures/golden/<slice>/cases.json`, build a `FakeHome`, expand placeholders, run the op with a scripted `SpecRunner`, compare `result.json`, `spawns.json`, `events.json` and `tree.json` to `expected/<case>/`, apply `deltas.json`, and assert the manifest floor (a missing or empty case list must fail) [CITED: `gamelib-wine/tests/golden_wine_core.rs`, `harness.ts` `assertManifest`].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TS-launched games die with the sidecar group (D-15 interim) | Rust `spawn_game`: game survives a crash, explicit kill, re-adoption | this phase | behaviour change recorded in the 83 UAT; update the todo body, do not close it (bridge launches remain) |
| `commandRunner` in the sidecar | Rust ops + streaming shim | this phase | all runner spawns Helper except launches |
| Discord rich presence in `prepareLaunch` | deleted (operator decision 2026-11-17) | 82 inventory | `constructAndUpdateRPC` and `launchCleanup(rpcClient)`'s RPC path die with the launcher |
| Sync launcher builders | async Rust shims | this phase | 5 members, all call sites async |

**Deprecated/outdated:** the `quoteIfNecessary` copy in `utils.ts` (unused; the runner has its own private copy, which is the one that matters for log lines); `testingExportsUtils`; the `launcherOverlayCensus` source-text gate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A per-launch record plus capture file as plain files (not a store kind) passes the store-kind and ownership gates | Architecture, state table | a gate (`storeKinds.test.ts` `EXPECTED_KINDS`, ownership tables) fails; register as a kind |
| A2 | npm `shlex 2.1.2` and Rust `shlex 2.0.1` agree on well-formed input and differ on malformed quoting | Pitfall 12, Stack | wrapper argv diverges silently; vectors decide |
| A3 | A Rust-to-sidecar invoke that waits hours is acceptable with the channel in `LONG_RUNNING_CHANNELS` and a dedicated thread | Pattern 1 | thread exhaustion or a stuck exit; needs a spike with a stub hook |
| A4 | Node refuses to spawn `.bat`/`.cmd` without a shell and Rust std applies its batch-escaping rules, so both reject unsafe args | injection list | a `.bat` game launches in one runtime only; the Windows CI cross-check settles it |
| A5 | A Windows Job without kill-on-close can be reopened by name after a crash for an explicit tree kill | Pitfall 3 | fallback: a parent-pid tree walk via `gamelib-proc` |
| A6 | Windows process creation time (`GetProcessTimes`) is a stable per-process stamp across a GameLib restart | Pitfall 3 | re-adoption on Windows would need another stamp |
| A7 | `Start-Process -Wait` waits for descendants as well as the process | injection list | the funnel's "game exited" would fire early on Windows |
| A8 | An `onSpawn` handle shim over frames is enough for the three callers (registry fix timeout kill, bridge known fixes, direct launch) | Pattern 3 | a caller needing a synchronous handle needs a sync twin |
| A9 | gamelib.log redaction (87-61) does not apply to the per-game log; per-game logs stay raw as today (they contain paths and the game's output) | Standard Stack | a privacy regression if per-game logs are also uploaded without redaction (they are uploadable via `uploadLogFile`); confirm with the user |

## Open Questions

1. **Funnel to manager callback (blocking):** Is a Rust-to-TS `ManagerHooks` seam (Pattern 1) acceptable for D-01, given the milestone's own "Rust calling into TS" anti-pattern note? Recommendation: yes, one invoke channel plus one output send channel, both deleted by 92. The alternative (TS sequences Rust steps) fails D-25.
2. **D-06 premise:** confirm the quit dialog gains an "a game is running" condition (a behaviour change) rather than being "as before". Without it, a graceful quit leaves Game-class games running with no prompt.
3. **D-09 and capture file:** with a capture file, log capture can resume after re-adoption cheaply. Keep D-09 as locked and file the todo, or lift it?
4. **Scope gap, `utils.ts` wine pieces:** the 82 inventory assigns `checkWineBeforeLaunch`, `downloadDefaultWine`, `shutdownWine`, `getWineFromProton`, `detectVCRedist` to "87", but they are still TS in `utils.ts` (lines 138, 964, 1058, 1130) and CONTEXT's 88 list omits them. The Rust funnel needs `checkWineBeforeLaunch` (Linux and Windows non-engine launches run it) and `downloadDefaultWine`, with callers in `provisionBottle.ts:444` (Steam, 96) and `gog/setup.ts:150` and `nile/setup.ts:144` (92); `shutdownWine` has four manager callers and is the subject of 87-65. Recommendation: port `check_wine_before_launch` and `download_default_wine` in 88 (they use `isMacSonomaOrHigher`, which is on CONTEXT's list), leave `shutdownWine` and `getWineFromProton` as scheduled TS, and amend the ownership table.
5. **Unowned modules:** `online_monitor.ts` (369) and `connectivityNow.ts` (180) and `gamedetails/` (511) are not in 88's CONTEXT, while 86-CONTEXT says they "port with Phase 88" and 87's code says the monitor "still does the probing until Phase 98" [VERIFIED: 86-CONTEXT.md:16-18; `enginewine/engineOnline.ts` header]. Recommendation: leave them (the funnel reads `EngineCtx.online`), and record the deferral so they are not lost. The Epic status probe in `isEpicServiceOffline` needs the monitor's answer from the same flag.
6. **Windows primitives in `gamelib-proc`:** confirm the extension in Pitfall 3 is in scope (it must be, for D-05 on Windows and D-06). It needs the orphan harness arms on three legs.
7. **Re-adoption semantics for wine launches:** leader pid only, or also a live group (Pitfall 10)? And what runs on a quit-kill (Pitfall 5): the after-script at next boot, or never?
8. **Shim rows with stale `deletedBy: 88`:** the three `tools.ts` rows (and perhaps `validWine`) are still imported by Steam bridge code; re-schedule to 97, or move `bridgeKnownFixes.ts` to the new Rust known-fix shim before deleting.
9. **Per-game log redaction (A9):** the per-game log is raw today; keep, and confirm no new path-bearing line is added.
10. **87 gap plans:** 87-62 to 87-65 are optional gates but 87-61 and 87-63 are hard. If 87-63 slips, 88's offline scenarios cannot be recorded.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | TS oracle harness, jest | yes | v22.23.4 | none needed [VERIFIED: `node --version`] |
| pnpm | scripts, `check:ipc-contract`, `planning-gates` | yes | 10.28.0 [VERIFIED] | none needed |
| cargo / rustc | crates, golden replay | yes | 1.99.1 / 1.99.1 [VERIFIED] | none needed |
| `gsd-tools` | package-legitimacy check | yes | `~/.claude/gsd-core/bin/gsd-tools.cjs` | none needed |
| macOS operator Mac with CrossOver and the pinned Staging engine | live gate items 1, 3, 4 | not probed this session | n/a | none: the gate needs the device; items are authored before coding |
| Windows and Linux machines | D-16 | no (CI legs only) | n/a | three-OS CI smoke plus Phase 99 |
| a stub "game" binary | CI smoke, quit-kill, survival | no, to build | n/a | model on `gamelib-proc/src/bin/standin.rs` (323 lines, the orphan-harness stand-in) |
| real `gamescope`, `umu-run`, `mangohud`, `gamemoderun` | Linux behaviour | not on CI | n/a | injected probes plus a stub script on the Linux leg |

**Missing dependencies with no fallback:** the operator's Mac for the live gate (as in 87). **With fallback:** everything else.

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 (TS oracle, shims, gates) and `cargo test` (Rust replay, units, orphan harness) [CITED: 87-VALIDATION.md] |
| Config file | `src/backend/jest.config.js`; per-crate Cargo |
| Quick run command | `pnpm jest src/backend/launchOracle src/backend/__tests__/launch --silent` ; `cd src-tauri && cargo test -p gamelib-launch -p gamelib-knownfix` |
| Full suite command | `pnpm test:ci` ; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-launch -p gamelib-knownfix -p gamelib-info -p gamelib-engine -p gamelib-wine && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |

### Phase Requirements to Test Map
| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| SVC-03 / SC1 | builders match TS vectors (env, wrappers, gamescope, known-fix env, prepare ops) | Rust replay of TS-recorded vectors | `cargo test -p gamelib-launch --test golden_builders` | no, Wave 0 |
| SVC-03 / SC1 | spawn traces for native, Wine/Proton/CrossOver, gamescope/mangohud, overlay, pre/post (argv, full env, cwd, class, order) | Rust replay of TS-recorded traces | `cargo test -p gamelib-launch --test golden_launch` | no, Wave 0 |
| SVC-03 / SC1 | known-fix reader, layering, registry, overlay archive/install, fetch | Rust replay + ported incident tests | `cargo test -p gamelib-knownfix` | no, Wave 0 |
| SVC-03 / SC1 | runner command argv/env, redacted log line, streamed line sequence | replay | `cargo test -p gamelib-launch --test golden_runner` | no, Wave 0 |
| SVC-03 / SC2 | funnel order, status events, single-flight join, releases on failure | funnel oracle replay + ported `launcher_launchSingleFlight` | `cargo test -p gamelib-launch --test funnel` | no, Wave 0 |
| SVC-03 / SC2 | a stub game starts, runs, single flight, quit-kill, survival on parent SIGKILL (three OS) | CI smoke + orphan harness arm | `cargo test -p gamelib-proc` and `cargo test -p gamelib-launch --test stub_game` | partial (`orphans.rs` exists) |
| SVC-03 / SC2 | Windows quoting against a real exe | Windows-leg cross-check (Node vs Rust) | `cargo test -p gamelib-launch --test windows_quoting` | no, Wave 0 |
| SVC-03 / SC2 | live: launches, single flight + quit, Force Quit survival + re-adopt, known fix + scripts | operator, signed build | `88-HUMAN-UAT.md` | no, authored before coding |
| SVC-03 / SC3 | anti-cheat log lines and runtime env/download; utils pieces (`errorHandler` regexes, `askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher` both ways, `removeQuoteIfNecessary`) | replay + unit | `cargo test -p gamelib-launch --test utils_pieces` | no, Wave 0 |
| SVC-03 / SC4 | TS and registrations deleted, only scheduled shims remain | Jest gate | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | no (gate new; schedule exists) |
| D-08/D-10 | re-adoption (pid + start match, reused pid no match, record without match removed, exit playtime and after-script) | Rust tests | `cargo test -p gamelib-launch --test readopt` | no, Wave 0 |
| D-19 | channel parity (OPS == constants == arms) and IPC snapshot | gen + Jest | `pnpm check:ipc-contract` | yes |

### Sampling Rate
- **Per task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder; `npx prettier --check` over exact written paths (after `--file-info`; omit over prettier-ignored paths such as `.planning`).
- **Per wave merge:** the full Rust set, `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`, `pnpm check:ipc-contract`.
- **Phase gate:** full suite green on the three-OS CI, then `88-HUMAN-UAT.md` on the signed build, run by a plan other than its author.
- **Vacuous-pass guard on every golden:** floor in the test file and in `MANIFEST.json`, one `expected/` folder per case, an empty case list must fail, and a pairwise-coverage assertion (every legal pair present).

### Wave 0 Gaps
- [ ] `src/backend/launchOracle/` harness (record and compare modes, spawn tracer reuse, pairwise generator, classes file) and its manifests
- [ ] `src-tauri/crates/gamelib-launch/` and `gamelib-knownfix/` skeletons with `Cargo.toml`, `-p` entries in `.github/workflows/rust-test.yml`, README section for the crates
- [ ] stub game binary (model on `gamelib-proc/src/bin/standin.rs`) and Windows CommandLine-echo stub
- [ ] `gamelib-proc` additions with orphan-harness arms (Windows `start_time`, Game job, tree kill)
- [ ] `88-HUMAN-UAT.md`, SC2 amendment, `82-STATE-OWNERSHIP.md` amendment
- [ ] `launchPortComplete.test.ts` (forbidden symbols, intended survivors, file-walk floor)

## Security Domain

`security_enforcement` is not set to false in config, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth; tokens only in redaction) | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | yes (a renderer-reachable channel can launch or kill a game) | native channel args as `deny_unknown_fields` serde structs; the renderer path guard rules carry over |
| V5 Input Validation | yes | serde structs per op; `exeOverride` shape plus realpath containment; the overlay id regex, 8-entry cap, archive path rules; the known-fix key allow-list; argv only, never a shell |
| V6 Cryptography | yes | `sha2` for the overlay pin; never hand-rolled |
| V7 Logging | yes | `getRunnerCallWithoutCredentials` redaction (eight flags, PowerShell branch); 87-61 redaction for gamelib.log lines; fixed-text crate lines |
| V12 Files | yes | per-launch record and capture file 0600, atomic write; guarded deletes through `gamelib-safety`; overlay extraction in-process with traversal checks |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Remote known-fix layer sets env for a launched game (`LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `PATH`), runs `winetricks` verbs or `runInPrefix` programs from a GitHub-hosted file | Tampering / Elevation | pre-existing trust model; copy it (D-20) and file a todo; keep the tier-1 allow-list and the "remote layer never carries tier-2" rule exactly; reader and fetcher both filter |
| `exeOverride` symlink escape from the install folder | Tampering | realpath containment on both sides, regular file only (10 tests port) |
| pid reuse makes the quit-kill or re-adoption signal an unrelated process | Tampering / DoS | pid plus start-stamp check before any signal; `kill_process_group` refuses pgid <= 1; never trust the record alone |
| Tampered per-launch record (a user-writable file) names a pid | Tampering | 0600 mode, start-stamp check, and a record is only used to match a live process, never to start one |
| Command injection through paths and args | Tampering | argv arrays; the PowerShell wrapper builds one quoted string (`"`"..`""`) from argv: port its exact escaping and test with hostile names; AppleScript text is constant with pids and names as argv |
| Credentials in logs (`--code`, `--token`, `--password`, `--serial`, `--client-id`, `--access-token`, `--refresh-token`, `--code-verifier`) | Information disclosure | exact-element redaction in the log line; per-game log keeps raw output (A9) |
| Overlay archive zip-slip or oversized extraction | Tampering / DoS | strict reader (regular files, exact set, no `..`), size cap `EXTRA_UNCOMPRESSED_BYTES`, sha256 pin from the signed catalogue, 120 s bound, abort token |
| Launch scripts run with the full settings and game info JSON in the environment | Information disclosure | parity; the env block is user-authored script input (`HEROIC_GAME_SETTINGS`, `HEROIC_GAME_INFO`); document, do not change |

## Sources

### Primary (HIGH confidence, read this session)
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`, `88-DISCUSSION-LOG.md`; `.planning/ROADMAP.md` (Phase 88 section, v0.11 preamble and Lanes); `REQUIREMENTS-v0.11.md` (SVC-03); `.planning/research/v0.11/SUMMARY.md`; `82-UTILS-BOOTSTRAP-INVENTORY.md`, `82-STATE-OWNERSHIP.md`; `83-CONTEXT.md` D-08/D-10/D-11/D-15, `83-HUMAN-UAT.md`; `87-HUMAN-UAT.md` (findings F1-F5, required literals); `87-60` to `87-65-PLAN.md` (87-60 frontmatter and truths, 87-61 and 87-63 in full tasks, 87-62/64/65 objectives); `87-VALIDATION.md`, `deferred-items.md`
- Source read: `src/backend/launcher.ts` (all), `commandRunner.ts` (all), `launchSingleFlight.ts`, `launchEngineStep.ts`, `quitHandler.ts`, `gamescopeCommand.ts`, `knownFixLaunch.ts`, headers of the other known-fix modules, `spawnAsync.ts`, `utils.ts` (184-330, 960-1245, 1586-1610), `storeManagers/{legendary/games.ts launch, storeManagerCommon/games.ts}`, `process/types.ts`, `testUtils/engineWineOracle/{harness,spawnTrace}.ts`, `__tests__/engineWineShimSchedule.test.ts`, `enginewine/{wineCore,engineOnline}.ts`, `sidecar/{steamFlowRegistration,enrichmentFlowRegistration}.ts` (relevant parts), `sidecar/sidecarRpc.ts:105-160, 676-730`, `logger/targetWriter.ts`, `logger/index.ts`
- Rust read: `gamelib-proc/src/{lib,spawn,runner,spec,kill_tree,probe,job,children}.rs`, `gamelib-core/src/process.rs` (`ProcSpec`), `gamelib-engine/src/{sinks,launch/mod,launch/step}.rs` and `lib.rs` op list, `gamelib-wine/src/wine_cmd/{mod,command}.rs` and `tests/fixtures/golden/wine_command`, `gamelib-log/src/writer.rs`, `gamelib-core/src/paths.rs` (`LogTarget`), `src-tauri/src/{engine_dispatch,shell_state,sidecar,native_router}.rs`, `main.rs:380-460`, `src-tauri/crates/README.md` sections 2c, 6, 7, 8, `.github/workflows/rust-test.yml`
- `gsd-tools query package-legitimacy check --ecosystem crates ...` (all OK); `Cargo.lock` entries; `CLAUDE.md`; `Skill("gamelib-conventions")`; `Skill("spike-findings-gamelib")` (its requirements: engine order CrossOver first with Staging fallback on the same CX bottle, `CX_BOTTLE=<b> wine --demo-status` before every CrossOver launch and never without a timeout, tier-2 fixes as data via `AppDefaults\<exe>\DllOverrides`, `GST_PLUGIN_PATH` passes where `WINEDLLOVERRIDES` is dropped; all already implemented by 87 and unchanged by 88)

### Secondary (MEDIUM confidence)
- `graphify query` over the launcher symbols (node list only; confirms call-graph neighbours)

### Tertiary (LOW confidence, marked `[ASSUMED]` above)
- shlex npm/Rust parity, Windows Job and `GetProcessTimes` behaviour, `.bat` handling, PowerShell `-Wait` descendants, per-game-log privacy stance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, all crates are in-repo or already locked and legitimacy-checked
- Architecture: MEDIUM, the `ManagerHooks` seam and the capture-file design are recommendations that need a first-plan checkpoint and a stub-hook spike
- Pitfalls: HIGH for the items verified in source (D-06 premise, `spawn_game`, `start_time`, 50-chunk window, 60 s bound), MEDIUM for the Windows items
- Golden harness reuse: HIGH (read the harness and the replay pattern); the matrix floors are discretion

**Research date:** 2026-11-24
**Valid until:** about 7 days (the 87 gap plans change `launcher.ts`, `step.rs` and `env.rs` under this phase; re-read them before planning)




