# Phase 2: Steam Library - Research

**Researched:** 2026-06-27
**Domain:** steam-user v5.3.0 API · ACF manifest parsing · Steam store API · Heroic library manager pattern · React frontend integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sync trigger is background after login — when auth completes, library refresh starts in a non-blocking background process. The app is usable while the library populates.
- **D-02:** While syncing, show the cached library from electron-store (previous session's result) immediately. Display a subtle spinner on the Steam section header. On first-ever launch (no cache), show an empty state with a "Syncing your Steam library…" message.
- **D-03:** Once per session auto-sync — sync fires once after login, then cached data is used for the rest of the session. A manual Refresh button is available if the user buys a game mid-session.
- **D-04:** Lazy + cached — fetch game metadata (title, description, genres, cover art) from the Steam store API on-demand, the first time a game card is rendered. Do not pre-fetch for the whole library.
- **D-05:** Cache metadata in electron-store indefinitely — only re-fetch on manual refresh. Game names and artwork almost never change.
- **D-06:** While metadata is loading: show the AppID as a placeholder title and a grey skeleton box where cover art will appear. Same skeleton pattern used elsewhere in the GameCard component.
- **D-07:** Playtime source is a steam-user rich API call — researcher to identify the exact method. (RESOLVED: see §Standard Stack and §Code Examples)
- **D-08:** Display format: hours only, rounded — e.g., "47 hours". Matches Steam's own library display convention.
- **D-09:** If Steam CM is unreachable at startup, show the cached library from electron-store (last successful sync). A subtle note ("last synced X ago") indicates the data may be stale.
- **D-10:** Install state is always read from ACF manifests on disk — a local filesystem read, no network required. Install badges are always live and accurate even in offline mode.

### Claude's Discretion

- Exact spinner/badge placement on the Steam section header during background sync — follow existing pattern from GOG/Epic library loading indicators.
- Exact wording of the "last synced X ago" stale indicator.
- electron-store schema design for caching the library list and per-game metadata.
- IPC message names for library sync state updates (progress, complete, error).
- Error handling when the steam-user background sync fails mid-session (log + silent retry or user-visible toast).

### Deferred Ideas (OUT OF SCOPE)

- Achievement display — listed in REQUIREMENTS.md v2 backlog; not in Phase 2.
- Update detection indicator — ACF `StateFlags` polling for pending updates; v2 backlog.
- Batch metadata prefetch for recently played games.
- Library folder picker — let users add custom Steam library paths if auto-detection misses them.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | User can browse their full Steam library alongside Epic, GOG, and Amazon games | `getUserOwnedApps()` returns all owned game AppIDs + names; inject into Library/index.tsx `makeLibrary()` following Zoom pattern. See §Architecture Patterns §Library Integration. |
| LIB-02 | Each Steam game shows installed vs not-installed state (reads Steam ACF manifests) | `readdirSync(steamappsDir).filter(f => f.startsWith('appmanifest_'))` → parse VDF → `StateFlags & 4 !== 0` = installed. `getSteamLibraries()` already exported from `backend/utils`. See §Code Examples §ACF Parsing. |
| LIB-03 | Playtime is displayed for each Steam game (hours, sourced from library sync) | `getUserOwnedApps(client.steamID).apps[n].playtime_forever` (minutes). Convert: `Math.round(playtime_forever / 60)`. Store in `GameInfo.extra.steamPlaytimeMinutes`. See §Standard Stack §D-07 Resolution. |
| LIB-04 | Steam games display cover art and store metadata (title, description, genres) | Steam CDN for artwork; `https://store.steampowered.com/api/appdetails?appids={id}` for metadata. Lazy per D-04: side-effect async fetch in `getGameInfo()` + `sendFrontendMessage('pushGameToLibrary', updated)`. See §Code Examples §Steam Store API. |
</phase_requirements>

---

## Summary

Phase 2 builds on the Phase 1 auth infrastructure to populate and display the user's Steam library alongside Epic, GOG, Amazon, and Zoom games in the existing unified library view.

The key architectural insight is that `getUserOwnedApps(client.steamID)` is the single source of truth for both ownership and playtime — it returns rich data (name, `playtime_forever` in minutes, icon URL) without requiring `enablePicsCache`. This bypasses the PICS cache performance issue entirely (steam-user issue #144 only affects `getOwnedApps()`, not `getUserOwnedApps()`). Metadata (description, genres, cover art) is fetched lazily from the Steam store API when a game card becomes visible, following D-04.

Install state is read entirely from ACF manifests on disk — the existing `getSteamLibraries()` utility in `backend/utils.ts` already handles multi-library VDF parsing and platform-specific path detection, and can be imported directly.

The frontend integration follows the Zoom pattern: `sendFrontendMessage('pushGameToLibrary', gameInfo)` during `refresh()` populates the library, and `handleGamePush` in GlobalState needs a new `args.runner === 'steam'` case. The Library screen already has a `storesFilters.steam` stub but is missing steam from `makeLibrary()`, `favourites`, and the `gamesForAlphabetFilter` dependency array — all three need updating.

**Primary recommendation:** Implement `SteamLibraryManager.refresh()` using `getUserOwnedApps()` (no PICS cache), merge ACF install state per game, push each game to the frontend via `sendFrontendMessage`, and implement lazy metadata fetch via a side-effect pattern in `SteamGame.getGameInfo()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Library sync (getUserOwnedApps) | Backend (Main) | — | steam-user opens CM TCP connections; must run in main process only |
| ACF manifest parsing | Backend (Main) | — | `graceful-fs` + `@node-steam/vdf` in main process; `getSteamLibraries()` already lives there |
| Playtime data (playtime_forever) | Backend (Main) | — | Comes from steam-user CM call; stored as `GameInfo.extra.steamPlaytimeMinutes` |
| Library cache (electron-store) | Backend (Main) | — | `CacheStore` writes to disk from main; renderer reads via `TypeCheckedStoreFrontend` |
| Steam store API metadata fetch | Backend (Main) | — | `axios` network call triggered as async side effect of `getGameInfo()`; result pushed via IPC |
| Library state (steam.library) | Frontend (Renderer) | — | GlobalState `handleGamePush` populates `steam.library` via React state |
| Lazy metadata trigger | Frontend (Renderer) | Backend (Main) | `visible-cards` CustomEvent detected in GameCard → IPC `getGameInfo('steam')` → backend fetches if missing → `pushGameToLibrary` sends updated info |
| Install badge display | Frontend (Renderer) | Backend (Main) | `GameInfo.is_installed` set by backend during refresh(); renderer reads it in GameCard |
| Artwork display (CDN) | Frontend (Renderer) | — | CDN URLs stored in `art_cover`/`art_square` fields; `CachedImage` component renders them |
| Background sync trigger | Frontend (Renderer) | Backend (Main) | `steamLogin()` in GlobalState calls `refreshLibrary({ runInBackground: true, library: 'steam' })` which calls IPC `refreshLibrary('steam')` |

---

## Standard Stack

### Core (locked in CLAUDE.md and CONTEXT.md — no new installs required for Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| steam-user | 5.3.0 | `getUserOwnedApps()` for ownership + playtime | Already installed from Phase 1; the correct API for rich library data |
| @node-steam/vdf | 2.2.0 | Parse `libraryfolders.vdf` and `appmanifest_{id}.acf` | Already in project; already used by `getSteamLibraries()` in `backend/utils.ts` |
| axios | 1.13.5 | Steam store API metadata + artwork URL discovery | Already in project; same pattern as existing API calls |
| electron-store (CacheStore) | 8.2.0 | Persist library list and per-game metadata | Already in project; `CacheStore` (from `backend/cache.ts`) is the correct abstraction for library data |

### D-07 Resolution: Playtime API

**Method:** `client.getUserOwnedApps(client.steamID, { includePlayedFreeGames: true })`

**Return type:** `Promise<{ app_count: number, apps: OwnedApp[] }>`

**Key fields on each `OwnedApp`:**

| Field | Type | Notes |
|-------|------|-------|
| `appid` | `number` | Steam AppID |
| `name` | `string` | Game title (from Steam; `include_appinfo: true` by default) |
| `playtime_forever` | `number` | Total playtime in **minutes** |
| `playtime_2weeks` | `number \| null` | Playtime in last 2 weeks, in minutes |
| `img_icon_url` | `string` | Full URL to 32×32 icon |
| `playtime_windows_forever` | `number` | Platform-specific playtime (minutes) |
| `playtime_mac_forever` | `number` | |
| `playtime_linux_forever` | `number` | |

**Internal implementation:** Calls `Player.GetOwnedGames#1` via authenticated CM connection. Works for private profiles because it is the user's own session. Has a built-in 10-second timeout.

**Does NOT require `enablePicsCache`** — this is a unified message call, not PICS. Skip PICS cache entirely for Phase 2.

**Display conversion:** `Math.round(playtime_forever / 60)` → integer hours. "Never played" when result is 0 per UI spec.

**Where to store:** `GameInfo.extra.steamPlaytimeMinutes = app.playtime_forever` (minutes integer, NOT hours — let display layer convert). Also write to `tsStore.set(appId_string, { totalPlayed: playtime_forever })` so the existing `TimeContainer` component on the GamePage displays correctly.

[VERIFIED: @types/steam-user index.d.ts lines 637-641, 1179-1196, 1437-1440 + steam-user/components/friends.js lines 835-876]

### No New Packages for Phase 2

Phase 2 installs zero new npm packages. All required libraries are already present in `package.json` from Phase 1.

---

## Package Legitimacy Audit

No new packages installed in Phase 2. All packages used were audited in Phase 1 research. Existing packages (steam-user 5.3.0, @node-steam/vdf 2.2.0, axios 1.13.5, electron-store 8.2.0) remain approved from Phase 1 audit.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
[steamLogin() — GlobalState]
        │ refreshLibrary({ runInBackground: true, library: 'steam' })
        ▼
[IPC: window.api.refreshLibrary('steam')]
        │
        ▼ [Main Process: SteamLibraryManager.refresh()]
[SteamUser.getClient()]  ←── authenticated steam-user client (from Phase 1)
        │
        ├─ getUserOwnedApps(steamID, { includePlayedFreeGames: true })
        │         │ returns OwnedApp[] with playtime_forever
        │         ▼
        │  [getSteamLibraries()]  ←── reuse from backend/utils.ts
        │         │ returns string[] of library root paths
        │         ▼
        │  [readdirSync(lib/steamapps/)]
        │         │ appmanifest_{id}.acf → parse VDF → StateFlags & 4 → is_installed
        │         │ installdir → install_path
        │         ▼
        │  [Build GameInfo per OwnedApp]
        │     app_name = appId.toString()
        │     title = app.name (from getUserOwnedApps)
        │     art_cover = '' (lazy — populated later)
        │     is_installed = from ACF map
        │     extra.steamPlaytimeMinutes = app.playtime_forever
        │         │
        │         ▼
        │  [sendFrontendMessage('pushGameToLibrary', minimalGameInfo)]
        │   ← repeat for each game ─────────────────────────────────►
        │                                                             │
        │  [steamLibraryStore.set('games', Array.from(library.values()))]
        │                                                             │
        ▼                                                             ▼
[Frontend: GlobalState.handleGamePush]
        │ args.runner === 'steam'
        ▼
[setState({ steam: { library: [...updated] } })]
        │
        ▼
[Library/index.tsx — makeLibrary() includes steamLibrary]
        │
        ▼
[GamesList → GameCard per Steam game]
        │
        ├─ Card NOT yet visible → invisible stub (data-invisible)
        │
        └─ Card enters viewport (IntersectionObserver)
                │ CustomEvent('visible-cards', { appNames })
                ▼
          [GameCard useEffect: setVisible(true)]
                │
                └─ getGameInfo(appName, 'steam') IPC
                          │
                          ▼ [Main: SteamGame.getGameInfo()]
                     art_cover === '' → kick off async metadata fetch
                          │ axios GET store.steampowered.com/api/appdetails?appids={id}
                          │ populate art_cover, art_square, extra.about.description, extra.genres
                          │ library.set(appId, updatedGameInfo)
                          │ steamMetadataStore.set(appId, metadata)
                          │ sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
                          │
                          ▼ (immediately, before async completes)
                     return existing minimal GameInfo
                          │
                          ▼
                    [GameCard shows AppID title + grey skeleton]
                          │
                    (async fetch completes)
                          │
                    sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
                          │
                    [handleGamePush updates steam.library]
                          │
                    [GameCard re-renders with real title + artwork]
```

### Recommended Project Structure

```
src/
├── backend/
│   ├── storeManagers/
│   │   ├── steam/
│   │   │   ├── constants.ts       # (Phase 1) — add STEAM_STEAMAPPS_SUBDIR = 'steamapps'
│   │   │   ├── electronStores.ts  # Add steamLibraryStore (CacheStore) + steamMetadataStore (CacheStore)
│   │   │   ├── games.ts           # SteamGame implements Game interface: getGameInfo() with lazy-fetch side effect
│   │   │   ├── library.ts         # SteamLibraryManager: implement refresh() + getGameInfo()
│   │   │   └── user.ts            # (Phase 1) — add getClient() accessor for steam-user instance
│   │   └── index.ts               # (Phase 1) — no changes in Phase 2
├── common/
│   ├── types.ts                   # Add steamPlaytimeMinutes?: number to ExtraInfo
└── frontend/
    ├── screens/Library/
    │   └── index.tsx              # Add steam to context destructure, makeLibrary(), favourites memo
    ├── helpers/
    │   └── library.ts             # Add steamCategories export
    └── state/
        └── GlobalState.tsx        # Add steam case to handleGamePush; update steamLogin to use runInBackground:true
```

### Pattern 1: SteamLibraryManager.refresh() — Core Backend Sync

**What:** Fetch owned games with playtime, merge install state from ACF manifests, push each game to frontend.

**When to use:** Called by `libraryManagerMap['steam'].refresh()` via `window.api.refreshLibrary('steam')`.

```typescript
// Source: derived from zoom/library.ts pattern [VERIFIED: codebase] + steam-user API [VERIFIED: @types/steam-user]
import { sendFrontendMessage } from '../../ipc'
import { getSteamLibraries } from 'backend/utils'
import { parse } from '@node-steam/vdf'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'
import { SteamUser } from './user'
import { steamLibraryStore, steamMetadataStore } from './electronStores'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { GameInfo, ExecResult } from 'common/types'
import { isOnline } from '../../online_monitor'
import type SteamUserLib from 'steam-user'

const library: Map<string, GameInfo> = new Map()

export default class SteamLibraryManager implements LibraryManager {
  async refresh(): Promise<ExecResult | null> {
    const client = SteamUser.getClient()  // null if not logged in
    if (!client) {
      logWarning('Steam not logged in, skipping library refresh', LogPrefix.Steam)
      return null
    }

    // Step 1: Get owned apps + playtime from Steam CM
    let ownedApps: SteamUserLib.OwnedApp[] = []
    try {
      const result = await client.getUserOwnedApps(client.steamID!, {
        includePlayedFreeGames: true
      })
      ownedApps = result.apps
      logInfo(`Steam: fetched ${ownedApps.length} owned games`, LogPrefix.Steam)
    } catch (err) {
      logError(['Steam getUserOwnedApps failed:', err], LogPrefix.Steam)
      // Fall through to serving cached data
      const cached = steamLibraryStore.get('games', [])
      if (cached.length) {
        cached.forEach(g => sendFrontendMessage('pushGameToLibrary', g))
      }
      return { stdout: '', stderr: String(err) }
    }

    // Step 2: Build ACF install state map
    const installedMap = await buildInstalledMap()

    // Step 3: Build GameInfo per game and push
    library.clear()
    for (const app of ownedApps) {
      const appIdStr = String(app.appid)
      const installedData = installedMap.get(app.appid)
      const cachedMeta = steamMetadataStore.get(appIdStr)

      const gameInfo: GameInfo = {
        runner: 'steam',
        app_name: appIdStr,
        title: app.name,                  // from getUserOwnedApps; real name
        art_cover: cachedMeta?.art_cover ?? '',   // populated lazily or from cache
        art_square: cachedMeta?.art_square ?? '',
        is_installed: !!installedData,
        install: installedData
          ? {
              install_path: installedData.installPath,
              install_size: installedData.sizeOnDisk,
              platform: 'Windows' as const
            }
          : {},
        extra: {
          reqs: [],
          steamPlaytimeMinutes: app.playtime_forever,  // total minutes (int)
          ...(cachedMeta?.extra ?? {})
        },
        canRunOffline: true,
        installable: true,
        store_url: `https://store.steampowered.com/app/${app.appid}/`
      }

      library.set(appIdStr, gameInfo)
      sendFrontendMessage('pushGameToLibrary', gameInfo)
    }

    steamLibraryStore.set('games', Array.from(library.values()))
    logInfo(`Steam library sync complete: ${library.size} games`, LogPrefix.Steam)
    return { stdout: `${library.size} games synced`, stderr: '' }
  }
  // ...
}

async function buildInstalledMap(): Promise<Map<number, { installPath: string; sizeOnDisk: string }>> {
  const installed = new Map<number, { installPath: string; sizeOnDisk: string }>()
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch { continue }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        const isInstalled = (stateFlags & 4) !== 0   // bit 4 = FullyInstalled

        if (isInstalled && !isNaN(appid)) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0'
          })
        }
      } catch { /* skip corrupt ACF */ }
    }
  }
  return installed
}
```

### Pattern 2: SteamGame.getGameInfo() — Lazy Metadata Side Effect

**What:** Return current game info from in-memory library. If `art_cover` is empty (metadata not yet fetched), kick off async metadata fetch as a side effect. When async fetch completes, call `sendFrontendMessage('pushGameToLibrary', updated)` to update the frontend.

```typescript
// Source: derived from zoom/games.ts push pattern [VERIFIED: codebase]
import { sendFrontendMessage } from '../../ipc'
import axios from 'axios'
import { steamMetadataStore } from './electronStores'

