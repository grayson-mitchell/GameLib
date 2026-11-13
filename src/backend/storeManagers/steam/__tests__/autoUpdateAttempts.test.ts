/** CR-02: the per-boot auto-update attempt marker. */
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import {
  clearAutoUpdateAttempt,
  noteAutoUpdateAttempt,
  wasAutoUpdateAttempted
} from '../autoUpdateAttempts'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

function makeDeps(targetBuild?: string) {
  const steamInstallRuntime = createTestSteamInstallRuntime()
  if (targetBuild !== undefined) {
    steamInstallRuntime.updateStates.set({
      appId: '10',
      kind: 'bridge',
      state: 'stale',
      installedBuild: '1',
      targetBuild,
      branch: 'public',
      checkedAt: 0
    })
  }
  return { steamInstallRuntime }
}

describe('autoUpdateAttempts', () => {
  it('matches the recorded target build only', () => {
    const deps = makeDeps('800')
    noteAutoUpdateAttempt(deps, '10')
    expect(
      wasAutoUpdateAttempted(deps, { appId: '10', targetBuild: '800' })
    ).toBe(true)
    expect(
      wasAutoUpdateAttempted(deps, { appId: '10', targetBuild: '801' })
    ).toBe(false)
  })

  it('clear re-arms the game', () => {
    const deps = makeDeps('800')
    noteAutoUpdateAttempt(deps, '10')
    clearAutoUpdateAttempt(deps, '10')
    expect(
      wasAutoUpdateAttempted(deps, { appId: '10', targetBuild: '800' })
    ).toBe(false)
  })

  it('an unknown target records a wildcard matching any build', () => {
    const deps = makeDeps()
    noteAutoUpdateAttempt(deps, '10')
    expect(
      wasAutoUpdateAttempted(deps, { appId: '10', targetBuild: '999' })
    ).toBe(true)
    expect(
      wasAutoUpdateAttempted(deps, { appId: '10', targetBuild: undefined })
    ).toBe(true)
  })

  it('is false for an app never attempted', () => {
    expect(
      wasAutoUpdateAttempted(makeDeps(), { appId: '11', targetBuild: '1' })
    ).toBe(false)
  })
})
