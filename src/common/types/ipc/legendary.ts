import { z } from 'zod'

// Typing-only: NOT registered in channelSchemas (name collides with steam's refreshLibrary invoke).
import { runnerArg, type PushFns } from './schemaTypes'

// D-12: typing only, never parsed at runtime.
export const legendaryFrontendMessagesArgs = {
  refreshLibrary: z.tuple([runnerArg().optional()])
}

export type LegendaryFrontendMessages = PushFns<
  typeof legendaryFrontendMessagesArgs
>
