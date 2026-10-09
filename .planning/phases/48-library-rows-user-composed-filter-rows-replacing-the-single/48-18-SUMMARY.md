---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 18
subsystem: ui
tags: [live-gate, webkit, focus-row, strip-width, focus-ring, gap-closure, G-48-11c, G-48-12a, G-48-8a]
requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-16 keyboard-mode focus ring fix and 48-17 strip scrollbar-allowance hold, both desk-proven
provides:
  - live WebKit verdicts for G-48-11c and G-48-12a against pre-fix arming runs on the preserved 48-15 bundle
  - the one-ring invariant and the 48-16/48-17 regressions measured live
  - 48-UAT.md items 11 and 12 re-run, gaps reconciled, summary recounted
affects: [phase-48 re-verification]
actuals:
  tokens: 25000
  tasks: 3
  commits: 3
plan_head_before: 26f2fe9b0d691b308ba89132cff37c94cefcb025
plan_head_after: 1d182923444640daafa3f1494808a9cdd100f1a4
key-files:
  created: []
  modified:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md
key-decisions:
  - "G-48-11c and G-48-12a resolved by live measurement; G-48-8a stays failed (no controller)"
  - "L3's distinct-position sub-bar (at least 10 over 20 Tab presses) read 8, filed as G-48-12b rather than softened, with the sidebar control's identical 8 recorded so the operator can rule on the bar"
status: complete
---

# Phase 48 Plan 18: Live WebKit gate for gap closure round 4 Summary

Both round-4 fixes hold live in WebKit: the strip card stayed at W0 355 px through every empty-grid and layout transition on two launches (the pre-fix binary read +4 capture px), and a Tab-focused card rings in 40 of 40 captures with the pointer resting in the listing or over the heading (the pre-fix binary read 0 of 40). One bar missed as written: L3's count of at least 10 distinct ringed positions over 20 Tab presses read 8, and the sidebar control reads the same 8.

No source file was changed. `48-UAT.md` is the only tracked file this plan wrote.

## Build and arming basis

