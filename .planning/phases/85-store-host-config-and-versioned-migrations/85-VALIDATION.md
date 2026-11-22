---
phase: "85"
slug: "store-host-config-and-versioned-migrations"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-11-21"
---

# Phase 85 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `85-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (std harness, per crate, 3 OS legs in `rust-test.yml`); jest 29.7 (projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`, `relay`) |
| **Config file** | `src-tauri/Cargo.toml`, `jest.config.js`, `.github/workflows/rust-test.yml` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-store` |
| **Full suite command** | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-store -p gamelib-core -p gamelib-log -p gamelib-proc -p gamelib-steamcm`, then `pnpm exec jest --runTestsByPath <changed suites>`, `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode`, `pnpm planning-gates`, `pnpm smoke:sidecar` |
| **Estimated runtime** | ~120 seconds quick (crate build + tests); full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the crate/suite named in the task `<verify>`, plus `npx prettier --check` over the exact written paths (`--file-info` first; `.planning` and `public/locales` are ignored, so omit them and say so)
- **After every plan wave:** `cargo test -p gamelib-store -p gamelib-core` + `cargo test --bin gamelib-shell` + targeted jest + `pnpm check:ipc-contract` + `pnpm codecheck`
- **Before `/gsd-verify-work`:** CI `rust-test.yml` green on all three OS legs, full jest green, live macOS gate run
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Task IDs bound by the planner (2026-11-21). `85-NN-Tk` = plan 85-NN, task k. Commands are the ones the plans' `<verify>` blocks run; the plan-end gates of each plan are not repeated here.

