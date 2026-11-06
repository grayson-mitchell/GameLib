---
phase: 63
slug: rust-migration-pattern-and-executable-scanners
status: draft
nyquist_compliant: true
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
- **Before `/gsd-verify-work`:** full suite green; sweep clean at 63-11 (recorded in 63-PARITY.md, since the sweep script and the flag tests are deleted in 63-14); live smoke recorded in 63-UAT.md (63-12)
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

### Per-task map (planner, 2026-11-07)

| Plan-Task | Wave | Decisions | Automated command (abridged; full form in the plan's `<verify>`) |
|-----------|------|-----------|-----------------------------------------------------------------|
| 63-01-1 | 1 | D-02, D-10 | `cd src-tauri && cargo test -p gamelib-scan`; `cargo metadata` member check; `jest cargoFeatures.test.ts` |
| 63-01-2 | 1 | D-01 | `cargo test -p gamelib-scan-cli`; `gamelib-scan-cli --list` |
| 63-01-3 | 1 | D-02 CI | `jest meta/__tests__/rustTestWorkflow.test.ts clippyRatchet.test.ts`; `cargo clippy -p gamelib-scan -p gamelib-scan-cli -- -D warnings` |
| 63-02-1 | 1 | D-08, D-12 | `jest src/backend/scanners/__tests__/legacyTsScanners.test.ts tools/__tests__` |
| 63-02-2 | 1 | D-06 | `jest importScan.test.ts legacyTsScanners.test.ts shimGenerate.test.ts shimCoverage.test.ts` |
| 63-02-3 | 1 | D-11 | `jest scannerImpl.test.ts` |
| 63-03-1 | 2 | D-12 | `jest peSteamDrm.test.ts machoExports.test.ts`; tsc |
| 63-03-2 | 2 | D-12, D-07 | `pnpm gen-scan-fixtures` (deterministic re-run, incl. 4 multi-file closure-* cases); `jest goldenParity.test.ts fakeHomeIsolation.test.ts`; `pnpm find-deadcode` |
| 63-04-1 | 2 | D-05, D-10 | `cargo test -p gamelib-scan security` |
| 63-04-2 | 2 | D-05, D-10 | `cargo test -p gamelib-scan security_truncation_never_panics` |
| 63-05-1 | 3 | D-05, D-06, D-10 | `cargo test -p gamelib-scan closure` |
| 63-05-2 | 3 | D-05 | `cargo test -p gamelib-scan macho` |
| 63-05-3 | 3 | D-12, D-07 | `cargo test -p gamelib-scan --test golden` (path `\\`→`/` normalised for the Windows leg); `jest goldenParity.test.ts` |
| 63-06-1 | 4 | D-03 | `jest transportParity.test.ts scanChannelParity.test.ts cargoFeatures.test.ts`; `cargo test --bin gamelib-shell scan_channels_are_gamelib_scan_app_ops` |
| 63-06-2 | 4 | D-08, D-11 | `jest rustScan.test.ts peScan.test.ts`; `pnpm smoke:sidecar` |
| 63-07-1 | 5 | D-09, D-10, D-13 (Option A) | `jest drmScanExe.test.ts legacyTsScanners.test.ts` |
| 63-07-2 | 5 | D-09 | `jest shimGenerate.test.ts games.test.ts drm originalRestore.test.ts`; lint |
| 63-08-1 | 6 | D-09 | `jest games.test.ts launchDispatch.test.ts bottleLaunchSignals.test.ts`; lint |
| 63-08-2 | 6 | D-08, D-09 | `jest gameMakerRunner.test.ts steamBridgeKnownFixes.test.ts` |
| 63-09-1 | 6 | D-05, D-06 | `jest importScan.test.ts shimGenerate.test.ts stageDrmBottle.test.ts originalRestore.test.ts` |
| 63-09-2 | 6 | D-09 | `jest tools/__tests__ scanners`; `pnpm smoke:sidecar` |
| 63-10-1 | 4 | D-01, D-04, D-09 | `jest gamelibScanCli.test.ts bridgeCensus.test.ts fakeHomeIsolation.test.ts`; `pnpm scan-cli:build` |
| 63-10-2 | 4 | D-12, D-07 | `jest scannerParitySweep.test.ts`; `pnpm find-deadcode` |
| 63-11-1 | 7 | D-07, D-12 | `pnpm scanner-parity-sweep` (local); 63-PARITY.md table grep; golden suites |
| 63-11-2 | 7 | D-11, D-13 | `pnpm test:ci`; 63-UAT.md shape greps |
| 63-11-3 | 7 | D-07, D-11 | checkpoint: user review (manual) |
| 63-12-1 | 8 | D-13 | preflight greps (sidecar mtime, no instance, no GAMELIB_SCANNER_) |
| 63-12-2 | 8 | D-13 | checkpoint: live `pnpm tauri:dev` (manual) |
| 63-12-3 | 8 | D-13 | `grep -c '^result: pending'` = 0 |
| 63-13-1 | 9 | D-11, D-13 | `jest storeManagers/steam/bridge tools`; tsc; lint |
| 63-13-2 | 9 | D-11, D-13 | `jest storeManagers/steam tools rustScan.test.ts scanChannelParity.test.ts`; tsc; lint; `smoke:sidecar` |
| 63-14-1 | 10 | D-13, D-12 | `jest scannerPortComplete.test.ts`; `pnpm test:ci`; `find-deadcode`; `smoke:sidecar`; `cargo test --test golden` |
| 63-14-2 | 10 | pattern write-up | prettier check plus content greps on `src-tauri/crates/README.md` |

Sampling continuity: every task except the three checkpoints has an automated command, and no three consecutive tasks lack one.
Wave 0 (contracts and scaffolds) is covered by 63-01, 63-02 and 63-03.



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
