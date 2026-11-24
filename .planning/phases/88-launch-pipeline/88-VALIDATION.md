---
phase: "88"
slug: "launch-pipeline"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `88-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (TS oracle, shims, gates) and `cargo test` (Rust replay, units, orphan harness) |
| **Config file** | `src/backend/jest.config.js`; per-crate Cargo |
| **Quick run command** | `pnpm jest src/backend/launchOracle src/backend/__tests__/launch --silent` ; `cd src-tauri && cargo test -p gamelib-launch -p gamelib-knownfix` |
| **Full suite command** | `pnpm test:ci` ; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-launch -p gamelib-knownfix -p gamelib-info -p gamelib-engine -p gamelib-wine && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |
| **Estimated runtime** | ~600 seconds (full); ~90 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder; `npx prettier --check` over the exact written paths (check `--file-info` first; omit over prettier-ignored paths such as `.planning`).
- **After every plan wave:** the full Rust set, `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`, `pnpm check:ipc-contract`.
- **Before `/gsd-verify-work`:** full suite green on three-OS CI, then `88-HUMAN-UAT.md` on the signed build, run by a plan other than its author.
- **Vacuous-pass guard on every golden:** floor in the test file and in `MANIFEST.json`, one `expected/` folder per case, an empty case list must fail, and a pairwise-coverage assertion (every legal pair present).
- **Max feedback latency:** 120 seconds (quick set).
- **Gate model (D-30):** 88, 88.1 and 88.2 close on goldens plus three-OS CI with no signed build and no operator session; only 88.3 builds the signed Phase 88 build and runs `88-HUMAN-UAT.md` over the signed Phase 87 gap build.

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement-level map; the Sub-phase column names the sub-phase that proves the row (88, 88.1, 88.2, 88.3, or "all" for a row every sub-phase must keep green):

| Req / SC | Sub-phase | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|-----------|----------|-----------|-------------------|-------------|--------|
| SVC-03 / SC1 | 88.1 | builders match TS vectors (env, wrappers, gamescope, known-fix env, prepare ops) | Rust replay of TS vectors | `cargo test -p gamelib-launch --test golden_builders` | ❌ W0 | ⬜ pending |
| SVC-03 / SC1 | 88.1 | spawn traces: native, Wine/Proton/CrossOver, gamescope/mangohud, overlay, pre/post (argv, full env, cwd, class, order) | Rust replay of TS traces | `cargo test -p gamelib-launch --test golden_launch` | ❌ W0 | ⬜ pending |
| SVC-03 / SC1 | 88 | known-fix reader, layering, registry, overlay archive/install, fetch | replay + ported incident tests | `cargo test -p gamelib-knownfix` | ❌ W0 | ⬜ pending |
| SVC-03 / SC1 | 88.2 | runner command argv/env, redacted log line, streamed line sequence | replay | `cargo test -p gamelib-launch --test golden_runner` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.3 | funnel order, status events, single-flight join, release on failure | funnel oracle replay | `cargo test -p gamelib-launch --test funnel` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.2 | stub game: start, single flight, quit-kill, survives parent SIGKILL (three OS) | CI smoke + orphan harness | `cargo test -p gamelib-proc` ; `cargo test -p gamelib-launch --test stub_game` | partial | ⬜ pending |
| SVC-03 / SC2 | 88.2 | Windows quoting against a real exe | Windows-leg cross-check | `cargo test -p gamelib-launch --test windows_quoting` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.3 | live: launches, single flight + quit (D-27 game-running prompt), Force Quit survival + re-adopt, known fix + scripts | operator, signed build | `88-HUMAN-UAT.md` | ✅ authored by 88-01 (not yet run) | ⬜ pending |
| SVC-03 / SC3 | 88.1 | anti-cheat at launch; utils pieces (`errorHandler`, `askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher` both ways, `removeQuoteIfNecessary`, D-28 `check_wine_before_launch`/`download_default_wine`; `errorHandler` and `askForceUninstall` land with 88.2's runner, per the 82 amendment) | replay + unit | `cargo test -p gamelib-launch --test utils_pieces` | ❌ W0 | ⬜ pending |
| SVC-03 / SC4 | 88.3 | TS and registrations deleted, only scheduled shims remain | Jest gate | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | ❌ (gate new) | ⬜ pending |
| D-08/D-10 | 88.3 | re-adoption (pid + start match, reused pid no match, stale record removed, exit playtime + after-script) | Rust tests | `cargo test -p gamelib-launch --test readopt` | ❌ W0 | ⬜ pending |
| D-19 | all | channel parity and IPC snapshot | gen + Jest | `pnpm check:ipc-contract` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/launchOracle/` harness (record/compare modes, spawn tracer reuse, pairwise generator, classes file) and manifests
- [ ] `src-tauri/crates/gamelib-launch/` and `gamelib-knownfix/` skeletons, `-p` entries in `.github/workflows/rust-test.yml`
- [ ] stub game binary (model on `gamelib-proc/src/bin/standin.rs`) and Windows CommandLine-echo stub
- [ ] `gamelib-proc` additions with orphan-harness arms (Windows `start_time`, Game job, tree kill)
- [x] `88-HUMAN-UAT.md`, SC2 amendment, `82-STATE-OWNERSHIP.md` amendment (D-24, D-28) (88-01: the contract and both 82 amendments are written; the D-16 wording was already in ROADMAP 88.3 success criterion 3)
- [ ] `launchPortComplete.test.ts` (forbidden symbols, intended survivors, file-walk floor)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real game launch on macOS (CrossOver/engine, native), single flight, quit prompt, Force Quit survival and re-adoption, known fix + scripts | SVC-03 SC2, D-08, D-27 | needs the operator's Mac, signed build and real games | `88-HUMAN-UAT.md` (D-17), authored by 88-01 and run only by the 88.3 live-gate plan, never by its author |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
