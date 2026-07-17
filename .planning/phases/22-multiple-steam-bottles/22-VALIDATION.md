---
phase: 22
slug: multiple-steam-bottles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing GameLib/Heroic suite) |
| **Config file** | vitest config in repo root / package scripts |
| **Quick run command** | `pnpm test -- --run src/backend/storeManagers/steam` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~TBD seconds (planner to confirm) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _to be filled by planner per task_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] _Planner to enumerate test stubs/fixtures for the game→family assignment model and N-bottle resolution_

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-family one-time Steam login flow | D-04 | Requires real Steam auth + CrossOver bottle provisioning; cannot be automated | Create a second family, provision its bottle, log in, launch a game assigned to it |
| Concurrent-play constraint (one account, one active family) | ROADMAP constraint | Requires live Steam client behavior | Launch a game in family A while family B is running the same account; observe Steam single-session behavior |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
