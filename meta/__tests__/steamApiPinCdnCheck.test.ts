/**
 * Quick 261119-a23. Parses the REAL steam_api_pin.rs on every run (test:ci runs on every PR, so a
 * reshaped pin file turns CI red) and exercises the checker with injected fetches. The suite
 * replaces globalThis.fetch with a thrower so nothing here can reach Valve's CDN.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const { PIN_FILE, parsePin, checkPin } = require('../steamApiPinCdnCheck.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
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
