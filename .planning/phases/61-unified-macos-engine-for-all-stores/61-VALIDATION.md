---
phase: 61
slug: unified-macos-engine-for-all-stores
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-07
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 + ts-jest 29.3 (projects: Backend, Common, Frontend, Preload, Meta, Relay) |
| **Config file** | `jest.config.js` (+ per-project configs) |
| **Quick run command** | `pnpm exec jest src/backend/engine --silent` (plus the touched module's test files) |
| **Full suite command** | `pnpm test:ci` |
| **Gates** | `pnpm boundaries` (zero), `pnpm lint` (runner-literal ban zero), `pnpm planning-gates`, `pnpm lint-translations:gamelib`, `npx prettier --check <exact paths>` per task |
| **Estimated runtime** | ~60 seconds quick; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the targeted Jest files for the touched module, plus `npx prettier --check <exact paths>` (run `--file-info` first and omit the check if every path is ignored), plus `pnpm boundaries` when imports change
- **After every plan wave:** `pnpm test:ci` scoped to the Backend, Frontend and Common projects, plus `pnpm lint` and `pnpm boundaries`
- **Before `/gsd-verify-work`:** full `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm planning-gates` and `pnpm lint-translations:gamelib` must all be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor. The requirement-to-test map lives in `61-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | move | — | N/A | unit + gate | `pnpm exec jest src/backend/engine && pnpm boundaries` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/engine/__tests__/perGameBottle.test.ts`: D-01 name safety, determinism and cross-runner collision-freedom
- [ ] `engineConfig.test.ts`: D-05..D-08 derivation table; a read with no key never writes
- [ ] `launchEngine.test.ts`: selection, settings overlay, deadline wiring, D-13 log line, toasts
- [ ] `launchOverlayCensus.test.ts`: every launch-path settings read goes through the overlay
- [ ] `legacyBottleUntouched.test.ts`: D-02/D-04 filesystem snapshots
- [ ] Per-bottle running-games ledger test: two games in one bottle
- [ ] First-match signal for non-Steam games: a spike or a test double (research A3)

No new framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A non-Steam game with expired CrossOver falls back to the pinned engine, with toast and badge | 59 carry-forward, D-12 | Needs real CrossOver, the GUI and real Wine | `pnpm tauri:dev` with the sidecar rebuilt first; simulate expiry with the spike-060 `sandbox-exec` licence denial |
| A hang after pre-flight shows "Game didn't start" | 59 D-10/D-11 | Real process timing | Same environment; a non-Steam title that hangs at startup |
| A legacy shared-bottle game keeps launching unchanged after the update | D-02, D-05 | Real install state | Launch an existing Epic or GOG game in the `GameLib` bottle |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
