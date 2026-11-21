---
phase: "84"
slug: "logger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
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

Filled at plan 84-10 from the clean-worktree proof at P = `7fc103955fefbc5f5d821504810cbaa09f15f354` (see
"## Phase proof"). Status here is the LOCAL (darwin) result; the Windows-only and three-OS legs are CI proof.

### By criterion

| Criterion | Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|----------|-----------|-------------------|-------------|--------|
| SC1 | Line format, rotation, `.old`, location, per-chunk rule and sanitiser output byte-equal to the TS golden | golden | `cargo test -p gamelib-log --test golden` (passes in the multi-crate run). The TS oracle `logGolden.test.ts` was deleted by 84-07 as planned; the fixtures stay and `forwarderGolden.test.ts` is the TS-side proof (in the full jest run) | ✅ | ✅ green |
| SC1 | New files created with unix mode 0600 | unit | `cargo test -p gamelib-log writer::mode` (2 passed: `a_new_log_file_is_created_0600`, `an_existing_file_keeps_its_mode_after_an_append`) | ✅ | ✅ green (darwin); unix legs on CI |
| SC1 | Windows rotation with `.old` held open; path segments | unit (CI Windows) | `cargo test -p gamelib-log writer::windows` (`#[cfg(all(test, windows))]`, runs 0 tests on darwin) | ✅ | ⏳ pending CI windows-latest |
| SC1 | Secondary instance never rotates | unit | `cargo test -p gamelib-log writer::second_init` (1 passed) | ✅ | ✅ green |
| SC2 | The 7 channels validate and route; invalid vectors rejected; one owner | unit + census | `cargo test --bin gamelib-shell native_` (37 passed); `pnpm check:ipc-contract` (up to date); ownership/schema/census jest suites in the full run | ✅ | ✅ green |
| SC2 | Upload / list against a localhost server; expiry prune; StoreHost round trip of an existing `uploadedLogs.json`. **delete-uploaded has no UI control** (`src/frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx`), so it is proven by 84-06's localhost round-trip test (`cargo test --bin gamelib-shell log_upload`, 24 passed), not from the UI; ROADMAP criterion 2's "from the UI" is literally met for upload and show-in-folder only | unit/integration | `cargo test --bin gamelib-shell log_upload` (the uploader moved into the shell with D-07, so the former `-p gamelib-log uploader` filter matches 0); `cargo test -p gamelib-core store` (12 passed) | ✅ | ✅ green |
| SC2 | Show-in-folder and getLogContent through a `NativeHost` fake | unit | `cargo test --bin gamelib-shell log_` (65 passed, includes shell_open 8) | ✅ | ✅ green |
| SC3 | steam-vent `tracing` and reqwest `log` events land with the mapped prefix; DEBUG only when raised | unit | `cargo test -p gamelib-log bridge` (15 passed) | ✅ | ✅ green |
| SC3 | Repeating error rate-limited, with a summary line (scripted clock) | golden | `cargo test -p gamelib-log limiter` (18 passed) and `--test limiter_golden` (1 passed) | ✅ | ✅ green |
| D-10 | TS forwarder: bounded queue, drop oldest + count, early-boot lines kept, timer unref'd | jest | `src/backend/logger/__tests__/forwarder.test.ts`, `forwarderCalibration.test.ts`, `forwarderGolden.test.ts` (in the full `pnpm test`) | ✅ | ✅ green |
| D-10 | `log` frame validation vectors shared by jest and cargo (size cap, traversal) | unit | `cargo test --bin gamelib-shell log_frame` (5 passed) + jest vectors (`src/common/__fixtures__/logFrameVectors.json`) | ✅ | ✅ green |
| SC4 | TS logger internals, `loggerFlowRegistration`, `shell_diag`, `gamelib-shell.log` and `VentLogForwarder` gone | PortComplete gate | `src/backend/__tests__/loggerPortComplete.test.ts` (in the full `pnpm test`) | ✅ | ✅ green |
| D-13 | Flush inside the exit budget; no permanent registrant | unit + source-shape | `cargo test -p gamelib-core shutdown` (13 passed); `a_started_logger_holds_no_shutdown_registrant` in gamelib-log; the `handle_exit` shape gate is the jest test `src/backend/__tests__/tauriShellSource.test.ts` (the Rust filter `handle_exit` matches 0 tests, per 84-09) | ✅ | ✅ green |
| Gates | 4 shell_diag source-text tests rewritten and still non-vacuous; logSecretGate still sees its names | jest | the four `*DiagPersistence` / `tauriShellSource` suites; `meta/__tests__/logSecretGate.test.ts` (in the full `pnpm test`) | ✅ | ✅ green |
| Exit | Forwarder adds no unbounded exit work | smoke | `pnpm smoke:sidecar` PASS; `pnpm smoke:exit-check -- --mode eof` PASS (13 ms). Live-mode `smoke:exit-check` returns INVALID with no running app ("no sidecar process found before quit"); it is a live gate owed to 84-11 | ✅ | ✅ green (eof); live owed to 84-11 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⏳ awaiting CI*

