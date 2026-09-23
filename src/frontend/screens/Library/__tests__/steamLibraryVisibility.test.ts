import {
  selectVisibleSteamLibrary,
  SteamLibraryVisibilityInput,
  SteamVisibilityGame
} from '../steamLibraryVisibility'
import type { SteamSyncStatus } from 'common/types/ipc'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * debug/steam-library-shows-logged-out -- regression gate.
 *
 * The shipped defect: the Games grid gated the WHOLE Steam library on
 * `!!steam?.username`, a persisted config value that survives an expired
 * session. Logged out with a dead session, the entire cached library --
 * hundreds of owned-but-not-installed titles -- rendered as live cards with
 * working Install buttons, while the banner (reading the live
 * `steamSyncStatus`) correctly said "signed out".
 *
 * See `steamLibraryVisibility.ts`'s header for why the decision lives in its
 * own module and cannot be tested through `Library/index.tsx` (no jsdom, no
 * CSS transform in the Frontend jest project).
 */

interface Fixture extends SteamVisibilityGame {
  app_name: string
}

const INSTALLED_A: Fixture = { app_name: 'installed-a', is_installed: true }
const INSTALLED_B: Fixture = { app_name: 'installed-b', is_installed: true }
const OWNED_A: Fixture = { app_name: 'owned-a', is_installed: false }
const OWNED_B: Fixture = { app_name: 'owned-b', is_installed: false }

/**
 * Interleaved on purpose: installed and not-installed alternate, so a filter
 * that accidentally slices a contiguous range rather than testing each entry
 * cannot pass.
 */
const LIBRARY: Fixture[] = [OWNED_A, INSTALLED_A, OWNED_B, INSTALLED_B]

const names = (games: Fixture[]) => games.map((game) => game.app_name)

describe('selectVisibleSteamLibrary -- full state matrix', () => {
  // Cross product: steamUsername (absent | present) x steamSyncStatus
  // ('idle' | 'syncing' | 'failed') = 6 rows. Named for the user-visible
  // situation each describes, not for its input tuple.
  const rows: {
    name: string
    input: SteamLibraryVisibilityInput<Fixture>
    visible: string[]
  }[] = [
    {
      name: 'no Steam account, idle -> nothing (user never connected Steam)',
      input: {
        library: LIBRARY,
        steamUsername: undefined,
        steamSyncStatus: 'idle'
      },
      visible: []
    },
    {
      name: 'no Steam account, syncing -> nothing',
      input: {
        library: LIBRARY,
        steamUsername: undefined,
        steamSyncStatus: 'syncing'
      },
      visible: []
    },
    {
      name: 'no Steam account, failed -> nothing (no identity beats every other signal)',
      input: {
        library: LIBRARY,
        steamUsername: undefined,
        steamSyncStatus: 'failed'
      },
      visible: []
    },
    {
      name: 'signed in, idle -> full library (the healthy steady state)',
      input: {
        library: LIBRARY,
        steamUsername: 'someone',
        steamSyncStatus: 'idle'
      },
      visible: ['owned-a', 'installed-a', 'owned-b', 'installed-b']
    },
    {
      name: 'signed in, syncing -> full library (a sync in flight is not a failure)',
      input: {
        library: LIBRARY,
        steamUsername: 'someone',
        steamSyncStatus: 'syncing'
      },
      visible: ['owned-a', 'installed-a', 'owned-b', 'installed-b']
    },
    {
      name: 'expired session (username persists, sync failed) -> INSTALLED ONLY -- the reported defect',
      input: {
        library: LIBRARY,
        steamUsername: 'someone',
        steamSyncStatus: 'failed'
      },
      visible: ['installed-a', 'installed-b']
    }
  ]

  rows.forEach((row) => {
    it(row.name, () => {
      expect(names(selectVisibleSteamLibrary(row.input))).toEqual(row.visible)
    })
  })
})

describe('selectVisibleSteamLibrary -- the reported symptom, stated directly', () => {
  const expired: SteamLibraryVisibilityInput<Fixture> = {
    library: LIBRARY,
    steamUsername: 'someone',
    steamSyncStatus: 'failed'
  }

  it('renders no not-installed game once a sync has provably failed', () => {
    const visible = selectVisibleSteamLibrary(expired)
    expect(visible.every((game) => game.is_installed)).toBe(true)
  })

  it('still renders every installed game, so they stay launchable offline', () => {
    const visible = selectVisibleSteamLibrary(expired)
    expect(names(visible)).toEqual(['installed-a', 'installed-b'])
  })

  it('preserves entry identity rather than rebuilding objects', () => {
    // The grid memoizes on the returned entries; cloning them would make
    // every downstream `useMemo` see a fresh reference each render.
    expect(selectVisibleSteamLibrary(expired)[0]).toBe(INSTALLED_A)
  })

  it('returns the caller array itself when nothing is filtered', () => {
    // Same memoization concern as above, for the healthy path: `libraryUnion`
    // and the facet counts both key off these references.
    const healthy: SteamLibraryVisibilityInput<Fixture> = {
      library: LIBRARY,
      steamUsername: 'someone',
      steamSyncStatus: 'idle'
    }
    expect(selectVisibleSteamLibrary(healthy)).toBe(LIBRARY)
  })

  it('handles an empty cached library without inventing entries', () => {
    const empty: SteamLibraryVisibilityInput<Fixture> = {
      library: [],
      steamUsername: 'someone',
      steamSyncStatus: 'failed'
    }
    expect(selectVisibleSteamLibrary(empty)).toEqual([])
  })

  it('treats an empty-string username as no identity, not as a signed-in user', () => {
    const blank: SteamLibraryVisibilityInput<Fixture> = {
      library: LIBRARY,
      steamUsername: '',
      steamSyncStatus: 'idle'
    }
    expect(selectVisibleSteamLibrary(blank)).toEqual([])
  })

  it('treats a null username as no identity, the shape logout actually writes', () => {
    // Global state sets this field to `null` on logout rather than deleting
    // it, so `null` and `undefined` both reach here and must behave alike.
    const loggedOut: SteamLibraryVisibilityInput<Fixture> = {
      library: LIBRARY,
      steamUsername: null,
      steamSyncStatus: 'idle'
    }
    expect(selectVisibleSteamLibrary(loggedOut)).toEqual([])
  })
})

/**
 * Proves this file can actually SEE the defect it is named for.
 *
 * A regression test that passes against the broken code is worth nothing, and
 * that failure mode is invisible once the fix is in the tree -- the suite is
 * green either way. So the pre-fix decision is reproduced here verbatim and
 * run through the same expectations the live function must satisfy. If these
 * assertions ever stop holding, the matrix above has drifted somewhere that
 * no longer discriminates between fixed and broken, and it needs rewriting
 * rather than trusting.
 */
describe('saboteur -- the shipped implementation must fail this suite', () => {
  /** `Library/index.tsx` before the fix, verbatim in behaviour. */
  const shippedImplementation = (
    input: SteamLibraryVisibilityInput<Fixture>
  ): Fixture[] => (input.steamUsername ? input.library : [])

  const expired: SteamLibraryVisibilityInput<Fixture> = {
    library: LIBRARY,
    steamUsername: 'someone',
    steamSyncStatus: 'failed'
  }

  it('leaked the not-installed online collection on an expired session', () => {
    expect(names(shippedImplementation(expired))).toEqual([
      'owned-a',
      'installed-a',
      'owned-b',
      'installed-b'
    ])
  })

  it('disagrees with the fixed function exactly where the user saw the bug', () => {
    expect(names(shippedImplementation(expired))).not.toEqual(
      names(selectVisibleSteamLibrary(expired))
    )
  })

  it('agreed with the fixed function on every non-failed state', () => {
    // Confirms the fix is surgical: it changes the expired-session case and
    // nothing else, so a green suite here is not hiding collateral damage.
    const unaffected: SteamSyncStatus[] = ['idle', 'syncing']
    unaffected.forEach((steamSyncStatus) => {
      const input: SteamLibraryVisibilityInput<Fixture> = {
        library: LIBRARY,
        steamUsername: 'someone',
        steamSyncStatus
      }
      expect(names(shippedImplementation(input))).toEqual(
        names(selectVisibleSteamLibrary(input))
      )
    })
  })
})

/**
 * Everything above proves the MODULE is correct. None of it proves the grid
 * actually calls the module -- rewire `index.tsx` back to the inline
 * `showSteam ? steam.library : []` and every assertion above stays green
 * while the defect returns in full. That is the "regression test sitting
 * upstream of its own symptom" failure, so the call site gets its own gate.
 *
 * Source-text rather than a render test: the Frontend jest project runs
 * `testEnvironment: 'node'` with no jsdom and no CSS transform, and
 * `Library/index.tsx` opens with `import './index.css'` -- mounting it, or
 * importing anything from it, is impossible here. Same idiom as
 * `libraryPipeline.test.ts` and `tier2Portal.test.ts`.
 */
describe('the Games grid call site is wired to this module', () => {
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
  const librarySource = stripSourceComments(
    readFileSync(
      join(REPO_ROOT, 'src/frontend/screens/Library/index.tsx'),
      'utf8'
    )
  )

  /**
   * Brace-counted rather than regex-terminated so a nested block cannot end
   * the match early -- lifted from `libraryPipeline.test.ts`.
   */
  const functionRegion = (source: string, startNeedle: string): string => {
    const startIdx = source.indexOf(startNeedle)
    if (startIdx === -1) {
      throw new Error(`${startNeedle} not found`)
    }
    const braceStart = source.indexOf('{', startIdx)
    let depth = 0
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++
      if (source[i] === '}') {
        depth--
        if (depth === 0) {
          return source.slice(braceStart + 1, i)
        }
      }
    }
    throw new Error(`unterminated block for ${startNeedle}`)
  }

  const makeLibrary = functionRegion(
    librarySource,
    'const makeLibrary = useCallback(() => {'
  )

  it('builds its Steam slice through selectVisibleSteamLibrary', () => {
    expect(makeLibrary).toContain('selectVisibleSteamLibrary(')
  })

  it('imports the resolver rather than redeclaring one locally', () => {
    expect(librarySource).toContain(
      "import { selectVisibleSteamLibrary } from './steamLibraryVisibility'"
    )
  })

  it('no longer gates the Steam slice on the persisted username alone', () => {
    // `showSteam` itself STAYS -- `connectedStoresParity.test.ts` reads these
    // `show*` locals to prove the facet panel and the grid gate every store
    // identically (threat T-34.11-12), and deleting it blinds that gate to
    // Steam. What must be gone is the shipped one-liner that handed the whole
    // cached library straight to the grid on that local alone.
    expect(makeLibrary).toContain('showSteam')
    expect(makeLibrary).not.toMatch(/showSteam\s*\?\s*steam\.library\s*:/)
  })

  it('feeds the resolver the live sync status, not just the username', () => {
    // `steamSyncStatus` must be both passed AND declared as a `useCallback`
    // dependency; without the dep the grid keeps a stale slice after a sync
    // flips to 'failed', which looks exactly like the original bug.
    expect(makeLibrary).toContain('steamSyncStatus')
    const depsRegion = librarySource.slice(
      librarySource.indexOf('const makeLibrary = useCallback(() => {')
    )
    expect(depsRegion.slice(0, depsRegion.indexOf('])'))).toContain(
      'steamSyncStatus,'
    )
  })
})
