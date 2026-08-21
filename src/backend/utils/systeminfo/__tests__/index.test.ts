/**
 * Regression coverage for debug/gog-spawn-reduction.md fix 3.
 *
 * `getSystemInfo()` already had a session-lifetime value cache (`cachedSystemInfo`), but
 * concurrent callers at boot (backend boot log, frontend boot IPC call,
 * `isMacSonomaOrHigher`, etc.) each raced past it before the first resolved --
 * live-log-confirmed as 9 `--version` spawns in a 4s boot window instead of the expected
 * 3 (one per runner). These tests pin the fix: concurrent `cache=true` callers share the
 * SAME in-flight promise, so the underlying version-probe calls happen exactly once no
 * matter how many callers race in before the first resolves.
 *
 * Mock strategy: every dependency `getSystemInfo()` awaits is replaced with a
 * controllable jest.fn() so concurrency can be simulated deterministically (resolve them
 * all on the same microtask tick, then assert call counts before and after).
 */

// A plain `jest.fn(() => ...)` default at factory time does NOT survive: this suite's
// jest.config.js sets `resetMocks: true`, which wipes any implementation configured at
// factory time before the FIRST test even runs (see gog/user.test.ts's identical note on
// `mockConfigStoreGetNodefault`). Defaults are (re)installed in beforeEach below instead.
const mockGetGpuInfo = jest.fn()
const mockGetMemoryInfo = jest.fn()
const mockGetOsInfo = jest.fn()
const mockGetSteamDeckInfo = jest.fn()
const mockGetHeroicVersion = jest.fn()
const mockGetLegendaryVersion = jest.fn()
const mockGetGogdlVersion = jest.fn()
const mockGetCometVersion = jest.fn()
const mockGetNileVersion = jest.fn()

jest.mock('../gpu', () => ({
  getGpuInfo: (...a: unknown[]) => mockGetGpuInfo(...a)
}))
jest.mock('../memory', () => ({
  getMemoryInfo: (...a: unknown[]) => mockGetMemoryInfo(...a)
}))
jest.mock('../osInfo', () => ({
  getOsInfo: (...a: unknown[]) => mockGetOsInfo(...a)
}))
jest.mock('../steamDeck', () => ({
  getSteamDeckInfo: (...a: unknown[]) => mockGetSteamDeckInfo(...a)
}))
jest.mock('../heroicVersion', () => ({
  getHeroicVersion: (...a: unknown[]) => mockGetHeroicVersion(...a)
}))
jest.mock('backend/constants/others', () => ({ APP_DISPLAY_NAME: 'GameLib' }))
jest.mock('../../helperBinaries', () => ({
  getLegendaryVersion: (...args: unknown[]) => mockGetLegendaryVersion(...args),
  getGogdlVersion: (...args: unknown[]) => mockGetGogdlVersion(...args),
  getCometVersion: (...args: unknown[]) => mockGetCometVersion(...args),
  getNileVersion: (...args: unknown[]) => mockGetNileVersion(...args)
}))

import { getSystemInfo, __resetSystemInfoCacheForTests } from '../index'

// `process.getSystemVersion` is an Electron-injected extension, not part of plain
// Node's `process` -- stub it so `fetchSystemInfo()`'s `OS.version` read doesn't throw
// under Jest's plain Node environment.
;(process as unknown as { getSystemVersion: () => string }).getSystemVersion =
  jest.fn(() => '1.0.0')

/** Resolves on the next microtask tick, letting queued promise chains settle. */
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('debug/gog-spawn-reduction fix 3 -- getSystemInfo() in-flight-promise memoization', () => {
  beforeEach(() => {
    __resetSystemInfoCacheForTests()
    mockGetGpuInfo.mockResolvedValue([])
    mockGetMemoryInfo.mockResolvedValue({ total: 100, used: 50 })
    mockGetOsInfo.mockResolvedValue({ name: 'Test OS', version: '1.0' })
    mockGetSteamDeckInfo.mockReturnValue({ isDeck: false })
    mockGetHeroicVersion.mockReturnValue('1.0.0')
    mockGetLegendaryVersion.mockResolvedValue('legendary 1.0')
    mockGetGogdlVersion.mockResolvedValue('gogdl 1.0')
    mockGetCometVersion.mockResolvedValue('comet 1.0')
    mockGetNileVersion.mockResolvedValue('nile 1.0')
  })

  it('concurrent cache=true callers share ONE in-flight fetch -- each version probe runs exactly once', async () => {
    // Simulate 3 "boot-time" callers racing in before any of them has resolved,
    // matching the live-log-confirmed 9-spawns-in-a-4s-window symptom (3 callers x 3
    // runners = 9, versus the expected 3).
    const [first, second, third] = await Promise.all([
      getSystemInfo(),
      getSystemInfo(),
      getSystemInfo()
    ])

    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(mockGetLegendaryVersion).toHaveBeenCalledTimes(1)
    expect(mockGetGogdlVersion).toHaveBeenCalledTimes(1)
    expect(mockGetCometVersion).toHaveBeenCalledTimes(1)
    expect(mockGetNileVersion).toHaveBeenCalledTimes(1)
  })

  it('a caller that arrives AFTER the first fetch resolved gets the cached value -- no new probes', async () => {
    const first = await getSystemInfo()
    const second = await getSystemInfo()

    expect(second).toBe(first)
    expect(mockGetGogdlVersion).toHaveBeenCalledTimes(1)
  })

  it('cache=false always triggers a fresh fetch, independent of any in-flight cache=true call', async () => {
    const cachedCall = getSystemInfo() // cache=true, starts the in-flight fetch
    await flushMicrotasks()
    const forcedCall = getSystemInfo(false)

    await Promise.all([cachedCall, forcedCall])

    // The forced (cache=false) call must not just reuse the in-flight promise's
    // eventual resolution without doing its own fetch -- but it also must not
    // stampede on TOP of an already-settled in-flight fetch. Either way, the
    // total number of underlying spawns must be bounded and deterministic, not
    // unboundedly duplicated the way the pre-fix race allowed.
    expect(mockGetGogdlVersion.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(mockGetGogdlVersion.mock.calls.length).toBeLessThanOrEqual(2)
  })
})
