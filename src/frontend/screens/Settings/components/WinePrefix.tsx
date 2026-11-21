import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import useUiState from 'frontend/state/uiState'
import useSetting from 'frontend/hooks/useSetting'
import { InfoBox, PathSelectionBox } from 'frontend/components/UI'
import SettingsContext from '../SettingsContext'
import { defaultWineVersion } from '..'

const WinePrefix = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const { getSetting } = useContext(SettingsContext)
  const wineVersion = getSetting('wineVersion', defaultWineVersion)

  const isWin = platform === 'win32'

  const [sharedWinePrefix] = useSetting('sharedWinePrefix', '')
  const [winePrefix, setWinePrefix] = useSetting('winePrefix', sharedWinePrefix)

  if (isWin || wineVersion.type === 'crossover') {
    return <></>
  }

  return (
    <PathSelectionBox
      htmlId="selectWinePrefix"
      label={t('setting.wineprefix')}
      path={winePrefix}
      onPathChange={setWinePrefix}
      type="directory"
      pathDialogTitle={t('box.wineprefix')}
      pathDialogDefaultPath={winePrefix}
      noDeleteButton
      afterInput={
        winePrefix ? (
          <button
            type="button"
            className="winePrefixFolderButton"
            title={t(
              'gamelib:settings.fields.winePrefix.openFolder',
              'Open prefix folder'
            )}
            aria-label={t(
              'gamelib:settings.fields.winePrefix.openFolder',
              'Open prefix folder'
            )}
            onClick={() => window.api.openFolder(winePrefix)}
          >
            <FontAwesomeIcon icon={faFolderOpen} />
          </button>
        ) : undefined
      }
      labelHelp={
        <InfoBox text={t('infobox.wine-prefix.title', 'Wine Prefix')} iconOnly>
          {t(
            'infobox.wine-repfix.message',
            'Wine uses what is called a WINEPREFIX to encapsulate Windows applications. This prefix contains the Wine configuration files and a reproduction of the file hierarchy of C: (the main disk on a Windows OS). In this reproduction of the C: drive, your game save files and dependencies installed via winetricks are stored.'
          )}

          <br />
          <br />
          <a>
            <span
              className="winefaq"
              onClick={() => window.api.openWinePrefixFAQ()}
            >
              WinePrefix FAQ
            </span>
          </a>
        </InfoBox>
      }
    />
  )
}

export default WinePrefix
