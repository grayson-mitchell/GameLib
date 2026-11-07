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
import { invokeScan } from '../rustScan'

const result = {
  parsed: true,
  cegMarkers: [],
  hasBindSection: false,
  readError: null
}
const mockInvoke = requestRustInvoke as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke.mockResolvedValue(result)
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
