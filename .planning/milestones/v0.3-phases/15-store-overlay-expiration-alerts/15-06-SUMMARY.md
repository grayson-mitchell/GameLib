---
phase: 15-store-overlay-expiration-alerts
plan: 06
subsystem: backend
tags: [humble, dedup, i18n, gap-closure, tdd]

# Dependency graph
requires:
  - phase: 15-store-overlay-expiration-alerts (plan 03)
    provides: detectAndNotifyExpirationTransitions and humbleNotifiedExpirationStore (D-90/D-91/D-92) this plan re-keys
  - phase: 14-guided-claim-flow
    provides: composite gamekey:machineName keying convention (humbleAuditStore/humbleLocalRedeemedStore) reused here to fix the WR-01 collision
provides:
  - Composite-keyed humbleNotifiedExpirationStore (gamekey:machineName) with a one-time legacy backfill from machineName-only entries
  - humble.notification.* i18n keys registered in public/locales/en/translation.json
affects: [15-store-overlay-expiration-alerts (phase close-out/verification)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite gamekey:machineName keying for per-order dedup stores (established Phase 14, reapplied here) — prevents cross-order machineName collisions"
    - "One-time legacy backfill: check-then-copy from an old flat key to a new composite key, gated on absence of the composite entry, leaving the legacy entry in place for idempotency"

key-files:
  created: []
  modified:
    - src/backend/humble/expirationAlerts.ts
    - src/backend/humble/electronStores.ts
    - src/backend/humble/__tests__/expirationAlerts.test.ts
    - public/locales/en/translation.json

key-decisions:
  - "Legacy machineName-only entries are never deleted after backfill — copying forward is sufficient and keeps the backfill idempotent across repeated syncs"
  - "humble.notification i18n block hand-inserted (not via pnpm i18n scan) per the same out-of-scope constraint documented in 15-04-SUMMARY.md — the full scan pulls in ~140 files of pre-existing orphaned-key drift unrelated to this plan"

requirements-completed: [HSTORE-03]

# Metrics
duration: ~20min
completed: 2026-07-10
---

# Phase 15 Plan 06: Store Overlay + Expiration Alerts Gap Closure (WR-01/WR-02) Summary

**Composite gamekey:machineName keying (with one-time legacy backfill) fixes the expiration-notification dedup store's cross-order machineName collision (WR-01); the four humble.notification.* OS-toast strings are now registered in translation.json (WR-02).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10 (session start)
- **Completed:** 2026-07-10T02:14:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Fixed WR-01: `detectAndNotifyExpirationTransitions` now keys `humbleNotifiedExpirationStore` by the composite `${key.gamekey}:${key.machineName}` for every get/set, matching the Phase 14 convention already used by `humbleAuditStore`/`humbleLocalRedeemedStore`. Two orders sharing the same `machineName` with different expirations now each fire exactly once and never re-fire on an identical re-sync — closing the indefinite-re-fire bug that defeated HSTORE-03's single-fire intent.
- Added a one-time legacy backfill: before the transition check, if the composite entry is absent but a pre-migration `machineName`-only entry exists, its value is copied forward to the composite key. This means upgrading from the old store shape does not fire a spurious notification storm for keys that were already notified under the old scheme. Legacy entries are left in place (harmless, keeps the backfill idempotent).
- Fixed WR-02: registered `humble.notification.{expiringTitleSingle,expiringBodySingle,expiringTitlePlural,expiringBodyPlural}` in `public/locales/en/translation.json`, hand-inserted at the alphabetically-correct position immediately before `humbleKeys`, with values matching `buildDigestCopy`'s existing inline English fallbacks exactly (English behavior unchanged; keys are now translator-visible).
- TDD RED→GREEN followed for Task 1: wrote failing composite-key and legacy-backfill tests first (confirmed 10/15 tests failed against the old machineName-only code), then implemented the fix (15/15 pass).

## Task Commits

1. **Task 1: Composite-key the expiration dedup store + legacy backfill (RED first)**
   - RED: `4045698d` (test) — added/updated composite-key assertions + 3 new WR-01 tests; confirmed 10 failures against unmodified code
   - GREEN: `b1f2e378` (feat) — implemented composite keying + backfill in expirationAlerts.ts, updated electronStores.ts comment; 15/15 tests pass, `pnpm codecheck` clean
2. **Task 2: Register the four humble.notification.* i18n keys** - `4c178be5` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/backend/humble/expirationAlerts.ts` - Composite `${key.gamekey}:${key.machineName}` keying for every store get/set in the detection loop; one-time legacy backfill before the transition check
- `src/backend/humble/electronStores.ts` - Updated `humbleNotifiedExpirationStore` comment to document composite keying, the WR-01 non-collision fix, and the legacy backfill (store's CacheStore type parameters unchanged)
- `src/backend/humble/__tests__/expirationAlerts.test.ts` - Updated all existing machineName-keyed store assertions to composite-key form; added 3 new tests: duplicate-machineName-across-orders with different expirations (both fire once, no re-fire on re-sync), duplicate-machineName where only one order's date changes (only that one re-fires), and legacy backfill (pre-seeded machineName-only entry suppresses re-fire, composite entry created)
- `public/locales/en/translation.json` - Added `humble.notification` block (4 keys) immediately before `humbleKeys`, hand-inserted per the discounts.badge convention

## Decisions Made

- Composite key built inline in expirationAlerts.ts (`` `${key.gamekey}:${key.machineName}` ``) rather than importing library.ts's private `compositeKey` helper — per the plan's explicit instruction to avoid exporting/importing library.ts internals.
- Legacy backfill checks `!store.has(composite) && store.has(key.machineName)` and copies forward without deleting the legacy entry — this is deliberately non-destructive (matches the plan's "do NOT delete legacy entries" instruction) and safe because composite keys always contain a colon while legacy keys never do, so there is no possibility of the two key spaces colliding.
- i18n keys registered by hand-edit, not `pnpm i18n` scan, to avoid pulling in the ~140-file pre-existing orphaned-key drift documented as out of scope in this same phase's prior SUMMARY (15-04) and in STATE.md Blockers/Concerns.

## Deviations from Plan

None - plan executed exactly as written. Both WR-01 and WR-02 fixes matched the plan's `<action>` and `<behavior>` specifications precisely; no additional bugs, missing functionality, or blocking issues were discovered during implementation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-01 and WR-02 (both HSTORE-03 warnings from the prior verification pass) are closed. The expiration-notification dedup store is now collision-safe across orders sharing a `machineName`, and the OS notification's four strings are translator-visible.
- All prior transition/gate/suppression semantics (null->date fires, same-date no-op, changed-date re-fires, first-sync silent seeding, settings-gate/Notification-unsupported/SteamDeck suppression) remain intact and covered by the existing + new test suite (15/15 passing).
- Recommend re-running `/gsd:verify-work 15` to confirm both gap-closure items are accepted and Phase 15 can close.

---
*Phase: 15-store-overlay-expiration-alerts*
*Completed: 2026-07-10*

## Self-Check: PASSED

All modified files confirmed present on disk (`src/backend/humble/expirationAlerts.ts`, `src/backend/humble/electronStores.ts`, `src/backend/humble/__tests__/expirationAlerts.test.ts`, `public/locales/en/translation.json`); all 3 task commit hashes (4045698d, b1f2e378, 4c178be5) confirmed in `git log`.
