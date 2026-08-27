/**
 * The zero-result empty state (34.11-08 Task 3) -- shown when the current
 * filters produce zero games, naming the filters responsible rather than a
 * one-size-fits-all message (D-30). `EmptyLibraryMessage` (a genuinely
 * empty library, no filters active) is untouched and stays the fallback
 * for that separate case.
 *
 * Builds its sentence from the exact same `chipLabelSpec`/`joinChipLabels`
 * pair the chip row uses, so the sentence can never name a filter the chip
 * row does not also show as a chip.
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
    clearAllFilters,
    __isDefaultLibraryContext: isDefaultLibraryContext
  } = useContext(LibraryContext)

  // Same guard order as FilterChipRow: the sentinel first (a dead surface
  // must say so at the console), the zero-count early return only after.
  if (isDefaultLibraryContext) {
    console.error(
      'FilterZeroResult rendered outside LibraryContext.Provider -- its Clear all action would be inert. Mount it only inside the provider.'
    )
    return null
  }

  if (activeFilterCount === 0) {
    return null
  }

  const labels = activeFilterDescriptors
    .map((descriptor) => chipLabelSpec(descriptor))
    .filter((spec): spec is ChipLabelSpec => spec !== null)
    .map((spec) => resolveLabel(spec, t, tGamelib))
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
