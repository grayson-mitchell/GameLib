import type { WineInstallation } from 'common/types'
import { RUST_WINE_VALID } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The wine command core lives in Rust (Phase 87, `gamelib-wine` `wine_cmd`): `validWine`, the two env
 * builders and `runWineCommand` with its prefix check and umu support, replayed against the goldens
 * 87-08 recorded from the TS. This is the one async TS reach into it, kept so the launcher's wine check,
 * `utils.ts`'s `checkWineBeforeLaunch` and the command runner's binding keep their call shape until
 * Phase 88 moves launch into Rust. Its body is one typed call (D-06); the shim schedule in
 * `engineWineShimSchedule.test.ts` pins that and the phase that deletes it. The renderer's
 * `wine.isValidVersion` is a native channel that runs the same op.
 *
 * The sync env builders (`setupEnvVars`, `setupWineEnvVars`) and the command runner's `runWineCommand`
 * (whose `onSpawn` hands callers a live ChildHandle) stay as scheduled TS twins pinned to the same
 * goldens: they are called synchronously from the launch paths Phases 88 to 92 move, and a same-signature
 * async shim cannot replace a synchronous call (D-22).
 *
 * `validWine` resolves a boolean: whether the wine's binaries exist as its type needs (a `wine` needs its
 * `wineserver` too) and, for a macOS toolkit, Darwin is 14 or later. Anything that is no installation
 * (`null`, `{}`, an unknown type) is `false`, as it always was. The Rust op logs nothing, so the TS
 * `Checking if wine version exists` line is gone.
 */
export async function validWine(
  deps: RustInvokeDeps,
  wineVersion: WineInstallation
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_VALID, [wineVersion])
}
