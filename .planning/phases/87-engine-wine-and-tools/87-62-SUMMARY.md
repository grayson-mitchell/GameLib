---
phase: 87-engine-wine-and-tools
plan: 62
subsystem: wine-manager
tags: [wine-manager, ipc-decode, store-push, ordering, svc-02, gap-closure, rust, tauri-shell]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-59 gate item 4 findings F2 (a never-installed release cannot be installed) and F4 (the Wine Manager list does not follow a Rust install or remove)"
provides:
  - "parse_wine_version: isInstalled, hasUpdate and installDir optional at the installWineVersion / removeWineVersion boundary; every other rejection unchanged"
  - "install_version never reads the renderer's installDir (V5): the directory is the store's own entry for an installed build, else the computed one"
  - "AfterStoreChanges emitter in engine_dispatch::build_ctx: wineVersionsUpdated is queued behind the store host's pending change events, so the renderer snapshot is patched before the list re-reads"
affects: [87-63, 87-69 re-run item 6]

actuals:
  tokens: 10600
  tasks: 2
  commits: 5

plan_head_before: 99e0cfc8cdc54781db81303c077b9e233d381a2e
plan_head_after: 926662404d5c3b400cf59727b6b9005cd7f441d9
commits: 5

tech-stack:
  added: []
  patterns:
    - "Order a direct crate push after a store change by queueing it on the host's dispatcher (StoreHost::post), never by a delay"
    - "Default absent state keys at the IPC boundary; keep type, bound, unknown-key and enum checks"

key-files:
  created: []
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/crates/gamelib-wine/src/manager/install.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/preload/__tests__/tauriTransport.test.ts

key-decisions:
  - "Parse decision (user decision 2, 2026-11-24): default the missing keys at parse, do not normalize at the store. The refresh merge and released builds store a never-installed entry without the three keys, and golden_wine_manager pins those bytes (D-07, D-08); defaulting at the boundary changes no byte on disk and keeps every other rejection."
  - "F4 is fixed in the shell's emitter, not in the store policy, the preload or the WineManager screen: the first red test names the push/notify ordering."
  - "An installed build is updated in the directory the store holds for it, not the renderer's copy."

requirements-completed: [SVC-02]

duration: about 20 min of executor wall clock
completed: 2026-11-24
---

# Phase 87 Plan 62: Never-installed wine install and the wine-manager list ordering Summary

**A never-installed release now installs from the Wine Manager (the decoder takes the stored entry's shape, the install ignores the renderer's directory), and `wineVersionsUpdated` leaves through the store host's own queue so the renderer's `wine-releases` snapshot is patched before the list re-reads it.**

## Accomplishments

- **F2: the decoder (Task 1, tracer).** `RELEASE_FIELDS` marks `isInstalled`, `hasUpdate` and `installDir` optional. A feed-shaped entry decodes; a present key of the wrong type (`isInstalled: "yes"`, `hasUpdate: 0`, `installDir: null` or 1), an `installDir` over 4096 units, an unknown key (`("0", "unrecognized_keys")`) and an unknown release type (`("0.type", "invalid_value")`) are rejected with the same path and code as before. The doc comments of `RELEASE_FIELDS` and `parse_wine_version` say why.
- **F2: the install.** End to end on a fake HOME over the golden feed (the recorded `GE-Proton9-27.tar.xz` and checksum file), the `installWineVersion` arm installs a never-installed stored entry: the store entry becomes `isInstalled: true`, `hasUpdate: false`, `installDir` = `<tools>/proton/GE-Proton9-27`, the archive is extracted, and the directory holds nothing but the install (no archive, no partial directory).
- **F2: the renderer's installDir (V5, T-87-106).** `install_version` used to take the release's `installDir` as the directory to create, extract into and, on an update, rename aside as a backup. It is no longer read. The directory is the store's own entry when that entry is marked installed and names one (`stored_install_dir`), otherwise `<install dir for the type>/<version>`. The golden install-overwrite cases are unchanged because the seeded entry and the release name the same directory.
- **F4: the located break and the fix.** See the root-cause section.
- **Golden.** `golden_wine_manager` 10 passed. A new test replays `install-checksum-match` with the three keys removed from the release and from the store it starts from, over the same recorded exchanges (no new recording), and compares store value, downloads, notifications, requests, events, spawns and tree with the keyed twin's golden. No expected fixture changed (`git diff --stat 99e0cfc8c..HEAD -- src-tauri/crates/gamelib-wine/tests/fixtures` prints nothing).

## F4 root cause

**Layer: the push/notify ordering in the shell.** The crate announces a wine-manager change with `wineVersionsUpdated` straight after `store::write`, directly through `ctx.engine.emitter`. The renderer's `wineDownloaderInfoStore` snapshot is patched by a `storeChanged` frame that the store host's dispatcher thread emits a moment later. The Wine Manager list re-reads the snapshot on `wineVersionsUpdated` (`handleWineVersionsUpdated`), so it re-read before the patch and showed the old state.

