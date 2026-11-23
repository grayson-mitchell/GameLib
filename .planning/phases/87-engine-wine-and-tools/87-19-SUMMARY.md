---
phase: 87-engine-wine-and-tools
plan: 19
subsystem: infra
tags: [rust, wine-manager, golden, replay, github-releases, sha512, gamelib-safety, gamelib-wine, storehost]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 19 wine-manager goldens recorded from the TS (87-07), the Fetch/Replay seam and the full EngineCtx/WineCtx (87-06), contained tar extraction and the guarded-replace pattern (87-17), EngineUi and the notification sink (87-18)
provides:
  - gamelib_wine::manager (releases, install, remove, store) and ops wine_manager_refresh, wine_manager_install, wine_manager_remove, wine_manager_list, wine_releases_info_ready, crate-only with no channel, shim or caller
  - golden_wine_manager.rs replaying all 19 87-07 goldens (4 refresh, 12 install, 3 remove) over Replay against store bytes, events, notifications, requests, spawns and tree
  - golden/wine_manager/deltas.json documenting the three cases where the Rust port deliberately differs from the TS (D-19)
  - WineCtx::arch / with_arch (the architecture seam GE-Proton asset picking reads)
affects: [87-20, 87-22, 87-31, every later Phase 87 wine port]

actuals:
  tokens: 34900
  tasks: 2
  commits: 4

plan_head_before: 998e6f8a3a8fd5cc55acf28488c6fb2a172e9645
plan_head_after: 1ecdf62f1ca87d4794fec143e8455ee7d717e1e3

tech-stack:
  added: []
  patterns:
    - "a store list kept as Json objects (not structs) so key order and unknown keys survive a read and write, and the golden's hash of the store file's bytes is a real check"
    - "a golden replay that compares a per-case field list and names the fields a documented delta changes (DELTAS in the test, deltas.json for the why), the two checked against each other"
    - "an op that owns the whole handler (notify, first progress, install, result notification, closing idle) so the shell flip in 87-20 is a decode and a call"
    - "guarded removal with the trust root derived from where the stored path lives (a direct child of an install folder), refusal stopping the operation"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/manager/mod.rs
    - src-tauri/crates/gamelib-wine/src/manager/releases.rs
    - src-tauri/crates/gamelib-wine/src/manager/store.rs
    - src-tauri/crates/gamelib-wine/src/manager/install.rs
    - src-tauri/crates/gamelib-wine/src/manager/remove.rs
    - src-tauri/crates/gamelib-wine/src/manager/testkit.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/deltas.json
  modified:
    - src-tauri/crates/gamelib-wine/Cargo.toml
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/ctx.rs

key-decisions:
  - "Removal's trust root is the install folder that holds the stored directory, not `<tools>/wine`: the plan's root cannot hold, because the goldens remove `<tools>/proton/GE-Proton9-27` and a Steam `compatibilitytools.d` install. The stored directory must be a direct child of `<tools>/wine`, `<tools>/proton`, `<tools>/game-porting-toolkit` or any `compatibilitytools.d`, which is then the gamelib-safety trust root; anything else is refused and the removal returns false with nothing changed"
  - "The three TS install bugs 87-07 recorded are fixed, not copied (D-19), each documented in deltas.json: aborting an update leaves the existing install (the existing directory is touched only after the archive is whole and checked); a failed extraction removes the half-made directory and restores the backup; a failing tar is an error"
  - "The op `wine_manager_install` takes `[release]` or `[release, {downloadProtonToSteam?, defaultSteamPath?}]`: the crate reads no settings file, so the shell supplies the two settings the TS read from `getSettings()`. A caller that owns a cancel calls `manager::install::install(ctx, release, settings, cancel)`; the op uses a token nothing cancels, so through the op only the app shutdown aborts"
  - "The backend bus events `wineVersionInstalled` and `wineVersionUninstalled` are not emitted by the Rust ops: they are the intra-phase DXMT gap 87-20 opens and 87-31 closes. The golden comparison drops the `event:*` entries and compares every renderer push"
  - "`wine_manager_refresh` accepts nothing, `null`, a bare boolean (the renderer's `refreshWineVersionInfo(fetch?)`) or `{fetch: boolean}`, and swallows every error like the TS handler; the repository list is an internal parameter (`update_wine_version_infos`) the goldens and `wine_releases_info_ready` use"
  - "The release `version` and the archive name are plain path components (the renderer sends them and they are joined onto a path); the TS joined them unchecked"
  - "GE-Proton asset picking reads `WineCtx::arch` (default the build's own), so a golden recorded under `process.arch = x64` replays the same on an arm64 Mac"

