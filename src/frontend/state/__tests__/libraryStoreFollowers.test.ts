/**
 * debug/scoped-refresh-stale-library.
 *
 * A runner-scoped `refreshLibrary` (store exit, sign-in) resolves its RPC, then `refresh()` re-reads
 * that runner's cache from the renderer's store snapshot and commits it. Since Phase 85-17 the
 * snapshot is patched by the shell's `storeChanged` push, which the shell emits only AFTER its
 * `store-frames` worker has persisted the sidecar's write, while the RPC response is fulfilled by
 * the stdout reader the moment its line is read (85-RESEARCH Pitfall 8: an event and an invoke
 * response have no relative order). So the response routinely reaches the renderer first, `refresh()`
 * commits the pre-refresh list, and nothing re-read it when the push landed: the new game stayed
 * invisible until a slower full refresh happened to run after the push.
 *
 * These tests drive the REAL transport (`tauriTransport` over a mocked `@tauri-apps/api`), the REAL
 * frontend stores and the REAL libraryState. The mocked shell answers the `refreshLibrary` RPC at
 * once and delivers the push afterwards, the order the live log showed. The library state must
 * follow the snapshot, whichever of the two arrives first.
 */
jest.mock('@tauri-apps/api/core', () => {
  const route = {
    handler: (() => Promise.resolve(undefined)) as (
      cmd: string,
      payload?: unknown
    ) => Promise<unknown>
  }
  // A plain function, not jest.fn(): the stores call it at import time, before any test body, and
  // `resetMocks` would otherwise strip its implementation.
  return {
    // The rest of the module stays real: `@tauri-apps/api/window` (pulled in by the preload) extends
    // its `Resource` class at import time.
    ...jest.requireActual('@tauri-apps/api/core'),
    invoke: (cmd: string, payload?: unknown) => route.handler(cmd, payload),
    __route: route
  }
})
jest.mock('@tauri-apps/api/event', () => {
  type Handler = (event: { payload: unknown }) => void
  const handlers: Handler[] = []
  return {
    ...jest.requireActual('@tauri-apps/api/event'),
    listen: (_event: string, handler: Handler) => {
      handlers.push(handler)
      return Promise.resolve(() => undefined)
    },
    __emit: (payload: unknown) => {
      for (const handler of handlers) handler({ payload })
    }
  }
})

import '../../testUtils/tauriWindow'
import * as tauriCore from '@tauri-apps/api/core'
import * as tauriEvent from '@tauri-apps/api/event'
import type { GameInfo } from 'common/types'
import {
  SIDECAR_INVOKE,
  SIDECAR_STORE_SNAPSHOT,
  STORE_CHANGED_CHANNEL,
  STORE_REV_KEY
} from 'common/types/sidecarTransport'
import { hydrateStoreSnapshot } from 'preload/tauriTransport'
import { resetAllStores } from '../storeKit'
import useLibraryState, {
  readInitialLibrary,
  registerLibraryStoreFollowers
} from '../libraryState'

type Route = (cmd: string, payload?: unknown) => Promise<unknown>
const route = (tauriCore as unknown as { __route: { handler: Route } }).__route
const emitToRenderer = (
  tauriEvent as unknown as { __emit: (payload: unknown) => void }
).__emit

const game = (name: string, runner: GameInfo['runner']) =>
  ({ app_name: name, runner, title: name }) as GameInfo

const names = (games: GameInfo[]) => games.map((g) => g.app_name)

/** Strictly increasing across tests: the transport's stale-push guard remembers the newest rev per store. */
let revCounter = 100
const nextRev = () => ++revCounter

const TIMESTAMP = '2026-11-22T00:00:00Z'

function bootSnapshot() {
  const rev = nextRev()
  return {
    legendary_library: {
      library: [game('e1', 'legendary')],
      __timestamp: { library: TIMESTAMP }
    },
    nile_library: {
      library: [game('a1', 'nile')],
      __timestamp: { library: TIMESTAMP }
    },
    gog_library: {
      games: [game('g1', 'gog')],
      __timestamp: { games: TIMESTAMP }
    },
    gogInstalledGamesStore: { installed: [] },
    steam_library: { games: [] },
    sideloadedStore: { games: [] },
    configStore: {},
    gameOverridesStore: { overrides: {} },
    [STORE_REV_KEY]: {
      legendary_library: rev,
      nile_library: rev,
      gog_library: rev,
      gogInstalledGamesStore: rev,
      steam_library: rev,
      sideloadedStore: rev,
      configStore: rev,
      gameOverridesStore: rev
    }
  }
}

/** The renderer receives one shell push, as `tauriTransport` does. */
function pushFromShell(payload: Record<string, unknown>): void {
  emitToRenderer({
    channel: STORE_CHANGED_CHANNEL,
    args: [{ ...payload, rev: nextRev() }]
  })
}

/** What the shell sends for one cache write: the value, then its timestamp. */
function pushCacheWrite(store: string, key: string, value: unknown): void {
  pushFromShell({ store, key, value })
  pushFromShell({ store, key: `__timestamp.${key}`, value: TIMESTAMP })
}

let disposeFollowers: (() => void) | undefined

