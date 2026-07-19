# Quick Task 260629-rbn: Fix premature Steam install/uninstall notifications + badge flash — Research

**Researched:** 2026-06-29
**Domain:** GameLib (Heroic fork) — Electron main-process DownloadManager + Steam store manager wiring
**Confidence:** HIGH (direct code trace; all line refs verified in-repo)
**Mode:** quick-task / targeted code investigation

## Summary

Steam install and uninstall are **fire-and-forget** (`shell.openExternal('steam://install|uninstall/{appId}')` returns the instant the URL is handed to Steam). But GameLib plugs both operations into Heroic's existing pipelines — the DownloadManager queue (install) and `uninstallGameCallback` (uninstall) — which were written for runners (Epic/GOG/Amazon) whose `install()`/`uninstall()` promise resolves **only when the operation truly completes**. Those pipelines therefore fire "Installation Started/Finished" + "Game Uninstalled" notifications and flip `status:done` synchronously, milliseconds after the URL opens.

Phase 3 already added the correct mechanism to track *real* state: `startInstallPolling` / `startUninstallPolling` in `steam/library.ts` poll `appmanifest_{appId}.acf` `StateFlags` (via the already-present `@node-steam/vdf`) and emit accurate `installing` → `done` (and `uninstalling` → `done`) `gameStatusUpdate`s. The bug is that this poller **races against** the synchronous DM/uninstaller `done`. Net visible sequence: `queued → installing → done (DM, premature) → installing (poller sees ACF downloading) → … → done (poller, real)` = the badge flash + two false toasts.

**Primary recommendation:** Make the ACF poller the **sole owner** of Steam install/uninstall status + completion notifications. Add narrow `runner === 'steam'` guards that suppress the four premature emissions (2 status:done, 2 notifications) in the shared pipeline. This leaves Epic/GOG/Amazon behavior byte-for-byte unchanged, adds no new polling (poller already capped), stays entirely main-process, and is minimally divergent from upstream Heroic.

## Root-Cause Trace (verified)

Steam install is routed through the **normal DM queue** — there is no Steam bypass. Frontend `install()` (`src/frontend/helpers/library.ts:88`) → `window.api.install` → IPC `install` handler (`downloadmanager/ipc_handler.ts:13-22`) → `addToQueue` → `initQueue` → `installQueueElement`.

### Install — 4 premature emissions

| # | What fires | File:line | Why premature |
|---|-----------|-----------|---------------|
| 1 | `notify("Installation Started")` | `downloadmanager/utils.ts:72-75` | Fires before Steam does anything |
| — | `SteamGame.install()` opens URL, calls `startInstallPolling`, **returns `{status:'done'}` immediately** | `steam/games.ts:201-221` | Resolves instantly — DM reads this as "complete" |
| 2 | `finally → sendGameStatusUpdate({status:'done'})` | `downloadmanager/utils.ts:107-113` | Flash to done #1 |
| 3 | `processNotification(element,'done') → notify("Installation Finished")` | `downloadmanager/downloadqueue.ts:102, 320-326` | False completion toast |
| 4 | `removeFromQueue → sendGameStatusUpdate({status:'done'})` | `downloadmanager/downloadqueue.ts:106, 210-213` | Flash to done #2 |

Then the poller (`steam/library.ts:431-528`) ticks every 3 s: sends `installing` while ACF `StateFlags` shows downloading, and the real `done` + `pushGameToLibrary` when bit 4 (FullyInstalled) is set (`pollInstallOnce` lines 435-467). That late `installing` is the visible bounce-back after the premature `done`.

### Uninstall — 2 premature emissions

IPC `uninstall` (`main.ts:964`) → `uninstallGameCallback` (`utils/uninstaller.ts:94-141`):

| # | What fires | File:line | Why premature |
|---|-----------|-----------|---------------|
| — | `sendGameStatusUpdate({status:'uninstalling'})` | `uninstaller.ts:101-105` | OK to keep — correct interim feedback; poller re-affirms |
| — | `await game.uninstall()` opens URL, calls `startUninstallPolling`, returns immediately | `steam/games.ts:309-327` | Resolves instantly |
| 1 | `notify("notify.uninstalled")` ("Game Uninstalled") | `uninstaller.ts:132` | Fires before Steam removes anything |
| 2 | `sendGameStatusUpdate({status:'done'})` | `uninstaller.ts:136-140` | Premature done |

