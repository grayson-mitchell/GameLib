---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
plan: 03
subsystem: auth
tags: [electron-store, safeStorage, token-storage, refactor, seam]

# Dependency graph
requires:
  - phase: 28-02
    provides: rustInvoke sidecar<->Rust request/response channel (transport this seam's future sidecar TokenStore implementation will call in 28-04)
provides:
  - TokenStore interface (isAvailable/getToken/setToken/clearToken)
  - ElectronTokenStore — the sole module permitted to touch configStore's TOKEN_STORE_KEY
  - setTokenStore/getTokenStore registry with no env-var escape hatch
  - user.ts routed through the seam (zero references to TOKEN_STORE_KEY/TOKEN_PREFIX/safeStorage remain)
affects: [28-04 (sidecar keyring TokenStore implementation), 28-05 (byte-comparison proof)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TokenStore interface + build-specific implementation, selected via a module-level registry (setTokenStore/getTokenStore) instead of an env var — mirrors storeManagers/index.ts's interface-with-N-implementations shape but for exactly 2 implementations selected by build, not N runners."

key-files:
  created:
    - src/backend/storeManagers/steam/tokenStore.ts
    - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts

key-decisions:
  - "D-11 (from plan): Electron's plaintext fallback (warn-then-store-plaintext on setToken when safeStorage unavailable; legacy no-prefix plaintext read on getToken) is KEPT verbatim in ElectronTokenStore, not unified with the sidecar's future stricter D-06 policy — documented in the module docstring so it reads as intent."
  - "clearToken() uses configStore.delete(TOKEN_STORE_KEY) (TypeCheckedStoreBackend exposes .delete) rather than the plan's set('') fallback."
  - "No-migration guard test scopes its keyring/sidecarRpc regex check to actual import lines only, not the whole file — the module's own docstring legitimately discusses 'keyring' as prose context for the future sidecar implementation, which would otherwise false-positive a naive whole-file regex."

patterns-established:
  - "TokenStore interface + build-specific implementation, selected via a module-level registry (setTokenStore/getTokenStore) instead of an env var."

requirements-completed: [REQ-28-02, REQ-28-03]

# Metrics
duration: 40min
completed: 2026-07-21
---

# Phase 28 Plan 03: TokenStore Seam Summary

**Introduced a single-owner `TokenStore` abstraction for the Steam refresh token — `ElectronTokenStore` now owns all `configStore`/`TOKEN_STORE_KEY`/`safeStorage` access, `user.ts` is refactored to route its three call sites through `getTokenStore()`, and the Electron build's behavior stays byte-identical (existing test suite green, D-11 plaintext fallback preserved on purpose).**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-21T22:47:00Z (approx, first file read)
- **Completed:** 2026-07-21T23:27:11Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 created, 2 modified) + 1 out-of-scope tracking doc

## Accomplishments
- `TOKEN_STORE_KEY`/`configStore` token access now live in exactly one module (`tokenStore.ts`), reachable only through `ElectronTokenStore` — closes the structural half of D-04/REQ-28-02 ahead of 28-04's sidecar implementation.
- `user.ts` no longer imports `safeStorage`, `TOKEN_PREFIX`, or `TOKEN_STORE_KEY` at all — all three token call sites (`getCredentials`, `finishAuth`, the QR `authenticated` handler) go through `getTokenStore()`.
- Wave 0 unit coverage (12 tests) proves Electron's byte-identical behavior, the registry swap point is real (`SteamUser.getCredentials()` reads through a swapped fake implementation without any `user.ts` edit), and a structural no-migration guard.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tokenStore.ts** - `45c08ca9` (feat)
2. **Task 2: Route user.ts's three token call sites through getTokenStore()** - `cdd71a9c` (refactor)
3. **Task 3: Wave 0 unit coverage for ElectronTokenStore, the registry swap, and the no-migration property** - `b5c7986e` (test)

_No plan-metadata commit yet — final docs/state commit follows this SUMMARY._

## Files Created/Modified
- `src/backend/storeManagers/steam/tokenStore.ts` - `TokenStore` interface, `ElectronTokenStore` (verbatim-moved encrypt/decrypt bodies), `setTokenStore`/`getTokenStore` registry
- `src/backend/storeManagers/steam/user.ts` - Deleted local `encryptionAvailable`/`encryptToken`/`decryptToken`; `getCredentials`/`finishAuth`/QR `authenticated` handler now call `getTokenStore()`
- `src/backend/storeManagers/steam/__tests__/user.test.ts` - Two QR race-fix tests updated to `await` the now-async `authenticated` handler (see Deviations)
- `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` - New Wave 0 suite (12 tests)
- `.planning/phases/28-.../deferred-items.md` - New; logs an out-of-scope, pre-existing `library.ts` Jest teardown crash found while running the full suite

## Decisions Made
- Kept D-11's plaintext-fallback divergence exactly as the plan specified (Electron-only, documented, tested) — no unification with D-06 attempted, matching the plan's explicit instruction.
- `clearToken()` implemented via `configStore.delete(TOKEN_STORE_KEY)` since `TypeCheckedStoreBackend` exposes a real `.delete()` method (confirmed by reading `src/backend/electron_store.ts`), avoiding the plan's fallback-to-`set('')` option.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] QR race-fix tests needed to await the now-async `authenticated` handler**
- **Found during:** Task 2
- **Issue:** The plan explicitly required making `startQRLogin()`'s `session.once('authenticated', ...)` handler `async` (to `await getTokenStore().setToken(...)`). Two pre-existing tests in `user.test.ts` called `sessionOnHandlers['authenticated']()` synchronously (without `await`) and immediately asserted on state that the handler now sets only after an awaited call — both failed (`poll1.status` was `'waiting'` instead of `'done'`, and the dedupe test timed out at 5000ms).
- **Fix:** Added `await` before both `sessionOnHandlers['authenticated']()` calls; updated their comments to note the handler is now async.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/user.test.ts`
- **Verification:** `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` — 62/62 pass (same count as before the fix, per the plan's own acceptance criterion).
- **Committed in:** `cdd71a9c` (part of Task 2's commit)

**2. [Rule 1 - Bug in my own new test code] `tokenStore.test.ts`'s in-memory `configStore` mock was silently inert; no-migration regex false-positived on the module's own docstring**
- **Found during:** Task 3 (first `npx jest` run against the new test file — 3/12 failing)
- **Issue:** (a) `mockConfigStore.get_nodefault`/`set`/`delete`/`clear` were defined once via `jest.fn(impl)` at module scope; `jest.config.js`'s `resetMocks: true` wipes even a factory-supplied implementation before every test (same gotcha `user.test.ts`'s own comment documents), so the mocks silently returned `undefined` regardless of the intended in-memory backing store — several tests were passing for the wrong reason (coincidental `undefined`/`''` matches) rather than genuinely exercising the round-trip/legacy-read paths. (b) The no-migration guard's `expect(src).not.toMatch(/keyring|sidecarRpc/i)` matched `tokenStore.ts`'s own docstring, which legitimately discusses "keyring" as prose context for the future sidecar implementation (D-09/D-11) — a false positive.
- **Fix:** (a) Re-established all four `mockConfigStore` method implementations inside `beforeEach`, wiring them to the `backingStore` object. (b) Scoped the no-migration regex check to lines matching `/^\s*import\b/` only, not the whole file source.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts`
- **Verification:** `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` — 12/12 pass, now genuinely exercising the round-trip/legacy-plaintext/decrypt-throw paths.
- **Committed in:** `b5c7986e` (part of Task 3's commit — the file was fixed before its first commit; no separate fix-up commit was needed)

## Known Stubs

None — no new UI-facing stubs or hardcoded empty data introduced by this plan.

## Threat Flags

None — this plan's changes are exactly the structural containment the phase's own `threat_model` (T-28-01, T-28-08) already anticipated. No new network endpoints, auth paths, or schema changes were introduced.

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts src/backend/storeManagers/steam/__tests__/user.test.ts` — both green (12/12, 62/62).
- `npm run codecheck` — exits 0.
- `grep -rn "TOKEN_STORE_KEY" src/ | grep -v node_modules` — confined to `constants.ts` (declaration), `tokenStore.ts` (sole consumer), and test-file comments/assertions, exactly per the plan's verification requirement.
- `git diff --stat src/frontend src/preload` — empty (zero `window.api.*` call-site impact, REQ-28-07).

### Deferred: full-suite (`npm run test:ci`) teardown crash — pre-existing, out of scope

Running the **entire** Jest suite (not just this plan's files) crashes the Node process
*after* every suite reports `PASS` (0 `FAIL` lines observed) with a `TypeError` inside
`library.ts`'s `readAcfState`/`pollInstallOnce` install-poll timer — a pre-existing
leaked `setTimeout` unrelated to Steam auth/token storage, already documented in
project memory ("known separate library.ts leaked-timer jest exit-1", first observed
2026-07-19, predates this phase). Confirmed present at this plan's own `HEAD`
(`cdd71a9c`) before any of Task 3's changes, and confined to files this plan never
touches. Logged to `.planning/phases/28-.../deferred-items.md` per the Scope Boundary
rule; not fixed here.

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes (`45c08ca9`,
`cdd71a9c`, `b5c7986e`) verified present in `git log --oneline --all`.
