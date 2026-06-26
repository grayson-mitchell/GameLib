# Feature Landscape: Steam Store Manager

**Domain:** Steam integration in a multi-store game launcher (Heroic fork)
**Researched:** 2026-06-26

---

## Interface Contract

Before categorizing features, the `Game` and `LibraryManager` interfaces in
`src/common/types/game_manager.ts` define what every store manager **must** implement.
The Steam manager is not exempt. Understanding which methods are trivial stubs vs.
real implementations shapes the work.

### `LibraryManager` — required methods

| Method | Steam Implementation Approach | Complexity |
|--------|-------------------------------|------------|
| `init()` | Auth check + initial library sync | MEDIUM |
| `getGame(id)` | Return cached `SteamGame` instance by appID | LOW |
| `refresh()` | Fetch owned games via steam-user `getOwnedApps()` or Web API `GetOwnedGames` | MEDIUM |
| `getGameInfo(appName)` | Return from in-memory Map, optionally hit store.steampowered.com/api/appdetails | LOW |
| `getInstallInfo(appName, platform)` | Return download size from ACF or stub | MEDIUM |
| `listUpdateableGames()` | Scan ACF files for StateFlags != 4 | MEDIUM |
| `changeGameInstallPath(appName, newPath)` | Update internal store only — Steam still owns the path | LOW |
| `changeVersionPinnedStatus(appName, status)` | Store setting, Steam ignores it — stub | LOW |
| `installState(appName, state)` | Update in-memory Map and Electron store | LOW |
| `getLaunchOptions(appName)` | Return empty array or Steam-specific DLC/beta options | LOW |

### `Game` — required methods

| Method | Steam Implementation | Complexity |
|--------|---------------------|------------|
| `getSettings()` | Delegate to shared `GameConfig` | LOW |
| `getGameInfo()` | Return from library Map | LOW |
| `getExtraInfo()` | Call store.steampowered.com/api/appdetails | LOW |
| `importGame(path)` | Detect ACF at path, register in internal store | LOW |
| `onInstallOrUpdateOutput()` | Progress callback — poll ACF StateFlags | MEDIUM |
| `install(args)` | Open `steam://install/<appid>` + poll ACF for completion | MEDIUM |
| `isNative()` | Read `is_linux_native` / `is_mac_native` from GameInfo | LOW |
| `addShortcuts()` | Delegate to existing `addShortcutsUtil` | LOW |
| `removeShortcuts()` | Delegate to existing `removeShortcutsUtil` | LOW |
| `launch()` | `steam://rungameid/<appid>` via `openUrlOrFile` | LOW |
| `moveInstall(newPath)` | STUB — Steam owns the file layout | LOW (stub) |
| `repair()` | Open `steam://validate/<appid>` | LOW |
| `syncSaves()` | STUB — Steam Cloud is automatic | LOW (stub) |
| `uninstall(args)` | Open `steam://uninstall/<appid>` + poll ACF absence | MEDIUM |
| `update()` | Open `steam://checksiteupdate/<appid>` or delegate to Steam | MEDIUM |
| `forceUninstall()` | Delete ACF + game folder — last resort | MEDIUM |
| `stop()` | `sendKill` on the game process if trackable | MEDIUM |
| `isGameAvailable()` | Check ACF exists and StateFlags == 4 | LOW |
| `getAchievements?(lang)` | Steam Web API `ISteamUserStats/GetPlayerAchievements` | MEDIUM |

**Observation:** Most `Game` methods are LOW complexity because they delegate to Steam
client via `steam://` protocol URIs, which Steam handles. The hard work is auth and
library sync.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

### 1. 'steam' Runner Type Registration

**Why expected:** Every store manager registers a runner key. Without it, Steam games
cannot appear in the library at all. This is the foundational wiring that touches:
- `Runner` union type in `src/common/types.ts` (currently `'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom'`)
- `GameInfo.runner` union type (same union, defined separately on line 183)
- `libraryManagerMap` in `src/backend/storeManagers/index.ts`
- `StoreLogos` component — currently has no 'steam' case, falls to default (Heroic icon)
- `getStoreName` helper — currently returns 'Other' for unknown runners
- All switch/case patterns on `runner` throughout the codebase

**Complexity:** LOW
**Notes:** No logic, only type and registration changes. Must be done first — everything
downstream depends on the 'steam' runner key existing.

