import { z } from 'zod'

import type { GameAchievement, GOGCloudSavesLocation } from '../gog'
import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Shape only (D-05): bounded, NUL-free. Absoluteness and containment stay with the handler and
// the runner CLI (a save path can legitimately be empty or relative to a GOG variable).
const pathString = z
  .string()
  .max(4096)
  .refine((p) => !p.includes(String.fromCharCode(0)), 'NUL byte')

// The tool names the callTool handler dispatches on (its switch), nothing else.
const toolName = z.enum(['winecfg', 'runExe'])

const gogSaveLocation = z.strictObject({
  name: z.string().max(4096),
  location: pathString
}) as z.ZodType<GOGCloudSavesLocation, GOGCloudSavesLocation>
const gogSaveLocations = z.array(gogSaveLocation).max(1024)

export const runnerMiscAsyncArgs = {
  // Phase 87 (87-36, D-23): `callTool` is a scheduled resolver (`sidecar/engineWineResolvers.ts`) over the Rust
  // `wine_tool_call` op; the sidecar still receives it as a renderer invoke, so this strict decode stays.
  callTool: z.tuple([
    z.strictObject({
      tool: toolName,
      exe: optionalArg(pathString),
      appName: nonEmptyString(),
      runner: runnerArg()
    })
  ]),
  getLegendaryVersion: noArgs,
  getGogdlVersion: noArgs,
  getCometVersion: noArgs,
  getNileVersion: noArgs,
  getAchievements: z.tuple([
    nonEmptyString(),
    runnerArg(),
    optionalArg(nonEmptyString(64))
  ]),
  getGOGLinuxInstallersLangs: z.tuple([nonEmptyString()]),
  egsSync: z.tuple([pathString]),
  syncGOGSaves: z.tuple([
    gogSaveLocations,
    nonEmptyString(),
    z.string().max(64)
  ]),
  syncSaves: z.tuple([
    z.strictObject({
      arg: optionalArg(z.string().max(64)),
      path: pathString,
      appName: nonEmptyString(),
      runner: runnerArg()
    })
  ]),
  // Phase 87 (87-17, 87-18, D-14): `isRuntimeInstalled` and `downloadRuntime` are native `wine`
  // channels (`nativeChannels.json`); their enum bound lives in the Rust decode.
  getDefaultSavePath: z.tuple([
    nonEmptyString(),
    runnerArg(),
    gogSaveLocations
  ]),
  getPlaytimeFromRunner: z.tuple([runnerArg(), nonEmptyString()])
}

interface RunnerMiscAsyncReturns {
  callTool: Promise<void>
  getLegendaryVersion: Promise<string>
  getGogdlVersion: Promise<string>
  getCometVersion: Promise<string>
  getNileVersion: Promise<string>
  getAchievements: Promise<GameAchievement[]>
  getGOGLinuxInstallersLangs: Promise<string[]>
  egsSync: Promise<string>
  syncGOGSaves: Promise<string>
  syncSaves: Promise<string>
  getDefaultSavePath: Promise<string | GOGCloudSavesLocation[]>
  getPlaytimeFromRunner: Promise<number | undefined>
}

export type RunnerMiscAsync = InvokeFns<
  typeof runnerMiscAsyncArgs,
  RunnerMiscAsyncReturns
>
