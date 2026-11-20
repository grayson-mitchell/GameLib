---
phase: 77
slug: runtime-hardening-from-the-v0-9-review-debt
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-15
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (root `jest.config.js`, relay project `<rootDir>/relay`) |
| **Config file** | `relay/jest.config.js` |
| **Quick run command** | `pnpm exec jest relay/src/__tests__/handler.test.ts` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec jest relay/src/__tests__/handler.test.ts` (DEBT-02 tasks) or the requirement's command below
- **After every plan wave:** Run `pnpm test:ci`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled by the planner — one row per task. Requirement → command baseline:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| DEBT-02 | Chunked over-cap body without Content-Length → 413; under cap accepted; lying Content-Length → 413; exactly 2048 bytes accepted; stream cancelled; no fetch/row on 413 | unit | `pnpm exec jest relay/src/__tests__/handler.test.ts` | ✅ file / ❌ W0 cases | ⬜ pending |
| DEBT-03 | No spawn handle holds the sidecar loop after stdin EOF | unit | `pnpm exec jest src/backend/process/__tests__/runner.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts` | ✅ | ⬜ pending |
| DEBT-03 | Spawn-bypass grep (D-03) recorded | grep | per CONTEXT D-03 | n/a | ⬜ pending |
| DEBT-04 | Overlay input released on every close path (publisher watch: live → no self-close, dead → closes) | unit/smoke | `pnpm exec jest meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlaySignal.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts` | ✅ | ⬜ pending |

### Per-task rows (planner)

| Task | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|------|------|------|-------------|-----------|-------------------|--------|
| 77-01-T1 | 01 | 1 | DEBT-02 | unit (TDD) | `pnpm exec jest relay/src/__tests__/readCappedBody.test.ts && npx tsc -p relay/tsconfig.json --noEmit` | ⬜ pending |
| 77-01-T2 | 01 | 1 | DEBT-02 | unit (TDD) | `pnpm exec jest --selectProjects Relay && npx tsc -p relay/tsconfig.json --noEmit` | ⬜ pending |
| 77-02-T1 | 02 | 1 | DEBT-03, DEBT-04 | unit/smoke + grep | `pnpm exec jest src/backend/process/__tests__/runner.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts meta/__tests__/overlaySignal.test.ts meta/__tests__/overlayInputSmoke.test.ts` (skips recorded, not counted as passes) | ⬜ pending |
| 77-02-T2 | 02 | 1 | DEBT-03, DEBT-04 | doc + YAML parse | frontmatter YAML parse + REQUIREMENTS grep (no prettier: `.planning/` ignored) | ⬜ pending |
| 77-03-T1 | 03 | 2 | DEBT-02 | manual (human-action) | user runs `pnpm --dir relay deploy`; deployments list before/after | ⬜ pending |
| 77-03-T2 | 03 | 2 | DEBT-02 | manual (human-verify) | chunked over-cap curl + `wrangler tail` marker | ⬜ pending |
| 77-03-T3 | 03 | 2 | DEBT-02 | doc + YAML parse | audit YAML parse + REQUIREMENTS grep | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `relay/src/__tests__/handler.test.ts` — `stream` option on the `request()` helper (ReadableStream, `duplex: 'half'`, no Content-Length) and the new chunked-body cases for DEBT-02
- [ ] If a separate `readCappedBody` module is created, its own test file

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deployed Worker rejects a chunked over-cap body through the capped-read branch | DEBT-02 | Deploy is the user's step; old code also 413s, so only the tail log line distinguishes the fix | User runs `pnpm --dir relay deploy`; then `wrangler tail` while sending `curl -H 'Transfer-Encoding: chunked'` with a >2048-byte body; expect 413 and the capped-reject log line |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-15