---

### 2. Steam Account Authentication

**Why expected:** Without auth, `getOwnedApps()` returns nothing for private libraries.
Users expect to log in and see their library. This gates all other features.

**Approach options (evaluated):**

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| steam-user npm | Steam CM protocol (TCP) | Rich API, gets ownership/achievements directly | Complex — handles Steam Guard, 2FA, machine tokens; heavy dependency |
| steam-session npm | Auth token generation | Lightweight, generates tokens for Web API use | Still requires handling 2FA/Steam Guard |
| Steam Web API key | User creates key at steamcommunity.com/dev | Simpler, no credentials stored | Requires user to manually generate key; no library sync for private profiles |
| Browser-based OAuth | Steam as OpenID provider | No credentials stored, familiar flow | Web API key still needed for GetOwnedGames; limited API scope |

**Recommendation:** steam-session for token generation + Steam Web API for library data.
Stores refresh token (not password). Handles Steam Guard / 2FA in a dedicated auth flow
in Manage Accounts screen.

**Complexity:** HIGH — Steam Guard email codes, TOTP 2FA, machine auth tokens, and
token refresh must all be handled gracefully.

**Dependency:** Everything else depends on this.

---

### 3. Library Sync (`refresh()`)

**Why expected:** Users open GamerLib to see all their games. If Steam games don't
appear, the integration is useless.

**Mechanism:** Steam Web API `IPlayerService/GetOwnedGames` with `include_appinfo=1`
and `include_played_free_games=1`. Returns: `appid`, `name`, `playtime_forever`,
`playtime_2weeks`, `img_icon_url`. Map each entry to a `GameInfo` object and store
in an Electron store (same pattern as `gog/library.ts` and `legendary/library.ts`).

**Edge cases to handle:**
- Private Steam profiles block `GetOwnedGames` — show helpful error, not crash
- Users with thousands of games (1000+ is common) — paginated handling
- Free-to-play games in library vs. owned games distinction

**Complexity:** MEDIUM

---

### 4. Game Metadata Population (GameInfo fields)

**Why expected:** Game cards in `GameCard/index.tsx` display `art_cover`, `art_square`,
title, and runner badge. Without artwork, the library looks broken.

**Data sources:**
- Artwork: Steam CDN at `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/`
  - `header.jpg` → `art_cover`
  - `library_600x900_2x.jpg` → `art_square`
  - `library_hero.jpg` → `art_background`
  - `logo.png` → `art_logo`
- Store details: `https://store.steampowered.com/api/appdetails?appids={appid}` →
  `description`, `genres`, `release_date`, `developers`, system requirements for `extra`
- Native platform flags: `platforms.linux` → `is_linux_native`, `platforms.mac` → `is_mac_native`

**Note:** The `store.steampowered.com/api/appdetails` endpoint is undocumented but
widely used. It is rate-limited (~200 requests/5 min). Fetch lazily (on game page
open), not during bulk library sync.

**Complexity:** MEDIUM (bulk sync is fast; per-game detail fetch needs rate-limit care)

---

### 5. Installed State Detection

**Why expected:** Users who already have Steam games installed expect them to show
"Play" not "Install". This is the difference between a useful integration and a broken one.

**Mechanism:** The codebase already has `getSteamLibraries()` in `src/backend/utils.ts`
which parses `libraryfolders.vdf` from `defaultSteamPath`. Scan each library for
`steamapps/appmanifest_<appid>.acf` files. Parse ACF key `StateFlags`:
- `4` = fully installed
- `2` = update pending / partially installed
- Other values = installing or broken state

Extract from ACF: `installdir`, `buildid`, `LastUpdated`, `SizeOnDisk`.

**Complexity:** LOW-MEDIUM — ACF parsing is straightforward; `getSteamLibraries()` is
already implemented. The main work is wiring the scan into `refresh()` and merging
with owned games list.

---

### 6. Game Launch (`launch()`)

**Why expected:** Launching games is the primary action in any launcher.

**Mechanism:** `steam://rungameid/<appid>` via Electron's `shell.openExternal()` (same
path as `openUrlOrFile` already used in the codebase). This delegates to the Steam
client, which handles DRM authentication, Proton selection, the Steam overlay, and
cloud save sync before launch.

