import {
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_CACHE_CLEAR
} from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
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
 * Empties the wiki game info cache (`clearCache`'s wiki family; the umu id cache is another store and
 * is left alone, as in the TS). Resolves `unknown`: `null`; rejects with the text of what failed.
 */
export async function clearWikiGameInfoCache(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_WIKI_CACHE_CLEAR, [{}])
}
