import './index.css'

import { useCallback, useContext, useEffect, useState } from 'react'

import { GameInfo, GameStatus, Runner } from 'common/types'

import { createNewWindow, repair } from 'frontend/helpers'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import { NavLink } from 'react-router-dom'

import { CircularProgress, SvgIcon } from '@mui/material'
import UninstallModal from 'frontend/components/UI/UninstallModal'
import GameContext from '../GameContext'
import {
  openInstallGameModal,
  openSteamInstallOptions
} from 'frontend/state/InstallGameModal'
import { showSteamSubMenuInstallOptions } from 'frontend/helpers/steamInstallOptionsEntry'
import useGlobalState from 'frontend/state/GlobalStateV2'
import EditGameDialog from 'frontend/components/UI/EditGameDialog'
import { reportRepairFailure } from './repairFailure'

import {
  ArrowUpward as ArrowUpwardIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  DesktopAccessDisabled as DesktopAccessDisabledIcon,
  Download as DownloadIcon,
  DriveFileMove as DriveFileMoveIcon,
  Edit as EditIcon,
  FindInPage as FindInPageIcon,
  Folder as FolderIcon,
  FormatListBulleted as FormatListBulletedIcon,
  Info as InfoIcon,
  PictureInPicture as PictureInPictureIcon,
  Repartition as RepartitionIcon,
  Shortcut as ShortcutIcon,
  ShoppingCart as ShoppingCartIcon
} from '@mui/icons-material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinux, faSteam } from '@fortawesome/free-brands-svg-icons'
import { faWineGlass } from '@fortawesome/free-solid-svg-icons'

interface Props {
  appName: string
  isInstalled: boolean
  title: string
  storeUrl: string
  changelog?: string
  runner: Runner
  handleUpdate: () => void
  handleChangeLog: () => void
  disableUpdate: boolean
  onShowRequirements?: () => void
  onShowModifyInstall?: () => void
  gameInfo: GameInfo
}

