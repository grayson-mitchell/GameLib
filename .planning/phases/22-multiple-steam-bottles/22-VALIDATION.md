---
phase: 22
slug: multiple-steam-bottles
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-17
updated: 2026-07-17
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **Jest 29.7.0 (`ts-jest`)** — package.json `"test": "jest"`, `"test:ci": "jest --runInBand --silent"`. (An earlier draft said "vitest/pnpm"; that was a scaffold error — this repo has NO vitest dependency. RESEARCH.md is authoritative.) |
| **Config file** | `jest.config.js` (backend suite has no jsdom — pure-function/store-mock testing only) |
| **Quick run command** | `npx jest src/backend/storeManagers/steam` (full steam backend suite) or a single file, e.g. `npx jest src/backend/storeManagers/steam/__tests__/families.test.ts` |
| **Full suite command** | `npm test` (`jest`) / CI: `npm run test:ci` |
| **Frontend note** | No jsdom/React test harness exists (project convention — `SteamInstallLocation.ts` has no test). Frontend plans (06/07/08) verify via `npx eslint <files>` + source grep gates per-task; component runtime behavior is Manual-Only (below). App-wide `npm run codecheck` (`tsc --noEmit`) is the phase-gate typecheck and only returns green after the final frontend wave. |
| **Estimated runtime** | steam backend suite < 30s; full `npm test` ~1–2 min |

---

## Sampling Rate

