---
phase: 25
slug: steam-depot-download-multi-host-fan-out-throughput
status: approved
nyquist_compliant: true
wave_0_complete: true
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
| **Quick run command** | `npm test -- --testPathPattern=steam/(hostHealth\|depotPrimitives\|depot)` |
| **Full suite command** | `npm test -- --testPathPattern=steam` |
| **Estimated runtime** | ~60–120 seconds |

> Test files live in `src/backend/storeManagers/steam/__tests__/` — `hostHealth.test.ts`,
> `depotPrimitives.test.ts`, `depot.test.ts`. (NOT under `depot/__tests__/`.)

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam/(hostHealth|depotPrimitives|depot)`
- **After every plan wave:** Run `npm test -- --testPathPattern=steam`
- **Before `/gsd:verify-work`:** Full suite must be green + the manual hardware check (25-03)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | MHOST-01/03 | T-25-01 | fan-out selects only from vetted host set | unit (RED) | `! npm test -- --testPathPattern=hostHealth` | ✅ `__tests__/hostHealth.test.ts` | ⬜ pending |
| 25-01-02 | 01 | 1 | MHOST-01/03 | T-25-01 | attempt-0 top-N; retry/circuit-breaker unchanged | unit (GREEN) | `npm test -- --testPathPattern=hostHealth` | ✅ `__tests__/hostHealth.test.ts` | ⬜ pending |
| 25-02-01 | 02 | 2 | MHOST-02/03 | T-25-01/02 | workerSlot forwarded; SHA1 gate + abort intact | unit | `npm test -- --testPathPattern=depotPrimitives` | ✅ `__tests__/depotPrimitives.test.ts` | ⬜ pending |
| 25-02-02 | 02 | 2 | MHOST-02/03 | T-25-01 | both pools thread distinct slot; constants unchanged | unit + tsc | `npm test -- --testPathPattern=steam/depot && npx tsc --noEmit` | ✅ `depot.ts` / `depot.test.ts` | ⬜ pending |
| 25-02-03 | 02 | 2 | MHOST-02 | T-25-01 | concurrent workers hit >1 host at attempt 0 | integration (mocked fetch) | `npm test -- --testPathPattern=depotPrimitives` | ✅ `__tests__/depotPrimitives.test.ts` | ⬜ pending |
| 25-03-01 | 03 | 3 | MHOST-04 | T-25-01/02 | sustained hosts>1, higher throughput, err=0 | manual (hardware) | see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `hostHealth.test.ts`, `depotPrimitives.test.ts`,
and `depot.test.ts` already exist with comprehensive regression-guard coverage (15+ `HostHealthTracker`
cases, dozens of `fetchChunk`/host-rotation/cancel-abort cases). Plan 25-01 Task 1 is the RED step that
adds the worker-slot fan-out stubs (attemptIndex===0 distributes across top-N; attemptIndex>0 rotation
unchanged; omit-`workerSlot` no-regression) into the existing `hostHealth.test.ts` — no new test file or
shared fixture is required before implementation begins.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sustained multi-host fan-out + higher throughput | MHOST-04 | Requires a real authenticated Steam CM connection + real CDN hosts + a real multi-depot install on macOS/Apple Silicon; cannot be reproduced in jest | Install a multi-depot title on real hardware; `grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log \| tail -20`; confirm `hosts>1` sustained and materially higher `downSpeedMiBs` vs the ~1.5–2.9 MiB/s baseline. Confirm decode clean (`err=0`), and cancel mid-run aborts with no crash / no cancel-as-failure host record. (Plan 25-03) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (25-03-01 is the sole manual hardware gate, MHOST-04)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra; RED stub is 25-01-01)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-19
