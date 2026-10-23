---
created: 2026-10-24
title: "Steam games have no desktop / Applications shortcuts — SteamGame.addShortcuts and removeShortcuts are log-only stubs"
source: operator report during quick task 261023-vkv live gate (Add shortcut on a Steam game did nothing but show a false "Shortcuts were created" banner)
area: shortcuts
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/shortcuts/ipc_handler.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/frontend/screens/Game/GameSubMenu/index.tsx
severity: medium
platform: any
ready: code
---

`SteamGame.addShortcuts()` and `SteamGame.removeShortcuts()`
(`src/backend/storeManagers/steam/games.ts:2376-2388`) only `logWarning` —
`SteamGame.addShortcuts not implemented until Phase 2 (appId: …)`. The "Phase 2" is a stale
early-roadmap marker; no phase or requirement tracks the work.

Because the stubs resolve instead of throwing, the `addShortcut` / `removeShortcut` handlers
(`src/backend/shortcuts/ipc_handler.ts:43-104`) took the success branch and sent the
"Shortcuts were created on the Applications folder" notification while nothing was written, so the
menu item never flipped. Measured 2026-10-23 in `~/Library/Logs/GameLib/gamelib.log`: six clicks
on appIds 230070 and 206020, each a stub warning followed by a notify.

**Interim (2026-10-24, gsd-fast):** the Add/Remove shortcuts item is hidden for Steam games in
`GameSubMenu/index.tsx` (`!isSteam &&`). Remove that exclusion as part of this todo.

Implement:

- Create a launcher that runs `steam://rungameid/{appId}`, matching how Steam launch already works
  (`shell.openExternal`, see CLAUDE.md Technology Stack):
  - macOS: an `.app` in the Applications folder, as other runners do (`box.shortcuts.message-mac`).
  - Windows: Desktop + Start Menu `.url`/`.lnk`.
  - Linux: a `.desktop` file.
- Reuse the existing shortcuts module (`src/backend/shortcuts/shortcuts/shortcuts.ts`) for paths
  and icons rather than a Steam-only writer. The icon can come from the store artwork already
  cached for the tile.
- `shortcutsExistOnDisk` must find the Steam shortcut so the item flips to "Remove shortcuts".
- Check whether any non-menu caller (post-install `addShortcuts(false)`) reaches the Steam stub, and
  give it the same behaviour.

Verify: unit-test the per-OS shortcut target, then confirm one live add → item flips → remove on
this Mac. Only that last step needs the Mac.
