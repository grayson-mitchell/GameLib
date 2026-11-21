---
phase: "82"
slug: "guardrails-hygiene-and-shared-safety-primitives"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
validated: 2026-11-21
---

# Phase 82 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 (ts-jest, 6 projects) + cargo test (rustc 1.99.1) |
| **Config file** | jest.config.js, src/backend/jest.config.js, meta/jest.config.js, src-tauri/Cargo.toml |
| **Quick run command** | `npx jest --runTestsByPath <files>` / `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil` |
| **Full suite command** | `pnpm test` + D-01 ratchet gates (`backend-di-ceilings`, `steam-line-ceiling`, `gameinfo-narrowing-ceiling`, `find-deadcode`, `lint`, `i18n --fail-on-update`, `planning-gates`) |
| **Estimated runtime** | ~82 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's own `npx jest --runTestsByPath` set (+ `cargo test -p gamelib-safety` when Rust changed)
- **After every plan wave:** Run `pnpm test` + the D-01 ratchet gates + `pnpm codecheck` + `pnpm check:ipc-contract`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 82 seconds

---

## Per-Task Verification Map

Status reflects Linux CI (Test run 44834013151 on 456600895, Rust test runs 44823009090 on c939280e5) where the operator's Windows box is env-red (see the Windows note below). Threat refs are T-82-NN.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 82-01-T1 | 01 | 1 | FND-01 | 01,02 | red set measured into ledger; storeKinds/createStores pins | jest + doc | jest storeKinds, createStores | ✅ | ✅ green |
| 82-01-T2 | 01 | 1 | FND-01 | 01 | tauriShellSource re-anchor, acfUpdateReplay, themeTokens | jest | jest tauriShellSource, acfUpdateReplay, themeTokens | ✅ | ✅ green |
| 82-01-T3 | 01 | 1 | FND-01 | 01 | Rust CI reds fixed without `allow` | cargo | `cargo clippy -p gamelib-steampoll`; cargo test adoption, depot fetch | ✅ | ✅ green (CI 3-OS) |
| 82-02-T1 | 02 | 1 | FND-01 | 03,04 | census floor helper; empty-input refusal | jest | jest censusFloor, ipcDomainCensus, flowRegistrationCensus | ✅ | ✅ green |
| 82-02-T2 | 02 | 1 | FND-01 | 03,04 | empty-input guards on backend/sidecar gates | jest | jest phase70PassthroughCensus, appShellImportGate, …, `*PortComplete` | ✅ | ✅ green |
| 82-02-T3 | 02 | 1 | FND-01 | 03,04 | empty-input guards on meta ceilings/census scripts | jest | jest bridgeCensus, backendDiCeilings, lintScoped, …, logSecretGate, fakeHomeIsolation | ✅ | ✅ green (logSecretGate re-greened by f2dc264bd, see audit) |
| 82-03-T1 | 03 | 1 | FND-02 | 05-10 | one verdict through the serde wire; TS mirror parity; CI step | cargo + jest | `cargo test -p gamelib-safety -p gamelib-testutil`; jest safetyWireParity, cargoFeatures, rustTestWorkflow | ✅ | ✅ green |
| 82-03-T2 | 03 | 1 | FND-02 | 05-08 | adversarial safe_path / guarded-delete table | cargo | `cargo test -p gamelib-safety --test adversarial` | ✅ | ✅ green (45, 3-OS) |
| 82-03-T3 | 03 | 1 | FND-02 | 09 | README destructive-path rules | grep | `grep -c "^## 2b" src-tauri/crates/README.md` | ✅ | ✅ doc check |
| 82-04-T1 | 04 | 2 | FND-01 | 11,12 | fileStore deletion — HALTED by D-19 (Phase 85 scope) | jest | jest storeRoot, diPhaseGates, loggerFlows, storeLayer | ✅ | ✅ green (deletion deferred by override) |
| 82-04-T2 | 04 | 2 | FND-01 | 12 | diPhaseGates D-05 floors | jest | jest diPhaseGates | ✅ | ✅ green |
| 82-05-T1 | 05 | 2 | FND-02 | 13-15 | safety channel end to end; adapter fails closed | cargo + jest | `cargo test --bin gamelib-shell safety`; jest safetyChannelParity, tauriShellSource, cargoFeatures, rustSafety | ✅ | ✅ green |
| 82-05-T2 | 05 | 2 | FND-02 | 16 | knownInstalls, protectedRoots, raw-delete detector, safety fake | jest | jest knownInstalls, protectedRoots, rawRecursiveDeletes, fakeSafetyRust, moduleStateCensus | ✅ | ✅ green |
| 82-06-T1 | 06 | 2 | FND-02 | 17,18 | refusal push → rendered notice | jest | jest refusal, RemovalRefusedNotice (state + component), NoticeStack, initStateSubscriptions | ✅ | ✅ green |
| 82-06-T2 | 06 | 2 | FND-02 | 17,19 | refusal copy i18n; theme gates | jest + gate | `pnpm i18n --fail-on-update`; jest stylesheet/theme/hardcodedStringGate | ✅ | ✅ green |
| 82-07-T1 | 07 | 3 | FND-02 | 20 | uninstall pre-flight; injected-rejection test | jest | jest uninstaller | ✅ | ✅ green |
| 82-07-T2 | 07 | 3 | FND-02 | 21,22 | GOG / sideload folders behind the guard | jest | jest gog + sideload uninstallSafety, gog library | ✅ | ✅ green |
| 82-07-T3 | 07 | 3 | FND-02 | 23,24 | resetHeroic guarded; non-Steam raw-delete gate | jest | jest shellFilesFlows, nonSteamDeleteGate, moduleStateCensus | ✅ | ✅ green |
| 82-08-T1 | 08 | 3 | FND-02 | 25-27 | shared-bottle uninstall through the guard | jest | jest bridgeRemovalSafety, steam games | ✅ | ✅ green |
| 82-08-T2 | 08 | 3 | FND-02 | 25,26 | per-game bottle removal; `refused` status in callers | jest | jest bridgeRemovalSafety, bridgeBottleLifecycle, removeCopies, … | ✅ | ✅ green |
| 82-09-T1 | 09 | 4 | FND-02 | 08 | bottle-direct delete; D-09 nested row | jest | jest steamDirectRemovalSafety, games | ✅ | ✅ green |
| 82-09-T2 | 09 | 4 | FND-02 | 08 | cross-store pre-check before remove_copy / cancel-delete | jest | jest steamDirectRemovalSafety, removeCopies, cancelDelete, staleQueueHeadCancel, downloadqueue | ✅ | ✅ green |
| 82-09-T3 | 09 | 4 | FND-02 | 08 | Steam raw recursive-delete source gate | jest | jest steamDeleteGate, nonSteamDeleteGate | ✅ | ✅ green |
| 82-10-T1 | 10 | 4 | FND-01 | — | gogdl e2e stub removed | jest | jest gogRuntime, census, ipcSchemaCoverage, diPhaseGates | ✅ | ✅ green |
| 82-11-T1 | 11 | 7 | FND-01/02 | — | clean-worktree proof; planning-gates | script | `pnpm planning-gates` | ✅ | ✅ 12/12 |
| 82-11-T2 | 11 | 7 | FND-01/02 | — | authorize push (checkpoint:decision) | decision | — | n/a | n/a |
| 82-11-T3 | 11 | 7 | FND-01/02 | — | CI proof per leg | gh | `gh run list --workflow rust-test.yml` | ✅ | ✅ 3-OS green |
| 82-12-T1 | 12 | 8 | FND-01 | — | decision brief in ledger | grep | `grep -c "^## Decision brief" 82-TEST-LEDGER.md` | ✅ | ✅ doc check |
| 82-12-T2 | 12 | 8 | FND-01 | — | retirement decision (checkpoint:decision) | decision | — | n/a | n/a |
| 82-12-T3 | 12 | 8 | FND-01 | — | decisions applied; ledger closed | grep | `grep -c "^## Verdict" 82-TEST-LEDGER.md` | ✅ | ✅ doc check |
| 82-13-T1 | 13 | 2 | FND-01 | — | dead exports removed; knip baseline lowered | gate | `pnpm find-deadcode`, `pnpm codecheck` | ✅ | ✅ green |
| 82-13-T2 | 13 | 2 | FND-01 | — | dead Steam exports removed | gate | `pnpm find-deadcode`, `pnpm steam-line-ceiling` | ✅ | ✅ green |
| 82-14-T1 | 14 | 2 | FND-01 | — | utils/bootstrap inventory | script | export/boot-step greps against 82-UTILS-BOOTSTRAP-INVENTORY.md | ✅ | ✅ doc check |
| 82-14-T2 | 14 | 2 | FND-01 | — | state-ownership table | script | registeredStores.json names greps against 82-STATE-OWNERSHIP.md | ✅ | ✅ doc check |
| 82-15-T1 | 15 | 5 | FND-01 | — | legendary e2e stub removed | jest | jest legendaryRuntime, census, ipcSchemaCoverage, diPhaseGates | ✅ | ✅ green |
| 82-15-T2 | 15 | 5 | FND-01 | — | nile stub removed; TestSync retired | jest | jest nileRuntime, census, ipcSchemaCoverage, diPhaseGates | ✅ | ✅ green |
| 82-16-T1 | 16 | 6 | FND-01 | — | remaining `CI === 'e2e'` branches removed | jest | jest appFolderStep, bootstrapWirings, pathsBootOrder, resolveAppPaths, sidecarRejectionGuard | ✅ | ✅ green |
| 82-16-T2 | 16 | 6 | FND-01 | — | floor-guarded `e2eSurfaceGone` gate | jest | jest e2eSurfaceGone | ✅ | ✅ green |
| 82-17-T1 | 17 | 1 | FND-01/02 | — | absent trust root resolves at nearest ancestor | cargo | `cargo test -p gamelib-safety --test trust_root_contract` | ✅ | ✅ green (3-OS) |
| 82-17-T2 | 17 | 1 | FND-01/02 | — | empty trustRoot is unknown (WR-04) | cargo | `cargo test -p gamelib-safety --lib` | ✅ | ✅ green |
| 82-17-T3 | 17 | 1 | FND-01/02 | — | adversarial rows: absent / unreadable / symlinked / empty root | cargo | `cargo test -p gamelib-safety --test adversarial` | ✅ | ✅ green (symlink row on macOS/Linux CI) |
| 82-18-T1 | 18 | 1 | FND-01/02 | — | detector matches rm-family calls on any receiver | jest | jest rawRecursiveDeletes, nonSteamDeleteGate, steamDeleteGate | ✅ | ✅ green |
| 82-18-T2 | 18 | 1 | FND-01/02 | — | opaque options suspect; reasons per hit | jest | same three files | ✅ | ✅ green |
| 82-18-T3 | 18 | 1 | FND-01/02 | — | `safety_remove_tree` unbounded; check keeps 60 s | jest | jest rustInvokeChannel, dialogOptionForwarding | ✅ | ✅ green (pin fixed by quick 261120-uzn) |
| 82-19-T1 | 19 | 2 | FND-02 | — | fake models trust roots, pinned to the crate | jest | jest fakeSafetyRustContract, fakeSafetyRust, gog uninstallSafety | ✅ | ✅ green |
| 82-19-T2 | 19 | 2 | FND-02 | — | cancel cleanup with no steamapps/common; fake-user sweep | jest | jest cancelDelete, uninstallSafety, bridgeRemovalSafety, removeCopies, … | ✅ | ✅ green |
| 82-19-T3 | 19 | 2 | FND-02 | — | disposition per review finding; triaged todo | gate | `pnpm planning-gates` | ✅ | ✅ 12/12 |
| 82-20-T1 | 20 | 1 | FND-01 | — | installer-timeout waits bounded by real time (G-82-2-r2); slowed-download tracer RED on old wait | jest | `npx jest --runTestsByPath src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts` (+ 5 ms-deadline mutant must fail) | ✅ | ✅ green 63/63; mutant red |
| 82-20-T2 | 20 | 1 | FND-01 | — | every installer-timeout wait asserted; 10x load soak | jest | same file, 10 runs under 2 busy loops/core | ✅ | ✅ green 10/10; full `pnpm test` suite PASS |
| 82-20-T3 | 20 | 1 | FND-01 | — | recurrence recorded in ledger (D-04) | grep | `grep -c 44850161668 82-TEST-LEDGER.md` | ✅ | ✅ doc check |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Windows note:** the 2026-11-20 audit found 13 Phase 82 test files red on the operator's Windows box for environment reasons only; all were green on Linux CI. The same day, the gap-fill pass made all 13 pass on Windows too (see the second audit below). Four win32-only skips remain, each named in its test file and active on Linux and macOS: the macOS steamclient-layer DRM `launch` block and the DRM 0700 trace-dir test in steam `games.test.ts`, fileStore WR-06 (0o600/0o700) and loggerFlows WR-02 (0700); Windows has no POSIX modes and `gameDrmLaunch` requires a `/`-rooted host path.

