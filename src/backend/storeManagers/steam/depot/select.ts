// Phase 21 (21-01): Two-channel Steam depot selection.
// STUB — RED phase. Implementation lands in the GREEN commit.

export interface OwnedSets {
  apps: Set<number>
  depots: Set<number>
}

export interface DepotSelectOpts {
  os: string
  arch?: string
  language?: string
  branch?: string
}

export interface DepotDescriptor {
  id: string
  manifest: string
  size: number
  dlcappid?: string
}

export interface SteamAppInfo {
  depots?: Record<string, unknown>
  extended?: { listofdlc?: string }
}

export function selectAllDepots(
  _appinfo: SteamAppInfo,
  _dlcInfos: Record<string, SteamAppInfo> | undefined,
  _owned: OwnedSets,
  _opts: DepotSelectOpts
): DepotDescriptor[] {
  throw new Error('not implemented')
}

export function selectDepots(
  _appinfo: SteamAppInfo,
  _owned: OwnedSets,
  _opts: DepotSelectOpts
): DepotDescriptor[] {
  throw new Error('not implemented')
}
