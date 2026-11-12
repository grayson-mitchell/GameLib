import type SteamGame from '../games'

export interface BridgeUpdateFollowUpInput {
  changedPaths: string[]
  fullReconcile: boolean
  bridgeBottleName: string
}

export interface BridgeUpdateFollowUpReport {
  shimTouched: boolean
  exePath: string | null
  verdict?: unknown
  redistRan: boolean
  drmPrefetched: boolean
  cfgRewrittenAtLaunch: true
  errors: string[]
}

export function isSteamApiDllPath(manifestPath: string): boolean {
  const base = manifestPath.replace(/\\/g, '/').split('/').pop() ?? ''
  const lower = base.toLowerCase()
  return lower === 'steam_api.dll' || lower === 'steam_api64.dll'
}

export async function runBridgeUpdateFollowUps(
  _steamGame: SteamGame,
  _input: BridgeUpdateFollowUpInput
): Promise<BridgeUpdateFollowUpReport> {
  return {
    shimTouched: false,
    exePath: null,
    redistRan: false,
    drmPrefetched: false,
    cfgRewrittenAtLaunch: true,
    errors: []
  }
}
