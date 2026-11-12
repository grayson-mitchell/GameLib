/**
 * 66.4-11: the Nile runtime holds per-instance state. Concurrent login-data reads on one runtime share
 * one in-flight promise (no value cache: a later read after settle starts a new one), two runtimes
 * share nothing, and deriveNilePaths is pure over its root.
 */
import type { NileLoginData } from 'common/types/nile'
import { join } from 'path'
import { createNileRuntime } from '../nileRuntime'
import { deriveNilePaths } from '../constants'

const DATA = {
  url: 'https://example.invalid/auth',
  code_verifier: 'v',
  serial: 's',
  client_id: 'c'
} as unknown as NileLoginData

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createNileRuntime login flight', () => {
  it('concurrent reads on one runtime share one in-flight promise', async () => {
    const { loginFlight } = createNileRuntime()
    const gate = deferred<NileLoginData>()
    const start = jest.fn(() => gate.promise)

    const first = loginFlight.run(start)
    const second = loginFlight.run(start)
    expect(start).toHaveBeenCalledTimes(1)
    expect(loginFlight.current()).not.toBeNull()

    gate.resolve(DATA)
    await expect(first).resolves.toBe(DATA)
    await expect(second).resolves.toBe(DATA)
    expect(loginFlight.current()).toBeNull()
  })

  it('a read after the first settled starts a new one (no value cache)', async () => {
    const { loginFlight } = createNileRuntime()
    const start = jest.fn(() => Promise.resolve(DATA))
    await loginFlight.run(start)
    await loginFlight.run(start)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('a rejected read clears the slot so a retry starts fresh', async () => {
    const { loginFlight } = createNileRuntime()
    await expect(
      loginFlight.run(() => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom')
    expect(loginFlight.current()).toBeNull()
    await expect(loginFlight.run(() => Promise.resolve(DATA))).resolves.toBe(
      DATA
    )
  })

  it('two runtimes do not share an in-flight read', async () => {
    const a = createNileRuntime()
    const b = createNileRuntime()
    const gate = deferred<NileLoginData>()
    const pending = a.loginFlight.run(() => gate.promise)
    expect(b.loginFlight.current()).toBeNull()
    const startB = jest.fn(() => Promise.resolve(DATA))
    await b.loginFlight.run(startB)
    expect(startB).toHaveBeenCalledTimes(1)
    gate.resolve(DATA)
    await pending
  })
})

describe('createNileRuntime stubs', () => {
  it('default to the --version answer, can be replaced and reset, and are per runtime', async () => {
    const a = createNileRuntime()
    const b = createNileRuntime()
    expect((await a.stubs.run(['--version'])).stdout).toContain('1.0.0')

    a.stubs.set([{ commandParts: ['library'], stdout: 'lib' }])
    expect((await a.stubs.run(['library', 'sync'])).stdout).toBe('lib')
    expect((await b.stubs.run(['--version'])).stdout).toContain('1.0.0')

    a.stubs.reset()
    expect((await a.stubs.run(['--version'])).stdout).toContain('1.0.0')
  })
})

describe('deriveNilePaths', () => {
  it('derives every location from the root with today values', () => {
    const base = join('/app/GameLib', 'nile_config', 'nile')
    expect(deriveNilePaths({ appFolder: '/app/GameLib' })).toEqual({
      nileConfigPath: base,
      nileInstalled: join(base, 'installed.json'),
      nileLibrary: join(base, 'library.json'),
      nileUserData: join(base, 'current_user.json')
    })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(deriveNilePaths({ appFolder: '/x' }))).toBe(true)
  })
})
