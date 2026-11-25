/**
 * @jest-environment jsdom
 */
/**
 * quick 261125-r0j: the game page resolves its own game when it is opened
 * without router state (todo 2026-11-25-game-page-throws-when-opened-without-
 * router-state). GamePageGate is rendered through a real memory router with an
 * `errorElement`, so any path that would reach RouteErrorSurface shows up as
 * the text "route error".
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import { readFileSync } from 'fs'
import { join } from 'path'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useState } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { GameInfo } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import useLibraryState from 'frontend/state/libraryState'
import { resetAllStores } from 'frontend/state/storeKit'
import GamePageGate, { findLibraryGame } from '../GamePageGate'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

// jsdom exposes no fetch `Request`, which the data router builds for every navigation.
class FakeRequest {
  readonly method: string
  readonly headers = new Map<string, string>()
  readonly signal: AbortSignal | undefined
  constructor(
    readonly url: string,
    init: { method?: string; signal?: AbortSignal } = {}
  ) {
    this.method = init.method ?? 'GET'
    this.signal = init.signal
  }
}
Object.assign(globalThis, { Request: FakeRequest })

// Plain functions behind mock-prefixed variables, not jest.fn(): the jest config
// resets mock implementations between tests.
let mockGetGameInfoCalls: unknown[][] = []
let mockGetGameInfoImpl: (
  appName: string,
  runner: string
) => Promise<GameInfo | null> = () => Promise.resolve(null)

jest.mock('frontend/helpers', () => ({
  getGameInfo: (appName: string, runner: string) => {
    mockGetGameInfoCalls.push([appName, runner])
    return mockGetGameInfoImpl(appName, runner)
  }
}))

const game = (app_name: string, title: string, runner = 'steam') =>
  ({ app_name, runner, title }) as unknown as GameInfo

function Probe({ gameInfo }: { gameInfo: GameInfo }) {
  const [seeded] = useState(gameInfo)
  return <p>{`content:${seeded.app_name}:${seeded.title}`}</p>
}

function makeRouter(pathname: string, state?: unknown) {
  return createMemoryRouter(
    [
      {
        path: '/gamepage/:runner/:appName',
        element: (
          <GamePageGate>
            {(gameInfo) => <Probe gameInfo={gameInfo} />}
          </GamePageGate>
        ),
        errorElement: <p>route error</p>
      },
      { path: '/library', element: <p>library</p> }
    ],
    { initialEntries: [{ pathname, state }] }
  )
}

const renderAt = (pathname: string, state?: unknown) => {
  const router = makeRouter(pathname, state)
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

const NOT_FOUND = "GameLib couldn't find this game."

beforeEach(() => {
  mockGetGameInfoCalls = []
  mockGetGameInfoImpl = () => Promise.resolve(null)
  useLibraryState.setState({
    epicLibrary: [],
    gogLibrary: [],
    amazonLibrary: [],
    steamLibrary: [],
    sideloadedLibrary: []
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

describe('GamePageGate', () => {
  it('Test 1: router state wins on the first render with no store read and no lookup', () => {
    useLibraryState.setState({
      steamLibrary: [game('620', 'Store Title')]
    })
    const { container } = renderAt('/gamepage/steam/620', {
      gameInfo: game('620', 'State Title')
    })
    expect(screen.getByText('content:620:State Title')).toBeTruthy()
    expect(container.querySelector('.UpdateComponent')).toBeNull()
    expect(mockGetGameInfoCalls).toEqual([])
  })

  it('Test 2: stateless entry resolves from the library store with no lookup', () => {
    useLibraryState.setState({ steamLibrary: [game('620', 'Store Title')] })
    const { container } = renderAt('/gamepage/steam/620')
    expect(screen.getByText('content:620:Store Title')).toBeTruthy()
    expect(container.querySelector('.UpdateComponent')).toBeNull()
    expect(mockGetGameInfoCalls).toEqual([])
  })

  it('Test 3: store miss shows the spinner, then the game from getGameInfo', async () => {
    mockGetGameInfoImpl = () => Promise.resolve(game('620', 'Ipc Title'))
    const { container } = renderAt('/gamepage/steam/620')
    expect(container.querySelector('.UpdateComponent')).not.toBeNull()
    expect(screen.queryByText(/^content:/)).toBeNull()
    expect(await screen.findByText('content:620:Ipc Title')).toBeTruthy()
    expect(container.querySelector('.UpdateComponent')).toBeNull()
    expect(mockGetGameInfoCalls).toEqual([['620', 'steam']])
  })

  it('Test 4: getGameInfo resolving null shows not-found with a Back to Library link', async () => {
    renderAt('/gamepage/steam/620')
    expect(await screen.findByText(NOT_FOUND)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Back to Library' })
    expect(link.getAttribute('href')).toBe('/library')
    expect(screen.queryByText('route error')).toBeNull()
  })

  it('Test 5: getGameInfo rejecting shows not-found, never the route error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockGetGameInfoImpl = () => Promise.reject(new Error('boom'))
      renderAt('/gamepage/steam/620')
      expect(await screen.findByText(NOT_FOUND)).toBeTruthy()
      expect(screen.queryByText('route error')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('Test 6: a hostile runner param does not throw', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockGetGameInfoImpl = () => Promise.reject(new Error('invalid runner'))
      renderAt('/gamepage/constructor/x')
      expect(await screen.findByText(NOT_FOUND)).toBeTruthy()
      expect(screen.queryByText('route error')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('Test 7: a lookup that settles after the params changed is discarded', async () => {
    let resolveOne: (g: GameInfo | null) => void = () => undefined
    const one = new Promise<GameInfo | null>((resolve) => {
      resolveOne = resolve
    })
    mockGetGameInfoImpl = (appName) =>
      appName === '1' ? one : Promise.resolve(game('2', 'Game B'))
    const { router } = renderAt('/gamepage/steam/1')
    await act(async () => {
      await router.navigate('/gamepage/steam/2')
    })
    expect(await screen.findByText('content:2:Game B')).toBeTruthy()
    await act(async () => {
      resolveOne(game('1', 'Game A1'))
      await one
    })
    expect(screen.getByText('content:2:Game B')).toBeTruthy()
    expect(screen.queryByText('content:1:Game A1')).toBeNull()
  })

  it('Test 8: moving between game pages remounts the body so seed-once state follows the URL', async () => {
    const { router } = renderAt('/gamepage/steam/620', {
      gameInfo: game('620', 'Game A')
    })
    expect(screen.getByText('content:620:Game A')).toBeTruthy()
    await act(async () => {
      await router.navigate('/gamepage/steam/700', {
        state: { gameInfo: game('700', 'Game B') }
      })
    })
    expect(screen.getByText('content:700:Game B')).toBeTruthy()
    expect(screen.queryByText('content:620:Game A')).toBeNull()
  })
})

describe('findLibraryGame', () => {
  const lists = {
    epicLibrary: [] as GameInfo[],
    gogLibrary: [] as GameInfo[],
    amazonLibrary: [] as GameInfo[],
    steamLibrary: [] as GameInfo[],
    sideloadedLibrary: [] as GameInfo[]
  }

  it.each([
    ['legendary', 'epicLibrary'],
    ['gog', 'gogLibrary'],
    ['nile', 'amazonLibrary'],
    ['steam', 'steamLibrary'],
    ['sideload', 'sideloadedLibrary']
  ] as const)('Test 9: %s resolves from %s only', (runner, key) => {
    const g = game('abc', 'Only Here', runner)
    const library = { ...lists, [key]: [game('other', 'Other'), g] }
    expect(findLibraryGame(library, runner, 'abc')).toBe(g)
    expect(findLibraryGame(library, runner, 'missing')).toBeUndefined()
    const others = ['legendary', 'gog', 'nile', 'steam', 'sideload'].filter(
      (r) => r !== runner
    )
    for (const other of others) {
      expect(findLibraryGame(library, other, 'abc')).toBeUndefined()
    }
  })

  it('Test 9b: prototype-ish runner names return undefined without throwing', () => {
    for (const runner of ['constructor', '__proto__', 'bogus']) {
      expect(findLibraryGame(lists, runner, 'x')).toBeUndefined()
    }
  })
})

describe('GamePage wiring (source gate)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('Test 10: the body reads no router state and the default export is the gate around the body', () => {
    expect(source).not.toContain('useLocation')
    expect(source).not.toContain('location.state')
    expect(source).toContain('useState(initialGameInfo)')
    expect(source).toMatch(
      /export default React\.memo\(\s*function GamePage\(\)[\s\S]*?<GamePageGate>[\s\S]*?<GamePageContent\s+initialGameInfo=\{gameInfo\}\s*\/>[\s\S]*?<\/GamePageGate>/
    )
  })
})
