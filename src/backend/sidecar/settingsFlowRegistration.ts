/**
 * Curated settings read + write channel registration.
 *
 * READ side (Phase 30 Plan 06, gap closure for Gap 2 / UAT Test 8 — see
 * `.planning/debug/settings-unreachable-tauri.md`). Registers the two READ
 * invoke handlers the Settings screen and `useSettingsContext` need at mount,
 * importing the REAL backend code paths unchanged (mirrors
 * `installFlowRegistration.ts`'s own objective — prove the real logic runs
 * behind the new transport, not a reimplementation):
 *
 *   - `requestAppSettings` -> `GlobalConfig.get().getSettings()` (identical to
 *     `main.ts:998`).
 *   - `requestGameSettings(appName)` -> the exact steam-routing-then-
 *     GameConfig-fallback logic from `main.ts:1012-1015`: if the in-memory
 *     Steam library Map (`storeManagers/steam/state.ts`, exported as
 *     `library`, aliased here as `steamLibrary`) has `appName`, route through
 *     `libraryManagerMap['steam'].getGame(appName).getSettings()`; otherwise
 *     fall back to `GameConfig.get(appName).getSettings()`.
 *
 * These were originally filed under 30-PORTED-CHANNELS.md's "Deliberately NOT
 * ported this phase" list as two of the six `DownloadDialog` channels — that
 * rationale ("DownloadDialog never mounts for runner === 'steam'") only
 * considered the `DownloadDialog` call site and missed that the Settings
 * screen (`frontend/screens/Settings/index.tsx`) AND `useSettingsContext`
 * BOTH call `requestAppSettings`/`requestGameSettings` at mount, independent
 * of `DownloadDialog` — leaving Settings permanently stuck on its loading
 * gate under Tauri (UAT Test 8, Gap 2). Porting these two bounded READ
 * handlers is what makes Settings reachable AND functional.
 *
 * WRITE side + generic reads (Phase 31 Plan 01, REQ-31-01/REQ-31-02/REQ-31-05/
 * REQ-31-07). Registers `setSetting` (send/listener) + `writeConfig` (invoke)
 * — the write path every Settings toggle and `ThemeSelector` depend on — plus
 * six confirmed generic reads (`getMaxCpus`, `showUpdateSetting`,
 * `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`). See the
 * write-path block comment above `registerSettingsFlows()`'s body for the
 * accepted D-02 Tauri↔Electron divergence.
 *
 * Deliberately does NOT register `getUserInfo` (Epic-only, `main.ts:880` —
 * never reached by the Settings screen) or `readConfig` (Legendary-only,
 * `main.ts:989` — never reached by the Settings screen), nor any of the
 * runner-specific/EOS-overlay/`egsSync` channels — those stay non-fatally
 * rejecting with `UNPORTED_CHANNEL_MARKER` per SEAM.md Load-Bearing
 * Invariant B (31-RESEARCH.md Q1).
 *
 * GOG PRIVATE BRANCH (Phase 34.4 Plan 03, REQ-34.4-06). Registers
 * `getPrivateBranchPassword`/`setPrivateBranchPassword` (`main.ts:1510-1515`)
 * — a **GOG** pair, despite `.planning/IPC-PORT-INVENTORY.md`'s slice-7 list
 * filing them under "Steam ... Private branches" (that inventory groups by
 * file, not by actual runner; 34.4-RESEARCH.md's correction). They are landed
 * here, never in `steamAuthFlowRegistration.ts`, because this file already
 * imports `libraryManagerMap` (see `requestGameSettings`/`isNative` above) —
 * no new import, no new module, no new store plumbing. Both go through
 * `GOGGame.getBranchPassword()`/`setBranchPassword()`
 * (`storeManagers/gog/games.ts:1398,1402`), the SAME GOG branch-password key
 * store `main.ts` reads/writes through — this module never addresses that
 * store directly (see `storeManagers/gog/electronStores.ts`).
 */

import { existsSync, readFileSync } from 'graceful-fs'
import { cpus } from 'os'
import { isAbsolute, relative, resolve } from 'path'

