/**
 * Quick 261026-lif: restoreBridgeSteamApiOriginals. Real fs under
 * mkdtempSync(tmpdir()), an injected `downloadSelected`, no network, no spawn.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

import { restoreBridgeSteamApiOriginals } from '../originalRestore'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  builtBridgeShimPath: '/nonexistent/steam_api.dll',
  builtBridgeShim64Path: '/nonexistent/steam_api64.dll'
}))

jest.mock('../importScan', () => ({ scanSteamApiImports: jest.fn() }))

jest.mock('../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge',
  sanitizeBottleName: (n: string) => n,
  getBottleDir: jest.fn(),
  resolveBridgeBottleName: (a: string) => `GameLibSteamBridge-${a}`
}))

// The real depot.ts pulls in the whole steam-user stack; the restore helper
// only needs these three pure helpers from it.
jest.mock('../../depot', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash: ch } = require('node:crypto') as typeof import('crypto')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync: rf } = require('node:fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('path')
  return {
    downloadSelectedDepotFiles: jest.fn(),
    normalizeDepotPath: (p: string) =>
      p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase(),
    resolveContainedPath: (root: string, f: string) =>
      path.resolve(root, f.replace(/\\/g, '/')),
    sha1File: (p: string) =>
      Promise.resolve(ch('sha1').update(rf(p)).digest('hex'))
  }
})

const SHIM = Buffer.from('MZ....GameLibSteamBridgeShim....')
const ORIG = Buffer.from('MZ-original-steam-api-bytes')
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex')

type Dl = NonNullable<
  NonNullable<
    Parameters<typeof restoreBridgeSteamApiOriginals>[1]
  >['downloadSelected']
>
type DlOpts = Parameters<Dl>[1]

let bottle: string
let root: string
const INSTALLDIR = 'Game'

beforeEach(() => {
  bottle = mkdtempSync(join(tmpdir(), 'lif-restore-'))
  root = join(bottle, 'drive_c', 'steamapps', 'common', INSTALLDIR)
  mkdirSync(join(root, 'bin'), { recursive: true })
})
afterEach(() => {
  if (bottle.startsWith(tmpdir()))
    rmSync(bottle, { recursive: true, force: true })
})

const put = (rel: string, b: Buffer) => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, b)
  return p
}

/** Fake download: writes `files[rel]` bytes into staging for each selected path. */
function fakeDownload(
  files: Record<string, Buffer>,
  over: { status?: 'error' | 'cancelled'; sha1Override?: string } = {}
) {
  return jest.fn((_appId: string, o: DlOpts) => {
    if (over.status) {
      return Promise.resolve({ status: over.status, files: [], error: 'boom' })
    }
    const out: Array<{ filename: string; size: number; sha1: string }> = []
    for (const [rel, bytes] of Object.entries(files)) {
      if (!o.select(rel.toLowerCase())) continue
      const target = join(o.targetSteamappsDir, 'common', o.installdir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, bytes)
      out.push({
        filename: rel.replace(/\//g, '\\'),
        size: bytes.length,
        sha1: over.sha1Override ?? sha1(bytes)
      })
    }
    return Promise.resolve({ status: 'done' as const, files: out })
  })
}

const run = (dl: jest.Mock, extra: Partial<{ signal: AbortSignal }> = {}) =>
  restoreBridgeSteamApiOriginals(
    {
      appId: '123',
      bottleDir: bottle,
      installRoot: root,
      installdir: INSTALLDIR,
      ...extra
    },
    { downloadSelected: dl as unknown as Dl }
  )

describe('restoreBridgeSteamApiOriginals', () => {
  it('writes .gamelib-orig from sha1-verified bytes, leaves the shim, removes staging', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    const dl = fakeDownload({ 'bin/steam_api64.dll': ORIG })
    const r = await run(dl)
    expect(r.status).toBe('ok')
    expect(r.outcomes).toEqual([{ path: shim, outcome: 'restored' }])
    expect(readFileSync(shim + '.gamelib-orig')).toEqual(ORIG)
    expect(readFileSync(shim)).toEqual(SHIM)
    expect(existsSync(join(bottle, '.gamelib-restore', '123'))).toBe(false)
  })

  it('reports already-backed-up and never downloads', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    writeFileSync(shim + '.gamelib-orig', ORIG)
    const dl = fakeDownload({})
    const r = await run(dl)
    expect(r.outcomes).toEqual([{ path: shim, outcome: 'already-backed-up' }])
    expect(dl).not.toHaveBeenCalled()
  })

  it('reports original-in-place for a non-shim dll and writes nothing', async () => {
    const dll = put('bin/steam_api64.dll', ORIG)
    const dl = fakeDownload({})
    const r = await run(dl)
    expect(r.outcomes).toEqual([{ path: dll, outcome: 'original-in-place' }])
    expect(existsSync(dll + '.gamelib-orig')).toBe(false)
    expect(dl).not.toHaveBeenCalled()
  })

  it('reports not-in-depot when the depot lacks the path', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    const r = await run(fakeDownload({}))
    expect(r.outcomes).toEqual([{ path: shim, outcome: 'not-in-depot' }])
    expect(r.status).toBe('ok')
    expect(existsSync(shim + '.gamelib-orig')).toBe(false)
  })

  it('refuses downloaded bytes that carry shim markers', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    const r = await run(fakeDownload({ 'bin/steam_api64.dll': SHIM }))
    expect(r.outcomes[0].outcome).toBe('refused')
    expect(r.status).toBe('partial')
    expect(existsSync(shim + '.gamelib-orig')).toBe(false)
  })

  it('refuses bytes whose sha1 differs from the manifest', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    const r = await run(
      fakeDownload({ 'bin/steam_api64.dll': ORIG }, { sha1Override: 'ab' })
    )
    expect(r.outcomes[0].outcome).toBe('refused')
    expect(existsSync(shim + '.gamelib-orig')).toBe(false)
  })

  it('reports backup-refused for a symlinked backup path and leaves its target', async () => {
    const shim = put('bin/steam_api64.dll', SHIM)
    const victim = join(bottle, 'victim.bin')
    writeFileSync(victim, 'keep')
    symlinkSync(victim, shim + '.gamelib-orig')
    const dl = fakeDownload({ 'bin/steam_api64.dll': ORIG })
    const r = await run(dl)
    expect(r.outcomes[0].outcome).toBe('backup-refused')
    expect(readFileSync(victim, 'utf8')).toBe('keep')
    expect(dl).not.toHaveBeenCalled()
  })

  it('reports download-failed with the error text and removes staging', async () => {
    put('bin/steam_api64.dll', SHIM)
    const r = await run(fakeDownload({}, { status: 'error' }))
    expect(r.status).toBe('error')
    expect(r.outcomes[0]).toMatchObject({
      outcome: 'download-failed',
      detail: 'boom'
    })
    expect(existsSync(join(bottle, '.gamelib-restore', '123'))).toBe(false)
  })

  it('makes exactly one download call selecting both x86 and x64 shims', async () => {
    const a = put('bin/steam_api.dll', SHIM)
    const b = put('bin/steam_api64.dll', SHIM)
    const dl = fakeDownload({
      'bin/steam_api.dll': Buffer.from('x86-orig'),
      'bin/steam_api64.dll': ORIG
    })
    const r = await run(dl)
    expect(dl).toHaveBeenCalledTimes(1)
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['restored', 'restored'])
    expect(existsSync(a + '.gamelib-orig')).toBe(true)
    expect(existsSync(b + '.gamelib-orig')).toBe(true)
  })

  it('returns error with no outcomes for a non-numeric appId or an escaping root', async () => {
    const dl = fakeDownload({})
    const bad = await restoreBridgeSteamApiOriginals(
      { appId: '1/..', bottleDir: bottle, installRoot: root, installdir: 'G' },
      { downloadSelected: dl as unknown as Dl }
    )
    expect(bad).toEqual({ status: 'error', outcomes: [] })
    const out = await restoreBridgeSteamApiOriginals(
      { appId: '1', bottleDir: bottle, installRoot: tmpdir(), installdir: 'G' },
      { downloadSelected: dl as unknown as Dl }
    )
    expect(out).toEqual({ status: 'error', outcomes: [] })
  })
})
