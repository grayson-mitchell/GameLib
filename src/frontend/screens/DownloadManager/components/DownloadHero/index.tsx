import './index.css'

import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DMQueueElement, DownloadManagerState } from 'common/types'
import StopIcon from 'frontend/assets/stop-icon.svg?react'
import PlayIcon from 'frontend/assets/play-icon.svg?react'
import PauseIcon from 'frontend/assets/pause-icon.svg?react'
import { CachedImage, SvgButton } from 'frontend/components/UI'
import { handleStopInstallation } from 'frontend/helpers/library'
import { getGameInfo, getStoreName } from 'frontend/helpers'
import { hasProgress } from 'frontend/hooks/hasProgress'
import ContextProvider from 'frontend/state/ContextProvider'
import ProgressHeader from '../ProgressHeader'
import { heroArtSources, heroCoverSources, heroPercent } from './heroModel'

type Props = {
  element?: DMQueueElement
  state: DownloadManagerState
}

/**
 * The Download Manager's Steam-style hero (quick 261012-dhs, D-04): ONE
 * edge-to-edge determinate bar at the very top, then the current game's
 * artwork faded behind its details -- cover, title, type and store, progress
 * text, ETA, the speed chart and working pause/resume/cancel.
 *
 * Mounted with `key={appName ?? 'idle'}` by the page so `gameInfo` and the
 * `hasProgress` instance reset per download. All hooks run unconditionally
 * before the idle return (the deleted ring's `?? ''` precedent for
 * `hasProgress`).
 *
 * The artwork is a `CachedImage` (an `<img>` routed through the image cache),
 * never a CSS `background-image` -- store-supplied URLs must not be
 * interpolated into a style string (T-261012-dhs-01).
 */
export default function DownloadHero({ element, state }: Props) {
  const { amazon, epic, gog, steam, showDialogModal } =
    useContext(ContextProvider)
  const { t } = useTranslation('gamepage')
  const { t: t2 } = useTranslation('translation')
  const { t: tGamelib } = useTranslation('gamelib')

  const appName = element?.params.appName ?? ''
  const runner = element?.params.runner ?? 'legendary'
  const [progress] = hasProgress(appName, runner)
  const [gameInfo, setGameInfo] = useState(element?.params.gameInfo)

  useEffect(() => {
    if (!appName) return
    const getNewInfo = async () => {
      const newInfo = await getGameInfo(appName, runner)
      if (newInfo && newInfo.runner !== 'sideload') {
        setGameInfo(newInfo)
      }
    }
    void getNewInfo()
  }, [appName, runner])

  const percent = heroPercent(!!element, progress.percent)

  const bar = (
    <div
      className="downloadHero__bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(percent)}
      aria-label={t2('download-manager.title', 'Downloads')}
    >
      <div className="downloadHero__barFill" style={{ width: `${percent}%` }} />
    </div>
  )

  if (!element) {
    return (
      <section className="downloadHero downloadHero--idle">
        {bar}
        <p className="downloadHero__idle">
          {t2('queue.label.empty', 'Nothing to download')}
        </p>
      </section>
    )
  }

  const isPaused = ['idle', 'paused'].includes(state)

  const progressText = `${Math.floor(percent)}%${
    progress.bytes ? ` · ${progress.bytes}` : ''
  }`
  const etaText =
    state === 'running'
      ? (progress.eta ?? '00.00.00')
      : tGamelib('gamelib:downloadManager.progressPaused', 'Paused')

  const art = heroArtSources(gameInfo)
  const library = [
    ...epic.library,
    ...gog.library,
    ...amazon.library,
    ...steam.library
  ]
  const libraryEntry = library.find(
    (val) => val.app_name === appName && val.runner === runner
  )
  const title = libraryEntry?.title ?? gameInfo?.title ?? appName
  const cover = heroCoverSources({
    art_cover: gameInfo?.art_cover || libraryEntry?.art_cover,
    art_square: gameInfo?.art_square || libraryEntry?.art_square,
    overrides: libraryEntry?.overrides ?? gameInfo?.overrides
  })

  const translatedTypes = {
    install: t2('download-manager.install-type.install', 'Install'),
    update: t2('download-manager.install-type.update', 'Update')
  }

  const handleSecondaryActionClick = () => {
    if (isPaused) {
      window.api.resumeCurrentDownload()
    } else if (state === 'running') {
      window.api.pauseCurrentDownload()
    }
  }

  const stopInstallation = () => {
    if (!gameInfo) {
      return
    }
    // Same call as DownloadManagerItem: cancel keeps handleStopInstallation's
    // confirmation dialog and the backend's own folder_name guard
    // (T-261012-dhs-03).
    return handleStopInstallation(
      appName,
      element.params.path,
      t,
      progress,
      runner,
      showDialogModal
    )
  }

  return (
    <section className="downloadHero">
      {bar}
      <div className="downloadHero__panel">
        {art && (
          <CachedImage
            className="downloadHero__art"
            src={art.src}
            fallback={art.fallback}
            alt=""
            aria-hidden="true"
          />
        )}
        <div className="downloadHero__scrim" aria-hidden="true" />
        <div className="downloadHero__content">
          {cover && (
            <CachedImage
              className="downloadHero__cover"
              src={cover.src}
              fallback={cover.fallback}
              alt={title}
            />
          )}
          <div className="downloadHero__info">
            <h3 className="downloadHero__title">{title}</h3>
            <span className="downloadHero__meta">
              {translatedTypes[element.type]}
              {' · '}
              {getStoreName(runner, t2('Other'))}
            </span>
            <span className="downloadHero__progress">{progressText}</span>
            <span
              className="downloadHero__eta"
              title={t2('download-manager.ETA', 'Estimated Time')}
            >
              {etaText}
            </span>
          </div>
          <div className="downloadHero__actions">
            {(isPaused || state === 'running') && (
              <SvgButton
                onClick={handleSecondaryActionClick}
                title={
                  isPaused
                    ? t('queue.label.resume', 'Resume download')
                    : t('queue.label.pause', 'Pause download')
                }
              >
                {isPaused ? (
                  <PlayIcon className="playIcon" />
                ) : (
                  <PauseIcon className="pauseIcon" />
                )}
              </SvgButton>
            )}
            <SvgButton
              onClick={() => void stopInstallation()}
              title={t('button.cancel', 'Cancel')}
            >
              <StopIcon className="cancelIcon" />
            </SvgButton>
          </div>
        </div>
        <div className="downloadHero__speed">
          <ProgressHeader state={state} appName={appName} runner={runner} />
        </div>
      </div>
    </section>
  )
}
