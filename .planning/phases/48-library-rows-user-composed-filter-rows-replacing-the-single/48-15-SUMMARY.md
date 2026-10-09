---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 15
subsystem: ui
tags: [live-gate, uat, focus-row-strip, wkwebview, macos, gap-closure]
requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-13 strip card width pin (G-48-11b fix), 48-14 next-frame width sync (G-48-11a fix)
provides:
  - live verdicts for G-48-11a and G-48-11b on a build carrying both fixes, measured against a pre-fix arming control
  - live re-runs for items 4 (hover-overlap), 9, 11 and 12; item 7 reconciled from item 10
  - two new gaps, G-48-11c and G-48-12a
affects: [48-UAT.md, phase 48 re-verification]
key-files:
  created: []
  modified:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md
decisions:
  - "B1 arming basis: the pre-fix bundled binary (mtime 2026-10-08 12:00:53, earlier than fix(48-13)) run on the same fixture; FAIL 2 reproduced in this rig, so the pass on the fixed build is not a dead probe"
  - "B3 arming measured in-rig, not only cited: the same sweep on the pre-fix binary logged 34 ResizeObserver loop errors, the fixed build 0, 0 and the focusRow null control 0"
  - "B3/B1 numbers are capture px at scale 2; the track edge is derived from geometry (+/- 1 px) because the devtools console accepts no typed lines"
  - "Items 4, 7, 9 pass; items 11 and 12 stay issue; the plan's Task 2 human-verify checkpoint was driven entirely by the executor (only the controller clauses need a human, and none was available)"
metrics:
  duration: about 4h
  completed: 2026-10-09
  tasks: 3
  files: 1
status: complete
commits: 3
plan_head_before: 460df71e4ed531454e13de0e66faa0553250729c
plan_head_after: a919de86d581003976557be087744de2d135a6e4
actuals:
  tokens: 16663
  tasks: 3
  commits: 3
---

# Phase 48 Plan 15: Live gate for G-48-11a and G-48-11b Summary

**G-48-11a and G-48-11b are fixed live: on HEAD 460df71e4 the strip ends on card 13 with 15 pt clearance and a disabled forward chevron at 1280, 760 and 520, and the 1280-600-1280 / 800-400-800 sweep logs 0 `ResizeObserver loop` errors against 34 on the pre-fix binary. The same session found two new defects: an empty grid widens the strip card by 2 CSS px (G-48-11c), and a Tab-focused card shows no ring while the pointer rests over the listing (G-48-12a, the WR-02 prediction).**

## Build and rig

- HEAD `460df71e4ed531454e13de0e66faa0553250729c`, `pnpm tauri:dev:packaged`. The build exited 1 at the updater-artifact signing step (`TAURI_SIGNING_PRIVATE_KEY` unset) after the `.app` was written. Launched binary: `src-tauri/target/debug/bundle/macos/GameLib.app/Contents/MacOS/gamelib-shell`, mtime 2026-10-09 18:11:29, sha256 516fab20...; built CSS carries the 48-13 width pin.
- Fresh fake-HOME fixture per launch, 14 sideload games, grey-ladder 600x900 data-URI art, `focusRow` `{view, all}` in both nested places (control: `null`). Window by name `"GameLib"` (the Web Inspector window takes `window 1`).
- `screencapture -l<id>` read in sRGB by a compiled Swift reader, CGEvent pointer and keys with the frontmost pid asserted before every event, per-launch `gamelib.log` with CR converted. Every launch ended in an app-menu quit and an empty instance probe.
- Real profile: `shasum -a 256 -c` printed OK twice after Task 1, after Task 2 and again at the end of this plan.

## Bars and verdicts

