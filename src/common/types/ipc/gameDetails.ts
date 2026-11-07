import { z } from 'zod'

import type {
  ExtraInfo,
  GameInfo,
  GameSettings,
  InstallInfo,
  LaunchOption
} from '../../types'
import type { GameOverride, SelectiveDownload } from '../legendary'

import { installPlatform } from './install'
import {
  absolutePathArg,
  nonEmptyString,
  optionalArg,
  phase70Passthrough,
  runnerArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

// D-07: the GameInfo nested in addNewApp is a PHASE70-PASSTHROUGH. Declared keys are only the
// identity pair the sidecar routes on; Phase 70 tightens the rest. The cast keeps the derived
// call-site type the full GameInfo: zod's loose-object input type carries an index signature
// that GameInfo (an interface) cannot satisfy.
const gameInfoArg = phase70Passthrough({
  app_name: nonEmptyString(),
  runner: runnerArg()
}) as unknown as z.ZodType<GameInfo, GameInfo>

// Every key a caller sends. An empty string means "clear this override" (EditGameDialog).
const metadataOverrideFields = {
  title: z.string().max(4096).optional(),
  art_cover: z.string().max(65536).optional(),
  art_square: z.string().max(65536).optional()
}

export const gameDetailsSyncArgs = {
  addNewApp: z.tuple([gameInfoArg]),
  changeGameVersionPinnedStatus: z.tuple([
    nonEmptyString(),
    runnerArg(),
    z.boolean()
  ]),
  setGameMetadataOverride: z.tuple([
    z.strictObject({ appName: nonEmptyString(), ...metadataOverrideFields })
  ])
}

export const gameDetailsAsyncArgs = {
  kill: z.tuple([nonEmptyString(), runnerArg()]),
  getGameInfo: z.tuple([nonEmptyString(), runnerArg()]),
  getExtraInfo: z.tuple([nonEmptyString(), runnerArg()]),
  getGameSettings: z.tuple([nonEmptyString(), runnerArg()]),
  getInstallInfo: z.tuple([
    nonEmptyString(),
    runnerArg(),
    installPlatform,
    optionalArg(z.string().max(1024)),
    optionalArg(z.string().max(1024))
  ]),
  readConfig: z.tuple([z.enum(['library', 'user'])]),
  repair: z.tuple([nonEmptyString(), runnerArg()]),
  // Shape only; containment stays with the handler (D-05).
  changeInstallPath: z.tuple([
    z.strictObject({
      appName: nonEmptyString(),
      path: absolutePathArg(),
      runner: runnerArg()
    })
  ]),
  getGameMetadataOverride: z.tuple([nonEmptyString()]),
  getAllGameOverrides: noArgs,
  isGameAvailable: z.tuple([
    z.strictObject({ appName: nonEmptyString(), runner: runnerArg() })
  ]),
  getLaunchOptions: z.tuple([nonEmptyString(), runnerArg()]),
  getGameOverride: noArgs,
  getGameSdl: z.tuple([nonEmptyString()]),
  getAvailableCyberpunkMods: noArgs,
  setCyberpunkModConfig: z.tuple([
    z.strictObject({
      enabled: z.boolean(),
      modsToLoad: z.array(z.string().max(4096)).max(4096)
    })
  ])
}

type MetadataOverride = {
  title?: string
  art_cover?: string
  art_square?: string
}

interface GameDetailsAsyncReturns {
  kill: Promise<void>
  getGameInfo: Promise<GameInfo | null>
  getExtraInfo: Promise<ExtraInfo | null>
  getGameSettings: Promise<GameSettings | null>
  getInstallInfo: Promise<InstallInfo | null>
  readConfig: Promise<GameInfo[] | string>
  repair: Promise<void>
  changeInstallPath: Promise<void>
  getGameMetadataOverride: Promise<MetadataOverride | null>
  getAllGameOverrides: Promise<Record<string, MetadataOverride>>
  isGameAvailable: Promise<boolean>
  getLaunchOptions: Promise<LaunchOption[]>
  getGameOverride: Promise<GameOverride>
  getGameSdl: Promise<SelectiveDownload[]>
  getAvailableCyberpunkMods: Promise<string[]>
  setCyberpunkModConfig: Promise<void>
}

export type GameDetailsSync = SendFns<typeof gameDetailsSyncArgs>
export type GameDetailsAsync = InvokeFns<
  typeof gameDetailsAsyncArgs,
  GameDetailsAsyncReturns
>
