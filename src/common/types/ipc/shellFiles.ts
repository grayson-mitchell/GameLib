import { z } from 'zod'

import type { DiskSpaceData } from '../../types'
import {
  absolutePathArg,
  nonEmptyString,
  optionalArg,
  urlArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

export const shellFilesSyncArgs = {
  openExternalUrl: z.tuple([urlArg()]),
  openFolder: z.tuple([nonEmptyString()]),
  openSupportPage: noArgs,
  openWeblate: noArgs,
  openLoginPage: noArgs,
  openDiscordLink: noArgs,
  openKofiPage: noArgs,
  openGithubSponsorsPage: noArgs,
  openWinePrefixFAQ: noArgs,
  openWikiLink: noArgs,
  openSidInfoPage: noArgs,
  showConfigFileInFolder: z.tuple([nonEmptyString()]),
  clearCache: z.tuple([optionalArg(z.boolean()), optionalArg(z.boolean())]),
  clearAchievementCache: z.tuple([nonEmptyString()]),
  resetHeroic: noArgs,
  showItemInFolder: z.tuple([nonEmptyString()])
}

export const shellFilesAsyncArgs = {
  // Empty strings are left to the handler's Path.parse / existsSync (D-05).
  checkDiskSpace: z.tuple([z.string().max(4096)]),
  getShellPath: z.tuple([nonEmptyString()]),
  pathExists: z.tuple([z.string().max(4096)])
}

interface ShellFilesAsyncReturns {
  checkDiskSpace: Promise<DiskSpaceData>
  getShellPath: Promise<string>
  pathExists: Promise<boolean>
}

export type ShellFilesSync = SendFns<typeof shellFilesSyncArgs>
export type ShellFilesAsync = InvokeFns<
  typeof shellFilesAsyncArgs,
  ShellFilesAsyncReturns
>
