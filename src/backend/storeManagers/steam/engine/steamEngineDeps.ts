/**
 * Steam adapter for the store-agnostic engine decision and switch (phase 61, D-16, D-08).
 *
 * `backend/engine/engineDecision` and `engineSwitch` import nothing from this store. Everything
 * Steam-only they used to default to is injected here: the persisted wine-bin hint for the
 * CrossOver lookup, the Steam override reader, the bridge monitor phase, the title's own bridge
 * bottle and the bridge bottle's CrossOver settings.
 */
import { resolveCrossoverBinDirAsync } from 'backend/engine/crossoverLocation'
import type { EngineDecisionDeps } from 'backend/engine/engineDecision'
import type { EngineSwitchDeps } from 'backend/engine/engineSwitch'
import { readStoredGameConfig } from 'backend/engine/engineConfig'
import {
  bridgeBottleNameFor,
  getBridgeBottleSettings,
  persistedWineBins
} from '../bottle'
import { getBottleProcessMonitorPhase } from '../bottleProcessMonitor'
import { readStoredTitleConfig } from '../titleSettings'

/**
 * 59-UAT G11 / D-08: the title's stored override, read straight from its GameConfig file.
 * `engineOverride` (written by the generic Engine control) wins; the older
 * `steamEngineOverride` is the fallback so existing Steam choices keep working. Unvalidated:
 * callers pass the value through parseEngineOverride.
 */
export function readSteamEngineOverride(appId: string): unknown {
  const generic = readStoredGameConfig(appId)?.engineOverride
  if (typeof generic === 'string') return generic
  return readStoredTitleConfig(appId)?.steamEngineOverride
}

const hintedBinDir = () =>
  resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() })

export function steamDecisionDeps(): Partial<EngineDecisionDeps> {
  return {
    resolveCrossoverBinDir: hintedBinDir,
    readOverride: readSteamEngineOverride,
    monitorPhase: getBottleProcessMonitorPhase
  }
}

export function steamSwitchDeps(): Partial<EngineSwitchDeps> &
  Pick<EngineSwitchDeps, 'crossoverSettings'> {
  return {
    getMonitorPhase: getBottleProcessMonitorPhase,
    ownBottleName: bridgeBottleNameFor,
    crossoverSettings: getBridgeBottleSettings,
    resolveCrossoverBinDir: hintedBinDir
  }
}
