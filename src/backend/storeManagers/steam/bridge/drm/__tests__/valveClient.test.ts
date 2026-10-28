/**
 * Phase 56 plan 07: the Valve client step of DRM mode.
 *
 * These tests make no network access and use only the committed fixtures
 * (a live capture of Valve's steam_client_win64 manifest and tiny zips).
 */

import { createHash } from 'crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  callAllAbortControllers,
  hasAbortController
} from 'backend/utils/aborthandler/aborthandler'

const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  logInfo: (...a: unknown[]) => mockLogInfo(...a),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import {
  MAX_VALVE_DLL_BYTES,
  MAX_VALVE_MANIFEST_BYTES,
  MAX_VALVE_PACKAGE_BYTES,
  VALVE_CLIENT_BASES,
  VALVE_CLIENT_DLLS,
  ValveFetchText,
  ValveFetchToFile,
  ValveUnzipRunner,
  ensureValveClient,
  isAllowedValveUrl,
  parseValveClientManifest,
  valveManifestUrl,
  valvePackageUrl
} from '../valveClient'

const FIXTURES = join(__dirname, 'fixtures')
const MANIFEST = readFileSync(join(FIXTURES, 'steam_client_win64.vdf'), 'utf8')

const HEX40 = '1f91da2609327de9658146b01307e89a13cc1ef8'

/** Replace one field of the bins_win64 node in the fixture manifest text. */
function withBinsField(field: string, value: string): string {
  const start = MANIFEST.indexOf('"bins_win64"')
  const re = new RegExp(`("${field}"\\s+)"[^"]*"`)
  const head = MANIFEST.slice(0, start)
  const tail = MANIFEST.slice(start).replace(re, `$1"${value}"`)
  return head + tail
}

describe('parseValveClientManifest', () => {
  it('selects the bins_win64 node of the live fixture', () => {
    const r = parseValveClientManifest(MANIFEST)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pkg.manifestVersion).toMatch(/^[0-9]+$/)
    expect(r.pkg.file).toMatch(/^bins_win64\.zip\.[0-9a-f]{40}$/)
    expect(r.pkg.sha2).toMatch(/^[0-9a-f]{64}$/)
    expect(Number.isInteger(r.pkg.size) && r.pkg.size > 0).toBe(true)
    expect(r.pkg.manifestVersion).toBe('1792618285')
    expect(r.pkg.file).toBe(`bins_win64.zip.${HEX40}`)
    expect(r.pkg.size).toBe(64309479)
  })

  it('never selects a different node when bins_win64 is absent', () => {
    const text = MANIFEST.replace('"bins_win64"', '"bins_codecs_win64"')
    const r = parseValveClientManifest(text)
    expect(r).toEqual({ ok: false, reason: 'no bins_win64 node' })
  })

  it('ignores a sibling node with a malformed file value', () => {
    const text = MANIFEST.replace(
      /("tenfoot_images_all"\s*\{\s*"file"\s+)"[^"]*"/,
      '$1"../../bad"'
    )
    expect(text).not.toBe(MANIFEST)
    expect(parseValveClientManifest(text).ok).toBe(true)
  })

  it.each([
    ['file uppercase', withBinsField('file', 'bins_win64.zip.ABC')],
    ['file traversal', withBinsField('file', `../bins_win64.zip.${HEX40}`)],
    ['sha2 63 chars', withBinsField('sha2', 'a'.repeat(63))],
    ['sha2 uppercase', withBinsField('sha2', 'A'.repeat(64))],
    ['sha2 coerced to a number', withBinsField('sha2', '1'.repeat(64))],
    ['size zero', withBinsField('size', '0')],
    [
      'size too big',
      withBinsField('size', String(MAX_VALVE_PACKAGE_BYTES + 1))
    ],
    ['size not a number', withBinsField('size', 'abc')],
    ['version not digits', MANIFEST.replace('"1792618285"', '"abc"')],
    [
      'version above safe integer',
      MANIFEST.replace('"1792618285"', '"99999999999999999999"')
    ],
    ['missing win64 root', MANIFEST.replace('"win64"', '"win32"')]
  ])('rejects %s', (_name, text) => {
    const r = parseValveClientManifest(text)
    expect(r.ok).toBe(false)
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'refuses a %s block key and does not pollute Object.prototype',
    (key) => {
      const text = MANIFEST.replace(
        '"bins_win64"',
        `"${key}"\n\t{\n\t\t"polluted"\t\t"yes"\n\t}\n\t"bins_win64"`
      )
      const r = parseValveClientManifest(text)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toContain(key)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    }
  )

  it('never throws on oversize, non-string or unbalanced input', () => {
    const big = 'x'.repeat(MAX_VALVE_MANIFEST_BYTES + 1)
    expect(parseValveClientManifest(big).ok).toBe(false)
    expect(parseValveClientManifest(42).ok).toBe(false)
    expect(parseValveClientManifest(undefined).ok).toBe(false)
    expect(parseValveClientManifest('"win64"\n{\n"bins_win64"\n{').ok).toBe(
      false
    )
  })
})