### By plan and task

Each plan's task commands are its `<automated>` blocks in `84-NN-PLAN.md`; the plan-end gate set of each plan
ran green at its recorded `plan_head_after` (see each SUMMARY). The whole of them was re-run on a clean
checkout of P in "## Phase proof". Commits are the per-task commits.

| Plan | Task | Commit | Task command (abridged) | Status |
|------|------|--------|-------------------------|--------|
| 84-01 | 1 tracer: oracle end to end, 3 cases | 747e0ce93 | `jest logGolden.test.ts` + fixture exists | ✅ (oracle deleted by 84-07; fixtures green via `cargo test -p gamelib-log --test golden`) |
| 84-01 | 2 full golden case list + NOTES | 7282a4069, 7bfaef7fc, 4de4f81a3 | `jest logGolden.test.ts` + case-count node check | ✅ (same) |
| 84-01 | 3 shared frame vectors | 01167bb93 | node count check + prettier on the vectors | ✅ |
| 84-01 | 4 live gate contract (`84-HUMAN-UAT.md`) | see 84-01-SUMMARY | `uat.cjs parseUatItemsWithStats` = 8 items | ✅ (run by 84-11) |
| 84-02 | 1 tracer: crate scaffold, core paths, general writer, CI wiring | 0fbbb9522 | `cargo test -p gamelib-log`, `--test golden`, `-p gamelib-core paths`, clippy, fmt | ✅ |
| 84-02 | 2 every target, rotation, mode, Windows rename, second init, frame | c5136c74f | `cargo test -p gamelib-log writer:: frame::` | ✅ (windows leg: CI) |
| 84-02 | 3 sanitiser in Rust | 3cf2c9fbf, 73afed020 | `cargo test -p gamelib-log sanitize`, golden | ✅ |
| 84-02 | 4 minimal StoreHost core | 13db3e06c | `cargo test -p gamelib-core store`, clippy ratchet | ✅ |
| 84-03 | 1 tracer: sidecar logInfo to gamelib.log | 4b22f2869 | `cargo test --bin gamelib-shell log_frame fn_main`, forwarderGolden jest | ✅ |
| 84-03 | 2 forwarder liveness, loss, calibration | 15a6eb201 | `jest forwarder*.test.ts`, `log_frame` | ✅ |
| 84-03 | 3 EOF flush, suites moved, exit smokes | 654a8e537 | `jest` over the observer suites, `smoke:exit-check --mode eof`, `smoke:sidecar` | ✅ |
| 84-04 | 1 tracer: game log through the facade | 4aa7f6cde | `jest targetWriter.test.ts forwarderGolden.test.ts`, codecheck | ✅ |
| 84-04 | 2 rate limiter (RED, GREEN, scope cases) | 8b8d79df0, 890cae651, 818bbce5a | `cargo test -p gamelib-log limiter`, `--test limiter_golden` | ✅ |
| 84-05 | 1 tracer: router context, renderer log path | 259922e96 | `cargo test --bin gamelib-shell native_ log_`, `check:ipc-contract` | ✅ |
| 84-05 | 2 showLogFileInFolder, getLogContent | 92ad8ec5b | `cargo test --bin gamelib-shell native_ log_ shell_open` | ✅ |
| 84-05 | 3 uploadLogFile via reqwest on the StoreHost core | 66b5346ab | `cargo test --bin gamelib-shell log_upload` | ✅ |
| 84-06 | 1 tracer: uploaded list and delete-uploaded in Rust | 12df894bc (+ 90ba1d3ab fix) | `cargo test --bin gamelib-shell log_upload native_`, `check:ipc-contract` | ✅ |
| 84-06 | 2 TS uploadedLogs slice deleted, API matrix | 9b9ed1957 | `jest storeKinds.test.ts storeLayer.test.ts` | ✅ |
| 84-07 | 1 tracer: TS logger reduced to a forwarder | 5bfda67eb | `jest loggerPortComplete.test.ts nativeSeamPortComplete.test.ts` | ✅ |
| 84-07 | 2 paths.ts deleted, containment kit | f18c19724 | `test ! -e src/backend/logger/paths.ts`, `jest loggerPortComplete.test.ts` | ✅ |
| 84-08 | 1 tracer: shell diagnostics as `[Shell]` lines | 1c07ef30a | `test 0 shell_diag`, `cargo test --bin gamelib-shell shell_log fn_main panic` | ✅ |
| 84-08 | 2 crate diagnostics bridged | f0c2ae059 | `cargo test -p gamelib-log bridge`, `-p gamelib-steamcm` | ✅ |
| 84-09 | 1 tracer: exit lines and final flush in the 5 s budget | 5d49036f0 | `cargo test -p gamelib-core shutdown`, `-p gamelib-log writer::`, `jest tauriShellSource.test.ts` | ✅ |
| 84-09 | 2 documents and comments corrected | 0cfcebb7f | grep gates + jest | ✅ |
| 84-10 | 1 tracer: clean-worktree proof at P | 60a71578c | "## Phase proof" | ✅ except the `backend-di-ceilings` red recorded below |
| 84-10 | 2 push authorisation (checkpoint) | n/a | operator decision: `hold` | ⏸ held; nothing pushed |
| 84-10 | 3 CI proof | this commit | "## CI proof" | ⏳ not pushed; three-OS proof pending a later push |

