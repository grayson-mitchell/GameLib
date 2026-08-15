import './index.css'

import { useContext, CSSProperties, useMemo, useState, useEffect } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRepeat, faBan, faSyncAlt } from '@fortawesome/free-solid-svg-icons'

import DownIcon from 'frontend/assets/down-icon.svg?react'
import { FavouriteGame, GameInfo, HiddenGame, Runner } from 'common/types'
import { Link, useNavigate } from 'react-router-dom'
import PlayIcon from 'frontend/assets/play-icon.svg?react'
import SettingsIcon from 'frontend/assets/settings_icon_alt.svg?react'
import StopIcon from 'frontend/assets/stop-icon.svg?react'
import StopIconAlt from 'frontend/assets/stop-icon-alt.svg?react'
import {
  getGameInfo,
  getProgress,
  getStoreName,
  install,
  launch,
  sendKill
} from 'frontend/helpers'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import { updateGame } from 'frontend/helpers/library'
import { CachedImage, SvgButton } from 'frontend/components/UI'
import ContextMenu, { Item } from '../ContextMenu'
import { hasProgress } from 'frontend/hooks/hasProgress'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'

import classNames from 'classnames'
import StoreLogos from 'frontend/components/UI/StoreLogos'
import UninstallModal from 'frontend/components/UI/UninstallModal'
import { getCardStatus, getImageFormatting } from './constants'
import { hasStatus } from 'frontend/hooks/hasStatus'
import fallBackImage from 'frontend/assets/gamelib_card.svg?url'
import fallBackImageMissing from 'frontend/assets/gamelib_card_missing.svg?url'
import LibraryContext from '../../LibraryContext'
import useGlobalState from 'frontend/state/GlobalStateV2'
import {
  Cancel,
  DeleteForever,
  Description,
  Download,
  Edit,
  Favorite,
  FavoriteBorder,
  List,
  OpenInNew,
  PlayArrow,
  PlaylistRemove,
  Settings,
  Upgrade,
  Visibility,
  VisibilityOff
} from '@mui/icons-material'
import EditGameDialog from 'frontend/components/UI/EditGameDialog'
import {
  openInstallGameModal,
  openSteamInstallOptions
} from 'frontend/state/InstallGameModal'
import { showSteamCardInstallOptions } from 'frontend/helpers/steamInstallOptionsEntry'
import CrossoverBadge from './CrossoverBadge'

interface Card {
  buttonClick: () => void
  hasUpdate: boolean
  isRecent: boolean
  justPlayed: boolean
  gameInfo: GameInfo
  forceCard?: boolean
  dataTour?: string
}

const storage: Storage = window.localStorage

