---
phase: 58-steam-bridge-multiplayer
plan: 36
subsystem: steam-bridge-invite
tags: [gap-closure, invite, window-raise, display-ack, tauri]
requires: [58-32]
provides:
  - INVITE line raises the real window via app.raiseMainWindow() (main_window_raise)
  - macOS Critical user-attention fallback in main_window_raise
  - ackId on steamBridgeInviteRequest; display=confirmed|unconfirmed logging
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    - src/common/types/ipc.ts
    - src/common/types/sidecarTransport.ts
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/frontend/state/SteamBridgeInvite.ts
    - src/frontend/state/__tests__/SteamBridgeInvite.test.ts
    - src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx
    - src/frontend/components/UI/SteamBridgeInviteDialog/__tests__/SteamBridgeInviteDialog.test.tsx
decisions:
  - "Reuse displayAck trackDialogDisplay and the existing dialogDisplayed channel; no new IPC, census unchanged"
metrics:
  tasks: 2
  completed: 2026-11-01
requirements: [M-01]
---

# Phase 58 Plan 36: Invite picker raise and display ack Summary

The game's '+' press now raises GameLib through the Rust `main_window_raise` arm instead of the no-op `fakeWindow.show`, and the picker echoes its `ackId` so the backend logs whether it was actually displayed.

## What changed

- `handleInviteDialogLine`: `app.raiseMainWindow()`, log `raise requested`, `trackDialogDisplay`, then push `{ appId, ackId }`. `getMainWindow` import removed. Logs carry appId and fixed words only.
- `main_window_raise` requests Critical attention on macOS (Dock bounce when activation is declined).
- Store keeps `ackId`; the dialog calls `ackWhenVisible(ackId, window.api.dialogDisplayed, document)` from a `useEffect` placed before the early return.

## Verification

- helperProcess, dialog, tauriShellSource, flowRegistrationCensus, store, picker and DialogHandler suites green; `pnpm codecheck` clean; `cargo check --bin gamelib-shell` clean (no externalBin stub needed); prettier clean on TS/TSX paths.
- Live macOS check (picker appears over a running game, display=confirmed) not run here.

## Deviations from Plan

None - plan executed as written. The dialog test captures `useEffect` (component is called as a function, no renderer) and runs the effect by hand.

## Commits

- 08f82ab19: backend raise, display tracking, shell fallback
- bc73e6ee4: picker store and dialog ack

## Self-Check: PASSED
