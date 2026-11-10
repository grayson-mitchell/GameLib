import { useTranslation } from 'react-i18next'
import { InfoBox } from 'frontend/components/UI'
import useUiState from 'frontend/state/uiState'
import { DeleteOutline } from '@mui/icons-material'

const ResetHeroic = () => {
  const showResetDialog = useUiState((s) => s.showResetDialog)
  const { t } = useTranslation()

  return (
    <>
      <h3 className="settingSubheader">
        {t('settings.advanced.title.resetHeroic', 'Reset GameLib')}
      </h3>
      <InfoBox text={t('settings.advanced.details', 'Details')}>
        {t(
          'settings.advanced.resetHeroic.help',
          "This will remove all Settings and Caching but won't remove your Installed games or your Epic credentials. Portable versions (AppImage, WinPortable, ...) of GameLib needs to be restarted manually afterwards."
        )}
      </InfoBox>
      <button className="button is-footer is-danger" onClick={showResetDialog}>
        <div className="button-icontext-flex">
          <div className="button-icon-flex">
            <DeleteOutline />
          </div>
          <span className="button-icon-text">
            {t('settings.reset-heroic', 'Reset GameLib')}
          </span>
        </div>
      </button>
    </>
  )
}

export default ResetHeroic