import { ipcMain } from '../platform'
// Load-bearing FIRST import (mirrors installFlowRegistration.ts's /
// steamAuthFlowRegistration.ts's Phase 27 Plan 05 circular-dep fix): force
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY before the direct
// `steam/state` import below resolves. `storeManagers/index.ts` imports
// `steam/library` at its OWN top (which transitively pulls in the rest of
// steam/*) and only THEN constructs its eager `libraryManagerMap`
// (`new SteamLibraryManager()` ...), so entering through it lets every
// steam/* module finish defining its class export first. Entering through
// `steam/state` DIRECTLY (as this file's own import below does) risks the
// same re-entrant `index.ts` mid-evaluation crash `steamFlowRegistration.ts`'s
// docstring documents (`SteamLibraryManager is not a constructor`,
// esbuild-bundle-only, ts-jest's init order differs) — this fix is per-file,
// not "once is enough", because each curated registration module is its own
// independent entry point into the bundle's module graph.
import '../storeManagers'
import { GlobalConfig } from '../config'
import { GameConfig } from '../game_config'
import { libraryManagerMap } from '../storeManagers'
// NOTE: the export is `library`, not `steamLibrary` — there is no export
// named `steamLibrary` from this module. Aliased on import exactly as
// `main.ts:43` does.
import { library as steamLibrary } from '../storeManagers/steam/state'
// `writeConfig` (backend/utils.ts:1607) is already force-imported into the
// sidecar's module graph via `installFlowRegistration.ts:110`'s own
// `sendGameStatusUpdate` import from the same module — this named import
// adds zero new module-graph cost (31-RESEARCH.md "Write-Path Mechanics").
import { writeConfig } from '../utils'
import { getLogFilePath } from '../logger/paths'
import { getSystemInfo } from '../utils/systeminfo'
import { hasExecutable } from '../utils/os/path'
import { isFlatpak } from '../constants/environment'
import { gamesConfigPath } from '../constants/paths'
import type { AppSettings } from 'common/types'

/**
 * WR-01 (Phase 31 Plan 04) path-containment guard for the per-game write
 * branch of `setSetting`/`writeConfig`. `appName` is attacker-influenceable
 * text routed into a filesystem path (`join(gamesConfigPath, appName +
 * '.json')` — see `game_config.ts:36,48`), so a traversal `appName` (e.g.
 * `'../../etc/passwd'`) could otherwise escape `gamesConfigPath`. Mirrors the
 * `resolve()`+`relative()` containment idiom already proven at
 * `library.ts:1114-1119` (`locateMachOBinary`) — `join()` alone is NOT
 * containment, it does not prevent `'../../'` traversal.
 */
function isContainedGameConfig(appName: string): boolean {
  const target = resolve(gamesConfigPath, appName + '.json')
  const rel = relative(gamesConfigPath, target)
  return !(rel.startsWith('..') || isAbsolute(rel))
}

/**
 * Registers the 12 settings read/write channels (11 invoke + 1 send:
 * `setSetting`). The name "the two settings-read invoke handlers" described
 * this module at Phase 30 plan 06 and was never updated as the write side and
 * the slice-6 diagnostics channels landed. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
 */
