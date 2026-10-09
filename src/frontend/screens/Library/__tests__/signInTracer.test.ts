/**
 * Phase 49 plan 01 -- the tracer proof for the sign-in slice (D-06, D-07,
 * D-09, D-13).
 *
 * A latched Steam credential (`steamConfigStore.credentialsMissing`) must flow
 * through the common selector into exactly one Library row, whose Sign in
 * lands on Manage Accounts with the Steam overlay requested through `?open=`.
 *
 * Two halves, because the Frontend jest project has no jsdom and no stylesheet
 * transform (`testEnvironment: 'node'`), so neither `LibrarySignInNotice`,
 * `Library/index.tsx` nor `Login/index.tsx` can be mounted or imported:
 *
 *   (a) COMPOSITION over the real pure modules -- no mocks. This proves the
 *       data path from selector input to the `?open=` request.
 *   (b) SOURCE GATES over comment-stripped text of the three wired files.
 *       This proves the wiring that (a) cannot reach.
 *
 * ANTI-VACUITY: a source gate without a self-test is a vacuous gate. Every
 * gate below is proven to throw against a specimen derived from the REAL
 * file's text by string manipulation, never a hand-authored replica.
 *
 * Not proven here and not provable here: that the notice paints, or that the
 * overlay visibly opens. Those are owed to the live gate (49-11).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'
import {
  SIGN_IN_STORES,
  resolveSignInState,
  resolveSignInStates,
  type SignInSelectorInput,
  type SignInSelectorInputs
} from 'common/signInState'
import { resolveLibrarySignInRows } from '../librarySignInRows'
import {
  LOGIN_OPEN_PARAM,
  buildLoginOpenPath,
  resolveLoginOpenRequest
} from '../../Login/loginOpenParam'

const NOTICE_PATH = join(
  __dirname,
  '..',
  'components',
  'LibrarySignInNotice',
  'index.tsx'
)
const LIBRARY_INDEX_PATH = join(__dirname, '..', 'index.tsx')
const LOGIN_INDEX_PATH = join(__dirname, '..', '..', 'Login', 'index.tsx')

function readGated(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

const loggedOut: SignInSelectorInput = {
  loggedIn: false,
  expiredFlag: false,
  outcome: undefined
}

function steamExpiredInputs(): SignInSelectorInputs {
  return {
    legendary: loggedOut,
    gog: loggedOut,
    nile: loggedOut,
    humble: loggedOut,
    steam: { loggedIn: true, expiredFlag: true, outcome: undefined }
  }
}

describe('tracer (a): latched Steam expiry -> one row -> ?open=steam', () => {
  it('produces exactly one expired, non-dismissible Steam row', () => {
    const states = resolveSignInStates(steamExpiredInputs())
    expect(states.steam).toBe('expired')

    // The other four stores are logged out in this fixture, so since 49-09 they
    // also get a (neutral, dismissible) not-connected row. The tracer's claim
    // is about the expired slice only.
    const rows = resolveLibrarySignInRows({ states, dismissed: [] })
    expect(rows.filter((row) => row.kind === 'expired')).toEqual([
      { store: 'steam', kind: 'expired', dismissible: false }
    ])
  })

  it('the row Sign in navigates to /login?open=steam', () => {
    expect(buildLoginOpenPath('steam')).toBe('/login?open=steam')
    expect(buildLoginOpenPath('steam')).toBe(`/login?${LOGIN_OPEN_PARAM}=steam`)
  })

  it('the query value from that path opens the Steam overlay once', () => {
    const query = new URLSearchParams(buildLoginOpenPath('steam').split('?')[1])
    const param = query.get(LOGIN_OPEN_PARAM)

    expect(
      resolveLoginOpenRequest({
        param,
        alreadyConsumed: false,
        overlayOpen: false
      })
    ).toBe('steam')

    // Consumed once per mount.
    expect(
      resolveLoginOpenRequest({
        param,
        alreadyConsumed: true,
        overlayOpen: false
      })
    ).toBeNull()

    // Never stacks on top of an overlay that is already up.
    expect(
      resolveLoginOpenRequest({
        param,
        alreadyConsumed: false,
        overlayOpen: true
      })
    ).toBeNull()
  })

  it('opens nothing for a hostile or unknown ?open= value (T-49-01)', () => {
    for (const param of [null, '', 'zoom', '__proto__', 'steam/../gog']) {
      expect(
        resolveLoginOpenRequest({
          param,
          alreadyConsumed: false,
          overlayOpen: false
        })
      ).toBeNull()
    }
  })

  it('a latched flag outranks a logged-out read (D-07)', () => {
    expect(
      resolveSignInState({
        loggedIn: false,
        expiredFlag: true,
        outcome: undefined
      })
    ).toBe('expired')
  })

  it('the store list is canonical and complete', () => {
    expect([...SIGN_IN_STORES]).toEqual([
      'legendary',
      'gog',
      'nile',
      'humble',
      'steam'
    ])
  })
})

/**
 * Each gate returns normally or throws a labelled error, like the established
 * `librarySyncNoticeSource.test.ts` shape.
 */