| Task | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|----------|-----------|-------------------|-------------|--------|
| 85-01-T1..T3 | FND-06 / SC1 | TS oracle golden (ops, engine, migrate, settings docs) and dot-path, number, key-order vectors | golden | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeOracle.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-02-T1..T3 | FND-06 / SC1 | Redacted corpus complete, hashed, floored; redaction clean | jest | `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/storeCorpus.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-03-T1 | FND-06 | Renderer policy vectors = today's TS | jest | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storePolicyVectors.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-03-T2 | FND-06 | Store frame contract vectors well-formed | node check | see 85-03 Task 2 `<verify>` | ✅ | ✅ green (85-19 proof at P) |
| 85-03-T3 | FND-06 / FND-07 | Live gate contract parses (8 items, headingsSeen 0) | uat parse | see 85-03 Task 3 `<verify>` | ✅ | ✅ green (85-19 proof at P) |
| 85-04-T1..T2 | FND-06 | S1 protocol model converges; S3-S5 constants recorded | spike | `node .planning/spikes/092-store-mirror-protocol/sim.mjs --runs 10000 --seed 85` | ✅ | ✅ green (85-19 proof at P) |
| 85-05-T1..T3 | FND-07 / SC3 | Signed v0.10 baseline identity recorded (D-16) | manual + gh | see 85-05 `<verify>` | ✅ | ✅ green (baseline recorded, 85-05) |
| 85-06-T1 | FND-06 / SC1 | Every golden file round-trips byte-identical in Rust | golden | `cd src-tauri && cargo test -p gamelib-store --test golden` | ✅ | ✅ green (85-19 proof at P) |
| 85-06-T2 | FND-06 / SC1 | JS number text and key order (vectors) | unit | `cd src-tauri && cargo test -p gamelib-store --test vectors` | ✅ | ✅ green (85-19 proof at P) |
| 85-06-T3 | FND-06 | dot-prop paths; atomic write incl. Windows open handle (S2 on CI) | unit (+ CI Windows) | `cd src-tauri && cargo test -p gamelib-store dotpath:: && cargo test -p gamelib-store atomic::` | ✅ | ✅ green (85-19 proof at P) |
| 85-07-T1 | FND-06 / SC1 | Golden ops replay byte-identical (envelope, reserved key) | golden | `cd src-tauri && cargo test -p gamelib-store --test ops_golden` | ✅ | ✅ green (85-19 proof at P) |
| 85-07-T2 | FND-06 / SC2 | Backup before migrate; newer read-only; corrupt copied aside and kept (D-18); missing empty | golden + unit | `cd src-tauri && cargo test -p gamelib-store --test engine_golden && cargo test -p gamelib-store engine::` | ✅ | ✅ green (85-19 proof at P) |
| 85-07-T3 | FND-06 / SC1 | Corpus: manifest complete, no-op open byte-identical, outcomes match; store table drift | integration + jest | `cd src-tauri && cargo test -p gamelib-store --test corpus` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeTable.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-08-T1..T2 | FND-06 / SC1 | Schema descriptor not stale; migrations equal TS oracle; versions pinned (D-04) | golden + jest | `cd src-tauri && cargo test -p gamelib-store --test migrate_golden` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/schemaDescriptor.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-08-T3 | FND-06 / SC1 | Older corpus files migrate like TS; CLI open on FakeHome | integration | `cd src-tauri && cargo test -p gamelib-store --test corpus older_versions_match_ts_oracle && cargo test -p gamelib-store-cli` | ✅ | ✅ green (85-19 proof at P) |
| 85-09-T1 | FND-06 | uploadedLogs v0.10 tab+envelope regression | unit | `cd src-tauri && cargo test --bin gamelib-shell log_upload` | ✅ | ✅ green (85-19 proof at P) |
| 85-09-T2 | FND-06 | Rev under lock, ordered events, rollback, read-only, eviction | unit | `cd src-tauri && cargo test -p gamelib-store host::` | ✅ | ✅ green (85-19 proof at P) |
| 85-09-T3 | FND-06 | Bounded boot open, mode/ownership, boot env, `store` exit drain | unit + jest gates | `cd src-tauri && cargo test --bin gamelib-shell store_boot && cargo test --bin gamelib-shell handle_exit` | ✅ | ✅ green (85-19 proof at P) |
| 85-10-T1..T3 | FND-06 | Frame write path end to end; frame vectors on both sides; flush; registrant | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_frame` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeWritePath.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-11-T1..T3 | FND-06 | Mirror protocol property test, shared cells, dot paths, quit flush, D-02 fallback | jest | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/mirrorCell.test.ts src/backend/stores/__tests__/dotPath.test.ts src/backend/stores/__tests__/storeFallback.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-12-T1..T2 | FND-06 | Cache family flipped; runtime caches; corrupt cache startEmpty | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/cacheFamily.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-13-T1..T2 | FND-06 | User-state flipped; libraries migrated at boot | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/userStateFamily.test.ts` ; `cd src-tauri && cargo test --bin gamelib-shell store_boot` | ✅ | ✅ green (85-19 proof at P) |
| 85-14-T1 | FND-06 | Account family flipped; shared steam_store cell; tightening | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/accountFamily.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-14-T2 | FND-07 / SC3 / D-10 | Keyring names pinned on all CI legs; no keyring dep in store crates | unit + `cargo tree` | `cd src-tauri && cargo test --bin gamelib-shell keyring_` | ✅ | ✅ green (85-19 proof at P) |
| 85-15-T1..T3 | FND-06 | Settings family flipped; readSettingsDoc; D-22; resync; eviction | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/settingsDocs.test.ts src/backend/stores/__tests__/settingsFamily.test.ts src/backend/__tests__/settingsMirrorResync.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-16-T1..T3 | FND-06 / SC2 | Native reads; one owner per channel; policy TS = Rust; Rust read-only notice | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_policy && cargo test --bin gamelib-shell store_native` ; `pnpm exec jest --runTestsByPath src/backend/__tests__/nativeSeamPortComplete.test.ts` ; `pnpm check:ipc-contract` | ✅ | ✅ green (85-19 proof at P) |
| 85-17-T1..T3 | FND-06 | Native writes and storeChanged with rev; preload stale-push guard | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_native` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/rendererWrites.test.ts src/preload/__tests__/tauriTransport.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-18-T1..T2 | FND-06 | Bottle version gate (D-17) for marker and ledger | unit + jest | `cd src-tauri && cargo test -p gamelib-store version_gate && cargo test --bin gamelib-shell store_gate` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/bottleVersionGate.test.ts` | ✅ | ✅ green (85-19 proof at P) |
| 85-19-T1..T3 | FND-06 / FND-07 | Clean-worktree proof; three-OS CI; Phase 85 signed identity recorded | proof | see 85-19 | — | ✅ green (proof at P `d90e33bc8`; CI green at `482625ecc`; Phase 85 identity = baseline) |
| 85-20-T1..T3 | FND-07 / SC3, SC1, SC2 | Live macOS gate on signed builds | manual | `85-HUMAN-UAT.md` | — | ⬜ pending |
| 85-21-T1 | FND-06 / SC4, SC5 | Reachability recorded; migration system and migrationsStore deleted; mirror schedule pinned (D-19); migrations.json untouched (D-07) | jest + unit | `pnpm exec jest --runTestsByPath src/backend/__tests__/storeHostPortComplete.test.ts src/backend/__tests__/storeMirrorSchedule.test.ts` ; `cd src-tauri && cargo test --bin gamelib-shell store_boot_never_opens_migrations_json` | ❌ W0 | ⬜ pending |
| 85-21-T2 | FND-06 / SC5 | Flag, TS owner path, oracle and `conf` deleted; census exemption closed | jest + unit | `pnpm exec jest --runTestsByPath src/backend/__tests__/storeHostPortComplete.test.ts src/backend/__tests__/nativeSeamPortComplete.test.ts` ; `cd src-tauri && cargo test --bin gamelib-shell store_` | ✅ update | ⬜ pending |
| 85-22-T1 | FND-06 / SC5 | Engine readers carry no versioning engine; stored game-config read has no TS migrate step | jest | `pnpm exec jest src/backend/engine` | ✅ update | ⬜ pending |
| 85-22-T2 | FND-06 / SC5 | EngineServices, tools, launcher, flow and bridge-runtime deps carry no versioning engine | jest | `pnpm exec jest --runTestsByPath src/backend/sidecar/__tests__/engineFlows.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRuntime.test.ts` ; `pnpm test` | ✅ update | ⬜ pending |
| 85-23-T1 | FND-06 / SC5 | GlobalConfig and GameConfig carry no versioning engine; settings family still round-trips | jest | `pnpm exec jest --runTestsByPath src/backend/__tests__/gameConfigsRegistry.test.ts src/backend/stores/__tests__/settingsFamily.test.ts` | ✅ update | ⬜ pending |
| 85-23-T2 | FND-06 / SC5 | ManagerDeps and StoreRoot carry no versioning engine; test helper forbidden and gone | jest | `pnpm exec jest --runTestsByPath src/backend/__tests__/storeHostPortComplete.test.ts src/backend/storeManagers/__tests__/createStoreManagers.test.ts` ; `pnpm test` | ✅ update | ⬜ pending |
| 85-24-T1 | FND-06 / SC5 | TS read-only notice path deleted; Rust's notice is the only one | jest + unit | `pnpm exec jest --runTestsByPath src/backend/__tests__/storeHostPortComplete.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/stores/__tests__/storePolicyVectors.test.ts` ; `cd src-tauri && cargo test --bin gamelib-shell store_policy` | ✅ update | ⬜ pending |
| 85-24-T2 | FND-06 / SC5 | Survivors relocated; storeVersioning and storeMigrations deleted | jest | `pnpm exec jest --runTestsByPath src/backend/__tests__/storeHostPortComplete.test.ts src/backend/utils/__tests__/schemaStrip.test.ts` ; `pnpm test` | ❌ W0 | ⬜ pending |
| 85-25-T1..T3 | FND-06 / FND-07 | Post-deletion clean-worktree and three-OS CI proof | proof | see 85-25 | — | ⬜ pending |
| all | Gates | Sidecar boot with no Rust peer exits cleanly | smoke | `pnpm smoke:sidecar` | ✅ | ✅ green (85-19 proof at P) |

