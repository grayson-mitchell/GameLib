---
status: resolved
trigger: "A bridge-notice dialog is dispatched but the operator saw nothing (display=unconfirmed)"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/pending/2026-10-28-bridge-notice-dialog-display-unconfirmed.md
---

## Symptoms

- expected: When a bridge launch fails (e.g. drm-bottle-stage), the bridge-notice in-app dialog is shown to the user, and the log can say whether it was actually displayed.
- actual: Grim Dawn 219990 drm-bottle-stage failure at 22:49:14 (2026-10-27/28, phase 56 live gate 56-16) logged `[bridge-notice] appId=219990 dispatched=in-app-dialog+notify dialog-frame-sent=true display=unconfirmed`, but the operator saw nothing. Raft failure at 22:52:09, same session, the operator did see the dialog.
- errors: none; only `display=unconfirmed`.
- timeline: observed in the 56-16 live gate on 2026-10-28. The gate session dir /tmp/gamelib-gate-20261028T081115Z no longer exists; ~/Library/Logs/GameLib/gamelib.log.old or other gate artifacts under .planning/phases/56-* may still hold the lines.
- reproduction: unknown. Candidates from the todo: window state (app hidden/minimized/behind the game, renderer visibility), modal queue (a dialog already open or queued drops/replaces the new one).

## Current Focus

hypothesis: resolved by hardening; see Resolution
next_action: none

## Evidence

- checked: games.ts maybeNotifyDrmModeFailed (~3380-3420), dialog.ts showDialogBoxModalAuto, ipc.ts sendFrontendMessage, DialogHandler/index.tsx, GlobalState handleShowDialogModal
  found: backend can only report frame handed to transport (sendFrontendMessage true if main window object exists). Renderer keeps ONE dialogModalOptions in state; handleShowDialogModal setState overwrites any open dialog. No ack from renderer. dialog.ts header already documents both caveats. Log at 22:49:14 (56-15-LIVE-GATE item 11) was followed by a retry attempt at 22:55 and the Raft dialog at 22:52, so replacement/hidden window cannot be told apart from existing logs. Gate session logs no longer exist.
  implication: candidates (1) window hidden/unfocused and (2) replaced dialog both fit; (3) listener unmounted is unlikely (DialogHandler is mounted in the main branch of App). Root cause NOT confirmed; needs live repro.

## Eliminated

## Resolution

root_cause: NOT confirmed live (user chose to skip the repro). Two candidate causes are addressed by hardening: (1) GlobalState.handleShowDialogModal overwrote an open dialog, so a second showDialog dropped the first; (2) the dialog was rendered into a window hidden/minimized/behind the game, with no raise and no renderer ack, so the backend could only log display=unconfirmed.
fix: (1) dialogQueue.ts reducer: later dialogs queue, close promotes the next. (2) new Rust arm main_window_raise (unminimize+show+set_focus) via app.raiseMainWindow(), called only from maybeNotifyDrmModeFailed before the dialog. (3) showDialog frame carries ackId; DialogHandler sends dialogDisplayed(ackId) once that dialog is rendered and document.visibilityState is visible (deferred to visibilitychange if hidden); backend displayAck.ts logs `[bridge-notice] appId=X display=confirmed elapsedMs=N` or `display=unconfirmed timeout=15000` (unref'd, bounded 15s timer). The dispatch line now says display=pending. Existing `[dialog] showDialog frame received` diagnostic kept, now with ackId.
verification: tsc --noEmit clean; cargo check clean; jest 40 of 41 suites pass (1210/1211 tests) across state, dialog, DialogHandler, steam games, sidecar, preload. Remaining failure (games.test 261024-tny known-fixes args) plus runnerSliceRegistration, installFlows 1b, testContainment are pre-existing and unrelated. Pre-existing failures confirmed on a clean HEAD worktree (same 4 suites, 5 tests fail without this change). LIVE 2026-10-29, trigger: Mac Steam quit, Play on Grim Dawn 219990 (steam-check / steam-not-running). Run A 06:37:02, GameLib in front: frame visibility=visible, display=confirmed elapsedMs=69. Run B 06:38:31, GameLib hidden with Cmd+H at 06:38:30: frame visibility=hidden, visibilitychange->visible same second (raise worked), display=confirmed elapsedMs=81. No raise errors; replacesOpenDialog=false both runs, so the queue was not exercised live (unit tests only).
files_changed: [src/frontend/state/dialogQueue.ts, src/frontend/state/GlobalState.tsx, src/frontend/types.ts, src/frontend/components/UI/DialogHandler/index.tsx, src/frontend/components/UI/DialogHandler/ackWhenVisible.ts, src/backend/dialog/displayAck.ts, src/backend/dialog/dialog.ts, src/backend/storeManagers/steam/games.ts, src/backend/platform/index.ts, src/backend/platform/__mocks__/index.ts, src/backend/sidecar/appShellFlowRegistration.ts, src/common/types/ipc.ts, src/common/types/sidecarTransport.ts, src/preload/api/helpers.ts, src-tauri/src/main.rs, tests: dialogQueue.test.ts, displayAck.test.ts, ackWhenVisible.test.ts, games.test.ts, buttonActions.test.tsx, flowRegistrationCensus.test.ts, tauriShellSource.test.ts]
