---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 05
subsystem: infra
tags: [tauri, preload, store-layer, allow-list, lazy-hydrate, security]

# Dependency graph
requires:
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 03
    provides: storePolicy.ts (isAllowedStoreField/BOOT_SET_STORES/LAZY_STORES) and
      sidecarTransport.ts's STORE_FETCH_CHANNEL/STORE_NEW_CHANNEL/STORE_CHANGED_CHANNEL/
      STORE_LAZY_MISS_MARKER/StoreChangedPayload
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 04
    provides: sidecar-side sidecar:store-fetch handler (D-03 lazy per-store hydrate) and
      the generalized sidecar:store-snapshot handler this plan's renderer half reads from
provides:
  - tauriTransport.ts's tiered snapshot (D-03) — hydrateStoreSnapshot() (eager boot set) +
    hydrateStore() (lazy per-store fetch, de-duped through an inflight Map)
  - D-04 lazy-miss fallback — a synchronous read of a not-yet-hydrated store returns the
    caller's default, warns once per store+key with STORE_LAZY_MISS_MARKER, and
    self-corrects via an async hydrateStore() call that never throws
  - D-06 storeChanged patching — a lazily-attached STORE_CHANGED_CHANNEL subscription
    patches the in-memory snapshot in place on every sidecar push
  - D-08 single-sourced allow-list on the Tauri read path (isAllowedStoreField), replacing
    tauriTransport.ts's former local SECRET_STORE_KEYS deny-list; misc.ts's Electron-branch
    deny-list is untouched and now carries an explicit D-08 divergence comment
  - registerStore(storeName, options) — forwards store construction options to the sidecar
    over STORE_NEW_CHANNEL
affects: [29-06, 29-07, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-04: a synchronous read of an un-hydrated store never throws and never blocks —
      it returns the caller default, logs one greppable STORE_LAZY_MISS_MARKER warning per
      store+key pair (Set-guarded, so a hot render loop cannot flood the console), and
      fires a fire-and-forget self-correcting hydrate. Rejections inside that hydrate are
      caught and logged, never rethrown (SEAM Invariant B)."
    - "D-06: the STORE_CHANGED_CHANNEL subscription attaches lazily on first
      registerStore() call rather than at module load, so this module never calls Tauri's
      listen() outside a real Tauri webview."

key-files:
  created: []
  modified:
    - src/preload/tauriTransport.ts
    - src/preload/api/misc.ts
    - src/preload/__tests__/tauriTransport.test.ts

key-decisions:
  - "D-08 divergence made explicit at both sites: tauriTransport.ts's snapshotGet/
    snapshotHas now gate on storePolicy.ts's single-sourced isAllowedStoreField()
    allow-list; misc.ts's Electron-branch SECRET_STORE_KEYS deny-list is untouched and
    carries a comment naming Phase 35 as the reunification point (Phase 28 D-11
    precedent) — flipping the shipped Electron build to fail-closed today risks blocking
    a legitimate read among the 379 window.api.* call-sites."
  - "hydrated is tracked as a Set<string> of STORE NAMES, not per-key — once a store's
    eager or lazy fetch completes, every key on it is trusted (matches how the sidecar's
    snapshot/fetch handlers return the whole filtered store object, not single fields)."
  - "registerStore() seeds snapshot[name] = {} immediately (unchanged from before this
    plan) but does NOT add the name to `hydrated` — registration alone must never satisfy
    D-04's hydration gate, or the lazy-miss fallback would be permanently defeated for
    every lazy store."

requirements-completed: [REQ-29-02, REQ-29-03, REQ-29-04, REQ-29-07]

# Metrics
duration: ~40min
completed: 2026-07-22
---

# Phase 29 Plan 05: Renderer store transport — tiered snapshot, lazy-miss fallback, change patching, allow-list Summary

