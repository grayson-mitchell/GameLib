import { faPowerOff } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { handleQuit } from 'frontend/helpers'
import ContextProvider from 'frontend/state/ContextProvider'

/**
 * Relocated Quit action (34.10-05 Task 2), ported from the retired left
 * navigation's quit control. The confirmation flow (title/message/buttons,
 * the actual quit action) is unchanged -- only the row's CSS class names
 * move onto this tier's row primitive's classes, and the old onboarding-
 * tour anchor prop is dropped entirely (per D-13 the tour is disabled this
 * phase).
 */
export default function QuitButton() {
  const { t } = useTranslation()
  const { showDialogModal } = useContext(ContextProvider)

  const handleQuitButton = () => {
    showDialogModal({
      title: t('userselector.quit', 'Quit'),
      message: t('userselector.quitMessage', 'Are you sure you want to quit?'),
      buttons: [
        {
          text: t('userselector.quit', 'Quit'),
          onClick: handleQuit
        },
        {
          text: t('userselector.cancel', 'Cancel'),
          onClick: () => null
        }
      ]
    })
  }

  return (
    <button className="NavItem" onClick={() => handleQuitButton()}>
      <div className="NavItem__icon">
        <FontAwesomeIcon
          icon={faPowerOff}
          title={t('userselector.quit', 'Quit')}
        />
      </div>
      <span>{t('userselector.quit', 'Quit')}</span>
    </button>
  )
}
