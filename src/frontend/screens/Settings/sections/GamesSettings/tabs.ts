import type { GameInfo } from 'common/types'

// quick-261121-dzl: the tab decisions of GamesSettings, pure so they can be
// tested without mounting React.

export type SettingsTab =
  | 'wine'
  | 'winetricks'
  | 'run'
  | 'advanced'
  | 'saves'
  | 'gamescope'
  | 'legacy'

type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const windowsPlatforms = ['Win32', 'Windows', 'windows']

// A macOS per-game settings dialog opens on Run (sketch 009 #4): the Wine tab
// is a near-empty "GameLib picks the engine" page there. Linux, Windows and the
// Default page keep their starting tab.
export function getStartingTab(
  platform: string,
  gameInfo?: GameInfo | null
): SettingsTab {
  if (!gameInfo) {
    if (platform !== 'win32') {
      return 'wine'
    }
    return 'run'
  }
  if (platform === 'win32' || platform === 'darwin') {
    return 'run'
  } else if (windowsPlatforms.includes(gameInfo?.install.platform || '')) {
    return 'wine'
  } else {
    return 'run'
  }
}

export function settingsTabOrder({
  runFirst,
  showWineTab,
  showWinetricksTab,
  showCloudSavesTab,
  showGamescopeTab,
  showLegacyTab
}: {
  runFirst: boolean
  showWineTab: boolean
  showWinetricksTab: boolean
  showCloudSavesTab: boolean
  showGamescopeTab: boolean
  showLegacyTab: boolean
}): SettingsTab[] {
  const order: SettingsTab[] = []
  if (runFirst) order.push('run')
  if (showWineTab) order.push('wine')
  if (showWinetricksTab) order.push('winetricks')
  if (!runFirst) order.push('run')
  order.push('advanced')
  if (showCloudSavesTab) order.push('saves')
  if (showGamescopeTab) order.push('gamescope')
  if (showLegacyTab) order.push('legacy')
  return order
}

// Runner-keyed (sketch 009 #12): an app_name alone is not unique across stores.
export function settingTabKey(gameInfo?: GameInfo | null): string {
  return gameInfo
    ? `${gameInfo.runner}-${gameInfo.app_name}-setting_tab`
    : 'default'
}

function legacyTabKey(gameInfo?: GameInfo | null): string | null {
  return gameInfo ? `${gameInfo.app_name}-setting_tab` : null
}

export function readRememberedTab(
  storage: TabStorage,
  gameInfo?: GameInfo | null
): string | null {
  const key = settingTabKey(gameInfo)
  const current = storage.getItem(key)
  if (current) return current
  const legacyKey = legacyTabKey(gameInfo)
  if (!legacyKey) return null
  const legacy = storage.getItem(legacyKey)
  if (!legacy) return null
  storage.setItem(key, legacy)
  storage.removeItem(legacyKey)
  return legacy
}

export function rememberTab(
  storage: TabStorage,
  gameInfo: GameInfo | null | undefined,
  tab: string
): void {
  storage.setItem(settingTabKey(gameInfo), tab)
}

// A stored tab can be hidden under the current render's visibility (winetricks
// depends on runner/isCrossover, which differ between the Default page and a
// game), so any value that is not rendered falls back to the starting tab and
// the Tabs value never points at a missing <Tab>. The Other tab was removed in
// 261104-unp; a stored 'other' maps to 'run'.
export function initialSettingsTab(
  stored: string | null,
  { visible, startingTab }: { visible: string[]; startingTab: string }
): string {
  if (!stored) return startingTab
  const tab = stored === 'other' ? 'run' : stored
  return visible.includes(tab) ? tab : startingTab
}