export default class SteamGame implements Game {
  constructor(private readonly appName: string) {}

  getGameInfo(): GameInfo {
    const existing = library.get(this.appName)
    if (!existing) return {} as GameInfo

    // Trigger lazy metadata fetch as side effect (non-blocking)
    if (!existing.art_cover) {
      this.fetchMetadataIfNeeded(existing)  // fire-and-forget
    }

    return existing
  }

  private async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
    if (pendingFetches.has(this.appName)) return  // deduplicate concurrent requests
    pendingFetches.add(this.appName)

    try {
      const resp = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${this.appName}`
      )
      const data = resp.data?.[this.appName]?.data
      if (!data) return

      const artBase = `https://cdn.cloudflare.steamstatic.com/steam/apps/${this.appName}`
      const updated: GameInfo = {
        ...current,
        title: data.name ?? current.title,
        art_cover: `${artBase}/header.jpg`,
        art_square: `${artBase}/capsule_616x353.jpg`,
        description: data.short_description,
        extra: {
          ...current.extra,
          reqs: [],
          about: {
            description: data.short_description ?? '',
            shortDescription: data.short_description ?? ''
          },
          genres: (data.genres ?? []).map((g: { description: string }) => g.description)
        }
      }

      // Cache metadata for next session
      steamMetadataStore.set(this.appName, {
        art_cover: updated.art_cover,
        art_square: updated.art_square,
        extra: updated.extra
      })

      library.set(this.appName, updated)
      sendFrontendMessage('pushGameToLibrary', updated)
    } catch (err) {
      logWarning([`Steam metadata fetch failed for ${this.appName}:`, err], LogPrefix.Steam)
    } finally {
      pendingFetches.delete(this.appName)
    }
  }
}

