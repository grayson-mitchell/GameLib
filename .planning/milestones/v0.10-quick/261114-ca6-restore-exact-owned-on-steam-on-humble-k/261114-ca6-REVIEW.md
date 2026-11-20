---
phase: 261114-ca6
reviewed: 2026-11-14T00:00:00Z
depth: quick
files_reviewed: 12
files_reviewed_list:
  - src/backend/humble/steamAppIdResolver.ts
  - src/backend/humble/stores.ts
  - src/backend/humble/dedup.ts
  - src/backend/humble/library.ts
  - src/backend/humble/index.ts
  - src/backend/testUtils/testHumble.ts
  - src/common/types/humble.ts
  - src/backend/humble/__tests__/steamAppIdResolver.test.ts
  - src/backend/humble/__tests__/dedup.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/__tests__/library.realstore.test.ts
  - PRIVACY.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Quick 261114-ca6: Code Review Report

Depth quick, but the resolver, library.ts, dedup.ts, stores.ts and PRIVACY.md diffs were read in full. The test files were not read.

## Summary

No blockers. Of the six specific checks:

- **(1) Precision:** sound. Only a unique `type === 'app'` item whose strict-normalized name equals the strict-normalized title is accepted. A resolved id that misses the library falls back to fuzzy, so it can only upgrade ownership.
- **(2) No Steam CM logon/refresh/Go Offline:** the resolver talks only to the public storesearch endpoint and the cache. `startSteamAppIdResolvePass` uses `getSteamGate()`, which reads the cached library.
- **(3) Exit contract:** the inter-request sleep is unref'd, the pass is capped at 40 requests, and each request has an 8s timeout.
- **(4) Rate limiting:** sequential, 350ms gap, cache hit skip, 7-day miss TTL.
- **(5) Logging:** only counts are logged. The error path logs `String(err)`, and an axios error message carries no key codes, cookies or tokens.

The weaknesses are in cache poisoning and in a race (check 6).

## Warnings

### WR-01: Malformed or non-JSON 200 response is cached as a 7-day "miss"

**File:** `src/backend/humble/steamAppIdResolver.ts:111-113` (consumed at 205-208)
**Issue:** `searchSteamStoreApps` returns `[]` when `data` is not an object or has no `items` array. `resolvePending` then calls `cache.set(key, {appId: null, checkedAt})`. A 200 with an HTML or interstitial body (rate-limit page, captive portal, CDN error) therefore blocks that title for 7 days. Only thrown errors are treated as errors.
**Fix:** Throw when the shape is invalid (`if (!Array.isArray(items)) throw new Error('storesearch: unexpected response')`). A genuine zero-result response should still return `[]`, since Steam sends `items: []`.

### WR-02: Single-flight guard drops the new sync's pass after a stale or disconnect-driven sync

**File:** `src/backend/humble/library.ts:~444-480` (`resolveInFlight`)
**Issue:** `startSteamAppIdResolvePass` returns early while `resolveInFlight` is set. A stale pass stops only at its next `isStale()` check, which can be up to 8s plus the sleep away. If a fresh sync (reconnect or new fence) finishes in that window, its pass is skipped. Nothing re-triggers it until the following sync, so the exact tier stays degraded to fuzzy. When the stale pass finishes, `.then` also returns early on `isStale()`, so the unpatched titles resolved in its last request are never applied. Related to check 6.
**Fix:** Track the in-flight pass's fence. If `resolveInFlight` belongs to a stale fence, chain the new pass after it (`resolveInFlight.finally(() => start...)`), or set a `rerun` flag that the `.finally` honours.

### WR-03: Resolved ids never expire, so a wrong id sticks forever

**File:** `src/backend/humble/steamAppIdResolver.ts:176, 152-153`; `src/backend/humble/stores.ts` (`humbleSteamAppIdStore`, lifespan null)
**Issue:** The TTL applies only to misses. A hit (including a title later reassigned or re-listed under another app id) is permanent. The id is also copied into the persisted library entry with `steamAppIdResolved`, so correcting the cache alone would not fix an already-patched key. A mismatch cannot self-heal.
**Fix:** Give hits a long TTL (for example 90 days), or provide a clear path. Alternatively, strip `steamAppIdResolved` ids when re-running classify, which already happens on a re-fetch.

## Info

### IN-01: The pass is not aborted at shutdown or stdin EOF

**File:** `src/backend/humble/steamAppIdResolver.ts:130-135, 196-200`
**Issue:** The sleep is unref'd, but the in-flight axios socket (up to 8s) is not. The pass can hold the sidecar open for up to 8s past stdin EOF. This is bounded and probably acceptable. The `isStale` fence does not cover process shutdown.
**Fix:** Optionally pass an `AbortSignal` to axios and abort it from the sidecar's shutdown hook. Alternatively, document the 8s bound.

### IN-02: PRIVACY.md wording is narrower than the trigger

**File:** `PRIVACY.md` (new storesearch row)
**Issue:** The row says "after a Humble refresh while signed in to Steam". The pass runs from `runSync` whenever `getSteamGate().open`, which is true whenever a cached Steam library is present. Verify that the gate actually requires a signed-in session. If it does not, reword the row, for example to "after a Humble sync, when a Steam library is available". The resolver also sends only the key title.
**Fix:** Align the wording with `getSteamGate`.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
