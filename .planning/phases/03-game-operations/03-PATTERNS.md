# Phase 3: Game Operations - Pattern Map

**Mapped:** 2026-06-28
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/games.ts` | service | request-response (URL hand-off) | `src/backend/storeManagers/nile/games.ts` | role-match |
| `src/backend/storeManagers/steam/library.ts` | service | CRUD (ACF re-read on focus) | self — `buildInstalledMap()` already exists | self-extension |
| `src/backend/main.ts` | config/wiring | event-driven (BrowserWindow 'focus') | `src/backend/main.ts` lines 207-214 (existing event listeners) | exact |
| `src/frontend/screens/Game/GamePage/index.tsx` | component | request-response | `src/frontend/screens/Game/GameSubMenu/index.tsx` (isSideloaded pattern) | role-match |
| `src/frontend/screens/Game/GamePage/components/SettingsButton.tsx` | component | request-response | self — add `runner !== 'steam'` guard | self-extension |
| `src/frontend/screens/Game/GameSubMenu/index.tsx` | component | request-response | self — extend `isSideloaded` guard pattern | self-extension |
| `src/frontend/screens/Game/GamePage/components/MainButton.tsx` | component | request-response | self — already handles runner-specific logic | self-extension |

---

## Pattern Assignments

### `src/backend/storeManagers/steam/games.ts` (service, request-response)

**Analog:** `src/backend/storeManagers/nile/games.ts` for class/method structure; `src/backend/dialog/dialog.ts` for notify; `src/backend/utils.ts` (`openUrlOrFile`) for `shell.openExternal`

---

**Imports pattern** (`steam/games.ts` lines 1-17, already correct — extend with these):
```typescript
import { shell } from 'electron'
import { notify } from 'backend/dialog/dialog'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { buildInstalledMap } from './library'
import { library } from './state'
import { sendFrontendMessage } from '../../ipc'
```
`shell` comes from `'electron'`. `notify` from `'backend/dialog/dialog'`. Both are already used in the project at the paths above.

---

**launch() pattern** — analog: `src/backend/storeManagers/sideload/games.ts` lines 75-81 for the return-true shape; `src/backend/utils.ts` line 364-365 for `shell.openExternal`:
```typescript
async launch(
  _logWriter: LogWriter,
  _launchArguments?: LaunchOption,
  _args?: string[],
  _skipVersionCheck?: boolean
): Promise<boolean> {
  const info = this.getGameInfo()
  notify({ title: info.title, body: 'Opening in Steam…' })
  logInfo(`Steam: launching appId ${this.appId} via steam://rungameid`, LogPrefix.Steam)
  await shell.openExternal(`steam://rungameid/${this.appId}`)
  return true
}
```
- Return shape `Promise<boolean>` is mandated by `Game` interface (`src/common/types/game_manager.ts` line 43).
- No `sendGameStatusUpdate` call — Steam client owns the process; GamerLib cannot observe 'playing' state.
- `shell.openExternal` is already imported from `'electron'` throughout the backend (`src/backend/utils.ts` line 364).

---

**install() pattern** — analog: return shape from `src/backend/storeManagers/nile/games.ts` line 231, 254-271:
```typescript
async install(_args: InstallArgs): Promise<InstallResult> {
  const info = this.getGameInfo()
  notify({ title: info.title, body: 'Opening in Steam…' })
  logInfo(`Steam: install appId ${this.appId} via steam://install`, LogPrefix.Steam)
  await shell.openExternal(`steam://install/${this.appId}`)
  return { status: 'done' }
}
```
- Return type is `InstallResult` (`src/common/types/game_manager.ts` line 15-18): `{ status: 'done' | 'error' | 'abort' }`.
- No progress tracking — Steam owns the download. Do NOT call `sendProgressUpdate`.

---

**uninstall() pattern** — analog: return shape from `src/backend/storeManagers/nile/games.ts` lines 496-515; backend notify from `src/backend/storeManagers/sideload/games.ts` line 128:
```typescript
async uninstall(_args: RemoveArgs): Promise<ExecResult> {
  const info = this.getGameInfo()
  notify({ title: info.title, body: 'Opening in Steam…' })
  logInfo(`Steam: uninstall appId ${this.appId} via steam://uninstall`, LogPrefix.Steam)
  await shell.openExternal(`steam://uninstall/${this.appId}`)
  return { stdout: '', stderr: '' }
}
```
- Return type is `ExecResult` (`src/common/types/game_manager.ts` line 52 via `common/types`).
- GamerLib does NOT show its own confirm dialog (D-05). Steam shows its own.
- Do NOT call `sendFrontendMessage('refreshLibrary', ...)` — install state is reconciled by the focus re-read (D-01/D-02).

---

**isGameAvailable() pattern** — analog: `src/backend/storeManagers/nile/games.ts` lines 570-580 and `src/backend/storeManagers/gog/games.ts` lines 1298-1313:
```typescript
async isGameAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const info = this.getGameInfo()
    resolve(
      Boolean(
        info?.is_installed &&
        info.install.install_path &&
        existsSync(info.install.install_path)
      )
    )
  })
}
```
`existsSync` from `'graceful-fs'` — already in nile/gog imports.

---

**stop() pattern** — no-op: Steam owns the process lifecycle; GamerLib cannot kill it.
```typescript
async stop(_stopWine?: boolean): Promise<void> {
  logWarning(
    `SteamGame.stop: Steam owns process lifecycle for appId ${this.appId}; no-op`,
    LogPrefix.Steam
  )
}
```
Analog: `src/backend/storeManagers/gog/games.ts` lines 1291-1295 (GOGDL handles signal, GOG stop is also effectively a no-op now).

---

**forceUninstall() pattern** — clear in-memory entry and push updated state:
```typescript
async forceUninstall(): Promise<void> {
  library.delete(this.appId)
  sendFrontendMessage('pushGameToLibrary', { ...this.getGameInfo(), is_installed: false })
}
```
Analog: `src/backend/storeManagers/gog/games.ts` lines 1282-1288 (`sendFrontendMessage('pushGameToLibrary', this.getGameInfo())`).

---

**getSettings() pattern** — return a minimal default (Steam games do not use Heroic game config):
```typescript
async getSettings(): Promise<GameSettings> {
  return GameConfig.get(this.appId).config || (await GameConfig.get(this.appId).getSettings())
}
```
Analog: `src/backend/storeManagers/nile/games.ts` lines 65-68. If Steam games must not expose Heroic Wine config in the UI, `GamePage/index.tsx` already skips `getSettings` call when `runner === 'steam'` (line 247 guard: add `runner !== 'steam'`).

---

**getExtraInfo() pattern** — return from in-memory `extra` field populated by `fetchMetadataIfNeeded`:
```typescript
async getExtraInfo(): Promise<ExtraInfo> {
  const info = this.getGameInfo()
  return info.extra ?? { reqs: [], about: { description: '', shortDescription: '' } }
}
```
Analog: `src/backend/storeManagers/nile/games.ts` lines 95-107.

---

### `src/backend/storeManagers/steam/library.ts` (service, CRUD — focus re-read)

**Analog:** self — `buildInstalledMap()` already exported from this file (line 248). The focus re-read calls this function and pushes updates via `sendFrontendMessage`.

**installState() implementation** (currently a stub at line 231):
```typescript
installState(_appName: string, _state: boolean): void {
  // Steam install state is always derived from ACF on disk.
  // Callers should use refreshInstallState() instead.
}
```
Leave as intentional no-op — state comes from ACF, not from a boolean flag.

**New method: refreshInstallState()** — called by the focus listener in `main.ts`:
```typescript
async refreshInstallState(): Promise<void> {
  const installedMap = await buildInstalledMap()
  for (const [appIdStr, gameInfo] of library.entries()) {
    const appId = parseInt(appIdStr, 10)
    const installedData = installedMap.get(appId)
    const isNowInstalled = !!installedData
    if (gameInfo.is_installed !== isNowInstalled) {
      const updated: GameInfo = {
        ...gameInfo,
        is_installed: isNowInstalled,
        install: isNowInstalled
          ? {
              install_path: installedData!.installPath,
              install_size: installedData!.sizeOnDisk,
              platform: 'Windows' as const
            }
          : {}
      }
      library.set(appIdStr, updated)
      sendFrontendMessage('pushGameToLibrary', updated)
    }
  }
}
```
- Imports pattern: `buildInstalledMap` is already in scope (defined in same file). `library` from `'./state'`. `sendFrontendMessage` from `'../../ipc'`. `GameInfo` from `'common/types'`.
- Only pushes updates for games whose state actually changed (avoids flooding frontend).

---

### `src/backend/main.ts` (config/wiring, event-driven)

**Analog:** `src/backend/main.ts` lines 207-214 — existing BrowserWindow event listener block.

**Imports to add** (alongside existing imports at top of `initializeWindow`):
```typescript
import { libraryManagerMap } from './storeManagers'
```
`libraryManagerMap` is already imported elsewhere in main.ts — verify it's in scope at `initializeWindow`.

**focus event listener pattern** — add immediately after the existing listener block (lines 207-214):
```typescript
// Existing pattern (lines 207-214):
mainWindow.on('maximize', () => sendFrontendMessage('maximized'))
mainWindow.on('unmaximize', () => sendFrontendMessage('unmaximized'))
mainWindow.on('enter-full-screen', () => sendFrontendMessage('fullscreen', true))
mainWindow.on('leave-full-screen', () => sendFrontendMessage('fullscreen', false))