patterns-established:
  - "a sub-slice's goldens are replayed per op family in one test file, with the Tap deriving a download's HEAD and GET from the case's recorded exchanges (the replay's own finish proves each was made) and a StopAfterHead stand-in for the oracle's abort"
  - "expected notification text comes from the real English catalog while the run uses an empty one, so the op's inline defaults are checked against the locale file"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Wine-manager refresh in the crate: the seven feeds over Replay with the GameLib User-Agent, the per-type asset picks and -latest entries, the merge against the stored list, and the wine-downloader-info bytes through the StoreHost, with wineVersionsUpdated pushed"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_manager every_refresh_case (4 cases)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine manager::releases"
        status: pass
    human_judgment: false
  - id: D2
    description: "Install in the crate: sha512 checked when the feed has a checksum (a missing one warns and proceeds), progress as downloading, unzipping, idle, backup and restore, abort by cancel or shutdown leaving no partial dir, install and update notifications through ctx.engine.ui"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_manager every_install_case (12 cases, 3 with documented deltas)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine manager::install (cancel, shutdown, aborted update, bad version, no download link, log hygiene)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Removal of a wine-manager install reads the stored installDir only and goes through gamelib-safety, refusing a directory outside an install folder, unlinking a link without touching its referent, and refusing the install folders themselves"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_manager every_remove_case (3 cases, renderer installDir differs from the stored one)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine manager::remove"
        status: pass
    human_judgment: false
  - id: D4
    description: "The five ops exist in the crate's sorted table with strict argument shapes and no channel, shim or caller"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-wine (76 unit tests) and cargo test -p gamelib-wine-cli (op list equals gamelib_wine::OPS)"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 19: Wine-manager port Summary

**The wine manager runs in `gamelib-wine` end to end: the seven GitHub feeds merge into `wine-downloader-info` byte for byte, versions install with sha512, backup and restore, progress and notifications, and removal reads only the stored `installDir` through `gamelib-safety`, all 19 87-07 goldens replayed with three documented deltas where the TS was wrong.**

## Performance

- **Duration:** about 21 min (the start time was not recorded at the first call; this is bounded by 87-18's completion commit at 04:29Z and this plan's last code commit at 04:50Z)
- **Tasks:** 2 of 2 (Task 2 as RED and GREEN commits)
- **Files:** 8 created, 3 modified

## Accomplishments

- **Refresh (Task 1, the tracer).** `releases.rs` fetches each repository URL with `?per_page=<count>` and the axios `Accept` and GameLib agent, builds each release with `Obj::insert_js` in the TS assignment order (`version, type, date, disksize, release_notes_link`, then the type-specific `checksum` and `download`, `downsize`), picks assets as the TS did for each of the five types (GE-Proton by `WineCtx::arch`), prepends `<type>-latest`, merges with the stored list (the dropped `Proton-` prefix, `-latest` renames, an installed release a feed no longer lists kept, `hasUpdate` from a changed checksum) and sorts by date. A feed that fails is logged and skipped. The no-stored-list branch sorts the one array the TS aliased, so the returned list is the sorted one too (found by the first golden run). `wine_releases_info_ready` ports `updateWineListsIfOutdated` (Linux and macOS only, only a feed whose stored `-latest` is older).
- **Install and remove (Task 2).** `install.rs` owns the whole handler: start notification and first `progressOfWineManager`, the checksum asset, the install folder (`<tools>/wine`, `game-porting-toolkit`, `proton` or the Steam `compatibilitytools.d`), the download with the fetch seam's progress turned into `{status: downloading, percentage, avgSpeed, eta}`, the sha512 over the file, backup and rename, `extract_tar`, `du` for the size, the store entry rebuilt in the stored key order, `wineVersionsUpdated`, the result notification and the closing `idle`. It holds a `wine-install` registrant and races the caller's cancel and the app shutdown through one token. `remove.rs` removes the stored directory through `remove_tree` and unmarks the entry.
- **Goldens.** `golden_wine_manager.rs` (7 tests) replays every case over a `Replay` with a fake HOME seeded from `cases.json`, the store seeded through the host in the case's key order, `du` scripted as the oracle scripted it, `tar` real, `StopAfterHead` for the abort flow, and compares the result, store, downloads, notifications (English text from the real catalog), requests, events (progress runs collapsed, D-10), spawns and the tree, whose store-file hash is over the path-normalised bytes. The MANIFEST floor and the empty-cases negative are carried.
- **Non-vacuity by mutation:** reordering two `insert_js` calls failed the refresh tree hash; skipping the sha512 comparison failed `install-checksum-mismatch`; the macOS `du -sk` flag failed `install-checksum-absent`; dropping the `unzipping` push failed `install-checksum-match`. Each was restored.

