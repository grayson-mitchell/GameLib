import { RUST_WINE_DISCOVER_ALTERNATIVES } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Wine discovery lives in Rust (Phase 87, `gamelib-wine` `discovery`): CrossOver, wine on the Mac, Wineskin,
 * the Game Porting Toolkit and Whisky on a Mac; the tools and Lutris wines, Proton, the default wine and the
 * custom paths on Linux, replayed against the goldens 87-08 recorded from the TS. This is the one TS reach
 * into it, kept so `getAlternativeWine` in `config.ts` (which `utils.ts` and the Steam install form call)
 * keeps its call shape until Phase 98 moves the config into Rust. Its body is one typed call (D-06); the shim
 * schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes it. The renderer's
 * `getAlternativeWine` is a native channel that runs the same op.
 *
 * The call carries one boolean and no path: the shell reads its own roots, `PATH`, the two settings and the
 * Steam libraries (T-87-71). With no wine release list stored, Rust refreshes it first and pushes
 * `wineVersionsUpdated`, as the TS did. It resolves the `WineInstallation[]`, in the TS order (the macOS
 * set on a Mac, the Linux set on Linux, an empty list on Windows); like every other enginewine shim it types
 * the answer `unknown` and the one caller, `config.ts`, names the list.
 */
export async function discoverAlternativeWine(
  deps: RustInvokeDeps,
  scanCustom: boolean
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_DISCOVER_ALTERNATIVES, [scanCustom])
}
