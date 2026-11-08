import { useTranslation } from 'react-i18next'
import LanguageSelector from 'frontend/components/UI/LanguageSelector'
import {
  AutoUpdateGames,
  CheckUpdatesOnStartup,
  DefaultInstallPath,
  DisableController,
  DiscordRPC,
  GameStartWindow,
  ShareDetectedFixes,
  HideChangelogOnStartup,
  MaxWorkers,
  Shortcuts,
  StartInConsoleMode,
  TraySettings,
  UseDarkTrayIcon,
  UseFramelessWindow,
  WinePrefixesBasePath
} from '../../components'

export default function GeneralSettings() {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className="settingSubheader">
        {t('gamelib:settings.generalSettings', 'General Settings')}
      </h3>

      <LanguageSelector />

      <DefaultInstallPath />

      <WinePrefixesBasePath />

      <ShareDetectedFixes />

      <CheckUpdatesOnStartup />

      <AutoUpdateGames />

      <HideChangelogOnStartup />

      <StartInConsoleMode />

      <TraySettings />

      <GameStartWindow />

      <UseDarkTrayIcon />

      <UseFramelessWindow />

      <Shortcuts />

      <DiscordRPC />

      <DisableController />

      <MaxWorkers />
    </div>
  )
}
