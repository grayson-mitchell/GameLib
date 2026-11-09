// Content-server directory: reduceContentServers + getContentServerHosts (extracted from ../depot.ts, 62-10).

import { logInfo, LogPrefix } from 'backend/logger'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from '../withTimeout'
import { type SteamUserDepotClient, type RawContentServer } from './planModel'

/** Per-host content-server directory metadata, keyed by hostname and threaded to Rust's
 *  RustHostRef (moved from decompress.ts, 73-20). `usetokenauth === true` or `type === 'CDN'`
 *  means the host wants a CDN auth token; `type=SteamCache` hosts stay token-less. */
export interface ContentServerHostMeta {
  httpsSupport?: string
  usetokenauth?: boolean
  type?: string
}

/**
 * Debug/steam-install-slow-start (cycle 5): pure reduction of the raw
 * directory response into (a) the flat hostname list downloadDepotFiles has
 * always consumed, (b) a hostname -> weightedload PARALLEL MAP —
 * threading through the directory's own load-based ranking (cycle-4 lead
 * (a): the exact field this reduction previously discarded via
 * `servers.map((s) => s.Host ?? s.vhost)`) so HostHealthTracker can seed its
 * cold-start PRIOR from it (depot/hostHealth.ts), and (c, cycle 7) a
 * hostname -> ContentServerHostMeta PARALLEL MAP carrying `https_support`/
 * `usetokenauth` so fetchChunk can build the URL with EXACT steam-user
 * parity (depot/decompress.ts). A server missing/invalid `weightedload` is
 * simply omitted from that map (not defaulted to a synthetic worst-case
 * value) — HostHealthTracker treats an absent entry as "no prior signal",
 * falling through to its pre-cycle-5 neutral behavior for that host, never
 * inventing a ranking the directory didn't actually supply. Extracted as a
 * standalone pure function (no client/network dependency) so this mapping
 * is directly unit-testable.
 */
export function reduceContentServers(servers: RawContentServer[]): {
  hosts: string[]
  weightedLoads: Map<string, number>
  hostMeta: Map<string, ContentServerHostMeta>
} {
  const hosts: string[] = []
  const weightedLoads = new Map<string, number>()
  const hostMeta = new Map<string, ContentServerHostMeta>()
  for (const s of servers) {
    const host = s.Host ?? s.vhost
    if (!host) continue
    hosts.push(host)
    // Debug/steam-install-slow-start (cycle 8): the directory returns
    // `weightedload` as a STRING on real responses (e.g. "130"), not a
    // number — the pre-cycle-8 `typeof s.weightedload === 'number'` guard
    // silently dropped every real-world entry, leaving `weightedLoads`
    // permanently empty (`[Timing] ... weightedLoads=0` for every hardware
    // run) and making the weightedload-aware selection (cycle 5) inert.
    // Coerce via `Number(...)` regardless of the source type, still
    // NaN-guarded so a missing/malformed value is omitted (never defaulted
    // to a synthetic worst-case ranking) rather than stored as `NaN`.
    if (s.weightedload !== undefined && s.weightedload !== null) {
      const numWeightedload = Number(s.weightedload)
      if (Number.isFinite(numWeightedload)) {
        weightedLoads.set(host, numWeightedload)
      }
    }
    // Cycle 7: `usetokenauth === 1` mirrors steam-user's OWN
    // `contentServer.usetokenauth == 1` gate exactly (cdn.js's downloadChunk)
    // — never a loose truthy check, so a stray non-1 value never
    // accidentally turns on token fetching for a server that didn't ask.
    // CDN-auth implementation cycle, PART 2: `type` is threaded alongside so
    // decompress.ts's `wantsCdnAuthToken` can widen the gate to `type ===
    // 'CDN'` -- this codebase's own directory captures never see
    // `usetokenauth` populated, but the RESEARCH SPIKE's content_log.txt
    // evidence shows the real client authenticates unconditionally on every
    // type=CDN host regardless of that flag.
    hostMeta.set(host, {
      httpsSupport: s.https_support,
      usetokenauth: s.usetokenauth === 1,
      type: s.type
    })
  }
  return { hosts, weightedLoads, hostMeta }
}

/**
 * Content-server hostnames (+ weightedload ranking, cycle 5; + per-host
 * https_support/usetokenauth metadata, cycle 7) for chunk download (Plan
 * 05's downloadDepotFiles `hosts`/`hostWeightedLoads`/`hostMeta` params) —
 * steam-user's getContentServers is undocumented in @types/steam-user
 * (Pitfall 5), same discipline as getDepotDecryptionKey/getRawManifest above.
 */
export async function getContentServerHosts(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<{
  hosts: string[]
  weightedLoads: Map<string, number>
  hostMeta: Map<string, ContentServerHostMeta>
}> {
  // [Timing] debug/steam-install-slow-start: this is a live client.getContentServers
  // CM round-trip that runs AFTER buildDepotPlan (already fully instrumented) and
  // BEFORE downloadDepotFiles's first byte — previously unmeasured, and a candidate
  // for the "stuck at 0%" gap the buildDepotPlan-only timing couldn't account for.
  const start = Date.now()
  // G-30-02 (30-07, checker finding #3 extension): bounded — same call-class
  // and rationale as fetchDepotPlanEntry's getDepotDecryptionKey/getRawManifest
  // above; a stale CM socket here would otherwise hang the pre-download phase
  // just as easily as a stale getProductInfo call.
  const servers = await withTimeout(
    new Promise<RawContentServer[]>((resolvePromise, reject) => {
      client.getContentServers(numericAppId, (err, s) =>
        err ? reject(err) : resolvePromise(s)
      )
    }),
    STEAM_PICS_TIMEOUT_MS,
    'getContentServerHosts getContentServers'
  )
  // [Timing] debug/steam-install-slow-start diagnostic lead (a) — ONE-TIME raw
  // dump of the directory response BEFORE we reduce it below. Kept (cycle 5):
  // this is exactly how the cycle-4 capture that motivated this cycle's
  // weightedload-aware selection was read, and remains the fastest way to
  // confirm/deny the directory's ranking on the next hardware run.
  logInfo(
    `[Timing] getContentServerHosts RAW for appId ${numericAppId}: ${JSON.stringify(servers)}`,
    LogPrefix.Steam
  )
  const { hosts, weightedLoads, hostMeta } = reduceContentServers(servers)
  logInfo(
    `[Timing] getContentServerHosts: getContentServers for appId ${numericAppId} took ` +
      `${Date.now() - start}ms, hosts=${hosts.length}, weightedLoads=${weightedLoads.size}`,
    LogPrefix.Steam
  )
  if (!hosts.length) {
    throw new Error('downloadSteamDepots: no content servers available')
  }
  return { hosts, weightedLoads, hostMeta }
}

// Debug/steam-install-slow-start: cycle 2 tried a periodic (3min)
// getContentServers re-fetch that spliced a fresh host list in place,
// hypothesizing that individual degrading/rate-limited edges could be
// dropped by re-resolving the pool. DISPROVEN by the cycle-3 hardware
// reproduction with per-host stats instrumentation: Steam returned the
// IDENTICAL 6-host list every refresh for the whole run ("replaced host list
// (6 -> 6)", same hostnames) — the CDN assigns a fixed edge set per
// app/region and re-resolving it changes nothing. REPLACED (cycle 3) by
// depot/hostHealth.ts's health-aware selection below, which works WITHIN the
// same fixed host pool instead of trying to refresh it away.
