# Phase 06: Library & Game Status UX — Research

**Researched:** 2026-07-02
**Domain:** Steam DM queue size display + running-game session detection
**Confidence:** HIGH for code paths (verified in codebase); MEDIUM for cross-platform registry.vdf macOS behavior

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** LIB-05 is satisfied by the existing game-details page (`TimeContainer`). Do NOT add playtime to library-grid/list cards. Prior attempt (Phase 02-05) was deliberately removed (`325cf7f4`). At phase transition, record LIB-05 as **met via the details page** in REQUIREMENTS.md.
- **D-02:** Install size source is research-driven. Leading approach: public Steam store `appdetails` API for pre-install estimate, ACF `SizeOnDisk` as truth-up once installed.
- **D-03:** Best-effort acceptable — any real figure beats `'?? MB'`. Fallback to `'?? MB'` when no figure is obtainable.
- **D-04:** Scope fix to the Steam runner path in `src/backend/downloadmanager/downloadqueue.ts` (~line 160). Do not alter GOG/Epic/Amazon size behavior.
- **D-05:** Detect active session via Steam's own `RunningAppID` (`registry.vdf` on macOS/Linux; `HKCU\Software\Valve\Steam\RunningAppID` on Windows). Process-scanning is fallback only if local-state signal proves unreliable.
- **D-06:** ~5-second poll cadence acceptable. Poll only while app window is open. No need for instant or event-driven detection.
- **D-07:** Reuse existing `isPlaying` UI in `GameCard` (same badge path as Epic/GOG). Feed detected Steam session into that state rather than inventing a Steam-specific badge.
- **D-08:** Hide the Stop button for Steam while Playing. Badge is observe-only. Do not change Stop behavior for other runners.

### Claude's Discretion

- Exact install-size source and fetch/caching strategy (D-02) — research picks.
- Exact per-platform `RunningAppID` read implementation and where the poller lives (D-05) — mirror existing Steam ACF poll lifecycle in `steam/library.ts` where it fits.
- How detected session state is plumbed from backend to frontend `isPlaying` state — follow existing gameStatus patterns.

### Deferred Ideas (OUT OF SCOPE)

- Grid/list-view playtime on cards (D-01).
- A working Steam "Stop" via `steam://` (D-08).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-06 | Download-manager queue shows real install size instead of `'?? MB'` | Two-part fix: (1) add Steam library to DM item rendering; (2) fetch size from store API at enqueue time. Sections: LIB-06 code path, size source, fix architecture. |
| GAME-05 | "Playing" status badge shown while a Steam game session is active | RunningAppID per-platform paths confirmed; existing `isPlaying` UI reuse path traced; poller design mirrors install poll. Sections: GAME-05 detection, poller design, frontend wiring, Stop-button hide. |
</phase_requirements>

---

## Summary

Phase 06 has two independent deliverables. Research traced each from backend source through to the frontend render to identify all touch points.

**LIB-06 (install size):** Research found a pre-existing blocking bug — `DownloadManagerItem` never renders Steam game entries because it searches only `epic.library + gog.library + amazon.library` for a `currentApp` lookup; Steam's library is absent from that array, causing a `null` return before the size display is reached. The fix is two-part: (1) add `steam.library` to that lookup (one-line frontend fix); (2) populate the DM element's `params.size` from the Steam store `appdetails` API at enqueue time, parsing `pc_requirements.minimum` HTML text with a regex. The store API exposes no structured size field — only the human-readable storage requirement embedded in HTML. Best-effort parsing is appropriate per D-03.

