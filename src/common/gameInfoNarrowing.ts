import { isStore } from 'common/storeCapabilities'
import type { GameInfoByRunner, GameInfoCore, Runner } from 'common/types'

/**
 * Phase 70 (D-03): the sanctioned way to narrow a `GameInfoCore` to one
 * store's member shape. Phase 62's runner-literal ban applies to call sites;
 * they go through here instead of comparing `game.runner` themselves.
 *
 * Delegates to `isStore`, so null, undefined and `{}` (no runner) are all
 * false. There is deliberately no throwing variant.
 */
export function isStoreGame<K extends Runner>(
  game: GameInfoCore | null | undefined,
  runner: K
): game is GameInfoByRunner[K] {
  return isStore(game, runner)
}

/**
 * Returns `game` narrowed to the `runner` member, or `undefined` when it is
 * null/undefined or belongs to another store.
 */
export function asStoreGame<K extends Runner>(
  game: GameInfoCore | null | undefined,
  runner: K
): GameInfoByRunner[K] | undefined {
  return isStoreGame(game, runner) ? game : undefined
}