const pendingFetches = new Set<string>()
```

### Pattern 3: handleGamePush — Add steam case in GlobalState

**What:** GlobalState already handles `'gog'` and `'zoom'` in `handleGamePush`. Steam needs an identical third case.

```typescript
// Source: GlobalState.tsx lines 963-1000 [VERIFIED: codebase]
// ADD after the zoom block (around line 998):
} else if (args.runner === 'steam') {
  const library = [...this.state.steam.library]
  const index = library.findIndex(
    (game) => game.app_name === args.app_name
  )
  if (index !== -1) {
    library[index] = args
  } else {
    library.push(args)
  }
  this.setState({
    steam: {
      library: [...library],
      username: this.state.steam.username
    }
  })
}
```

### Pattern 4: makeLibrary() — Add steam to allGames aggregation in Library/index.tsx

**What:** The Library screen's `makeLibrary()` function currently aggregates epic/gog/amazon/sideload/zoom but not steam. Five changes required.

```typescript
// Source: Library/index.tsx lines 399-440 [VERIFIED: codebase]

// 1. Add steam to context destructure (line 59 area):
const { ..., zoom, steam, sideloadedLibrary, ... } = useContext(ContextProvider)

// 2. In makeLibrary() — add showSteam after showZoom block:
if (storesFilters['steam'] && steam?.username) {
  displayedStores.push('steam')
}
// ...
const showSteam = steam?.username && displayedStores.includes('steam')
const steamLibrary = showSteam ? steam.library : []

