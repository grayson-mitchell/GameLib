---
phase: 85-store-host-config-and-versioned-migrations
verified: 2026-11-22T12:00:00Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-01-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-01-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-02-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-02-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-03-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-03-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-04-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-04-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-05-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-05-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-06-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-06-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-07-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-07-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-08-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-08-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-09-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-09-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-10-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-10-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-11-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-11-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-12-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-12-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-13-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-13-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-14-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-14-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-15-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-15-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-16-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-16-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-17-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-17-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-18-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-18-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-19-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-19-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-20-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-20-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-21-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-21-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-22-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-22-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-23-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-23-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-24-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-24-SUMMARY.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-25-PLAN.md"
  - ".planning/phases/85-store-host-config-and-versioned-migrations/85-25-SUMMARY.md"
  - "src-tauri/crates/gamelib-store/src/atomic.rs"
  - "src-tauri/crates/gamelib-store/src/engine.rs"
  - "src-tauri/crates/gamelib-store/src/host.rs"
  - "src-tauri/crates/gamelib-store/src/table.rs"
  - "src-tauri/src/native_router.rs"
  - "src-tauri/src/safety_dispatch.rs"
  - "src-tauri/src/store_boot.rs"
  - "src-tauri/src/store_dispatch.rs"
  - "src-tauri/src/store_native.rs"
  - "src-tauri/src/store_policy.rs"
  - "src/backend/__tests__/storeHostPortComplete.test.ts"
  - "src/backend/__tests__/storeMirrorSchedule.test.ts"
  - "src/backend/store_backend.ts"
  - "src/backend/stores/mirrorCell.ts"
  - "src/backend/stores/settingsDocs.ts"
  - "src/backend/stores/storeRoot.ts"
covered_digest: "v4:sha256:22ea2bc4ce1b5168650a425cc504410df9bf1c046f18cb5f3a19fb435e65fbf3"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "SC3 residual: the credential classes the live gate could not exercise. Decide whether the live evidence (zero Keychain prompts; the one Keychain item that existed, steam-refresh-token, read back as found and Steam Refresh ran with no sign-in prompt) is enough for SC3, or re-run 85-HUMAN-UAT item 2 once Humble, Epic and the SteamGrid key are signed in / set on a signed baseline."
    expected: "Humble sync finishes, the Epic tile shows signed in, the SteamGrid key shows as set, all with no Keychain prompt after the signed v0.10 -> v0.11 upgrade; or an explicit operator acceptance that the pinned slot names (keyring_names_are_pinned on all three CI legs) plus matching designated requirements cover them."
    why_human: "humble-session, humble-csrf, steamgrid-api-key and itad-api-key were absent from the Keychain at P4/P5 and Epic was never signed in under v0.10.0 (Epic's user.json is a file, not a Keychain item), so there was no stored credential of those kinds to survive an upgrade. A Keychain ACL outcome is external state no test can observe."
  - test: "Flagged prohibition (judgment-tier, unresolved in PLAN frontmatter): 85-15 'MUST NOT recreate config.json or a GamesConfig document after the user reset GameLib or uninstalled the game it belonged to'. Decide whether to fix now or accept: in one session, uninstall a game with 'remove settings', then change a setting for the same appName; check whether GamesConfig/<app>.json is recreated with the old overrides."
    expected: "No GamesConfig document reappears carrying the deleted overrides."
    why_human: "unverified-prohibition, human review recommended. The Rust side holds (evict_path refuses later frames; cargo test an_evicted_store_refuses_apply_and_creates_no_file passes), but review findings C-WR-01 and C-WR-02 are confirmed in the code: GameConfigs.instances (src/backend/game_config.ts) keeps the cached instance and its stale .config after dropSettingsDoc, and resetHeroic never drops the settings cells. The cached-instance behaviour pre-dates Phase 85 (it is in 5073e3eb0), so this is a missed hardening, not a regression."
  - test: "Disposition of the open code-review warnings that touch must-have behaviour (85-REVIEW-DISPOSITION.md has all 43 as open): fix now or file todos. Items to decide first: B-WR-01 and B-WR-02 (queued renderer store writes dropped at exit; the store drain does not wait after the sidecar child stage), B-WR-07 (plain_name accepts ':' so a GamesConfig/<app> name can escape on Windows), C-WR-01/C-WR-02 (above), A-WR-02 (a stamped version above u32::MAX reads as 0, fail-open) and A-WR-03 (a lone-surrogate escape locks a store read-only)."
    expected: "Each is either fixed with a test or filed as a todo with severity/platform/ready; none of them silently stays 'open'."
    why_human: "These are judgment calls on priority. None falsifies a roadmap success criterion (see Gaps Summary), so they are warnings, not gaps."
