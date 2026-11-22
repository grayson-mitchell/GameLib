---
phase: 85-store-host-config-and-versioned-migrations
plan: 15
subsystem: infra
tags: [typescript, rust, store, settings-family, settings-documents, mirror-cell, eviction, boot-migration, ownership]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-14 account flip and the family-flip pin pattern; 85-11 MirrorCell, MirrorRegistry and the jest disk sink; 85-10 store frames and the shell frame worker; 85-09 StoreHost (evict_path, Durability by kind) and store boot; 85-08 the settings/global and settings/game chains and the corpus-expected oracle bytes"
provides:
  - "storeOwnership.json families.settings true: every family is Rust-owned under GAMELIB_STORE=rust (store/config, config.json, every GamesConfig/<app>.json); store/migrations stays excluded"
  - "StoreHost::open_doc(key, path): a settings document opened under its own key (settings/global, GamesConfig/<app>), 2-space bytes with no trailing newline, the chain's version string, sync_all, replace-only (OpReject::NotReplace for set/delete/clear), plain-segment app names only"
  - "src/backend/stores/settingsDocs.ts: readSettingsDoc, writeSettingsDoc, settingsDocExists, prepareSettingsDoc, dropSettingsDoc (research Pattern 3); MirrorRegistry.peek/drop"
  - "GameConfig, GlobalConfig, engineConfig.readStoredGameConfig and steam readStoredTitleConfig read and write through the seam; D-22 first boot is one replace frame served from memory"
  - "store_boot opens and migrates config.json and every GamesConfig/*.json under its document key before the sidecar spawns, inside the 85-09 bound, and reports read-only documents by key"
  - "Eviction on reset and uninstall: rpc_safety_remove_tree pauses the frame worker, evicts open stores and dooms queued frames under every removed app-data target; the uninstaller drops the document's cell on `removed`"
affects: [85-16, 85-17, 85-19, 85-20, 85-21, 85-24]

plan_head_before: ded5f3e96a72fc50a53ac99c599959f6628db528
plan_head_after: 3eafd38136b0edfec1afe31b802a16c46b7ba89b
commits: 3

actuals:
  tokens: 35800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A settings document is a MirrorCell keyed by its document key and written whole: one `replace` frame per flush; the shell owns the bytes and the version stamp"
    - "One read/write seam for files read outside the store classes: the cell's view when the shell owns the file (pending writes included), today's disk read and writeSettingsFile when TS owns it"
    - "A destructive removal that can delete Rust-owned files pauses the frame worker across the delete and the eviction, and dooms the frames already queued for the deleted paths (refused `evicted` in queue order) instead of keeping a tombstone, so a later write to the same path is a new document"
    - "Optional storeRoot threaded beside versioning: absent means TS-owned over versioning, so tests that build services bare keep their behaviour"

key-files:
  created:
    - src/backend/stores/settingsDocs.ts
    - src/backend/stores/__tests__/settingsDocs.test.ts
    - src/backend/stores/__tests__/settingsFamily.test.ts
  modified:
    - src/common/types/ipc/storeOwnership.json
    - src-tauri/crates/gamelib-store/src/host.rs
    - src-tauri/crates/gamelib-store/src/ops.rs
    - src-tauri/src/store_dispatch.rs
    - src-tauri/src/store_boot.rs
    - src-tauri/src/safety_dispatch.rs
    - src/backend/game_config.ts
    - src/backend/config.ts
    - src/backend/engine/engineConfig.ts
    - src/backend/storeManagers/steam/titleSettings.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/stores/mirrorCell.ts
    - src/backend/testUtils/diskStoreSink.ts
    - src/backend/storeVersioning/readOnlyStores.ts
    - src/common/__fixtures__/storePolicyVectors.json
    - src/backend/sidecar/bootstrap.ts

