import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, PathSelectionBox } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'
import { hasHelp } from 'frontend/hooks/hasHelp'

/**
 * Picks the image used behind the Manage Accounts (Login) screen.
 *
 * Empty path = the bundled default artwork, so clearing the field (the
 * Backspace icon `PathSelectionBox` shows once a path is set) is the
 * reset-to-default action -- that is why `noDeleteButton` is NOT passed here,
 * unlike the sibling path settings.
 */
const LoginBackground = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [loginBackgroundPath, setLoginBackgroundPath] = useSetting(
    'loginBackgroundPath',
    ''
  )

  if (!isDefault) {
    return <></>
  }

  const helpContent = t(
    'gamelib:settings.loginBackgroundHelp',
    'Image shown behind the Manage Accounts screen. Clear the field to go back to the bundled artwork. PNG, JPEG, WebP, AVIF and GIF are supported.'
  )

  hasHelp(
    'loginBackgroundPath',
    t('gamelib:settings.loginBackground', 'Manage Accounts background'),
    <p>{helpContent}</p>
  )

  return (
    <PathSelectionBox
      type="file"
      onPathChange={setLoginBackgroundPath}
      path={loginBackgroundPath}
      pathDialogTitle={t(
        'gamelib:settings.loginBackgroundDialogTitle',
        'Select a background image'
      )}
      pathDialogDefaultPath={loginBackgroundPath}
      pathDialogFilters={[
        {
          name: t('gamelib:settings.loginBackgroundFilterName', 'Images'),
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']
        }
      ]}
      label={t(
        'gamelib:settings.loginBackground',
        'Manage Accounts background'
      )}
      htmlId="login_background_path"
      afterInput={<InfoBox text="infobox.help">{helpContent}</InfoBox>}
    />
  )
}

export default LoginBackground