---

# Phase 85: Store host, config and versioned migrations Verification Report

**Phase Goal:** Rust is the only disk writer for settings, caches and per-game config, and an upgrade loads existing data unchanged without new Keychain prompts.
**Verified:** 2026-11-22
**Status:** human_needed
**Re-verification:** No, initial verification

Requirement definitions found at `.planning/REQUIREMENTS-v0.11.md` lines 20-21 (FND-06, FND-07) with traceability rows at lines 75-76 (both still `Pending`; the orchestrator should mark them complete), and at `.planning/ROADMAP.md` line 475 (Phase 85 entry, `**Requirements**: FND-06, FND-07`). `.planning/REQUIREMENTS.md` does not exist. No other requirement ID maps to Phase 85, so there are no orphans.

## Goal Achievement

The goal is achieved in the codebase. The deletion of the TS owner path is real and gated, the Rust crates are tested and CI-green on three OSes, and the live signed-upgrade gate ran. What keeps the status at `human_needed` rather than `passed` is a short list of things only a person can settle (above), not a missing implementation.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: existing settings, caches and per-game config from the operator profile and the older-release corpus load unchanged, unknown keys preserved, roundtrip diff green | VERIFIED | `tests/fixtures/corpus/MANIFEST.json` lists 162 files: operator 106, backups 36, edge 11, v0.8/v0.9/v0.10 3 each. I ran `cargo test -p gamelib-store`: 146 unit + corpus 8 (`roundtrip_is_byte_identical`, `noop_open_writes_nothing`, `current_version_preserves_unknown_keys`, `outcomes_match_manifest`) + engine_golden 2 + golden 1 + migrate_golden 3 + ops_golden 3 + vectors 5, all 0 failed. Live gate item 3 (versions): P7 snapshot after launch 1 equals the v0.10 snapshot for every file, 0 UNPARSEABLE, the three P5 settings equal. See Warnings for the GOG count and the lone-surrogate edge. |
| 2 | SC2: backup before a migration; corrupt file kept and reported, never reset; newer-version file read-only | VERIFIED | `engine.rs` module doc and `open_file` order: corrupt bytes copied to `<name>.corrupt.<stamp>.json` first and the original never touched; `Newer` is `ReadOnly` with bytes unrewritten; pre-migration backup before any step. `engine_golden` and `corpus` tests pass (above). Live items 5, 6, 7 scored pass: `timestamp.corrupt.*` created and `cmp` of the store file equal to the edited bytes; `download-manager` schemaVersion 99 gave the newer notice and `cmp` equal; a v1 `steam_library` migrated to schemaVersion 3 with a byte-identical `steam_library.v1.*.bak.json`. |
| 3 | SC3: after a signed release over a previous one, stored credentials still work and no new Keychain prompt | VERIFIED (scoped) | Decision on the one line 85-VALIDATION.md still shows as `pending`: `85-HUMAN-UAT.md` item 1 is `pass`. The two identities are equal (same Identifier, leaf authority, TeamIdentifier `S7U223QWXJ`, byte-identical designated requirement, both notarized and stapled; `85-VALIDATION.md` "Signed baseline (D-16)"). `keychain-1.log` (15749 lines, still on disk under `/tmp/gamelib-gate-2026-11-22T03:38:53Z/`) has 0 prompt events, and the same capture machinery logged the P5 baseline prompt, so the absence is non-vacuous. The one credential that existed, `steam-refresh-token`, was read as found at launch 1 and Steam Refresh ran with no sign-in prompt. Scoped, because the other four Keychain accounts were absent at P4/P5 and Epic is not a Keychain item; that residual is human item 1. No keyring dependency in the store crates (`cargo tree -p gamelib-store -p gamelib-store-cli` shows none); `keyring_names_are_pinned` is green on all three CI legs. |
| 4 | SC4: the legendary migration is ported only if a supported upgrade path still reaches it, reachability recorded, otherwise deleted | VERIFIED | Reachability recorded in the header of `src/backend/__tests__/storeHostPortComplete.test.ts` and 85-21: every supported source already carries `legendary-move-global-config-folder` as applied. I confirmed it in the corpus: `operator`, `v0.8`, `v0.9`, `v0.10` `store/migrations.json` each list it. `src/backend/migration/` does not exist and `migrationsStore`, `MigrationSystem`, `applyMigrations` and the legendary id are forbidden identifiers in the gate test (passes). `store/migrations.json` is left on disk (D-07): `store_boot_never_opens_migrations_json` passes in the 180-test `cargo test --bin gamelib-shell store_` run. |
| 5 | SC5: the TS mirror's deletion point is named and executed for every family flipped; `storeVersioning`, `storeMigrations` and `migration/*` TS are deleted | VERIFIED | `src/backend/storeVersioning`, `src/backend/storeMigrations` and `src/backend/migration` do not exist (ls), `git ls-files` lists nothing under them, and `grep` finds the names only in test-gate files and comments. `conf` is not in `package.json` and no source imports it. `storeMirrorSchedule.test.ts` carries the per-store deletion phase table (D-19) and fails if a mirror due later disappears early or one due at 85 stays. I ran 8 jest suites: `storeHostPortComplete`, `storeMirrorSchedule`, `mirrorCell`, `settingsFamily`, `storeTable`, `schemaDescriptor`, `rendererWrites`, `bottleVersionGate`: 160 passed, 0 failed. |
| 6 | Goal: Rust is the only disk writer for settings, caches and per-game config | VERIFIED | `src/backend/store_backend.ts` is a mirror-only facade over `MirrorCell` (no `conf`, no fs). My grep for `writeFile`/`rename`/`copyFile`/`outputFile`/`appendFile` against `gamesConfigPath`, `configPath`, `userData`, `store_cache`, `GamesConfig` and `storeRoot` over non-test `src/backend` found nothing; `config.ts`, `game_config.ts`, `cache.ts`, `stores/*.ts` and `storeWriteHandlers.ts` contain no fs write calls. The flag (`GAMELIB_STORE`), `store:ts-*` forwards and `resolveStoreMode` are forbidden identifiers and gone. `store_boot::open_all` runs in `run_setup` (`main.rs:1867`) after `acquire_single_instance`, so a second instance never opens or migrates. Renderer writes are Rust-native channels (`store_native.rs`) behind `store_policy.rs`. |
| 7 | Quit flushes store writes inside the exit budget (D-21) | VERIFIED (primary path) | The `quit` flow awaits `flushStores(STORE_FLUSH_AT_QUIT_MS)` before asking the shell to exit (`appShellFlowRegistration.ts:443-447`); `main.rs:954-962` registers the `store` drain in `handle_exit`. Live item 8: toggle then Cmd+Q in the same second gave `exit finished in 51 ms`, no `still running at exit deadline:` line, value present on relaunch; across all 8 launches exit was 50-52 ms. Residual for renderer-origin writes is Warning W1. |
| 8 | Reset and uninstall do not resurrect deleted settings (T-85-38) | VERIFIED (designed scope) | `safety_dispatch.rs:21-31` pauses the frame worker, runs `safety_remove_tree`, then `evict_path` plus `evict_queued` for every `app-data` target of a `removed` outcome; `host.rs:356` returns `ApplyError::Evicted` and the shell cargo run covers `an_evicted_store_refuses_apply_and_creates_no_file`. `uninstaller.ts:196-198` drops the settings cell after `removed`. Not airtight at the TS seam: see human item 2 and Warnings W2/W3. |

