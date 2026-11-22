---
phase: 86-pure-leaf-services
plan: 07
subsystem: ts-oracle
tags: [oracle, golden, recorded-live, itad, steamgriddb, key-precedence, stale-serve, d-09, d-10, d-11, sc1]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-04's recorder, harness and fixtureRedaction scan; 86-03's Replay"
provides:
  - "TS goldens for ITAD store search, deals and Steam gids (37 cases: 32 synthetic, 5 live) and SteamGridDB search, grids and heroes (12 cases: 7 synthetic, 5 live)"
  - "recorded live ITAD and SteamGridDB responses, keys redacted, recorded by the operator in their own terminal"
  - "recorder: ordered multi-response synthetics and synthetic networkError exchanges; harness: assertLiveRecorded, utcDateString and normaliseDates"
  - "state/storeSearch cache profiles (7) that Rust seeds from"
affects: [86-15, 86-16, 86-14]

actuals:
  tokens: 120000
  tasks: 3
  commits: 3

plan_head_before: c4b02c1403f85b76ce6307499defdd7b8555ca6d
plan_head_after: dadf810064e00ef5fdf3c41e9e5c0824c2b398fa

key-files:
  created:
    - src/backend/info/__tests__/oracle/steamgrid.oracle.test.ts
    - src/backend/info/__tests__/oracle/storeSearch.oracle.test.ts
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/{storeSearch,steamgrid}
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/{storeSearch,steamgrid}
    - src-tauri/crates/gamelib-info/tests/fixtures/state/storeSearch
  modified:
    - src/backend/info/__tests__/oracle/recorder.ts
    - src/backend/info/__tests__/oracle/harness.ts

key-decisions:
  - "Golden keyPerRequest labels the key source of every request (user, env, baked or null) instead of the key itself, so Rust's key precedence is checkable while the key stays REDACTED"
  - "The ITAD oracle normalises the Date() strings CacheStore writes to UTC itself, so compare mode needs no TZ setting"
  - "An unrecorded live case fails with 'live case not recorded: <id>' through assertLiveRecorded and is never skipped"

requirements-completed: []
duration: not measured (spans the operator checkpoint)
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 07: Keyed network slice goldens Summary

**ITAD store search (key precedence, six cache shapes, stale-serve on 429 and network error, non-USD and zero-decimal currencies, localeCompare deal order) and SteamGridDB search, grids and heroes each have TS goldens over responses the operator recorded live in their own terminal, so no key ever entered the conversation or a fixture.**

## Accomplishments

- **SteamGridDB (tracer, Task 1).** 12 cases. Synthetic: no key (empty list, no request), search 401 (rethrows, the golden records the rejection message), the `{id,name}` map, `success:false` joining the API errors, the no-errors fallback message, grids with `styles` and `dimensions` (query encoding pinned), heroes with empty arrays sending no parameters. Live: search for Celeste, search for "Hollow Knight" (the space encodes as `%20`), grids with no styles, grids with `styles: ["alternate"]` and `dimensions: ["460x215","920x430"]`, heroes. The five live cases hold 8 recorded exchanges between them (a search then the grids or heroes request for each of the three grid and hero cases).
- **ITAD (Task 2).** 37 cases. 32 synthetic, on real ITAD shapes from the existing `fixtures/itad/*.json`: key precedence (user beats env beats baked, baked only, none with the `[storeSearch:<code>]` marker, user 401 marks the key rejected and retries with env, an already rejected user key goes straight to env), search US, non-US (AU) and zero-decimal (JP), country normalisation, empty and malformed results, a prices 4xx retried as US, deals for a gid with the fallback country caching both keys, malformed deal entries dropped, equal-price deals whose store names differ by case and accent (pins `localeCompare`, Pitfall 6), gids in batches of 200, a batch that dedupes and caches misses, a fresh cache hit for each of `search:<country>:<hash>`, `deals:<country>:<gid>` and `app<id>`, an expired gids entry refreshed or kept stale when the refresh fails, a 429 with a stale entry (served with `cachedAt`, then the gate blocks the next call), a 500 on deals with a stale entry, and a network error with a stale entry. Five live: Portal in US and DE, Hollow Knight in US, deals for the Portal gid, gids for five Steam appIds (one of them unknown, so the golden holds a `null`).
- **Live recording (Task 3, operator).** The operator exported both keys in their own terminal, ran the record command, then the golden write, then unset the keys. All 16 live exchanges answered HTTP 200 with real data (Portal 2, Hollow Knight and Celeste results, real prices, a real gids map). No 401 or 403 was recorded, so the keys were accepted by both services.

