---
phase: 15-store-overlay-expiration-alerts
plan: 03
subsystem: notifications
tags: [electron-notification, i18next, humble, cache-store, jest-tdd]

# Dependency graph
requires:
  - phase: 15-02
    provides: humbleNotifiedExpirationStore (electronStores.ts), notifyHumbleExpirations setting (common/types.ts + config.ts)
provides:
  - detectAndNotifyExpirationTransitions() — pure-ish digest-notification service with D-92 transition dedup and first-sync baseline suppression
  - runSync() hook that calls detection after every sync (respecting the CR-01 isStale() disconnect fence)
affects: [16-humble-store-overlay-followups, any future phase touching runSync()'s end-of-sync sequence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Digest OS notification cloned from dialog.ts's notify() guard (Notification.isSupported() && !isSteamDeckGameMode)"
    - "Transition-based dedup via a dedicated disconnect-exempt CacheStore (humbleNotifiedExpirationStore), keyed by machineName"
    - "Test isolation: mock a plan's new backend/config-importing module wholesale in sibling test files that don't already mock backend/config, to avoid pulling in unrelated module graphs (storeManagers/gog/e2eMock.ts's addTestOnlyListener)"

key-files:
  created:
    - src/backend/humble/expirationAlerts.ts
    - src/backend/humble/__tests__/expirationAlerts.test.ts
  modified:
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/humble/__tests__/library.realstore.test.ts

key-decisions:
  - "First-sync baseline suppression (locked decision 3) implemented by ALWAYS advancing humbleNotifiedExpirationStore inside the detection loop, then gating only the notification fire on opts.suppressNotifications — so dedup state is correct on every subsequent sync regardless of whether this sync fired anything"
  - "hadPriorSyncSnapshot captured from getSyncState().syncedAt at the TOP of runSync(), before any per-order fetch mutates humbleSyncStore, so a first-ever connection (or first sync since a disconnect wiped humbleSyncStore) is correctly detected"
  - "detectAndNotifyExpirationTransitions() placed AFTER recomputeOwnership() and AFTER the existing isStale() CR-01 fence, so a disconnect mid-sync never fires a notification for state that was just wiped"

patterns-established:
  - "Backend Electron Notification digest pattern: build copy via i18next.t() singular/plural keys, guard on Notification.isSupported() && !isSteamDeckGameMode && <settings toggle>, attach click handler that shows the main window then sendFrontendMessage('openScreen', <route>)"

requirements-completed: [HSTORE-03]

# Metrics
duration: ~20min
completed: 2026-07-10
---

# Phase 15 Plan 03: Expiration Digest Notification Summary

**Per-sync digest OS notification for newly-expiring Humble keys, with transition-based dedup and a silently-seeded first-sync baseline so a fresh Humble connect never storms the user with notifications.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed (Task 1 was TDD: RED -> GREEN)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `detectAndNotifyExpirationTransitions()` detects every key whose `expiration` transitioned to a new non-null date since the last-notified value, fires exactly one digest `Notification` per sync (singular body naming the game, plural body with a count), and updates `humbleNotifiedExpirationStore` so the same date is never re-notified while a *changed* date fires again (D-92).
- Locked decision 3 (no notification storm on fresh Humble connect): a first-ever sync seeds every current expiration into the dedup store with zero notifications fired.
- Clicking the notification focuses the main window and navigates to `/humble-keys/waiting` via the existing app-wide `openScreen` message (D-91) — zero new IPC plumbing.
- Respects the `notifyHumbleExpirations` setting, `Notification.isSupported()`, and Steam Deck Game Mode (D-93/Pitfall 4), cloning the exact guard used by `dialog.ts`'s `notify()`.
- Digest copy is built exclusively from `HumbleKey`'s display-safe `title`/`expiration` fields — a dedicated test asserts the internal secret-surface fields (revealed key value, keyindex) are never read (Pitfall 5).
- Wired into `runSync()` immediately after `recomputeOwnership()`, downstream of the existing `isStale()` CR-01 disconnect fence, so a mid-sync disconnect never fires a stale-state notification.

## Task Commits

Each task was committed atomically:

1. **Task 1: expirationAlerts.ts detection + digest + first-sync baseline (RED->GREEN)**
   - `e3f8a147` (test) — 12 failing tests covering dedup, baseline suppression, digest copy singular/plural, click nav, settings/OS gates, Pitfall 5
   - `35d39538` (feat) — implementation; all 12 tests pass
2. **Task 2: Wire detection into runSync() after recomputeOwnership()**
   - `0cd91592` (feat) — hook + `hadPriorSyncSnapshot` capture + 3 new wiring tests in `library.test.ts`
   - `f605324c` (fix) — Rule 1 deviation: mock `../expirationAlerts` in `library.realstore.test.ts` to fix a transitive-import regression (see Deviations below)

_Note: TDD Task 1 followed RED->GREEN; no REFACTOR commit was needed._

## Files Created/Modified
- `src/backend/humble/expirationAlerts.ts` - `detectAndNotifyExpirationTransitions()` + private `buildDigestCopy()`
- `src/backend/humble/__tests__/expirationAlerts.test.ts` - 12 unit tests (mocked Notification/main_window/ipc/store/config/environment/i18next)
- `src/backend/humble/library.ts` - one-line `hadPriorSyncSnapshot` capture + one-line detection call after `recomputeOwnership()`, both with explanatory doc-comments
- `src/backend/humble/__tests__/library.test.ts` - mock for `../expirationAlerts`; 3 new tests asserting call/ordering/suppressNotifications and no-call on a fully-failed sync
- `src/backend/humble/__tests__/library.realstore.test.ts` - mock for `../expirationAlerts` (deviation fix)

## Decisions Made
- `hadPriorSyncSnapshot` is read from `currentState.syncedAt` — the SAME `getSyncState()` call `runSync()` already makes for its cooldown check — rather than adding a second store read, avoiding any extra I/O.
- The dedup store write happens unconditionally inside the detection loop (even under `suppressNotifications`), rather than only on a decision to actually notify, so a first-sync baseline and a later real transition share one code path with no special-casing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a transitive-import regression in library.realstore.test.ts**
- **Found during:** Task 2 verification (running the full `src/backend/humble` test suite, beyond the plan's required `library.test.ts` scope, to check for regressions caused by touching `library.ts`)
- **Issue:** Wiring `detectAndNotifyExpirationTransitions` into `library.ts` made `library.ts` transitively import `backend/config` (via the new `expirationAlerts.ts` import), which pulls in `storeManagers/gog/e2eMock.ts` at module-load time. That file calls `addTestOnlyListener` from `backend/ipc` — but `library.realstore.test.ts` only mocks `backend/ipc`'s `sendFrontendMessage`, so `addTestOnlyListener` was `undefined`, throwing `TypeError: ... is not a function` and failing the entire test suite.
- **Fix:** Mocked `../expirationAlerts` wholesale in `library.realstore.test.ts`, matching the same pattern already added to `library.test.ts` in Task 2. The real digest/dedup behavior stays fully covered by `expirationAlerts.test.ts`; this suite only needs to assert the real `CacheStore`/`electron-store` sync-commit behavior it exists for.
- **Files modified:** `src/backend/humble/__tests__/library.realstore.test.ts`
- **Verification:** `npx jest src/backend/humble` — 12/12 suites, 461/461 tests pass. Full `npx jest --selectProjects Backend` — 37/37 suites, 779/779 tests pass. `pnpm codecheck` clean.
- **Committed in:** `f605324c`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug)
**Impact on plan:** Necessary to avoid a real regression introduced by the plan's own Task 2 wiring; no scope creep beyond the plan's stated boundaries (all three touched test files exist to test `library.ts`/`HumbleLibrary` directly).

## Issues Encountered
- `i18next.t()` calls in the unit test environment don't perform real interpolation (i18next is never `.init()`-ed in these tests) — resolved by mocking `i18next` with a small template-interpolation double (precedent: `storeManagers/steam/__tests__/library.test.ts`'s identical mock), so digest body/title assertions can check the interpolated title/count.
- The acceptance-criteria grep for internal secret-surface field names (`revealedKeyValue|keyindex|HumbleKeyInternal` == 0) initially caught a doc-comment mentioning those field names by name (not actual field access) — reworded the comment to avoid the literal strings while keeping the same meaning.

## User Setup Required

None - no external service configuration required. No new npm packages (Electron's built-in `Notification` only, per the plan's threat model T-15-03-04).

## Next Phase Readiness
- HSTORE-03 fully implemented and unit-tested; ready for the plan's listed manual verification (trigger a real sync where a key gains an expiration, observe the OS toast, click through to Keys-waiting, confirm no re-fire on a repeat sync, confirm no storm on a fresh connect).
- `src/backend/humble/expirationAlerts.ts` and its digest i18n keys (`humble.notification.expiring*`) are new — a follow-up locale-key registration/i18n-extraction pass may be needed if this repo runs a `pnpm i18n --fail-on-update` check (matches the pre-existing STATE.md-documented locale-drift housekeeping item from Phase 7, not something this plan needs to resolve).
- No blockers identified for the phase's remaining plan(s).

---
*Phase: 15-store-overlay-expiration-alerts*
*Completed: 2026-07-10*