export default function GamesSubmenu({
  appName,
  isInstalled,
  title,
  storeUrl,
  changelog,
  runner,
  handleUpdate,
  handleChangeLog,
  disableUpdate,
  onShowRequirements,
  onShowModifyInstall,
  gameInfo
}: Props) {
  const { refresh, platform, libraryStatus, showDialogModal } =
    useContext(ContextProvider)
  const { openGameCategoriesModal } = useGlobalState.keys(
    'openGameCategoriesModal'
  )
  const { is, gameSettings } = useContext(GameContext)
  const isWin = platform === 'win32'
  const isLinux = platform === 'linux'

  const [steamRefresh, setSteamRefresh] = useState<boolean>(false)
  const [addedToSteam, setAddedToSteam] = useState<boolean>(false)
  const [hasShortcuts, setHasShortcuts] = useState(false)
  const [eosOverlayEnabled, setEosOverlayEnabled] = useState<boolean>(false)
  const [eosOverlayRefresh, setEosOverlayRefresh] = useState<boolean>(false)
  const eosOverlayAppName = '98bc04bc842e4906993fd6d6644ffb8d'
  const [showUninstallModal, setShowUninstallModal] = useState(false)
  const [protonDBurl, setProtonDBurl] = useState(
    `https://www.protondb.com/search?q=${title}`
  )
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const isSideloaded = runner === 'sideload'
  const isSteam = runner === 'steam'
  const isThirdPartyManaged = !!gameInfo.thirdPartyManagedApp

  async function onMoveInstallYesClick() {
    const { defaultInstallPath } = await window.api.requestAppSettings()
    const path = await window.api.openDialog({
      buttonLabel: t('box.choose'),
      properties: ['openDirectory'],
      title: t('box.move.path'),
      defaultPath: defaultInstallPath
    })
    if (path) {
      await window.api.moveInstall({ appName, path, runner })
    }
  }

  function handleMoveInstall() {
    showDialogModal({
      showDialog: true,
      message: t('box.move.message'),
      title: t('box.move.title'),
      buttons: [
        { text: t('box.yes'), onClick: onMoveInstallYesClick },
        { text: t('box.no') }
      ]
    })
  }

  async function onChangeInstallYesClick() {
    const { defaultInstallPath } = await window.api.requestAppSettings()
    const path = await window.api.openDialog({
      buttonLabel: t('box.choose'),
      properties: ['openDirectory'],
      title: t('box.change.path'),
      defaultPath: defaultInstallPath
    })
    if (path) {
      await window.api.changeInstallPath({ appName, path, runner })
      await refresh(runner)
    }
  }

  function handleChangeInstall() {
    showDialogModal({
      showDialog: true,
      message: t('box.change.message'),
      title: t('box.change.title'),
      buttons: [
        { text: t('box.yes'), onClick: onChangeInstallYesClick },
        { text: t('box.no') }
      ]
    })
  }

  async function onRepairYesClick(appName: string) {
    try {
      await repair(appName, runner)
    } catch (error) {
      reportRepairFailure({ appName, error, showDialogModal, t })
    }
  }

  function handleRepair(appName: string) {
    showDialogModal({
      showDialog: true,
      message: t('box.repair.message'),
      title: t('box.repair.title'),
      buttons: [
        { text: t('box.yes'), onClick: async () => onRepairYesClick(appName) },
        { text: t('box.no') }
      ]
    })
  }

  function handleShortcuts() {
    if (hasShortcuts) {
      window.api.removeShortcut(appName, runner)
      return setHasShortcuts(false)
    }
    window.api.addShortcut(appName, runner, true)

    return setHasShortcuts(true)
  }

  function handleEdit() {
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

  async function handleEosOverlay() {
    setEosOverlayRefresh(true)
    if (eosOverlayEnabled) {
      await window.api.disableEosOverlay(appName)
      setEosOverlayEnabled(false)
    } else {
      const initialEnableResult = await window.api.enableEosOverlay(appName)
      const { installNow } = initialEnableResult
      let { wasEnabled } = initialEnableResult

      if (installNow) {
        await window.api.installEosOverlay()
        wasEnabled = (await window.api.enableEosOverlay(appName)).wasEnabled
      }
      setEosOverlayEnabled(wasEnabled)
    }
    setEosOverlayRefresh(false)
  }

  async function handleAddToSteam() {
    setSteamRefresh(true)
    if (addedToSteam) {
      await window.api
        .removeFromSteam(appName, runner)
        .then(() => setAddedToSteam(false))
    } else {
      await window.api
        .addToSteam(appName, runner)
        .then((added) => setAddedToSteam(added))
    }
    setSteamRefresh(false)
  }

  useEffect(() => {
    // Check for game shortcuts on Steam
    window.api.isAddedToSteam(appName, runner).then((added) => {
      setAddedToSteam(added)
    })

    if (!isInstalled) {
      return
    }

    // Check for game shortcuts on desktop and start menu
    window.api.shortcutsExists(appName, runner).then((added) => {
      setHasShortcuts(added)
    })

    // only unix specific
    if (!isWin && runner === 'legendary') {
      // check if eos overlay is enabled
      const { status } =
        libraryStatus.filter(
          (game: GameStatus) => game.appName === eosOverlayAppName
        )[0] || {}
      setEosOverlayRefresh(status === 'installing')

      window.api
        .isEosOverlayEnabled(appName)
        .then((enabled) => setEosOverlayEnabled(enabled))
    }
  }, [isInstalled])

  useEffect(() => {
    // For native Steam games, app_name IS the Steam AppID — link directly
    // without the wiki round-trip.
    if (isSteam) {
      setProtonDBurl(`https://www.protondb.com/app/${appName}`)
      return
    }
    // Otherwise resolve the steam id from wiki sources and set direct link
    window.api.getWikiGameInfo(title, appName, runner).then((info) => {
      const steamID = info?.pcgamingwiki?.steamID ?? info?.gamesdb?.steamID
      if (steamID) {
        setProtonDBurl(`https://www.protondb.com/app/${steamID}`)
      }
    })
  }, [title, appName])

  const refreshCircle = () => {
    return <CircularProgress className="link button is-text is-link" />
  }

  const showModifyItem =
    onShowModifyInstall &&
    ['legendary', 'gog'].includes(runner) &&
    isInstalled &&
    !isThirdPartyManaged

  const hasWine =
    !is.win && !is.native && gameSettings?.wineVersion.type !== 'crossover'

  const onBrowseFiles = useCallback(() => {
    const path = gameInfo.install.install_path || gameInfo.folder_name

    if (path) {
      window.api.openFolder(path)
    }
  }, [gameInfo])

  const onBrowsePrefix = useCallback(() => {
    const path = gameSettings?.winePrefix

    if (path) {
      window.api.openFolder(path)
    }
  }, [gameSettings])

  return (
    <>
      <div className="gameTools subMenuContainer">
        {showUninstallModal && (
          <UninstallModal
            appName={appName}
            runner={runner}
            onClose={() => setShowUninstallModal(false)}
            isDlc={false}
          />
        )}
        <div className={`submenu`}>
          {/*
            D-27 row 5 — a NEW control, NOT a relabel. D-27's own table says
            "existing Install item… relabels to 'Install with options…'", but
            RESEARCH Q4's full-file read and plan 08's <call_site_map> both
            found no such item: the only "Install"-shaped affordance in this
            file is handleEdit()'s sideload-only branch above (dead for a
            non-sideload runner), and every other item here is either
            isInstalled-gated (the cluster immediately below) or restricted
            to ['legendary','gog']. This block is placed BEFORE that cluster
            so it is the first, and for an uninstalled Steam game the only,
            control in the menu — document order puts it first for
            keyboard/gamepad traversal (GamePage:482 -> DotsMenu:41 ->
            GameSubMenu mounts this file for uninstalled games with no gate
            of its own, so this block is reachable, not dead code).
          */}
          {showSteamSubMenuInstallOptions({
            runner,
            isInstalled,
            isDelisted: !!gameInfo.is_delisted
          }) && (
            <button
              onClick={() => openSteamInstallOptions(appName, gameInfo)}
              className="link button is-text is-link buttonWithIcon"
            >
              <DownloadIcon />
              {tGamelib(
                'gamelib:steam.install.withOptionsLabel',
                'Install with options…'
              )}
            </button>
          )}
          {isInstalled && (
            <>
              <button
                onClick={async () => handleEdit()}
                className="link button is-text is-link buttonWithIcon"
              >
                <EditIcon />
                {isSideloaded
                  ? t('button.sideload.edit', 'Edit App/Game')
                  : t('button.edit-game', 'Edit Game')}
              </button>{' '}
              <button
                onClick={() => handleShortcuts()}
                className="link button is-text is-link buttonWithIcon"
              >
                <ShortcutIcon />
                {hasShortcuts
                  ? t('submenu.removeShortcut', 'Remove shortcuts')
                  : t('submenu.addShortcut', 'Add shortcut')}
              </button>
              <button
                onClick={async () => {
                  if (isSteam) {
                    // D-05: delegate straight to Steam's own uninstall dialog — no GamerLib confirm
                    window.api.uninstall(appName, runner, false, false)
                  } else {
                    setShowUninstallModal(true)
                  }
                }}
                className="link button is-text is-link buttonWithIcon"
                disabled={is.playing}
              >
                <DeleteIcon />
                {t('button.uninstall', 'Uninstall')}
              </button>{' '}
              {!isSideloaded && !isSteam && !isThirdPartyManaged && (
                <button
                  onClick={async () => handleUpdate()}
                  className="link button is-text is-link buttonWithIcon"
                  disabled={disableUpdate}
                >
                  <ArrowUpwardIcon />
                  {t('button.force_update', 'Force Update if Available')}
                </button>
              )}{' '}
              {!isSideloaded && !isSteam && !isThirdPartyManaged && (
                <button
                  onClick={async () => handleMoveInstall()}
                  className="link button is-text is-link buttonWithIcon"
                >
                  <DriveFileMoveIcon />
                  {t('submenu.move', 'Move Game')}
                </button>
              )}{' '}
              {!isSideloaded && !isSteam && !isThirdPartyManaged && (
                <button
                  onClick={async () => handleChangeInstall()}
                  className="link button is-text is-link buttonWithIcon"
                >
                  <FindInPageIcon />
                  {t('submenu.change', 'Change Install Location')}
                </button>
              )}{' '}
              {!isSideloaded && !isSteam && !isThirdPartyManaged && (
                <button
                  onClick={async () => handleRepair(appName)}
                  className="link button is-text is-link buttonWithIcon"
                >
                  <CheckCircleIcon />
                  {t('submenu.verify', 'Verify and Repair')}
                </button>
              )}{' '}
              {isLinux &&
                runner === 'legendary' &&
                (eosOverlayRefresh ? (
                  refreshCircle()
                ) : (
                  <button
                    className="link button is-text is-link buttonWithIcon"
                    onClick={handleEosOverlay}
                  >
                    <PictureInPictureIcon />
                    {eosOverlayEnabled
                      ? t('submenu.disableEosOverlay', 'Disable EOS Overlay')
                      : t('submenu.enableEosOverlay', 'Enable EOS Overlay')}
                  </button>
                ))}
            </>
          )}
          {/* Steam games are already in Steam — hide the add/remove-to-Steam action */}
          {!isSteam &&
            (steamRefresh ? (
              refreshCircle()
            ) : (
              <button
                onClick={async () => handleAddToSteam()}
                className="link button is-text is-link buttonWithIcon"
              >
                <SvgIcon>
                  <FontAwesomeIcon icon={faSteam} />
                </SvgIcon>
                {addedToSteam
                  ? t('submenu.removeFromSteam', 'Remove from Steam')
                  : t('submenu.addToSteam', 'Add to Steam')}
              </button>
            ))}
          <button
            onClick={() => openGameCategoriesModal(gameInfo)}
            className="link button is-text is-link buttonWithIcon"
          >
            <FormatListBulletedIcon />
            {t('submenu.categories', 'Categories')}
          </button>
          {!isSideloaded && storeUrl && (
            <NavLink
              className="link button is-text is-link buttonWithIcon"
              to={`/store-page?store-url=${storeUrl}`}
            >
              <ShoppingCartIcon />
              {t('submenu.store')}
            </NavLink>
          )}
          {!isSideloaded && !!changelog?.length && (
            <button
              onClick={() => handleChangeLog()}
              className="link button is-text is-link buttonWithIcon"
            >
              <InfoIcon />
              {t('button.changelog', 'Show Changelog')}
            </button>
          )}{' '}
          {!isSideloaded && isLinux && (
            <button
              onClick={() => createNewWindow(protonDBurl)}
              className="link button is-text is-link buttonWithIcon"
            >
              <SvgIcon>
                <FontAwesomeIcon icon={faLinux} />
              </SvgIcon>
              {t('submenu.protondb', 'Check Compatibility')}
            </button>
          )}
          {onShowRequirements && (
            <button
              onClick={async () => onShowRequirements()}
              className="link button is-text is-link buttonWithIcon"
            >
              <DesktopAccessDisabledIcon />
              {t('game.requirements', 'Requirements')}
            </button>
          )}
          {showModifyItem && (
            <button
              onClick={async () => onShowModifyInstall()}
              className="link button is-text is-link buttonWithIcon"
            >
              <RepartitionIcon />
              {t('game.modify', 'Modify Installation')}
            </button>
          )}
          {isInstalled && (
            <button
              onClick={async () => onBrowseFiles()}
              className="link button is-text is-link buttonWithIcon"
            >
              <FolderIcon />
              {t('button.browse_files', 'Browse Files')}
            </button>
          )}
          {hasWine && (
            <button
              onClick={async () => onBrowsePrefix()}
              className="link button is-text is-link buttonWithIcon"
            >
              <SvgIcon>
                <FontAwesomeIcon icon={faWineGlass} />
              </SvgIcon>
              {t('button.browse_wine_prefix', 'Browse Wine Prefix')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
