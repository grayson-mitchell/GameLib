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
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
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

## Live results

| date       | engine                | game              | opens | friends | invite sent, friend joins | result  |
| ---------- | --------------------- | ----------------- | ----- | ------- | ------------------------- | ------- |
| 2026-11-20 | CrossOver             | (one bridged game) | yes   | yes     | yes (PC account joined)   | pass    |
| 2026-11-20 | Wine-Staging fallback | (one bridged game) | yes   | yes     | yes                       | pass    |

The CrossOver pass needed a game restart first. Steam was at its login screen when the game
launched, so the picker showed no friends, and signing in mid-game did not help (the game reads
the session at startup). That is not a picker defect; it is filed separately as
`2026-11-20-bridged-game-launches-while-mac-steam-signed-out`.

The Wine-Staging run selected the fallback through the per-game Engine (advanced) override. The
operator did not name the games on either engine.

## Resolution (2026-11-20)

- Every Direction step 1 case passed on both engines (CrossOver and the Wine-Staging fallback), so
  step 2 applied.
- Quick 261120-pp4 removed the custom picker: the window, RPC and capability; the frontend root,
  dialog and state; the sidecar friend-list and invite channels; the helper-line trigger; the
  helper's control slots 13/14 with their friend snapshot and lobby adoption (both slot numbers
  retired, never to be reused); and the catalogue strings.
- Steam's own picker, reached by the helper forwarding the game's call to Mac Steam, is now the
  only picker.
- The signed-out-launch issue stays in its own todo,
  `2026-11-20-bridged-game-launches-while-mac-steam-signed-out`.
