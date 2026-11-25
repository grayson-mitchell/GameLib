---
phase: 94-humble-bundle-and-shortcuts
plan: 08
subsystem: testing
tags: [oracle, golden, humble, wire-recorder, adapter, library, reveal, state-bytes, d-05, d-06, d-07, d-23]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-06 wire recorder, harness (withHumbleOracleProfile, pointHumbleAt, withWireRecorder, snapshotHumbleState, writeOrCompareGolden, MANIFEST floors) and the redaction scan
provides:
  - src/backend/humble/__tests__/oracle/flight.ts (synthetic React Flight, chunk and library-HTML builders, compressAdapterGaps)
  - src/backend/humble/__tests__/oracle/flowHarness.ts (runFlowCase: real stores, createHumbleServices, wire recorder, registerHumbleFlows, pinned date, UTC)
  - src/backend/humble/__tests__/oracle/libraryFixtures.ts (the shared synthetic library and its wire answers)
  - 89 adapter goldens with 66 wire recordings, 51 library flow goldens with their recordings, 9 state goldens (all under gamelib-humble/tests/fixtures)
affects: [94-09, 94-10, 94-15, 94-23, Humble Rust plans]

requirements-completed: []

actuals:
  tokens: 24000
  tasks: 3
  commits: 4

plan_head_before: 90372317dab6be6ca441b6bf32d70d42b4c8b397
plan_head_after: 55dd219e8445d2b58499e0b7e9cf5e583e8d99ea

tech-stack:
  added: []
  patterns:
    - "a flow oracle is runFlowCase({synthetic, steam, cookie, seed, script}): the golden is {input, calls, requests, stateAfter, result?}, each call {name, args, result, events, warnings, expiryDigest, notifications}"
    - "only Date is faked (jest.useFakeTimers with every other timer in doNotFake) and the real TZ is switched to UTC (verified), because CacheStore.set writes Date() into every timestamp"
    - "the adapter's 150 ms and 300 ms courtesy sleeps are shortened by a jest.spyOn on setTimeout that touches only those two delays, so a 200-page run is five seconds, not a minute"
    - "key values in synthetic responses are the literal REDACTED, so a replayed (redacted) response is what the golden saw"
    - "state files are shown as their exact UTF-8 text, never base64, so the redaction scan reads them"

