---
phase: 87-engine-wine-and-tools
plan: 23
subsystem: infra
tags: [rust, gamelib-wine, wine-discovery, mdfind, plist, golden, replay, default-wine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the discovery goldens (51 cases) and default_wine.json vectors recorded from the TS (87-08), the WineCtx and SpecRunner seam, the wine core and WineHost pattern (87-21), the wine-manager release list and its wineVersionsUpdated push (87-20)
provides:
  - gamelib_wine::discovery::{mac, linux, custom, default_wine, discover_alternatives, discover_crossover, DiscoveryHost, DiscoveryRoots, DiscoverySettings, SteamLibraries}
  - default_wine::default_wine_from_path and is_executable_file
  - ops wine_discover_alternatives, wine_discover_crossover and wine_default_wine, crate-only with no channel, shim or caller (D-06)
  - golden_discovery.rs replaying 51 discovery goldens and 8 default_wine vectors
  - golden/discovery/deltas.json documenting the five places the Rust discovery differs from the TS (D-19)
  - WineInstallation and WineKind serialise like the TS object
affects: [87-24, 87-26, Phase 88]

actuals:
  tokens: 21200
  tasks: 2
  commits: 3

plan_head_before: 559049a15a88c284bb4e5af06227f09b4d9f0899
plan_head_after: efef03ce397f57ee8bbe8c091a8c0534e58a0a94

tech-stack:
  added:
    - "plist 1 (XML reader only, default features off): already in Cargo.lock through tauri, a new direct dependency of gamelib-wine only"
  patterns:
    - "everything the TS read from the process, the settings and the Steam files (home, PATH, custom wine paths, showValveProton, the libraryfolders.vdf answer, config.json's path) travels in one serde-decodable DiscoveryHost the shell builds; the crate reads no environment"
    - "discovery spawns only mdfind (10 s) and `<wine> --version` (5 s) as argv arrays through the SpecRunner, with labels wine-mdfind and wine-version and the default 1 MiB output cap"
    - "the golden replay builds the stores in a second fake HOME so a case that stores a release list leaves the profile tree as the TS (which stubbed the store) left it"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/discovery/mod.rs
    - src-tauri/crates/gamelib-wine/src/discovery/mac.rs
    - src-tauri/crates/gamelib-wine/src/discovery/linux.rs
    - src-tauri/crates/gamelib-wine/src/discovery/custom.rs
    - src-tauri/crates/gamelib-wine/src/discovery/default_wine.rs
    - src-tauri/crates/gamelib-wine/tests/golden_discovery.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/discovery/deltas.json
  modified:
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/mod.rs
    - src-tauri/crates/gamelib-wine/Cargo.toml
    - src-tauri/Cargo.lock

key-decisions:
  - "DiscoveryHost carries the roots (home, config.json path, /usr/share/steam), PATH, the two settings and the Steam-library answer; the tools directory and user home come from ctx.engine.paths. The plan's `DiscoveryRoots { applications, user_applications }` has no counterpart: the TS reads no /Applications of its own (mdfind supplies the bundle paths, Wineskin and Whisky sit under the user home), so no such root exists to inject"
  - "default_wine_from_path takes two probes (is-executable for the wine, exists for the sibling wineserver) because the TS used access(X_OK) for the first and existsSync for the second; the plan named one"
  - "The Steam libraries are an input (`steam_libraries`, null for a failed read), not a gamelib-steamfiles dependency: the crate stays free of the Steam crates and the shell makes the read 87-26 already owns"
  - "plist (already locked through tauri) reads Info.plist and Whisky's version plist rather than a hand-rolled XML parser; the T-87-SC `no new crate` holds as it did for sha2"
  - "WineInstallation and WineKind gained Serialize (an absent field is left out, an empty string stays), so the op answers the same JSON the TS returned"
  - "Windows answers an empty list; the TS ran the Linux set there"

patterns-established:
  - "a replay that tells mac from Linux cases by op and platform and keeps a floor for each half, so the tracer's macOS replay and the later Linux replay are separate assertions over one case list"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "all 33 macOS discovery goldens (CrossOver by scripted mdfind, wine-on-mac, Wineskin, GPTK, system GPTK, Whisky, the mac aggregate order, getAlternativeWine on a Mac) replay with the same list, spawn trace and tree on a fake HOME"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_discovery every_mac_discovery_golden_gives_the_recorded_list_spawns_and_tree"
        status: pass
    human_judgment: false
  - id: D2
    description: "all 18 Linux discovery goldens (the tools and Lutris wines, Proton directories with UMU-Latest skipped, Steam libraries and Valve Proton, the default wine named by --version, custom paths gated by config.json, the full order, getAlternativeWine) replay with the same list, order, spawns and tree, including the tools/wine and tools/proton directories a fresh profile gets"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_discovery every_linux_discovery_golden_gives_the_recorded_list_spawns_and_tree"
        status: pass
    human_judgment: false
  - id: D3
    description: "all 8 default_wine.json vectors replay: wine on PATH with and without a sibling wineserver, the second PATH directory, first match wins, a symlink reported as the link, and not executable, PATH unset and no wine all giving Default Wine - Not Found"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_discovery every_default_wine_vector_gives_the_recorded_installation"
        status: pass
    human_judgment: false
  - id: D4
    description: "the three ops are crate-only and strict: wine_discover_alternatives takes one host object and refuses unknown fields, wine_discover_crossover and wine_default_wine refuse a bad argument with a fixed <op>:bad-args, and an empty release list is refreshed first with a wineVersionsUpdated push while a stored one is not"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing (golden_discovery op tests and discovery::tests)"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 23: Wine discovery in gamelib-wine Summary

**macOS and Linux wine discovery and the default wine from `PATH` now run in Rust against the 87-08 goldens (51 discovery cases and 8 default-wine vectors, all passing): CrossOver by a short `mdfind` Helper, wine-on-mac, Wineskin, GPTK, system GPTK, Whisky, the Linux set and custom paths, and the `getAlternativeWine` order, with every root, the `PATH`, the settings and the Steam-library answer injected, wired to no caller.**

## Performance

- **Duration:** about 35 min (2026-11-23)
- **Tasks:** 2 of 2 (Task 1 the tracer, Task 2 as RED then GREEN)
- **Files:** 5 source files and 1 test file created, `lib.rs`, `wine_cmd/mod.rs`, `Cargo.toml` and `Cargo.lock` edited, 1 fixture file (`deltas.json`) added

## Accomplishments

- **`discovery::mac`**: `crossover` (an `mdfind kMDItemCFBundleIdentifier = com.codeweavers.CrossOver`, the name from the plist version, the `wine` and sibling `wineserver` beside the bundle), `wine_on_mac` (the `<tools>/wine` directories then Spotlight's `*.wine` bundles, de-duplicated by path, `wine64` falling back to `wine`), `wineskin` (each `*.app*` with a `wine64` that reports a version), `game_porting_toolkit`, `system_gptk` (the first `wine64` under `game-porting-toolkit` outside `heroic/tools`, the TS regular expression written out by hand) and `whisky` (its version plist), plus `mac_wine_set` in the TS order. Every function answers an empty list off macOS.
- **`discovery::linux`**: creates `<tools>/wine` and `<tools>/proton` when missing, lists the tools and Lutris wines (with their `lib`, `lib32` and `wineserver`), Proton directories under the tools, the Steam libraries (`root/compatibilitytools.d`, `compatibilitytools.d`, and the two `steamapps/common` paths under Show Valve Proton) skipping `UMU-Latest*`, the default wine named by the first line of `--version`, and the custom paths; the order is Proton, wines, the default wine, custom.
- **`discovery::custom`** (`customWinePaths`, skipped when `config.json` is absent; a path ending `proton` is a Proton) and **`discovery::default_wine`** (`default_wine_from_path(path_var, is_executable, exists)`, `is_executable_file`).
- **`discover_alternatives` and `discover_crossover`**, and ops `wine_discover_alternatives`, `wine_discover_crossover` and `wine_default_wine`, sorted into `OPS`, strict-decoded with fixed `<op>:bad-args` errors. With no wine releases stored, `discover_alternatives` refreshes the list first through `manager::releases` and so pushes `wineVersionsUpdated`.
- **`golden_discovery.rs`** replays each case on a fake HOME with a scripted `mdfind` and `--version`, comparing the list (order included), the spawn trace and the tree; the MANIFEST count and floor, a floor per half (33 macOS, 18 Linux) and for the default vectors, and an empty list failing each.

## Task Commits

1. **Task 1 (tracer): macOS discovery, `discovery::custom`, the discover ops** - `011cba2cd` (feat)
2. **Task 2 RED: failing Linux and default-wine replays over stubs** - `073d12694` (test)
3. **Task 2 GREEN: Linux discovery and the default wine from PATH** - `efef03ce3` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase and the tracer's `<verify>` is automated only, so it was run end to end (cargo test of `golden_discovery`, clippy, fmt) before the commit and again as part of the final run; a mutation (`CrossOver - {version}` to `CrossOver {version}`) failed the replay and the two op tests and was reverted. Tracer verified end to end, expansion followed.

## TDD Gate Compliance

RED `073d12694` precedes GREEN `efef03ce3`; no REFACTOR commit (clippy's `cloned_ref_to_slice_refs` in a new unit test was fixed before the GREEN commit).

- **RED evidence:** `cargo test -p gamelib-wine --features testing --test golden_discovery` over stubs (`linux_wine_set` returns an empty list, `default_wine_from_path` answers `Default Wine - Not Found`): 8 passed, 3 failed. `cargo test` output is not one of the report formats `gsd_run check tdd-red-evidence` reads, so the classifier was not run and the semantic assessment below stands in for it.
- **semanticAssessment:** the target tests compiled and ran and failed on the planned assertions: `every_default_wine_vector_gives_the_recorded_installation` on `wine-with-wineserver` (left `Default Wine - Not Found`, right the recorded `wine` with its `wineserver`), `every_linux_discovery_golden_...` on `linux-set-fresh-profile`'s tree (left empty, right the five directories the TS created) and `the_default_wine_op_...` (left Not Found, right the recorded installation). No build failure, zero-test run or fixture crash. The eight passing tests were the mac replay, the manifest and floor guards, the deltas test and the two mac-side op tests, which the stubs do not touch.

## Verification

- `cargo test -p gamelib-wine --features testing --test golden_discovery` (11 passed), `cargo test -p gamelib-wine discovery::` (15 passed), `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check`: clean. The whole crate: 97 unit, 5 + 11 + 18 + 7 integration, 0 failed. `cargo check -p gamelib-shell`: builds (one pre-existing `observe_live_url` dead-code warning in `store_embed`, not this plan's).
- Acceptance: all 33 macOS goldens, all 18 Linux goldens and all 8 `default_wine.json` vectors pass; `MANIFEST.json` count 51 matches the cases and the `expected/` folders.
- Regression: `npx jest` over `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule` and `engineWineFixtureRedaction`: 4 suites, 290 tests passed (the redaction scan reads the new `deltas.json` without a finding). Nothing outside the crate names the new ops.
- Non-vacuity by mutation: the CrossOver name, the `UMU-Latest` skip, the proton-before-wine order, the execute-bit check, the `--version` rename and the directory sort each failed a replay; all restored.
- No prettier check: every path written is Rust or a prettier-ignored fixture.

## Deviations from Plan

### Auto-fixed Issues

None needed beyond what the tests themselves caught before a commit (the golden's `result.json` nests the list one level up from where my first assertion read it; a clippy lint in a new unit test).

### Plan interpretation (not defects)

- **No `applications` / `user_applications` roots.** The plan's `DiscoveryRoots { applications, user_applications, ... }` names roots the TS never reads: CrossOver, wine-on-mac and the system GPTK take their bundle paths from `mdfind`, and Wineskin and Whisky live under the user home the context already carries. `DiscoveryRoots` holds what the TS does read and the context lacks: `home` (`os.homedir()`, the Lutris directory, which can differ from `user_home` under Flatpak), `config_path` and `system_steam`. No test reads a real `/Applications` either way.
- **`discover_alternatives(ctx, host)` takes a `DiscoveryHost`** (the roots plus `PATH`, the two settings, the Steam-library answer and `scan_custom`), not the roots alone: the TS read each from the process or the settings, and the crate may not.
- **`default_wine_from_path` takes two probes**, not one (see key-decisions).
- **Custom paths "through the host"** is the settings the shell hands in (`DiscoverySettings.custom_wine_paths`), with `config.json`'s path in the roots deciding whether they are read.
- **D-19 deltas (documented in `golden/discovery/deltas.json`, five entries):** an unreadable bundle plist skips that bundle where the TS threw out of the rest of CrossOver's list and out of the whole of `getAlternativeWine` (wine-on-mac); the Steam libraries are an input, so the `steamfiles_read_library_folders` invoke events of the linux goldens are not compared (a test asserts that is the only golden event kind); Windows answers empty; a failing release refresh is logged and discovery goes on; the executable probe reads the mode bits where the TS called `access(X_OK)`. The list, spawn trace and tree are the goldens' in every case.
- **87-08 finding 6 (sorted directory order)** is how the Rust lists, so the goldens and the code agree; findings 4 (a CrossOver bundle without `wine` is listed) and 5 (system GPTK tries only the first match) are ported as the TS behaves and pinned by their goldens.
- **A refresh that cannot run** (a store that cannot be opened) is logged with a fixed line; the unit tests cover an empty list refreshing with a push and a stored one not.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

None. `pnpm find-deadcode` and `graphify update .` were not re-run: this plan changes Rust only.

## Known Stubs

None.

## Threat Flags

None. T-87-24 (discovered binary paths) is mitigated as the register says: discovery executes nothing it finds except `<wine> --version`, spawned as an argv array through the SpecRunner with a 5 s limit; custom paths arrive only in the host the shell builds from `config.json`. T-87-25 (`mdfind`) is mitigated: a labelled `wine-mdfind` spawn with a 10 s timeout and the 1 MiB output cap. T-87-SC: `plist` is already in `Cargo.lock` (tauri reads plists), so no new crate enters the tree. The crate reads no `/Applications`, no `/usr/share/steam` (left to the roots) and not the process `PATH` (handed in).

## Next Phase Readiness

87-26 serves `getAlternativeWine` natively: it builds the `DiscoveryHost` (the fake-profile-free real roots: `os.homedir()`, `config.json`'s path, `/usr/share/steam` on Linux, the process `PATH`, `customWinePaths` and `showValveProton` from the settings, and the answer of its `gamelib-steamfiles` `libraryfolders.vdf` read), switches `config.ts`, and deletes the TS discovery functions. `resolveCrossoverBinDirAsync` can call `wine_discover_crossover`, which needs no host. The default-wine rule for `getDefaultEngine` is `wine_default_wine` with the process `PATH`.

## Self-Check: PASSED

All seven created files and the four edited ones exist on disk; commits `011cba2cd`, `073d12694` and `efef03ce3` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
