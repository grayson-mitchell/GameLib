import React, { useContext } from 'react'
import GameContext from '../../GameContext'
import { GameInfo, InstallProgress } from 'common/types'
import type { SteamBottleLaunchWaitingCause } from 'common/types/steam'
import { getProgress } from 'frontend/helpers'
import {
  useBottleLaunchWaiting,
  resolveWaitingCauseOrder
} from 'frontend/state/BottleLaunchWaiting'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CircularProgress, LinearProgress } from '@mui/material'

interface Props {
  gameInfo: GameInfo
  handleUpdate: () => void
  hasUpdate: boolean
  progress: InstallProgress
}

const GameStatus = ({ gameInfo, progress, handleUpdate, hasUpdate }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const { runner, is, statusContext } = useContext(GameContext)
  // D-51-16 (folded todo): a bottled-Steam launch that has produced no game
  // process within the grace window. The backend never emits this signal
  // for a kind:'bridge' launch (bottleProcessMonitor.ts), so no extra
  // runner/is check is needed here to keep bridge launches silent.
  const waitingEntry = useBottleLaunchWaiting(
    (state) => state.entries[gameInfo.app_name]
  )

  // D-51-16: every cause's copy lives under `steam.bottle.waiting.*` (51-04).
  // Literal t() calls, not a key/default map, so the hard-coded string gate
  // can see each key alongside its default.
  function waitingCauseText(cause: SteamBottleLaunchWaitingCause): string {
    switch (cause) {
      case 'self-update':
        return tGamelib(
          'gamelib:steam.bottle.waiting.cause.selfUpdate',
          'Steam is updating itself. Press Play again once it has restarted.'
        )
      case 'login':
        return tGamelib(
          'gamelib:steam.bottle.waiting.cause.login',
          'Steam needs you to sign in. Its login window may be hidden behind other windows.'
        )
      case 'other-session':
        return tGamelib(
          'gamelib:steam.bottle.waiting.cause.otherSession',
          'This game is running on another computer, and Steam is asking whether to close it there.'
        )
    }
  }

  function getInstallLabel(
    is_installed: boolean,
    notAvailable?: boolean,
    statusContext?: string
  ): React.ReactNode {
    const { eta, bytes, percent, file } = progress

    if (runner === 'gog' && is.notInstallable) {
      return t(
        'status.gog-goodie',
        "This game doesn't appear to be installable. Check downloadable content on https://gog.com/account"
      )
    }

    if (is.notSupportedGame) {
      return t(
        'status.this-game-uses-third-party',
        'This game uses third party launcher and it is not supported yet'
      )
    }

    if (notAvailable) {
      return t('status.gameNotAvailable', 'Game not available')
    }

    // quick 261026-e1c: a first-launch redist install can take minutes, so
    // the line carries a spinner to show the step is still working.
    if (is.installingRedist) {
      return (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <CircularProgress size={14} color="inherit" />
          {t('status.redist', 'Installing Redistributables ({{redist}})', {
            redist: statusContext || ''
          })}
        </span>
      )
    }

    // quick 261029-d7v: DRM-mode launch setup fetches and stages Steam DRM
    // support, which is not a redist install, so it has its own line.
    if (is.preparingDrm) {
      return (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <CircularProgress size={14} color="inherit" />
          {t('status.drmSetup', 'Preparing Steam DRM support ({{step}})', {
            step: statusContext || ''
          })}
        </span>
      )
    }

    // quick 261029-iwy: a running Steam is adopting the finished install.
    if (is.syncingSteam) {
      return (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <CircularProgress size={14} color="inherit" />
          {statusContext
            ? t('status.steamSyncingProgress', 'Syncing Steam ({{progress}})', {
                progress: statusContext
              })
            : t('status.steamSyncing', 'Syncing Steam')}
        </span>
      )
    }

    if (is.uninstalling) {
      return t('status.uninstalling', 'Uninstalling')
    }

    if (is.reparing) {
      return `${t('status.reparing')} ${percent ? `${percent}%` : '...'}`
    }

    if (is.moving) {
      if (file && percent !== undefined) {
        return t(
          'status.moving-files',
          `Moving file '{{file}}': {{percent}}%`,
          { file, percent: percent.toFixed(0) }
        )
      }

      return `${t('status.moving', 'Moving Installation, please wait')} ...`
    }

    const etaText = eta
      ? tGamelib('gamelib:gamepage.etaPrefix', 'ETA: {{eta}}', { eta })
      : ''

    const currentProgress =
      getProgress(progress) >= 99
        ? ''
        : `${percent && bytes ? `${percent}% [${bytes}] ${etaText}` : '...'}`

    if (is.updating && is_installed) {
      if (!currentProgress) {
        return `${t('status.processing', 'Processing files, please wait')}...`
      }
      if (eta && eta.includes('verifying')) {
        return `${t('status.reparing')}: ${percent} [${bytes}]`
      }
      return `${t('status.updating')} ${currentProgress}`
    }

    // quick 261024-h5y: bottle-route 1026 handoff has a user action.
    if (runner === 'steam' && is.installing) {
      if (statusContext === 'steam-waiting-for-bottled-steam') {
        return tGamelib(
          'gamelib:steam.bottle.finishInstall.status',
          'Downloaded. Start Steam to finish installing.'
        )
      }
      // quick 261029-exu: a bridge install's post-download tail.
      if (statusContext === 'steam-bridge-finishing') {
        return (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <CircularProgress size={14} color="inherit" />
            {t('status.steamFinishing', 'Finishing install…')}
          </span>
        )
      }
      if (statusContext === 'steam-finishing-in-bottled-steam') {
        return tGamelib(
          'gamelib:steam.bottle.finishInstall.finishing',
          'Steam is finishing the install. It may update itself or ask you to sign in first.'
        )
      }
    }

    // D-UAT-04 (21-16): the GameLib-written 1026 manifest is waiting for a
    // full Steam client restart to be adopted — not an endless "Installing".
    // GameLib never auto-drives Steam; this is a passive hint only.
    if (
      runner === 'steam' &&
      is.installing &&
      statusContext === 'steam-waiting-for-restart'
    ) {
      return t('status.steamWaitingRestart', 'Restart Steam to finish')
    }

    if (!is.updating && (is.installing || is.importing)) {
      if (!currentProgress) {
        return `${t('status.processing', 'Processing files, please wait')}...`
      }
      const statusString = is.importing
        ? t('status.importing', 'Importing')
        : t('status.installing', 'Installing')
      return `${statusString} ${currentProgress}`
    }

    if (is.queued) {
      return `${t('status.queued', 'Queued')}`
    }

    if (hasUpdate) {
      return (
        <span onClick={async () => handleUpdate()} className="updateText">
          {`${t('status.installed')} - ${t(
            'status.hasUpdates',
            'New Version Available!'
          )} (${t('status.clickToUpdate', 'Click to Update')})`}
        </span>
      )
    }

    if (is_installed) {
      return t('status.installed')
    }

    // Phase 17 (17-11), GAP 3 gap-closure: mirror the guided bottle-setup
    // toast instead of falling through to "This game is not installed"
    if (is.settingUpBottle) {
      return t('status.settingUpBottle', 'Setting up Steam…')
    }

    // D-UAT-09 (21-17): an incomplete on-disk native install (not currently
    // installing — this is the not-installing tail) reads as a resumable
    // install, never the generic "This game is not installed" copy.
    // quick-260819-ch5: GameLib resumes this itself via
    // resumeInterruptedSteamInstall — the hint now tells the user that,
    // instead of sending them to Steam.
    if (
      runner === 'steam' &&
      !is_installed &&
      statusContext === 'steam-incomplete'
    ) {
      return t(
        'gamelib:steam.status.resumeInstallHint',
        'Install incomplete — resume the download in GameLib'
      )
    }

    return t('status.notinstalled')
  }

  const otherWaitingCauses = waitingEntry
    ? resolveWaitingCauseOrder(waitingEntry.detectedCause).filter(
        (cause) => cause !== waitingEntry.detectedCause
      )
    : []

  return (
    <div className="gameStatus">
      {(is.installing || is.updating) && (
        <LinearProgress
          variant="determinate"
          className="installProgress"
          value={getProgress(progress)}
        />
      )}
      {waitingEntry && (
        <div className="bottleLaunchWaiting">
          {waitingEntry.detectedCause ? (
            <>
              <p style={{ fontStyle: 'italic' }}>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.title',
                  'Waiting for Steam…'
                )}
              </p>
              <p>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.intro',
                  'The Windows Steam client has not started the game yet.'
                )}
              </p>
              <p>
                <strong>
                  {tGamelib(
                    'gamelib:steam.bottle.waiting.mostLikely',
                    'Most likely:'
                  )}
                </strong>{' '}
                {waitingCauseText(waitingEntry.detectedCause)}
              </p>
            </>
          ) : (
            // quick/261024-gvu: cause=none past the grace window is NOT a
            // failure -- the launch is held (no deadline, LD-4) and Steam is
            // usually just installing prerequisites on a first run.
            <>
              <p style={{ fontStyle: 'italic' }}>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.startingTitle',
                  'Steam is still starting the game…'
                )}
              </p>
              <p>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.startingIntro',
                  "A first launch can take several minutes while Steam installs the game's prerequisites."
                )}
              </p>
            </>
          )}
          {otherWaitingCauses.length > 0 && (
            <div>
              <p>
                {waitingEntry.detectedCause
                  ? tGamelib(
                      'gamelib:steam.bottle.waiting.likelyCauses',
                      'Likely causes:'
                    )
                  : tGamelib(
                      'gamelib:steam.bottle.waiting.ifNotStarting',
                      'If it still does not start, check:'
                    )}
              </p>
              <ul>
                {otherWaitingCauses.map((cause) => (
                  <li key={cause}>{waitingCauseText(cause)}</li>
                ))}
              </ul>
            </div>
          )}
          {/* quick/261024-gvu: escape hatch -- Launching is held with no
              deadline, so the user must be able to end the wait. kill ->
              SteamGame.stop() -> stopBottleProcessMonitor(). */}
          <button
            type="button"
            className="button"
            onClick={() => void window.api.kill(gameInfo.app_name, 'steam')}
          >
            {tGamelib(
              'gamelib:steam.bottle.waiting.stopWaiting',
              'Stop waiting'
            )}
          </button>
        </div>
      )}
      <p
        style={{
          color: is.installing
            ? 'var(--success)'
            : 'var(--status-warning,  var(--warning))',
          fontStyle: 'italic'
        }}
      >
        {is.installing && (
          <Link to={'/download-manager'}>
            {getInstallLabel(
              gameInfo.is_installed,
              is.notAvailable,
              statusContext
            )}
          </Link>
        )}
        {!is.installing &&
          getInstallLabel(
            gameInfo.is_installed,
            is.notAvailable,
            statusContext
          )}
      </p>
    </div>
  )
}

export default GameStatus
