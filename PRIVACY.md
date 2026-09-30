# GameLib Privacy Policy

GameLib is a desktop game library manager. It runs on your device and has no account system of its
own. The maintainer does not operate a server that receives your data. GameLib contains no
telemetry, analytics or crash reporting. It does make network requests, mostly to the stores and
public data sources it needs to show and install your games, and some of those requests happen
without a click from you. This document says what is stored locally, what is sent and to whom, and
where the limits of that statement are.

## What GameLib stores on your device

**Store credentials and secrets.** These live in your operating system's credential store, through
the Rust `keyring` library:

| Operating system | Credential store               |
| ---------------- | ------------------------------ |
| macOS            | Keychain                       |
| Windows          | Windows Credential Manager     |
| Linux            | Secret Service (libsecret API) |

Four items are stored there: the Steam refresh token, the Humble Bundle session cookie, the Humble
Bundle CSRF token and your SteamGridDB API key. If the credential store is unavailable or denies
access, GameLib reports a failure and does not fall back to a file. A separate plaintext vault for
these secrets exists only for developer builds, is switched on by an environment variable, and is
refused in a packaged build.

**Store sessions kept in files.** Epic, GOG, Amazon and Zoom do not use the credential store. Their
sessions are kept by the bundled command-line tools or by GameLib's own config store, in plain
files under the GameLib config folder:

- Epic Games: the `user.json` file that legendary writes, in a `legendaryConfig` folder.
- GOG: the `auth.json` file that gogdl writes, in a `gog_store` folder, plus your GOG user id,
  username and Galaxy user id in GameLib's own GOG config store.
- Amazon Games: the `current_user.json` file that nile writes, in a `nile_config` folder.
- Zoom: a `.zoom.token` file in a `zoom_store` folder.

**Config folder.** GameLib keeps its settings, library caches and the files above in a folder named
`GameLib` inside the operating system's application-data folder: `~/Library/Application Support` on
macOS, `%APPDATA%` (normally `C:\Users\<you>\AppData\Roaming`) on Windows, and `$XDG_CONFIG_HOME`
(normally `~/.config`) on Linux.

**Logs.** GameLib writes logs to `~/Library/Logs/GameLib` on macOS, `%LOCALAPPDATA%\GameLib\logs` on
Windows and `$XDG_STATE_HOME/GameLib/logs` (normally `~/.local/state/GameLib/logs`) on Linux. Logs
stay on your device unless you choose to upload one (see below). If the native shell process
crashes, it writes a crash record to standard error and, where it can, to a local file. It does not
send that record anywhere.

## What GameLib sends, and to whom

Requests carry the ordinary network metadata any client sends, such as your IP address. Requests
made by GameLib's own HTTP client identify the app as `GameLib/<version>` with a link to the GitHub
repository. The rows below list the destinations found in GameLib's own source.

**Store services and accounts.** Only for stores you have signed in to or that you open.

| Destination                                                                                                                                                                                 | When                                                                                                           | What is sent                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Epic Games (`launcher.store.epicgames.com`, `store-content.ak.epicgames.com`, `status.epicgames.com`), and Epic's login through the legendary tool                                          | Signing in, refreshing your library, viewing a game, launching or installing a game                            | Your Epic session (through legendary), the game's identifier                                |
| GOG (`auth.gog.com`, `users.gog.com`, `api.gog.com`, `gamesdb.gog.com`, `galaxy-library.gog.com`, `content-system.gog.com`, `gameplay.gog.com`, `catalog.gog.com`, `remote-config.gog.com`) | Signing in, refreshing your library, viewing a game, installing, playing, showing GOG discounts                | Your GOG access token (through gogdl and GameLib), your GOG user id, game identifiers       |
| GOG presence (`presence.gog.com`)                                                                                                                                                           | While signed in to GOG, once online and every 5 minutes, unless disabled in Settings; a delete request on quit | Your GOG access token, the app name and version, the identifier of the game you are playing |
| Amazon Games                                                                                                                                                                                | Signing in, refreshing your library, installing, through the nile tool                                         | Your Amazon session (through nile)                                                          |
| Steam network and `store.steampowered.com`, `cdn.cloudflare.steamstatic.com`                                                                                                                | While signed in to Steam: library sync and game metadata. Artwork and installer downloads are separate         | Your Steam refresh token (to the Steam network), Steam app ids (to the store and CDN)       |
| Humble Bundle (`www.humblebundle.com`)                                                                                                                                                      | Signing in, refreshing your Humble keys                                                                        | Your Humble session cookie and CSRF token                                                   |
| Zoom Platform (`www.zoom-platform.com`)                                                                                                                                                     | Signing in, refreshing your library                                                                            | Your Zoom token                                                                             |

**Game metadata, artwork and compatibility data.** Sent when you open a game's page, and cached for
later. The game title or store id is sent.

