import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'

const DiscordRPC = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [discordRPC, setDiscordRPC] = useSetting('discordRPC', false)

  if (!isDefault) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="discordRPC"
        value={discordRPC}
        handleChange={() => setDiscordRPC(!discordRPC)}
        title={t('gamelib:settings.discordPresence', 'Enable Discord presence')}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.discordPresenceHelp',
          'While you play a game launched from GameLib, your Discord status shows the game, how long you have been playing, and "via GameLib". Requires the Discord desktop app to be running.'
        )}
      />
    </div>
  )
}

export default DiscordRPC
