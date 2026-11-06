import { logInfo } from 'backend/logger'
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { RUST_SCAN_STEAM_DRM } from 'common/types/sidecarTransport'
import { invokeScan, runScanner } from '../rustScan'

const ENV = 'GAMELIB_SCANNER_PE_STEAM_DRM'
const result = {
  parsed: true,
  cegMarkers: [],
  hasBindSection: false,
  readError: null
}
const mockInvoke = requestRustInvoke as jest.Mock
const mockLog = logInfo as jest.Mock
let saved: string | undefined

beforeEach(() => {
  saved = process.env[ENV]
  jest.clearAllMocks()
  mockInvoke.mockResolvedValue(result)
})
afterEach(() => {
  if (saved === undefined) delete process.env[ENV]
  else process.env[ENV] = saved
})

describe('invokeScan', () => {
  it('calls requestRustInvoke once with a single args object', async () => {
    await expect(
      invokeScan(RUST_SCAN_STEAM_DRM, { exePath: '/x' })
    ).resolves.toEqual(result)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('scan_steam_drm', [
      { exePath: '/x' }
    ])
  })

  it('rejects a Buffer argument at compile time (D-08)', () => {
    // @ts-expect-error exePath must be a string, never bytes
    void invokeScan(RUST_SCAN_STEAM_DRM, { exePath: Buffer.from('x') })
  })
})

describe('runScanner', () => {
  const args = { exePath: '/x' }

  it('ts calls legacy and not the transport', async () => {
    process.env[ENV] = 'ts'
    const legacy = jest.fn().mockResolvedValue(result)
    await runScanner('peSteamDrm', 'scan_steam_drm', args, legacy, 'c')
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rust calls the transport and not legacy', async () => {
    process.env[ENV] = 'rust'
    const legacy = jest.fn()
    await runScanner('peSteamDrm', 'scan_steam_drm', args, legacy, 'c')
    expect(legacy).not.toHaveBeenCalled()
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('rust propagates a rejected transport', async () => {
    process.env[ENV] = 'rust'
    mockInvoke.mockRejectedValue(new Error('boom'))
    await expect(
      runScanner('peSteamDrm', 'scan_steam_drm', args, jest.fn(), 'c')
    ).rejects.toThrow('boom')
  })

  it('rust with a CLI-only op is a TypeError', async () => {
    process.env[ENV] = 'rust'
    await expect(
      runScanner('peSteamDrm', 'scan_pe_delay_imports', args, jest.fn(), 'c')
    ).rejects.toThrow(TypeError)
  })

  it('logs once per (scanner, op, caller) triple', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env[ENV] = 'rust'
      const log = (await import('backend/logger')).logInfo as jest.Mock
      const mod = await import('../rustScan')
      const run = (caller: string) =>
        mod.runScanner('peSteamDrm', 'scan_steam_drm', args, jest.fn(), caller)
      await run('placeShimForGame')
      await run('placeShimForGame')
      await run('launchBridgeGameBody')
      const lines = log.mock.calls.map((c) => c[0])
      expect(lines).toEqual([
        'scanner peSteamDrm op=scan_steam_drm caller=placeShimForGame: impl=rust',
        'scanner peSteamDrm op=scan_steam_drm caller=launchBridgeGameBody: impl=rust'
      ])
    })
    void mockLog
  })
})
