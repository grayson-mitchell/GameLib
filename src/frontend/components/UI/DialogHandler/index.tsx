import { ButtonOptions, DialogType } from 'common/types'
import ContextProvider from 'frontend/state/ContextProvider'
import { useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import MessageBoxModal from './components/MessageBoxModal'

// 37-02 (D-07): maps a button's serializable `action` discriminator to a
// real handler. `onClick` does not survive the backend's
// sendFrontendMessage('showDialog', ...) structured-clone/JSON hop, so
// every affordance a backend-composed button needs must be threaded through
// this enum instead of a function. Kept exhaustive over the `action` union
// (common/types.ts's ButtonOptions) so an unrecognized/future value falls
// through to "no handler attached" rather than a silently-wrong default.
function resolveButtonAction(
  action: ButtonOptions['action'],
  navigate: ReturnType<typeof useNavigate>
): (() => void) | undefined {
  switch (action) {
    case 'steamSignIn':
      return () => navigate('/login')
    case undefined:
      return undefined
    default: {
      // Exhaustiveness guard — a new `action` literal added to ButtonOptions
      // without a case here fails `tsc`, not silently drops the button.
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export default function DialogHandler() {
  const { dialogModalOptions, showDialogModal } = useContext(ContextProvider)
  const navigate = useNavigate()

  useEffect(() => {
    const onMessage = (
      e: Electron.IpcRendererEvent,
      title: string,
      message: string,
      type: DialogType,
      buttons?: Array<ButtonOptions>
    ) => {
      // 37-02 (D-07): attach a real onClick for any button carrying a
      // recognized `action` discriminator BEFORE showDialogModal renders it.
      // Buttons with no `action` (the vast majority) pass through untouched.
      const mappedButtons = buttons?.map((button) =>
        button.action
          ? { ...button, onClick: resolveButtonAction(button.action, navigate) }
          : button
      )
      showDialogModal({ title, message, type, buttons: mappedButtons })
    }

    const removeHandleShowDialogListener =
      window.api.handleShowDialog(onMessage)

    //useEffect unmount
    return () => {
      removeHandleShowDialogListener()
    }
  }, [navigate])

  return (
    <>
      {dialogModalOptions.showDialog && (
        <MessageBoxModal
          type={dialogModalOptions.type ? dialogModalOptions.type : 'MESSAGE'}
          title={dialogModalOptions.title ? dialogModalOptions.title : ''}
          message={dialogModalOptions.message ? dialogModalOptions.message : ''}
          buttons={dialogModalOptions.buttons ? dialogModalOptions.buttons : []}
          className={dialogModalOptions.className}
          onClose={() =>
            dialogModalOptions.onClose
              ? dialogModalOptions.onClose()
              : showDialogModal({ showDialog: false })
          }
        />
      )}
    </>
  )
}