**Test red at HEAD, green after the fix:** `wine_dispatch::tests::a_wine_manager_install_and_remove_push_the_new_list_before_the_list_re_reads_it`. It builds the context with the shell's own `engine_dispatch::build_ctx` over a host with `install_renderer_push` installed, replays the golden feed, and records every `storeChanged` and `wineVersionsUpdated` frame in one recorder in arrival order, for an install and then a remove. At HEAD it failed 3 runs out of 3 with `wineVersionsUpdated` recorded first and the `wine-releases` frame second. With the fix it passed 6 runs out of 6.

Checked in the plan's order, each with its test or output:

- (a) mapping and allow-list: held. The recorded frame is `{store: "wineDownloaderInfoStore", key: "wine-releases", value: <list>, rev: 2}`.
- (b) one host and one store entry: held. After the install, the shell's own `fetch_blocking` for `wineDownloaderInfoStore` (what a tab switch or a re-hydrate reads) returns the new list at `rev` 2, so the crate's `open_cache` and the renderer's `open_row` share one entry.
- (c) the frame arrives, but after `wineVersionsUpdated`: this is the break.
- (d) the preload patch: held. `tauriTransport.test.ts` "a wine-manager list push patches the snapshot before its subscribers re-read it" feeds the recorded frame shape (with `rev`) and shows the snapshot patched, a newer rev replacing an older one, and an `onStoreChanged` subscriber reading the new list. It is green at HEAD, so the preload is not the cause.

