import { RUST_INFO_GOG_DISCOUNTS } from 'common/types/sidecarTransport'
import type { CatalogLocaleSettings } from 'common/types/discounts'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { GOGUser, type GOGUserDeps } from 'backend/storeManagers/gog/user'

/**
 * GOG discounts live in Rust (Phase 86, `gamelib-info` `discounts`): the catalog paging, the
 * concurrent fetch, the dedupe, the US fallback and the request shape are all there. This resolver
 * is the only TS path to it, and it gathers the one input Rust cannot (D-24): the GOG access token,
 * which needs a `gogdl` child process, so it stays TypeScript until phase 92 ports GOG auth. The
 * token is read only when a flag asks for the account filters, handed to Rust in memory for the one
 * call, and never logged. A flag with no signed-in account sends `null`, and Rust resets both flags
 * as the TS did. The body is `const token`, then one typed call (D-06); the schedule in
 * `infoShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * Resolves `unknown`, because the transport is untyped: the product list as the catalog sent it
 * (`CatalogProduct[]`, which the renderer reads); rejects with the text of what failed.
 */
export async function getGogDiscounts(
  deps: GOGUserDeps & RustInvokeDeps,
  locale: CatalogLocaleSettings,
  hideOwned = false,
  wishlistOnly = false
): Promise<unknown> {
  const token =
    hideOwned || wishlistOnly
      ? ((await GOGUser.getCredentials(deps))?.access_token ?? null)
      : null
  return deps.requestRustInvoke(RUST_INFO_GOG_DISCOUNTS, [
    { locale, hideOwned, wishlistOnly, token }
  ])
}