Poller (`pollUninstallOnce`, `library.ts:568-607`) sends the real `uninstalling` (StateFlags bit 0x800) and the real `done` + `pushGameToLibrary{is_installed:false}` only when the manifest is **absent** (lines 572-593).

### Why Epic/GOG/Amazon are correct (do NOT touch them)
For `legendary`/`gog`/`nile`, `install()`/`uninstall()` `await` a child process (legendary/gogdl/nile) that streams progress and resolves on genuine completion. So utils.ts:108 `finally{done}`, processNotification "Finished", and uninstaller.ts:132/136 all fire at the *right* time. Their behavior must stay identical — hence runner-scoped guards, not pipeline rewrites.

## Recommended Fix (lowest risk) — runner-guarded suppression

Let the ACF poller own Steam status + completion toasts; suppress the 4 premature emissions for `runner === 'steam'` only. Mirrors the existing `gog-redist` early-return guard already in `processNotification` (`downloadqueue.ts:285-289`), so the pattern is precedented in this codebase.

| File / function | Change |
|---|---|
| `src/backend/downloadmanager/utils.ts` → `installQueueElement` | (a) Skip `notify("Installation Started")` (72-75) when `runner === 'steam'`. (b) In the `finally` (107-113), skip `sendGameStatusUpdate({status:'done'})` when `runner === 'steam'` — poller emits the real done. |
| `src/backend/downloadmanager/downloadqueue.ts` → `processNotification` | In the `status === 'done'` branch (320-326), early-return / skip `notify` when `element.params.runner === 'steam'` (mirror the gog-redist guard above it). |
| `src/backend/downloadmanager/downloadqueue.ts` → `removeFromQueue` | Capture removed element's runner before splice (`elements[index]?.params.runner`); skip `sendGameStatusUpdate({status:'done'})` (210-213) when it's `'steam'`. **Keep the splice + `changedDMQueueInformation`** so the queue still clears. |
| `src/backend/utils/uninstaller.ts` → `uninstallGameCallback` | Skip the success `notify("notify.uninstalled")` (132) and the final `sendGameStatusUpdate({status:'done'})` (136-140) when `runner === 'steam'`. Keep the interim `uninstalling` (101-105). |
| (Optional UX) `src/backend/storeManagers/steam/library.ts` → `pollInstallOnce` (installed branch ~442-467) and `pollUninstallOnce` (absent branch ~572-593) | Add `notify("Installation Finished")` / `notify("notify.uninstalled")` here so the user still gets a toast — now fired on **confirmed** ACF completion instead of on click. Reuses existing i18n keys. |

Decision needed (flag for planner): whether to add the optional completion toasts in the poller (recommended for parity — otherwise Steam installs complete silently). `[ASSUMED]` that a completion toast is desirable; confirm with user.

### Alternative considered (not recommended as primary)
Bypass the DM queue entirely for Steam in `ipc_handler.ts` (branch `runner==='steam'` → call `SteamGame.install()` directly, skip `addToQueue`). Pro: removes all DM coupling in one place and incidentally fixes the cosmetic `'?? MB'` queue entry. Con: larger behavioral change (Steam no longer appears in the DM panel), touches frontend assumptions about queue membership / spinner, and diverges the shared IPC handler from upstream Heroic. Higher risk; keep as a v0.2 option, not this fix.

## Don't Hand-Roll / Reuse What Exists

| Need | Use existing | Location |
|------|-------------|----------|
| Real install/uninstall completion detection | `startInstallPolling`/`startUninstallPolling` + `readAcfState` (ACF `StateFlags`) — already built, already capped | `steam/library.ts:431-672` |
| ACF parsing | `@node-steam/vdf` (already in project) | `steam/library.ts` (readAcfState) |
| Runner-scoped notification skip | `gog-redist` early-return precedent | `downloadqueue.ts:285-289` |
| Status push to frontend | `sendGameStatusUpdate` / `sendFrontendMessage('gameStatusUpdate')` | `backend/utils.ts:1380` |

Do **not** add new completion-tracking logic, new timers, or new npm packages — the poller already exists and is bounded by `GRACE_TICKS` (≈60 s, no-manifest cancel detection) and `MAX_TICKS` (≈6 h safety cap) at `library.ts:370-371`, with the D-01 focus re-read as backstop.

