---
slug: steam-install-opens-main-window
status: resolved
trigger: "when you download a steam game the steam window opens rather than just the steam dialog"
created: 2026-11-03
updated: 2026-11-03
---

# Debug: installing a Steam game opens the full Steam window instead of just Steam's install dialog

## Symptoms

- **Expected:** With the setting "use GameLib as downloader" OFF, clicking Install on a Steam game hands the install to the Steam client and only Steam's install confirmation dialog appears (the one where you confirm/choose the library folder and start the download). The Steam main window is not brought up.
- **Actual:** The full Steam client main window opens (rather than just the install confirmation dialog).
- **Scope:** Native games (native Steam client) on macOS and Windows; Linux probably also affected, not confirmed. Not the bridged/bottled Windows-on-Mac route.
- **Setting:** "Use GameLib as downloader" = OFF (Steam-client install path).
- **Error messages:** none reported.
- **Timeline:** not stated.
- **Reproduction:** Settings → GameLib-as-downloader OFF → pick a native Steam game not installed → Install.

## Notes for investigator

- Find how the OFF path hands off to Steam (e.g. `steam://install/{appId}` vs another URL such as `steam://nav/...`, `steam://open/...`, `steam://rungameid`, or launching the Steam binary with args). The `steam://install/<appid>` protocol normally shows only the install dialog; anything that launches Steam without `-silent`, or a `steam://` URL that navigates the library, will raise the main window.
- Also check whether GameLib starts Steam itself first (when Steam isn't running) without `-silent`/`-no-browser`-style flags before sending the install URL — that would surface the main window on cold start.
- Relevant code: `src/backend/storeManagers/steam/` (library.ts `install`/`pollInstallOnce`), frontend `InstallModal`/`DownloadDialog`. Prior related session: `.planning/debug/knowledge-base.md` entry `steam-waiting-for-restart-windows`.
- Repo conventions apply (`Skill("gamelib-conventions")`). After code changes run `graphify update .`. Run `npx prettier --check` scoped to exact paths written.

## Current Focus

- hypothesis: Steam itself raises its main window on receipt of steam://install
- next_action: none — closed as upstream Steam behaviour
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- OFF path: `SteamGame.install()` (src/backend/storeManagers/steam/games.ts ~2035) calls `shell.openExternal('steam://install/<id>')` with no options; on macOS that is a plain `open`, which activates Steam.
- Tried `shell.openExternal(url, { activate: false })` (→ `open -g`, as the rungameid launch path uses). Operator live-tested 2026-11-03: no difference — Steam's main window still opens.
- Windows/Linux: GameLib does nothing that raises the window; URL goes straight through the opener. `activate` is darwin-only.

## Eliminated

## Resolution

- root_cause: Steam client behaviour — on receiving `steam://install/<appId>` it brings up its main window alongside the install dialog. Not caused by how GameLib opens the URL.
- fix: none. The `activate: false` attempt was reverted (no observable effect).
- verification: operator live test on macOS, 2026-11-03.
- files_changed: none
- untried: launching Steam with `-silent steam://install/<id>` when Steam is not running (would not help when Steam is already running).