---

## Wave 0 Requirements

- [x] `src/backend/logger/__tests__/logGolden.test.ts` (the oracle: it generates the fixtures in write mode under `GAMELIB_WRITE_LOG_GOLDEN=1`, otherwise asserts TS == golden; there is no separate generator script) + `src-tauri/crates/gamelib-log/tests/fixtures/golden/{cases.json,entries.json,expected/,NOTES.md}`, committed before any TS is touched (plan 84-01; 84-07 deletes the oracle, the fixtures stay)
- [x] `84-HUMAN-UAT.md` live-gate contract, authored before coding (UAT item shape per convention 4) (plan 84-01; run by 84-11)
- [x] `gamelib-log` crate scaffold + CI wiring (`.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`) (plan 84-02)
- [x] Shared `log` frame vectors file (valid/invalid): `src/common/__fixtures__/logFrameVectors.json` (plan 84-01)
- [x] `src/backend/__tests__/loggerPortComplete.test.ts` (TS half plan 84-07, Rust half plan 84-08)
- [x] Batch/cap calibration with a synthetic emitter (replaces research assumption A2): `src/backend/logger/__tests__/forwarderCalibration.test.ts` (plan 84-03)

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

---

## Phase proof

Measured by plan 84-10, Task 1, from a clean `git worktree add --detach` checkout (removed afterwards) with its own
`pnpm install --frozen-lockfile`, `pnpm exec vite build` and `pnpm build:sidecar-sea`, and a cold cargo target dir.

