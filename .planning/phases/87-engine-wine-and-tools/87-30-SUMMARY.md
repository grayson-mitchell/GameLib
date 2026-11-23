---
phase: 87-engine-wine-and-tools
plan: 30
subsystem: wine
tags: [rust, dxmt, macho-gate, boot-update, shutdown-registrant, d-06, d-17, golden-replay]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: install_or_update_tool with the DXMT download dialog text (87-27), the wine manager and its store (87-19, 87-20), the DXMT goldens and recorded exchanges (87-09), the engine's EngineCtx and WineCtx (87-28, 87-29)
provides:
  - gamelib_wine::tools::macho::{MachoScan, WinemacMetalCheck, check_winemac_metal_view_exports, UnavailableScan, ScriptedScan}, the winemac export gate behind an injected trait so gamelib-wine takes no domain-crate dependency
  - gamelib_wine::tools::dxmt::{get_latest, on_wine_installed, on_wine_uninstalled, on_releases_info, boot_update, spawn_dxmt_boot_update, DXMT_BOOT_BOUND}, DXMT's fetch, install into a wine-manager version, uninstall cleanup, releases handler and bounded boot task
  - WineCtx.macho (closed by default) and the shell's ShellMachoScan over gamelib-scan, installed by wine_dispatch::install
  - EngineCtx.online (Arc<AtomicBool>, starts false) with is_online/set_online/with_online, and op engine_set_online {online}
  - tests/golden_dxmt.rs replaying all 21 87-09 DXMT goldens, with golden/dxmt/deltas.json
affects: [87-31]

actuals:
  tokens: 20500
  tasks: 2
  commits: 2

plan_head_before: 2a1cfe427ab5104873f690e38d9b24544c362c38
plan_head_after: f26e7995dd58df4706ebdb83e2c909376f1793f1

tech-stack:
  added: []
  patterns:
    - "a domain scanner reached through an injected trait on the wine context, so the crate keeps no dependency on gamelib-scan and the gate fails closed until the shell installs the real scan"
    - "bounded boot work: the work holds the shutdown registrant itself, so aborting it on the bound or on exit releases the registrant with it; one log line carrying an outcome word only"
    - "one entry point per quirk: the listener keeps the TS offline behaviour its golden pins, the boot task takes the stricter one"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/tools/dxmt.rs
    - src-tauri/crates/gamelib-wine/src/tools/macho.rs
    - src-tauri/crates/gamelib-wine/tests/golden_dxmt.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxmt/deltas.json
  modified:
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/ctx.rs
    - src-tauri/crates/gamelib-wine/src/tools/mod.rs
    - src-tauri/src/wine_dispatch.rs

key-decisions:
  - "on_releases_info is the TS listener and keeps its offline quirk (the 'App offline' warning, then the copy, which rejects with no build installed) because the boot-fetch-offline golden pins it; boot_update, the body of the bounded task, returns early offline with the same warning, no scan, no request and no rejection"
  - "boot_update and spawn_dxmt_boot_update take the releases payload (the feed's DXMT tag); the plan's spawn_dxmt_boot_update(ctx, bound) had no source for the tag the TS compared against latest_dxmt"
  - "EngineCtx.online starts false, the TS monitor's first reading (check-online, not yet probed, behaves as not online)"
  - "DXMT_BOOT_BOUND is 60 s, twice the measured 27 s cold-boot download, so a slow link finishes and a stuck one is let go and retried next boot"
  - "a store-supplied installDir is written to only when its -DXMT copy lies strictly inside <tools>/wine, and uninstall and failed-copy removal go through gamelib-safety with that trust root"
  - "the per-file DEBUG 'Copying' lines have no sink (the engine log has no debug level), so they are skipped in the golden comparison and the copy is proven by the tree"

patterns-established:
  - "a golden harness that seeds a store the oracle mocked drops that store's file from the compared tree"

requirements-completed: [SVC-02]

duration: 14min
completed: 2026-11-23
---

# Phase 87 Plan 30: DXMT in the crates, unwired Summary

