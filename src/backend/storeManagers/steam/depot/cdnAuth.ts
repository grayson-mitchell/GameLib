// Debug/steam-install-slow-start (cycle 6): CDN auth token support for depot
// chunk downloads.
//
// ROOT CAUSE this closes (see .planning/debug/steam-install-slow-start.md,
// cycle-6 directive): `fetchChunk` (depot/decompress.ts) builds
// `https://${host}/depot/${depotId}/chunk/${sha}` with NO auth token, and
// nothing in this codebase ever calls steam-user's `getCDNAuthToken`. The
// cycle-5 hardware run correlated failures EXACTLY with content-server
// `type`: the three `type=CDN` global SteamPipe edges (weightedload=130 —
// steampipe.akamaized.net, alibaba.cdn.steampipe.steamcontent.com,
// fastly.cdn.steampipe.steamcontent.com) failed ~100% of attempts, while the
// `type=SteamCache` local edges (which do not require a token) worked. The
// real Steam client uses ALL six servers via GetCDNAuthToken; this codebase
// was locked out of the CDN half of the pool entirely.
//
// VERIFIED API (read directly from the INSTALLED steam-user@5.3.0 source,
// node_modules/steam-user/components/cdn.js:144-165 — not assumed, same
// discipline already established for getDepotDecryptionKey/getRawManifest/
// getContentServers in depot.ts's SteamUserDepotExtras):
//
//   getCDNAuthToken(appID, depotID, hostname, callback)
//     -> callback(err, { token: string, expires: Date })
//
//   Internally: `this._send(EMsg.ClientGetCDNAuthToken, { app_id, depot_id,
//   host_name }, ...)`; on success resolves/calls back with
//   `{ token: body.token, expires: new Date(body.expiration_time * 1000) }`.
//   steam-user ALSO keeps its own internal cache
//   (`this._contentServerTokens[depotID + '_' + hostname]`), reused while
//   more than 1 hour remains before expiry — confirming per-depot+host
//   granularity (the request itself is keyed by `{app_id, depot_id,
//   host_name}`), not per-app or per-depot-only.
//
// TOKEN FORMAT: steam-user's OWN consumers of this API
// (cdn.js's `getRawManifest`/`downloadChunk`, lines ~240/~334) append the
// resolved `token` DIRECTLY to the URL with no separator inserted by the
// caller (`` `${urlBase}/depot/${depotID}/chunk/${chunkSha1}${token}` ``) —
// this is only correct if `body.token` (the raw string Steam's CM sends back)
// already contains its own leading `?` (Steam's CDN auth token has always been
// a full query-string fragment, e.g. `?...`, historically confirmed by both
// SteamKit2's CDNClient and node-steam-user's own usage pattern above). This
// module mirrors that exact discipline: `getToken` returns the token string
// UNMODIFIED (or `''` when no token is available/needed) for the caller to
// append verbatim — never inserts its own `?` or `&`.
//
// SECURITY: the token is a short-lived credential. NEVER log its value —
// every log line below reports only host/depot/length/expiry, never the
// token string itself. Never persisted to disk; lives only in this in-memory,
// per-download-run cache (mirrors depot/hostHealth.ts's own "never a
// module-level singleton" discipline).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'

/** Narrow surface of steam-user's undocumented getCDNAuthToken this module
 *  depends on (Pitfall 5 discipline — see depot.ts's SteamUserDepotExtras).
 *  A caller supplies its real SteamUserDepotClient (which satisfies this
 *  shape) or, in tests, a lightweight fake. */
export interface CDNAuthTokenClient {
  getCDNAuthToken(
    appId: number,
    depotId: number,
    hostname: string,
    callback: (err: Error | null, result?: { token: string; expires: Date }) => void
  ): void
}

/** Proactive refresh: a cached token within this many ms of its reported
 *  expiry is treated as already-expired and re-fetched BEFORE use, rather
 *  than being handed to a chunk request that would then 401/403 mid-stream.
 *  Chosen well below steam-user's own internal 1-hour reuse threshold so this
 *  cache's proactive refresh fires first in practice — steam-user's cache is
 *  a harmless second layer underneath this one, never the one doing the
 *  expiry judgment call for us. */
export const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000

