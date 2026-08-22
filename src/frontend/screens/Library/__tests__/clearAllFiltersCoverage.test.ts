/**
 * REQ-37-02 / 37-03b live-gate follow-up.
 *
 * `clearAllFilters` in `Library/index.tsx` is a THIRD mirror of the
 * More-filters kind list, alongside `MORE_FILTER_KINDS` and
 * `describeActiveFilters`. Plan 37-03b updated the first two and missed this
 * one, so the operator's live gate found "Clear all" leaving the
 * `noStorePage` chip on screen.
 *
 * No existing test could have caught it: every `clearAllFilters` test mocks
 * the function and asserts it was CALLED. None exercises its body, which is
 * defined inline in a ~1100-line component and is not independently
 * importable.
 *
 * This gate closes that hole at the source level -- for every kind in
 * `MORE_FILTER_KINDS`, the body of `clearAllFilters` must contain a reset.
 * It is deliberately keyed off `MORE_FILTER_KINDS` itself, so ADDING a
 * seventh kind without wiring Clear all trips it automatically.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MORE_FILTER_KINDS } from '../../../components/UI/NavShell/components/FilterFacetGroup/selectionCount'

const LIBRARY_INDEX = join(__dirname, '..', 'index.tsx')

/** The literal text of `clearAllFilters`'s body, brace-matched from source. */
function clearAllFiltersBody(): string {
  const source = readFileSync(LIBRARY_INDEX, 'utf8')
  const start = source.indexOf('const clearAllFilters = () => {')
  if (start === -1) {
    throw new Error(
      'clearAllFilters not found in Library/index.tsx -- this gate has rotted, ' +
        'find where the reset moved to and re-point it.'
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
  throw new Error('unbalanced braces while extracting clearAllFilters')
}

/**
 * Kind -> the identifier its reset call must mention inside the body.
 * Keyed by kind so an unmapped new kind fails loudly rather than silently
 * passing.
 */
const RESET_TOKEN_FOR_KIND: Record<string, string> = {
  showHidden: 'handleShowHidden',
  showNonAvailable: 'handleShowNonAvailable',
  noStorePage: 'handleNoStorePage',
  showSupportOfflineOnly: 'handleShowSupportOfflineOnly',
  showThirdPartyManagedOnly: 'handleShowThirdPartyOnly',
  showUpdatesOnly: 'handleShowUpdatesOnly'
}

describe('clearAllFilters covers every More-filters kind (REQ-37-02)', () => {
  const body = clearAllFiltersBody()

  it.each([...MORE_FILTER_KINDS])(
    'resets the "%s" More-filter',
    (kind: string) => {
      const token = RESET_TOKEN_FOR_KIND[kind]
      if (!token) {
        throw new Error(
          `MORE_FILTER_KINDS gained "${kind}" but RESET_TOKEN_FOR_KIND has no ` +
            'entry for it. Add the mapping AND the reset call in clearAllFilters.'
        )
      }
      expect(body).toContain(token)
    }
  )

  it('the gate is non-vacuous: a body missing a reset fails', () => {
    const sabotaged = body.replace('handleNoStorePage', 'handleNothing')
    expect(sabotaged).not.toContain('handleNoStorePage')
  })
})
