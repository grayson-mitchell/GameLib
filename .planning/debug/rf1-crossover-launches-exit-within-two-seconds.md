---
status: investigating
trigger: "RF1: non-Steam CrossOver launches started by GameLib (engine=crossover reason=cx-healthy) exit within 1 to 2 s on the signed 0.13.1 build, while Wine-Staging launches and a shell-run of the logged command work."
created: 2026-11-25
updated: 2026-11-25
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
