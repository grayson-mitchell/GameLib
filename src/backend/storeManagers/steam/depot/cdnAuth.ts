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
// TRANSPORT (implementation cycle, RESEARCH SPIKE-confirmed): steam-user's
// PUBLIC `getCDNAuthToken()` (node_modules/steam-user/components/cdn.js:
// 144-165) sends the LEGACY `EMsg.ClientGetCDNAuthToken` — a message Valve
// moved server-side at some point after `cdn.js` was written (per SteamKit2's
// own changelog: "SteamApps.GetCDNAuthToken was moved to
// SteamContent.GetCDNAuthToken due to a Steam change"). Calling it timed out
// on real hardware (cycle 6) because nothing answers it anymore. This module
// instead calls the MODERN unified RPC directly —
// `ContentServerDirectory.GetCDNAuthToken#1` via `client._sendUnified(...)` —
// mirroring steam-user's own (WORKING) sibling call `getManifestRequestCode`
// (cdn.js:281-303) line-for-line:
//
//   this._sendUnified('ContentServerDirectory.GetManifestRequestCode#1', {
//     app_id, depot_id, manifest_id, app_branch, branch_password_hash
//   }, (body, hdr) => {
//     let err = Helpers.eresultError(hdr.proto);
//     ...
//   });
//
// steam-user@5.3.0 already bundles the compiled protobuf schema for the
// CDN-auth-token sibling RPC too (verified directly against the installed
// dependency's own `steammessages_contentsystem.steamclient.proto`) — it is
// simply never wired up:
//
//   rpc GetCDNAuthToken (.CContentServerDirectory_GetCDNAuthToken_Request)
//                   returns (.CContentServerDirectory_GetCDNAuthToken_Response);
//
//   message CContentServerDirectory_GetCDNAuthToken_Request {
//     optional uint32 depot_id = 1;
//     optional string host_name = 2;
//     optional uint32 app_id = 3;
//   }
//   message CContentServerDirectory_GetCDNAuthToken_Response {
//     optional string token = 1;
//     optional uint32 expiration_time = 2;
//   }
//
// `_sendUnified` is a plain, non-private prototype method on steam-user's
// client (node_modules/steam-user/components/03-messages.js:726, called
// dozens of times elsewhere in steam-user's own codebase, e.g. every method
// in chatroom.js) — fully callable externally on a connected client instance
// without forking the dependency.
//
// `expiration_time` (epoch SECONDS, matching the legacy
// CMsgClientGetCDNAuthTokenResponse's own field of the same name) maps to
// this module's `expiresAt` (epoch MILLISECONDS) via `* 1000` — same mapping
// the legacy path already used.
//
// TOKEN FORMAT: steam-user's OWN consumers of the CDN-auth-token concept
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
// CYCLE 11 UPDATE (debug/steam-install-slow-start, "Cycle 10 gap-closure
// attempt" + "DECISION 2026-07-19: OPTION B"): the TRANSPORT section above
// (calling `client._sendUnified(...)`) was proven to throw
// `TypeError: Cannot read properties of undefined (reading 'encode')` on real
// hardware. Root cause (exhaustively confirmed by enumerating all 294 keys
// steam-user@5.3.0 registers in its private `protobufs` encode/decode lookup
// map, node_modules/steam-user/components/03-messages.js): the method-name
// STRING `ContentServerDirectory.GetCDNAuthToken#1` is correct (verified
// against the installed `.proto`), but steam-user never wired this specific
// RPC's compiled message classes into that map, in EITHER direction —
// `_sendUnified`'s own encode step (`protobufs[methodName + '_Request']`) and
// `_handleMessage`'s response-decode step (`protobufs[handlerName]`) are both
// unpopulated for this RPC; only the sibling `GetManifestRequestCode` and the
// unrelated legacy `EMsg.ClientGetCDNAuthToken*` are present. The compiled
// classes DO exist and DO have working `.encode`/`.decode` — they are simply
// never looked up via that map — so this module now bypasses `_sendUnified`
// entirely and talks to the SAME transport it delegates to (`client._send`,
// 03-messages.js:419) directly:
//   1. Encode the request manually via the compiled
//      `CContentServerDirectory_GetCDNAuthToken_Request` class (loaded from
//      steam-user's own `protobufs/generated/_load.js`, the same bundle
//      `_sendUnified`/`_handleMessage` read from — proven present with a
//      real, callable `.encode`/`.decode` by direct inspection).
//   2. Send it via `client._send({ msg: EMsg.ServiceMethodCallFromClient,
//      proto: { target_job_name: 'ContentServerDirectory.GetCDNAuthToken#1' } },
//      encodedBuffer, callback)` — this is EXACTLY what `_sendUnified` itself
//      does internally (03-messages.js:726-736); the only thing this module
//      skips is `_sendUnified`'s own now-proven-broken encode step. `_send`
//      does not double-encode: `_send`'s own encode branch only fires when
//      `protobufs[emsg]` resolves for the raw EMsg number, and
//      `EMsg.ServiceMethodCallFromClient` itself is NOT in that map either
//      (confirmed) — a pre-encoded `Buffer` body passes through untouched.
//   3. Decode the raw response body manually in the callback via the
//      compiled `_Response` class, since `_handleMessage`'s own auto-decode
//      is skipped for this RPC for the same missing-map-entry reason (the
//      response callback receives the RAW, undecoded `Buffer`/`ByteBuffer`
//      body, silently, no error).
// `EMsg.ServiceMethodCallFromClient` (steam-user's own numeric value, `151`)
// is a local, hardcoded constant rather than a VALUE import of the real
// 'steam-user' package — every OTHER import of steam-user in this store
// manager is `import type` only (e.g. depot.ts:15); several existing test
// suites (depotPrimitives.test.ts, depot.test.ts) inject a fake client and
// never mock the real 'steam-user' package, and a value import here would
// force them to. The numeric value is cited directly against
// node_modules/@types/steam-user's own `EMsg.ServiceMethodCallFromClient`
// declaration and re-derived by `_sendUnified`'s own header construction.
//
// REGRESSION GUARD (implementation cycle, PART 3 — the single most important
// correctness property this cycle adds): cycle 6's regression was a token
// round-trip that never resolved, blocking every chunk-worker slot behind a
// ~10s stall. `_sendUnified` has NO built-in timeout of its own (unlike
// steam-user's public `getCDNAuthToken` wrapper, which wraps its EMsg send in
// a 10s `timeoutCallbackPromise` — and which this module no longer calls at
// all) — so THIS module owns the timeout budget end-to-end, and bounds it
// far tighter (a few seconds, not 10s+): `CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS`.
// A token round-trip that fails OR times out for a given depot+host is
// NEGATIVE-CACHED for `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS` — every other
// concurrent or subsequent `getToken()` call for that exact key short-
// circuits to `''` immediately (NO network attempt at all) until the
// cooldown elapses, so a persistently-unreachable token endpoint can never
// re-pay the bounded timeout once per chunk. Either way, `getToken()` NEVER
// throws and NEVER blocks the caller past the bounded timeout — it always
// degrades to `''` (token-less) on failure, letting fetchChunk's own
// existing retry/host-rotation/hostHealth mechanism (which then sees that
// host 403 and deprioritizes it) decide the outcome. A hanging/failing token
// fetch must NEVER block, serialize, or stall the chunk-download pipeline.
//
// SECURITY: the token is a short-lived credential. NEVER log its value —
// every log line below reports only host/depot/length/expiry, never the
// token string itself. Never persisted to disk; lives only in this in-memory,
// per-download-run cache (mirrors depot/hostHealth.ts's own "never a
// module-level singleton" discipline).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'

