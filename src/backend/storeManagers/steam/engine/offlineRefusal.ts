/**
 * G25: pure predicate deciding whether an offline launch is certain to be
 * blocked, from already-computed inputs. No I/O, so it cannot slow Play.
 *
 * Arms:
 * - crossover-missing: with CrossOver missing and override automatic,
 *   decideLaunchEngine's unhealthy branch selects ENGINE_PINS.current and needs
 *   a download when it is absent. That cannot succeed offline, whatever the
 *   marker kind or DXVK copy say (UAT 34 run 1).
 * - restore-needs-pin: the 59-38 diagnosis. With CrossOver present (health
 *   unknown), a non-crossover marker whose restore needs the absent pin is
 *   blocked. Under override 'crossover' this holds even when the current pin is
 *   installed (WR-02): the restore needs the marker's own pin and
 *   prepareBottleForEngine's resolveRestoreSource downloads it in both the
 *   healthy and the unhealthy (G10) branch. Under 'automatic' an installed
 *   current pin lets an unhealthy CrossOver fall back, so it never refuses; a surviving DXVK copy means the restore needs no pin, so a healthy
 *   CrossOver still probes and launches (UAT 34 run 2).
 *
 * This only ever refuses. It never selects an engine or routes to bottled
 * Steam. A CrossOver override with CrossOver missing is left to the normal
 * path, whose 'unavailable' dialog is already immediate and more accurate.
 */
import type { EngineOverrideId } from './engineIds'

export interface OfflineRefusalInput {
  offline: boolean
  override: EngineOverrideId
  crossoverMissing: boolean
  markerKind: 'crossover' | 'non-crossover' | null
  currentPinInstalled: boolean
  restoreNeedsAbsentPin: boolean
}

export function offlineLaunchCertainlyBlocked(
  input: OfflineRefusalInput
):
  | { blocked: false }
  | { blocked: true; arm: 'crossover-missing' | 'restore-needs-pin' } {
  if (!input.offline) return { blocked: false }
  if (input.override !== 'automatic' && input.override !== 'crossover') {
    return { blocked: false }
  }
  if (input.crossoverMissing) {
    return input.override === 'automatic' && !input.currentPinInstalled
      ? { blocked: true, arm: 'crossover-missing' }
      : { blocked: false }
  }
  if (input.markerKind === 'non-crossover' && input.restoreNeedsAbsentPin) {
    if (input.override === 'automatic' && input.currentPinInstalled) {
      return { blocked: false }
    }
    return { blocked: true, arm: 'restore-needs-pin' }
  }
  return { blocked: false }
}
