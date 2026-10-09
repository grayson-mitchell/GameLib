/**
 * Source-shape gates for the Library sign-in notice (Phase 49 plan 09, D-09,
 * D-11, R4, R5, R8, R9; threats T-49-26 and T-49-27).
 *
 * WHY SOURCE GATES: the Frontend jest project runs with `testEnvironment:
 * 'node'` (no jsdom) and no stylesheet transform, so neither
 * `LibrarySignInNotice` nor `Library/index.tsx` can be imported -- both pull in
 * a stylesheet on their first line. The row DECISION is proven directly in
 * `librarySignInRows.test.ts`; what only text can prove is the structural
 * contract: non-modal, in-flow, probe-free, click-only navigation, store names
 * interpolated rather than concatenated.
 *
 * ANTI-VACUITY: a source gate without a self-test is a vacuous gate. Every
 * gate below is proven to THROW against a specimen derived from the REAL
 * file's own text by string manipulation, never a hand-authored replica
 * (the `librarySyncNoticeSource.test.ts` shape).
 *
 * Gates:
 *   G1  no `Dialog`, `showDialogBox`, `notify(` or `window.api` in the notice.
 *   G2  `navigate(buildLoginOpenPath(` only inside an `onClick={() =>` arrow,
 *       and never inside a `useEffect` body.
 *   G3  the stylesheet declares no `position` and only one top-level selector.
 *   G4  the notice mounts after `<AlphabetFilter`, before the main
 *       `<GamesList`, and not within 300 characters of `ErrorComponent`.
 *   G5  (R8) the `libraryToShow` derivation reads no sign-in state.
 *   G6  (P3) neither file calls a `window.api` member named `*Probe*` or
 *       `*SignIn*`, so mounting the Library starts no probe.
 *   G7  (R9) store names enter `tGamelib` only as `store: RunnerToStore[..]`
 *       interpolation values, never by concatenation.
 *   G8  (R5) the dismiss button sits inside a `row.dismissible &&` guard.
 *   G9  (R7 groundwork) the state still comes from
 *       `resolveSignInStates(collectSignInInputs(`.
 *
 * Not provable here: that the notice paints, that it reads as information
 * rather than an error across themes, or that it clears the grid. Those are
 * owed to the live gate (49-12 UAT).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const NOTICE_DIR = join(__dirname, '..', 'components', 'LibrarySignInNotice')
const NOTICE_PATH = join(NOTICE_DIR, 'index.tsx')
const SCSS_PATH = join(NOTICE_DIR, 'index.scss')
const LIBRARY_INDEX_PATH = join(__dirname, '..', 'index.tsx')

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function readGated(path: string): string {
  return gateSource(readFileSync(path, 'utf8'))
}

// SCSS uses line comments: the shared stripper drops block comments and whole-line ones.
function readGatedScss(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

function fail(label: string, why: string): never {
  throw new Error(`${label} FAILED: ${why}`)
}

/** The source of the balanced call that opens at `openParenIdx`. */
function balancedCall(source: string, openParenIdx: number): string {
  let depth = 0
  for (let i = openParenIdx; i < source.length; i++) {
    if (source[i] === '(') {
      depth++
    } else if (source[i] === ')') {
      depth--
      if (depth === 0) {
        return source.slice(openParenIdx, i + 1)
      }
    }
  }
  return source.slice(openParenIdx)
}

// G1 --------------------------------------------------------------------
function assertNotModalNorApi(source: string): void {
  for (const token of ['Dialog', 'showDialogBox', 'notify(', 'window.api']) {
    if (source.includes(token)) {
      fail('G1', `the notice contains \`${token}\`.`)
    }
  }
}