| Bar | Result | Numbers |
| --- | ------ | ------- |
| B1 (G-48-11b) pre-fix control | FAIL 2 reproduced | click 2 cards 10-13 plus a 403 px empty slot, clicks 3 and 4 blank, forward glyph (140,255,255) never disabled |
| B1 fixed build, two launches | pass | k = 5; cards 5-9, then 9-13; card 13 clearance 14.5 pt and 15.0 pt (+/- 1 px); no empty slot; forward glyph (55,101,101) = disabled back reference; 3rd click crop hash unchanged; back returns to 0-4 disabled; 2 = ceil(9/5) clicks |
| B2 760 / 520 | pass | 760: k = 2, 6 clicks, 15.0 pt; 520: k = 1, 13 clicks, 15.0 pt; forward disabled, extra click hash unchanged, back to 0 |
| B3 (G-48-11a) | pass | 0 and 0 in two strip launches, 0 in the null control; pre-fix binary 34 in the same rig (item 11 live: 27 and 25) |
| B4 flicker | pass | strip card left 544 / right 897 px in all 10 captures (spread 0), equals the grid card (354 px); capture spacing was 233 ms, not 100 ms |
| B5 parity | pass | 354 vs 354 at 1280 (one launch 355-356 vs 354-355), 438 vs 438 at 760, 444 vs 444 at 520; left edges equal |
| B6 first paint | pass, with a qualifier | no frame near 156 pt; first Library frame 1.0-1.5 CSS px off settled (fade-in), identical to the grid; cadence 121 ms |
| B7 empty grid then list layout | MISS | empty grid: 358-359 px against 354-355 (+2 CSS px); list layout unchanged against that; list with results 354-355 |
| B8 end-card rings | pass | 6, 6, 5, 5 px (3.0 / 3.0 / 2.5 / 2.5 pt) on the four sides of card 0 and card 13; outer edge 11 px (5.5 pt) inside the track |
| B9 chevrons through a hovered edge card | pass | glyph count 122 vs 122 unhovered in all 6 approaches (was 122 vs 0); click moves exactly 5 cards every time |
| B10 controller | NOT RUN | no controller attached to the machine |
| B11 mouse and keyboard | hover pass, Tab FAIL | one ringed tile at a time; header and chip row 0 rings; Tab: 0 of 40 ringed with the pointer in the listing vs 40 of 40 with the pointer in the sidebar (WR-02 confirmed) |

## Gaps

- Resolved by measurement: G-48-4a and G-48-7 (item 10, 2026-10-08), G-48-4b, G-48-8b, G-48-8c, G-48-9, G-48-11a, G-48-11b.
- Filed: **G-48-11c** (minor, item 11, empty-grid strip card +2 CSS px) and **G-48-12a** (major, item 12, no Tab-focus ring while the pointer rests over the listing). Neither carries a diagnosis.
- Still failed: G-48-8a (the controller handoff clause was not runnable).
- UAT: 10 pass, 2 issue (items 11 and 12), frontmatter `status: partial`.

## Owed

The controller clauses (item 11's ring past the last visible card, item 12's handoff, G-48-8a), item 6's title-rect and 20-card clauses and item 5's 2-card clause on this build (the 14-card fixture and the console that takes no typed lines cannot read DOM rects), and `document.elementFromPoint` for item 9.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan verify defect] Item-count assertion** - The Task 1 and Task 3 `<verify>` blocks assert `parseUatItemsWithStats(...).items.length === 12`. That parser returns outstanding items plus gap entries, and read 14 at the plan's own base HEAD before any edit (5 outstanding items + 9 gaps); it reads 5 now (2 issue items + 3 failed gaps). The shortfall count is 0 throughout. I asserted that the count is consistent with the status words and gap statuses instead (`items 5 shortfall 0`, summary 12/10/2/0/0/0, gaps 11 with 8 resolved and 3 failed).
**2. [Rule 3 - Precondition wording]** `git log -40 | grep -c 'feat(48-1[34])'` prints 1 because the 48-13 fix commit is `fix(48-13)`; both fixes are ancestors of HEAD. Declared in the Protocol.
**3. [Rule 3 - Rig]** Window by name instead of `window 1`; Swift sRGB reader plus a node analyser instead of a single node reader; the launched binary is the bundled `.app` binary, not the sibling `src-tauri/target/debug/gamelib-shell`; the build script's updater-signing failure was ignored because the `.app` was already written. All declared in the 48-UAT.md Protocol.
**4. Rig slips, all declared in the evidence log:** three stray clicks on the sidebar `Recently played` row (wrong back-chevron x) reset in-app; an invalid first B3 launch (it resized the Web Inspector, not the main window) discarded; the page scroll offset persisted across launches (storage a fake HOME does not isolate) and spoiled one 520 launch and one first-paint loop, both discarded, then every launch ended scrolled to the top; a guessed toolbar icon opened the console UI once and the app returned to the Library with the list layout set, which was set back to grid and a cleared search before quit.

**Task 2 checkpoint.** The plan's `checkpoint:human-verify` was driven end to end by the executor with the operator's pointer and keyboard (operator confirmed present); no human approval signal was received, and only the controller clauses needed a human, so they are recorded NOT RUN.

## Known Stubs

None. No source file was created or changed by this plan.

## Threat Flags

None.

## Self-Check: PASSED

- 48-UAT.md edited and committed in three commits: 05bff1cb0, 8889a2f73, a919de86d.
- `pnpm planning-gates`: 12/12 passed. `npx prettier --file-info` on 48-UAT.md: `ignored: true`, so no `--check` was run (it would be vacuous).
- `shasum -a 256 -c real-profile.sha256`: OK twice.
