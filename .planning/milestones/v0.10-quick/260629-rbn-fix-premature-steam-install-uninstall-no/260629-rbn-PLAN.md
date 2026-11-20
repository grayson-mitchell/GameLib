---
phase: quick-260629-rbn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/downloadmanager/utils.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/utils/uninstaller.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
autonomous: true
requirements: [GAME-02, GAME-03]

must_haves:
  truths:
    - "For a Steam install, no 'Installation Started' or 'Installation Finished' toast fires from the DM queue, and no status:done is emitted by the DM pipeline (only the ACF poller emits done)"
    - "For a Steam uninstall, no 'Game Uninstalled' toast and no status:done fires from uninstallGameCallback (only the ACF poller emits done)"
    - "The Steam badge no longer flashes installing→done→installing — the poller is the sole owner of Steam status transitions"
    - "The user still receives an accurate completion toast, fired by the poller on CONFIRMED ACF state (installed / manifest-absent)"
    - "Epic/GOG/Amazon install, update, and uninstall notifications and status transitions are byte-for-byte unchanged"
    - "removeFromQueue still splices the Steam element and emits changedDMQueueInformation — the queue still clears"
  artifacts:
    - path: "src/backend/downloadmanager/utils.ts"
      provides: "runner==='steam' guards around premature install notify + finally done"
    - path: "src/backend/downloadmanager/downloadqueue.ts"
      provides: "runner==='steam' guards in processNotification done-branch + removeFromQueue status emit"
    - path: "src/backend/utils/uninstaller.ts"
      provides: "runner==='steam' guards around success notify + final done"
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "confirmed-completion notify in pollInstallOnce (installed) + pollUninstallOnce (absent)"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts pollInstallOnce/pollUninstallOnce"
      to: "notify (../../dialog/dialog)"
      via: "fired on confirmed ACF state"
      pattern: "notify\\("
---

<objective>
Fix premature Steam install/uninstall notifications and the installing→done→installing badge flash (GAME-02/03).

Steam install/uninstall is fire-and-forget via `steam://`, but it is plugged into the DownloadManager queue (install) and `uninstallGameCallback` (uninstall) — pipelines built for stores whose `install()`/`uninstall()` promise resolves only on real completion. For Steam those promises resolve instantly, firing premature "Started/Finished/Uninstalled" toasts and `status:done` that RACE the existing ACF poller (`startInstallPolling`/`startUninstallPolling` in `steam/library.ts`), causing the badge flash.

Fix: add narrow `runner === 'steam'` guards at the premature-emission touch-points so the ACF poller becomes the SOLE owner of Steam status transitions, and move the completion toast into the poller so it fires once on CONFIRMED ACF state.

Purpose: accurate Steam install/uninstall feedback; no badge flash; no false toasts.
Output: 5 guarded shared-pipeline touch-points + 2 poller-fired confirmed toasts + regression tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/260629-rbn-RESEARCH.md
@.planning/STATE.md

<interfaces>
<!-- Verified in-repo 2026-06-29. Executor uses these directly. -->

src/backend/downloadmanager/utils.ts — installQueueElement:
  - line 65-70: sendGameStatusUpdate({ status: 'installing' })   ← KEEP (interim feedback)
  - line 72-75: notify({ body: 'Installation Started' })          ← GUARD for steam
  - line 107-113: finally { sendGameStatusUpdate({ status: 'done' }) } ← GUARD for steam
  - `runner` is already destructured from `params` (line 27)

src/backend/downloadmanager/downloadqueue.ts:
  - processNotification(element, status) line ~282: existing gog-redist early-return
    guard at lines 285-289 (the precedent to mirror). The status==='done' branch at
    320-326 calls notify(...). element.params.runner is available.
  - removeFromQueue(appName) lines 198-222: takes ONLY appName (no runner).
    elements[index].params.runner must be captured BEFORE elements.splice (line 205).
    The sendGameStatusUpdate({ status: 'done' }) is at 210-213.
    splice/delete/set (205-207) + sendFrontendMessage('changedDMQueueInformation') (220)
    MUST stay unconditional.

src/backend/utils/uninstaller.ts — uninstallGameCallback(event, appName, runner, ...):
  - line 101-105: sendGameStatusUpdate({ status: 'uninstalling' })  ← KEEP (interim)
  - line 116-119: notify error toast (catch)                        ← KEEP
  - line 132: notify({ body: i18next.t('notify.uninstalled') })     ← GUARD for steam
  - line 136-140: sendGameStatusUpdate({ status: 'done' })          ← GUARD for steam
  - `runner` is a function parameter; `notify` and `i18next` already imported.

