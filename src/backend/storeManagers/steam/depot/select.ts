// Phase 21 (21-01): Two-channel Steam depot selection.
//
// Lifted from `.planning/spikes/001-acf-adoption/select.mjs`, verified 11/11
// against real installs.
//
// KEY INSIGHT (spike 001): depot ownership is granted at the PACKAGE level.
// Every owned package's `packageinfo.depotids` lists the depots it grants. That
// set — not any combination of `dlcappid` / `optional` / `systemdefined` flags —
// is what decides whether Steam installs a depot.
//
// This subsumes the DLC heuristic: a DLC's depots are granted by the DLC's
// package, so owning the DLC puts its depots in the owned set automatically.
// Neither ownership channel alone is sufficient — both are checked below.
//
// T-21-04 (mitigated): every depot GID is emitted as `String(gid)` — a 64-bit
// value that must never touch a JS Number (precision loss above
// Number.MAX_SAFE_INTEGER). `os` is a REQUIRED caller-supplied parameter — this
// module never hardcodes a default host OS (the bottle path in Plan 11 calls
// this with a Windows OS filter; the native path calls it with the host OS).

export interface OwnedSets {
  /** Owned appIds (used for the DLC-ownership channel). */
  apps: Set<number>
  /** Depot ids granted directly by an owned package's `depotids`. */
  depots: Set<number>
}

export interface DepotSelectOpts {
  /** Required — the target OS to filter depot `oslist` against. Never defaulted. */
  os: string
  arch?: string
  language?: string
  branch?: string
}

export interface DepotDescriptor {
  id: string
  /** STRING — 64-bit, must never touch a JS Number. */
  manifest: string
  size: number
  dlcappid?: string
}

interface DepotManifestEntry {
  gid?: string
  size?: number
}

interface DepotConfig {
  oslist?: string
  osarch?: string
  language?: string
}

interface DepotEntry {
  manifests?: Record<string, string | DepotManifestEntry>
  config?: DepotConfig
  dlcappid?: string | number
  depotfromapp?: string | number
  sharedinstall?: string | number | boolean
}

export interface SteamAppInfo {
  depots?: Record<string, DepotEntry>
  extended?: {
    listofdlc?: string
  }
}

/** DLC appIds declared by an app, from `extended.listofdlc` (comma-separated). */
export function dlcAppIds(appinfo: SteamAppInfo | undefined): number[] {
  return String(appinfo?.extended?.listofdlc ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)
}

/**
 * Collect every depot for an app, including depots that live in its DLC APPS.
 *
 * A DLC does not always declare its depots inside the base game's PICS entry —
 * it can define them in its OWN app entry (the base game then carries a
 * `depots.hasdepotsindlc` flag). Enumerating only the base app's depots silently
 * misses these.
 *
 * @param appinfo   base app PICS entry
 * @param dlcInfos  map of dlcAppId -> PICS entry (fetch via getProductInfo)
 */
export function selectAllDepots(
  appinfo: SteamAppInfo,
  dlcInfos: Record<string, SteamAppInfo> | undefined,
  owned: OwnedSets,
  opts: DepotSelectOpts
): DepotDescriptor[] {
  const all = [...selectDepots(appinfo, owned, opts)]
  const seen = new Set(all.map((d) => d.id))

  for (const dlc of Object.values(dlcInfos ?? {})) {
    for (const d of selectDepots(dlc, owned, opts)) {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        all.push(d)
      }
    }
  }
  return all
}

/**
 * Include a depot iff:
 *   - it is a real (numeric) depot with a manifest on the target branch
 *   - the USER OWNS IT (it appears in an owned package's depotids)
 *   - it is not a shared redistributable (depotfromapp / sharedinstall -> SharedDepots)
 *   - its oslist matches the host OS, or it has none (platform-agnostic content)
 *   - its osarch matches, or it has none
 *   - its language matches the user's selection, or it has none
 */
export function selectDepots(
  appinfo: SteamAppInfo,
  owned: OwnedSets,
  opts: DepotSelectOpts
): DepotDescriptor[] {
  const { os, arch = '64', language = 'english', branch = 'public' } = opts
  const out: DepotDescriptor[] = []

  for (const [id, d] of Object.entries(appinfo?.depots ?? {})) {
    if (!/^\d+$/.test(id)) continue

    // ── Ownership — the load-bearing check, granted through EITHER channel ──
    //
    // 1. The depot is listed directly in an owned package's `depotids`.
    // 2. The depot belongs to a DLC (`dlcappid`) whose APP the user owns. A DLC's
    //    package grants the DLC's appid, but does not always list the depot id —
    //    so channel 1 alone misses owned-DLC depots.
    //
    // Neither channel alone is sufficient. Verified against 11 real installs.
    const ownedDirectly = owned.depots.has(Number(id))
    const ownedViaDlc = !!d.dlcappid && owned.apps.has(Number(d.dlcappid))
    if (!ownedDirectly && !ownedViaDlc) continue

    // Shared redistributables live in SharedDepots, not InstalledDepots.
    if (d?.depotfromapp || d?.sharedinstall) continue

    const m = d?.manifests?.[branch]
    const gid = typeof m === 'string' ? m : m?.gid
    if (!gid) continue

    const cfg = d.config ?? {}
    const oslist = cfg.oslist
    if (oslist && !String(oslist).split(',').includes(os)) continue

    const osarch = cfg.osarch
    if (osarch && String(osarch) !== arch) continue

    const depotLang = cfg.language
    if (depotLang && String(depotLang) !== language) continue

    out.push({
      id,
      manifest: String(gid), // STRING — 64-bit, must never touch a JS Number
      size: Number(typeof m === 'object' ? (m.size ?? 0) : 0),
      dlcappid: d.dlcappid ? String(d.dlcappid) : undefined
    })
  }
  return out
}
