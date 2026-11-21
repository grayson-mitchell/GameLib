import useUiState from 'frontend/state/uiState'
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
  EngineOverride,
  SteamOverlayOverride,
  LaunchWithoutSteam
} from '../../components'
import { TabPanel } from 'frontend/components/UI'
import Tools from '../../components/Tools'
import SettingsContext from '../../SettingsContext'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons'
import useSetting from 'frontend/hooks/useSetting'
import { defaultWineVersion } from '../..'
import SyncSaves from '../SyncSaves'
import { Tabs, Tab } from '@mui/material'
import SettingsCard from './SettingsCard'
import {
  getStartingTab,
  initialSettingsTab,
  readRememberedTab,
  rememberTab,
  settingsTabOrder,
  SettingsTab
} from './tabs'
import DisableUMU from '../../components/DisableUMU'
import VerboseLogs from '../../components/VerboseLogs'
import WinetricksSettings from '../WinetricksSettings'
import {
  shouldShowWinetricksTab,
  wineToolsHidden
} from '../WinetricksSettings/visibility'
import { hasCapability, isStore } from 'common/storeCapabilities'
import { engineStateKey, useEngineState } from 'frontend/state/EngineState'
import LogSettings from '../LogSettings'

export default function GamesSettings({
  initialTab
}: {
  initialTab?: SettingsTab
}) {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const { isDefault, gameInfo, runner } = useContext(SettingsContext)
  const [wineVersion] = useSetting('wineVersion', defaultWineVersion)
  const [isNative, setIsNative] = useState(false)
  const isLinux = platform === 'linux'
  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'
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
  // Phase 61 D-10: on macOS every Windows game (any store) picks its engine
  // through one Engine control instead of the which-Wine selectors.
  const isMacEngineGame = !isDefault && isMac && showWineTab
  const engineState = useEngineState((s) =>
    gameInfo
      ? s.byGame[engineStateKey(gameInfo.runner, gameInfo.app_name)]
      : undefined
  )
  // Non-Steam macOS games derive "CrossOver-like" from the effective engine
  // (D-08); Steam keeps today's wineVersion rule. An unknown engine counts as
  // CrossOver-like so the toggles do not flash before the state arrives.
  const effectiveEngineId = engineState?.effectiveEngineId
  const isCrossover =
    isMacEngineGame && !isMacSteamTitle
      ? effectiveEngineId === undefined ||
        effectiveEngineId === 'automatic' ||
        effectiveEngineId === 'crossover'
      : wineVersion?.type === 'crossover'
  // quick 261110-v08 / 261110-vi4: see wineToolsHidden in visibility.ts.
  const hideWineTools = wineToolsHidden({
    isCrossover,
    isMacEngineGame,
    isMacSteamTitle,
    steamToolsEligible: engineState?.wineToolsEligible === true
  })
  const isBottleBacked = engineState?.prefixKind === 'bottle'
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
  // tab's Wine tools guard -- see visibility.ts for why both are required.
  const showWinetricksTab = shouldShowWinetricksTab({
    isDefault,
    isWindows: isWin,
    hasRunner: !!runner,
    showWineTab,
    wineToolsHidden: hideWineTools
  })

  const tabOrder = settingsTabOrder({
    runFirst: isMacEngineGame,
    showWineTab,
    showWinetricksTab,
    showCloudSavesTab,
    showGamescopeTab: isLinux,
    showLegacyTab: isLinux && !isNative,
    showLogsTab: !isDefault
  })
  // Lazy: the remembered tab (and its one-time key migration) is read once on
  // mount, not on every render.
  const [value, setValue] = useState(() =>
    initialSettingsTab(readRememberedTab(localStorage, gameInfo), {
      visible: tabOrder,
      startingTab: getStartingTab(platform, gameInfo),
      initialTab
    })
  )

  const handleChange = (
    event: React.ChangeEvent<unknown>,
    newValue: string
  ) => {
    setValue(newValue)
    // Store the latest used tab for the current game
    rememberTab(localStorage, gameInfo, newValue.toString())
  }

  // Phase 100 D-02: the Diagnostics "Game log" link goes through the same path
  // as a tab click.
  const openLogsTab = () => {
    setValue('logs')
    rememberTab(localStorage, gameInfo, 'logs')
  }

  const tabLabels: Record<SettingsTab, string> = {
    wine: t('gamelib:settings.navbar.wine', 'Wine'),
    winetricks: t('gamelib:settings.navbar.winetricks', 'Winetricks'),
    run: t('gamelib:settings.navbar.run', 'Run'),
    advanced: t('settings.navbar.advanced', 'Advanced'),
    logs: t('gamelib:settings.navbar.logs', 'Logs'),
    saves: t('settings.navbar.sync', 'Cloud Saves Sync'),
    gamescope: t('settings.navbar.gamescope', 'Gamescope'),
    legacy: t('settings.navbar.legacy', 'Legacy')
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
        <p className="settingsNote">
          <FontAwesomeIcon icon={faInfoCircle} />
          <span>
            {t(
              'settings.default_hint',
              'Changes in this section only apply as default values when installing games. If you want to change the settings of an already installed game, use the Settings button in the game page.'
            )}
          </span>
        </p>
      )}

      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="settings tabs"
        variant="scrollable"
      >
        {tabOrder.map((tab) => (
          <Tab key={tab} label={tabLabels[tab]} value={tab} />
        ))}
      </Tabs>

      <TabPanel value={value} index={'wine'}>
        {/* quick 261104-tm6: the engine override moved here from Advanced
            (deviation from D-14, tab only; still collapsed and unsupported-
            flagged, D-08 unchanged). The per-game wineVersion, winePrefix and
            wineCrossoverBottle are not read by the bridge launch
            (titleSettings.ts LD-2; bottle.ts getBridgeBottleSettings), so they
            are hidden for these titles to leave one which-Wine control. */}
        <SettingsCard
          title={t('gamelib:settings.cards.wineEngine', 'Wine engine')}
        >
          {isMacEngineGame ? (
            <>
              <div className="settingsNote">
                <FontAwesomeIcon icon={faInfoCircle} />
                <span>
                  {t(
                    'gamelib:engine.wineTabNote',
                    "GameLib picks the Wine engine and bottle for this game. Change it only if the game won't run."
                  )}
                </span>
              </div>
              <EngineOverride />
              {!isMacSteamTitle &&
                (engineState?.prefixKind === 'plain' ||
                  engineState?.prefixKind === 'legacy') && <WinePrefix />}
            </>
          ) : isDefault && isMac ? (
            <>
              <EngineOverride />
              <WinePrefix />
            </>
          ) : (
            <>
              <WineVersionSelector />
              <WinePrefix />
              <CrossoverBottle />
            </>
          )}
        </SettingsCard>
        {/* quick 261104-uxr: for macOS Steam titles these toggles write the
            per-game file, which the bridged launch never reads for them:
            getBridgeBottleSettings spreads GlobalConfig, and
            TITLE_AUTHORITATIVE_KEYS (titleSettings.ts) excludes them. Tools
            sits under hideWineTools, not !isCrossover (quick 261110-v08). */}
        {!isCrossover && (
          <>
            {!isMacSteamTitle && (
              <>
                {!isBottleBacked && <AutoDXVK />}
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
          </>
        )}
        {!hideWineTools && <Tools />}
      </TabPanel>

      {showWinetricksTab && (
        <TabPanel value={value} index={'winetricks'}>
          <WinetricksSettings />
        </TabPanel>
      )}

      <TabPanel value={value} index={'run'}>
        <SettingsCard title={t('gamelib:settings.cards.launch', 'Launch')}>
          <LaunchOptionSelector />
          <LauncherArgs />
          {!isSideloaded && <PreferedLanguage />}
          {!isSideloaded && <OfflineMode />}
          {showStatsOverlay && <ShowFPS />}
          <Mangohud />
          <GameMode />
          <NvidiaPrime />
        </SettingsCard>
        {/* quick 261117-q1t: per-game launch without the Steam app. macOS scope is
            isMacSteamTitle; route scope comes from the backend verdict.
            Phase 60 D-02: per-game overlay off switch; eligibility comes from
            the backend and includes DRM-mode titles. */}
        {isMacSteamTitle && (
          <SettingsCard title={t('gamelib:settings.cards.steam', 'Steam')}>
            <LaunchWithoutSteam />
            <SteamOverlayOverride />
          </SettingsCard>
        )}
      </TabPanel>

      <TabPanel value={value} index={'advanced'}>
        <SettingsCard
          title={t('gamelib:settings.cards.launchTarget', 'Launch target')}
        >
          <AlternativeExe />
        </SettingsCard>
        <SettingsCard title={t('gamelib:settings.cards.scripts', 'Scripts')}>
          <BeforeLaunchScriptPath />
          <AfterLaunchScriptPath />
        </SettingsCard>
        <SettingsCard
          title={t(
            'gamelib:settings.cards.wrappersEnvironment',
            'Wrappers & environment'
          )}
        >
          <WrappersTable />
          <EnvVariablesTable />
          {isLinux && <PreferSystemLibs />}
          {!isNative && (
            <>
              <BattlEyeRuntime />
              <EacRuntime />
            </>
          )}
        </SettingsCard>
        <SettingsCard
          title={t(
            'gamelib:settings.cards.diagnosticsUpdates',
            'Diagnostics & updates'
          )}
        >
          <VerboseLogs />
          {!isDefault && (
            <div className="toggleRow">
              <span>
                {t('gamelib:settings.fields.gameLog.label', 'Game log')}
              </span>{' '}
              <a
                className="clickable"
                role="button"
                tabIndex={0}
                onClick={openLogsTab}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openLogsTab()
                }}
              >
                {t('gamelib:settings.fields.gameLog.open', 'Open the Logs tab')}
              </a>
            </div>
          )}
          {!isSideloaded && <IgnoreGameUpdates />}
        </SettingsCard>
      </TabPanel>

      {!isDefault && (
        <TabPanel value={value} index={'logs'}>
          <LogSettings />
        </TabPanel>
      )}

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
    </>
  )
}