- **After every task commit:** the touched `__tests__/*.test.ts` via `npx jest <file>` (backend) or `npx eslint <files>` (frontend)
- **After every plan wave:** `npx jest src/backend/storeManagers/steam` (backend waves 1–5) / `npx eslint` on wave files (frontend waves 6–7)
- **Before `/gsd:verify-work`:** `npm test` full suite green AND `npm run codecheck` (tsc) green
- **Max feedback latency:** < 30s (single-file jest) / < 2 min (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-T1 | 01 | 1 | Req-1/9 | T-22-01 | Flat keys hard-removed; families/assignments contract | unit (compile) | `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ | ⬜ pending |
| 22-01-T2 | 01 | 1 | Req-6 | T-22-02 | Explicit bottleName threading; wineVersion fallback; CR-01 preserved | unit | `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ | ⬜ pending |
| 22-01-T3 | 01 | 1 | Req-6 | T-22-02 | CR-01 guard fires for explicit bottleName | unit | `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ | ⬜ pending |
| 22-02-T1 | 02 | 2 | Req-2 | T-22-03 | Idempotent migration; ACF backfill; RMW | unit | `npx jest src/backend/storeManagers/steam/__tests__/families.test.ts -t "migration"` | ❌ Wave 0 | ⬜ pending |
| 22-02-T2 | 02 | 2 | Req-1/4/5/7/9 | T-22-03/04/06 | RMW CRUD; last-family guard; resolver; provisionBottle sole create | unit | `npx jest src/backend/storeManagers/steam/__tests__/families.test.ts` | ❌ Wave 0 | ⬜ pending |
| 22-03-T1 | 03 | 3 | Req-8 | T-22-07/08 | Multi-family scan tags bottleName; bitmask discipline | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "buildBottleInstalledMap"` | ✅ (extend) | ⬜ pending |
| 22-03-T2 | 03 | 3 | Req-8 | T-22-08 | readAcfState/poller take explicit bottleName | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` | ✅ (extend) | ⬜ pending |
| 22-04-T1 | 04 | 4 | Req-7 | T-22-09/10 | All 4 methods resolver-first via shared helper | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ (extend) | ⬜ pending |
| 22-04-T2 | 04 | 4 | Req-7 | T-22-10 | needs-provision defer carries bottleName; ok threads it | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ (extend) | ⬜ pending |
| 22-05-T1 | 05 | 5 | Req-4/7 | T-22-11/13 | Old trio removed; family group registered; migration awaited | unit (suite green) + grep | `npx jest src/backend/storeManagers/steam` | ✅ (indirect) | ⬜ pending |
| 22-05-T2 | 05 | 5 | Req-4 | T-22-11/12 | ipc.ts + preload expose family group; payload bottleName | unit (suite green) + grep | `npx jest src/backend/storeManagers/steam` | ✅ (indirect) | ⬜ pending |
| 22-06-T1 | 06 | 6 | Req-6/7 | T-22-14 | Store tracks bottleName; open(appName, bottleName) | lint + grep | `npx eslint src/frontend/state/SteamBottleSetup.ts` | n/a (no jsdom) | ⬜ pending |
| 22-06-T2 | 06 | 6 | Req-6 | T-22-14/15 | Seed from prop not DEFAULT; poll familyStatusForApp | lint + grep | `npx eslint src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` | n/a (no jsdom) | ⬜ pending |
| 22-07-T1 | 07 | 7 | Req-3 | T-22-19 | Picker clone + New-family create→setup→install | lint + grep | `npx eslint src/frontend/state/SteamFamilyPicker.ts src/frontend/screens/Game/GamePage/components/SteamFamilyPicker.tsx` | n/a (no jsdom) | ⬜ pending |
| 22-07-T2 | 07 | 7 | Req-3/7 | T-22-17/18 | Both chokepoints gated via one shared eligibility helper | lint + grep | `npx eslint src/frontend/state/InstallGameModal.ts src/frontend/screens/Game/GamePage/index.tsx` | n/a (no jsdom) | ⬜ pending |
| 22-08-T1 | 08 | 7 | Req-4 | T-22-22/23 | macOS section; CrossOver-only Wine; aria-labels | lint + grep | `npx eslint src/frontend/screens/Settings/components/SteamFamilies.tsx` | n/a (no jsdom) | ⬜ pending |
| 22-08-T2 | 08 | 7 | Req-5 | T-22-20/21 | Confirm-gated delete naming games; last-family blocked | lint + grep | `npx eslint src/frontend/screens/Settings/components/SteamFamilies.tsx` | n/a (no jsdom) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/__tests__/families.test.ts` — NEW (Plan 02) covering Req 1/2/4/5/7/9: migration (idempotent, preserve wineVersion/provisioned, ACF backfill, schemaVersion), CRUD persist/re-read, last-family delete block, resolver ok/needs-provision, slug/sanitize/unique naming.
- [ ] `bottle.test.ts` extension (Plan 01) — `getSteamBottleSettings(bottleName)` per-family + fallback; dispatch threading; CR-01 for explicit bottleName.
- [ ] `library.test.ts` extension (Plan 03) — multi-family `buildBottleInstalledMap` tagging bottleName; readAcfState across families.
- [ ] `games.test.ts` extension (Plan 04) — resolver-first branching across install/launch/uninstall (+ getSettings).
- [ ] No new test framework/config needed — existing Jest + `__mocks__/electron-store.ts` in-memory mock cover this phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-family one-time Steam login / provisioning progress | Req 6, D-04 | Requires real Steam auth + CrossOver bottle provisioning; no jsdom | Create a second family, provision its bottle, log in; confirm progress reflects THAT family and Default's login is unaffected |
| Install-time family picker visibility | Req 3 | No React test harness | Install a bottle-eligible macOS game → picker appears pre-selected to Default; native-macOS + Linux/Windows Steam games show NO picker |
| New-family inline flow | Req 3, D-10 | Runtime flow | Choose "New family…" → auto-named family created → guided setup → install continues, one flow |
| Settings CRUD persistence | Req 4 | Runtime + restart | Create/rename/set-wine/delete a family; restart; changes persist |
| Guarded delete | Req 5, D-09 | Runtime dialog | Delete shows confirm naming affected games; deleting the only family is blocked with an inline message |
| Cross-family library reconciliation | Req 8 | Real installs across two bottles | Install a game in family B → shows installed; Default game still installed |
| Concurrent-play constraint (one account, one active family) | ROADMAP constraint | Live Steam client behavior | Launch a game in family A while family B runs the same account; observe Steam single-session behavior |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (backend jest / frontend eslint every task)
- [x] Wave 0 covers all MISSING references (families.test.ts new; bottle/library/games extended)
- [x] No watch-mode flags (all `--run`-equivalent single-shot jest/eslint)
- [x] Feedback latency < 30s single-file / < 2 min full suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
