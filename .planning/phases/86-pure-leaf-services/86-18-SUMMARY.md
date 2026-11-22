---
phase: 86-pure-leaf-services
plan: 18
subsystem: info-discounts
tags: [gog, discounts, catalog, resolver, d-24, token, concurrency, replay, drift, d-06, d-10, d-12, d-13, sc1, sc4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-06 discounts goldens and recordings, 86-05 shim/resolver schedule and port-complete gate, 86-16 Replay networkError, 86-17 drift table and gate pattern"
provides:
  - "gamelib-info discounts::gog_discounts (op info_gog_discounts), DiscountsArgs, Locale"
  - "InfoLog sink on InfoCtx (optional; the shell wires it to shell_log): the crate's fixed-text diagnostic lines"
  - "TS resolver src/backend/info/discounts.ts getGogDiscounts: const token, then one RUST_INFO_GOG_DISCOUNTS call (schedule row, deletedBy 92)"
  - "describe('discountsPortComplete') in infoPortComplete.test.ts; drift case gog-discounts"
affects: [86-19]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

plan_head_before: 5bdc338a7ab34ad5367c968615128aaa5d679de4
plan_head_after: d31fb59511706215bf78eb43fb1d1334372c57f2
commits: 2

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/discounts.rs
    - src-tauri/crates/gamelib-info/tests/golden_discounts.rs
    - src/backend/info/discounts.ts
    - src/backend/info/__tests__/discounts.test.ts
  modified:
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - src-tauri/crates/gamelib-info-cli/src/main.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/miscRuntime.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/testUtils/testMiscRuntime.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/info/__tests__/recentGames.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/electronReachLedger.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  deleted:
    - src/backend/discounts/fetchDiscounts.ts
    - src/backend/info/__tests__/oracle/discounts.oracle.test.ts

key-decisions:
  - "getGogDiscounts is a D-24 resolver, not a shim: `const token` (GOGUser.getCredentials access_token only when hideOwned or wishlistOnly is set, else null) then one RUST_INFO_GOG_DISCOUNTS call. It resolves `unknown` (the shim shape check does not unwrap an `as` cast), and the registration forwards to it."
  - "Concurrent pages use a hand-rolled join_all (poll_fn over the same future type, results in input order): no `futures` crate, no spawn, so the op stays inside the guarded shutdown wrapper. Page order is by index, not completion; a test makes page 2 yield ten times and asserts page 3 finished first and the merge is still 1..8."
  - "A flag with token None resets both flags (as TS did when credentials were missing); a token of the empty string keeps the flags and sends no Authorization header (TS `token &&` was falsy). The token is Debug-redacted, never in a URL, a log line or an error."
  - "The crate has no logger, so an optional InfoLog sink on InfoCtx carries the TS's log lines as fixed text (page N failed with the axios status text; skipped / US-USD retry / no-credentials WARN / request failed). The shell implements it with shell_log. Lines hold a page number and an axios category text, never a URL or the token."
  - "Rust answers the axios category text for a transport failure (`Network Error`, `timeout of 15000ms exceeded`); the TS oracle's network-error golden holds the sandbox's `connect ECONNREFUSED oracle.invalid:443`, an environment fact, so golden_discounts maps that one case to `Network Error` (the single documented divergence, D-03)."
  - "Seam for requestRustInvoke: sidecar/handlers.ts is foreign-dirty and passes registerEnrichmentFlows no member that carries the transport, so the boot's misc runtime (which handlers.ts already passes, and which the 'misc-runtime' boot step builds over the host) now carries `requestRustInvoke` and the registration reads `deps.miscRuntime.requestRustInvoke`."

patterns-established:
  - "A resolver registration stays TS-registered with a one-expression arrow that forwards to the resolver; the port-complete gate parses the registration with the TypeScript API and fails on a block body, a wrong callee or any call inside the forwarded arguments."

requirements-completed: []
status: complete
completed: 2026-11-23
---

# Phase 86 Plan 18: GOG discounts to Rust behind a token resolver Summary

**The Discounts screen is served by `gamelib-info` `discounts::gog_discounts`: page 1, then pages 2 to 30 fetched together and merged in page order, deduplicated by id, with the US fallback and the flag-without-token reset, all replayed against the 13 86-06 goldens (live cases by count, ids and the canonical-JSON sha256 of 1440 products); TS keeps only `getGogDiscounts` as a scheduled resolver that reads the GOG token and makes one Rust call, and the TS fetcher and its oracle are deleted.**

## Performance

- **Tasks:** 2 (tracer + auto)
- **Commits:** 2 (`3e20b334c`, `d31fb5951`)
- **Diff:** 26 files, 1620 insertions, 470 deletions

## Accomplishments

- **Tracer (Task 1):** `discounts.rs` builds the query in `URLSearchParams` order (limit 48, order, discounted, productType, page, countryCode, locale, currencyCode, then hideOwned and wishlist), sends `HeroicGamesLauncher/<version>` and `Authorization: Bearer` only when a flag is set and a non-empty token exists, with the 15 s timeout. `golden_discounts` runs every case through the crate's dispatcher over `Replay` (clean `finish`), compares count, ids and sha256 (the test reproduces the canonical form: keys sorted at every level, compact, JS-style integral numbers) and the whole product list for the 20-or-fewer cases. Extra tests: out-of-order pages (page 3 finishes before page 2, merge stays in page order), the 30-page cap with 15 s timeouts, a failed page logged without its URL, the token only with a flag and never in a URL, log or Debug, the reset warning, rejection text, transport category text, strict args and a replay pin that catches a changed User-Agent.
- **Wiring:** `info_gog_discounts` has a strict zod schema (`token` nullable), a regenerated contract, a `rust_dispatch` arm and an `info_dispatch` handler (validates, then the crate, which validates again). `RUST_INFO_GOG_DISCOUNTS` is in `RUST_INVOKE_CHANNELS` and `RUST_INFO_CHANNELS`.
- **Resolver:** `src/backend/info/discounts.ts` plus its jest test (no flags: token null and no credential lookup; a flag: one lookup and the token sent; no account: null; Rust rejection carried; every argument passes the strict schema). The enrichment registration forwards its three positional arguments to it.
- **Deletion and gate (Task 2):** `fetchDiscounts.ts` and the discounts oracle are gone; goldens, recordings and the humble badge tests stay. `describe('discountsPortComplete')` covers deleted and kept paths, `fetchAllDiscounts`/`buildUrl`/`CATALOG_URL`/`catalog.gog.com`/`GAMELIB_DISCOUNTS`, the registration being exactly one forward (TypeScript-API check with self-tests for a block body, an extra call, a wrong callee and a missing registration), the resolver as the only caller of the channel with no HTTP client, and its D-24 shape.
- **Drift:** `gog-discounts` (no token, live catalog) is held against the 5-product sample of the synthetic goldens; a cargo test replays the 30-page recording, another proves a dropped product key fails with the path. Run live on 2026-11-23 (public catalog, no credentials): `PASS gog-discounts`.

## Task Commits

1. **Task 1 (tracer): GOG discounts served by Rust behind a token resolver** - `3e20b334c`
2. **Task 2: delete the TS fetcher, add the gate and the drift case** - `d31fb5951`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] requestRustInvoke had no path into the enrichment registration**
- **Found during:** Task 1
- **Issue:** `registerEnrichmentFlows` is fed by the foreign-dirty `sidecar/handlers.ts`, which passes no member that holds the transport; the resolver needs it.
- **Fix:** `MiscRuntime` (already passed by handlers.ts, built in the boot's 'misc-runtime' step over the host) gained `requestRustInvoke`; `EnrichmentFlowDeps.miscRuntime` changed from the inert `unknown` to `MiscRuntimeSlice<'requestRustInvoke'>['miscRuntime']`; `createTestMiscRuntime` supplies a rejecting stub. OWED: once handlers.ts is clean, pass `requestRustInvoke` to `registerEnrichmentFlows` directly and take it off `MiscRuntime`.
- **Files modified:** `src/backend/miscRuntime.ts`, `src/backend/sidecar/bootstrap.ts`, `src/backend/sidecar/enrichmentFlowRegistration.ts`, `src/backend/testUtils/testMiscRuntime.ts`
- **Commit:** `3e20b334c`

**2. [Rule 2 - Missing critical] A logger for the crate**
- The plan's truths require the skipped-page, fallback and reset lines to be logged and the token never to be. The crate had no logging path (86-16 dropped such lines), so `InfoCtx` gained an optional `InfoLog` sink (default none) and the shell sets it to `shell_log`; every line is fixed text with a page number and an axios category, so the category-only log gate stays green.

**3. [Rule 3 - Blocking] Tests and pins the plan assigned to Task 2 had to move with Task 1**
- The registration no longer imports `fetchDiscounts`, so the `enrichmentFlows.test.ts` mock path moved in Task 1; the shim schedule would have been red with an unscheduled resolver, so its row (resolver, inputs ['token'], deletedBy 92) landed in Task 1; the `rustInvokeSchemas` (132 to 133), `tauriShellSource` (133 arms, new-arm allow-list) and `recentGames` channel-list pins moved with the new channel.
- **Commit:** `3e20b334c`

**4. [Rule 1 - Bug] My own Task 1 commit duplicated a header comment**
- A doc-comment rewrite in `enrichmentFlowRegistration.ts` used the wrong end marker and pasted a large block twice. Restored to one `getGogDiscounts` paragraph in the Task 2 commit (no code change).
- **Commit:** `d31fb5951`

**5. Plan location difference.** The drift case lives in `gamelib-info-cli/src/drift.rs` (the table), not `main.rs`; main.rs only got its doc line updated. `ipcSchemaSnapshot.json` was regenerated and is unchanged (the channel is not in the renderer snapshot).

### Auth gates

None. The token is never read or created by the plan: tests use the literal `REDACTED` or a placeholder, the live drift run sends no token, and no GOG credential was touched.

## Measurements and notes

- `electronReachLedger`: measured after the deletion, the electron-reach set is still empty; no baseline entry moved (the reason is in the test header).
- No ceiling moved: `enrichmentFlows.test.ts` still mocks axios because the boot's `fetchLastestReleases` calls `axios.create`; its mock count is unchanged.
- The worst case of one op (page 1, 29 concurrent pages, then the US retry) is bounded by four 15 s requests, at the 60 s rustInvoke bound; a typical run is a few seconds, and a timeout would reach the renderer as the same rejection a failing fetch gave.
- A body that is not a JSON object on page 1 answers a fixed message rather than the JS `TypeError` text; no golden covers it (D-03 edge).

## Owed Cleanup

- `sidecar/handlers.ts` (foreign-dirty): the 86-15 and 86-17 leftovers still stand (`steamGridSecrets`, `itadSecrets`, the inert members). In addition, `registerEnrichmentFlows` should receive `requestRustInvoke` directly; then `MiscRuntime.requestRustInvoke` and `EnrichmentFlowDeps.miscRuntime` go.
- `getGogDiscounts` (resolver) and its sidecar registration go in phase 92 when GOG's gogdl auth ports and Rust reads the token itself.

## Verification

- `cargo test -p gamelib-info --features testing` (golden_discounts 13/13), `cargo test -p gamelib-info-cli` (11), `cargo test --bin gamelib-shell` (756 passed, 2 ignored), `cargo clippy -p gamelib-info -p gamelib-info-cli --all-targets -D warnings`, `cargo fmt -p gamelib-info -p gamelib-info-cli -- --check`, `rustfmt --check` on the touched shell files (only the generated `ipc_contract.rs` differs, foreign), `pnpm check:ipc-contract`: green.
- `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, unchanged), prettier on every touched TS path: green.
- `pnpm exec jest --selectProjects Backend Meta --silent`: 709 suites passed, 2 failed once under load with `ENOENT meta/runTs.__probe__.cjs` (a transient file another process creates and removes; `fakeHomeIsolation.test.ts` and `tauriShellSource.test.ts` both pass alone, 305 tests). `pnpm backend-di-ceilings` fails only on the two known foreign files.
- Live: `cargo run -p gamelib-info-cli -- drift --slice discounts` printed `PASS gog-discounts`.

## Known Stubs

None.

## Threat Flags

None. T-86-42 (token in memory only, never logged: fixed log lines, Debug redaction, tests asserting its absence from URLs, lines and Debug), T-86-43 (30-page cap, 15 s per request, shutdown registrant via `guarded`) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-info/src/discounts.rs, src-tauri/crates/gamelib-info/tests/golden_discounts.rs, src/backend/info/discounts.ts, src/backend/info/__tests__/discounts.test.ts
- GONE: src/backend/discounts/fetchDiscounts.ts, src/backend/info/__tests__/oracle/discounts.oracle.test.ts
- FOUND commits: 3e20b334c, d31fb5951
