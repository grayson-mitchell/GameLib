/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Quick 261026-lif: downloadSelectedDepotFiles. No real network: a fake steam-user client for
 * the CM half and, since 73-19, the stubbed rustInvoke leaf (stubRustDepot) for the one
 * select_files job. Which manifest entries a path list selects (normalised paths, never a
 * directory or symlink) is the crate's `select_files_writes_only_selected`; what stays here is
 * the TS policy around the job.
 */
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import { downloadSelectedDepotFiles } from '../depot'
import { SteamUser } from '../user'
import { mockLeaseOk, mockLeaseRefused } from './depotLeaseMocks'
import { selectAllDepots } from '../depot/select'
import { at } from './fixtures/indexed'
import {
  createStubRustDepot,
  type StubRustDepotOptions
} from '../depotRust/__tests__/fixtures/stubRustDepot'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))
jest.mock('../user')
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

const APP_ID = '12345'
const SHA = 'ab'.repeat(20)
const PICKED = [{ filename: 'bin\\steam_api64.dll', size: 7, sha1: SHA }]

let staging: string

function makeClient() {
  return {
    licenses: [],
    steamID: { getSteamID64: jest.fn().mockReturnValue('1') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        cb(null, Buffer.alloc(32, d % 250))
    ),
    getContentServers: jest.fn(
      (_a: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

let client: ReturnType<typeof makeClient>

function rust(options: StubRustDepotOptions = {}) {
  const stub = createStubRustDepot({
    outcome: { acf: null, files: PICKED },
    ...options
  })
  jest.mocked(requestRustInvoke).mockImplementation(stub.invoke)
  return stub
}

const call = (
  over: Partial<Parameters<typeof downloadSelectedDepotFiles>[1]> = {}
) =>
  downloadSelectedDepotFiles(APP_ID, {
    config: createTestGlobalConfig(),
    targetSteamappsDir: staging,
    installdir: 'Game',
    os: 'windows',
    selectPaths: ['bin/steam_api64.dll'],
    ...over
  })

beforeEach(() => {
  jest.clearAllMocks()
  staging = mkdtempSync(join(tmpdir(), 'lif-sel-'))
  client = makeClient()
  mockLeaseOk()
  jest.mocked(SteamUser.getClient).mockReturnValue(client as never)
  jest
    .mocked(selectAllDepots)
    .mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID }
    ])
})

afterEach(() => {
  if (staging.startsWith(tmpdir()))
    rmSync(staging, { recursive: true, force: true })
})

describe('downloadSelectedDepotFiles', () => {
  it('runs one select_files job over the path list and returns the files Rust fetched', async () => {
    const stub = rust()
    const r = await call()
    expect(stub.jobs).toHaveLength(1)
    const job = at(stub.jobs, 0)
    expect(job.mode).toBe('select_files')
    expect(job.selectPaths).toEqual(['bin/steam_api64.dll'])
    expect(job.installRoot).toBe(resolve(staging, 'common', 'Game'))
    expect(job.depots.map((d) => d.depotId)).toEqual(['111'])
    expect(r).toEqual({ status: 'done', files: PICKED })
  })

  it('never finalizes, so no ACF is written', async () => {
    const stub = rust()
    await call()
    expect(at(stub.jobs, 0).finalize).toBeNull()
    expect(readdirSync(staging).filter((f) => f.endsWith('.acf'))).toEqual([])
    expect(existsSync(join(staging, 'appmanifest_12345.acf'))).toBe(false)
  })

  it('returns done with no files and runs no job on an empty path list', async () => {
    const stub = rust()
    const r = await call({ selectPaths: [] })
    expect(r).toEqual({ status: 'done', files: [] })
    expect(stub.jobs).toHaveLength(0)
  })

  it('resolves error (never throws) when the CM is not connected', async () => {
    const stub = rust()
    mockLeaseRefused()
    const r = await call()
    expect(r.status).toBe('error')
    expect(r.error).toBeTruthy()
    expect(stub.jobs).toHaveLength(0)
  })

  it('Phase 54: holds an original-restore lease across the job and releases it once', async () => {
    const release = mockLeaseOk()
    let releasedDuringJob: boolean | undefined
    rust({
      onRun: () => void (releasedDuringJob = release.mock.calls.length > 0)
    })
    const r = await call()
    expect(r.status).toBe('done')
    expect(releasedDuringJob).toBe(false)
    expect(jest.mocked(SteamUser.acquireAuthenticated)).toHaveBeenCalledWith({
      reason: 'original-restore',
      guidedAction: 'install',
      appName: '12345'
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('Phase 54: a rejected job still releases the lease and resolves error', async () => {
    const release = mockLeaseOk()
    jest
      .mocked(requestRustInvoke)
      .mockImplementation(() => Promise.reject(new Error('boom')))
    const r = await call()
    expect(r.status).toBe('error')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('resolves cancelled for an aborted signal', async () => {
    const stub = rust()
    const c = new AbortController()
    c.abort()
    const r = await call({ signal: c.signal })
    expect(r.status).toBe('cancelled')
    expect(stub.jobs).toHaveLength(0)
  })

  it('resolves error with the classified message when the job reports failures', async () => {
    rust({
      outcome: {
        acf: null,
        files: PICKED,
        status: 'error',
        failures: [
          {
            file: 'bin\\steam_api64.dll',
            kind: 'sha1_mismatch',
            message: 'sha1 mismatch',
            code: null,
            eresult: null,
            httpStatus: null,
            scope: null,
            msSinceProgress: null
          }
        ]
      }
    })
    const r = await call()
    expect(r.status).toBe('error')
    expect(r.error).toBeTruthy()
    expect(r.files).toEqual(PICKED)
  })
})
