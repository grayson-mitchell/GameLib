---
phase: 59
slug: steam-engine-fallback-when-crossover-is-unavailable
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-31
audited: 2026-11-04
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
- **Before `/gsd-verify-work`:** `pnpm test:ci`, `pnpm smoke:sidecar` and `pnpm planning-gates` must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are `<plan>-<task>` (e.g. `59-02-01` = plan 59-02, Task 1); rows below map each decision to the task that creates or extends its check.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-02-01 | 59-02 | 1 | D-09 | — | Unrecognised `--demo-status` output never treated as licensed | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts` | ✅ | ✅ green |
| 59-07-01 | 59-07 | 3 | D-07, D-09 | — | N/A | unit (stub `bin/wine` under `createFakeHomeProfile()`) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts` | ✅ | ✅ green |
| 59-06-01 | 59-06 | 3 | D-01, D-02, D-03 | — | Conf written last; bottle not "ready" until complete | unit (tmp Bottles dir) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/adoptBottle.test.ts` | ✅ | ✅ green |
| 59-03-02 | 59-03 | 1 | D-05, D-08 | — | sha256 mismatch aborts and deletes the download | unit (fixture tarball, mocked `downloadFile`) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts` | ✅ | ✅ green |
| 59-04-01, 59-04-02 | 59-04 | 1 | D-10, D-11 | — | Timers unref'd; no fallback retry after deadline | unit (fake timers) | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts` | ✅ | ✅ green |
| 59-05-02 | 59-05 | 2 | D-10 | — | Kill uses the engine's own wineserver | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottle.test.ts -t wineserver` | ✅ | ✅ green |
| 59-05-01 | 59-05 | 2 | registry | — | DRM registry still wins over fallback | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ | ✅ green |
| 59-11-01 | 59-11 | 5 | D-13 | — | N/A | unit (frontend) | `npx jest --runTestsByPath src/frontend/screens/Game/GamePage/components/__tests__/SteamEngineNotices.test.tsx` | ✅ | ✅ green |
| 59-07-02 | 59-07 | 3 | D-13, D-04, D-15 | — | Notice only at <=7 days and only for a ready bottle; dismissals validated (closed kind set, build regex) | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts` | ✅ | ✅ green |
| 59-03-01, 59-11-01, 59-12-01 | 59-03, 59-11, 59-12 | 1, 5, 5 | D-06, D-14 | — | Override engine id validated in backend (paths rejected) | unit (frontend + backend validator) | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineIds.test.ts src/frontend/screens/Game/GamePage/components/__tests__/EngineBadge.test.tsx src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.test.tsx` | ✅ | ✅ green |
| 59-02-02 | 59-02 | 1 | D-15 | — | Never blocks a launch | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/testedCrossoverVersions.test.ts` | ✅ | ✅ green |
| 59-09-01 | 59-09 | 5 | D-04 | — | DRM/bottled routes still return CrossOver-required | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 59-13-01 | 59-13 | 7 | hygiene | — | No new un-unref'd sidecar handles; no boot work | smoke | `pnpm smoke:sidecar` | ✅ | ✅ green |


### Gap-closure coverage (plans 59-14 … 59-53)

The 40 gap-closure plans were added after the map above was drafted. Each ID is covered by a test that names it, except where noted.

| IDs | Plans | Covering tests | Status |
|-----|-------|----------------|--------|
| CR-01, CR-02, CR-03, WR-01…WR-05, IN-01…IN-04 | 59-14…59-29, 59-34…59-36, 59-44, 59-49…59-52 | `games.test.ts`, `bottle.test.ts`, `engineSwitch.test.ts`, `engineState.test.ts`, `gameSettingWrite.test.ts`, `gameConfigFirstWrite.test.ts`, `cancelDelete.test.ts`, `SteamEngineOverride.save.test.tsx`, `useSettingsContext.setSetting.test.ts` | ✅ green |
| WR-11 (abortable, fan-out engine download) | 59-16 | `fallbackEngine.test.ts`: abort, fan-out, shutdown, stale-temp tests; `engineTempSweepBootWire.test.ts` | ✅ green |
| H1, H2, H3 (DXSETUP exit 247; false failure lines) | 59-31, 59-32 | `sharedRedistInstall.test.ts`, `sharedRedists.test.ts`, `bridgeVerdict.test.ts`, `launcher_callRunner.test.ts` | ✅ green |
| G20 (interrupted engine unpack) | 59-33 | `fallbackEngine.test.ts`, `engineTempSweepBootWire.test.ts` | ✅ green |
| G21 (Downloads stage and percent) | 59-36, 59-37 | `heroModel.test.ts`, `engineDownloadLabel.test.ts`, `handleStopInstallation.test.ts` | ✅ green |
| G22, G25 (offline refusal and restore) | 59-38, 59-40…59-42 | `offlineRefusal.test.ts`, `connectivityNow.test.ts`, `onlineMonitor.test.ts`, `engineSwitch.test.ts` | ✅ green |
| G26 (concurrent pre-flight launches) | 59-46 | `games.test.ts` | ✅ green |
| G28 (repeated restore-failed dialogs) | 59-45 | `dialogQueue.test.ts`, `ackWhenVisible.test.ts` | ✅ green |
| G29 (transient `--demo-status` failure) | 59-50 | `demoStatus.test.ts`, `engineDecision.test.ts` | ✅ green |
| G30 | 59-51 | `games.test.ts`, `engineState.test.ts` | ✅ green |
| G27 (offline demo-status latency) | 59-47 | none: diagnosed and **accepted**, with no code change (latency is the D-09 probe bounded by D-10; see 59-47-SUMMARY.md) | n/a |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts`
- [x] `src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts`
- [x] `src/backend/storeManagers/steam/engine/__tests__/adoptBottle.test.ts`
- [x] `src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts`
- [x] `src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts`
- [x] `src/backend/storeManagers/steam/engine/__tests__/testedCrossoverVersions.test.ts`
- [x] Stub `bin/wine` fixture script (prints each status, hangs, errors), used under `createFakeHomeProfile()`
- [x] Frontend component tests for the badges, trial notice, and override select

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-04 (retroactive Nyquist audit)

---

## Validation Audit 2026-11-04

State A audit against all 53 plans. Ran 64 suites (every test file named in a phase-59 PLAN or SUMMARY, except the `realCrossover` overlay test, which needs a live install): **2,164 passed, 4 skipped, 0 failed**. `pnpm smoke:sidecar` PASS. All 15 decisions (D-01…D-15) and all gap-closure IDs except G27 map to a test that names them.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