## Task Commits

1. **Task 1 (tracer): refresh in the crate end to end** - `a00ae37e5` (feat)
2. **Task 2 RED: the failing install and remove replays and the documented deltas** - `51ffc03fb` (test); both new tests failed on `unknown op: wine_manager_install` and `wine_manager_remove`, the planned reason
3. **Task 2 GREEN: install and remove, guarded removal, abort and checksum** - `1ecdf62f1` (feat)

`commits: 4` in the frontmatter is what `git rev-list` measures from `plan_head_before`; one of the four (`15ccc3f43 docs(86): create gap closure plan 86-27`) is another process's commit on `main` that landed between Task 1 and Task 2. The plan's own commits are the three above.

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit and again with Task 2's superset, and passed. Tracer verified end-to-end, expansion followed.

TDD (Task 2, `tdd="true"` inside a plan of type `execute`): RED compiled and failed on its assertion for the missing op, not on a build or fixture fault. It was not submitted to the strict RED classifier because the plan is not `type: tdd`. GREEN made it pass; there was no refactor commit.

## Verification

- `cargo test -p gamelib-wine --features testing`: 76 unit tests, 5 `golden_runtimes` and 7 `golden_wine_manager` tests passed. `cargo test -p gamelib-wine manager::`: 26 passed. `cargo test -p gamelib-wine-cli`: 5 passed (its op table check follows `gamelib_wine::OPS`).
- `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check`: clean.
- `npx jest` over `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule` and `engineWineFixtureRedaction`: 4 suites, 261 tests passed (the regression suites the orchestrator named; the redaction scan reads `deltas.json` without a finding).
- Acceptance: `grep -c "wine_releases_info_ready" src/lib.rs` is 6 (at least 1); `grep -c "remove_dir_all" src/manager/remove.rs` is 0; MANIFEST count 19 (at least 10).
- No prettier check: every path written is Rust or a prettier-ignored fixture (`npx prettier --file-info` on `deltas.json` reports `ignored: true`).

## Decisions Made

See `key-decisions` above. The two that later plans lean on: the removal trust root is derived from where the stored directory lives and a refusal stops the operation (87-20 can call `wine_manager_remove` with just the version), and install settings arrive as an optional second argument because the crate reads no settings file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's removal trust root `<tools>/wine` cannot hold**
- **Found during:** Task 2 (porting `removeWineVersion`)
- **Issue:** the plan and `T-87-19` say the trust root is `<tools>/wine`, but `remove-stored-installdir` removes `<tools>/proton/GE-Proton9-27` and Proton can also live in a Steam `compatibilitytools.d`; with that root the golden case would be refused.
- **Fix:** the install folder holding the stored directory is the trust root, when it is `<tools>/wine`, `<tools>/proton`, `<tools>/game-porting-toolkit` or a `compatibilitytools.d`; the stored directory must be a direct child. Anything else (the folder itself, a deeper path, a path elsewhere) is refused (unit tests for six places).
- **Files modified:** `src-tauri/crates/gamelib-wine/src/manager/remove.rs`
- **Commit:** `1ecdf62f1`

