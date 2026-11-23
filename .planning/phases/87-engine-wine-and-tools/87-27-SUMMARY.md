---
phase: 87-engine-wine-and-tools
plan: 27
subsystem: infra
tags: [rust, gamelib-wine, dxvk, dxvk-nvapi, vkd3d, golden-replay, tools, gamelib-safety, vulkan-helper]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 38 DXVK-family goldens and their recorded GitHub exchanges (87-09), the wine command core (87-21), the spawn/Fetch seams and extract_tar (87-06, 87-19), the engine tool-settings resolver and the DxvkInstaller trait (87-25)
provides:
  - gamelib_wine::tools::install_tool::install_or_update_tool (release feed, Fetch download, extract_tar, version file, guarded replacement of the old version and the archive)
  - gamelib_wine::tools::dxvk::{install_remove, restore, restore_strict, get_latest, install_remove_for_game} for dxvk, dxvk-nvapi, vkd3d and dxvk-macOS
  - gamelib_wine::tools::state::ToolsState (single-flight install slot, catalog cache, script metadata) held in WineCtx.tools
  - the WineRunner seam (tools ask the wine core for commands; HostWineRunner is the production one over run_wine_command) and ToolsHost (public dir, online, wine host)
  - op wine_dxvk_install_remove, crate-only with no caller (D-06)
  - golden_dxvk.rs replaying all 38 87-09 goldens, dxvk_incidents.rs with 37 ported behavioural tests, golden/dxvk/deltas.json
affects: [87-28, 87-29, 87-30, 87-34]

actuals:
  tokens: 38600
  tasks: 2
  commits: 3

plan_head_before: 72f82cd986bb353b20fd5be27670cbb7c30eb897
plan_head_after: 7c1085259c48f02e8fd71746bb7a2751a801354d

tech-stack:
  added: []
  patterns:
    - "a tool that asks the wine core for commands takes a WineRunner seam, so a golden records the commands at the TS runWineCommand boundary and production passes HostWineRunner over run_wine_command"
    - "settings stay a serde_json::Value through install_remove (the TS read three fields of a loose object) and are decoded to GameSettingsView only where wine runs, so an oracle bottle with a non-standard wine type still replays"
    - "a replay compares what the TS scheduler decided by canonicalising it: the concurrent block of log lines grouped by tool, the requests as a sorted set, both stated in deltas.json"
    - "every name read from an archive listing, a feed or a version file is one plain path component before a path is built; every tool-directory removal goes through remove_guarded with <tools>/<tool> as the trust root"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/tools/mod.rs
    - src-tauri/crates/gamelib-wine/src/tools/install_tool.rs
    - src-tauri/crates/gamelib-wine/src/tools/dxvk.rs
    - src-tauri/crates/gamelib-wine/src/tools/state.rs
    - src-tauri/crates/gamelib-wine/src/tools/vulkan.rs
    - src-tauri/crates/gamelib-wine/tests/golden_dxvk.rs
    - src-tauri/crates/gamelib-wine/tests/dxvk_incidents.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxvk/deltas.json
  modified:
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/ctx.rs