describe('isAllowedValveUrl', () => {
  it.each([
    'https://client-update.akamai.steamstatic.com/steam_client_win64',
    'https://steamcdn-a.akamaihd.net/client/steam_client_win64',
    `https://media.steampowered.com/client/bins_win64.zip.${HEX40}`
  ])('accepts %s', (url) => {
    expect(isAllowedValveUrl(url)).toBe(true)
  })

  it.each([
    'http://client-update.akamai.steamstatic.com/steam_client_win64',
    'https://steamcdn-a.akamaihd.net/other/x',
    'https://evil.example/steam_client_win64',
    'https://client-update.akamai.steamstatic.com.evil.example/x',
    'https://user@client-update.akamai.steamstatic.com/x',
    'https://client-update.akamai.steamstatic.com:8443/x',
    'https://client-update.akamai.steamstatic.com/x?y=1',
    'https://client-update.akamai.steamstatic.com/x#frag',
    'https://steamcdn-a.akamaihd.net/client/../x',
    'https://steamcdn-a.akamaihd.net/client/%2e%2e',
    'https://steamcdn-a.akamaihd.net/client/a/b',
    'https://client-update.akamai.steamstatic.com/a/b',
    'not a url',
    ''
  ])('rejects %s', (url) => {
    expect(isAllowedValveUrl(url)).toBe(false)
  })
})

describe('URL builders', () => {
  it('builds manifest URLs for every base', () => {
    for (const base of VALVE_CLIENT_BASES) {
      expect(valveManifestUrl(base)).toBe(`${base}/steam_client_win64`)
    }
  })

  it('builds package URLs and rejects a bad file', () => {
    const file = `bins_win64.zip.${HEX40}`
    for (const base of VALVE_CLIENT_BASES) {
      expect(valvePackageUrl(base, file)).toBe(`${base}/${file}`)
    }
    expect(valvePackageUrl(VALVE_CLIENT_BASES[0], '../x')).toBeNull()
    expect(
      valvePackageUrl(VALVE_CLIENT_BASES[0], 'bins_win64.zip.ZZ')
    ).toBeNull()
  })

  it('names exactly the three D-06 DLLs', () => {
    expect([...VALVE_CLIENT_DLLS]).toEqual([
      'steamclient64.dll',
      'tier0_s64.dll',
      'vstdlib_s64.dll'
    ])
  })
})

describe('valveClient.ts source discipline', () => {
  const src = readFileSync(join(__dirname, '..', 'valveClient.ts'), 'utf8')
  it('pins no sha, imports no launcher/utils/paths statically', () => {
    expect(src).not.toMatch(/[0-9a-f]{64}/)
    expect(src).not.toMatch(/from 'backend\/launcher'/)
    expect(src).not.toMatch(/from 'backend\/utils'/)
    expect(src).not.toMatch(/backend\/constants\/paths/)
  })
})

