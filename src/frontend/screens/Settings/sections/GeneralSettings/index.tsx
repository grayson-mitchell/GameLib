import { useTranslation } from 'react-i18next'
import LanguageSelector from 'frontend/components/UI/LanguageSelector'
import {
  AutoUpdateGames,
  CheckUpdatesOnStartup,
  DefaultInstallPath,
  DefaultSteamPath,
  DisableController,
  DiscordRPC,
  EgsSettings,
  EnableSteamNativeInstall,
  EnableSteamNativeDelete,
  ShareDetectedFixes,
  SteamExperimentalInstallApp,
  HideChangelogOnStartup,
  MaxWorkers,
  MinimizeOnGameLaunch,
  Shortcuts,
  StartInConsoleMode,
  TraySettings,
  UseDarkTrayIcon,
  UseFramelessWindow,
  WinePrefixesBasePath,
  PlaytimeSync,
  NotifyHumbleExpirations
} from '../../components'

export default function GeneralSettings() {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className="settingSubheader">{t('settings.navbar.general')}</h3>

      <LanguageSelector />

      <DefaultInstallPath />

      <WinePrefixesBasePath />

      <DefaultSteamPath />

      <EnableSteamNativeInstall />
      <EnableSteamNativeDelete />
      <SteamExperimentalInstallApp />
      <ShareDetectedFixes />

      <EgsSettings />

      <CheckUpdatesOnStartup />

      <AutoUpdateGames />

      <HideChangelogOnStartup />

      <StartInConsoleMode />

      <TraySettings />

      <MinimizeOnGameLaunch />

      <UseDarkTrayIcon />

      <UseFramelessWindow />

      <Shortcuts />

      <PlaytimeSync />

      <DiscordRPC />

      <NotifyHumbleExpirations />

      <DisableController />

      <MaxWorkers />
    </div>
  )
}
