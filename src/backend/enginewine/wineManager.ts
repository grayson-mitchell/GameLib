import type { ReleasesInfo } from 'common/types'
import { RUST_WINE_RELEASES_INFO_READY } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The wine manager lives in Rust (Phase 87, `gamelib-wine` `manager`): the seven release feeds, the
 * `wine-downloader-info` store, the sha512-checked install with its progress and notifications, and the
 * guarded removal. This shim is the only TS path to it that is left: the default-wine download that called
 * the refresh, the release list and the install from `utils.ts` went into Rust with the launch's wine self-heal (88.1-16
 * ported it, 88.1-17 deleted the TS, 88.1-19 deleted the refresh shim nothing called), so the `releasesInfoReady` listener
 * is the one caller, until the config moves in Phase 98. (`getAlternativeWine` no longer calls the refresh from TS: the
 * Rust discovery refreshes an empty release list itself, 87-26.) The body is one typed call (D-06); the shim schedule in
 * `engineWineShimSchedule.test.ts` pins that and the phase that deletes it. The renderer's `refreshWineVersionInfo`, `installWineVersion` and
 * `removeWineVersion` are native channels that run the same ops, so the store and `<tools>/wine` have one writer.
 *
 * `wineReleasesInfoReady` resolves `null` once the check, and any refresh it started, has ended.
 */
export async function wineReleasesInfoReady(
  deps: RustInvokeDeps,
  releasesInfo: ReleasesInfo
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_RELEASES_INFO_READY, [releasesInfo])
}
