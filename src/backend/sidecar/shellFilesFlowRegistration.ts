/**
 * Curated shell/files/diagnostics channel registration (Phase 34.3 Plans 01
 * and 02, D-14, REQ-34.3-01/REQ-34.3-02/REQ-34.3-05/REQ-34.3-06/REQ-34.3-13).
 *
 * Registers 20 of this slice's 28 channels onto electronStub's `ipcMain`
 * recorder, importing the REAL `backend/utils.ts` / `backend/utils/filesystem`
 * functions UNCHANGED:
 *
 *   send (ipcMain.on, 17):
 *     - `openExternalUrl` -> `utils.ts`'s `openUrlOrFile(args[0])` (`main.ts:735`)
 *     - `openFolder` -> `openUrlOrFile(args[0])` (`main.ts:736`)
 *     - `openSupportPage` -> `openUrlOrFile(supportURL)` (`main.ts:737`)
 *     - `openWeblate` -> `openUrlOrFile(weblateUrl)` (`main.ts:739`)
 *     - `openLoginPage` -> `openUrlOrFile(epicLoginUrl)` (`main.ts:741`)
 *     - `openDiscordLink` -> `openUrlOrFile(discordLink)` (`main.ts:742`)
 *     - `openKofiPage` -> `openUrlOrFile(kofiPage)` (`main.ts:744`)
 *     - `openGithubSponsorsPage` -> `openUrlOrFile(githubSponsorsPage)` (`main.ts:745`)
 *     - `openWinePrefixFAQ` -> `openUrlOrFile(wineprefixFAQ)` (`main.ts:748`)
 *     - `openWikiLink` -> `openUrlOrFile(wikiLink)` (`main.ts:750`)
 *     - `openSidInfoPage` -> `openUrlOrFile(sidInfoUrl)` (`main.ts:751`)
 *     - `showConfigFileInFolder` -> inline two-branch body: `args[0] === 'default'`
 *       -> `openUrlOrFile(configPath)`, else -> `openUrlOrFile(join(gamesConfigPath,
 *       '${appName}.json'))` (`main.ts:755-760`)
 *     - `removeFolder` -> `utils.ts`'s `removeFolder(path, folderName)` — `args[0]`
 *       is a TWO-ELEMENT ARRAY `[path, folderName]`, not two positional args
 *       (`main.ts:762-764`)
 *     - `showItemInFolder` -> `utils.ts`'s `showItemInFolder(item)`, a
 *       SYNCHRONOUS function, not a promise (`main.ts:1106`)
 *     - `clearCache` -> `utils.ts`'s `clearCache(undefined, fromVersionChange)`
 *       + `pushFrontendMessage('refreshLibrary')` + (only when `args[0]` is
 *       truthy) `showDialogBoxModalAuto` called with NO `event` property
 *       (sidecar `send` listeners never have one — this takes the
 *       `sendFrontendMessage('showDialog', ...)` branch, `dialog.ts:23-31`,
 *       which never throws), reproducing `main.ts:787-803`'s exact body
 *     - `clearAchievementCache` -> `utils.ts`'s `clearAchievementCache(appName)`
 *       + `logInfo(...)` from `../logger` (`main.ts:805-811`)
 *     - `resetHeroic` -> `utils.ts`'s `resetHeroic()`, UNMODIFIED — no
 *       build-conditional branch added here or in `utils.ts`; the
 *       `app.relaunch()` -> `app.quit()` ordering race is fixed entirely
 *       inside `electronStub` by plan 34.3-05 (`main.ts:813`)
 *
 *   invoke (ipcMain.handle, 3):
 *     - `checkDiskSpace` -> `utils/filesystem`'s `getDiskInfo`/`isWritable`/
 *       `isAccessibleWithinFlatpakSandbox`, gated by the zod `Path` schema's
 *       `.parse()` — this throw-on-invalid-input IS the ASVS V5 control for
 *       this channel (T-34.3-01); it is preserved unchanged, never swapped
 *       for node's `path.parse` and never wrapped in a try/catch that would
 *       swallow the validation error (`main.ts:668-684`)
 *     - `getShellPath` -> `utils.ts`'s `getShellPath(path)` (`main.ts:1421`)
 *     - `pathExists` -> `graceful-fs`'s `existsSync(path)`, the same module
 *       `main.ts:27` imports it from (`main.ts:1461-1463`)
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime — no reject, no timeout, no console line (Phase 31
 * Pitfall 2, and the `sidecar-send-channels-fail-silently` project memory).
 * Every registration below was cross-checked against `main.ts`'s own
 * `addHandler`/`addListener` call for that exact channel before being written
 * (T-34.3-04).
 *
 * D-14 (curated-import discipline, inherited from Phase 30 D-08 -> 34.1 D-09
 * -> 34.2 D-04): import the UNDERLYING module, never a feature module's
 * `ipc_handler.ts`. This slice must be especially careful: `logger/ipc_handler.ts`
 * ALSO registers the already-ported `getLogContent` and `logError` (ported early
 * via 34.2-16) alongside three of this slice's channels, and
 * `utils/ipc_handler.ts` ALSO registers the already-ported `abort`/
 * `getSystemInfo`/`hasExecutable` PLUS four unported Phase 34.5
 * channels (`getLegendaryVersion`, `getGogdlVersion`, `getCometVersion`,
 * `getNileVersion`) — a side-effect import of either would double-register
 * channels this slice does not own (`dispatchSend` iterates ALL listeners for
 * a channel, so a duplicate registration duplicates every frontend log line)
 * and drag `backend/ipc` (which imports the real `electron`) into this
 * module's import graph. This module therefore imports only from `../utils`,
 * `../utils/filesystem`, `../schemas`, `../constants/urls`,
 * `../constants/paths`, `../dialog/dialog`, `../logger`, `./sidecarRpc`,
 * `i18next`, `node:path`, `graceful-fs`, and `common/types`.
 *
 * Scope honesty (Phase 34.3 Plan 02): `resetHeroic` is narrower than its UI
 * copy claims — it deletes ONLY `configPath` (`config.json`) and
 * `gamesConfigPath` (`GamesConfig/`). The Steam token/library store, all 10
 * Humble stores, the download manager, and the Wine/wiki/crossover caches
 * all survive as siblings in `appFolder`. The dialog's "removes all Settings
 * and Caching" copy already overclaims in Electron; that is inherited,
 * out-of-scope UI copy, not a defect this plan introduces or fixes.
 *
 * Deliberately does NOT register:
 *   - `openReleases`, `openWebviewPage`, `openCustomThemesWiki`,
 *     `showAboutWindow` — Phase 34.1 channels already registered by
 *     `appShellFlowRegistration.ts`; `listenerRegistry` holds an ARRAY per
 *     channel, so a second registration here would double-fire them.
 *   - `showLogFileInFolder` — lives in `logger/ipc_handler.ts`, ported by
 *     plan 34.3-04 into `loggerFlowRegistration.ts`.
 */

