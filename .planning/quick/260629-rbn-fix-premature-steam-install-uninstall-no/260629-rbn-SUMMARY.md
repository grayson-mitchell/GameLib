---
phase: quick-260629-rbn
plan: 01
subsystem: steam-library
tags: [steam, notifications, badge, poller, download-manager, uninstaller, tdd]
dependency_graph:
  requires: []
  provides: [GAME-02, GAME-03]
  affects:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/storeManagers/steam/library.ts
tech_stack:
  added: []
  patterns:
    - runner === 'steam' guard inline in shared DM/uninstaller pipeline
    - ACF poller as sole owner of Steam status transitions and completion toasts
key_files:
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
decisions:
  - Notify calls in pollInstallOnce/pollUninstallOnce placed AFTER sendGameStatusUpdate{done} and BEFORE stopInstallPolling/stopUninstallPolling — ensures the badge flip and the toast happen atomically before the poll stops
  - Used existing?.title ?? '' fallback for notify title (TypeScript requires string not string|undefined); the fallback case never occurs in practice since polls are started for known library entries
  - Standalone unit tests for uninstallGameCallback deferred — see "Known Infeasibilities" section
metrics:
  completed: "2026-06-29T08:11:15Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase quick-260629-rbn Plan 01: Fix Premature Steam Install/Uninstall Notifications + Badge Flash

**One-liner:** Narrow `runner === 'steam'` guards at 5 shared-pipeline touch-points + confirmed completion toasts moved into the ACF pollers eliminate the installing→done→installing badge flash and duplicate/premature Steam notifications.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Guard 4 premature INSTALL-side DM emissions | f65c3a1 | utils.ts, downloadqueue.ts |
| 2 (RED) | Write failing poller-toast tests | 75ede41 | library.test.ts |
| 2 (GREEN) | Guard UNINSTALL emissions + move toasts into pollers | 89f3856 | library.ts, uninstaller.ts |

## What Was Done

### Task 1: Install-side DM guards (4 touch-points)

**`src/backend/downloadmanager/utils.ts` (installQueueElement):**
- (a) `notify({ 'Installation Started' })` — wrapped in `if (runner !== 'steam')`. The `status: 'installing'` sendGameStatusUpdate at line 65 is KEPT (interim feedback preserved).
- (b) `finally { sendGameStatusUpdate({ status: 'done' }) }` — wrapped in `if (runner !== 'steam')`. For steam, the ACF poller (`pollInstallOnce`) emits the real done when the manifest shows FullyInstalled.

**`src/backend/downloadmanager/downloadqueue.ts`:**
- (c) `processNotification` done-branch `notify({ 'Installation Finished' })` — wrapped in `if (element.params.runner !== 'steam')`. Guard placed alongside the existing gog-redist early-return (line 285) as the precedent. The `logInfo('Finished...')` is preserved unconditionally.
- (d) `removeFromQueue(appName)` — captured `removedRunner = index !== -1 ? elements[index]?.params.runner : undefined` BEFORE the splice, then wrapped `sendGameStatusUpdate({ status: 'done' })` in `if (removedRunner !== 'steam')`. CRITICAL: `elements.splice`, `downloadManager.delete`, `downloadManager.set`, and `sendFrontendMessage('changedDMQueueInformation')` remain UNCONDITIONAL so the queue always clears (cancel path and steam element removal unaffected).

### Task 2: Uninstall-side guards + confirmed toasts in pollers (TDD)

**RED gate:** Added 4 failing tests to `library.test.ts`:
- `GAME-02: fires notify with Installation Finished on the "installed" branch`
- `GAME-02: does NOT fire notify on the "downloading" branch`
- `GAME-03: fires notify with Game Uninstalled on the "absent" branch`
- `GAME-03: does NOT fire notify while the manifest is still present`