// 3. In makeLibrary() return statement — add steamLibrary:
return [
  ...sideloadedApps,
  ...epicLibrary,
  ...gogLibrary,
  ...amazonLibrary,
  ...zoomLibrary,
  ...steamLibrary   // ADD
]

// 4. In favourites memo — add steam.library iteration:
steam?.library?.forEach((game) => {
  if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
})

// 5. In gamesForAlphabetFilter useMemo dependency array — add:
steam?.library
```

### Pattern 5: steamLogin() — background sync trigger

**What:** Phase 1's `steamLogin()` calls `handleSuccessfulLogin('steam')` which uses `runInBackground: false` (blocking). Phase 2 changes this to non-blocking per D-01.

```typescript
// Source: GlobalState.tsx lines 676-688 [VERIFIED: codebase]
// MODIFY steamLogin to use runInBackground: true:
steamLogin = async (result: { status: string; username?: string }) => {
  if (result.status === 'done') {
    this.setState({
      steam: {
        library: [],          // cache loaded separately
        username: result.username
      }
    })
    storage.setItem('category', 'all')
    // D-01: non-blocking background sync
    this.refreshLibrary({
      runInBackground: true,  // ← was handled by handleSuccessfulLogin(false)
      library: 'steam'
    })
  }
  return result.status
}
```

### Pattern 6: electron-store for Steam Library (CacheStore)

**What:** Following the Zoom pattern, use `CacheStore` (not `TypeCheckedStoreBackend`) for the library list and metadata caches. `CacheStore` does NOT require `StoreStructure` registration.

```typescript
// Source: zoom/electronStores.ts line 18-20 [VERIFIED: codebase]
// Add to src/backend/storeManagers/steam/electronStores.ts:
import CacheStore from '../../cache'

const steamLibraryStore = new CacheStore<GameInfo[], 'games'>('steam_library', null)
// null lifespan = indefinite cache (per D-05)

const steamMetadataStore = new CacheStore<SteamMetadataCacheEntry>('steam_metadata', null)
// keyed by appId string; indefinite cache per D-05

