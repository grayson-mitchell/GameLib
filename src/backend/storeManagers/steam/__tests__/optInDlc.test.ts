import { getSteamOptInDlc } from '../optInDlc'
import { findBridgeInstallBottle } from '../bridgeBottle'
import { resolveBridgeUpdateContext } from '../depotRust/updateEstimate'
import { readAcfInstalledDepots } from '../acfInstalledDepots'
import { getOwnedSets } from '../depot/plan'
import SteamGame from '../games'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../bridgeBottle', () => ({ findBridgeInstallBottle: jest.fn() }))
jest.mock('../depotRust/updateEstimate', () => ({
  resolveBridgeUpdateContext: jest.fn()
}))
jest.mock('../acfInstalledDepots', () => ({
  readAcfInstalledDepots: jest.fn()
}))
jest.mock('../depot/plan', () => ({ getOwnedSets: jest.fn() }))
jest.mock('../games', () => ({
  __esModule: true,
  default: jest.fn()
}))

const APP = '570'
const DOTA = {
  extended: { listofdlc: '313250' },
  depots: {
    '381450': {
      dlcappid: '313250',
      config: { oslist: 'windows', optionaldlc: '313250' },
      manifests: { public: { gid: '1', size: '1000' } }
    }
  }
}
const DLC = {
  extended: { optionaldlc: '1' },
  common: { name: 'Dota 2 Workshop Tools' }
}

function reader() {
  return {
    getProductInfo: jest.fn(async (apps: number[]) => ({
      apps: Object.fromEntries(
        apps.map((a) => [a, { appinfo: a === 570 ? DOTA : DLC }])
      )
    }))
  }
}

function makeDeps(opts: {
  anon?: unknown
  lease?: { client: unknown; release: jest.Mock } | null
}) {
  return {
    paths: {},
    anonymousClient: { get: jest.fn(async () => opts.anon ?? null) },
    steamUser: {
      acquireOpenAuthenticated: jest.fn(async () => opts.lease ?? null),
      acquireAuthenticated: jest.fn()
    }
  }
}

let gameInfo: unknown
let isNative = true

beforeEach(() => {
  jest.clearAllMocks()
  gameInfo = undefined
  isNative = true
  jest.mocked(findBridgeInstallBottle).mockReturnValue(null)
  ;(SteamGame as unknown as jest.Mock).mockImplementation(() => ({
    findGameInfo: () => gameInfo,
    isNative: () => isNative
  }))
})

const run = (deps: ReturnType<typeof makeDeps>, id = APP, o = {}) =>
  getSteamOptInDlc(deps as never, id, o)

