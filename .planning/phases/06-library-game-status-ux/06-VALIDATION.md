---
phase: 6
slug: library-game-status-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` (existing — repo has ~150 passing tests) |
| **Quick run command** | `pnpm test -- <path>` (scoped to changed test files) |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~30–60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <changed test path>`
- **After every plan wave:** Run `pnpm test:ci`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD by planner_ | | | LIB-06 / GAME-05 | | | unit | `pnpm test -- <path>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Unit test for the Steam store-size extraction/parse helper (LIB-06 — regex → bytes conversion, incl. the `pc_requirements: []` empty case)
- [ ] Unit test for `RunningAppID` parse + reaper-cmdline fallback (GAME-05, per RESEARCH.md)
- [ ] Existing jest infra covers the rest — no framework install needed

*Note: cross-platform running-state detection (registry read on Windows, `registry.vdf`/reaper on macOS/Linux) has a manual component — see Manual-Only Verifications.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Playing" badge appears on the Steam card while a game runs and clears within ~5s of exit | GAME-05 | Requires a live Steam client + running game per-OS; `RunningAppID`/reaper signal cannot be faked reliably in CI | Launch a Steam game from GameLib; confirm the card shows Playing within ~5s and clears within ~5s of quitting |
| Real install size shows in the DM queue (not `?? MB`) for a Steam game | LIB-06 | Depends on live Steam store `appdetails` response and the DM item actually rendering for Steam | Add a Steam game to the download queue; confirm a real GB/MB size renders in the queue row |

*Automated coverage: parse/extract helpers and the runner-gated render logic are unit-tested; the live end-to-end behaviors above are manual UAT.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
