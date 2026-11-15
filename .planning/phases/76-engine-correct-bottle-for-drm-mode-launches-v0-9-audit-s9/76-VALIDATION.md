---
phase: 76
slug: engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-11-15
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7 + ts-jest (multi-project config, incl. `Meta`) |
| **Config file** | root jest config (`package.json` / `jest.config.*`) |
| **Quick run command** | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "engine selection\|DRM"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick command, plus `npx prettier --check` over the exact paths written (scoped; `--file-info` first)
- **After every plan wave:** Full `games.test.ts` + `pnpm exec jest meta/__tests__/backendDiCeilings.test.ts meta/__tests__/boundaryGates.test.ts`
- **Before `/gsd-verify-work`:** `pnpm test` must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor, one row per task. Decisions to cover:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01/D-03 | marker already CrossOver → switch called with `next.kind==='crossover'`, `changed:false`, launch proceeds | unit | quick command | games.test.ts (extend) | ⬜ pending |
| D-01/D-05 | switch succeeds → `onSwitching` status sent, no dialog/toast, launch proceeds | unit | quick command | games.test.ts (extend) | ⬜ pending |
| D-01/D-06/D-08 | each `ok:false` reason → no launch, dialog per reason map, `done` sent | unit `it.each` | quick command | games.test.ts (extend) | ⬜ pending |
| D-02 | offline + restore needs absent pin → refusal before switch, `done` sent | unit | quick command | games.test.ts (extend) | ⬜ pending |
| D-04 | `decideLaunchEngine` never called in DRM path; override ignored | unit | quick command | games.test.ts (extend) | ⬜ pending |
| D-08 | unhealthy CrossOver still refuses via `notifyCrossoverRequired`; switch not attempted | unit | quick command | games.test.ts (existing it.each, extend) | ⬜ pending |
| TCP unchanged | all `engine selection` tests green | unit | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts` | exists | ⬜ pending |
| DI ceilings | `games.test.ts` jestMock count stays 47; no new module state | meta | `pnpm exec jest meta/__tests__/backendDiCeilings.test.ts meta/__tests__/boundaryGates.test.ts` | exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DRM launch after fallback install switches bottle back to CrossOver | DEBT-01 (D-09) | Needs live macOS, CrossOver hide/restore, Mac Steam, owned SteamStub title | `76-UAT.md`: Grim Dawn (219990) — install with CrossOver hidden, restore, launch; marker reads crossover; lsteamclient game-process trace present (D-56-15/16) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