key-decisions:
  - "Settings documents open through a dedicated StoreHost::open_doc under the document key, not open_row under the settings/game pattern row: the frame worker, the boot sweep and a read-only report then all name the same store the sidecar's cell is keyed by (GamesConfig/<app>), and the replace-only rule lives with the flavour"
  - "A path that is not the document's table path under root.userData stays TS-owned in rust mode (the shell would never open it either), so there is still exactly one writer per file; a game name that is not one plain segment is refused under the Rust owner rather than falling back to TS, because '../config' resolves to the global document the shell owns"
  - "readSettingsDoc creates a cell only for a file that exists (or on the first write), so 'absent' stays distinct from an empty document and GameConfig's new-game defaults (disableUMU) behave as before"
  - "Eviction dooms the frames queued at the moment of the removal (the shell's stdout reader is in order, so every write the sidecar sent before the removal request is already queued) and pauses the worker across delete+evict; no seq tombstone is kept, so a write after the removal (a reinstalled game) is applied as a new document and a restarted sidecar's seqs are never refused"
  - "areaForStoreKey maps GamesConfig/<app> to game-settings (the shared vector row changed from app-data), because the shell now reports per-game documents by their own key; 85-16's Rust port reads the vector"
  - "The D-15/D-20 resync needed no code change: once configStore is mirror-backed it writes store/config `settings` as one set frame through the mirror"