| Destination                                                                                    | Platforms            | Purpose                             |
| ---------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `www.pcgamingwiki.com`, `howlongtobeat.com`                                                    | All                  | Game information, playtime          |
| `www.protondb.com`, `store.steampowered.com` (Steam Deck report), `umu.openwinecomponents.org` | Linux (as confirmed) | Compatibility reports               |
| `www.applegamingwiki.com`, `www.codeweavers.com`                                               | macOS, Linux         | Compatibility information           |
| `www.cheapshark.com`                                                                           | All                  | Store price search, when you search |
| `www.steamgriddb.com`, `cdn2.steamgriddb.com`                                                  | All                  | Artwork, when you use SteamGridDB   |

**Compatibility-tool and runtime downloads.** Only when you ask for them, or when you install a game
that needs them: releases of Wine, Proton, DXVK, VKD3D and related tools from `api.github.com` and
GitHub release downloads, `winetricks` from `raw.githubusercontent.com`, runtimes from `lutris.net`,
the Steam client installer from `cdn.cloudflare.steamstatic.com`, and the EA app and Ubisoft Connect
installers from `origin-a.akamaihd.net` and `static3.cdn.ubi.com`.

**Community data files hosted on GitHub by Heroic Games Launcher's repositories.** These requests
go to GitHub (`raw.githubusercontent.com`), not to a server operated by Heroic:

- `Heroic-Games-Launcher/releases-info`: latest tool versions, fetched on Linux and macOS at startup
  once online. It is skipped on Windows.
- `Heroic-Games-Launcher/MacAnticheatData` (macOS) and `Starz0r/AreWeAntiCheatYet` (Linux): anti-cheat
  compatibility data, fetched at startup on Linux and macOS unless the local copy already matches
  the latest. It is skipped on Windows.
- `Heroic-Games-Launcher/known-fixes`: a per-game fix file, fetched with the game's app name when
  you install a game.

`heroic.legendary.gl` is a host of the Legendary project, not GitHub and not GameLib. GameLib
fetches game override data and store-specific download lists from it (a version file, and a per-game
file that includes the game's app name) when you refresh or install Epic games.

**Connectivity check.** At startup, and again while offline, GameLib sends HEAD requests to
`github.com`, `store.epicgames.com`, `gog.com` and `cloudflare-dns.com` to find out whether you are
online. No account data is sent.

## Telemetry, analytics and crash reporting

GameLib contains no telemetry, analytics or crash reporting. The source and both dependency
manifests were searched for the names of common reporting services and for the words telemetry,
analytics and crash report. Nothing found reports usage or errors to anyone. Error handlers in the
sidecar and the shell write to the local log only. GameLib inherited a telemetry call from the
project it derives from, and that call was deleted.

## Servers the maintainer controls

GameLib does not operate a server of its own. The maintainer publishes files as GitHub release
assets in `https://github.com/grayson-mitchell/GameLib`, and GitHub serves them. GameLib fetches two:

- The CrossOver compatibility index, `crossover-index.json.gz`, on macOS only. It is refreshed at
  most once a day, when the app builds CrossOver ratings for your library.
- The update feed. The updater is configured with the endpoint
  `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json`. The checked
  source contains no code that requests that feed, so GameLib does not currently check for updates
  on its own. If a check is added, the request goes to GitHub, and GitHub sees your IP address and
  the client's User-Agent.

## Things that happen only when you ask

- **Uploading a log.** After a confirmation dialog, GameLib sends up to the first 10 MiB of the
  chosen log file to `dpaste.com`, which returns a public URL that GameLib copies to your clipboard.
  The upload is set to expire after 2 days. dpaste.com does not support deleting an upload. No
  redaction runs, so an uploaded log can contain account identifiers, file paths and game names.
  Read a log before you share it.
- **Discord Rich Presence.** If you turn it on in Settings, GameLib tells your local Discord app
  which game you are playing. This is a connection to the Discord app on your device, using a
  GameLib application id.
- **Opening links.** Links to stores, the Heroic wiki and support pages, Weblate, Discord and Ko-fi
  open in your browser only when you click them.

## Store pages shown inside GameLib

Some store pages and login pages are shown inside a GameLib window. They are the stores' own pages
and are governed by those stores' privacy policies, including any analytics they run. Sites you
visit there can set cookies, and GameLib does not control what they do.

## Limits of this document

- The census read URL literals in GameLib's own source, at the commit named below. Addresses built
  at runtime, or used inside the bundled third-party tools (legendary, gogdl, nile, comet) and the
  Steam client library, are described by purpose and not listed.
- Steam's network connection uses a server list chosen by the Steam client library, which is not
  enumerated here.
- The extent to which uploaded or stored logs contain secrets was not audited.
- Where the embedded store windows keep their cookies on disk was not confirmed.
- The operators of `heroic.legendary.gl` and the third-party sites listed were identified by domain
  name only. Each third party's own privacy policy governs what it does with the requests it
  receives.
- Anything the census could not confirm is listed here and not stated as fact.

## Contact

Open an issue at https://github.com/grayson-mitchell/GameLib/issues.

This document was checked against the GameLib source at commit `f32ad5aaa` on 2026-09-30.
