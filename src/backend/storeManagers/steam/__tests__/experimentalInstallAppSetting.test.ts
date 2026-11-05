import { GlobalConfig } from 'backend/config'
import { isSteamExperimentalInstallAppEnabled } from '../experimentalInstallAppSetting'
import type { AppSettings } from 'common/types'

let mockIsMac = true
jest.mock('backend/constants/environment', () => ({
  get isMac() {
    return mockIsMac
  }
}))
jest.mock('backend/config', () => ({
  GlobalConfig: { get: jest.fn() }
}))

const mockedGet = GlobalConfig.get as jest.Mock

function mockSettings(partial: Partial<AppSettings>) {
  mockedGet.mockReturnValue({ getSettings: () => partial as AppSettings })
}

describe('isSteamExperimentalInstallAppEnabled', () => {
  beforeEach(() => {
    mockIsMac = true
  })

  it('is false when unset', () => {
    mockSettings({})
    expect(isSteamExperimentalInstallAppEnabled()).toBe(false)
  })

  it('is false when persisted false', () => {
    mockSettings({ steamExperimentalInstallApp: false })
    expect(isSteamExperimentalInstallAppEnabled()).toBe(false)
  })

  it('is true when persisted true on macOS', () => {
    mockSettings({ steamExperimentalInstallApp: true })
    expect(isSteamExperimentalInstallAppEnabled()).toBe(true)
  })

  it('is false when persisted true off macOS', () => {
    mockIsMac = false
    mockSettings({ steamExperimentalInstallApp: true })
    expect(isSteamExperimentalInstallAppEnabled()).toBe(false)
  })
})
