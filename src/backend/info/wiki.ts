import {
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_INFO_WIKI_GET
} from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Wiki game info lives in Rust (Phase 86, `gamelib-info` `wiki`): the PCGamingWiki, Apple Gaming Wiki,
 * ProtonDB, Steam Deck, CodeWeavers, GamesDB, HowLongToBeat and umu sources, the 30 day cache and its
 * staleness rules. This module is the only TS path to it; the schedule in `infoShimSchedule.test.ts`
 * pins each function to one typed call and the phase that deletes it. Each resolves `unknown`, because
 * the transport is untyped; the caller states the shape it reads.
 *
 * The umu id lookup lives in Rust (Phase 86, `gamelib-info` `wiki::umu`): the runner and store tables,
 * the cache, the request and its answer. This shim is the only TS path to it, and its body is one typed
 * call (D-06); the schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * Resolves `unknown`: the umu id (`string`) or `null` (a sideload, no match, or the lookup failed).
 */
export async function getUmuId(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_UMU_GET, [{ appName, runner }])
}

/**
 * The non-Steam shortcut flow's wiki lookup (D-24 resolver). The one input Rust cannot gather is the
 * game itself, which lives in a library manager's memory, so the resolver reads its title, app name and
 * runner (`const`) and makes the one call. Rust cleans the title and owns the cache key.
 *
 * Resolves `unknown`: the `WikiInfo` object, or `null` when the lookup failed (Rust catches every source
 * failure; only a bad argument rejects, with the text of what failed).
 */
export async function getWikiGameInfo(
  deps: RustInvokeDeps,
  game: Game,
  forceRefresh?: boolean
): Promise<unknown> {
  const { title, app_name: appName, runner } = game.getGameInfo()
  return deps.requestRustInvoke(RUST_INFO_WIKI_GET, [
    { title, appName, runner, forceRefresh }
  ])
}

/**
 * Empties the wiki game info cache (`clearCache`'s wiki family; the umu id cache is another store and
 * is left alone, as in the TS). Resolves `unknown`: `null`; rejects with the text of what failed.
 */
export async function clearWikiGameInfoCache(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_WIKI_CACHE_CLEAR, [{}])
}