**Why not direct executable launch:** Steam games with DRM (the majority) require
Steam client running to authenticate. Direct executable launch works for DRM-free
Steam games but is an edge case. Delegating to Steam client is correct for 95%+ of games.

**Steam client must be running:** If Steam is not running, `steam://` URIs launch it
automatically before running the game. This is expected behavior.

**Complexity:** LOW

---

### 7. `isNative()` Implementation

**Why expected:** Heroic's `prepareLaunch()` uses `isNative()` to decide whether to
invoke Wine/Proton. Returning the wrong value breaks game launching on Linux.

**For Steam games on Linux specifically:** A Steam game with `is_linux_native: true`
should return `isNative() = true`. A Windows-only Steam game on Linux should return
`false` — but Steam itself will manage Proton for it, so Heroic should NOT layer its
own Wine on top. The `thirdPartyManagedApp` field or a new `isSteamManaged` flag may
be needed to signal "Proton is Steam's responsibility."

**Complexity:** MEDIUM — the naive implementation is one line; the correct interaction
with Heroic's Wine/Proton selection for Windows-only games on Linux needs design.

---

### 8. Game Import (`importGame()`)

**Why expected:** Power users may have Steam games installed and want to register them
in GamerLib without reinstalling. Standard pattern across all store managers.

**Mechanism:** Accept the install path, locate the ACF manifest, extract metadata,
register in the internal installed games store. Effectively the first step of
installed state detection applied to a user-selected path.

**Complexity:** LOW — reuses ACF parsing logic from installed state detection.

---

## Differentiators

Features that differentiate GamerLib from a plain Steam shortcut. Not expected at
launch, but high value for engagement.

### 1. Install via Steam Client (`install()`)

**Value:** Users can install Steam games from within GamerLib rather than switching
to the Steam client.

**Mechanism:** Open `steam://install/<appid>`. Steam client shows its own install
dialog (install path selection, DLC selection). GamerLib polls ACF file appearance to
detect when install completes and updates game status. Progress display is limited to
"installing" status while polling.

**Limitation:** Steam's install dialog is shown in Steam's UI, not GamerLib's. The
install path is Steam's, not freely configurable from GamerLib's install modal. This
is an acceptable v1 trade-off.

**Complexity:** MEDIUM — fire-and-poll pattern; the `InstallModal` in GamerLib may
need a "opening Steam..." interstitial rather than the standard download progress bar.

---

### 2. Uninstall via Steam Client (`uninstall()`)

**Value:** Complete install lifecycle within GamerLib.

**Mechanism:** Open `steam://uninstall/<appid>`. Steam shows a confirmation dialog.
Poll for ACF absence to confirm removal. Fall back to `forceUninstall()` (delete ACF
+ game folder) only when Steam client is unavailable.

**Complexity:** MEDIUM

---

### 3. Playtime Display

**Value:** Users care about playtime. It is already in the `GetOwnedGames` response
(`playtime_forever` in minutes, `playtime_2weeks` in minutes). Zero extra API calls —
just populate during library sync.

**Fields:** Store `playtime_forever` in `GameInfo.extra` or a Steam-specific metadata
store. Display on game page alongside other metadata.

**Complexity:** LOW — data is free from the library sync call.

---

### 4. Achievement Display (`getAchievements()`)

**Value:** Heroic already shows GOG achievements. Steam achievements are more prominent
in gaming culture. This is a visible feature differentiator.

**Mechanism:** Steam Web API `ISteamUserStats/GetPlayerAchievements/v1/` with `appid`
and `steamid`. Returns: `apiname`, `achieved` (0/1), `unlocktime`. Map to the existing
`GOGAchievement` shape (the `GameAchievement` type alias in `common/types.ts` already
points to `GOGAchievement` — field names need mapping).

**Limitation:** Only works if the user's Steam profile is set to public or the auth
token has the correct scope. Show a "make your Steam profile public to see achievements"
message when the API returns an error.

**Complexity:** MEDIUM — API call is standard; the UI for achievement display already
exists via GOG achievements; the work is the field mapping and auth scope.

---

### 5. Store Extra Info / Game Details (`getExtraInfo()`)

**Value:** Game page shows description, genres, system requirements, release date —
same richness as GOG/Epic games.

