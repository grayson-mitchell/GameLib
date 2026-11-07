---
phase: 61
slug: unified-macos-engine-for-all-stores
status: draft
nyquist_compliant: true
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

Filled in by the planner (2026-11-07); the executor updates Status. The requirement-to-test map lives in `61-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | D-18, D-01 | T-61-01..03 | ps lines filtered; real bottles only cloned | spike | `grep -c '\[shapes\]\|\[names\]' .planning/spikes/068-*/logs/events.log` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | D-18 | T-61-01 | operator real-launch evidence filtered | manual checkpoint | `grep -c '\[watch\]' .planning/spikes/068-*/logs/events.log` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 1 | D-18, D-01 | T-61-01 | home path redacted in verdict | spike verdict + checkpoint (verdict shown to user) | `python3 -I -c (verdict.json schema check)` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 1 | D-19, D-13 | T-61-04 | — | unit (moved) | `pnpm exec jest src/backend/engine` | ✅ (moved) | ⬜ pending |
| 61-02-02 | 02 | 1 | D-19 | T-61-04 | stale mocks cannot let real wine run | integration + gates | `pnpm exec jest steam/__tests__/games.test.ts ... && pnpm boundaries && pnpm lint` | ✅ | ⬜ pending |
| 61-03-01 | 03 | 2 | D-19, D-03 | T-61-06 | unsafe bottle names never spawn | unit | `pnpm exec jest src/backend/engine/__tests__/bottlePrimitives.test.ts` | ❌ W0 | ⬜ pending |
| 61-03-02 | 03 | 2 | D-19 | T-61-07 | same-count reruns | unit | `pnpm exec jest src/backend/storeManagers/steam src/backend/engine src/backend/sidecar` | ✅ | ⬜ pending |
| 61-04-01 | 04 | 3 | D-19 | — | — | unit (moved) | `pnpm exec jest src/backend/engine src/backend/appshell/__tests__/appManagement.test.ts` | ✅ (moved) | ⬜ pending |
| 61-04-02 | 04 | 3 | D-18 | T-61-08 | — | unit | `pnpm exec jest src/backend/engine/__tests__/processListing.test.ts` | ❌ W0 | ⬜ pending |
| 61-05-01 | 05 | 3 | D-12 | T-61-10 | key grammar rejects traversal | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/gameKey.test.ts launchDeadline.test.ts engineRegistry.test.ts` | ❌ W0 | ⬜ pending |
| 61-05-02 | 05 | 3 | D-16 | T-61-11, T-61-12 | ledger has no timers | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/bottleLedger.test.ts` | ❌ W0 | ⬜ pending |
| 61-06-01 | 06 | 2 | D-02, D-04..D-08, D-11, D-15 | T-61-14..16 | read never writes; containment | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/engineConfig.test.ts` | ❌ W0 | ⬜ pending |
| 61-06-02 | 06 | 2 | D-07, D-09, D-11 | T-61-13 | legacy:*/paths dropped at write | unit (TDD) | `pnpm exec jest src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts` | ❌ W0 | ⬜ pending |
| 61-07-01 | 07 | 5 | D-01, D-03 | T-61-17..19, T-61-21 | safe injective names; capped creation | unit + stub spawn (fake HOME) | `pnpm exec jest src/backend/engine/__tests__/perGameBottle.test.ts` | ❌ W0 | ⬜ pending |
| 61-07-02 | 07 | 5 | D-02, D-04, D-05 | T-61-20 | old prefix never returned as bottle | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/gamePrefix.test.ts` | ❌ W0 | ⬜ pending |
| 61-08-01 | 08 | 4 | D-08, D-12 | T-61-23, T-61-24 | override still closed-grammar parsed | unit | `pnpm exec jest src/backend/engine/__tests__/engineDecision.test.ts steamEngineDeps.test.ts` | ❌ W0 | ⬜ pending |
| 61-08-02 | 08 | 4 | D-16 | T-61-22 | no kill under another running game | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/engineSwitch.test.ts` | ✅ (extend) | ⬜ pending |
| 61-09-01 | 09 | 5 | D-12, D-15 | T-61-27 | payload type carries no paths | typecheck + unit | `pnpm codecheck && pnpm exec jest src/backend/engine/__tests__/engineState.test.ts src/backend/sidecar` | ✅ | ⬜ pending |
| 61-09-02 | 09 | 5 | D-12, D-15 | — | — | typecheck + unit | `pnpm codecheck && pnpm exec jest src/frontend/state ...` | ✅ | ⬜ pending |
| 61-10-01 | 10 | 6 | D-12, D-15 | T-61-25..28 | identity validated; no paths in payload | unit | `pnpm exec jest src/backend/engine/__tests__/engineState.test.ts` | ✅ (extend) | ⬜ pending |
| 61-10-02 | 10 | 6 | D-13 | — | engine dir has no store-manager import | gate | `pnpm boundaries` | ✅ | ⬜ pending |
| 61-11-01 | 11 | 7 | D-04, D-12, D-15 | T-61-29, T-61-32 | no file creation on state read | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/gameEngineState.test.ts` | ❌ W0 | ⬜ pending |
| 61-11-02 | 11 | 7 | D-07, D-09, D-11 | T-61-30, T-61-31 | options never contain paths/GPTK | unit (TDD) | same | ❌ W0 | ⬜ pending |
| 61-12-01 | 12 | 7 | D-04, D-06, D-08 | T-61-35 | overlay never persists | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/launchSettings.test.ts` | ❌ W0 | ⬜ pending |
| 61-12-02 | 12 | 7 | D-02, D-05, D-07, D-13, D-16 | T-61-33, T-61-34, T-61-36 | bottle-busy refusal; binaries only from pins/WM | unit (TDD) | `pnpm exec jest src/backend/engine/__tests__/launchEngine.test.ts` | ❌ W0 | ⬜ pending |
| 61-13-01 | 13 | 8 | D-12, D-09, D-17 | T-61-37..40 | args validated before lookup | unit + census | `pnpm exec jest src/backend/sidecar/__tests__/engineFlows.test.ts flowRegistrationCensus.test.ts ipcDomainCensus.test.ts` | ✅ (rename/extend) | ⬜ pending |
| 61-13-02 | 13 | 8 | D-12 | — | — | unit | `pnpm exec jest src/frontend/state src/frontend/screens/...` | ✅ | ⬜ pending |
| 61-14-01 | 14 | 8 | D-05, D-08, D-13 | T-61-41, T-61-43, T-61-44 | self-heal skipped for engine launches | unit + source census | `pnpm exec jest src/backend/__tests__/launcher.engineStep.test.ts src/backend/engine/__tests__/launcherOverlayCensus.test.ts` | ❌ W0 | ⬜ pending |
| 61-14-02 | 14 | 8 | D-02, D-04 | T-61-42 | fs snapshots unchanged | unit (fake HOME) | `pnpm exec jest src/backend/engine/__tests__/legacyBottleUntouched.test.ts` | ❌ W0 | ⬜ pending |
| 61-14-03 | 14 | 8 | D-02, D-04, D-07, D-13 | T-61-63 | tools target the real bottle; reads never create; no engine flip | unit + source census | `pnpm exec jest src/backend/engine/__tests__/toolSettings.test.ts src/backend/engine/__tests__/launcherOverlayCensus.test.ts src/backend/tools` | ❌ W0 | ⬜ pending |
| 61-15-01 | 15 | 8 | D-13 | T-61-45 | every launch read overlaid | source census | `pnpm exec jest src/backend/engine/__tests__/managerOverlayCensus.test.ts` | ❌ W0 | ⬜ pending |
| 61-15-02 | 15 | 8 | D-01, D-03, D-08 | T-61-46, T-61-47 | setup self-heal skipped | unit | `pnpm exec jest src/backend/storeManagers/gog/__tests__/setup.engine.test.ts` | ❌ W0 | ⬜ pending |
| 61-16-01 | 16 | 9 | D-18 | T-61-48, T-61-50, T-61-51 | watcher bounded + unref'd | unit (fake timers) | `pnpm exec jest src/backend/engine/__tests__/gameProcessWatch.test.ts` | ❌ W0 | ⬜ pending |
| 61-16-02 | 16 | 9 | D-18 (59 D-10/D-11) | T-61-48, T-61-49 | deadline armed only on proven signal | unit + smoke | `pnpm exec jest src/backend/engine/__tests__/launchEngine.deadline.test.ts && pnpm smoke:sidecar` | ❌ W0 | ⬜ pending |
| 61-17-01 | 17 | 9 | D-12 | T-61-52 | push payload shape-guarded | unit (TDD) | `pnpm exec jest src/frontend/state/__tests__/EngineState.test.ts` | ✅ (rename/extend) | ⬜ pending |
| 61-17-02 | 17 | 9 | D-12, D-14, D-15 | T-61-53, T-61-54 | CrossOver URL constant | RTL | `pnpm exec jest src/frontend/screens/Game/GamePage` | ✅ (rename/extend) | ⬜ pending |
| 61-18-01 | 18 | 10 | D-04, D-09, D-11, D-14, D-15, D-20 | T-61-55..57 | only listed ids writable; confirm before fresh bottle | unit + RTL | `pnpm exec jest src/frontend/screens/Settings/components` | ✅ (rename/extend) | ⬜ pending |
| 61-18-02 | 18 | 10 | D-09, D-10 | — | — | RTL | `pnpm exec jest src/frontend/screens/Settings/sections/GamesSettings` | ✅ (rename/extend) | ⬜ pending |
| 61-19-01 | 19 | 11 | D-17, D-09, D-20 | T-61-58, T-61-59 | server-side bottle name | unit | `pnpm exec jest .../WineSelector src/backend/sidecar/__tests__/importGameEngine.test.ts` | ❌ W0 | ⬜ pending |
| 61-19-02 | 19 | 11 | D-17, D-01, D-10 | — | — | RTL | `pnpm exec jest src/frontend/screens/Library/components/InstallModal` | ❌ W0 | ⬜ pending |
| 61-20-01 | 20 | 12 | all | T-61-61, T-61-62 | — | full gates | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm boundaries && pnpm planning-gates && pnpm lint-translations:gamelib && pnpm smoke:sidecar` | ✅ | ⬜ pending |
| 61-20-02 | 20 | 12 | D-01..D-20 | T-61-61, T-61-62 | licence untouched | manual UAT | operator runs 61-UAT.md | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/engine/__tests__/perGameBottle.test.ts`: D-01 name safety, determinism and cross-runner collision-freedom (61-07)
- [ ] `engineConfig.test.ts`: D-05..D-08 derivation table; a read with no key never writes (61-06)
- [ ] `launchEngine.test.ts` + `launchSettings.test.ts`: selection, overlay, D-13 log line, toasts (61-12); deadline wiring in `launchEngine.deadline.test.ts` (61-16)
- [ ] `launcherOverlayCensus.test.ts` (61-14) and `managerOverlayCensus.test.ts` (61-15): every launch-path settings read goes through the overlay; the launcher census also covers the `tools/index.ts` Winetricks/Run-EXE reads through `resolveToolSettings`
- [ ] `toolSettings.test.ts`: Wine tools resolve the game's real bottle/engine without creating a bottle on read (61-14)
- [ ] `legacyBottleUntouched.test.ts`: D-02/D-04 filesystem snapshots (61-14)
- [ ] `bottleLedger.test.ts` (61-05) and the engineSwitch two-games-one-bottle cases (61-08)
- [ ] First-match signal for non-Steam games: spike 068 (61-01) then `gameProcessWatch.test.ts` (61-16)

Each Wave 0 file is created by the task that needs it (tests written first in `tdd="true"` tasks), so no separate scaffolding plan is needed.

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 120s (games.test.ts runs are the slow outlier; measure at execution)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