// NEW — add after existing block:
mainWindow.on('focus', () => {
  const steamManager = libraryManagerMap['steam']
  if (steamManager && 'refreshInstallState' in steamManager) {
    void (steamManager as { refreshInstallState: () => Promise<void> }).refreshInstallState()
  }
})
```
- Type assertion is needed if `LibraryManager` interface does not declare `refreshInstallState`. Alternative: add `refreshInstallState?(): Promise<void>` to `LibraryManager` in `src/common/types/game_manager.ts`.
- `void` discards the Promise — same convention used on line 48 of `steam/library.ts` (`void this.fetchMetadataIfNeeded(existing)`).

---

### `src/frontend/screens/Game/GameSubMenu/index.tsx` (component, request-response)

**Analog:** self — `isSideloaded` pattern at line 88. The new `isSteam` flag follows the exact same pattern.

**New flag** (line 88-89, extend existing block):
```typescript
const isSideloaded = runner === 'sideload'
const isSteam = runner === 'steam'
const isThirdPartyManaged = !!gameInfo.thirdPartyManagedApp
```

**Guard pattern** — every occurrence of `!isSideloaded && !isThirdPartyManaged` that guards Move/Repair/Verify/Force-Update must also gate on `!isSteam`. Current occurrences at lines 328, 338, 347, 356:
```typescript
// BEFORE (line 328):
{!isSideloaded && !isThirdPartyManaged && (
  <button onClick={async () => handleUpdate()} ...>Force Update</button>
)}