describe('getSteamOptInDlc (quick 261122-rgi)', () => {
  it('261122-rgi: a non-numeric appId answers null', async () => {
    expect(await run(makeDeps({}), 'abc')).toBeNull()
  })

  it('261122-rgi: anonymous PICS with no open session lists entries with owned null', async () => {
    const deps = makeDeps({ anon: reader() })
    const res = await run(deps, APP, { windowsBuild: true })
    expect(res).toEqual({
      manage: 'not-installed',
      entries: [
        {
          appId: '313250',
          name: 'Dota 2 Workshop Tools',
          bytes: 1000,
          owned: null,
          installed: false
        }
      ]
    })
    expect(deps.steamUser.acquireAuthenticated).not.toHaveBeenCalled()
  })

  it('261122-rgi: an open session gives owned true/false from the licence-derived sets and is released', async () => {
    const release = jest.fn()
    jest
      .mocked(getOwnedSets)
      .mockResolvedValueOnce({ apps: new Set([313250]), depots: new Set() })
    const deps = makeDeps({
      anon: reader(),
      lease: { client: {}, release }
    })
    const res = await run(deps, APP, { windowsBuild: true })
    expect(res?.entries[0]?.owned).toBe(true)
    expect(release).toHaveBeenCalledTimes(1)

    jest
      .mocked(getOwnedSets)
      .mockResolvedValueOnce({ apps: new Set(), depots: new Set() })
    const res2 = await run(
      makeDeps({ anon: reader(), lease: { client: {}, release } }),
      APP,
      { windowsBuild: true }
    )
    expect(res2?.entries[0]?.owned).toBe(false)
  })

  it('261122-rgi: an unreadable licence list leaves owned null, not an error', async () => {
    jest.mocked(getOwnedSets).mockRejectedValueOnce(new Error('no licences'))
    const res = await run(
      makeDeps({
        anon: reader(),
        lease: { client: {}, release: jest.fn() }
      }),
      APP,
      { windowsBuild: true }
    )
    expect(res?.entries[0]?.owned).toBeNull()
  })

  it('261122-rgi: a public-only anonymous base entry with no open session answers null', async () => {
    const anon = {
      getProductInfo: jest.fn(async () => ({
        apps: { 570: { appinfo: { public_only: 1 } } }
      }))
    }
    expect(await run(makeDeps({ anon }))).toBeNull()
  })

  it('261122-rgi: a public-only anonymous entry falls back to the open session client', async () => {
    const anon = {
      getProductInfo: jest.fn(async () => ({
        apps: { 570: { appinfo: {}, missingToken: true } }
      }))
    }
    const client = reader()
    jest
      .mocked(getOwnedSets)
      .mockResolvedValueOnce({ apps: new Set([313250]), depots: new Set() })
    const res = await run(
      makeDeps({ anon, lease: { client, release: jest.fn() } }),
      APP,
      { windowsBuild: true }
    )
    expect(client.getProductInfo).toHaveBeenCalled()
    expect(res?.entries).toHaveLength(1)
  })

  it('261122-rgi: no anonymous client answer and no session answers null', async () => {
    expect(await run(makeDeps({}))).toBeNull()
  })

  it('261122-rgi: a bridge copy is managed by GameLib and reads installed from the ACF depots', async () => {
    jest
      .mocked(findBridgeInstallBottle)
      .mockReturnValue('GameLibSteamBridge-570')
    jest.mocked(resolveBridgeUpdateContext).mockResolvedValue({
      bridgeBottleName: 'b',
      steamappsDir: '/s',
      installdir: 'dota',
      branch: 'public',
      oldGidByDepot: new Map([['381450', '9']])
    })
    const res = await run(makeDeps({ anon: reader() }))
    expect(res?.manage).toBe('gamelib')
    expect(res?.entries[0]?.installed).toBe(true)
  })

  it('261122-rgi: an installed non-bridge copy is managed by Steam', async () => {
    gameInfo = {
      is_installed: true,
      install: { install_path: '/lib/steamapps/common/dota 2 beta' }
    }
    isNative = false
    jest.mocked(readAcfInstalledDepots).mockResolvedValue({
      buildid: '1',
      installedDepots: [{ depotId: '381450', manifest: '1', size: '1' }]
    })
    const res = await run(makeDeps({ anon: reader() }))
    expect(res?.manage).toBe('steam')
    expect(res?.entries[0]?.installed).toBe(true)
    expect(jest.mocked(readAcfInstalledDepots).mock.calls[0]?.[1]).toBe(
      '/lib/steamapps'
    )
  })

  it('261122-rgi: any thrown error answers null', async () => {
    const deps = makeDeps({})
    deps.anonymousClient.get = jest.fn(async () => {
      throw new Error('boom')
    })
    deps.steamUser.acquireOpenAuthenticated = jest.fn(async () => {
      throw new Error('boom')
    })
    expect(await run(deps)).toBeNull()
  })

  it('261122-rgi: the module never calls acquireAuthenticated', () => {
    const src = stripSourceComments(
      readFileSync(join(__dirname, '..', 'optInDlc.ts'), 'utf8')
    )
    expect(src).not.toMatch(/acquireAuthenticated\(/)
  })
})
