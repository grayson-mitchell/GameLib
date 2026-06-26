# Architecture Patterns: Steam Store Manager for GamerLib

**Domain:** Adding a 4th store manager to Heroic Games Launcher fork
**Researched:** 2026-06-26
**Confidence:** HIGH — findings are based entirely on direct source code inspection of the existing codebase

---

## Existing Pattern: How a Store Manager is Structured

Every store manager lives in `src/backend/storeManagers/<name>/` and is composed of five files:

| File | Role |
|------|------|
| `user.ts` | Static auth class — login, logout, getCredentials, isLoggedIn, getUserDetails |
| `library.ts` | Implements `LibraryManager` interface — owns the game catalog |
| `games.ts` | Implements `Game` interface — owns per-game operations |
| `electronStores.ts` | electron-store configurations scoped to this store |
| `constants.ts` | Paths, base URLs, config directory paths |

The registry in `src/backend/storeManagers/index.ts` maps each store to a `LibraryManager` instance:

```typescript
export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(),
  gog: new GOGLibraryManager(),
  legendary: new LegendaryLibraryManager(),
  nile: new NileLibraryManager(),
  zoom: new ZoomLibraryManager()
} satisfies Record<Runner, LibraryManager>
```

The TypeScript constraint `satisfies Record<Runner, LibraryManager>` means that adding `steam` here will fail to compile until `Runner` includes `'steam'` and a valid `SteamLibraryManager` class exists. This is a useful correctness gate.

---

## Interfaces Steam Must Implement

### LibraryManager (required — `src/common/types/game_manager.ts`)

```typescript
interface LibraryManager {
  init(): Promise<void>
  getGame(id: string): Game
  refresh(): Promise<ExecResult | null>
  getGameInfo(appName: string, forceReload?: boolean): GameInfo | undefined
  getInstallInfo(appName, platform, options): Promise<InstallInfo | undefined>
  listUpdateableGames(): Promise<string[]>
  changeGameInstallPath(appName: string, newPath: string): Promise<void>
  changeVersionPinnedStatus(appName: string, status: boolean): void
  installState(appName: string, state: boolean): void
  getLaunchOptions(appName: string): LaunchOption[] | Promise<LaunchOption[]>
}
```

`init()` is called at startup via `initStoreManagers()`. `refresh()` is called on demand via the `refreshLibrary` IPC handler.

### Game (required — `src/common/types/game_manager.ts`)

```typescript
interface Game {
  getSettings(): Promise<GameSettings>
  getGameInfo(): GameInfo
  getExtraInfo(): Promise<ExtraInfo>
  importGame(path: string, platform: InstallPlatform): Promise<ExecResult>
  onInstallOrUpdateOutput(action, data, totalDownloadSize): void
  install(args: InstallArgs): Promise<InstallResult>
  isNative(): boolean
  addShortcuts(fromMenu?: boolean): Promise<void>
  removeShortcuts(): Promise<void>
  launch(logWriter, launchArguments?, args?, skipVersionCheck?): Promise<boolean>
  moveInstall(newInstallPath: string): Promise<InstallResult>
  repair(): Promise<ExecResult>
  syncSaves(arg, path, gogSaves?): Promise<string>
  uninstall(args: RemoveArgs): Promise<ExecResult>
  update(updateOverwrites?): Promise<InstallResult>
  forceUninstall(): Promise<void>
  stop(stopWine?: boolean): Promise<void>
  isGameAvailable(): Promise<boolean>
  getAchievements?(lang: string): Promise<GOGAchievement[]>  // optional
}
```

For Steam, several of these are no-ops or thin wrappers:
- `install` — delegates to Steam client via `steam://install/<appid>`
- `update` — delegates similarly
- `repair` — no equivalent; stub returning done
- `syncSaves` — Steam Cloud handles this natively; stub
- `importGame` — only relevant for non-Steam-installed games; may stub

---

## Component Boundaries