/** Narrow surface of steam-user's own (protected-by-convention, but plain
 *  public prototype method) `_send` this module depends on (Pitfall 5
 *  discipline — see depot.ts's SteamUserDepotExtras). Cycle 11: switched from
 *  `_sendUnified` to the same lower-level transport it delegates to, because
 *  `_sendUnified`'s own encode step throws for this specific RPC (see the
 *  module doc comment's CYCLE 11 UPDATE section) — `_send` itself has no such
 *  gap, since this module now supplies an already-encoded `Buffer` body. A
 *  caller supplies its real SteamUserDepotClient (which satisfies this
 *  shape) or, in tests, a lightweight fake. The callback's `body` arrives as
 *  whichever RAW (undecoded) shape steam-user's transport produced — a
 *  `Buffer` or a `bytebuffer` `ByteBuffer` instance — because steam-user's own
 *  auto-decode is skipped for this RPC for the same missing-map-entry reason;
 *  this module decodes it manually (`decodeCdnAuthTokenResponse` below).
 *  `hdr.proto.eresult` is Steam's own success/failure result code — `1` is
 *  `EResult.OK` (see node_modules/steam-user/components/helpers.js's own
 *  `eresultError`: `if (eresult == EResult.OK) return null`); duplicated here
 *  as a bare numeric constant rather than importing steam-user's private
 *  Helpers/EResult modules. */
