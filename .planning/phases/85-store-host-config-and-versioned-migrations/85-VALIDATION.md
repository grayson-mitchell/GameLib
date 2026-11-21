---
phase: "85"
slug: "store-host-config-and-versioned-migrations"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 85-01-T1..T3 | FND-06 / SC1 | TS oracle golden (ops, engine, migrate, settings docs) and dot-path, number, key-order vectors | golden | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeOracle.test.ts` | ❌ W0 | ⬜ pending |
| 85-02-T1..T3 | FND-06 / SC1 | Redacted corpus complete, hashed, floored; redaction clean | jest | `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/storeCorpus.test.ts` | ❌ W0 | ⬜ pending |
| 85-03-T1 | FND-06 | Renderer policy vectors = today's TS | jest | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storePolicyVectors.test.ts` | ❌ W0 | ⬜ pending |
| 85-03-T2 | FND-06 | Store frame contract vectors well-formed | node check | see 85-03 Task 2 `<verify>` | ❌ W0 | ⬜ pending |
| 85-03-T3 | FND-06 / FND-07 | Live gate contract parses (8 items, headingsSeen 0) | uat parse | see 85-03 Task 3 `<verify>` | ❌ W0 | ⬜ pending |
| 85-04-T1..T2 | FND-06 | S1 protocol model converges; S3-S5 constants recorded | spike | `node .planning/spikes/092-store-mirror-protocol/sim.mjs --runs 10000 --seed 85` | ❌ W0 | ⬜ pending |
| 85-05-T1..T3 | FND-07 / SC3 | Signed v0.10 baseline identity recorded (D-16) | manual + gh | see 85-05 `<verify>` | ❌ W0 | ⬜ pending |
| 85-06-T1 | FND-06 / SC1 | Every golden file round-trips byte-identical in Rust | golden | `cd src-tauri && cargo test -p gamelib-store --test golden` | ❌ W0 | ⬜ pending |
| 85-06-T2 | FND-06 / SC1 | JS number text and key order (vectors) | unit | `cd src-tauri && cargo test -p gamelib-store --test vectors` | ❌ W0 | ⬜ pending |
| 85-06-T3 | FND-06 | dot-prop paths; atomic write incl. Windows open handle (S2 on CI) | unit (+ CI Windows) | `cd src-tauri && cargo test -p gamelib-store dotpath:: && cargo test -p gamelib-store atomic::` | ❌ W0 | ⬜ pending |
| 85-07-T1 | FND-06 / SC1 | Golden ops replay byte-identical (envelope, reserved key) | golden | `cd src-tauri && cargo test -p gamelib-store --test ops_golden` | ❌ W0 | ⬜ pending |
| 85-07-T2 | FND-06 / SC2 | Backup before migrate; newer read-only; corrupt copied aside and kept (D-18); missing empty | golden + unit | `cd src-tauri && cargo test -p gamelib-store --test engine_golden && cargo test -p gamelib-store engine::` | ❌ W0 | ⬜ pending |
| 85-07-T3 | FND-06 / SC1 | Corpus: manifest complete, no-op open byte-identical, outcomes match; store table drift | integration + jest | `cd src-tauri && cargo test -p gamelib-store --test corpus` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeTable.test.ts` | ❌ W0 | ⬜ pending |
| 85-08-T1..T2 | FND-06 / SC1 | Schema descriptor not stale; migrations equal TS oracle; versions pinned (D-04) | golden + jest | `cd src-tauri && cargo test -p gamelib-store --test migrate_golden` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/schemaDescriptor.test.ts` | ❌ W0 | ⬜ pending |
| 85-08-T3 | FND-06 / SC1 | Older corpus files migrate like TS; CLI open on FakeHome | integration | `cd src-tauri && cargo test -p gamelib-store --test corpus older_versions_match_ts_oracle && cargo test -p gamelib-store-cli` | ❌ W0 | ⬜ pending |
| 85-09-T1 | FND-06 | uploadedLogs v0.10 tab+envelope regression | unit | `cd src-tauri && cargo test --bin gamelib-shell log_upload` | ✅ add case | ⬜ pending |
| 85-09-T2 | FND-06 | Rev under lock, ordered events, rollback, read-only, eviction | unit | `cd src-tauri && cargo test -p gamelib-store host::` | ❌ W0 | ⬜ pending |
| 85-09-T3 | FND-06 | Bounded boot open, mode/ownership, boot env, `store` exit drain | unit + jest gates | `cd src-tauri && cargo test --bin gamelib-shell store_boot && cargo test --bin gamelib-shell handle_exit` | ❌ W0 | ⬜ pending |
| 85-10-T1..T3 | FND-06 | Frame write path end to end; frame vectors on both sides; flush; registrant | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_frame` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeWritePath.test.ts` | ❌ W0 | ⬜ pending |
| 85-11-T1..T3 | FND-06 | Mirror protocol property test, shared cells, dot paths, quit flush, D-02 fallback | jest | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/mirrorCell.test.ts src/backend/stores/__tests__/dotPath.test.ts src/backend/stores/__tests__/storeFallback.test.ts` | ❌ W0 | ⬜ pending |
| 85-12-T1..T2 | FND-06 | Cache family flipped; runtime caches; corrupt cache startEmpty | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/cacheFamily.test.ts` | ❌ W0 | ⬜ pending |
| 85-13-T1..T2 | FND-06 | User-state flipped; libraries migrated at boot | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/userStateFamily.test.ts` ; `cd src-tauri && cargo test --bin gamelib-shell store_boot` | ❌ W0 | ⬜ pending |
| 85-14-T1 | FND-06 | Account family flipped; shared steam_store cell; tightening | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/accountFamily.test.ts` | ❌ W0 | ⬜ pending |
| 85-14-T2 | FND-07 / SC3 / D-10 | Keyring names pinned on all CI legs; no keyring dep in store crates | unit + `cargo tree` | `cd src-tauri && cargo test --bin gamelib-shell keyring_` | ❌ W0 | ⬜ pending |
| 85-15-T1..T3 | FND-06 | Settings family flipped; readSettingsDoc; D-22; resync; eviction | jest + unit | `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/settingsDocs.test.ts src/backend/stores/__tests__/settingsFamily.test.ts src/backend/__tests__/settingsMirrorResync.test.ts` | ❌ W0 | ⬜ pending |
| 85-16-T1..T3 | FND-06 / SC2 | Native reads; one owner per channel; policy TS = Rust; Rust read-only notice | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_policy && cargo test --bin gamelib-shell store_native` ; `pnpm exec jest --runTestsByPath src/backend/__tests__/nativeSeamPortComplete.test.ts` ; `pnpm check:ipc-contract` | ✅ update | ⬜ pending |
| 85-17-T1..T3 | FND-06 | Native writes and storeChanged with rev; preload stale-push guard | unit + jest | `cd src-tauri && cargo test --bin gamelib-shell store_native` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/rendererWrites.test.ts src/preload/__tests__/tauriTransport.test.ts` | ❌ W0 | ⬜ pending |
| 85-18-T1..T2 | FND-06 | Bottle version gate (D-17) for marker and ledger | unit + jest | `cd src-tauri && cargo test -p gamelib-store version_gate && cargo test --bin gamelib-shell store_gate` ; `pnpm exec jest --runTestsByPath src/backend/stores/__tests__/bottleVersionGate.test.ts` | ❌ W0 | ⬜ pending |
| 85-19-T1..T3 | FND-06 / FND-07 | Clean-worktree proof; three-OS CI; Phase 85 signed identity recorded | proof | see 85-19 | — | ⬜ pending |
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
| all | Gates | Sidecar boot with no Rust peer exits cleanly | smoke | `pnpm smoke:sidecar` | ✅ | ⬜ pending |