- **Build:** `pnpm tauri:dev:packaged` at HEAD `26f2fe9b0d691b308ba89132cff37c94cefcb025`, carrying `fix(48-16)` (0c3d2ad23, a0a3211f1) and `fix(48-17)` (d77571f9c). Exit 1 at updater signing after the `.app` was written, as in 48-15. Binary mtime 2026-10-09 20:46:48 local, sha256 `63f6a983614655c286d5f329879b40b33b43a064a0f954fab5be701fd00194cf`.
- **Arming binary:** the existing bundled binary read `516fab2086cb...` (48-15's build, neither fix), so the whole `GameLib.app` was copied to `prefix.app` before the build. L1 and L2 each ran on it in this session.
- **Rig:** the 48-15 recipe unchanged. Fresh fake-HOME fixture per launch (14 sideload games), window by name, `screencapture -l` read in sRGB, CGEvent input with the frontmost pid asserted before every input, P1 per launch (launched pid = window owner pid = frontmost pid), app-menu quit and an empty anchored probe after every launch. Helpers were copied from `gate-48-15`; no fixtures or real-profile files were.
- **Controller:** none connected (operator confirmed; `ioreg` shows no gamepad). All B10 clauses are owed.

## Bar verdicts

| Bar | Clause | Fixed build | Arming (pre-fix) | Verdict |
|-----|--------|-------------|------------------|---------|
| L1 | G-48-11c empty grid, 2 launches | W0 355 px; 10-capture loop 355 in all 10; list layout empty 355; cleared in list 355; back to grid 355; search `07` 355; difference 0 vs bar 2; main scrollbar absent in all empty captures | 358 vs W0 354 in all 11 empty captures (+4 capture px) | pass |
| L2 | G-48-12a listing, pointer in gap | 40 of 40 captures with exactly one ringed tile, 0 with two or more, 16 distinct positions | 0 of 40 | pass |
| L2 | header variant (pointer over heading) | 40 of 40, 16 positions | (48-15: ring only after page scrolled) | pass |
| L2 | sidebar control | 40 of 40, 16 positions | | control |
| L3 | pointer on card A then 20 Tabs | exactly one tile in 21 of 21; A ringed in 3 of 20; 8 distinct positions | | one-ring met; positions bar (at least 10) MISS |
| L4 | keyboard then mouse (cards C, D, upper-row) | exactly one tile each, the one under the pointer | | pass |
| L5 | Tab scrolls page under resting pointer | scrolled at Tab 2 (28 px), 16 (395 px), 32; exactly one tile in every capture from Tab 2 to 40 (39 of 39); no 80-press extension needed | | pass |
| L6 | hover rings | strip and grid card one tile each, bands 5-6 capture px on all four sides; heading and chip row (search chip showing) 0 tiles | | pass |
| L7 | B5 parity 1280 and 760 | 1280 first card 355 vs 354 px, left 544 and 544; 760 438 vs 438, left equal | | pass |
| L7 | B1 end of travel at 1280 | cards 9-13, clearance 14.5 pt, no empty slot, forward disabled, extra click crop hash unchanged (f7e059eac9), back to 0-4 | | pass |
| L7 | B3 resize sweep | 0 `ResizeObserver loop` errors; sampler 721 samples, 34 distinct sizes | 34 in 48-15 on the same binary | pass |
| B10 | controller clauses | not run | | owed |

## Gaps

- **Resolved:** G-48-11c (L1, both launches) and G-48-12a (L2 listing and header).
- **Filed:** G-48-12b (minor): L3's bar of at least 10 distinct ringed positions over 20 presses read 8. The sidebar control reads the same 8 over its first 20 captures because focus takes three Tab presses per card, so the bar looks unreachable. It was filed rather than waved through, as the plan directs; the operator should rule on it (extend L3 to 40 presses, where 16 was measured in L2, or drop the count and keep the one-ring clauses, which held in 21 of 21 captures).
- **Still failed:** G-48-8a (no controller) and G-48-12b.

## Results

- Item 11: `blocked`. Every measured clause met its bar. Owed by name: the controller-focus ring clause, item 6's title-rect and 20-card clauses, item 5's 2-card clause, and first paint on this build (measured in 48-15, not repeated after 48-16 and 48-17).
- Item 12: `issue`, on L3's distinct-position bar only. The keyboard clause, one-ring invariant and hover rings all passed. Owed: the mouse/controller handoff (G-48-8a) and the keyboard-to-controller ring check.
- `48-UAT.md` summary: 12 total, 10 passed, 1 issue, 1 blocked. Frontmatter `status: partial`.

## Observation (not a bar miss)

At 1280 the strip's cards 1-4 are 1-2 capture px wider than the grid's, and card 4's left edge sits 3 capture px right of the grid's (pitch 403 against 402.5). The first-card bar (width within 2, left edges within 2) is met; 48-15's launch 1 read the same direction (355-356 against 354-355). It is recorded in item 11's result, not filed.

## Deviations from Plan

None in method. Declared rig details: the search box and list-layout icon screen points were read from a 48-15 capture and confirmed in each launch's captures; in list layout the `Installed` badge hides the left of card 0 at the y = 420 row, so the y = 700 row is used there; sidecar pids were not recorded. Hover rings were measured at two scroll positions because the grid card's bottom edge is below the window at scroll top.

## Evidence

`gate_dir_48_18` (session scratchpad, untracked) holds `prefix.app`, helpers, per-launch fixtures, captures and `real-profile.sha256`. Evidence entries `**48-18 L1 ...**` through `**48-18 real-profile check (Task 2 close)**` are in `48-UAT.md`'s evidence log. The operator's real `config.json` and `store/config.json` read `OK` against their pre-gate sha256 (3140261a..., 54a3460e...) at the end of every task.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 8e7fdbf13 | docs(48-18): live gate rig proven; L1 and L2 measured against pre-fix arming |
| 2 | e4dc6b312 | docs(48-18): live measurements L3-L7 and B10 |
| 3 | 1d1829234 | docs(48-18): live verdicts for items 11 and 12; gaps reconciled |

## Known Stubs

None.

## Self-Check: PASSED

- `48-UAT.md` parses with 0 shortfall and 0 unparsed headings; `pnpm planning-gates` 12/12 passed.
- Commits 8e7fdbf13, e4dc6b312 and 1d1829234 exist on `quick-261002-b63`.
- Real-profile check `OK` for both files; no GameLib instance running.