// G2 --------------------------------------------------------------------
function assertNavigateOnlyFromClick(source: string): void {
  const needle = 'navigate(buildLoginOpenPath('
  let from = 0
  let seen = 0
  for (;;) {
    const idx = source.indexOf(needle, from)
    if (idx === -1) {
      break
    }
    seen++
    if (!/onClick=\{\(\)\s*=>\s*$/.test(source.slice(0, idx))) {
      fail('G2', 'navigate(buildLoginOpenPath( is outside an onClick arrow.')
    }
    from = idx + needle.length
  }
  if (seen === 0) {
    fail('G2', 'no navigate(buildLoginOpenPath( found -- Sign in is unwired.')
  }

  let effectFrom = 0
  for (;;) {
    const idx = source.indexOf('useEffect(', effectFrom)
    if (idx === -1) {
      break
    }
    const call = balancedCall(source, idx + 'useEffect'.length)
    if (call.includes('navigate(')) {
      fail(
        'G2',
        'a useEffect body calls navigate( -- navigation must be a click.'
      )
    }
    effectFrom = idx + 'useEffect('.length
  }
}

// G3 --------------------------------------------------------------------
function assertScssInFlowAndScoped(scss: string): void {
  if (/\bposition\s*:/.test(scss)) {
    fail('G3', 'the stylesheet declares a position.')
  }
  let depth = 0
  let selectorStart = 0
  for (let i = 0; i < scss.length; i++) {
    const ch = scss[i]
    if (ch === '{') {
      if (depth === 0) {
        const selector = scss.slice(selectorStart, i).trim()
        if (selector !== '.LibrarySignInNotice') {
          fail('G3', `top-level selector \`${selector}\` is not scoped.`)
        }
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        selectorStart = i + 1
      }
    }
  }
}

// G4 --------------------------------------------------------------------
function assertNoticePlacement(source: string): void {
  const alphabetIdx = source.indexOf('<AlphabetFilter')
  const noticeIdx = source.indexOf('<LibrarySignInNotice')
  if (alphabetIdx === -1 || noticeIdx === -1) {
    fail('G4', '<AlphabetFilter or <LibrarySignInNotice not found.')
  }
  if (!(noticeIdx > alphabetIdx)) {
    fail('G4', 'the notice does not sit after <AlphabetFilter.')
  }
  // Searched from the notice's own index: the Favourites lane mounts an
  // earlier, unrelated <GamesList.
  const gamesListIdx = source.indexOf('<GamesList', noticeIdx)
  if (gamesListIdx === -1) {
    fail('G4', 'no main <GamesList after the notice.')
  }
  const around = source.slice(
    Math.max(0, noticeIdx - 300),
    Math.min(source.length, noticeIdx + 300)
  )
  if (around.includes('ErrorComponent')) {
    fail('G4', 'ErrorComponent appears within 300 characters of the mount.')
  }
}

// G5 --------------------------------------------------------------------
function libraryToShowBlock(source: string): string {
  const start = source.indexOf('const libraryToShow = useMemo(')
  if (start === -1) {
    fail('G5', 'the libraryToShow derivation was not found.')
  }
  return balancedCall(source, source.indexOf('(', start))
}

function assertDerivationReadsNoSignIn(source: string): void {
  const block = libraryToShowBlock(source)
  for (const token of [
    'signIn',
    'SignIn',
    'legendaryConfigStore',
    "'expired'"
  ]) {
    if (block.includes(token)) {
      fail(
        'G5',
        `libraryToShow reads \`${token}\` -- signed-out must stay renderable.`
      )
    }
  }
}

// G6 --------------------------------------------------------------------
function assertNoProbeApi(source: string, label: string): void {
  const match = /window\.api\.\w*(Probe|SignIn)\w*/.exec(source)
  if (match) {
    fail('G6', `${label} calls \`${match[0]}\`.`)
  }
}

// G7 --------------------------------------------------------------------
function assertStoreInterpolated(source: string): void {
  const needle = 'RunnerToStore['
  let from = 0
  let seen = 0
  for (;;) {
    const idx = source.indexOf(needle, from)
    if (idx === -1) {
      break
    }
    seen++
    if (!source.slice(0, idx).endsWith('store: ')) {
      fail('G7', 'a RunnerToStore[ lookup is not an interpolation value.')
    }
    from = idx + needle.length
  }
  if (seen === 0) {
    fail('G7', 'no RunnerToStore[ lookup found.')
  }
  if (
    /\+\s*(tGamelib\(|RunnerToStore\[)/.test(source) ||
    /(\)|\])\s*\+\s*['"`]/.test(source) ||
    /\$\{[^}]*(tGamelib\(|RunnerToStore\[)/.test(source)
  ) {
    fail('G7', 'a notice string is joined by concatenation.')
  }
}

// G8 --------------------------------------------------------------------
function assertDismissGuarded(source: string): void {
  if (
    !/row\.dismissible\s*&&\s*\(\s*<button\s+type="button"\s+className="LibrarySignInNotice__dismiss"/.test(
      source
    )
  ) {
    fail('G8', 'the dismiss button is not inside a row.dismissible && guard.')
  }
}

// G9 --------------------------------------------------------------------
function assertSelectorViaCollector(source: string): void {
  if (!/resolveSignInStates\(\s*collectSignInInputs\(/.test(source)) {
    fail('G9', 'resolveSignInStates(collectSignInInputs( not found.')
  }
}

describe('LibrarySignInNotice -- structural gates (real source)', () => {
  const notice = readGated(NOTICE_PATH)
  const scss = readGatedScss(SCSS_PATH)
  const library = readGated(LIBRARY_INDEX_PATH)

  it('G1: no modal, OS notification or window.api call', () => {
    expect(() => assertNotModalNorApi(notice)).not.toThrow()
  })

  it('G2: Sign in navigates only from a click, never from an effect', () => {
    expect(() => assertNavigateOnlyFromClick(notice)).not.toThrow()
  })

  it('G3: the stylesheet is in-flow and scoped', () => {
    expect(() => assertScssInFlowAndScoped(scss)).not.toThrow()
  })

  it('G3: status-danger appears only under the expired modifier', () => {
    const lines = scss.split('\n')
    const hits = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes('status-danger'))
    expect(hits).toHaveLength(1)
    const expiredIdx = lines.findIndex((l) => l.includes('&__row--expired'))
    expect(expiredIdx).toBeGreaterThan(-1)
    expect(hits[0].i).toBeGreaterThan(expiredIdx)
    expect(hits[0].i - expiredIdx).toBeLessThan(3)
  })

  it('G4: the notice sits above the grid, after AlphabetFilter, away from ErrorComponent', () => {
    expect(() => assertNoticePlacement(library)).not.toThrow()
  })

  it('G5: the library derivation reads no sign-in state (R8)', () => {
    expect(() => assertDerivationReadsNoSignIn(library)).not.toThrow()
  })

  it('G6: neither file probes or reads sign-in state through window.api (P3)', () => {
    expect(() => assertNoProbeApi(notice, 'the notice')).not.toThrow()
    expect(() => assertNoProbeApi(library, 'Library/index.tsx')).not.toThrow()
  })

  it('G7: store names are interpolated, never concatenated (R9)', () => {
    expect(() => assertStoreInterpolated(notice)).not.toThrow()
  })

  it('G8: the dismiss control is guarded by row.dismissible (R5)', () => {
    expect(() => assertDismissGuarded(notice)).not.toThrow()
  })

  it('G9: state flows through the collector and the common selector', () => {
    expect(() => assertSelectorViaCollector(notice)).not.toThrow()
  })

  it('uses exactly the five library.signIn keys under the gamelib namespace', () => {
    const keys = [...notice.matchAll(/'(gamelib:[A-Za-z0-9_.]+)'/g)].map(
      (m) => m[1]
    )
    expect([...new Set(keys)].sort()).toEqual([
      'gamelib:library.signIn.dismiss',
      'gamelib:library.signIn.expired',
      'gamelib:library.signIn.notConnected',
      'gamelib:library.signIn.reconnect',
      'gamelib:library.signIn.signIn'
    ])
  })
})

describe('RED proofs -- specimens derived from the REAL source', () => {
  const notice = readGated(NOTICE_PATH)
  const scss = readGatedScss(SCSS_PATH)
  const library = readGated(LIBRARY_INDEX_PATH)

  it('G1: each forbidden token trips the gate', () => {
    for (const token of ['Dialog', 'showDialogBox', 'notify(', 'window.api']) {
      expect(() => assertNotModalNorApi(`${notice}\n${token}`)).toThrow(/G1/)
    }
  })

  it('G2: navigate outside an onClick arrow trips the gate', () => {
    const real = 'onClick={() => navigate(buildLoginOpenPath('
    expect(notice).toContain(real)
    const specimen = notice.replace(
      real,
      'onMount(navigate(buildLoginOpenPath('
    )
    expect(() => assertNavigateOnlyFromClick(specimen)).toThrow(/G2/)
  })

  it('G2: navigate inside a useEffect body trips the gate', () => {
    expect(notice).toContain('useEffect(() => {')
    const specimen = notice.replace(
      'useEffect(() => {',
      "useEffect(() => {\n    onClick={() => navigate(buildLoginOpenPath('steam'))}\n"
    )
    expect(() => assertNavigateOnlyFromClick(specimen)).toThrow(/useEffect/)
  })

  it('G3: a position declaration trips the gate', () => {
    expect(() =>
      assertScssInFlowAndScoped(
        `${scss}\n.LibrarySignInNotice { position: fixed; }`
      )
    ).toThrow(/G3/)
  })

  it('G3: an unscoped top-level selector trips the gate', () => {
    expect(() =>
      assertScssInFlowAndScoped(`${scss}\n.button { color: red; }`)
    ).toThrow(/G3/)
  })

  it('G4: moving the notice below the main GamesList trips the gate', () => {
    const mount = /<LibrarySignInNotice\s*\/>/
    expect(library).toMatch(mount)
    const specimen = `${library.replace(mount, '')}\n<LibrarySignInNotice />\n`
    expect(() => assertNoticePlacement(specimen)).toThrow(/G4/)
  })

  it('G4: an ErrorComponent beside the mount trips the gate', () => {
    const mount = /<LibrarySignInNotice\s*\/>/
    const specimen = library.replace(
      mount,
      '<LibrarySignInNotice /><ErrorComponent />'
    )
    expect(() => assertNoticePlacement(specimen)).toThrow(/ErrorComponent/)
  })

  it('G5: reading a sign-in token inside libraryToShow trips the gate', () => {
    const anchor = 'let library = [...gamesForAlphabetFilter]'
    expect(library).toContain(anchor)
    for (const token of [
      'signIn',
      'SignIn',
      'legendaryConfigStore',
      "'expired'"
    ]) {
      const specimen = library.replace(anchor, `${anchor}; void ${token}`)
      expect(() => assertDerivationReadsNoSignIn(specimen)).toThrow(/G5/)
    }
  })

  it('G6: a Probe or SignIn window.api member trips the gate', () => {
    expect(() =>
      assertNoProbeApi(`${library}\nwindow.api.runSignInProbePass()`, 'x')
    ).toThrow(/G6/)
    expect(() =>
      assertNoProbeApi(`${notice}\nwindow.api.getSignInProbeOutcomes()`, 'x')
    ).toThrow(/G6/)
  })

  it('G7: a lookup that is not an interpolation value trips the gate', () => {
    expect(notice).toContain('store: RunnerToStore[')
    const specimen = notice.replace('store: RunnerToStore[', 'RunnerToStore[')
    expect(() => assertStoreInterpolated(specimen)).toThrow(/G7/)
  })

  it('G7: concatenating a translated string with a store name trips the gate', () => {
    const specimen = `${notice}\nconst bad = tGamelib('gamelib:x', 'y') + RunnerToStore[row.store]`
    expect(() => assertStoreInterpolated(specimen)).toThrow(/G7/)
  })

  it('G8: an unguarded dismiss button trips the gate', () => {
    expect(notice).toContain('row.dismissible &&')
    const specimen = notice.replace('row.dismissible &&', 'true &&')
    expect(() => assertDismissGuarded(specimen)).toThrow(/G8/)
  })

  it('G9: inlining a flag comparison in place of the collector trips the gate', () => {
    const specimen = notice.replace(
      /resolveSignInStates\(\s*collectSignInInputs\(/,
      'inlineFlagCheck('
    )
    expect(() => assertSelectorViaCollector(specimen)).toThrow(/G9/)
  })

  it('a token appearing only inside comments does not satisfy or trip a gate', () => {
    const stripped = gateSource(
      [
        '// window.api.getSignInProbeOutcomes()',
        '/* Dialog showDialogBox notify( */',
        'const real = 1'
      ].join('\n')
    )
    expect(stripped).toContain('const real = 1')
    expect(() => assertNotModalNorApi(stripped)).not.toThrow()
    expect(() => assertSelectorViaCollector(stripped)).toThrow(/G9/)
  })
})
