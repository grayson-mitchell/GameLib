---
status: resolved
trigger: "RF1: non-Steam CrossOver launches started by GameLib (engine=crossover reason=cx-healthy) exit within 1 to 2 s on the signed 0.13.1 build, while Wine-Staging launches and a shell-run of the logged command work."
created: 2026-11-25
updated: 2026-11-26
---

# Debug: RF1, CrossOver launches exit within two seconds

Plan 87-72 diagnoses only. Nothing is fixed here: 87-77 fixes it, after the cause is named (the user's 2026-11-25
decision). Counts, names and `~` paths only; no token, no full args line, no home path.

## Symptoms

DATA_START
- **Expected:** Pressing Play on a non-Steam game whose engine is Automatic with a healthy CrossOver starts the game and
  keeps the launcher and game processes up until the game ends or Stop is pressed.
- **Actual (re-run 1, 87-69, signed 0.13.1; also 87-59 on 0.13.0):**
  - Trash Goblin (Epic, legendary), two presses: `engine=crossover reason=cx-healthy`, then `launch deadline for key <k>
    cancelled (launcher-exited)` 1 to 2 s later, no wine or game process left. 7 `launcher-exited` lines in launch 1.
  - Caravan SandWitch (Amazon, nile, own bottle): the same, nile `Process exited with code 1`.
  - Wine-Staging launches of the same games ran (1 launch).
  - The one CrossOver launch right after the pinned-to-crossover restore (launch 3) ran normally; the next two dropped again.
  - The nile command from a shell started the game, also under a minimal `env -i` env. An empty recreated shared prefix did not
    help.
- **Timeline:** seen first in 87-59 (0.13.0, the todo `2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command`),
  reproduced in 87-69 re-run 1 (0.13.1). 0.12.0 was never compared.
- **Reproduction:** every CrossOver launch of the two non-Steam games except the one right after the restore.
DATA_END

## Hypotheses

- **H1** The plain `cx-healthy` branch's overlay differs from the restore branch's in a field the spawn needs: the wine
  binary, `wineCrossoverBottle`, `winePrefix` or `wineVersion.type`.
- **H2** The TS env for a `crossover` wineVersion sets `CX_BOTTLE` but leaves a `WINEPREFIX` or `WINESERVER` from elsewhere that
  points away from the bottle (the O3 asymmetry: only `WINEPREFIX=<bottle dir>` reaches a CrossOver bottle's wineserver;
  `CX_BOTTLE` alone did not end it, `bottles/lifecycle.rs`).
- **H3** State between launches: a wineserver of another engine left running for the bottle, or a probe or kill of the bottle's
  wineserver right after the spawn. The restore's real switch kills the bottle's wineserver and restores the DXVK files
  (`bottles/switch.rs`, `kill_bottle_wineserver`, `restore`), which the plain branch (marker already crossover) skips.
- **H4** The spawn context: stdio pipes, process group or session, the parent. The shell replay worked, so something in how
  the sidecar spawns the command, not the command, would differ.

## Desk reproduction

Task 1 of 87-72. Two invariant files, both green at HEAD, no production file touched:

- `src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs` (6 cases). It builds the re-run 1 settings shape (stored
  `wineVersion` type `wine` named `Default Wine - Not Found`, `wineCrossoverBottle` the per-game bottle, `winePrefix` the shared
  default prefix, `engineOverride` automatic) over a healthy CrossOver laid out as real files under a fake HOME, and calls
  `engine_launch_select` for (a) the plain branch (bottle marker kind crossover, through `dispatch` with the real
  `prepare`) and (b) the restore branch (marker kind pinned, so the switch to CrossOver runs; `prepare` is scripted, the
  switch's own golden is 87-38, and the settings it is handed are recorded).
- `src/backend/__tests__/launcher.crossoverEnv.test.ts` (12 cases). It feeds each branch's `launchSettings` (the literal
  `RECORDED_SPAWN_SHAPE` copied from the Rust file, with the fake root as `/test/home`) into `setupWineEnvVars`, `getWineFlags`
  and `getWineFlagsArray`.

