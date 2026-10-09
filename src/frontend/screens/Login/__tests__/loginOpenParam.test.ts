import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SIGN_IN_STORES,
  type SignInState,
  type SignInStore
} from 'common/signInState'
import { resolveLibrarySignInRows } from '../../Library/librarySignInRows'
import {
  LOGIN_OPEN_PARAM,
  buildLoginOpenPath,
  resolveLoginOpenRequest
} from '../loginOpenParam'

/**
 * Phase 49 Plan 10 (R6, D-13, T-49-28): Sign in from a Library notice row
 * lands on Manage Accounts with that store's overlay open -- for each of the
 * five stores -- and a repeated click or a repeated route parameter opens ONE
 * overlay, never two, and never one without a click.
 *
 * Two halves, because the Frontend jest project has no jsdom:
 *
 *   1. Pure composition: row -> `buildLoginOpenPath` -> the query parsed with
 *      `URLSearchParams` -> `resolveLoginOpenRequest`.
 *   2. Source gates over `Login/index.tsx` for what a render test would have
 *      proven: how the `?open=` effect is keyed and ordered, and exactly where
 *      `openLoginOverlay` is called from. Comments are stripped before
 *      matching; every gate carries a RED specimen.
 */

function statesWith(
  store: SignInStore,
  state: SignInState
): Record<SignInStore, SignInState> {
  const states = {} as Record<SignInStore, SignInState>
  for (const other of SIGN_IN_STORES) {
    states[other] = other === store ? state : 'connected'
  }
  return states
}

/** What `navigate(path)` would put in `useSearchParams()`. */
function paramOf(path: string): string | null {
  const query = path.slice(path.indexOf('?') + 1)
  return new URLSearchParams(query).get(LOGIN_OPEN_PARAM)
}

describe('R6: Sign in from a row opens that store (all five stores)', () => {
  it('iterates exactly the five stores', () => {
    expect(SIGN_IN_STORES).toHaveLength(5)
  })

  it.each(['expired', 'not-connected'] as const)(
    'a %s row -> path -> parsed param -> the same store, for every store',
    (state) => {
      for (const store of SIGN_IN_STORES) {
        const rows = resolveLibrarySignInRows({
          states: statesWith(store, state),
          dismissed: []
        })
        expect(rows).toHaveLength(1)
        expect(rows[0].store).toBe(store)

        const path = buildLoginOpenPath(rows[0].store)
        expect(path.startsWith('/login?')).toBe(true)
        expect(
          resolveLoginOpenRequest({
            param: paramOf(path),
            alreadyConsumed: false,
            overlayOpen: false
          })
        ).toBe(store)
      }
    }
  )
})

