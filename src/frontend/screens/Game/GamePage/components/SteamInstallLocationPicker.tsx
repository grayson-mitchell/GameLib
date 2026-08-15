import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSteamInstallLocation } from 'frontend/state/SteamInstallLocation'
import { installSteamGame } from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'

// Phase 21 (21-09), D-09: multi-library override picker. Opened exclusively
// by the SteamInstallLocation store (which is itself only ever opened when
// window.api.listSteamLibraryTargets() returns more than one registered
// library — single-library installs never mount this dialog, D-09's
// zero-friction requirement). D-08: options are the registered Steam
// libraries themselves — deliberately a <select>, NOT PathSelectionBox's
// free-text/native-file-dialog browser, since a Steam native install must
// never target an arbitrary unregistered directory.
const SteamInstallLocationPicker = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, gameInfo, libraries, close } =
    useSteamInstallLocation()
  const [selectedPath, setSelectedPath] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const primary = libraries.find((lib) => lib.isPrimary) ?? libraries[0]
    setSelectedPath(primary?.path ?? '')
  }, [isOpen, libraries])

  if (!isOpen || !appName || !gameInfo) {
    return null
  }

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
      <DialogHeader onClose={handleCancel}>
        {t('install.steam-location.title', 'Choose Steam library')}
      </DialogHeader>
      <DialogContent>
        <p>
          {t(
            'install.steam-location.description',
            'Multiple Steam libraries are registered on this system. Choose which one this game should install into — Steam only adopts installs placed inside a library it already knows about.'
          )}
        </p>
        <select
          id="steamInstallLocationSelect"
          className="steamInstallLocationSelect"
          value={selectedPath}
          onChange={(e) => setSelectedPath(e.target.value)}
        >
          {libraries.map((lib) => (
            <option key={lib.path} value={lib.path}>
              {lib.isPrimary
                ? `${lib.path} (${t('install.steam-location.primary', 'default')})`
                : lib.path}
            </option>
          ))}
        </select>
      </DialogContent>
      <DialogFooter>
        <button onClick={handleConfirm} className="button is-primary">
          {t('button.install')}
        </button>
        <button
          onClick={handleCancel}
          className="button is-secondary outline"
        >
          {t('box.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamInstallLocationPicker
