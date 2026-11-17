/**
 * Phase 81 D-01..D-04: AdoptionNote. No jsdom here, so the component is driven with a tiny hook harness
 * (the SteamUpdateInfo pattern): useState keeps slots, useEffect runs after each render, and a
 * state change re-renders.
 */
import 'frontend/testUtils/tauriWindow'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement } from 'react'
import type { GameInfo } from 'common/types'

const slots: unknown[] = []
let idx = 0
let effects: Array<{ fn: () => unknown; deps: unknown[] | undefined }> = []
let mockContext: { is: Record<string, boolean>; statusContext?: string } = {
  is: {}
}

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => mockContext,
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
jest.mock('../../../GameContext', () => ({ __esModule: true, default: {} }))
jest.mock('../AdoptionNote.scss', () => ({}))
jest.mock('react-i18next', () => {
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  return faithfulReactI18next()
})

import AdoptionNote from '../AdoptionNote'
import * as adoptionStore from 'frontend/state/SteamAdoptionStatus'

// The real push store holds the state; its hook is spied (not jest.mock'ed) so this harness, which
// never renders, can read it through the selector without React's external-store hook.
const realStore = adoptionStore.useSteamAdoptionStatus
beforeEach(() => {
  const spy = jest
    .spyOn(adoptionStore, 'useSteamAdoptionStatus')
    .mockImplementation(((
      sel: (s: ReturnType<typeof realStore.getState>) => unknown
    ) => sel(realStore.getState())) as never)
  Object.assign(spy, { getState: realStore.getState })
})
afterAll(() => jest.restoreAllMocks())

type MockPush = {
  appName: string
  pending: boolean
  steamSignedIn: boolean | null
  seq: number
}
/** Seeds the real push store (replacing every entry), as the backend push handler would. */
const setPushed = (byApp: Record<string, MockPush>) =>
  realStore.setState({ byApp })

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
    setPushed({})
    mockStatuses = []
    mockContext = { is: {} }
  })

  test.each([null, true])(
    'an installed Steam game with a pending record (signed-in %p) reads the restart-once note',
    async (signedIn) => {
      useStatus({ pending: true, steamSignedIn: signedIn })
      const out = await mount(steam())
      expect(collectText(out)).toContain(
        'Steam will restart once when you press Play.'
      )
      expect(collectText(out)).not.toContain('Sign in to Steam')
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

// --- Task 2: the two actions ---------------------------------------------------------------

interface Btn {
  className: string
  disabled?: boolean
  onClick: () => void
}
function findButton(node: unknown): ReactElement<Btn> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findButton(n)
      if (found) return found
    }
    return null
  }
  const el = node as ReactElement<Btn & { children?: unknown }>
  if (el.type === 'button') return el as ReactElement<Btn>
  return findButton(el.props?.children)
}
const labelOf = (out: ReactElement | null) => collectText(findButton(out))

let actions: { restart: jest.Mock; open: jest.Mock }
function useBackend(status: unknown, restartAnswer = 'relaunched') {
  actions = {
    restart: jest.fn(() => Promise.resolve(restartAnswer)),
    open: jest.fn(() => Promise.resolve())
  }
  statusApi = jest.fn(() => Promise.resolve(status))
  ;(window as unknown as { api: object }).api = {
    steamAdoptionStatus: statusApi,
    steamAdoptionRestartNow: actions.restart,
    steamAdoptionOpenSteam: actions.open
  }
}

