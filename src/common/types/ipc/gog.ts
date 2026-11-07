import { z } from 'zod'

import type { GameInfo } from '../../types'
import type { PushFns } from './schemaTypes'

// D-12: typing only, never parsed at runtime. A GameInfo built by the backend library manager;
// Phase 70 tightens the nested object.
export const gogFrontendMessagesArgs = {
  pushGameToLibrary: z.tuple([
    z.custom<GameInfo>((v) => typeof v === 'object' && v !== null)
  ])
}

export type GogFrontendMessages = PushFns<typeof gogFrontendMessagesArgs>
