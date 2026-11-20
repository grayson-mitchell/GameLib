---
phase: 68-versioned-persisted-stores-and-migrations
plan: 07
subsystem: frontend-notice
tags: [store-versioning, read-only, notice-stack, i18n]
requires: [68-06]
provides:
  - useReadOnlyStoresNotice zustand store and handleReadOnlyStoresNoticeSignal
  - ReadOnlyStoresNotice toast in AppNoticeStack (manual dismiss, no auto-hide)
  - readOnlyStores.* English strings and 16 area labels
affects: [68-09]
key-files:
  created:
    - src/frontend/state/ReadOnlyStoresNotice.ts
    - src/frontend/state/__tests__/ReadOnlyStoresNotice.test.ts
    - src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx
    - src/frontend/components/UI/ReadOnlyStoresNotice/index.scss
    - src/frontend/components/UI/ReadOnlyStoresNotice/__tests__/ReadOnlyStoresNotice.test.tsx
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/components/UI/NoticeStack/index.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
    - public/locales/en/gamelib.json
key-decisions:
  - "Dismissal lives in the store (dismissed flag) so the notice never re-shows in a launch, even when a later push grows the list"
  - "Toast carries its own local exit phase so dismiss can animate out after the store flips visible to false"
  - "Dismiss label is readOnlyStores.dismiss in the gamelib namespace (button.dismiss lives only in the default namespace)"
requirements-completed: [D-05, D-07, D-15]
completed: 2026-11-08
---

# Phase 68 Plan 07: Read-only stores notice display Summary

The renderer now shows one persistent, manually dismissed warning toast per launch when any store is read-only, with D-05 wording for newer-build files and named areas plus a log pointer for failed migrations.

## Tasks

1. Renderer store, closed-set signal handler, GlobalState registration, 4 tests - `2592019fe`
2. Toast component, stack wiring (between Steam and Humble), strings, 5 component tests - `6f7ba0fa5`

## Deviations from Plan

**1. [Rule 3 - Gate table] noticeStackStylesheetGate SLOTS** - the discovery guard required the new `renderNoticeSlot` caller and new AppNoticeStack child in its table; added the entry (appended last because derived-specimen tests index SLOTS by position) and updated NoticeStack.test.tsx to expect three children.

**2. [Naming] dismiss string** - used `readOnlyStores.dismiss` instead of `button.dismiss`, since the gamelib catalogue has no `button.dismiss`.

## Verification

Frontend tests (state, component, NoticeStack, stylesheet gate), hardcodedStringGate (176 pass), i18n-churn-guard, `pnpm codecheck` and scoped prettier pass. `public/locales/en/gamelib.json` is prettier-ignored (confirmed). No auto-hide or hairline in the scss (0 matches).

`pnpm lint-translations` exits 1: it reports roughly 8.7k missing/empty translations across non-English locales, already the case before this plan (e.g. `reportProblem.*` in nb_NO); the new keys add their share (about 1.9k lines). Not caused by logic here; other-locale translation is outside the plan. smoke:sidecar and tauri:dev not run. Visual check is plan 09.

## Known Stubs

None.

## Self-Check: PASSED
