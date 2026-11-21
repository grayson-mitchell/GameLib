import React, { useContext } from 'react'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { hasCapability } from 'common/storeCapabilities'
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
import { engineDownloadLabel } from 'frontend/hooks/engineDownloadLabel'
import Dropdown from 'frontend/components/UI/Dropdown'
import { installCaretItem } from '../actions/installCaret'

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
    is.installingRedist ||
    is.preparingDrm ||
    is.downloadingEngine ||
    is.startingSteam ||
    // quick 261029-exu: a bridge install is marked installed when its manifest
    // lands but keeps installing (redists, DRM support) until its own 'done'.
    (is_installed && is.installing)

  const disabledInstallButtons =
    is.playing ||
    is.updating ||
    is.reparing ||
    is.moving ||
    is.uninstalling ||
    is.notSupportedGame ||
    is.notInstallable ||
    is.importing ||
    is.downloadingEngine ||
    // Steam installs cannot be cancelled from GamerLib — disable the button while polling (D-07).
    (hasCapability(gameInfo.runner, 'installManagedExternally') &&
      is.installing) ||
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
    if (is.preparingDrm) {
      return t('label.drmSetup', 'Preparing Steam DRM support')
    }
    if (is.downloadingEngine) {
      return engineDownloadLabel(statusContext, t)
    }
    if (is.startingSteam) {
      return t('label.steamStarting', 'Starting Steam')
    }
    if (is_installed && is.installing) {
      return t('status.steamFinishing', 'Finishing install…')
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
          {/* 34.13 review C-22: this default MUST match the catalog. The key
              exists, so the default is inert at runtime — but the same key is
              called again 20 lines below with a DIFFERENT default, and only
              one of the two was what the app renders. A reader of this line
              was told the label reads "Play (with logs)" when it reads
              "Play Now (with logs)". Pinned by the mainButtonCatalogDefaults
              gate, which now checks EVERY t() default in this file. */}
          {t('label.playing.start_with_logs', 'Play Now (with logs)')}
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
      hasCapability(gameInfo.runner, 'installManagedExternally') &&
      statusContext === 'steam-waiting-for-restart'
    ) {
      return (
        <span className="buttonWithIcon">
          <Warning />
          {t('status.steamWaitingRestart', 'Restart Steam to finish')}
        </span>
      )
    }

    // 59-22 (G1): the built-in engine is being fetched for a title that is not
    // installed yet. Without this the label fell through to "Install" with an
    // enabled button for the whole engine setup. The phase itself is already
    // shown by GameStatus above the button, so the button just says it is
    // installing.
    if (is.downloadingEngine) {
      return (
        <span className="buttonWithIcon">
          <FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />
          {t('status.steamInstalling', 'Installing…')}
        </span>
      )
    }

    // Steam installs are controlled by the Steam client — no pause/cancel surface (D-07)
    if (
      is.installing &&
      hasCapability(gameInfo.runner, 'installManagedExternally')
    ) {
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
    // init()'s startup-surface scan) must read as a resumable install —
    // never a bare "Install" (which would read as a fresh, from-scratch
    // download) and never Play (gated off separately by is_installed above).
    // quick-260819-ch5: GameLib's own native depot downloader
    // (resumeInterruptedSteamInstall) resumes this on-disk install itself,
    // so the copy no longer sends the user to Steam to finish it — only the
    // words changed here, the click handler below still routes steam to
    // handleInstall (the correct resume action) unconditionally.
    if (
      hasCapability(gameInfo.runner, 'installHandOffToClient') &&
      !gameInfo.is_installed &&
      asStoreGame(gameInfo, 'steam')?.install?.steamResumePending &&
      !is.installing &&
      !is.queued
    ) {
      return (
        <span className="buttonWithIcon">
          <Warning />
          {t('gamelib:steam.status.resumeInstall', 'Resume Install')}
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

  // D-20: the Install ▾ serves both stores. Steam keeps "Install with
  // options…"; every other store (and sideloaded / third-party-managed games,
  // whose only import door this is) gets "Locate existing installation…".
  const caretItem = installCaretItem({
    runner: gameInfo.runner,
    isInstalled: is_installed,
    isQueued: is.queued,
    isInstalling: is.installing,
    isImporting: is.importing,
    isDelisted: !!asStoreGame(gameInfo, 'steam')?.is_delisted,
    installDisabled: disabledInstallButtons
  })

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
              // quick 260907-dbh: the label branch at :222 reads
              // `is.installing` and renders Pause/cancel, but this guard did
              // not — so a mid-download click on a non-steam game reopened
              // the install modal instead of falling through to
              // `handleInstall`, which routes to `install({ isInstalling:
              // true })` -> `handleStopInstallation`. Steam is unaffected:
              // it is already excluded by `runner !== 'steam'` and its
              // install button is separately disabled while installing
              // (`disabledInstallButtons`, D-07).
              if (
                !is_installed &&
                !is.queued &&
                !is.installing &&
                !hasCapability(gameInfo.runner, 'installManagedExternally')
              ) {
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
          {/* D-21 split-button caret, extended by D-20 to every store. The
              unusable-state gate (installCaretItem) is deliberate:
              Dropdown's Props type carries no interaction-blocking attribute
              (and the approved UI-SPEC forbids adding one), so unmounting is
              the only way to take the caret out of the focus ring — a
              present-but-unusable-looking control would still sit in it on
              one runtime and not the other (the repo's own ledgered lesson).
              Steam routes to "Install with options…"; the other stores to
              "Locate existing installation…". */}
          {/* 34.13 review C-04: the Steam gate lives in the shared predicate
              module (steamInstallOptionsEntry), reached through
              installCaretItem, so the delisted exclusion stays in one place. */}
          {caretItem && (
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
                  aria-label={
                    caretItem === 'steamOptions'
                      ? t(
                          'gamelib:steam.install.withOptionsLabel',
                          'Install with options…'
                        )
                      : t(
                          'gamelib:installFlows.installOptionsLabel',
                          'Install options'
                        )
                  }
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
                  caretItem === 'steamOptions'
                    ? openSteamInstallOptions(gameInfo.app_name, gameInfo)
                    : openInstallGameModal({
                        appName: gameInfo.app_name,
                        runner: gameInfo.runner,
                        gameInfo,
                        action: 'import'
                      })
                }
              >
                {caretItem === 'steamOptions'
                  ? t(
                      'gamelib:steam.install.withOptionsLabel',
                      'Install with options…'
                    )
                  : t(
                      'gamelib:installFlows.importDoorLabel',
                      'Locate existing installation…'
                    )}
              </button>
            </Dropdown>
          )}
        </span>
      )}
    </div>
  )
}

export default MainButton
