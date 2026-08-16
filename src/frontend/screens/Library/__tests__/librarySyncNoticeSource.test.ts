/**
 * Source-shape gate for the D-06/D-08/D-09/D-10 wiring in `Library/index.tsx`
 * (34.15-08 Task 3).
 *
 * WHY A SOURCE GATE: `src/frontend/jest.config.js`'s Frontend project runs
 * with `testEnvironment: 'node'` -- no jsdom, no react-test-renderer -- and
 * `Library/index.tsx`'s first line is `import './index.css'`. A bare
 * `import` of anything from that file dies at that stylesheet import before
 * a single assertion runs. This mirrors the established shape
 * (`filterChipRowPlacement.test.ts`, `GlobalStateScopedRefresh.test.ts`):
 * read the real source, strip comments, and assert on the stripped text.
 *
 * ANTI-VACUITY REQUIREMENT (stated verbatim, per
 * `GlobalStateScopedRefresh.test.ts`'s own header, itself citing the lesson
 * Phase 34.2's gap cycles paid for): "a source-text gate without a self-test
 * is a vacuous gate." Every gate below is therefore proven to THROW against
 * a known-bad specimen derived from the REAL file's own text by string
 * manipulation -- never a hand-authored replica, which is the ledgered
 * `grep-assertion-must-fail-against-known-bad-input` requirement this
 * project's own history exists to enforce.
 *
 * What this file proves:
 *   G1: `Library/index.tsx` delegates the render decision to
 *       `resolveSteamSyncIndicator(`, rather than re-inlining the boolean.
 *   G2: the `<SteamSyncNotice` widget is mounted.
 *   G3: the known-bad conjunction (`steam?.library?.length === 0`) is gone,
 *       AND the D-11-fenced global overlay expression
 *       (`refreshing && !refreshingInTheBackground && <UpdateComponent />`)
 *       survives byte-identical.
 *   G4: the notice mount is not wrapped in the library's full-screen error
 *       replacement shape (D-08 negative gate).
 *   G5: the notice mount sits between `<AlphabetFilter` and the MAIN
 *       `<GamesList` (D-10 placement -- above the grid, in normal flow).
 *
 * What this file does NOT and CANNOT prove: that the notice actually
 * renders, what it looks like, or that it visually sits above the grid.
 * Nothing is mounted here and no CSS is evaluated. Those observations are
 * owed to the live human gate (D-16).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const LIBRARY_INDEX_PATH = join(__dirname, '..', 'index.tsx')

// The current, correct mount line -- captured once so every specimen below
// is built by manipulating this exact string rather than a re-typed copy.
const NEW_MOUNT_LINE =
  "{steamSyncMode !== 'hidden' && <SteamSyncNotice mode={steamSyncMode} />}"

// The D-11-fenced global overlay. MUST survive byte-identical through this
// plan and any future one that touches this file.
const FENCED_OVERLAY_LINE =
  '{refreshing && !refreshingInTheBackground && <UpdateComponent />}'

// The verbatim known-bad expression this plan replaces, captured exactly as
// recorded in 34.15-08-PLAN.md's <interfaces> block (Library/index.tsx
// :1013-1019 at HEAD before this plan). This is the literal text the
// ledgered `grep-assertion-must-fail-against-known-bad-input` requirement
// demands the gate be proven against.
const KNOWN_BAD_BLOCK = `{steam?.username &&
  steam?.library?.length === 0 &&
  refreshingInTheBackground && (
    <UpdateComponent
      message={t('steam.syncing', 'Syncing your Steam library…')}
    />
  )}`

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function readGated(path: string): string {
  return gateSource(readFileSync(path, 'utf8'))
}

/**
 * G1: the decision is delegated to the pure resolver, not re-inlined.
 */
function assertResolverDelegated(source: string): void {
  if (!source.includes('resolveSteamSyncIndicator(')) {
    throw new Error(
      'G1 FAILED: resolveSteamSyncIndicator( not found -- the sync-state ' +
        'decision must be delegated to the pure resolver, never re-inlined.'
    )
  }
}

/**
 * G2: the widget is mounted.
 */
function assertNoticeMounted(source: string): void {
  if (!source.includes('<SteamSyncNotice')) {
    throw new Error(
      'G2 FAILED: <SteamSyncNotice not found -- the inline notice must be mounted.'
    )
  }
}