Binding notes: SC5 is read per D-19, not literally: ROADMAP SC5's "named and executed for every family flipped in this phase" means every persisted store's TS-mirror deletion phase is named (pinned by `storeMirrorSchedule.test.ts`, copied from `82-STATE-OWNERSHIP.md`) and only the deletions due in Phase 85 are executed (`migrationsStore`'s mirror), plus deletion of the TS *owner* path for every family (D-03); the other mirrors are deleted in the phases their column names, and the schedule test fails if one disappears early. D-03's "the phase's last plan deletes" is carried by 85-21..85-24, which run back to back after the live gate (85-20) with nothing else between them and the post-deletion proof (85-25); the split is for context budget only (storeVersioning's `versioning` dependency is threaded through about 60 consumer files). The schema descriptor drift test lives at `src/backend/stores/__tests__/schemaDescriptor.test.ts` (not under storeMigrations/, which 85-24 deletes); the read-only area parity is proven by cargo's `store_policy` tests over `storePolicyVectors.json` (85-16), so no separate `readonly::` module exists; the store drain is proven by `store_boot` and `store_frame` tests (85-09, 85-10) rather than a `host::drain` filter.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/stores/__tests__/storeOracle.test.ts` + `src-tauri/crates/gamelib-store/tests/fixtures/{golden,corpus,MANIFEST.json}` committed before any TS change
- [ ] Corpus harvest + redaction tool under `createFakeHomeProfile()`, with a redaction test
- [ ] `85-HUMAN-UAT.md` live-gate contract (convention 5 item shape), incl. signing-identity precondition
- [ ] `gamelib-store` crate scaffold + CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`)
- [ ] `storePolicyVectors.json` policy vectors (85-03; the policy itself moves to `storeChannels.json` in 85-16); `storeFrameVectors.json`
- [ ] `meta/genStoreSchemas.ts` + drift test
- [ ] Spikes S1–S5 (mirror rebase sim, Windows rename, frame throughput, GamesConfig sweep, `sync_all` cost)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signed v0.10 → signed Phase 85 upgrade: zero Keychain prompts, sign-ins survive | FND-07 / SC3 | Needs real signed releases with the same identity and a human watching for Keychain prompts | `85-HUMAN-UAT.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
