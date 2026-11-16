---
created: 2026-11-05T12:00:00.000Z
title: "Humble expiry toast overlaps the Steam notice stack at bottom-right"
area: ui-notices
files:
  - src/frontend/components/UI/HumbleExpiryToast/index.scss (.humbleExpiryToast position)
  - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss (.steamEngineLaunchNoticeRegion)
  - src/frontend/App.tsx (both mounted as siblings, lines 143-144)
severity: minor
platform: any
ready: live-gate
---

## Problem

`HumbleExpiryToast` positions itself independently: `position: fixed; bottom:
var(--space-lg); right: var(--space-lg); z-index: 20`. That is the same anchor
and layer as `.steamEngineLaunchNoticeRegion`, the shared bottom-right stack that
sketch 006 established (quick 261104-vvz, extended in 261105-ast). Both are
mounted app-wide as siblings in `App.tsx`, so a Humble session expiry that
coincides with a Steam engine or overlay notice draws one toast on top of the
other. Neither reflows around the other.

Found during the 2026-11-05 sketch frontier review. Overlap was inferred from the
CSS and the mount sites; it has not been reproduced live.

## Solution

Render the Humble toast as a slot in the same stack region, so it inherits the
collapse-and-glide reflow, rather than giving it its own fixed position. Optionally
align its surface with sketch 006 variant A: 10px radius (it uses
`--space-2xs` today), two-layer shadow, slide right / fade-only under reduced
motion. See `sketch-findings-gamelib` → `references/notices-and-toasts.md`
("Do not position each notice independently").

Live gate: trigger a Humble expiry and a Steam launch notice together; confirm
they stack without overlap and the survivor glides into place on dismiss.

## How to run the live gate fast

1. `pnpm tauri:dev` (not `tauri:dev:run`). The hook exists only in dev builds; a packaged or production build does not have it.
2. Open DevTools on the main window and run `__gamelibNotices.both()`.
3. Click back into the GameLib window. The Steam notice's 8s countdown is frozen while DevTools has focus.
4. Confirm the two toasts stack in the bottom-right without overlapping, Steam above Humble.
5. Dismiss the Steam toast with its X and watch the Humble toast glide into place. Run `__gamelibNotices.clear()`, then `both()` again, and this time dismiss Humble first.
6. Turn on macOS System Settings -> Accessibility -> Display -> Reduce motion and repeat. Toasts should only fade, and slots should close without sliding.
7. Finish with `__gamelibNotices.clear()`. Reload the window to reset fully: clear() leaves an on-screen Steam notice to leave on its own, and preview seqs can make the mounted Steam notice ignore a real notice until reload.

The jsdom half (DOM order, single region, lifecycle in both dismissal orders) is covered by `NoticeStack/__tests__/NoticeStackTwoToast.test.tsx`, and only the visual checks above remain.