src/backend/storeManagers/steam/library.ts:
  - pollInstallOnce line 431: 'installed' branch (442-467) has `existing` GameInfo
    (existing.title available) and sends gameStatusUpdate{done} at 457-461.
  - pollUninstallOnce line 568: 'absent' branch (572-593) has `existing` GameInfo
    and sends gameStatusUpdate{done} at 583-587.
  - `notify` is NOT yet imported here; `i18next` is NOT yet imported here.
    dialog path from this file: '../../dialog/dialog'. i18n keys to reuse:
    'notify.install.finished' ('Installation Finished'),
    'notify.uninstalled' ('Game Uninstalled').

i18n keys (already exist, reuse — do NOT invent):
  - notify.install.startInstall = 'Installation Started'
  - notify.install.finished     = 'Installation Finished'
  - notify.uninstalled          = 'Game Uninstalled'
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Guard the 4 premature INSTALL-side emissions in shared DM code</name>
  <files>src/backend/downloadmanager/utils.ts, src/backend/downloadmanager/downloadqueue.ts</files>
  <action>
Add narrow `runner === 'steam'` suppression guards at the four premature install touch-points. Mirror the existing gog-redist early-return precedent in processNotification (downloadqueue.ts:285-289) — additive `if` blocks only, so the upstream Heroic diff stays minimal.

In `src/backend/downloadmanager/utils.ts` (installQueueElement):
(a) Wrap the `notify({ body: 'Installation Started' })` call (lines 72-75) so it is SKIPPED when `runner === 'steam'`. `runner` is already destructured from params.
(b) In the `finally` block (lines 107-113), SKIP the `sendGameStatusUpdate({ status: 'done' })` when `runner === 'steam'` — the ACF poller emits the real done. Do NOT touch the `status: 'installing'` emit at 65-70 (interim feedback, KEEP).

In `src/backend/downloadmanager/downloadqueue.ts`:
(c) In `processNotification`, the `status === 'done'` branch (320-326): early-return / skip the `notify(...finished)` when `element.params.runner === 'steam'`. Keep the `logInfo('Finished'...)` if you like, or skip the whole branch body for steam — the key requirement is NO finished toast for steam. Place the guard alongside the existing gog-redist guard style.
(d) In `removeFromQueue(appName)`: capture the element's runner BEFORE the splice — e.g. `const removedRunner = index !== -1 ? elements[index]?.params.runner : undefined`. Then SKIP the `sendGameStatusUpdate({ status: 'done' })` (210-213) when `removedRunner === 'steam'`. CRITICAL: the `elements.splice` / `downloadManager.delete` / `downloadManager.set` (205-207) and the `sendFrontendMessage('changedDMQueueInformation', ...)` (220) MUST remain UNCONDITIONAL — the cancel path and the steam element removal both depend on the queue still clearing. Only the status:done emit is guarded.

Do not bypass the DM queue, do not add new packages, do not touch frontend. Steam interim `installing` status stays. Epic/GOG/Amazon/Update paths must be byte-for-byte unchanged (guards are steam-only).

A standalone unit test for the DM queue is infeasible with the current harness: there is no existing `src/backend/downloadmanager/__tests__/` directory and downloadqueue.ts has heavy module-level coupling to the electron-store `downloadManager` instance, `libraryManagerMap`, ipc, and dialog. Do NOT scaffold a brittle new DM harness for this quick fix. Rely on (1) `npm run codecheck` for type safety of the additive guards, (2) the full `npm test` backend suite to prove no non-Steam regression, and (3) the steam-side regression assertions added in Task 2. State this explicitly in the SUMMARY.
  </action>
  <verify>
    <automated>npm run codecheck && npm test</automated>
  </verify>
  <done>tsc passes; full backend test suite green (no non-Steam regression). For runner==='steam': no 'Installation Started' notify, no finally done emit, no processNotification 'finished' notify, no removeFromQueue done emit — while splice + changedDMQueueInformation still fire. Epic/GOG/Amazon/Update unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Guard premature UNINSTALL emissions + move confirmed completion toasts into the ACF poller, with regression tests</name>
  <files>src/backend/utils/uninstaller.ts, src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - pollInstallOnce('appId') on 'installed' branch: calls notify with body i18next.t('notify.install.finished') exactly once (using existing.title), in addition to the existing gameStatusUpdate{done}.
    - pollInstallOnce on 'downloading' branch: does NOT call notify (only interim installing).
    - pollUninstallOnce('appId') on 'absent' branch: calls notify with body i18next.t('notify.uninstalled') exactly once, in addition to the existing gameStatusUpdate{done}.
    - pollUninstallOnce on present/uninstalling branch: does NOT call notify.
    - uninstallGameCallback(runner:'steam'): emits gameStatusUpdate{uninstalling} but neither the success notify nor gameStatusUpdate{done}.
    - uninstallGameCallback(runner:'gog'|'legendary'|'nile'): success notify AND gameStatusUpdate{done} still fire (unchanged).
  </behavior>
  <action>
