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
export type TestStubsAsync = InvokeFns<
  typeof testStubsAsyncArgs,
  TestStubsAsyncReturns
>
