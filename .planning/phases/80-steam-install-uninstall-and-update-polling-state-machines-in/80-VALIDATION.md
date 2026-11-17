---
phase: 80
slug: steam-install-uninstall-and-update-polling-state-machines-in
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-16
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `80-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust, tokio `test-util` paused time) for the new crate(s) and shell glue; Jest (`pnpm test`) for TS handler, TS wrappers and the parity harness |
| **Config file** | `src-tauri/Cargo.toml` workspace; existing repo-root Jest config |
| **Quick run command** | `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` + `pnpm jest <touched test file>` |
| **Full suite command** | `cargo test --manifest-path src-tauri/Cargo.toml --workspace` + `pnpm test:ci` |
| **Estimated runtime** | ~180 seconds (full); ~20 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** quick run command for the touched module/test file, plus `npx prettier --check` over the exact paths written (scoped; `--file-info` first)
- **After every plan wave:** full suite command
- **Before `/gsd-verify-work`:** Full suite must be green, parity report 0 unexplained
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Behavior → test mapping (suggested requirement IDs):

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| P80-install | tick constants, grace/max/manifest-gone/no-activity, handoff upgrade, hold release | cargo unit + replay | `cargo test -p gamelib-steampoll --features testing` (install_loop 47, install_once_complete 27, install_once_progress 38, hold 36, rearm 13) | ✅ | ✅ green |
| P80-update | Phase 74 D-11 update completion rules | cargo unit + replay | `cargo test -p gamelib-steampoll --features testing --test update --test acf_update` (34 + 9) | ✅ | ✅ green |
| P80-uninstall | uninstall completion paths + bridge-uninstalled event | cargo unit | `cargo test -p gamelib-steampoll --features testing --test uninstall --test acf_copies --test acf_copies_security` (28 + 23 + 19) | ✅ | ✅ green |
| P80-running | one Playing/Done, claims, drain, registry read | cargo unit (+cfg(windows)) | `cargo test -p gamelib-steampoll --features testing --test running --test monitor` (26 + 20); Windows registry read on the CI Windows leg | ✅ | ✅ green |
| P80-events | state-event ack ordering, timeout, latest-wins queue, replay | cargo (fake host) + Jest handler | `cargo test -p gamelib-steampoll --features testing --test outbox --test contracts --test dispatch` (15 + 11 + 8) + `pnpm jest steamPollEventRegistration steamPollStateEventParity` | ✅ | ✅ green |
| P80-locale | key resolution, defaults, interpolation, 49 locales | cargo + Jest cross-check | `cargo test -p gamelib-i18n` (528 golden rows) + `pnpm jest i18nGolden` | ✅ | ✅ green |
| P80-acf | acfState/acfUpdateState/path guard | cargo security-style tests | `cargo test -p gamelib-steampoll --features testing --test acf_state --test acf_copies_security` (25 + 19) | ✅ | ✅ green |
| P80-parity | TS vs Rust output stream equal | Jest harness | `cargo test -p gamelib-steampoll-cli --test frozen_parity` (the Jest `steamPollParity` harness was retired with the TS loops in 80-29; frozen goldens now enforce parity) + `pnpm jest steamPollStateEventParity` (wire shape) | ✅ | ✅ green |
| P80-gate | TS deleted, fallback flag gone | Jest source pin | `pnpm jest steamPollsPortComplete` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `gamelib-steampoll` crate skeleton + workspace member + recording `PollHost` fake
- [x] State-event transport (channel in `RustInvokeChannel`/generated TS, sidecar handler, per-channel timeout, queue)
- [x] Locale loader reading real `public/locales` (read i18n init options first)
- [x] Scenario/timeline format + TS driver harness
- [x] Decision on `gamelib-steampoll-cli` for Jest-driven replay
- [x] Source-pin registration (`tauriShellSource.test.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live install/update/uninstall/running smokes | P80-live | Requires real Steam client + `pnpm tauri:dev` | Human-verify checkpoints in the smoke plan |
| Windows `RunningAppID` via registry | P80-running | Cannot run on macOS dev host | CI Windows leg + human UAT step |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-16

---

## Validation Audit 2026-11-16

Audited after both review-fix rounds (HEAD includes all `fix(80):` commits). Every requirement maps to an existing automated test, and each was run green on the macOS host.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Runs: `gamelib-steampoll --features testing` 415 tests across 19 targets; `gamelib-steampoll-cli` 10 (incl. `frozen_parity`); `gamelib-i18n` 6; Jest `steamPollsPortComplete`, `steamPollStateEventParity`, `steamPollEventRegistration` 46, `i18nGolden` 2. All pass.

Note: the first run of `contracts::state_event_wire_fixture_matches_every_variant` failed with the fixture "not found". The cause was a stale test binary built in a review-fix worktree that shared `src-tauri/target`; `env!("CARGO_MANIFEST_DIR")` still pointed at the deleted worktree. `cargo clean -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-steamfiles` fixed it; no code change. Manual-only items (live smokes, Windows `RunningAppID`) are unchanged.

---

## Validation Audit 2026-11-17

Re-audit at `2d3498bb9`. No commit since the previous audit (`a1fe64669`) touches `gamelib-steampoll`, `gamelib-steampoll-cli`, `gamelib-i18n` or `public/locales`; the intervening work (phases 76–78, quick tasks) is outside this phase's surface. The live smokes have since passed operator UAT (`6803d803f`, 7 passed, 0 issues).

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Runs: `gamelib-steampoll --features testing` + `gamelib-steampoll-cli` + `gamelib-i18n`: 431 tests across 27 targets, 0 failed. Jest `steamPollsPortComplete`, `steamPollStateEventParity`, `steamPollEventRegistration`, `i18nGolden`: 4 suites, 48 tests, all pass.
