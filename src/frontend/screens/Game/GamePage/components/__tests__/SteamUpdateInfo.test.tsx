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
jest.mock('../SteamUpdateInfo.scss', () => ({}))
jest.mock('@mui/icons-material', () => ({ CloudDownload: () => null }))
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

function findButton(
  node: unknown
): ReactElement<{ onClick: () => void }> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findButton(n)
      if (f) return f
    }
    return null
  }
  const el = node as ReactElement<{ children?: unknown; onClick: () => void }>
  if (el.type === 'button') return el
  return findButton(el.props?.children)
}

function render(): ReactElement | null {
  idx = 0
  effects = []
  const out = SteamUpdateInfo({
    appName: '1',
    hasUpdate: true
  }) as ReactElement | null
  return out
}

async function mount(): Promise<ReactElement | null> {
  slots.length = 0
  let out = render()
  for (const e of effects) e.fn()
  for (let i = 0; i < 3; i++) {
    await flush()
    if (dirty) {
      dirty = false
      out = render()
    }
  }
  return out
}

const base: Info = {
  kind: 'bridge',
  state: 'stale',
  installedBuild: '1',
  branch: 'public'
}
const estimate = {
  downloadBytes: 960495616,
  peakBytes: 13 * GB,
  oldManifestAvailable: true,
  isEstimate: true as const
}

let api: jest.Mock
function useInfo(initial: Info | null, afterClick?: Info) {
  api = jest.fn((_id: string, opts?: { computeSize: boolean }) =>
    Promise.resolve(opts?.computeSize && afterClick ? afterClick : initial)
  )
  ;(window as unknown as { api: object }).api = { getSteamUpdateInfo: api }
}

describe('SteamUpdateInfo', () => {
  it('mounts without computeSize and offers Show update size, then shows the sizes line', async () => {
    useInfo(base, { ...base, estimate })
    let out = await mount()
    expect(api).toHaveBeenCalledWith('1')
    expect(api.mock.calls[0]).toHaveLength(1)
    const btn = findButton(out)
    expect(collectText(out)).toContain('Show update size')
    btn?.props.onClick()
    for (let i = 0; i < 3; i++) {
      await flush()
      if (dirty) {
        dirty = false
        out = render()
      }
    }
    expect(api).toHaveBeenCalledWith('1', { computeSize: true })
    expect(collectText(out)).toContain(
      'Download up to 916 MiB · needs 13 GiB free during update (estimate)'
    )
  })

  it('renders the sizes immediately when the estimate is present', async () => {
    useInfo({ ...base, estimate })
    const out = await mount()
    expect(collectText(out)).toContain('Download up to 916 MiB')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('renders the fallback sentence when the old manifest is gone', async () => {
    useInfo({ ...base, estimate: { ...estimate, oldManifestAvailable: false } })
    expect(collectText(await mount())).toContain(
      "can't get the previous build's file list"
    )
  })

  it('says Steam will update a registered game, with no size button', async () => {
    useInfo({ ...base, kind: 'registered' })
    const out = await mount()
    expect(collectText(out)).toContain('Steam will update this game.')
    expect(findButton(out)).toBeNull()
  })

  it('shows the unknown text and no button', async () => {
    useInfo({ ...base, state: 'unknown' })
    const out = await mount()
    expect(collectText(out)).toContain('Update status unknown')
    expect(findButton(out)).toBeNull()
  })

  it('renders nothing for a current game', async () => {
    useInfo({ ...base, state: 'current' })
    expect(await mount()).toBeNull()
  })
})
