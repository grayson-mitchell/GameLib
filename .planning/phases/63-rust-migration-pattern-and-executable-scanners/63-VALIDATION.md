---
phase: 63
slug: rust-migration-pattern-and-executable-scanners
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-07
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `63-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in `cargo test` (new workspace crates); Jest 29 + ts-jest (TS side, `Meta` project for `meta/`) |
| **Config file** | `src-tauri/Cargo.toml` (workspace); `jest.config.js` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli` ; `pnpm exec jest <touched paths>` |
| **Full suite command** | `pnpm test:ci` && `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli && cargo test --bin gamelib-shell` |
| **Estimated runtime** | ~180 seconds (full); ~15 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the touched crate's `cargo test -p <crate>` and the affected Jest files
- **After every plan wave:** full suite, clippy ratchet (`--workspace`), `pnpm smoke:sidecar`, `pnpm find-deadcode`
- **Before `/gsd-verify-work`:** full suite green, `pnpm scanner-parity-sweep` exit 0, live smoke recorded
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled by the planner/executor per task. Decision-level map:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-02 workspace | members resolve; default member still gamelib-shell; lockfile = old + 2 names | meta | `cargo metadata` parsed by Jest/Meta test; `cargoFeatures.test.ts` | pin test exists (update); metadata test ❌ W0 | ⬜ pending |
| D-02 CI | new crates tested + clippy'd in CI | workflow gate | text test asserting `-p gamelib-scan` and `clippy --workspace` in `rust-test.yml` | ❌ W0 | ⬜ pending |
| D-03 channels | every `scan_*` channel allow-listed + literal arm | unit | `pnpm exec jest src/backend/sidecar/__tests__/transportParity.test.ts` | ✅ | ⬜ pending |
| D-03 one impl | shell arms and CLI both call `gamelib_scan::dispatch`; OPS == channel set | unit | `cargo test -p gamelib-scan ops_list` + Jest static source comparison | ❌ W0 | ⬜ pending |
| D-04 | CLI spawn sites use `createFakeHomeProfile` | gate | `pnpm exec jest src/backend/__tests__/fakeHomeIsolation.test.ts` | ✅ | ⬜ pending |
| D-05/D-06 | native import table + closure incl. T-51-06 conflict | unit | `cargo test -p gamelib-scan closure` | ❌ W0 | ⬜ pending |
| D-07 | native vs objdump disagreement surfaced | local sweep | `pnpm scanner-parity-sweep` | ❌ W0 | ⬜ pending |
| D-08 | no bytes cross the pipe | static | Jest source test on wrappers | ❌ W0 | ⬜ pending |
| D-09 | every caller awaits | type + unit | `pnpm exec tsc --noEmit`, caller Jest suites | ✅ | ⬜ pending |
| D-10 | containment, appId, caps, no panic on truncation | unit | `cargo test -p gamelib-scan security` | ❌ W0 | ⬜ pending |
| D-11 | per-scanner flag, rust default, `ts` fallback, env override | unit | Jest `resolveScannerImpl` test | ❌ W0 | ⬜ pending |
| D-12 tier 1 | Rust == golden; TS == golden | unit | `cargo test -p gamelib-scan --test golden`; Jest golden parity | ❌ W0 | ⬜ pending |
| D-12 tier 2 | zero diffs on installed games | local | `pnpm scanner-parity-sweep` | ❌ W0 | ⬜ pending |
| D-13 delete | no TS parser left, flags gone | static | grep-based Jest gate | ❌ WN | ⬜ pending |
| exit contract | no leaked handles | smoke | `pnpm smoke:sidecar` | ✅ | ⬜ pending |
| dead code | no orphan exports | gate | `pnpm find-deadcode` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-scan` and `gamelib-scan-cli` scaffolds, golden test harness, `tests/fixtures/` + `expected.json`
- [ ] `meta/genScanFixtures.ts` (reuses extracted TS builders) + import-table-with-symbols builder
- [ ] `meta/scannerParitySweep.ts`, `meta/gamelibScanCli.ts`, package.json scripts
- [ ] `EXPECTED_LOCKFILE_CRATE_NAMES` update in `cargoFeatures.test.ts`
- [ ] `rust-test.yml` steps (`cargo test -p ...`, `clippy --workspace`) + text-level gate
- [ ] Jest: `resolveScannerImpl`, TS-side golden parity, wrapper fail-closed on rustInvoke rejection

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Every caller exercised on the Rust path in the live app | D-13 | needs real installed games + running Tauri shell | `pnpm tauri:dev` (restart so the sidecar rebuilds); shim generation, GameMaker runner, gameLaunch/gameBridgeLaunch DRM checks, DXMT Metal check; evidence = forwarded Rust diagnostics in the sidecar log |
| Zero TS/Rust diffs over installed games | D-12 tier 2 | game binaries are local-only, never committed | `pnpm scanner-parity-sweep` exits 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
