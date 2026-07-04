---
quick_id: 260704-mig
slug: fix-phase-8-gap-d-launch-overlay-regress
description: Fix Phase 8 Gap D launch-overlay regression + greyscale placeholder icon
date: 2026-07-04
source: .planning/phases/08-new-steam-surfaces/08-HUMAN-UAT.md (re-UAT test 4 issue + test 1 enhancement)
---

# Quick Task 260704-mig: Fix Phase 8 Gap D launch-overlay regression + greyscale placeholder icon

## Problem

From the Phase 8 gap-closure re-UAT (`08-HUMAN-UAT.md`):

1. **Gap D regression (major).** The Console launch overlay's Steam branch dismisses
   on window `blur`. But `steam://rungameid` hands focus to the Steam client within
   milliseconds, so `blur` fires almost immediately and the overlay dismisses at
   ~0s — the user never sees "Launched in Steam" at all. This is worse than the
   original fixed 1.5s timer.

2. **Placeholder enhancement (cosmetic).** The greyed "Artwork unavailable"
   placeholder shows only text. The user wants the GameLib icon displayed above
   the text, rendered in greyscale.

## Tasks

### Task 1 — Minimum-visible floor for the Steam launch overlay
- **File:** `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`
- **Action:** Gate the blur-driven dismiss behind a minimum-visible floor
  (`STEAM_MIN_VISIBLE_MS = 1500`). An early blur (before the floor) is recorded
  but does not dismiss; when the floor timer elapses it dismisses if focus was
  already lost, otherwise it waits for a later blur. Retain the 8s safety-net
  ceiling (`STEAM_SAFETY_MS`).
- **Verify:** "Launched in Steam" stays visible ≥1.5s before dismissing; still
  auto-dismisses; no indefinite hang.
- **Done:** Steam overlay no longer flashes at ~0s.

### Task 2 — GameLib icon above text on placeholders (greyscale on the missing variant)
- **Files:** `src/frontend/assets/gamelib_card.svg`,
  `src/frontend/assets/gamelib_card_missing.svg`
- **Action:** Embed a downscaled (220px) copy of `gamelib-icon.png` as an inline
  data URI stacked above the "GameLib" wordmark + subtitle. The default
  ("No artwork") variant uses the full-color icon; the missing
  ("Artwork unavailable") variant desaturates it via an SVG `feColorMatrix`
  filter and reduced opacity for the greyed look.
- **Verify:** Both placeholders render icon-over-text; the missing variant is
  visibly greyscale and distinct from the default.
- **Done:** Greyed placeholder shows the GameLib icon above the text in greyscale.

## Out of scope
- CONSOLE-02 (Steam update feedback) — deferred to backlog (post-v1.1), not a
  Phase 8 gap.