beforeEach(async () => {
  ;(window as unknown as { localStorage: unknown }).localStorage = {
    getItem: () => null,
    setItem: () => undefined
  }
  route.handler = (cmd) =>
    // sidecar_invoke (refreshLibrary and every other channel) answers at once, with no push.
    Promise.resolve(cmd === SIDECAR_STORE_SNAPSHOT ? bootSnapshot() : undefined)
  await hydrateStoreSnapshot()
  useLibraryState.setState(readInitialLibrary())
})

afterEach(() => {
  disposeFollowers?.()
  disposeFollowers = undefined
  resetAllStores()
})

/** Runs a scoped refresh whose backend write has not reached the renderer when the RPC resolves. */
async function scopedRefreshBeforePush(
  runner: 'legendary' | 'gog' | 'nile'
): Promise<void> {
  const channels: string[] = []
  const previous = route.handler
  route.handler = (cmd, payload) => {
    if (cmd === SIDECAR_INVOKE) {
      channels.push((payload as { channel: string }).channel)
    }
    return previous(cmd, payload)
  }
  await useLibraryState
    .getState()
    .refreshLibrary({ library: runner, origin: 'test' })
  // The RPC really went out, and nothing delivered a push for it yet.
  expect(channels).toContain('refreshLibrary')
}

describe('a runner-scoped refresh whose store push lands after the RPC response (debug/scoped-refresh-stale-library)', () => {
  it('control: the harness reproduces the race. The snapshot gets the new list, the library state does not, when nothing follows the store', async () => {
    useLibraryState.setState({ epicLibrary: [game('e1', 'legendary')] })
    await scopedRefreshBeforePush('legendary')
    expect(names(useLibraryState.getState().epicLibrary)).toEqual(['e1'])

    pushCacheWrite('legendary_library', 'library', [
      game('e1', 'legendary'),
      game('e2', 'legendary')
    ])

    // The push was applied (not dropped as stale): the snapshot holds the new list...
    const snapshotList = window.api.storeGet(
      'legendary_library',
      'library',
      []
    ) as GameInfo[]
    expect(names(snapshotList)).toEqual(['e1', 'e2'])
    // ...but refresh() had already committed, so with no follower the state never sees it.
    expect(names(useLibraryState.getState().epicLibrary)).toEqual(['e1'])
  })

  it.each([
    ['legendary', 'epicLibrary', 'legendary_library', 'library'],
    ['nile', 'amazonLibrary', 'nile_library', 'library'],
    ['gog', 'gogLibrary', 'gog_library', 'games']
  ] as const)(
    '%s: the library shows the game once the push lands, with no further refresh',
    async (runner, stateKey, store, key) => {
      disposeFollowers = registerLibraryStoreFollowers()
      const before = names(useLibraryState.getState()[stateKey])
      const existing = before[0] ?? ''

      await scopedRefreshBeforePush(runner)
      expect(names(useLibraryState.getState()[stateKey])).toEqual(before)

      pushCacheWrite(store, key, [
        game(existing, runner),
        game('new-game', runner)
      ])

      expect(names(useLibraryState.getState()[stateKey])).toEqual([
        existing,
        'new-game'
      ])
    }
  )

  it('a push for one runner leaves the other runners arrays untouched', () => {
    disposeFollowers = registerLibraryStoreFollowers()
    const { epicLibrary, gogLibrary } = useLibraryState.getState()

    pushCacheWrite('nile_library', 'library', [
      game('a1', 'nile'),
      game('a2', 'nile')
    ])

    const after = useLibraryState.getState()
    expect(names(after.amazonLibrary)).toEqual(['a1', 'a2'])
    expect(after.epicLibrary).toBe(epicLibrary)
    expect(after.gogLibrary).toBe(gogLibrary)
  })

  it('one cache write (value push, then timestamp push) commits the library once', () => {
    disposeFollowers = registerLibraryStoreFollowers()
    const commits: string[][] = []
    const unsubscribe = useLibraryState.subscribe(
      (state) => state.epicLibrary,
      (library) => commits.push(names(library))
    )

    pushCacheWrite('legendary_library', 'library', [
      game('e1', 'legendary'),
      game('e2', 'legendary')
    ])
    unsubscribe()

    expect(commits).toEqual([['e1', 'e2']])
  })

  it('applies the per-game overrides the library already carries', () => {
    disposeFollowers = registerLibraryStoreFollowers()
    const overrides = { e2: { title: 'Renamed' } }
    useLibraryState.setState({ gameOverrides: overrides })

    pushCacheWrite('legendary_library', 'library', [
      game('e1', 'legendary'),
      game('e2', 'legendary')
    ])

    const e2 = useLibraryState
      .getState()
      .epicLibrary.find((g) => g.app_name === 'e2')
    expect(e2?.overrides).toEqual(overrides.e2)
  })

  it('a GOG install announced after the library write marks the game installed', () => {
    disposeFollowers = registerLibraryStoreFollowers()

    pushFromShell({
      store: 'gogInstalledGamesStore',
      key: 'installed',
      value: [{ appName: 'g1', install_path: '/games/g1' }]
    })

    const g1 = useLibraryState
      .getState()
      .gogLibrary.find((g) => g.app_name === 'g1')
    expect(g1?.is_installed).toBe(true)
  })

  it('the returned disposer stops the library following the store', () => {
    const dispose = registerLibraryStoreFollowers()
    dispose()

    pushCacheWrite('legendary_library', 'library', [
      game('e1', 'legendary'),
      game('e2', 'legendary')
    ])

    expect(names(useLibraryState.getState().epicLibrary)).toEqual(['e1'])
  })
})
