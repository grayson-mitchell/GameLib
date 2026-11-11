/**
 * OS notifications (D-66.3-01) via tauri-plugin-notification's notification_show arm. Holds no
 * state. `show` never throws: a rejected invoke reports through `onFailed`, and a throwing
 * callback is caught and warned. The logging of a failed notification lives in the consumer
 * (`backend/dialog/dialog.ts`'s notify()), not here.
 */

import { RUST_NOTIFICATION_SHOW } from 'common/types/sidecarTransport'
import type { RequestRustInvoke } from './index'

export interface Notifications {
  show(
    options: { title?: string; body?: string },
    callbacks?: {
      onShown?: (backend?: string) => void
      onFailed?: (message: string) => void
    }
  ): void
}

export function createNotifications(deps: {
  requestRustInvoke: RequestRustInvoke
}): Notifications {
  return {
    show(options, callbacks) {
      deps
        .requestRustInvoke(RUST_NOTIFICATION_SHOW, [
          { title: options?.title, body: options?.body }
        ])
        .then((result) => {
          const backend = typeof result === 'string' ? result : undefined
          try {
            callbacks?.onShown?.(backend)
          } catch (listenerError) {
            console.warn(
              "[host] notifications 'show' callback threw:",
              listenerError instanceof Error
                ? listenerError.message
                : String(listenerError)
            )
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(
            `[host] notifications.show(): ${RUST_NOTIFICATION_SHOW} failed:`,
            message
          )
          try {
            callbacks?.onFailed?.(message)
          } catch (listenerError) {
            console.warn(
              "[host] notifications 'failed' callback threw:",
              listenerError instanceof Error
                ? listenerError.message
                : String(listenerError)
            )
          }
        })
    }
  }
}