function assertIncludes(source: string, pattern: RegExp, label: string): void {
  if (!pattern.test(source)) {
    throw new Error(`${label} FAILED: ${String(pattern)} not found.`)
  }
}

function assertNoticeWiring(source: string): void {
  assertIncludes(
    source,
    /resolveSignInStates\(\s*collectSignInInputs\(/,
    'N1 (selector via collector)'
  )
  assertIncludes(
    source,
    /navigate\(\s*buildLoginOpenPath\(/,
    'N2 (Sign in uses the open path)'
  )
}

function assertLibraryPlacement(source: string): void {
  const alphabetIdx = source.indexOf('<AlphabetFilter')
  const noticeIdx = source.indexOf('<LibrarySignInNotice')
  if (alphabetIdx === -1 || noticeIdx === -1) {
    throw new Error(
      'L1 FAILED: <AlphabetFilter or <LibrarySignInNotice absent.'
    )
  }
  if (!(noticeIdx > alphabetIdx)) {
    throw new Error('L1 FAILED: notice does not sit after <AlphabetFilter.')
  }
  // Search from the notice's own index: the Favourites lane mounts an earlier,
  // unrelated <GamesList.
  const gamesListIdx = source.indexOf('<GamesList', noticeIdx)
  if (gamesListIdx === -1) {
    throw new Error('L1 FAILED: no main <GamesList after the notice.')
  }
}

function assertLoginWiring(source: string): void {
  assertIncludes(source, /useSearchParams\(\)/, 'P1 (useSearchParams)')
  assertIncludes(source, /resolveLoginOpenRequest\(/, 'P2 (resolver)')
  assertIncludes(source, /openLoginOverlay\(store\)/, 'P3 (opens overlay)')
  assertIncludes(source, /\{ replace: true \}/, 'P4 (replace, not push)')
}

describe('tracer (b): source gates on the wired files (real source)', () => {
  it('LibrarySignInNotice reaches the selector through the collector and navigates via the open path', () => {
    expect(() => assertNoticeWiring(readGated(NOTICE_PATH))).not.toThrow()
  })

  it('Library/index.tsx mounts the notice after AlphabetFilter and before the main GamesList', () => {
    expect(() =>
      assertLibraryPlacement(readGated(LIBRARY_INDEX_PATH))
    ).not.toThrow()
  })

  it('Login/index.tsx consumes ?open= once and rewrites the URL with replace', () => {
    expect(() => assertLoginWiring(readGated(LOGIN_INDEX_PATH))).not.toThrow()
  })

  it('the notice is structurally inline: no Dialog, and its stylesheet declares no position', () => {
    const tsx = readGated(NOTICE_PATH)
    expect(tsx).not.toMatch(/Dialog/)

    const scss = readFileSync(join(NOTICE_PATH, '..', 'index.scss'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(scss).not.toMatch(/position/)
  })
})

describe('tracer RED proofs -- specimens derived from the REAL source', () => {
  it('N1: inlining a flag comparison in place of the selector trips the notice gate', () => {
    const real = readGated(NOTICE_PATH)
    expect(real).toMatch(/resolveSignInStates\(\s*collectSignInInputs\(/)

    const specimen = real.replace(
      /resolveSignInStates\(\s*collectSignInInputs\(/,
      'inlineFlagCheck('
    )
    expect(() => assertNoticeWiring(specimen)).toThrow(/N1/)
  })

  it('N2: a bare navigate("/login") trips the notice gate', () => {
    const real = readGated(NOTICE_PATH)
    const specimen = real.replace(
      /navigate\(\s*buildLoginOpenPath\(/,
      "navigate('/login'); void ("
    )
    expect(() => assertNoticeWiring(specimen)).toThrow(/N2/)
  })

  it('L1: moving the notice below the main GamesList trips the placement gate', () => {
    const real = readGated(LIBRARY_INDEX_PATH)
    const mount = /<LibrarySignInNotice\s*\/>/
    expect(real).toMatch(mount)

    const specimen = `${real.replace(mount, '')}\n<LibrarySignInNotice />\n`
    expect(() => assertLibraryPlacement(specimen)).toThrow(/L1/)
  })

  it('P1-P4: removing each Login token trips its own gate', () => {
    const real = readGated(LOGIN_INDEX_PATH)
    const cases: Array<[string, string, RegExp]> = [
      ['useSearchParams()', 'useOtherThing()', /P1/],
      ['resolveLoginOpenRequest(', 'otherResolver(', /P2/],
      ['openLoginOverlay(store)', 'openLoginOverlay(which)', /P3/],
      ['{ replace: true }', '{ replace: false }', /P4/]
    ]
    for (const [token, replacement, expected] of cases) {
      expect(real).toContain(token)
      const specimen = real.split(token).join(replacement)
      expect(() => assertLoginWiring(specimen)).toThrow(expected)
    }
  })

  it('a token appearing only inside comments does not satisfy a gate', () => {
    const stripped = gateSource(
      [
        '// resolveSignInStates(collectSignInInputs(',
        '/* navigate(buildLoginOpenPath( */',
        'const real = 1'
      ].join('\n')
    )
    expect(stripped).toContain('const real = 1')
    expect(() => assertNoticeWiring(stripped)).toThrow()
  })
})

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}