key-files:
  created:
    - src/backend/humble/__tests__/oracle/flight.ts
    - src/backend/humble/__tests__/oracle/flowHarness.ts
    - src/backend/humble/__tests__/oracle/libraryFixtures.ts
    - src/backend/humble/__tests__/oracle/adapter.oracle.test.ts
    - src/backend/humble/__tests__/oracle/library.oracle.test.ts
    - src/backend/humble/__tests__/oracle/state.oracle.test.ts
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/adapter (89 goldens + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/adapter
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/library (51 goldens + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/library
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/state (9 goldens + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/state
  modified:
    - src/backend/humble/__tests__/adapter.test.ts
    - src/backend/__tests__/humbleFixtureRedaction.test.ts

key-decisions:
  - "Synthetic key values are the literal REDACTED, not FAKE-KEY-0001: the recorder rewrites a key field to REDACTED before it writes a recording and the redaction scan requires it, so any other value would make the compare run see a different response than the write run did."
  - "The state bytes come from the in-process disk sink (the shell's one writer in miniature), not from a 'shipped TS writer': since Phase 85 the store files are written by the Rust store owner and jest has only that stand-in."
  - "The no-op comparison runs from a settled state (one extra sync first) and a separate case records that the first re-sync after the app-id pass reorders the library entry's keys."
  - "The corrupt-file case is rustOnly 'FND-06 copy-aside, 85 D-05' with the corrupt input bytes."

patterns-established:
  - "a plan's expected byte outcome is a hypothesis: the golden records what the TS wrote, and a case that disagrees with the plan is kept and named, not bent to fit"

requirements: [SVC-04]
duration: 190min
completed: 2026-11-24
---

# Phase 94 Plan 08: Humble adapter, library and state oracle Summary

**The Humble adapter's requests as they appear on the wire (89 goldens), 51 stateful library, reveal and key-state flows as golden replay, and the exact bytes of all eleven state files, all recorded from the TypeScript before any Rust for them.**

## What was built

- **Adapter (`adapter.oracle.test.ts`, `golden/adapter`, `recorded/adapter`).** Each wire case runs on a fresh fake HOME with the recorder in synthetic mode, `pointHumbleAt` restoring in a `finally`, and records `{fn, input, requests, result, actionIds}`. Covered: `getSessionStatus` (bare and Ory cookie, authenticated, anonymous, unknown and null bodies, a 302 to the auth host, 401, 500); `getLibraryOrders` (one, three and twelve-item walks, empty, cached id, a stale cached id re-discovered with the known chunk fetched first, the id in the third chunk, id not found, the HTML page at 401/403/429/502/404 and a redirect to the auth host or elsewhere, the paged POST at 401/403/429/500, a 307 to the auth host never followed, 404 and non-flight responses on a fresh and a cached id, an unrecognised shape, session expiry on page 2, a server that ignores paging and echoes the query, a reported page that differs, fewer items than `totalDocs`, duplicate items across pages, `$undefined` markers dropped from prevState, the **200-page cap** (203 requests)); `revealKey` (success, cached id, numeric keyindex, a percent-encoded gamekey, three errorKinds and none, no key, 401, 403 JSON, a Cloudflare-style HTML 403, 429, 502, redirects, stale cached id re-discovered once, a fresh id rejected as stale, unrecognised body, a non-flight response, four discovery-page failures, id not found); and 23 `libraryItemToOrderDetail` mapping cases. The multipart request lists `_1_requestId ... _1_dateExpires` before field `0`; a 302 to `auth.humblebundle.com` on the library page maps to `session_expired` with exactly one request recorded.
- **Library flows (`library.oracle.test.ts`, `flowHarness.ts`, `golden/library`).** 51 cases through `createHumbleServices` over the real humble and steam store families, an in-memory secret store, the real Steam session reading the real steam stores, the real app-id resolver (its storesearch requests are recorded too), the sidecar's own channel handlers through an IPC registry, and a recording `sendFrontendMessage`. Covered: sync fresh, empty, three pages, repeated, denied 403 then blocked then lapsed, denied 429, network failure keeping the cache, action id not found, no credentials, session expired on page 2 and by redirect, pruning, fenced off by a disconnect, single flight; the Steam cross-reference signed out, signed in with an empty library (closed gate), signed in with the exact and fuzzy tiers, an exact auto-settle, a cached miss not asked again; `recomputeOwnership`; override (fuzzy, cleared, refused for an exact match and an unknown key); gift link (recorded, refused for REVEALED, not-owned and unknown); mark and undo (user mark, auto-settle decline that survives a recompute, a no-op undo); annotations; reveal (success and `getRevealedKeyValue`, re-sync carrying the value forward, **the C2 owned-elsewhere block with no redeem request**, after an override, ineligible x3, three errorKinds, 403 cooldown then `cooldown` with `retryAtMs`, a Cloudflare-style HTML 403, 401, ambiguous 5xx, unrecognised body, no credentials, a concurrent duplicate posting once).
- **State bytes (`state.oracle.test.ts`, `golden/state`).** `all-eleven-files-populated-by-real-flows` holds the exact text of `humble_store/config.json` and the ten `store_cache/humble_*.json`. `noop-sync-within-a-second-changes-only-humble-sync` lists 11 files, 10 `identical: true`, only `humble_sync` changed. `noop-sync-a-minute-later-rewrites-the-timestamps`, `first-resync-after-the-app-id-pass-reorders-the-library-entry-keys`, `first-sync-seeds-the-notified-baseline-silently`, `a-moved-expiration-rewrites-the-notified-record`, the legacy backfill (`legacy_gog` before, `fake-gamekey-0009:legacy_gog` added after, the bare key left in place) and the `rustOnly` corrupt-file case.

## Findings the Rust writer must honour

1. **Timestamps are the second-resolution local-zone string.** Every cache entry carries `__timestamp.<key>` = `Date()` (`Tue Nov 24 2026 12:00:00 GMT+0000 (Coordinated Universal Time)`). The goldens run in UTC so the text is host-independent; a sync inside the same second rewrites the entries with identical bytes, one a minute later changes them all.
2. **JSON key order is part of the bytes.** The app-id pass patches a key with `{...key, steamAppId, steamAppIdResolved}`, which puts those fields last; the next sync writes them in the classifier's order. Same values, different bytes: the first re-sync after the pass changes `humble_library.json` (the golden `first-resync-after-the-app-id-pass-reorders-...`). The plan's "10 of 11 identical" holds only from a settled state, so the no-op cases first run one more sync.
3. **`partial` is unreachable in the TS.** The only per-order failure is the disconnect fence, and a fenced sync returns `failed` before the `partial` branch. The fence case records `failed` with nothing committed.
4. **`humbleAuthState` is never pushed by a library flow**: it belongs to the user flows (`checkHealthAndFlagExpiry`, disconnect), which are 94-09's goldens.
5. **Recorded request headers carry the Node client's own** (`accept-language: *`, `sec-fetch-mode: cors`, `accept-encoding: gzip, deflate` on undici's multipart and text POSTs): a Node upgrade can re-record `recorded/*` on purpose, as an axios upgrade does for `wire/*`.
6. **The reveal POST body is recorded redacted** (`["REDACTED","REDACTED","$undefined"]`, the recorder's rule): the key id and integration id values are in each golden's `input`, not on the wire.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's reference file does not exist**
- **Found during:** Task 3 read-first
- **Issue:** `src/backend/engine/__tests__/oracle/engineState.oracle.test.ts` is not in this checkout.
- **Fix:** rooted the real stores with `createTestStoreRoot(profile.userData)` directly (the plan's own instruction), reading `testUtils/testStoreRoot.ts` and `diskStoreSink.ts` for the contract.

**2. [Rule 1 - Bug] A test timeout let one case leak its base-URL replacement into the next**
- **Found during:** Task 1 compare run (the 200-page case took 5.2 s against jest's 5 s default, then the next two cases saw the wrong `HUMBLE_BASE_URL`)
- **Fix:** every wire and flow case carries an explicit 120 s timeout.

**3. [Rule 1 - Bug] Four adapter cases asserted behaviour the TS does not have**
- **Found during:** Task 1 first write run (goldens showed `action rejected`, not `ok`)
- **Issue:** a freshly discovered action id that the server calls stale is not discovered a second time (`rediscovered` starts true after a discovery), so "404 then re-discover then ok" is only true for a cached id.
- **Fix:** the cases were renamed and rewritten to the real behaviour (`library-fresh-id-404-is-rejected-without-a-second-discovery`, `library-stale-cached-id-rediscovered-still-stale-is-rejected`, and the html and redirect cases on a fresh id).

**4. [Rule 1 - Bug] Events the app-id pass raises were being cleared by the recorder of the next call**
- **Found during:** Task 2 inspection of the first goldens (the exact-match sync showed no `humbleKeysUpdated` for the pass)
- **Fix:** `settleAppIdPass` does its waiting inside the recorded call, so the pass's events belong to it.

### Plan wording that could not hold as written

**5. Key value `FAKE-KEY-0001`.** Replaced by the literal `REDACTED` (key decision 1).
**6. "the TS writer's bytes".** They come from the in-process disk sink (key decision 2); the config store is written with the same `set` calls `HumbleUser` makes at sign-in rather than through a sign-in flow, which is 94-09's.
**7. "the clock advanced past the cooldown" for the no-op sync.** No cooldown exists in that flow. The clock moves 750 ms (inside one second, so `__timestamp` strings repeat while `syncedAt` moves) and, in a second case, a minute.
**8. "a 302 maps to session_expired" for `/api/auth/session-status`.** `getSessionStatus` maps any non-200 to `unknown`; the redirect-to-`session_expired` mapping is in the library page, the library POST and the reveal, and all are goldened.
**9. `humbleAuthState` in the library goldens.** Not emitted by any library flow (finding 4).
**10. "sync partial".** Unreachable (finding 3).

### Additions beyond the plan

- `flowHarness.ts` and `libraryFixtures.ts` (shared by the library and state oracles), `recorded/state/` (the state oracle's own wire recordings), and an `onEvent` hook and a `concurrent` call in the harness for the fence and single-flight cases.
- `adapter.test.ts` imports `libraryFlightPage` from `flight.ts` in place of its local `flight` builder (31 tests still pass); its `actionResponse`/`mockDiscovery` helpers are mock-specific and stay.
- `humbleFixtureRedaction.test.ts` floor raised from 555 to 1527 (the tree holds 1533).
- Floors: adapter 60 (89 cases), library 40 (51), state 6 (9).

## Windows-only observations

None. Every new suite, the 31 `adapter.test.ts` tests, the redaction scan (11), `fakeHomeIsolation`, `moduleStateCensus`, `pnpm codecheck`, `pnpm backend-di-ceilings` (jestMock stays 1637, no new module mock), `pnpm find-deadcode` (310 baselined), `pnpm planning-gates` (12/12) and `npx prettier --check` over the written paths pass on this Windows CRLF checkout. The fixtures are LF and `-text` (94-06). The oracle suites take about 7, 5 and 9 seconds.

## Verification

- Write run then compare run for each of the three oracles: green. Compare mode replays the recordings offline and fails on any drift or any recorded exchange never requested.
- Acceptance: adapter MANIFEST count 89 (>= 20), library 51 (>= 30), state 9; a golden shows multipart `_1_*` before `0`; `library-page-redirect-to-auth-host-is-session-expired` has one request; `reveal-owned-elsewhere-is-blocked-without-a-redeem-request` has no redeem request; `gift-link-refused-for-a-revealed-key` records the refusal; the no-op case lists 11 files with 10 identical and only `humble_sync` changed; the legacy case's after-bytes gain `fake-gamekey-0009:legacy_gog`.
- Plan 94-10 (live capture) was not run and nothing here needs its outputs.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: key values and cookies in every fixture are `REDACTED`, gamekeys are `fake-gamekey-NNNN`, the scan (floor 1527) passes, and the state goldens show file text rather than base64 so the scan can read them (T-94-14, T-94-15: the bytes come from real flows through the store classes, never typed).

## Self-Check: PASSED

- Files: `flight.ts`, `flowHarness.ts`, `libraryFixtures.ts`, `adapter.oracle.test.ts`, `library.oracle.test.ts`, `state.oracle.test.ts`, `golden/{adapter,library,state}/MANIFEST.json` all exist.
- Commits: d83bb2806, de1d48d83, 9c98745a4, 55dd219e8 all in `git log`.
