/**
 * The channel -> schema map the sidecar validates against (Phase 67). Each conversion plan adds
 * its domain's `defineChannelEntries(...)` part to the `mergeChannelEntries` call below.
 */
import { clipboardAsyncArgs, clipboardSyncArgs } from './clipboard'
import { dialogAsyncArgs } from './dialog'
import { humbleLoginAsyncArgs, humbleLoginSyncArgs } from './humbleLogin'
import { installAsyncArgs } from './install'
import { oauthLoginAsyncArgs } from './oauthLogin'
import { storeEmbedAsyncArgs, storeEmbedSyncArgs } from './storeEmbed'
import { steamAuthAsyncArgs, steamAuthSyncArgs } from './steamAuth'
import { runnerAuthAsyncArgs, runnerAuthSyncArgs } from './runnerAuth'
import { wineToolsAsyncArgs, wineToolsFrontendMessagesArgs } from './wineTools'
import { defineChannelEntries, type ChannelEntry } from './schemaTypes'
import { gameDetailsAsyncArgs, gameDetailsSyncArgs } from './gameDetails'
import { settingsAsyncArgs, settingsSyncArgs } from './settings'
import { shellFilesAsyncArgs, shellFilesSyncArgs } from './shellFiles'

export function mergeChannelEntries(
  ...parts: Record<string, ChannelEntry>[]
): Record<string, ChannelEntry> {
  const out: Record<string, ChannelEntry> = {}
  for (const part of parts) {
    for (const [name, entry] of Object.entries(part)) {
      if (Object.prototype.hasOwnProperty.call(out, name)) {
        throw new Error(`duplicate channel schema: ${name}`)
      }
      out[name] = entry
    }
  }
  return out
}

export const channelSchemas: Readonly<Record<string, ChannelEntry>> =
  mergeChannelEntries(
    defineChannelEntries('send', shellFilesSyncArgs),
    defineChannelEntries('invoke', shellFilesAsyncArgs),
    defineChannelEntries('invoke', dialogAsyncArgs),
    defineChannelEntries('send', clipboardSyncArgs),
    defineChannelEntries('invoke', clipboardAsyncArgs),
    defineChannelEntries('invoke', installAsyncArgs),
    defineChannelEntries('invoke', wineToolsAsyncArgs),
    defineChannelEntries('push', wineToolsFrontendMessagesArgs),
    defineChannelEntries('send', runnerAuthSyncArgs),
    defineChannelEntries('invoke', runnerAuthAsyncArgs),
    defineChannelEntries('invoke', oauthLoginAsyncArgs),
    defineChannelEntries('send', humbleLoginSyncArgs),
    defineChannelEntries('invoke', humbleLoginAsyncArgs),
    defineChannelEntries('send', storeEmbedSyncArgs),
    defineChannelEntries('invoke', storeEmbedAsyncArgs),
    defineChannelEntries('send', steamAuthSyncArgs),
    defineChannelEntries('invoke', steamAuthAsyncArgs),
    defineChannelEntries('send', settingsSyncArgs),
    defineChannelEntries('invoke', settingsAsyncArgs),
    defineChannelEntries('send', gameDetailsSyncArgs),
    defineChannelEntries('invoke', gameDetailsAsyncArgs)
  )