describe('R6 idempotency: one overlay per request (D-13)', () => {
  it.each(SIGN_IN_STORES)(
    '%s: the same param is ignored once consumed',
    (store) => {
      expect(
        resolveLoginOpenRequest({
          param: store,
          alreadyConsumed: true,
          overlayOpen: false
        })
      ).toBeNull()
    }
  )

  it.each(SIGN_IN_STORES)(
    '%s: the param is ignored while an overlay is already open',
    (store) => {
      expect(
        resolveLoginOpenRequest({
          param: store,
          alreadyConsumed: false,
          overlayOpen: true
        })
      ).toBeNull()
    }
  )

  it.each(['zoom', '', '__proto__', 'constructor', 'Steam', 'steam '])(
    'opens nothing for the invalid value %j',
    (param) => {
      expect(
        resolveLoginOpenRequest({
          param,
          alreadyConsumed: false,
          overlayOpen: false
        })
      ).toBeNull()
    }
  )

  it('opens nothing when the param is absent', () => {
    expect(
      resolveLoginOpenRequest({
        param: null,
        alreadyConsumed: false,
        overlayOpen: false
      })
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Source gates over Login/index.tsx
// ---------------------------------------------------------------------------

const LOGIN_INDEX = join(__dirname, '..', 'index.tsx')

/** Removes `//` and block comments so a gate can never match prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function occurrences(haystack: string, pattern: RegExp): number {
  return (haystack.match(new RegExp(pattern.source, 'g')) ?? []).length
}

const ANCHOR = 'searchParams.get(LOGIN_OPEN_PARAM)'

interface OpenEffect {
  body: string
  deps: string
}

/** The `?open=` effect: its body and its dependency array, comments removed. */
function openEffect(source: string): OpenEffect {
  const code = stripComments(source)
  const at = code.indexOf(ANCHOR)
  if (at === -1) {
    throw new Error(
      'SETUP FAILED: could not find the ?open= effect in Login/index.tsx. ' +
        'If it was renamed or restructured, update ANCHOR -- do not delete the gate.'
    )
  }
  const open = code.lastIndexOf('useEffect(', at)
  const close = code.indexOf('])', at)
  if (open === -1 || close === -1) {
    throw new Error('SETUP FAILED: could not bound the ?open= effect')
  }
  const whole = code.slice(open, close + 2)
  const depsAt = whole.lastIndexOf('}, [')
  if (depsAt === -1) throw new Error('SETUP FAILED: no dependency array')
  return { body: whole.slice(0, depsAt), deps: whole.slice(depsAt) }
}

/** Every call of `openLoginOverlay(`, excluding its own declaration. */
const CALL_SITE = /(?<!function\s)\bopenLoginOverlay\(/

describe('Login/index.tsx opens an overlay only from a click, Retry, or the consumed-once param (T-49-28)', () => {
  const source = readFileSync(LOGIN_INDEX, 'utf-8')
  const code = stripComments(source)

  it('the ?open= effect is not keyed on `loading`', () => {
    // `Login` renders <UpdateComponent /> until `setLoading(false)`; keying on
    // `loading` would hold the overlay back (or re-fire it) on that flip.
    expect(openEffect(source).deps).not.toContain('loading')
    expect(openEffect(source).deps).toContain('searchParams')
  })

  it('marks the request consumed BEFORE opening, and only for a valid store', () => {
    const { body } = openEffect(source)
    const consumed = body.indexOf('openParamConsumedRef.current = true')
    const opened = body.indexOf('openLoginOverlay(store)')
    const guard = body.indexOf('store !== null')
    expect(consumed).toBeGreaterThan(-1)
    expect(opened).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(consumed)
    expect(consumed).toBeLessThan(opened)
  })

  it('removes the param with { replace: true }', () => {
    const { body } = openEffect(source)
    expect(body).toMatch(
      /setSearchParams\(\s*[\w.]+\s*,\s*\{\s*replace:\s*true\s*\}\s*\)/
    )
  })

  it('passes resolveLoginOpenRequest the consumed flag and the overlay-open flag', () => {
    const { body } = openEffect(source)
    expect(body).toContain('resolveLoginOpenRequest(')
    expect(body).toMatch(/alreadyConsumed:\s*openParamConsumedRef\.current/)
    expect(body).toMatch(/overlayOpen:\s*openOverlay\s*!==\s*null/)
  })

  it('calls openLoginOverlay( from exactly seven sites: five tiles, Retry, the param effect', () => {
    expect(occurrences(code, CALL_SITE)).toBe(7)

    // The five tiles: one primary action per store, each a click handler.
    for (const store of SIGN_IN_STORES) {
      expect(
        occurrences(
          code,
          new RegExp(
            `primaryLoginAction=\\{\\(\\) => openLoginOverlay\\('${store}'\\)\\}`
          )
        )
      ).toBe(1)
    }

    // Retry re-opens the overlay that is currently up, and only that.
    const retry = code.slice(code.indexOf('function retryLoginOverlay'))
    expect(retry.slice(0, retry.indexOf('\n  }'))).toContain(
      'openLoginOverlay(openOverlay)'
    )

    // The param effect is the only other site.
    expect(openEffect(source).body).toContain('openLoginOverlay(store)')
  })

  describe('red-proof', () => {
    it('an extra mount-time openLoginOverlay("steam") breaks the call-site count', () => {
      const specimen = `${source}\nopenLoginOverlay('steam')\n`
      expect(occurrences(stripComments(specimen), CALL_SITE)).toBe(8)
    })

    it('the declaration alone is not counted as a call site', () => {
      expect(
        occurrences('function openLoginOverlay(which) {}', CALL_SITE)
      ).toBe(0)
    })

    it('prose naming openLoginOverlay( in a comment is not counted', () => {
      const specimen = `// openLoginOverlay('steam') on mount\n${source}`
      expect(occurrences(stripComments(specimen), CALL_SITE)).toBe(7)
    })

    it('a dependency array that adds `loading` is convicted', () => {
      const specimen = source.replace(
        '}, [searchParams])',
        '}, [searchParams, loading])'
      )
      expect(specimen).not.toBe(source)
      expect(openEffect(specimen).deps).toContain('loading')
    })

    it('opening before marking consumed is convicted', () => {
      const specimen = source.replace(
        /openParamConsumedRef\.current = true\s*\n(\s*)openLoginOverlay\(store\)/,
        'openLoginOverlay(store)\n$1openParamConsumedRef.current = true'
      )
      expect(specimen).not.toBe(source)
      const { body } = openEffect(specimen)
      expect(
        body.indexOf('openParamConsumedRef.current = true')
      ).toBeGreaterThan(body.indexOf('openLoginOverlay(store)'))
    })

    it('a push navigation (no replace) is convicted', () => {
      const specimen = source.replace(
        'setSearchParams(next, { replace: true })',
        'setSearchParams(next)'
      )
      expect(specimen).not.toBe(source)
      expect(openEffect(specimen).body).not.toMatch(/replace:\s*true/)
    })
  })
})
