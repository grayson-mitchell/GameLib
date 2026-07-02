# Phase 2: Steam Library - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 13 new/modified files
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/backend/storeManagers/steam/library.ts` | manager | CRUD + async | `src/backend/storeManagers/zoom/library.ts` | exact |
| `src/backend/storeManagers/steam/games.ts` | service | request-response | `src/backend/storeManagers/zoom/library.ts` (getGameInfo + sendFrontendMessage) | role-match |
| `src/backend/storeManagers/steam/electronStores.ts` | config | CRUD | `src/backend/storeManagers/zoom/electronStores.ts` | exact |
| `src/backend/storeManagers/steam/user.ts` | service | — | `src/backend/storeManagers/steam/user.ts` (existing, minor addition) | self |
| `src/common/types.ts` | model | — | `src/common/types.ts` lines 155–162 (ExtraInfo interface) | self |
| `src/frontend/state/GlobalState.tsx` | state | event-driven | `src/frontend/state/GlobalState.tsx` lines 963–1000 (gog/zoom handleGamePush) | exact |
| `src/frontend/screens/Library/index.tsx` | component | CRUD | `src/frontend/screens/Library/index.tsx` lines 50–68, 355–440, 566–588 | self |
| `src/frontend/helpers/library.ts` | utility | transform | `src/frontend/helpers/library.ts` lines 472–476 (zoomCategories) | exact |
| `src/frontend/state/ContextProvider.tsx` | provider | event-driven | `src/frontend/state/ContextProvider.tsx` lines 28–38 (zoom/steam stubs) | self |
| `src/frontend/screens/Library/components/GameCard/index.tsx` | component | request-response | `src/frontend/screens/Library/components/GameCard/index.tsx` lines 447–538 | self |
| `src/frontend/screens/Library/components/LibraryHeader/index.tsx` | component | event-driven | `src/frontend/screens/Library/components/LibraryHeader/index.tsx` (existing) | self |
| `src/frontend/assets/steam-logo.svg` | asset | — | `src/frontend/assets/zoom-logo.svg` | role-match |
| `src/frontend/components/UI/StoreLogos/index.tsx` | component | transform | `src/frontend/components/UI/StoreLogos/index.tsx` lines 1–26 | self |

---

## Pattern Assignments

### `src/backend/storeManagers/steam/library.ts` (manager, CRUD + async)

**Analog:** `src/backend/storeManagers/zoom/library.ts`

**Imports pattern** (`zoom/library.ts` lines 1–31):
```typescript
import { sendFrontendMessage } from '../../ipc'
import { GameInfo, ExecResult } from 'common/types'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import CacheStore from '../../cache'
import { libraryStore } from './electronStores'
import { isOnline } from '../../online_monitor'
import { LibraryManager } from 'common/types/game_manager'
// Steam-specific additions:
import { getSteamLibraries } from 'backend/utils'
import { parse } from '@node-steam/vdf'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'
import { SteamUser } from './user'
import { steamLibraryStore, steamMetadataStore } from './electronStores'
import { runOnceWhenOnline } from '../../online_monitor'
import type SteamUserLib from 'steam-user'
```

**In-memory store declaration** (`zoom/library.ts` line 34):
```typescript
const library: Map<string, GameInfo> = new Map()
```

**init() — load cache then background sync** (pattern from `zoom/library.ts` lines 38–43, `gog/library.ts` lines 73–91):
```typescript
// zoom/library.ts lines 38-43 show the init guard pattern
async init() {
  if (!GlobalConfig.get().getSettings().experimentalFeatures?.zoomPlatform)
    return
  await this.refresh()
}

// gog/library.ts lines 85-91 show runOnceWhenOnline usage
runOnceWhenOnline(async () => {
  // deferred online work here
})
```
For Steam: init() loads cache immediately (D-02), then calls `runOnceWhenOnline(() => this.refresh())` if `SteamUser.isLoggedIn()`.

**refresh() core loop** (`zoom/library.ts` lines 73–110):
```typescript
// zoom/library.ts lines 73-110 — the sendFrontendMessage + libraryStore.set pattern to copy
library.clear()

for (const zoomGame of gameApiArray) {
  const unifiedObject = this.zoomToUnifiedInfo(zoomGame)
  // ... merge installed state ...
  library.set(unifiedObject.app_name, unifiedObject)
  sendFrontendMessage('pushGameToLibrary', unifiedObject)   // ← copy this per-game push
}

libraryStore.set('games', Array.from(library.values()))    // ← copy this persistence call
```

**getGameInfo() — library lookup** (`zoom/library.ts` lines 178–201):
```typescript
// zoom/library.ts lines 178-201
getGameInfo(slug: string): GameInfo | undefined {
  return library.get(slug) || this.getInstallAndGameInfo(slug)
}

getInstallAndGameInfo(slug: string): GameInfo | undefined {
  const lib = libraryStore.get('games', [])
  const game = lib.find((value) => value.app_name === slug)
  if (!game) return
  // ... merge installed state ...
  return game
}
```

**Error handling pattern** (`zoom/library.ts` lines 139–143):
```typescript
// zoom/library.ts lines 139-143
} catch (error) {
  logError(['Error fetching Zoom library:', error], LogPrefix.Zoom)
  return []
}
```
For Steam: catch on `getUserOwnedApps()` call → log error → serve cached data from `steamLibraryStore.get('games', [])` and push each cached game via `sendFrontendMessage`.

**Key difference from Zoom:** ACF install-state merge replaces Zoom's `installedGamesStore` lookup. Steam uses `readdirSync(join(libraryPath, 'steamapps'))` + `parse(readFileSync(...))` + `(StateFlags & 4) !== 0` bitmask check. Do NOT use equality check (`StateFlags === 4`) — it breaks for games currently updating.

---

### `src/backend/storeManagers/steam/games.ts` (service, request-response)

**Analog:** `src/backend/storeManagers/zoom/library.ts` (sendFrontendMessage push pattern) + existing `src/backend/storeManagers/steam/games.ts` stub

**Imports pattern** (from `zoom/library.ts` lines 1–11, plus axios):
```typescript
import { sendFrontendMessage } from '../../ipc'
import { GameInfo } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'
import { steamMetadataStore } from './electronStores'
import axios from 'axios'
// library Map is shared with library.ts — export it from library.ts or co-locate
```

**getGameInfo() with lazy side-effect** (pattern from RESEARCH.md Pattern 2; the immediate-return + fire-and-forget shape comes from `zoom/library.ts`'s `sendFrontendMessage` pattern):
```typescript
// Existing stub in steam/games.ts lines 27-31 — replace throw with:
getGameInfo(): GameInfo {
  const existing = library.get(this.appId)
  if (!existing) return {} as GameInfo

  // Non-blocking lazy metadata fetch (D-04)
  if (!existing.art_cover) {
    void this.fetchMetadataIfNeeded(existing)  // fire-and-forget
  }
  return existing
}
```

**Dedup guard pattern** (module-level Set, referenced in RESEARCH.md Pitfall 5):
```typescript
// Module-level — survives SteamGame instance recreation
const pendingFetches = new Set<string>()
```

**axios fetch + sendFrontendMessage push** (`zoom/library.ts` line 89 for the push shape; axios usage from `gog/library.ts` lines 1–7):
```typescript
private async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
  if (pendingFetches.has(this.appId)) return
  pendingFetches.add(this.appId)
  try {
    const resp = await axios.get(
      `https://store.steampowered.com/api/appdetails?appids=${this.appId}`
    )
    const data = resp.data?.[this.appId]?.data
    if (!data) return
    // ... build updated GameInfo ...
    steamMetadataStore.set(this.appId, { art_cover, art_square, extra })
    library.set(this.appId, updated)
    sendFrontendMessage('pushGameToLibrary', updated)  // ← same as zoom/library.ts line 89
  } catch (err) {
    logWarning([`Steam metadata fetch failed for ${this.appId}:`, err], LogPrefix.Steam)
  } finally {
    pendingFetches.delete(this.appId)
  }
}
```

**Library Map sharing:** The `library: Map<string, GameInfo>` declared in `library.ts` must be accessible in `games.ts`. Export it from `library.ts` or move the Map to a shared `_state.ts` module. The zoom manager avoids this by keeping `getGameInfo` on the library manager class. Consider whether `SteamGame.getGameInfo()` should delegate to `SteamLibraryManager.getGameInfo()`.

---

### `src/backend/storeManagers/steam/electronStores.ts` (config, CRUD)

**Analog:** `src/backend/storeManagers/zoom/electronStores.ts` (entire file, lines 1–22)

**Full file pattern** (`zoom/electronStores.ts` lines 1–22):
```typescript
import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo } from 'common/types'
import { ZoomInstallInfo } from 'common/types/zoom'