export interface CDNAuthTokenClient {
  _send(
    header: { msg: number; proto: { target_job_name: string } },
    body: Buffer,
    callback: (body: unknown, hdr?: { proto?: { eresult?: number } }) => void
  ): void
}

/** EResult.OK — see this module's doc comment above. */
const ERESULT_OK = 1

/** `EMsg.ServiceMethodCallFromClient` — see the module doc comment's CYCLE 11
 *  UPDATE section for why this is a hardcoded local constant rather than a
 *  value import of the real 'steam-user' package. Confirmed against
 *  node_modules/@types/steam-user/index.d.ts's own `EMsg` enum AND against
 *  the installed steam-user@5.3.0's own `_sendUnified` implementation
 *  (03-messages.js:726-736), which builds this exact header itself:
 *  `{ msg: EMsg.ServiceMethodCallFromClient, proto: { target_job_name:
 *  methodName } }`. */
const EMSG_SERVICE_METHOD_CALL_FROM_CLIENT = 151

/** Undocumented, version-bump-fragile export path (Pitfall 5) — mirrors
 *  depot.ts's `loadContentManifestParser` pattern exactly (same dynamic-
 *  import + loud-throw-on-missing-shape discipline). Loaded lazily (not at
 *  module scope) so importing this module never forces a real 'steam-user'
 *  package load at test-collection time. */
interface CdnAuthTokenSchema {
  Request: { encode(data: Record<string, unknown>): { finish(): Buffer } }
  Response: {
    decode(buf: Buffer): { token?: string; expiration_time?: number }
  }
}

let cachedSchema: CdnAuthTokenSchema | undefined

/** Synchronous (`require`, not `await import`) — deliberately, unlike
 *  depot.ts's `loadContentManifestParser`: `callGetCDNAuthToken` below must
 *  preserve its pre-cycle-11 SYNCHRONOUS-until-`_send` structure (the
 *  `new Promise((resolvePromise, reject) => { ...; this.client._send(...) })`
 *  executor calls `_send` synchronously, exactly as `_sendUnified` did
 *  before), so every existing timer-based test (jest.useFakeTimers +
 *  advanceTimersByTimeAsync around the bounded timeout/cooldown, the
 *  concurrent-coalescing test's synchronous post-call assertion) keeps
 *  working unchanged — inserting an `await` here (even for an
 *  already-cached value) would push the real `_send` call at least one
 *  microtask tick later than every one of those tests currently assumes.
 *  Loaded lazily (only when a token is actually fetched, not at module
 *  scope) and cached thereafter — same discipline as
 *  loadContentManifestParser, just synchronous. */
function loadCdnAuthTokenSchema(): CdnAuthTokenSchema {
  if (cachedSchema) return cachedSchema

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('steam-user/protobufs/generated/_load.js') as Record<
    string,
    unknown
  >
  const Request = mod.CContentServerDirectory_GetCDNAuthToken_Request as
    | CdnAuthTokenSchema['Request']
    | undefined
  const Response = mod.CContentServerDirectory_GetCDNAuthToken_Response as
    | CdnAuthTokenSchema['Response']
    | undefined

  if (
    typeof Request?.encode !== 'function' ||
    typeof Response?.decode !== 'function'
  ) {
    throw new Error(
      'CdnAuthTokenCache: steam-user/protobufs/generated/_load.js no longer exports ' +
        'CContentServerDirectory_GetCDNAuthToken_Request/_Response with usable encode/decode ' +
        '— this internal path is undocumented (Pitfall 5) and may have moved on a steam-user ' +
        'version bump. Re-verify the export shape before proceeding.'
    )
  }

  cachedSchema = { Request, Response }
  return cachedSchema
}

/** `_send`'s raw response body for this RPC arrives as whichever shape
 *  steam-user's transport produced — a `Buffer` OR a `bytebuffer`
 *  `ByteBuffer` instance — since steam-user's own auto-decode
 *  (`_handleMessage`'s `protobufs[handlerName]` lookup) is skipped for this
 *  RPC (missing map entry, same root cause as the request side). Duck-typed
 *  via `.toBuffer()` (PART 4 discipline: never `instanceof` across a
 *  dependency's own bundled sub-dependency) rather than importing
 *  steam-user's private `bytebuffer` package directly — mirrors steam-user's
 *  own `_decodeProto`'s `ByteBuffer.isByteBuffer(encoded) ->
 *  encoded.toBuffer()` normalization (03-messages.js:360-363) without that
 *  import. */
function normalizeResponseBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  const maybeByteBuffer = raw as { toBuffer?: () => Buffer } | null | undefined
  if (typeof maybeByteBuffer?.toBuffer === 'function') {
    return maybeByteBuffer.toBuffer()
  }
  throw new Error(
    'ContentServerDirectory.GetCDNAuthToken: response body is neither a Buffer nor a ' +
      'ByteBuffer-shaped object — cannot decode.'
  )
}

/** Manual replacement for steam-user's own `_decodeProto` (which this RPC's
 *  response never reaches — missing map entry). `_decodeProto` normalizes a
 *  MISSING field to `null` (03-messages.js:360-410's `replaceDefaults`)
 *  rather than protobufjs's own raw `decode()`-level default (`''` for a
 *  missing `string`, `0` for a missing `uint32`) — but every consumer of
 *  this function's result only ever checks these two fields for FALSY-ness
 *  (`!body.token`, `body.expiration_time && ... > 0`), and `''`/`0` are
 *  exactly as falsy as `null` for that purpose, so the two representations
 *  are behavior-equivalent for every caller here (verified directly against
 *  the installed dependency, debug/steam-install-slow-start cycle 11). */
function decodeCdnAuthTokenResponse(
  schema: CdnAuthTokenSchema,
  rawBody: unknown
): { token: string; expiration_time: number } {
  const buf = normalizeResponseBuffer(rawBody)
  const decoded = schema.Response.decode(buf)
  return {
    token: decoded.token ?? '',
    expiration_time: decoded.expiration_time ?? 0
  }
}

/** DIAGNOSTIC (debug/steam-install-slow-start, cycle 12): never throws — a
 *  best-effort, redacted (no token content, ever) description of the raw
 *  response body's shape/size, used ONLY for the "empty response" diagnostic
 *  log below. Distinct from `normalizeResponseBuffer` (which THROWS on an
 *  unrecognized shape, by design, since decode genuinely cannot proceed) —
 *  this helper must never itself throw, since it runs on the path that is
 *  ABOUT to log a diagnostic and reject; a description failure here must
 *  never mask or replace the real "empty response" rejection. */
function describeRawBody(raw: unknown): {
  shape: string
  byteLength: number | null
} {
  if (Buffer.isBuffer(raw)) return { shape: 'Buffer', byteLength: raw.length }
  const maybeByteBuffer = raw as { toBuffer?: () => Buffer } | null | undefined
  if (typeof maybeByteBuffer?.toBuffer === 'function') {
    try {
      return {
        shape: 'ByteBuffer',
        byteLength: maybeByteBuffer.toBuffer().length
      }
    } catch {
      return { shape: 'ByteBuffer(unreadable)', byteLength: null }
    }
  }
  if (raw === null || raw === undefined)
    return { shape: String(raw), byteLength: null }
  return { shape: typeof raw, byteLength: null }
}

/** Proactive refresh: a cached token within this many ms of its reported
 *  expiry is treated as already-expired and re-fetched BEFORE use, rather
 *  than being handed to a chunk request that would then 401/403 mid-stream.
 *  Chosen well below steam-user's own internal 1-hour reuse threshold so this
 *  cache's proactive refresh fires first in practice — steam-user's cache is
 *  a harmless second layer underneath this one, never the one doing the
 *  expiry judgment call for us. */
export const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** PART 3 (regression guard): bounds the CM round-trip for
 *  ContentServerDirectory.GetCDNAuthToken to a few seconds, not 10s+ — see
 *  the module doc comment's REGRESSION GUARD section. Chosen well under
 *  fetchChunk's own CHUNK_FETCH_TIMEOUT_MS (15s) so a token fetch can never
 *  itself become the slow part of a single chunk attempt. */
export const CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS = 3000

/** PART 3 (regression guard): once a depot+host token fetch fails or times
 *  out, this cache stops even ATTEMPTING that exact depot+host for this long
 *  — every other chunk-worker's concurrent/subsequent `getToken()` call for
 *  the SAME key short-circuits to `''` synchronously (no network round-trip
 *  at all) until the cooldown elapses. Without this, a host/RPC that will
 *  never answer (e.g. an ACL/version gate) would otherwise re-pay the bounded
 *  timeout on every single chunk that lands on it across a large install —
 *  still bounded per-attempt, but needlessly repeated thousands of times. */
