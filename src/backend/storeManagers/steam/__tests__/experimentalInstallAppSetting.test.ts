import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { isSteamExperimentalInstallAppEnabled } from '../experimentalInstallAppSetting'
import type { AppSettings } from 'common/types'

let mockIsMac = true
jest.mock('backend/constants/environment', () => ({
  get isMac() {
    return mockIsMac
  }
}))
let config = createTestGlobalConfig()

function mockSettings(partial: Partial<AppSettings>) {
  config = createTestGlobalConfig(partial)
}

describe('isSteamExperimentalInstallAppEnabled', () => {
  beforeEach(() => {
    mockIsMac = true
  })

  it('is false when unset', () => {
    mockSettings({})
    expect(isSteamExperimentalInstallAppEnabled(config)).toBe(false)
  })

  it('is false when persisted false', () => {
    mockSettings({ steamExperimentalInstallApp: false })
    expect(isSteamExperimentalInstallAppEnabled(config)).toBe(false)
  })

  it('is true when persisted true on macOS', () => {
    mockSettings({ steamExperimentalInstallApp: true })
    expect(isSteamExperimentalInstallAppEnabled(config)).toBe(true)
  })

  it('is false when persisted true off macOS', () => {
    mockIsMac = false
    mockSettings({ steamExperimentalInstallApp: true })
    expect(isSteamExperimentalInstallAppEnabled(config)).toBe(false)
  })
})