**`tauriTransport.ts`'s synchronous store bridge is now tiered (D-03), self-correcting on a lazy miss with a greppable marker (D-04), kept in sync by sidecar push events (D-06), and gated by the single-sourced allow-list (D-08) — with the Electron branch of `misc.ts` byte-identical apart from one comment and one options-passthrough line.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-22
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `tauriTransport.ts`: removed the local `SECRET_STORE_KEYS` deny-list and `isSecretStoreKey`; `snapshotGet`/`snapshotHas` now gate on `isAllowedStoreField` from `storePolicy.ts` (D-08), with a reworded blocked-read warning and an explicit divergence comment naming the Phase 28 D-11 precedent.
- Added `hydrated: Set<string>` (per-store, not per-key) and `inflight: Map<string, Promise<void>>` (de-dupes concurrent fetches). `hydrateStoreSnapshot()` now marks every store present in the eager snapshot result as hydrated. New `hydrateStore(storeName)` fetches one lazy store via `STORE_FETCH_CHANNEL`, merges the result, marks it hydrated, and swallows any rejection (logged via `console.error`, never rethrown — SEAM Invariant B).
- D-04: `snapshotGet`/`snapshotHas`, on a miss where the store is not yet hydrated, return the caller's default (`false` for `snapshotHas`), log exactly one `STORE_LAZY_MISS_MARKER`-prefixed warning per store+key pair (guarded by a `Set`), and fire `void hydrateStore(storeName)`.
- D-06: a lazily-attached (on first `registerStore()` call) `STORE_CHANGED_CHANNEL` subscription patches `snapshot[store][key]` in place on every sidecar push — set on a normal payload, `delete` on `{deleted: true}` — deliberately unfiltered by the allow-list on the way in, since the sidecar's own emitter filters on the way out (plan 29-06).
- `registerStore(storeName, options?)`: signature now accepts the store's construction options and forwards them to the sidecar over `STORE_NEW_CHANNEL`; registration alone still does not mark a store hydrated.
- `misc.ts`: `storeNew`'s Tauri branch now passes `options` through to `registerStore`; added a D-08 comment above `SECRET_STORE_KEYS` stating explicitly that this deny-list governs the Electron path only and cross-referencing `storePolicy.ts` and `tauriTransport.ts`'s own D-08 comment. `SECRET_STORE_KEYS`'s contents, `isSecretStoreKey`, and every non-Tauri branch of `storeGet`/`storeSet`/`storeHas`/`storeDelete` are untouched.
- Extended `tauriTransport.test.ts` with three new `describe` blocks (14 tests total, 4 pre-existing + 10 new): `lazy hydrate` (default-return + single warning + no throw, `STORE_FETCH_CHANNEL` invoke shape, self-heal with no second warning, rejecting-fetch swallowed with no unhandled rejection), `change events` (set patches, delete removes, unrelated-channel push is inert), `allow-list` (`csrfToken` and `refreshToken.sub` blocked returning `undefined`; `userData` not blocked). Added a TOKEN-WIPE SAFETY header note documenting that the suite constructs no real store.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tiered snapshot, D-04 lazy-miss fallback, change-event patching, allow-list** - `e1cc470a` (feat)
2. **Task 2: Divergence comment in misc.ts — Electron deny-list byte-identical** - `698f53dd` (docs)
3. **Task 3: Extend tauriTransport.test.ts — lazy miss, change patch, allow-list** - `667fbdc8` (test)