**DXMT's winemac export gate (through an injected MachoScan the shell implements over gamelib-scan), latest-release fetch, install into a wine-manager version, uninstall cleanup, releases handler and a bounded `wine-dxmt-boot` task now run in Rust with golden parity for all 21 87-09 cases, and nothing calls any of it until 87-31.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-23T09:17:16Z
- **Completed:** 2026-11-23T09:31:25Z
- **Tasks:** 2 of 2
- **Files:** 4 created, 5 modified

## Accomplishments

- **Tracer (Task 1):** `tools::macho` holds the `MachoScan` trait (`winemac_metal_exports(bundle) -> Result<WinemacMetalCheck, String>`). `check_winemac_metal_view_exports` fails closed: a scan that cannot answer becomes a failed check with the TS reason text, so a broken scanner skips DXMT. `WineCtx.macho` is `UnavailableScan` until the shell installs `ShellMachoScan`, which calls the same `gamelib_scan::dispatch("scan_winemac_metal_exports")` that `scan_dispatch.rs` answers for the sidecar. `gamelib-wine/Cargo.toml` still has no `gamelib-scan`. `tools::dxmt` ports `getLatest` (offline logs and skips), the 11-file copy, the recursive bundle copy (links kept as links), the plist `-DXMT` suffixes, `on_wine_installed` and `on_wine_uninstalled`. The golden replays cover the install-into-version cases first: gate passes, gate fails, scan rejects, other wine type, tools already present, download fails, malformed feed (no assets key), empty assets, feed 500.
- **Task 2:** `on_releases_info` (the `releasesInfoReady` listener, census before download, gate per copy, one fetch, copy into the passing copies) and `boot_update`. `spawn_dxmt_boot_update(ctx, info, DXMT_BOOT_BOUND)` runs `boot_update` on the crate runtime holding a `wine-dxmt-boot` registrant inside the work, abandons it after the bound or on exit, and logs one `DXMT boot update: <word>` line (`done`, `failed`, `timeout`, `shutdown`, `panic`). Unit tests drive a network that never answers: the bound cuts it off and `drain` then finds nothing held; an exit mid-flight ends it the same way; one started after exit began never starts. `EngineCtx.online` and op `engine_set_online {online}` (strict, one object, `<op>:bad-args` otherwise).
- **Not wired (D-06):** `manager::install` has no `on_wine_installed` call, `wine_releases_info_ready` does not call `on_releases_info`, and nothing starts the boot task. A grep of `crates` and `src` finds no caller outside `dxmt.rs` and the golden test, so the TS DXMT listener stays the single owner of the boot fetch and the releases event until 87-31 switches all three in one commit. The wine-install gap 87-20 opened stays open.

## Task Commits

1. **Task 1 (tracer): DXMT install into a wine-manager version behind an injected MachoScan gate** - `300f57481` (feat)
2. **Task 2: bounded DXMT boot update, releases handler and the engine online state, unwired** - `f26e7995d` (feat)

## Verification

- `cargo test -p gamelib-wine --features testing --test golden_dxmt`: 9 passed (all 21 cases through the listener entry points; the 8 online releases cases again through `boot_update`; the offline boot early return; manifest floor 21 and the empty-cases negative; the deltas list).
- `cargo test -p gamelib-wine tools::dxmt`: 13 passed; `cargo test -p gamelib-wine --features testing`: all suites pass (121 unit); `cargo test -p gamelib-engine --features testing`: all pass (58 unit incl. `engine_set_online`); `cargo test -p gamelib-engine-cli`: 8 passed.
- `cargo test --bin gamelib-shell wine_dispatch`: 30 passed (incl. `ShellMachoScan` over gamelib-scan); `engine_dispatch`: 19 passed.
- `cargo clippy -p gamelib-wine -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-wine -p gamelib-engine --check` and `rustfmt --edition 2021 --check src/wine_dispatch.rs`: clean.
- Acceptance: `grep -c "trait MachoScan"` = 1; `grep -c "gamelib-scan" gamelib-wine/Cargo.toml` = 0; `grep -c DXMT_BOOT_BOUND dxmt.rs` = 4; `grep -v '^\s*//' manager/install.rs | grep -c on_wine_installed` = 0.
- Mutation check: changing the plist suffix literal turned the install-gate-passes tree comparison red, then was restored.
- Prettier: Rust-only task; the one JSON file written (`golden/dxmt/deltas.json`) is prettier-ignored, so no check carries a vacuous green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The engine's online flag landed in Task 1**
- **Found during:** Task 1
- **Issue:** `get_latest` has to read the online state to be a faithful port, and Task 1's install path calls it; the plan put `EngineCtx.online` in Task 2.
- **Fix:** added the field, `is_online`/`set_online`/`with_online` to `EngineCtx` in the Task 1 commit; Task 2 added the op.
- **Files modified:** `src-tauri/crates/gamelib-engine/src/ctx.rs`
- **Commit:** `300f57481`

