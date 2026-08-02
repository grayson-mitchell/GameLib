/**
 * Source-text structural gate for `GlobalState.refresh()`'s four cache guards.
 *
 * WHAT IT PINS
 *
 * Each of the four runner blocks in `refresh()` asks "is the CACHE empty, and must I
 * therefore fetch the library?". All four used to ALSO test `!<runner>.library.length` —
 * the length of REACT STATE — and refetch when that was empty even though the cache was
 * full.
 *
 * React state is only written by the `setState` at the END of `refresh()`, so on any path
 * that deliberately empties it (a fresh login sets `{library: [], username}` before
 * triggering the refresh) it is guaranteed empty at the guard while the cache is already
 * correct. The guard then went to the network for data the next line already held.
 * Measured cost on the live GOG login: a full second library fetch, 01:40:14 -> 01:40:24,
 * ~10 seconds (debug/resolved/gog-login-ui-never-updates.md).
 *
 * All four call sites were fixed together. Only GOG had a reported symptom; epic, zoom and
 * amazon are the same defect and fixing one would have left three latent — this project's
 * own "count the instances before scoping the fix" lesson from Phase 34.2's gap cycles.
 *
 * WHY A SOURCE-TEXT GATE
 *
 * `GlobalState.tsx` cannot be imported under this project's `node`-environment frontend
 * jest project (no jsdom): it reads `window.localStorage` at MODULE SCOPE, so a bare
 * `import` throws `window is not defined` before any test could run. Same documented
 * constraint and same approach as `GlobalStateRefreshLibraryOrigin.test.ts` and
 * `GlobalStateSteamLogout.test.ts`: read the real source, strip comments (so this fix's own
 * explanatory prose cannot satisfy a naive match), assert the shape.
 *
 * What it does NOT prove: the runtime behaviour of a real refresh. That needs a live
 * session — the observable is the absence of a second `Getting GOG library` round trip
 * between a login's `refreshLibrary complete` and the library rendering.
 *
 * Self-tested against synthetic regressed sources per this project's anti-vacuity
 * requirement — a source-text gate without a self-test is a vacuous gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')

/** Extracts the balanced-brace body of the `refresh = async (...)` method. */
function extractRefreshBody(source: string): string {
  const marker = 'refresh = async ('
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) throw new Error('refresh method not found')

  // Skip past the parameter list to the body's opening brace.
  const arrowIdx = source.indexOf('=> {', markerIdx)
  if (arrowIdx === -1) throw new Error('refresh body not found')

  let depth = 0
  for (let i = source.indexOf('{', arrowIdx); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(arrowIdx, i + 1)
    }
  }
  throw new Error('unbalanced braces in refresh body')
}

/**
 * The regression this gate exists to catch: a cache guard that also consults React state's
 * library length. Matches `|| !epic.library.length`, `||!gog.library.length`, and the
 * reversed `!amazon.library.length ||` form.
 */
const STATE_LENGTH_IN_GUARD =
  /(\|\|\s*!\s*\w+\.library\.length)|(!\s*\w+\.library\.length\s*\|\|)/

describe('GlobalState.refresh() cache guards', () => {
  const source = stripSourceComments(readFileSync(globalStatePath, 'utf-8'))
  const refreshBody = extractRefreshBody(source)

  it('guards on the CACHE only — no guard consults React state length', () => {
    expect(refreshBody).not.toMatch(STATE_LENGTH_IN_GUARD)
  })

  it.each([
    ['epic', 'epic.username && !epicLibrary.length'],
    ['gog', 'gog.username && !gogLibrary.length'],
    ['zoom', 'zoom.username && !zoomLibrary.length'],
    ['amazon', 'amazon.user_id && !amazonLibrary.length']
  ])(
    'the %s guard tests exactly the cache-backed variable',
    (_runner, expected) => {
      expect(refreshBody).toContain(expected)
    }
  )

  it('still refetches when the cache IS empty — the guard is not simply deleted', () => {
    // The four fetch calls must survive. A "fix" that removed the guards entirely would
    // pass the assertions above while breaking first-login population outright.
    expect(refreshBody).toContain('getLegendaryConfig()')
    expect(refreshBody).toContain("window.api.refreshLibrary('gog')")
    expect(refreshBody).toContain("window.api.refreshLibrary('zoom')")
    expect(refreshBody).toContain("window.api.refreshLibrary('nile')")
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a regressed guard that re-adds the React-state clause', () => {
      const regressed =
        'if (gog.username && (!gogLibrary.length || !gog.library.length)) {'
      expect(regressed).toMatch(STATE_LENGTH_IN_GUARD)
    })

    it('detects the reversed operand order too', () => {
      const regressed =
        'if (gog.username && (!gog.library.length || !gogLibrary.length)) {'
      expect(regressed).toMatch(STATE_LENGTH_IN_GUARD)
    })

    it('does not fire on the fixed form', () => {
      expect('if (gog.username && !gogLibrary.length) {').not.toMatch(
        STATE_LENGTH_IN_GUARD
      )
    })

    it('does not fire on unrelated library.length reads outside a guard', () => {
      // `handleGamePush` and the connectivity check both read `<runner>.library.length`
      // legitimately; this gate is scoped to refresh()'s body and to the `||` shape, so
      // those must not trip it.
      expect('beforeLen=${prevState.steam.library.length}').not.toMatch(
        STATE_LENGTH_IN_GUARD
      )
      expect('epic.library.length !== 0').not.toMatch(STATE_LENGTH_IN_GUARD)
    })
  })
})