key-decisions:
  - "The wine commands are a seam (WineRunner), not a direct run_wine_command call: the 87-09 goldens record runWineCommand calls (commandParts, wait, resolveOnExit, the reg import file text), and the wine spawns under them are 87-08's goldens"
  - "install_remove returns Result<bool, DxvkError>: a missing latest_<tool> after getLatest (offline, failed download) is Err(MissingLatest), the TS rejection (87-09 finding 1); the op answers wine_dxvk_install_remove:missing-latest. 87-29's DxvkInstaller impl maps Err to false"
  - "get_latest does the tools one after another in the TS list order instead of together; the order of lines and requests across tools was a scheduler artifact in the goldens, so the replay groups the lines by tool and compares the requests as a set (deltas.json concurrent-tools)"
  - "DLL names are read sorted, the copies and the current_<tool> write finish before the call returns (87-09 finding 2), a feed failure does not stop the other tools"
  - "install_or_update_tool removes the replaced version and the archive through gamelib-safety with <tools>/<tool> as the trust root (D-17), refuses a feed asset name or a recorded version that is not one plain component and a download URL that is not https, and removes a failed extraction's partial tree; the TS kept old versions forever"
  - "The evidence lines (installing <tool> on... <prefix>, <tool> already installed!) and the Error removing <path> lines keep their TS text including the prefix path, because the goldens and the live gates pin them; they are the one place this module logs a profile path"
  - "tools::dxvk::install_remove_for_game resolves the settings through gamelib_engine::tool_settings::resolve_tool_settings_for_id (ensure_bottle false); no engine or bottle gives Ok(false)"

patterns-established:
  - "golden/dxvk/deltas.json: twelve named differences from the TS, asserted key for key by the replay test, each stating what the TS did, what Rust does and which golden field it touches"

requirements-completed: [SVC-02]

duration: 20 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "SC3, D-08: every 87-09 DXVK golden (38 cases: dxvk, dxvk-nvapi and vkd3d on Linux prefixes, dxvk-macOS on CrossOver and pinned-engine bottles, remove with and without DLLs, the strict restores, the Vulkan 1.3, 1.2 and no-GPU picks, offline, 32-bit and tilde prefixes, the toolkit and DXMT skips, the download failure with its showDialog) replays through tools::dxvk::install_remove over Replay with the golden's result, downloads, evidence lines, dialog, helper and tar spawns, wine commands, requests and tree"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_dxvk (the_macos_dxvk_install_replays_the_golden, every_dxvk_golden_case_replays)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-08 incident tests ported as behavioural Rust tests on a fake HOME with a recording wine runner: the 32-bit DLLs of a 64-bit prefix, every reg command finished before return and before wineboot -u, the pinned source, the CR-03 recopy and short-circuit, the strict restore's G30 findings (DLLs first, one reg import, exit-code verdicts, wineboot only when a stock DLL is missing, version file last) and the evidence-line facts; the source-text gates are dropped"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test dxvk_incidents"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-17: installOrUpdateTool downloads through Fetch, extracts through extract_tar as a Helper and removes the replaced version and the archive through gamelib-safety inside <tools>/<tool> only; a recorded version that walks out of the tool directory removes nothing, a link is unlinked and its target left, a failed extraction leaves no partial tree; tool state is in memory in WineCtx"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test dxvk_incidents (an_update_removes_the_replaced_version..., a_recorded_version_that_walks_out..., a_replaced_version_that_is_a_link..., a_failed_extraction...)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine --features testing --lib tools::state"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-06: no TS caller is switched; the op wine_dxvk_install_remove exists with no channel or caller, the TS tools path stays the only live DXVK path until 87-34, and the engine-trait implementation is 87-29"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-wine --features testing --lib the_dxvk_op_checks_its_arguments_and_answers_a_category_on_failure"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 27: DXVK, dxvk-nvapi and vkd3d in gamelib-wine Summary

**DXVK, dxvk-nvapi, vkd3d and the macOS DXVK install and remove run in Rust over Replay against all 38 87-09 goldens and 37 ported incident tests, with the release download extracted through extract_tar and the replaced version and archive removed through gamelib-safety inside `<tools>/<tool>`, wired to no caller.**

## Performance

- **Duration:** 20 min (about 2026-11-23T07:08Z to 07:28Z)
- **Tasks:** 2 of 2 (Task 1 tracer, Task 2 as RED then GREEN)
- **Files:** 8 created (5 source, 2 test, 1 fixture), 2 edited (`lib.rs`, `ctx.rs`)

## Accomplishments

