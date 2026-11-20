---
phase: "84"
slug: "logger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `84-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (std harness, per crate); TS jest (projects incl. `Meta`) |
| **Config file** | `src-tauri/Cargo.toml`, `jest.config.*`, `.github/workflows/rust-test.yml` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-log && cargo test -p gamelib-core` |
| **Full suite command** | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-log -p gamelib-core -p gamelib-proc -p gamelib-steamcm`, then `pnpm exec jest --runTestsByPath <changed suites>`, `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode` |
| **Estimated runtime** | ~180 seconds (quick ~30 s) |

---

## Sampling Rate

- **After every task commit:** the crate/suite named in that task's `<verify>`, plus `npx prettier --check` on the exact written paths (`--file-info` first; `.planning` is prettier-ignored, so omit the check there and say so)
- **After every plan wave:** `cargo test -p gamelib-log -p gamelib-core` + `cargo test --bin gamelib-shell` + targeted jest + `pnpm check:ipc-contract` + `pnpm codecheck`
- **Before `/gsd-verify-work`:** CI `rust-test.yml` green on three legs, the full jest suite green on CI, and the live macOS gate run
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Task IDs get filled in by the planner. The map below is by criterion.

| Criterion | Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|----------|-----------|-------------------|-------------|--------|
| SC1 | Line format, rotation, `.old`, location, per-chunk rule and sanitiser output byte-equal to the TS golden | golden | `cargo test -p gamelib-log --test golden`; `pnpm exec jest --runTestsByPath meta/__tests__/logGolden.test.ts` | ❌ W0 | ⬜ pending |
| SC1 | New files created with unix mode 0600 (pending OQ1) | unit | `cargo test -p gamelib-log writer::mode` | ❌ W0 | ⬜ pending |
| SC1 | Windows rotation with `.old` held open; path segments | unit (CI Windows) | `cargo test -p gamelib-log writer::windows` | ❌ W0 | ⬜ pending |
| SC1 | Secondary instance never rotates | unit | `cargo test -p gamelib-log writer::second_init` | ❌ W0 | ⬜ pending |
| SC2 | The 7 channels validate and route; invalid vectors rejected; one owner | unit + census | `cd src-tauri && cargo test --bin gamelib-shell native_`; `pnpm check:ipc-contract`; ownership/schema/census jest suites | ✅ extend | ⬜ pending |
| SC2 | Upload/delete/list against a localhost server; expiry prune; StoreHost round trip of an existing `uploadedLogs.json` | unit/integration | `cargo test -p gamelib-log uploader`; `cargo test -p gamelib-core store` | ❌ W0 | ⬜ pending |
| SC2 | Show-in-folder and getLogContent through a `NativeHost` fake | unit | `cargo test --bin gamelib-shell log_` | ❌ W0 | ⬜ pending |
| SC3 | steam-vent `tracing` and reqwest `log` events land with the mapped prefix; DEBUG only when raised | unit | `cargo test -p gamelib-log bridge` | ❌ W0 | ⬜ pending |
| SC3 | Repeating error rate-limited, with a summary line (scripted clock) | golden | `cargo test -p gamelib-log limiter` | ❌ W0 | ⬜ pending |
| D-10 | TS forwarder: bounded queue, drop oldest + count, early-boot lines kept, timer unref'd | jest | `pnpm exec jest --runTestsByPath src/backend/logger/__tests__/forwarder.test.ts` | ❌ W0 | ⬜ pending |
| D-10 | `log` frame validation vectors shared by jest and cargo (size cap, traversal) | unit | `cargo test --bin gamelib-shell log_frame` + jest vectors | ❌ W0 | ⬜ pending |
| SC4 | TS logger internals, `loggerFlowRegistration`, `shell_diag`, `gamelib-shell.log` and `VentLogForwarder` gone | PortComplete gate | `pnpm exec jest --runTestsByPath src/backend/__tests__/loggerPortComplete.test.ts` | ❌ W0 | ⬜ pending |
| D-13 | Flush inside the exit budget; no permanent registrant | unit | `cargo test -p gamelib-core shutdown`; `cargo test --bin gamelib-shell handle_exit` | ✅ extend | ⬜ pending |
| Gates | 4 shell_diag source-text tests rewritten and still non-vacuous; logSecretGate still sees its names | jest | the four `*DiagPersistence` / `tauriShellSource` suites; `meta/__tests__/logSecretGate.test.ts` | ✅ rewrite | ⬜ pending |
| Exit | Forwarder adds no unbounded exit work | smoke | `pnpm smoke:exit-check`, `pnpm smoke:sidecar` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `meta/genLogGolden.ts` + `src-tauri/crates/gamelib-log/tests/fixtures/golden/*` + `meta/__tests__/logGolden.test.ts`, committed before any TS is touched (the oracle)
- [ ] `84-HUMAN-UAT.md` live-gate contract, authored before coding (UAT item shape per convention 4)
- [ ] `gamelib-log` crate scaffold + CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`)
- [ ] Shared `log` frame vectors file (valid/invalid)
- [ ] `src/backend/__tests__/loggerPortComplete.test.ts`
- [ ] Batch/cap calibration with a synthetic emitter (replaces research assumption A2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Packaged macOS: `[Shell]` line in `gamelib.log`, real Wine launch transcript byte-faithful, UI upload, show in folder, a steam-vent WARN | FND-05 | Needs the packaged app, a real game and the network | `84-HUMAN-UAT.md` (authored first, run last) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