| Slice | Cases | Floor | Live |
| ----- | ----- | ----- | ---- |
| storeSearch | 37 | 19 | 5 |
| steamgrid | 12 | 6 | 5 |

Verification, offline and with `env | grep -c GAMELIB_INFO_` printing 0: the two oracle tests and `fixtureRedaction.test.ts` pass (3 suites, 65 tests); the redaction grep over `recorded/` and `golden/` for both slices prints nothing; `git status` showed new dirty paths only under the two slices' fixture trees (plus foreign files); prettier is clean on both oracle tests; `pnpm planning-gates` 12/12.

## Task Commits

1. **Task 1 (tracer): SteamGridDB oracle, synthetic cases pass, live slots ready** - `dc3e90ff7`
2. **Task 2: ITAD oracle, synthetic cases pass, live slots ready** - `4d711ee4b`
3. **Task 3: operator's live recordings and their goldens** - `dadf81006`

**Commit count.** `commits: 3` counts only 86-07's own commits (matched by the `(86-07)` scope). `git rev-list --count c4b02c1..HEAD` reads 15 because plans 86-05, 86-06 and 86-08 ran on main between this plan's start and now; their commits sit in that range and are not this plan's.

## Deviations from Plan

**1. [Rule 3 - Blocking] Recorder: ordered multi-response synthetics and `networkError` (backward compatible)**
- Several synthetic responses for one method and path are served in order, one per request (the 429-then-success, 4xx-then-US-retry and refresh-fails cases need it). A synthetic exchange with `networkError: true` (status 0) rejects with an AxiosError that has no `response`, which is what a dead network gives the TS. Existing oracles still pass.

**2. [Rule 3 - Blocking] Harness: `assertLiveRecorded`, `utcDateString`, `normaliseDates`**
- `assertLiveRecorded` is what makes an unrecorded live case fail with "live case not recorded: <id>" (T-86-14; a self-test proves it). The Date helpers normalise the `Date()` strings CacheStore writes into UTC so compare mode is independent of the machine's time zone.

**3. [Plan wording] `keyPerRequest` labels in the ITAD golden**
- The golden records which key source each request used (user, env, baked, or null) rather than any key value, so the key-precedence behaviour is checkable by Rust without a key.

**4. [Plan wording] State fixtures for seven cache cases**
- `state/storeSearch/<case>/store_cache/itad_prices.json` or `itad_steam_gids.json` (stale and fresh variants) are the Rust starting profiles for the cache-hit, stale-serve and expired-refresh cases.

**5. [Plan wording] More synthetic cases than the plan's list**
- ITAD has 32 synthetic cases against a floor of 14 (country normalisation, empty and malformed results, the fallback country, batching at 200, user-key rejection flow and others). SteamGridDB has 7 against a floor of 2 (the `success:false` paths and the empty-array heroes). They pin branches the plan's list did not name but the TS has.

## Notes for the Rust ports

- **Replay needs a `networkError` field (follow-up).** The oracle recorder's synthetic `networkError: true` exchange has no counterpart in 86-03's Rust Replay. The ITAD and SteamGridDB ports (86-15, 86-16, or 86-14 if it touches Replay) must add the field and treat it as a transport failure, or the two network-error stale-serve cases cannot replay.
- Key precedence is checked through `keyPerRequest`; Rust must reproduce user, then env (`GAMELIB_ITAD_API_KEY`), then baked, then none.
- Recorded Cloudflare `cf-ray` response headers are committed in the live exchanges. They are per-request ids, not secrets, and the redaction scan does not flag them; Replay does not pin them.
- The live recordings carry the 2026-11-22 `date` header and live asset URLs with `?t=` stamps; compare mode does not depend on either.

## Known Stubs

None.

## Threat Flags

None. T-86-13 is mitigated: every committed request shows `key=REDACTED` or `authorization: REDACTED`, the grep over `recorded/` and `golden/` prints nothing and `fixtureRedaction.test.ts` is green. T-86-14 is mitigated by `assertLiveRecorded` and its self-test.

## Self-Check: PASSED

Both oracle tests exist; commits `dc3e90ff7`, `4d711ee4b` and `dadf81006` are ancestors of HEAD; both oracle tests and fixtureRedaction pass offline with no key in the environment; prettier clean.