interface CachedToken {
  token: string
  expiresAt: number
}

/**
 * Per-download-run CDN auth token cache. ONE instance per downloadSteamDepots
 * invocation (created in downloadSteamDepots, alongside HostHealthTracker,
 * where the authenticated client is available) — deliberately never a
 * module-level singleton, matching depot/hostHealth.ts's discipline: a token
 * is only ever meaningful for the run/session that fetched it, and tests must
 * never leak cached tokens into each other.
 *
 * Fetches AT MOST once per depot+host (the API's own granularity — a request
 * is keyed by `{app_id, depot_id, host_name}`), never once per chunk:
 *   - a cache hit within the proactive-refresh window returns the cached
 *     token synchronously (well, as an already-resolved Promise);
 *   - concurrent callers racing for the SAME depot+host (many chunk-fetch
 *     workers can hit an empty cache entry at once) are coalesced onto a
 *     SINGLE in-flight fetch via `pending` — never N redundant CM round-trips
 *     for the same key;
 *   - a fetch failure is caught, logged (no token/secret content), and
 *     resolves to `''` — degrades to the pre-cycle-6 token-less request for
 *     that attempt rather than throwing and aborting the whole chunk fetch
 *     (a content server that doesn't actually require a token, or a
 *     transient CM hiccup, must never become a hard failure here — fetchChunk's
 *     own existing retry/host-rotation mechanism remains the single place a
 *     genuine chunk failure is decided).
 */
export class CdnAuthTokenCache {
  private readonly cache = new Map<string, CachedToken>()
  private readonly pending = new Map<string, Promise<string>>()

  constructor(
    private readonly client: CDNAuthTokenClient,
    private readonly appId: number
  ) {}

  private static key(depotId: string, host: string): string {
    return `${depotId}_${host}`
  }

  /** Returns the token string to append VERBATIM to a chunk/manifest URL
   *  (already including its own leading `?` per steam-user's own usage
   *  convention — see module doc comment), or `''` when no token could be
   *  obtained. Never throws. */
  async getToken(depotId: string, host: string): Promise<string> {
    const key = CdnAuthTokenCache.key(depotId, host)
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt - Date.now() > PROACTIVE_REFRESH_BUFFER_MS) {
      return cached.token
    }

    const existingFetch = this.pending.get(key)
    if (existingFetch) {
      return existingFetch
    }

    const fetchPromise = this.fetch(depotId, host, key)
    this.pending.set(key, fetchPromise)
    try {
      return await fetchPromise
    } finally {
      this.pending.delete(key)
    }
  }

  private async fetch(depotId: string, host: string, key: string): Promise<string> {
    try {
      const result = await new Promise<{ token: string; expires: Date }>(
        (resolvePromise, reject) => {
          this.client.getCDNAuthToken(this.appId, Number(depotId), host, (err, res) => {
            if (err) return reject(err)
            if (!res) return reject(new Error('getCDNAuthToken: empty response'))
            return resolvePromise(res)
          })
        }
      )
      const expiresAt = result.expires.getTime()
      this.cache.set(key, { token: result.token, expiresAt })
      // SECURITY: log length/expiry only — NEVER the token value itself.
      logInfo(
        `[Timing] CDN auth token acquired: depot=${depotId} host=${host} ` +
          `tokenLen=${result.token.length} expiresInMs=${Math.max(0, expiresAt - Date.now())}`,
        LogPrefix.Steam
      )
      return result.token
    } catch (err) {
      logWarning(
        [`CdnAuthTokenCache: getCDNAuthToken failed for depot=${depotId} host=${host}:`, err],
        LogPrefix.Steam
      )
      // Degrade to a token-less request rather than failing the chunk fetch
      // outright — some hosts (SteamCache locals) never needed a token at
      // all; a transient CM hiccup fetching one must not become a hard
      // failure by itself.
      return ''
    }
  }

  /** Reactive refresh: invalidates a cached token so the NEXT getToken call
   *  for this exact depot+host re-fetches instead of serving a value the
   *  server just rejected (401/403). Never throws; a no-op if nothing was
   *  cached for this key. */
  invalidate(depotId: string, host: string): void {
    this.cache.delete(CdnAuthTokenCache.key(depotId, host))
  }
}