```
Frontend (Renderer)                 Backend (Main Process)
──────────────────────────────────────────────────────────

Login screen                        main.ts
  └─ Runner component                 ├─ addHandler('authSteam', ...)
  └─ SteamLogo                        ├─ addListener('logoutSteam', ...)
                                      └─ addHandler('getSteamUserInfo', ...)
WebView screen
  └─ handles /loginweb/steam        SteamUser (user.ts)
  └─ captures auth token              ├─ login(token)
  └─ calls window.api.authSteam()     ├─ logout()
                                      ├─ getCredentials()
GlobalState (class component)         └─ isLoggedIn()
  ├─ steamLogin()
  ├─ steamLogout()                  SteamLibraryManager (library.ts)
  └─ steam: { library, username }     ├─ init()
                                      ├─ refresh()  ←── libraryManagerMap
ContextProvider                       ├─ getGame(id)
  └─ exposes steam context            └─ getGameInfo(appName)

Library screen                      SteamGame (games.ts)
  └─ makeLibrary() includes            ├─ launch()
     steam.library                     ├─ install()
                                        └─ uninstall()

frontend/helpers/electronStores.ts  storeManagers/index.ts
  ├─ steamLibraryStore                └─ libraryManagerMap['steam']
  ├─ steamInstalledGamesStore
  └─ steamConfigStore
```

**Boundary rule:** Nothing in the frontend imports from `src/backend/` directly. All cross-process calls go through `window.api.*` (IPC), which is typed by `src/common/types/ipc.ts`.

---

## Data Flow

### Authentication Flow

```
User clicks "Steam Login"
  → Login screen navigates to /loginweb/steam
  → WebView loads Steam auth URL
  → User authenticates in embedded browser
  → WebView fires dom-ready / did-navigate
  → WebView extracts token from redirect URL
  → window.api.authSteam(token)          [IPC invoke]
  → backend main.ts: authSteam handler
  → SteamUser.login(token)
  → saves credentials to electronStores
  → returns { status: 'done', data: SteamUserData }
  → GlobalState.steamLogin() updates state
  → handleSuccessfulLogin('steam')
  → refreshLibrary({ runInBackground: false, library: 'steam' })
  → window.api.refreshLibrary('steam')   [IPC invoke]
  → libraryManagerMap['steam'].refresh()
  → SteamLibraryManager fetches library
  → sendFrontendMessage('refreshLibrary')
  → GlobalState.refresh() reloads steam.library from electronStores
  → Library screen re-renders with Steam games
```

### Library Read Flow

```
GlobalState.refresh()
  → steamLibraryStore.get('games', [])   [electron-store, renderer side]
  → applyGameOverrides(games)
  → setState({ steam: { library, username } })
  → Library screen makeLibrary() spreads steam.library
```

The key point: `electronStores` are read in the renderer via `frontend/helpers/electronStores.ts` CacheStore wrappers. The backend writes to the same stores after `refresh()`. This is the existing pattern for all stores — no additional IPC needed for library reads after the initial sync.

### Launch Flow

```
User clicks Play
  → window.api.launch({ appName, runner: 'steam', ... })
  → launchEventCallback in main.ts
  → libraryManagerMap['steam'].getGame(appName).launch(...)
  → SteamGame.launch()
  → spawn: steam://rungameid/<appid>
     OR exec: 'steam -applaunch <appid>'
```

Steam games always launch via the Steam client. `SteamGame.launch()` does not invoke a runner binary — it opens a Steam protocol URL or calls the steam binary, then returns.

---

## Type Changes Required

### `src/common/types.ts`

```typescript
// Before:
export type Runner = 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom'

// After:
export type Runner = 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom' | 'steam'
```

`GameInfo.runner` on line 183 is typed as the same literal union inline — must also be extended:

```typescript
// Before:
runner: 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom'

// After:
runner: Runner  // or add 'steam' to the inline union
```

### `src/common/types/steam.ts` (new file)

