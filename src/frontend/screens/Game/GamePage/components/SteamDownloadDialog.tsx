import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { faDownload, faHardDrive } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  useSteamInstallLocation,
  SteamLibraryOption
} from 'frontend/state/SteamInstallLocation'
import { installSteamGame } from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'

// quick 260719-t8t: the ONE native-Steam install window (retires
// SteamInstallLocationPicker). Modelled on GOG's DownloadDialog layout/styling
// and driven entirely by the useSteamInstallLocation store, whose `libraries`
// are the registered targets from window.api.listSteamLibraryTargets() (empty
// when the D-13 native-install opt-in is OFF). D-08: the install location is a
// registered-Steam-library <select>, NOT a free-text/native-file browser —
// Steam only adopts installs placed inside a library it already knows about.
//
// Deliberately does NOT call getInstallInfo (as GOG's dialog does): Steam
// exposes no pre-install size via that path and it loops forever on "Getting
// download size…". Download size is therefore best-effort with a graceful
// "Unknown" fallback and NEVER a hanging/pulsing spinner.

/** Default selection: the primary library, else the first, else '' (empty). */
export const getDefaultSteamLibraryPath = (
  libraries: SteamLibraryOption[]
): string => {
  const primary = libraries.find((lib) => lib.isPrimary) ?? libraries[0]
  return primary?.path ?? ''
}

const SteamDownloadDialog = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, gameInfo, libraries, close } =
    useSteamInstallLocation()
  const [selectedPath, setSelectedPath] = useState('')
  const [spaceMessage, setSpaceMessage] = useState('')

  // Reset the selected library to the primary/first whenever the window opens.
  useEffect(() => {
    if (!isOpen) return
    setSelectedPath(getDefaultSteamLibraryPath(libraries))
  }, [isOpen, libraries])

  // Recompute free disk space whenever the selected library changes. Local
  // (no Steam dependency); resolves to a value or nothing — never hangs.
  useEffect(() => {
    if (!isOpen || !selectedPath) {
      setSpaceMessage('')
      return
    }
    let cancelled = false
    void window.api.checkDiskSpace(selectedPath).then((data) => {
      if (!cancelled) setSpaceMessage(data.message)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedPath])

  if (!isOpen || !appName || !gameInfo) {
    return null
  }

  const hasLibraries = libraries.length > 0
  const cover = gameInfo.art_cover || gameInfo.art_square
  // Best-effort: there is no cheap frontend pre-install size source for Steam
  // today, so this resolves to the literal "Unknown" immediately. Kept as a
  // value so a future cheap size source can populate it without restructuring.
  const downloadSize: string | undefined = undefined
  const downloadSizeLabel =
    downloadSize ?? t('install.steam-location.size-unknown', 'Unknown')

  const handleCancel = () => close()

  const handleConfirm = () => {
    close()
    installSteamGame(appName, gameInfo, selectedPath)
  }

  return (
    <Dialog
      onClose={handleCancel}
      showCloseButton
      className="steamInstallLocationDialog"
    >
      <DialogHeader onClose={handleCancel}>{gameInfo.title}</DialogHeader>
      <DialogContent>
        {cover ? (
          <img
            className="steamDownloadDialog__cover"
            src={cover}
            alt={gameInfo.title}
          />
        ) : null}
        <div className="InstallModal__sizes">
          <div className="InstallModal__size">
            <FontAwesomeIcon
              className="InstallModal__sizeIcon"
              icon={faDownload}
            />
            <div className="InstallModal__sizeLabel">
              {t('game.downloadSize', 'Download Size')}:
            </div>
            <div className="InstallModal__sizeValue">{downloadSizeLabel}</div>
          </div>
        </div>
        <p>
          {t(
            'install.steam-location.description',
            'Choose which Steam library this game should install into — Steam only adopts installs placed inside a library it already knows about.'
          )}
        </p>
        <select
          id="steamInstallLocationSelect"
          className="steamInstallLocationSelect"
          value={selectedPath}
          disabled={!hasLibraries}
          onChange={(e) => setSelectedPath(e.target.value)}
        >
          {hasLibraries ? (
            libraries.map((lib) => (
              <option key={lib.path} value={lib.path}>
                {lib.isPrimary
                  ? `${lib.path} (${t('install.steam-location.primary', 'default')})`
                  : lib.path}
              </option>
            ))
          ) : (
            <option disabled value="">
              {t('install.steam-location.default', 'Default location')}
            </option>
          )}
        </select>
        {spaceMessage ? (
          <span className="smallInputInfo">
            <span>{`${t('install.disk-space-left', 'Space Available')}: `}</span>
            <span>
              <FontAwesomeIcon
                className="InstallModal__sizeIcon"
                icon={faHardDrive}
              />{' '}
              <strong>{spaceMessage}</strong>
            </span>
          </span>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <button onClick={handleConfirm} className="button is-primary">
          {t('button.install')}
        </button>
        <button onClick={handleCancel} className="button is-secondary outline">
          {t('box.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamDownloadDialog
