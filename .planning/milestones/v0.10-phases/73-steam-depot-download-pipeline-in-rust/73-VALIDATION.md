---
phase: 73
slug: steam-depot-download-pipeline-in-rust
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-09
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `73-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` for `gamelib-depot` / `gamelib-depot-cli`; Jest 29 + ts-jest for the TS side |
| **Config file** | `src-tauri/Cargo.toml` (workspace), `jest.config.js` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-depot -p gamelib-depot-cli` ; `pnpm exec jest <touched paths>` |
| **Full suite command** | `pnpm test:ci && cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli && cargo test --bin gamelib-shell` |
| **Also** | `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm smoke:sidecar`, clippy ratchet (`meta/clippyRatchet.cjs`) |
| **Estimated runtime** | ~300 seconds (full); ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** quick run command plus affected Jest files; `npx prettier --check <exact paths>` in every `<verify>`
- **After every plan wave:** full suite + clippy ratchet + `pnpm check:ipc-contract` + `pnpm find-deadcode`
- **Before `/gsd-verify-work`:** full suite green, Tier 2 parity sweep clean, live UAT passed, three CI legs green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

Filled in per task once plans exist. Decision → test map (from research):

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01 | manifest fetch → unzip → prost decode → names decrypted → cache hit | unit/integration | `cargo test -p gamelib-depot manifest` | ❌ W0 | ⬜ pending |
| D-02 | summaries equal TS prescreen on fixtures; full manifest never returned | unit + Jest | `cargo test -p gamelib-depot summarize`; `pnpm exec jest src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| D-03 | 403 on token host → one forced `cdn_token` refresh → retry succeeds | integration | `cargo test -p gamelib-depot fetch_token` | ❌ W0 | ⬜ pending |
| D-04 | host failover, health scoring, stall, limiter bound | unit | `cargo test -p gamelib-depot host_health stall inflight` | ❌ W0 | ⬜ pending |
| D-05 | job schema accepts `fromManifest: null`, rejects unknown fields | unit | `cargo test -p gamelib-depot job_schema` | ❌ W0 | ⬜ pending |
| D-06 | long job not bound by 60 s; ≥1 Hz heartbeat; no per-chunk frames | integration + Jest | `cargo test -p gamelib-depot events_throttle`; Jest on `rustDepot.ts` | ❌ W0 | ⬜ pending |
| D-07 | cancel mid-file, second job fetches only missing | integration | `cargo test -p gamelib-depot cancel_resume` | ❌ W0 | ⬜ pending |
| D-08 | `cancel_all()` on sidecar EOF; no writer after return | unit (shell) | `cd src-tauri && cargo test --bin gamelib-shell depot_eof` | ❌ W0 | ⬜ pending |
| D-09 | every Rust error kind → same `classifyDepotError` key/action | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/depotRustErrorMap.test.ts` | ❌ W0 | ⬜ pending |
| D-10 | reconcile, modes, Mach-O, collisions, census equal TS vectors | unit | `cargo test -p gamelib-depot reconcile post` | ❌ W0 | ⬜ pending |
| D-11 | ACF text equals TS generator; atomic; StateFlags gate fail-closed | golden | `cargo test -p gamelib-depot acf` | ❌ W0 | ⬜ pending |
| D-12 | shared-redist job: own root, `finalize:null`, no ACF | integration | `cargo test -p gamelib-depot redist_job` | ❌ W0 | ⬜ pending |
| D-13 | `verify_only` fetches nothing, reports mismatches | integration | `cargo test -p gamelib-depot verify_only` | ❌ W0 | ⬜ pending |
| D-14 T1 | synthetic fixture tree SHA1 == TS-oracle `expected.json` | golden | `cargo test -p gamelib-depot --test golden` | ❌ W0 | ⬜ pending |
| D-15 CI | static liblzma/zstd/zlib on all three OS legs | CI check | `otool -L` / `ldd` / `dumpbin /dependents` on `gamelib-depot-cli` | ❌ W0 | ⬜ pending |
| D-16 | flag selects path; never mixed within one job | Jest | `pnpm exec jest …depotPipelineFlag.test.ts` | ❌ W0 | ⬜ pending |
| Wiring | channel constants == OPS == match arms; contract fresh | Jest + cargo | `pnpm exec jest src/backend/sidecar/__tests__/transportParity.test.ts`; `pnpm check:ipc-contract` | ✅ / ❌ W0 | ⬜ pending |
| Deletion | TS pipeline + `lzma-native` gone; `lzma`/`zstddec`/patches kept | Jest | `pnpm exec jest src/backend/__tests__/depotPortComplete.test.ts` | ❌ W0 | ⬜ pending |
| Lockfile | new crate names pinned | Jest | `pnpm exec jest src/backend/__tests__/cargoFeatures.test.ts` | ✅ (update) | ⬜ pending |
| Exit contract | started-then-EOF job: sidecar exits by drain under fake HOME | smoke | `pnpm smoke:sidecar` + `createFakeHomeProfile()` case | ✅ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-depot/` and `gamelib-depot-cli/` skeletons, lints, workspace/lockfile, `rust-test.yml` `-p` entries
- [ ] Synthetic CDN fixtures: test-only encoders (zip/VZ/VSZa/AES), prost manifest builder, local HTTP server, fake `JobHost`
- [ ] TS oracle generator writing `expected.json` from the current TS pipeline — lands **before** any TS deletion
- [ ] Ported unit vectors from `hostHealth`, `inflightLimiter`, `reconcile`, `pathCollisions`, `flagsCensus`, `fileAttributes`, `manifest`, `depot.finalize` tests
- [ ] `depotRustErrorMap.test.ts`, `depotChannelParity.test.ts`, `depotPipelineFlag.test.ts`
- [ ] Tier 2 sweep script + parity corpus selection (container histogram)

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Tier 2 real-corpus parity: zero SHA1/mode/ACF diffs | D-14 | Needs live Steam login and owned games | Run sweep script against chosen zip/LZMA/zstd titles; exit 0 required |
| Live install, pause/resume, cancel, sidecar restart mid-job, bridge install, redist job | D-15 | Real app + network | `pnpm tauri:dev`; UAT file items each name the log line proving the Rust path ran |
| Throughput within noise; peak RSS ≤ post-fix Node pool | D-17 | Network-dependent | Reuse spike 067a `run.sh` against Rust path on same connection |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
