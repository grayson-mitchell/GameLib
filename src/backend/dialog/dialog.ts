import { LogPrefix, logInfo, logWarning } from 'backend/logger'
import { dialog, Notification, type IpcMainInvokeEvent } from 'backend/platform'
import { ButtonOptions, DialogType } from 'common/types'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { isSteamDeckGameMode } from 'backend/constants/environment'

// 260919-sch: native-vs-in-app dialog policy, recorded here because this is
// the module a future caller reads when choosing a path.
//
// 1. In-app (showDialogBoxModalAuto, below): anything reached from a
//    settings surface, any nag or warning, and anything needing more than
//    two buttons or a checkbox. The native path structurally cannot express
//    those -- the Rust dialog command only accepts a buttons array when its
//    length is exactly 2, and the underlying dialog plugin has no checkbox
//    support at all.
// 2. Native (dialog.showMessageBox): quit confirmation, updater,
//    pre-window-ready prompts, and Rosetta -- cases that must work before or
//    independently of the renderer being alive.
// 3. Any ASKING dialog moved to the renderer must gather its answer
//    renderer-side, because this path is one-way -- it only
//    sendFrontendMessage's outward and cannot carry a reply back. Either
//    pass the answer back as an argument (the eos_overlay.ts remove(confirmed)
//    precedent) or act on the answer entirely in the renderer, dispatched
//    off a serializable ButtonOptions.action discriminator.
//
// Motivation for rule 3: on the native path, dismissing a dialog (Escape or
// close) returns a false response, which native dialog.showMessageBox maps
// to its second button index. Any "don't show again" affordance sitting at
// that index fires on Escape, silently persisting a suppression the user
// never chose. The in-app path has no such coupling.
function showDialogBoxModalAuto(props: {
  event?: IpcMainInvokeEvent
  title: string
  message: string
  type: DialogType
  buttons?: Array<ButtonOptions>
}) {
  if (props.event) {
    props.event.sender.send(
      'showDialog',
      props.title,
      props.message,
      props.type,
      props.buttons
    )
  } else {
    try {
      sendFrontendMessage(
        'showDialog',
        props.title,
        props.message,
        props.type,
        props.buttons
      )
    } catch (error) {
      logWarning(['showDialogBoxModalAuto:', error], LogPrefix.Backend)

      const window = getMainWindow()

      switch (props.type) {
        case 'ERROR':
          dialog.showErrorBox(props.title, props.message)
          break
        default:
          if (!window) {
            break
          }
          dialog.showMessageBox(window, {
            title: props.title,
            message: props.message,
            buttons: props.buttons?.map((button) => button.text) || []
          })
          break
      }
    }
  }
}

type NotifyType = {
  title: string
  body: string
}

function notify({ body, title }: NotifyType) {
  if (Notification.isSupported() && !isSteamDeckGameMode) {
    const mainWindow = getMainWindow()
    const notify = new Notification({
      body,
      title
    })

    notify.on('click', () => mainWindow?.show())
    notify.show()
  } else {
    // REQ-30-07/D-09: a logged no-op, not a silent one -- names the title and the reason,
    // never the body (avoids logging arbitrary notification content).
    const reason = isSteamDeckGameMode
      ? 'Steam Deck game mode'
      : 'Notification unsupported'
    logInfo(`notify(): skipped "${title}" (${reason})`, LogPrefix.Backend)
  }
}

export { showDialogBoxModalAuto, notify }
