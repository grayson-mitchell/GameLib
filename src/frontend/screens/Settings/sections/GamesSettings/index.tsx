import './index.scss'

import React, { useContext, useEffect, useState } from 'react'

import { useTranslation } from 'react-i18next'
import {
  AdvertiseAvxForRosetta,
  AlternativeExe,
  AutoDXVK,
  AutoDXVKNVAPI,
  AutoVKD3D,
  BattlEyeRuntime,
  CrossoverBottle,
  EacRuntime,
  EnableEsync,
  EnableFSR,
  EnableFsync,
  EnableMsync,
  EnableWineWayland,
  EnableWoW64,
  EnvVariablesTable,
  GameMode,
  LauncherArgs,
  LaunchOptionSelector,
  Mangohud,
  OfflineMode,
  PreferedLanguage,
  PreferSystemLibs,
  ShowFPS,
  WinePrefix,
  WineVersionSelector,
  WrappersTable,
  EnableDXVKFpsLimit,
  IgnoreGameUpdates,
  Gamescope,
  BeforeLaunchScriptPath,
  AfterLaunchScriptPath,
  NvidiaPrime,
  SteamEngineOverride,
  SteamOverlayOverride
} from '../../components'
import { TabPanel } from 'frontend/components/UI'
import ContextProvider from 'frontend/state/ContextProvider'
import Tools from '../../components/Tools'
import SettingsContext from '../../SettingsContext'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons'
import useSetting from 'frontend/hooks/useSetting'
import { defaultWineVersion } from '../..'
import SyncSaves from '../SyncSaves'
import FooterInfo from '../FooterInfo'
import { Tabs, Tab } from '@mui/material'
import { GameInfo } from 'common/types'
import DisableUMU from '../../components/DisableUMU'
import VerboseLogs from '../../components/VerboseLogs'
import WinetricksSettings from '../WinetricksSettings'
import { shouldShowWinetricksTab } from '../WinetricksSettings/visibility'
import { hasCapability, isStore } from 'common/storeCapabilities'

const windowsPlatforms = ['Win32', 'Windows', 'windows']
function getStartingTab(platform: string, gameInfo?: GameInfo | null): string {
  if (!gameInfo) {
    if (platform !== 'win32') {
      return 'wine'
    }
    return 'run'
  }
  if (platform === 'win32') {
    return 'run'
  } else if (windowsPlatforms.includes(gameInfo?.install.platform || '')) {
    return 'wine'
  } else {
    return 'run'
  }
}