- **P (candidate head):** `7fc103955fefbc5f5d821504810cbaa09f15f354` (`main`, darwin aarch64, rustc 1.99.1 for the clippy leg)
- **Precondition:** `84-01..84-09-SUMMARY.md` exist; every commit hash each lists is an ancestor of P (`git merge-base --is-ancestor`), none missing.
- **Host:** macOS (darwin). `pnpm test` is the jest authority only on the ubuntu CI leg (`test.yml`); here it ran on darwin and was green.

| Command (in the clean checkout) | Exit | Result |
|---------------------------------|------|--------|
| `pnpm install --frozen-lockfile` | 0 | reused 168, 0 added |
| `pnpm exec vite build` | 0 | renderer assembled |
| `pnpm build:sidecar-sea` | 0 | `gamelib-sidecar-aarch64-apple-darwin` |
| `cargo test -p gamelib-safety -p gamelib-testutil` | 0 | 95 passed, 0 failed |
| `cargo test -p gamelib-proc` | 0 | 29 passed, 0 failed |
| `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-i18n -p gamelib-core -p gamelib-log` (the multi-crate run line, verbatim from rust-test.yml, includes gamelib-log) | 0 | 1632 passed, 0 failed, 7 ignored (gamelib-log unit: 72 passed; golden and limiter_golden pass) |
| `cargo test --bin gamelib-shell` | 0 | 588 passed, 0 failed, 2 ignored |
| `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` then `node ../meta/clippyRatchet.cjs <file> --list` | 0 / 0 | `PASS (darwin, toolchain 1.99.1)` |
| `pnpm check:ipc-contract` | 0 | `ipc_contract.rs` and `ipcSchemaSnapshot.json` up to date |
| `pnpm test` (jest) | 0 | 1114 suites passed (6 skipped), 23507 tests passed (40 skipped), 0 failed |
| `pnpm build:sidecar` | 0 | built |
| `pnpm smoke:sidecar` | 0 | PASS: READY sentinel, exit 0 on stdin EOF |
| `pnpm smoke:exit-check` (live, default) | 2 | INVALID: "no sidecar process found before quit". Live mode reads the operator's real process table across a Cmd+Q, so it cannot pass with no app running (same as 84-03); it is a live gate owed to 84-11 |
| `pnpm smoke:exit-check -- --mode eof` | 0 | PASS, exit latency 13 ms, no survivors |

`.husky/pre-push` gate set, one by one:

| Command | Exit | Result |
|---------|------|--------|
| `pnpm codecheck` | 0 | tsc main + meta clean |
| `pnpm lint` | 0 | `production: PASS \| tests: PASS` (0 errors, 620 warnings at the ceilings). A first run crashed with ENOENT scanning `src-tauri/target/debug/deps/rmeta*`: eslint was globbing the target dir while cargo was writing it concurrently. A harness race, not a code fault; re-run after cargo finished |
| `pnpm prettier` | 0 | all matched files use Prettier code style |
| `pnpm i18n --fail-on-update` | 0 | 0 added, 0 restored, 0 unreferenced (a first invocation exited 254 because my shell passed `i18n --fail-on-update` as one word; re-run correctly) |
| `pnpm find-deadcode` | 0 | PASS (312 baselined knip findings) |
| `pnpm boundaries` | 0 | no dependency violations (1405 modules) |
| `pnpm steam-line-ceiling` | 0 | PASS (203 files, 0 allowlisted over 1000) |
| `pnpm backend-di-ceilings` | **1** | **RED at P, not caused by Phase 84:** `grew: src/backend/storeManagers/steam/__tests__/games.test.ts 46 > baseline 45 (jestMock)` and `new violation: src/backend/storeManagers/steam/bridge/__tests__/steamOfflineMode.test.ts has 1 (jestMock) and no baseline entry; remove it instead` |
| `pnpm gameinfo-narrowing-ceiling` | 0 | PASS (877 files, 46 allowlisted) |