Every invariant held at HEAD, so none is committed in its expected-to-fail form (no `it.failing`, no `#[should_panic]`). Side
by side:

| Spawn-relevant field | Plain branch (marker crossover) | Restore branch (marker pinned, switch scripted) |
| --- | --- | --- |
| reply `kind`, `selection` | `use`, crossover `cx-healthy` | `use`, crossover `cx-healthy` |
| `launchSettings.wineVersion.type` | `crossover` | `crossover` |
| `wineVersion.bin` | `<CrossOver bin>/wine` | `<CrossOver bin>/wine` |
| `wineVersion.wineserver` | `<CrossOver bin>/wineserver` | `<CrossOver bin>/wineserver` |
| `wineVersion.name` | `CrossOver <build>` | `CrossOver <build>` |
| `wineCrossoverBottle` | the per-game bottle | the per-game bottle |
| `winePrefix` | the stored shared default prefix (unchanged) | the stored shared default prefix (unchanged) |
| `engineOverride` | `automatic` | `automatic` |
| settings handed to the switch | none (no switch) | equal to `launchSettings`, field for field |
| spawns inside the select | the `--demo-status` probe and the build read, all scripted, none stray | the same |
| TS env (`setupWineEnvVars`) | `CX_BOTTLE=<bottle>`, no `WINEPREFIX`, `WINESERVER` or `WINELOADER` | identical |
| store `--wine` (`getWineFlags`, `getWineFlagsArray`) | CrossOver's wine, no `--no-wine` | identical |

What held, which hypothesis it settles:

- **H1: ruled out at the desk.** Both branches build `launchSettings` through one function (`get_launch_settings` over
  `build_crossover_game_settings`), the fields above are equal, and the restore switch is handed exactly the settings the launch
  runs with. A difference between the branches is not in the reply.
- **H2: not shown by the env.** The env for a `crossover` wineVersion is `CX_BOTTLE` plus the generic variables; no
  `WINEPREFIX` or `WINESERVER` is set, so none points outside the bottle. It is not ruled out as a whole: the process
  environment (`process.env`) and `enviromentOptions` join the command env in the store (`legendary/games.ts`,
  `nile/games.ts`), and the live capture (D2, D3) is what reads them.
- **Observation, not asserted:** the nile launch passes `--wine-prefix <winePrefix>` (`nile/games.ts`, in `launch`), and
  `winePrefix` stays the shared default prefix on both branches, while `CX_BOTTLE` names the per-game bottle. The env carries
  no `WINEPREFIX`, so a `WINEPREFIX` would reach the wine child from nile's own flag, pointing away from the bottle (O3). It is
  not committed as an invariant because the shell replay of the logged command (which carried that flag) started the game; D3
  of the live capture settles whether it matters.
- **H3 and H4 have no desk form.** The restore switch's wineserver kill and DXVK restore, and the sidecar's spawn context,
  exist only live. D1 to D4 capture them.

Run: `cargo test -p gamelib-engine --features testing --test crossover_launch_shape` (6 passed),
`pnpm exec jest --runTestsByPath src/backend/__tests__/launcher.crossoverEnv.test.ts` (12 passed).

## Live capture

Task 2 of 87-72, 2026-11-25, installed signed 0.13.1 build, CrossOver 26.3.0, Trash Goblin (Epic, legendary) on its per-game
bottle. Session captures stay in the runner's scratchpad and are not committed; this section carries counts, process names,
pids, timings and `~` paths only.

- **D0 clean.** Before anything ran: 0 GameLib processes, 0 reapers, 0 wineservers. `ditto` copies of the two bottles (the
  legendary game's and the nile sibling's) taken into the session directory.
