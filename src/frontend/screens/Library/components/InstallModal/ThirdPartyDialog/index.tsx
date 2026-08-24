import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  GameInfo,
  InstallPlatform,
  Runner,
  WineInstallation
} from 'common/types'
import Anticheat from 'frontend/components/UI/Anticheat'
import {
  DialogFooter,
  DialogHeader,
  DialogContent
} from 'frontend/components/UI/Dialog'
import { install, writeConfig } from 'frontend/helpers'
import { hasAnticheatInfo } from 'frontend/hooks/hasAnticheatInfo'
import ContextProvider from 'frontend/state/ContextProvider'
import { InstallProgress } from 'frontend/types'
import React, { useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import AllowedIcon from 'frontend/assets/rounded_checkmark_icon.svg?react'
import { AvailablePlatforms } from '..'
import './index.css'

interface Props {
  backdropClick: () => void
  appName: string
  runner: Runner
  platformToInstall: InstallPlatform
  availablePlatforms: AvailablePlatforms
  winePrefix: string
  crossoverBottle: string
  wineVersion: WineInstallation | undefined
  children: React.ReactNode
  gameInfo: GameInfo
}

export default function ThirdPartyDialog({
  appName,
  runner,
  backdropClick,
  gameInfo,
  availablePlatforms,
  wineVersion,
  children,
  crossoverBottle,
  winePrefix,
  platformToInstall
}: Props) {
  const { t } = useTranslation('gamepage')
  const { platform } = useContext(ContextProvider)
  const isWin = platform === 'win32'
  const progress = {} as InstallProgress

  const anticheatInfo = hasAnticheatInfo(gameInfo)

  const handleInstall = useCallback(async () => {
    // Write Default game config with prefix on linux
    if (!isWin) {
      const gameSettings = await window.api.requestGameSettings(appName)

      if (wineVersion) {
        writeConfig({
          appName,
          config: {
            ...gameSettings,
            winePrefix,
            wineVersion,
            wineCrossoverBottle: crossoverBottle
          }
        })
      }
    }

    backdropClick()

    return install({
      gameInfo,
      previousProgress: progress,
      progress,
      installPath: 'thirdParty',
      isInstalling: false,
      t,
      platformToInstall,
      showDialogModal: () => backdropClick()
    })
  }, [appName, t, winePrefix, wineVersion, crossoverBottle, platformToInstall])

  return (
    <>
      <DialogHeader onClose={backdropClick}>
        {gameInfo.overrides?.title || gameInfo.title}
        {availablePlatforms.map((p) => (
          <FontAwesomeIcon
            className="InstallModal__platformIcon"
            icon={p.icon}
            key={p.value}
          />
        ))}
      </DialogHeader>
      <DialogContent>
        {children}
        {/* Quick 260824-u8b: the platform selector is `children`, passed in by
            InstallModal, and it renders FIRST by contract -- it CHANGES the fields
            below it. `hasWine` (Windows on a non-Windows host) gates the entire Wine
            row, and ImportDialog's `pickFile` decides whether the path picker opens in
            file or directory mode -- a macOS .app bundle is INVISIBLE in directory
            mode, which is what made an import fixture unreachable during the 34.6 live
            gate. A choice that reshapes the form must sit above the form. Gated by
            `InstallModal/__tests__/defaultPlatform.test.ts`. */}
        <div className="thirdPartyNotice">
          <div className="noticeIcon">
            <AllowedIcon />
          </div>
          <div className="noticeInfo">
            <h4>
              {t(
                'third-party-managed.header',
                'This game is managed by a third-party application'
              )}
            </h4>
            <p>
              {t(
                'third-party-managed.notice1',
                'This game is managed by a third-party application: "{{application_name}}"',
                {
                  application_name: gameInfo.isEAManaged
                    ? 'EA app'
                    : gameInfo.thirdPartyManagedApp
                }
              )}
            </p>
            <p>
              {t(
                'third-party-managed.notice2',
                'After clicking Install, GameLib will run the application in order to complete the installation process'
              )}
            </p>
          </div>
        </div>
        <Anticheat anticheatInfo={anticheatInfo} />
      </DialogContent>
      <DialogFooter>
        <button
          className={`button is-secondary`}
          onClick={handleInstall}
          disabled={runner !== 'legendary'}
        >
          {t('button.install')}
        </button>
      </DialogFooter>
    </>
  )
}