const installedGamesStore = new TypeCheckedStoreBackend(
  'zoomInstalledGamesStore',
  { cwd: 'zoom_store', name: 'installed' }
)
const configStore = new TypeCheckedStoreBackend('zoomConfigStore', {
  cwd: 'zoom_store'
})
const libraryStore = new CacheStore<GameInfo[], 'games'>('zoom_library', null)
//                                                                         ^^^^ null = indefinite cache (D-05)
const installInfoStore = new CacheStore<ZoomInstallInfo>('zoom_install_info')

export { configStore, installedGamesStore, libraryStore, installInfoStore }
```

**Steam adaptation** — the existing `steam/electronStores.ts` has only `configStore`. Add two CacheStores:
```typescript
// ADD to src/backend/storeManagers/steam/electronStores.ts:
import CacheStore from '../../cache'
import { GameInfo } from 'common/types'

// Re-export existing configStore (TypeCheckedStoreBackend — already present line 3)
// ADD:
const steamLibraryStore = new CacheStore<GameInfo[], 'games'>('steam_library', null)
// null lifespan = indefinite (D-05); stored in store_cache/steam_library.json
// NOT registered in StoreStructure — CacheStore manages its own file (Anti-pattern #2)

const steamMetadataStore = new CacheStore<SteamMetadataCacheEntry>('steam_metadata', null)
// Keyed by appId string; per-game metadata cache; indefinite per D-05
// SteamMetadataCacheEntry = { art_cover: string; art_square: string; extra: ExtraInfo }

export { configStore, steamLibraryStore, steamMetadataStore }
```

**CacheStore constructor signature** (`src/backend/cache.ts` lines 17–21):
```typescript
constructor(
  filename: string,                    // becomes store_cache/{filename}.json
  max_value_lifespan: number | null = 60 * 6,  // null = never expires
  options?: { invalidateCheck?: (data: ValueType) => boolean }
)
```

---

### `src/backend/storeManagers/steam/user.ts` (service, minor addition)

**Analog:** `src/backend/storeManagers/steam/user.ts` itself (lines 52–54 show the private field)

**Current state** (`user.ts` lines 52–54):
```typescript
export class SteamUser {
  private static client: InstanceType<typeof SteamUserLib> | null = null
  private static session: InstanceType<typeof LoginSession> | null = null
```

**Addition needed** — add a public accessor after the existing `isLoggedIn()` method (line 69):
```typescript
// ADD after line 71 (isLoggedIn method):
static getClient(): InstanceType<typeof SteamUserLib> | null {
  return this.client
}
```
This is the only change to user.ts in Phase 2. Without it, `SteamLibraryManager.refresh()` cannot access the authenticated steam-user instance.

---

### `src/common/types.ts` (model, type extension)

**Analog:** `src/common/types.ts` lines 155–162 (ExtraInfo interface, self)

**Current ExtraInfo** (`types.ts` lines 155–162):
```typescript
export interface ExtraInfo {
  about?: About
  reqs: Reqs[]
  releaseDate?: string
  storeUrl?: string
  changelog?: string
  genres?: string[]
}
```

**Addition** — insert one optional field after `genres`:
```typescript
export interface ExtraInfo {
  about?: About
  reqs: Reqs[]
  releaseDate?: string
  storeUrl?: string
  changelog?: string
  genres?: string[]
  steamPlaytimeMinutes?: number   // ADD: total playtime in minutes from getUserOwnedApps()
}
```

The field is `steamPlaytimeMinutes?: number` (optional, minutes integer, not hours — display layer converts). Other runners never set it, so it is `undefined` for non-Steam games. No existing code iterates `ExtraInfo` keys in a way that breaks on unknown optional fields. Confirm with `npm run codecheck`.

---

### `src/frontend/state/GlobalState.tsx` (state, event-driven)

**Analog:** `src/frontend/state/GlobalState.tsx` lines 963–1000 (gog and zoom handleGamePush cases)

**Existing pattern to copy** (`GlobalState.tsx` lines 963–998):
```typescript
// GlobalState.tsx lines 963-998 — copy zoom block, rename to steam
window.api.handleGamePush((e: IpcRendererEvent, args: GameInfo) => {
  if (!args.app_name) return
  if (args.runner === 'gog') {
    const library = [...this.state.gog.library]
    const index = library.findIndex(
      (game) => game.app_name === args.app_name
    )
    if (index !== -1) {
      library[index] = args
    } else {
      library.push(args)
    }
    this.setState({
      gog: {
        library: [...library],
        username: this.state.gog.username
      }
    })
  } else if (args.runner === 'zoom') {
    const library = [...this.state.zoom.library]
    const index = library.findIndex(
      (game) => game.app_name === args.app_name
    )
    if (index !== -1) {
      library[index] = args
    } else {
      library.push(args)
    }
    this.setState({
      zoom: {
        library: [...library],
        username: this.state.zoom.username,
        enabled: true
      }
    })
  }
  // ADD after zoom block (after line 999):
  // } else if (args.runner === 'steam') { ... }
})
```

**Steam case to add** (after line 998, before the closing `}`):
```typescript
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
Note: Always spread `[...library]` to create a new array reference for React re-render. Do NOT mutate the array in place.