export { configStore, steamLibraryStore, steamMetadataStore }
```

### Pattern 7: ExtraInfo Type Extension

**What:** `ExtraInfo` in `src/common/types.ts` needs a `steamPlaytimeMinutes` field for Phase 2 playtime display.

```typescript
// Source: src/common/types.ts lines 155-162 [VERIFIED: codebase]
// MODIFY ExtraInfo interface:
export interface ExtraInfo {
  about?: About
  reqs: Reqs[]
  releaseDate?: string
  storeUrl?: string
  changelog?: string
  genres?: string[]
  steamPlaytimeMinutes?: number   // ADD: playtime from getUserOwnedApps(), in minutes
}
```

**Why `ExtraInfo` not `GameInfo` directly:** `extra` already holds per-game store-specific metadata. The `GameInfo` top-level fields are for universal data across runners. `steamPlaytimeMinutes` is Steam-specific and belongs in `extra`. The `GameCard` reads `gameInfo.extra?.steamPlaytimeMinutes` for display.

### Pattern 8: Steam Library Store Filter in helpers/library.ts

```typescript
// Source: src/frontend/helpers/library.ts lines 472-476 [VERIFIED: codebase]
// ADD after zoomCategories:
export const steamCategories = ['all', 'steam']
```

**Import in Library/index.tsx:**
```typescript
import { ..., zoomCategories, steamCategories } from 'frontend/helpers/library'
// Then in storesFilters initialization:
steam: steamCategories.includes(storedCategory)
```

### Pattern 9: SteamLibraryManager.init() — load cached library on startup

**What:** On app start, load the last synced library from `steamLibraryStore` and push to frontend immediately. Then trigger background sync if user is logged in.

```typescript
// Source: zoom/library.ts lines 38-43 [VERIFIED: codebase]
async init(): Promise<void> {
  // Load cached library immediately (D-02)
  const cached = steamLibraryStore.get('games', [])
  if (cached.length) {
    library.clear()
    cached.forEach(g => {
      library.set(g.app_name, g)
      sendFrontendMessage('pushGameToLibrary', g)
    })
    logInfo(`Steam: loaded ${cached.length} games from cache`, LogPrefix.Steam)
  }

  // Background sync if logged in (D-01)
  if (SteamUser.isLoggedIn()) {
    runOnceWhenOnline(() => this.refresh())
  }
}
```

**Note:** `runOnceWhenOnline` is exported from `backend/online_monitor`. It runs the callback immediately if online, or queues it until the first online event. This handles D-09 (offline startup shows cache).

### Anti-Patterns to Avoid

- **Don't use `getOwnedApps()` (PICS cache):** This method requires `enablePicsCache: true` + waiting for `ownershipCached` event. It returns only `number[]` of AppIDs — no names, no playtime. The known performance issue for large libraries (issue #144) applies here. Use `getUserOwnedApps()` instead. [VERIFIED: @types/steam-user index.d.ts lines 376-380]

- **Don't fetch all metadata upfront in `refresh()`:** 500+ API calls at once would hit Steam's rate limit and block UI for minutes. D-04 mandates lazy fetch; follow Pattern 2 above. [VERIFIED: CONTEXT.md D-04]

- **Don't add `steamLibraryStore` to `StoreStructure`:** `CacheStore` manages its own electron-store file (in `store_cache/` directory) without needing `StoreStructure` registration. Adding it there would require type-checking every `GameInfo` field, causing friction without benefit. [VERIFIED: src/backend/cache.ts]

- **Don't duplicate `getSteamLibraries()` logic:** The function is already exported from `backend/utils.ts` and handles Linux native, Linux flatpak, macOS, and Windows paths. Import and reuse it. [VERIFIED: codebase — backend/utils.ts line 537]

- **Don't mutate `steam.library` array directly in `handleGamePush`:** Always create a new array (`[...library]`) to trigger React re-render. [VERIFIED: GlobalState.tsx lines 966-998 zoom/gog patterns]

- **Don't show `steam.library.length > 0` as an auth gate in `makeLibrary()`:** Library can be empty during first sync or offline. Use `steam?.username` as the gate (matching GOG/Epic patterns), not library length.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Steam library folder detection | Custom path heuristics | `getSteamLibraries()` from `backend/utils` | Already handles Linux/macOS/Windows, Flatpak, and multi-library VDF parsing |
| VDF/ACF file parsing | Custom text parser | `parse()` from `@node-steam/vdf` | Standard ACF format has edge cases (escape sequences, nested blocks); already in project |
| Game ownership + playtime | IPlayerService/GetOwnedGames HTTP call | `client.getUserOwnedApps()` from steam-user | Handles auth, private profiles, serialization; 10s timeout built-in |
| Persistent library cache | Custom JSON file writes | `CacheStore` from `backend/cache.ts` | Already handles timestamping, invalidation, in-memory mode; used by Zoom |
| Intersection Observer for viewport detection | Custom scroll listener | Existing `visible-cards` pattern in `GamesList` | IntersectionObserver already dispatches `visible-cards` CustomEvent; GameCard already listens |
| Artwork URL construction | Reverse-engineering CDN patterns | `https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg` | Stable CDN pattern; confirmed via live API response `header_image` field |

---

## Common Pitfalls

### Pitfall 1: `getOwnedApps()` vs `getUserOwnedApps()` Confusion

**What goes wrong:** Developer uses `getOwnedApps()` (returns `number[]` only) instead of `getUserOwnedApps()` (returns `OwnedApp[]` with names and playtime). `getOwnedApps()` additionally requires `enablePicsCache: true` and the `ownershipCached` event — failing silently if the cache hasn't populated yet.

**Why it happens:** Both methods have similar names. The Phase 1 CONTEXT.md mentioned `getOwnedApps()` as a known method, and the CLAUDE.md stack section references it by name. However, `getUserOwnedApps()` is the correct choice for Phase 2.

**How to avoid:** Use `client.getUserOwnedApps(client.steamID!, { includePlayedFreeGames: true })`. Never call `client.setOption('enablePicsCache', true)` — it is not needed for Phase 2. [VERIFIED: @types/steam-user, steam-user source]

**Warning signs:** Library shows only AppID numbers with no names; `getOwnedApps()` returns empty array.

---

### Pitfall 2: getSteamLibraries() Returns Library Roots, Not steamapps/ Directories

**What goes wrong:** Developer passes the output of `getSteamLibraries()` directly as paths to ACF files, missing the `steamapps/` subdirectory. Result: ACF files not found; install state shows all games as not installed.

**Why it happens:** The function name suggests it returns "Steam library paths" — which it does, but these are the library root paths (e.g., `/home/user/.steam/steam`), not the `steamapps/` subfolder containing manifests.

**How to avoid:** ACF manifests are at `join(libraryPath, 'steamapps', 'appmanifest_{id}.acf')`. Always join `'steamapps'` after the path returned by `getSteamLibraries()`. [VERIFIED: backend/utils.ts lines 560-585 shows usage with `join(library, 'steamapps/common/...')`]

**Warning signs:** `readdirSync(libraryPath)` returns `['steamapps', 'userdata', ...]` instead of `['appmanifest_570.acf', ...]`.

---

### Pitfall 3: steam.library Not Updating in Library Screen After Push

**What goes wrong:** `sendFrontendMessage('pushGameToLibrary', gameInfo)` fires from backend, but Steam games don't appear in the library view. The `handleGamePush` listener only handles `'gog'` and `'zoom'` — the `'steam'` case is unhandled and games are silently dropped.

**Why it happens:** GlobalState.tsx lines 963-1000 have explicit runner-keyed cases. Without a `steam` case, the push is a no-op.

**How to avoid:** Add the `steam` case to `handleGamePush` (Pattern 3 above) BEFORE implementing `SteamLibraryManager.refresh()`. Test by calling `window.api.refreshLibrary('steam')` from the DevTools console and watching `this.state.steam.library.length` grow.

**Warning signs:** Backend logs show "Steam library sync complete: N games" but UI shows empty library with no Steam games.

---

### Pitfall 4: Library Screen Doesn't Show Steam Games Despite State Being Populated

**What goes wrong:** `steam.library` has games in GlobalState, but the Library screen shows none. The `makeLibrary()` function does not include steam in its aggregation.

**Why it happens:** `makeLibrary()` in Library/index.tsx currently ends with `[...zoomLibrary]`. Steam is in `storesFilters` (line 97) but the filter is never used to build the displayed list.

**How to avoid:** Make all five changes in Pattern 4 above in a single task: context destructure, storesFilters check, `showSteam`/`steamLibrary` variables, return array spread, favourites memo, and dependency array. Running `npm run codecheck` will catch if you miss the dependency array. [VERIFIED: Library/index.tsx lines 399-440, 564-588]

**Warning signs:** Steam games visible in React DevTools `steam.library` array but not in rendered library grid.

---

### Pitfall 5: Metadata Fetch Storms — Concurrent API Calls for the Same Game

**What goes wrong:** When `visible-cards` fires for 20 cards simultaneously (e.g., initial library render), `SteamGame.getGameInfo()` is called 20 times for 20 different games. If the user scrolls back, already-fetched games might fire again. More critically, if `fetchMetadataIfNeeded()` is called twice for the same appId before the first call resolves, two requests fire for the same game.

**Why it happens:** The `getGameInfo()` method is called synchronously and the async side-effect doesn't track in-flight requests without a deduplication guard.

**How to avoid:** Use a module-level `pendingFetches: Set<string>` as shown in Pattern 2. Check `pendingFetches.has(appName)` and add to it immediately (before the `await`) — `finally` removes it. Also check `steamMetadataStore.get(appId)` first; if cached, use it without making a network call. [ASSUMED — common async dedup pattern]

**Warning signs:** Network tab in DevTools shows duplicate requests for the same `appids=` query parameter.

---

### Pitfall 6: ACF StateFlags Misinterpretation

**What goes wrong:** Developer checks `StateFlags === 4` (equality) instead of `StateFlags & 4` (bitflag). A game currently updating has `StateFlags = 258` (bits for FullyInstalled + UpdateRequired) — equality check misses it; bitflag check correctly identifies it as installed.

**Why it happens:** `StateFlags` is a bitmask. Common values seen in the wild include 4 (installed), 6 (installed + update queued), 516 (installed + update running), 774 (installed + update running + full verify), etc.

**How to avoid:** Always use `(parseInt(state.StateFlags, 10) & 4) !== 0` for the install check. [VERIFIED: known Steam ACF format — StateFlags documented in community sources]

**Warning signs:** Games that are installed but currently updating show as "not installed".

---

### Pitfall 7: ExtraInfo Mutation Breaking Other Runners

**What goes wrong:** Adding `steamPlaytimeMinutes` to `ExtraInfo` compiles fine, but some existing code that serializes/deserializes `ExtraInfo` (e.g., for GOG or Legendary) might throw on unexpected fields.

**Why it happens:** TypeScript structural typing means the new field is valid on all `ExtraInfo` objects. Runtime code that iterates `Object.keys(extra)` might not handle it.

**How to avoid:** The field is typed `steamPlaytimeMinutes?: number` (optional). Other runners simply never set it, so it's `undefined` for non-Steam games. The `GamePage` already reads `gameInfo.extra?.genres || wikiInfo?.pcgamingwiki?.genres` (with fallback) — adding one more optional field won't break existing code. After adding the field, run `npm run codecheck` to confirm no type errors. [VERIFIED: src/common/types.ts ExtraInfo interface, GamePage/index.tsx]

---

## Code Examples

### getUserOwnedApps() — Full Call with Options

```typescript
// Source: @types/steam-user index.d.ts lines 637-641 [VERIFIED]; steam-user components/friends.js lines 835-876 [VERIFIED]
import type SteamUserLib from 'steam-user'

