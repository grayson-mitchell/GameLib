/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Quick 261026-lif: downloadSelectedDepotFiles. No real network: a fake
 * steam-user client, a mocked raw-manifest parser and an injected
 * `downloadFiles` seam. Mock preamble copied from depot.prescreen.test.ts.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { downloadSelectedDepotFiles, type DepotPlan } from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'

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
jest.mock('../user')
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('../depot/crypto', () => ({ decryptFilename: jest.fn() }))
jest.mock('../depot/fileAttributes', () => ({ applyDepotFileFlags: jest.fn() }))
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: () => false
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parser = require('steam-user/components/content_manifest.js') as {
  parse: jest.Mock
}

const APP_ID = '12345'
const SHA = 'ab'.repeat(20)

type DownloadFn = NonNullable<
  Parameters<typeof downloadSelectedDepotFiles>[1]['downloadFiles']
>

let staging: string
let files: unknown[]

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
        cb(null, Buffer.from(`key-${d}`))
    ),
    getRawManifest: jest.fn(
      (
        _a: number,
        d: number,
        _g: string,
        _b: string,
        cb: (e: Error | null, r: Buffer) => void
      ) => cb(null, Buffer.from(`raw-${d}`))
    ),
    getContentServers: jest.fn(
      (_a: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com' }])
    )
  }
}

const ok = {
  outcome: 'completed' as const,
  failures: [],
  allFilesVerifiedThisRun: true,
  allModesApplied: true
}

const call = (
  downloadFiles: jest.Mock,
  over: Partial<Parameters<typeof downloadSelectedDepotFiles>[1]> = {}
) =>
  downloadSelectedDepotFiles(APP_ID, {
    targetSteamappsDir: staging,
    installdir: 'Game',
    os: 'windows',
    select: (p) => p === 'bin/steam_api64.dll',
    downloadFiles: downloadFiles as unknown as DownloadFn,
    ...over
  })

beforeEach(() => {
  staging = mkdtempSync(join(tmpdir(), 'lif-sel-'))
  files = [
    {
      filename: 'bin\\Game.exe',
      size: 10,
      sha_content: SHA,
      flags: 0,
      chunks: []
    },
    {
      filename: 'bin\\steam_api64.dll',
      size: 7,
      sha_content: SHA.toUpperCase(),
      flags: 0,
      chunks: []
    },
    {
      filename: 'bin\\sub\\steam_api.dll',
      size: 5,
      sha_content: SHA,
      flags: 0,
      chunks: []
    }
  ]
  const client = makeClient()
  jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
  jest.mocked(SteamUser.getClient).mockReturnValue(client as never)
  jest
    .mocked(selectAllDepots)
    .mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID }
    ])
  jest.mocked(decryptFilename).mockImplementation((raw: unknown) => String(raw))
  parser.parse.mockImplementation(() => ({ files }))
})

afterEach(() => {
  if (staging.startsWith(tmpdir()))
    rmSync(staging, { recursive: true, force: true })
})

describe('downloadSelectedDepotFiles', () => {
  it('downloads only the selected file and sizes the plan to it', async () => {
    const dl = jest.fn().mockResolvedValue(ok)
    const r = await call(dl)
    expect(dl).toHaveBeenCalledTimes(1)
    const plan = dl.mock.calls[0][0] as DepotPlan
    expect(plan.depots).toHaveLength(1)
    expect(plan.depots[0].files.map((f) => f.filename)).toEqual([
      'bin\\steam_api64.dll'
    ])
    expect(plan.totalBytes).toBe(7)
    expect(r).toEqual({
      status: 'done',
      files: [{ filename: 'bin\\steam_api64.dll', size: 7, sha1: SHA }]
    })
  })

  it('never selects directory or symlink entries and writes no ACF', async () => {
    files = [
      { filename: 'bin\\steam_api64.dll', size: 0, flags: 64, chunks: [] },
      { filename: 'bin\\steam_api64.dll', size: 0, flags: 512, chunks: [] }
    ]
    const dl = jest.fn().mockResolvedValue(ok)
    const r = await call(dl)
    expect(r).toEqual({ status: 'done', files: [] })
    expect(dl).not.toHaveBeenCalled()
    expect(readdirSync(staging).filter((f) => f.endsWith('.acf'))).toEqual([])
    expect(existsSync(join(staging, 'appmanifest_12345.acf'))).toBe(false)
  })

  it('returns done with no files and skips the seam on zero matches', async () => {
    const dl = jest.fn()
    const r = await call(dl, { select: () => false })
    expect(r).toEqual({ status: 'done', files: [] })
    expect(dl).not.toHaveBeenCalled()
  })

  it('resolves error (never throws) when the CM is not connected', async () => {
    jest.mocked(SteamUser.ensureConnected).mockResolvedValue(false)
    const r = await call(jest.fn())
    expect(r.status).toBe('error')
    expect(r.error).toBeTruthy()
  })

  it('resolves cancelled for an aborted signal', async () => {
    const c = new AbortController()
    c.abort()
    const r = await call(jest.fn(), { signal: c.signal })
    expect(r.status).toBe('cancelled')
  })

  it('resolves error with the failures listed when the seam reports failures', async () => {
    const failures = [{ file: 'bin\\steam_api64.dll', error: 'sha mismatch' }]
    const dl = jest.fn().mockResolvedValue({ ...ok, failures })
    const r = await call(dl)
    expect(r.status).toBe('error')
    expect(r.failures).toEqual(failures)
  })
})