**steamLogin() fix** (`GlobalState.tsx` lines 676–688):
```typescript
// CURRENT (lines 676-688):
steamLogin = async (result: { status: string; username?: string }) => {
  console.log('logging steam')
  if (result.status === 'done') {
    this.setState({
      steam: { library: [], username: result.username }
    })
    this.handleSuccessfulLogin('steam')   // ← uses runInBackground: false (blocking)
  }
  return result.status
}

// REPLACE handleSuccessfulLogin call with:
this.refreshLibrary({
  runInBackground: true,   // D-01: non-blocking
  library: 'steam'
})
```

---

### `src/frontend/screens/Library/index.tsx` (component, CRUD)

**Analog:** `src/frontend/screens/Library/index.tsx` itself — copy zoom patterns for steam

**Change 1 — Context destructure** (`Library/index.tsx` lines 52–68, add `steam`):
```typescript
// Lines 52-68 — CURRENT ends with zoom, no steam:
const {
  libraryStatus,
  refreshing,
  refreshingInTheBackground,
  epic,
  gog,
  amazon,
  zoom,         // ← last store currently
  sideloadedLibrary,
  ...
} = useContext(ContextProvider)

// ADD steam after zoom:
  zoom,
  steam,        // ADD
```

**Change 2 — storesFilters initialization** (`Library/index.tsx` lines 91–98):
```typescript
// Lines 91-98 — CURRENT:
initialStoresfilters = {
  legendary: epicCategories.includes(storedCategory),
  gog: gogCategories.includes(storedCategory),
  nile: amazonCategories.includes(storedCategory),
  sideload: sideloadedCategories.includes(storedCategory),
  zoom: zoom.enabled && zoomCategories.includes(storedCategory),
  steam: storedCategory === 'all' || storedCategory === 'steam'  // ← stub already exists
}
// MODIFY steam line to use steamCategories import (Pattern 8):
  steam: steamCategories.includes(storedCategory)
```

**Change 3 — makeLibrary()** (`Library/index.tsx` lines 399–439):
```typescript
// Lines 399-439 — after showZoom block (line 415), ADD:
if (storesFilters['steam'] && steam?.username) {
  displayedStores.push('steam')
}
// After line 425 (showZoom declaration), ADD:
const showSteam = steam?.username && displayedStores.includes('steam')
// After line 431 (zoomLibrary declaration), ADD:
const steamLibrary = showSteam ? steam.library : []
// In return array (line 433), ADD ...steamLibrary:
return [
  ...sideloadedApps,
  ...epicLibrary,
  ...gogLibrary,
  ...amazonLibrary,
  ...zoomLibrary,
  ...steamLibrary   // ADD
]
```
Gate on `steam?.username`, NOT `steam?.library?.length > 0`. Library can be empty during first sync.

**Change 4 — favourites memo** (`Library/index.tsx` lines 357–393):
```typescript
// Lines 375-378 — after zoom.library.forEach block:
zoom.library.forEach((game) => {
  if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
})
// ADD immediately after:
steam?.library?.forEach((game) => {
  if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
})
// Also add steam to the useMemo dependency array (line 384-393):
  zoom,
  steam    // ADD
```