Binding notes: SC5 is read per D-19, not literally: ROADMAP SC5's "named and executed for every family flipped in this phase" means every persisted store's TS-mirror deletion phase is named (pinned by `storeMirrorSchedule.test.ts`, copied from `82-STATE-OWNERSHIP.md`) and only the deletions due in Phase 85 are executed (`migrationsStore`'s mirror), plus deletion of the TS *owner* path for every family (D-03); the other mirrors are deleted in the phases their column names, and the schedule test fails if one disappears early. D-03's "the phase's last plan deletes" is carried by 85-21..85-24, which run back to back after the live gate (85-20) with nothing else between them and the post-deletion proof (85-25); the split is for context budget only (storeVersioning's `versioning` dependency is threaded through about 60 consumer files). The schema descriptor drift test lives at `src/backend/stores/__tests__/schemaDescriptor.test.ts` (not under storeMigrations/, which 85-24 deletes); the read-only area parity is proven by cargo's `store_policy` tests over `storePolicyVectors.json` (85-16), so no separate `readonly::` module exists; the store drain is proven by `store_boot` and `store_frame` tests (85-09, 85-10) rather than a `host::drain` filter.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/stores/__tests__/storeOracle.test.ts` + `src-tauri/crates/gamelib-store/tests/fixtures/{golden,corpus,MANIFEST.json}` committed before any TS change
- [x] Corpus harvest + redaction tool under `createFakeHomeProfile()`, with a redaction test
- [x] `85-HUMAN-UAT.md` live-gate contract (convention 5 item shape), incl. signing-identity precondition
- [x] `gamelib-store` crate scaffold + CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`)
- [x] `storePolicyVectors.json` policy vectors (85-03; the policy itself moves to `storeChannels.json` in 85-16); `storeFrameVectors.json`
- [x] `meta/genStoreSchemas.ts` + drift test
- [x] Spikes S1–S5 (mirror rebase sim, Windows rename, frame throughput, GamesConfig sweep, `sync_all` cost)

All seven present at P `d90e33bc8` (checked by 85-19 Task 1): `storeOracle.test.ts`, `tests/fixtures/{golden,corpus,corpus/MANIFEST.json}`; `meta/harvestStoreCorpus.ts` + `meta/__tests__/storeCorpus.test.ts`; `85-HUMAN-UAT.md` (parses to 8 items, 0 headings); `src-tauri/crates/gamelib-store` + `rust-test.yml` `-p gamelib-store -p gamelib-store-cli` + `meta/__tests__/rustTestWorkflow.test.ts` + `src/backend/__tests__/cargoFeatures.test.ts`; `src/common/__fixtures__/storePolicyVectors.json` + `storeFrameVectors.json`; `meta/genStoreSchemas.ts` + `schemaDescriptor.test.ts`; spikes 092 (S1) and 093 (S3-S5), S2 deferred to CI per `85-SPIKES.md`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signed v0.10 → signed Phase 85 upgrade: zero Keychain prompts, sign-ins survive | FND-07 / SC3 | Needs real signed releases with the same identity and a human watching for Keychain prompts | `85-HUMAN-UAT.md` |

---

## Phase proof

Plan 85-19 Task 1, 2026-11-22, on the macOS machine (aarch64-apple-darwin, `rustc 1.99.1`, node 22.23.4, pnpm 10.28.0).

**P = `d90e33bc8aba8c15622b5156b07113343593a101`** (main). Clean checkout: `git worktree add --detach <scratchpad>/gamelib-85-proof <P>`, removed afterwards (`git worktree remove --force` + `git worktree prune`).

**Precondition.** The SUMMARYs of 85-01..85-18 all exist. 114 commit hashes they cite resolve; 113 are ancestors of P. The one that is not is `10c85ed72` (85-05's 0.10.0 bump), which lives only on branch `release/v0.10` by design (the signed baseline's build head), never on main.

**How P was reached.** The first candidate was `2ce910a69` (the 0.11.0 version bump on top of 85-18's SUMMARY commit `07601c1ae` and 85-17's `186ffb9eb`). Its proof found three real failures, each fixed on main as a scoped commit, and P moved each time:

| Found at | Failure | Fix | Commit |
|----------|---------|-----|--------|
| `2ce910a69` | darwin clippy ratchet FAIL: `clippy::redundant_closure` 1 (no ceiling) at `store_dispatch.rs:740` and `clippy::incompatible_msrv` 2 > ceiling 1 (`Option::is_none_or` at `:781`, stable 1.82, MSRV 1.77.2). Both from 85-10 `5aca95cd1` | pass `crate::shell_log` directly; `match` instead of `is_none_or`. No ceiling changed | `2bee0ba6c` |
| `2bee0ba6c` | jest `meta/__tests__/changelogVersionGate.test.ts` 4 failed: `public/changelog.json` identity still 0.8.0 after the bump | tag_name, name, html_url and body heading to 0.11.0 (as the 0.8.0 bump `0212fecb9` did); release prose unchanged, 0.11.0 notes owed | `ace12ef70` |
| `2bee0ba6c` | jest `meta/__tests__/rendererZodGuard.test.ts` rule d: `src/preload/tauriTransport.ts` and `src/preload/api/misc.ts` -> `src/common/types/storePolicy.ts` -> `./ipc/storeChannels.json` (since 85-16 `1848addc1`) | the guard (a zod-size stand-in) now admits a `.json` data module under ipc, which imports nothing; every `.ts` module under ipc is still forbidden; a detector test pins both halves | `d90e33bc8` |

**Results at P** (every command run inside the proof worktree; cargo steps in `src-tauri`, copied verbatim from `rust-test.yml`):

| # | Command | Exit | Counts / notes |
|---|---------|------|----------------|
| 1 | `pnpm install --frozen-lockfile` | 0 | "Lockfile is up to date" |
| 2 | `pnpm exec vite build` | 0 | renderer assembled into `build/renderer` |
| 3 | `pnpm build:sidecar-sea` | 0 | real SEA sidecar `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` (stronger than CI's placeholder step) |
| 4 | `cargo test -p gamelib-safety -p gamelib-testutil` | 0 | 95 passed, 0 failed, 0 ignored |
| 5 | `cargo test -p gamelib-proc` | 0 | 29 passed, 0 failed |
| 6 | `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-i18n -p gamelib-core -p gamelib-log -p gamelib-store -p gamelib-store-cli` | 0 | 93 test binaries, 1810 passed, 0 failed, 7 ignored; includes gamelib-store's 18 `atomic::` tests (the `atomic::windows` case is `cfg(windows)` and is owed to the CI windows leg) |
| 7 | static codec linkage (`cargo build -p gamelib-depot-cli` + `otool -L`) | 0 | links only Security, CoreFoundation, libiconv, libSystem; no lzma/zstd/zlib |
| 8 | `cargo test --bin gamelib-shell` | 0 | 702 passed, 0 failed, 2 ignored; includes `tests::keyring_names_are_pinned` (darwin; windows and ubuntu legs owed to CI) |
| 9 | `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` into `node ../meta/clippyRatchet.cjs <file> --list` | 0 | `PASS (darwin, toolchain 1.99.1)`; every lint at its ceiling (incompatible_msrv 1/1) |
| 10 | `pnpm check:ipc-contract` | 0 | `ipc_contract.rs` and `ipcSchemaSnapshot.json` up to date |
| 11 | `pnpm test` (run 1 at P) | 1 | 1145 suites run, 1144 passed; 24553 passed, 1 failed, 40 skipped. Failed: `runnerClone.test.ts` "aborts the clone through the abort controller and leaves no partial dir" hit the 900 s test timeout (load average 13-15 from other sessions). Alone, 5 of 5 runs: 64 passed, 1 skipped |
| 11b | `pnpm test` (run 2 at P) | 1 | 24540 passed, 14 failed, 40 skipped, all 14 in `steamLoginPollLifecycle.test.tsx` (the QR reference markup came back empty). Alone, 3 of 3 runs: 23 passed. `runnerClone.test.ts` passed in this run |
| 11c | `pnpm test` at `2bee0ba6c` (before the two jest fixes) | 1 | 24548 passed, 5 failed: only the changelog and zod-guard failures fixed above. Both flaky suites passed in this run |
| 12 | `pnpm smoke:exit-check -- --mode eof` | 0 | `PASS (exit latency 59 ms)`, no survivors |
| 13 | `pnpm smoke:sidecar` | 0 | built, started, wrote READY, exited 0 on stdin EOF |
| 14 | pre-push gate set: `pnpm codecheck`, `pnpm lint`, `pnpm prettier`, `pnpm i18n --fail-on-update`, `pnpm find-deadcode`, `pnpm boundaries`, `pnpm steam-line-ceiling`, `pnpm backend-di-ceilings`, `pnpm gameinfo-narrowing-ceiling` | all 0 | lint 0 errors (648 warnings, production and tests PASS); prettier clean; knip PASS (311 baselined); depcruise no violations (1441 modules); backend-di PASS (jestMock 1804); plus `pnpm planning-gates` 12/12 |
| 15 | `node .planning/spikes/092-store-mirror-protocol/sim.mjs --runs 10000 --seed 85` | 0 | all invariants held (P, G, V, R, C), 9995 distinct interleavings |
| 16 | 85-03 T2 frame-vector check; 85-03 T3 UAT parse | 0 | vectors well formed; `85-HUMAN-UAT.md` parses to 8 items, 0 headings |

**Jest verdict.** No test fails at P for a reason in the code: every failure across the three full runs is either fixed above or a suite that fails only under full-run load and passes alone (and passed in the other full runs). Neither flaky suite is Phase 85 code (`runnerClone` was last touched in 66.4, the Steam login suite is frontend). Both are recorded in `deferred-items.md`. CI's `test.yml` (ubuntu) is the jest authority after the push.

**Not proven here, owed to CI after the push (Task 3):** the windows-latest and ubuntu-latest legs of `rust-test.yml`, gamelib-store's `atomic::windows` test on windows-latest (S2), `keyring_names_are_pinned` on windows-latest and ubuntu-latest (D-10), and the win32 clippy ceiling map. The late mirror-cell rev handshake 85-17 deferred (`deferred-items.md`) is not built and is not a push blocker.

---

## CI proof

Plan 85-19 Task 3, 2026-11-22, within the operator's push-and-build decision.

**Pushes.** `git diff --name-only P HEAD` re-run immediately before the first push listed only
`.planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md` and `.../deferred-items.md`; `git push origin main`
(pre-push hook ran and passed, never `--no-verify`) moved origin/main `a0401bbc6..ffb8573d2`. One CI-only fix followed
(`c06a0c237`, below), pushed `ffb8573d2..c06a0c237`. Another session then pushed `482625ecc` (`docs(84)`, `.planning` only) on top,
which cancelled the runs for `c06a0c237` (workflow concurrency, `cancel-in-progress`); the runs at `482625ecc` are therefore the
CI proof of `c06a0c237`'s tree plus that one planning doc.

**Round 1, head `ffb8573d2` (= P plus the Task 1 proof record):**

| Workflow | Run id | Leg / job | Conclusion |
|----------|--------|-----------|------------|
| Rust test | 44978826059 | cargo-test (windows-latest) | success |
| Rust test | 44978826059 | cargo-test (macos-latest) | success |
| Rust test | 44978826059 | cargo-test (ubuntu-latest) | success |
| Test | 44978826083 | ci (ubuntu) | **failure**: `meta/__tests__/storeCorpus.test.ts` "finds no account data in any committed file", 1 failed of 24594 |
| Code check | 44978826070 | codecheck | success |
| Lint | 44978826052 | lint | success |
| Supply-chain audit | 44978826099 | cargo-deny, pnpm-audit | success, success |

CI-only failure and fix: the corpus redaction scan checks every string and key against `os.userInfo().username`. On a
GitHub-hosted runner that is `runner`, which is also the GameLib `runner` key (`runner: 'gog'`), so 128 findings were raised
across the store files. That check guards the harvesting operator's own name and is meaningless on a hosted runner; it is
disabled when `GITHUB_ACTIONS=true` and every other scan still runs (`c06a0c237`, verified locally in both modes, 21/21).

**Round 2, head `482625ecc` (tree = `c06a0c237` + one `.planning` doc), all green:**

| Workflow | Run id | Leg / job | Conclusion | Evidence from the step logs |
|----------|--------|-----------|------------|------------------------------|
| Rust test | 44980283910 | cargo-test (windows-latest) | success | multi-crate step (with `-p gamelib-store -p gamelib-store-cli`): 93 binaries, 1765 passed, 0 failed; **`atomic::windows::a_destination_held_without_share_delete_is_retried_then_written_directly ... ok`** (S2); shell step **`tests::keyring_names_are_pinned ... ok`** (D-10); clippy ratchet `PASS (win32, toolchain 1.99.1)` |
| Rust test | 44980283910 | cargo-test (macos-latest) | success | multi-crate 1810 passed, 0 failed; `keyring_names_are_pinned ... ok`; clippy `PASS (darwin, toolchain 1.99.1)` |
| Rust test | 44980283910 | cargo-test (ubuntu-latest) | success | multi-crate 1808 passed, 0 failed; **`tests::keyring_names_are_pinned ... ok`** (D-10); no clippy on Linux by design |
| Test | 44980283964 | ci (ubuntu) | success | 1139 suites passed, 12 skipped; 24377 passed, 217 skipped, 0 failed |
| Code check | 44980283978 | codecheck | success | |
| Lint | 44980284019 | lint | success | |
| Supply-chain audit | 44980284022 | cargo-deny, pnpm-audit | success, success | |

No clippy ceiling changed: both platforms passed at their existing ceilings.

**Release build:** `gh workflow run release-tauri.yml --ref main -f dry_run=false`, run 44978855761, head `ffb8573d2` (P's code;
`c06a0c237` is a test-only change and does not alter the artifact). macOS `aarch64-apple-darwin` success (completed
2026-11-22T03:24:19Z), Windows `x86_64-pc-windows-msvc` success, Linux `ubuntu-22.04` success. Output: draft prerelease
`GameLib v0.11.0` (tag `v0.11.0`, target `ffb8573d2`, **not published**), assets `GameLib_0.11.0_aarch64.app.tar.gz`(+`.sig`),
`GameLib_0.11.0_aarch64.dmg`, `GameLib_0.11.0_amd64.AppImage`(+`.sig`), `GameLib_0.11.0_x64-setup.exe`(+`.sig`), `latest.json`.

---

## Signed baseline (D-16)

Inventory taken 2026-11-22 by plan 85-05 Task 1. Commands and short outputs only; no secret values.

**SC3: pending (identities match; live gate owed by 85-20)**

### Inventory

| Check | Result |
|-------|--------|
| `git tag -l 'v0.*'` | `v0.10` (local only), `v0.7.0-glibc-test1`, `v0.8`, `v0.8.0`, `v0.9` |
| `git ls-remote --tags origin 'v0.*'` | `v0.7.0-glibc-test1`, `v0.8`, `v0.8.0`, `v0.9`; **no `v0.10`**. Local `v0.10` is `2baad18e0` -> commit `58a0c1c7a` ("record v0.10 closeout disclosure and point STATE at v0.11", 2026-11-20) |
| `gh release list -L 10` | no `v0.10` and no `v0.9` release. Only `GameLib v0.8.0` (one Draft, one Pre-release, tag `v0.8.0`), `Updater feed` (`updater`), `runners-onedir-macos`, `crossover-index`, and two component pre-releases |
| `gh run list --workflow release-tauri.yml -L 5` | `v0.9` push 42190933355 success (2026-11-06); `v0.8` push 38856607168 success (2026-10-16); `v0.8.0` push 36900898500 success and 36843945458 failure (2026-10-01); `v0.7.0-glibc-test1` push 36556473399 success (2026-09-29). No run for `v0.10` |
| `security find-identity -v -p codesigning` (local) | one identity: `468BEA6D513FBE23A5760BD53E0E7F2F0BA88B78` "Apple Development: grayson mitchell (4BULWN7PPN)". No Developer ID identity locally |
| `gh secret list` (names only) | **not run**: the permission classifier denied the call. Enrolment is inferred instead from run 42190933355 (see below), not confirmed by name |

### What the last CI run (v0.9, 42190933355) shows

Read from `gh run view 42190933355 --json jobs` and its log, as evidence for what the workflow does with the enrolled secrets:

- All three legs concluded `success` (macOS `macos-latest aarch64-apple-darwin`, Linux `ubuntu-22.04`, Windows `windows-latest`).
- The macOS leg ran "Sign every Mach-O in the macOS helper tree before bundling" (its `if:` needs a non-empty `APPLE_SIGNING_IDENTITY`) and signed `gamelib-sidecar`, `gamelib-shell`, `GameLib.app`, the updater zip and the dmg with a `Mac Developer ID Application: grayson mitchell` identity (the identity string is masked as `***` in the log). So the CI path signs with a **Developer ID Application** identity, which is a different identity from the local `Apple Development` one. Nothing built locally can stand in for the baseline (D-16).
- Its keyword search of the log found no `Accepted` notarization line and no stapling line. Whether v0.9 was notarized is therefore unconfirmed here; the artifact check in Task 3 (`spctl`, `stapler validate`) is what decides it.
- The Windows leg shipped unsigned (no Windows cert secret). That does not affect the macOS baseline.

### Two things the operator needs to know before choosing (found during the inventory)

1. **`src-tauri/tauri.conf.json` says `"version": "0.8.0"` at the `v0.10` tag (and on `main`).** tauri-action's `tagName: v__VERSION__` resolves from that field, not from the pushed tag, and the v0.9 run produced `GameLib_0.8.0_aarch64.dmg`. A non-dry run triggered by a `v0.10` tag push therefore targets the release `v0.8.0` (a published pre-release plus a draft already exist under that tag), not a new `v0.10` release. `v0.8.0`'s assets were last updated 2026-10-01, so the v0.8 and v0.9 runs did not visibly change it; this inventory did not establish where their artifacts went. Expect the baseline artifact to be named `GameLib_0.8.0_*`, and expect a non-dry run to write to the `v0.8.0` release (which also carries `latest.json`, the updater manifest). Decide whether that is acceptable before running Option A or B2; this plan does not change the version or the workflow.
2. **A dry run uploads nothing.** The workflow header states a dry run delivers the build log, not a binary (no `upload-artifact` step by design), so Option B yields no artifact that `gh run download` can fetch and cannot satisfy Task 3. Task 3 needs an artifact, which only a non-dry run produces (Option A or B2).

### Operator options (Task 2: one human step)

- **Option A:** `git push origin v0.10`. A `v*` tag push runs release-tauri.yml (non-dry), signs, and opens a draft prerelease. Subject to caveat 1 above.
- **Option B (as D-16 and the plan word it):** `gh workflow run release-tauri.yml --ref v0.10 -f dry_run=true`. Signs and may notarize, but uploads nothing (caveat 2): the run id is recorded, no identity can be read from an artifact, so on its own this leaves SC3 unproven.
- **Option B2:** `gh workflow run release-tauri.yml --ref v0.10 -f dry_run=false`. Same build and release behaviour as Option A without creating the `v0.10` tag on the remote. Subject to caveat 1.
- Then `gh run watch <id>` until the macOS leg finishes, and reply with the run id, or reply `deferred` to stop with SC3 recorded as unproven.
- Claude does not push tags, dispatch release workflows, or publish a release. The workflow only ever opens a draft prerelease; publication is the operator's decision.

### What gets recorded once the run finishes (Task 3)

From the downloaded macOS artifact itself, never from the log: run id and artifact name; each leg's conclusion; `codesign -dv --verbose=4` (Authority chain, TeamIdentifier, Identifier, signing time); `codesign -d -r-` (designated requirement); `spctl -a -vv` (accepted or rejected, and source); `xcrun stapler validate` (stapled or not).

### Baseline record (Task 3, 2026-11-22)

The operator chose the version bump: branch `release/v0.10` at `10c85ed72` bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `Cargo.lock` from 0.8.0 to 0.10.0 (caveat 1 resolved, so tauri-action targeted a new `v0.10.0` release rather than `v0.8.0`). Run with Option B2 on that branch.

- **Run:** release-tauri.yml `44925761249`, headBranch `release/v0.10`, headSha `10c85ed72cb9c1c0ba907a764c3ac6557883b478`. First attempt: Linux and Windows `success`; macOS failed at notarization with `HTTP status code: 403. A required agreement is missing or has expired`. The operator accepted the updated Apple Developer Program agreement and the failed leg was rerun.
- **Leg conclusions:** macOS `aarch64-apple-darwin` `success` (16m31s, completed 2026-11-21T23:15:11Z); Windows `x86_64-pc-windows-msvc` `success`; Linux `ubuntu-22.04` `success`.
- **Artifact:** draft release `GameLib v0.10.0` (tag `v0.10.0`, not published). Inspected `GameLib_0.10.0_aarch64.app.tar.gz` (sha256 `028566815d75ffc35d3e92935ec38ddc069c62e6944821a17b177c13a02500ea`) and `GameLib_0.10.0_aarch64.dmg` (sha256 `359aeffc9b21a8852542e0887ba69235472cba7ad808327187d9bca572d1785f`), downloaded with `gh release download` (a non-dry run uploads to the release, not as a run artifact).
- **`codesign -dv --verbose=4 GameLib.app`:** `Identifier=com.gamelib.shell`; `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`; `TeamIdentifier=S7U223QWXJ`; `Timestamp=22 Nov 2026 at 12:11:37 PM` (local); flags `0x10000(runtime)`; `CDHash=67b2149aafcae158b769a49ddc7927487c7dd44f`. `codesign --verify --deep --strict` passes.
- **Designated requirement (`codesign -d -r-`):** `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`
- **`spctl -a -vv GameLib.app`:** `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: grayson mitchell (S7U223QWXJ)`.
- **`xcrun stapler validate GameLib.app`:** stapled (`The validate action worked!`).
- **DMG (note, not a blocker):** the dmg container itself has no stapled ticket and `spctl -t open` rejects it as `Unnotarized Developer ID`. The app inside is notarized and stapled, and the Keychain ACL binds to the app's designated requirement, so this does not affect SC3. Recorded so 85-19 compares like with like.
- Downloaded files deleted from the scratchpad after recording.

### Phase 85 build (85-19 Task 3, 2026-11-22)

Same workflow (`release-tauri.yml`), same Apple secrets, run with `dry_run=false` on `main`.

- **Run:** release-tauri.yml `44978855761`, workflow_dispatch on `main`, headSha `ffb8573d2b0eb7e10edcfda57113d02632f5f04d`. All three legs `success` (macOS completed 2026-11-22T03:24:19Z).
- **Artifact:** draft release `GameLib v0.11.0` (tag `v0.11.0`, not published). Inspected `GameLib_0.11.0_aarch64.app.tar.gz` (sha256 `88b57a68fbd736e2829aba98f833189b41e11bc0120e4980511389bae87ad8f7`), downloaded with `gh release download v0.11.0 -p 'GameLib_0.11.0_aarch64.app.tar.gz'`. The app is compared like with like with the baseline's app (the dmg container was not stapled at the baseline either).
- **`codesign -dv --verbose=4 GameLib.app`:** `Identifier=com.gamelib.shell`; `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`; `TeamIdentifier=S7U223QWXJ`; `Timestamp=22 Nov 2026 at 4:20:44 PM` (local); flags `0x10000(runtime)`; `CDHash=4ca4869a7ce92359eb2ca453ac9dcaf5978bfb4e`. `codesign --verify --deep --strict` passes.
- **Designated requirement (`codesign -d -r-`):** `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`
- **`spctl -a -vv GameLib.app`:** `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: grayson mitchell (S7U223QWXJ)`.
- **`xcrun stapler validate GameLib.app`:** stapled (`The validate action worked!`).
- Downloaded files deleted from the scratchpad after recording.

**Comparison with the baseline:**

| Property | v0.10.0 baseline (run 44925761249) | Phase 85 build (run 44978855761) | Equal |
|----------|------------------------------------|----------------------------------|-------|
| Identifier | `com.gamelib.shell` | `com.gamelib.shell` | yes |
| Leaf authority | Developer ID Application: grayson mitchell (S7U223QWXJ) | same | yes |
| TeamIdentifier | `S7U223QWXJ` | `S7U223QWXJ` | yes |
| Designated requirement | (string above, baseline record) | byte-identical string (compared by script) | yes |
| spctl | accepted, Notarized Developer ID | accepted, Notarized Developer ID | yes |
| stapler | stapled | stapled | yes |
| CDHash | `67b2149a...` | `4ca4869a...` | differs, as expected for a different build; the Keychain ACL binds to the designated requirement, not the CDHash |

The identities match, so SC3 is `pending`: the live upgrade gate is owed by 85-20.

### Identity rule for the Phase 85 build

The Phase 85 build must come from the same workflow (`release-tauri.yml`), the same Apple secrets, and carry the same TeamIdentifier and designated requirement as the baseline. Plan 85-19 records the Phase 85 artifact's identity in this section before 85-20 is scheduled; 85-20 does not score items 1-2 unless the two identities are equal. Until both are recorded and equal, SC3 stays unproven. Research A1/A8 (flagged assumption, not resolved here): macOS Keychain item ACLs bind to the accessing binary's code signature, so the D-08 gate is meaningful only when both builds share the designated requirement.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
