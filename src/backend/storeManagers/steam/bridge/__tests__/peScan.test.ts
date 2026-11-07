import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import { logWarning } from 'backend/logger'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { detectSteamDrmInPe, readPeImportedDllNames } from '../peScan'

const mockInvoke = requestRustInvoke as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('peScan', () => {
  it('detectSteamDrmInPe resolves the Rust result', async () => {
    const r = {
      parsed: true,
      cegMarkers: ['a'],
      hasBindSection: true,
      readError: null
    }
    mockInvoke.mockResolvedValue(r)
    await expect(detectSteamDrmInPe('/x', 'test')).resolves.toEqual(r)
    expect(mockInvoke).toHaveBeenCalledWith('scan_steam_drm', [
      { exePath: '/x' }
    ])
  })

  it('detectSteamDrmInPe fails closed when the transport rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('down'))
    await expect(detectSteamDrmInPe('/x', 'test')).resolves.toEqual({
      parsed: false,
      cegMarkers: [],
      hasBindSection: false,
      readError: 'rustInvoke failed: down'
    })
    expect(logWarning).toHaveBeenCalled()
  })

  it('readPeImportedDllNames resolves names', async () => {
    mockInvoke.mockResolvedValue({ names: ['a.dll'], readError: null })
    await expect(readPeImportedDllNames('/x', 'test')).resolves.toEqual([
      'a.dll'
    ])
  })

  it('readPeImportedDllNames returns null and warns on rejection', async () => {
    mockInvoke.mockRejectedValue(new Error('down'))
    await expect(readPeImportedDllNames('/x', 'test')).resolves.toBeNull()
    expect(logWarning).toHaveBeenCalled()
  })
})