export const CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS = 60 * 1000

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
 *   - a depot+host currently in its failure COOLDOWN (PART 3) returns `''`
 *     immediately, with NO network attempt at all;
 *   - a cache hit within the proactive-refresh window returns the cached
 *     token synchronously (well, as an already-resolved Promise);
 *   - concurrent callers racing for the SAME depot+host (many chunk-fetch
 *     workers can hit an empty cache entry at once) are coalesced onto a
 *     SINGLE in-flight fetch via `pending` — never N redundant CM round-trips
 *     for the same key;
 *   - a fetch failure OR a bounded timeout (PART 3) is caught, logged (no
 *     token/secret content), starts a cooldown for that key, and resolves to
 *     `''` — degrades to the pre-cycle-6 token-less request for that attempt
 *     rather than throwing and aborting the whole chunk fetch (a content
 *     server that doesn't actually require a token, or a transient CM
 *     hiccup, must never become a hard failure here, and must never block or
 *     serialize the chunk-download pipeline — fetchChunk's own existing
 *     retry/host-rotation mechanism remains the single place a genuine chunk
 *     failure is decided).
 */
export class CdnAuthTokenCache {
  private readonly cache = new Map<string, CachedToken>()
  private readonly pending = new Map<string, Promise<string>>()
  /** PART 3: key -> cooldown-expiry timestamp (ms). Present only for a key
   *  whose most recent fetch attempt failed or timed out. */
  private readonly negativeCache = new Map<string, number>()

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
   *  obtained (including a currently-in-cooldown key, PART 3). Never throws,
   *  never blocks past `CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS`. */
  async getToken(depotId: string, host: string): Promise<string> {
    const key = CdnAuthTokenCache.key(depotId, host)

    // PART 3 (regression guard): a depot+host still in its failure cooldown
    // never even attempts a network round-trip — this is what guarantees a
    // persistently-failing/unreachable token endpoint can NEVER re-block the
    // chunk pipeline once its cooldown starts, no matter how many chunks
    // land on this host in the meantime.
    const cooldownUntil = this.negativeCache.get(key)
    if (cooldownUntil !== undefined) {
      if (Date.now() < cooldownUntil) return ''
      this.negativeCache.delete(key)
    }

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

  private async fetch(
    depotId: string,
    host: string,
    key: string
  ): Promise<string> {
    try {
      const result = await this.callGetCDNAuthToken(depotId, host)
      this.cache.set(key, result)
      this.negativeCache.delete(key)
      // SECURITY: log length/expiry only — NEVER the token value itself.
      logInfo(
        `[Timing] CDN auth token acquired: depot=${depotId} host=${host} ` +
          `tokenLen=${result.token.length} expiresInMs=${Math.max(0, result.expiresAt - Date.now())}`,
        LogPrefix.Steam
      )
      return result.token
    } catch (err) {
      // PART 3 (regression guard): a failure OR a bounded timeout NEVER
      // throws out of getToken — degrade to a token-less request for this
      // attempt, and start a cooldown so every OTHER chunk-worker's
      // concurrent/subsequent call for this exact depot+host short-circuits
      // to '' too, instead of each one independently re-paying the bounded
      // timeout.
      this.negativeCache.set(
        key,
        Date.now() + CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS
      )
      logWarning(
        [
          `CdnAuthTokenCache: GetCDNAuthToken failed for depot=${depotId} host=${host}:`,
          err
        ],
        LogPrefix.Steam
      )
      return ''
    }
  }

  /** PART 1 (cycle 11: manual `_send` bypass) + PART 3 (bounded timeout) —
   *  see the module doc comment's CYCLE 11 UPDATE and REGRESSION GUARD
   *  sections for the full evidence trail. Encodes the request manually via
   *  the compiled protobuf classes (steam-user's own `_sendUnified` would
   *  throw here — its encode map is missing this specific RPC), sends it via
   *  the exact same lower-level transport `_sendUnified` itself delegates to
   *  (`client._send`), and decodes the response manually too (steam-user's
   *  own auto-decode is skipped for this RPC for the same reason). `_send`
   *  itself has no built-in timeout, so this method races the CM round-trip
   *  against `CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS` locally: a timeout rejects
   *  immediately (never blocking the caller past that bound); if the real
   *  callback fires later anyway, the already-settled promise silently
   *  ignores it (no double-resolve, no crash — steam-user itself has no way
   *  to "cancel" an in-flight ServiceMethodCallFromClient, so the discarded
   *  closure is the only cost). */
  private callGetCDNAuthToken(
    depotId: string,
    host: string
  ): Promise<{ token: string; expiresAt: number }> {
    const schema = loadCdnAuthTokenSchema()
    const requestBuffer = schema.Request.encode({
      app_id: this.appId,
      depot_id: Number(depotId),
      host_name: host
    }).finish()

    return new Promise((resolvePromise, reject) => {
      let settled = false
      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        reject(
          new Error(
            `ContentServerDirectory.GetCDNAuthToken timed out after ${CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS}ms`
          )
        )
      }, CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS)

      this.client._send(
        {
          msg: EMSG_SERVICE_METHOD_CALL_FROM_CLIENT,
          proto: { target_job_name: 'ContentServerDirectory.GetCDNAuthToken#1' }
        },
        requestBuffer,
        (rawBody, hdr) => {
          // The bounded timeout above already fired and settled this
          // promise — a late response (or a response after we've already
          // moved on) must never attempt a second resolve/reject.
          if (settled) return
          settled = true
          clearTimeout(timeoutId)

          const eresult = hdr?.proto?.eresult
          if (eresult !== undefined && eresult !== ERESULT_OK) {
            reject(
              new Error(
                `ContentServerDirectory.GetCDNAuthToken failed: eresult=${eresult}`
              )
            )
            return
          }

          let body: { token: string; expiration_time: number }
          try {
            body = decodeCdnAuthTokenResponse(schema, rawBody)
          } catch (decodeErr) {
            reject(
              decodeErr instanceof Error
                ? decodeErr
                : new Error(String(decodeErr))
            )
            return
          }

          if (!body.token) {
            // DIAGNOSTIC (debug/steam-install-slow-start, cycle 12): a
            // cycle-11 hardware run reached this exact branch for every
            // type=CDN host (akamai/fastly/alibaba) — the RPC now
            // encodes/sends/gets a real callback (cycle 10's TypeError is
            // gone), but the decoded response has no token. This is the
            // single fact that distinguishes a genuine server-side rejection
            // (eresult != OK, or a well-formed-but-empty business response)
            // from a decode-side bug on our end (e.g. wrong body arg,
            // ByteBuffer-vs-Buffer mishandling, or decoding a buffer that
            // isn't actually this message's payload): log the RAW eresult
            // value and the raw response body's shape/byte length BEFORE
            // rejecting. NEVER logs token content — only eresult (a small
            // integer code), the body's shape/length, and the (non-secret)
            // decoded expiration_time. A non-zero rawBodyBytes alongside a
            // plausible decodedExpirationTime points at a genuine
            // well-formed-but-tokenless response; a suspiciously tiny/zero
            // rawBodyBytes or an unrecognized rawBodyShape points at a
            // decode-side bug instead.
            const rawBodyInfo = describeRawBody(rawBody)
            logWarning(
              [
                'CdnAuthTokenCache: empty token field in decoded GetCDNAuthToken response ' +
                  `for depot=${depotId} host=${host} eresult=${eresult ?? 'undefined'} ` +
                  `rawBodyShape=${rawBodyInfo.shape} rawBodyBytes=${rawBodyInfo.byteLength ?? 'unknown'} ` +
                  `decodedExpirationTime=${body.expiration_time}`
              ],
              LogPrefix.Steam
            )
            reject(
              new Error(
                'ContentServerDirectory.GetCDNAuthToken: empty response'
              )
            )
            return
          }

          // expiration_time is epoch SECONDS (matches the legacy
          // CMsgClientGetCDNAuthTokenResponse field of the same name) — map
          // to epoch MILLISECONDS for this cache's expiresAt. A missing/zero
          // value is treated as already-expired (never trusted) rather than
          // cached indefinitely.
          const expiresAt =
            body.expiration_time && body.expiration_time > 0
              ? body.expiration_time * 1000
              : Date.now()
          resolvePromise({ token: body.token, expiresAt })
        }
      )
    })
  }

  /** Reactive refresh: invalidates a cached token so the NEXT getToken call
   *  for this exact depot+host re-fetches instead of serving a value the
   *  server just rejected (401/403). Never throws; a no-op if nothing was
   *  cached for this key. Deliberately does NOT touch the failure cooldown
   *  (PART 3) — a 401/403 means the token itself was rejected, a completely
   *  different signal from "the fetch failed/timed out", and the next
   *  getToken call for this key should attempt a fresh fetch, not sit out a
   *  cooldown it never earned. */
  invalidate(depotId: string, host: string): void {
    this.cache.delete(CdnAuthTokenCache.key(depotId, host))
  }
}