- **D1, GameLib launch 1 (operator: no window).** `engine=crossover reason=cx-healthy`. Process capture, 0.5 s samples:
  - t=4.5 s: a `wineloader` / `wineboot --init` / `wineserver` / `winemenubuilder` / `winedevice` set appears with parent
    pid 44402, which is the Rust shell (the sidecar is pid 44409, the reaper 44403). This is the demo-status probe: the log
    says `Engine: demo-status probe ... outcome=ok status=licensed elapsedMs=3089`, ending about 3 s later.
  - t=7.5 s to 8.0 s: `legendary` (ppid the sidecar, pgid the sidecar's) is alive for one to two samples, then gone.
  - After legendary: no `wineloader`, no `winewrapper.exe --run` and no game exe in any sample. The wineserver and its two
    `winedevice` hosts, already running since t=4.5 s, are the only wine processes, and they are gone at t=11 s (3 s after
    legendary, which is wineserver's own idle timeout once no client is left).
  - `gamelib.log`: one `Launching` line, one `launch deadline ... cancelled (launcher-exited)` about 2 s later, no
    `Process exited with code` error line (legendary exited 0). Just before legendary, the TS launch ran
    `--bottle <bottle> --verbose whoami` (`getCrossoverBottleFolder`).
  - legendary's own output ends at `Launching <appid>...` plus the update notice; it is the same text as in D3.
- **D2, the launch line.** Variable names only: `CX_BOTTLE`, `GAMEID`, `HEROIC_APP_NAME`, `HEROIC_APP_RUNNER`,
  `HEROIC_APP_SOURCE`, `LD_PRELOAD`, `LEGENDARY_CONFIG_PATH`, `STORE`, `WINEESYNC`, `WINEMSYNC`, `WINE_FULLSCREEN_FSR`. No
  `WINEPREFIX`, `WINESERVER` or `WINELOADER`. `CX_BOTTLE` is the game's per-game bottle. The wine binary is CrossOver's
  `bin/wine` (class: CrossOver). The command is `legendary launch <appid> --wine <CrossOver>/bin/wine --language en`, no
  `--wine-prefix` on this (legendary) line. The wine error lines of the game's own `launch.log` were not recorded in the
  session notes.
- **D3, shell replay (operator: window, game up).** The same command with `env -i` plus exactly the logged variables plus
  `HOME`, `USER` and a minimal `PATH`, working dir `~`, stdout to a file. Before it: 0 wine processes (a cold bottle).
  - `legendary` (pgid 48079) is alive t=1.5 s to 2.5 s, then exits (about 1 s, as in D1: legendary hands off and exits in
    both runs).
  - t=3.0 s: a `wineloader` appears with parent pid 1 in legendary's process group, together with a fresh `wineserver`,
    `wineboot.exe` and `winemenubuilder.exe`; t=4.0 s: it is `winewrapper.exe --run`, and the game exe is running; the Unity
    crash handler follows at t=8 s. All alive at t=29.5 s. The output file shows `msync: bootstrapped mach port` and
    `msync: up and running`, so the server was started under the launch's sync environment.
- **D4, not run.** The operator did not approve it, and D3 had already contradicted H4's spawn-command reading.
- **D5.** Nothing to restore: the D3 replay left the game running and the operator closed it.

What the capture shows, in one line: under GameLib the wine child of legendary never starts, with a wineserver already warm;
from a shell on a cold bottle it starts.

## Root cause

**Layer:** the bottle's state at the moment legendary spawns its wine child. On the plain `cx-healthy` branch the launch step's
own preflight probe starts the bottle's wineserver and nothing stops it, so the launch spawns against a warm server the probe
started with a different environment from the launch's. On the restore branch the engine switch kills that server before the
launch, so the launch starts a cold one. The branches differ in nothing else that reaches the spawn.

The chain, one hop per file:

1. `src-tauri/crates/gamelib-engine/src/launch/step.rs`, `select_engine_for_launch` (line 479) asks the launch decision
   (`decision/launch.rs`, `decide_launch_engine`) for the engine; that calls
   `src-tauri/crates/gamelib-engine/src/decision/preflight.rs`, `preflight_crossover` (line 213), which runs
   `probe_demo_status` through `run_probe`.
2. `src-tauri/crates/gamelib-engine/src/crossover/demo_status.rs`, `probe_demo_status` (line 189; the spec at lines 228 to
   247) spawns `<CrossOver bin>/wine --demo-status` with `CX_BOTTLE=<the game's bottle>` and the shell's inherited environment
   (`spec.replace_env` false in production). The probe has none of the launch's `WINEESYNC=1` / `WINEMSYNC=1`. A `--demo-status`
   run against a named bottle boots it: D1 shows `wineboot --init`, `wineserver`, `winemenubuilder` and two `winedevice` hosts
   with the shell as their parent, and the log's `elapsedMs=3089`.
3. The probe does not stop that server on success: `preflight_crossover` stops it only after a failed probe (`stop_wineserver`,
   defined at preflight.rs line 198, called from the retry loop at lines 266 to 281), and 59-REVIEW WR-07 forbids stopping it for a page read or while a
   game of the title runs. On the plain branch (marker already `crossover`) nothing else touches it.
4. `src/backend/launcher.ts` then runs the CrossOver bottle's `whoami` (`getCrossoverBottleFolder`, line 922, from
   `prepareWineLaunch`, line 1050) and the store spawns legendary with the launch env (`setupWineEnvVars`, `CX_BOTTLE` plus
   `WINEESYNC` and `WINEMSYNC`). Both reach the probe's warm server. In D1 legendary exits in under 1 s and no wine child ever
   appears.
5. The restore branch differs exactly here: `src-tauri/crates/gamelib-engine/src/bottles/switch.rs`,
   `prepare_bottle_for_engine_with` calls `kill_previous` (line 633; defined at line 302) before it restores the DXVK files
   (`restore`, line 729). That kills the probe's server, so the launch starts cold. This is the "launch right after the
   pinned-to-crossover restore ran normally, then the next two dropped" observation of re-run 1, and D3's cold start.

**What discriminates it from the other hypotheses:**

- **H1 (the two branches' settings differ): ruled out** by the Task 1 desk invariants. Every spawn-relevant field is equal on
  both branches, and the switch is handed the same settings the launch runs with.
- **H2 (a `WINEPREFIX` or `WINESERVER` from elsewhere): ruled out as the cause.** The D2 launch line carries neither. The
  re-run 1 launch right after the restore ran from GameLib with the same sidecar, the same process environment and the same
  stdio, and it worked. An environment or a spawn context that breaks the game would have broken that launch too.
- **H4 (spawn context: pipes, process group, session, parent): ruled out as the cause** by that same launch. The sidecar spawns
  legendary the same way on every branch (`src/backend/process/runner.ts`, not detached, tracked), and one of them works.
- **H3 as a teardown, GameLib killing legendary's process group or the bottle when the launcher exits: refuted by the code.**
  `launcher-exited` is the normal log of `end_engine_launch` (`launch/step.rs` line 985): it stops the watcher, clears the
  overlay context, cancels the deadline and drops the ledger entry; it kills nothing. `launcher.ts` reaches it from the
  `.finally` after the command resolves (line 456 onward). `kill_bottle_wineserver` is called only by the engine switch
  (switch.rs), the fallback bottle, per-game bottle removal and a failed preflight probe, and TS `shutdownWine`
  (`src/backend/utils.ts` line 965) only from a user Stop. The D1 capture agrees: the server dies 3 s after legendary, its
  idle timeout, not at legendary's exit. The `launcher-exited` line in the log is the symptom of legendary's early exit, not a
  cause.
- **H3 as bottle state: the surviving hypothesis.** D1 (warm server from the probe, no wine child, fails) against D3 (cold
  server, wine child starts, works), the restore-branch launch (cold after the switch's kill, works) and the plain-branch
  launches (warm from the probe, fail) all line up on one variable, and the desk table shows the two branches equal everywhere
  else.

**Confidence: medium at Task 3; raised to high by the isolating run below.** The discriminator that would make it certain was not run: D4 (the restore pattern, which also needs a
DXVK round trip on the real bottle) was not approved, and the one-step version below was not tried. Two things stay open, and
they matter for the fix:

- **Which part of "warm" breaks it.** The probe's server starts without `WINEESYNC` / `WINEMSYNC` while the launch sets both.
  The CrossOver `ntdll.so` carries `Server is running with WINEMSYNC but this process is not, please enable WINEMSYNC or
  restart wineserver.`, so a sync-mode mismatch between a server and a client is a refusal Wine itself raises; the reverse
  direction (the launch's `WINEMSYNC=1` against a probe server without it) was not read from Wine and is the assumed
  mechanism, not an observed one. The restore branch's DXVK restore is the other thing the plain branch skips, so the cause
  could be the server or the files; the process capture points at the server, since no file was changed between D1 and D3.
- **The nile line.** The nile launch passes `--wine-prefix <shared prefix>` (see the desk section). The nile symptom is `Process
  exited with code 1` where legendary exits 0, so it may carry a second contribution; D3 was run for legendary only.

**The isolating run (first step of 87-77, about 2 minutes with the operator, on a bottle copy or the real bottle with the
D0 `ditto` copy as the restore path):** from a shell, with the app closed and no wineserver running, run
`CX_BOTTLE=<bottle> <CrossOver bin>/wine --demo-status`, then at once the D3 command unchanged. Expected on this root cause: no
window and no wine child (the D1 shape). Then `wineserver -k` for the bottle and the D3 command again: a window. If the warm
run starts the game, this root cause is wrong and the status returns to `unresolved` with the sync environment and the DXVK
files as the next two suspects.

### Isolating run, done 2026-11-25 (orchestrator, operator present): confidence raised to high

Run from a shell with the app closed, on the real Trash Goblin bottle (D0 `ditto` copy as the restore path). 0.5 s `ps` samples,
30 s each, using the unchanged D3 command and env.

| Run | Bottle before replay | legendary | winewrapper `--run` | Game exe | Server |
|---|---|---|---|---|---|
| A (warm) | `wine --demo-status` (exit 0, `Standard version`): 1 wineserver up | t=1.0-2.5 s, exit 0 | never | never | gone at t=5.5 s |
| B (cold) | 0 wineserver | t=1.0-2.0 s, exit 0 | t=3.0 s on | t=3.5 s on, alive at 30 s | alive |

Run A reproduces the D1 shape outside GameLib, and run B starts the game. That is the prediction above, both ways: **a
wineserver left running by the demo-status probe is sufficient for RF1, and a cold bottle is sufficient to avoid it.** No file
changed between A and B, so it is the server and not the DXVK files. What stays open is the sync-mode mismatch as the exact
mechanism inside the warm server. It does not change the fix: stop the probe's server before launching, or start the probe with
the launch's sync env. The nile line is still not replayed.

## Fix scope

The fix is a state change at the engine step, not at the settings overlay or the TS env: before the launch spawns, a CrossOver
bottle that the launch step's own probe warmed must not be handed to the launch warm, and a launch that arrives with nothing
else running in that bottle starts from a cold server, as the restore branch's launch does.

- **Recommended layer: `src-tauri/crates/gamelib-engine/src/launch/step.rs`** (inside 87-77's files). After a healthy preflight on
  a branch that runs no switch, stop the bottle's wineserver through the existing `kill_bottle_wineserver` when
  `ctx.ledger.other_games_running(bottle, key)` is empty. It reuses the preflight's own guard (WR-07) and the restore
  branch's own kill, and the bottle's other running games keep their server.
- **Alternatives, which are outside 87-77's `files_modified`:** (a) stop the server inside `preflight_crossover` after a
  successful probe (`decision/preflight.rs`), or (b) run the probe with the launch's sync environment
  (`crossover/demo_status.rs`, the `spec.env` build at line 232). 87-77 stops and asks before editing either file.
  `launch/settings.rs`, `launcher.ts` and the TS test need no production change on this cause; the TS file is touched
  only if the fix changes what the launch spawns.
- **Red-first test (Rust, `crossover_launch_shape.rs`):** on the plain branch, after `engine_launch_select` returns `use`,
  the fake runner has recorded an `engine-wineserver-kill` spawn for the game's bottle, with `WINEPREFIX` the bottle's
  directory, and none when another game of the bottle is in the ledger. It fails at HEAD, because the plain branch records no
  kill (the restore branch records the switch's). Commit it expected-to-fail first, flip it with the fix.
- **Existing suites:** a golden that encoded "no kill on the plain branch" changes only with its reason recorded (87-77's
  D-16 rule). `offline_refusal`, `golden_launch` and `launcher.engineStep` must stay green.
- **Live proof** is re-run 2 item 3 (`87-RERUN-2-HUMAN-UAT.md`): two plain CrossOver launches in a row of Trash Goblin and
  Caravan SandWitch both stay up.

## Fix

87-77, 2026-11-25. The isolating run the record listed as 87-77's first step had already been done (commit `8f56d4a9b`, the
section above), so this plan started from `root-cause-named` with high confidence and did not repeat it.

- **Layer and symbol:** `src-tauri/crates/gamelib-engine/src/launch/step.rs`, `select_engine_for_launch`, the `on_bottle` block
  after `deps.prepare` returns and before the ledger marks the game running. A new helper `prepare_left_server_warm` answers
  whether the bottle's server may be the probe's: the pre-flight came back `Healthy`, the selection is CrossOver, the prepare
  outcome is `Prepared` and it did not switch (`switched` false). When it does and `ctx.ledger.games_running_in(bottle)` is
  empty, the step calls the existing `kill_bottle_wineserver` (CrossOver's own `wineserver -k`, `WINEPREFIX` the bottle's
  directory, `CX_ROOT` the bin dir's parent, capped by `KILL_TIMEOUT_MS`), exactly what the restore branch's `kill_previous`
  runs. Commit `3dc67f794`.
- **Guard stricter than the record's text:** the record named `other_games_running(bottle, key)`. The step uses
  `games_running_in(bottle)`, which also counts the launching game's own key, so a second Play on a game still marked running
  never stops the server under it. Both a running other game and the same game leave the server alone.
- **Not touched:** the engine decision, the offline gate, the refusal dialogs, `launch/settings.rs`, `launcher.ts` and the TS
  test (the cause is state, not the spawn shape: both branches already hand the launch the same `launchSettings` and env).
  `decision/preflight.rs` and `crossover/demo_status.rs`, the alternatives outside the plan's files, were not edited.
- **Tests, red then green** (`src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs`):
  - `the_plain_branch_stops_the_wineserver_its_own_probe_started_before_the_launch`: red at `7aeac966b` (`left: 0, right: 1`,
    the runner recorded only the `plutil` build read and the `--demo-status` probe, no `engine-wineserver-kill`), green at
    `3dc67f794`. It also asserts the kill runs CrossOver's `wineserver` with `-k`, `WINEPREFIX` the game's bottle, after the probe.
  - Guards, green before and after: no kill while another game runs in the bottle, none while the same game is marked running,
    none added after a switch that ran (the restore branch).
  - The 87-72 invariants (both branches hand the launch the same wine, bottle, prefix and `launchSettings`) and
    `launcher.crossoverEnv.test.ts` are unchanged and green; neither held an expected-to-fail form, so none was flipped.
- **Suites:** `cargo test -p gamelib-engine --features testing` (all), clippy `-D warnings`, `cargo fmt --check`,
  `launcher.crossoverEnv`, `launcher.engineStep`, `launcher_launchSingleFlight` (35 passed) and `pnpm codecheck` pass.
  `golden_launch` (8), `offline_refusal` (17) and `offline_state_verdict` (6) needed no golden change.
- **Phase 88.1 goldens:** a grep of `src-tauri/crates/gamelib-launch/tests/fixtures/golden/` for `wineserver`, `-k`,
  `engine-wineserver-kill`, `engine_launch_select` and `demo-status` finds no case that records the engine step's spawns. The
  fix changes a side effect of the engine step (one `wineserver -k` spawn), not a settings field or env variable the launch
  goldens carry, so no case records the pre-fix behaviour and no todo was created.
- **Still open:** the live proof (re-run 2 item 3, scored by 87-79: two plain CrossOver launches in a row of Trash Goblin and
  Caravan SandWitch stay up). The nile `--wine-prefix <shared prefix>` observation was not replayed and is not changed by this fix;
  if Caravan SandWitch still exits after it, that is the second contribution the record kept open.

## Live proof

2026-11-26, re-run 2 item 3 (87-79, signed 0.13.2, launch 1): four CrossOver launches held 78 s to about 10 min, 4 `cancelled (first-match)`, 0 `cancelled (launcher-exited)`; item 4's Stop ended the game and its wineserver within 2 s.
