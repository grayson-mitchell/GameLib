---
phase: 86-pure-leaf-services
plan: 16
subsystem: info-itad
tags: [itad, store-search, native-channels, cache-view, single-flight, rate-limit-gate, golden-replay, d-10, d-13, d-17, d-18, sc1]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-07 storeSearch goldens and recorded exchanges (37 cases, 5 live), 86-14 ItadKey owner and its user > env > baked precedence, 86-15 Replay REDACTED handling and the info_dispatch native-handler pattern, 86-03 CacheView and Replay, 86-08 info_dispatch and the info native slice"
provides:
  - "gamelib-info::itad: search, deals, steam_gids, key_status, set_key; ItadGate (is_blocked, block, blocked_until, single_flight) held in InfoCtx::itad_gate; cache (key builders, 500-entry cap with `index`, 1 h / 30 d / 1 d freshness, parse_retry_after), mapping, coverage, collate; OPS info_itad_deals, _gids, _key_status, _search, _set_key"
  - "native invoke channels searchStores, getStoreSearchDeals, getItadSteamGids, itad.getKeyStatus, itad.setApiKey in slice info (zod bounds carried into the native parser and the crate decode); each TS registration and zod key deleted in the same commit as its native registration"
  - "Replay `networkError` exchange field (a matched, consumed transport failure) and `key=REDACTED` query matching"
  - "tests/golden_storeSearch.rs: all 37 86-07 cases replayed (results, requests, key source per request, gate, cache bytes, clean Replay.finish), plus single-flight, gate, batching, bound and key-channel tests"
affects: [86-17]

actuals:
  tokens: 42800
  tasks: 3
  commits: 5

plan_head_before: e0adfd61588b28f464927301fff029198d0b62d0
plan_head_after: 1a01ae3f852c382cebfc52d94bf43d67d583be11
commits: 5

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/itad/mod.rs
    - src-tauri/crates/gamelib-info/src/itad/cache.rs
    - src-tauri/crates/gamelib-info/src/itad/coverage.rs
    - src-tauri/crates/gamelib-info/src/itad/gate.rs
    - src-tauri/crates/gamelib-info/src/itad/mapping.rs
    - src-tauri/crates/gamelib-info/src/itad/collate.rs
    - src-tauri/crates/gamelib-info/tests/golden_storeSearch.rs
    - .planning/todos/pending/2026-11-22-itad-deal-order-localecompare-subset.md
  modified:
    - src-tauri/crates/gamelib-info/Cargo.toml
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/tests/http_replay.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/info_secrets.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts

key-decisions:
  - "The request is the recorded TS one: GET /games/search/v1 with title, results=20, key (axios_query encoding), POST /games/prices/v3 with country and key and the gid list as the compact JSON body, keyless POST /lookup/id/shop/61/v1 in batches of 200, User-Agent GameLib/<version>, Content-Type application/json on a POST. Replay pins all of it."
  - "Replay matches a query value recorded as the bare word REDACTED (for key-like parameters only) to any non-empty request value, as 86-15 did for secret headers; the golden test therefore gives each key source its own placeholder and reads which one every request carried, instead of sending REDACTED everywhere and proving nothing about precedence."
  - "Replay `networkError: true` makes the exchange match and be consumed like any other and then answer HttpError::Network; the crate turns every transport failure into a status-less failure, so a network error is stale-coverable and carries no status in the marker string."
  - "The gate's single flight is a keyed tokio OnceCell: the first caller's future runs, every concurrent caller gets a copy of its answer (an Err too), and a Drop guard removes a flight whose leader was cancelled by shutdown so no later caller waits on a dead one."
  - "localeCompare is reproduced as an ICU-root subset (base letters, then accents in DUCET order, then lower-before-upper case; space < punctuation < digits < letters; Latin-1 and Latin Extended-A letters), not ICU. Every recorded and synthetic fixture matches, including the equal-price case-and-accent one. The limits (other scripts, non-ASCII punctuation, locale) are filed as a todo."
  - "set_key returns the Keychain failure category (`info_itad_set_key:secret-<category>`) instead of swallowing it as the TS owner did, matching 86-15's steamgriddb.setApiKey; getKeyStatus treats a Keychain that cannot be read as no key (the TS owner was total there)."
  - "The crate has no logger (D-19), so the shell wrapper `run_itad_op` writes what the TS handler logged, as categories only: `itad <channel> failed (<code>)` with the marker string on stderr alone, and one line the first time ITAD refuses the user key. The per-request `[itad] user key rejected status=` and `[itad] lookup failed status=` warning lines are not reproduced."
  - "A cache that cannot be opened (a damaged file is never overwritten) makes the search run uncached instead of failing it."