export function registerSettingsFlows(): void {
  ipcMain.handle('requestAppSettings', async () =>
    GlobalConfig.get().getSettings()
  )

  ipcMain.handle(
    'requestGameSettings',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      if (steamLibrary.has(appName)) {
        return libraryManagerMap['steam'].getGame(appName).getSettings()
      }
      return GameConfig.get(appName).getSettings()
    }
  )

  // ── WRITE PATH (Phase 31 Plan 01, REQ-31-02/REQ-31-05/REQ-31-07) ──────────
  //
  // D-02 (accepted Tauri↔Electron divergence): both branches below persist
  // LOCALLY through this sidecar process's own store layer (global) or a raw
  // graceful-fs write (per-game) — there is no push channel that reflects a
  // Tauri-build settings change back into a concurrently running Electron
  // build, or vice versa. `useSettingsContext` already holds the just-written
  // value locally and never re-reads after `setSetting`, so no reflect-push
  // is architecturally required (31-RESEARCH.md "Write-Path Mechanics"). This
  // is the same shape of accepted, documented constraint as
  // `keyringTokenStore.ts`'s two-token divergence (Phase 28, SEAM.md
  // Stubbed) and `fileStore.ts`'s D-07 last-writer-wins clobber (Phase 29) —
  // cross-referenced here so a future reader recognizes the pattern rather
  // than treating it as a new gap.
  //
  // `setSetting` MUST be registered via `ipcMain.on`, NEVER `ipcMain.handle`
  // — per 31-RESEARCH.md Pitfall 2, a `send` channel registered as a handler
  // compiles cleanly but fails 100% silently at runtime: `dispatchSend()`
  // (`sidecarRpc.ts`) looks up `listenerRegistry`, finds an empty array, and
  // iterates zero times — no error, no log, no rejected promise. Mirrors
  // `main.ts:1046-1052` exactly.
  ipcMain.on('setSetting', (_event: unknown, payload: unknown) => {
    const { appName, key, value } = (payload ?? {}) as {
      appName?: unknown
      key?: unknown
      value?: unknown
    }
    // Type-guard non-string appName/key before writing, mirroring
    // storeWriteHandlers.ts:222-233's guard — drop (do not write) a
    // malformed frame rather than throwing.
    if (typeof appName !== 'string' || typeof key !== 'string') {
      process.stderr.write(
        '[settingsFlowRegistration] setSetting rejected a non-string appName or key\n'
      )
      return
    }
    if (appName === 'default') {
      GlobalConfig.get().setSetting(key as keyof AppSettings, value)
    } else {
      // WR-01: drop a path-escaping appName before it reaches
      // `GameConfig.get(appName)` (which joins appName into a filesystem
      // path with no containment of its own — game_config.ts:36).
      if (!isContainedGameConfig(appName)) {
        process.stderr.write(
          '[settingsFlowRegistration] setSetting dropped a path-escaping appName\n'
        )
        return
      }
      GameConfig.get(appName).setSetting(key, value)
    }
  })

  // `writeConfig` mirrors `main.ts:1042-1044` — invoked (request-response),
  // routes through the same `writeConfig()` function (backend/utils.ts:1607)
  // Electron calls, which itself branches `appName === 'default'` between the
  // `configStore`-backed global path and the raw-fs per-game path.
  ipcMain.handle('writeConfig', async (_event: unknown, payload: unknown) => {
    const { appName, config } = (payload ?? {}) as {
      appName?: string
      config?: Partial<AppSettings>
    }
    // WR-01: drop a path-escaping appName before the real writeConfig() runs
    // (it joins appName into a filesystem path with no containment of its
    // own — game_config.ts:48 / utils.ts writeConfig). Global branch
    // (appName === 'default') is unaffected.
    if (
      typeof appName === 'string' &&
      appName !== 'default' &&
      !isContainedGameConfig(appName)
    ) {
      process.stderr.write(
        '[settingsFlowRegistration] writeConfig dropped a path-escaping appName\n'
      )
      return
    }
    return writeConfig(appName as string, config ?? {})
  })

  // ── GENERIC READS (Phase 31 Plan 01, REQ-31-01) ────────────────────────────
  // Six confirmed-reachable generic reads the Steam Settings screen renders
  // (31-RESEARCH.md Q1's corrected table) — each mirrors its Electron parity
  // body verbatim. `getUserInfo`/`readConfig` are deliberately NOT registered
  // here (see the module docstring) and stay marker-rejecting (Invariant B).

  // main.ts:744
  ipcMain.handle('getMaxCpus', async () => cpus().length)

  // main.ts:755
  ipcMain.handle('showUpdateSetting', async () => !isFlatpak)

  // logger/ipc_handler.ts:17-20
  ipcMain.handle(
    'getLogContent',
    async (_event: unknown, appNameOrRunner: unknown) => {
      const logPath = getLogFilePath(
        appNameOrRunner as Parameters<typeof getLogFilePath>[0]
      )
      return existsSync(logPath) ? readFileSync(logPath, 'utf-8') : ''
    }
  )

  // utils/ipc_handler.ts:22
  ipcMain.handle('getSystemInfo', async (_event: unknown, cache?: unknown) =>
    getSystemInfo(cache as boolean | undefined)
  )

  // utils/ipc_handler.ts:28-30
  ipcMain.handle(
    'hasExecutable',
    async (_event: unknown, executable: unknown) =>
      hasExecutable(executable as string)
  )

  // main.ts:1567-1569 — NEW FINDING (31-RESEARCH.md Q1), runner-generic,
  // libraryManagerMap already imported above for requestGameSettings.
  ipcMain.handle('isNative', async (_event: unknown, payload: unknown) => {
    const { appName, runner } = (payload ?? {}) as {
      appName?: string
      runner?: keyof typeof libraryManagerMap
    }
    return libraryManagerMap[runner as keyof typeof libraryManagerMap]
      .getGame(appName as string)
      .isNative()
  })

  // ── GOG PRIVATE BRANCH (Phase 34.4 Plan 03, REQ-34.4-06) ──────────────────
  // Source: main.ts:1510-1515. GOG channels, NOT Steam — filed as "Steam" in
  // the inventory only because that document groups by file. Both route
  // through GOGGame's own accessors (storeManagers/gog/games.ts:1398,1402),
  // never through the underlying branch-password key store directly — that
  // key scheme lives in exactly one place.
  ipcMain.handle(
    'getPrivateBranchPassword',
    async (_event: unknown, ...args: unknown[]) =>
      libraryManagerMap['gog'].getGame(args[0] as string).getBranchPassword()
  )
  ipcMain.handle(
    'setPrivateBranchPassword',
    async (_event: unknown, ...args: unknown[]) =>
      libraryManagerMap['gog']
        .getGame(args[0] as string)
        .setBranchPassword(args[1] as string)
  )
}
