# Phase 2: Steam Library - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can browse their full Steam library alongside Epic, GOG, and Amazon games. Each Steam game shows: install state (read from local ACF manifests), playtime in hours, and store metadata (title, cover art, description, genres). No launching, installing, or uninstalling in this phase — that is Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Library Sync

- **D-01:** Sync trigger is **background after login** — when auth completes, library refresh starts in a non-blocking background process. The app is usable while the library populates.
- **D-02:** While syncing, show the **cached library from electron-store** (previous session's result) immediately. Display a subtle spinner on the Steam section header. On first-ever launch (no cache), show an empty state with a "Syncing your Steam library…" message.
- **D-03:** **Once per session** auto-sync — sync fires once after login, then the cached data is used for the rest of the session. A manual Refresh button is available if the user buys a game mid-session.

### Metadata Pipeline

- **D-04:** **Lazy + cached** — fetch game metadata (title, description, genres, cover art) from the Steam store API on-demand, the first time a game card is rendered. Do not pre-fetch for the whole library.
- **D-05:** Cache metadata in electron-store **indefinitely** — only re-fetch on manual refresh. Game names and artwork almost never change; this avoids redundant API calls.
- **D-06:** While metadata is loading (before the lazy fetch completes): show the AppID as a placeholder title and a **grey skeleton box** where cover art will appear. Same skeleton pattern used elsewhere in the GameCard component.

### Playtime

- **D-07:** Playtime source is a **steam-user rich API call** — researcher to identify the exact method on the steam-user client that returns playtime alongside ownership data (beyond the bare `getOwnedApps()` which returns AppIDs only). steam-user v5.3.0 has richer persona/stats methods; researcher should confirm which call to use.
- **D-08:** Display format: **hours only, rounded** — e.g., "47 hours". Matches Steam's own library display convention.

### Offline Behavior

- **D-09:** If Steam CM is unreachable at startup, show the **cached library from electron-store** (last successful sync). A subtle note ("last synced X ago") indicates the data may be stale.
- **D-10:** **Install state is always read from ACF manifests on disk** — this is a local filesystem read, no network required. Install badges are always live and accurate even in offline mode.

### Claude's Discretion

- Exact spinner/badge placement on the Steam section header during background sync — follow existing pattern from GOG/Epic library loading indicators.
- Exact wording of the "last synced X ago" stale indicator.
- electron-store schema design for caching the library list and per-game metadata.
- IPC message names for library sync state updates (progress, complete, error).
- Error handling when the steam-user background sync fails mid-session (log + silent retry or user-visible toast).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Store Manager Pattern
- `src/backend/storeManagers/steam/library.ts` — the Phase 1 stub to be implemented; `SteamLibraryManager` class with no-op `refresh()` and `getGameInfo()`
- `src/backend/storeManagers/gog/library.ts` — canonical library manager pattern: `Map<string, GameInfo>`, `refresh()`, `getGameInfo()`, electron-store caching, IPC messaging
- `src/backend/storeManagers/zoom/library.ts` — most recently added library manager; use as secondary reference

### Frontend Library Integration
- `src/frontend/screens/Library/index.tsx` — library view; already has `steam` filter stub at line 97 (`storedCategory === 'steam'`). Steam games must appear in the `allGames` array alongside epic/gog/amazon
- `src/frontend/screens/Library/components/GameCard/index.tsx` — game card component; skeleton pattern to reuse for loading state
- `src/frontend/state/ContextProvider.tsx` — `steam.library: []` stub already wired at line 34; populate this from the background sync IPC event

### Types
- `src/common/types.ts` line 182 — `GameInfo` interface; `runner: 'steam'` already in union. Key fields to populate: `app_name` (AppID as string), `title`, `art_cover`, `art_square`, `is_installed`, `install` (Partial<InstalledInfo>)
- `src/common/types/game_manager.ts` — `LibraryManager` interface; `SteamLibraryManager` must implement all methods

### Tech Stack (locked — do not re-research)
- `CLAUDE.md` §Technology Stack — steam-user 5.3.0 (`getOwnedApps()` + richer methods), @node-steam/vdf 2.2.0 (ACF manifest parsing), axios 1.13.5 (Steam store API), electron-store 8.2.0 (caching)
- Steam store API endpoint: `https://store.steampowered.com/api/appdetails?appids={id}` — public, no auth required
- Steam CDN artwork: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg` and `capsule_616x353.jpg`

### Requirements
- `.planning/REQUIREMENTS.md` — LIB-01 through LIB-04 are the four requirements for this phase
- `.planning/ROADMAP.md` — Phase 2 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/library.ts` — `SteamLibraryManager` stub; `init()`, `refresh()`, `getGame()`, `getGameInfo()` are the four methods to implement in Phase 2
- `src/frontend/state/ContextProvider.tsx` line 34 — `steam.library: []` initial state; IPC event listener pattern to follow mirrors `gog` and `epic` context wiring
- `@node-steam/vdf` — already in project; use to parse `libraryfolders.vdf` (find Steam library paths) and `appmanifest_{appId}.acf` (install state, install path, size)
- `electron-store` via `src/backend/electron_store.ts` `TypeCheckedStoreBackend` — add a `steamLibraryStore` for the game list cache and a `steamMetadataStore` for per-game metadata cache
- `axios` — already in project for Steam store API calls

### Established Patterns
- `Map<string, GameInfo>` as in-memory library store, keyed by `appName` (AppID string for Steam)
- `sendFrontendMessage('refreshLibrary', runner)` IPC pattern (GOG/Epic) to notify frontend when library updates
- `configStore.set('library', serializedGames)` pattern for persisting to electron-store between sessions
- `logInfo`/`logError` with `LogPrefix.Steam` (established in Phase 1)

### Integration Points
- `src/frontend/screens/Library/index.tsx` — add steam to the `allGames` aggregation (lines ~363-438 where epic/gog/amazon/zoom libraries are merged); follow the `zoomLibrary` pattern for `steamLibrary`
- `src/backend/storeManagers/index.ts` — `SteamLibraryManager` already registered as stub; `init()` call needs to trigger background sync
- `src/frontend/state/ContextProvider.tsx` — wire IPC `on('libraryChange', 'steam', ...)` event to update `steam.library` in context

</code_context>

<specifics>
## Specific Ideas

- Background sync fires when the auth event completes (after login), not at cold app startup. This decouples library sync from app boot time.
- `steam-user`'s PICS cache for large libraries is a known slow path (issue #144). The researcher should investigate whether `setOption('enablePicsCache', true)` + the `ownershipCached` event is the right trigger, or if there's a faster path for getting the owned game list with playtime.
- ACF manifest paths: `~/.steam/steam/steamapps/` (Linux), `~/Library/Application Support/Steam/steamapps/` (macOS), `C:\Program Files (x86)\Steam\steamapps\` (Windows). Use the same platform-detection logic as AUTH-05's Steam client detection (Phase 1 D-07).
- Playtime display placement: follow whichever field/location existing runners (GOG, Epic) use for playtime in the GameCard — do not invent a new UI pattern.

</specifics>

<deferred>
## Deferred Ideas

- **Achievement display** — listed in REQUIREMENTS.md v2 backlog; not in Phase 2
- **Update detection indicator** — ACF `StateFlags` polling for pending updates; v2 backlog
- **Batch metadata prefetch for recently played games** — could prioritize fetching metadata for the top N most-played games; deferred to avoid complexity in Phase 2
- **Library folder picker** — let users add custom Steam library paths if auto-detection misses them; defer until detection proves insufficient in practice

</deferred>

---

*Phase: 2-Steam Library*
*Context gathered: 2026-06-27*
