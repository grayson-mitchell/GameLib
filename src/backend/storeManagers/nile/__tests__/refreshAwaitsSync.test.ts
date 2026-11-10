import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Quick 261102-s32 / F3: `refresh()` awaits `refreshNile()` so the published
 * list is the one read after `nile library sync` finishes, and a failing or
 * throwing sync still publishes the cached list without rejecting.
 *
 * `runRunnerCommand` is spied, so no binary is spawned and the fake-HOME rule
 * does not apply.
 */
import { NileUser } from '../user'
import NileLibraryManager from '../library'
import type { Stores } from 'backend/services/types'

const { libraryStore } = jest.requireMock<Stores['nile']>(
  'backend/storeManagers/nile/stores'
)

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Nile: 'Nile', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  clearCache: jest.fn(),
  getFileSize: jest.fn(),
  getNileBin: jest.fn(() => ({ dir: '', bin: 'nile' })),
  removeSpecialcharacters: jest.fn((s: string) => s)
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn(),
  addTestOnlyListener: jest.fn()
}))
jest.mock('backend/signInProbe/verdict', () => ({
  applySignInVerdict: () => 'stale'
}))
jest.mock('../user', () => ({
  NileUser: { isLoggedIn: jest.fn(), getUserData: jest.fn() }
}))

let libraryFile: unknown[] = []
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: () => true,
  readFileSync: (path: string) =>
    String(path).endsWith('installed.json')
      ? '[]'
      : JSON.stringify(libraryFile),
  writeFileSync: () => undefined
}))
jest.mock('backend/storeManagers/nile/stores', () => ({
  configStore: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  installStore: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  libraryStore: { get: () => [], set: jest.fn() }
}))

const gameEntry = (id: string) => ({
  product: {
    id,
    title: `Game ${id}`,
    productDetail: {
      details: { shortDescription: '', developer: '', genres: [] },
      iconUrl: ''
    }
  }
})

/** Manager deps whose nile family is the mocked module above. */
function testDeps() {
  return createTestManagerDeps({
    stores: createTestStores({
      nile: jest.requireMock<Stores['nile']>(
        'backend/storeManagers/nile/stores'
      )
    })
  })
}

const setMock = libraryStore.set as unknown as jest.Mock
const loggedIn = NileUser.isLoggedIn as unknown as jest.Mock

const publishedCount = (): number =>
  (setMock.mock.calls.at(-1)?.[1] as unknown[]).length

describe('NileLibraryManager.refresh awaits the sync (quick 261102-s32)', () => {
  beforeEach(() => {
    setMock.mockClear()
    loggedIn.mockReturnValue(true)
    libraryFile = [gameEntry('a')]
  })

  it('publishes the list read after the sync resolves', async () => {
    const mgr = new NileLibraryManager(testDeps())
    let release!: (v: { stdout: string; stderr: string }) => void
    const deferred = new Promise<{ stdout: string; stderr: string }>((r) => {
      release = r
    })
    jest.spyOn(mgr, 'runRunnerCommand').mockReturnValue(deferred)

    let settled = false
    const p = mgr.refresh().then(() => {
      settled = true
    })
    await new Promise((r) => setImmediate(r))
    expect(settled).toBe(false)
    expect(setMock).not.toHaveBeenCalled()

    libraryFile = [gameEntry('a'), gameEntry('b')]
    release({ stdout: '', stderr: '' })
    await p
    expect(settled).toBe(true)
    expect(publishedCount()).toBe(2)
  })

  it('a sync error still publishes the cached list and resolves', async () => {
    const mgr = new NileLibraryManager(testDeps())
    jest
      .spyOn(mgr, 'runRunnerCommand')
      .mockResolvedValue({ stdout: '', stderr: '', error: 'boom' })
    await expect(mgr.refresh()).resolves.toBeDefined()
    expect(publishedCount()).toBe(1)
  })

  it.each([
    [
      'synchronous throw',
      () => {
        throw new Error('sync boom')
      }
    ],
    ['rejected promise', () => Promise.reject(new Error('async boom'))]
  ])('a %s still publishes the cached list', async (_name, impl) => {
    const mgr = new NileLibraryManager(testDeps())
    jest.spyOn(mgr, 'runRunnerCommand').mockImplementation(impl as never)
    await expect(mgr.refresh()).resolves.toBeDefined()
    expect(publishedCount()).toBe(1)
  })

  it('signed out returns the default result without running the sync', async () => {
    loggedIn.mockReturnValue(false)
    const mgr = new NileLibraryManager(testDeps())
    const spy = jest.spyOn(mgr, 'runRunnerCommand')
    await expect(mgr.refresh()).resolves.toEqual({ stderr: '', stdout: '' })
    expect(spy).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
  })
})