### Red at P: `backend-di-ceilings` (out of Phase 84's scope, deferred)

Both findings come from commit `e5fc84b8c` ("fix(steam-bridge): hold a bridged launch while Mac Steam is signed out"),
the steam-bridge debug session's commit that landed between 84-05 and 84-06 (it is the `plan_head_before` of 84-06). It
added `steamOfflineMode.test.ts` (one `jest.mock`, no baseline entry) and grew `games.test.ts` by one `jest.mock`
without updating `meta/backendDiCeilings/`. No Phase 84 file is involved (`git log` for both test files shows only
steam-bridge commits). It was NOT fixed in plan 84-10: the other session has uncommitted edits to `games.test.ts` and an
untracked `otherSessionPlaying.test.ts` in the main checkout, so editing those files here would collide with that
in-flight work, and the rule for this ceiling is to remove the `jest.mock` (inject instead), never to widen the baseline.
**Consequence for the push (Task 2):** `.husky/pre-push` runs `pnpm backend-di-ceilings`, so the pre-push hook will
refuse the push of this head until the steam-bridge work removes those mocks. `--no-verify` is prohibited, so the
push cannot proceed until then.

### Blockers found at the Task 2 checkpoint

1. **`pnpm backend-di-ceilings` is red at clean P** (above), from committed steam-bridge commit `e5fc84b8c`. `.husky/pre-push`
   runs it, so the hook would refuse the push; `--no-verify` is prohibited.
2. **`main` moved past P.** After P, quick task 261121-pwt landed four commits (`ccf09a995`, `06a741eb1`, `752a2e614`,
   `790260991`) that delete `src/backend/sidecar/fileStore.ts` and rewrite the sidecar test mocks and the
   `meta/backendDiCeilings/` baselines, plus later docs commits. `git diff --name-only P HEAD` therefore lists 51 paths
   outside `.planning/` at the time of this record (48 at the checkpoint), so the push-time open-time property (nothing
   outside `.planning/` between P and the pushed head) does not hold. The Task 1 proof covers P, not the current head.

---

## CI proof

**Operator decision at Task 2 (verbatim): `hold`.**

**Not pushed.** Nothing was pushed to origin (`git status -sb` shows `main` ahead of `origin/main`, 41 commits at the
time of this record); no `gh run` exists for these commits. The push-time `git diff --name-only P HEAD` check was
therefore never the gate for a push and was not run as one.

| Workflow | Run id | Leg | Conclusion |
|----------|--------|-----|------------|
| rust-test.yml | none | windows-latest | not pushed |
| rust-test.yml | none | macos-latest | not pushed |
| rust-test.yml | none | ubuntu-latest | not pushed |
| codecheck.yml | none | n/a | not pushed |
| test.yml | none | ubuntu-latest | not pushed |

Still unproven pending a later push (these run only on the CI legs):

- gamelib-log's Windows rotation with a held `.old` and the per-OS Windows log paths (`writer::windows`, research A4)
- gamelib-log's unix 0600 mode on the CI unix legs (`writer::mode` passed locally on darwin only)
- the win32 clippy ceiling: it is measured only from a Windows CI log and is never guessed locally, so it stays at its
  current value
- jest on ubuntu (`test.yml`), the jest authority; it ran green on darwin only

Before a push is attempted: restore `pnpm backend-di-ceilings` (the steam-bridge work removes the `jest.mock` in
`games.test.ts` and `steamOfflineMode.test.ts`; baselines are never widened), re-measure the proof at the new head
(a fresh P), and re-run `git diff --name-only P HEAD` immediately before the push.
