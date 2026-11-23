---
phase: 87-engine-wine-and-tools
plan: 29
subsystem: wine
tags: [rust, dxvk, engine-trait, d-25, d-04, d-06, shell-wiring]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the engine-owned DxvkInstaller trait with DxvkRequest, DxvkTool and DxvkSource (87-06), tools::dxvk::install_remove returning Result<bool, DxvkError> with ToolsHost and the WineRunner seam (87-27), the shell's EngineCtx and its hooks (87-28)
provides:
  - gamelib_wine::tools::installer::WineDxvkInstaller (re-exported as gamelib_wine::WineDxvkInstaller) implementing gamelib_engine::dxvk::DxvkInstaller over install_remove; a DxvkError maps to false with its category word logged
  - the shell's ShellDxvk in engine_dispatch.rs, installed as EngineCtx.dxvk in place of NoDxvk; it resolves wine_dispatch::wine_ctx() on every call and answers false with one fixed log line before the wine context exists
affects: [87-34, 87-40, 87-41]

actuals:
  tokens: 14500
  tasks: 2
  commits: 2

plan_head_before: 475bc04baffc7b729c3e2467ca709e200b344783
plan_head_after: 6a5d938319ea8d73c102dc919aa35f593a7e2343

tech-stack:
  added: []
  patterns:
    - "an engine-owned trait implemented by the wine crate and injected by the shell through a call-time lookup of a later-built context, so neither a crate cycle nor a stale handle can form"
    - "a test-only constructor on the shell type (with_lookup) that replaces the static lookup and the wine runner, since a unit test has no AppHandle to fill the wine_dispatch static"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/tools/installer.rs
  modified:
    - src-tauri/crates/gamelib-wine/src/tools/mod.rs
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/tests/dxvk_incidents.rs
    - src-tauri/src/engine_dispatch.rs

key-decisions:
  - "WineDxvkInstaller carries a ToolsHost (default) and an optional Arc<dyn WineRunner> (None = HostWineRunner over host.wine) beside the Arc<WineCtx> the plan named, so the host facts and a scripted wine core can be supplied without changing the trait"
  - "ShellDxvk builds the ToolsHost per call from the shell's process environment (the crate may not read it); the Vulkan helper directory and the online answer stay at their defaults until 87-34 builds the full ToolsHost"
  - "the crate test builds a second EngineCtx over the same directories for the installer's context, because the wine context holds the engine context it was built from; the shell breaks the same loop with the call-time lookup"

patterns-established:
  - "DxvkError is the TS rejection; the bool trait cannot carry it, so the installer logs the category word only (T-87-09, T-87-21) and answers false"

requirements-completed: [SVC-02]

duration: 25min
completed: 2026-11-23
---

# Phase 87 Plan 29: WineDxvkInstaller and ShellDxvk Summary

**The engine's DxvkInstaller now has a real Rust implementation in gamelib-wine (WineDxvkInstaller over install_remove), and the shell installs it into EngineCtx.dxvk as ShellDxvk through a call-time wine-context lookup, with no crate cycle.**

## Performance

- **Tasks:** 2 of 2
- **Files:** 1 created, 4 modified

## Accomplishments

- **Tracer (Task 1):** `WineDxvkInstaller` implements `DxvkInstaller::install_remove` by calling `tools::dxvk::install_remove`; `Ok(done)` is the answer, `Err(DxvkError)` is `false` plus one warn line carrying the category word only. A crate test builds an `EngineCtx` whose `dxvk` is the installer and drives the macOS DXVK install golden case (`mac-dxvk-install-from-tools`) through `ctx.dxvk.install_remove`, asserting every file of the golden `tree.json` by path and sha256 (and that the prefix and tools directories hold nothing else), plus the three `reg add` calls. A second test pins the Err-to-false mapping.
- **ShellDxvk (Task 2):** resolves `wine_dispatch::wine_ctx()` at call time and delegates to `WineDxvkInstaller`; with no wine context it logs "DXVK install skipped: the wine context is not installed" and answers `false` (T-87-74). `build_ctx` installs `Arc<ShellDxvk>` in place of `NoDxvk` (zero `NoDxvk` references remain in `engine_dispatch.rs`). Shell tests cover the not-ready answer through the production lookup and through a lookup returning nothing, and a full call reaching gamelib-wine over a FakeHome with a pinned build (DLLs copied, `current_dxvk` written, one `reg add` per DLL name).
- Dependency direction holds: `cargo tree -p gamelib-engine | grep -c gamelib-wine` is 0.

## Task Commits

1. **Task 1 (tracer): WineDxvkInstaller behind the engine trait** - `5c54a2c0e` (feat)
2. **Task 2: ShellDxvk wired into the shell's EngineCtx** - `6a5d93831` (feat)

## Verification

- `cargo test -p gamelib-wine --features testing`: 113 unit, 39 + 11 + 6 + 5 + 18 + 7 integration, 0 failed; `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check`: clean.
- `cargo test --bin gamelib-shell engine_dispatch`: 19 passed; `rustfmt --edition 2021 --check src/engine_dispatch.rs src/wine_dispatch.rs`: clean. The shell's two non-snake-case test-name warnings are pre-existing.
- `npx jest` of `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`: 326 passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The installer needed a host and a runner seam**
- **Found during:** Task 1
- **Issue:** `install_remove` takes a `ToolsHost` and a `WineRunner`; the trait carries neither, and the plan's `WineDxvkInstaller { wine }` gave a test no way to script the wine core.
- **Fix:** added `host: ToolsHost` (`with_host`) and an optional runner (`with_runner`, `None` = `HostWineRunner`).
- **Files modified:** `src-tauri/crates/gamelib-wine/src/tools/installer.rs`
- **Commit:** `5c54a2c0e`

**2. [Rule 2 - Missing critical functionality] The shell's installer needs the process environment**
- **Found during:** Task 2
- **Issue:** with the default `ToolsHost` a wine command would run with an empty environment (no PATH, no HOME), and only the shell may read it.
- **Fix:** `ShellDxvk` builds the host per call with an `EnvSnapshot` of the process environment.
- **Files modified:** `src-tauri/src/engine_dispatch.rs`
- **Commit:** `6a5d93831`

**3. [Plan adjustment] `wine_dispatch.rs` unchanged; `lib.rs` re-export only.** The plan listed `wine_dispatch.rs`; `wine_ctx()` already exposed what the lookup needs, so nothing changed there. `lib.rs` gained a `WineDxvkInstaller` re-export. The tracer's test uses `ScriptedWine`-style scripting through the runner seam (the same boundary `golden_dxvk` records) rather than a `ScriptedSpecRunner`, and compares the golden tree by sha256 instead of reusing `golden_dxvk`'s private normaliser.

## Known Stubs

None.

## Threat Flags

None. T-87-74 is mitigated as planned (a call before the wine context exists answers false with a fixed line, never panics or waits); T-87-SC accepted, no new crate.

## Next Phase Readiness

The trait has its Rust implementation, but no TS caller is switched (D-06): it is called by the Rust engine switch and fallback bottle (87-40, 87-41), and 87-34 builds the full `ToolsHost` (public directory, online monitor, Darwin release) and flips the DXVK writers. Until then a DXVK install through `EngineCtx.dxvk` runs with the process environment, no Vulkan helper (Linux picks the "no GPU" DXVK) and `online: true`.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-wine/src/tools/installer.rs
- FOUND: commit 5c54a2c0e, commit 6a5d93831
