import { z } from 'zod'

import type {
  ButtonOptions,
  ConnectivitySnapshot,
  DialogType,
  GameStatus,
  RecentGame,
  Release,
  AppManagementStatus,
  WineManagerStatus
} from '../../types'
import type { RunsForMeState } from '../../runsForMe'
import type { SignInProbeOutcomeMap } from '../../signInState'
import {
  nonEmptyString,
  runnerArg,
  urlArg,
  type InvokeFns,
  type PushFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

export const appShellSyncArgs = {
  // BCP-47-ish tag; the handler maps it onto a shipped language.
  changeLanguage: z.tuple([nonEmptyString(35)]),
  notify: z.tuple([
    z.strictObject({
      title: z.string().max(512),
      body: z.string().max(8192)
    })
  ]),
  dialogDisplayed: z.tuple([nonEmptyString(256)]),
  frontendReady: noArgs,
  lock: z.tuple([z.boolean()]),
  unlock: noArgs,
  quit: noArgs,
  openReleases: noArgs,
  // Scheme allow-list is Phase 72 (T-67-53).
  openWebviewPage: z.tuple([urlArg()]),
  openAppManagementSettings: noArgs,
  relaunchApp: noArgs,
  abort: z.tuple([nonEmptyString(256)]),
  changeTrayColor: noArgs,
  // The renderer reads these from computed CSS, so every value is a string; the handler is a
  // logged no-op under Tauri.
  setTitleBarOverlay: z.tuple([
    z.strictObject({
      color: z.string().max(256).optional(),
      symbolColor: z.string().max(256).optional(),
      height: z.union([z.number(), z.string().max(64)]).optional()
    })
  ])
}

export const appShellAsyncArgs = {
  getHeroicVersion: noArgs,
  getAppManagementStatus: noArgs,
  getLatestReleases: noArgs,
  getCurrentChangelog: noArgs,
  getWebviewPreloadPath: noArgs,
  getLoginBackground: noArgs
}

interface AppShellAsyncReturns {
  getHeroicVersion: string
  getAppManagementStatus: Promise<AppManagementStatus>
  getLatestReleases: Promise<Release[]>
  getCurrentChangelog: Promise<Release | null>
  getWebviewPreloadPath: string
  // Resolves a `data:` URL for the configured Manage Accounts background, or
  // '' to mean "use the bundled default artwork".
  getLoginBackground: Promise<string>
}

// D-12: typing only, never parsed at runtime. Every payload originates in the backend.
export const appShellFrontendMessagesArgs = {
  gameStatusUpdate: z.tuple([z.custom<GameStatus>()]),
  showDialog: z.tuple([
    z.string(),
    z.string(),
    z.custom<DialogType>(),
    z.custom<Array<ButtonOptions>>().optional(),
    z.string().optional()
  ]),
  maximized: noArgs,
  unmaximized: noArgs,
  fullscreen: z.tuple([z.boolean()]),
  'connectivity-changed': z.tuple([z.custom<ConnectivitySnapshot>()]),
  launchGame: z.tuple([z.string(), runnerArg(), z.array(z.string())]),
  installGame: z.tuple([z.string(), runnerArg()]),
  recentGamesChanged: z.tuple([z.custom<RecentGame[]>()]),
  // WR-04: a per-game setting write failed twice; the renderer re-reads the stored value
  gameSettingWriteFailed: z.tuple([
    z.strictObject({ appName: z.string(), key: z.string() })
  ]),
  progressOfWineManager: z.tuple([z.string(), z.custom<WineManagerStatus>()]),
  metadataChanged: z.tuple([
    z.custom<
      Record<
        string,
        { title?: string; art_cover?: string; art_square?: string }
      >
    >()
  ]),
  // Phase 19 (Plan 06): pushed after a validated background CrossOver-index
  // refresh so the grid picks up freshly resolved ratings without a manual
  // pull. Same three-state shape as `getCrossoverIndex`'s resolved map.
  crossoverIndexChanged: z.tuple([z.custom<Record<string, number | null>>()]),
  // Quick 261029-mkz: full "Runs for me" map, pushed after every change.
  runsForMeChanged: z.tuple([z.custom<Record<string, RunsForMeState>>()]),
  // Phase 49 (49-04), D-08: this launch's per-store sign-in probe outcomes,
  // pushed after each probe settles and after each sign-in or sign-out. The
  // payload carries outcome labels only -- never a token, cookie, error text or
  // account identifier (T-49-09).
  signInProbeOutcomes: z.tuple([
    z.strictObject({ outcomes: z.custom<SignInProbeOutcomeMap>() })
  ]),
  // Used inside tests, so we can be a bit lenient with the type checking here
  message: z.tuple([]).rest(z.unknown())
}

export type AppShellSync = SendFns<typeof appShellSyncArgs>
export type AppShellAsync = InvokeFns<
  typeof appShellAsyncArgs,
  AppShellAsyncReturns
>
export type AppShellFrontendMessages = PushFns<
  typeof appShellFrontendMessagesArgs
>
