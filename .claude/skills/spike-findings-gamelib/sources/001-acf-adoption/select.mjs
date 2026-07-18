/**
 * Depot selection — the rule under test.
 *
 * KEY INSIGHT (spike 001): depot ownership is granted at the PACKAGE level.
 * Every owned package's `packageinfo.depotids` lists the depots it grants. That
 * set — not any combination of `dlcappid` / `optional` / `systemdefined` flags —
 * is what decides whether Steam installs a depot.
 *
 * Proof: Dead Island depot 201741 and Trine 2 depot 35724 are IDENTICAL in PICS
 * (optional=1, systemdefined=1, no oslist, no dlcappid). Steam installed the
 * first and not the second. The only difference is that 201741 is in an owned
 * package's depotids and 35724 is not.
 *
 * This subsumes the DLC heuristic: a DLC's depots are granted by the DLC's
 * package, so owning the DLC puts its depots in the owned set automatically.
 *
 * Pure module — no top-level side effects.
 */

export const HOST_OS = 'macos'

/** DLC appIds declared by an app, from `extended.listofdlc` (comma-separated). */
export function dlcAppIds(appinfo) {
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
 * `depots.hasdepotsindlc` flag). Wasteland 3's depot 1522651 does not appear in
 * app 719040 at all; it belongs to DLC app 1522650 ("The Battle of Steeltown").
 * Enumerating only the base app's depots silently misses these.
 *
 * @param appinfo   base app PICS entry
 * @param dlcInfos  map of dlcAppId → PICS entry (fetch via getProductInfo)
 */
export function selectAllDepots(appinfo, dlcInfos, owned, opts = {}) {
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
 *   - it is not a shared redistributable (depotfromapp / sharedinstall → SharedDepots)
 *   - its oslist matches the host OS, or it has none (platform-agnostic content)
 *   - its osarch matches, or it has none
 *   - its language matches the user's selection, or it has none
 */
export function selectDepots(
  appinfo,
  owned, // { apps: Set<number>, depots: Set<number> }
  { os = HOST_OS, arch = '64', language = 'english', branch = 'public' } = {}
) {
  const out = []
  for (const [id, d] of Object.entries(appinfo?.depots ?? {})) {
    if (!/^\d+$/.test(id)) continue

    // ── Ownership — the load-bearing check, granted through EITHER channel ──
    //
    // 1. The depot is listed directly in an owned package's `depotids`.
    // 2. The depot belongs to a DLC (`dlcappid`) whose APP the user owns. A DLC's
    //    package grants the DLC's appid, but does not always list the depot id —
    //    so channel 1 alone misses owned-DLC depots (Trine 2's 35723,
    //    Wasteland 3's 1522651, Dead Island's 91342/91345).
    //
    // Neither channel alone is sufficient. Verified against 11 real installs.
    const ownedDirectly = owned.depots.has(Number(id))
    const ownedViaDlc = d.dlcappid && owned.apps.has(Number(d.dlcappid))
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