/**
 * G3 (THE CORE GATE): the known-bad conjunction is gone, and the
 * D-11-fenced overlay survives untouched.
 *
 * The occurrence count is pinned at exactly 3, not 2 -- confirmed against
 * the real file at HEAD before this plan: the destructure
 * (`refreshingInTheBackground,`), the D-11-fenced overlay
 * (`refreshing && !refreshingInTheBackground && <UpdateComponent />` at
 * old :1011), AND a third, pre-existing, unrelated site gating the main
 * `<GamesList>` render (`(!refreshing || refreshingInTheBackground) &&`,
 * old :1029) that already existed at HEAD and this plan never touches. A
 * FOURTH occurrence -- not a third -- is what would mean the old guard
 * survived somewhere new.
 */
function assertOldGuardGoneAndFenceIntact(source: string): void {
  if (source.includes('steam?.library?.length === 0')) {
    throw new Error(
      'G3 FAILED: the known-bad conjunction steam?.library?.length === 0 ' +
        'is present -- the old guard survived.'
    )
  }

  const occurrences = (source.match(/refreshingInTheBackground/g) || [])
    .length
  if (occurrences !== 3) {
    throw new Error(
      `G3 FAILED: refreshingInTheBackground occurs ${occurrences} times, ` +
        'expected exactly 3 (the destructure, the D-11-fenced overlay, and ' +
        'the pre-existing GamesList render gate). A fourth occurrence means ' +
        'the old guard survived somewhere new.'
    )
  }

  if (!source.includes(FENCED_OVERLAY_LINE)) {
    throw new Error(
      'G3 FAILED: the D-11-fenced global overlay expression is missing or ' +
        'was altered -- this line must survive byte-identical (D-11).'
    )
  }
}

/**
 * G4 (D-08 negative gate): the notice is not wrapped in the full-screen
 * error-replacement shape. Checked within a window around the mount so a
 * distant, unrelated occurrence of the library's error-surface component
 * elsewhere in the file does not false-positive.
 */
function assertNotFullScreenReplacement(source: string): void {
  const idx = source.indexOf('<SteamSyncNotice')
  if (idx === -1) {
    throw new Error('G4 FAILED: <SteamSyncNotice not found.')
  }
  const windowStart = Math.max(0, idx - 300)
  const windowEnd = Math.min(source.length, idx + 300)
  const surrounding = source.slice(windowStart, windowEnd)
  if (surrounding.includes('ErrorComponent')) {
    throw new Error(
      'G4 FAILED: the library error-replacement component appears within ' +
        '300 characters of the SteamSyncNotice mount -- it must not be ' +
        'reused as a full-screen wrapper here (D-08).'
    )
  }
}

/**
 * G5 (D-10 placement): the notice sits after <AlphabetFilter and before the
 * MAIN <GamesList mount. `<GamesList` is searched starting from the notice's
 * own index (not from 0) because this file also mounts a `<GamesList` for
 * the Favourites lane, which sits BEFORE <AlphabetFilter -- a naive
 * `indexOf('<GamesList')` would find that earlier, unrelated mount and
 * false-negative every real placement.
 */
function assertPlacementAboveGrid(source: string): void {
  const alphabetIdx = source.indexOf('<AlphabetFilter')
  const noticeIdx = source.indexOf('<SteamSyncNotice')

  if (alphabetIdx === -1 || noticeIdx === -1) {
    throw new Error(
      'G5 FAILED: <AlphabetFilter or <SteamSyncNotice not found.'
    )
  }
  if (!(noticeIdx > alphabetIdx)) {
    throw new Error(
      'G5 FAILED: <SteamSyncNotice does not sit after <AlphabetFilter.'
    )
  }

  const gamesListIdx = source.indexOf('<GamesList', noticeIdx)
  if (gamesListIdx === -1) {
    throw new Error(
      'G5 FAILED: no <GamesList mount found after <SteamSyncNotice -- the ' +
        'notice must sit above the grid, not after or detached from it.'
    )
  }
  if (!(noticeIdx < gamesListIdx)) {
    throw new Error(
      'G5 FAILED: <SteamSyncNotice does not sit before <GamesList.'
    )
  }
}

function runAllGates(source: string): void {
  assertResolverDelegated(source)
  assertNoticeMounted(source)
  assertOldGuardGoneAndFenceIntact(source)
  assertNotFullScreenReplacement(source)
  assertPlacementAboveGrid(source)
}

