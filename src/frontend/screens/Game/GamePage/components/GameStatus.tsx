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
import { LinearProgress } from '@mui/material'

// D-51-16: maps each cause to its gamelib.json key -- no new hard-coded
// copy, every string already lives under `steam.bottle.waiting.*` (51-04).
const WAITING_CAUSE_KEYS: Record<
  SteamBottleLaunchWaitingCause,
  { key: string; defaultValue: string }
> = {
  'self-update': {
    key: 'gamelib:steam.bottle.waiting.cause.selfUpdate',
    defaultValue:
      'Steam is updating itself. Press Play again once it has restarted.'
  },
  login: {
    key: 'gamelib:steam.bottle.waiting.cause.login',
    defaultValue:
      'Steam needs you to sign in. Its login window may be hidden behind other windows.'
  },
  'other-session': {
    key: 'gamelib:steam.bottle.waiting.cause.otherSession',
    defaultValue:
      'This game is running on another computer, and Steam is asking whether to close it there.'
  }
}

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

    if (is.installingRedist) {
      return t('status.redist', 'Installing Redistributables ({{redist}})', {
        redist: statusContext || ''
      })
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
          {waitingEntry.detectedCause && (
            <p>
              <strong>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.mostLikely',
                  'Most likely:'
                )}
              </strong>{' '}
              {tGamelib(
                WAITING_CAUSE_KEYS[waitingEntry.detectedCause].key,
                WAITING_CAUSE_KEYS[waitingEntry.detectedCause].defaultValue
              )}
            </p>
          )}
          {otherWaitingCauses.length > 0 && (
            <div>
              <p>
                {tGamelib(
                  'gamelib:steam.bottle.waiting.likelyCauses',
                  'Likely causes:'
                )}
              </p>
              <ul>
                {otherWaitingCauses.map((cause) => (
                  <li key={cause}>
                    {tGamelib(
                      WAITING_CAUSE_KEYS[cause].key,
                      WAITING_CAUSE_KEYS[cause].defaultValue
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
