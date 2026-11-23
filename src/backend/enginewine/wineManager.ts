import type { ReleasesInfo, WineVersionInfo } from 'common/types'
import {
  RUST_WINE_MANAGER_INSTALL,
  RUST_WINE_MANAGER_LIST,
  RUST_WINE_MANAGER_REFRESH,
  RUST_WINE_RELEASES_INFO_READY
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The wine manager lives in Rust (Phase 87, `gamelib-wine` `manager`): the seven release feeds, the
 * `wine-downloader-info` store, the sha512-checked install with its progress and notifications, and the
 * guarded removal. These four shims are the only TS path to it, kept so the default-wine download in
 * `utils.ts`, `getAlternativeWine` in `config.ts` and the `releasesInfoReady` listener keep their call
 * shape until the phases that own them move into Rust (88 for launch, 98 for the config). Each body is one
 * typed call (D-06); the shim schedule in `engineWineShimSchedule.test.ts` pins that and the phase that
 * deletes them. The renderer's `refreshWineVersionInfo`, `installWineVersion` and `removeWineVersion` are
 * native channels that run the same ops, so the store and `<tools>/wine` have one writer.
 *
 * `updateWineVersionInfos` resolves `null` (a failed feed is logged in Rust, as the TS refresh swallowed
 * it), `installWineVersion` resolves `'success' | 'abort' | 'error'`, `listWineReleases` the stored release
 * array, and `wineReleasesInfoReady` `null` once the check, and any refresh it started, has ended.
 *
 * The install takes no settings argument: the shell reads `downloadProtonToSteam` and `defaultSteamPath`
 * from the global config itself.
 */
export async function updateWineVersionInfos(
  deps: RustInvokeDeps,
  fetch: boolean
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_MANAGER_REFRESH, [fetch])
}

export async function installWineVersion(
  deps: RustInvokeDeps,
  release: WineVersionInfo
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_MANAGER_INSTALL, [release])
}

export async function listWineReleases(deps: RustInvokeDeps): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_MANAGER_LIST, [])
}

export async function wineReleasesInfoReady(
  deps: RustInvokeDeps,
  releasesInfo: ReleasesInfo
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_RELEASES_INFO_READY, [releasesInfo])
}