Analogous to `src/common/types/gog.ts` / `src/common/types/zoom.ts`. Contains:
- `SteamCredentials` — access token or session cookie fields
- `SteamUserData` — persona_name, steamid, avatar_url
- `SteamInstallInfo` — disk size, install path
- `SteamGameInfo` — Steam API game object before normalization

### `src/common/types/ipc.ts`

Add to `AsyncIPCFunctions`:
```typescript
authSteam: (token: string) => Promise<{ status: 'done' | 'error', data?: SteamUserData }>
getSteamUserInfo: () => Promise<SteamUserData | undefined>
logoutSteam: () => Promise<void>
```

### `src/backend/logger/constants.ts`

```typescript
const LogPrefix = {
  // ...existing...
  Steam: 'Steam'
}

const RunnerToLogPrefixMap: Record<Runner, LogPrefix> = {
  // ...existing...
  steam: LogPrefix.Steam
}
```

### `src/frontend/types.ts`

Add to `ContextType`:
```typescript
steam: {
  library: GameInfo[]
  username?: string
  login: (token: string) => Promise<string>
  logout: () => Promise<void>
}
```

---

## Files to Create (`src/backend/storeManagers/steam/`)

| File | Contents |
|------|----------|
| `constants.ts` | steamConfigPath, steamUserDataPath, base API URL (api.steampowered.com), app data directory |
| `electronStores.ts` | `libraryStore`, `installedGamesStore`, `configStore` — same structure as zoom/gog |
| `user.ts` | `SteamUser` static class — login, logout, getCredentials, isLoggedIn, getUserDetails |
| `library.ts` | `SteamLibraryManager implements LibraryManager` — refresh fetches IGetOwnedGames, converts to GameInfo |
| `games.ts` | `SteamGame implements Game` — launch opens steam:// URL, install defers to Steam client |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/common/types.ts` | Add `'steam'` to `Runner` and `GameInfo.runner` |
| `src/common/types/ipc.ts` | Add `authSteam`, `logoutSteam`, `getSteamUserInfo` |
| `src/backend/logger/constants.ts` | Add `Steam` to `LogPrefix` and `RunnerToLogPrefixMap` |
| `src/backend/storeManagers/index.ts` | Add `steam: new SteamLibraryManager()` to `libraryManagerMap` |
| `src/backend/main.ts` | Register `authSteam`, `logoutSteam`, `getSteamUserInfo` handlers |
| `src/frontend/types.ts` | Add `steam` to `ContextType` |
| `src/frontend/state/ContextProvider.tsx` | Add `steam` initial context value |
| `src/frontend/state/GlobalState.tsx` | Add `steamLogin`, `steamLogout`, `loadSteamLibrary`, `steam` state |
| `src/frontend/helpers/electronStores.ts` | Add `steamLibraryStore`, `steamInstalledGamesStore`, `steamConfigStore` |
| `src/frontend/screens/Login/index.tsx` | Add Steam `Runner` component, add `steamLoginPath` export |
| `src/frontend/screens/WebView/index.tsx` | Add `/loginweb/steam` URL entry, handle `runner === 'steam'` auth callback |
| `src/frontend/screens/Library/index.tsx` | Add `steam.library` to `makeLibrary()`, add `showSteam` condition |

---

## Suggested Build Order

Dependencies between components determine this order. Each step must compile and pass TypeScript before the next step can reference its types.

### Step 1 — Type Foundation

**Files:** `src/common/types.ts`, `src/common/types/steam.ts`, `src/common/types/ipc.ts`

Expand `Runner` and `GameInfo.runner` first. Everything else depends on the `Runner` type. Define `SteamCredentials`, `SteamUserData` in the new types file. Add IPC function signatures.

**Why first:** `satisfies Record<Runner, LibraryManager>` in `index.ts` will fail until `Runner` includes `'steam'`. Frontend types and `RunnerToLogPrefixMap` depend on `Runner`. Start with types to get compile-time correctness gating early.

### Step 2 — Backend Auth Layer

**Files:** `steam/constants.ts`, `steam/electronStores.ts`, `steam/user.ts`

