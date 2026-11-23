import { z } from 'zod'

import type { RuntimeName } from '../../types'
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

// RuntimeName, listed so a rename fails the call-site type check (drift guard below).
const RUNTIMES = ['eac_runtime', 'battleye_runtime', 'umu'] as const
const runtimeName = z.enum(RUNTIMES)
type RuntimeListMatchesUnion = RuntimeName extends (typeof RUNTIMES)[number]
  ? (typeof RUNTIMES)[number] extends RuntimeName
    ? true
    : never
  : never
const runtimeListMatchesUnion: RuntimeListMatchesUnion = true
void runtimeListMatchesUnion

const gogSaveLocation = z.strictObject({
  name: z.string().max(4096),
  location: pathString
}) as z.ZodType<GOGCloudSavesLocation, GOGCloudSavesLocation>
const gogSaveLocations = z.array(gogSaveLocation).max(1024)

export const runnerMiscAsyncArgs = {
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
  downloadRuntime: z.tuple([runtimeName]),
  // Phase 87 (87-17, D-14): `isRuntimeInstalled` is a native `wine` channel (`nativeChannels.json`);
  // its enum bound lives in the Rust decode. `downloadRuntime` stays here until 87-18 (D-06).
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
  downloadRuntime: Promise<boolean>
  getDefaultSavePath: Promise<string | GOGCloudSavesLocation[]>
  getPlaytimeFromRunner: Promise<number | undefined>
}

export type RunnerMiscAsync = InvokeFns<
  typeof runnerMiscAsyncArgs,
  RunnerMiscAsyncReturns
>
