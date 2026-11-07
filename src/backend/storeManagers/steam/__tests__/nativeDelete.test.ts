import { decideSteamNativeDelete } from '../nativeDelete'
import type { SteamUninstallAppOutcome } from '../steamInstallApp'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../library/runningPoll', () => ({ readRunningAppId: jest.fn() }))
jest.mock('../steamInstallApp', () => ({
  requestSteamUninstallApp: jest.fn()
}))

const FOLDER = '/lib/steamapps/common/WazHack'

const decide = (
  outcome: SteamUninstallAppOutcome,
  running: () => number = () => 0,
  inFolder: () => Promise<boolean> = async () => false
) => {
  const request = jest.fn().mockResolvedValue(outcome)
  return {
    request,
    result: decideSteamNativeDelete('264160', FOLDER, {
      readRunningAppId: running,
      isProcessRunningFromFolder: inFolder,
      platform: 'darwin',
      requestSteamUninstallApp: request
    })
  }
}

describe('decideSteamNativeDelete (quick 261106-s3n)', () => {
  it('refuses a running game and never calls the helper', async () => {
    const { request, result } = decide({ kind: 'ok' }, () => 264160)
    await expect(result).resolves.toEqual({ route: 'refused-running' })
    expect(request).not.toHaveBeenCalled()
  })

  it('treats running id 0 (none) and another game as not running', async () => {
    await expect(decide({ kind: 'ok' }, () => 0).result).resolves.toEqual({
      route: 'steam-uninstalled'
    })
    await expect(decide({ kind: 'ok' }, () => 440).result).resolves.toEqual({
      route: 'steam-uninstalled'
    })
  })

  it('fails closed when the running check throws', async () => {
    const { request, result } = decide({ kind: 'ok' }, () => {
      throw new Error('boom')
    })
    await expect(result).resolves.toEqual({
      route: 'refused',
      reason: 'running-check-failed'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('falls back with signed-out for error 18 and installedApps 0', async () => {
    await expect(
      decide({ kind: 'error', code: 18, installedApps: 0 }).result
    ).resolves.toEqual({ route: 'fallback', why: 'signed-out' })
  })

  it.each([5, null])(
    'falls back with steam-not-installed for error 18 and installedApps %s',
    async (installedApps) => {
      await expect(
        decide({ kind: 'error', code: 18, installedApps }).result
      ).resolves.toEqual({ route: 'fallback', why: 'steam-not-installed' })
    }
  )

  it('falls back with the reason when the helper is unavailable', async () => {
    await expect(
      decide({ kind: 'unavailable', reason: 'steam-not-running' }).result
    ).resolves.toEqual({ route: 'fallback', why: 'steam-not-running' })
  })

  it('reports a non-18 error without falling back', async () => {
    await expect(
      decide({ kind: 'error', code: 2, installedApps: 3 }).result
    ).resolves.toEqual({ route: 'steam-error', code: 2 })
  })

  it('refuses when registry reads 0 but a process runs from the folder (gate D)', async () => {
    const { request, result } = decide(
      { kind: 'ok' },
      () => 0,
      async () => true
    )
    await expect(result).resolves.toEqual({ route: 'refused-running' })
    expect(request).not.toHaveBeenCalled()
  })

  it('fails closed when the folder check rejects', async () => {
    const { request, result } = decide(
      { kind: 'ok' },
      () => 0,
      async () => {
        throw new Error('ps failed')
      }
    )
    await expect(result).resolves.toEqual({
      route: 'refused',
      reason: 'running-check-failed'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses when there is no install folder on a non-Windows platform', async () => {
    const request = jest.fn().mockResolvedValue({ kind: 'ok' })
    await expect(
      decideSteamNativeDelete('264160', undefined, {
        readRunningAppId: () => 0,
        requestSteamUninstallApp: request,
        platform: 'darwin'
      })
    ).resolves.toEqual({ route: 'refused', reason: 'running-check-failed' })
    expect(request).not.toHaveBeenCalled()
  })

  it('treats Steam error 16 as running', async () => {
    await expect(
      decide({ kind: 'error', code: 16, installedApps: 3 }).result
    ).resolves.toEqual({ route: 'refused-running' })
  })
})
