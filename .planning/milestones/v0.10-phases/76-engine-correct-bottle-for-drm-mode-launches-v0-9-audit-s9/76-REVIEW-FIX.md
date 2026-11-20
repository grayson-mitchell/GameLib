---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
fixed_at: 2026-11-17T00:00:00Z
review_path: .planning/phases/76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9/76-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 76: Code Review Fix Report

**Fixed at:** 2026-11-17
**Source review:** .planning/phases/76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9/76-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (WR-01..WR-03; the four Info findings are out of scope for `critical_warning`)
- Fixed: 3
- Skipped: 0

Verification: after each fix, `pnpm jest src/backend/engine/__tests__/engineSwitch.test.ts` passed,
and `npx prettier --check` passed on the changed files. After WR-03, `tsc --noEmit` reported no
errors in `engineSwitch.ts`, and `src/backend/engine` plus `bridgeBottleLifecycle.test.ts` passed
(671 tests).

## Fixed Issues

### WR-01: Read-only marker views do not apply the CR-01 distrust rule, so they disagree with the switch

**Files modified:** `src/backend/engine/engineSwitch.ts`, `src/backend/engine/__tests__/engineSwitch.test.ts`
**Commit:** 2bcb6ab6f
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Added `isContradictedCrossover` and a non-logging `viewMarker`. `trustedMarker` now
uses `isContradictedCrossover`. `readBottleEngineMarkerKind`, `readBottleEngineMarkerSummary` and
`restoreNeedsAbsentPin` now read through `viewMarker`. A crossover marker plus DXVK-macOS therefore
reads as the inferred current pin (`pinned:<ENGINE_PINS.current.id>` with an empty wineserver), the
same marker the switch infers. The views report `non-crossover`, `pinId` is the current pin, and
`pinWineserverBin` is null. `restoreNeedsAbsentPin` is true when that pin is absent, so the offline
refusal fires. The views still never write. New test: each view on a contradicted marker, with no
write and no warning logged.

### WR-02: `reconcileBottleEngineMarker` persists a guessed pin id and an empty wineserver, which turns off the pre-restore kill

**Files modified:** `src/backend/engine/engineSwitch.ts`, `src/backend/engine/__tests__/engineSwitch.test.ts`
**Commit:** 422a8f7e1
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Used the review's option 2. A new `pinnedWineserverFallback` runs in
`killPrevious`. When a pinned marker has an empty `wineserverBin`, it resolves the wineserver from
`pinById(prev.id) ?? ENGINE_PINS.current`, but only if that pin is installed. The containment check
still applies afterwards. This also covers inferred markers. Option 1 (skip the reconcile write
while the pin is absent) was rejected: it would leave the bottle marker-less, which is the CR-01
precondition the reconcile exists to remove. New test: reconcile while the pin is absent, install
the pin, add a Timestamp, then switch to crossover. The pin wineserver is killed. This test failed
before the fix.
**Residual:** a legacy marker-less bottle created with `ENGINE_PINS.previous` still gets the
current pin id when reconciled, because the bottle carries nothing to infer the previous pin from.
New bottles record the correct id at creation (76-04).

### WR-03: `recordPinnedBottleEngine`, `recordCrossoverBottleEngine` and `reconcileBottleEngineMarker` report success when the write failed

**Files modified:** `src/backend/engine/engineSwitch.ts`, `src/backend/engine/__tests__/engineSwitch.test.ts`
**Commit:** 44fe1062b
**Applied fix:** `writeMarker` now returns `boolean`: false for a newer-build marker or an I/O
failure, true after the rename. All three functions return `false`/`null` before their success log
when the write fails. Existing callers inside `prepareBottleForEngineBody` ignore the return value,
so their behaviour is unchanged. New tests: a read-only bottle dir makes each of the three functions
report failure without logging "recorded at creation" or "reconciled before".

---

_Fixed: 2026-11-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
