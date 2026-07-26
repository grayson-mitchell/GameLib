/**
 * Curated shell/files/diagnostics channel registration (Phase 34.3 Plan 01,
 * D-14, REQ-34.3-01/REQ-34.3-02/REQ-34.3-13).
 *
 * Registers 18 of this slice's 29 channels onto electronStub's `ipcMain`
 * recorder, importing the REAL `backend/utils.ts` / `backend/utils/filesystem`
 * functions UNCHANGED:
 *
 *   send (ipcMain.on, 15):
 *     - `openExternalUrl` -> `utils.ts`'s `openUrlOrFile(args[0])` (`main.ts:735`)
 *     - `openFolder` -> `openUrlOrFile(args[0])` (`main.ts:736`)
 *     - `openSupportPage` -> `openUrlOrFile(supportURL)` (`main.ts:737`)
 *     - `openWeblate` -> `openUrlOrFile(weblateUrl)` (`main.ts:739`)
 *     - `openLoginPage` -> `openUrlOrFile(epicLoginUrl)` (`main.ts:741`)
 *     - `openDiscordLink` -> `openUrlOrFile(discordLink)` (`main.ts:742`)
 *     - `openPatreonPage` -> `openUrlOrFile(patreonPage)` (`main.ts:743`)
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
 *       (`main.ts:762-764`) — added by Task 2
 *     - `showItemInFolder` -> `utils.ts`'s `showItemInFolder(item)`, a
 *       SYNCHRONOUS function, not a promise (`main.ts:1106`)
 *
 *   invoke (ipcMain.handle, 3) — added by Task 2:
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
 * `getSystemInfo`/`hasExecutable`/`isIntelMac` PLUS four unported Phase 34.5
 * channels (`getLegendaryVersion`, `getGogdlVersion`, `getCometVersion`,
 * `getNileVersion`) — a side-effect import of either would double-register
 * channels this slice does not own (`dispatchSend` iterates ALL listeners for
 * a channel, so a duplicate registration duplicates every frontend log line)
 * and drag `backend/ipc` (which imports the real `electron`) into this
 * module's import graph. This module therefore imports only from `../utils`,
 * `../utils/filesystem`, `../schemas`, `../constants/urls`,
 * `../constants/paths`, `node:path`, `graceful-fs`, and `common/types`.
 *
 * Deliberately does NOT register:
 *   - `openReleases`, `openWebviewPage`, `openCustomThemesWiki`,
 *     `showAboutWindow` — Phase 34.1 channels already registered by
 *     `appShellFlowRegistration.ts`; `listenerRegistry` holds an ARRAY per
 *     channel, so a second registration here would double-fire them.
 *   - `showLogFileInFolder` — lives in `logger/ipc_handler.ts`, ported by
 *     plan 34.3-04 into `loggerFlowRegistration.ts`.
 */

import { ipcMain } from './electronStub'
import {
  openUrlOrFile,
  showItemInFolder as showItemInFolderImpl
} from '../utils'
import { configPath, gamesConfigPath } from '../constants/paths'
import { join } from 'node:path'
import {
  supportURL,
  weblateUrl,
  epicLoginUrl,
  discordLink,
  patreonPage,
  kofiPage,
  githubSponsorsPage,
  wineprefixFAQ,
  wikiLink,
  sidInfoUrl
} from '../constants/urls'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[shellFilesFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

/**
 * Registers this plan's 18 shell/files/diagnostics channels. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
 */
export function registerShellFilesFlows(): void {
  // ── send (12): the 12 URL openers sharing the openUrlOrFile code path ────

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

  ipcMain.on('openPatreonPage', () => {
    openUrlOrFile(patreonPage).catch((error) =>
      logSendFailure('openPatreonPage', error)
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
}