patterns-established:
  - "A test that needs global config or GameConfig without the logger mocked runs fine on the real logger and compatibility_layers; a new jest.mock spends the jestMock ratchet, which has no headroom"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "The settings family is Rust-owned behind the flag: configStore, config.json and GamesConfig/<app> are mirror-backed (frames) under GAMELIB_STORE=rust and TS-owned (no frame) under ts; every ownership pin moved to the four-family state"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/settingsFamily.test.ts#the settings family (3 settings rows)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot::tests::the_embedded_ownership_file_parses_and_flips_every_family"
        status: pass
      - kind: unit
        ref: "storeOwnership.test.ts, tauriShellSource.test.ts, cacheFamily/userStateFamily/accountFamily.test.ts pins"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tracer: a GameConfig flush is one replace frame on GamesConfig/<app> whose valueJson carries version v2, readSettings returns it before any ack, the shell side writes 2-space bytes with no trailing newline, set/delete/clear on a document are refused, and a path-like app name never reaches a frame or a file"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/settingsDocs.test.ts#the tracer: one per-game setting end to end under GAMELIB_STORE=rust"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store host::doc_tests (5 passed)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_frame (settings document cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-22: a fresh profile's GlobalConfig sends one replace frame for settings/global and getSettings returns the factory defaults from memory before any ack; an existing config.json is read through the seam and a setSetting flush is one replace of the whole document"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "settingsFamily.test.ts#GlobalConfig on the settings-document seam"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-15/D-20: the config.json-wins resync stays in TS and writes store/config `settings` through the configStore mirror with mirror-only keys kept; settingsMirrorResync.test.ts unchanged and green"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "settingsFamily.test.ts#D-15 / D-20: the config.json-wins resync runs in TS through the configStore mirror"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/settingsMirrorResync.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Research A4 at boot: every older corpus config.json (5) and GamesConfig document (51) is migrated by open_all with one backup holding the stored bytes and migrated bytes equal to the TS oracle; documents are reported read-only by document key; the sweep honours the file and time caps; ts mode touches none"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot (store_boot_migrates_every_older_settings_document_before_spawn, store_boot_reports_a_settings_document_by_its_document_key_and_ts_mode_opens_none, store_boot_settings_documents_respect_the_boot_bound)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The engine's and the Steam title's direct per-game readers see a document written a moment earlier through writeSettingsDoc (before any ack); without a root they read the file as before"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "settingsFamily.test.ts#the direct per-game readers see a document written a moment earlier"
        status: pass
    human_judgment: false
  - id: D7
    description: "T-85-38: a removed app-data target evicts open stores and dooms queued frames (refused evicted, nothing recreated, the drain included), a later write is applied as a new document, a refused removal evicts nothing; the uninstaller drops the cell on `removed` (and sends a pending document), keeps it on a refusal"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell safety (safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated, safety_a_refused_removal_evicts_nothing)"
        status: pass
      - kind: unit
        ref: "settingsDocs.test.ts#uninstall drops the settings cell when the removal reports removed (T-85-38)"
        status: pass
      - kind: unit
        ref: "mutation run by hand: removing the dropSettingsDoc call made 2 of the 3 uninstall cases fail"
        status: pass
    human_judgment: false
  - id: D8
    description: "Settings written by the shell on the operator's real profile: preferences, per-game settings and a reset or uninstall behave as before with no lost or resurrected setting"
    requirement: FND-06
    verification: []
    human_judgment: true
    rationale: "No automated test joins a real shell, a real sidecar and a populated profile with the settings family on; that is the macOS live gate of 85-20, and a wrong settings write resets a user's preferences."

duration: 34 min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 15: Settings family flipped to the Rust owner Summary

**store/config, config.json and every GamesConfig document are now Rust-written behind `GAMELIB_STORE`: documents open under their own key in a replace-only `StoreHost::open_doc`, every TS reader goes through one `readSettingsDoc` seam that sees pending writes, Rust migrates all documents at boot before the sidecar spawns, the D-22 first boot is a single replace frame served from memory, and a reset or uninstall can no longer be undone by a queued write.**

## Performance

- **Duration:** about 34 min (2026-11-22T00:16Z to 00:50Z, most of it full-suite and gate runs)
- **Tasks:** 3 (one tracer, two TDD-flagged auto)
- **Files modified:** 47 (3 created)

## Accomplishments

- **The flip (D-01, last).** `storeOwnership.json` is `{cache, user-state, account, settings}: true`, no per-store override. The pins moved again: `tauriShellSource`, `storeOwnership`, `store_boot` (renamed `..._flips_every_family`), `cacheFamily`, `userStateFamily`, `accountFamily`. `storeWritePath`'s "another store stays on conf" example moved to `store/migrations`, the only store Rust never opens.
- **Documents in the host.** `StoreHost::open_doc(key, path)` opens `settings/global` or `GamesConfig/<app>` as a settings-flavour store named by that key. It writes 2-space with no trailing newline and stamps the chain's `version: 'v2'` where the key sits. Writes are `sync_all`ed, and only a whole-document `Replace` applies (`OpReject::NotReplace` otherwise). An app name that is not one plain segment is `InvalidInput` before any path is used. The frame worker opens documents through it. The dispatcher already refused a path-like `GamesConfig/` key as `store-key` before queuing.
- **One TS seam (Pattern 3).** `settingsDocs.ts` handles a Rust-owned document (rust mode, family on, the table path under `userData`) as a `MirrorCell` keyed by document key. Reads are the cell view, writes are one `replace`. Anything else takes the old path: `readFileSync`, `ensureSettingsMigrated`, `writeSettingsFile`. `GameConfig.readSettings`/flush, GlobalConfig load/getSettings/flush, `readStoredGameConfig` and `readStoredTitleConfig` all use it. `GameConfig`'s `existsSync(configPath)` check became `settingsDocExists`, so a pending global write counts.
- **D-22.** On a fresh profile, `GlobalConfig.load` finds no document, `resetToDefaults` sends one replace frame, and every `getSettings` is served from `this.config`. A second boot reads the written document back.
- **Boot sweep (research A4).** `store_boot` opens `config.json` and every `GamesConfig/*.json` through `open_doc` under the document key. It skips a stem that no frame could name and reports read-only documents by key (`GamesConfig/480 newer`). `createGlobalConfig`/`createGameConfigs` migrate only when TS owns the file. The "never sweeps GamesConfig/ at boot" comment now says who migrates in each mode.
- **Eviction (T-85-38).** `rpc_safety_remove_tree` holds a pause on the frame worker across the delete. On `removed` it calls `store_boot::host().evict_path` and `store_dispatch::evict_queued` for each `app-data` target. Open stores refuse writes. Frames already queued for files under the target are answered `refused`/`evicted` in queue order and never applied, so `store_boot::drain` cannot recreate them either. `uninstaller.ts` calls `dropSettingsDoc` when the settings removal reports `removed`, and it sends a written-but-unapplied document as present.

## Task Commits

1. **Task 1 (tracer): flip, open_doc, settingsDocs.ts, GameConfig on the seam** - `8897aadcc` (feat)
2. **Task 2: GlobalConfig, D-22, the engine/Steam readers, boot sweep by document key** - `eb688bfb6` (feat)
3. **Task 3: eviction on reset and uninstall, plan-end gates** - `3eafd3813` (feat)

`commits: 3` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`.

**Plan metadata:** recorded in the docs(85-15) commit that follows this file.

## Signature changes (threaded root, per the plan's instruction)

`storeRoot` (or `root`) is optional everywhere. Absent means TS-owned over `versioning`, exactly as before.
- `createGlobalConfig` / `GlobalConfigDeps.root`, `createGameConfigs({ root })`, both wired from the boot's store root in `bootstrap.ts`.
- `EngineConfigDeps.storeRoot` (so `ConfigPathDeps` and `configPathDepsFrom(source.storeRoot)`), `EngineServices.storeRoot`, `RunnerDeps.storeRoot`, `EngineServicesSource.storeRoot`, `ToolsDeps.storeRoot`, `LauncherDeps.storeRoot`, `EngineFlowDeps.storeRoot`, the wine-tools registration deps, `steamDecisionServices`/`steamDecisionDeps` picks, `readSteamEngineOverride`'s deps, and the `gameEngineState` picks.
- `ManagerDeps.storeRoot`, `CreateStoreManagersDeps.storeRoot`, `managerDepsFromServices`, the uninstall flow's deps literal, and `UninstallerDeps`/`AppDataRemovalDeps` picks.
- `readStoredTitleConfig(appId, { paths, storeRoot? })`. `readStoredOverlayOverride` takes the same deps.

## Verification

At the last code commit:
- **Jest:** `pnpm exec jest src/backend src/common` passed 653 suites (3 skipped) and 14676 tests. The Task 3 suite set (`src/backend/stores`, `src/backend/__tests__`, `settingsFlows`, `src/backend/utils`, `testUtils`, `storeManagers/steam`) passed 7757. `settingsDocs.test.ts` passed 13, `settingsFamily.test.ts` 10, `settingsMirrorResync.test.ts` 7.
- **Rust:** `cargo test --bin gamelib-shell` passed 657 (0 failed). `store_boot` passed 22, `store_frame` 23, `safety` 6, `tray` 32. `cargo test -p gamelib-store` passed (142 lib, `host::` 36). `cargo test -p gamelib-steampoll --test profile` passed 4. `cargo clippy -p gamelib-store --all-targets -D warnings` was clean and `cargo fmt -p gamelib-store --check` passed. `rustfmt --edition 2021 --check` passed over `store_dispatch.rs`, `store_boot.rs` and `safety_dispatch.rs`. Shell clippy shows no finding in the three files this plan wrote; its existing findings elsewhere are unchanged.
- **Gates:** `pnpm smoke:sidecar` PASS. `pnpm smoke:exit-check -- --mode eof` PASS (8 ms). `pnpm codecheck` exit 0. `pnpm lint` exit 0 (0 errors). `pnpm find-deadcode` PASS (311 baselined). `pnpm backend-di-ceilings` PASS (jestMock 1804). `pnpm planning-gates` 12/12. `npx prettier --check` passed over every TS/JSON path written, and none is prettier-ignored.
- **Acceptance:** `"settings": true` = 1. `readSettingsDoc` in game_config.ts = 2. `fn open_doc` = 1. `readFileSync(...configPath|this.path)` in config.ts + game_config.ts = 0. settingsFamily.test.ts has the D-22 and resync cases. `evict_path` in safety_dispatch.rs = 3. `dropSettingsDoc` in uninstaller.ts = 2.

Tracer gate: the `<verify>` is automated-only, so it was re-run and passed before expanding, with no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The jest disk sink wrote `settings/global` to the wrong file and treated store/config as a document**
- **Found during:** Tasks 1 and 2
- **Issue:** `diskStoreSink.ts` resolved `settings/global` to `<userData>/settings/global.json`, but the shell's `path_for` writes `config.json`. It also chose the 2-space no-envelope layout by *family*, so `store/config`, a conf store in the settings family, was written as a document.
- **Fix:** `settings/global` now resolves to `<userData>/config.json`. The document layout applies only to `settings/global` and `GamesConfig/*`. `diskStoreSink.test.ts` pinned the old path and uses a replace on config.json now.
- **Files modified:** `src/backend/testUtils/diskStoreSink.ts`, `src/backend/testUtils/__tests__/diskStoreSink.test.ts`
- **Commits:** `8897aadcc`, `eb688bfb6`

**2. [Rule 3 - Blocking] appShellFlows quit tests waited on an unanswered store frame**
- **Found during:** Task 1
- **Issue:** With configStore Rust-owned, the 'config' step's mirror resync sends a frame. The boot harness has no shell to answer it, and quit awaits `flushStores(2000)`, so four quit cases missed `app_exit`.
- **Fix:** that suite's boot gets a prebuilt rust-mode `createTestStoreRoot`, whose disk sink answers at once.
- **Files modified:** `src/backend/sidecar/__tests__/appShellFlows.test.ts`
- **Commit:** `8897aadcc`

**3. [Rule 2 - Missing critical] A non-plain game name could replace the global document**
- **Found during:** Task 1
- **Issue:** `join(gamesConfigPath, '../config.json')` is the global config.json, which the shell owns. Under the Rust owner a GameConfig with that name would have sent a replace for `settings/global`.
- **Fix:** `GameConfig.writeToFile` refuses a non-plain name under the Rust owner with one warning line that names no appName (T-85-37).
- **Files modified:** `src/backend/game_config.ts`
- **Commit:** `8897aadcc`

**4. [Rule 2 - Missing critical] Read-only documents were reported under the pattern row**
- **Found during:** Task 2
- **Issue:** The boot sweep opened every GamesConfig file as row `settings/game`. A newer or corrupt document was reported as `settings/game`, so the sidecar cell keyed `GamesConfig/<app>` never knew it was read-only.
- **Fix:** the boot sweep reports the document key. `areaForStoreKey` maps `GamesConfig/` to `game-settings`, and the shared vector row changed from `app-data` to match.
- **Files modified:** `src-tauri/src/store_boot.rs`, `src/backend/storeVersioning/readOnlyStores.ts`, `src/common/__fixtures__/storePolicyVectors.json`
- **Commit:** `eb688bfb6`

**5. [Rule 1 - Bug] Eviction alone could not stop a queued write recreating a deleted file**
- **Found during:** Task 3
- **Issue:** `evict_path` forgets the stores so a later open reads the new files. A frame already queued for an evicted document would reopen it as Missing and write it back. A frame applied between the delete and the eviction would do the same.
- **Fix:** the worker pauses across delete and evict (bounded at 5 s), and queued frames under a removed target are doomed. This is the plan's "frames refused, nothing recreated, including by the drain".
- **Files modified:** `src-tauri/src/store_dispatch.rs`, `src-tauri/src/safety_dispatch.rs`
- **Commit:** `3eafd3813`

**6. [Rule 3 - Blocking] Plan-end gates**
- **Found during:** Task 3
- **Issue:** `backend-di-ceilings` rejected the new tests' `jest.mock` calls. `find-deadcode` flagged `storeOwnership.familyOf`, which had lost its only caller (the disk sink). `lint` flagged an `AppPaths` import that Task 2 left unused in `overlayPolicy.ts`.
- **Fix:** both suites run unmocked (the real logger and compatibility layer work). `familyOf` was removed, since `meta/genStoreTable`'s own `familyOf` is a different function. The import was dropped.
- **Files modified:** `src/backend/stores/__tests__/settingsDocs.test.ts`, `src/backend/stores/__tests__/settingsFamily.test.ts`, `src/backend/stores/storeOwnership.ts`, `src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts`
- **Commit:** `3eafd3813`

### Implementation choices the plan left open

- `settings/global` still resolves to `<user_data>/config.json` in `store_dispatch::path_for`. That is identical to `gamelib_core::paths` `config_path`, and TS `appFolder == userData` because `configRoot` is `appData` in the boot. The doc comment says so rather than adding a second path source.
- A GamesConfig file whose stem is not a plain segment is skipped by the boot sweep. It is never reported read-only.

**Total deviations:** 6 auto-fixed (2 Rule 1, 2 Rule 2, 2 Rule 3). **Impact:** all were needed for single-writer correctness or for the gates. The only scope added is the frame-worker pause, which T-85-38 requires.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None.

## Threat Flags

None. The new surface is covered by the plan's threat register: T-85-37 (plain-segment names on both sides) and T-85-38 (pause, evict and doom). The pause adds no new trust boundary. It is bounded at 5 s, the exit budget's total.

## Next Phase Readiness

Every family is Rust-owned behind the flag. 85-16 can port `areaForStoreKey` from the updated vector, where `GamesConfig/480` maps to `game-settings`. The live behaviour of settings writes on a real profile is the 85-20 macOS gate (coverage D8).

## Self-Check: PASSED

- FOUND: src/backend/stores/settingsDocs.ts
- FOUND: src/backend/stores/__tests__/settingsDocs.test.ts
- FOUND: src/backend/stores/__tests__/settingsFamily.test.ts
- FOUND: 8897aadcc (ancestor of HEAD)
- FOUND: eb688bfb6 (ancestor of HEAD)
- FOUND: 3eafd3813 (ancestor of HEAD)
