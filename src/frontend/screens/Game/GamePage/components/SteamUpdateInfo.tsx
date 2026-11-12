import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudDownload } from '@mui/icons-material'
import { size } from 'frontend/helpers'
import useLibraryState from 'frontend/state/libraryState'
import type { SteamUpdateInfo as SteamUpdateInfoData } from 'common/types/steam'

import './SteamUpdateInfo.scss'

interface Props {
  appName: string
  hasUpdate: boolean
}

/**
 * Phase 74-12 (D-09/D-15): the game page's update line for an installed Steam
 * game. Mount reads the state without authenticated traffic; the sizes are
 * only computed on an explicit click of "Show update size" (T-74-39). Hooks
 * run unconditionally, before any early return.
 */
const SteamUpdateInfo = ({ appName, hasUpdate }: Props) => {
  const { t } = useTranslation('gamelib')
  const [info, setInfo] = useState<SteamUpdateInfoData | null>(null)
  const [loading, setLoading] = useState(false)
  // Re-read after the game's operation status changes (an update ending clears the line).
  const libraryStatus = useLibraryState(
    (s) => s.libraryStatus.find((g) => g.appName === appName)?.status
  )

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    window.api
      .getSteamUpdateInfo(appName)
      .then((result) => {
        if (!cancelled) setInfo(result)
      })
      .catch(() => {
        if (!cancelled) setInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [appName, hasUpdate, libraryStatus])

  const showSize = () => {
    setLoading(true)
    window.api
      .getSteamUpdateInfo(appName, { computeSize: true })
      .then((result) => {
        if (result) setInfo(result)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }

  if (!info || info.state === 'current') return null

  if (info.state === 'unknown') {
    return (
      <div className="iconWithText steamUpdateInfo">
        <CloudDownload />
        {t(
          'gamepage.update.unknown',
          "Update status unknown: GameLib can't see this game's {{branch}} branch.",
          { branch: info.branch }
        )}
      </div>
    )
  }

  if (info.kind === 'registered') {
    return (
      <div className="iconWithText steamUpdateInfo">
        <CloudDownload />
        {t('gamepage.update.registered', 'Steam will update this game.')}
      </div>
    )
  }

  const { estimate } = info
  let body: JSX.Element
  if (estimate) {
    const params = {
      download: size(estimate.downloadBytes),
      peak: size(estimate.peakBytes)
    }
    body = (
      <span className="steamUpdateEstimate">
        {estimate.oldManifestAvailable
          ? t(
              'gamepage.update.sizesEstimate',
              'Download up to {{download}} · needs {{peak}} free during update (estimate)',
              params
            )
          : `${t(
              'gamepage.update.fallback',
              "GameLib can't get the previous build's file list, so it will check every file: download up to {{download}}.",
              params
            )} ${t(
              'gamepage.update.sizesEstimate',
              'Download up to {{download}} · needs {{peak}} free during update (estimate)',
              params
            )}`}
      </span>
    )
  } else if (loading) {
    body = (
      <span className="steamUpdateEstimate">
        {t('gamepage.update.checkingSize', 'Checking update size…')}
      </span>
    )
  } else {
    body = (
      <button
        type="button"
        className="steamUpdateSizeButton"
        onClick={showSize}
      >
        {t('gamepage.update.showSize', 'Show update size')}
      </button>
    )
  }

  return (
    <div className="iconWithText steamUpdateInfo">
      <CloudDownload />
      {body}
    </div>
  )
}

export default SteamUpdateInfo
