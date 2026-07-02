# Phase 06: Library & Game Status UX — Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 7 (5 modified, 0 new; test files count as 2 separate modifications)
**Analogs found:** 7 / 7 (all files are modifications to existing files; analogs are existing sections within or nearby the same file)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/backend/storeManagers/steam/games.ts` | service/utility | request-response | same file, `fetchMetadataIfNeeded` (lines 95–155) | exact — same axios instance, same `STEAM_STORE_API` constant, same error-handling structure |
| `src/backend/storeManagers/steam/library.ts` | service/polling | event-driven | same file, `pollInstallOnce` / `startInstallPolling` / `stopInstallPolling` (lines 382–568) | exact — new running-game poller is a structural mirror |
| `src/backend/downloadmanager/downloadqueue.ts` | service | CRUD | same file, lines 145–183 (`getInstallInfo` block + GOG runner-gate block) | exact — new Steam block slots in ahead of the existing `getInstallInfo` call |
| `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx` | component | request-response | same file, line 45 + line 60 (one-line context destructure + library spread) | exact — pattern is already established for `amazon`, `epic`, `gog`; Steam follows the same form |
| `src/frontend/screens/Library/components/GameCard/index.tsx` | component | event-driven | same file, line 304 (`isSteam` definition) + line 364 (`!isSteam` cancel-install guard) | exact — `!isSteam` guard is already used on the cancel-install context-menu item; Stop-button guard follows the same form |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` | test | request-response | same file (existing mock setup, lines 1–80) + `library.test.ts` `pollInstallOnce` tests (lines 699–800) | role-match |
| `src/backend/storeManagers/steam/__tests__/library.test.ts` | test | event-driven | same file, `pollInstallOnce` describe block (lines 699–800) | exact |

---

## Pattern Assignments

### `src/backend/storeManagers/steam/games.ts` (service/utility, request-response)

**Analog:** same file — `fetchMetadataIfNeeded` (lines 95–155) and module-level constants (lines 1–23)

**Imports pattern** (lines 1–23 — already present, no new imports needed):
```typescript
import axios from 'axios'
import { logWarning, LogPrefix } from 'backend/logger'
// STEAM_STORE_API constant is already defined at line 23:
const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'
// getFileSize is already imported in downloadqueue.ts — in games.ts, import from 'backend/utils':
import { getFileSize } from 'backend/utils'
import { GameInfo } from 'common/types'
```

**Axios call pattern** (lines 102–110 — copy this shape for the store API call in `getSteamInstallSize`):
```typescript
const resp = await axios.get(
  `${STEAM_STORE_API}?appids=${this.appId}`
)
const data = resp.data?.[this.appId]?.data
if (!data) {
  // Game may be delisted or API temporarily unavailable
  return
}
```

**Error handling pattern** (lines 148–155 — try/catch/finally with logWarning):
```typescript
} catch (err) {
  logWarning(
    [`Steam metadata fetch failed for appId ${this.appId}:`, err],
    LogPrefix.Steam
  )
} finally {
  pendingFetches.delete(this.appId)
}
```

**New functions to add** — `parseSteamStorageRequirement` (pure, exported for testing) and `getSteamInstallSize` (exported, async). Place them as module-level exports after the existing `buildSteamProtocolUrl` function (after line 47) so they are importable from `downloadqueue.ts` without touching the class. Follow the RESEARCH.md code examples exactly for these functions.