**2. [Rule 1 - Bug] The plan's offline wording contradicts its own golden**
- **Found during:** Task 2
- **Issue:** the plan says `boot_update` returns early when offline and also that it replays the offline golden; `boot-fetch-offline` pins that the TS listener warns and then goes on to copy and rejects.
- **Fix:** `on_releases_info` keeps the golden behaviour; `boot_update` returns early. Recorded as delta `offline-boot-returns-early`, with a test.
- **Files modified:** `dxmt.rs`, `golden_dxmt.rs`, `golden/dxmt/deltas.json`
- **Commit:** `f26e7995d`

**3. [Rule 3 - Blocking] The boot task needs the releases payload**
- **Found during:** Task 2
- **Issue:** `spawn_dxmt_boot_update(ctx, bound)` has no source for the feed tag the listener compares with `latest_dxmt`.
- **Fix:** `boot_update` and `spawn_dxmt_boot_update` take a `DxmtReleasesInfo` (the payload `wine_releases_info_ready` already receives).
- **Commit:** `f26e7995d`

**4. [Rule 2 - Missing critical functionality] Store-supplied paths are contained**
- **Found during:** Task 2
- **Issue:** the TS wrote into `<installDir>-DXMT` and `rmSync`'d it wherever the stored `installDir` pointed.
- **Fix:** copies are written only when strictly inside `<tools>/wine`; removal goes through gamelib-safety with that trust root (delta `half-made-copy-removal`, test `a_store_entry_outside_the_wine_dir_is_never_written_to`).
- **Commit:** `f26e7995d`

**5. [TDD note] RED not committed separately**
- Task 2's RED (the golden harness importing `on_releases_info`, `boot_update` and `DxmtReleasesInfo` before they existed) was observed as a compile failure and fixed before the commit; no failing-test commit was made, since the plan is `type: execute` and a non-compiling commit would break the tree.

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing critical) plus 1 TDD note
**Impact on plan:** all necessary for correctness or containment; no scope creep and nothing wired.

## Issues Encountered

None beyond the deviations. The seeded wine-manager store (the oracle held that list in a mocked store) left a `Library/.../wine-downloader-info.json` the goldens do not have; the harness drops that one file from the compared tree.

## Known Stubs

None.

## Threat Flags

None. `ShellMachoScan` reads a Wine bundle path through the existing gamelib-scan op; no new endpoint, auth path or schema.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-31 can wire the three DXMT hooks in one commit: call `on_wine_installed` and `on_wine_uninstalled` from `manager::install` and `manager::remove`, call `on_releases_info` from `wine_releases_info_ready` (a `dxmt` stamp must be read from the same payload), start `spawn_dxmt_boot_update(ctx, info, DXMT_BOOT_BOUND)`, and have the shell call `engine_set_online` as its online monitor changes (nothing sets it yet, so a Rust DXMT fetch would see `false` and skip).
- The `wine_releases_info_ready` op currently decodes only the five feed stamps; the `dxmt` stamp is read by `DxmtReleasesInfo` from the same JSON.

## Self-Check: PASSED

- FOUND: dxmt.rs, macho.rs, golden_dxmt.rs, deltas.json (created); engine ctx.rs and lib.rs, wine ctx.rs, tools/mod.rs, wine_dispatch.rs (modified)
- FOUND: `300f57481`, `f26e7995d` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
