import { z } from 'zod'

import type { GamepadActionArgs } from '../../types'
import { urlArg, type InvokeFns, type SendFns } from './schemaTypes'

const noArgs = z.tuple([])

// `createNewWindow` and `clearDMFinished` are served in the preload / Tauri and never reach the
// sidecar ('local' in channelSchemas); `connectivity-changed` is a real renderer -> sidecar send.
export const testStubsSyncArgs = {
  createNewWindow: z.tuple([urlArg()]),
  clearDMFinished: noArgs,
  'connectivity-changed': z.tuple([
    z.enum(['offline', 'check-online', 'online'])
  ])
}

/*
 * These events should only be used during tests to stub/mock
 *
 * We have to handle them in another interface because these
 * events don't have an IpcMainEvent first argument when handled
 */
// JSON cannot carry `RunnerCommandStub.response` (a Promise), so only the serialisable fields
// are accepted.
const runnerCommandStubs = z.array(
  z.strictObject({
    commandParts: z.array(z.string().max(4096)).max(256),
    stdout: z.string().optional(),
    stderr: z.string().optional()
  })
)

export const testStubsTestSyncArgs = {
  setLegendaryCommandStub: z.tuple([runnerCommandStubs]),
  resetLegendaryCommandStub: noArgs,
  setGogdlCommandStub: z.tuple([runnerCommandStubs]),
  resetGogdlCommandStub: noArgs,
  setNileCommandStub: z.tuple([runnerCommandStubs]),
  resetNileCommandStub: noArgs
}

export const testStubsAsyncArgs = {
  updateAll: noArgs,
  // Served by the preload (`tauriGamepadInput.ts`); the sidecar registers nothing for it, so the
  // shape is typing-only.
  gamepadAction: z.tuple([z.custom<GamepadActionArgs>()])
}

interface TestStubsAsyncReturns {
  updateAll: Promise<({ status: 'done' | 'error' | 'abort' } | null)[]>
  gamepadAction: Promise<void>
}

export type TestStubsSync = SendFns<typeof testStubsSyncArgs>
export type TestStubsTestSync = SendFns<typeof testStubsTestSyncArgs>
export type TestStubsAsync = InvokeFns<
  typeof testStubsAsyncArgs,
  TestStubsAsyncReturns
>