**Mechanism:** `store.steampowered.com/api/appdetails?appids={appid}` returns full
store page data. Fetch lazily on game page open, cache in Electron store.

**Complexity:** LOW — simple HTTP fetch and field mapping.

---

### 6. Update Detection (`listUpdateableGames()`)

**Value:** Users see which Steam games have pending updates, matching the experience
for Epic/GOG games.

**Mechanism:** ACF `StateFlags` includes an "update pending" state. Additionally,
compare ACF `buildid` against Steam's content servers (requires steam-user or an
undocumented API call). Simple approach: flag games with StateFlags != 4 as
"update available."

**Complexity:** MEDIUM — simple ACF check gives approximate results; accurate build
comparison requires more auth complexity.

---

### 7. Proton-Transparent Launch (Linux)

**Value:** On Linux, Steam games using Proton work correctly without GamerLib trying
to inject its own Wine layer.

**Mechanism:** For Windows-only Steam games on Linux, `isNative()` should return
`false` but the launch path must use `steam://rungameid` rather than calling
`prepareLaunch()` with Wine wrappers. The `thirdPartyManagedApp` field or a
`isSteamManaged` extension on `GameInfo` signals to the launch pipeline to skip
Heroic's Wine selection entirely.

**Complexity:** MEDIUM — requires careful review of `prepareLaunch()` code path to
identify where to short-circuit for Steam-launched games.

---

## Anti-Features

Things to explicitly NOT build in v1. Building them costs more than the value returned
and some violate boundaries.

### 1. Friends List / Social Features

**Why avoid:** PROJECT.md explicitly states "Replacing Steam client functionality
(friends, community, overlay) is out of scope." The steam-user library can access
friend data, but implementing UI for it is a feature unto itself. Valve's own client
does this better.

**What to do instead:** Steam client handles all social features. GamerLib is a
launcher, not a Steam replacement.

---

### 2. Steam Overlay

**Why avoid:** The Steam overlay (`steam_api.dll` / `libsteam_api.so`) requires
Steamworks SDK integration as a native module. It must inject into the game process.
This is beyond Electron's capabilities without complex native code. When games are
launched via `steam://rungameid`, Steam's overlay activates automatically.

**What to do instead:** Launch via `steam://rungameid` and get the overlay for free.

---

### 3. Independent Download Manager (SteamCMD path)

**Why avoid:** SteamCMD provides a CLI interface for downloads, and npm wrappers exist
(`steamcmd-interface`). However: (a) SteamCMD requires its own separate auth flow
independent of Steam client; (b) Steam games often need the Steam client running at
runtime for DRM even if installed via SteamCMD; (c) Heroic's download manager queue
(`downloadmanager/downloadqueue`) doesn't map cleanly to SteamCMD's text-output
progress model; (d) SteamCMD is a server tool, not designed for consumer game
installation UX.

**What to do instead:** Delegate installs to Steam client via `steam://install/<appid>`.
Users who own 500 Steam games expect Steam's install dialog with DLC selection, drive
selection, etc.

---

### 4. Cloud Save Sync Management (`syncSaves()`)

**Why avoid:** Steam Cloud is fully automatic and opaque. It syncs before launch and
after exit via the Steam client. There is no public API to manually trigger a Steam
Cloud sync. The `syncSaves()` method should stub with a log message: "Steam Cloud
sync is managed automatically by the Steam client."

