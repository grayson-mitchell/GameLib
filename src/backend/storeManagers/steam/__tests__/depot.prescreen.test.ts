/**
 * D-51-06 (Phase 51 Plan 17): the cheap pre-install screen ROADMAP sub-decision 2 left open.
 * `prescreenBridgeDepots` runs before any routing/download decision and never throws -- every
 * failure mode (no CM connection, PICS error, an aborted signal) resolves 'unknown' so a screen
 * failure can never block an install.
 *
 * Since 73-19 the answer comes from a Rust manifest summary (D-02): Node does the CM half and
 * Rust reports the steam_api paths it matched, so these cases run against the stubbed rustInvoke
 * leaf (stubRustDepot). The path matching itself (basename, case-insensitive, backslashes, no
 * `.bak`) is the crate's `summarize_matches_steam_api_and_omits_files`; what stays here is the
 * TS policy: the CM inputs, the lease, the forced 'windows' selection and the classification of
 * the matches Rust returns.
 */
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn()
}
import {
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
} from 'common/types/sidecarTransport'
import { prescreenBridgeDepots } from '../depot'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk, mockLeaseRefused } from './depotLeaseMocks'
import { selectAllDepots } from '../depot/select'
import { createStubRustDepot } from '../depotRust/__tests__/fixtures/stubRustDepot'
import type { RustSummarizeRequest } from '../depotRust/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))

jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

const APP_ID = '12345'
const BASE_OPTS = {
  installRuntime: createTestSteamInstallRuntime(depotTransport),
  steamUser,
  config: createTestGlobalConfig(),
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'macos'
}

function makeFakeClient() {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(
      (
        _appId: number,
        depotId: number,
        cb: (err: Error | null, key: Buffer) => void
      ) => cb(null, Buffer.alloc(32, depotId % 250))
    ),
    getContentServers: jest.fn(
      (
        _appId: number,
        cb: (err: Error | null, servers: Array<{ Host?: string }>) => void
      ) => cb(null, [{ Host: 'cdn1.example.com' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

/** One owned depot per id, and a summary answering `matches` per depot. */
function setup(matchesByDepot: Record<string, string[]>) {
  const client = makeFakeClient()
  mockLeaseOk(steamUser)
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  jest.mocked(selectAllDepots).mockReturnValue(
    Object.keys(matchesByDepot).map((id) => ({
      id,
      manifest: `${id}0000000000000`,
      size: 0,
      ownerAppId: APP_ID
    }))
  )
  const stub = createStubRustDepot({
    summaryFor: (req: RustSummarizeRequest) => ({
      depots: req.depots.map((d) => ({
        depotId: d.depotId,
        fileCount: 3,
        totalBytes: 30,
        matches: matchesByDepot[d.depotId] ?? [],
        installscripts: []
      })),
      skippedDepots: []
    })
  })
  jest.mocked(requestRustInvoke).mockImplementation(stub.invoke)
  return { client, stub }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('prescreenBridgeDepots classifies the steam_api paths Rust matched', () => {
  it.each([
    [{ '111': ['bin/steam_api.dll'] }, 'x86'],
    [{ '111': ['system/steam_api64.dll'] }, 'x64'],
    [
      { '111': ['bin/steam_api.dll'], '222': ['bin64/steam_api64.dll'] },
      'both'
    ],
    [{ '111': [] }, 'none'],
    [{ '111': ['steam_api.dll'] }, 'x86']
  ])('%j -> %s', async (matches, want) => {
    const { stub } = setup(matches)
    expect(await prescreenBridgeDepots(APP_ID, BASE_OPTS)).toBe(want)
    const req = stub.calls.find(
      (c) => c.channel === RUST_DEPOT_MANIFEST_SUMMARY
    )?.args[0] as RustSummarizeRequest
    expect(req.patterns).toEqual(['steam_api.dll', 'steam_api64.dll'])
    expect(req.depots.map((d) => d.depotId).sort()).toEqual(
      Object.keys(matches).sort()
    )
  })

  it("resolves 'none' without asking Rust when no depot is selected", async () => {
    const { stub } = setup({})
    expect(await prescreenBridgeDepots(APP_ID, BASE_OPTS)).toBe('none')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('prescreenBridgeDepots — guarded, never throws', () => {
  it("resolves 'unknown' (never rejects) when there is no CM connection", async () => {
    mockLeaseRefused(steamUser)

    const result = await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(result).toBe('unknown')
    expect(requestRustInvoke).not.toHaveBeenCalled()
  })

  it("resolves 'unknown' (never rejects) when the abort signal is already fired", async () => {
    setup({ '111': ['bin/steam_api.dll'] })
    const controller = new AbortController()
    controller.abort()

    const result = await prescreenBridgeDepots(APP_ID, {
      ...BASE_OPTS,
      signal: controller.signal
    })

    expect(result).toBe('unknown')
    // Aborted before even the connection check.
    expect(jest.mocked(steamUser.acquireAuthenticated)).not.toHaveBeenCalled()
  })

  it("acquires its lease with reason 'prescreen' and still resolves a result", async () => {
    setup({})

    await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'prescreen' })
    )
  })

  it("forwards os 'windows' to the depot selection regardless of the caller's own opts.os", async () => {
    setup({})

    await prescreenBridgeDepots(APP_ID, { ...BASE_OPTS, os: 'macos' })

    expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ os: 'windows' }),
      APP_ID
    )
  })

  it('never runs a download job: the summary only, zero chunk bytes (T-51-38)', async () => {
    const { stub } = setup({ '111': ['steam_api64.dll'] })

    const result = await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(result).toBe('x64')
    expect(stub.jobs).toHaveLength(0)
    expect(stub.calls.map((c) => c.channel)).not.toContain(RUST_DEPOT_JOB_RUN)
  })
})
