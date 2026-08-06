/**
 * Regression coverage for quick task 260806-teb Task 2.
 *
 * `NileUser.getLoginData()` spawns `nile auth --login --non-interactive` via
 * `runRunnerCommand` -- a ~12.8s cost per invocation (pyinstaller-onefile-spawn-tax). Under
 * Tauri, two concurrent callers (e.g. index.tsx's now-removed effect racing
 * useTauriOAuthLogin.ts's own fetch, or a remounted WebView route) used to race two
 * independent spawns instead of sharing the one already in flight.
 *
 * These tests pin the in-flight-promise memoization fix, mirroring
 * `src/backend/utils/systeminfo/index.ts`'s `inFlightSystemInfoFetch` pattern -- and, load-
 * bearingly, prove there is NO value cache: a sequential call issued after the previous one
 * resolved must mint FRESH PKCE material (`code_verifier`/`serial`), never replaying a stale
 * value. `NileLoginData` carries single-use PKCE material consumed exactly once by the
 * `authAmazon` -> `nile register` exchange -- reusing it across attempts would let a retry
 * after a cancelled login replay stale material, a correctness bug (T-TEB-01/T-TEB-02).
 */

const mockRunRunnerCommand = jest.fn()

jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: {
    nile: { runRunnerCommand: mockRunRunnerCommand }
  }
}))

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Nile: 'Nile' }
}))

jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: {
    set: jest.fn(),
    delete: jest.fn(),
    get_nodefault: jest.fn()
  }
}))

jest.mock('backend/utils', () => ({
  clearCache: jest.fn()
}))

import { NileUser } from '../user'

function stdoutFor(payload: Record<string, unknown>) {
  return { stdout: JSON.stringify(payload) }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const LOGIN_DATA_1 = {
  url: 'https://amazon.com/ap/signin?a=1',
  client_id: 'client-1',
  code_verifier: 'verifier-1',
  serial: 'serial-1'
}

const LOGIN_DATA_2 = {
  url: 'https://amazon.com/ap/signin?a=2',
  client_id: 'client-2',
  code_verifier: 'verifier-2',
  serial: 'serial-2'
}

describe('quick 260806-teb Task 2 -- NileUser.getLoginData() in-flight memoization', () => {
  beforeEach(() => {
    NileUser.__resetInFlightLoginDataForTests()
  })

  it('two concurrent getLoginData() calls issued before the first resolves invoke runRunnerCommand exactly ONCE, and both receive the same resolved data', async () => {
    const first = deferred<{ stdout: string }>()
    mockRunRunnerCommand.mockReturnValueOnce(first.promise)

    const callA = NileUser.getLoginData()
    const callB = NileUser.getLoginData()

    first.resolve(stdoutFor(LOGIN_DATA_1))

    const [resultA, resultB] = await Promise.all([callA, callB])

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    expect(resultA).toEqual(LOGIN_DATA_1)
    expect(resultB).toEqual(LOGIN_DATA_1)
  })

  it('a getLoginData() call issued AFTER the previous one resolved spawns a SECOND runRunnerCommand and mints FRESH code_verifier/serial -- proving no value cache exists', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(stdoutFor(LOGIN_DATA_1))
    const first = await NileUser.getLoginData()
    expect(first).toEqual(LOGIN_DATA_1)
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)

    mockRunRunnerCommand.mockResolvedValueOnce(stdoutFor(LOGIN_DATA_2))
    const second = await NileUser.getLoginData()

    // THE regression this test exists to catch: a TTL/value cache here would return
    // LOGIN_DATA_1 again (stale PKCE material) instead of spawning fresh.
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
    expect(second).toEqual(LOGIN_DATA_2)
    expect(second.code_verifier).not.toBe(first.code_verifier)
    expect(second.serial).not.toBe(first.serial)
  })

  it('a rejected in-flight fetch clears the memo, so the NEXT call retries with a fresh spawn rather than re-rejecting forever off a poisoned promise', async () => {
    const failing = deferred<{ stdout: string }>()
    mockRunRunnerCommand.mockReturnValueOnce(failing.promise)

    const firstCall = NileUser.getLoginData()
    failing.reject(new Error('nile auth exited non-zero'))

    await expect(firstCall).rejects.toThrow('nile auth exited non-zero')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)

    mockRunRunnerCommand.mockResolvedValueOnce(stdoutFor(LOGIN_DATA_1))
    const secondCall = await NileUser.getLoginData()

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
    expect(secondCall).toEqual(LOGIN_DATA_1)
  })

  it('both concurrent callers observe the same rejection when the underlying spawn fails', async () => {
    const failing = deferred<{ stdout: string }>()
    mockRunRunnerCommand.mockReturnValueOnce(failing.promise)

    const callA = NileUser.getLoginData()
    const callB = NileUser.getLoginData()

    failing.reject(new Error('spawn failed'))

    await expect(callA).rejects.toThrow('spawn failed')
    await expect(callB).rejects.toThrow('spawn failed')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
  })
})
