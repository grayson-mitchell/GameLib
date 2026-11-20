/* eslint-disable @typescript-eslint/unbound-method */
/**
 * quick 261120-p2j: verifyInstalledDepotsRust, the bridge Verify job. An install-mode job pinned to
 * the ACF's InstalledDepots GIDs, finalized with the installed buildid, over a stubbed rustInvoke
 * leaf and a fake steam-user client (same layout as rustInstall.test.ts).
 */
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { initHeadless } from 'backend/logger'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
import { mockLeaseOk, mockOpenLease } from '../../__tests__/depotLeaseMocks'
import { verifyInstalledDepotsRust } from '../verify'
import { createStubRustDepot } from './fixtures/stubRustDepot'

const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn(),
  appRuntime: createTestAppRuntime()
}
const steamUser = createMockSteamUser()

const invokeMock = requestRustInvoke as unknown as jest.Mock
const APP_ID = '12345'
const INSTALLED_222 = '5555555555555555555'
const INSTALLED_333 = '7777777777777777777'
let steamapps: string
let client: ReturnType<typeof makeClient>

function makeClient() {
  return {
    // One owned package grants depot 222: the real selectAllDepots picks it from the app info.
    licenses: [{ package_id: 7 }] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn((ids: number[], packageIds: number[] = []) => {
      if (packageIds.length > 0) {
        return Promise.resolve({
          apps: {},
          packages: {
            7: { packageinfo: { appids: [Number(APP_ID)], depotids: [222] } }
          }
        })
      }
      const id = ids[0] ?? 0
      // The branch's CURRENT plan: depot 222 at a NEWER manifest, no depot 333.
      return Promise.resolve({
        apps: {
          [id]: {
            appinfo: {
              common: { name: 'Some Game' },
              depots: {
                '222': {
                  manifests: {
                    public: { gid: '9999999999999999999', size: 0 }
                  },
                  config: { oslist: 'windows' }
                },
                branches: { public: { buildid: 999 } }
              },
              config: { installdir: 'SomeGame' },
              extended: {}
            }
          }
        },
        packages: {}
      })
    }),
    getDepotDecryptionKey: jest.fn(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        cb(null, Buffer.alloc(32, d % 250))
    ),
    getRawManifest: jest.fn(),
    getContentServers: jest.fn(
      (_a: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com', type: 'CDN', weightedload: '5' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

const opts = (over: Record<string, unknown> = {}) => ({
  installRuntime: createTestSteamInstallRuntime(depotTransport),
  steamUser,
  config: createTestGlobalConfig(),
  targetSteamappsDir: steamapps,
  installdir: 'SomeGame',
  os: 'windows',
  installed: {
    buildid: '321',
    depots: [
      { depotId: '222', manifest: INSTALLED_222, size: '0' },
      { depotId: '333', manifest: INSTALLED_333, size: '0' }
    ]
  },
  ...over
})

// The real logger needs a writer; jest.setupContainment keeps the log file under a fake HOME.
beforeAll(() => initHeadless())

beforeEach(() => {
  jest.resetAllMocks()
  steamapps = mkdtempSync(join(tmpdir(), 'rustverify-'))
  client = makeClient()
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  jest
    .mocked(steamUser.getPersistedSteamId64)
    .mockReturnValue('76561198012345678')
  mockLeaseOk(steamUser)
  mockOpenLease(steamUser)
})

afterEach(() => {
  if (steamapps.startsWith(tmpdir()))
    rmSync(steamapps, { recursive: true, force: true })
})

describe('verifyInstalledDepotsRust (quick 261120-p2j)', () => {
  it('runs an install-mode job pinned to the installed GIDs and finalizes with the installed buildid', async () => {
    const runtime = createTestSteamInstallRuntime(depotTransport)
    const stub = createStubRustDepot({
      registry: runtime.depotJobs,
      events: [{ kind: 'planned', totalBytes: 100 } as never]
    })
    invokeMock.mockImplementation(stub.invoke)

    const out = await verifyInstalledDepotsRust(
      APP_ID,
      opts({ installRuntime: runtime })
    )

    expect(out.status).toBe('done')
    expect(stub.jobs).toHaveLength(1)
    const job = stub.jobs[0]
    expect(job?.mode).toBe('install')
    // Pinned: depot 222 keeps the INSTALLED manifest, not the branch's newer one.
    const by = new Map(job?.depots.map((d) => [d.depotId, d]))
    expect(by.get('222')?.manifestId).toBe(INSTALLED_222)
    expect(by.get('333')?.manifestId).toBe(INSTALLED_333)
    // No delta: nothing is an update from a prior manifest.
    expect(job?.depots.every((d) => !d.fromManifest)).toBe(true)
    expect(job?.retiredDepots ?? []).toEqual([])
    // finalize carries the installed buildid even though the plan says 999.
    expect(job?.finalize?.buildid).toBe('321')
    expect(job?.installRoot).toBe(join(steamapps, 'common', 'SomeGame'))
    // The installed depot missing from the plan got its key from fetchDepotKey.
    expect(client.getDepotDecryptionKey).toHaveBeenCalledWith(
      Number(APP_ID),
      333,
      expect.any(Function)
    )
    expect(by.get('333')?.key).toBe(Buffer.alloc(32, 333 % 250).toString('hex'))
    // The progress bridge was created in repair mode.
    expect(depotTransport.sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ appName: APP_ID, status: 'repairing' })
    )
  })

  it('quick 261120-tbr: an installed opt-in DLC depot is planned, so its key uses the base app', async () => {
    const OPT_IN_DLC = 313250
    const OPT_IN_DEPOT = 381450
    const OPT_IN_INSTALLED = '1111111111111111111'
    client.getProductInfo.mockImplementation(((
      ids: number[],
      packageIds: number[] = []
    ) => {
      if (packageIds.length > 0) {
        return Promise.resolve({
          apps: {},
          packages: {
            7: {
              packageinfo: {
                appids: [Number(APP_ID), OPT_IN_DLC],
                depotids: [222, OPT_IN_DEPOT]
              }
            }
          }
        })
      }
      if (ids[0] === OPT_IN_DLC) {
        return Promise.resolve({
          apps: {
            [OPT_IN_DLC]: { appinfo: { extended: { optionaldlc: '1' } } }
          },
          packages: {}
        })
      }
      return Promise.resolve({
        apps: {
          [Number(APP_ID)]: {
            appinfo: {
              common: { name: 'Some Game' },
              depots: {
                '222': {
                  manifests: {
                    public: { gid: '9999999999999999999', size: 0 }
                  },
                  config: { oslist: 'windows' }
                },
                [String(OPT_IN_DEPOT)]: {
                  dlcappid: String(OPT_IN_DLC),
                  manifests: {
                    public: { gid: '3731324120960268617', size: 0 }
                  },
                  config: {
                    oslist: 'windows',
                    osarch: '64',
                    optionaldlc: String(OPT_IN_DLC)
                  }
                },
                branches: { public: { buildid: 999 } }
              },
              config: { installdir: 'SomeGame' },
              extended: { listofdlc: String(OPT_IN_DLC) }
            }
          }
        },
        packages: {}
      })
    }) as never)
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)

    const out = await verifyInstalledDepotsRust(
      APP_ID,
      opts({
        installed: {
          buildid: '321',
          depots: [
            { depotId: '222', manifest: INSTALLED_222, size: '0' },
            {
              depotId: String(OPT_IN_DEPOT),
              manifest: OPT_IN_INSTALLED,
              size: '0',
              dlcAppId: String(OPT_IN_DLC)
            }
          ]
        }
      })
    )

    expect(out.status).toBe('done')
    const by = new Map(stub.jobs[0]?.depots.map((d) => [d.depotId, d]))
    expect(by.get(String(OPT_IN_DEPOT))?.manifestId).toBe(OPT_IN_INSTALLED)
    expect(client.getDepotDecryptionKey).toHaveBeenCalledWith(
      Number(APP_ID),
      OPT_IN_DEPOT,
      expect.any(Function)
    )
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalledWith(
      OPT_IN_DLC,
      OPT_IN_DEPOT,
      expect.any(Function)
    )
  })

  it('keeps a null buildid when the ACF recorded none', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    await verifyInstalledDepotsRust(
      APP_ID,
      opts({
        installed: {
          buildid: undefined,
          depots: [{ depotId: '222', manifest: INSTALLED_222, size: '0' }]
        }
      })
    )
    expect(stub.jobs[0]?.finalize?.buildid).toBeNull()
  })

  it('maps an unsafe installdir to an error outcome and runs no job', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    const out = await verifyInstalledDepotsRust(
      APP_ID,
      opts({ installdir: '../escape' })
    )
    expect(out.status).toBe('error')
    expect(stub.jobs).toHaveLength(0)
    expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
  })

  it('errors when no depots are installed', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    const out = await verifyInstalledDepotsRust(
      APP_ID,
      opts({ installed: { buildid: '321', depots: [] } })
    )
    expect(out.status).toBe('error')
    expect(stub.jobs).toHaveLength(0)
  })

  it('names the depot when its key cannot be fetched', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        d === 333
          ? cb(new Error('no key'), Buffer.alloc(0))
          : cb(null, Buffer.alloc(32, 1))
    )
    const out = await verifyInstalledDepotsRust(APP_ID, opts())
    expect(out.status).toBe('error')
    expect(out.error).toContain('333')
    expect(stub.jobs).toHaveLength(0)
  })

  it('releases the lease', async () => {
    const release = mockLeaseOk(steamUser)
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    await verifyInstalledDepotsRust(APP_ID, opts())
    expect(release).toHaveBeenCalledTimes(1)
  })
})
