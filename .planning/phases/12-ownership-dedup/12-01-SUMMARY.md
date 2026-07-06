---
phase: 12-ownership-dedup
plan: 01
subsystem: humble-dedup
tags: [typescript, jest, tdd, humble-bundle, steam, dedup]

# Dependency graph
requires:
  - phase: 11-library-sync-5-state-key-model
    provides: HumbleKey 5-state classification model, classifyOrder, HUMBLE_CLASSIFIER_VERSION cache-invalidation mechanism
provides:
  - HumbleKey extended with steamAppId?/ownedElsewhere/matchConfidence (ownership-overlay fields)
  - HUMBLE_CLASSIFIER_VERSION bumped 2->3 (triggers one-time backfill re-fetch of already-cached/frozen orders)
  - HUMBLE_FUZZY_MATCH_THRESHOLD=0.85 constant (locked HDEDUP-01 threshold)
  - classifyOrder captures steam_app_id (stringified) for platform==='steam' tpks only
affects: [12-02-matching-core, 12-03-backend-wiring, 12-04-ipc, 12-05-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [type extension backfill via classifier-version bump, per-tpk try/catch tolerant field extraction]

key-files:
  created: []
  modified:
    - src/common/types/humble.ts
    - src/backend/humble/constants.ts
    - src/backend/humble/classify.ts
    - src/backend/humble/__tests__/classify.test.ts
    - src/backend/humble/__tests__/fixtures/tpks.ts
    - src/backend/humble/__tests__/groupKeys.test.ts (Rule 3 blocking-fix)
    - src/backend/humble/__tests__/library.test.ts (Rule 3 blocking-fix)

key-decisions:
  - "steamAppId capture gated strictly on platform === 'steam' (the already-derived key_type label), never on the raw tpk shape"
  - "ownedElsewhere/matchConfidence default to false/'none' at classify time; classify.ts never computes ownership itself (dedup.ts, a later plan, fills these in) — preserves the module's no-I/O, no-store pure-function contract"
  - "HumbleKeyState union left untouched — ownedElsewhere is an orthogonal overlay, not a 6th state"

patterns-established:
  - "Ownership-overlay fields on HumbleKey are populated by a downstream module (dedup.ts), not by classify.ts — classify.ts stays a pure field-extraction/classification boundary"

requirements-completed: [HDEDUP-01, HDEDUP-02]

# Metrics
duration: 8min
completed: 2026-07-06
---

# Phase 12 Plan 01: Ownership Dedup Type + Data-Capture Foundation Summary

**Extended HumbleKey with three ownership-overlay fields, bumped the classifier version to force a one-time backfill, and wired `classifyOrder` to capture the live Steam AppID (stringified) for Steam-platform keys only — the linchpin data every downstream dedup plan depends on.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-06T10:40:17Z (approx, per STATE.md context)
- **Completed:** 2026-07-06T10:48:09Z
- **Tasks:** 2 completed
- **Files modified:** 7 (2 core source files, 1 test file extended, 1 fixture file extended, 2 pre-existing test files patched for compile compatibility)

## Accomplishments

- `HumbleKey` now carries `steamAppId?: string`, `ownedElsewhere: boolean`, `matchConfidence: 'exact' | 'fuzzy' | 'none'` — `HumbleKeyState` union unchanged (verified by grep + existing "union unchanged" contract)
- `HUMBLE_CLASSIFIER_VERSION` bumped 2 -> 3 and `HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85` added, so a future library.ts sync (Plan 02+) triggers the D-24 frozen-order bypass once, letting pre-Phase-12 REDEEMED keys backfill `steamAppId`
- `classifyOrder` reads `tpk.steam_app_id` (number or string) inside the existing per-tpk try/catch, stringifying it into `steamAppId` only when `platform === 'steam'`; every classified key (including the UNPICKED pseudo-entry) defaults the two overlay fields
- 5 new classify.test.ts cases (numeric AppID, string AppID, non-Steam undefined, overlay-field defaults, malformed AppID never-throws) — all green; full classify.test.ts suite (75 tests) and full humble backend suite (224 tests) pass; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend HumbleKey type and add dedup constants** - `d5704461` (feat)
2. **Task 2: Capture steam_app_id during classification** - `424076a2` (feat)

_Note: task 1's tdd="true" verification was type-level (tsc), not a separate jest RED/GREEN cycle — no dedicated test file exists for pure type extensions in this codebase's convention, so acceptance was via `tsc --noEmit` + grep per the plan's own `<verify>` spec. Task 2's tdd="true" behavior followed the standard jest-verified pattern (tests extended and green before commit)._

## Files Created/Modified

- `src/common/types/humble.ts` - Extended `HumbleKey` interface with `steamAppId?`, `ownedElsewhere`, `matchConfidence`; added a doc-comment note to `HumbleOrderCacheEntry.keys` about the new overlay fields
- `src/backend/humble/constants.ts` - `HUMBLE_CLASSIFIER_VERSION` 2->3 with changelog line; new `HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85`
- `src/backend/humble/classify.ts` - `classifyOrder` now reads `tpk.steam_app_id`, stringifies it for Steam tpks, and pushes `steamAppId`/`ownedElsewhere`/`matchConfidence` on both the per-tpk push and the UNPICKED pseudo-entry push. No new imports (pure-function contract intact)
- `src/backend/humble/__tests__/classify.test.ts` - 5 new tests under a `classifyOrder — steamAppId capture (Phase 12)` describe block
- `src/backend/humble/__tests__/fixtures/tpks.ts` - 3 new fixtures: `steamKeyWithNumericAppIdOrder`, `steamKeyWithStringAppIdOrder`, `steamKeyWithMalformedAppIdOrder`
- `src/backend/humble/__tests__/groupKeys.test.ts` - `makeKey()` factory now defaults `ownedElsewhere: false, matchConfidence: 'none'` (Rule 3 blocking-fix; pre-existing helper constructed `HumbleKey` literals that no longer satisfied the extended interface)
- `src/backend/humble/__tests__/library.test.ts` - Three inline `HumbleKey` object literals (`makeTerminalEntry`, `makeNonTerminalEntry`, `makeStaleEntitlementEntry`) given the same two default fields (Rule 3 blocking-fix)

## Decisions Made

- Extending `HumbleKey` with two non-optional fields (`ownedElsewhere`, `matchConfidence`) immediately broke three pre-existing test-fixture object literals at compile time. Per Rule 3 (auto-fix blocking issues), added the default values (`ownedElsewhere: false, matchConfidence: 'none'`) inline at each literal rather than making the fields optional — the plan's interfaces block explicitly specifies these as non-optional per-row fields (only `steamAppId` is optional), so weakening the type to dodge the compile error would have violated the plan's stated type contract.
- `steamAppId` capture is scoped to `platform === 'steam'` (the already-derived, guaranteed-string `key_type` label) rather than checking the raw `key_type` field directly — matches the plan's action spec exactly and keeps the read consistent with how `platform` itself is derived a few lines above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking compile fix] Pre-existing test fixtures broke after extending HumbleKey with non-optional fields**
- **Found during:** Task 1 (Extend HumbleKey type and add dedup constants)
- **Issue:** `src/backend/humble/__tests__/groupKeys.test.ts` and `src/backend/humble/__tests__/library.test.ts` construct `HumbleKey`/`HumbleOrderCacheEntry` object literals (predating this plan) that omitted the two new non-optional fields, causing `tsc --noEmit` to fail with `TS2739`/missing-property errors — a direct consequence of this task's type extension, not a pre-existing unrelated issue.
- **Fix:** Added `ownedElsewhere: false, matchConfidence: 'none'` to the `makeKey()` factory default in groupKeys.test.ts, and to the three inline `HumbleKey` literals in library.test.ts (`makeTerminalEntry`, `makeNonTerminalEntry`, `makeStaleEntitlementEntry`).
- **Files modified:** `src/backend/humble/__tests__/groupKeys.test.ts`, `src/backend/humble/__tests__/library.test.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx jest src/backend/humble` — 224/224 tests pass (no regressions)
- **Committed in:** `d5704461` (part of Task 1's commit, since the break was caused by Task 1's type change)

## Known Stubs

None. This plan's scope is data-capture only (types + classification field extraction) — `ownedElsewhere`/`matchConfidence` are intentionally left at their default/no-op values (`false`/`'none'`) here by design, per the plan's own objective: "Every downstream plan (matching core, backend wiring, IPC, UI) reads these types and this captured field." The actual ownership-matching logic is explicitly out of scope for Plan 01 (see plan's `<action>` for Task 2: "Do NOT compute ownership here — only capture the raw field").

## Self-Check: PASSED

- FOUND: src/common/types/humble.ts
- FOUND: src/backend/humble/constants.ts
- FOUND: src/backend/humble/classify.ts
- FOUND: src/backend/humble/__tests__/classify.test.ts
- FOUND: src/backend/humble/__tests__/fixtures/tpks.ts
- FOUND commit d5704461 (feat(12-01): extend HumbleKey with ownership-dedup fields, bump classifier version)
- FOUND commit 424076a2 (feat(12-01): capture steam_app_id during classification)
- tsc --noEmit: clean
- jest src/backend/humble/__tests__/classify.test.ts: 75/75 passed
- jest src/backend/humble (full suite): 224/224 passed
