/**
 * Quick 261111-8b5: a network-level failure of the Epic status request
 * (the request went out and no HTTP response came back) counts as offline,
 * so an Epic launch in the window where isOnline() still lags the network
 * drop goes `--offline`. Any HTTP response keeps the old "online" result.
 *
 * Zero jest.mock: every dependency of checkEpicServiceOffline is injected.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  checkEpicServiceOffline,
  isNetworkLevelFailure
} from '../epicServiceStatus'

const networkError = (code: string) =>
  new AxiosError(`boom ${code}`, code, undefined, {})

const httpError = (status: number, code: string) =>
  new AxiosError(`http ${status}`, code, undefined, {}, {
    status,
    data: {},
    headers: {},
    statusText: ''
  } as unknown as AxiosResponse)

describe('isNetworkLevelFailure', () => {
  it.each([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ERR_NETWORK',
    'EPROTO'
  ])(
    'is true for an AxiosError with a request and no response (%s)',
    (code) => {
      expect(isNetworkLevelFailure(networkError(code))).toBe(true)
    }
  )

  it('is true for a plain errno-style object with a listed code', () => {
    expect(isNetworkLevelFailure({ code: 'ENOTFOUND' })).toBe(true)
    const err = Object.assign(new Error('x'), { code: 'EAI_AGAIN' })
    expect(isNetworkLevelFailure(err)).toBe(true)
  })

  it('is false for an AxiosError that carries a response', () => {
    expect(isNetworkLevelFailure(httpError(503, 'ERR_BAD_RESPONSE'))).toBe(
      false
    )
    expect(isNetworkLevelFailure(httpError(404, 'ERR_BAD_REQUEST'))).toBe(false)
  })

  it('is false for a cancelled request', () => {
    expect(isNetworkLevelFailure(networkError('ERR_CANCELED'))).toBe(false)
  })

  it('is false for an AxiosError with no request (config error)', () => {
    expect(
      isNetworkLevelFailure(
        new AxiosError('bad option', 'ERR_BAD_OPTION_VALUE')
      )
    ).toBe(false)
  })

  it.each([
    ['TypeError with no code', new TypeError('x')],
    ['undefined', undefined],
    ['null', null],
    ['a string', 'ENOTFOUND']
  ])('is false for %s', (_name, value) => {
    expect(isNetworkLevelFailure(value)).toBe(false)
  })
})

describe('checkEpicServiceOffline', () => {
  const makeDeps = (fetchComponents: () => Promise<unknown>) => ({
    fetchComponents: jest.fn(fetchComponents),
    notify: jest.fn(),
    onUnreachable: jest.fn(),
    onError: jest.fn()
  })

  it('treats a network-level failure as offline without a notification', async () => {
    const error = networkError('ENOTFOUND')
    const deps = makeDeps(() => Promise.reject(error))
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(true)
    expect(deps.onUnreachable).toHaveBeenCalledTimes(1)
    expect(deps.onUnreachable).toHaveBeenCalledWith(error)
    expect(deps.notify).not.toHaveBeenCalled()
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('keeps an HTTP-error response as online and logs it', async () => {
    const deps = makeDeps(() =>
      Promise.reject(httpError(503, 'ERR_BAD_RESPONSE'))
    )
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(false)
    expect(deps.onError).toHaveBeenCalledTimes(1)
    expect(deps.notify).not.toHaveBeenCalled()
    expect(deps.onUnreachable).not.toHaveBeenCalled()
  })

  it('keeps a non-network error as online and logs it', async () => {
    const deps = makeDeps(() => Promise.reject(new TypeError('bad body')))
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(false)
    expect(deps.onError).toHaveBeenCalledTimes(1)
    expect(deps.onUnreachable).not.toHaveBeenCalled()
  })

  it('treats a malformed body (no components) as an error, online', async () => {
    const deps = makeDeps(() => Promise.resolve({}))
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(false)
    expect(deps.onError).toHaveBeenCalledTimes(1)
  })

  it("returns true and notifies once when the component is 'major'", async () => {
    const deps = makeDeps(() =>
      Promise.resolve({
        components: [{ name: 'Epic Games Store', status: 'major' }]
      })
    )
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(true)
    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it.each(['operational', 'degraded_performance'])(
    'returns false without notifying when the component is %s',
    async (status) => {
      const deps = makeDeps(() =>
        Promise.resolve({ components: [{ name: 'Epic Games Store', status }] })
      )
      await expect(checkEpicServiceOffline(deps)).resolves.toBe(false)
      expect(deps.notify).not.toHaveBeenCalled()
    }
  )

  it('notifies and returns false when the component is absent', async () => {
    const deps = makeDeps(() =>
      Promise.resolve({ components: [{ name: 'Other', status: 'major' }] })
    )
    await expect(checkEpicServiceOffline(deps)).resolves.toBe(false)
    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it('selects the component by the type argument', async () => {
    const body = {
      components: [
        { name: 'Epic Games Store', status: 'operational' },
        { name: 'Fortnite', status: 'major' }
      ]
    }
    const store = makeDeps(() => Promise.resolve(body))
    await expect(checkEpicServiceOffline(store)).resolves.toBe(false)
    const fortnite = makeDeps(() => Promise.resolve(body))
    await expect(checkEpicServiceOffline(fortnite, 'Fortnite')).resolves.toBe(
      true
    )
  })
})

describe('utils.ts wiring gate', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', '..', 'utils.ts'), 'utf8')
  )
  const start = source.indexOf('async function isEpicServiceOffline(')
  const body = source.slice(
    start,
    source.indexOf('export async function', start)
  )

  it('imports the decision from ./utils/epicServiceStatus', () => {
    expect(source).toMatch(/from '\.\/utils\/epicServiceStatus'/)
  })

  it('isEpicServiceOffline delegates and keeps the early isOnline() check', () => {
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('checkEpicServiceOffline(')
    expect(body).toContain('if (!isOnline()) return true')
  })
})
