---
phase: 10-humble-auth-adapter-scaffold
plan: 01
subsystem: auth
tags: [zod, axios, electron-store, humble, backend]

# Dependency graph
requires: []
provides:
  - "AdapterResult<T>, HumbleUserData, HumbleAuthState contracts (src/common/types/humble.ts)"
  - "Humble constants: token store key/prefix, login partition, base URL, required headers (src/backend/humble/constants.ts)"
  - "humbleConfigStore backend config store (src/backend/humble/electronStores.ts), registered in StoreStructure"
  - "C5 adapter: getGamekeys/getOrderDetail/getAccountIdentity with zod validation + 401/403 split (src/backend/humble/adapter.ts)"
affects: [10-02, 10-03, 10-04, 10-05, phase-11-library-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "C5 adapter isolation: single file (adapter.ts) is the only place axios talks to humblebundle.com; every response zod safeParse'd, never a blind cast"
    - "AdapterResult<T> 4-variant discriminated union (ok/session_expired/access_denied/schema_error) as the universal Humble call return shape"
    - "401 -> session_expired, 403 -> access_denied split so a Humble-side block never triggers a spurious re-login prompt"
    - "electron-store name must be registered in common/types/electron_store.ts StoreStructure before TypeCheckedStoreBackend('name', ...) type-checks"

key-files:
  created:
    - src/common/types/humble.ts
    - src/backend/humble/constants.ts
    - src/backend/humble/electronStores.ts
    - src/backend/humble/adapter.ts
    - src/backend/humble/__tests__/adapter.test.ts
  modified:
    - src/common/types/electron_store.ts

key-decisions:
  - "getAccountIdentity targets a plausible /api/v1/user/info endpoint with a D-02/D-13 point 4 code comment — the real endpoint is confirmed empirically in Plan 05's live validation gate, per the plan's explicit design (endpoint intentionally deferred)"
  - "OrderDetailSchema and AccountIdentitySchema use zod .passthrough() to stay permissive; Plan 05 tightens tpkd_dict.all_tpks[n].steam_app_id assertions against the real API"
  - "Registered humbleConfigStore in StoreStructure (common/types/electron_store.ts) even though not in the plan's files_modified list — required for TypeCheckedStoreBackend to type-check (Rule 3, blocking issue)"

patterns-established:
  - "Humble domain lives entirely under src/backend/humble/ and src/common/types/humble.ts, mirroring the steam/ store-manager layout without being a Runner"

requirements-completed: [HACCT-01, HACCT-02]

duration: ~12min
completed: 2026-07-05
---

# Phase 10 Plan 01: Humble Auth + Adapter Scaffold - Backend Foundation Summary

**C5-isolated Humble adapter (getGamekeys/getOrderDetail/getAccountIdentity) with zod-validated responses and a 401/403 session_expired/access_denied split, plus the shared type contracts, constants, and config store every downstream Humble plan depends on.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 completed
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- Defined `AdapterResult<T>`, `HumbleUserData`, and the renderer-safe `HumbleAuthState` (no cookie) in `src/common/types/humble.ts`
- Created Humble constants (`HUMBLE_TOKEN_STORE_KEY`, `HUMBLE_TOKEN_PREFIX`, `HUMBLE_LOGIN_PARTITION`, `HUMBLE_BASE_URL`, `HUMBLE_LOGIN_URL`, `HUMBLE_REQUIRED_HEADERS` with `hb_android_app`) and `humbleConfigStore` (mirroring the Steam store-manager shape exactly)
- Built the adapter.ts C5 wall test-first (RED then GREEN): 20 tests covering ok/schema_error/session_expired/access_denied for all three functions, header assertions (`X-Requested-By: hb_android_app`, `Cookie: _simpleauth_sess=<cookie>`), and explicit "never logs the cookie" assertions on both success and error paths
- `npx tsc --noEmit` clean for all new Humble files; `npx jest adapter.test.ts` 20/20 passing; `npx eslint`/`npx prettier --check` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Define Humble type contracts, constants, and config store** - `b80900fc` (feat)
2. **Task 2: Implement C5 adapter with zod validation and 401/403 split (test-first)** - `8a0c3e72` (test, RED) + `a6b9fb60` (feat, GREEN)

_Note: Task 2 is a TDD task — RED and GREEN are separate commits per the TDD execution flow._

## Files Created/Modified

- `src/common/types/humble.ts` - `AdapterResult<T>`, `HumbleUserData`, `HumbleAuthState` contracts
- `src/backend/humble/constants.ts` - token store key/prefix, login partition, base URL, required headers
- `src/backend/humble/electronStores.ts` - `humbleConfigStore` (`TypeCheckedStoreBackend`, `cwd: 'humble_store'`)
- `src/backend/humble/adapter.ts` - `getGamekeys`, `getOrderDetail`, `getAccountIdentity`; zod schemas; 401/403 split
- `src/backend/humble/__tests__/adapter.test.ts` - 20 tests across ok/schema_error/session_expired/access_denied + header + no-secret-logging assertions
- `src/common/types/electron_store.ts` (modified) - registered `humbleConfigStore` in `StoreStructure` (Rule 3 auto-fix, see below)

## Decisions Made

- `getAccountIdentity` targets `/api/v1/user/info` as a plausible identity endpoint, flagged with a `// D-02/D-13 point 4` code comment — this is provisional by design; Plan 05's live validation gate confirms (or corrects) the real endpoint empirically before Phase 11 relies on it.
- Kept `OrderDetailSchema`/`AccountIdentitySchema` permissive (`.passthrough()`) since the exact Humble response shape is not officially documented; Plan 05 tightens assertions (e.g. `tpkd_dict.all_tpks[n].steam_app_id`) against the real API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed relative import path in electronStores.ts**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** The PATTERNS.md analog (`steam/electronStores.ts`) imports `TypeCheckedStoreBackend` via `'../../electron_store'` because that file lives two directories under `src/backend/` (`storeManagers/steam/`). `src/backend/humble/` is only one directory under `src/backend/`, so the correct relative path is `'../electron_store'`. Copying the analog verbatim produced a "Cannot find module" error.
- **Fix:** Changed the import to `'../electron_store'`.
- **Files modified:** `src/backend/humble/electronStores.ts`
- **Verification:** `npx tsc --noEmit` clean for `src/backend/humble`.
- **Committed in:** `b80900fc` (Task 1 commit)

**2. [Rule 3 - Blocking] Registered `humbleConfigStore` in `StoreStructure`**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `TypeCheckedStoreBackend<Name>`'s constructor requires `Name` to be a key of `StoreStructure` (`src/common/types/electron_store.ts`). Without an entry, `new TypeCheckedStoreBackend('humbleConfigStore', ...)` fails to type-check ("not assignable to parameter of type 'keyof StoreStructure'"). This file was not in the plan's `files_modified` list but the omission blocks the plan's own acceptance criterion (`npx tsc --noEmit` clean for the new humble files).
- **Fix:** Added a `humbleConfigStore: { isLoggedIn: boolean; sessionCookie?: string; userData?: HumbleUserData }` entry to `StoreStructure`, importing `HumbleUserData` from the newly created `./humble` types module.
- **Files modified:** `src/common/types/electron_store.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx eslint`/`npx prettier --check` clean.
- **Committed in:** `b80900fc` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were required for the plan's own stated acceptance criteria (clean `tsc --noEmit`) to pass. No scope creep — no new files beyond the one type-registration edit, no new behavior added.

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None - no external service configuration required. Zero new npm packages (zod and axios were already project dependencies).

## Next Phase Readiness

- The adapter, contracts, constants, and config store are in place and fully tested — Plan 02 (auth service / `HumbleUser` class + BrowserWindow login flow) can now build on `HUMBLE_TOKEN_STORE_KEY`/`HUMBLE_TOKEN_PREFIX`/`HUMBLE_LOGIN_PARTITION` and the adapter's `getAccountIdentity`/`getGamekeys` functions without guessing signatures.
- `getAccountIdentity`'s endpoint (`/api/v1/user/info`) is provisional — Plan 05's live validation gate must confirm or correct it against the real Humble API before Phase 11 (library sync) depends on identity data being accurate.
- No blockers.

---
*Phase: 10-humble-auth-adapter-scaffold*
*Completed: 2026-07-05*
