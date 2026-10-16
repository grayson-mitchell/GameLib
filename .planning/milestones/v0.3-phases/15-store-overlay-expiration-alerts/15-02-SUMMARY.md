---
phase: 15-store-overlay-expiration-alerts
plan: 02
subsystem: humble-notifications-foundation
tags: [settings, electron-store, humble, notifications]
dependency-graph:
  requires: []
  provides:
    - "AppSettings.notifyHumbleExpirations (default true)"
    - "humbleNotifiedExpirationStore (disconnect-exempt CacheStore)"
  affects:
    - "Plan 15-03 (detection/dispatch logic reads both artifacts from this plan)"
tech-stack:
  added: []
  patterns:
    - "3-file settings pattern (AppSettings field + factory default + component clone + barrel export + section registration)"
    - "Disconnect-exempt CacheStore pattern (own on-disk file, never cleared by HumbleUser.disconnect())"
key-files:
  created:
    - src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx
  modified:
    - src/common/types.ts
    - src/backend/config.ts
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
    - src/backend/humble/electronStores.ts
    - src/backend/humble/__tests__/electronStores.test.ts
    - public/locales/en/translation.json
decisions:
  - "D-93: notifyHumbleExpirations defaults to true (on-by-default), unlike analyticsOptIn's false default"
  - "D-92: humbleNotifiedExpirationStore is disconnect-exempt, keyed by machineName, value shape { expiration: string } only (no raw key data, matches T-15-02-01 mitigation)"
metrics:
  duration: "~20min"
  completed: "2026-07-10"
---

# Phase 15 Plan 02: Notification Foundation Summary

Default-ON "Notify when Humble keys gain expiration dates" Settings toggle wired through the standard AppSettings/factory-default/component/barrel/section pattern, plus a disconnect-exempt `humbleNotifiedExpirationStore` CacheStore keyed by `machineName` that persists the last-notified expiration date per key.

## What Was Built

**Task 1 — Settings toggle:**
- Added `notifyHumbleExpirations: boolean` to `AppSettings` in `src/common/types.ts`, beside `analyticsOptIn`.
- Added `notifyHumbleExpirations: true` to `getFactoryDefaults()` in `src/backend/config.ts` (D-93 on-by-default).
- Created `src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx`, cloned from `AnalyticsOptIn.tsx`'s `.toggleRow` + `ToggleSwitch` + `InfoIcon` structure, using `useSetting('notifyHumbleExpirations', true)`.
- Added the component to the Settings components barrel export (`components/index.ts`) and registered `<NotifyHumbleExpirations />` in `GeneralSettings/index.tsx` directly after `<DiscordRPC />` (nearest notification/behavior-adjacent group), before `<DisableController />`.
- Added the two locked-copy i18n keys (`setting.notifyHumbleExpirations`, `help.notifyHumbleExpirations`) directly to `public/locales/en/translation.json` (see Deviations — `pnpm i18n` was not used for this).

**Task 2 — Disconnect-exempt store:**
- Added `humbleNotifiedExpirationStore = new CacheStore<{ expiration: string }, string>('humble_notified_expiration', null)` to `src/backend/humble/electronStores.ts`, following the `humbleGiftedAtStore` shape, with a doc-comment matching the file's disconnect-exempt rationale block.
- Confirmed (via grep + read of `user.ts`) that `HumbleUser.disconnect()` only clears `humbleLibraryStore`/`humbleSyncStore` — the new store is not referenced there, so it survives disconnect/reconnect (D-92).
- Added the store to the file's final `export { ... }` block.
- Extended `electronStores.test.ts` with a new `describe('humbleNotifiedExpirationStore', ...)` block: a set/get roundtrip keyed by `machineName` with value shape `{ expiration: string }`, and a disconnect-survival assertion mirroring the existing `humbleGiftedAtStore`/`humbleAuditStore` pattern (clears `configStore`/`humbleLibraryStore`/`humbleSyncStore`, asserts the new store's record still exists).

## Verification

- `pnpm codecheck` (tsc --noEmit): clean, both after Task 1 and Task 2.
- `npx jest src/backend/humble/__tests__/electronStores.test.ts`: 13/13 tests pass (2 new).
- `npx eslint` on all touched files: 0 errors (5 pre-existing warnings in `config.ts` on unrelated lines ~102/302-320, not introduced by this plan).
- `npx prettier --check` on all touched files: clean (prettier auto-formatted `electronStores.ts`'s pre-existing long import line and a wrapped generic as part of `--write`, both harmless whitespace-only changes bundled with the Task 2 commit).
- All acceptance-criteria greps from the plan passed:
  - `notifyHumbleExpirations: boolean` in `types.ts`: 1
  - `notifyHumbleExpirations: true` in `config.ts`: 1
  - `useSetting('notifyHumbleExpirations', true)` present in the new component (across two lines per the project's existing wrap style, matching `AnalyticsOptIn.tsx`'s own wrapped `useSetting` call)
  - `NotifyHumbleExpirations` in `GeneralSettings/index.tsx`: 2 (import + render)
  - `setting.notifyHumbleExpirations` / `help.notifyHumbleExpirations` present in `translation.json`
  - `humbleNotifiedExpirationStore` in `electronStores.ts`: 2 (declaration + export)
  - `humble_notified_expiration` in `electronStores.ts`: 1
  - `humbleNotifiedExpirationStore` in `user.ts`: 0 (not wiped on disconnect)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `pnpm i18n` rewrote unrelated pre-existing locale debt — reverted and added keys manually instead**
- **Found during:** Task 1
- **Issue:** Running `pnpm i18n` (as the plan's action step directed) added the 2 expected keys but also normalized/removed 16 pre-existing keys and reformatted several plural-suffix keys (`tabSpares` → `tabSpares_one`/`_other`, etc.) across `humbleKeys`/`library` namespaces — orphaned-key drift already flagged in STATE.md's Blockers/Concerns section as pre-existing repo debt, unrelated to this plan's scope.
- **Fix:** Reverted `public/locales/en/translation.json` via `git checkout --`, then manually inserted the two locked-copy keys (`setting.notifyHumbleExpirations` under the `setting` namespace, `help.notifyHumbleExpirations` under the `help` namespace) at their alphabetically-correct positions, matching the tool's expected sort order.
- **Files modified:** `public/locales/en/translation.json`
- **Commit:** `3376255b`

No other deviations. Plan executed as written.

## Self-Check: PASSED

- FOUND: src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx
- FOUND: src/common/types.ts (notifyHumbleExpirations field present)
- FOUND: src/backend/config.ts (notifyHumbleExpirations: true present)
- FOUND: src/backend/humble/electronStores.ts (humbleNotifiedExpirationStore present)
- FOUND: src/backend/humble/__tests__/electronStores.test.ts (new describe block present)
- FOUND commit 3376255b (Task 1)
- FOUND commit a39d46c6 (Task 2)