`SteamUser` class with `login`, `logout`, `getCredentials`, `isLoggedIn`. This is stateless relative to the library — it only manages credentials storage. The `electronStores.ts` here must exist before `library.ts` can import it.

**Dependency:** Types from step 1.

### Step 3 — Backend Library Manager

**Files:** `steam/library.ts`

`SteamLibraryManager implements LibraryManager`. Fetches `IGetOwnedGames` from Steam Web API. Converts Steam game objects to `GameInfo`. Manages the in-memory `Map<string, GameInfo>` and the persistent `libraryStore`.

**Dependency:** `SteamUser.getCredentials()` from step 2, `GameInfo` type from step 1.

Note: `getInstallInfo` is the most complex method in other stores. For Steam, disk size and install state can be read from the Steam client's `appmanifest_*.acf` files in the steamapps directory, or approximated from the Steam API's `size_on_disk` field. Stub this first, refine later.

### Step 4 — Backend Game Class

**Files:** `steam/games.ts`

`SteamGame implements Game`. The critical methods for MVP are `launch`, `getGameInfo`, `getSettings`, `isNative`, `isGameAvailable`. Stub the rest.

Launch strategy: `steam://rungameid/<appid>` opened via Electron's `shell.openExternal()`. This requires Steam to be installed — `isGameAvailable()` should verify this.

**Dependency:** `SteamLibraryManager.getGameInfo()` from step 3.

### Step 5 — Registry and Logger

**Files:** `storeManagers/index.ts`, `backend/logger/constants.ts`

Register `steam: new SteamLibraryManager()` in `libraryManagerMap`. Add `Steam` to `LogPrefix` and `RunnerToLogPrefixMap`.

**Why after game class:** `libraryManagerMap` entry requires both `LibraryManager` and (transitively) `Game` to exist. The TypeScript `satisfies` constraint will validate the full implementation.

### Step 6 — IPC Handler Wiring

**File:** `src/backend/main.ts`

```typescript
addHandler('authSteam', async (event, token) => SteamUser.login(token))
addListener('logoutSteam', () => SteamUser.logout())
addHandler('getSteamUserInfo', async () => SteamUser.getUserDetails())
```

**Dependency:** `SteamUser` from step 2. IPC types from step 1.

### Step 7 — Frontend Electron Stores

**File:** `src/frontend/helpers/electronStores.ts`

Add `steamLibraryStore`, `steamInstalledGamesStore`, `steamConfigStore`. These are renderer-side wrappers over the same electron-store files the backend writes. Required before GlobalState can load Steam library data.

### Step 8 — Frontend State Layer

**Files:** `src/frontend/types.ts`, `src/frontend/state/ContextProvider.tsx`, `src/frontend/state/GlobalState.tsx`

Add `steam` to `ContextType`. Add `steamLogin`/`steamLogout`/`loadSteamLibrary` to `GlobalState`. The `loadSteamLibrary` method reads from `steamLibraryStore` (step 7). The `steamLogin` method calls `window.api.authSteam(token)` (step 6).

**Dependency:** Steps 6 and 7.

### Step 9 — Frontend Login Screen

**Files:** `src/frontend/screens/Login/index.tsx`, `src/frontend/screens/WebView/index.tsx`

Add Steam `Runner` component to the login page. Export `steamLoginPath = '/loginweb/steam'`. In `WebView/index.tsx`, add the Steam login URL to the `urls` map and handle `runner === 'steam'` in the `dom-ready` / `did-navigate` listener to extract the auth token and call `steam.login(token)`.

**Auth approach note:** The exact auth URL and token extraction depend on the Steam auth implementation chosen (see Pitfalls). The WebView intercept pattern is the same regardless — it is the URL and redirect shape that varies.

**Dependency:** Step 8 (needs `steam` in ContextProvider to be available via `useContext`).

### Step 10 — Library Screen Integration

**File:** `src/frontend/screens/Library/index.tsx`

