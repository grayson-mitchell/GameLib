/**
 * The single counting function behind BOTH halves of the library header's
 * `{{shown}} of {{total}}` form (quick task 260815-opt Task 3, D6).
 *
 * Why one function and not two: the shipped numerator excludes DLC. A
 * denominator that skipped that exclusion would count DLC entries the
 * numerator had already dropped, and the header could print `42 of 41` --
 * a number smaller than the one beside it, on a library where nothing is
 * wrong. Routing both through here makes that arithmetic impossible rather
 * than merely unlikely.
 *
 * The predicate is TRANSCRIBED VERBATIM from `LibraryHeader`'s previous
 * inline `numberOfGames` memo, including its quirk that a `sideload` entry
 * flagged `is_dlc` is COUNTED (`lib.runner !== 'sideload' && lib.install.is_dlc`).
 * That quirk is deliberately preserved, not "fixed": changing it here would
 * silently change the unfiltered count the header has always shown, which is
 * a behaviour change wearing a refactor's clothes.
 *
 * Return type note, so nobody "restores" the old form: the previous
 * expression returned the STRING `` `${total}` `` when `total > 0` and the
 * NUMBER `0` otherwise. This helper always returns a number. The rendered
 * output is identical in both branches -- React renders `0` and `'0'` the
 * same -- so the unfiltered path is unchanged, and a number is what the
 * `{{total}}` interpolation needs anyway.
 *
 * Pure module, no React: that is what makes it reachable from a test at all
 * in a project with no jsdom (`src/frontend/jest.config.js`).
 */
import { GameInfo } from 'common/types'
import { FilterEngineDeps } from 'frontend/types'
import {
  DEFAULT_FILTER_ENGINE_STATE,
  filterLibrary
} from '../../filterEngine'

export function countGamesExcludingDlc(
  list: GameInfo[] | undefined | null
): number {
  if (!list) {
    return 0
  }

  // is_dlc is only meaningful for legendary titles, but testing it
  // unconditionally is harmless and is what makes the count accurate on the
  // combined "all games" list -- carried over from the original comment.
  const dlcCount = list.filter(
    (lib) => lib.runner !== 'sideload' && lib.install.is_dlc
  ).length

  const total = list.length - dlcCount
  return total > 0 ? total : 0
}

/**
 * The library header's DENOMINATOR: how many games would show with every
 * filter cleared (D5).
 *
 * WHY THIS LIVES HERE rather than inline in `Library/index.tsx`, where the
 * plan originally put it: `__tests__/libraryPipeline.test.ts` gates that
 * component against containing ANY `filterLibrary(` or `countFor(` call
 * shape at all. That gate is not incidental -- it was written after CR-01,
 * where an engine call sitting in the component was handed the wrong first
 * argument and no test could reach it. Its rule is "engine call shapes must
 * live somewhere a behavioural test can exercise them over the real
 * arguments", and a pure exported function is exactly that somewhere. The
 * denominator is consequently PROVEN behaviourally in
 * `__tests__/libraryHeaderVisibility.test.ts` rather than source-gated.
 *
 * `engineWiring.ts` was NOT used for the same purpose: its own gate pins it
 * to exactly three engine calls (one `filterLibrary`, two `countFor`), so a
 * fourth would have to break a passing test to be added.
 *
 * The union is passed UNFILTERED and no stage is skipped -- this is a full
 * pipeline pass against the default state, which is what makes the result
 * exactly the number `Clear all` produces.
 */
export function countUnfilteredGames(
  libraryUnion: GameInfo[],
  deps: FilterEngineDeps
): number {
  return countGamesExcludingDlc(
    filterLibrary(libraryUnion, DEFAULT_FILTER_ENGINE_STATE, deps)
  )
}
