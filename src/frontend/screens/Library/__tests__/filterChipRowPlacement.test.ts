/**
 * Render-order gate for `FilterChipRow` inside `.listing` (quick task
 * 260815-qf0).
 *
 * The defect this locks shut: `.listing` is the scrolling container, and the
 * chip row used to render FIFTH inside it -- after `RecentlyPlayed`, the
 * Favourites lane, `LibraryHeader` and `AlphabetFilter`. On relaunch with
 * filters persisted, the chips were therefore below the fold, and nothing on
 * screen explained why the library looked short. `Skill("sketch-findings-gamelib")`
 * -> `references/library-filtering.md:222` states the governing rule directly:
 * "Do not hide filter state in the panel alone. Without chips the user cannot
 * tell why the result set shrank."
 *
 * WHY A SOURCE GATE AND NOT A RENDER TEST. `src/frontend/jest.config.js` sets
 * `testEnvironment: 'node'`: there is no jsdom and no react-test-renderer in
 * this project, and `Library/index.tsx`'s transitive import graph pulls in the
 * whole ContextProvider/game-list stack plus colocated CSS. A comment-stripped
 * source gate is the ESTABLISHED shape for this file (see
 * `libraryHeaderVisibility.test.ts`), not a fallback.
 *
 * WHAT THIS FILE DOES NOT AND CANNOT PROVE: that the chips render, what they
 * look like, whether they are adequately separated from the "Played Recently"
 * heading, or that an unfiltered library opens no gap at the top. Nothing is
 * mounted here and no CSS is evaluated. Those observations are owed to the
 * live human gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const LIBRARY_INDEX_PATH = join(__dirname, '..', 'index.tsx')

const CHIP_ROW_TOKEN = '<FilterChipRow'
const RECENTLY_PLAYED_TOKEN = '<RecentlyPlayed'
const TOP_ANCHOR_TOKEN = '<span id="top" />'

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
 * THE ONE PREDICATE. Both the real-source spec and the known-bad specimen
 * spec are driven through this exact function -- a specimen checked by a
 * hand-rebuilt copy of the assertion is a replica, and a replica drifts
 * silently away from the thing it claims to guard.
 */
function chipRowPrecedesRecentlyPlayed(gatedSource: string): boolean {
  const chipRowIndex = gatedSource.indexOf(CHIP_ROW_TOKEN)
  const recentlyPlayedIndex = gatedSource.indexOf(RECENTLY_PLAYED_TOKEN)

  if (chipRowIndex === -1 || recentlyPlayedIndex === -1) {
    return false
  }

  return chipRowIndex < recentlyPlayedIndex
}

/**
 * The OLD, shipped-until-this-task order, reproduced verbatim in structure.
 * This is the permanent RED proof: if someone later moves the chip row back
 * below `RecentlyPlayed`, the real-source spec fails for exactly the reason
 * this specimen fails here.
 */
const OLD_ORDER_SPECIMEN = [
  '<div className="listing">',
  '  <span id="top" />',
  '  {showRecentGames && (',
  '    <RecentlyPlayed',
  '      handleModal={handleModal}',
  '      onlyInstalled={libraryTopSection.endsWith("installed")}',
  '      showHidden={showHidden}',
  '    />',
  '  )}',
  '  <LibraryHeader list={libraryToShow} totalGames={unfilteredGameCount} />',
  '  {showAlphabetFilter && <AlphabetFilter />}',
  '  <FilterChipRow />',
  '</div>'
].join('\n')

/**
 * The NEW order, as a positive control. Without this, a predicate that
 * returned `false` unconditionally would satisfy the known-bad spec and the
 * gate would be vacuous on that half.
 */
const NEW_ORDER_SPECIMEN = [
  '<div className="listing">',
  '  <span id="top" />',
  '  <FilterChipRow />',
  '  {showRecentGames && (',
  '    <RecentlyPlayed',
  '      handleModal={handleModal}',
  '      showHidden={showHidden}',
  '    />',
  '  )}',
  '</div>'
].join('\n')

