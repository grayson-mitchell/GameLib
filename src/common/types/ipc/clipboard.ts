import { z } from 'zod'

import type { InvokeFns, SendFns } from './schemaTypes'

export const clipboardSyncArgs = {
  // Empty string is legitimate; the cap is a DoS bound.
  clipboardWriteText: z.tuple([z.string().max(1_000_000)]),
  copySystemInfoToClipboard: z.tuple([])
}

export const clipboardAsyncArgs = {
  clipboardReadText: z.tuple([])
}

interface ClipboardAsyncReturns {
  clipboardReadText: string
}

export type ClipboardSync = SendFns<typeof clipboardSyncArgs>
export type ClipboardAsync = InvokeFns<
  typeof clipboardAsyncArgs,
  ClipboardAsyncReturns
>