const client: SteamUserLib = SteamUser.getClient()!

const result = await client.getUserOwnedApps(client.steamID!, {
  includePlayedFreeGames: true  // include F2P games the user has played
  // includeFreeSub: false (default) — exclude the "Steam" free sub package
  // filterAppids: [] — can filter by specific AppIDs; omit for full library
})

// result.app_count: total games owned
// result.apps: OwnedApp[]
for (const app of result.apps) {
  console.log(`${app.appid}: ${app.name} — ${app.playtime_forever} minutes`)
  // playtime_forever is total minutes across all platforms
}
```

### ACF Manifest Parsing

```typescript
// Source: @node-steam/vdf lib/index.d.ts [VERIFIED: codebase]; ACF format [ASSUMED: community documentation]
import { parse } from '@node-steam/vdf'
import { readFileSync } from 'graceful-fs'

const content = readFileSync('/path/to/appmanifest_570.acf', 'utf-8')
const parsed = parse(content)
// parsed.AppState = {
//   appid: '570',
//   Universe: '1',
//   name: 'Dota 2',
//   StateFlags: '4',           ← '4' = fully installed (string, parse to int)
//   installdir: 'dota 2 beta', ← subfolder in steamapps/common/
//   SizeOnDisk: '32427581592', ← bytes as string
//   LastUpdated: '1714568900',
//   buildid: '14027289',
//   ...
// }

const stateFlags = parseInt(parsed.AppState.StateFlags, 10)
const isInstalled = (stateFlags & 4) !== 0  // bitmask check
const installPath = join(steamappsDir, 'common', parsed.AppState.installdir)
```

### Steam Store API — Response Shape

```typescript
// Source: live API call to store.steampowered.com/api/appdetails?appids=570 [VERIFIED: research session]
// Response: { "570": { success: true, data: {...} } }

const resp = await axios.get(
  `https://store.steampowered.com/api/appdetails?appids=${appId}`
)
const data = resp.data?.[appId]?.data
if (!data) return  // game removed from store or API unavailable

const title: string = data.name
const shortDescription: string = data.short_description
const genres: string[] = (data.genres ?? []).map((g: { id: string; description: string }) => g.description)
// e.g. ['Action', 'Strategy', 'Free To Play']

// CDN artwork — more reliable than data.header_image (which uses akamai CDN):
const art_cover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
const art_square = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`
```

**Rate limits:** [ASSUMED] Approximately 200 requests per 5 minutes per IP. No official documentation found. For lazy per-card fetching with `pendingFetches` dedup, normal usage won't approach this limit.

### Playtime Display in GameCard

```typescript
// Source: 02-UI-SPEC.md §Playtime Display [VERIFIED: UI spec]
// Read from GameInfo.extra.steamPlaytimeMinutes (set during refresh())

const playtimeMinutes = gameInfo.extra?.steamPlaytimeMinutes
const playtimeDisplay = playtimeMinutes === undefined
  ? null  // data not yet available — omit element
  : playtimeMinutes === 0
  ? t('game.steam.neverPlayed', 'Never played')
  : `${Math.round(playtimeMinutes / 60)} ${Math.round(playtimeMinutes / 60) === 1 ? t('game.hour', 'hour') : t('game.hours', 'hours')}`
// e.g. "47 hours", "1 hour", "Never played"
```