// AFTER:
{!isSideloaded && !isSteam && !isThirdPartyManaged && (
  <button onClick={async () => handleUpdate()} ...>Force Update</button>
)}
```
Apply this `!isSteam` addition to all four guarded blocks (Move, Change Location, Verify/Repair, Force Update). The Uninstall button at line 321 is **not** gated with `!isSideloaded` today — for Steam, leave Uninstall visible (D-04 says show it).

---

### `src/frontend/screens/Game/GamePage/index.tsx` (component, request-response)

**Analog:** self — `runner !== 'steam'` guard already established at lines 217-218.

**Existing guard to follow** (lines 217-218):
```typescript
runner !== 'sideload' &&
runner !== 'steam' &&
```
This already skips `getInstallInfo` for steam games. Extend the same guard logic to:

1. Skip `getSettings` call (line 247): add `runner !== 'steam' &&` before calling `window.api.requestGameSettings`.
2. Hide `<SettingsButton>` in render (line 429): change to `{!isBrowserGame && runner !== 'steam' && <SettingsButton gameInfo={gameInfo} />}`.

**handleInstall for steam** — `handleInstall` fires `openInstallGameModal` or calls `install` helper from `frontend/helpers/library`. For `runner === 'steam'`, the install is triggered by the steam:// URL from the backend — the Install button in GamePage should call `window.api.install(...)` just as for other runners, because `SteamGame.install()` on the backend will fire `shell.openExternal('steam://install/{appId}')`. No special frontend branch needed beyond not showing an install path dialog.

**handlePlay for steam** — same: `window.api.launch(appName, runner, ...)` hits `SteamGame.launch()` on the backend which fires `shell.openExternal('steam://rungameid/{appId}')`. No frontend change needed.

---

### `src/frontend/screens/Game/GamePage/components/SettingsButton.tsx` (component, request-response)

**Analog:** self (only 27 lines). Currently returns `null` when `!gameInfo.is_installed`.

**Add steam guard** (line 13, alongside existing is_installed check):
```typescript
if (!gameInfo.is_installed || gameInfo.runner === 'steam') {
  return null
}
```
Alternatively, gate at the call site in `GamePage/index.tsx` line 429 (see above) — either approach is correct; call-site gate is simpler.

---

## Shared Patterns

### shell.openExternal for steam:// URLs
**Source:** `src/backend/utils.ts` lines 363-368 (`openUrlOrFile`)
**Apply to:** `SteamGame.launch()`, `SteamGame.install()`, `SteamGame.uninstall()`
```typescript
import { shell } from 'electron'
// ...
await shell.openExternal(`steam://rungameid/${appId}`)
await shell.openExternal(`steam://install/${appId}`)
await shell.openExternal(`steam://uninstall/${appId}`)
```

### Hand-off toast (backend)
**Source:** `src/backend/dialog/dialog.ts` lines 61-72; `src/backend/storeManagers/sideload/games.ts` line 128
**Apply to:** All three `SteamGame` operation methods (launch, install, uninstall)
```typescript
import { notify } from 'backend/dialog/dialog'
// In each operation:
notify({ title: info.title, body: 'Opening in Steam…' })
```

### sendFrontendMessage for install-state push
**Source:** `src/backend/ipc.ts` lines 55-64; `src/backend/storeManagers/steam/library.ts` line 41
**Apply to:** `SteamLibraryManager.refreshInstallState()`, `SteamGame.forceUninstall()`
```typescript
import { sendFrontendMessage } from '../../ipc'
// ...
sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
```

### isSideloaded runner guard pattern
**Source:** `src/frontend/screens/Game/GameSubMenu/index.tsx` line 88
**Apply to:** `GameSubMenu/index.tsx` (add `isSteam`), `GamePage/index.tsx` (use `runner !== 'steam'`)
```typescript
const isSideloaded = runner === 'sideload'
const isSteam = runner === 'steam'       // NEW — mirrors isSideloaded exactly
```

### BrowserWindow event listener
**Source:** `src/backend/main.ts` lines 207-214
**Apply to:** `main.ts` — add `'focus'` listener alongside existing `'maximize'`/`'unmaximize'` listeners
```typescript
mainWindow.on('maximize', () => sendFrontendMessage('maximized'))
// ... existing listeners ...
mainWindow.on('focus', () => {
  void libraryManagerMap['steam']?.refreshInstallState?.()
})
```

---

## No Analog Found

All files have close codebase analogs. No RESEARCH.md fallback needed.

---

## Metadata

**Analog search scope:** `src/backend/storeManagers/` (nile, gog, sideload, steam), `src/backend/main.ts`, `src/backend/main_window.ts`, `src/backend/ipc.ts`, `src/backend/utils.ts`, `src/backend/dialog/dialog.ts`, `src/frontend/screens/Game/GamePage/`, `src/frontend/screens/Game/GameSubMenu/`, `src/frontend/state/GlobalStateV2.ts`
**Files read:** 16
**Pattern extraction date:** 2026-06-28
