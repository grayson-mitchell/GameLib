import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { faHeartCrack, faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { CleaningServicesOutlined, DeleteOutline } from '@mui/icons-material'
import './index.css'
import ContextProvider from 'frontend/state/ContextProvider'

export default function ErrorComponent({ message }: { message: string }) {
  const { t } = useTranslation()
  const { refreshLibrary, showResetDialog } = useContext(ContextProvider)

  return (
    <div className="errorComponent">
      <FontAwesomeIcon icon={faHeartCrack} />
      <span className="errorText">{message}</span>
      <span className="buttonsWrapper">
        <button
          className="button is-footer"
          title={t(
            'generic.library.refresh-tooltip',
            'Re-scans your game libraries from each connected store.'
          )}
          onClick={async () =>
            refreshLibrary({
              checkForUpdates: true,
              runInBackground: false,
              origin: 'error-component-retry'
            })
          }
        >
          <div className="button-icontext-flex">
            <div className="button-icon-flex">
              <FontAwesomeIcon className="refreshIcon" icon={faSyncAlt} />
            </div>
            <span className="button-icon-text">
              {t('generic.library.refresh', 'Refresh Library')}
            </span>
          </div>
        </button>

        <button
          className="button is-footer is-danger"
          title={t(
            'settings.clear-cache-tooltip',
            'Clears the cached game library and metadata to fix display issues. Your store logins, installed games, and settings are kept.'
          )}
          onClick={() => window.api.clearCache(true)}
        >
          <div className="button-icontext-flex">
            <div className="button-icon-flex">
              <CleaningServicesOutlined />
            </div>
            <span className="button-icon-text">
              {t('settings.clear-cache', 'Clear GameLib Cache')}
            </span>
          </div>
        </button>

        <button
          className="button is-footer is-danger"
          title={t(
            'settings.reset-heroic-tooltip',
            'Removes all GameLib settings and cached data, but keeps your installed games and store credentials.'
          )}
          onClick={showResetDialog}
        >
          <div className="button-icontext-flex">
            <div className="button-icon-flex">
              <DeleteOutline />
            </div>
            <span className="button-icon-text">
              {t('settings.reset-heroic', 'Reset GameLib')}
            </span>
          </div>
        </button>
      </span>
    </div>
  )
}
