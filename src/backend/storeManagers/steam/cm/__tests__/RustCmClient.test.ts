import { createRustCmClient } from '../RustCmClient'
import { createRustAnonClient } from '../RustAnonClient'
import * as logger from 'backend/logger'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The recorded Rust wire results (plan 79-21 goldens), not inline fixtures.
const GOLDEN = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../../../src-tauri/crates/gamelib-steamcm/tests/fixtures/rust-results.json'
    ),
    'utf-8'
  )
) as Record<
  string,
  { ok: boolean; result?: any; kind?: string; eresult?: number }
>
const golden = (name: string) => {
  const g = GOLDEN[name]
  if (!g) throw new Error(`no golden result for ${name}`)
  return g
}

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
    const wire = golden('anon_pics:480')
    requestRustInvoke.mockResolvedValue(wire)
    const c = createRustCmClient(deps, lease)
    await expect(c.getProductInfo([480], [], true)).resolves.toEqual(
      wire.result
    )
    expect(requestRustInvoke).toHaveBeenCalledWith('steamcm_product_info', [
      { leaseId: 7, apps: [480], packages: [], inclTokens: true }
    ])
  })

  it('getDepotDecryptionKey yields a Buffer, and an eresult error carries .eresult', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(golden('depot_key:ok'))
    const key = await new Promise<Buffer>((res, rej) =>
      c.getDepotDecryptionKey(1, 2, (e, k) => (e ? rej(e) : res(k)))
    )
    expect(key.toString('hex')).toBe(golden('depot_key:ok').result.keyHex)
    expect(requestRustInvoke).toHaveBeenCalledWith('steamcm_depot_key', [
      { leaseId: 7, appId: 1, depotId: 2 }
    ])

    requestRustInvoke.mockResolvedValueOnce(golden('depot_key:eresult2'))
    const err = await new Promise<Error & { eresult?: number }>((res) =>
      c.getDepotDecryptionKey(1, 2, (e) => res(e as never))
    )
    expect(err.eresult).toBe(2)
  })

  it('getContentServers and getManifestRequestCode resolve through their channels', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(golden('content_servers:strings'))
    const servers = await new Promise((res, rej) =>
      c.getContentServers(9, (e, s) => (e ? rej(e) : res(s)))
    )
    expect(servers).toEqual(golden('content_servers:strings').result)
    requestRustInvoke.mockResolvedValueOnce(golden('request_code:big'))
    await expect(
      c.getManifestRequestCode(1, 2, '99', 'public')
    ).resolves.toEqual(golden('request_code:big').result)
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
    requestRustInvoke.mockResolvedValueOnce(golden('redeem:duplicate'))
    const err = await c.redeemKey('KEY').catch((e) => e)
    expect(err.eresult).toBe(9)
    expect(err.purchaseResultDetails).toBe(9)
    expect(err.packageList).toEqual({})
    expect(err.message).not.toContain('KEY')

    requestRustInvoke.mockResolvedValueOnce(golden('redeem:ok'))
    await expect(c.redeemKey('KEY')).resolves.toEqual({
      purchaseResultDetails: 0,
      packageList: golden('redeem:ok').result.packageList
    })
  })

  it('getPersonas and getUserOwnedApps map steam ids and options', async () => {
    const c = createRustCmClient(deps, lease)
    requestRustInvoke.mockResolvedValueOnce(golden('personas:one'))
    await expect(c.getPersonas([c.steamID as never])).resolves.toEqual(
      golden('personas:one').result
    )
    requestRustInvoke.mockResolvedValueOnce(golden('personas:one'))
    await c.getPersonas([c.steamID as never])
    expect(requestRustInvoke).toHaveBeenLastCalledWith('steamcm_personas', [
      { leaseId: 7, steamIds: ['76561198000000001'] }
    ])
    requestRustInvoke.mockResolvedValueOnce(golden('owned_apps:two'))
    await expect(
      c.getUserOwnedApps('76561198000000001', {
        includePlayedFreeGames: true
      })
    ).resolves.toEqual(golden('owned_apps:two').result)
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
    const wire = golden('anon_pics:1007')
    requestRustInvoke.mockResolvedValue(wire)
    await expect(
      createRustAnonClient(deps).getProductInfo([3], [], true)
    ).resolves.toEqual(wire.result)
    expect(requestRustInvoke).toHaveBeenCalledWith(
      'steamcm_anon_product_info',
      [{ apps: [3], packages: [], inclTokens: true }]
    )
  })
})
