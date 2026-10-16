---
phase: 18-macos-32-bit-detection-badge-crossover-routing
plan: 02
subsystem: steam
tags: [mac-arch, store-api, bottle-routing, isBottleEligible, direction-b]

# Dependency graph
requires:
  - phase: 18-01
    provides: mac_arch/mac_arch_verified/mac_arch_source type contracts on GameInfo + SteamMetadataCacheEntry (reused, not redefined)
  - phase: 17-steam-on-macos-via-crossover
    provides: isBottleEligible() D-11 routing gate extended by this plan
provides:
  - parseSteamMacMinOSVersion / macArchFromMinOS pure functions (games.ts) — pre-install mac_arch hint from store-API mac_requirements min-OS
  - inline mac_arch derivation inside the existing fetchMetadataIfNeeded (no new network call, no PICS/steam-user involvement)
  - mac_arch_source enum reconciled 'osarch' → 'minos' | 'macho'
  - isBottleEligible() mac_arch==='32' OR-branch (dormant until Plan 18-03 caches a '32' verdict)
affects: [18-03, 18-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bounded-regex HTML parsing mirroring parseSteamStorageRequirement (strip tags first, then isolate label segment — avoids splitting label/value across a tag boundary)"
    - "floor-only heuristic with a type-level '32'-exclusion (macArchFromMinOS return type has no '32' member)"
    - "steamMetadataStore.set REPLACES the whole cached entry — verified/provenance fields must be explicitly carried forward on every write, not just spread-assumed"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "Deviation from 18-RESEARCH.md Pattern 1's reference regex: the documented label-isolation regex (`OS\\s*X?\\s*:?\\s*([^<]*)`) fails on the canonical `<strong>OS:</strong> value` shape because the label is closed by `</strong>` immediately after the colon, leaving `[^<]*` capturing an empty string. Fixed by stripping all HTML tags FIRST, then matching `\\bOS(?:\\s*X)?\\s*:?\\s*(.*)` on the tag-free text — verified against all 9 corpus fixtures in the plan's <interfaces> block, including the exact Dota 2/No Man's Sky '64' cases the buggy regex would have missed."
  - "mac_arch_verified and mac_arch_source must be explicitly re-written on every fetchMetadataIfNeeded persistence call (not just conditionally added when newly computed) because steamMetadataStore.set() fully replaces the stored entry (electron-store Store.set semantics, not a merge) — omitting this would silently erase a Plan 18-03 Mach-O verdict on the very next metadata re-fetch (next launch/resync), which the plan's must_haves explicitly forbid (T-18-02-04)."

patterns-established:
  - "mac_arch derivation: floor-only heuristic, never '32' pre-install; only post-install Mach-O check (18-03) may assert '32'"
  - "isBottleEligible() OR-branch pattern for reasons a macOS game routes to the bottle: platformsCaptured+is_mac_native===false (D-11) OR mac_arch==='32' (MAC32-02), independent conditions checked in sequence"

requirements-completed: [MAC32-01, MAC32-02]

# Metrics
duration: ~25min
completed: 2026-07-12
---

# Phase 18 Plan 02: macOS Min-OS Arch Heuristic & Bottle Routing Summary

**Added a store-API `mac_requirements` min-OS floor heuristic (`parseSteamMacMinOSVersion`/`macArchFromMinOS`) that derives a pre-install `mac_arch` hint inline from the existing appdetails fetch — confident `'64'` at Catalina+, soft `'unknown'` below, never `'32'` — and wired the `isBottleEligible()` `mac_arch === '32'` OR-branch so Plan 18-03's post-install Mach-O verdict will route the moment it lands.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-12
- **Tasks:** 3 (all auto/tdd)
- **Files modified:** 3 (games.ts, electronStores.ts, games.test.ts) — no new files

## Accomplishments

- `parseSteamMacMinOSVersion` + `macArchFromMinOS` pure functions added to `games.ts`, colocated immediately after `parseSteamStorageRequirement`, mirroring its bounded-regex, never-eval/render discipline (T-06-02).
- `macArchFromMinOS`'s return type is `'64' | 'unknown'` — no `'32'` member exists, so Pitfall 3 (never assert 32-bit from a min-OS floor) is enforced at the type level, not by convention.
- `mac_arch` is derived inline inside the existing `fetchMetadataIfNeeded` from the same `appdetails` response that already yields `is_mac_native` — zero new network calls, zero `steam-user`/PICS involvement.
- The derivation is gated two ways: (1) never overwrites a `mac_arch_verified === true` entry (a Mach-O ground truth never regresses), (2) only computed when `is_mac_native` is true.
- `mac_arch_source` enum reconciled from the dead `'osarch'` (PICS) design to `'minos' | 'macho'` (direction B), with doc comments updated on both `GameInfo` neighbors and `SteamMetadataCacheEntry`.
- `isBottleEligible()` gained an independent `mac_arch === '32'` OR-branch, placed above the unchanged D-11 return line — dormant pre-install (the heuristic never yields `'32'`), but live-wired so Plan 18-03's Mach-O check routes immediately once it caches a `'32'` verdict.
- 30 new tests added (11 `parseSteamMacMinOSVersion`, 10 `macArchFromMinOS`, 5 `fetchMetadataIfNeeded` MAC32-01 persistence cases, 4 `isBottleEligible`/`isNative` MAC32-02 routing cases), all green; full games suite 118/118 passing.

## Task Commits

1. **Task 1: parseSteamMacMinOSVersion + macArchFromMinOS pure functions (MAC32-01)** — `062a6c9f` (feat)
2. **Task 2: Reconcile mac_arch_source enum + inline mac_arch derivation in fetchMetadataIfNeeded (MAC32-01)** — `a9178c38` (feat)
3. **Task 3: isBottleEligible '32' OR-branch + routing regression tests (MAC32-02)** — `e90e3e44` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/games.ts` — added `parseSteamMacMinOSVersion`/`macArchFromMinOS` (with a `MACOS_CODENAME_VERSION` fallback map and `extractVersionTokens` helper); inline `mac_arch`/`mac_arch_source`/`mac_arch_verified` derivation and persistence in `fetchMetadataIfNeeded`; `isBottleEligible()` `mac_arch === '32'` OR-branch.
- `src/backend/storeManagers/steam/electronStores.ts` — `mac_arch_source?: 'osarch' | 'macho'` → `'minos' | 'macho'`, doc comments updated to describe direction B provenance.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — `describe('parseSteamMacMinOSVersion')` + `describe('macArchFromMinOS')` blocks colocated after `describe('parseSteamStorageRequirement')`; 5 new `fetchMetadataIfNeeded` MAC32-01 tests in the lazy-metadata describe block; 4 new MAC32-02 tests in the D-11 `isNative()` describe block.

## Decisions Made

See `key-decisions` in frontmatter. Both deviations are documented in detail below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed the label-isolation regex from 18-RESEARCH.md Pattern 1 — it fails on the canonical HTML shape**

- **Found during:** Task 1, writing the first test (`macArchFromMinOS` for Dota 2's canonical `<li><strong>OS:</strong> macOS 10.15 or newer<br></li>` string).
- **Issue:** The plan's `<action>` instructed using "18-RESEARCH.md Pattern 1's reference implementation directly." That reference implementation's label regex, `htmlOrText.match(/OS\s*X?\s*:?\s*([^<]*)/i)`, isolates the segment after the label by capturing up to the next `<`. But in the canonical shape, the label itself (`OS:`) is wrapped in `<strong>...</strong>` and the actual value (`macOS 10.15 or newer`) sits OUTSIDE the closing tag. The regex matches `"OS:"` and then immediately hits `</strong>`'s `<`, capturing an empty string — so the parser silently returned `null` for the exact two `'64'`-confident test cases (Dota 2 min-OS 10.15, No Man's Sky min-OS 12.3) that anchor the whole heuristic's confident branch.
- **Fix:** Strip all HTML tags from the input FIRST (`htmlOrText.replace(/<[^>]*>/g, ' ')`), then match the OS label with a word-boundary-anchored regex (`\bOS(?:\s*X)?\s*:?\s*(.*)`) on the tag-free text. Re-verified against all 9 corpus shapes cited in the plan's `<interfaces>` block (canonical bulleted, parenthetical codename, "or higher" multi-alternative, tagless run-on prose, label+value co-located range, decoy-digit "32/64-bit", major-version-12) — all resolve correctly, including the two `'64'`-confident anchors that the unfixed regex silently broke.
- **Files modified:** `src/backend/storeManagers/steam/games.ts` (`parseSteamMacMinOSVersion`).
- **Verification:** All 21 `parseSteamMacMinOSVersion`/`macArchFromMinOS` unit tests pass, seeded with the literal corpus strings.
- **Commit:** `062a6c9f`.

**2. [Rule 2 - Missing critical functionality] Explicitly carry forward `mac_arch_verified`/`mac_arch_source` on every `fetchMetadataIfNeeded` persistence write**

- **Found during:** Task 2, implementing the "never regress a Mach-O-verified entry" gate from the plan's `must_haves`.
- **Issue:** The plan's Pattern 2 reference code (and the plan's own `<action>` text) only conditionally adds `mac_arch_source: 'minos'` when newly computing the heuristic, but never re-writes `mac_arch_verified`/`mac_arch_source` when `mac_arch_verified` was already `true`. `steamMetadataStore.set()` fully REPLACES the stored entry (electron-store `Store.set(key, value)` semantics — confirmed by reading `cache.ts`), not a merge. Following the reference code literally would mean: the first time Plan 18-03's Mach-O check sets `mac_arch_verified: true`, that's fine — but the very NEXT `fetchMetadataIfNeeded` call (next app launch, resync, etc.) would silently overwrite the whole entry WITHOUT `mac_arch_verified`, dropping the flag back to `undefined`. On the call after that, the gate (`existingMeta?.mac_arch_verified === true`) would see `undefined`, not `true`, and re-derive `mac_arch` from the min-OS heuristic — regressing a confirmed `'32'` verdict back to `'unknown'`. This directly violates the plan's must-have: "never overwrites a `mac_arch_verified === true` entry."
- **Fix:** When `mac_arch_verified` is already `true`, the persistence write now explicitly includes `mac_arch_verified: true` and carries forward `existingMeta.mac_arch_source` (in addition to the already-correct `mac_arch: existingMeta.mac_arch`), so a Mach-O ground truth survives every subsequent metadata re-fetch, not just the one write that immediately follows it.
- **Files modified:** `src/backend/storeManagers/steam/games.ts` (`fetchMetadataIfNeeded`).
- **Verification:** New test "existing mac_arch_verified true is NEVER regressed by a re-fetch — mac_arch/mac_arch_source/mac_arch_verified preserved" asserts all three fields survive a re-fetch that would otherwise compute a different (incorrect) `mac_arch` from a real 32-bit title's min-OS string.
- **Commit:** `a9178c38`.

---

**Total deviations:** 2 (both Rule 1/Rule 2 auto-fixes, no user permission required, no architectural changes).
**Impact on plan:** Both fixes correct implicit bugs in the plan's own reference code/action text before they could ship — no scope creep, no new files, no deviation from the plan's file list or must-haves. The plan's stated behaviors and acceptance criteria are all met; these fixes are what made them actually pass rather than passing by accident.

## Known Stubs

None — this plan is backend-only (no UI stub surface); Plan 18-04 will build the badge.

## Threat Flags

None. All threat-model dispositions (T-18-02-01 through T-18-02-04, T-18-02-SC) match the implementation exactly:
- T-18-02-01 (HTML injection into the parser): mitigated — the parser only regex-scans, never `eval`s or renders the HTML to a DOM.
- T-18-02-02 (false-32-bit misroute): mitigated — `macArchFromMinOS`'s return type structurally excludes `'32'`.
- T-18-02-03 (ReDoS / DoS): mitigated — no new network call, linear regexes only, bounded by the existing `METADATA_FETCH_TIMEOUT_MS`.
- T-18-02-04 (verdict regression): mitigated, and reinforced by Deviation 2 above — the gate now survives multiple re-fetches, not just one.
- T-18-02-SC (package installs): N/A, no packages installed.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Next Phase Readiness

- Plan 18-03 (post-install Mach-O ground-truth check) can now call `steamMetadataStore.set(appId, { ..., mac_arch: '32'|'64', mac_arch_verified: true, mac_arch_source: 'macho' })` and `isBottleEligible()` will honor it immediately via the OR-branch wired in this plan — no further routing changes needed.
- Plan 18-04 (badge) can read `GameInfo.mac_arch` / `mac_arch_verified` directly; no additional backend plumbing required.
- `mac_arch_source: 'minos' | 'macho'` is the final enum shape — no further reconciliation needed.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/games.ts` — FOUND, contains `parseSteamMacMinOSVersion`, `macArchFromMinOS`, and the `isBottleEligible()` OR-branch.
- `src/backend/storeManagers/steam/electronStores.ts` — FOUND, `mac_arch_source?: 'minos' | 'macho'` confirmed via grep.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — FOUND, 118/118 tests passing in the full `steam/__tests__/games` suite.
- Commit `062a6c9f` — FOUND in git log.
- Commit `a9178c38` — FOUND in git log.
- Commit `e90e3e44` — FOUND in git log.
- `npx tsc --noEmit` — exits 0 (clean).
- `npx eslint` on all three touched files — 0 errors (189 pre-existing-pattern warnings, consistent with the rest of the file's `any`-typed axios response handling).

---
*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Completed: 2026-07-12*
