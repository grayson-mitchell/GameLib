import './index.scss'

import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, Tab } from '@mui/material'
import { TabPanel } from 'frontend/components/UI'
import {
  AddGamesToSteam,
  AltGOGdlBin,
  AltLegendaryBin,
  AltNileBin,
  CometSupport,
  DefaultSteamPath,
  DownloadNoHTTPS,
  EgsSettings,
  EnableSteamNativeDelete,
  EnableSteamNativeInstall,
  NotifyHumbleExpirations,
  PlaytimeSync,
  SteamExperimentalInstallApp
} from '../../components'
import DisableGOGPresence from '../../components/DisableGOGPresence'
import EosOverlay from './EosOverlay'

// Alphabetical per user decision (quick 261108-ioc). The first entry is the default tab.
const STORE_SETTINGS_TABS = [
  'amazon',
  'epic',
  'gog',
  'humble',
  'steam'
] as const

type StoreTab = (typeof STORE_SETTINGS_TABS)[number]

function isStoreTab(value: string | undefined): value is StoreTab {
  return STORE_SETTINGS_TABS.some((tab) => tab === value)
}

// Collapsed-by-default holder for a store's alt-binary override.
function StoreAdvanced({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <details className="storeSettingsAdvanced">
      <summary>{t('settings.navbar.advanced', 'Advanced')}</summary>
      {children}
    </details>
  )
}

export default function StoreSettings() {
  const { t: tGamelib } = useTranslation('gamelib')
  const { store } = useParams()
  const navigate = useNavigate()

  // URL-driven, no local state: unknown/absent :store falls back to the first tab.
  const value: StoreTab = isStoreTab(store) ? store : STORE_SETTINGS_TABS[0]

  return (
    <div>
      <h3 className="settingSubheader">
        {tGamelib('gamelib:settings.navbar.stores', 'Stores')}
      </h3>

      <Tabs
        value={value}
        onChange={(_e, next: StoreTab) =>
          navigate(`/settings/stores/${next}`, { replace: true })
        }
        aria-label={tGamelib('gamelib:settings.navbar.stores', 'Stores')}
        variant="scrollable"
      >
        <Tab label="Amazon" value="amazon" />
        <Tab label="Epic" value="epic" />
        <Tab label="GOG" value="gog" />
        <Tab label="Humble" value="humble" />
        <Tab label="Steam" value="steam" />
      </Tabs>

      <TabPanel value={value} index="amazon">
        <StoreAdvanced>
          <AltNileBin />
        </StoreAdvanced>
      </TabPanel>

      <TabPanel value={value} index="epic">
        <EgsSettings />
        <EosOverlay />
        <StoreAdvanced>
          <AltLegendaryBin />
          <DownloadNoHTTPS />
        </StoreAdvanced>
      </TabPanel>

      <TabPanel value={value} index="gog">
        <PlaytimeSync />
        <DisableGOGPresence />
        <CometSupport />
        <StoreAdvanced>
          <AltGOGdlBin />
        </StoreAdvanced>
      </TabPanel>

      <TabPanel value={value} index="humble">
        <NotifyHumbleExpirations />
      </TabPanel>

      <TabPanel value={value} index="steam">
        <DefaultSteamPath />
        <EnableSteamNativeInstall />
        <EnableSteamNativeDelete />
        <SteamExperimentalInstallApp />
        <AddGamesToSteam />
      </TabPanel>
    </div>
  )
}
