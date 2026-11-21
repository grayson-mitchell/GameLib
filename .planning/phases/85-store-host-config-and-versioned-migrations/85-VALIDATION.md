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

Task IDs are bound by the planner. Requirement-level map (from research):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| FND-06 / SC1 | Corpus loads; no-op re-save byte-identical; unknown keys preserved at current version | integration | `cargo test -p gamelib-store --test corpus roundtrip_is_byte_identical` | ❌ W0 | ⬜ pending |
| FND-06 / SC1 | Fixture manifest complete (cannot pass vacuously) | integration | `cargo test -p gamelib-store --test corpus manifest_is_complete` | ❌ W0 | ⬜ pending |
| FND-06 / SC1 | JS key order on insert; dot-path parity with `dot-prop@6` | unit + golden | `cargo test -p gamelib-store json::order dotpath` + `storeOracle.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 / SC1 | Number/escape vectors | unit | `cargo test -p gamelib-store json::numbers` | ❌ W0 | ⬜ pending |
| FND-06 / SC1 | Strip migrations equal TS zod oracle | golden | `cargo test -p gamelib-store --test migrate_golden` | ❌ W0 | ⬜ pending |
| FND-06 / SC1 | Schema descriptor not stale | jest | `pnpm exec jest src/backend/storeMigrations/__tests__/schemaDescriptor.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 / SC2 | Backup before migrate; newer = read-only; corrupt kept + reported; missing = empty | unit | `cargo test -p gamelib-store engine::` | ❌ W0 | ⬜ pending |
| FND-06 / SC2 | Read-only notice payload parity | unit + jest vector | `cargo test -p gamelib-store readonly::` | ❌ W0 | ⬜ pending |
| FND-06 | Atomic write incl. Windows open-handle | unit (+ CI Windows) | `cargo test -p gamelib-store atomic::` | ❌ W0 | ⬜ pending |
| FND-06 | Ordering: rev under lock, in-order events | unit | `cargo test -p gamelib-store host::ordering` | ❌ W0 | ⬜ pending |
| FND-06 | Mirror read-your-writes, rebase, shared-file coherence, unref | jest | `pnpm exec jest src/backend/stores/__tests__/mirrorCell.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | `kind:"store"` frame vectors shared jest/cargo | unit | `cargo test --bin gamelib-shell store_frame` | ❌ W0 | ⬜ pending |
| FND-06 | Renderer policy vectors TS = Rust | unit | `cargo test --bin gamelib-shell store_policy` ; `pnpm exec jest storePolicy` | ❌ W0 | ⬜ pending |
| FND-06 | One owner per channel (83 census) | jest | `pnpm exec jest nativeSeamPortComplete` + `pnpm check:ipc-contract` | ✅ update | ⬜ pending |
| FND-06 | `uploadedLogs` v0.10 tab+envelope regression | unit | `cargo test --bin gamelib-shell log_upload` | ✅ add case | ⬜ pending |
| FND-06 / SC4 | Legendary reachability recorded; TS migration system deleted | jest | `pnpm exec jest src/backend/__tests__/storeHostPortComplete.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 / SC5 | Mirror deletion schedule pinned; TS dirs deleted | jest | `storeHostPortComplete.test.ts`, `storeKinds.test.ts` | ❌ W0 | ⬜ pending |
| FND-07 / SC3 | Keyring names unchanged; store crates have no keyring dep | unit + `cargo tree` | `cargo test --bin gamelib-shell keyring_` | ❌ W0 | ⬜ pending |
| Exit | Store drain holds Registrant, within budget | unit | `cargo test -p gamelib-store host::drain` | ❌ W0 | ⬜ pending |
| Gates | Sidecar boot with no Rust peer exits cleanly | smoke | `pnpm smoke:sidecar` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/stores/__tests__/storeOracle.test.ts` + `src-tauri/crates/gamelib-store/tests/fixtures/{golden,corpus,MANIFEST.json}` committed before any TS change
- [ ] Corpus harvest + redaction tool under `createFakeHomeProfile()`, with a redaction test
- [ ] `85-HUMAN-UAT.md` live-gate contract (convention 5 item shape), incl. signing-identity precondition
- [ ] `gamelib-store` crate scaffold + CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`)
- [ ] `storeChannels.json` policy vectors; `storeFrameVectors.json`
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