**Plan metadata:** (pending — this SUMMARY's commit)

## Files Created/Modified

- `src/preload/tauriTransport.ts` - Tiered snapshot (`hydrated`/`inflight`), `hydrateStore()`, D-04 lazy-miss fallback in `snapshotGet`/`snapshotHas`, D-06 lazy `STORE_CHANGED_CHANNEL` subscription, D-08 allow-list gating replacing the local deny-list, `registerStore(storeName, options?)` forwarding to `STORE_NEW_CHANNEL`.
- `src/preload/api/misc.ts` - D-08 divergence comment above `SECRET_STORE_KEYS`; `storeNew`'s Tauri branch passes `options` through to `registerStore`. No other change.
- `src/preload/__tests__/tauriTransport.test.ts` - Three new `describe` blocks (10 new tests), TOKEN-WIPE SAFETY header note; all four pre-existing tests unchanged.

## Decisions Made

- Tracked hydration at the STORE level (`Set<string>` of store names), not per-key, matching the shape of what both the eager snapshot and the lazy fetch actually return (a whole filtered store object) — a per-key hydration map would have added complexity with no corresponding granularity anywhere else in the system.
- Kept the D-06 `STORE_CHANGED_CHANNEL` listener attach lazy (on first `registerStore()` call) rather than at module scope, per the plan's explicit instruction, so this module — which is also reached (inertly) from non-Tauri bundles via `misc.ts` — never calls Tauri's `listen()` outside a real webview.
- Chose real, allow-listed store field names (`theme`, `language`, `zoomPercent` on `configStore`; wildcard-policy lazy stores like `gogSyncStore`/`wikigameinfo`/`uploadedLogs`/`gogPrivateBranches`) for every new test rather than invented key names, after an initial draft using made-up keys (e.g. `changeEventsTheme`) tripped the D-08 allow-list gate and produced false "blocked" warnings — see Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test file's own comment collided with the acceptance-criteria `SECRET_STORE_KEYS` grep**
- **Found during:** Task 1, running the plan's own acceptance criterion (`grep -c 'SECRET_STORE_KEYS' src/preload/tauriTransport.ts` must return 0)
- **Issue:** The D-08 doc comment on `snapshotGet` originally referenced the removed deny-list by its old literal name (`` `SECRET_STORE_KEYS` deny-list``), which matched the acceptance grep meant to confirm the code-level deny-list was gone — the same self-collision class documented in 29-03/29-04's SUMMARYs.
- **Fix:** Reworded to "former local hardcoded secret-key deny-list" — same meaning, drops the literal matched substring.
- **Files modified:** `src/preload/tauriTransport.ts`
- **Commit:** `e1cc470a`

**2. [Rule 1 - Bug] Invented test key names ('changeEventsTheme' etc.) tripped the D-08 allow-list, producing false "blocked" warnings and wrong assertions**
- **Found during:** Task 3, first `npx jest` run of the new `change events` describe block
- **Issue:** `configStore`'s `STORE_ALLOWLIST` entry is a closed, enumerated field list (not `'*'`), so made-up key names like `changeEventsTheme`/`changeEventsDeleteMe` were rejected by `isAllowedStoreField` before the change-event patch logic was ever exercised — the tests were accidentally asserting the allow-list's blocking behavior instead of the change-patching behavior they were meant to prove.
- **Fix:** Replaced the invented key names with real, allow-listed `configStore` fields (`theme`, `language`, `zoomPercent`), one per test to avoid cross-test state bleed within the same shared module instance.
- **Files modified:** `src/preload/__tests__/tauriTransport.test.ts`
- **Commit:** `667fbdc8`

**3. [Rule 1 - Bug] Leftover rejecting `mockedInvoke` implementation crashed the next describe block's `beforeAll` as an unhandled rejection**
- **Found during:** Task 3, first `npx jest` run — the whole test process crashed with an unhandled `Error: sidecar unreachable`
- **Issue:** `resetMocks: true` only rewinds Jest mocks immediately before each `it()`, not before a sibling `describe` block's `beforeAll`. The `lazy hydrate` describe's last test left `mockedInvoke` rejecting; `change events`'s `beforeAll` then called `registerStore('configStore')`, whose fire-and-forget `send()` call hit that still-rejecting mock, producing an unhandled promise rejection fatal under Node 26.
- **Fix:** Added an explicit `mockedInvoke.mockReset()` at the top of `change events`'s `beforeAll`, with a comment explaining why it's needed despite the global `resetMocks` config.
- **Files modified:** `src/preload/__tests__/tauriTransport.test.ts`
- **Commit:** `667fbdc8`

**4. [Rule 1 - Bug] Reusing the same un-hydrated lazy store name across two tests silently defeated the second test's assertion**
- **Found during:** Task 3, first `npx jest` run — "a miss fires a SIDECAR_INVOKE..." failed with 0 calls
- **Issue:** The first `lazy hydrate` test's fetch of `uploadedLogs` resolves asynchronously and marks the store hydrated (module state persists for the file's lifetime); a second test reusing `uploadedLogs` for a different key then found the store already hydrated, so D-04's miss branch (and its `hydrateStore` call) never fired — correct production behavior, but it falsified the test that was specifically checking the fetch was fired.
- **Fix:** Gave each of the four `lazy hydrate` tests its own distinct, never-reused `LAZY_STORES` name (`uploadedLogs`, `gogSyncStore`, `wikigameinfo`, `gogPrivateBranches`), documented with a comment explaining the shared-module-state constraint.
- **Files modified:** `src/preload/__tests__/tauriTransport.test.ts`
- **Commit:** `667fbdc8`