---

## Wave 0 Requirements

- [x] `src-tauri/crates/gamelib-safety/{src/{lib,remove,safe_path,tri,wire}.rs, tests/adversarial.rs, tests/trust_root_contract.rs}` + `src-tauri/crates/gamelib-testutil` (Rust FakeHome) — FND-02
- [x] `src/backend/safety/{rustSafety,knownInstalls,protectedRoots,refusal}.ts` + `src/backend/__tests__/{safetyChannelParity,safetyWireParity}.test.ts` (planned `guards.test.ts` became the per-module rustSafety/knownInstalls/protectedRoots/refusal tests) — FND-02
- [x] Destructive-path gate: `src/backend/safety/__tests__/{nonSteamDeleteGate,steamDeleteGate}.test.ts` over `src/backend/testUtils/rawRecursiveDeletes.ts` (planned as `destructivePathGate.test.ts`) — FND-02
- [x] `src/backend/testUtils/censusFloor.ts` + `testUtils/__tests__/censusFloor.test.ts` and empty-input cases in the census tests — FND-01
- [x] `src/frontend/components/UI/RemovalRefusedNotice/` + `__tests__/RemovalRefusedNotice.test.tsx`, state test `src/frontend/state/__tests__/RemovalRefusedNotice.test.ts` — FND-02
- [x] `82-TEST-LEDGER.md`, `82-UTILS-BOOTSTRAP-INVENTORY.md`, `82-STATE-OWNERSHIP.md` — FND-01 / criterion 5
- No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three-OS adversarial delete table, incl. the symlinked-trust-root and case-sensitivity rows | FND-02 | No local macOS/Linux machine; proof is the CI matrix (D-18) | `gh run list --workflow rust-test.yml` — gamelib-safety step green on windows/macos/ubuntu (run 44823009090 on c939280e5) |
| Live sidecar → shell → gamelib-safety round trip and the refusal notice render | FND-02 | Every TS guard test uses `fakeSafetyRustInvoke`; no test crosses the real hop, and the notice is visual | 82-UAT.md test 1 — passed 2026-11-20 on Windows (nested refusal via GOG; GOG uninstall with gog-support absent) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint:decision tasks 82-11-T2 / 82-12-T2 carry no code)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 82s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-20

