import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { CloudDownload, Storage, Assignment } from '@mui/icons-material'
import { size } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import ContextProvider from 'frontend/state/ContextProvider'

interface Props {
  gameInfo: GameInfo
}

/**
 * Steam-only branch: estimated Install Size row (no Download Size row — Steam
 * does not expose a pre-download size, only an estimate parsed from the store
 * page's system requirements). Extracted into its own component so its hooks
 * remain unconditional (not called after DownloadSizeInfo's early returns).
 */
const SteamInstallSize = ({ appId }: { appId: string }) => {
  const { t } = useTranslation('gamepage')
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    window.api.getSteamInstallSize(appId).then(setResult)
  }, [appId])

  let display: string
  if (result === null) {
    display = `${t('game.getting-install-size', 'Getting install size')}...`
  } else if (!result || result === '?? MB') {
    display = t('game.installSizeUnknown', 'Unknown')
  } else {
    display = `~ ${result} (${t('game.estimate', 'estimate')})`
  }

  return (
    <div className="iconWithText">
      <Storage />
      <b>{t('game.installSize', 'Install Size')}:</b>
      {display}
    </div>
  )
}

const DownloadSizeInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { gameInstallInfo, runner } = useContext(GameContext)
  const { connectivity } = useContext(ContextProvider)

  if (connectivity.status !== 'online') {
    return null
  }

  if (gameInfo.is_installed) {
    return null
  }

  if (runner === 'sideload') {
    return null
  }

  if (runner === 'steam') {
    return <SteamInstallSize appId={gameInfo.app_name} />
  }

  if (gameInfo.thirdPartyManagedApp) {
    return (
      <div className="iconWithText">
        <Assignment />
        <b>{t('info.third-party-app', 'Third-Party Manager')}</b>
        {gameInfo.isEAManaged ? 'EA app' : gameInfo.thirdPartyManagedApp}
      </div>
    )
  }

  const downloadSize =
    gameInstallInfo?.manifest?.download_size &&
    size(Number(gameInstallInfo?.manifest?.download_size))
  const installSize =
    gameInstallInfo?.manifest?.disk_size &&
    size(Number(gameInstallInfo?.manifest?.disk_size))

  return (
    <>
      <div className="iconWithText">
        <CloudDownload />
        <b>{t('game.downloadSize', 'Download Size')}:</b>
        {downloadSize ??
          `${t('game.getting-download-size', 'Geting download size')}...`}
      </div>
      <div className="iconWithText">
        <Storage />
        <b>{t('game.installSize', 'Install Size')}:</b>
        {installSize ??
          `${t('game.getting-install-size', 'Geting install size')}...`}
      </div>
    </>
  )
}

export default DownloadSizeInfo