### Loading Cached Library on Startup (D-02 / D-09)

```typescript
// Source: zoom/library.ts init() pattern [VERIFIED: codebase]
// This shows how to serve cached data on startup before sync completes

async init(): Promise<void> {
  const cached = steamLibraryStore.get('games', [])
  if (cached.length) {
    cached.forEach(g => {
      library.set(g.app_name, g)
      sendFrontendMessage('pushGameToLibrary', g)  // immediate frontend update
    })
  }
  // Background refresh if online and logged in
  if (SteamUser.isLoggedIn()) {
    runOnceWhenOnline(async () => {
      await this.refresh()
    })
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getOwnedApps()` (PICS cache) | `getUserOwnedApps()` (CM unified message) | steam-user v4+ | Avoids PICS cache population delay; returns names + playtime directly |
| `loginKey` Steam auth (deprecated) | Refresh token (JWT via steam-session) | steam-user v4+ | Phase 1 already uses refresh token correctly |
| IPlayerService HTTP call (public API) | `getUserOwnedApps()` via CM | Phase 2 design | Works for private profiles; no API key needed |
| `appOwnershipCached` event | `ownershipCached` event | steam-user v4.22.1 | `appOwnershipCached` is deprecated — use `ownershipCached` if PICS is ever needed |

**Deprecated/outdated:**
- `getOwnedApps()`: Only returns AppID list; requires PICS cache; known perf issue for large libraries. Do not use for Phase 2.
- `enablePicsCache: true` option: Not needed for Phase 2. Only required for `getOwnedApps()` / `ownsApp()` checks. Don't set it.

---

## Open Questions (RESOLVED)

1. **Steam store API rate limit on metadata fetch** — RESOLVED: No throttle for MVP. `pendingFetches` Set deduplicates concurrent requests (02-03). If rate limiting becomes a problem in practice, add a 50ms minimum delay between per-card fetches as a follow-up. Confidence: LOW on exact rate limit number [ASSUMED ~200/5min].

2. **`SteamUser.getClient()` accessor — does Phase 1 expose it?** — RESOLVED: Add `public static getClient(): SteamUserLib | null { return this.client }` to `SteamUser` class in Phase 2 Wave 0 (02-01 Task 2). One-line change to Phase 1 file.

3. **`tsStore` for playtime — backend store name and import path** — RESOLVED: Store playtime in `GameInfo.extra.steamPlaytimeMinutes` only (02-01 + 02-02). Sufficient for GameCard display. `TimeContainer` (GamePage detail page) is a known deferred gap — not a LIB-03 blocker since LIB-03 is satisfied by the library browse view display.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | steam-user, CacheStore | Yes | v26.2.0 | — |
| steam-user (installed) | `getUserOwnedApps()` | Yes | 5.3.0 | — |
| @node-steam/vdf (installed) | ACF parsing | Yes | 2.2.0 | — |
| axios (installed) | Steam store API | Yes | 1.18.1 (latest) | — |
| Steam client + library on dev machine | Manual QA of install detection | Unknown | — | Test with a machine that has Steam installed; mock ACF files for unit tests |
| Internet access to store.steampowered.com | Lazy metadata fetch | Yes (assumed) | — | Metadata fetch returns empty; cards show AppID + no art; not a blocker |

