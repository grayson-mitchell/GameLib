import { createRustCmClient } from '../RustCmClient'
import { createRustAnonClient } from '../RustAnonClient'
import * as logger from 'backend/logger'

const requestRustInvoke = jest.fn()
const deps = { requestRustInvoke }
const lease = {
  leaseId: 7,
  steamId: '76561198000000001',
  licenses: [{ package_id: 5 }]
}

beforeEach(() => {
  jest.restoreAllMocks()
  requestRustInvoke.mockReset()
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})

const ok = (result: unknown) => ({ ok: true, result })

describe('createRustCmClient', () => {
  it('getProductInfo sends the lease and resolves the result unchanged', async () => {
    const info = { apps: { 480: { appinfo: {} } }, unknownApps: [] }
    requestRustInvoke.mockResolvedValue(ok(info))
    const c = createRustCmClient(deps, lease)
    await expect(c.getProductInfo([480], [], true)).resolves.toEqual(info)
    expect(requestRustInvoke).toHaveBeenCalledWith('steamcm_product_info', [
      { leaseId: 7, apps: [480], packages: [], inclTokens: true }
    ])
  })

  it('getDepotDecryptionKey yields a Buffer, and an eresult error carries .eresult', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(ok({ eresult: 1, keyHex: 'abcd' }))
    const key = await new Promise<Buffer>((res, rej) =>
      c.getDepotDecryptionKey(1, 2, (e, k) => (e ? rej(e) : res(k)))
    )
    expect(key.equals(Buffer.from('abcd', 'hex'))).toBe(true)
    expect(requestRustInvoke).toHaveBeenCalledWith('steamcm_depot_key', [
      { leaseId: 7, appId: 1, depotId: 2 }
    ])

    requestRustInvoke.mockResolvedValueOnce({
      ok: false,
      kind: 'eresult',
      eresult: 2
    })
    const err = await new Promise<Error & { eresult?: number }>((res) =>
      c.getDepotDecryptionKey(1, 2, (e) => res(e as never))
    )
    expect(err.eresult).toBe(2)
  })

  it('getContentServers and getManifestRequestCode resolve through their channels', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(ok([{ Host: 'h' }]))
    const servers = await new Promise((res, rej) =>
      c.getContentServers(9, (e, s) => (e ? rej(e) : res(s)))
    )
    expect(servers).toEqual([{ Host: 'h' }])
    requestRustInvoke.mockResolvedValueOnce(
      ok({ requestCode: '123456789012345678' })
    )
    await expect(
      c.getManifestRequestCode(1, 2, '99', 'public')
    ).resolves.toEqual({
      requestCode: '123456789012345678'
    })
    expect(requestRustInvoke).toHaveBeenLastCalledWith(
      'steamcm_manifest_request_code',
      [{ leaseId: 7, appId: 1, depotId: 2, manifestId: '99', branch: 'public' }]
    )
  })

  it('a replaced result rejects with the kind and no args', async () => {
    requestRustInvoke.mockResolvedValue({ ok: false, kind: 'replaced' })
    const c = createRustCmClient(deps, lease)
    const err = await c.getProductInfo([1], [], false).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('steamcm steamcm_product_info failed: replaced')
    expect(err.steamcmKind).toBe('replaced')
  })

  it('exposes the lease steamID and licenses', () => {
    const c = createRustCmClient(deps, lease)
    expect(c.steamID?.getSteamID64()).toBe('76561198000000001')
    expect(c.licenses).toEqual([{ package_id: 5 }])
  })

  it('redeemKey rejects on eresult != 1 carrying the purchase verdict', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(
      ok({ eresult: 9, purchaseResultDetails: 14, packageList: {} })
    )
    const err = await c.redeemKey('KEY').catch((e) => e)
    expect(err.eresult).toBe(9)
    expect(err.purchaseResultDetails).toBe(14)
    expect(err.packageList).toEqual({})
    expect(err.message).not.toContain('KEY')

    requestRustInvoke.mockResolvedValueOnce(
      ok({ eresult: 1, purchaseResultDetails: 0, packageList: { 1: 'G' } })
    )
    await expect(c.redeemKey('KEY')).resolves.toEqual({
      purchaseResultDetails: 0,
      packageList: { 1: 'G' }
    })
  })

  it('getPersonas and getUserOwnedApps map steam ids and options', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(ok({ personas: {} }))
    await c.getPersonas([c.steamID as never])
    expect(requestRustInvoke).toHaveBeenLastCalledWith('steamcm_personas', [
      { leaseId: 7, steamIds: ['76561198000000001'] }
    ])
    requestRustInvoke.mockResolvedValueOnce(ok({ app_count: 0, apps: [] }))
    await c.getUserOwnedApps('76561198000000001', {
      includePlayedFreeGames: true
    })
    expect(requestRustInvoke).toHaveBeenLastCalledWith('steamcm_owned_apps', [
      {
        leaseId: 7,
        steamId: '76561198000000001',
        includeAppinfo: true,
        includePlayedFreeGames: true,
        includeFreeSub: false,
        skipUnvettedApps: true
      }
    ])
  })

  it('logs the channel only', async () => {
    requestRustInvoke.mockResolvedValue(
      ok({ eresult: 1, purchaseResultDetails: 0, packageList: {} })
    )
    await createRustCmClient(deps, lease).redeemKey('SECRET-KEY')
    const calls = (logger.logDebug as jest.Mock).mock.calls
    expect(calls).toEqual([['[steamcm] rust steamcm_redeem_key', 'Steam']])
  })
})

describe('createRustAnonClient', () => {
  it('calls steamcm_anon_product_info and never sends a leaseId', async () => {
    const info = { apps: {}, unknownApps: [3] }
    requestRustInvoke.mockResolvedValue(ok(info))
    await expect(
      createRustAnonClient(deps).getProductInfo([3], [], true)
    ).resolves.toEqual(info)
    expect(requestRustInvoke).toHaveBeenCalledWith(
      'steamcm_anon_product_info',
      [{ apps: [3], packages: [], inclTokens: true }]
    )
  })
})
