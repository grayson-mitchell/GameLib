import { useCallback, useEffect, useRef, useState } from 'react'
import { GameInfo } from 'common/types'
import { Dialog, DialogContent } from 'frontend/components/UI/Dialog'
import { GamesSettings } from '../../sections'
import SettingsContext from '../../SettingsContext'
import useSettingsContext from 'frontend/hooks/useSettingsContext'
import LogSettings from '../../sections/LogSettings'
import { SettingsContextType } from 'frontend/types'
import CategorySettings from '../../sections/CategorySettings'
import useUiState from 'frontend/state/uiState'
import SettingsModalHeader from './SettingsModalHeader'
import './index.scss'

export type GameSettingsModalType = 'settings' | 'log' | 'category'

type Props = {
  gameInfo: GameInfo
  type: GameSettingsModalType
}

function SettingsModal({ gameInfo, type }: Props) {
  const { closeSettingsModal } = useUiState.keys('closeSettingsModal')

  const { app_name: appName, runner } = gameInfo

  // quick-261121-dzl (sketch 009 #10): briefly flash "Saved" in the header
  // when a setting write actually goes out.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSettingWritten = useCallback(() => {
    setJustSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSaved(false), 1200)
  }, [])
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    },
    []
  )

  // create setting context functions
  const contextValues: SettingsContextType | null = useSettingsContext({
    appName,
    gameInfo,
    runner,
    onSettingWritten
  })

  if (!contextValues) {
    return null
  }

  return (
    <Dialog
      onClose={() => closeSettingsModal()}
      showCloseButton
      className={'InstallModal__dialog'}
      header={
        <SettingsModalHeader
          gameInfo={gameInfo}
          type={type}
          justSaved={justSaved}
        />
      }
    >
      <DialogContent className="settingsDialogContent">
        <SettingsContext.Provider value={contextValues}>
          {type === 'settings' && <GamesSettings />}
          {type === 'log' && <LogSettings />}
          {type === 'category' && <CategorySettings />}
        </SettingsContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsModalWrapper() {
  const { settingsModalProps } = useUiState.keys('settingsModalProps')

  if (!settingsModalProps.isOpen) {
    return <></>
  }

  return <SettingsModal {...settingsModalProps} />
}