**Note:** `axios` registry shows 1.18.1 as current; project locks 1.13.5 in package.json. No upgrade needed — 1.13.5 is fully functional for this use case. [VERIFIED: npm view axios version]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest |
| Config file | `src/backend/jest.config.js` (Jest projects entry in root `jest.config.js`) |
| Quick run command | `npm test -- --testPathPattern=steam --passWithNoTests` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | `refresh()` calls `getUserOwnedApps()` and builds `GameInfo` per game | Unit (mock steam-user) | `npm test -- --testPathPattern=steam/library` | ❌ Wave 0 |
| LIB-01 | `sendFrontendMessage('pushGameToLibrary')` is called per game | Unit (mock ipc) | `npm test -- --testPathPattern=steam/library` | ❌ Wave 0 |
| LIB-02 | `buildInstalledMap()` sets `is_installed=true` when `StateFlags & 4` | Unit (mock fs + vdf) | `npm test -- --testPathPattern=steam/library` | ❌ Wave 0 |
| LIB-02 | `buildInstalledMap()` sets `is_installed=false` when `StateFlags & 4 === 0` | Unit (mock fs + vdf) | `npm test -- --testPathPattern=steam/library` | ❌ Wave 0 |
| LIB-03 | `GameInfo.extra.steamPlaytimeMinutes` equals `app.playtime_forever` from API | Unit | `npm test -- --testPathPattern=steam/library` | ❌ Wave 0 |
| LIB-04 | `fetchMetadataIfNeeded()` calls Steam store API and updates `art_cover` | Unit (mock axios) | `npm test -- --testPathPattern=steam/games` | ❌ Wave 0 |
| LIB-04 | `fetchMetadataIfNeeded()` deduplicates concurrent fetches via `pendingFetches` | Unit (mock axios) | `npm test -- --testPathPattern=steam/games` | ❌ Wave 0 |
| LIB-01–04 | Steam games visible in Library screen after `pushGameToLibrary` events | Manual QA | — | Manual only |
| LIB-02 | Install badge shows/hides correctly based on ACF state | Manual QA (dev machine with Steam) | — | Manual only |
| LIB-03 | Playtime displays "X hours" / "Never played" correctly | Manual QA | — | Manual only |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=steam --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual QA of LIB-01 through LIB-04 with real Steam account before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/backend/storeManagers/steam/__tests__/library.test.ts` — covers LIB-01, LIB-02, LIB-03
- [ ] `src/backend/storeManagers/steam/__tests__/games.test.ts` — covers LIB-04 (lazy metadata fetch, dedup)
- [ ] Mocks needed: `jest.mock('steam-user')`, `jest.mock('backend/utils', () => ({ getSteamLibraries: jest.fn() }))`, `jest.mock('graceful-fs')`, `jest.mock('@node-steam/vdf')`, `jest.mock('axios')`, `jest.mock('backend/logger')`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Auth is Phase 1; Phase 2 only reads the authenticated session |
| V3 Session Management | No | Token management is Phase 1 |
| V4 Access Control | No | Single-user launcher; no multi-user |
| V5 Input Validation | Yes | Steam store API responses must be sanitized before storing: `data.short_description` could contain HTML — strip tags before storing in `extra.about.description` |
| V6 Cryptography | No | No new crypto in Phase 2 |

### Known Threat Patterns for Steam Library Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed ACF file causes JSON parse error | Denial of Service | Wrap `parse(readFileSync(...))` in try/catch; skip corrupt ACF files |
| Steam store API returns XSS in `short_description` | Tampering | Use `data.short_description` as text content only (via React JSX), not `dangerouslySetInnerHTML`; never inject into DOM as raw HTML |
| Rate-limit bypass via concurrent metadata fetches | Tampering | `pendingFetches` Set prevents duplicate concurrent requests per appId |
| steam-user imported in renderer (sandbox escape) | Elevation of Privilege | `steam-user` only in `src/backend/` — same constraint as Phase 1 |

---

## Sources

### Primary (HIGH confidence — verified via codebase inspection)

- `src/backend/storeManagers/zoom/library.ts` — canonical `refresh()` pattern: `sendFrontendMessage('pushGameToLibrary')`, `libraryStore.set('games')`, `CacheStore` usage
- `src/backend/storeManagers/zoom/electronStores.ts` — `CacheStore` for library data (not `TypeCheckedStoreBackend`)
- `src/backend/utils.ts` lines 537-558 — `getSteamLibraries()` export: parses `libraryfolders.vdf`, returns base library paths
- `src/backend/config.ts` lines 39-65 — `getSteamCompatFolder()`: platform-specific Steam base path
- `src/backend/cache.ts` — `CacheStore` class: persistent electron-store backed, supports `null` lifespan
- `src/frontend/state/GlobalState.tsx` lines 676-700 — `steamLogin()` / `steamLogout()` implementations
- `src/frontend/state/GlobalState.tsx` lines 963-1000 — `handleGamePush`: gog/zoom cases; steam case NOT YET PRESENT
- `src/frontend/screens/Library/index.tsx` lines 59-98, 399-440, 566-588 — Library context destructure, `makeLibrary()`, `gamesForAlphabetFilter` deps; steam missing from all three
- `src/frontend/screens/Library/components/GamesList/index.tsx` lines 65-96 — `visible-cards` IntersectionObserver pattern
- `src/frontend/screens/Library/components/GameCard/index.tsx` lines 80-157 — `visible-cards` listener, `getGameInfo()` call, skeleton (`data-invisible`) pattern
- `src/common/types.ts` lines 155-162 — `ExtraInfo` interface (missing `steamPlaytimeMinutes`)
- `src/common/types.ts` lines 182-223 — `GameInfo` interface: all available fields for Steam `GameInfo` construction
- `src/common/types/electron_store.ts` lines 84-88 — `steamConfigStore` in `StoreStructure` (Phase 1 addition already present)
- `src/frontend/helpers/library.ts` lines 472-476 — category arrays; `steamCategories` NOT YET PRESENT
- `src/frontend/types.ts` lines 216-222 — `StoresFilters` interface: `steam: boolean` already present
- `node_modules/@types/steam-user/index.d.ts` lines 376-380, 637-641, 1097-1116, 1179-1196, 1437-1440 — `getOwnedApps()` vs `getUserOwnedApps()`, `OwnedApp` shape, `Options` interface
- `node_modules/steam-user/components/friends.js` lines 835-876 — `getUserOwnedApps()` source: calls `Player.GetOwnedGames#1`, 10s timeout, constructs full icon URLs

### Secondary (HIGH confidence — live verification)

- Steam store API live call `appids=570` (Dota 2): confirmed `data.name`, `data.short_description`, `data.genres[].description`, `data.header_image` field names
- `npm view steam-user version` → 5.3.0 [VERIFIED: npm registry]
- `npm view @node-steam/vdf version` → 2.2.0 [VERIFIED: npm registry]
- `npm view axios version` → 1.18.1 (project uses 1.13.5 — older but compatible) [VERIFIED: npm registry]

### Tertiary (LOW confidence — assumed)

- Steam store API rate limit (~200 req/5min per IP): community knowledge, no official source [ASSUMED]
- ACF `StateFlags` bit definitions (4 = FullyInstalled): community-documented, no official Valve docs found [ASSUMED]
- Steam CDN `cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg` stability: stable in practice, no official SLA [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Steam store API rate limit is ~200 requests per 5 minutes per IP | Open Questions, Code Examples | If lower, lazy metadata fetch could trigger rate limiting for large libraries on first render; mitigation: add throttle |
| A2 | ACF `StateFlags` bit 4 (value 4) means "FullyInstalled" for all Steam games | Code Examples §ACF Parsing | If wrong, install detection breaks; games show as not-installed when they are. Community sources are consistent on this value. |
| A3 | Steam CDN URL `cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg` works for all games | Architecture Patterns, Code Examples | If CDN URL pattern changes or is unavailable for some games, artwork shows broken image. Fallback: use `data.header_image` from store API response. |
| A4 | `pendingFetches` dedup pattern (module-level Set) is sufficient for metadata concurrency | Pitfalls §5 | If `SteamGame` instances are recreated per call (via `getGame(id)` factory), the Set is module-level and survives re-creation; this should work |
| A5 | Phase 1 `SteamUser.client` field is accessible via a `getClient()` accessor to be added | Open Questions | If Phase 1 implementation encapsulated it differently, executor must adapt; low risk since Phase 1 plan specified a static class |

---

## Metadata

**Confidence breakdown:**
- Standard Stack (getUserOwnedApps API, CacheStore, getSteamLibraries): HIGH — verified from installed node_modules and codebase source
- Architecture patterns (makeLibrary, handleGamePush, library manager pattern): HIGH — verified directly from GlobalState.tsx, Library/index.tsx, zoom/library.ts
- ACF field names (StateFlags, installdir, SizeOnDisk): LOW-MEDIUM — community-documented, consistent with actual field names seen in the wild; no official Valve documentation
- Steam store API response shape: HIGH — verified via live API call during research session
- Rate limits: LOW — ASSUMED; no official source

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (steam-user and store APIs are stable; codebase patterns are locked during Phase 2 development)
