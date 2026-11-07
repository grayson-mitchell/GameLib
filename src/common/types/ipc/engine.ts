import { z } from 'zod'

import type {
  EngineNoticeDismissal,
  EngineOption,
  EngineState
} from '../engine'
import { nonEmptyString, type InvokeFns, type PushFns } from './schemaTypes'

const noArgs = z.tuple([])

// Runner here is a plain string, not the Runner union: the sidecar dispatches Steam to its
// adapter and the module guards (engineKeyFor / asNonSteamIdentity) own the identity check.
const gameIdentity = z.strictObject({
  runner: nonEmptyString(64),
  appName: nonEmptyString()
})

// The renderer constructs both arms itself, so they are strict.
const noticeDismissal = z.union([
  z.strictObject({ kind: z.literal('no-crossover') }),
  z.strictObject({
    kind: z.literal('untested-crossover'),
    build: nonEmptyString(256)
  })
]) as z.ZodType<EngineNoticeDismissal, EngineNoticeDismissal>

// Phase 61 Plan 13 (D-12): one store-agnostic engine domain. A game is identified by
// runner + appName; Steam is dispatched to its adapter by the sidecar.
export const engineAsyncArgs = {
  getEngineState: z.tuple([gameIdentity]),
  listEngineOptions: z.tuple([
    z.union([gameIdentity, z.strictObject({ appName: z.literal('default') })])
  ]),
  // D-09: the global default engine
  getDefaultEngine: noArgs,
  // D-17: the per-game bottle name for the install dialogs
  getPerGameBottleName: z.tuple([gameIdentity]),
  dismissEngineNotice: z.tuple([noticeDismissal])
}

interface EngineAsyncReturns {
  getEngineState: Promise<EngineState | null>
  listEngineOptions: Promise<EngineOption[]>
  getDefaultEngine: Promise<{
    effectiveEngineId: string
    engineSource: 'stored' | 'derived'
    legacyLabel: string | null
  }>
  getPerGameBottleName: Promise<string | null>
  dismissEngineNotice: Promise<{ ok: boolean }>
}

export type EngineAsync = InvokeFns<typeof engineAsyncArgs, EngineAsyncReturns>

// D-12: typing only, never parsed at runtime. The payload is the backend-built EngineState.
export const engineFrontendMessagesArgs = {
  engineStateChanged: z.tuple([
    z.custom<EngineState>(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { runner?: unknown }).runner === 'string' &&
        typeof (v as { appName?: unknown }).appName === 'string'
    )
  ])
}

export type EngineFrontendMessages = PushFns<typeof engineFrontendMessagesArgs>