Add `steam` to `makeLibrary()`:
```typescript
const showSteam = steam.username && displayedStores.includes('steam')
const steamLibrary = showSteam ? steam.library : []
return [...sideloadedApps, ...epicLibrary, ...gogLibrary, ...amazonLibrary, ...zoomLibrary, ...steamLibrary]
```

Also add to the `displayedStores` filter logic and the store filter UI (Settings screen filter checkboxes).

**Dependency:** Step 8 (steam state available in context).

---

## Zoom as the Implementation Reference

Zoom is the correct reference implementation for Steam, not GOG or Epic. Reasons:

1. **No CLI binary.** GOG wraps `gogdl`, Epic wraps `legendary`, Amazon wraps `nile` — all external Python/Rust binaries with their own auth flow. Zoom (and Steam) authenticate via HTTP/WebView and call APIs directly with axios.
2. **Most recently added.** Zoom was added after GOG/Epic/Amazon and represents the cleanest expression of the pattern.
3. **Similar auth shape.** Zoom captures a token from a WebView redirect; Steam OAuth or session token capture follows the same flow.
4. **No runner binary means no `runRunnerCommand`.** Zoom's `library.ts` never calls `runRunnerCommand`. `SteamLibraryManager` won't either — it calls Steam Web API directly.

The difference: Steam launch requires the Steam client, not a download/install performed by Heroic itself. This makes `SteamGame.install()` a protocol dispatch (`steam://install/<appid>`) rather than a download operation. The download manager is not involved for Steam installs.

---

## Scalability Considerations

| Concern | Implication for Steam |
|---------|----------------------|
| Library size | Steam users can own thousands of games. `Map<string, GameInfo>` is fine but `refresh()` must be fast. Use the Steam Web API's `IPlayerService/GetOwnedGames` with `include_appinfo=1` — one HTTP call returns everything. |
| App name uniqueness | GOG/Epic use string IDs, Steam uses numeric appids. The `app_name` field in `GameInfo` is a string — use `String(appid)` (e.g. `'570'` for Dota 2). No collision risk with other stores since they use non-numeric IDs. |
| Artwork | Steam CDN provides cover art at `https://cdn.akamai.steamstatic.com/steam/apps/<appid>/library_600x900.jpg`. This is the `art_square` field. The existing steamgrid integration (already in Heroic) can supplement this. |
| Install detection | Steam installs are tracked in `steamapps/appmanifest_<appid>.acf` files. Scanning these on startup gives installed status without calling the API. |

---

## Sources

All findings from direct source code inspection:
- `src/backend/storeManagers/index.ts` — registry and `LibraryManager` satisfies constraint
- `src/common/types/game_manager.ts` — `LibraryManager` and `Game` interfaces
- `src/common/types.ts` — `Runner`, `GameInfo`, `InstalledInfo`
- `src/common/types/ipc.ts` — IPC function signatures
- `src/backend/storeManagers/gog/user.ts` — auth pattern (token-based, OAuth code)
- `src/backend/storeManagers/gog/library.ts` — `LibraryManager` implementation reference
- `src/backend/storeManagers/zoom/user.ts` — closest reference (no CLI binary)
- `src/backend/storeManagers/zoom/library.ts` — closest reference (direct API)
- `src/backend/main.ts` — IPC handler registration pattern, `authGOG`, `authZoom`
- `src/backend/logger/constants.ts` — `LogPrefix`, `RunnerToLogPrefixMap`
- `src/frontend/screens/Login/index.tsx` — Runner components, per-store auth state
- `src/frontend/screens/WebView/index.tsx` — login URL map, auth callback interception
- `src/frontend/state/GlobalState.tsx` — per-store state shape, login/logout methods
- `src/frontend/state/ContextProvider.tsx` — initial context values
- `src/frontend/types.ts` — `ContextType` interface
- `src/frontend/helpers/electronStores.ts` — store-specific electron-store instances
- `src/frontend/screens/Library/index.tsx` — `makeLibrary()`, per-store filtering