Tests used new mocks: `jest.mock('../../../dialog/dialog', () => ({ notify: jest.fn() }))` and `jest.mock('i18next', ...)` returning the fallback string.

**GREEN gate:**
- `src/backend/utils/uninstaller.ts`: `notify({ 'notify.uninstalled' })` (line 132) and `sendGameStatusUpdate({ status: 'done' })` (lines 136-140) both wrapped in `if (runner !== 'steam')`. The interim `status: 'uninstalling'` emit (line 101) and the catch-branch error notify (line 116) are KEPT for all runners.
- `src/backend/storeManagers/steam/library.ts`: Added `import { notify } from '../../dialog/dialog'` and `import i18next from 'i18next'`. In `pollInstallOnce`'s `'installed'` branch, fires `notify({ title: existing?.title ?? '', body: i18next.t('notify.install.finished', 'Installation Finished') })` after `sendGameStatusUpdate{done}` and before `stopInstallPolling`. In `pollUninstallOnce`'s `'absent'` branch, fires `notify({ title: existing?.title ?? '', body: i18next.t('notify.uninstalled', 'Game Uninstalled') })` after `sendGameStatusUpdate{done}` and before `stopUninstallPolling`.

## Verification Results

- `npm run codecheck` (tsc --noEmit): PASS — all additive guards type-check.
- `npm test` full suite: **259/259 tests pass** (255 pre-existing + 4 new GAME-02/03 assertions). 24 test suites all green.
- Epic/GOG/Amazon/Update DM and uninstall paths: unchanged — guards are steam-only `if (runner !== 'steam')` blocks.

## Known Infeasibilities: Standalone DM Queue and uninstallGameCallback Unit Tests

**DM queue (downloadqueue.ts):** There is no existing `src/backend/downloadmanager/__tests__/` directory. `downloadqueue.ts` has heavy module-level coupling to the electron-store `downloadManager` instance, `libraryManagerMap` (which requires store manager singletons), IPC, and dialog. Scaffolding a new DM test harness for this quick fix would require mocking several Electron-dependent singletons with no existing test setup to extend. The plan explicitly notes this is infeasible for a quick fix.

**uninstallGameCallback (uninstaller.ts):** The uninstaller imports `GlobalConfig`, `libraryManagerMap`, and other backend singletons that require Electron at module load time. No existing `src/backend/utils/__tests__/uninstaller.test.ts` exists. The guard follows exactly the same `if (runner !== 'steam')` pattern as the gog-redist guard precedent in `processNotification`, which is itself covered by the codecheck gate.

**Coverage strategy used:**
1. `npm run codecheck` — TypeScript type-checks the additive `if (runner !== 'steam')` guards in all 5 touch-points.
2. `npm test` full suite — 255 existing tests prove no regression in Epic/GOG/Amazon/Update paths.
3. 4 new `library.test.ts` assertions (RED→GREEN) directly verify the poller is the sole source of Steam completion toasts and does not fire on interim ticks.
4. Manual trace: `removeFromQueue` splice + `changedDMQueueInformation` remain unconditional — confirmed by reading the final diff (the guard wraps only `sendGameStatusUpdate`).

## Deviations from Plan

None — plan executed exactly as written. The `title: string | undefined` TypeScript error was resolved via `existing?.title ?? ''` (Rule 1 auto-fix: type error blocking compilation is a blocking issue).

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — test(...) commit | 75ede41 | Present and confirmed failing (2 of 4 new tests fail before implementation) |
| GREEN — feat(...) commit | 89f3856 | Present; all 259 tests pass |
| REFACTOR | n/a | No structural cleanup needed |

## Threat Flags

None — changes are backend-only, narrowly scoped to notification/status suppression guards. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

All files found: utils.ts, downloadqueue.ts, uninstaller.ts, library.ts, library.test.ts, SUMMARY.md.
All commits present: f65c3a1 (Task 1), 75ede41 (RED tests), 89f3856 (GREEN implementation).
