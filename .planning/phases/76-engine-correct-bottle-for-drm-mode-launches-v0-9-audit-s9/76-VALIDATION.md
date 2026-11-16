---
phase: 76
slug: engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
status: validated
nyquist_compliant: true
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

One row per decision across plans 01, 03 and 04 (plans 02 and 05 are live UAT, see Manual-Only). Line numbers as of 2026-11-17.

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01/D-03 | marker already CrossOver → switch no-op, launch proceeds | unit | quick command | games.test.ts:16262 | ✅ green |
| D-01/D-05 | real switch is silent: setting-up status, no toast/dialog | unit | quick command | games.test.ts:16286 | ✅ green |
| D-01/D-06/D-08 | each `ok:false` reason (6) → one dialog per reason map, no drmLaunchSetup, `done` sent | unit `it.each` | quick command | games.test.ts:16304 | ✅ green |
| D-02 | offline + unrestorable non-CrossOver marker → refused before pre-flight and switch | unit `it.each` | quick command | games.test.ts:16383 | ✅ green |
| D-02 | offline with a CrossOver marker is not refused | unit | quick command | games.test.ts:16416 | ✅ green |
| D-04 | per-game override does not change the target; `decideLaunchEngine` not called | unit | quick command | games.test.ts:16364 | ✅ green |
| D-08 | unhealthy CrossOver (expired/missing/broken) → `crossoverRequired.drm`, switch not attempted, `done` | unit `it.each` | quick command | games.test.ts:16812 | ✅ green |
| CR-01 (76-03) | marker-less Staging bottle with CrossOver Timestamp is switched to crossover; DXVK-macOS beats Timestamp; contradicted crossover marker distrusted | unit (real switch) | `pnpm exec jest src/backend/engine/__tests__/engineSwitch.test.ts` | engineSwitch.test.ts:1124 | ✅ green |
| reconcile (76-03) | returns null and writes nothing for trusted / newer-build / unsafe name / missing dir / no conf | unit | engineSwitch command | engineSwitch.test.ts:1274 | ✅ green |
| record* (76-03) | recordCrossover/PinnedBottleEngine write trusted markers; reject unsafe name / bad pin id; newer-build marker byte-identical | unit | engineSwitch command | engineSwitch.test.ts:1312 | ✅ green |
| D-07a (76-04) | creation records the engine used (pinned or crossover) once; failed/aborted/already-ready records nothing | unit | `pnpm exec jest src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts` | bridgeBottleLifecycle.test.ts:1306 | ✅ green |
| reconcile order (76-04) | DRM launch reconciles before offline pre-check, pre-flight and switch | unit | quick command | games.test.ts:16334, :16353 | ✅ green |
| TCP unaffected (76-04) | a TCP launch never reconciles the marker | unit | quick command | games.test.ts:15942 | ✅ green |
| WR-04 (76-04) | unresolved DRM install root → bottle-stage notice, `done` sent, no reconcile | unit | quick command | games.test.ts:13364 | ✅ green |
| TCP unchanged | all `engine selection` tests green | unit | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts` | exists | ✅ green |
| DI ceilings | jestMock ceiling and boundary gates hold | meta | `pnpm exec jest meta/__tests__/backendDiCeilings.test.ts meta/__tests__/boundaryGates.test.ts` | exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DRM launch after fallback install switches bottle back to CrossOver | DEBT-01 (D-09) | Needs live macOS, CrossOver hide/restore, Mac Steam, owned SteamStub title | `76-UAT.md`: Grim Dawn (219990) — install with CrossOver hidden, restore, launch; marker reads crossover; lsteamclient game-process trace present (D-56-15/16). Passed live 2026-11-17 (items 6–8, plan 76-05). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-17

---

## Validation Audit 2026-11-17

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

The map had only plan 01's eight rows, all still pending. It now covers 76-03 and 76-04 too. Run: `engineSwitch.test.ts`, `bridgeBottleLifecycle.test.ts`, `games.test.ts`, `backendDiCeilings.test.ts`, `boundaryGates.test.ts`: 5 suites, 1032 tests, all passed.