const GameCard = ({
  hasUpdate,
  buttonClick,
  forceCard,
  isRecent = false,
  justPlayed = false,
  gameInfo: gameInfoFromProps,
  dataTour
}: Card) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // render an empty div until the card enters the viewport
    // check GameList for the other side of this detection
    const callback = (e: CustomEvent<{ appNames: string[] }>) => {
      if (e.detail.appNames.includes(gameInfoFromProps.app_name)) {
        setVisible(true)
      }
    }

    window.addEventListener('visible-cards', callback)

    return () => {
      window.removeEventListener('visible-cards', callback)
    }
  }, [])

  const [gameInfo, setGameInfo] = useState<GameInfo>(gameInfoFromProps)
  const [showUninstallModal, setShowUninstallModal] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)

  const { t } = useTranslation('gamepage')
  const { t: t2 } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  const navigate = useNavigate()

  const {
    hiddenGames,
    favouriteGames,
    showDialogModal,
    activeController,
    connectivity
  } = useContext(ContextProvider)
  const {
    openGameSettingsModal,
    openGameLogsModal,
    openGameCategoriesModal,
    crossoverRatings
  } = useGlobalState.keys(
    'openGameSettingsModal',
    'openGameLogsModal',
    'openGameCategoriesModal',
    'crossoverRatings'
  )

  const { layout } = useContext(LibraryContext)

  const {
    art_logo: logo = undefined,
    app_name: appName,
    runner,
    is_installed: isInstalled,
    install: gameInstallInfo
  } = { ...gameInfoFromProps }
  const crossoverRating = crossoverRatings[appName]
  const title = gameInfoFromProps.overrides?.title || gameInfoFromProps.title
  const art_cover =
    gameInfoFromProps.overrides?.art_cover || gameInfoFromProps.art_cover
  const cover =
    gameInfoFromProps.overrides?.art_square || gameInfoFromProps.art_square

  const isInstallable =
    gameInfo.installable === undefined || gameInfo.installable // If it's undefined we assume it's installable

  const [progress, previousProgress] = hasProgress(appName, runner)
  const { install_size: size = '0' } = {
    ...gameInstallInfo
  }

  const { status, folder, label } = hasStatus(gameInfo, size)

  const isBrowserGame = gameInfo.install.platform === 'Browser'

  useEffect(() => {
    setIsLaunching(false)
    const updateGameInfo = async () => {
      const newInfo = await getGameInfo(appName, runner)
      if (newInfo) {
        setGameInfo(newInfo)
      }
    }
    updateGameInfo()
  }, [status])

  async function handleUpdate() {
    if (gameInfo.runner !== 'sideload')
      updateGame({ appName, runner, gameInfo })
  }

  const grid = forceCard || layout === 'grid'

  const {
    isInstalling,
    notSupportedGame,
    isUninstalling,
    isQueued,
    isPlaying,
    notAvailable,
    isUpdating,
    haveStatus
  } = getCardStatus(status, isInstalled, layout)

  const installingGrayscale = isInstalling
    ? `${125 - getProgress(progress)}%`
    : '100%'

  const handleRemoveFromQueue = () => {
    window.api.removeFromDMQueue(appName)
  }

  const renderIcon = () => {
    if (!isInstallable) {
      return (
        <FontAwesomeIcon
          title={t(
            'label.game.not-installable-game',
            'Game is NOT Installable'
          )}
          className="downIcon"
          icon={faBan}
        />
      )
    }

    if (notSupportedGame) {
      return (
        <FontAwesomeIcon
          title={t(
            'label.game.third-party-game',
            'Third-Party Game NOT Supported'
          )}
          className="downIcon"
          icon={faBan}
        />
      )
    }
    if (isUninstalling) {
      return (
        <button className="svg-button iconDisabled">
          <svg />
        </button>
      )
    }
    if (isQueued) {
      return (
        <SvgButton
          title={t('button.queue.remove', 'Remove from Queue')}
          className="queueIcon"
          onClick={() => handleRemoveFromQueue()}
        >
          <RemoveCircleIcon />
        </SvgButton>
      )
    }
    // D-08: hide the Stop button for Steam while Playing (observe-only) — GameLib
    // never owns the Steam process, so Stop cannot work. Falls through to the
    // installed-game play icon; the Playing badge still shows via gameCardStatus.
    if (isPlaying && !isSteam) {
      return (
        <SvgButton
          className="cancelIcon"
          onClick={async () => handlePlay(runner)}
          title={`${t('label.playing.stop')} (${title})`}
        >
          <StopIconAlt />
        </SvgButton>
      )
    }
    // Steam installs cannot be cancelled from GamerLib — show spinner only (D-07)
    if (isInstalling && isSteam) {
      return (
        <button className="svg-button iconDisabled" disabled>
          <FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />
        </button>
      )
    }

    if (isInstalling || isQueued) {
      return (
        <SvgButton
          className="cancelIcon"
          onClick={async () => handlePlay(runner)}
          title={`${t('button.cancel')} (${title})`}
        >
          <StopIcon />
        </SvgButton>
      )
    }
    if (isInstalled) {
      const disabled =
        isLaunching ||
        ['syncing-saves', 'launching', 'winetricks', 'redist'].includes(status!)
      return (
        <SvgButton
          className={!notAvailable ? 'playIcon' : 'notAvailableIcon'}
          onClick={async () => handlePlay(runner)}
          title={`${t('label.playing.start')} (${title})`}
          disabled={disabled}
        >
          {justPlayed ? <span>{t('button.play', 'PLAY')}</span> : <PlayIcon />}
        </SvgButton>
      )
    } else {
      // D-05: no install for delisted games — steam://install returns silent error
      if (isDelisted) return null
      return (
        <SvgButton
          className="downIcon"
          onClick={() => buttonClick()}
          title={`${t('button.install')} (${title})`}
        >
          <DownIcon />
        </SvgButton>
      )
    }
  }

  const isHiddenGame = useMemo(() => {
    return !!hiddenGames.list.find(
      (hiddenGame: HiddenGame) => hiddenGame.appName === appName
    )
  }, [hiddenGames, appName])

  const isFavouriteGame = useMemo(() => {
    return !!favouriteGames.list.find(
      (favouriteGame: FavouriteGame) => favouriteGame.appName === appName
    )
  }, [favouriteGames, appName])

  const onUninstallClick = function () {
    setShowUninstallModal(true)
  }

  const isSideloaded = runner === 'sideload'
  const isSteam = runner === 'steam'
  const isDelisted = !!gameInfoFromProps.is_delisted

  const handleEdit = () => {
    if (isSideloaded) {
      openInstallGameModal({ appName, runner, gameInfo })
      return
    }

    showDialogModal({
      showDialog: true,
      title: t('edit-game.title', 'Edit Game'),
      message: (
        <EditGameDialog
          gameInfo={gameInfo}
          backdropClick={() => showDialogModal({ showDialog: false })}
        />
      )
    })
  }

  const items: Item[] = [
    {
      // remove from install queue
      label: t('button.queue.remove'),
      onclick: () => handleRemoveFromQueue(),
      show: isQueued && !isInstalling,
      icon: <Cancel />
    },
    {
      // stop if running — hidden for Steam (D-08: observe-only, GameLib does not
      // own the Steam process, so Stop cannot work)
      label: t('label.playing.stop'),
      onclick: async () => handlePlay(runner),
      show: isPlaying && !isSteam,
      icon: <Cancel />
    },
    {
      // launch game
      label: t('label.playing.start'),
      onclick: async () => handlePlay(runner),
      show: isInstalled && !isPlaying && !isUpdating && !isQueued,
      icon: <PlayArrow />
    },
    {
      // update
      label: t('button.update', 'Update'),
      onclick: async () => handleUpdate(),
      show: hasUpdate && !isUpdating && !isQueued,
      icon: <Upgrade />
    },
    {
      // install
      label: t('button.install'),
      onclick: () => buttonClick(),
      show: !isInstalled && !isQueued && isInstallable && !isDelisted,
      icon: <Download />
    },
    {
      // install with options — NEW for D-27 row 3. D-27's own text cites
      // GameCard/index.tsx:322 as an item to relabel; that line is inside
      // handleEdit()'s sideload-only branch (RESEARCH Q4, plan 08's own
      // call-site map) and is deliberately untouched here. This is an
      // ADDITION beside the existing plain install entry above, gated
      // Steam-only via the shared predicate so D-28 is enforced at one site.
      label: tGamelib(
        'gamelib:steam.install.withOptionsLabel',
        'Install with options…'
      ),
      onclick: () => openSteamInstallOptions(appName, gameInfo),
      show: showSteamCardInstallOptions({
        runner,
        isInstalled,
        isQueued,
        isInstallable,
        isDelisted
      }),
      icon: <Settings />
    },
    {
      // cancel installation/update — hidden for Steam (GamerLib cannot cancel Steam's download)
      label: t('button.cancel'),
      onclick: async () => handlePlay(runner),
      show: (isInstalling || isUpdating) && !isSteam,
      icon: <Cancel />
    },
    {
      // open the game page
      label: t('button.details', 'Details'),
      onclick: () =>
        navigate(`/gamepage/${runner}/${appName}`, { state: { gameInfo } }),
      show: true,
      icon: <OpenInNew />
    },
    {
      // settings
      label: t('submenu.settings', 'Settings'),
      onclick: () => openGameSettingsModal(gameInfo),
      show: isInstalled && !isUninstalling && !isBrowserGame,
      icon: <Settings />
    },
    {
      label: t('submenu.logs', 'Logs'),
      onclick: () => openGameLogsModal(gameInfo),
      show: isInstalled && !isUninstalling && !isBrowserGame,
      icon: <Description />
    },
    {
      label: isSideloaded
        ? t('button.sideload.edit', 'Edit App/Game')
        : t('edit-game.title', 'Edit Game'),
      onclick: handleEdit,
      show: true,
      icon: <Edit />
    },
    {
      // hide
      label: t('button.hide_game', 'Hide Game'),
      onclick: () => hiddenGames.add(appName, title),
      show: !isHiddenGame,
      icon: <VisibilityOff />
    },
    {
      // unhide
      label: t('button.unhide_game', 'Unhide Game'),
      onclick: () => hiddenGames.remove(appName),
      show: isHiddenGame,
      icon: <Visibility />
    },
    {
      label: t('button.add_to_favourites', 'Add To Favourites'),
      onclick: () => favouriteGames.add(appName, title),
      show: !isFavouriteGame,
      icon: <Favorite />
    },
    {
      label: t('submenu.categories', 'Categories'),
      onclick: () => openGameCategoriesModal(gameInfo),
      show: true,
      icon: <List />
    },
    {
      label: t('button.remove_from_favourites', 'Remove From Favourites'),
      onclick: () => favouriteGames.remove(appName),
      show: isFavouriteGame,
      icon: <FavoriteBorder />
    },
    {
      label: t('button.remove_from_recent', 'Remove From Recent'),
      onclick: async () => window.api.removeRecentGame(appName),
      show: isRecent,
      icon: <PlaylistRemove />
    },
    {
      // uninstall
      label: t('button.uninstall'),
      onclick: onUninstallClick,
      show: isInstalled && !isUpdating && !isPlaying,
      icon: <DeleteForever />
    }
  ]

  const wrapperClasses = classNames(grid ? 'gameCard' : 'gameListItem', {
    installed: isInstalled,
    hidden: isHiddenGame,
    notAvailable: notAvailable || isDelisted, // LIB-08: Pitfall 4 fix
    gamepad: activeController,
    justPlayed: justPlayed
  })

  const imgClasses = classNames('gameImg', { installed: isInstalled })
  const logoClasses = classNames('gameLogo', { installed: isInstalled })

  const showUpdateButton =
    hasUpdate && !isUpdating && !isQueued && !notAvailable

  if (!visible) {
    return (
      <div
        className={wrapperClasses}
        data-app-name={appName}
        data-invisible={true}
        data-tour={dataTour}
      ></div>
    )
  }

  const showSettingsButton = isInstalled && !isUninstalling && !isBrowserGame
  const showUpdateBadge =
    hasUpdate && !isUpdating && !isQueued && activeController

  return (
    <div>
      {showUninstallModal && (
        <UninstallModal
          appName={appName}
          runner={runner}
          isDlc={Boolean(gameInfo.install.is_dlc)}
          onClose={() => setShowUninstallModal(false)}
        />
      )}
      <ContextMenu items={items}>
        <div
          className={wrapperClasses}
          data-app-name={appName}
          data-tour={dataTour}
        >
          {haveStatus && <span className="gameCardStatus">{label}</span>}
          {showUpdateBadge && (
            <span className="gameCardUpdateBadge">
              {t('status.hasUpdates')}
            </span>
          )}
          {isDelisted && (
            <span
              className="gameCardDelistedBadge"
              aria-label={t2('library.delisted', 'Game no longer available')}
              aria-hidden={false}
              style={{ pointerEvents: 'none' }}
            >
              {t2('library.delisted', 'Game no longer available')}
            </span>
          )}
          <CrossoverBadge rating={crossoverRating} />
          <Link
            to={`/gamepage/${runner}/${appName}`}
            state={{ gameInfo }}
            style={
              { '--installing-effect': installingGrayscale } as CSSProperties
            }
          >
            <StoreLogos runner={runner} />
            {justPlayed ? (
              <CachedImage
                src={art_cover || fallBackImage}
                fallback={fallBackImageMissing}
                className="justPlayedImg"
                alt={title}
              />
            ) : (
              <CachedImage
                src={getImageFormatting(cover, runner)}
                fallback={
                  art_cover && art_cover !== cover
                    ? [
                        getImageFormatting(art_cover, runner),
                        fallBackImageMissing
                      ]
                    : fallBackImageMissing
                }
                className={imgClasses}
                alt="cover"
              />
            )}
            {(justPlayed || runner !== 'nile') && logo && (
              <CachedImage
                alt="logo"
                src={`${logo}?h=400&resize=1&w=300`}
                className={logoClasses}
              />
            )}
            {haveStatus && (
              <span
                className={classNames('gameListInfo', {
                  active: haveStatus,
                  installed: isInstalled
                })}
              >
                {label}
              </span>
            )}
            <span
              className={classNames('gameTitle', {
                active: haveStatus,
                installed: isInstalled
              })}
            >
              <span>{title}</span>
            </span>
            <span
              className={classNames('runner', {
                active: haveStatus,
                installed: isInstalled
              })}
            >
              {getStoreName(runner, t2('Other'))}
            </span>
          </Link>
          <>
            <span className="icons">
              {showUpdateButton && (
                <SvgButton
                  className="updateIcon"
                  title={`${t('button.update')} (${title})`}
                  onClick={async () => handleUpdate()}
                >
                  <FontAwesomeIcon size={'2x'} icon={faRepeat} />
                </SvgButton>
              )}
              {showSettingsButton && (
                <>
                  <SvgButton
                    title={`${t('submenu.settings')} (${title})`}
                    className="settingsIcon"
                    onClick={() => openGameSettingsModal(gameInfo)}
                  >
                    <SettingsIcon />
                  </SvgButton>
                </>
              )}
              {renderIcon()}
            </span>
          </>
        </div>
      </ContextMenu>
    </div>
  )

  async function handlePlay(runner: Runner) {
    // 34.13 review B-WR-10: the generic `install()` helper below forwards
    // `runner` verbatim and defaults `installPath` to GameLib's
    // `defaultInstallPath` -- NOT a Steam library. WR-02 already proved that
    // exact shape live once (Console Mode validated one directory and
    // installed to another). `GamePage/index.tsx` guards its equivalent
    // branch; this one excluded only `'sideload'`, never `'steam'`. Reported
    // as LATENT rather than live -- the card renders the down-icon ->
    // `buttonClick()` in the not-installed/not-queued state, so no rendered
    // control was found that reaches here -- but the guard is one line and
    // the E4 census in `InstallGameModal.test.ts` is file-scoped, so it
    // cannot express "sole marshalling site" and would not catch a
    // recurrence.
    //
    // DEVIATION from the review's literal prescription
    // (`return startSteamQuickInstall(appName, gameInfo)`, mirroring
    // `GamePage`): this file's own spec C5 in
    // `helpers/__tests__/steamInstallOptionsEntry.test.ts` pins ZERO
    // occurrences of `startSteamQuickInstall` here -- "no second route to
    // the quick half". Calling it directly would satisfy the finding and
    // break that locked decision. `openInstallGameModal` is the shared
    // chokepoint every other install entry point on this card already uses,
    // and it short-circuits `runner === 'steam' && action === 'install'` to
    // `startSteamQuickInstall` itself -- so the user-visible outcome is the
    // one the review asked for, reached through the one door D-27 sanctions
    // instead of a new one.
    // 34.13 review B-WR-05: `!isQueued` and `!isDelisted` are BOTH required.
    // The branch this replaced for Steam carried `!isQueued`, and this guard
    // sits ABOVE the `if (isQueued) { removeFromDMQueue }` handler below — so
    // for a queued, not-installed Steam game it dispatched a SECOND install
    // where the pre-fix code dequeued. `!isDelisted` is enforced by every
    // other install route on this card (the items-menu entry at `show: … &&
    // !isDelisted`, `showSteamCardInstallOptions`, and `renderIcon`'s
    // `if (isDelisted) return null`) against D-05's own rule that
    // `steam://install` returns a silent error for delisted games. A guard
    // that is unreachable today is exactly the kind that gets wired up later,
    // and it must not encode two decisions opposite to the rest of the file.
    if (
      !isInstalled &&
      !isQueued &&
      !isDelisted &&
      gameInfo.runner === 'steam'
    ) {
      openInstallGameModal({ appName, runner: gameInfo.runner, gameInfo })
      return
    }

    if (!isInstalled && !isQueued && gameInfo.runner !== 'sideload') {
      return install({
        gameInfo,
        installPath: folder || 'default',
        isInstalling,
        previousProgress,
        progress,
        t,
        showDialogModal
      })
    }

    if (isPlaying || isUpdating) {
      return sendKill(appName, runner)
    }

    if (isQueued) {
      storage.removeItem(appName)
      return window.api.removeFromDMQueue(appName)
    }

    if (isInstalled) {
      setIsLaunching(true)
      const isOffline = connectivity.status !== 'online'
      const notPlayableOffline = isOffline && !gameInfo.canRunOffline
      await launch({
        appName,
        t,
        runner,
        hasUpdate,
        showDialogModal,
        notPlayableOffline
      })
      setIsLaunching(false)
    }
    return
  }
}

export default GameCard