---

## Validation Audit 2026-11-20

| Metric | Count |
|--------|-------|
| Gaps found | 0 MISSING; 21 tasks PARTIAL on the Windows box only |
| Resolved | 21 (all green on Linux CI, Test run 44834013151) |
| Escalated | 0 |

Discovery ran 89 test files locally (74 pass, 15 env-red on Windows), `cargo test -p gamelib-safety -p gamelib-testutil` (24 + 45 + 2 + 6, all green), and `pnpm planning-gates` (12/12). CI Test on 456600895 failed 3 suites, none of them Phase 82's: `rendererAllowList` and `testContainment` (Phase 83 work in `src/backend/sidecar/`), and `logSecretGate`, which flagged `gog/windowsElevation.ts` from quick 261120-uzn logging raw stderr. That is fixed in f2dc264bd (78/78 locally), with CI confirmation owed after the next push.

## Validation Audit 2026-11-20 (Windows gap fill)

| Metric | Count |
|--------|-------|
| Gaps found | 13 test files red on Windows only (about 100 tests) |
| Resolved | 13 (all 13 pass together on Windows: 1376 passed, 115 win32-only skips, 0 failed) |
| Escalated | 0 (depotPortComplete was a stale, gitignored `lzmaNativeResolvedPaths.generated.cjs` from before Phase 73; moved out of the tree, 54/54 pass) |

