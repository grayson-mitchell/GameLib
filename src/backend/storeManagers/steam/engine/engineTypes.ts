/**
 * Shared contract for the Steam engine layer (phase 59). Types and two pure
 * helpers only: nothing runs at module load.
 */

export type EngineReason =
  | 'cx-healthy'
  | 'cx-missing'
  | 'cx-expired'
  | 'cx-broken'
  | 'override'

export type FallbackReason = 'cx-missing' | 'cx-expired' | 'cx-broken'

interface NonCrossoverEngine {
  wineBin: string
  wineserverBin: string
  label: string
  version: string
  dxvk: { dir: string; version: string } | null
}

export type EngineSelection =
  | {
      kind: 'crossover'
      reason: 'cx-healthy' | 'override'
      crossoverBuild: string | null
      binDir: string
    }
  | ({
      kind: 'pinned'
      pinId: string
      reason: FallbackReason | 'override'
    } & NonCrossoverEngine)
  | ({
      kind: 'wine-manager'
      managerVersion: string
      reason: 'override'
    } & NonCrossoverEngine)

export type NonCrossoverSelection = Extract<
  EngineSelection,
  { kind: 'pinned' | 'wine-manager' }
>

export function isNonCrossover(
  sel: EngineSelection
): sel is NonCrossoverSelection {
  return sel.kind !== 'crossover'
}

/** The exact engine and version launch-log line (D-14). */
export function engineLogLabel(sel: EngineSelection): string {
  if (sel.kind === 'crossover') {
    return `engine=crossover build=${sel.crossoverBuild ?? 'unknown'} reason=${sel.reason}`
  }
  return `engine=${sel.kind} name="${sel.label}" version=${sel.version} reason=${sel.reason}`
}