describe('AdoptionNote actions (D-02, D-03, D-04)', () => {
  beforeEach(() => {
    setPushed({})
    mockStatuses = []
    mockContext = { is: {} }
  })

  test('pending: the note and a secondary "Restart Steam now" button that calls the backend once with the appId', async () => {
    useBackend({ pending: true, steamSignedIn: true })
    const out = await mount(steam())
    expect(collectText(out)).toContain('Steam will restart once')
    const button = findButton(out)!
    expect(labelOf(out)).toBe('Restart Steam now')
    expect(button.props.className).toContain('button')
    expect(button.props.className).toContain('is-secondary')
    expect(button.props.className).toContain('steamAdoptionNote__action')
    button.props.onClick()
    await flush()
    expect(actions.restart).toHaveBeenCalledTimes(1)
    expect(actions.restart).toHaveBeenCalledWith('112100')
    expect(actions.open).not.toHaveBeenCalled()
  })

  test('signed out: "Sign in to Steam to finish setup" and "Open Steam" that brings Steam forward', async () => {
    useBackend({ pending: true, steamSignedIn: false })
    const out = await mount(steam())
    expect(collectText(out)).toContain('Sign in to Steam to finish setup')
    expect(collectText(out)).not.toContain('will restart once')
    expect(labelOf(out)).toBe('Open Steam')
    findButton(out)!.props.onClick()
    await flush()
    expect(actions.open).toHaveBeenCalledWith('112100')
    expect(actions.restart).not.toHaveBeenCalled()
  })

  test('the action re-queries the status when it resolves, so a relaunch removes the block', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    expect(statusApi).toHaveBeenCalledTimes(1)
    statusApi.mockImplementation(() =>
      Promise.resolve({ pending: false, steamSignedIn: null })
    )
    findButton(out)!.props.onClick()
    for (let i = 0; i < 3; i++) await flush()
    expect(statusApi).toHaveBeenCalledTimes(2)
    expect(render(steam())).toBeNull()
  })

  test('the button is disabled while the game is launching or playing', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    mockContext = { is: { launching: true } }
    expect(findButton(await mount(steam()))!.props.disabled).toBe(true)
    mockContext = { is: { playing: true } }
    expect(findButton(render(steam()))!.props.disabled).toBe(true)
    mockContext = { is: {} }
    expect(findButton(render(steam()))!.props.disabled).toBeFalsy()
  })

  test('a click while the call is in flight does nothing more (the button is disabled meanwhile)', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    let finish: (v: string) => void = () => undefined
    const out = await mount(steam())
    actions.restart.mockImplementation(
      () => new Promise<string>((r) => (finish = r))
    )
    findButton(out)!.props.onClick()
    expect(findButton(render(steam()))!.props.disabled).toBe(true)
    finish('relaunched')
    for (let i = 0; i < 3; i++) await flush()
    expect(findButton(render(steam()))!.props.disabled).toBeFalsy()
  })

  test('the 1026 edge (installing, steam-waiting-for-restart): the action without the note', async () => {
    useBackend({ pending: false, steamSignedIn: null })
    mockContext = {
      is: { installing: true },
      statusContext: 'steam-waiting-for-restart'
    }
    const out = await mount(steam({ is_installed: false }))
    expect(labelOf(out)).toBe('Restart Steam now')
    expect(collectText(out).trim()).toBe('Restart Steam now')
    expect(collectText(out)).not.toContain('will restart once')
  })

  test('installing without the waiting context shows nothing', async () => {
    useBackend({ pending: false, steamSignedIn: null })
    mockContext = { is: { installing: true } }
    expect(await mount(steam({ is_installed: false }))).toBeNull()
  })

  test('a rejected action still re-reads the status and never throws (D-04: no prompt either way)', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    actions.restart.mockImplementation(() => Promise.reject(new Error('x')))
    findButton(out)!.props.onClick()
    for (let i = 0; i < 3; i++) await flush()
    expect(statusApi).toHaveBeenCalledTimes(2)
  })
})

describe('AdoptionNote live push (D-07, D-03)', () => {
  beforeEach(() => {
    setPushed({})
    mockStatuses = []
    mockContext = { is: {} }
  })
  const push = (over: Partial<MockPush>) => {
    setPushed({
      '112100': {
        appName: '112100',
        pending: true,
        steamSignedIn: null,
        seq: 1,
        ...over
      }
    })
  }

  test('a push with pending false removes the block without a re-query or reload (D-07)', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    expect(collectText(out)).toContain('Steam will restart once')
    push({ pending: false, seq: 2 })
    expect(render(steam())).toBeNull()
    expect(statusApi).toHaveBeenCalledTimes(1)
  })

  test('a push with steamSignedIn false switches to the sign-in text and Open Steam; a later true switches back (D-03)', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    expect(labelOf(out)).toBe('Restart Steam now')
    push({ steamSignedIn: false, seq: 2 })
    const signedOut = render(steam())
    expect(collectText(signedOut)).toContain('Sign in to Steam to finish setup')
    expect(labelOf(signedOut)).toBe('Open Steam')
    push({ steamSignedIn: true, seq: 3 })
    const back = render(steam())
    expect(collectText(back)).toContain('Steam will restart once')
    expect(labelOf(back)).toBe('Restart Steam now')
  })

  test('Play stays available throughout: the signed-out block never disables the button for a push', async () => {
    useBackend({ pending: true, steamSignedIn: null })
    await mount(steam())
    push({ steamSignedIn: false, seq: 2 })
    expect(findButton(render(steam()))!.props.disabled).toBeFalsy()
  })

  test('a push shows the note even when the query answered not pending (newer seq wins)', async () => {
    useBackend({ pending: false, steamSignedIn: null })
    expect(await mount(steam())).toBeNull()
    push({ pending: true, seq: 1 })
    expect(collectText(render(steam()))).toContain('Steam will restart once')
  })

  test('a push no newer than the one the store held when the query was issued loses to the query answer', async () => {
    push({ pending: false, seq: 7 })
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    expect(collectText(out)).toContain('Steam will restart once')
  })

  test("another game's push is ignored", async () => {
    useBackend({ pending: true, steamSignedIn: null })
    const out = await mount(steam())
    setPushed({
      '999': { appName: '999', pending: false, steamSignedIn: null, seq: 9 }
    })
    expect(collectText(render(steam()))).toBe(collectText(out))
  })
})

describe('AdoptionNote source (D-04, theme tokens)', () => {
  const read = (name: string) =>
    readFileSync(join(__dirname, '..', name), 'utf8')

  test('neither action asks for confirmation', () => {
    expect(read('AdoptionNote.tsx')).not.toMatch(/confirm\(|showDialog/)
  })

  test('the stylesheet uses theme tokens only: no literal colours', () => {
    const scss = read('AdoptionNote.scss')
    expect(scss).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(/)
    expect(scss).toContain('var(--text-secondary)')
    expect(scss).toContain('var(--secondary-font-family)')
    expect(scss).toContain('var(--space-xs)')
  })
})
