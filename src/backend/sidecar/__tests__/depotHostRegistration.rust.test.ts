/** 79-22: depot host handlers with cm=rust (CF-06 no tokens; typed CM failures to the crate). */
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
import { logWarning } from 'backend/logger'
import { registerDepotHostFlows } from '../depotHostRegistration'
import { createIpcRegistry } from '../ipcRegistry'
import { createDepotJobRegistry } from '../../storeManagers/steam/depotRust/jobRegistry'
import { requestCodeRefresher } from '../../storeManagers/steam/depotRust/install'
import type { CdnAuthTokenCache } from '../../storeManagers/steam/depot/cdnAuth'
import type { SteamCmClient } from '../../storeManagers/steam/cm/SteamCmClient'

const ipc = createIpcRegistry()
const depotJobs = createDepotJobRegistry({
  ...createTestHostServices(),
  appRuntime: createTestAppRuntime()
})
const savedEnv = process.env.GAMELIB_STEAMCM_CM

beforeAll(() => {
  process.env.GAMELIB_STEAMCM_CM = 'rust'
  registerDepotHostFlows({ ipc, depotJobs })
})
afterAll(() => {
  if (savedEnv === undefined) delete process.env.GAMELIB_STEAMCM_CM
  else process.env.GAMELIB_STEAMCM_CM = savedEnv
})
beforeEach(() => jest.clearAllMocks())

const invoke = async (channel: string, payload: unknown): Promise<unknown> =>
  await defined(ipc.getHandler(channel), channel)({}, payload)

function registerJob(
  getManifestRequestCode: SteamCmClient['getManifestRequestCode']
) {
  const getToken = jest.fn()
  const client = { getManifestRequestCode } as unknown as SteamCmClient
  const dispose = depotJobs.registerActiveDepotJob('job1', {
    appId: '480',
    tokenCache: {
      getToken,
      invalidate: jest.fn()
    } as unknown as CdnAuthTokenCache,
    refreshRequestCode: requestCodeRefresher(client, new Map(), '480'),
    onEvent: jest.fn()
  })
  return { dispose, getToken }
}

const codeReq = { jobId: 'job1', appId: '480', depotId: '481', manifestId: '9' }

function cmError(kind: string, eresult?: number) {
  return Object.assign(new Error(`steamcm failed: ${kind}`), {
    steamcmKind: kind,
    ...(eresult === undefined ? {} : { eresult })
  })
}

describe('cm=rust depot host handlers', () => {
  it('depotCdnToken answers "" without touching the cache', async () => {
    const { dispose, getToken } = registerJob(jest.fn())
    expect(
      await invoke('depotCdnToken', {
        jobId: 'job1',
        appId: '480',
        depotId: '481',
        host: 'cdn.example',
        force: true
      })
    ).toBe('')
    expect(getToken).not.toHaveBeenCalled()
    expect(logWarning).not.toHaveBeenCalled()
    dispose()
  })

  it('replies the decimal string from the lease client', async () => {
    const get = jest.fn(() => Promise.resolve({ requestCode: '12345' }))
    const { dispose } = registerJob(get)
    expect(await invoke('depotManifestRequestCode', codeReq)).toBe('12345')
    expect(get).toHaveBeenCalledWith(480, 481, '9', 'public')
    dispose()
  })

  it('replies null when Steam gave no code', async () => {
    const { dispose } = registerJob(() => Promise.resolve({ requestCode: '0' }))
    expect(await invoke('depotManifestRequestCode', codeReq)).toBeNull()
    dispose()
  })

  it('maps eresult 40 to {eresult: 40}', async () => {
    const { dispose } = registerJob(() =>
      Promise.reject(cmError('eresult', 40))
    )
    expect(await invoke('depotManifestRequestCode', codeReq)).toEqual({
      eresult: 40
    })
    dispose()
  })

  it.each(['timeout', 'network', 'leaseUnknown'])(
    'maps steamcmKind %s to {unavailable}',
    async (kind) => {
      const { dispose } = registerJob(() => Promise.reject(cmError(kind)))
      expect(await invoke('depotManifestRequestCode', codeReq)).toEqual({
        unavailable: kind
      })
      dispose()
    }
  )

  it('logs channel, jobId and error name only', async () => {
    const { dispose } = registerJob(() => Promise.reject(cmError('timeout')))
    await invoke('depotManifestRequestCode', codeReq)
    const line = String((logWarning as jest.Mock).mock.calls[0]?.[0])
    expect(line).toBe('depotManifestRequestCode failed for job job1 (Error)')
    dispose()
  })
})