**Change 5 — gamesForAlphabetFilter dependency array** (`Library/index.tsx` lines 566–588):
```typescript
// Lines 568-588 — CURRENT:
  }, [
    storesFilters,
    ...
    zoom.library,
    sideloadedLibrary,
    ...
  ])
// ADD after zoom.library:
    steam?.library,    // ADD
```

---

### `src/frontend/helpers/library.ts` (utility, transform)

**Analog:** `src/frontend/helpers/library.ts` lines 472–476

**Existing pattern** (`library.ts` lines 472–476):
```typescript
export const epicCategories = ['all', 'legendary', 'epic']
export const gogCategories = ['all', 'gog']
export const sideloadedCategories = ['all', 'sideload']
export const amazonCategories = ['all', 'nile', 'amazon']
export const zoomCategories = ['all', 'zoom']
```

**Addition** — append after line 476:
```typescript
export const steamCategories = ['all', 'steam']
```

**Import in Library/index.tsx** — add `steamCategories` to the existing import from `frontend/helpers/library` where `zoomCategories` is imported.

---

### `src/frontend/state/ContextProvider.tsx` (provider, event-driven)

**Analog:** `src/frontend/state/ContextProvider.tsx` lines 28–38 (existing steam stub)

**Current state** (`ContextProvider.tsx` lines 34–38):
```typescript
// ContextProvider.tsx lines 34-38 — already present from Phase 1:
steam: {
  library: [],
  login: async () => Promise.resolve(''),
  logout: async () => Promise.resolve()
},
```

**Phase 2 change:** The initial context stub is already correct. No changes needed to `ContextProvider.tsx` itself — the actual library population happens through `GlobalState.tsx`'s `handleGamePush` handler (see GlobalState pattern above). Verify the `ContextType` in `src/frontend/types.ts` already includes `steam.library: GameInfo[]` — it should from Phase 1.

---

### `src/frontend/screens/Library/components/GameCard/index.tsx` (component, request-response)

**Analog:** `src/frontend/screens/Library/components/GameCard/index.tsx` itself (skeleton/invisible pattern + runner-based display)

**Skeleton (invisible) pattern** (`GameCard/index.tsx` lines 447–455):
```typescript
// Lines 447-455 — the not-yet-visible card stub:
if (!visible) {
  return (
    <div
      className={wrapperClasses}
      data-app-name={appName}
      data-invisible={true}
      data-tour={dataTour}
    ></div>
  )
}
```
This is already implemented for ALL runners. Steam cards get this skeleton automatically via the existing `visible-cards` IntersectionObserver (in `GamesList/index.tsx`). No change needed for the skeleton itself.

**Playtime display addition** — add after the `runner` span (lines 531–537):
```typescript
// CURRENT lines 531-537 — runner span:
<span
  className={classNames('runner', {
    active: haveStatus,
    installed: isInstalled
  })}
>
  {getStoreName(runner, t2('Other'))}
</span>

// ADD immediately after, inside the <Link> block:
{runner === 'steam' && gameInfo.extra?.steamPlaytimeMinutes !== undefined && (
  <span className="steamPlaytime">
    {gameInfo.extra.steamPlaytimeMinutes === 0
      ? t('game.steam.neverPlayed', 'Never played')
      : `${Math.round(gameInfo.extra.steamPlaytimeMinutes / 60)} ${
          Math.round(gameInfo.extra.steamPlaytimeMinutes / 60) === 1
            ? t('game.hour', 'hour')
            : t('game.hours', 'hours')
        }`}
  </span>
)}
```
Only shown for `runner === 'steam'`. If `steamPlaytimeMinutes` is `undefined` (metadata not yet loaded), the element is omitted entirely.

**CachedImage / art_cover fallback** (`GameCard/index.tsx` lines 499–504):
```typescript
// Lines 499-504 — existing fallback image pattern (already handles empty art_cover):
<CachedImage
  src={getImageFormatting(cover, runner)}
  className={imgClasses}
  alt="cover"
/>
```
When `art_cover === ''` (before lazy metadata fetch completes), `CachedImage` with an empty `src` renders a grey placeholder. No additional skeleton code is needed for Steam artwork — the existing `fallBackImage` (`heroic_card.jpg`) already serves as the fallback. Verify `getImageFormatting` handles empty string (it should fall through to `fallBackImage`).

