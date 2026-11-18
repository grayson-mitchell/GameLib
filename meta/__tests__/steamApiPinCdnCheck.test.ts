/**
 * Quick 261119-a23. Parses the REAL steam_api_pin.rs on every run (test:ci runs on every PR, so a
 * reshaped pin file turns CI red) and exercises the checker with injected fetches. The suite
 * replaces globalThis.fetch with a thrower so nothing here can reach Valve's CDN.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PIN_FILE,
  parsePin,
  checkPin,
  formatReport
} = require('../steamApiPinCdnCheck.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'steamApiPinCdnCheck.cjs')
const real = readFileSync(join(REPO_ROOT, PIN_FILE), 'utf8')

const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = (() => {
    throw new Error('network in a unit test')
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

interface Call {
  url: string
  init: RequestInit
}

const fakeFetch = (
  answer: (url: string) => { status: number; headers?: Record<string, string> }
) => {
  const calls: Call[] = []
  const impl = (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const a = answer(url)
    return Promise.resolve({
      status: a.status,
      headers: new Headers(a.headers ?? {})
    })
  }
  return { impl, calls }
}

describe('parsePin over the real steam_api_pin.rs', () => {
  const pin = parsePin(real)

  test('reads package, size and hosts', () => {
    expect(pin.package).toEqual(expect.any(String))
    expect(pin.package.length).toBeGreaterThan(0)
    expect(pin.package).not.toMatch(/^[0-9a-f]{64}$/)
    expect(Number.isSafeInteger(pin.packageSize)).toBe(true)
    expect(pin.packageSize).toBeGreaterThan(0)
    expect(pin.package.endsWith(`_${pin.packageSize}`)).toBe(true)
    expect(pin.hosts.length).toBeGreaterThan(0)
    for (const h of pin.hosts) {
      expect(h).not.toContain('://')
      expect(h).not.toContain('/')
    }
  })
})

describe('checkPin', () => {
  const pin = parsePin(real)

  test('every host ok: one HEAD per host, in order, no redirect following', async () => {
    const f = fakeFetch(() => ({
      status: 200,
      headers: { 'content-length': String(pin.packageSize) }
    }))
    const r = await checkPin(pin, { fetchImpl: f.impl })
    expect(r.ok).toBe(true)
    expect(r.results.map((x: { verdict: string }) => x.verdict)).toEqual(
      pin.hosts.map(() => 'ok')
    )
    expect(f.calls.map((c) => c.url)).toEqual(
      pin.hosts.map((h: string) => `https://${h}/${pin.package}`)
    )
    for (const c of f.calls) {
      expect(c.init.method).toBe('HEAD')
      expect(c.init.redirect).toBe('manual')
      expect((c.init.headers as Record<string, string>)['user-agent']).toBe(
        'GameLib'
      )
      expect(c.init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  test('wrong content-length on every host fails with length-<n>', async () => {
    const f = fakeFetch(() => ({
      status: 200,
      headers: { 'content-length': '7' }
    }))
    const r = await checkPin(pin, { fetchImpl: f.impl })
    expect(r.ok).toBe(false)
    expect(r.results.map((x: { verdict: string }) => x.verdict)).toEqual(
      pin.hosts.map(() => 'length-7')
    )
  })
})

// A negative case built from the real file must never silently become a no-op.
const mutate = (source: string, from: string | RegExp, to: string): string => {
  const hit =
    typeof from === 'string' ? source.includes(from) : from.test(source)
  if (!hit) throw new Error(`mutate: ${String(from)} not found in real file`)
  return source.replace(from, to)
}

describe('parsePin rejects malformed input, naming the field', () => {
  const pin = parsePin(real)
  const pkgLine = `package: "${pin.package}",`
  const sizeLine = /package_size: [0-9_]+,/
  const hostsBlock = /pub const CDN_HOSTS: \[&str; 2\] = \[[\s\S]*?\];/

  const cases: Array<[string, () => string, RegExp]> = [
    [
      'PIN block declaration renamed',
      () =>
        mutate(
          real,
          'pub const PIN: SteamApiPin',
          'pub const PINX: SteamApiPin'
        ),
      /PIN:/
    ],
    [
      'package line removed while package_sha256 remains',
      () => mutate(real, pkgLine, ''),
      /PIN\.package: missing/
    ],
    [
      'package_size line removed',
      () => mutate(real, sizeLine, ''),
      /PIN\.package_size: missing/
    ],
    [
      'package_size a const name',
      () => mutate(real, sizeLine, 'package_size: SOME_CONST,'),
      /PIN\.package_size: not a literal/
    ],
    [
      'second package line',
      () => mutate(real, pkgLine, `${pkgLine}\n    ${pkgLine}`),
      /PIN\.package: duplicate/
    ],
    [
      'CDN_HOSTS declaration renamed',
      () => mutate(real, 'pub const CDN_HOSTS', 'pub const CDN_HOSTZ'),
      /CDN_HOSTS/
    ],
    [
      'one host removed, declared length stays 2',
      () =>
        mutate(
          real,
          hostsBlock,
          'pub const CDN_HOSTS: [&str; 2] = [\n    "a.example.com",\n];'
        ),
      /CDN_HOSTS: declared length 2/
    ],
    [
      'a host carrying a scheme and a path',
      () =>
        mutate(
          real,
          hostsBlock,
          'pub const CDN_HOSTS: [&str; 2] = [\n    "https://a.example.com/x",\n    "b.example.com",\n];'
        ),
      /CDN_HOSTS: entry is not a bare lowercase DNS name/
    ],
    [
      'a non-literal token in the host list',
      () =>
        mutate(
          real,
          hostsBlock,
          'pub const CDN_HOSTS: [&str; 2] = [\n    "a.example.com",\n    SOME_HOST,\n    "b.example.com",\n];'
        ),
      /CDN_HOSTS: non-literal/
    ],
    [
      'package suffix disagrees with package_size',
      () => mutate(real, pkgLine, `package: "${pin.package}9",`),
      /PIN\.package: name does not end with/
    ],
    [
      'package containing a slash',
      () => mutate(real, pkgLine, `package: "x/${pin.package}",`),
      /PIN\.package: contains characters/
    ]
  ]

  test.each(cases)('%s', (_name, build, message) => {
    expect(() => parsePin(build())).toThrow(message)
  })

  test('mutate itself throws when its target is absent', () => {
    expect(() => mutate(real, 'no such text anywhere', 'x')).toThrow(
      /not found/
    )
  })

  test('a commented-out package line inside the PIN block is ignored', () => {
    const src = mutate(real, pkgLine, `// package: "old",\n    ${pkgLine}`)
    expect(parsePin(src)).toEqual(pin)
  })

  test('a one-line host list parses', () => {
    const src = mutate(
      real,
      hostsBlock,
      'pub const CDN_HOSTS: [&str; 2] = ["a.example.com", "b.example.com"];'
    )
    expect(parsePin(src).hosts).toEqual(['a.example.com', 'b.example.com'])
  })
})

describe('checkPin verdict matrix', () => {
  const pin = {
    package: 'pkg_10',
    packageSize: 10,
    hosts: ['a.test', 'b.test']
  }
  const ok = { status: 200, headers: { 'content-length': '10' } }

  test('first host 404, second ok passes', async () => {
    const f = fakeFetch((url) =>
      url.includes('a.test') ? { status: 404 } : ok
    )
    const r = await checkPin(pin, { fetchImpl: f.impl })
    expect(r.ok).toBe(true)
    expect(r.results.map((x: { verdict: string }) => x.verdict)).toEqual([
      'http-404',
      'ok'
    ])
  })

  test('a 301 is a verdict and is not followed', async () => {
    const f = fakeFetch(() => ({
      status: 301,
      headers: { location: 'https://elsewhere.test/x' }
    }))
    const r = await checkPin(pin, { fetchImpl: f.impl })
    expect(r.ok).toBe(false)
    expect(r.results[0].verdict).toBe('http-301')
    expect(f.calls).toHaveLength(2)
  })

  test('200 without content-length', async () => {
    const f = fakeFetch(() => ({ status: 200 }))
    const r = await checkPin(pin, { fetchImpl: f.impl })
    expect(r.results[0].verdict).toBe('no-content-length')
  })

  test('a TimeoutError', async () => {
    const e = new Error('slow')
    e.name = 'TimeoutError'
    const r = await checkPin(pin, { fetchImpl: () => Promise.reject(e) })
    expect(r.results[0].verdict).toBe('error-TimeoutError')
  })

  test('a cause.code', async () => {
    const e = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
    const r = await checkPin(pin, { fetchImpl: () => Promise.reject(e) })
    expect(r.results[0].verdict).toBe('error-ENOTFOUND')
  })
})

describe('formatReport', () => {
  const pin = {
    package: 'pkg_10',
    packageSize: 10,
    hosts: ['a.test', 'b.test']
  }
  const res = (verdicts: string[]) => ({
    ok: verdicts.includes('ok'),
    results: verdicts.map((verdict, i) => ({
      host: pin.hosts[i],
      url: '',
      status: null,
      contentLength: null,
      verdict
    }))
  })

  test('pass with one failing host warns and exits 0', () => {
    const r = formatReport(pin, res(['http-404', 'ok']))
    expect(r.exitCode).toBe(0)
    expect(r.lines.filter((l: string) => l.startsWith('::warning::'))).toEqual([
      '::warning::a.test http-404'
    ])
  })

  test('answered over HTTP but none passed: re-pin remedy', () => {
    const r = formatReport(pin, res(['http-404', 'length-3']))
    expect(r.exitCode).toBe(1)
    const err = r.lines.find((l: string) => l.startsWith('::error::'))
    expect(err).toContain('pnpm gen-vtables')
    expect(err).toContain('native/steam-bridge/helper/gamelib_steam_api_pin.h')
    expect(err).toContain('steam_api_pin.rs')
    expect(err).toContain('host the dylib')
  })

  test('every host error-*: unreachable, re-run, no re-pin advice', () => {
    const r = formatReport(pin, res(['error-TimeoutError', 'error-ENOTFOUND']))
    expect(r.exitCode).toBe(1)
    const err = r.lines.find((l: string) => l.startsWith('::error::'))
    expect(err).toContain('unreachable')
    expect(err).toContain('re-run')
    expect(err).not.toContain('pnpm gen-vtables')
  })
})

describe('CLI exit-2 arms (before any request)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-pincdn-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const run = (args: string[]) => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-pincdn-' })
    try {
      return spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: REPO_ROOT,
        env: profile.childEnv(process.env),
        encoding: 'utf8',
        timeout: 30000
      })
    } finally {
      profile.dispose()
    }
  }

  test('malformed pin file', () => {
    const f = join(dir, 'pin.rs')
    writeFileSync(
      f,
      mutate(real, 'pub const PIN: SteamApiPin', 'pub const X: SteamApiPin')
    )
    const r = run(['--pin-file', f])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('::error::')
    expect(r.stdout).not.toContain('https://')
  })

  test('nonexistent pin file', () => {
    expect(run(['--pin-file', join(dir, 'nope.rs')]).status).toBe(2)
  })

  test('unknown flag', () => {
    expect(run(['--bogus']).status).toBe(2)
  })
})
