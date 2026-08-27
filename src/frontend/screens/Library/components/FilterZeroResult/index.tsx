/**
 * The zero-result empty state (34.11-08 Task 3) -- shown when the current
 * filters produce zero games, naming the filters responsible rather than a
 * one-size-fits-all message (D-30). `EmptyLibraryMessage` (a genuinely
 * empty library, no filters active) is untouched and stays the fallback
 * for that separate case.
 *
 * Builds its sentence from the exact same `chipLabelSpec`/`joinChipLabels`
 * pair the chip row uses -- PLUS one deliberate exception (WR-10 / D-08
 * amended 2026-08-27, quick task 260827-vpl): the alphabet letter. DECISION 1
 * of that task's plan reclassified the letter as a genuine filter (it
 * removes games from `libraryToShow` via `library.filter(...)`, it does not
 * scroll/seek), so a letter-only zero result must say why -- but the letter
 * still does NOT become an `ActiveFilterDescriptor` and therefore gets no
 * chip in `FilterChipRow` (that would breach the UI-SPEC source gate at
 * `FilterChipRow/__tests__/index.test.tsx:777-782` and is a design
 * decision, not this finding's fix). This file is therefore the ONLY
 * surface that names the letter outside the strip itself -- which is why
 * D-08a (same task) clears the letter when the strip is hidden: the strip
 * is the letter's sole always-visible indicator everywhere else.
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import LibraryContext from '../../LibraryContext'
import {
  chipLabelSpec,
  joinChipLabels,
  resolveLabel,
  ChipLabelSpec
} from '../FilterChipRow/chipLabels'
import './index.scss'

export default function FilterZeroResult() {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const {
    activeFilterDescriptors,
    activeFilterCount,
    alphabetFilterLetter,
    clearAllFilters,
    __isDefaultLibraryContext: isDefaultLibraryContext
  } = useContext(LibraryContext)

  // Same guard order as FilterChipRow: the sentinel first (a dead surface
  // must say so at the console), the zero-count early return only after.
  // The sentinel check MUST stay first -- a selected letter must never
  // smuggle a render past a dead context (WR-10/D-08a non-regression, B5).
  if (isDefaultLibraryContext) {
    console.error(
      'FilterZeroResult rendered outside LibraryContext.Provider -- its Clear all action would be inert. Mount it only inside the provider.'
    )
    return null
  }

  // WR-10: widened to admit a letter-only zero result. Without this, a user
  // who picks only a letter and gets zero matches sees `EmptyLibraryMessage`
  // ("Your library is empty") instead of anything naming the letter.
  if (activeFilterCount === 0 && !alphabetFilterLetter) {
    return null
  }

  const labels = activeFilterDescriptors
    .map((descriptor) => chipLabelSpec(descriptor))
    .filter((spec): spec is ChipLabelSpec => spec !== null)
    .map((spec) => resolveLabel(spec, t, tGamelib))

  // The one deliberate exception to "every label here is also a chip"
  // (see the header comment): the letter is a real filter but not a
  // descriptor, so it is appended here rather than flowing through
  // chipLabelSpec/activeFilterDescriptors like everything above. `'#'` is
  // not a literal to display -- it is spelled out as "a number", matching
  // AlphabetFilter's own on-screen label for that button.
  if (alphabetFilterLetter) {
    labels.push(
      alphabetFilterLetter === '#'
        ? tGamelib(
            'gamelib:library.filterPanel.emptyAlphabetNumber',
            'Starting with a number'
          )
        : tGamelib(
            'gamelib:library.filterPanel.emptyAlphabetLetter',
            'Starting with "{{letter}}"',
            { letter: alphabetFilterLetter }
          )
    )
  }

  // WR-12, defence in depth: `activeFilterCount` is now derived upstream
  // from `renderableActiveFilters` (`Library/index.tsx`), so it should never
  // be positive with an empty `labels` here -- but this guard makes
  // "No games match ." unrepresentable at the render site regardless of
  // what a caller supplies (e.g. a hand-built context in a test). The
  // `chipLabelSpec` null-filter above predates the review (`726b96f93`) and
  // is now redundant with the upstream filter, but harmless to keep.
  if (labels.length === 0) {
    return null
  }

  const filters = joinChipLabels(labels)

  return (
    <div className="FilterZeroResult">
      <h3 className="FilterZeroResult__heading">
        {tGamelib(
          'gamelib:library.filterPanel.emptyHeading',
          'No games match your filters'
        )}
      </h3>
      <p className="FilterZeroResult__body">
        {tGamelib(
          'gamelib:library.filterPanel.emptyBody',
          'No games match {{filters}}.',
          { filters }
        )}
      </p>
      <button
        type="button"
        className="FilterZeroResult__action"
        onClick={clearAllFilters}
      >
        {tGamelib(
          'gamelib:library.filterPanel.emptyClearAll',
          'Clear all filters'
        )}
      </button>
    </div>
  )
}