/**
 * Proves the stripper is load-bearing BEFORE any gate leans on it. Without
 * this, the ordering gate could be satisfied by a source file that merely
 * NAMES the tag in a comment above `RecentlyPlayed` -- which is precisely the
 * defect class `stripSourceComments` was extracted to close.
 */
describe('source-gate stripper integrity', () => {
  const COMMENT_ONLY_SPECIMEN = [
    '// <FilterChipRow />',
    '/*',
    ' <FilterChipRow />',
    '*/',
    '/* <FilterChipRow /> */',
    'const real = 1',
    '<RecentlyPlayed showHidden={showHidden} />'
  ].join('\n')

  it('carries the chip-row tag before the RecentlyPlayed tag BEFORE stripping', () => {
    expect(COMMENT_ONLY_SPECIMEN.indexOf(CHIP_ROW_TOKEN)).toBeGreaterThan(-1)
    expect(COMMENT_ONLY_SPECIMEN.indexOf(CHIP_ROW_TOKEN)).toBeLessThan(
      COMMENT_ONLY_SPECIMEN.indexOf(RECENTLY_PLAYED_TOKEN)
    )
  })

  it('a tag appearing ONLY inside line and block comments does not satisfy the ordering predicate', () => {
    expect(gateSource(COMMENT_ONLY_SPECIMEN)).not.toContain(CHIP_ROW_TOKEN)
    expect(chipRowPrecedesRecentlyPlayed(gateSource(COMMENT_ONLY_SPECIMEN))).toBe(
      false
    )
  })

  it('real code on the same specimen survives -- the stripper is not simply deleting everything', () => {
    const stripped = gateSource(COMMENT_ONLY_SPECIMEN)

    expect(stripped).toContain('const real = 1')
    expect(stripped).toContain(RECENTLY_PLAYED_TOKEN)
  })
})

describe('predicate non-vacuity -- known-bad and known-good specimens', () => {
  it('SANITY: the OLD shipped order (chips last) does NOT satisfy the predicate', () => {
    expect(chipRowPrecedesRecentlyPlayed(gateSource(OLD_ORDER_SPECIMEN))).toBe(
      false
    )
  })

  it('SANITY: the NEW order (chips first) DOES satisfy the predicate -- so it is not false unconditionally', () => {
    expect(chipRowPrecedesRecentlyPlayed(gateSource(NEW_ORDER_SPECIMEN))).toBe(
      true
    )
  })

  it('SANITY: a source naming neither tag is false rather than throwing', () => {
    expect(chipRowPrecedesRecentlyPlayed(gateSource('const x = 1'))).toBe(false)
  })
})

describe('Library/index.tsx -- FilterChipRow renders above RecentlyPlayed', () => {
  const source = readGated(LIBRARY_INDEX_PATH)

  it('renders both the chip row and the RecentlyPlayed lane, with the chip row FIRST', () => {
    expect(source.indexOf(CHIP_ROW_TOKEN)).toBeGreaterThan(-1)
    expect(source.indexOf(RECENTLY_PLAYED_TOKEN)).toBeGreaterThan(-1)
    expect(source.indexOf(CHIP_ROW_TOKEN)).toBeLessThan(
      source.indexOf(RECENTLY_PLAYED_TOKEN)
    )
  })

  it('satisfies the SAME predicate the known-bad specimen fails', () => {
    expect(chipRowPrecedesRecentlyPlayed(source)).toBe(true)
  })

  /**
   * A "hoist" implemented as a copy rather than a move would satisfy the
   * ordering assertions above while rendering the chips twice.
   */
  it('mounts the chip row exactly once', () => {
    expect(source.split(CHIP_ROW_TOKEN).length - 1).toBe(1)
  })

  /**
   * The back-to-top anchor is the target of the library's scroll-to-top
   * control; it must stay the first child of `.listing`.
   */
  it('keeps the back-to-top anchor above the chip row', () => {
    expect(source.indexOf(TOP_ANCHOR_TOKEN)).toBeGreaterThan(-1)
    expect(source.indexOf(TOP_ANCHOR_TOKEN)).toBeLessThan(
      source.indexOf(CHIP_ROW_TOKEN)
    )
  })
})
