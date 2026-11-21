import { useContext } from 'react'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { hasCapability } from 'common/storeCapabilities'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { DownloadDone } from '@mui/icons-material'
import PopoverComponent from 'frontend/components/UI/PopoverComponent'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

const InstalledInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: t2 } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const { gameSettings, runner, is } = useContext(GameContext)

  if (!gameInfo.is_installed) {
    return null
  }

  if (!gameSettings) {
    return null
  }

  const isSideloaded = !hasCapability(runner, 'hasStoreCatalog')
  const isThirdParty = !!gameInfo.thirdPartyManagedApp

  const {
    install: { platform: installPlatform },
    canRunOffline
  } = gameInfo

  // Browser games have no local install data; the platform is shown (boxed)
  // in PlatformSupport instead.
  if (installPlatform === 'Browser') {
    return null
  }

  let version: string | undefined

  if (!isSideloaded) {
    version = gameInfo.install.version
  }

  const { wineVersion, winePrefix, wineCrossoverBottle } = gameSettings

  let wineName = ''
  let wineType = ''

  if (!is.win) {
    let wine = wineVersion.name.replace('Wine - ', '').replace('Proton - ', '')
    if (wine.includes('Default')) {
      wine = wine.split('-')[0] ?? wine
    }
    wineName = wine
    wineType = wineVersion.type
  }

  const info = (
    <>
      {!isSideloaded && !isThirdParty && (
        <div>
          <b>{t('info.version')}:</b> {version}
        </div>
      )}
      <div>
        <b>{t('info.canRunOffline', 'Online Required')}:</b>{' '}
        {t(canRunOffline ? 'box.no' : 'box.yes')}
      </div>
      {isThirdParty && (
        <div>
          <b>{t('info.third-party-app', 'Third-Party Manager')}</b>{' '}
          {asStoreGame(gameInfo, 'legendary')?.isEAManaged
            ? 'EA app'
            : gameInfo.thirdPartyManagedApp}
        </div>
      )}
      {!is.win && !is.native && (
        <>
          <div>
            <b>{tGamelib('gamelib:gamepage.wineLabel', 'Wine:')}</b> {wineName}
          </div>
          {wineType === 'crossover' ? (
            <div>
              <b>{t2('setting.winecrossoverbottle', 'Bottle')}:</b>{' '}
              <div>{wineCrossoverBottle}</div>
            </div>
          ) : (
            <div
              className="clickable"
              onClick={() => window.api.openFolder(winePrefix)}
            >
              <b>{t2('setting.wineprefix', 'WinePrefix')}:</b>{' '}
              <div className="truncatedPath">{winePrefix}</div>
            </div>
          )}
        </>
      )}
    </>
  )

  return info

  return (
    <PopoverComponent
      item={
        <span
          title={t('info.clickToOpen', 'Click to open')}
          className="iconWithText"
        >
          <DownloadDone />
          {t('info.installedInfo', 'Installed Information')}
        </span>
      }
    >
      <div className="poppedElement">{info}</div>
    </PopoverComponent>
  )
}

export default InstalledInfo