The causes were all in the tests, none in product code:
- `steamDirectRemovalSafety`: its fake matched nested paths with `startsWith(path + '/')`; it now uses `path.relative`.
- Log-rotate EPERM in `shellFilesFlows`, `loggerFlows` and `rustInvokeChannel`: an unawaited append still held the log file during rotation. The new `testUtils/settleLogFile.ts` waits for that on win32 only.
- `checkDiskSpace` on win32 runs the PowerShell probe, which the test now scripts.
- Steam `games.test.ts`: `/mock` path literals (IN-08) now go through a host-path helper.
- `bridgeBottleLifecycle` and the gog library tests compared `/` separators.
- `diPhaseGates` and `createStores` census regexes expected posix paths, so on Windows their scan floors were starved. "17 stores modules" found 1.
- `tauriShellSource`: the CRLF working copy of `relay_commands.rs` is now normalised when read.
- `dxvkInstallRemove`: unawaited `copyFile` calls held files at teardown; cleanup now uses an async `rm` with retries.

No implementation file was changed, `jestMock` stayed at 1865, and no Linux assertion was loosened. Commits: 8cd067cd3, aab0354e3, 289bd75f9, e554173d9, 11a23ae6a, 36b1b5a7d, b3a059a8f, e572574b7. Residual risk: `rustInvokeChannel` can still print an EPERM log line while passing, because the product's log writes are unawaited. That is a product-side concern and is not tracked here.