**Fix:** `engine_dispatch::build_ctx` wraps the engine emitter in `AfterStoreChanges`. The one channel in `AFTER_STORE_CHANGES` (`wineVersionsUpdated`) goes through `StoreHost::post`, which runs the emit on the dispatcher thread after every change already queued (and at once on the caller's thread when the host has no listener). Every other channel is emitted directly, as before. Install, remove and refresh all announce through that channel. No sleep, timer or `Duration::from_millis` was added on this path.

**What this does not fully explain.** The 87-59 note that a tab switch also did not refresh is not reproduced by any test here: with the frame arriving late, a tab switch afterwards reads the patched snapshot, and the shell fetch and the preload patch both behave. The red test proves the ordering defect and the fix removes it; whether the live app showed a second, separate cause is for 87-69 re-run item 6 to confirm. If the row still does not flip there, the next layer to look at is the live webview's `listen` registration, which no unit test reaches.

D-10 (renderer untouched for the port) is unchanged: no renderer source was edited. The only renderer-side file touched is a jest test.

## Task Commits

1. **Task 1 (tracer): never-installed entry decodes and installs** - RED `f65d91771` (test), GREEN `cbf5f8927` (fix)
2. **Task 1 follow-up: native manifest vectors** - `265397009` (fix)
3. **Task 2 (TDD): F4 ordering** - RED `1ea2719eb` (test), GREEN `926662404` (fix)

`commits: 5` is the measured `git rev-list --count 99e0cfc8c..HEAD`; all five are this plan's.

## Tracer gate

Task 1 is `type="tracer"`. Auto mode is not active (`workflow.auto_advance` unset); `human_verify_mode` is the default `end-of-phase` and the task's `<verify>` is automated only, so the verify was re-run before Task 2: shell `wine_dispatch` 43 passed, `golden_wine_manager` 9 passed (10 after the twin test), `manager::` 26 passed, rustfmt and `cargo fmt` clean. Tracer verified end to end, expanded.

## TDD Gate Compliance

Task 2 carries `tdd="true"` in a `type: execute` plan. Sequence: `test(87-62)` RED `1ea2719eb`, then `fix(87-62)` GREEN `926662404`, no REFACTOR. The RED commit was made with `engine_dispatch.rs` restored to HEAD, and the target test was run at that state: 1 failed on its assertion `the list re-reads before the snapshot holds the new value` (not a compile error or zero-test discovery). Task 1's RED `f65d91771`: 3 failed on assertions, the first with `IpcValidationError ... 'installWineVersion' at 0.isInstalled` (the exact rejection of 87-HUMAN-UAT item 4 result (a)), the supplied-installDir test on `the supplied directory was used`. `gsd_run check tdd-red-evidence` has no adapter for `cargo test` text, as in 87-61; the assessment above is by hand from the real output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The install read the renderer's `installDir`**
- **Found during:** Task 1 (reading install.rs, as the action instructs)
- **Issue:** `install_version` took `release.installDir` as the directory to create, extract into and rename aside on an update. The plan's truth ("never taken from the renderer's argument, V5") and behaviour 4 require otherwise; with the three keys now optional the renderer could name any path.
- **Fix:** `stored_install_dir` reads the store's own entry before the install; `install_version` uses it or the computed directory. Not inserted into the stored entry by the install.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/manager/install.rs`
- **Verification:** `a_renderer_supplied_install_dir_is_never_where_the_install_goes` (red then green), golden install cases unchanged.
- **Commit:** `cbf5f8927`

**2. [Rule 3 - Blocking] `native_manifest_vectors_valid_accept_invalid_reject` failed after the decoder change**
- **Found during:** Task 2 (full shell suite)
- **Issue:** `nativeChannels.json` listed a release with no `isInstalled` and one with no `installDir` as invalid vectors for both channels.
- **Fix:** the type text marks the three keys optional, the two vectors move to valid, a feed-shaped valid vector is added; wrong-typed values stay invalid. `ipcSchemaSnapshot.json` regenerated (two lines, `pnpm gen:ipc-contract`; `check:ipc-contract` clean), and the `sidecarTransport.ts` doc comment says the three keys may be absent.
- **Files modified:** `src/common/types/ipc/nativeChannels.json`, `src/common/types/ipc/ipcSchemaSnapshot.json`, `src/common/types/sidecarTransport.ts` (none in the plan's `files_modified`)
- **Verification:** shell suite 868 passed; nine related jest suites 658 passed.
- **Commit:** `265397009`

**3. [Rule 3 - Blocking] The preload jest test lives in `tauriTransport.test.ts`, not `storeApi.test.ts`**
- **Issue:** `storeApi.test.ts` mocks the whole `tauriTransport` module, so it cannot exercise the snapshot patch. The plan's candidate file was wrong for that test.
- **Fix:** the test is in `src/preload/__tests__/tauriTransport.test.ts`; `storeApi.test.ts` is unedited but still run in the verify.

**4. [Plan wording] No new golden case folder**
- The plan allowed a new `golden_wine_manager` case. A new case needs a MANIFEST entry and an expected folder recorded from the oracle; a variant of `install-checksum-match` over its recorded exchanges proves the same thing with no new recording, so it is a test function, with its reason in its doc comment. One difference from the keyed twin is named and handled: the store file's bytes differ in key order only (a never-installed entry gets `installDir`, `isInstalled`, `hasUpdate` appended in the order the install sets them), so the file digest is dropped from the tree comparison on both sides while the store value is compared whole. The stored bytes of an unchanged list are unchanged.

**Parity note (D-16, D-06).** The old zod also required the three keys, so the defect was copied for parity and is fixed here as a gate finding.

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking), 1 plan-wording departure. **Impact:** none on scope beyond the three non-listed files in deviation 2.

## Issues Encountered

- `git checkout <file>` on a tracked path triggered a repo post-checkout hook that ran `pnpm install` (a banner, no tracked change), as in 87-61.
- The tab-switch half of F4 is not reproduced by a test (see the root-cause section); it is carried to re-run item 6.

## Known Stubs

None.

## Threat surface

T-87-106 (mitigate): presence relaxed, not shape; the install never uses a renderer-supplied directory. T-87-107: `is_allowed_store_field` untouched, no field admitted. T-87-108: ordering by the host's queue, no sleep or polling. T-87-SC: no new dependency (`Cargo.toml` and `Cargo.lock` untouched). No new threat flags.

## Next Phase Readiness

Re-run item 6 can check both halves live: install a never-installed release from the Wine Manager (F2), then see the row flip on install and on remove without a restart or tab switch (F4). The latter is the check on the unexplained tab-switch observation.

## Self-Check: PASSED

- Commits `f65d91771`, `cbf5f8927`, `265397009`, `1ea2719eb`, `926662404` are ancestors of HEAD.
- Files exist: `wine_dispatch.rs`, `engine_dispatch.rs`, `manager/install.rs`, `golden_wine_manager.rs`, `nativeChannels.json`, `ipcSchemaSnapshot.json`, `sidecarTransport.ts`, `tauriTransport.test.ts`.
- Plan verification: `cargo test --bin gamelib-shell` 868 passed (`wine_dispatch` 44, `store_native` 22, `engine_dispatch` 31); `cargo test -p gamelib-wine --features testing` all green (`golden_wine_manager` 10); `manager::` 26; `rustfmt --edition 2021 --check` and `cargo fmt -p gamelib-wine --check` clean; jest `storeApi` 8, `tauriTransport` 50, related suites 658; prettier `--check` clean on every written path that is not ignored (`ipcSchemaSnapshot.json` is generated and ignored); `pnpm run check:ipc-contract` clean.
- Acceptance: no fixture file changed; no `sleep`, `setTimeout` or `Duration::from_millis` line added on the push path.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
