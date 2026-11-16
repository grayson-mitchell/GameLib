/**
 * No jsdom here, so the component is driven with a tiny hook harness: useState
 * keeps slots, useEffect runs after each render, and a state change re-renders.
 */
import 'frontend/testUtils/tauriWindow'
import type { ReactElement } from 'react'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'
import type { SteamUpdateInfo as Info } from 'common/types/steam'

const slots: unknown[] = []
let idx = 0
let dirty = false
let effects: Array<{ fn: () => unknown; deps: unknown[] | undefined }> = []

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useState: (init: unknown) => {
    const i = idx++
    if (!(i in slots)) slots[i] = init
    return [
      slots[i],
      (v: unknown) => {
        slots[i] = v
        dirty = true
      }
    ]
  },
  useEffect: (fn: () => unknown, deps?: unknown[]) => {
    idx++
    effects.push({ fn, deps })
  }
}))
let mockStatuses: Array<{ appName: string; status: string }> = []
jest.mock('frontend/state/libraryState', () => ({
  __esModule: true,
  default: (sel: (s: { libraryStatus: typeof mockStatuses }) => unknown) =>
    sel({ libraryStatus: mockStatuses })
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def: string, params: Record<string, string> = {}) => {
      let node: unknown = gamelib
      for (const p of key.split('.'))
        node = (node as Record<string, unknown>)?.[p]
      const text = typeof node === 'string' ? node : def
      return text.replace(/{{(\w+)}}/g, (_m, k: string) => params[k] ?? '')
    }
  })
}))

import SteamUpdateInfo from '../SteamUpdateInfo'

const GB = 1024 ** 3
const flush = () => new Promise((r) => setTimeout(r, 0))

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as ReactElement<{ children?: unknown }>
  return collectText(el.props?.children)
}

function render(appName = '1'): ReactElement | null {
  idx = 0
  effects = []
  return SteamUpdateInfo({ appName, hasUpdate: true }) as ReactElement | null
}

type Cleanup = (() => void) | undefined
let cleanups: Cleanup[] = []
afterEach(() => cleanups.forEach((c) => c?.()))

async function mount(appName = '1'): Promise<ReactElement | null> {
  slots.length = 0
  dirty = false
  render(appName)
  cleanups = effects.map((e) => e.fn() as Cleanup)
  for (let i = 0; i < 4; i++) await flush()
  dirty = false
  return render(appName)
}

const base: Info = {
  kind: 'bridge',
  state: 'stale',
  installedBuild: '1',
  targetBuild: '2',
  branch: 'public'
}
const estimate = {
  downloadBytes: 960495616,
  peakBytes: 13 * GB,
  oldManifestAvailable: true,
  isEstimate: true as const
}

let api: jest.Mock
function useInfo(initial: Info | null, afterCompute?: Info | 'reject') {
  api = jest.fn((_id: string, opts?: { computeSize: boolean }) => {
    if (opts?.computeSize && afterCompute === 'reject')
      return Promise.reject(new Error('boom'))
    return Promise.resolve(
      opts?.computeSize && afterCompute ? afterCompute : initial
    )
  })
  ;(window as unknown as { api: object }).api = { getSteamUpdateInfo: api }
}
const computeCalls = () =>
  api.mock.calls.filter((c) => (c[1] as { computeSize?: boolean })?.computeSize)

describe('SteamUpdateInfo (quick 261114-obu)', () => {
  beforeEach(() => {
    mockStatuses = []
  })

  it('auto-computes once, shows Checking while pending, then the download size only', async () => {
    let resolve: (v: Info) => void = () => undefined
    api = jest.fn((_id: string, opts?: { computeSize: boolean }) =>
      opts?.computeSize
        ? new Promise<Info>((r) => (resolve = r))
        : Promise.resolve(base)
    )
    ;(window as unknown as { api: object }).api = { getSteamUpdateInfo: api }
    slots.length = 0
    dirty = false
    render('a1')
    effects.forEach((e) => e.fn())
    await flush()
    await flush()
    dirty = false
    expect(collectText(render('a1'))).toBe(' · Checking update size…')
    expect(computeCalls()).toHaveLength(1)
    resolve({ ...base, estimate })
    await flush()
    await flush()
    const text = collectText(render('a1'))
    expect(text).toBe(' · Download about 916 MiB')
    expect(text).not.toContain('needs')
    expect(text).not.toContain('free during update')
  })

  it('uses a cached estimate without computeSize', async () => {
    useInfo({ ...base, estimate })
    const out = await mount('a2')
    expect(collectText(out)).toBe(' · Download about 916 MiB')
    expect(computeCalls()).toHaveLength(0)
  })

  it('uses the same label when the old manifest is gone', async () => {
    useInfo({ ...base, estimate: { ...estimate, oldManifestAvailable: false } })
    const text = collectText(await mount('a3'))
    expect(text).toBe(' · Download about 916 MiB')
  })

  it('renders nothing when compute returns sizeError without an estimate', async () => {
    useInfo(base, { ...base, sizeError: 'x' })
    expect(collectText(await mount('a4'))).toBe('')
    expect(computeCalls()).toHaveLength(1)
  })

  it('renders nothing when compute rejects', async () => {
    useInfo(base, 'reject')
    expect(collectText(await mount('a5'))).toBe('')
  })

  it('does not retry a failed app+targetBuild, but computes for a new targetBuild', async () => {
    useInfo(base, 'reject')
    await mount('a6')
    expect(computeCalls()).toHaveLength(1)
    await mount('a6')
    expect(computeCalls()).toHaveLength(1)
    useInfo({ ...base, targetBuild: '3' }, { ...base, targetBuild: '3' })
    await mount('a6')
    expect(computeCalls()).toHaveLength(1)
  })

  it('makes no state update after cleanup', async () => {
    let resolve: (v: Info) => void = () => undefined
    api = jest.fn((_id: string, opts?: { computeSize: boolean }) =>
      opts?.computeSize
        ? new Promise<Info>((r) => (resolve = r))
        : Promise.resolve(base)
    )
    ;(window as unknown as { api: object }).api = { getSteamUpdateInfo: api }
    slots.length = 0
    dirty = false
    render('a7')
    const cs = effects.map((e) => e.fn() as Cleanup)
    await flush()
    await flush()
    dirty = false
    cs.forEach((c) => c?.())
    resolve({ ...base, estimate })
    await flush()
    await flush()
    expect(dirty).toBe(false)
  })

  it.each([
    ['registered', { ...base, kind: 'registered' as const }],
    ['unknown', { ...base, state: 'unknown' as const }],
    ['current', { ...base, state: 'current' as const }],
    ['null', null]
  ])('renders nothing and never computes for %s', async (name, result) => {
    useInfo(result as Info | null)
    expect(collectText(await mount(`g-${name}`))).toBe('')
    expect(computeCalls()).toHaveLength(0)
  })

  it('refetches when the game status changes', () => {
    mockStatuses = [{ appName: 'a9', status: 'updating' }]
    useInfo(null)
    slots.length = 0
    render('a9')
    expect(effects[0]?.deps).toContain('updating')
    mockStatuses = []
    render('a9')
    expect(effects[0]?.deps).toContain(undefined)
  })
})
