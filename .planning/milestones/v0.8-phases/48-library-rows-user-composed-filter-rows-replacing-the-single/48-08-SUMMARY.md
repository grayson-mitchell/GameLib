---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 08
subsystem: testing
tags: [live-gate, uat, focus-row, contrast, wkwebview, tauri-dev-shell, gap-closure]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: "48-07 first-launch focusRow hydration; the FocusRowStrip, chevron controls and FOCUS ROW panel section (48-02 to 48-06)"
provides:
  - "48-UAT.md: the 7 owed human_verification items scored with measured numbers (4 pass, 2 issue, 1 blocked)"
  - "R7 proven live on the real profile, legs A to D, including a capture-loop reading of first paint"
  - "Three filed gaps: chevron contrast, hovered card over the control, divider contrast in two themes"
affects: [phase 48 re-verification, a follow-up gap-closure plan for the chevron and divider colours]

plan_head_before: 92c572a1da94148d9cd06a6c6849a9a3f779e381
plan_head_after: b74adebb18973dc5cbd0078114c900b5d25310dc

actuals:
  tokens: 21000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Live gate on a real profile: P2 backup once, P3 scripted key edits only, P4 whole-file restore after every session, shasum-verified"
    - "Pixel contrast on a P3 display: convert every screencapture to sRGB (sips -m) before any luminance"

key-files:
  created: []
  modified:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md

key-decisions:
  - "Item 2 ran on the dev shell, not a release build (operator ruling 2026-10-07)"
  - "Item 5 controller clause scored blocked, not pass: no controller connected, and the keyboard proxy cannot stand in for D-06"
  - "Hovered-card occlusion of the chevron filed as its own gap, separate from the contrast gap"

requirements-completed: [R1, R2, R3, R6, R7]

duration: 2h 11m
completed: 2026-10-07
status: complete
---

# Phase 48 Plan 08: Live gates for the focus-row strip, controls and FOCUS ROW panel Summary

**Seven live items measured against the real profile on the dev shell: R7 migration, R1 persistence, the Settings removals and narrow-width title clipping pass; chevron contrast (12 of 40 combinations at 3:1) and two themes' divider labels fail, and a hovered card paints over its chevron.**

## Per-item verdicts

| Item | Verdict | Key measurement |
|------|---------|-----------------|
| 1. Settings -> General after the 48-06 deletions | pass | neither label in the DOM; seam gap 0.00 px vs modal gap 0.00 px (bar 2 px) |
| 2. R1 persistence round trip | pass | collection pick, relaunch (108 frames), clear, relaunch (98 frames); `focusRow` null on disk; dev shell by ruling |
| 3. R7 legs A to D | pass | A strip + `recentlyPlayed` written, B favourites, C `null`, D stays cleared in 98 frames; first Library frame already carries the header in both A launches |
| 4. Chevron contrast, all themes | issue | 12 of 40 combinations at 3:1, only midnightMirage passes all four, minimum 1.005 (gruvbox_dark); hovered card hides the control (122 to 0 of 640 pixels) |
| 5. Controls, end of travel, controller focus | blocked | no controller; the other three clauses measured pass (page delta 900, forward disabled at 3576 = 3576, boundary -2 enabled / -1 disabled, neither control for 2 and 1 cards) |
| 6. Narrowest width, longest title | pass | 0 of 20 titles outside their card at 1280, 520 and 87 px; longest title clips (`text-overflow: clip`, no line-clamp) |
| 7. FOCUS ROW panel | issue | collapsed by default; order, ellipsis and `title` correct; divider contrast fails in dracula (4.25) and nord-light (1.52), 8 of 10 pass |

Enumerated theme count for items 4 and 7: **10** (same as 48-04).

## Task commits

1. **Task 1: author 48-UAT.md and prove the rig on R7 leg A** - `767986e1a` (docs)
2. **Task 2 (first part): R7 legs B and C live** - `2e781ca85` (docs)
3. **Task 2 (remainder): leg D and items 1-7 scored, 3 gaps filed** - `b74adebb1` (docs)

The Task 2 `checkpoint:human-verify` is resolved by the operator's three answers (dev shell for item 2, no controller, operator actions replaced by console-driven clicks). It was not re-raised.

## Gaps filed (in 48-UAT.md `## Gaps`)

1. **Chevron contrast, major.** `.focusRowStrip__control` is `color: var(--accent)` over a 55% `--body-background` scrim; over bright art it sits at 1.0 to 3.8 in nine of ten themes.
2. **Hovered card over the control, major.** `.gameCard:hover` is scaled about 1.05 with `z-index: 2`; the control is `z-index: 1`. Whether the control remains clickable under that state was not probed.
3. **Divider contrast, minor.** `.FilterFocusRow__divider` uses `--text-secondary` at `--text-xs`; dracula and nord-light fall under 4.5:1.

## Deviations from Plan

### Declared protocol deviations (recorded in `## Protocol` of 48-UAT.md)

- Anchored instance probe `gate-procs.sh` instead of the plan's looser `pgrep -fl` (Task 1, carried).
- Item 2 on the dev shell (operator ruling). Item 5 controller clause blocked, with a labelled keyboard proxy.
- Operator clicks replaced by `element.click()` from the devtools console, except item 4's hover (a real `CGEvent` pointer) and item 7's long collection (real clicks and keystrokes in Manage Categories).
- All pixel math on sRGB-converted captures: the raw Display P3 captures disagreed with the computed glyph colour by 29/255 in red.
- Quit via the app-menu item after devtools console focus, because Cmd-Q via `osascript` did not quit the shell then.

### Auto-fixed Issues

None. Source was not touched (the plan forbids it). Two probe runs and one capture set were discarded and rerun, each recorded in the evidence log: a typed `==` that lost a character and measured the wrong control; a title measurement taken mid-transition; a clipboard read that returned a stale marker.

**Total deviations:** 0 auto-fixed. **Impact:** none on source; the evidence log records every discarded run so no number depends on one.

## Known Stubs

None. This plan created no source.

## Open observations (not scored as issues)

- **Keyboard focus past the last visible card.** With no controller attached, scripted `.focus()` onto the last rendered card (index 5, partly clipped) left it 74 px outside the track over 16 repeats; the D-06 scroll handler is mounted only when `activeController` is set, and cards beyond the visible edge are empty shells until scrolled in (not focusable). Real `Tab` navigation was not driven. A follow-up should decide whether a keyboard user can reach, or keep clipped, a card at the strip's edge.
- **Item 5 wording.** The item says the back control "mounts once scrolled"; the shipped behaviour (and UI-SPEC E6) is that it mounts with the forward control and is `disabled` at the start. Measured as the latter.
- **At 87 px the strip track is 0 px wide.** The narrowest-width title check passes there only vacuously; 520 px (track 222 px) is the narrowest width with a visible strip.
- **Leg A first paint.** A capture loop from window creation (about 7 frames per second) shows the header on the first painted Library frame in both launches; a sub-140 ms gap cannot be excluded.

## Self-Check: PASSED

- 48-UAT.md exists; parser check from the plan: 0 pending, 7 results, shortfall 0, 7 `P-RESTORE` entries, status `partial`.
- Commits `767986e1a`, `2e781ca85`, `b74adebb1` present in `git log`.
- `shasum -a 256 -c profile-backup.sha256` prints OK for both files; `gate-procs.sh` prints nothing; `pnpm planning-gates` 12/12.
- `npx prettier --file-info` reports 48-UAT.md ignored (`.planning` is prettier-ignored), so no formatter check was run on it.
