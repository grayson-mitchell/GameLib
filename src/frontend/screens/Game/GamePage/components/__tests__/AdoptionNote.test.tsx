/**
 * Phase 81 D-01: AdoptionNote. No jsdom here, so the component is driven with a tiny hook harness
 * (the SteamUpdateInfo pattern): useState keeps slots, useEffect runs after each render, and a
 * state change re-renders.
 */
import 'frontend/testUtils/tauriWindow'
import type { ReactElement } from 'react'
import type { GameInfo } from 'common/types'

const slots: unknown[] = []
let idx = 0
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
jest.mock('react-i18next', () => {
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  return faithfulReactI18next()
})

import AdoptionNote from '../AdoptionNote'

const flush = () => new Promise((r) => setTimeout(r, 0))

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as ReactElement<{ children?: unknown }>
  return collectText(el.props?.children)
}

const steam = (over: Partial<GameInfo> = {}) =>
  ({
    app_name: '112100',
    runner: 'steam',
    is_installed: true,
    ...over
  }) as unknown as GameInfo

function render(game: GameInfo): ReactElement | null {
  idx = 0
  effects = []
  return AdoptionNote({ gameInfo: game }) as ReactElement | null
}

let cleanups: Array<(() => void) | undefined> = []
afterEach(() => cleanups.forEach((c) => c?.()))

async function mount(game: GameInfo): Promise<ReactElement | null> {
  slots.length = 0
  render(game)
  cleanups = effects.map((e) => e.fn() as (() => void) | undefined)
  for (let i = 0; i < 4; i++) await flush()
  return render(game)
}

let statusApi: jest.Mock
function useStatus(answer: unknown) {
  statusApi = jest.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  )
  ;(window as unknown as { api: object }).api = {
    steamAdoptionStatus: statusApi
  }
}

describe('AdoptionNote (D-01)', () => {
  beforeEach(() => {
    mockStatuses = []
  })

  test.each([null, true])(
    'an installed Steam game with a pending record (signed-in %p) reads the restart-once note',
    async (signedIn) => {
      useStatus({ pending: true, steamSignedIn: signedIn })
      const out = await mount(steam())
      expect(collectText(out)).toBe(
        'Steam will restart once when you press Play.'
      )
      expect((out?.props as { role: string }).role).toBe('status')
      expect(statusApi).toHaveBeenCalledWith('112100')
    }
  )

  test('renders nothing for a non-Steam runner and never asks the backend', async () => {
    useStatus({ pending: true, steamSignedIn: null })
    const out = await mount(steam({ runner: 'legendary' } as Partial<GameInfo>))
    expect(out).toBeNull()
    expect(statusApi).not.toHaveBeenCalled()
  })

  test('renders nothing when nothing is pending', async () => {
    useStatus({ pending: false, steamSignedIn: null })
    expect(await mount(steam())).toBeNull()
  })

  test('renders nothing when the game is not installed', async () => {
    useStatus({ pending: true, steamSignedIn: null })
    expect(await mount(steam({ is_installed: false }))).toBeNull()
  })

  test('renders nothing when the query rejects', async () => {
    useStatus(new Error('sidecar down'))
    expect(await mount(steam())).toBeNull()
  })

  test("re-queries when the game's libraryStatus changes (the effect depends on it)", async () => {
    useStatus({ pending: true, steamSignedIn: null })
    mockStatuses = [{ appName: '112100', status: 'installing' }]
    await mount(steam())
    const first = effects[0]?.deps
    mockStatuses = [{ appName: '112100', status: 'done' }]
    render(steam())
    expect(effects[0]?.deps).toEqual(['112100', true, 'done'])
    expect(first).toEqual(['112100', true, 'installing'])
  })

  test('every hook runs before an early return (same slot and effect count with and without a result)', async () => {
    useStatus({ pending: false, steamSignedIn: null })
    await mount(steam())
    const hidden = effects.length
    useStatus({ pending: true, steamSignedIn: null })
    await mount(steam())
    expect(effects.length).toBe(hidden)
    expect(idx).toBeGreaterThan(0)
  })
})