patterns-established:
  - "An ops family with a keyed gate: `InfoCtx` carries per-process session state (ItadGate, like the key's rejected flag) and ops reach it through the context."
  - "A native channel whose crate op reports a fixed marker string wraps the blocking-pool call in a shell function that logs a category word and puts the string on stderr only (`run_itad_op`)."

requirements-completed: []
status: complete
completed: 2026-11-23
---

# Phase 86 Plan 16: ITAD store search port Summary

**Store search, deals, Steam gids and the user-key status and write run in Rust against the 86-07 goldens (all 37 cases, 5 live, clean Replay finish): the recorded requests, the key precedence user > env > baked, the 429 gate with single-flight, stale-serve with `cachedAt`, the 500-entry itad_prices cap and the TS cache keys over CacheView, with all five renderer channels native and their TS registrations deleted.**

## Performance

- **Duration:** about 80 minutes
- **Tasks:** 3 (the tracer and two auto tasks), plus the pre-task fix
- **Commits:** 5 (the pre-task fix, three task commits and one follow-up fix)

## Accomplishments

- `searchStores` is native end to end (the tracer): the gate check, key resolution, single-flight, search GET, prices POST with the US fallback on a 4xx, mapping, the cache writes and stale-serve on 429, 5xx and network error, with the failure surfacing as `[storeSearch:<code>] <endpoint> <status|none>`. The 22 search-only goldens, the stale-serve cases and the rejected-key cases all pass, including `keyPerRequest` (which key source each request carried) and the bytes of every cache file left behind.
- `getStoreSearchDeals` and `getItadSteamGids`: two concurrent identical deals requests make one HTTP request (a test with a 40 ms transport, one recorded exchange); 450 app ids make three lookups of 200, 200 and 50 with the keyless route; the equal-price `localeCompare` fixture orders as TS did.
- `itad.getKeyStatus` and `itad.setApiKey`: `{ hasKey, rejected }` is exactly two booleans (asserted in the crate and the shell) and never the key; a key saved through the channel is the one the next search sends.
- Replay gained the `networkError` exchange (86-07/86-15 carried it forward) and `key=REDACTED` query matching.

## Task Commits

1. **Pre-task fix (Rule 1):** `6a3c159f7` `fix(86-14)`: `shellLogCategoryOnly` was red. `info_secrets.rs` set and delete passed `keyring_error_kind(&e)` inside the first (category) argument of `shell_log_detail`; they now bind it to a local `kind` like the get arm, with no allow-list change.
2. **Task 1 (tracer): searchStores native end to end** - `50e87a2d7`
3. **Task 2: deals and Steam gids** - `2ca381f61`
4. **Task 3: key status and write** - `fbd877191`
5. **Follow-up fix (Rule 1):** `1a01ae3f8` `fix(86-16)`: `storeSearch/__tests__/handlers.test.ts`'s anti-remerge gate required `enrichmentFlowRegistration.ts` to import `storeSearch/handlers`; the registration no longer does, so the gate now asserts that absence (it still forbids a `handler failed:` log string there). Found by the full Backend jest run after the three task commits.

## Tracer feedback gate

`searchStores` was proven end to end before any expansion: the golden replay of every search case, the shell's blocking-pool test with the built-in key in the query, the native manifest vectors, the ownership and census suites, `check:ipc-contract` and `codecheck` all passed, so the plan expanded. The tracer task carried no `gate="blocking-human"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shellLogCategoryOnly red from 86-14**
- **Found during:** the pre-task instruction
- **Issue:** `info_secrets.rs` lines for set and delete put `keyring_error_kind(&e)` in the first argument of `shell_log_detail`, which the gate reads as external text.
- **Fix:** bind the category to a local `kind`, as the get arm already did; the 14 info_secrets unit tests stay green and the test's allow-list is untouched.
- **Files modified:** `src-tauri/src/info_secrets.rs`
- **Commit:** `6a3c159f7`