**GAME-05 (Playing badge):** Research found a Linux regression — `registry.vdf` `RunningAppID` has been stuck at 0 since a 2023 Steam UI overhaul (ValveSoftware/steam-for-linux#9672, open/unresolved). macOS and Windows are not affected by this issue. The recommended approach: per-platform reads (`registry.vdf` on macOS, real Windows registry via `reg query`, reaper-process cmdline scan as Linux fallback). Poller mirrors the existing `startInstallPolling` / `activePolls` pattern in `steam/library.ts`. Frontend wiring is already correct — `sendFrontendMessage('gameStatusUpdate', { status: 'playing' })` feeds the existing `libraryStatus` → `hasStatus` → `getCardStatus` → `isPlaying` path. Two surgical GameCard changes are needed for D-08: guard the Stop icon render with `!isSteam`, and guard the context menu Stop item similarly.

**Primary recommendation:** Implement the DM rendering fix and store-API size fetch as a single Wave 1. Implement the running-game poller in Wave 2, including per-platform RunningAppID readers and GameCard Stop-button hide.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Install size fetch (pre-install) | API/Backend (`steam/library.ts` or `downloadqueue.ts`) | — | Size must be resolved before the DM element is persisted; no frontend involvement needed |
| Install size display | Frontend (`DownloadManagerItem`) | — | `params.size` already rendered at line 245; blocking bug is the missing steam.library lookup |
| Running-game detection | Backend (`steam/library.ts` poller) | OS/filesystem (registry.vdf, reg.exe) | Polling reads OS state; cannot be done in renderer; result published via gameStatusUpdate IPC |
| Playing badge render | Frontend (`GameCard`) | — | Existing `isPlaying` badge already renders; no new UI needed |
| Stop-button gate | Frontend (`GameCard`) | — | Two render conditionals, both runner-gated with existing `isSteam` variable |

---

## Standard Stack

### No new packages required

All capabilities in this phase use existing project dependencies.

| Library | Already Present | Role |
|---------|-----------------|------|
| `@node-steam/vdf` | Yes (`^2.2.0`) | Parse `registry.vdf` on macOS/Linux |
| `axios` | Yes (`^1.13.5`) | Fetch Steam store `appdetails` API for install size |
| `graceful-fs` | Yes | Read registry.vdf file |
| `child_process` (built-in Node) | Built-in | `spawnSync('reg', ...)` on Windows; `execFileSync('ps', ...)` for Linux fallback |
| `getFileSize` from `backend/utils` | Yes (line 142) | Convert byte count to human-readable string |

---

## Package Legitimacy Audit

No new packages are installed in this phase. All dependencies are already present and active in the project.

| Package | Registry | Status |
|---------|----------|--------|
| `@node-steam/vdf` | npm | Already installed — no audit required |
| `axios` | npm | Already installed — no audit required |
| `graceful-fs` | npm | Already installed — no audit required |

**Packages removed due to slopcheck:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
[User clicks Install in GameLib]
         |
         v
 window.api.install({ runner:'steam', appName })
         |
         v
 ipc_handler.ts addHandler('install', ...)
         |
         v
 addToQueue(DMQueueElement)          [downloadqueue.ts]
         |
         +-- getInstallInfo('steam', appName)  [currently returns undefined]
         |    |
         |    +-- NEW: fetchSteamInstallSize(appId)
         |         |
         |         +-- axios GET /api/appdetails?appids={appId}
         |         |    └── parse pc_requirements.minimum HTML
         |         |         └── regex → bytes → getFileSize() → "15.0 GB"
         |         |
         |         +-- fallback: '?? MB'
         |
         +-- element.params.size = "15.0 GB"
         |
         v
 initQueue() → installQueueElement()
         |
         v
 SteamGame.install() → shell.openExternal('steam://install/...')
         |
         v
 startInstallPolling(appId)   [already exists in library.ts]
         |
         v
 DM element moves to "finished"
         |
         v
 DownloadManagerItem renders: "15.0 GB | Windows"
  (requires steam.library in library array — new fix)
```

```
[Running-game poller — every 5s]
         |
         v
 pollRunningOnce()            [new, in steam/library.ts]
         |
         +-- macOS: readFileSync(registry.vdf) → parse VDF
         |          → Registry.HKCU.Software.Valve.Steam.RunningAppID
         |
         +-- Windows: spawnSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'])
         |            → parse "REG_DWORD  0x1b58" → parseInt("1b58", 16)
         |
         +-- Linux: try registry.vdf (likely 0 due to bug)
         |          → fallback: execFileSync('ps', ['-eo', 'args'])
         |                      → /reaper SteamLaunch --AppId (\d+)/
         |
         v
 runningAppId changed? (0→X, X→0, X→Y)
         |
         +-- 0→X: sendFrontendMessage('gameStatusUpdate', { appName: X, status:'playing', runner:'steam' })
         +-- X→0: sendFrontendMessage('gameStatusUpdate', { appName: X, status:'done', runner:'steam' })
         +-- X→Y: send 'done' for X, 'playing' for Y
         |
         v
 GlobalState.tsx handleGameStatus()
         |
         v
 libraryStatus updated (adds/removes entry)
         |
         v
 hasStatus hook → status: 'playing'
         |
         v
 getCardStatus → isPlaying: true
         |
         v
 GameCard: shows "Playing" badge, hides Stop button (runner === 'steam')
```

### Recommended Project Structure

No new files required. Changes are confined to:

```
src/
├── backend/
│   ├── downloadmanager/
│   │   └── downloadqueue.ts          # Steam size fetch at line ~160
│   └── storeManagers/steam/
│       ├── library.ts                # pollRunningOnce, startRunningPoll, stopRunningPoll
│       └── games.ts                  # getSteamInstallSize() helper (or in library.ts)
├── frontend/
│   └── screens/
│       ├── DownloadManager/components/DownloadManagerItem/
│       │   └── index.tsx             # Add steam.library to library array
│       └── Library/components/GameCard/
│           └── index.tsx             # Guard Stop button with !isSteam
```

---

## LIB-06: Install Size — Detailed Findings

### Critical Pre-Existing Bug: DM Item Does Not Render for Steam

**File:** `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx`

Line 60:
```typescript
const library = [...epic.library, ...gog.library, ...amazon.library]
```

Line 212-218:
```typescript
const currentApp = library.find(
  (val) => val.app_name === appName && val.runner === runner
)
if (!currentApp) {
  return null   // ← Steam games always hit this path
}
const { title } = currentApp
```

`steam.library` is absent from the spread. Steam games never match → `currentApp` is `undefined` → component returns `null`. The `params.size` display at line 245 (`{size ?? ''}`) is unreachable.

**Root cause confirmed:** `steam` IS in `ContextProvider` (`ContextProvider.tsx` line 34; `GlobalState.tsx` render at line 1208). The component simply doesn't consume it.

**Fix (one line):**
```typescript
// Line 45 — add steam to context destructure:
const { amazon, epic, gog, steam, showDialogModal } = useContext(ContextProvider)

// Line 60 — add steam.library:
const library = [...epic.library, ...gog.library, ...amazon.library, ...steam.library]
```

This fix is REQUIRED for LIB-06. Without it, fixing the size calculation in the backend has no visible effect.

### Size Source: Steam Store appdetails API

**Confirmed:** The Steam store `appdetails` API (`https://store.steampowered.com/api/appdetails?appids={id}`) has NO structured numeric field for install size. [VERIFIED via direct API call to `/api/appdetails?appids=440` (Team Fortress 2)]

The only size-related information is embedded in the `pc_requirements.minimum` HTML string:
```html
<ul class="bb_ul"><li><strong>Storage:</strong> 15 GB available space</li></ul>
```

**Parsing strategy (best-effort, D-03):**
```typescript
function parseSteamStorageRequirement(htmlText: string): number | undefined {
  const match = htmlText.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space/i
  )
  if (!match) return undefined
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] ?? 1))
}
```

**Caveats:**
- `pc_requirements` may be absent or `[]` for some games (free-to-play games with no requirements page, DLC-only entries)
- HTML format could change if Valve updates the requirements template
- Returns approximate ("15 GB" → 16,106,127,360) which is acceptable per D-03

**Fallback chain:**
1. Installed game → use `gameInfo.install.install_size` (already exact, from ACF)
2. Not installed → parse `pc_requirements.minimum` from store API
3. API unavailable or no storage field → return undefined → `'?? MB'` fallback stays

### Fix Location: `addToQueue` in `downloadqueue.ts`

The `'?? MB'` fallback is at **line 160** of `downloadqueue.ts`:

```typescript
// Current (lines 145-163):
const installInfo = await libraryManagerMap[element.params.runner].getInstallInfo(
  element.params.appName,
  element.params.platformToInstall,
  { branch: element.params.branch, build: element.params.build }
)
element.params.size = installInfo?.manifest?.download_size
  ? getFileSize(installInfo?.manifest?.download_size)
  : '?? MB'
```

For Steam, `getInstallInfo` returns `undefined` (its stub returns `undefined` at `library.ts` line 248).

**Two equivalent fix approaches — research recommends Option A:**

**Option A (recommended):** Implement `SteamLibraryManager.getInstallInfo()` to return a minimal `InstallInfo`-shaped object. The DM queue only reads `installInfo?.manifest?.download_size`. This requires defining a `SteamInstallInfo` type and adding it to the `InstallInfo` union in `common/types.ts`. Cleanest separation of concerns.

**Option B (matches D-04 literally):** Add a Steam-specific block in `addToQueue` before the existing `getInstallInfo` call:
```typescript
if (element.params.runner === 'steam') {
  element.params.size = await getSteamInstallSize(
    element.params.appName,
    element.params.gameInfo
  )
  // getSteamInstallSize defined in steam/games.ts or steam/library.ts
} else {
  // existing getInstallInfo path unchanged
}
```

Option B avoids touching the `InstallInfo` type union and is more surgical. This directly targets D-04 ("the `'?? MB'` fallback at ~line 160") without type system changes.

**Recommendation:** Option B. Simpler, no type-union changes, clearly scoped.

### DM Element Lifecycle for Steam

The DM element for Steam is visible in the "active" queue for only milliseconds:
1. `addToQueue` → element enters queue
2. `initQueue` runs `installQueueElement` → calls `SteamGame.install()` → fires `steam://install/…` → returns `{ status: 'done' }` immediately
3. `processNotification` (toast suppressed for steam)
4. `addToFinished(element, 'done')` → `removeFromQueue`

The element is visible in the DM "Completed" section with its stored size. The size from step 1 persists in the `electron-store`'s `'finished'` array. Fixing the size at enqueue time is the correct and sufficient approach — no truth-up to the finished entry is needed.

---

## GAME-05: Playing Badge — Detailed Findings

### RunningAppID Per-Platform Status

#### macOS

**File:** `~/Library/Application Support/Steam/registry.vdf`
(Same path as `getSteamCompatFolder()` in `config.ts` line 45)

**VDF key path:** `parsed.Registry.HKCU.Software.Valve.Steam.RunningAppID` [CITED: community research, multiple sources confirm this path]

**Value type:** string (`"440"` when TF2 is running, `"0"` when idle)

**Status:** Likely functional. The ValveSoftware/steam-for-linux#9672 issue is Linux-specific.

**Parse with existing `@node-steam/vdf`:**
```typescript
import { parse } from '@node-steam/vdf'
import { readFileSync, existsSync } from 'graceful-fs'
import { join } from 'path'
import { userHome } from 'backend/constants/paths'
import { isMac } from 'backend/constants'

function macOsRunningAppId(): number {
  const regPath = join(userHome, 'Library/Application Support/Steam/registry.vdf')
  if (!existsSync(regPath)) return 0
  try {
    const parsed = parse(readFileSync(regPath, 'utf-8'))
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch { return 0 }
}
```

#### Windows

**Source:** Real Windows registry `HKCU\Software\Valve\Steam` value `RunningAppID` (REG_DWORD).

**Read via `child_process.spawnSync` (no new dependency):**
```typescript
import { spawnSync } from 'child_process'
import { isWindows } from 'backend/constants'

function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    const match = result.stdout?.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i)
    if (match) return parseInt(match[1], 16)
  } catch {}
  return 0
}
```

**Status:** Reliable. Real Windows registry is separate from the VDF file. [ASSUMED — not verified against a live Windows system but matches documented registry key structure]

#### Linux

**File:** `~/.steam/registry.vdf`
Note: This is `~/.steam/registry.vdf`, NOT `~/.steam/steam/registry.vdf`. The `defaultSteamPath` in config.ts points to `~/.steam/steam` (different directory).

**Status: BROKEN.** ValveSoftware/steam-for-linux issue #9672 (opened June 2023, open as of research date): `RunningAppID` is always `0` since the new Steam UI launched. No workaround or fix provided by Valve. [VERIFIED: issue confirmed at github.com/ValveSoftware/steam-for-linux/issues/9672]

**Linux fallback — reaper process cmdline scan:**

When Steam launches a game on Linux, it spawns a `reaper` process with cmdline:
```
reaper SteamLaunch --AppId 440 -- /path/to/game/executable
```

```typescript
import { execFileSync } from 'child_process'

function linuxFallbackRunningAppId(): number {
  try {
    const output = execFileSync('ps', ['-eo', 'args'], {
      encoding: 'utf8',
      timeout: 1000
    })
    const match = output.match(/reaper SteamLaunch --AppId (\d+)/)
    if (match) return parseInt(match[1], 10)
  } catch {}
  return 0
}
```

**Caveats for Linux fallback:**
- `reaper` is Steam's internal process management tool; Valve could rename/change its cmdline format
- On Flatpak Steam, process visibility may differ depending on Flatpak sandbox settings (the game process runs outside the Flatpak, so it should be visible)
- Only one game can be running at a time per Steam client instance, so the first `reaper` match is reliable
- If `ps` returns no output or is unavailable (container/sandboxed env), falls back to 0

**On Flatpak Linux:** Path would be `~/.var/app/com.valvesoftware.Steam/.steam/registry.vdf` — but since the registry.vdf is broken anyway, the fallback path takes over.

### Unified Per-Platform Reader

```typescript
// src/backend/storeManagers/steam/library.ts (new function)
import { isWindows, isMac } from 'backend/constants'

export function readRunningAppId(): number {
  if (isWindows) return windowsRunningAppId()
  if (isMac) return macOsRunningAppId()
  // Linux: try registry.vdf first, fall back to reaper scan
  const fromRegistry = linuxRegistryVdfRunningAppId()
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId()
}
```

### Poller Design — Mirror ACF Poll Lifecycle

The existing install poller pattern in `steam/library.ts` (lines 382-568):
- `activePolls: Map<string, { timer, ticks, seenDownloading }>` — module-level registry
- `startInstallPolling(appId, intervalMs)` — idempotent, creates `setInterval`
- `stopInstallPolling(appId)` — clears interval, removes from map
- `pollInstallOnce(appId)` — reads ACF, sends `gameStatusUpdate`, updates library

**New running-game poller mirrors this structure:**

```typescript
// Module-level state in steam/library.ts
let runningPollTimer: NodeJS.Timeout | null = null
let lastKnownRunningAppId = 0   // tracks previous read for delta detection

export function pollRunningOnce(): void {
  const currentAppId = readRunningAppId()

  if (currentAppId === lastKnownRunningAppId) return // no change

  if (lastKnownRunningAppId !== 0) {
    // Game stopped (or switched away)
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(lastKnownRunningAppId),
      runner: 'steam',
      status: 'done'
    })
  }
  if (currentAppId !== 0) {
    // New game started
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(currentAppId),
      runner: 'steam',
      status: 'playing'
    })
  }

  lastKnownRunningAppId = currentAppId
}

export function startRunningPoll(intervalMs = 5000): void {
  if (runningPollTimer) return // idempotent
  runningPollTimer = setInterval(pollRunningOnce, intervalMs)
  logInfo('Steam: started running-game poller', LogPrefix.Steam)
}

export function stopRunningPoll(): void {
  if (!runningPollTimer) return
  clearInterval(runningPollTimer)
  runningPollTimer = null
  logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
}
```

**Poller lifecycle in `main.ts`:**

Start: call `startRunningPoll()` from `SteamLibraryManager.init()` (alongside existing init logic).

Stop: hook into `handleExit()` or `app.before-quit`. The existing `mainWindow.on('close', ...)` at line 223 calls `handleExit()` — add `stopRunningPoll()` there. Or add a `before-quit` listener:
```typescript
// main.ts
app.on('before-quit', () => {
  libraryManagerMap['steam']?.stopRunningPoll?.()
})
```

Since `stopRunningPoll` is exported from `library.ts` and `SteamLibraryManager` can expose it, either approach works. The simpler option: call it from `SteamLibraryManager.cleanup()` (new method) invoked from `handleExit()` in main.ts.

"Poll only while the app window is open" — since the Electron main process only runs while the app is open, stopping on `before-quit` or `window-all-closed` (line 611 in main.ts) satisfies this naturally. No per-window tracking needed.

### Frontend Wiring — Already Correct

The complete chain from backend detection to frontend badge is already wired:

```
Backend: sendFrontendMessage('gameStatusUpdate', { appName: X, runner: 'steam', status: 'playing' })
    ↓ IPC
GlobalState.tsx line 949: window.api.handleGameStatus((e, args) => this.handleGameStatus(args))
    ↓
handleGameStatus() line 836: adds { appName: X, status: 'playing' } to libraryStatus[]
    ↓
hasStatus hook line 54: finds entry in libraryStatus, returns status: 'playing'
    ↓
GameCard/index.tsx line 175: getCardStatus(status, ...) → isPlaying: true
    ↓
renderIcon(): if (isPlaying) → renders Stop button ← D-08: must guard with !isSteam
    ↓
<span className="gameCardStatus">{label}</span> → "Playing"  ← already renders
```

The `'playing'` status label is already defined:
`src/frontend/hooks/constants.ts` line 24: `playing: t('gamepage:status.playing', 'Playing')`

No new UI or i18n keys needed.

### D-08: Stop Button Hide — Exact Code Locations

**File:** `src/frontend/screens/Library/components/GameCard/index.tsx`

**Location 1 — inline Stop icon (line 229):**
```typescript
// Current:
if (isPlaying) {
  return (
    <SvgButton className="cancelIcon" onClick={async () => handlePlay(runner)} ...>
      <StopIconAlt />
    </SvgButton>
  )
}

// Fixed (D-08):
if (isPlaying && !isSteam) {
  return (
    <SvgButton className="cancelIcon" onClick={async () => handlePlay(runner)} ...>
      <StopIconAlt />
    </SvgButton>
  )
}
// For isSteam + isPlaying: fall through to the installed-game play icon or null
// (the Playing badge already shows via haveStatus/gameCardStatus — no icon needed)
```

**Location 2 — context menu Stop item (line 336):**
```typescript
// Current:
{
  label: t('label.playing.stop'),
  onclick: async () => handlePlay(runner),
  show: isPlaying,
  icon: <Cancel />
}

// Fixed (D-08):
{
  label: t('label.playing.stop'),
  onclick: async () => handlePlay(runner),
  show: isPlaying && !isSteam,
  icon: <Cancel />
}
```

`isSteam` is already defined at line 304: `const isSteam = runner === 'steam'`

No other changes needed to `constants.ts` or `GameCard` CSS.

**Edge case — `handlePlay` for Steam when `isPlaying`:**
If a user somehow triggers `handlePlay` while `isPlaying` (e.g., direct launch attempt), the current `handlePlay` logic at line 592: `if (isPlaying || isUpdating) { return sendKill(appName, runner) }`. For Steam, `SteamGame.stop()` is already a no-op (logs a warning). The Stop button guard prevents this path from being triggered by UI — but no crash if it is.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VDF file parsing | Custom VDF parser | `@node-steam/vdf` `parse()` | Already installed and used throughout codebase |
| File size formatting | Custom byte-to-string | `getFileSize` from `backend/utils.ts` line 142 | Already used in DM queue, identical contract |
| Windows registry read | Custom PE binary reader | `child_process.spawnSync('reg', ...)` | `reg.exe` is always available on Windows; zero dependencies |
| Store API HTTP | Custom fetch | `axios` (already in `games.ts`) | Same axios instance and pattern as `fetchMetadataIfNeeded` |

---

## Common Pitfalls

### Pitfall 1: `DownloadManagerItem` returning null for Steam (LIB-06)
**What goes wrong:** After fixing the backend size, the DM still shows nothing for Steam games — the item renders null.
**Why it happens:** `DownloadManagerItem` line 60 only spreads `epic + gog + amazon` libraries. Steam is in `ContextProvider` but not in that local array.
**How to avoid:** Fix must include adding `steam` to context destructure AND to the library spread.
**Warning sign:** No DM entry appears for Steam games even after size fix.

### Pitfall 2: Linux `registry.vdf` `RunningAppID` always 0
**What goes wrong:** On Linux, `registry.vdf` shows `RunningAppID = 0` even while a game runs.
**Why it happens:** Valve bug in new Steam UI (June 2023, ValveSoftware/steam-for-linux#9672). Unfixed.
**How to avoid:** Implement the `reaper` process cmdline fallback for Linux. Read registry.vdf first; if result is 0, fall back to `ps -eo args` scan.
**Warning sign:** Playing badge never shows on Linux regardless of game state.

### Pitfall 3: Wrong path for Linux `registry.vdf`
**What goes wrong:** Using `defaultSteamPath + '/registry.vdf'` which resolves to `~/.steam/steam/registry.vdf` — file doesn't exist there.
**Why it happens:** `defaultSteamPath` in `config.ts` returns `~/.steam/steam` (the Steam installation root), but `registry.vdf` lives in `~/.steam/` (the parent).
**How to avoid:** On Linux, the path is `join(userHome, '.steam', 'registry.vdf')`, NOT `join(defaultSteamPath, 'registry.vdf')`. On macOS, use `join(defaultSteamPath, 'registry.vdf')` (which IS the Steam root).
**Warning sign:** `existsSync(regPath)` returns false; function always returns 0.

### Pitfall 4: VDF key path case sensitivity
**What goes wrong:** `parsed.registry.hkcu.software.valve.steam.RunningAppID` — VDF key lookup fails silently.
**Why it happens:** `@node-steam/vdf` preserves original casing from the file. The path from the file is `Registry.HKCU.Software.Valve.Steam.RunningAppID`.
**How to avoid:** Use exact casing from the VDF file: `parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID`.

### Pitfall 5: `pc_requirements` may be an empty array or missing
**What goes wrong:** `data.pc_requirements.minimum` throws — `pc_requirements` is `[]` for some apps.
**Why it happens:** Free-to-play games, DLC, demos, and tools may return `pc_requirements: []` or `pc_requirements: {}` with no `minimum` key.
**How to avoid:** Guard with optional chaining: `data?.pc_requirements?.minimum`. If result is falsy or not a string, skip → fall back to `'?? MB'`.

### Pitfall 6: DM element moves to "finished" before poller reads ACF size (LIB-06 truth-up)
**What goes wrong:** Planning a "truth-up" that updates the "finished" DM entry from ACF — but by the time the ACF appears, the DM entry is already in the immutable `'finished'` store.
**Why it happens:** The DM finished entry is stored in `electron-store`. Updating it requires reading, modifying, and re-writing the store entry, then sending `changedDMQueueInformation`.
**How to avoid:** Don't implement a DM truth-up for this phase. The store API pre-install estimate (D-02) is sufficient per D-03. The ACF `SizeOnDisk` is already used in `GameInfo.install.install_size` for installed games and shows on the game details page.

### Pitfall 7: Running poller conflicting with install poller status
**What goes wrong:** Install poller sends `gameStatusUpdate { status: 'done' }` while game is playing → clears the Playing badge.
**Why it happens:** Both pollers for the same appId send to `libraryStatus`. The last write wins.
**How to avoid:** The install poller stops as soon as `StateFlags bit 4` is set (FullyInstalled). A game can only run from an installed state. The two pollers won't overlap for the same appId in normal operation. Document as a known edge case (reinstall while playing = not supported, but Steam also prevents this).

### Pitfall 8: `registry.vdf` stale RunningAppID after Steam/game crash
**What goes wrong:** On macOS, `registry.vdf` retains a non-zero `RunningAppID` after a crash. GameLib shows "Playing" badge for a game that's no longer running.
**Why it happens:** Steam writes `RunningAppID` on game start but may not write 0 on crash.
**How to avoid:** Self-corrects when Steam is restarted (Steam resets `RunningAppID`). Acceptable for a 5-second-poll "best effort" badge per D-06. No special handling needed.

---

## Code Examples

### Example 1: Parse storage size from appdetails API response

```typescript
// Source: derived from verified appdetails API response structure
function parseSteamStorageRequirement(htmlText: string | undefined): number | undefined {
  if (!htmlText || typeof htmlText !== 'string') return undefined
  // Matches "15 GB available space", "512 MB available space", "1.5 TB available space"
  const match = htmlText.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space/i
  )
  if (!match) return undefined
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] ?? 1))
}
```

### Example 2: getSteamInstallSize — size source with fallback chain

```typescript
// To be placed in src/backend/storeManagers/steam/games.ts or library.ts
import axios from 'axios'
import { getFileSize } from 'backend/utils'
import { logWarning, LogPrefix } from 'backend/logger'
import { GameInfo } from 'common/types'

const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

export async function getSteamInstallSize(appId: string, gameInfo?: GameInfo): Promise<string> {
  // Fast path: already installed, use ACF-verified size
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    const bytes = parseInt(gameInfo.install.install_size, 10)
    if (!isNaN(bytes) && bytes > 0) return getFileSize(bytes)
  }

  // Pre-install estimate: fetch from store API
  try {
    const resp = await axios.get(`${STEAM_STORE_API}?appids=${appId}`)
    const data = resp.data?.[appId]?.data
    const minHtml = data?.pc_requirements?.minimum
    const bytes = parseSteamStorageRequirement(minHtml)
    if (bytes && bytes > 0) return getFileSize(bytes)
  } catch (err) {
    logWarning([`Steam size fetch failed for appId ${appId}:`, err], LogPrefix.Steam)
  }

  return '?? MB'
}
```

### Example 3: Running-game poll tick

```typescript
// src/backend/storeManagers/steam/library.ts (new)
export async function pollRunningOnce(): Promise<void> {
  const currentAppId = readRunningAppId()

  if (currentAppId === lastKnownRunningAppId) return

  if (lastKnownRunningAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(lastKnownRunningAppId),
      runner: 'steam',
      status: 'done'
    })
    logInfo(`Steam: running-game poller: game ${lastKnownRunningAppId} stopped`, LogPrefix.Steam)
  }

  if (currentAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(currentAppId),
      runner: 'steam',
      status: 'playing'
    })
    logInfo(`Steam: running-game poller: game ${currentAppId} started`, LogPrefix.Steam)
  }

  lastKnownRunningAppId = currentAppId
}
```

### Example 4: Windows registry read

```typescript
// src/backend/storeManagers/steam/library.ts
import { spawnSync } from 'child_process'

function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i)
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `registry.vdf` RunningAppID (Linux) | Broken since 2023 Steam UI update | Must use reaper cmdline fallback on Linux |
| `getInstallInfo` for Steam returns `undefined` | Stays `undefined` — fix adds Steam-specific path | DM queue always showed `'?? MB'` |
| `DownloadManagerItem` shows Steam DM entries | Never rendered (missing steam.library in lookup) | Silently invisible; must fix alongside size |
| Steam stop button (any runner) | Remains hidden for Steam only | Observe-only badge per D-08 |

**Deprecated/outdated:**
- Any approach relying on `registry.vdf` on Linux for `RunningAppID` — broken, avoid until Valve fixes.
- `getInstallInfo` returning `undefined` for Steam — temporary stub, now needs real implementation.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS `registry.vdf` `RunningAppID` is functional (issue is Linux-only) | GAME-05 macOS detection | If macOS is also broken, the Playing badge won't appear on macOS; fallback process scan would be needed |
| A2 | Windows real HKCU registry `RunningAppID` REG_DWORD is updated by Steam when a game runs | GAME-05 Windows detection | If not updated, Windows Playing badge won't appear; process scan fallback needed |
| A3 | `reaper SteamLaunch --AppId <N>` cmdline pattern is stable across Steam versions | GAME-05 Linux fallback | If Valve changes the reaper cmdline, Linux fallback breaks; fallback degrades to `0` (no badge shown) |
| A4 | `pc_requirements.minimum` HTML format is stable across game listings | LIB-06 size source | If Valve changes HTML template, size parsing silently returns `undefined` → `'?? MB'` fallback (acceptable per D-03) |

---

## Open Questions

1. **macOS registry.vdf — confirmed functional?**
   - What we know: The ValveSoftware/steam-for-linux#9672 issue is in the Linux-specific repo; no macOS report found.
   - What's unclear: Whether the new Steam UI update also broke registry.vdf on macOS.
   - Recommendation: Implement the macOS path as designed (A1 assumption). If the Playing badge never shows on macOS after implementation, apply the same `ps`-based fallback as Linux.

2. **`SteamInstallInfo` type for Option A `getInstallInfo`**
   - What we know: `InstallInfo` is a union; adding `SteamInstallInfo` requires touching `common/types.ts`.
   - What's unclear: Whether the team prefers touching the shared type or keeping the fix local to `downloadqueue.ts` (Option B).
   - Recommendation: Option B (Steam-specific block in `addToQueue`) avoids this; plan should use Option B.

3. **DM finished-list truth-up**
   - What we know: The ACF `SizeOnDisk` becomes available when Steam finishes downloading, but the DM element is already in "finished".
   - What's unclear: Whether the team wants the more accurate post-install size to retroactively update the finished entry.
   - Recommendation: Skip for this phase per D-03 (best-effort). The store API estimate is shown; ACF size appears in the game card's installed label.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `reg.exe` | Windows registry read (GAME-05) | ✓ Windows only | Built-in | — |
| `ps` | Linux reaper fallback (GAME-05) | ✓ Linux/macOS | Built-in | Return 0 (no badge) |
| Steam `registry.vdf` | macOS/Linux RunningAppID | ✓ when Steam installed | — | Return 0 |
| Steam store API | LIB-06 size estimate | ✓ online (public, no auth) | — | `'?? MB'` fallback |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** Steam store API (rate-limited / offline) → `'?? MB'`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `jest.config.js` (projects: `src/backend`) |
| Quick run command | `pnpm test -- --testPathPattern="steam/(library\|games)"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-06 | `parseSteamStorageRequirement` parses "15 GB available space" → 16_106_127_360 bytes | unit | `pnpm test -- --testPathPattern="steam/games" -t "parseSteamStorageRequirement"` | ❌ Wave 0 |
| LIB-06 | `parseSteamStorageRequirement` returns undefined for missing/malformed HTML | unit | same | ❌ Wave 0 |
| LIB-06 | `getSteamInstallSize` returns installed game's `install_size` without network call | unit | `pnpm test -- --testPathPattern="steam/games" -t "getSteamInstallSize"` | ❌ Wave 0 |
| LIB-06 | `getSteamInstallSize` calls store API and returns parsed size for uninstalled game | unit | same | ❌ Wave 0 |
| LIB-06 | `getSteamInstallSize` returns `'?? MB'` when store API fails | unit | same | ❌ Wave 0 |
| GAME-05 | `pollRunningOnce` sends `playing` gameStatusUpdate when RunningAppID changes 0→X | unit | `pnpm test -- --testPathPattern="steam/library" -t "pollRunningOnce"` | ❌ Wave 0 |
| GAME-05 | `pollRunningOnce` sends `done` gameStatusUpdate when RunningAppID changes X→0 | unit | same | ❌ Wave 0 |
| GAME-05 | `pollRunningOnce` sends no message when RunningAppID unchanged | unit | same | ❌ Wave 0 |
| GAME-05 | `startRunningPoll` / `stopRunningPoll` idempotent lifecycle | unit | same | ❌ Wave 0 |
| GAME-05 | `windowsRunningAppId` parses REG_DWORD output correctly | unit | `pnpm test -- --testPathPattern="steam/library" -t "windowsRunningAppId"` | ❌ Wave 0 |
| GAME-05 | `macOsRunningAppId` parses registry.vdf VDF correctly | unit | same | ❌ Wave 0 |
| GAME-05 | `linuxFallbackRunningAppId` parses reaper cmdline correctly | unit | same | ❌ Wave 0 |
| GAME-05 | GameCard does not render Stop button for Steam when isPlaying | unit (React) | manual / existing GameCard tests | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern="steam/(library|games)" --silent`
- **Per wave merge:** `pnpm test --silent`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/backend/storeManagers/steam/__tests__/games.test.ts` — add `parseSteamStorageRequirement` and `getSteamInstallSize` test cases (existing file, add new describe block)
- [ ] `src/backend/storeManagers/steam/__tests__/library.test.ts` — add `pollRunningOnce`, `startRunningPoll`, `stopRunningPoll`, `readRunningAppId` per-platform test cases (existing file, add new describe blocks)
- [ ] Mock for `child_process.spawnSync` and `execFileSync` — add to test file mocks for Windows and Linux reader tests

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (limited) | appId is already validated as `/^\d+$/` via `buildSteamProtocolUrl` before any URL construction; new functions receive `appId` from the same validated source |
| V6 Cryptography | no | No crypto in this phase |
| V2 Authentication | no | No auth changes |
| V3 Session Management | no | |
| V4 Access Control | no | |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AppId injection into store API URL | Tampering | `appId` is already required to be a numeric string (`/^\d+$/`) by `buildSteamProtocolUrl`; use same validation before constructing store API URL |
| `reg query` path injection (Windows) | Tampering | The registry path `HKCU\Software\Valve\Steam` is hardcoded, not user-influenced; no injection surface |
| `ps -eo args` output confusion (Linux) | Tampering | Parse with a narrow regex; parseInt result; attacker would need to create a process named "reaper" with matching cmdline — unprivileged user on same machine, unusual threat model for a desktop launcher |
| HTML injection from `pc_requirements` | Tampering | Result is parsed with regex for a numeric size, then passed through `getFileSize`. The raw HTML is never rendered in the DOM. |

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `src/backend/downloadmanager/downloadqueue.ts`, `steam/library.ts`, `steam/games.ts`, `GameCard/index.tsx`, `constants.ts`, `hasStatus.ts`, `GlobalState.tsx`, `ContextProvider.tsx`, `DownloadManagerItem/index.tsx`, `config.ts`
- Direct API verification: `https://store.steampowered.com/api/appdetails?appids=440` — confirmed no structured size field; pc_requirements HTML format verified

### Secondary (MEDIUM confidence)
- ValveSoftware/steam-for-linux GitHub issue #9672 — confirms Linux `registry.vdf` `RunningAppID` regression (June 2023, open)
- Community sources (multiple): VDF key path `Registry.HKCU.Software.Valve.Steam.RunningAppID` confirmed across steamcommunity forum posts and Steam-Data repository

### Tertiary (LOW confidence — see Assumptions Log)
- A1: macOS registry.vdf functional — inferred from Linux-specific issue repo; not directly verified
- A2: Windows registry REG_DWORD behavior — documented key path, not verified against live system
- A3: Reaper cmdline format — documented in steamtinkerlaunch wiki; Steam internal tool may change

---

## Metadata

**Confidence breakdown:**
- LIB-06 code path: HIGH — directly read all relevant source files; bug confirmed via code inspection
- LIB-06 size source: HIGH — confirmed via direct API call (no structured field exists)
- GAME-05 Linux regression: HIGH — confirmed via open GitHub issue
- GAME-05 macOS path: MEDIUM — inferred; no direct macOS verification
- GAME-05 Windows path: MEDIUM — documented; not verified against live system
- GAME-05 frontend wiring: HIGH — traced full chain in source code

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (stable tech, but Linux/Windows registry behavior should be re-verified if >30 days)
