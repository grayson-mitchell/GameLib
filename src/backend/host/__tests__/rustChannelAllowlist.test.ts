/**
 * The Rust channels the host services forward over are all on the `requestRustInvoke`
 * allowlist; a channel missing from it is pre-rejected instead of emitted. This pins the dialog
 * and lifecycle channels that the retired `backend/platform` delegate suites used to pin.
 */
import {
  RUST_APP_EXIT,
  RUST_APP_RELAUNCH,
  RUST_CLIPBOARD_READ_TEXT,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
  RUST_INVOKE_CHANNELS,
  RUST_NOTIFICATION_SHOW,
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER
} from 'common/types/sidecarTransport'

describe('host-service Rust channels are allowlisted', () => {
  it.each([
    ['RUST_DIALOG_OPEN', RUST_DIALOG_OPEN],
    ['RUST_DIALOG_MESSAGE', RUST_DIALOG_MESSAGE],
    ['RUST_DIALOG_SAVE', RUST_DIALOG_SAVE],
    ['RUST_NOTIFICATION_SHOW', RUST_NOTIFICATION_SHOW],
    ['RUST_SHELL_SHOW_ITEM_IN_FOLDER', RUST_SHELL_SHOW_ITEM_IN_FOLDER],
    ['RUST_SHELL_OPEN_PATH', RUST_SHELL_OPEN_PATH],
    ['RUST_APP_EXIT', RUST_APP_EXIT],
    ['RUST_APP_RELAUNCH', RUST_APP_RELAUNCH],
    ['RUST_CLIPBOARD_WRITE_TEXT', RUST_CLIPBOARD_WRITE_TEXT],
    ['RUST_CLIPBOARD_READ_TEXT', RUST_CLIPBOARD_READ_TEXT]
  ])('%s is a member of RUST_INVOKE_CHANNELS', (_name, channel) => {
    expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(channel)
  })
})
