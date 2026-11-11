/**
 * Phase 73 Plan 11: the shell-originated depot-host channels (depotCdnToken,
 * depotManifestRequestCode, depotJobEvent). Calls `registerDepotHostFlows()` directly and drives
 * the registered handlers, with a fake CdnAuthTokenCache behind the job registry.
 */
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, p) => String(p) })
}))

import { defined } from 'backend/testUtils/indexed'
import { logWarning } from 'backend/logger'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import { validateInbound } from '../ipcValidation'
import { registerDepotHostFlows } from '../depotHostRegistration'
import { createIpcRegistry } from '../ipcRegistry'
import { registerActiveDepotJob } from '../../storeManagers/steam/depotRust/jobRegistry'
import type { CdnAuthTokenCache } from '../../storeManagers/steam/depot/cdnAuth'
import type { RustJobEvent } from '../../storeManagers/steam/depotRust/types'

const SECRET = 'secret-token-do-not-log'
const CHANNELS = ['depotCdnToken', 'depotManifestRequestCode', 'depotJobEvent']

function fakeCache(
  impl: () => Promise<string> = () => Promise.resolve(`?token=${SECRET}`)
) {
  const getToken = jest.fn(impl)
  const invalidate = jest.fn()
  return {
    cache: { getToken, invalidate } as unknown as CdnAuthTokenCache,
    getToken,
    invalidate
  }
}

async function invoke(channel: string, payload: unknown): Promise<unknown> {
  const handler = defined(ipc.getHandler(channel), channel)
  return handler({}, payload)
}

const warning = (seq: number, jobId = 'job1'): RustJobEvent => ({
  jobId,
  seq,
  kind: 'warning',
  message: 'm',
  count: 1
})

const ipc = createIpcRegistry()
beforeAll(() => registerDepotHostFlows({ ipc }))
beforeEach(() => jest.clearAllMocks())

describe('depotCdnToken', () => {
  const req = (over = {}) => ({
    jobId: 'job1',
    appId: '480',
    depotId: '481',
    host: 'cdn.example',
    force: false,
    ...over
  })

  it('answers from the registered job cache', async () => {
    const { cache, getToken, invalidate } = fakeCache()
    const dispose = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: cache,
      refreshRequestCode: jest.fn(),
      onEvent: jest.fn()
    })
    expect(await invoke('depotCdnToken', req())).toBe(`?token=${SECRET}`)
    expect(getToken).toHaveBeenCalledWith('481', 'cdn.example')
    expect(invalidate).not.toHaveBeenCalled()
    dispose()
  })

  it('force invalidates first', async () => {
    const { cache, invalidate } = fakeCache()
    const dispose = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: cache,
      refreshRequestCode: jest.fn(),
      onEvent: jest.fn()
    })
    await invoke('depotCdnToken', req({ force: true }))
    expect(invalidate).toHaveBeenCalledWith('481', 'cdn.example')
    dispose()
  })

  it('unknown jobId answers null', async () => {
    expect(await invoke('depotCdnToken', req({ jobId: 'nope' }))).toBeNull()
  })

  it('token_never_logged: neither success nor error output carries the token', async () => {
    const failing = fakeCache(() =>
      Promise.reject(new Error(`boom https://x/?token=${SECRET}`))
    )
    const dispose = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: failing.cache,
      refreshRequestCode: jest.fn(),
      onEvent: jest.fn()
    })
    expect(await invoke('depotCdnToken', req())).toBeNull()
    dispose()
    const ok = fakeCache()
    const dispose2 = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: ok.cache,
      refreshRequestCode: jest.fn(),
      onEvent: jest.fn()
    })
    await invoke('depotCdnToken', req())
    dispose2()
    const logged = JSON.stringify((logWarning as jest.Mock).mock.calls)
    expect((logWarning as jest.Mock).mock.calls.length).toBeGreaterThan(0)
    expect(logged).not.toContain(SECRET)
  })
})

describe('depotManifestRequestCode', () => {
  it('returns a fresh code for a registered job, null for unknown', async () => {
    const refresh = jest.fn(() => Promise.resolve('9876543210123456789'))
    const dispose = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: fakeCache().cache,
      refreshRequestCode: refresh,
      onEvent: jest.fn()
    })
    const p = { jobId: 'job1', appId: '480', depotId: '481', manifestId: '7' }
    expect(await invoke('depotManifestRequestCode', p)).toBe(
      '9876543210123456789'
    )
    expect(refresh).toHaveBeenCalledWith('481', '7')
    dispose()
    expect(await invoke('depotManifestRequestCode', p)).toBeNull()
  })
})

describe('depotManifestRequestCode on an EResult-40 refusal', () => {
  const p = { jobId: 'job9', appId: '480', depotId: '481', manifestId: '7' }
  const register = (refresh: () => Promise<string | null>) =>
    registerActiveDepotJob('job9', {
      appId: '480',
      tokenCache: fakeCache().cache,
      refreshRequestCode: refresh,
      onEvent: jest.fn()
    })

  it('answers {eresult: 40} so the crate skips the depot', async () => {
    const dispose = register(() =>
      Promise.reject(Object.assign(new Error('Blocked'), { eresult: 40 }))
    )
    expect(await invoke('depotManifestRequestCode', p)).toEqual({
      eresult: 40
    })
    dispose()
  })

  it('any other rejection still answers null', async () => {
    const dispose = register(() =>
      Promise.reject(Object.assign(new Error('AccessDenied'), { eresult: 15 }))
    )
    expect(await invoke('depotManifestRequestCode', p)).toBeNull()
    dispose()
  })
})

describe('depotJobEvent', () => {
  const send = (ev: RustJobEvent) =>
    defined(ipc.listenerMap().get('depotJobEvent'), 'listeners').forEach((l) =>
      l({}, ev)
    )

  it('routes by jobId, drops unknown jobs and out-of-order seq', () => {
    const onEvent = jest.fn()
    const dispose = registerActiveDepotJob('job1', {
      appId: '480',
      tokenCache: fakeCache().cache,
      refreshRequestCode: jest.fn(),
      onEvent
    })
    send(warning(1))
    send(warning(3))
    send(warning(2)) // out of order
    send(warning(3)) // duplicate
    send(warning(4, 'other')) // unknown job
    expect(onEvent.mock.calls.map((c) => (c[0] as RustJobEvent).seq)).toEqual([
      1, 3
    ])
    dispose()
    send(warning(9))
    expect(onEvent).toHaveBeenCalledTimes(2)
  })
})

describe('validation and surface', () => {
  it('validateInbound rejects malformed payloads for each channel', () => {
    expect(
      validateInbound('depotCdnToken', 'invoke', [
        { jobId: 'j', appId: 'x1', depotId: '1', host: 'h', force: false }
      ]).ok
    ).toBe(false)
    expect(
      validateInbound('depotManifestRequestCode', 'invoke', [
        { jobId: 'j', appId: '1', depotId: '1', manifestId: '-1' }
      ]).ok
    ).toBe(false)
    expect(
      validateInbound('depotJobEvent', 'send', [
        {
          jobId: 'j',
          seq: 1,
          kind: 'warning',
          message: 'x'.repeat(513),
          count: 1
        }
      ]).ok
    ).toBe(false)
    expect(validateInbound('depotJobEvent', 'send', [warning(1)]).ok).toBe(true)
  })

  it('all three channels carry caller shell', () => {
    for (const c of CHANNELS) {
      expect(defined(channelSchemas[c], c).caller).toBe('shell')
    }
  })
})
