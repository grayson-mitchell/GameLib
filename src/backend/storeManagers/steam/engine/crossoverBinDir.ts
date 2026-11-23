import type { WineInstallation } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'
import { resolveCrossoverBinDir } from 'backend/enginewine/decision'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/** What a caller knows about where CrossOver is: the persisted wine installation and wine binaries it has seen. */
export interface CrossoverHint {
  wineVersion?: WineInstallation
  hintWineBins?: string[]
}

/** The hinted wine binaries a lookup starts from: a `crossover` wine installation first, then the named binaries. */
export function crossoverHintWineBins(hint: CrossoverHint): string[] {
  return [
    ...(hint.wineVersion?.type === 'crossover' ? [hint.wineVersion.bin] : []),
    ...(hint.hintWineBins ?? [])
  ]
}

/**
 * Where CrossOver's `bin` directory is, answered by Rust (Phase 87, 87-55, D-04, D-15).
 *
 * The bridge's call sites used the boot's TS locator (`engineRuntime.crossover.resolveCrossoverBinDirAsync`), which never
 * rejected: a failed Spotlight search was `undefined`. The shim in `enginewine/decision.ts` is one returned call that
 * resolves `unknown` and can reject, so this narrows the reply and keeps that "never rejects" behaviour in one place.
 * A `wineVersion` of type `crossover` is one more hint (the TS locator tried its bin first); only the persisted bin and
 * the hints the caller names are values Rust cannot read itself.
 */
export async function crossoverBinDir(
  deps: RustInvokeDeps,
  hint: CrossoverHint = {}
): Promise<string | undefined> {
  try {
    const reply = await resolveCrossoverBinDir(deps, {
      hintWineBins: crossoverHintWineBins(hint)
    })
    return typeof reply === 'string' && reply !== '' ? reply : undefined
  } catch (error) {
    logWarning(
      ['crossoverBinDir: the CrossOver lookup failed', error],
      LogPrefix.Backend
    )
    return undefined
  }
}
