---
created: 2026-11-19T00:00:00.000Z
title: Test Steam's own invite picker in bridged games, then decommission GameLib's custom picker
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
files:
  - src-tauri/src/login_window/invite_picker.rs
  - src-tauri/src/login_window/owned_modal.rs
  - src-tauri/src/login_window.rs
  - src-tauri/src/main.rs
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/rust_dispatch.rs
  - src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx
  - src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx
  - src/frontend/state/SteamBridgeInvite.ts
  - src/frontend/index.tsx
  - src/common/bridgeInvitePicker.ts
  - src/common/types/sidecarTransport.ts
  - src/preload/tauriAttach.ts
  - src/backend/host/appState.ts
  - src/backend/storeManagers/steam/bridge/helperSpawn.ts
---

## Problem

During the live check of quick task 261119-9d9 (2026-11-19), with the Vite dev server stopped,
GameLib's custom bridge invite picker opened blank twice, as expected. Behind it, Steam's own
invite picker came up and appeared to work. Opening a game's invite then puts two pickers on
screen, ours on top of Steam's.

GameLib's picker was built because Steam's picker did not work for bridged games. If Steam's picker
now works on its own, ours is a redundant layer. It covers the working one, and it carries its own
defects: the whole-window raise (completed todo `2026-11-01-invite-picker-raises-whole-main-window`)
and the `existing.url()` panic fixed in 261119-9d9.

The observation was incidental: one game, a dev build, and our picker was blank. It has not been
tested on purpose.

## Direction

1. **Test Steam's picker deliberately, before removing anything.** Bridged games on the Mac,
   preferably a CrossOver-engine game and a Wine-Staging-fallback game. Suppress our picker for the
   test, or stop Vite as was done here. For each, check:
   - Steam's picker opens from the in-game invite action.
   - The friends list fills in.
   - An invite is sent, and the friend receives it and can join.

   Record which games and engines were tested, and the result for each.
2. **Only if every case passes**, decommission the custom picker. That means the invite-picker
   window and its RPC, its IPC contract entries, the frontend root and dialog, its state, and the
   bridge helper hook in `helperSpawn.ts` that triggers it. The `files:` list above is the starting
   census; re-grep before deleting. Also remove its tests, and its clippy ratchet entries if they
   change.
3. **If any case fails**, keep the custom picker. Record the failing case here, and decide whether
   to suppress Steam's picker so they don't stack, or to show ours only where Steam's fails.