- **Release download** (`tools/install_tool.rs`): `install_or_update_tool` in the TS order: skip another OS, ask the GitHub feed (the first asset, the macOS `-builtin` asset swapped for the repack), compare with `latest_<tool>`, download through `Fetch`, extract with `extract_tar` (a `Helper` child, `--strip-components` 1 or 0 for nvapi), remove the archive, write the version file, and on a failed download warn and show the DXVK or DXMT dialog through the UI sink.
- **Install and remove** (`tools/dxvk.rs`): `install_remove` for all four tools: the toolkit, DXMT and non-DXVK-on-Mac skips, the `~` prefix, the invalid-prefix `true`, the 32-bit warning, the `getLatest` lookup, the copies (synchronous and strict for a pinned source, per-file and logged otherwise), one `reg add native,builtin` per DLL name, the nvngx copy and `NGXCore` key for nvapi, `current_<tool>`; the toggle's remove (`reg delete` per override, DLL removal, `wineboot -u`) and `restore_strict` (DLLs first, one CRLF `reg import`, one exit-code-judged `reg query` per override, `wineboot -u` only when a stock DLL is still missing, version file last).
- **Vulkan helper** (`tools/vulkan.rs`): `physical-versions`, `instance-version` (both memoised per call) and `nvapi-path` through the spawn seam as bounded helper children; the Linux DXVK and VKD3D release picks by GPU Vulkan version.
- **State** (`tools/state.rs`, `ctx.rs`): `ToolsState` with a drop-released single-flight install slot, the catalog cache (a non-empty list only) and the script-metadata cache, one per `WineCtx`.
- **Replay** (`tests/golden_dxvk.rs`): the 87-09 profile layout, seeds, `Tap` over `Replay`, a tracing runner that scripts the Vulkan helper and runs `tar` for real, a recording wine runner; compares result, downloads, log lines, dialog, process spawns, wine commands, requests and the tree; MANIFEST floor 38 and an empty-list negative; `deltas.json` asserted key for key.
- **Incidents** (`tests/dxvk_incidents.rs`): 37 tests, including the guarded replacement over a replayed feed and the real `tar`.

## Task Commits

1. **Task 1 (tracer): DXVK install on a macOS bottle over Replay** - `8416dda90` (feat)
2. **Task 2 RED: failing remove, restore and incident replays over a stubbed restore** - `9c0e315a3` (test)
3. **Task 2 GREEN: remove, strict restore and the op checks, every golden and incident green** - `7c1085259` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (cargo test, clippy, fmt) and passed. Tracer verified end-to-end, expansion followed.

## TDD Gate Compliance

RED `9c0e315a3` precedes GREEN `7c1085259`; no REFACTOR commit.