**AppId validation** (line 36–45 — use `buildSteamProtocolUrl`'s numeric guard as the pattern; for the store API URL, apply the same `/^\d+$/` check before constructing the URL):
```typescript
// The appId passed to getSteamInstallSize comes from element.params.appName,
// which is already guaranteed numeric by the existing install flow.
// Add a guard consistent with buildSteamProtocolUrl:
if (!/^\d+$/.test(appId)) return '?? MB'
```

---

### `src/backend/storeManagers/steam/library.ts` (service/polling, event-driven)

**Analog:** same file — install poll lifecycle section (lines 382–568)

**Module-level state pattern** (lines 385–391 — mirror this for the running-game poller):
```typescript
// Existing install poll registry:
const activePolls = new Map<
  string,
  { timer: NodeJS.Timeout; ticks: number; seenDownloading: boolean }
>()

// New running-game poller uses simpler module-level state (single global poll, not per-appId):
let runningPollTimer: NodeJS.Timeout | null = null
let lastKnownRunningAppId = 0
```

**Idempotent start pattern** (lines 510–511):
```typescript
export function startInstallPolling(appId: string, intervalMs = 3000): void {
  if (activePolls.has(appId)) return // idempotent
```
Apply same idiom to `startRunningPoll`:
```typescript
export function startRunningPoll(intervalMs = 5000): void {
  if (runningPollTimer) return // idempotent
```

**setInterval / clearInterval pattern** (lines 524–554):
```typescript
const timer = setInterval(async () => {
  // ... poll logic ...
}, intervalMs)
entry.timer = timer
activePolls.set(appId, entry)
```

**stopInstallPolling pattern** (lines 563–568 — copy for `stopRunningPoll`):
```typescript
export function stopInstallPolling(appId: string): void {
  const poll = activePolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activePolls.delete(appId)
  logInfo(`Steam: stopped install polling for appId ${appId}`, LogPrefix.Steam)
}
```

**sendFrontendMessage('gameStatusUpdate') pattern** (lines 457–461, 477–481 — exact shape to copy):
```typescript
sendFrontendMessage('gameStatusUpdate', {
  appName: appId,
  runner: 'steam',
  status: 'installing'   // or 'done' or 'playing'
})
```

**New imports needed** for the per-platform RunningAppID readers:
```typescript
import { spawnSync, execFileSync } from 'child_process'
import { isWindows, isMac } from 'backend/constants/environment'
// readFileSync and existsSync already imported from 'graceful-fs' (line 11)
// parse already imported from '@node-steam/vdf' (line 12)
// join already imported from 'path' (line 10)
// userHome — check if available in 'backend/constants' or import from constants/paths
```

**VDF parse pattern** (lines 419–431 in `readAcfState` — adapt for `registry.vdf`):
```typescript
const content = readFileSync(manifestFile, 'utf-8')
const parsed = parse(content)
const state = parsed?.AppState   // ← for ACF
// For registry.vdf: parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
```

**Section comment convention** (line 382):
```typescript
// ── Install polling lifecycle (D-07) ─────────────────────────────────────────
```
Add a matching section comment:
```typescript
// ── Running-game polling lifecycle (GAME-05) ──────────────────────────────────
```

**Where to add in the file:** After `stopUninstallPolling` and `scanDownloadingAppIds` (after the last exported function, before any internal helpers at the bottom). The three new functions (`pollRunningOnce`, `startRunningPoll`, `stopRunningPoll`) and the four per-platform readers (`readRunningAppId`, `macOsRunningAppId`, `windowsRunningAppId`, `linuxRegistryVdfRunningAppId`, `linuxFallbackRunningAppId`) go in this new section. Per-platform readers are NOT exported (only `readRunningAppId` and the three poll functions are exported, for testability).

---

### `src/backend/downloadmanager/downloadqueue.ts` (service, CRUD)

**Analog:** same file — `addToQueue` function, lines 145–183

**Existing size-assignment block** (lines 145–183 — new Steam block slots in before `getInstallInfo` is called):
```typescript
// Current block (lines 145–163):
const installInfo = await libraryManagerMap[element.params.runner].getInstallInfo(
  element.params.appName,
  element.params.platformToInstall,
  { branch: element.params.branch, build: element.params.build }
)
element.params.size = installInfo?.manifest?.download_size
  ? getFileSize(installInfo?.manifest?.download_size)
  : '?? MB'
```

**Runner-gate pattern** (lines 164–178 — the GOG `if (element.params.runner === 'gog' && ...)` block is the direct analog; new Steam block follows the same shape):
```typescript
if (
  element.params.runner === 'gog' &&
  element.params.platformToInstall.toLowerCase() === 'windows' &&
  installInfo && installInfo.manifest && 'dependencies' in installInfo.manifest
) {
  // ... GOG-specific logic ...
}
```
New Steam block (Option B from RESEARCH.md):
```typescript
if (element.params.runner === 'steam') {
  element.params.size = await getSteamInstallSize(
    element.params.appName,
    element.params.gameInfo
  )
} else {
  // existing getInstallInfo path — unchanged
  const installInfo = await libraryManagerMap[...].getInstallInfo(...)
  element.params.size = installInfo?.manifest?.download_size
    ? getFileSize(installInfo.manifest.download_size)
    : '?? MB'
  // ... GOG redist block ...
}
```

**Import to add** (at the top of the file — follow the existing import grouping):
```typescript
import { getSteamInstallSize } from 'backend/storeManagers/steam/games'
```

---

### `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx` (component, request-response)

**Analog:** same file — lines 45 and 60 (existing `amazon`, `epic`, `gog` pattern)

**Context destructure pattern** (line 45 — the only change is adding `steam`):
```typescript
// Current (line 45):
const { amazon, epic, gog, showDialogModal } = useContext(ContextProvider)

// Fixed:
const { amazon, epic, gog, steam, showDialogModal } = useContext(ContextProvider)
```

**Library spread pattern** (line 60 — add `...steam.library`):
```typescript
// Current (line 60):
const library = [...epic.library, ...gog.library, ...amazon.library]

// Fixed:
const library = [...epic.library, ...gog.library, ...amazon.library, ...steam.library]
```

**Why this works:** `steam` is already provided in `ContextProvider` (line 34 of `ContextProvider.tsx`) and rendered in `GlobalState.tsx` (line 1208). The component simply never consumed it. No other changes to this file.

---

### `src/frontend/screens/Library/components/GameCard/index.tsx` (component, event-driven)

**Analog:** same file — `isSteam` definition at line 304 and existing `!isSteam` guard at line 364

**`isSteam` definition** (line 304 — already present, no change needed):
```typescript
const isSteam = runner === 'steam'
```

**Existing `!isSteam` guard pattern** (lines 361–365 — the cancel-install context-menu item already uses this guard; the two Stop-button changes follow the same form):
```typescript
{
  // cancel installation/update — hidden for Steam (GamerLib cannot cancel Steam's download)
  label: t('button.cancel'),
  onclick: async () => handlePlay(runner),
  show: (isInstalling || isUpdating) && !isSteam,
  icon: <Cancel />
},
```

**Change 1 — inline Stop icon** (line 229 — add `&& !isSteam` to the condition):
```typescript
// Current (line 229):
if (isPlaying) {
  return (
    <SvgButton
      className="cancelIcon"
      onClick={async () => handlePlay(runner)}
      title={`${t('label.playing.stop')} (${title})`}
    >
      <StopIconAlt />
    </SvgButton>
  )
}

// Fixed (D-08):
if (isPlaying && !isSteam) {
  return (
    <SvgButton
      className="cancelIcon"
      onClick={async () => handlePlay(runner)}
      title={`${t('label.playing.stop')} (${title})`}
    >
      <StopIconAlt />
    </SvgButton>
  )
}
// For isSteam + isPlaying: falls through to the installed-game play icon (observe-only badge).
```

**Change 2 — context menu Stop item** (line 336 — add `&& !isSteam` to `show`):
```typescript
// Current (lines 333–338):
{
  label: t('label.playing.stop'),
  onclick: async () => handlePlay(runner),
  show: isPlaying,
  icon: <Cancel />
},

// Fixed (D-08):
{
  label: t('label.playing.stop'),
  onclick: async () => handlePlay(runner),
  show: isPlaying && !isSteam,
  icon: <Cancel />
},
```

No changes to `constants.ts` or `GameCard` CSS. The `'playing'` status string is already handled by `getCardStatus` (line 26 of `constants.ts`) and the badge label is already defined in `src/frontend/hooks/constants.ts` (line 24: `playing: t('gamepage:status.playing', 'Playing')`).

---

### `src/backend/storeManagers/steam/__tests__/games.test.ts` (test, request-response)

**Analog:** same file (lines 1–80 for mock setup) + `library.test.ts` `pollInstallOnce` describe block (lines 699–800) for the assertion pattern

**Mock setup pattern** (lines 1–80 — already established; reuse exactly):
```typescript
jest.mock('axios')
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
```

**axios mock response pattern** — for `getSteamInstallSize` tests, mock `axios.get`:
```typescript
// In test: mock a successful appdetails response
jest.mocked(axios.get).mockResolvedValue({
  data: {
    '440': {
      success: true,
      data: {
        name: 'Team Fortress 2',
        pc_requirements: {
          minimum: '<ul><li><strong>Storage:</strong> 15 GB available space</li></ul>'
        }
      }
    }
  }
})
```

**Assertion pattern** (line 737–744 in `library.test.ts` — adapt for `getSteamInstallSize`):
```typescript
await pollInstallOnce('730')
expect(sendFrontendMessage).toHaveBeenCalledWith(
  'gameStatusUpdate',
  expect.objectContaining({ appName: '730', runner: 'steam', status: 'installing' })
)
```

**New test cases to add** (add as a new `describe` block at the bottom of `games.test.ts`):
- `parseSteamStorageRequirement` — exported pure function, no mocks needed
- `getSteamInstallSize` — three cases: installed game (no network call), uninstalled (API returns size), API fails (returns `'?? MB'`)

---

### `src/backend/storeManagers/steam/__tests__/library.test.ts` (test, event-driven)

**Analog:** same file — `pollInstallOnce` describe block (lines 699–800)

**Timer mock pattern** (lines 702–725 — use `jest.useFakeTimers()` / `jest.useRealTimers()` for the running-game poller tests):
```typescript
describe('pollRunningOnce()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // reset module-level state between tests:
    // stopRunningPoll() if a poll is active
    stopRunningPoll()
  })

  afterEach(() => {
    stopRunningPoll()
    jest.useRealTimers()
  })
```

**sendFrontendMessage assertion pattern** (lines 737–744):
```typescript
expect(sendFrontendMessage).toHaveBeenCalledWith(
  'gameStatusUpdate',
  expect.objectContaining({
    appName: '440',
    runner: 'steam',
    status: 'playing'
  })
)
```

**New mocks needed** (add to the existing mock section at the top of `library.test.ts`):
```typescript
// Mock child_process for Windows and Linux reader tests
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))

// Mock backend/constants/environment for platform-switching
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))
```
For per-platform reader tests, override the mock values inline using `jest.doMock` or by directly reassigning the mocked module's properties.

**New test cases to add** (new `describe` blocks after the existing `pollInstallOnce`/`startInstallPolling`/`stopInstallPolling` blocks):
- `readRunningAppId()` — delegates to correct platform reader (three sub-cases: macOS, Windows, Linux)
- `pollRunningOnce()` — sends `playing` on 0→X, sends `done` on X→0, no message on no change, sends both on X→Y transition
- `startRunningPoll()` / `stopRunningPoll()` — idempotent start, clears timer on stop
- Per-platform reader unit tests — `windowsRunningAppId` parses `REG_DWORD` output; `macOsRunningAppId` parses VDF; `linuxFallbackRunningAppId` parses reaper cmdline

---

## Shared Patterns

### `sendFrontendMessage('gameStatusUpdate', ...)` — IPC event bus
**Source:** `src/backend/storeManagers/steam/library.ts` lines 457–461, 477–481
**Apply to:** `library.ts` new running-game poller (GAME-05)
```typescript
sendFrontendMessage('gameStatusUpdate', {
  appName: appId,   // string — the Steam AppId
  runner: 'steam',
  status: 'playing' // or 'done'
})
```
The frontend chain (`GlobalState.handleGameStatus` → `libraryStatus` → `hasStatus` → `getCardStatus` → `isPlaying`) is already fully wired. No frontend changes needed beyond the two `!isSteam` guards in `GameCard`.

### Runner-gate pattern — `if (element.params.runner === 'steam') { ... } else { ... }`
**Source:** `src/backend/downloadmanager/downloadqueue.ts` lines 164–178 (existing GOG runner-gate)
**Apply to:** `downloadqueue.ts` new Steam size block (LIB-06 / D-04)
The GOG block is the direct analog — new Steam block follows the same conditional structure.

### `isSteam` guard for UI — `!isSteam`
**Source:** `src/frontend/screens/Library/components/GameCard/index.tsx` line 304, 364
**Apply to:** GameCard `renderIcon()` at line 229 (inline Stop icon) and `items` array at line 336 (context menu Stop item)
The existing `!isSteam` guard on the cancel-install context-menu item (line 364) is the direct template — the two new guards follow the same `show: condition && !isSteam` / `if (condition && !isSteam)` form.

### `axios.get` + `STEAM_STORE_API` call pattern
**Source:** `src/backend/storeManagers/steam/games.ts` lines 101–110
**Apply to:** `getSteamInstallSize` in `games.ts`
The same `axios.get` call and `resp.data?.[appId]?.data` destructuring pattern is already established in `fetchMetadataIfNeeded`. The new function reuses `STEAM_STORE_API` (already defined at line 23) and the same `logWarning` on failure.

### `getFileSize` byte-to-string conversion
**Source:** `src/backend/utils.ts` line 142; already imported in `downloadqueue.ts` line 4
**Apply to:** `getSteamInstallSize` in `games.ts` (import `getFileSize` from `'backend/utils'`); final string returned by `getSteamInstallSize` is passed through `getFileSize(bytes)`

### VDF parse pattern (`@node-steam/vdf`)
**Source:** `src/backend/storeManagers/steam/library.ts` lines 419–431 (`readAcfState`)
**Apply to:** `macOsRunningAppId()` and `linuxRegistryVdfRunningAppId()` in `library.ts`
```typescript
const content = readFileSync(regPath, 'utf-8')
const parsed = parse(content)   // parse from '@node-steam/vdf'
// then: parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
```
Key difference: ACF uses `parsed?.AppState`; registry.vdf uses `parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID`. The casing matters — `@node-steam/vdf` preserves original file casing.

### Logging convention
**Source:** `src/backend/storeManagers/steam/library.ts` lines 512–515, 567–568
**Apply to:** all new backend functions in `library.ts` and `games.ts`
```typescript
logInfo(`Steam: <action description> for appId ${appId}`, LogPrefix.Steam)
logWarning([`Steam: <warning>:`, err], LogPrefix.Steam)
```

---

## No Analog Found

None. All files in this phase are modifications to existing files, and every change has a clear existing pattern within the same file or a closely related file.

---

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/`, `src/backend/downloadmanager/`, `src/frontend/screens/Library/components/GameCard/`, `src/frontend/screens/DownloadManager/components/DownloadManagerItem/`, `src/frontend/hooks/`, `src/frontend/state/`
**Files scanned:** 12
**Pattern extraction date:** 2026-07-02
