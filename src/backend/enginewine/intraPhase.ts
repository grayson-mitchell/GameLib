import { RUST_WINE_DISCOVER_CROSSOVER } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Intra-phase reach (Phase 87, 87-26, D-15): the still-TS engine's CrossOver locator
 * (`engine/crossoverLocation.ts`, `resolveCrossoverBinDirAsync`) asks Spotlight for the CrossOver installs
 * when neither the default locations nor its memo hold one. That discovery is Rust's now
 * (`gamelib-wine` `wine_discover_crossover`: one labelled `mdfind`, 10 s limit), so the locator calls it
 * through this one shim. The engine TS is deleted in 87-56, which removes this row with it (the schedule row
 * is `deletedBy: 87`; `noIntraPhaseRowsLeft` asserts none remain). The body is one typed call (D-06).
 *
 * It resolves the `WineInstallation[]` Spotlight listed, in its order; an empty list off macOS.
 */
export async function discoverCrossover(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_DISCOVER_CROSSOVER, [])
}