describe('ensureValveClient', () => {
  const haveUnzip = existsSync('/usr/bin/unzip')
  const itUnzip = haveUnzip ? it : it.skip
  let appFolder: string
  let valveRoot: string

  beforeEach(() => {
    appFolder = mkdtempSync(join(tmpdir(), 'valve-client-test-'))
    valveRoot = join(appFolder, 'steam-bridge', 'drm', 'valve-client')
    mockLogWarning.mockClear()
    mockLogInfo.mockClear()
  })
  afterEach(() => {
    callAllAbortControllers()
    rmSync(appFolder, { recursive: true, force: true })
  })

  const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

  /** Manifest text whose bins_win64 node describes the given zip. */
  function manifestFor(zipName: string): string {
    const zip = readFileSync(join(FIXTURES, zipName))
    return withBinsField('size', String(zip.length))
      .replace(
        /("bins_win64"[\s\S]*?"file"\s+)"[^"]*"/,
        `$1"bins_win64.zip.${'ab'.repeat(20)}"`
      )
      .replace(/("bins_win64"[\s\S]*?"sha2"\s+)"[^"]*"/, `$1"${sha256(zip)}"`)
  }

  function fakes(zipName: string) {
    const fetchText = jest.fn<
      ReturnType<ValveFetchText>,
      Parameters<ValveFetchText>
    >(() => Promise.resolve(manifestFor(zipName)))
    const fetchToFile = jest.fn<
      ReturnType<ValveFetchToFile>,
      Parameters<ValveFetchToFile>
    >(async (_url, dest) => {
      copyFileSync(join(FIXTURES, zipName), dest)
      return { bytes: readFileSync(dest).length }
    })
    return { fetchText, fetchToFile }
  }

  const rejecting = () => ({
    fetchText: jest.fn(async () => {
      throw new Error('offline')
    }) as unknown as ValveFetchText,
    fetchToFile: jest.fn(async () => {
      throw new Error('offline')
    }) as unknown as ValveFetchToFile
  })

  const noPartials = () => {
    const entries = existsSync(valveRoot) ? readdirSync(valveRoot) : []
    expect(entries).toEqual([])
  }

  itUnzip(
    'downloads, verifies, extracts and caches the three DLLs',
    async () => {
      const f = fakes('bins_win64.fixture.zip')
      const onFetchStart = jest.fn()
      const r = await ensureValveClient({ appFolder }, { ...f, onFetchStart })
      expect(r.status).toBe('ok')
      if (r.status !== 'ok') return
      expect(r.source).toBe('download')
      expect(r.manifestVersion).toBe('1792618285')
      expect(r.clientDir).toBe(join(valveRoot, '1792618285'))
      for (const [key, name] of [
        ['steamclient64', 'steamclient64.dll'],
        ['tier0', 'tier0_s64.dll'],
        ['vstdlib', 'vstdlib_s64.dll']
      ] as const) {
        expect(lstatSync(r.dlls[key]).isFile()).toBe(true)
        expect(readFileSync(r.dlls[key], 'utf8')).toBe(
          `gamelib valve-client fixture ${name}\n`
        )
      }
      expect(readdirSync(r.clientDir).sort()).toEqual([
        'steamclient64.dll',
        'tier0_s64.dll',
        'valve-client.json',
        'vstdlib_s64.dll'
      ])
      expect(onFetchStart).toHaveBeenCalledTimes(1)
      expect(f.fetchText.mock.calls[0][0]).toBe(
        'https://client-update.akamai.steamstatic.com/steam_client_win64'
      )
    }
  )

  itUnzip('reuses the cache offline with zero network calls', async () => {
    await ensureValveClient({ appFolder }, fakes('bins_win64.fixture.zip'))
    const off = rejecting()
    const onFetchStart = jest.fn()
    const r = await ensureValveClient({ appFolder }, { ...off, onFetchStart })
    expect(r.status === 'ok' && r.source).toBe('cache')
    expect(off.fetchText).not.toHaveBeenCalled()
    expect(off.fetchToFile).not.toHaveBeenCalled()
    expect(onFetchStart).not.toHaveBeenCalled()
  })

  itUnzip('re-downloads when a cached DLL was edited', async () => {
    const first = await ensureValveClient(
      { appFolder },
      fakes('bins_win64.fixture.zip')
    )
    if (first.status !== 'ok') throw new Error('setup failed')
    writeFileSync(first.dlls.tier0, 'tampered')
    const f = fakes('bins_win64.fixture.zip')
    const r = await ensureValveClient({ appFolder }, f)
    expect(r.status === 'ok' && r.source).toBe('download')
    expect(f.fetchToFile).toHaveBeenCalledTimes(1)
    if (r.status === 'ok') {
      expect(readFileSync(r.dlls.tier0, 'utf8')).toContain('tier0_s64.dll')
    }
  })

  it('rejects a package whose sha256 differs from the manifest', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchText.mockResolvedValue(
      manifestFor('bins_win64.fixture.zip').replace(
        /("bins_win64"[\s\S]*?"sha2"\s+)"[^"]*"/,
        `$1"${'a'.repeat(64)}"`
      )
    )
    const r = await ensureValveClient({ appFolder }, f)
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    if (r.status === 'error') expect(r.cause).toContain('sha256')
    noPartials()
  })

  it('rejects a package one byte short of the manifest size', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchToFile.mockImplementation(async (_u, dest) => {
      const b = readFileSync(join(FIXTURES, 'bins_win64.fixture.zip'))
      writeFileSync(dest, b.subarray(0, b.length - 1))
      return { bytes: b.length - 1 }
    })
    const r = await ensureValveClient({ appFolder }, f)
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    if (r.status === 'error') expect(r.cause).toContain('size')
    noPartials()
  })

  itUnzip('never writes hostile or nested zip entries', async () => {
    const r = await ensureValveClient(
      { appFolder },
      fakes('bins_win64.hostile.fixture.zip')
    )
    expect(r.status).toBe('ok')
    expect(existsSync(join(appFolder, 'escape.txt'))).toBe(false)
    expect(existsSync(join(valveRoot, 'escape.txt'))).toBe(false)
    expect(existsSync(join(tmpdir(), 'escape.txt'))).toBe(false)
    if (r.status === 'ok') {
      expect(readFileSync(r.dlls.steamclient64, 'utf8')).toBe(
        'gamelib valve-client fixture steamclient64.dll\n'
      )
    }
  })

  itUnzip('rejects a symlink entry', async () => {
    const r = await ensureValveClient(
      { appFolder },
      fakes('bins_win64.symlink.fixture.zip')
    )
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    if (r.status === 'error') expect(r.cause).toContain('regular file')
    noPartials()
  })

  itUnzip('rejects a package missing one DLL', async () => {
    const r = await ensureValveClient(
      { appFolder },
      fakes('bins_win64.missing.fixture.zip')
    )
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    noPartials()
  })

  it('refuses an oversize listed entry before extracting', async () => {
    const f = fakes('bins_win64.fixture.zip')
    const calls: string[][] = []
    const runUnzip: ValveUnzipRunner = async (args) => {
      calls.push([...args])
      return {
        code: 0,
        timedOut: false,
        stderr: '',
        stdout: [
          `${MAX_VALVE_DLL_BYTES + 1}  10-21-2026 00:00   steamclient64.dll`,
          '43  10-21-2026 00:00   tier0_s64.dll',
          '45  10-21-2026 00:00   vstdlib_s64.dll'
        ].join('\n')
      }
    }
    const r = await ensureValveClient({ appFolder }, { ...f, runUnzip })
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('-l')
    noPartials()
  })

  it('falls back to the second base for the manifest and package', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchText.mockRejectedValueOnce(new Error('first base down'))
    await ensureValveClient({ appFolder }, f)
    expect(f.fetchText.mock.calls[1][0]).toBe(
      'https://steamcdn-a.akamaihd.net/client/steam_client_win64'
    )
    expect(f.fetchToFile.mock.calls[0][0]).toMatch(
      /^https:\/\/steamcdn-a\.akamaihd\.net\/client\/bins_win64\.zip\./
    )
  })

  it('reports valve-fetch with the last error when every base fails', async () => {
    const off = rejecting()
    ;(off.fetchText as jest.Mock).mockRejectedValue(new Error('last-boom'))
    const r = await ensureValveClient({ appFolder }, off)
    expect(r).toMatchObject({ status: 'error', step: 'valve-fetch' })
    if (r.status === 'error') expect(r.cause).toContain('last-boom')
  })

  it('rejects a malformed manifest without fetching the package', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchText.mockResolvedValue('"win64"\n{ "version" "1" }')
    const r = await ensureValveClient({ appFolder }, f)
    expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
    expect(f.fetchToFile).not.toHaveBeenCalled()
  })

  it('times out a hanging package fetch and unregisters controllers', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchToFile.mockImplementation(() => new Promise(() => undefined))
    const r = await ensureValveClient(
      { appFolder },
      { ...f, packageTimeoutMs: 30 }
    )
    expect(r).toMatchObject({ status: 'error', step: 'valve-fetch' })
    if (r.status === 'error') expect(r.cause).toContain('timed out')
    expect(hasAbortController('drm-valve-client:manifest')).toBe(false)
    expect(hasAbortController('drm-valve-client:package')).toBe(false)
    noPartials()
  })

  it('ends a hanging fetch when callAllAbortControllers() runs', async () => {
    const f = fakes('bins_win64.fixture.zip')
    f.fetchToFile.mockImplementation(() => new Promise(() => undefined))
    const pending = ensureValveClient({ appFolder }, f)
    while (!hasAbortController('drm-valve-client:package')) {
      await new Promise((r) => setTimeout(r, 5))
    }
    callAllAbortControllers()
    const r = await pending
    expect(r).toMatchObject({ status: 'error', step: 'valve-fetch' })
    if (r.status === 'error') expect(r.cause).toContain('aborted')
    expect(hasAbortController('drm-valve-client:manifest')).toBe(false)
    expect(hasAbortController('drm-valve-client:package')).toBe(false)
  })

  itUnzip('shares one run between concurrent calls', async () => {
    const f = fakes('bins_win64.fixture.zip')
    const [a, b] = await Promise.all([
      ensureValveClient({ appFolder }, f),
      ensureValveClient({ appFolder }, f)
    ])
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(f.fetchText).toHaveBeenCalledTimes(1)
  })

  it('refuses a relative app folder without fetching', async () => {
    const f = fakes('bins_win64.fixture.zip')
    const r = await ensureValveClient({ appFolder: 'relative/dir' }, f)
    expect(r).toEqual({
      status: 'error',
      step: 'valve-fetch',
      cause: 'invalid app folder'
    })
    expect(f.fetchText).not.toHaveBeenCalled()
  })

  it('refuses a symlinked valve-client root', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'valve-client-elsewhere-'))
    try {
      mkdirSync(join(appFolder, 'steam-bridge', 'drm'), { recursive: true })
      symlinkSync(elsewhere, valveRoot)
      const f = fakes('bins_win64.fixture.zip')
      const r = await ensureValveClient({ appFolder }, f)
      expect(r).toMatchObject({ status: 'error', step: 'valve-verify' })
      expect(readdirSync(elsewhere)).toEqual([])
      expect(f.fetchText).not.toHaveBeenCalled()
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('does nothing at import time', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('../valveClient')
    })
    expect(hasAbortController('drm-valve-client:manifest')).toBe(false)
    expect(hasAbortController('drm-valve-client:package')).toBe(false)
  })
})