export default function GamesSettings() {
  const { t } = useTranslation()
  const { platform } = useContext(ContextProvider)
  const { isDefault, gameInfo, runner } = useContext(SettingsContext)
  const [wineVersion] = useSetting('wineVersion', defaultWineVersion)
  const [isNative, setIsNative] = useState(false)
  const isLinux = platform === 'linux'
  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'
  const isCrossover = wineVersion?.type === 'crossover'
  const showCloudSavesTab = hasCapability(
    gameInfo?.runner,
    'supportsCloudSaves'
  )
  const isBrowserGame = gameInfo?.install.platform === 'Browser'
  const isSideloaded = isStore(gameInfo, 'sideload')
  // Shared gate (was D-14's): per-game Steam titles on macOS, never Default.
  const isMacSteamTitle =
    !isDefault && isMac && hasCapability(gameInfo?.runner, 'usesBottleRuntime')
  const showWineTab = !(isWin || isNative || isBrowserGame)
  // Native Linux games and native macOS Steam games (steam://rungameid cannot take env vars) are excluded; nile is listed but inert because isNative is Windows-only for it. Browser games are not launched via setupEnvVars.
  const showStatsOverlay =
    !isWin &&
    (!isNative ||
      (isMac &&
        !isDefault &&
        !isBrowserGame &&
        ['legendary', 'gog', 'nile', 'sideload'].includes(
          gameInfo?.runner ?? ''
        )))

  // Phase 45 Plan 01 (D-03): mirrors `Tools/index.tsx`'s own gate, plus the Wine
  // tab's `!isCrossover` guard -- see visibility.ts for why both are required.
  const showWinetricksTab = shouldShowWinetricksTab({
    isDefault,
    isWindows: isWin,
    hasRunner: !!runner,
    showWineTab,
    isCrossover
  })

  // Get the latest used tab index for the current game
  const localStorageKey = gameInfo
    ? `${gameInfo.app_name}-setting_tab`
    : 'default'
  let latestTabIndex =
    localStorage.getItem(localStorageKey) || getStartingTab(platform, gameInfo)
  // A tab persisted from a previous render (or a previous game) can be hidden
  // under the CURRENT render's visibility -- most concretely the winetricks
  // tab, whose gate depends on `runner`/`isCrossover`, neither of which is
  // stable across the Default-page / per-game Settings boundary. Falling
  // back to the same starting tab a fresh mount would pick keeps `value`
  // from ever pointing at a `<Tab>` that was not rendered.
  // The Other tab was removed in 261104-unp; 'advanced' remains a valid saved value.
  if (latestTabIndex === 'other') {
    latestTabIndex = 'run'
  }
  if (latestTabIndex === 'winetricks' && !showWinetricksTab) {
    latestTabIndex = getStartingTab(platform, gameInfo)
  }
  const [value, setValue] = useState(latestTabIndex)

  const handleChange = (
    event: React.ChangeEvent<unknown>,
    newValue: string
  ) => {
    setValue(newValue)
    // Store the latest used tab index for the current game
    localStorage.setItem(localStorageKey, newValue.toString())
  }

  useEffect(() => {
    if (gameInfo) {
      const getIsNative = async () => {
        const isNative = await window.api.isNative({
          appName: gameInfo?.app_name,
          runner: gameInfo?.runner
        })
        setIsNative(isNative)
      }
      void getIsNative()
    }
  }, [gameInfo])

  return (
    <>
      {isDefault && (
        <p className="defaults-hint">
          <FontAwesomeIcon icon={faInfoCircle} />
          {t(
            'settings.default_hint',
            'Changes in this section only apply as default values when installing games. If you want to change the settings of an already installed game, use the Settings button in the game page.'
          )}
        </p>
      )}

      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="settings tabs"
        variant="scrollable"
      >
        {showWineTab && <Tab label="Wine" value="wine" />}
        {showWinetricksTab && <Tab label="Winetricks" value="winetricks" />}
        <Tab label={t('gamelib:settings.navbar.run', 'Run')} value="run" />
        <Tab
          label={t('settings.navbar.advanced', 'Advanced')}
          value="advanced"
        />

        {showCloudSavesTab && (
          <Tab
            label={t('settings.navbar.sync', 'Cloud Saves Sync')}
            value="saves"
          />
        )}
        {isLinux && (
          <Tab
            label={t('settings.navbar.gamescope', 'Gamescope')}
            value="gamescope"
          />
        )}
        {isLinux && !isNative && (
          <Tab label={t('settings.navbar.legacy', 'Legacy')} value="legacy" />
        )}
      </Tabs>

      <TabPanel value={value} index={'wine'}>
        {/* quick 261104-tm6: the engine override moved here from Advanced
            (deviation from D-14, tab only; still collapsed and unsupported-
            flagged, D-08 unchanged). The per-game wineVersion, winePrefix and
            wineCrossoverBottle are not read by the bridge launch
            (titleSettings.ts LD-2; bottle.ts getBridgeBottleSettings), so they
            are hidden for these titles to leave one which-Wine control. */}
        {isMacSteamTitle ? (
          <>
            <span className="defaults-hint">
              <FontAwesomeIcon icon={faInfoCircle} />
              {t(
                'gamelib:steam.engine.wineTabHint',
                'GameLib chooses the Wine engine and bottle for Steam games.'
              )}
            </span>
            <SteamEngineOverride />
          </>
        ) : (
          <>
            <WineVersionSelector />
            <WinePrefix />
            <CrossoverBottle />
          </>
        )}
        {/* quick 261104-uxr: for macOS Steam titles these toggles write the
            per-game file, which the bridged launch never reads for them:
            getBridgeBottleSettings spreads GlobalConfig, and
            TITLE_AUTHORITATIVE_KEYS (titleSettings.ts) excludes them. Tools
            stays because it acts on the shared Steam bottle. */}
        {!isCrossover && (
          <>
            {!isMacSteamTitle && (
              <>
                <AutoDXVK />
                {isLinux && (
                  <>
                    {!window.isSteamDeck && <AutoDXVKNVAPI />}
                    <AutoVKD3D />
                  </>
                )}
                <EnableEsync />
                <EnableFsync />
                <EnableWineWayland />
                <EnableWoW64 />
                <EnableMsync />
                <AdvertiseAvxForRosetta />
                <EnableFSR />
                {isMac && <EnableDXVKFpsLimit />}
              </>
            )}
            <Tools />
          </>
        )}
      </TabPanel>

      {showWinetricksTab && (
        <TabPanel value={value} index={'winetricks'}>
          <WinetricksSettings />
        </TabPanel>
      )}

      <TabPanel value={value} index={'run'}>
        <LaunchOptionSelector />
        <LauncherArgs />
        {!isSideloaded && <PreferedLanguage />}
        {!isSideloaded && <OfflineMode />}
        {showStatsOverlay && <ShowFPS />}
        <Mangohud />
        <GameMode />
        <NvidiaPrime />
        {/* Phase 60 D-02: per-game overlay off switch; eligibility comes from
            the backend and includes DRM-mode titles. */}
        {isMacSteamTitle && <SteamOverlayOverride />}
      </TabPanel>

      <TabPanel value={value} index={'advanced'}>
        <AlternativeExe />
        <div className="Field">
          <label>{t('setting.scripts', 'Scripts:')}</label>
          <BeforeLaunchScriptPath />
          <AfterLaunchScriptPath />
        </div>
        <WrappersTable />
        <EnvVariablesTable />
        <VerboseLogs />
        {!isSideloaded && <IgnoreGameUpdates />}
        {isLinux && <PreferSystemLibs />}
        {!isNative && (
          <>
            <BattlEyeRuntime />
            <EacRuntime />
          </>
        )}
      </TabPanel>

      <TabPanel value={value} index={'saves'}>
        <SyncSaves />
      </TabPanel>

      <TabPanel value={value} index={'gamescope'}>
        <Gamescope />
      </TabPanel>

      {isLinux && (
        <TabPanel value={value} index={'legacy'}>
          <span className="defaults-hint">
            <FontAwesomeIcon icon={faInfoCircle} />
            {t(
              'settings.legacy_warning',
              'Warning: The settings on this tab are mostly deprecated and might not work at all.'
            )}
          </span>
          <EnableDXVKFpsLimit />
          <DisableUMU />
        </TabPanel>
      )}

      {!isDefault && <FooterInfo />}
    </>
  )
}