- **RED evidence:** with the remove half stubbed to answer `false`, `cargo test -p gamelib-wine --features testing --test dxvk_incidents` gave 22 passed, 15 failed, and `every_dxvk_golden_case_replays` failed on `linux-dxvk-remove` ("the returned boolean", left `false`, right `true`). `cargo test` output is not a report format `gsd_run check tdd-red-evidence` reads, so the classifier was not run and this assessment stands in for it.
- **semanticAssessment:** the tests compiled and ran and failed on the planned assertions (a restore's removed DLLs, its `reg delete` and `wineboot` order, the strict restore's version file and exit-code verdicts, the golden's returned boolean). No build failure, zero-test run or fixture crash. Three of the 22 passing tests passed on the stub by construction (a strict restore that must be `false`: wineboot failing, a DLL that cannot be removed, a verify query with exit code 2); their positive twins (a strict restore that succeeds, and the same case with the surviving-override and exit-code checks mutated) fail on the stub or under mutation, which is what proves them after GREEN.

## Verification

- `cargo test -p gamelib-wine --features testing`: 113 unit, and 37 + 11 + 6 + 5 + 18 + 7 integration (`dxvk_incidents`, `golden_discovery`, `golden_dxvk`, `golden_runtimes`, `golden_wine_core`, `golden_wine_manager`), 0 failed; `cargo test -p gamelib-wine-cli`: 5 passed. `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check`: clean. `cargo check` of the shell: builds (one pre-existing `observe_live_url` dead-code warning).
- Acceptance: all 38 golden/dxvk cases pass (MANIFEST count 38, floor 38, needed 10); `grep -c remove_dir_all src-tauri/crates/gamelib-wine/src/tools/*.rs` sums to 0.
- Regression: `npx jest` over `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule` and `engineWineFixtureRedaction`: 4 suites, 336 tests passed (the redaction scan reads the new `deltas.json`).
- Non-vacuity by mutation: `native,builtin` changed to `native`, the `wineboot -u` argument changed, the archive removal dropped, the version-file removal dropped and the surviving-override check dropped each failed the replay or the incidents; all restored.
- No prettier check: every path written is Rust or a prettier-ignored fixture (`npx prettier --file-info` on `deltas.json` reports `ignored: true`).

## Deviations from Plan

### Auto-fixed Issues

None of Rules 1 to 3 beyond the items below, which the plan's threat register (T-87-28, T-87-29) asked for.

### Plan interpretation (not defects)

- **The wine commands are a seam.** The plan says the overrides are written "through `wine_cmd::run_wine_command`". `HostWineRunner` does exactly that; the trait in front of it exists because the 87-09 goldens record the calls at the TS `runWineCommand` boundary and a Rust golden cannot compare wine spawns to them.
- **"Resolve tool settings through gamelib_engine::tool_settings".** The TS `installRemove` is handed settings; the resolver belongs to its callers. `install_remove_for_game` resolves through `resolve_tool_settings_for_id` and then calls `install_remove`, which is the key link the plan names; `install_remove` itself takes settings.
- **"Removes the replaced version".** The TS kept every old version. The Rust removes the one a successful update replaces (D-17), after the new version is extracted and recorded; no golden updates over a download, so no golden tree differs.
- **The goldens are replayed with a profile placeholder table, not new fixtures.** `golden/dxvk/deltas.json` is the one new fixture file.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Findings for 87-29 and 87-34 (the 87-09 D-19 decisions this plan made)

1. A failed or skipped `getLatest` gives `Err(DxvkError::MissingLatest)` from `install_remove` (the TS rejection). 87-29's `DxvkInstaller` impl must map `Err` to `false`; 87-34's toggle must decide what the renderer sees for a rejected toggle (the TS rejected the IPC call).
2. The copies and `current_<tool>` are written before `install_remove` returns, so 87-34 needs no settle wait.
3. `ToolsHost` carries the public directory (the Vulkan helper), `online` and the wine host facts; 87-34 builds it from the shell the way 87-24 builds `WineHost`. With no public directory every Vulkan probe answers unknown and a Linux host gets the "no GPU" DXVK pick.
4. Finding 6 (dialog keys) is closed: the Rust dialog resolves through the catalog; the shell must supply the loaded catalog on the context.

## Issues Encountered

None blocking. The pre-existing `genI18nGateScope.test.ts` A-17 ANTI-ROT failure was left alone as instructed.

## Known Stubs

None.

## Threat Flags

None. The module's surfaces are the TS's: the GitHub release feeds, the archive download (now https-only), the `vulkan-helper` and `tar` helper spawns and the prefix files; the one removal path is gamelib-safety with `<tools>/<tool>` as trust root.

## Next Phase Readiness

87-29 implements `DxvkInstaller` over `install_remove` (and fills `EngineCtx.dxvk`); 87-30 (DXMT) reuses `install_or_update_tool` and its `dxmt` dialog branch; 87-34 flips every DXVK writer and builds `ToolsHost` in the shell.

## Self-Check: PASSED

All eight created files and both edited files exist on disk; commits `8416dda90`, `9c0e315a3` and `7c1085259` are ancestors of HEAD; the acceptance criteria and the plan-level verification were re-run green.
