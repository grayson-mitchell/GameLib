/**
 * Unit tests for licensedDemos.ts (quick 261031-i0q): licensed Demo apps that
 * getUserOwnedApps never returns (spike 052).
 */

import {
  selectLicensedDemos,
  fetchLicensedDemos,
  LICENSED_DEMOS_TIMEOUT_MS,
  LicensedDemosPicsClient
} from '../licensedDemos'
import { logWarning } from 'backend/logger'
import { at } from './fixtures/indexed'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

const pkg = (appids: unknown) => ({ packageinfo: { appids } })
const app = (type?: string, name?: string) => ({
  appinfo: { common: { type, name } }
})

describe('selectLicensedDemos', () => {
  test('adds a licensed-not-owned Demo (Schedule I: Free Sample)', () => {
    const out = selectLicensedDemos(
      new Set(),
      [1136752],
      { 1136752: pkg([3205720]) },
      { 3205720: app('Demo', 'Schedule I: Free Sample') }
    )
    expect(out).toEqual([
      { appid: 3205720, name: 'Schedule I: Free Sample', playtime_forever: 0 }
    ])
    expect(out[0]).not.toHaveProperty('rtime_last_played')
  })

  test('does not duplicate an already-owned demo', () => {
    const out = selectLicensedDemos(
      new Set([3205720]),
      [1136752],
      { 1136752: pkg([3205720]) },
      { 3205720: app('Demo', 'x') }
    )
    expect(out).toEqual([])
  })

  test('excludes non-demo types, matches demo case-insensitively', () => {
    const types = ['DLC', 'Tool', 'Config', 'Game', 'Music', 'Application']
    const ids = types.map((_, i) => 100 + i)
    const apps: Record<number, { appinfo?: unknown }> = {}
    types.forEach((t, i) => (apps[100 + i] = app(t, t)))
    apps[200] = app(undefined, 'untyped')
    apps[201] = app('demo', 'lower')
    apps[202] = app('DEMO', 'upper')
    const out = selectLicensedDemos(
      new Set(),
      [1],
      { 1: pkg([...ids, 200, 201, 202]) },
      apps
    )
    expect(out.map((o) => o.appid)).toEqual([201, 202])
  })

  test('missing PICS data adds nothing and does not throw', () => {
    const cases: Array<[unknown, unknown]> = [
      [{}, {}],
      [{ 1: {} }, {}],
      [{ 1: { packageinfo: {} } }, {}],
      [{ 1: pkg([5]) }, {}],
      [{ 1: pkg([5]) }, { 5: {} }],
      [{ 1: pkg([5]) }, { 5: { appinfo: {} } }],
      [undefined, undefined]
    ]
    for (const [p, a] of cases) {
      expect(
        selectLicensedDemos(
          new Set(),
          [1],
          p as Record<number, { packageinfo?: unknown }>,
          a as Record<number, { appinfo?: unknown }>
        )
      ).toEqual([])
    }
  })

  test('object-map appids work and shared appids are returned once', () => {
    const out = selectLicensedDemos(
      new Set(),
      [1, 2],
      { 1: pkg({ '0': 7 }), 2: pkg([7]) },
      { 7: app('Demo', 'Seven') }
    )
    expect(out).toHaveLength(1)
    expect(at(out, 0).appid).toBe(7)
  })

  test('missing name falls back to the appid string', () => {
    const out = selectLicensedDemos(
      new Set(),
      [1],
      { 1: pkg([9]) },
      { 9: app('Demo') }
    )
    expect(at(out, 0).name).toBe('9')
  })
})

function fakeClient(
  overrides: Partial<LicensedDemosPicsClient> = {}
): LicensedDemosPicsClient & { getProductInfo: jest.Mock } {
  return {
    licenses: [{ package_id: 1136752 }],
    getProductInfo: jest.fn(async (apps: number[], packages: number[]) =>
      packages.length
        ? { packages: { 1136752: pkg([3205720]) } }
        : {
            apps: Object.fromEntries(apps.map((a) => [a, app('Demo', `n${a}`)]))
          }
    ),
    ...overrides
  } as LicensedDemosPicsClient & { getProductInfo: jest.Mock }
}

describe('fetchLicensedDemos', () => {
  test('returns demos via packages then apps', async () => {
    const c = fakeClient()
    const out = await fetchLicensedDemos(c, [])
    expect(out.map((o) => o.appid)).toEqual([3205720])
    expect(c.getProductInfo).toHaveBeenCalledTimes(2)
  })

  test.each([[null], [undefined], [[]]])(
    'licenses=%p resolves [] without PICS',
    async (licenses) => {
      const c = fakeClient({
        licenses: licenses as LicensedDemosPicsClient['licenses']
      })
      expect(await fetchLicensedDemos(c, [])).toEqual([])
      expect(c.getProductInfo).not.toHaveBeenCalled()
      if (licenses == null) expect(logWarning).toHaveBeenCalled()
    }
  )

  test('package lookup rejection resolves [] and warns', async () => {
    const c = fakeClient({
      getProductInfo: jest.fn().mockRejectedValue(new Error('boom'))
    })
    expect(await fetchLicensedDemos(c, [])).toEqual([])
    expect(logWarning).toHaveBeenCalled()
  })

  test('one failed app batch yields no partial set', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => 1000 + i)
    let appCalls = 0
    const c = fakeClient({
      getProductInfo: jest.fn(async (apps: number[], packages: number[]) => {
        if (packages.length) return { packages: { 1136752: pkg(ids) } }
        appCalls++
        if (appCalls === 2) throw new Error('batch fail')
        return {
          apps: Object.fromEntries(apps.map((a) => [a, app('Demo', 'd')]))
        }
      })
    })
    expect(await fetchLicensedDemos(c, [])).toEqual([])
    expect(logWarning).toHaveBeenCalled()
  })

  test('only licensed-not-owned ids, batches of at most 200', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => 1000 + i)
    const owned = [1000, 1001]
    const c = fakeClient({
      getProductInfo: jest.fn(async (apps: number[], packages: number[]) =>
        packages.length
          ? { packages: { 1136752: pkg([...ids, ...owned]) } }
          : { apps: {} }
      )
    })
    await fetchLicensedDemos(c, owned)
    const appCalls = c.getProductInfo.mock.calls.filter(
      (call) => (call[1] as number[]).length === 0
    )
    expect(appCalls).toHaveLength(3)
    const requested = appCalls.flatMap((call) => call[0] as number[])
    expect(requested).toHaveLength(448)
    expect(requested).not.toContain(1000)
    appCalls.forEach((call) =>
      expect((call[0] as number[]).length).toBeLessThanOrEqual(200)
    )
  })

  test('no app lookup when the remainder is empty', async () => {
    const c = fakeClient()
    await fetchLicensedDemos(c, [3205720])
    expect(c.getProductInfo).toHaveBeenCalledTimes(1)
  })

  test('a lookup that never settles resolves [] after the timeout', async () => {
    jest.useFakeTimers()
    try {
      const c = fakeClient({
        getProductInfo: jest.fn(() => new Promise<never>(() => undefined))
      })
      const p = fetchLicensedDemos(c, [])
      await jest.advanceTimersByTimeAsync(LICENSED_DEMOS_TIMEOUT_MS)
      expect(await p).toEqual([])
      expect(logWarning).toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})
