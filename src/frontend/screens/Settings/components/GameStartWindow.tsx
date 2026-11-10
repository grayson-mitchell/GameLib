import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import useUiState from 'frontend/state/uiState'
import { SelectField } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import {
  GameStartWindowMode,
  displayedGameStartWindowMode,
  everyLaunchNeedsTray,
  gameStartWindowModes,
  isGameStartWindowMode,
  settingsForGameStartWindowMode
} from 'common/gameStartWindow'

const GameStartWindow = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)

  // Fallbacks match the backend factory defaults (config.ts): shortcut launches hide GameLib.
  const [hideWindowOnProtocolLaunch, setHideWindowOnProtocolLaunch] =
    useSetting('hideWindowOnProtocolLaunch', true)
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useSetting(
    'minimizeOnLaunch',
    false
  )
  const [noTrayIcon] = useSetting('noTrayIcon', false)

  const everyDisabled = everyLaunchNeedsTray(platform, noTrayIcon)

  // Literal `t()` calls only: the i18next parser extracts literal keys. Each fallback equals its
  // `gamelib.json` string (gated by `gameStartWindowSetting.test.ts`).
  const labels: Record<GameStartWindowMode, string> = {
    keep: t('gamelib:settings.gameStartWindow.keep', 'Keep GameLib open'),
    shortcut: t(
      'gamelib:settings.gameStartWindow.shortcut',
      'Hide GameLib for shortcut launches'
    ),
    every: everyDisabled
      ? t(
          'gamelib:settings.gameStartWindow.everyNeedsTray',
          'Hide GameLib for every launch (turn on the tray icon to use this)'
        )
      : t(
          'gamelib:settings.gameStartWindow.every',
          'Hide GameLib for every launch'
        )
  }

  const onChange = (event: SelectChangeEvent) => {
    const next = event.target.value
    if (!isGameStartWindowMode(next)) {
      return
    }
    const settings = settingsForGameStartWindowMode(next)
    setHideWindowOnProtocolLaunch(settings.hideWindowOnProtocolLaunch)
    setMinimizeOnLaunch(settings.minimizeOnLaunch)
  }

  return (
    <SelectField
      htmlId="gameStartWindow"
      label={t('gamelib:settings.gameStartWindow.label', 'When a game starts')}
      labelHelp={
        <InfoIcon
          text={t(
            'gamelib:settings.gameStartWindow.help',
            "Shortcut launches are gamelib:// links, such as the ones 'Add games to Steam' creates, and desktop or Applications shortcuts. GameLib reappears whenever a launch needs your attention."
          )}
        />
      }
      onChange={onChange}
      value={displayedGameStartWindowMode(
        { minimizeOnLaunch, hideWindowOnProtocolLaunch },
        platform,
        noTrayIcon
      )}
    >
      {gameStartWindowModes.map((mode) => (
        <MenuItem
          key={mode}
          value={mode}
          disabled={mode === 'every' && everyDisabled}
        >
          {labels[mode]}
        </MenuItem>
      ))}
    </SelectField>
  )
}

export default GameStartWindow
