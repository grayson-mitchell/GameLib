import { pushFrontendMessage } from 'backend/sidecar/sidecarRpc'

import type { FrontendMessages } from 'common/types/ipc'

/**
 * Pushes a message to the renderer through the sidecar transport (`pushFrontendMessage`).
 * @returns Whether the message got sent (always true: the transport buffers until its output
 * stream is bound, so a push before the rpc-server boot step is flushed, not dropped as the old
 * fake-window path dropped it).
 *
 * This replaced a removed main-window `webContents.send(...)` that went through the platform
 * shim's fake window, whose `isDestroyed()` was always false; the destroyed-window guard
 * (debug/steam-install-slow-start, Thread D-1) is moot with no window object.
 */
function sendFrontendMessage<ChannelName extends keyof FrontendMessages>(
  channel: ChannelName,
  ...args: Parameters<FrontendMessages[ChannelName]>
): boolean {
  pushFrontendMessage(channel, ...args)
  return true
}

export { sendFrontendMessage }