## Pitfalls

1. **`removeFromQueue` is generic** — also called from `cancelCurrentDownload` and the `removeFromDMQueue` listener. Only wrap the `sendGameStatusUpdate({done})`; never skip the splice/persist/`changedDMQueueInformation`, or the Steam element will stick in the DM panel forever.
2. **Don't suppress the interim `installing`/`uninstalling`** — those give instant user feedback and the poller re-affirms them; only the premature `done` causes the flash.
3. **No infinite polling** — already prevented (GRACE_TICKS / MAX_TICKS). Don't add a new loop.
4. **Main-process only** — all five touch-points are backend files; the CLAUDE.md "steam-* / shell calls main-process only" constraint is preserved. No frontend logic change required (frontend already maps `gameStatusUpdate` → badge; see `hooks/constants.ts:29-31` "Steam installing").
5. **Cancel path** — if the user cancels Steam's install/uninstall dialog, the poller's grace window stops cleanly and the badge stays in its prior state. Suppressing the DM done means GameLib correctly shows *no* false completion in that case (current code wrongly shows done). Verify the GameCard spinner (`GameCard/index.tsx:240` "Steam installs cannot be cancelled — show spinner only") still clears via the poller's terminal `done`.
6. **Mergeability** — guards are additive `if (runner === 'steam')` blocks; upstream Heroic diff stays small.

## Files + Functions the Fix Touches

1. `src/backend/downloadmanager/utils.ts` — `installQueueElement` (lines 72-75 notify; 107-113 finally done)
2. `src/backend/downloadmanager/downloadqueue.ts` — `processNotification` (320-326), `removeFromQueue` (210-213)
3. `src/backend/utils/uninstaller.ts` — `uninstallGameCallback` (132 notify; 136-140 done)
4. (Optional) `src/backend/storeManagers/steam/library.ts` — `pollInstallOnce` (~442-467), `pollUninstallOnce` (~572-593) for confirmed-completion toasts
5. No frontend change required; no new dependencies.

## Validation Notes (Nyquist)

Existing Steam tests live in `src/backend/storeManagers/steam/__tests__/`. Add/extend unit tests asserting:
- `installQueueElement` with `runner:'steam'` does **not** call `notify` "Started" nor emit `gameStatusUpdate{done}` in `finally`.
- `processNotification({runner:'steam', status:'done'})` emits no notification.
- `removeFromQueue` for a steam element splices the queue but emits no `gameStatusUpdate{done}` (and still emits `changedDMQueueInformation`).
- `uninstallGameCallback(runner:'steam')` emits `uninstalling` but neither the success `notify` nor `gameStatusUpdate{done}`.
- (If optional toasts added) `pollInstallOnce`/`pollUninstallOnce` emit the completion `notify` on the installed/absent ACF branch.
Existing `pollInstallOnce`/`pollUninstallOnce` tests already cover the real status transitions — keep them green.

## Assumptions Log

| # | Claim | Risk if Wrong |
|---|-------|---------------|
| A1 | A confirmed-completion toast ("Installation Finished"/"Game Uninstalled") is still desired, just fired from the poller instead of on click | Low — if user wants Steam fully silent, drop the optional poller-notify change; core flash/false-toast fix is independent |
| A2 | Steam install is *only* ever entered via the DM queue `install` handler (no other enqueue path) | Low — grep confirms single `install()`→`window.api.install`→`addToQueue` path; verified `ipc_handler.ts:13-22` |

## Sources

### Primary (HIGH — direct in-repo trace, 2026-06-29)
- `src/backend/storeManagers/steam/games.ts` — `install` (201-221), `uninstall` (309-327)
- `src/backend/storeManagers/steam/library.ts` — poller lifecycle (431-672), ACF read + constants (370-371)
- `src/backend/downloadmanager/utils.ts` — `installQueueElement` (18-114)
- `src/backend/downloadmanager/downloadqueue.ts` — `initQueue` (82-116), `removeFromQueue` (198-222), `processNotification` (282-333)
- `src/backend/utils/uninstaller.ts` — `uninstallGameCallback` (94-141)
- `src/backend/downloadmanager/ipc_handler.ts` — install routing (13-22)
- `.planning/v0.1-MILESTONE-AUDIT.md` — GAME-02/03 tech-debt entries
