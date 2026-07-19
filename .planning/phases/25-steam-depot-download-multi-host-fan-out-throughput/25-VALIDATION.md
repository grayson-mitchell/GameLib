---
phase: 25
slug: steam-depot-download-multi-host-fan-out-throughput
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-19
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (ts-jest, CJS) |
| **Config file** | `jest.config.js` (existing) |
| **Quick run command** | `npm test -- --testPathPattern=steam/depot` |
| **Full suite command** | `npm test -- --testPathPattern=steam` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam/depot`
- **After every plan wave:** Run `npm test -- --testPathPattern=steam`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Populated by the planner. Each fan-out task maps to a hostHealth/pickHost unit test; the
> throughput acceptance criterion is hardware-manual (see Manual-Only Verifications).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | REQ-25-TBD | — | N/A | unit | `npm test -- --testPathPattern=steam/depot` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/depot/__tests__/hostHealth.test.ts` — pickHost workerSlot fan-out stubs (attemptIndex===0 distributes across top-N; attemptIndex>0 rotation unchanged; unhealthy circuit-breaker unchanged)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sustained multi-host fan-out + higher throughput | REQ-25-TBD (hardware measurement) | Requires a real authenticated Steam CM connection + real CDN hosts + a real multi-depot install on macOS/Apple Silicon; cannot be reproduced in jest | Install a multi-depot title on real hardware; `grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log`; confirm `hosts>1` sustained and materially higher `downSpeedMiBs` vs the before-baseline. Confirm no decode errors (`err=0`), no cancel/abort regression. |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