**Score:** 8/8 truths verified (0 present, behavior-unverified).

### Deferred Items

Step 9b: no gap is closed by a later phase, so nothing is moved to `deferred:`. One item is recorded for the trail but is not a later-phase deferral:

| # | Item | Where recorded | Note |
|---|------|----------------|------|
| 1 | Late mirror-cell rev handshake (S1 rule 8, second half): a cell created after boot can briefly read a value the file already superseded | `deferred-items.md` "From 85-17" | No later roadmap phase names it, so it stays a warning (W6). The 85-11 property test runs late cells and they converge; only the replay window is open. |

### Required Artifacts

`verify.artifacts` / `verify.key-links` were not run per plan; the plans' `must_haves` were checked directly against files.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/crates/gamelib-store/src/{engine,host,atomic,table,envelope,backup,dotpath,ops,version_gate,json}.rs`, `migrate/{settings,libraries,strip,mod}.rs` | Store crate: ordered JSON, version engine, backups, atomic write, migration chains | VERIFIED | Present, substantive (`engine.rs` 616 lines), wired into the shell (`store_boot.rs`, `store_dispatch.rs`, `store_native.rs`); 146 unit + 22 integration tests pass |
| `src-tauri/crates/gamelib-store-cli` | CLI `open` over a FakeHome | VERIFIED | Present; in the CI crate list |
| `src-tauri/src/store_boot.rs`, `store_dispatch.rs`, `store_native.rs`, `store_policy.rs`, `store_gate_dispatch.rs` | Bounded boot open, frame worker, native channels, policy, bottle gate | VERIFIED | 180 shell tests with the `store_` filter pass; `run_setup` calls `open_all` |
| `src/backend/stores/{mirrorCell,storeRoot,storeFrames,settingsDocs,dotPath,bottleVersionGate}.ts`, `store_backend.ts` | TS write-through mirror, no owner path | VERIFIED | Present; no fs writes; gate suites pass |
| `src-tauri/crates/gamelib-store/tests/fixtures/{golden,vectors,corpus,corpus-expected}` | Real-file corpus pinned by MANIFEST | VERIFIED | 162 entries; kept by the deletion gate; I grepped the corpus for SteamID64, JWT, `humble:v1:`, emails and plain token keys and found only the rule text in `NOTES.md` |
| Deleted: `storeVersioning/`, `storeMigrations/`, `migration/`, `storeOwnership.{ts,json}`, `readOnlyStoresNotice.ts`, `conf` | Gone | VERIFIED | Absent from disk and git; enumerated in `DELETED` in `storeHostPortComplete.test.ts` with floors and self-tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.rs run_setup` | `store_boot::open_all` | boot open, bounded by `BOOT_SWEEP_MAX_FILES`/`_MS` | WIRED | `main.rs:1867-1875` |
| `main.rs handle_exit` | `store_boot::drain` | `store` drain tuple | WIRED | `main.rs:954-962` (see W1/W5 for what it does not wait for) |
| `mirrorCell.ts` | Rust frame worker | `kind:"store"` frames, `applied`/`refused`/`flushed` acks | WIRED | `store_dispatch.rs`; 85-11 property test and `mirrorCell.test.ts` pass |
| `store_native.rs` | `store_policy.rs` | `check_write_policy` gates every renderer write and push | WIRED | `rendererWrites.test.ts` and `store_` cargo tests pass |
| `safety_dispatch.rs` | `host().evict_path` | eviction after a `removed` app-data removal | WIRED | `safety_dispatch.rs:26-29` |
| `uninstaller.ts` | `dropSettingsDoc` | after `removed` | WIRED | `uninstaller.ts:196-198`; `resetHeroic` is not wired (W2) |
| `appShellFlowRegistration.ts quit` | `flushStores` | quit-time flush | WIRED | lines 443-447 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `GameLibStore` / `MirrorCell` | store view | boot snapshot from the Rust host (`readSettingsDoc`, cells) over the real file | Yes: live item 3 shows steam_library 401=401, sideload 3=3 and settings equal on the upgraded profile | FLOWING |
| Rust host writes | file bytes | `apply_inner` then `write_atomic` | Yes: live item 4 byte checks (2-space JSON no trailing newline for `config.json` and `GamesConfig`, tab-indented `__internal__` envelope for `store/config.json`) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Store crate: corpus roundtrip, engine decisions, migration parity | `cd src-tauri && cargo test -p gamelib-store` | 146 + 8 + 2 + 1 + 3 + 3 + 5 passed, 0 failed | PASS |
| Shell store boot, drain, policy, native handlers | `cd src-tauri && cargo test --bin gamelib-shell store_` | 180 passed, 0 failed (509 filtered) | PASS |
| TS deletion gate, mirror schedule, mirror protocol, settings family, table/descriptor drift, renderer writes, bottle gate | `pnpm exec jest --runTestsByPath` over 8 suites | 8 suites, 160 tests passed | PASS |
| No keyring in store crates | `cargo tree -p gamelib-store -p gamelib-store-cli \| grep -i keyring` | no output | PASS |

I did not re-run the full workspace test command; 85-VALIDATION.md records it (D `92495cd50`: 24257 passed, 0 failed; CI at `88b48b70d`: windows, macos and ubuntu cargo legs plus jest, codecheck, lint, audit all success).

### Probe Execution

Step 7c: SKIPPED. The phase declares no `probe-*.sh`, and `find scripts -path '*/tests/probe-*.sh'` was not needed: PLAN/SUMMARY name no probe paths.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| FND-06 | 85-01..85-04, 85-06..85-13, 85-15..85-18, 85-21..85-24 (and 85-03, 85-14, 85-19, 85-20, 85-25) | Existing settings, caches and per-game config load unchanged; unknown keys preserved; pre-migration state backed up; corrupt file kept; legendary migration ported only if reachable | SATISFIED | Truths 1, 2, 4, 5, 6; corpus and engine tests; live items 3 (versions), 4-8 |
| FND-07 | 85-03, 85-05, 85-14, 85-19, 85-20, 85-25 | Stored credentials keep working, no new Keychain prompts, across a signed-release upgrade | SATISFIED (scoped) | Truth 3; live item 1; residual in human item 1 |

Definitions: `.planning/REQUIREMENTS-v0.11.md:20-21`. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Phase 85 production files (store crates, `store_*.rs`, `safety_dispatch.rs`, `stores/*.ts`, `store_backend.ts`, `schemaStrip.ts`, `meta/genStore*.ts`, `harvestStoreCorpus.ts`) | - | TBD / FIXME / XXX | none found | Debt-marker gate clear |
| `src-tauri/src/native_router.rs` | 209-213 | `if token.is_cancelled() { continue; }` drops queued jobs, including `store` slice writes | Warning | W1 |
| `src-tauri/src/store_dispatch.rs` and `crates/gamelib-store/src/host.rs` | 124-131 and 530-537 | `plain_name` / `plain_segment` accept `:` | Warning | W4 |
| `src/backend/game_config.ts` | 362-385 | `instances` map keeps a deleted game's `GameConfig` | Warning | W3 |

### Human Verification Required

#### 1. SC3 credential classes the gate could not exercise

**Test:** Accept the live evidence as sufficient, or, once Humble, Epic and the SteamGrid key are signed in on a signed baseline, re-run `85-HUMAN-UAT.md` item 2 across the upgrade.
**Expected:** Humble sync finishes, the Epic tile shows signed in, the SteamGrid key shows as set, no Keychain prompt.
**Why human:** The Keychain items for those slots did not exist at P4/P5, and Epic is not a Keychain item, so there was nothing to survive; a Keychain ACL outcome is external state.

#### 2. Flagged prohibition: 85-15 (unverified-prohibition, human review recommended)

**Test:** Uninstall a game with "remove settings", then change a setting for the same appName in the same session; check `GamesConfig/<app>.json`.
**Expected:** No document is recreated with the deleted overrides.
**Why human:** Judgment-tier, unresolved in frontmatter. The Rust eviction holds; the TS `GameConfigs.instances` cache and `resetHeroic` do not drop cached state (C-WR-01, C-WR-02, confirmed in code). The cached-instance behaviour is pre-existing (present at `5073e3eb0`).

The other unresolved judgment-tier prohibitions, with my non-authoritative judge verdicts, all resolved by evidence: 85-07 unknown keys kept (`current_version_preserves_unknown_keys` passes), 85-07 corrupt file never rewritten (`engine_golden`, live item 5 `cmp`), 85-09 never opens `migrations.json` (`store_boot_never_opens_migrations_json`), 85-14 no keyring dependency (`cargo tree`), 85-17 `refreshToken` not writable and no excluded field pushed (`store_policy` and `rendererWrites` suites), 85-02 no secrets in the corpus (my grep, `storeCorpus` test; the harvester denylist is thin, C-WR-04), 85-21 `migrations.json` not deleted or rewritten (corpus copy still present, gate test). The remaining prohibitions (85-01, 85-02 no real-profile writes, 85-03, 85-04, 85-05, 85-19, 85-20, 85-25) govern process (no `--no-verify`, no publish, profile restored); 85-20 records every hand-edited store restored and `cmp`-checked, and 85-VALIDATION.md records both pushes ran the full pre-push hook. Those are judged compliant on the record, not independently reproducible.

#### 3. Disposition of the open review warnings

**Test:** Triage `85-REVIEW-DISPOSITION.md` (43 rows, all `open`): fix now or file todos.
**Expected:** Each warning resolved to fixed or filed.
**Why human:** Priority call; none falsifies a success criterion.

### Gaps Summary

No gap blocks the phase goal. Every roadmap success criterion and every plan-level truth I checked is backed by code, a passing test I ran, or a recorded live result I cross-checked against the captures still on disk.

**Judgment on the live gate results (85-HUMAN-UAT.md, 6 pass / 2 issue):**

- **Item 2 (Humble/Epic signed out):** a precondition, not a regression. Both were signed out on the v0.10.0 baseline too (`humble-session` absent, Epic `user.json` never present). It leaves SC3 verified for the credentials that existed and unproven for the rest (human item 1).
- **Item 3 (GOG cache emptied):** does not contradict "loads existing data unchanged", on evidence I checked directly. `gamelib-launch-1.log` line 21 shows `Updated to a new version, cleaaning up the cache.` at 17:24:28, before the `Could not get game info` lines and the `No cache found` line; the v0.10.0 baseline launch (`gamelib-old-after-p5.log` line 126) logs the same message. The renderer's `HeroicVersion` effect (`src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx:68-72`, unchanged since earlier phases) calls `clearCache(false, true)` on any version change, which empties the GOG caches by design; offline, the refetch cannot refill them. This is the app's own version-change cleanup, not the store host. The same version-change clear is why v0.10.0's first launch re-fetched. Versions on all files and the other counts (steam_library 401, sideload 3, legendary 0, nile 0) were unchanged. Another session's debug record (`.planning/debug/gog-offline-empties-cache.md`, status `awaiting_human_verify`, uncommitted working-tree changes in `cache.ts`, `gog/library.ts`, `handlers.ts`, `shellFilesFlowRegistration.ts`) reaches the same root cause; it is out of Phase 85's scope. One wording point: SC1 says caches "load unchanged"; on a version bump the GOG, Epic and Nile caches are cleared on purpose, so SC1 is read as "the store host does not alter existing data", which it does not.

**Warnings (none a blocker; evidence against the code):**

- **W1 (B-WR-01, confirmed):** `spawn_slice_worker` discards queued jobs once the shutdown token is cancelled, and `store_boot::drain` waits only on the sidecar frame queue and in-flight applies, so a renderer `storeSet`/`storeDelete`/`storeNew` still queued at exit is lost. Needs a backlog at quit (the live toggle/quit cases went through the sidecar mirror and passed), so the window is narrow. No plan truth requires draining the slice queue; it falls short of the D-21 intent for renderer-origin writes.
- **W2 (C-WR-01, confirmed):** `resetHeroic` (`utils.ts:392-435`) removes the settings documents but never calls `dropSettingsDoc`; the relaunch timer is 1 s, so the window is short.
- **W3 (C-WR-02, confirmed, pre-existing):** a stale `GameConfig` instance survives uninstall and can re-flush deleted overrides on the next `setSetting` for that appName.
- **W4 (B-WR-07, confirmed):** `plain_name`/`plain_segment` allow `:`. Only the sidecar can name a `GamesConfig/<app>` store, and the sidecar is trusted at that boundary, but on Windows `C:foo` would resolve outside user-data. The live gate was macOS only; the Windows leg is CI-proven for atomic rename and keyring names, not for this containment.
- **W5 (B-WR-02, read from `main.rs:928-998`):** the `store` drain samples idle once while the sidecar is still alive, and nothing re-checks after the children stage. TS `flushStores` before the exit request is the real safeguard, as the live runs show.
- **W6 (deferred-items):** the late mirror-cell rev handshake is unbuilt (replay window only; cells converge).
- **W7 (A-WR-02, A-WR-03):** a stamped version above `u32::MAX` reads as 0 (fail-open against the refuse-newer rule), and a lone-surrogate `\ud800` escape that `JSON.parse` accepts makes the Rust parse treat the file as not a store (a non-cache store then opens read-only, with a `.corrupt.` copy kept, so nothing is lost). Both are corpus-recorded divergences, edge inputs.
- The remaining review warnings (A-WR-01 parent-dir fsync, A-WR-04 `dotpath::set` index bound, A-WR-05 CLI dry-run temp residue, A-WR-06 orphan temp collision, B-WR-03 `GAMELIB_STORE_BOOT` size, B-WR-04/05, B-WR-06, B-WR-08, B-WR-09, B-WR-10, C-WR-03..06) I did not re-derive individually; they are on the disposition list.

**Context notes:** `.planning/ROADMAP.md` still shows Phase 85 unchecked; `85-HUMAN-UAT.md` frontmatter is `status: partial`; `85-VALIDATION.md` still carries `SC3: pending (identities match; live gate owed by 85-20)` and should be updated to the SC3 decision above. Working-tree changes by other sessions (GOG cache, Phase 100, quick tasks) were excluded from this judgment.

---

_Verified: 2026-11-22_
_Verifier: Claude (gsd-verifier)_
