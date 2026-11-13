import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import { logWarning } from 'backend/logger'
import { restoreLocalSteamLibrary } from '../library/localLibrary'
import { refreshInstallState } from '../library/refresh'
import type { GameInfo } from 'common/types'
import type { Stores } from 'backend/services/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../stores', () => ({
  steamLibraryStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../library/refresh', () => ({ refreshInstallState: jest.fn() }))

const sendFrontendMessage = jest.fn()
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')
const deps = createTestManagerDeps({
  sendFrontendMessage,
  stores: createTestStores({ steam: steamStoresModule })
})
const library = deps.steamSession.libraryState.library
const { steamLibraryStore } = steamStoresModule

const game = (app_name: string, is_installed: boolean) =>
  ({ runner: 'steam', app_name, title: app_name, is_installed }) as GameInfo

describe('restoreLocalSteamLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    library.clear()
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    jest.mocked(refreshInstallState).mockResolvedValue(undefined)
  })

  it('seeds an empty map from the cache and pushes each entry once', async () => {
    const a = game('1', true)
    const b = game('2', false)
    jest.mocked(steamLibraryStore.get).mockReturnValue([a, b])

    const res = await restoreLocalSteamLibrary(deps)

    expect(res).toEqual({ seeded: 2 })
    expect(library.get('1')).toBe(a)
    expect(library.get('2')).toBe(b)
    expect(sendFrontendMessage).toHaveBeenCalledTimes(2)
  })

  it('does not reseed or push when the map is non-empty', async () => {
    library.set('9', game('9', true))
    jest.mocked(steamLibraryStore.get).mockReturnValue([game('1', true)])

    const res = await restoreLocalSteamLibrary(deps)

    expect(res).toEqual({ seeded: 0 })
    expect(library.has('1')).toBe(false)
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('pushAll re-pushes every entry of a non-empty map', async () => {
    library.set('9', game('9', true))
    library.set('8', game('8', false))

    await restoreLocalSteamLibrary(deps, { pushAll: true })

    expect(sendFrontendMessage).toHaveBeenCalledTimes(2)
  })

  it('empty map and empty cache pushes nothing and does not throw', async () => {
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await expect(restoreLocalSteamLibrary(deps)).resolves.toEqual({
      seeded: 0
    })
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('awaits refreshInstallState after the seed', async () => {
    jest.mocked(steamLibraryStore.get).mockReturnValue([game('1', false)])
    jest.mocked(refreshInstallState).mockImplementation(() => {
      expect(library.has('1')).toBe(true)
      return Promise.resolve()
    })

    await restoreLocalSteamLibrary(deps)

    expect(refreshInstallState).toHaveBeenCalledTimes(1)
  })

  it('a throwing reconcile logs one warning and resolves', async () => {
    jest.mocked(refreshInstallState).mockRejectedValue(new Error('boom'))

    await expect(restoreLocalSteamLibrary(deps)).resolves.toBeDefined()
    expect(logWarning).toHaveBeenCalledTimes(1)
    expect(logWarning).toHaveBeenCalledWith(
      ['Steam: local install-state reconcile failed:', expect.any(Error)],
      'Steam'
    )
  })
})