**What to do instead:** Show a note on the game page that cloud saves are automatic.
Document where local save files are stored (Steam's `userdata/<steamid>/<appid>/`).

---

### 5. `moveInstall()` Implementation

**Why avoid:** Steam's library structure (`steamapps/common/<gamedir>/`) is managed
by Steam. Moving game files to another path breaks Steam's ability to locate and
update them unless `libraryfolders.vdf` is also updated and Steam is told about it.
This is Steam's `Move Install Folder` feature — implementing it independently is
fragile and can corrupt Steam's library state.

**What to do instead:** Stub `moveInstall()` with a log warning. Direct users to
Steam's own "Move Install Folder" in Steam client → Properties → Local Files.

---

### 6. Custom Wine/Proton Override for Steam Games

**Why avoid:** Heroic already manages Wine/Proton versions for Epic/GOG/Amazon games.
Steam manages Proton separately for its games (per-game Proton version selection in
Steam's game Properties). If GamerLib forces its own Wine layer onto a Steam game
that expects Steam's Proton environment (including the Steam Linux Runtime container),
the game will break.

**What to do instead:** Mark Steam games as "Proton managed by Steam" in the launch
pipeline. Do not show Wine version selector for Steam runner games in game settings.

---

### 7. Workshop / UGC Integration

**Why avoid:** Steam Workshop is a content distribution system for mods and user
content. Implementing it requires Steamworks SDK and significant scope beyond a launcher.

**What to do instead:** Out of scope. Launch the game, which has its own Workshop UI.

---

### 8. Trading Cards, Badges, Market

**Why avoid:** Not launcher features. Zero user expectation that a game launcher
handles Steam's commerce layer.

---

## Feature Dependencies

```
'steam' runner type registration
  └── LibraryManager registration in libraryManagerMap
      └── init() / refresh()
          └── Steam Account Authentication
              └── Library Sync (getOwnedApps / GetOwnedGames)
                  └── GameInfo population (title, artwork)
                      └── GameCard renders correctly
                  └── Playtime Display (free from same API call)
          └── Achievement Display (needs auth token)

Installed State Detection (ACF scan via getSteamLibraries())
  └── GameInfo.is_installed
      └── GameCard shows Play vs Install
      └── listUpdateableGames()

isNative() detection
  └── Correct launch behavior on Linux (skip Heroic Wine)

Game Launch (steam://rungameid)
  └── Requires: GameInfo populated + 'steam' runner type registered
  └── Requires: Steam client installed on user's machine

Game Install (steam://install delegation)
  └── Requires: Auth (to validate ownership before opening install)
  └── Leads to: Installed State Detection picks up new ACF

Achievement Display
  └── Requires: Auth token with correct scope
  └── Requires: User profile public OR access token (not just API key)
```

---

## MVP Recommendation

Prioritize in this order to ship a functional integration:

1. 'steam' runner type registration — zero logic, unblocks everything
2. Steam account authentication — gates library sync
3. Library sync + GameInfo population — makes games visible in library
4. Installed state detection — shows correct Play/Install state
5. Game launch via `steam://rungameid` — the core value
6. `isNative()` + Proton-transparent launch on Linux — correctness for Linux users
7. `getExtraInfo()` — game page shows content, not blanks

**Defer to follow-on:**
- Install delegation (MEDIUM — usable without it: users install in Steam, GamerLib detects)
- Achievement display (MEDIUM — nice to have, not a launch blocker)
- Playtime display (LOW effort but not critical)
- Update detection (MEDIUM — users can update in Steam client)

---

## Sources

- `src/common/types/game_manager.ts` — Game and LibraryManager interface contracts
- `src/common/types.ts` — GameInfo, GameSettings, Runner, SteamRuntime, thirdPartyManagedApp
- `src/backend/storeManagers/index.ts` — libraryManagerMap registration pattern
- `src/backend/utils.ts:533` — `getSteamLibraries()`, existing ACF/VDF parsing
- `src/backend/storeManagers/zoom/games.ts` — reference stub pattern for new runner
- `src/frontend/components/UI/StoreLogos/index.tsx` — frontend runner wiring
- `src/frontend/helpers/index.ts:124` — `getStoreName` switch (needs 'steam' case)
- `src/frontend/screens/Game/GamePage/index.tsx:163` — `thirdPartyManagedApp` rendering logic
- [node-steam-user GitHub](https://github.com/DoctorMcKay/node-steam-user) — CM protocol auth, getOwnedApps — HIGH confidence
- [node-steam-session GitHub](https://github.com/DoctorMcKay/node-steam-session) — token generation — HIGH confidence
- [IPlayerService/GetOwnedGames](https://partner.steamgames.com/doc/webapi/IPlayerService) — official Steamworks Web API — HIGH confidence
- [ISteamUserStats/GetPlayerAchievements](https://partner.steamgames.com/doc/webapi/isteamuserstats) — official Steamworks Web API — HIGH confidence
- [Steam browser protocol](https://developer.valvesoftware.com/wiki/Talk:Steam_browser_protocol) — steam:// URI scheme — MEDIUM confidence (some URI variants have cross-platform issues)
- [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) — official CLI tool, evaluated and rejected for v1 — HIGH confidence
