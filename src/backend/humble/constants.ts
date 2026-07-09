// Humble domain constants (Phase 10 scaffold).
// Mirrors src/backend/storeManagers/steam/constants.ts's TOKEN_STORE_KEY/TOKEN_PREFIX shape.

export const HUMBLE_TOKEN_STORE_KEY = 'sessionCookie'
export const HUMBLE_TOKEN_PREFIX = 'humble:v1:'

// Persistent (Chromium-backed) session partition shared between the
// /loginweb/humble embedded WebView (renderer) and this main-process cookie
// watch (D-18). Renamed from the in-memory 'humble-login' value so the login
// survives restarts and reconnect (D-11) can skip re-authentication.
export const HUMBLE_LOGIN_PARTITION = 'persist:humble'

export const HUMBLE_BASE_URL = 'https://www.humblebundle.com'
export const HUMBLE_LOGIN_URL = 'https://www.humblebundle.com/login'

// Required on every outgoing Humble API request (adapter.ts) — the likely
// cause of prior third-party Humble integration failures when omitted.
export const HUMBLE_REQUIRED_HEADERS = {
  'X-Requested-By': 'hb_android_app',
  Accept: 'application/json'
}

// D-25: bound on in-flight order-detail fetches during a sync (library.ts,
// Plan 02) — a Humble-side denial is never hammered by an unbounded fan-out.
export const HUMBLE_SYNC_CONCURRENCY = 3

// D-33: duration a 403/429 denial gates even the manual refresh button
// (library.ts, Plan 02). 15 minutes — Claude's discretion per CONTEXT.md.
export const HUMBLE_COOLDOWN_MS = 15 * 60 * 1000

// Live-UAT round 6: version stamp of the classification logic (classify.ts).
// D-24 freezes fully-terminal cached orders (never re-fetched), so a
// classifier fix can never reach their cached rows — the tester's stale
// PDF-entitlement rows survived round 5's filter exactly this way. When the
// version stored in humbleSyncStore differs from this constant, library.ts
// bypasses the frozen-order skip ONCE (full re-fetch + re-classification),
// then stamps the new version after a clean pass. BUMP THIS whenever
// classification semantics change (filters, precedence, field extraction):
//   1 = rounds 1-5 (implicit — pre-versioning caches read as 1)
//   2 = round 6: D-29 v2 direct-redeem entitlement exclusion
//   3 = Phase 12: steam_app_id capture added to classifyOrder
//   4 = Phase 14: keyindex extraction added to classifyOrder
//   5 = Phase 14 gap closure (14-07): redeemed_key_val now means REVEALED,
//       not REDEEMED (REDEEMED is local-only via isLocallyRedeemed) — forces
//       reclassification of every cached row that was misclassified REDEEMED
//       under the old (wrong) precedence.
export const HUMBLE_CLASSIFIER_VERSION = 5

// HDEDUP-01 success criterion 3 (Phase 12 dedup fuzzy-name fallback):
// locked at 85%+, NOT the community-norm 70% — DLC titles false-positive
// match base games at lower thresholds and false positives waste gift links.
export const HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85

// Phase 14 guided claim flow (HCLAIM-01): path-only, joined to
// HUMBLE_BASE_URL at call time by the adapter (C5 isolation) — the endpoint
// used to redeem a revealed key against a Humble-hosted platform.
export const HUMBLE_REDEEM_PATH = '/humbler/redeemkey'