import { ipcMain } from '../platform'
import {
  openUrlOrFile,
  showItemInFolder as showItemInFolderImpl,
  getShellPath,
  removeFolder,
  getFileSize,
  clearCache,
  clearAchievementCache,
  resetHeroic
} from '../utils'
import {
  getDiskInfo,
  isWritable,
  isAccessibleWithinFlatpakSandbox
} from '../utils/filesystem'
import { Path } from '../schemas'
import { existsSync } from 'graceful-fs'
import { configPath, gamesConfigPath } from '../constants/paths'
import { join } from 'node:path'
import {
  supportURL,
  weblateUrl,
  epicLoginUrl,
  discordLink,
  kofiPage,
  githubSponsorsPage,
  wineprefixFAQ,
  wikiLink,
  sidInfoUrl
} from '../constants/urls'
import { showDialogBoxModalAuto } from '../dialog/dialog'
import { pushFrontendMessage } from './sidecarRpc'
import { logInfo, LogPrefix } from '../logger'
import i18next from 'i18next'
import type { DiskSpaceData } from 'common/types'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[shellFilesFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

/**
 * Registers this module's 20 shell/files/diagnostics channels (17 from Plan
 * 01, plus Plan 02's `clearCache`/`clearAchievementCache`/`resetHeroic`).
 * Called once from `handlers.ts` — this module owns no side effects at
 * import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerShellFilesFlows(): void {
  // ── send (11): the 11 URL openers sharing the openUrlOrFile code path ────

  ipcMain.on('openExternalUrl', (_event: unknown, ...args: unknown[]) => {
    openUrlOrFile(args[0] as string).catch((error) =>
      logSendFailure('openExternalUrl', error)
    )
  })

  ipcMain.on('openFolder', (_event: unknown, ...args: unknown[]) => {
    openUrlOrFile(args[0] as string).catch((error) =>
      logSendFailure('openFolder', error)
    )
  })

  ipcMain.on('openSupportPage', () => {
    openUrlOrFile(supportURL).catch((error) =>
      logSendFailure('openSupportPage', error)
    )
  })

  ipcMain.on('openWeblate', () => {
    openUrlOrFile(weblateUrl).catch((error) =>
      logSendFailure('openWeblate', error)
    )
  })

  ipcMain.on('openLoginPage', () => {
    openUrlOrFile(epicLoginUrl).catch((error) =>
      logSendFailure('openLoginPage', error)
    )
  })

  ipcMain.on('openDiscordLink', () => {
    openUrlOrFile(discordLink).catch((error) =>
      logSendFailure('openDiscordLink', error)
    )
  })

  ipcMain.on('openKofiPage', () => {
    openUrlOrFile(kofiPage).catch((error) =>
      logSendFailure('openKofiPage', error)
    )
  })

  ipcMain.on('openGithubSponsorsPage', () => {
    openUrlOrFile(githubSponsorsPage).catch((error) =>
      logSendFailure('openGithubSponsorsPage', error)
    )
  })

  ipcMain.on('openWinePrefixFAQ', () => {
    openUrlOrFile(wineprefixFAQ).catch((error) =>
      logSendFailure('openWinePrefixFAQ', error)
    )
  })

  ipcMain.on('openWikiLink', () => {
    openUrlOrFile(wikiLink).catch((error) =>
      logSendFailure('openWikiLink', error)
    )
  })

  ipcMain.on('openSidInfoPage', () => {
    openUrlOrFile(sidInfoUrl).catch((error) =>
      logSendFailure('openSidInfoPage', error)
    )
  })

  // ── send (1): showConfigFileInFolder — reproduces main.ts:755-760's exact
  // two-branch body ─────────────────────────────────────────────────────────

  ipcMain.on(
    'showConfigFileInFolder',
    (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const target =
        appName === 'default'
          ? configPath
          : join(gamesConfigPath, `${appName}.json`)
      openUrlOrFile(target).catch((error) =>
        logSendFailure('showConfigFileInFolder', error)
      )
    }
  )

  // ── send (1): showItemInFolder — SYNCHRONOUS body (main.ts:1106), wrapped
  // in a plain try/catch rather than a promise `.catch()` ───────────────────

  ipcMain.on('showItemInFolder', (_event: unknown, ...args: unknown[]) => {
    try {
      showItemInFolderImpl(args[0] as string)
    } catch (error) {
      logSendFailure('showItemInFolder', error)
    }
  })

  // ── send (1): removeFolder — args[0] is a TWO-ELEMENT ARRAY, not two
  // positional args (main.ts:762-764) ───────────────────────────────────────

  ipcMain.on('removeFolder', (_event: unknown, ...args: unknown[]) => {
    try {
      const [folderPath, folderName] = args[0] as [string, string]
      removeFolder(folderPath, folderName)
    } catch (error) {
      logSendFailure('removeFolder', error)
    }
  })

  // ── send (1): clearCache — reproduces main.ts:787-803's exact body. The
  // dialog is called with NO `event` property: sidecar `send` listeners
  // never have one, so `showDialogBoxModalAuto` always takes its
  // `sendFrontendMessage('showDialog', ...)` branch (`dialog.ts:23-31`),
  // which never throws. `refreshLibrary` rides the generic frontend_message
  // relay via `pushFrontendMessage` — zero new Rust arms ─────────────────────

  ipcMain.on('clearCache', (_event: unknown, ...args: unknown[]) => {
    try {
      const showDialog = args[0]
      const fromVersionChange = args[1] === true
      clearCache(undefined, fromVersionChange)
      pushFrontendMessage('refreshLibrary')

      if (showDialog) {
        showDialogBoxModalAuto({
          title: i18next.t('box.cache-cleared.title', 'Cache Cleared'),
          message: i18next.t(
            'box.cache-cleared.message',
            'GameLib Cache Was Cleared!'
          ),
          type: 'MESSAGE',
          buttons: [{ text: i18next.t('box.ok', 'Ok') }]
        })
      }
    } catch (error) {
      logSendFailure('clearCache', error)
    }
  })

  // ── send (1): clearAchievementCache — main.ts:805-811 ─────────────────────

  ipcMain.on('clearAchievementCache', (_event: unknown, ...args: unknown[]) => {
    try {
      const appName = args[0] as string
      clearAchievementCache(appName)
      logInfo(
        'Achievement cache was cleared for game: ' + appName,
        LogPrefix.Backend
      )
    } catch (error) {
      logSendFailure('clearAchievementCache', error)
    }
  })

  // ── send (1): resetHeroic — main.ts:813. Calls the UNMODIFIED utils.ts
  // body; no build-conditional branch here or in utils.ts. The relaunch/quit
  // ordering race is fixed entirely inside electronStub by plan 34.3-05.
  // Real blast radius: deletes ONLY configPath + gamesConfigPath — every
  // other electron-store file in appFolder (Steam token/library, all 10
  // Humble stores, download manager, Wine/wiki/crossover caches) survives ──

  ipcMain.on('resetHeroic', () => {
    try {
      resetHeroic()
    } catch (error) {
      logSendFailure('resetHeroic', error)
    }
  })

  // ── invoke (3): filesystem/diagnostics ────────────────────────────────────

  ipcMain.handle(
    'checkDiskSpace',
    async (_event: unknown, ...args: unknown[]): Promise<DiskSpaceData> => {
      // T-34.3-01 (mitigate): Path.parse is the zod schema's OWN validation —
      // it throws on an invalid path. This is the ASVS V5 control for this
      // channel; it must never be swapped for node's `path.parse` and must
      // never be wrapped in a try/catch that swallows the rejection.
      const parsedPath = Path.parse(args[0] as string)

      const { freeSpace, totalSpace } = await getDiskInfo(parsedPath)
      const pathIsWritable = await isWritable(parsedPath)
      const pathIsFlatpakAccessible =
        isAccessibleWithinFlatpakSandbox(parsedPath)

      return {
        free: freeSpace,
        diskSize: totalSpace,
        validPath: pathIsWritable,
        validFlatpakPath: pathIsFlatpakAccessible,
        message: `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}`
      }
    }
  )

  ipcMain.handle('getShellPath', async (_event: unknown, ...args: unknown[]) =>
    getShellPath(args[0] as string)
  )

  ipcMain.handle('pathExists', async (_event: unknown, ...args: unknown[]) =>
    existsSync(args[0] as string)
  )
}
