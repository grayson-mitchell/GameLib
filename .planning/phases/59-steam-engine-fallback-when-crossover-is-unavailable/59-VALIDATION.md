---
phase: 59
slug: steam-engine-fallback-when-crossover-is-unavailable
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-31
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `59-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` (projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest --runTestsByPath <changed test file>` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~30 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run the changed test file via `npx jest --runTestsByPath <file>`, plus `npx prettier --check <exact paths written>` (scoped; `--file-info` first)
- **After every plan wave:** Run `npx jest --selectProjects Backend` (and Frontend for UI waves) plus `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** `pnpm test:ci`, `pnpm smoke:sidecar` and `pnpm planning-gates` must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are `<plan>-<task>` (e.g. `59-02-01` = plan 59-02, Task 1); rows below map each decision to the task that creates or extends its check.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-02-01 | 59-02 | 1 | D-09 | — | Unrecognised `--demo-status` output never treated as licensed | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts` | ❌ W0 | ⬜ pending |
| 59-07-01 | 59-07 | 3 | D-07, D-09 | — | N/A | unit (stub `bin/wine` under `createFakeHomeProfile()`) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts` | ❌ W0 | ⬜ pending |
| 59-06-01 | 59-06 | 3 | D-01, D-02, D-03 | — | Conf written last; bottle not "ready" until complete | unit (tmp Bottles dir) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/adoptBottle.test.ts` | ❌ W0 | ⬜ pending |
| 59-03-02 | 59-03 | 1 | D-05, D-08 | — | sha256 mismatch aborts and deletes the download | unit (fixture tarball, mocked `downloadFile`) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts` | ❌ W0 | ⬜ pending |
| 59-04-01, 59-04-02 | 59-04 | 1 | D-10, D-11 | — | Timers unref'd; no fallback retry after deadline | unit (fake timers) | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts` | partial (monitor exists) | ⬜ pending |
| 59-05-02 | 59-05 | 2 | D-10 | — | Kill uses the engine's own wineserver | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottle.test.ts -t wineserver` | ✅ extend | ⬜ pending |
| 59-05-01 | 59-05 | 2 | registry | — | DRM registry still wins over fallback | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ extend | ⬜ pending |
| 59-11-01 | 59-11 | 5 | D-13 | — | N/A | unit (frontend) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__` | ❌ W0 | ⬜ pending |
| 59-07-02 | 59-07 | 3 | D-13, D-04, D-15 | — | Notice only at <=7 days and only for a ready bottle; dismissals validated (closed kind set, build regex) | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts` | ❌ W0 | ⬜ pending |
| 59-03-01, 59-11-01, 59-12-01 | 59-03, 59-11, 59-12 | 1, 5, 5 | D-06, D-14 | — | Override engine id validated in backend (paths rejected) | unit (frontend + backend validator) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineIds.test.ts src/frontend/screens/Game/GamePage/components/__tests__/EngineBadge.test.tsx src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.test.tsx` | ❌ W0 | ⬜ pending |
| 59-02-02 | 59-02 | 1 | D-15 | — | Never blocks a launch | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/testedCrossoverVersions.test.ts` | ❌ W0 | ⬜ pending |
| 59-09-01 | 59-09 | 5 | D-04 | — | DRM/bottled routes still return CrossOver-required | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ extend | ⬜ pending |
| 59-13-01 | 59-13 | 7 | hygiene | — | No new un-unref'd sidecar handles; no boot work | smoke | `pnpm smoke:sidecar` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts`
- [ ] `src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts`
- [ ] `src/backend/storeManagers/steam/engine/__tests__/adoptBottle.test.ts`
- [ ] `src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts`
- [ ] `src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts`
- [ ] `src/backend/storeManagers/steam/engine/__tests__/testedCrossoverVersions.test.ts`
- [ ] Stub `bin/wine` fixture script (prints each status, hangs, errors), used under `createFakeHomeProfile()`
- [ ] Frontend component tests for the badges, trial notice, and override select

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CrossOver adopts a Staging-made prefix | D-03 | Needs real CrossOver | APFS clone of spike-056 prefix under a temp `CX_BOTTLE_PATH`; never the real Bottles dir |
| DXVK on a CrossOver bottle clone, plus restore | D-07 | Needs real engines and titles | Clone a CX bottle; run on fallback with DXVK, restore, relaunch on CrossOver (Planet Crafter, Avernum 6) |
| Process-monitor match on Staging | D-11 | Needs a live game process | Launch on fallback; confirm `onFirstMatch` fires |
| Near-expiry nag, expired dialog, `cxbottle --create` under expiry | D-12 | Licence state | Spike-060 `sandbox-exec` harness (`./run.sh status\|launch\|create`), attended |
| No-CrossOver end-to-end install and launch | D-01, D-04, D-05 | Needs CrossOver hidden | `sandbox-exec` denying the app path; never touch the real install |
| Fallback-made bottle survives a different engine build (re-pin; RESEARCH Open Question 4) | D-05, D-08 | Needs a second installed Wine-Staging build and a live game | 59-UAT.md item 11 (59-13 Task 1/2): override to another Wine Manager Wine-Staging-macOS build under no-crossover.sb, then back to Automatic |
| Toast wording, badges, 7-day notice, "Game didn't start" dialog | D-06, D-10, D-13, D-14 | Visual | Live app UAT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
