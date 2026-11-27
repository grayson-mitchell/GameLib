import { z } from 'zod'

import type { EngineState } from '../engine'
import { nonEmptyString, type InvokeFns, type PushFns } from './schemaTypes'

// Runner here is a plain string, not the Runner union: the sidecar dispatches Steam to its
// adapter and the module guards (engineKeyFor / asNonSteamIdentity) own the identity check.
const gameIdentity = z.strictObject({
  runner: nonEmptyString(64),
  appName: nonEmptyString()
})

// Phase 61 Plan 13 (D-12): one store-agnostic engine domain. A game is identified by
// runner + appName; Steam is dispatched to its adapter by the sidecar.
export const engineAsyncArgs = {
  getEngineState: z.tuple([gameIdentity])
  // Phase 87 (87-28, D-14): `listEngineOptions` and `getDefaultEngine` are native `engine` channels too
  // (`nativeChannels.json`); the Rust decode accepts a game identity or `{ appName: 'default' }`, strict.
  // Phase 87 (87-28, D-14): `getPerGameBottleName` is a native `engine` channel (`nativeChannels.json`);
  // the strict identity decode lives in the Rust `parse_game_identity`.
  // Phase 87 (87-49, D-14): `dismissEngineNotice` is a native `engine` channel too; its strict three-arm
  // decode lives in the Rust `parse_dismissal_args` and its vectors in `nativeChannels.json`.
}

interface EngineAsyncReturns {
  getEngineState: Promise<EngineState | null>
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
