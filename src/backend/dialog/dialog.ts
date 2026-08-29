import { LogPrefix, logInfo, logWarning } from 'backend/logger'
import { dialog, Notification } from 'backend/platform'
import { ButtonOptions, DialogType } from 'common/types'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { isSteamDeckGameMode } from 'backend/constants/environment'

function showDialogBoxModalAuto(props: {
  event?: Electron.IpcMainInvokeEvent
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
