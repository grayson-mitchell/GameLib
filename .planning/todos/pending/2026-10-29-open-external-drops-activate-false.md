---
created: 2026-10-29
title: "shell.openExternal's { activate: false } is dropped on the way to Rust, so Steam launches bring the Steam client to the foreground"
source: conversation 2026-10-29 (Windows "Starting game" Steam dialog question)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src-tauri/src/main.rs
severity: medium
platform: macos
ready: live-gate
---

Two callers ask for a background open:

- `SteamGame.launch()` — `shell.openExternal(url, { activate: false })` for the Steam launch URL:
  `steam://rungameid/<appId>` on macOS and Linux, `steam://launch/<appId>/Dialog` on Windows
  (`games.ts:3312`). The comment there says activating Steam forces macOS out of GameLib's fullscreen
  Space (Console mode), causing a visible desktop-Space flash before the game appears.
- `startSteamDefault` — `shell.openExternal('steam://open/main', { activate: false })`
  (`bridge/helperProcess.ts:787`), for the same Console-mode reason.

The options never get past the sidecar. `requestOpenExternal(url: string)` (`sidecarRpc.ts:380`) takes
only the URL and writes an `openExternal` frame with `args: [url]`. The Rust frame handler
(`main.rs:~12298`) then calls `app.opener().open_url(url, None::<&str>)`, which always activates the
handler app. The renderer-facing `open_external` command (`main.rs:2270`) has the same single-argument
shape. So `activate: false` has been a no-op since the Tauri rearchitecture (Electron's
`shell.openExternal` honoured it on macOS). By contrast, `macSteamOffline.ts:134` gets a background open
correctly by spawning `/usr/bin/open -g` directly.

The Windows "Starting game / LAUNCHING — Open Steam" window is a separate issue. The
`steam://rungameid` verb causes it; it appears even through `steam.exe -silent`. Quick 261029-i1n
fixed it on Windows by launching with `steam://launch/<appId>/Dialog`. This todo is therefore only
about the macOS Console-mode Space flash.

Direction to consider: carry an `activate` flag in the `openExternal` frame (for example
`args: [url, { activate }]`) and, on macOS, open in the background when it is false (`open -g`
semantics; check whether tauri-plugin-opener exposes this, otherwise spawn `/usr/bin/open -g <url>`
behind the same `open_external_scheme_check`). On Windows, find out whether a no-activate open is even
possible through ShellExecute for a protocol handler; if not, document it as macOS-only, as Electron
did. Keep the scheme allow-list check in front of any new path.

Verify live on the Mac: from Console mode, press Play on a native Steam title and confirm there is no
desktop-Space flash before the game window appears.
