/**
 * G1: the Steam-tile effect in `Login/index.tsx` re-runs when the login
 * overlay closes.
 *
 * The bug this pins (UAT 2026-08-23, quick 260823-awo): after signing back in
 * from the "Sign-in expired — Reconnect" tile, the tile KEPT saying
 * "Sign-in expired" until the user navigated away and back.
 *
 * Cause: `GlobalState.steamLogin` writes `username: result.username` -- the
 * SAME persona name the tile already had -- so `steam?.username` does not
 * change, none of the other deps move either, and the effect never re-runs.
 * The stale `steamCredentialsMissing: true` survived in local state until an
 * unmount/remount re-ran the `useState` initialiser. `openOverlay` flipping
 * 'steam' -> null on dismiss is the one signal that DOES move at exactly the
 * moment the flag can go true -> false while this screen stays mounted.
 *
 * Why a source-level gate rather than a render test: the Frontend jest project
 * runs `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`),
 * so no test here can mount a component or observe a dependency array's effect.
 * A dep-array omission is invisible to every other kind of test available in
 * this project -- which is exactly how it shipped. Same technique, and same
 * justification, as `Library/__tests__/librarySyncNoticeSource.test.ts`.
 *
 * COMMENTS ARE STRIPPED BEFORE MATCHING. The first draft of this file asserted
 * against raw source and would have passed on the explanatory comment above the
 * dependency -- i.e. it would still have been green with the dep deleted. The
 * non-vacuity case below is what caught that; keep it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const LOGIN_INDEX = join(__dirname, '..', 'index.tsx')

/** Removes `//` and block comments so a gate can never match prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ANCHOR = 'setIsHumbleLoggedIn(Boolean(humble?.isLoggedIn)'

/** The full body of the store-tile effect, comments removed. */
function effectBody(source: string): string {
  const stripped = stripComments(source)
  const at = stripped.indexOf(ANCHOR)
  if (at === -1) {
    throw new Error(
      'SETUP FAILED: could not find the store-tile effect in Login/index.tsx. ' +
        'If it was renamed or restructured, update ANCHOR -- do not delete the gate.'
    )
  }
  const open = stripped.lastIndexOf('useEffect(', at)
  const close = stripped.indexOf('])', at)
  if (open === -1 || close === -1) {
    throw new Error('SETUP FAILED: could not bound the effect')
  }
  return stripped.slice(open, close + 2)
}

/** Just the dependency array of that effect, comments already removed. */
function effectDeps(source: string): string {
  const body = effectBody(source)
  const at = body.lastIndexOf('}, [')
  if (at === -1) throw new Error('SETUP FAILED: no dependency array')
  return body.slice(at)
}

describe('Steam tile refreshes when the login overlay closes', () => {
  const source = readFileSync(LOGIN_INDEX, 'utf-8')

  it('G1: openOverlay is an actual dependency, not just mentioned in a comment', () => {
    expect(effectDeps(source)).toContain('openOverlay')
  })

  it('G1 non-vacuity: the gate FAILS against a specimen with the dep removed', () => {
    // A gate that cannot go red guards nothing. Deleting the dependency LINE
    // while leaving every comment intact must still trip G1 -- that is the
    // precise scenario the first draft of this file got wrong.
    const sabotaged = source.replace(/\n\s*openOverlay,/, '')
    expect(sabotaged).not.toBe(source)
    expect(effectDeps(sabotaged)).not.toContain('openOverlay')
  })

  it('G2: the effect re-reads the store rather than reusing a cached value', () => {
    // A dep that re-runs an effect which never re-reads the flag would be a
    // gate measuring the wrong property.
    const body = effectBody(source)
    expect(body).toContain(
      "steamConfigStore.get_nodefault('credentialsMissing')"
    )
    expect(body).toContain('setSteamCredentialsMissing')
  })
})
