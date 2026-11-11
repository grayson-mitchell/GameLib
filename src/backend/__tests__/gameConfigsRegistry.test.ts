import { adoptGlobalConfig, GlobalConfig } from '../config'
import { createGameConfigs, GameConfig } from '../game_config'
import {
  createTestGameConfigs,
  createTestGlobalConfig
} from '../testUtils/testConfig'

describe('createGameConfigs (interim delegate)', () => {
  it('returns the same object as GameConfig.get', () => {
    expect(createGameConfigs().get('app')).toBe(GameConfig.get('app'))
  })

  it('returns the same object on repeated gets', () => {
    const configs = createGameConfigs()
    expect(configs.get('app')).toBe(configs.get('app'))
  })
})

describe('adoptGlobalConfig (interim identity)', () => {
  it('returns the same object as GlobalConfig.get', () => {
    expect(adoptGlobalConfig()).toBe(GlobalConfig.get())
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
