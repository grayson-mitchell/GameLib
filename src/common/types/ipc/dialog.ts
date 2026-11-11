import { z } from 'zod'

import type { OpenDialogOptions } from 'common/types/hostTypes'
import { type InvokeFns } from './schemaTypes'

const dialogProperty = z.enum([
  'openFile',
  'openDirectory',
  'multiSelections',
  'showHiddenFiles',
  'createDirectory',
  'promptToCreate',
  'noResolveAliases',
  'treatPackageAsDirectory',
  'dontAddToRecent'
] satisfies NonNullable<OpenDialogOptions['properties']>)

export const dialogAsyncArgs = {
  openDialog: z.tuple([
    z.strictObject({
      title: z.string().max(1024).optional(),
      defaultPath: z.string().max(4096).optional(),
      buttonLabel: z.string().max(1024).optional(),
      filters: z
        .array(
          z.strictObject({
            name: z.string().max(1024),
            extensions: z.array(z.string().max(256)).max(256)
          })
        )
        .max(64)
        .optional(),
      properties: z.array(dialogProperty).max(16).optional(),
      message: z.string().max(4096).optional(),
      securityScopedBookmarks: z.boolean().optional()
    })
  ])
}

interface DialogAsyncReturns {
  openDialog: Promise<string | false>
}

export type DialogAsync = InvokeFns<typeof dialogAsyncArgs, DialogAsyncReturns>
