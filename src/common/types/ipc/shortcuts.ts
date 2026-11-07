import { z } from 'zod'

import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

export const shortcutsSyncArgs = {
  processShortcut: z.tuple([nonEmptyString(1024)])
}

export const shortcutsAsyncArgs = {
  shortcutsExists: z.tuple([nonEmptyString(), runnerArg()]),
  addShortcut: z.tuple([
    nonEmptyString(),
    runnerArg(),
    optionalArg(z.boolean())
  ]),
  removeShortcut: z.tuple([nonEmptyString(), runnerArg()]),
  addToSteam: z.tuple([nonEmptyString(), runnerArg()]),
  removeFromSteam: z.tuple([nonEmptyString(), runnerArg()]),
  isAddedToSteam: z.tuple([nonEmptyString(), runnerArg()])
}

interface ShortcutsAsyncReturns {
  shortcutsExists: boolean
  // Resolves whether shortcuts exist on disk once the add has settled (the `shortcutsExists`
  // predicate), never before.
  addShortcut: Promise<boolean>
  // Resolves whether shortcuts exist on disk once the removal has settled (the `shortcutsExists`
  // predicate), never before.
  removeShortcut: Promise<boolean>
  addToSteam: Promise<boolean>
  removeFromSteam: Promise<void>
  isAddedToSteam: Promise<boolean>
}

export type ShortcutsSync = SendFns<typeof shortcutsSyncArgs>
export type ShortcutsAsync = InvokeFns<
  typeof shortcutsAsyncArgs,
  ShortcutsAsyncReturns
>
