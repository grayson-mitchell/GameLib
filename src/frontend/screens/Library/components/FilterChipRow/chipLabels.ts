/**
 * Pure, React-free label resolver shared by `FilterChipRow` and
 * `FilterZeroResult` (34.11-08 Task 1).
 *
 * Implements D-26 (every non-default filter, including views, gets a
 * label -- `All games` never does), D-27 (a tri-state chip uses a
 * plain-language label, never the raw FilterMode value), and D-28 (no
 * count vocabulary anywhere in a chip label -- counts are a facet-option
 * affordance only). `joinChipLabels` implements D-30's "name the filters
 * responsible" join, shared verbatim by the zero-result sentence so it can
 * never print a list the chip row does not also show.
 *
 * Purity constraint, same reason as `facetLabels.ts`: `src/frontend/jest.config.js`
 * runs with `testEnvironment: 'node'` and this project has no
 * `@testing-library/react` / `react-test-renderer` installed, so every
 * behavioural assertion here has to reach a plain function -- no React
 * import and no translation-hook library import of any kind.
 */

import { RunnerToStore, RUNNABILITY_LABELS } from '../../facetLabels'
import { PRESET_UNCATEGORIZED } from '../../filterEngine'
import type { ActiveFilterDescriptor } from 'frontend/types'

export type ChipLabelSpec =
  | { ns: 'gamelib' | 'default'; key: string; defaultText: string }
  | { literal: string }

/**
 * Resolves one `ActiveFilterDescriptor` to a label spec. Returns `null`
 * only for genuinely unrecognised input (T-34.11-22): a `kind` outside the
 * union, or a value outside the map that kind depends on (`RunnerToStore`
 * for `store`, `RUNNABILITY_LABELS` for `runnability`). Every one of the
 * ten real `kind` members below has an explicit, non-null-returning case --
 * the exhaustive switch with a `never`-typed default is what makes that a
 * compile-time fact rather than a review-time hope.
 */
export function chipLabelSpec(
  descriptor: ActiveFilterDescriptor
): ChipLabelSpec | null {
  switch (descriptor.kind) {
    case 'view': {
      // `describeActiveFilters` never emits view:all -- but if tampered
      // state somehow produced one, no chip must ever say "All games"
      // (D-26).
      if (descriptor.value === 'all') {
        return null
      }
      switch (descriptor.value) {
        case 'installed':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.viewInstalled',
            defaultText: 'Installed'
          }
        case 'recentlyPlayed':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.viewRecentlyPlayed',
            defaultText: 'Recently played'
          }
        case 'favourites':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.viewFavourites',
            defaultText: 'Favourites'
          }
        default:
          return null
      }
    }

    case 'collection':
      // CR-04: the Uncategorized pseudo-category is NOT user data -- it is
      // filterEngine's internal sentinel, which describeActiveFilters emits
      // verbatim as the descriptor value. Falling through to the literal
      // branch below printed `preset_uncategorized` in the chip and in "No
      // games match preset_uncategorized.", while the panel row for the
      // same filter said "Uncategorized". This case resolves it through the
      // SAME key FilterCollectionList/index.tsx uses, so the two can never
      // disagree about the name of one filter -- the drift this module's
      // header comment says it exists to prevent.
      if (descriptor.value === PRESET_UNCATEGORIZED) {
        return {
          ns: 'default',
          key: 'header.uncategorized',
          defaultText: 'Uncategorized'
        }
      }
      // Literal: a real collection name is user data, not copy -- no key
      // lookup, no title-casing, no truncation.
      return { literal: descriptor.value }

    case 'search':
      // Literal: the raw search term, quoted per the UI-SPEC's
      // `Chip -- search` row.
      return { literal: `"${descriptor.value}"` }

    case 'store': {
      if (descriptor.value === 'sideload') {
        return {
          ns: 'gamelib',
          key: 'gamelib:library.storeOther',
          defaultText: 'Other'
        }
      }
      const brand = RunnerToStore[descriptor.value]
      if (brand === undefined) {
        return null
      }
      return { literal: brand }
    }

    case 'runnability': {
      const tuple =
        RUNNABILITY_LABELS[descriptor.value as keyof typeof RUNNABILITY_LABELS]
      if (tuple === undefined) {
        return null
      }
      const [key, defaultText] = tuple
      return { ns: 'gamelib', key, defaultText }
    }

    case 'showHidden':
      switch (descriptor.value) {
        case 'only':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipHiddenOnly',
            defaultText: 'Hidden only'
          }
        case 'show':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipHiddenIncluded',
            defaultText: 'Including hidden'
          }
        default:
          return null
      }

    case 'showNonAvailable':
      switch (descriptor.value) {
        case 'only':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipNonAvailableOnly',
            defaultText: 'Non-available only'
          }
        case 'show':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipNonAvailableIncluded',
            defaultText: 'Including non-available'
          }
        default:
          return null
      }

    case 'noStorePage':
      switch (descriptor.value) {
        case 'only':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipNoStorePageOnly',
            defaultText: 'No store page only'
          }
        case 'hide':
          return {
            ns: 'gamelib',
            key: 'gamelib:library.filterPanel.chipNoStorePageHidden',
            defaultText: 'Hiding no store page'
          }
        default:
          return null
      }

    case 'showSupportOfflineOnly':
      return {
        ns: 'default',
        key: 'header.show_support_offline_only',
        defaultText: 'Show offline-supported only'
      }

    case 'showThirdPartyManagedOnly':
      return {
        ns: 'default',
        key: 'header.show_third_party_managed_only',
        defaultText: 'Show third-party managed only'
      }

    case 'showUpdatesOnly':
      return {
        ns: 'default',
        key: 'header.show_updates_only',
        defaultText: 'Show games with updates only'
      }

    default: {
      // Exhaustiveness check: if a new `ActiveFilterDescriptor['kind']`
      // member is ever added without a case above, this line fails to
      // compile -- `descriptor.kind` (narrowed by the switch above, not
      // `descriptor` as a whole, since this interface has one property
      // with a union type rather than being a union of tagged types)
      // would not be typed `never` here.
      const exhaustiveCheck: never = descriptor.kind
      void exhaustiveCheck
      return null
    }
  }
}

/**
 * Joins resolved chip label text with the literal D-30 separator, e.g.
 * `Installed + GOG + "witcher"`. The zero-result sentence and the chip
 * row both call this same function so their output can never drift apart.
 */
export function joinChipLabels(labels: string[]): string {
  return labels.join(' + ')
}

export type TFunc = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>
) => string

// i18next-parser's JavascriptLexer only resolves string-literal arguments
// to tGamelib()/t() calls (confirmed twice already this phase -- 34.11-06
// and 34.11-07's FilterRunnabilityFacet -- a call driven by a variable key
// is invisible to the static extractor, or worse, extracts an EMPTY default
// text). The four tri-state chip keys below are NEW this plan and must be
// reachable by `pnpm i18n`, so they get their own literal call sites here.
// Every other key `chipLabelSpec` can return (view/store/runnability labels,
// the three reused `header.*` keys) was already extracted by its own
// literal call site in an earlier plan -- dynamic resolution for those is
// safe because the catalog already has them.
//
// 34.11 WR-07: this used to be duplicated verbatim in both FilterChipRow
// and FilterZeroResult (their respective `resolveLabel`s were byte-for-byte
// identical). Collapsed into this single copy so a future reader does not
// re-split it back into two.
export function resolveLabel(
  spec: ChipLabelSpec,
  t: TFunc,
  tGamelib: TFunc
): string {
  if ('literal' in spec) {
    return spec.literal
  }

  if (spec.ns === 'default') {
    return t(spec.key, spec.defaultText)
  }

  switch (spec.key) {
    case 'gamelib:library.filterPanel.chipHiddenOnly':
      return tGamelib(
        'gamelib:library.filterPanel.chipHiddenOnly',
        'Hidden only'
      )
    case 'gamelib:library.filterPanel.chipHiddenIncluded':
      return tGamelib(
        'gamelib:library.filterPanel.chipHiddenIncluded',
        'Including hidden'
      )
    case 'gamelib:library.filterPanel.chipNonAvailableOnly':
      return tGamelib(
        'gamelib:library.filterPanel.chipNonAvailableOnly',
        'Non-available only'
      )
    case 'gamelib:library.filterPanel.chipNonAvailableIncluded':
      return tGamelib(
        'gamelib:library.filterPanel.chipNonAvailableIncluded',
        'Including non-available'
      )
    default:
      return tGamelib(spec.key, spec.defaultText)
  }
}