describe('Library/index.tsx -- Steam sync notice wiring (real source)', () => {
  const source = readGated(LIBRARY_INDEX_PATH)

  it('G1: delegates to resolveSteamSyncIndicator', () => {
    expect(() => assertResolverDelegated(source)).not.toThrow()
  })

  it('G2: mounts <SteamSyncNotice', () => {
    expect(() => assertNoticeMounted(source)).not.toThrow()
  })

  it('G3: the old guard is gone and the D-11 fence survives', () => {
    expect(() => assertOldGuardGoneAndFenceIntact(source)).not.toThrow()
  })

  it('G4: the notice is not wrapped as a full-screen replacement', () => {
    expect(() => assertNotFullScreenReplacement(source)).not.toThrow()
  })

  it('G5: the notice sits above the grid, after AlphabetFilter', () => {
    expect(() => assertPlacementAboveGrid(source)).not.toThrow()
  })

  it('all gates together pass against the real file', () => {
    expect(() => runAllGates(source)).not.toThrow()
  })
})

describe('RED proofs -- every specimen below is derived from the REAL source by string manipulation', () => {
  const realSource = readGated(LIBRARY_INDEX_PATH)

  it('RED 1 (the core proof): splicing in the VERBATIM known-bad expression trips G3', () => {
    expect(realSource).toContain(NEW_MOUNT_LINE)

    const specimen = realSource.replace(NEW_MOUNT_LINE, KNOWN_BAD_BLOCK)

    expect(specimen).toContain('steam?.library?.length === 0')
    expect(() => assertOldGuardGoneAndFenceIntact(specimen)).toThrow(
      /known-bad conjunction/
    )
  })

  it('RED 2: deleting the resolveSteamSyncIndicator( token trips G1', () => {
    expect(realSource).toContain('resolveSteamSyncIndicator(')

    const specimen = realSource
      .split('resolveSteamSyncIndicator(')
      .join('someUnrelatedFunction(')

    expect(specimen).not.toContain('resolveSteamSyncIndicator(')
    expect(() => assertResolverDelegated(specimen)).toThrow(/G1 FAILED/)
  })

  it('RED 3: deleting the D-11-fenced overlay expression trips G3 fence half -- proving this gate would also catch a D-11 violation', () => {
    expect(realSource).toContain(FENCED_OVERLAY_LINE)

    const specimen = realSource.replace(FENCED_OVERLAY_LINE, '')

    expect(specimen).not.toContain(FENCED_OVERLAY_LINE)
    expect(() => assertOldGuardGoneAndFenceIntact(specimen)).toThrow(
      /G3 FAILED/
    )
  })

  it('RED 4: moving <SteamSyncNotice below the main <GamesList mount trips G5', () => {
    expect(realSource).toContain(NEW_MOUNT_LINE)

    // Remove the mount from its real position, then re-append it at the
    // very end of the file's text -- after every <GamesList occurrence,
    // including the main grid's.
    const withoutMount = realSource.replace(NEW_MOUNT_LINE, '')
    const specimen = `${withoutMount}\n${NEW_MOUNT_LINE}\n`

    const lastGamesListIdx = specimen.lastIndexOf('<GamesList')
    const movedNoticeIdx = specimen.lastIndexOf('<SteamSyncNotice')
    expect(movedNoticeIdx).toBeGreaterThan(lastGamesListIdx)

    expect(() => assertPlacementAboveGrid(specimen)).toThrow(/G5 FAILED/)
  })
})

describe('source-gate stripper integrity', () => {
  const COMMENT_ONLY_SPECIMEN = [
    '// <SteamSyncNotice mode={steamSyncMode} />',
    '/*',
    ' resolveSteamSyncIndicator(',
    '*/',
    '/* <SteamSyncNotice /> */',
    'const real = 1',
    '<AlphabetFilter />'
  ].join('\n')

  it('a tag/token appearing ONLY inside comments does not satisfy any real gate', () => {
    const stripped = gateSource(COMMENT_ONLY_SPECIMEN)
    expect(stripped).not.toContain('<SteamSyncNotice')
    expect(stripped).not.toContain('resolveSteamSyncIndicator(')
    expect(() => assertResolverDelegated(stripped)).toThrow()
    expect(() => assertNoticeMounted(stripped)).toThrow()
  })

  it('real code on the same specimen survives -- the stripper does not delete everything', () => {
    const stripped = gateSource(COMMENT_ONLY_SPECIMEN)
    expect(stripped).toContain('const real = 1')
    expect(stripped).toContain('<AlphabetFilter />')
  })
})
