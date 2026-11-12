import type { FrontendMessages } from 'common/types/ipc'

/** The typed backend -> frontend push every module takes through its deps (66.4-15, D-05). */
export type SendFrontendMessage = <ChannelName extends keyof FrontendMessages>(
  channel: ChannelName,
  ...args: Parameters<FrontendMessages[ChannelName]>
) => boolean

/**
 * Pushes a message to the renderer through the boot's sidecar transport (`push`).
 * @returns Whether the message got sent (always true: the transport buffers until its output
 * stream is bound, so a push before the rpc-server boot step is flushed, not dropped as the old
 * fake-window path dropped it).
 */
export function createSendFrontendMessage(
  push: (channel: string, ...args: unknown[]) => void
): SendFrontendMessage {
  return (channel, ...args) => {
    push(channel, ...args)
    return true
  }
}

/** The one-member slice a module takes when it only pushes to the renderer. */
export interface FrontendMessageDeps {
  sendFrontendMessage: SendFrontendMessage
}
