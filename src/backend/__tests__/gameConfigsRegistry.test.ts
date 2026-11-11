import { createGameConfigs } from '../game_config'
import {
  createTestGameConfigs,
  createTestGlobalConfig
} from '../testUtils/testConfig'

describe('createGameConfigs', () => {
  // The per-game defaults read these two keys of the global settings.
  const config = createTestGlobalConfig({
    enviromentOptions: [],
    wineVersion: { name: 'Wine', type: 'wine', bin: '' }
  })

  it('returns the same object on repeated gets', () => {
    const configs = createGameConfigs({ config })
    expect(configs.get('a')).toBe(configs.get('a'))
  })

  it('returns a different object for a different game', () => {
    const configs = createGameConfigs({ config })
    expect(configs.get('a')).not.toBe(configs.get('b'))
  })

  it('two registries never share an instance', () => {
    expect(createGameConfigs({ config }).get('a')).not.toBe(
      createGameConfigs({ config }).get('a')
    )
  })
})

describe('test fakes', () => {
  it('createTestGameConfigs seeds per-game settings', async () => {
    const configs = createTestGameConfigs({ app: { verboseLogs: true } })
    expect((await configs.get('app').getSettings()).verboseLogs).toBe(true)
    expect(configs.get('app')).toBe(configs.get('app'))
  })

  it('createTestGameConfigs setSetting updates getSettings', async () => {
    const config = createTestGameConfigs().get('other')
    config.setSetting('verboseLogs', true)
    expect((await config.getSettings()).verboseLogs).toBe(true)
  })

  it('createTestGlobalConfig reads seeded settings and applies setSetting', () => {
    const config = createTestGlobalConfig({ disableLogs: true })
    expect(config.getSettings().disableLogs).toBe(true)
    // The fake ignores the kvs deps the real setSetting persists through.
    const deps = {} as Parameters<typeof config.setSetting>[2]
    config.setSetting('disableLogs', false, deps)
    expect(config.getSettings().disableLogs).toBe(false)
  })
})
