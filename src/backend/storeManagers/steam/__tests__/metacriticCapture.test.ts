/**
 * Unit tests for metacriticCapture.ts (quick 261029-sbi).
 * Mock setup mirrors platformCapture.test.ts (factory-mocked logger,
 * resetMocks is on so implementations are set per test).
 */
import { captureOwnedAppMetacritic } from '../metacriticCapture'
import { PlatformCapturePicsClient } from '../platformCapture'
import { steamMetadataStore } from '../electronStores'
import { logInfo, logError } from 'backend/logger'
import { STEAM_PICS_BULK_TIMEOUT_MS } from '../withTimeout'
import appinfo64 from './fixtures/appinfo-64bit.json'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

jest.mock('../electronStores', () => ({
  steamMetadataStore: { get: jest.fn(), set: jest.fn(), entries: jest.fn() }
}))

const mockedGet = steamMetadataStore.get as jest.Mock
const mockedSet = steamMetadataStore.set as jest.Mock

describe('captureOwnedAppMetacritic', () => {
  it('makes no getProductInfo call when every id is already captured', async () => {
    mockedGet.mockReturnValue({ metacriticCaptured: true })
    const getProductInfo = jest.fn()
    const result = await captureOwnedAppMetacritic({ getProductInfo }, [1, 2])
    expect(getProductInfo).not.toHaveBeenCalled()
    expect(result).toEqual({
      scopedCount: 0,
      capturedCount: 0,
      skippedCount: 0,
      failed: false
    })
  })

  it('issues ONE call for exactly the uncaptured ids and keeps existing fields', async () => {
    const existing = {
      art_cover: 'c',
      platformsCaptured: true,
      mac_arch_verified: true,
      metacritic_score: 5
    }
    mockedGet.mockImplementation((id: string) =>
      id === '1'
        ? { metacriticCaptured: true }
        : id === '570'
          ? existing
          : undefined
    )
    const getProductInfo = jest.fn().mockResolvedValue({
      apps: { 570: { appinfo: { common: appinfo64.common } } }
    })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppMetacritic(client, [1, 570])

    expect(getProductInfo).toHaveBeenCalledTimes(1)
    expect(getProductInfo).toHaveBeenCalledWith([570], [], true)
    expect(mockedSet).toHaveBeenCalledWith('570', {
      art_cover: 'c',
      platformsCaptured: true,
      mac_arch_verified: true,
      metacritic_score: 90,
      metacriticCaptured: true
    })
    expect(result.capturedCount).toBe(1)
    expect(logInfo).toHaveBeenCalledWith(
      'Steam bulk metacritic capture: scoped=1 captured=1 skipped=0',
      'Steam'
    )
  })

  it('writes captured:true with NO score key when common has no score, removing a stale one', async () => {
    mockedGet.mockReturnValue({ art_cover: 'c', metacritic_score: 77 })
    const getProductInfo = jest.fn().mockResolvedValue({
      apps: { 7: { appinfo: { common: { name: 'No Score' } } } }
    })
    await captureOwnedAppMetacritic({ getProductInfo }, [7])
    const written = mockedSet.mock.calls[0][1]
    expect(written).toEqual({ art_cover: 'c', metacriticCaptured: true })
    expect('metacritic_score' in written).toBe(false)
  })

  it('does not write unknownApps or entries without appinfo/common', async () => {
    mockedGet.mockReturnValue(undefined)
    const getProductInfo = jest.fn().mockResolvedValue({
      apps: { 2: { appinfo: {} }, 3: {} },
      unknownApps: [1]
    })
    const result = await captureOwnedAppMetacritic(
      { getProductInfo },
      [1, 2, 3, 4]
    )
    expect(mockedSet).not.toHaveBeenCalled()
    expect(result.capturedCount).toBe(0)
    expect(result.skippedCount).toBe(4)
  })

  it('fail-soft on rejection: logs and returns failed:true', async () => {
    mockedGet.mockReturnValue(undefined)
    const getProductInfo = jest.fn().mockRejectedValue(new Error('dropped'))
    const result = await captureOwnedAppMetacritic({ getProductInfo }, [1])
    expect(result.failed).toBe(true)
    expect(logError).toHaveBeenCalled()
    expect(mockedSet).not.toHaveBeenCalled()
  })

  it('fail-soft on timeout', async () => {
    mockedGet.mockReturnValue(undefined)
    jest.useFakeTimers()
    const getProductInfo = jest.fn().mockReturnValue(new Promise(() => {}))
    const p = captureOwnedAppMetacritic({ getProductInfo }, [1])
    await jest.advanceTimersByTimeAsync(STEAM_PICS_BULK_TIMEOUT_MS)
    expect((await p).failed).toBe(true)
    jest.useRealTimers()
  })
})