---

### `src/frontend/screens/Library/components/LibraryHeader/index.tsx` (component, event-driven)

**Analog:** `src/frontend/screens/Library/components/LibraryHeader/index.tsx` (entire file, 44 lines)

**Current structure** (`LibraryHeader/index.tsx` lines 1–44):
```typescript
// Lines 30-44 — JSX structure:
return (
  <h5 className="libraryHeader" data-tour="library-header">
    <div className="libraryHeaderWrapper">
      <span className="libraryTitle">
        {showFavourites
          ? t('favourites', 'Favourites')
          : t('title.allGames', 'All Games')}
        <span className="numberOfgames">{numberOfGames}</span>
        <AddGameButton data-tour="library-add-game" />
      </span>
      <ActionIcons />
    </div>
  </h5>
)
```

**Sync spinner addition** — the LibraryHeader is a global header, not per-store. The sync spinner for Steam (D-02) should be placed in the `<span className="libraryTitle">` area when `steam.username` exists but `steam.library.length === 0` and a sync is in progress. Claude's discretion applies (CONTEXT.md). Suggested approach:

```typescript
// ADD to LibraryHeader Props:
type Props = {
  list: GameInfo[]
  steamSyncing?: boolean   // ADD: true while steam background sync is in progress
}

// ADD inside libraryTitle span, after numberOfgames:
{steamSyncing && (
  <span className="steamSyncSpinner" title={t('steam.syncing', 'Syncing Steam library…')}>
    {/* Use existing CSS spinner class from the project */}
  </span>
)}
```

Look for an existing spinner CSS class in `src/frontend/components/UI/` or check `refreshing`/`refreshingInTheBackground` state already passed to `ActionIcons` — the existing background refresh indicator may already cover this case without a separate spinner.

---

### `src/frontend/assets/steam-logo.svg` (asset)

**Analog:** `src/frontend/assets/zoom-logo.svg` and `src/frontend/assets/gog-logo.svg`

**zoom-logo.svg format** (lines 1–4 — compact SVG with viewBox):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29.31 25.71">
<path class="cls-1" d="..." />
</svg>
```

**gog-logo.svg format** (lines 1–8 — uses `<use>/<symbol>` pattern with className):
```xml
<svg class="gogIcon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <use href="#icon-logo-gog">
    <symbol preserveAspectRatio="xMidYMax meet" viewBox="0 0 34 31" id="icon-logo-gog">
      <path className="cls-1" d="..." />
    </symbol>
  </use>
</svg>
```

**For steam-logo.svg:** Use a simple, monochrome SVG path compatible with CSS `currentColor` theming. The Steam logo is the stylized "S" / steam controller shape. Use the same compact format as `zoom-logo.svg` (no `<use>/<symbol>` nesting). The `class` attribute on the root `<svg>` (not `className`) is used by plain SVG files; Vite's `?react` import converts them for React use where `className` applies.

**Import pattern** (from `StoreLogos/index.tsx` lines 2–6):
```typescript
import SteamLogo from 'frontend/assets/steam-logo.svg?react'
```

---

### `src/frontend/components/UI/StoreLogos/index.tsx` (component, transform)

**Analog:** `src/frontend/components/UI/StoreLogos/index.tsx` lines 1–26 (self)

**Entire current file** (`StoreLogos/index.tsx` lines 1–26):
```typescript
import { Runner } from 'common/types'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import SideLoad from 'frontend/assets/heroic-icon.svg?react'
import AmazonLogo from 'frontend/assets/amazon-logo.svg?react'
import ZoomLogo from 'frontend/assets/zoom-logo.svg?react'

type Props = { runner: Runner; className?: string }

export default function StoreLogos({
  runner,
  className = 'store-icon'
}: Props) {
  switch (runner) {
    case 'legendary':
      return <EpicLogo className={className} />
    case 'gog':
      return <GOGLogo className={className} />
    case 'nile':
      return <AmazonLogo className={className} />
    case 'zoom':
      return <ZoomLogo className={className} />
    default:
      return <SideLoad className={className} />
  }
}
```

**Steam addition** — add import + case:
```typescript
// ADD import after ZoomLogo import (line 6):
import SteamLogo from 'frontend/assets/steam-logo.svg?react'

// ADD case before default (after zoom case):
    case 'steam':
      return <SteamLogo className={className} />