**5. [Rule 3 - Blocking issue] `tsc` type error on a zero-arg mock implementation cast**
- **Found during:** Task 3, running the plan's own `npx tsc --noEmit` verification
- **Issue:** `(async () => { throw ... }) as typeof mockedInvoke` failed to compile (TS2352 — insufficient overlap) for the rejecting-fetch test's zero-parameter mock function, unlike the file's existing multi-parameter mock casts.
- **Fix:** Widened the cast to `as unknown as typeof mockedInvoke`, matching the pattern the file already uses elsewhere for `mockedListen`.
- **Files modified:** `src/preload/__tests__/tauriTransport.test.ts`
- **Commit:** `667fbdc8`

None else — plan executed exactly as written otherwise.

## Issues Encountered

- Full-repo `npx jest --silent` (111 suites, 1970 tests, all passing) surfaced one pre-existing, already-documented issue unrelated to this plan: `src/backend/storeManagers/steam/library.ts`'s `pollInstallOnce` leaked a timer that fired after its owning test's teardown, forcing Jest to force-exit a worker (project memory: "known separate library.ts leaked-timer jest exit-1"). Confirmed out of scope — not a file this plan touched, not fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `tauriTransport.ts`'s renderer half is now feature-complete against 29-04's sidecar handlers: `hydrateStoreSnapshot()` (eager, `BOOT_SET_STORES`) and `hydrateStore()` (lazy, `STORE_FETCH_CHANNEL`) both exist and are proven; `snapshotSet`/`snapshotDelete` still emit `STORE_SET_CHANNEL`/`STORE_DELETE_CHANNEL` frames that plan 29-06 must give the sidecar a listener for (29-RESEARCH Pitfall 1 — still open until 29-06 lands).
- `registerStore(storeName, options)` now forwards construction options over `STORE_NEW_CHANNEL`; the sidecar-side listener for that channel is also 29-06's responsibility.
- D-06's `storeChanged` push path is wired and tested end-to-end on the renderer side; it currently has no producer — the sidecar-side emitter (filtered through `filterStoreSnapshot` per this plan's own comment) is 29-06's job.
- `npx jest src/preload` is green (17/17 tests, 2 suites). `npx tsc --noEmit -p tsconfig.json` is clean. Full-repo `npx jest --silent` is green (111 suites, 1970 tests).
- `git diff --stat src/preload/api/misc.ts` (across both this plan's commits) is comment-scale plus the single `options` passthrough argument, satisfying the plan's own verification requirement. `grep -c 'SECRET_STORE_KEYS' src/preload/tauriTransport.ts` returns 0 while `misc.ts`'s copy is fully intact.
- No blockers for 29-06 (the sidecar-side write path: `STORE_SET_CHANNEL`/`STORE_DELETE_CHANNEL`/`STORE_NEW_CHANNEL` listeners and the `STORE_CHANGED_CHANNEL` emitter this plan's renderer half already expects).

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: src/preload/tauriTransport.ts
- FOUND: src/preload/api/misc.ts
- FOUND: src/preload/__tests__/tauriTransport.test.ts
- FOUND: .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-05-SUMMARY.md
- FOUND: commit e1cc470a (Task 1)
- FOUND: commit 698f53dd (Task 2)
- FOUND: commit 667fbdc8 (Task 3)
