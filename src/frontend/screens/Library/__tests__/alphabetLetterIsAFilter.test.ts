/**
 * Source gates for WR-10 / WR-11 / D-08a (quick task 260827-vpl).
 *
 * DECISION 1 (`260827-vpl-PLAN.md`): the alphabet letter demonstrably
 * removes games from the rendered set inside `libraryToShow` -- it is a
 * filter, not an index/jump control. That reclassification has three
 * consequences, gated here at the source level because `Library/index.tsx`'s
 * transitive import graph (ContextProvider, the game-list stack, colocated
 * CSS) cannot be mounted in this jest project (`testEnvironment: 'node'`,
 * no jsdom, no react-test-renderer -- see `clearAllFiltersCoverage.test.ts`
 * and `libraryHeaderVisibility.test.ts` for the same idiom):
 *
 *   S1 -- `clearAllFilters` clears the letter (WR-11: the escape hatch must
 *         not consume itself and leave the user with a live, invisible
 *         filter and a spent button).
 *   S2 -- hiding the alphabet strip clears the letter (D-08a: the strip is
 *         the letter's only on-screen indicator; a user must never be able
 *         to hide it while the filter it represents stays live).
 *   S3 -- the zero-state branch admits the letter (WR-10: a letter-only
 *         zero result must reach `FilterZeroResult`, not the generic
 *         `EmptyLibraryMessage`).
 *
 * Reuses `clearAllFiltersCoverage.test.ts`'s brace-matching extractor idiom
 * (`indexOf(<signature>)` + depth-count loop), throwing the same loud
 * "this gate has rotted" error on a missing signature.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const LIBRARY_INDEX = join(__dirname, '..', 'index.tsx')

/** Brace-matched extraction of one `const <name> = () => { ... }` body. */
function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) {
    throw new Error(
      `"${signature}" not found in Library/index.tsx -- this gate has ` +
        'rotted, find where the function moved to and re-point it.'
    )
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced braces while extracting "${signature}"`)
}

function librarySource(): string {
  return readFileSync(LIBRARY_INDEX, 'utf8')
}

describe('the alphabet letter behaves like the filter it is (WR-10 / WR-11 / D-08a)', () => {
  const source = librarySource()

  it('S1: clearAllFilters clears the selected alphabet letter (WR-11)', () => {
    const body = extractFunctionBody(source, 'const clearAllFilters = () => {')
    expect(body).toContain('setAlphabetFilterLetter(null)')
  })

  it('S2: hiding the alphabet strip clears the selected letter (D-08a)', () => {
    const body = extractFunctionBody(
      source,
      'const handleToggleAlphabetFilter = () => {'
    )
    expect(body).toContain('setAlphabetFilterLetter(null)')
  })

  it('S3: the zero-state branch admits the letter, not just activeFilterCount (WR-10)', () => {
    // Comments stripped so the gate cannot be satisfied by prose describing
    // the change (including this very test file's own header, and the
    // plan's own worked example) -- only real code counts.
    const stripped = stripSourceComments(source)
    expect(stripped).toMatch(/activeFilterCount > 0 \|\| alphabetFilterLetter/)
  })

  it('S4: non-vacuity -- each gate above fails against a sabotaged copy of the extracted text', () => {
    const clearAllBody = extractFunctionBody(
      source,
      'const clearAllFilters = () => {'
    )
    const toggleBody = extractFunctionBody(
      source,
      'const handleToggleAlphabetFilter = () => {'
    )
    const strippedCondition = stripSourceComments(source)

    const sabotagedClearAll = clearAllBody.replace(
      'setAlphabetFilterLetter(null)',
      'setAlphabetFilterNothing(null)'
    )
    const sabotagedToggle = toggleBody.replace(
      'setAlphabetFilterLetter(null)',
      'setAlphabetFilterNothing(null)'
    )
    const sabotagedCondition = strippedCondition.replace(
      'activeFilterCount > 0 || alphabetFilterLetter',
      'activeFilterCount > 0'
    )

    expect(sabotagedClearAll).not.toContain('setAlphabetFilterLetter(null)')
    expect(sabotagedToggle).not.toContain('setAlphabetFilterLetter(null)')
    expect(sabotagedCondition).not.toMatch(
      /activeFilterCount > 0 \|\| alphabetFilterLetter/
    )
  })
})