**2. [Rule 3 - Blocking] A `WineCtx::arch` seam, which no listed file carries**
- **Found during:** Task 1
- **Issue:** the GE-Proton asset is picked by `process.arch`, which the oracle pinned to x64; a golden replayed on an arm64 Mac would pick the aarch64 asset.
- **Fix:** `Arch` and `WineCtx::arch` (default `Arch::host()`, a compile-time fact), `with_arch`; the golden pins `X64`.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/ctx.rs`
- **Commit:** `a00ae37e5`

**3. [Rule 1 - Bug] Three TS install bugs fixed instead of copied (D-19)**
- **Found during:** Task 2, from 87-07's findings 1 to 3
- **Issue:** aborting an update deleted the installed version, a failed extraction left the old tree as `_backup` beside a half-made install (the restore branch throws a `TypeError`), and a failing `tar` counted as a successful install.
- **Fix:** the existing directory is touched only after the archive is downloaded and its checksum passed; a failed extraction removes the half-made directory through `gamelib-safety`, renames the backup back and removes the archive; a failing tar (non-zero, or not startable) is an error with the error notification and no store write. Documented per case in `deltas.json` and checked against the test's `DELTAS` list.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/manager/install.rs`, `tests/fixtures/golden/wine_manager/deltas.json`
- **Commit:** `51ffc03fb`, `1ecdf62f1`

**4. [Rule 2 - Missing critical] Renderer-controlled names reach a path**
- **Found during:** Task 2
- **Issue:** the release `version` is joined onto the install folder and the archive name is taken from the download URL; the TS checked neither (T-87-20).
- **Fix:** both must be one plain path component (`plain_component`, `archive_file_name`), a bad `version` is `bad-args` before any notification, directory or request. Every delete in the install (a half-made directory, a backup) goes through `gamelib-safety` with the parent as the trust root; no `remove_dir_all` is called anywhere in `manager/`.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/manager/install.rs`, `mod.rs`
- **Commit:** `1ecdf62f1`

### Plan details that did not apply literally

- **`Cargo.lock` is unchanged.** The plan lists it; `sha2` was already a locked dependency of this crate (as a dev-dependency since 87-17), so moving it to `[dependencies]` rewrites no lock line.
- **`wine_manager_install` has no cancel argument.** The plan says the op "takes a CancellationToken"; an op decodes JSON, so the token is a parameter of `manager::install::install` and the op passes one nothing cancels (the app shutdown still aborts). 87-20's cancel-id map calls `install` directly or adds a token to its dispatch.
- **The wine-manager backend events are not emitted** (see key-decisions); the golden events compare every renderer push and drop the `event:wineVersionInstalled` and `event:wineVersionUninstalled` entries.
- **`wine_releases_info_ready` runs the refresh to its end** before answering, where the TS listener fired it and forgot it; a failure is logged, never raised.

**Total deviations:** 4 auto-fixed (1 bug, 1 missing-critical, 2 blocking). **Impact:** none on the goldens that cover the behaviour; the three D-19 deltas change only the fields `deltas.json` names.

## Issues Encountered

- The first refresh run failed `refresh-all-seven-feeds` on the returned list's order: with no stored list the TS sorts the same array it returns. Fixed in the port (`releases.rs`), not in the golden.

## Known Stubs

None.

## Threat Flags

None new. `wine_manager_install` fetches the release's `download` and `checksum` URLs, which the renderer sends (the TS did the same, T-87-20); they are neither logged nor placed in an error, and no channel reaches the op yet.

## Quirks copied for parity (for 87-22's D-16 todo)

The port copies, and 87-22's todo should list: the checksum asset is fetched even when the install is then skipped as already installed; an update whose stored directory has vanished fails at the backup rename; an install that finishes on disk but finds no store entry for its version ends as an error; the download is a single stream (A8, already 87-22's todo); a removal that `gamelib-safety` allowed but could not finish still marks the version as not installed.

## Next Phase Readiness

Ready for 87-20: five crate ops with strict argument shapes, no caller. 87-20 flips `refreshWineVersionInfo`, `installWineVersion`, `removeWineVersion`, the default-wine download in `utils.ts`, `config.ts`'s refresh and the `releasesInfoReady` listener in one plan. It must supply the two install settings (`downloadProtonToSteam`, `defaultSteamPath`) as the second argument or call `manager::install::install` directly, and it opens the DXMT gap (87-31 closes it).

## Self-Check: PASSED

- Created files exist: the six `manager/*.rs` files, `tests/golden_wine_manager.rs` and `tests/fixtures/golden/wine_manager/deltas.json`.
- Commits exist on `main`: `a00ae37e5`, `51ffc03fb`, `1ecdf62f1` (4 measured from `plan_head_before`, one of them another process's `docs(86)` commit).
- Acceptance criteria re-run and passing (see Verification).
