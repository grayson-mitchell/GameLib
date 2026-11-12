/**
 * Native dialogs (D-66.3-01), forwarded to the Rust shell over `requestRustInvoke`. Holds one
 * piece of state, the in-app dialog display-ack table (`displayAcks`). No method throws or rejects (incident sidecar-dialog-reject-crashes): callers `await`
 * these unguarded, and a rejection would crash the sidecar.
 *
 * D-07 fail-safe-to-decline: `showMessageBox` resolves the CALLER's own declared `cancelId`
 * (never a positional "last index" guess) on a transport error, timeout or dismissal. Any
 * caller whose safe button is not the last index must declare `cancelId`.
 */

import {
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type {
  MessageBoxOptions,
  OpenDialogOptions
} from 'common/types/hostTypes'
import { createDisplayAcks, type DisplayAcks } from '../dialog/displayAck'
import type { RequestRustInvoke } from './index'

type SaveDialogOptions = RustInvokeArgsOf<typeof RUST_DIALOG_SAVE>[0]

export interface Dialogs {
  /** Correlates an in-app dialog frame with the renderer's "it is on screen" ack (66.4-18). */
  readonly displayAcks: DisplayAcks
  showErrorBox(title?: string, content?: string): Promise<void>
  showMessageBox(
    options: MessageBoxOptions
  ): Promise<{ response: number; checkboxChecked?: boolean }>
  showOpenDialog(
    options: OpenDialogOptions
  ): Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog(
    options: SaveDialogOptions
  ): Promise<{ canceled: boolean; filePath?: string }>
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createDialogs(deps: {
  requestRustInvoke: RequestRustInvoke
  raiseMainWindowIfHiddenByGameLib: () => void
}): Dialogs {
  return {
    displayAcks: createDisplayAcks(),
    async showErrorBox(title, content) {
      deps.raiseMainWindowIfHiddenByGameLib()
      try {
        await deps.requestRustInvoke(RUST_DIALOG_MESSAGE, [
          { message: content, title, kind: 'error' }
        ])
      } catch (error) {
        // An error dialog that itself fails to render must not crash the caller's error path.
        console.warn(
          `[host] dialogs.showErrorBox(): ${RUST_DIALOG_MESSAGE} failed:`,
          reason(error)
        )
      }
    },
    async showMessageBox(options) {
      deps.raiseMainWindowIfHiddenByGameLib()
      const safeIndex = options?.cancelId ?? (options?.buttons?.length ?? 1) - 1
      // Electron renders `detail` as a secondary line under the message; the Rust
      // `dialog_message` arm reads only `message`, so `detail` is folded into it here. Dropping
      // it silently hid the executable and arguments the deep-link launch confirm exists to show.
      const message = [options?.message, options?.detail]
        .filter((part) => part !== undefined && part !== '')
        .join('\n\n')
      try {
        const result = await deps.requestRustInvoke(RUST_DIALOG_MESSAGE, [
          {
            message: message === '' ? options?.message : message,
            title: options?.title,
            kind: options?.type,
            buttons: options?.buttons
          }
        ])
        // result: the clicked button's index, or null when dismissed (Esc / window close). A
        // dismissal is the caller's cancelId, as in Electron.
        return {
          response: typeof result === 'number' ? result : safeIndex,
          checkboxChecked: false
        }
      } catch (error) {
        console.warn(
          `[host] dialogs.showMessageBox(): ${RUST_DIALOG_MESSAGE} failed, defaulting to safe index ${safeIndex}:`,
          reason(error)
        )
        return { response: safeIndex, checkboxChecked: false }
      }
    },
    async showOpenDialog(options) {
      try {
        const result = await deps.requestRustInvoke(RUST_DIALOG_OPEN, [
          (options ?? {}) as RustInvokeArgsOf<typeof RUST_DIALOG_OPEN>[0]
        ])
        if (typeof result === 'string') {
          return { canceled: false, filePaths: [result] }
        }
        // `null` (or anything else non-string) is the healthy cancel case.
        return { canceled: true, filePaths: [] }
      } catch (error) {
        console.warn(
          `[host] dialogs.showOpenDialog(): ${RUST_DIALOG_OPEN} failed:`,
          reason(error)
        )
        return { canceled: true, filePaths: [] }
      }
    },
    async showSaveDialog(options) {
      try {
        const result = await deps.requestRustInvoke(RUST_DIALOG_SAVE, [
          options ?? {}
        ])
        if (typeof result === 'string') {
          return { canceled: false, filePath: result }
        }
        return { canceled: true, filePath: undefined }
      } catch (error) {
        console.warn(
          `[host] dialogs.showSaveDialog(): ${RUST_DIALOG_SAVE} failed:`,
          reason(error)
        )
        return { canceled: true, filePath: undefined }
      }
    }
  }
}
