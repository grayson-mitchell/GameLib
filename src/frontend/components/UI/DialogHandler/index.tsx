import { ButtonOptions, DialogType } from 'common/types'
import type { IpcRendererEvent } from 'backend/platform'
import ContextProvider from 'frontend/state/ContextProvider'
import { configStore } from 'frontend/helpers/electronStores'
import { useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import MessageBoxModal from './components/MessageBoxModal'
import { DialogModalOptions } from 'frontend/types'

// 37-02 (D-07): maps a button's serializable `action` discriminator to a
// real handler. `onClick` does not survive the backend's
// sendFrontendMessage('showDialog', ...) structured-clone/JSON hop, so
// every affordance a backend-composed button needs must be threaded through
// this enum instead of a function. Kept exhaustive over the `action` union
// (common/types.ts's ButtonOptions) so an unrecognized/future value falls
// through to "no handler attached" rather than a silently-wrong default.
// 260919-sch: added the VCRuntime download/skip and Snap-warning suppress
// actions, moved off the native dialog shim onto this renderer-side path.
type ResolveButtonActionDeps = {
  navigate: ReturnType<typeof useNavigate>
  t: TFunction
  showDialogModal: (options: DialogModalOptions) => void
}

function resolveButtonAction(
  action: ButtonOptions['action'],
  { navigate, t, showDialogModal }: ResolveButtonActionDeps
): (() => void) | undefined {
  switch (action) {
    case 'steamSignIn':
      return () => navigate('/login')
    case 'vcRuntimeSkip':
      return () => configStore.set('skipVcRuntime', true)
    case 'snapWarningSuppress':
      return () => configStore.set('showSnapWarning', false)
    case 'vcRuntimeDownload':
      return () => {
        window.api.openExternalUrl(
          'https://aka.ms/vs/17/release/vc_redist.x86.exe'
        )
        window.api.openExternalUrl(
          'https://aka.ms/vs/17/release/vc_redist.x64.exe'
        )
        showDialogModal({
          message: t(
            'box.vcruntime.install.message',
            'The download links for the Visual C++ Runtimes have been opened. Please install both the x86 and x64 versions.'
          ),
          type: 'MESSAGE',
          buttons: [{ text: t('box.ok', 'OK') }]
        })
      }
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
  const { t } = useTranslation()

  useEffect(() => {
    const onMessage = (
      e: IpcRendererEvent,
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
          ? {
              ...button,
              onClick: resolveButtonAction(button.action, {
                navigate,
                t,
                showDialogModal
              })
            }
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
  }, [navigate, t, showDialogModal])

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
