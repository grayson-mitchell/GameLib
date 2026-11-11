/**
 * In-memory fakes for the global config and the per-game config registry (66.3-04, D-66.3-03).
 * No file I/O, no jest APIs. A consumer under test receives these through its config /
 * gameConfigs dependency instead of reaching for the static getters.
 */
import type { AppSettings, GameSettings } from 'common/types'
import { currentGameConfigVersion } from '../constants/others'
import type { GlobalConfigSlice } from '../config'
import type { GameConfigSlice, GameConfigs } from '../game_config'

type TestGlobalConfig = Pick<
  GlobalConfigSlice,
  'getSettings' | 'setSetting' | 'set' | 'flush' | 'resetToDefaults'
> &
  Partial<GlobalConfigSlice>

/** A global config over `settings`; setSetting changes what getSettings returns. */
export function createTestGlobalConfig(
  settings: Partial<AppSettings> = {}
): GlobalConfigSlice {
  let current = { ...settings } as AppSettings
  const fake: TestGlobalConfig = {
    getSettings: () => ({ ...current }),
    setSetting: (key, value) => {
      current = { ...current, [key]: value }
    },
    set: (config) => {
      current = { ...config }
    },
    flush: () => undefined,
    resetToDefaults: () => {
      current = {} as AppSettings
    },
    getFactoryDefaults: () => ({}) as AppSettings,
    getAlternativeWine: () => Promise.resolve([]),
    getMacOsWineSet: () => Promise.resolve(new Set())
  }
  return fake as GlobalConfigSlice
}

function createTestGameConfig(
  appName: string,
  initial: Partial<GameSettings>
): GameConfigSlice {
  let current = { ...initial } as GameSettings
  return {
    appName,
    path: `/test/GamesConfig/${appName}.json`,
    version: currentGameConfigVersion,
    get config() {
      return current
    },
    set config(value: GameSettings) {
      current = value
    },
    getSettings: () => Promise.resolve({ ...current }),
    setSetting: (key: string, value: unknown) => {
      current = { ...current, [key]: value }
    },
    resetToDefaults: () => {
      current = {} as GameSettings
    },
    flush: () => undefined
  }
}

/** A registry that hands out one in-memory game config per appName, seeded from `perGame`. */
export function createTestGameConfigs(
  perGame: Record<string, Partial<GameSettings>> = {}
): GameConfigs {
  const configs = new Map<string, GameConfigSlice>()
  return {
    get: (appName) => {
      let config = configs.get(appName)
      if (!config) {
        config = createTestGameConfig(appName, perGame[appName] ?? {})
        configs.set(appName, config)
      }
      return config
    }
  }
}
