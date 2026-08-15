import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  openInstallGameModal,
  openSteamInstallOptions
} from 'frontend/state/InstallGameModal'
import GameContext from '../../GameContext'
import {
  ArrowBackIosNew,
  Cancel,
  CloudQueue,
  Download,
  Error,
  Pause,
  PlayArrow,
  Stop,
  Warning
} from '@mui/icons-material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'
import { GameInfo } from 'common/types'
import useSetting from 'frontend/hooks/useSetting'
import Dropdown from 'frontend/components/UI/Dropdown'
import { showSteamMainButtonInstallOptions } from 'frontend/helpers/steamInstallOptionsEntry'

interface Props {
  gameInfo: GameInfo
  handlePlay: (gameInfo: GameInfo) => Promise<void>
  handleInstall: (
    is_installed: boolean
  ) => Promise<void | { status: 'done' | 'error' | 'abort' }>
}

const MainButton = ({ gameInfo, handlePlay, handleInstall }: Props) => {
  const { t } = useTranslation('gamepage')
  const { is, statusContext } = useContext(GameContext)
  const [verboseLogs, setVerboseLogs] = useSetting('verboseLogs', true)

  const is_installed = gameInfo.is_installed
  const disabledPlayButtons =
    is.reparing ||
    is.moving ||
    is.updating ||
    is.uninstalling ||
    is.syncing ||
    is.launching ||
    is.installingWinetricksPackages ||
    is.installingRedist

  const disabledInstallButtons =
    is.playing ||
    is.updating ||
    is.reparing ||
    is.moving ||
    is.uninstalling ||
    is.notSupportedGame ||
    is.notInstallable ||
    is.importing ||
    // Steam installs cannot be cancelled from GamerLib — disable the button while polling (D-07)
    (gameInfo.runner === 'steam' && is.installing) ||
    // Phase 17 (17-11), GAP 3 gap-closure: a guided bottle-setup surface is
    // active for this game — disable Install so a click cannot re-dispatch
    // a no-op install while setup is in progress
    is.settingUpBottle

  function getPlayLabel(): React.ReactNode {
    if (is.syncing) {
      return (
        <span className="buttonWithIcon">
          <CloudQueue />
          {t('label.saves.syncing')}
        </span>
      )
    }
    if (is.installingRedist) {
      return t('label.redist', 'Installing Redistributables')
    }
    if (is.installingWinetricksPackages) {
      return t('label.winetricks', 'Installing Winetricks Packages')
    }
    if (is.launching) {
      return t('label.launching', 'Launching')
    }

    if (is.playing) {
      return (
        <span className="buttonWithIcon">
          <Stop data-icon="stop" />
          {t('label.playing.stop')}
        </span>
      )
    }

    if (verboseLogs) {
      return (
        <span className="buttonWithIcon">
          <PlayArrow data-icon="play" />
          {t('label.playing.start_with_logs', 'Play (with logs)')}
        </span>
      )
    }

    return (
      <span className="buttonWithIcon">
        <PlayArrow data-icon="play" />
        {t('label.playing.start')}
      </span>
    )
  }

  function altPlayAction() {
    if (disabledPlayButtons) {
      return <></>
    }

    const label = verboseLogs
      ? t('label.playing.start')
      : t('label.playing.start_with_logs', 'Play Now (with logs)')

    return (
      <button className="button altPlay is-success">
        <ArrowBackIosNew />
        <a className="button" onClick={handleAltLaunch}>
          <span className="buttonWithIcon">
            <PlayArrow data-icon="play" />
            {label}
          </span>
        </a>
      </button>
    )
  }

  function getButtonLabel() {
    if (is.notInstallable) {
      return (
        <span className="buttonWithIcon">
          <Error style={{ cursor: 'not-allowed' }} />
          {t('status.goodie', 'Not installable')}
        </span>
      )
    }
    if (is.notSupportedGame) {
      return (
        <span className="buttonWithIcon">
          <Warning
            style={{
              cursor: 'not-allowed'
            }}
          />
          {t('status.notSupported', 'Not supported')}
        </span>
      )
    }

    if (is.queued) {
      return (
        <span className="buttonWithIcon">
          <Cancel />
          {t('button.queue.remove', 'Remove from Queue')}
        </span>
      )
    }

    // D-UAT-07 (21-16 follow-up): the GameLib-written 1026 manifest is done
    // downloading and waiting for a full Steam restart to be adopted — surface
    // an honest "Restart Steam to finish" hint (matching the tile + GameStatus
    // text) instead of a stuck, spinning "Installing…". Must be checked BEFORE
    // the generic steam-installing branch below, which would otherwise swallow
    // this state. Button stays disabled (nothing for GamerLib to do — the user
    // restarts Steam), but the label no longer looks like an active download.
    if (
      is.installing &&
      gameInfo.runner === 'steam' &&
      statusContext === 'steam-waiting-for-restart'
    ) {
      return (
        <span className="buttonWithIcon">
          <Warning />
          {t('status.steamWaitingRestart', 'Restart Steam to finish')}
        </span>
      )
    }

    // Steam installs are controlled by the Steam client — no pause/cancel surface (D-07)
    if (is.installing && gameInfo.runner === 'steam') {
      return (
        <span className="buttonWithIcon">
          <FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />
          {/* 34.13 review C-10: the inline default now MATCHES the shipped
              `gamepage.json` value ("Installing…"). It previously read
              "Steam installing", which the running app never showed -- the
              key exists, so i18next returns the catalog value and the
              default is inert (the repo's ledgered "editing a t() DEFAULT is
              a silent no-op when the key exists" trap). This is a
              READABILITY fix with zero runtime effect: `gamepage.json` is
              UPSTREAM-OWNED and must not be edited, so the source moves to
              the catalog, not the other way round. */}
          {t('status.steamInstalling', 'Installing…')}
        </span>
      )
    }

    // Phase 17 (17-11), GAP 3 gap-closure: guided bottle-setup is active for
    // this game — mirror the toast instead of falling through to "Install"
    if (is.settingUpBottle) {
      return (
        <span className="buttonWithIcon">
          <FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />
          {t('status.settingUpBottle', 'Setting up Steam…')}
        </span>
      )
    }

    if (is.installing) {
      return (
        <span className="buttonWithIcon">
          <Pause />
          {t('button.cancel')}
        </span>
      )
    }

    // D-UAT-09 (21-17): an incomplete on-disk native install (StateFlags bit
    // 4 unset, e.g. a same-session cancel via markSteamInstallIncomplete or
    // init()'s startup-surface scan) must read as "needs Steam to finish" —
    // never a bare "Install" (which would read as a fresh, from-scratch
    // download) and never Play (gated off separately by is_installed above).
    // The click handler below already routes steam to handleInstall (the
    // correct resume action) unconditionally — no change needed there.
    if (
      gameInfo.runner === 'steam' &&
      !gameInfo.is_installed &&
      gameInfo.install?.steamResumePending &&
      !is.installing &&
      !is.queued
    ) {
      return (
        <span className="buttonWithIcon">
          <Warning />
          {t('status.steamFinishInSteam', 'Finish in Steam')}
        </span>
      )
    }

    return (
      <span className="buttonWithIcon">
        <Download />
        {t('button.install')}
      </span>
    )
  }

  const handleAltLaunch = async () => {
    setVerboseLogs(!verboseLogs)
    await handlePlay(gameInfo)
  }

  return (
    <div className="buttonsWrapper">
      {is_installed && !is.queued && !is.uninstalling && (
        <div className="playButtons">
          <button
            disabled={disabledPlayButtons}
            autoFocus={true}
            onClick={async () => handlePlay(gameInfo)}
            className={classNames(
              'button',
              {
                'is-secondary': !is_installed && !is.queued,
                'is-success':
                  is.syncing ||
                  (!is.updating &&
                    !is.playing &&
                    is_installed &&
                    !is.notAvailable),
                'is-tertiary':
                  is.playing ||
                  (!is_installed && is.queued) ||
                  (is_installed && is.notAvailable),
                'is-disabled': is.updating
              },
              'mainBtn'
            )}
          >
            {getPlayLabel()}
          </button>
          {altPlayAction()}
        </div>
      )}
      {(!is_installed || is.queued) && (
        <span className="installButtons">
          <button
            onClick={async () => {
              if (!is_installed && !is.queued && gameInfo.runner !== 'steam') {
                openInstallGameModal({
                  appName: gameInfo.app_name,
                  runner: gameInfo.runner,
                  gameInfo,
                  action: 'install'
                })
                return
              }
              handleInstall(is_installed)
            }}
            disabled={disabledInstallButtons}
            autoFocus={true}
            className={classNames(
              'button',
              {
                'is-primary': is_installed,
                'is-tertiary':
                  is.notAvailable ||
                  is.installing ||
                  is.queued ||
                  is.notInstallable,
                'is-secondary': !is_installed && !is.queued
              },
              'mainBtn'
            )}
          >
            {getButtonLabel()}
          </button>
          {/* D-21 split-button caret — Steam only. Takes the visual slot the
              Import button leaves empty for Steam (its own gate is just
              below, unchanged). The unusable-state gate below is
              deliberate: Dropdown's Props type carries no interaction-
              blocking attribute (and the approved UI-SPEC forbids adding
              one), so unmounting is the only way to take the caret out of
              the focus ring — a present-but-unusable-looking control would
              still sit in it on one runtime and not the other (the repo's
              own ledgered lesson). */}
          {/* 34.13 review C-04: routed through the shared predicate module
              instead of re-inlining the conjunct. The inline form was the
              only one of the three "Install with options…" doors NOT gated
              on `is_delisted`, and `gameInfo.is_delisted` was in scope right
              here and simply unread. */}
          {showSteamMainButtonInstallOptions({
            runner: gameInfo.runner,
            isInstalled: is_installed,
            isQueued: is.queued,
            isDelisted: !!gameInfo.is_delisted,
            installDisabled: disabledInstallButtons
          }) && (
            <Dropdown
              className="SteamInstallCaret"
              /* WR-14: deliberately NOT `mainBtn` -- that class carries
                   `min-width: 200px`, which made this chevron as wide as
                   the Install button beside it and wrapped the pair onto
                   two rows in the `flex-wrap: wrap` container. The caret's
                   non-zero box (required by Tauri's gamepad focus
                   collector) is now explicit in index.css. */
              buttonClass="button outline"
              title={
                <span
                  aria-label={t(
                    'gamelib:steam.install.withOptionsLabel',
                    'Install with options…'
                  )}
                >
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="SteamInstallCaret__icon"
                  />
                </span>
              }
            >
              {/* 34.13 review C-11: the same class vocabulary its
                    `GameSubMenu` sibling carries for the identical action.
                    Without it the only rule reaching this element is
                    `Dropdown/index.scss`'s generic
                    `.dropdownContainer .dropdown button` -- spacing only, no
                    surface, border, colour or hover state -- because
                    `MainButton` is the sole importer of that Dropdown and no
                    precedent constrained it. */}
              <button
                className="link button is-text is-link buttonWithIcon"
                onClick={() =>
                  openSteamInstallOptions(gameInfo.app_name, gameInfo)
                }
              >
                {t(
                  'gamelib:steam.install.withOptionsLabel',
                  'Install with options…'
                )}
              </button>
            </Dropdown>
          )}
          {/* Import makes no sense for Steam games — Steam owns install management */}
          {gameInfo.runner !== 'steam' && (
            <button
              disabled={disabledInstallButtons || is.installing || is.importing}
              className={'button mainBtn outline'}
              onClick={() =>
                openInstallGameModal({
                  appName: gameInfo.app_name,
                  runner: gameInfo.runner,
                  gameInfo,
                  action: 'import'
                })
              }
            >
              {t('button.import', 'Import Game')}
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export default MainButton
