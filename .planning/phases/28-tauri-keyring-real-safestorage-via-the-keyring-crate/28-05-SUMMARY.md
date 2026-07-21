---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
plan: 05
subsystem: auth
tags: [jest, integration-test, keyring, keychain, token-storage, regression-gate, source-gate]

# Dependency graph
requires:
  - phase: 28-03
    provides: "TokenStore interface, ElectronTokenStore, setTokenStore/getTokenStore registry"
  - phase: 28-04
    provides: "SidecarKeyringTokenStore, honest safeStorage stub, bootstrap.ts installing the sidecar TokenStore"
provides:
  - "electronUntouched.test.ts — automated byte-comparison proof that SidecarKeyringTokenStore's four operations (success and failure paths) and the getTokenStore() seam leave the real, production-routed configStore untouched"
  - "A comment-stripped by-construction source gate that fails if configStore/TOKEN_STORE_KEY/TOKEN_PREFIX reappear in keyringTokenStore.ts/bootstrap.ts, or if electronStub.ts's isEncryptionAvailable regresses to the always-true lie"
affects: [28-06 (manual round-trip proof, PROOF.md)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route Jest's own module resolution at the REAL production shims (jest.mock('electron', () => jest.requireActual('../electronStub')) + the electron-store->fileStore.ts equivalent) rather than accepting the backend-wide default __mocks__/electron.ts (tmpdir-backed) — required whenever a test's whole point is proving something about the ACTUAL shared production config-directory path, not merely a same-shaped synthetic one."
    - "Comment-stripped regex source gates (strip //, /*, and *-prefixed docblock lines before matching) so an explanatory comment naming a forbidden identifier does not fail its own gate, while still catching a real reintroduction."

key-files:
  created:
    - src/backend/sidecar/__tests__/electronUntouched.test.ts
  modified: []

key-decisions:
  - "Discovered the plan's own docstring guidance named the wrong on-disk filename (steamConfigStore.json) — TypeCheckedStoreBackend's constructor never forwards its `name` type parameter into electron-store's actual options, so both real electron-store and this repo's fileStore.ts default to `config.json`; the real file on this dev machine is `steam_store/config.json`. Verified this is the SAME file the plan's D-04 proof cares about (electronStores.ts's `configStore` instance), just named differently than CONTEXT.md/RESEARCH.md assumed — corrected in this test's own docstring rather than propagating the stale filename."
  - "Added the skeletonFlows.test.ts-style `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` pair (absent from my first draft) after discovering that without it, Jest's automatic backend-wide __mocks__/electron.ts (tmpdir-backed) intercepts the import instead — which would make this suite prove a synthetic store is untouched rather than the actual production configStore path a compiled sidecar/Electron build shares. Verified by diffing the real on-disk steam_store/config.json before/after a run: byte-identical only once this mock pair was added."

patterns-established:
  - "electronUntouched.test.ts is the canonical shape for any future 'prove the sidecar leaves shared production Electron state untouched' test: snapshot the real store's pre-existing value, seed a synthetic sentinel only if none exists, run the operation against the REAL production module graph (not a synthetic mock), assert byte-identical `toBe` (not `toEqual`) on both the single key and the full serialized snapshot, restore (never clear()) in afterAll."

requirements-completed: [REQ-28-02, REQ-28-04]

# Metrics
duration: ~35min
completed: 2026-07-22
---

# Phase 28 Plan 05: Electron-Untouched Byte-Comparison Proof + Source Gate Summary

**`electronUntouched.test.ts` (10 tests) proves `SidecarKeyringTokenStore`'s four operations — success and failure paths, plus the `getTokenStore()` seam `user.ts` actually calls — leave the real, production-routed `configStore` (`steam_store/config.json`) byte-identical, backed by a comment-stripped source gate against `configStore`/`TOKEN_STORE_KEY`/`TOKEN_PREFIX` reach and the `isEncryptionAvailable: true` lie ever reappearing.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-21T23:15:00Z (approx, first file read)
- **Completed:** 2026-07-21T23:51:07Z
- **Tasks:** 1/1 completed
- **Files modified:** 1 (created)

## Accomplishments
- Wrote `electronUntouched.test.ts` — 10 tests covering each of `SidecarKeyringTokenStore`'s four operations individually (byte-comparison on `configStore.refreshToken`), all four in sequence, the full failure path (every keyring channel rejecting), a full-serialized-snapshot comparison (catches collateral key writes, not just `refreshToken`), and the `setTokenStore(new SidecarKeyringTokenStore())` → `getTokenStore().setToken(...)` seam path — proving the seam `user.ts` actually calls in production, not just the class in isolation.
- Added two by-construction source-gate tests: a comment-stripped regex assertion that `keyringTokenStore.ts`/`bootstrap.ts` never reference `configStore`/`TOKEN_STORE_KEY`/`TOKEN_PREFIX`, and a dedicated regression guard on `electronStub.ts`'s exact `isEncryptionAvailable: () => true` lie pattern (SEAM.md §2 / D-06).
- Discovered mid-task that my first draft was inadvertently testing a *synthetic* tmpdir-backed mock store (Jest's default backend-wide `__mocks__/electron.ts`) rather than the real production `configStore` path — fixed by adding the `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` redirection pair `skeletonFlows.test.ts` uses, then verified against the actual on-disk `steam_store/config.json` file (byte-identical before/after a real run).
- Confirmed the full test suite is green modulo one pre-existing, already-documented, unrelated crash (`library.ts`'s leaked install-poll timer, tracked in `deferred-items.md`): a targeted run excluding only that one offending file passed 107/107 suites, 1738/1738 tests, including every file this plan and 28-03/28-04 touch.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the Electron-untouched byte-comparison proof** - `8cba2764` (test)

## Files Created/Modified
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` - 10-test suite: per-operation + sequenced + failure-path + full-snapshot byte-comparison proof of D-04, the `getTokenStore()` seam proof, and two by-construction source gates (T-28-01/T-28-09)

## Decisions Made
- Corrected the plan's stale filename assumption (`steamConfigStore.json`) — the real file this suite protects is `steam_store/config.json`, per `TypeCheckedStoreBackend`'s constructor never forwarding its `name` type parameter to electron-store's actual options (both real electron-store and this repo's `fileStore.ts` fall back to the `config.json` default). Same `configStore` instance either way; only the on-disk filename differs from what CONTEXT.md/RESEARCH.md assumed. Recorded in the test's own docstring so a future reader isn't misled by the stale filename in the phase's planning docs.
- Added the `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` redirection pair (mirroring `skeletonFlows.test.ts`) so this suite exercises the REAL production module graph (`electronStub.ts` → `pathShim.ts` → the developer's real `~/Library/Application Support/GameLib/steam_store/config.json`) rather than Jest's automatic backend-wide synthetic mock — this is load-bearing for the proof's actual meaning, not cosmetic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in my own new test code] First draft silently tested a synthetic store, not the real production configStore path**
- **Found during:** Task 1, manual verification step (diffing the real on-disk store file before/after a run)
- **Issue:** My first draft omitted the `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` redirection pair. Without it, Jest's automatic backend-wide manual mock (`src/backend/__mocks__/electron.ts`, `os.tmpdir()`-backed — applied to every backend test whether or not a file explicitly calls `jest.mock('electron', ...)`) intercepted the import instead of the real `electronStub.ts`/`fileStore.ts`/`pathShim.ts` chain. The tests still passed, but they were proving a synthetic tmpdir-backed store was untouched, not the actual shared production `configStore` file path this phase's D-04 hard constraint is about — a materially weaker proof than the plan's own "Convention warning (load-bearing)" section demands.
- **Fix:** Added the same `jest.mock('electron', () => jest.requireActual('../electronStub'))` / `jest.mock('electron-store', () => ({ default: jest.requireActual('../fileStore').default }))` pair `skeletonFlows.test.ts` uses.
- **Files modified:** `src/backend/sidecar/__tests__/electronUntouched.test.ts`
- **Verification:** Diffed the real on-disk `~/Library/Application Support/GameLib/steam_store/config.json` before and after running the suite — byte-identical (`{}` → `{}`) only once this fix was in place; before the fix, no file was created there at all (proof of the bug — the test was writing to `os.tmpdir()` instead).
- **Committed in:** `8cba2764` (Task 1's commit — fixed before the file's first commit, no separate fix-up commit needed)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a bug in this plan's own new test code, not a pre-existing regression; caught before commit by the plan's own required manual-sanity acceptance criterion).
**Impact on plan:** No scope creep. The fix makes the test's proof meaningfully stronger (real production path vs. a synthetic mock), not merely cosmetic — directly serves this plan's stated objective.

## Issues Encountered
None beyond the deviation documented above.

## Deferred Issues (pre-existing, out of scope)

`npm run test:ci` (full suite, unscoped) crashes with exit code 1 due to the same pre-existing `library.ts` install-poll leaked-`setTimeout` bug already tracked in `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/deferred-items.md` (first documented by plan 28-03, re-confirmed by 28-04). Reproduced identically twice on this plan's own `HEAD` before any of this plan's changes, and the specific offending file is `src/backend/storeManagers/steam/__tests__/games.test.ts` (or a suite ordered near it) — a Steam library-install-poll test unrelated to token/keyring storage, not touched by this plan. A scoped run with only that one file excluded (`--testPathIgnorePatterns='steam/__tests__/games.test.ts'`) passed **107/107 suites, 1738/1738 tests**, including this plan's own `electronUntouched.test.ts`, plus `tokenStore.test.ts`, `keyringTokenStore.test.ts`, `user.test.ts`, `bootstrap.test.ts`, `skeletonFlows.test.ts`, and `rustInvokeChannel.test.ts` from 28-01 through 28-04. Not fixed here per the Scope Boundary rule and the executor's own `<known_test_gotcha>` instruction not to treat this as a regression.

## Known Stubs

None — no new UI-facing stubs or hardcoded empty data introduced by this plan.

## Threat Flags

None — this plan is exactly the automated mitigation the phase's own `threat_model` (T-28-01, T-28-04, T-28-09, T-28-11) specified: no new network endpoints, auth paths, file-access patterns, or schema changes were introduced. This plan only adds test coverage.

## Verification

- `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` — 10/10 pass.
- `npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam/__tests__/tokenStore.test.ts src/backend/storeManagers/steam/__tests__/user.test.ts` — 7 suites, 113/113 tests pass.
- `npm run codecheck` (`tsc --noEmit`) — exits 0.
- `cd src-tauri && cargo build` — clean, no warnings (no Rust files touched this plan).
- Manual sanity: diffed the real `~/Library/Application Support/GameLib/steam_store/config.json` before and after running this suite — byte-identical (`{}` → `{}`).
- File size / grep acceptance criteria: 291 lines (>= 90); `it(` count 11 (>= 7); `finally|afterEach` count 1 (>= 1); `steamConfigStore.clear()` count 0; `toBe(` count 11 (>= 4); `readFileSync` count 3 (>= 1); `--watch` count 0.
- `npm run test:ci` (full, unscoped) — exits 1 due to the pre-existing, unrelated `library.ts` leaked-timer crash documented above. A scoped run excluding only that one offending file passed 107/107 suites, 1738/1738 tests.

## User Setup Required
None - no external service configuration required. This plan adds test coverage only; no runtime code changed.

## Next Phase Readiness
- REQ-28-02 and REQ-28-04's automated half is now closed: a reproducible, regression-capable proof exists that the sidecar's keyring token path cannot corrupt Electron's shared session, backed by a by-construction source gate rather than a code-review convention.
- Plan 28-06 (the manual half of the proof pair — real Keychain round-trip, a real Deny click, and the cross-build check) has no blockers from this plan; `electronUntouched.test.ts` is purely additive test coverage and touches no runtime module 28-06's manual click-through depends on.
- The pre-existing `library.ts` leaked-timer full-suite crash remains open and unrelated to this phase; still tracked in `deferred-items.md` and project memory for whichever future phase or `/gsd-debug` session next touches `library.ts`'s install-poll lifecycle.

## Self-Check: PASSED

Created file verified present: `src/backend/sidecar/__tests__/electronUntouched.test.ts`.
Task commit hash `8cba2764` verified present in `git log --oneline`.

---
*Phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate*
*Completed: 2026-07-22*