```

---

## Shared Patterns

### sendFrontendMessage('pushGameToLibrary', gameInfo)
**Source:** `src/backend/storeManagers/zoom/library.ts` line 89
**Apply to:** `steam/library.ts` (in refresh() loop) and `steam/games.ts` (in fetchMetadataIfNeeded())
```typescript
// zoom/library.ts line 89 — the canonical push call:
sendFrontendMessage('pushGameToLibrary', unifiedObject)
```

### CacheStore with null lifespan (indefinite cache)
**Source:** `src/backend/storeManagers/zoom/electronStores.ts` line 18
**Apply to:** `steam/electronStores.ts` (both steamLibraryStore and steamMetadataStore)
```typescript
// zoom/electronStores.ts line 18:
const libraryStore = new CacheStore<GameInfo[], 'games'>('zoom_library', null)
//                                                                         ^^^^ null = never expires
```

### runOnceWhenOnline callback
**Source:** `src/backend/storeManagers/gog/library.ts` line 85; exported from `src/backend/online_monitor.ts` line 136
**Apply to:** `steam/library.ts` init()
```typescript
// online_monitor.ts lines 136-142:
export const runOnceWhenOnline = (callback: () => unknown) => {
  if (isOnline()) {
    callback()
  } else {
    connectivityEmitter.once('online', () => callback())
  }
}
// Usage in gog/library.ts line 85:
runOnceWhenOnline(async () => { /* network-dependent work */ })
```

### LogPrefix.Steam logging
**Source:** `src/backend/storeManagers/steam/user.ts` (Phase 1 establishes LogPrefix.Steam)
**Apply to:** All backend Steam files
```typescript
// Pattern established in user.ts:
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
logInfo('message', LogPrefix.Steam)
logError(['Error description:', err], LogPrefix.Steam)
logWarning('warning message', LogPrefix.Steam)
```

### library: Map<string, GameInfo> pattern
**Source:** `src/backend/storeManagers/zoom/library.ts` line 34
**Apply to:** `steam/library.ts`
```typescript
// zoom/library.ts line 34:
const library: Map<string, GameInfo> = new Map()
// Module-level, keyed by app_name (appId string for Steam)
```

### handleGamePush immutable state update
**Source:** `src/frontend/state/GlobalState.tsx` lines 966–979 (gog case)
**Apply to:** steam case in handleGamePush
```typescript
// GlobalState.tsx lines 966-979 — immutable array update pattern:
const library = [...this.state.gog.library]         // spread to new array
const index = library.findIndex(
  (game) => game.app_name === args.app_name
)
if (index !== -1) {
  library[index] = args                               // replace in-place
} else {
  library.push(args)                                  // or append
}
this.setState({
  gog: {
    library: [...library],                            // spread again for React
    username: this.state.gog.username
  }
})
```

### getSteamLibraries() return value — paths require 'steamapps' join
**Source:** `src/backend/utils.ts` lines 537–558
**Apply to:** `steam/library.ts` buildInstalledMap()
```typescript
// utils.ts lines 537-558 — returns base library paths (NOT steamapps/ subdirs):
export async function getSteamLibraries(): Promise<string[]> {
  // ...parses libraryfolders.vdf...
  return [...libraries, ...folders.map((folder) => folder.path)]
}
// CORRECT usage — must join 'steamapps' subdirectory:
const steamappsDir = join(libraryPath, 'steamapps')
// WRONG: readdirSync(libraryPath) — returns ['steamapps', 'userdata', ...]
// RIGHT: readdirSync(steamappsDir) — returns ['appmanifest_570.acf', ...]
```

---

## No Analog Found

All 13 files have analogs or are self-referential modifications. No files require falling back to RESEARCH.md patterns exclusively — the research patterns themselves are derived from the existing codebase (as noted in RESEARCH.md §Sources).

| File | Reason |
|------|--------|
| (none) | All files either have direct analogs or are self-modifications |

---

## Metadata

**Analog search scope:** `src/backend/storeManagers/`, `src/frontend/state/`, `src/frontend/screens/Library/`, `src/frontend/helpers/`, `src/frontend/components/UI/StoreLogos/`, `src/frontend/assets/`, `src/common/`, `src/backend/`
**Files scanned:** 15
**Pattern extraction date:** 2026-06-27
