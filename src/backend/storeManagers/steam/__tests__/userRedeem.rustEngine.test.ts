import * as logger from 'backend/logger'
import { redeemKey } from '../userRedeem'
import type { SteamCmClient } from '../cm/SteamCmClient'

const KEY = 'AAAAA-BBBBB-CCCCC'

function fakeClient(
  licenses: { package_id?: number }[],
  redeem: jest.Mock
): SteamCmClient {
  return { licenses, redeemKey: redeem } as unknown as SteamCmClient
}

function makeDeps(clients: SteamCmClient[]) {
  const release = jest.fn()
  const acquireAuthenticated = jest.fn()
  for (const client of clients) {
    acquireAuthenticated.mockResolvedValueOnce({ ok: true, client, release })
  }
  return {
    deps: { steamUser: { acquireAuthenticated } } as never,
    acquireAuthenticated,
    release
  }
}

function steamcmError(kind: string, extra: object = {}) {
  return Object.assign(new Error(`steamcm redeemKey failed: ${kind}`), {
    steamcmKind: kind,
    ...extra
  })
}

let logged: string[]
beforeEach(() => {
  logged = []
  const spy = (m: unknown) => {
    logged.push(JSON.stringify(m))
  }
  jest.spyOn(logger, 'logInfo').mockImplementation(spy)
  jest.spyOn(logger, 'logWarning').mockImplementation(spy)
  jest.spyOn(logger, 'logError').mockImplementation(spy)
})
afterEach(() => jest.restoreAllMocks())

describe('redeemKey on a SteamCmClient lease', () => {
  it('maps a success reply', async () => {
    const redeem = jest
      .fn()
      .mockResolvedValue({ purchaseResultDetails: 0, packageList: { 9: 'G' } })
    const { deps, release } = makeDeps([fakeClient([], redeem)])
    const r = await redeemKey(deps, 'steam', KEY)
    expect(r).toEqual({
      store: 'steam',
      outcome: 'success',
      packageList: { 9: 'G' }
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('maps an eresult rejection as today', async () => {
    const redeem = jest
      .fn()
      .mockRejectedValue(
        steamcmError('eresult', { purchaseResultDetails: 9, packageList: {} })
      )
    const { deps } = makeDeps([fakeClient([], redeem)])
    const r = await redeemKey(deps, 'steam', KEY)
    expect(r.outcome).toBe('already-owned')
  })

  it('ambiguous: never resent, success when a new package appeared', async () => {
    const redeem = jest.fn().mockRejectedValue(steamcmError('ambiguous'))
    const second = jest.fn()
    const { deps, acquireAuthenticated, release } = makeDeps([
      fakeClient([{ package_id: 1 }], redeem),
      fakeClient([{ package_id: 1 }, { package_id: 42 }], second)
    ])
    const r = await redeemKey(deps, 'steam', KEY)
    expect(r.outcome).toBe('success')
    expect(Object.keys(r.packageList ?? {})).toEqual(['42'])
    expect(redeem).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(acquireAuthenticated).toHaveBeenCalledTimes(2)
    expect(release).toHaveBeenCalledTimes(2)
  })

  it('ambiguous: generic failure when no package appeared', async () => {
    const redeem = jest.fn().mockRejectedValue(steamcmError('ambiguous'))
    const { deps } = makeDeps([
      fakeClient([{ package_id: 1 }], redeem),
      fakeClient([{ package_id: 1 }], jest.fn())
    ])
    const r = await redeemKey(deps, 'steam', KEY)
    expect(r).toEqual({
      store: 'steam',
      outcome: 'error',
      message: 'redeem-failed'
    })
    expect(redeem).toHaveBeenCalledTimes(1)
  })

  it('ambiguous: failure when the verification lease is refused', async () => {
    const redeem = jest.fn().mockRejectedValue(steamcmError('ambiguous'))
    const { deps, acquireAuthenticated } = makeDeps([fakeClient([], redeem)])
    acquireAuthenticated.mockResolvedValueOnce({
      ok: false,
      reason: 'client-not-ready'
    })
    const r = await redeemKey(deps, 'steam', KEY)
    expect(r.outcome).toBe('error')
    expect(redeem).toHaveBeenCalledTimes(1)
  })

  it('never logs the product key', async () => {
    const ambiguous = jest.fn().mockRejectedValue(steamcmError('ambiguous'))
    const ok = jest
      .fn()
      .mockResolvedValue({ purchaseResultDetails: 0, packageList: {} })
    await redeemKey(
      makeDeps([
        fakeClient([], ambiguous),
        fakeClient([{ package_id: 3 }], jest.fn())
      ]).deps,
      'steam',
      KEY
    )
    await redeemKey(makeDeps([fakeClient([], ok)]).deps, 'steam', KEY)
    expect(logged.length).toBeGreaterThan(0)
    expect(logged.join('\n')).not.toContain(KEY)
  })
})
