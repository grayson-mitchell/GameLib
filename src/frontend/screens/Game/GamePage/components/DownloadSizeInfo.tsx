import useUiState from 'frontend/state/uiState'
import { useContext, useEffect, useState } from 'react'
import { hasCapability } from 'common/storeCapabilities'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { size } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { FactRow } from './InstallTab/FactRow'

interface Props {
  gameInfo: GameInfo
}

/**
 * Steam-only branch: estimated Install size fact (no Download size fact: Steam
 * does not expose a pre-download size, only an estimate parsed from the store
 * page's system requirements). Extracted into its own component so its hooks
 * remain unconditional (not called after DownloadSizeInfo's early returns).
 */
const SteamInstallSize = ({ appId }: { appId: string }) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
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
    <FactRow
      label={tGamelib(
        'gamelib:gamepage.installTab.installSize',
        'Install size'
      )}
    >
      {display}
    </FactRow>
  )
}

/**
 * Phase 100 (D-01, D-05): the not-installed sizes as fact rows. The
 * third-party manager no longer shows here: ThirdPartyRow renders it for an
 * installed and a not-installed game alike.
 */
const DownloadSizeInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const { gameInstallInfo, runner } = useContext(GameContext)
  const connectivity = useUiState((s) => s.connectivity)

  if (connectivity.status !== 'online') {
    return null
  }

  if (gameInfo.is_installed) {
    return null
  }

  if (!hasCapability(runner, 'hasStoreCatalog')) {
    return null
  }

  if (hasCapability(runner, 'installSizeFromSteamStore')) {
    return <SteamInstallSize appId={gameInfo.app_name} />
  }

  // A third-party-managed game has no manifest here; ThirdPartyRow names its
  // manager instead.
  if (gameInfo.thirdPartyManagedApp) {
    return null
  }

  const downloadSize =
    gameInstallInfo?.manifest?.download_size &&
    size(Number(gameInstallInfo?.manifest?.download_size))
  const installSize =
    gameInstallInfo?.manifest?.disk_size &&
    size(Number(gameInstallInfo?.manifest?.disk_size))

  return (
    <>
      <FactRow
        label={tGamelib(
          'gamelib:gamepage.installTab.downloadSize',
          'Download size'
        )}
      >
        {downloadSize ??
          `${t('game.getting-download-size', 'Getting download size')}...`}
      </FactRow>
      <FactRow
        label={tGamelib(
          'gamelib:gamepage.installTab.installSize',
          'Install size'
        )}
      >
        {installSize ??
          `${t('game.getting-install-size', 'Getting install size')}...`}
      </FactRow>
    </>
  )
}

export default DownloadSizeInfo
