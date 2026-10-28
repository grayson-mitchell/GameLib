/**
 * Phase 56 plan 07: the Valve client step of DRM mode.
 *
 * These tests make no network access and use only the committed fixtures
 * (a live capture of Valve's steam_client_win64 manifest and tiny zips).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

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
  MAX_VALVE_MANIFEST_BYTES,
  MAX_VALVE_PACKAGE_BYTES,
  VALVE_CLIENT_BASES,
  VALVE_CLIENT_DLLS,
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
