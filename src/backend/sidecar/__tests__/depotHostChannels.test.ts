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

import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestHostServices } from '../../testUtils/testHostServices'
import { defined } from 'backend/testUtils/indexed'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import { validateInbound } from '../ipcValidation'
import { registerDepotHostFlows } from '../depotHostRegistration'
import { createIpcRegistry } from '../ipcRegistry'
import { createDepotJobRegistry } from '../../storeManagers/steam/depotRust/jobRegistry'
import type { RustJobEvent } from '../../storeManagers/steam/depotRust/types'

const CHANNELS = ['depotCdnToken', 'depotManifestRequestCode', 'depotJobEvent']

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
const depotJobs = createDepotJobRegistry({
  ...createTestHostServices(),
  appRuntime: createTestAppRuntime()
})
beforeAll(() => registerDepotHostFlows({ ipc, depotJobs }))
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

  it('answers "" for a registered job: no CDN token is ever requested (CF-06)', async () => {
    const dispose = depotJobs.registerActiveDepotJob('job1', {
      appId: '480',
      refreshRequestCode: jest.fn(),
      onEvent: jest.fn()
    })
    expect(await invoke('depotCdnToken', req())).toBe('')
    expect(await invoke('depotCdnToken', req({ force: true }))).toBe('')
    dispose()
  })

  it('unknown jobId answers null', async () => {
    expect(await invoke('depotCdnToken', req({ jobId: 'nope' }))).toBeNull()
  })
})

describe('depotManifestRequestCode', () => {
  it('returns a fresh code for a registered job, null for unknown', async () => {
    const refresh = jest.fn(() => Promise.resolve('9876543210123456789'))
    const dispose = depotJobs.registerActiveDepotJob('job1', {
      appId: '480',
      refreshRequestCode: refresh,
      onEvent: jest.fn()
    })
    const p = { jobId: 'job1', appId: '480', depotId: '481', manifestId: '7' }
    expect(await invoke('depotManifestRequestCode', p)).toBe(
      '9876543210123456789'
    )
    expect(refresh).toHaveBeenCalledWith('481', '7')
    dispose()
    expect(await invoke('depotManifestRequestCode', p)).toEqual({
      unavailable: 'no_job'
    })
  })
})

describe('depotManifestRequestCode on an EResult-40 refusal', () => {
  const p = { jobId: 'job9', appId: '480', depotId: '481', manifestId: '7' }
  const register = (refresh: () => Promise<string | null>) =>
    depotJobs.registerActiveDepotJob('job9', {
      appId: '480',
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

  it('any other rejection answers {unavailable} with an allow-listed reason, never the message', async () => {
    const dispose = register(() =>
      Promise.reject(
        Object.assign(new Error('AccessDenied tok-1'), { eresult: 15 })
      )
    )
    expect(await invoke('depotManifestRequestCode', p)).toEqual({
      unavailable: 'failed'
    })
    dispose()
    const d2 = register(() => Promise.reject(new Error('Not logged on')))
    expect(await invoke('depotManifestRequestCode', p)).toEqual({
      unavailable: 'not_signed_in'
    })
    d2()
  })

  it('a null code stays null; no active job answers {unavailable: no_job}', async () => {
    const dispose = register(() => Promise.resolve(null))
    expect(await invoke('depotManifestRequestCode', p)).toBeNull()
    dispose()
    expect(await invoke('depotManifestRequestCode', p)).toEqual({
      unavailable: 'no_job'
    })
  })
})

describe('depotJobEvent', () => {
  const send = (ev: RustJobEvent) =>
    defined(ipc.listenerMap().get('depotJobEvent'), 'listeners').forEach((l) =>
      l({}, ev)
    )

  it('routes by jobId, drops unknown jobs and out-of-order seq', () => {
    const onEvent = jest.fn()
    const dispose = depotJobs.registerActiveDepotJob('job1', {
      appId: '480',
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
