import { z } from 'zod'

import type {
  ExecResult,
  GameSettings,
  WineInstallation,
  WinetricksApplyResult,
  WinetricksComponent,
  WinetricksLogLine,
  WinetricksQueueState
} from '../../types'
import {
  nonEmptyString,
  runnerArg,
  wineInstallationArg,
  type InvokeFns,
  type PushFns
} from './schemaTypes'
import { gameSettingsSchema } from './settingsSchema'

// Shape half of rendererPathGuard.assertCommandParts; the handler keeps calling it (D-05).
const commandParts = z.array(z.string().max(4096)).min(1).max(256)

const verbList = z.array(nonEmptyString(256)).min(1).max(1024)

// D-11: every key and value type strict, undeclared keys rejected. Keys are optional because
// the renderer sends a persisted GameSettings (defaults merged with the game's file) and the
// defaults never set some required keys (ignoreGameUpdates, DXVKFpsCap, and on Windows
// winePrefix/wineVersion). The value is honestly partial: the handler fills the absent keys from
// the global settings before it reaches the Wine runner. The cast only bridges zod's inferred
// shape to the interface; the parity test proves the declared keys are exactly GameSettings.
const gameSettingsArg = gameSettingsSchema.partial() as unknown as z.ZodType<
  Partial<GameSettings>,
  Partial<GameSettings>
>

const protonVerb = z.enum([
  'run',
  'waitforexitandrun',
  'runinprefix',
  'destroyprefix',
  'getcompatpath',
  'getnativepath'
])

const toolArgs = z.strictObject({
  appName: nonEmptyString(),
  action: z.enum(['backup', 'restore'])
})

export const wineToolsAsyncArgs = {
  // WineCommandArgs minus `options` and `onSpawn`, which are backend-internal (a function and a
  // runner-options bag a renderer never sends).
  runWineCommand: z.tuple([
    z.strictObject({
      commandParts,
      wait: z.boolean().optional(),
      protonVerb: protonVerb.optional(),
      gameSettings: gameSettingsArg.optional(),
      gameInstallPath: z.string().max(4096).optional(),
      installFolderName: z.string().max(1024).optional(),
      startFolder: z.string().max(4096).optional(),
      skipPrefixCheckIKnowWhatImDoing: z.boolean().optional(),
      ignoreLogging: z.boolean().optional(),
      resolveOnExit: z.boolean().optional()
    })
  ]),
  winetricksInstalled: z.tuple([runnerArg(), nonEmptyString()]),
  winetricksAvailable: z.tuple([runnerArg(), nonEmptyString()]),
  // Phase 45 Plan 01 (D-11/D-12/D-13): the sequential-install queue. Phase 45 Plan 02 (D-11
  // promote) then retired the send-kind `winetricksInstall` that used to sit above this block --
  // `winetricksApply` is now the only renderer-reachable install path.
  winetricksApply: z.tuple([runnerArg(), nonEmptyString(), verbList]),
  winetricksQueueState: z.tuple([runnerArg(), nonEmptyString()]),
  winetricksCancelRemaining: z.tuple([runnerArg(), nonEmptyString()]),
  getAlternativeWine: z.tuple([]),
  runWineCommandForGame: z.tuple([
    z.strictObject({
      appName: nonEmptyString(),
      runner: runnerArg(),
      commandParts,
      wait: z.boolean().optional(),
      pendingInstall: z.boolean().optional()
    })
  ]),
  // Phase 87 (87-20, D-14): `installWineVersion` and `removeWineVersion` are native `wine` channels
  // too (`nativeChannels.json`); the strict eleven-key decode lives in the Rust `parse_wine_version`.
  // Phase 87 (87-20, D-14): `refreshWineVersionInfo` is a native `wine` channel (`nativeChannels.json`).
  'wine.isValidVersion': z.tuple([wineInstallationArg()]),
  toggleDXVK: z.tuple([toolArgs]),
  toggleVKD3D: z.tuple([toolArgs]),
  toggleDXVKNVAPI: z.tuple([toolArgs])
}

interface WineToolsAsyncReturns {
  runWineCommand: Promise<{ stdout: string; stderr: string }>
  winetricksInstalled: Promise<string[]>
  winetricksAvailable: Promise<WinetricksComponent[]>
  winetricksApply: Promise<WinetricksApplyResult>
  winetricksQueueState: Promise<WinetricksQueueState>
  winetricksCancelRemaining: Promise<WinetricksQueueState>
  getAlternativeWine: Promise<WineInstallation[]>
  runWineCommandForGame: Promise<ExecResult>
  'wine.isValidVersion': Promise<boolean>
  toggleDXVK: Promise<boolean>
  toggleVKD3D: Promise<boolean>
  toggleDXVKNVAPI: Promise<boolean>
}

// D-12: push schemas are for typing only; nothing parses them at runtime. `z.custom` carries a
// backend-owned structural type without restating it.
export const wineToolsFrontendMessagesArgs = {
  wineVersionsUpdated: z.tuple([]),
  progressOfWinetricks: z.tuple([
    z.strictObject({
      messages: z.array(z.string()),
      installingComponent: z.string(),
      // Set only on the `['Done']` event: true when winetricks exited non-zero
      // (or by signal). Absent on every intermediate progress event.
      failed: z.boolean().optional(),
      // Populated by Phase 45 Plan 06.
      lines: z.array(z.custom<WinetricksLogLine>()).optional(),
      percent: z.number().optional()
    })
  ]),
  'installing-winetricks-component': z.tuple([z.string()]),
  // Phase 45 Plan 01 (D-11/D-12/D-13): pushed on every queue-state transition for the
  // currently-open game's winetricks tab.
  winetricksQueueChanged: z.tuple([z.custom<WinetricksQueueState>()])
}

export type WineToolsAsync = InvokeFns<
  typeof wineToolsAsyncArgs,
  WineToolsAsyncReturns
>
export type WineToolsFrontendMessages = PushFns<
  typeof wineToolsFrontendMessagesArgs
>
