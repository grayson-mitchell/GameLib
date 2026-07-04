---
status: complete
quick_id: 260704-mig
slug: fix-phase-8-gap-d-launch-overlay-regress
description: Fix Phase 8 Gap D launch-overlay regression + greyscale placeholder icon
date: 2026-07-04
commits:
  - a2a7e032 fix(08): floor Steam launch-overlay visible time (superseded)
  - 1d7426c1 feat(08): GameLib icon above text on artwork placeholders
  - 8f0862f5 fix(08): keep Steam launch overlay up until the game takes focus (corrects a2a7e032)
---

# Summary: 260704-mig

## What changed

### 1. Steam launch-overlay minimum-visible floor (Gap D regression fix)
`src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`

The Steam branch dismissed the overlay on window `blur`. Two iterations:

- **a2a7e032 (superseded):** added a "minimum-visible floor" that *remembered*
  the early blur and dismissed at the 1.5s mark. This was wrong — re-UAT (test 7)
  showed the message still didn't appear.
- **8f0862f5 (final):** the early blur is the *spurious* one that
  `shell.openExternal('steam://')` fires when spinning up the protocol handler;
  GameLib actually keeps focus for several seconds until the game itself
  foregrounds. Now any blur during a startup window
  (`STEAM_STARTUP_IGNORE_BLUR_MS = 1500`) is **ignored**, and only a blur *after*
  it (the game genuinely taking focus) dismisses the overlay. The 8s safety
  ceiling (`STEAM_SAFETY_MS`) is retained.

Net effect: "Launched in Steam" + spinner show immediately and stay visible for
the whole several-second launch, disappearing exactly when the game appears.

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
