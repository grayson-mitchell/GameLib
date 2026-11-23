/**
 * Makes a pinned engine available to the still-TS non-Steam launch (Phase 87, 87-43).
 *
 * The engine switch is Rust's (`engine/prepareBottle.ts` calls it through one shim), but Rust downloads no engine
 * yet, so the caller supplies the download that a restore to CrossOver may ask for. This is the one piece of the
 * deleted TS switch that stays: the pin download over the boot's fallback engine, with no progress report (the Steam
 * callers use `pinnedEngineProgress.ts` for that). It goes with the launch step in 87-56.
 */
import type { EnginePin } from 'common/types/engine'
import type { EngineServices } from './engineServices'
import type { NonCrossoverEngine } from './engineTypes'

/** Makes a pinned engine available (downloads it when absent); null when that fails. */
export type EnsurePinEngine = (
  pin: EnginePin
) => Promise<NonCrossoverEngine | null>

export function ensurePinEngineFrom(
  services: Pick<EngineServices, 'engineRuntime' | 'runner' | 'onlineMonitor'>
): EnsurePinEngine {
  return async (pin) => {
    const res = await services.engineRuntime.fallback.ensurePinnedEngine(pin, {
      runner: services.runner,
      onlineMonitor: services.onlineMonitor
    })
    if (!res.ok) return null
    return {
      wineBin: res.paths.wineBin,
      wineserverBin: res.paths.wineserverBin,
      label: pin.label,
      version: pin.wine.version,
      dxvk: { dir: res.paths.dxvkDir, version: pin.dxvk.version }
    }
  }
}