In `src/backend/utils/uninstaller.ts` (uninstallGameCallback): SKIP the success `notify({ body: i18next.t('notify.uninstalled') })` (line 132) AND the final `sendGameStatusUpdate({ status: 'done' })` (136-140) when `runner === 'steam'`. KEEP the interim `uninstalling` emit (101-105) and the catch-branch error notify (116-119). `runner` is already a function parameter.

In `src/backend/storeManagers/steam/library.ts`: import `notify` from `'../../dialog/dialog'` and `i18next` from `'i18next'` (verify exact dialog export/path against utils.ts/downloadqueue.ts usage — `notify({ title, body })`).
- In `pollInstallOnce`, the 'installed' branch (442-467): after flipping the library entry, fire `notify({ title: existing?.title, body: i18next.t('notify.install.finished', 'Installation Finished') })` so the user gets a CONFIRMED completion toast (fires once — this branch calls stopInstallPolling immediately after, so it runs at most once per install).
- In `pollUninstallOnce`, the 'absent' branch (572-593): fire `notify({ title: existing?.title, body: i18next.t('notify.uninstalled', 'Game Uninstalled') })` before/after the gameStatusUpdate{done} (it calls stopUninstallPolling, so once per uninstall).
Reuse the existing i18n keys — do NOT invent new ones. Do not change the gameStatusUpdate emits already present.

In `src/backend/storeManagers/steam/__tests__/library.test.ts`: mock `notify` from `'../../dialog/dialog'` (add a jest.mock alongside the existing `../../../ipc` mock) and extend the existing pollInstallOnce/pollUninstallOnce describe blocks to assert the behaviors above (notify fired once with the correct i18n key on the confirmed branch; NOT fired on downloading/present branches). Keep all existing poll status-transition assertions green. Seed `library.set(appId, { ...title: 'X' })` so `existing.title` is available, matching the existing test setup pattern.

If a unit test for uninstallGameCallback is infeasible (heavy main.ts/electron coupling on import), say so explicitly and cover the uninstaller guard via codecheck + manual trace + the gog-redist guard precedent; the poller toast tests are the required regression coverage.

No new npm packages. steam-* / shell calls stay main-process only. Surgical, upstream-mergeable edits.
  </action>
  <verify>
    <automated>npm run codecheck && npm test</automated>
  </verify>
  <done>tsc passes; full backend suite green. New/extended steam library tests prove: pollInstallOnce('installed') and pollUninstallOnce('absent') each fire notify once with the correct existing i18n key; neither fires on the interim branch. uninstallGameCallback(steam) emits uninstalling but neither success notify nor done; non-steam uninstall unchanged. No badge flash possible — poller solely owns Steam done + completion toast.</done>
</task>

</tasks>

<verification>
- `npm run codecheck` (tsc --noEmit) passes — additive `if (runner === 'steam')` guards type-check.
- `npm test` full backend suite passes — guarantees Epic/GOG/Amazon/Update DM + uninstall behavior is byte-for-byte unchanged (no non-Steam regression).
- Extended steam library.test.ts asserts the poller is the sole confirmed-completion toast source and the premature-emission paths are steam-suppressed.
- Manual trace confirms removeFromQueue still splices + emits changedDMQueueInformation for steam (queue clears).
</verification>

<success_criteria>
- For a Steam install: only one status:done (from the poller on confirmed ACF 'installed'), only one completion toast (poller). No 'Installation Started', no DM 'Installation Finished', no DM/removeFromQueue done. No installing→done→installing flash.
- For a Steam uninstall: only the poller's confirmed done + 'Game Uninstalled' toast (on manifest-absent). No premature uninstaller done/notify. Interim 'uninstalling' preserved.
- Epic/GOG/Amazon install, update, and uninstall flows unchanged.
- No new dependencies; backend-only changes; minimal upstream-divergent diff.
</success_criteria>

<output>
Create `.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/260629-rbn-SUMMARY.md` when done.
</output>