**2. [Rule 3 - Blocking] Two dependency changes and an unlisted file**
- **Issue:** the single-flight needs `tokio::sync::OnceCell` and the search cache key needs SHA-256, and the crate had neither the tokio `sync` feature nor `sha2`. The context also had to hold the gate (`ctx.rs`), and the ICU subset deserved its own file (`itad/collate.rs`); none of these is in the plan's file list.
- **Fix:** tokio `sync` feature (no new crate) and `sha2 = "0.10"` (the version `gamelib-depot` already locks, so Cargo.lock only gains the dependency edge), `InfoCtx::itad_gate`, and `collate.rs`.
- **Commits:** `50e87a2d7`

**3. [Rule 1 - Bug] An existing Replay test relied on `key=REDACTED` being exact**
- **Issue:** `replay_hides_secret_looking_query_values_in_its_messages` recorded `key=REDACTED` and sent `SUPERSECRET`, expecting a mismatch. With the new REDACTED rule that request matches.
- **Fix:** the test now records `RECORDEDSECRET` (still compared exactly) and asserts neither value appears in any message; the new behaviour has its own test.
- **Files modified:** `src-tauri/crates/gamelib-info/tests/http_replay.rs`
- **Commit:** `50e87a2d7`

**4. [Rule 2 - Missing critical] Failure logging moved to the shell**
- The crate cannot log (D-19), so the shell logs `itad <channel> failed (<code>)` with the marker string on stderr only, and the key-rejected line once; both are category-only (T-86-35). The TS `[itad] ... status=` per-request warnings are not reproduced.

### Decisions, not deviations

- `set_key` surfaces a Keychain write failure (86-15 precedent); TS swallowed it.
- `EnrichmentFlowDeps.itadSecrets` stays as an inert required field: `src/backend/sidecar/handlers.ts` is foreign-dirty and still passes `itadSecrets`, so removing the field would break its compile. 86-17 removes it when `handlers.ts` is clean, together with the 86-15 `steamGridSecrets` leftovers.
- The TS ITAD adapter, `storeSearch/handlers.ts`, `itadSecrets` and the oracle test remain for 86-17, as planned.

## Verification

- `cargo test -p gamelib-info --features testing` (all suites), `cargo test --bin gamelib-shell` (755 passed), `cargo clippy -p gamelib-info --all-targets -- -D warnings`, `cargo fmt -p gamelib-info -- --check` and `rustfmt --check` on the two shell files: green.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` (12/12), `pnpm find-deadcode` (312 baselined, unchanged), prettier on every touched TS and JSON file, the native ownership, census, schema-coverage, flow-registration, runner-slice and enrichment-flow suites: green.
- `pnpm backend-di-ceilings` fails only on the two known foreign files (`steam/__tests__/optInDlc.test.ts`, `frontend/state/__tests__/libraryStoreFollowers.test.ts`).
- Full Backend jest (`pnpm exec jest --selectProjects Backend`): 14064 tests passed, one red (the handlers.test gate above, fixed in `1a01ae3f8` and re-run green). Meta jest: 88 suites, 2802 tests passed.

## Known Stubs

None.

## Threat Flags

None. The keyless lookup route and the keyed routes are the ones the TS already called; no new endpoint, auth path or file access.

## Issues Encountered

- The golden test needed a different key per source to prove precedence: the recorder redacts `key=`, so the oracle labels each request with the source it carried. The Rust test taps the transport, reads the `key` value and maps it back to its source word.
- `store_embed/controls.rs`, `cache.ts` and the rest of the foreign-dirty set were not touched or staged.

## Next Phase Readiness

86-17 can delete the TS slice: `storeSearch/itad.ts`, `itadCache.ts`, `itadCoverage.ts`, `itadKey.ts`, `itadSecrets.ts`, `handlers.ts`, `stores.ts`, the oracle test, the itad sidecar secret store and its bootstrap wiring, the stores registration (D-29 row 5 pattern) and the `itadSecrets` field on the enrichment deps and services. Nothing outside tests and the oracle imports them any more.

## Self-Check: PASSED

- Created files exist: `itad/mod.rs`, `itad/cache.rs`, `itad/coverage.rs`, `itad/gate.rs`, `itad/mapping.rs`, `itad/collate.rs`, `tests/golden_storeSearch.rs`, the localeCompare todo.
- Commits exist on the branch: `6a3c159f7`, `50e87a2d7`, `2ca381f61`, `fbd877191`, `1a01ae3f8` (5 measured from the ledger base `e0adfd615`).
- Acceptance: every golden case passes with a clean Replay.finish; `grep -c` of the non-comment registration lines for the five channels is 0; `pnpm codecheck` exits 0 at the last task commit.
