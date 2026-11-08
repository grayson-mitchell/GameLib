import './index.css'

import React, { useEffect, useState } from 'react'

import { NavLink, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ArrowCircleLeftIcon from '@mui/icons-material/ArrowCircleLeft'

import ContextMenu from '../Library/components/ContextMenu'
import SettingsContext from './SettingsContext'
import LogSettings from './sections/LogSettings'
import FooterInfo from './sections/FooterInfo'
import {
  GeneralSettings,
  StoreSettings,
  GamesSettings,
  SyncSaves,
  AdvancedSettings,
  SystemInfo,
  ReportProblem
} from './sections'
import { AppSettings, WineInstallation } from 'common/types'
import { UpdateComponent } from 'frontend/components/UI'
import { SettingsContextType } from 'frontend/types'
import useSettingsContext from 'frontend/hooks/useSettingsContext'
import { ContentCopy, FileOpen } from '@mui/icons-material'

/**
 * i18n-gate-exempt: 'Wine Default' is a persisted-config fallback sentinel, not rendered directly
 *
 * `WineVersionSelector.tsx`'s `WineVersionListItem` now translates the DISPLAY of this
 * value at its one real render site (34.8-08c). This literal's own runtime string must
 * stay byte-identical because it is persisted in user config (`useSetting('wineVersion',
 * defaultWineVersion)` / electron-store) and read/compared by name/type/bin across 14
 * other consumer files. See `34.8-08b-CLOSURE.md` and `34.8-08c-CLOSURE.md`.
 */
export const defaultWineVersion: WineInstallation = {
  bin: '/usr/bin/wine',
  name: 'Wine Default',
  type: 'wine'
}

function Settings() {
  const { t } = useTranslation()

  const [currentConfig, setCurrentConfig] =
    useState<Partial<AppSettings> | null>(null)

  const { type = 'general' } = useParams()
  const appName = 'default'
  const isGeneralSettings = type === 'general'
  const isStoreSettings = type === 'stores'
  const isSyncSettings = type === 'sync'
  const isGamesSettings = type === 'games_settings'
  const isLogSettings = type === 'log'
  const isAdvancedSetting = type === 'advanced'
  const isSystemInfo = type === 'systeminfo'
  const isReportProblem = type === 'report'

  // Load Heroic's or game's config, only if not loaded already
  useEffect(() => {
    const getSettings = async () => {
      try {
        const config = await window.api.requestAppSettings()
        setCurrentConfig(config)
      } catch (error) {
        // SEAM Invariant B (30-06): requestAppSettings can reject with
        // UNPORTED_CHANNEL_MARKER (unported channel) or any other runtime
        // failure. Either way, degrade non-fatally instead of leaving
        // currentConfig null forever (the permanent-spinner Gap 2 bug) — an
        // empty-but-defined object is enough to clear this component's own
        // `!currentConfig` render gate below. This catch branch never runs
        // under Electron, where the await never rejects.
        console.warn('requestAppSettings failed, falling back to {}:', error)
        setCurrentConfig({})
      }
    }
    getSettings()
  }, [])

  // create setting context functions
  const contextValues: SettingsContextType | null = useSettingsContext({
    appName
  })

  // render `loading` while we fetch the settings
  if (!currentConfig || !contextValues) {
    return <UpdateComponent />
  }

  const title = t('globalSettings', 'Global Settings')

  return (
    <ContextMenu
      items={[
        {
          label: t(
            'settings.copyToClipboard',
            'Copy All Settings to Clipboard'
          ),
          onclick: async () =>
            window.api.clipboardWriteText(
              JSON.stringify({ appName, title, ...currentConfig })
            ),
          show: !isLogSettings,
          icon: <ContentCopy />
        },
        {
          label: t('settings.open-config-file', 'Open Config File'),
          onclick: () => window.api.showConfigFileInFolder(appName),
          show: !isLogSettings,
          icon: <FileOpen />
        }
      ]}
    >
      <SettingsContext.Provider value={contextValues}>
        <div className={`Settings ${type}`}>
          <div role="list" className="settingsWrapper">
            <NavLink to="/library" role="link" className="backButton">
              <ArrowCircleLeftIcon />
            </NavLink>

            {isGeneralSettings && <GeneralSettings />}
            {isStoreSettings && <StoreSettings />}
            {isGamesSettings && <GamesSettings />}
            {isSyncSettings && <SyncSaves />}
            {isAdvancedSetting && <AdvancedSettings />}
            {isLogSettings && <LogSettings />}
            {isSystemInfo && <SystemInfo />}
            {isReportProblem && <ReportProblem />}
            <FooterInfo />
          </div>
        </div>
      </SettingsContext.Provider>
    </ContextMenu>
  )
}

export default React.memo(Settings)
