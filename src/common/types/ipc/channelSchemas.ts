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
import { eosOverlayAsyncArgs } from './eosOverlay'
import { shortcutsAsyncArgs, shortcutsSyncArgs } from './shortcuts'
import { runnerMiscAsyncArgs } from './runnerMisc'
import { engineAsyncArgs, engineFrontendMessagesArgs } from './engine'
import {
  loggerAsyncArgs,
  loggerFrontendMessagesArgs,
  loggerSyncArgs
} from './logger'
import {
  humbleAsyncArgs,
  humbleFrontendMessagesArgs,
  humbleSyncArgs
} from './humble'
import { enrichmentAsyncArgs } from './enrichment'
import {
  downloadQueueAsyncArgs,
  downloadQueueFrontendMessagesArgs,
  downloadQueueSyncArgs
} from './downloadQueue'
import { steamAsyncArgs, steamFrontendMessagesArgs } from './steam'
import {
  appShellAsyncArgs,
  appShellFrontendMessagesArgs,
  appShellSyncArgs
} from './appShell'
import { gogFrontendMessagesArgs } from './gog'
import { legendaryFrontendMessagesArgs } from './legendary'
import { mainProcessAsyncArgs, mainProcessSyncArgs } from './mainProcess'
import { windowAsyncArgs, windowSyncArgs } from './window'
import {
  testStubsAsyncArgs,
  testStubsSyncArgs,
  testStubsTestSyncArgs
} from './testStubs'
import { shellFilesAsyncArgs, shellFilesSyncArgs } from './shellFiles'
import {
  sidecarInternalCallers,
  sidecarInternalInvokeArgs,
  sidecarInternalSendArgs
} from './sidecarInternal'

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

const inboundEntries = mergeChannelEntries(
  defineChannelEntries('send', shellFilesSyncArgs),
  defineChannelEntries('invoke', shellFilesAsyncArgs),
  defineChannelEntries('invoke', dialogAsyncArgs),
  defineChannelEntries('send', clipboardSyncArgs),
  defineChannelEntries('invoke', clipboardAsyncArgs),
  defineChannelEntries('invoke', installAsyncArgs),
  defineChannelEntries('invoke', wineToolsAsyncArgs),
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
  defineChannelEntries('invoke', gameDetailsAsyncArgs),
  defineChannelEntries('invoke', eosOverlayAsyncArgs),
  defineChannelEntries('send', shortcutsSyncArgs),
  defineChannelEntries('invoke', shortcutsAsyncArgs),
  defineChannelEntries('invoke', runnerMiscAsyncArgs),
  defineChannelEntries('invoke', engineAsyncArgs),
  defineChannelEntries('send', loggerSyncArgs),
  defineChannelEntries('invoke', loggerAsyncArgs),
  defineChannelEntries('send', humbleSyncArgs),
  defineChannelEntries('invoke', humbleAsyncArgs),
  defineChannelEntries('invoke', enrichmentAsyncArgs),
  defineChannelEntries('send', downloadQueueSyncArgs),
  defineChannelEntries('invoke', downloadQueueAsyncArgs),
  defineChannelEntries('invoke', steamAsyncArgs),
  defineChannelEntries('send', appShellSyncArgs),
  defineChannelEntries('invoke', appShellAsyncArgs),
  defineChannelEntries('invoke', sidecarInternalInvokeArgs, {
    callers: sidecarInternalCallers
  }),
  defineChannelEntries('send', sidecarInternalSendArgs, {
    callers: sidecarInternalCallers
  }),
  defineChannelEntries('send', mainProcessSyncArgs),
  defineChannelEntries('invoke', mainProcessAsyncArgs),
  // Window controls are served by the preload's Tauri window APIs; none reaches the sidecar.
  defineChannelEntries('send', windowSyncArgs, { caller: 'local' }),
  defineChannelEntries('invoke', windowAsyncArgs, { caller: 'local' }),
  // `createNewWindow` -> Tauri WebviewWindow (preload/api/helpers.ts); `clearDMFinished` and
  // `updateAll` have no call site outside tests; `gamepadAction` is preload-served
  // (tauriGamepadInput.ts). `connectivity-changed` is a real renderer -> sidecar send.
  defineChannelEntries('send', testStubsSyncArgs, {
    caller: 'renderer',
    callers: { createNewWindow: 'local', clearDMFinished: 'local' }
  }),
  defineChannelEntries('send', testStubsTestSyncArgs, { testOnly: true }),
  defineChannelEntries('invoke', testStubsAsyncArgs, { caller: 'local' })
)

const pushEntries = mergeChannelEntries(
  defineChannelEntries('push', wineToolsFrontendMessagesArgs),
  defineChannelEntries('push', engineFrontendMessagesArgs),
  defineChannelEntries('push', loggerFrontendMessagesArgs),
  defineChannelEntries('push', humbleFrontendMessagesArgs),
  defineChannelEntries('push', downloadQueueFrontendMessagesArgs),
  defineChannelEntries('push', steamFrontendMessagesArgs),
  defineChannelEntries('push', gogFrontendMessagesArgs),
  defineChannelEntries('push', appShellFrontendMessagesArgs),
  defineChannelEntries('push', legendaryFrontendMessagesArgs)
)

/**
 * Direction-aware keying (67-18). The runtime validates inbound frames by channel name, so the
 * invoke/send namespace must be unique. A push may share a name with an inbound channel
 * (`refreshLibrary`: legendary push vs steam invoke; `connectivity-changed`: appShell push vs
 * renderer send). Those pushes live in `collidingPushSchemas` instead, so neither direction
 * shadows the other. Pushes are typing-only (D-12) and never parsed at runtime.
 */
export const collidingPushSchemas: Readonly<Record<string, ChannelEntry>> =
  Object.fromEntries(
    Object.entries(pushEntries).filter(([name]) =>
      Object.prototype.hasOwnProperty.call(inboundEntries, name)
    )
  )

export const channelSchemas: Readonly<Record<string, ChannelEntry>> =
  mergeChannelEntries(
    inboundEntries,
    Object.fromEntries(
      Object.entries(pushEntries).filter(
        ([name]) =>
          !Object.prototype.hasOwnProperty.call(collidingPushSchemas, name)
      )
    )
  )

/** The push schema for a channel name, whichever map holds it. */
export function pushSchemaFor(name: string): ChannelEntry | undefined {
  if (Object.prototype.hasOwnProperty.call(collidingPushSchemas, name)) {
    return collidingPushSchemas[name]
  }
  const entry = Object.prototype.hasOwnProperty.call(channelSchemas, name)
    ? channelSchemas[name]
    : undefined
  return entry?.kind === 'push' ? entry : undefined
}
