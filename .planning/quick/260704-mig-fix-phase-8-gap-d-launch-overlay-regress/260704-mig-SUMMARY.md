---
status: complete
quick_id: 260704-mig
slug: fix-phase-8-gap-d-launch-overlay-regress
description: Fix Phase 8 Gap D launch-overlay regression + greyscale placeholder icon
date: 2026-07-04
commits:
  - a2a7e032 fix(08): floor Steam launch-overlay visible time
  - 1d7426c1 feat(08): GameLib icon above text on artwork placeholders
---

# Summary: 260704-mig

## What changed

### 1. Steam launch-overlay minimum-visible floor (Gap D regression fix)
`src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`

The Steam branch dismissed the overlay on window `blur`, but `steam://rungameid`
hands focus to the Steam client within milliseconds — so `blur` fired almost
immediately and "Launched in Steam" was never visible (~0s). Introduced a
`STEAM_MIN_VISIBLE_MS` (1500ms) floor: an early blur is recorded but does not
dismiss; when the floor elapses the overlay dismisses if focus was already lost
(the common case), otherwise it waits for a later blur. The 8s safety-net ceiling
(`STEAM_SAFETY_MS`) is retained so the overlay can never hang.

Net effect: "Launched in Steam" is readable for ≥1.5s, then dismisses on focus
loss — no more 0s flash, no indefinite "Launching" state.

### 2. GameLib icon on artwork placeholders (test 1 enhancement)
`src/frontend/assets/gamelib_card.svg`, `src/frontend/assets/gamelib_card_missing.svg`

Both placeholder cards now show a downscaled (220px) copy of `gamelib-icon.png`,
embedded inline as a data URI, stacked above the "GameLib" wordmark + subtitle.
The missing ("Artwork unavailable") variant desaturates the icon via an SVG
`feColorMatrix saturate=0` filter with reduced opacity for the greyed look; the
default ("No artwork") variant uses the full-color icon. No component call sites
changed — the assets are still imported via `?url` in the same 7 places.

## Verification
- `pnpm tsc --noEmit` — exit 0
- `eslint` on the changed component — exit 0 (clean)
- SVG assets regenerated via script (icon downscaled with `sips`, base64-embedded);
  ~79 KB each, loaded once and browser-cached.

## Human re-test needed
These are runtime/visual behaviors — fold into the next Phase 8 re-UAT pass:
- **Gap D:** Launch an installed Steam game from Console → "Launched in Steam"
  now stays visible ~1.5s+ before dismissing (no 0s flash).
- **Test 1 enhancement:** A Steam game with unavailable art shows the greyed
  GameLib icon above the text in the Console grid; the default "No artwork"
  placeholder shows the full-color icon.

## Notes
- CONSOLE-02 (Steam update feedback on launch) remains deferred to backlog
  (post-v1.1) — not part of this fix.
