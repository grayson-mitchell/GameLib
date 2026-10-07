---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
  - src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts
  - src/frontend/screens/Login/__tests__/overlayDismiss.test.ts
  - src/frontend/screens/Login/components/HumbleLogin/index.tsx
  - src/frontend/screens/Login/components/OAuthLogin/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/themes.scss
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 48: Code Review Report (second incremental review, c255b3a6e..HEAD)

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Two groups were reviewed.

- **Group 1, Phase 48 gap closure (plans 48-09 to 48-12):** FocusRowStrip, GameCard, NavShell/FilterFocusRow, themes.scss.
- **Group 2, quick task 261008-aoe (not a Phase 48 plan):** the Login and WebView files. These cover the Retry remount through `overlayMountKey`, the OAuthLogin dismiss now bound to its mount key, and `TauriLoginPanel` handing Retry to the host.

I found no blockers. The quick-task seam is sound.

- `onRetry` is called with zero arguments.
- `retryLoginOverlay` reads `openOverlay`, not `mountedOverlay`.
- The old overlay's late `dismiss` is neutralised by the key binder.
- The Humble stop/start ordering is safe. `stopLogin()` runs synchronously inside the `humbleStopLogin` handler, and the old surface's cleanup runs before the new surface's mount effect.

The strip-width arithmetic is correct. I checked these points:

- The strip content-box derivation matches the grid's content box: track width minus 30 equals listing width minus 32.
- The 15px bleed against the 16px gutter lines up.
- The `gridColumnCount` and `gridColumnWidth` edge cases are covered.
- The flip-hold logic matches its tests.

Two real issues remain, both in Group 1. The ResizeObserver callback writes a style that resizes the element it observes. Separately, the stale-focus ring suppression was widened to the whole `.listing`. Three info items follow.

## Warnings

### WR-01: [Group 1, 48-12] ResizeObserver callback resizes its own observed target, so every width-changing resize frame raises a "ResizeObserver loop" error

**File:** `src/frontend/screens/Library/components/FocusRowStrip/index.tsx:123-127` (with `focusRowOverflow.ts:215-288`)

**Issue:**
- The observer watches `track` and `track.firstElementChild`.
- Its callback calls `syncCardWidth(track)`, which writes `--focus-row-card-width`.
- Card height follows card width through `aspect-ratio`, so a write that changes the width also changes the height of the list and of `.focusRowTrack` itself. The track is `overflow-x: auto` with auto height.
- The track sits at the shallowest depth the observer has just delivered, so its new size is not deliverable in the same frame. The browser dispatches `ResizeObserver loop completed with undelivered notifications` as a window `ErrorEvent` and picks the change up next frame.
- The guard added in 48-12 (epsilon plus flip-hold) only stops sustained oscillation. It does not stop the single error that follows each real width change.
- During a window drag across the strip, every frame that moves the derived width by 0.5px or more can fire this error.
- `src/frontend/index.tsx:51` forwards every `ErrorEvent` to `window.api.logError(ev.error)`. For this event `ev.error` is `null`, so each occurrence sends a null-payload error log over IPC to the sidecar.
- I derived this from the ResizeObserver delivery algorithm and the CSS. I did not run it live.

**Fix:** Do not mutate layout synchronously inside the callback of the observer that watches the mutated subtree. Defer the write to the next frame and keep the layout-effect write for the first paint:
```ts
observer = new ResizeObserver(() => {
  readMeasurement()
  if (rafId !== undefined) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = undefined
    syncCardWidth(track)
    readMeasurement()
  })
})
// cleanup: if (rafId !== undefined) cancelAnimationFrame(rafId)
```
The 250ms flip window still works, because `now()` is called at write time. Alternatively observe only an element whose box does not depend on card height, such as `.focusRowStrip` width.

### WR-02: [Group 1, 48-09] Stale-focus ring suppression now keys off `.listing:hover`, hiding keyboard focus whenever the pointer rests anywhere in the library

**File:** `src/frontend/screens/Library/components/GameCard/index.css:120-124`, `336-338`, `525-535`

**Issue:**
- G-48-8b re-scoped the suppression from `.gameList:hover` to `.listing:hover`.
- It applies under `body:not(.controllerLayout)`, which is also the mode a keyboard-only user is in. It removes the outline, ring shadow and scale from any `:focus-within:not(:hover)` card.
- `.listing` is the whole library column. It includes the header, the filter-chip row and the strip's header, not just the card grids.
- A keyboard user who Tabs through cards while the mouse sits over the library, which is the normal resting state after a click, gets no visible focus indicator. This fails WCAG 2.4.7 / 2.4.11.
- The pre-diff scope had the same flaw but required the pointer to be over a grid. The diff widens it to the whole listing.

**Fix:** Confine the suppression to real mouse activity rather than a resting pointer. The `gamepad.ts` handoff already tracks input mode, so a body class such as `body.pointerActive` (set on `mousemove`, cleared on `keydown`) would work. Or scope the rule to `:focus-within:not(:focus-visible)`. A pointer-initiated focus (a click) does not match `:focus-visible`, so the stale-click ring is still cleared. Keyboard focus keeps its ring:
```css
body:not(.controllerLayout) .listing:hover .gameCard:focus-within:not(:hover):not(:has(:focus-visible)) { ... }
```
Update `gameCardFocusRing.test.ts` to match.

## Info

### IN-01: [Group 1, 48-12] `pageScrollDelta` tolerance and its sweep test model a geometry the DOM no longer has

**File:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts:66-87`; `__tests__/focusRowOverflow.test.ts` (test P1)

**Issue:**
- The JSDoc and test P1 assume the track is exactly `n x pitch` wide ("zero slack"), and P1 feeds `clientWidth = round(C + 24)`.
- After 48-11/48-12 the track's `clientWidth` is `C + 30`, because the viewport bleeds 15px each side. That is `n x pitch + 6`, so a bare `floor` already returns `n`.
- The `+ SUBPIXEL_EPSILON` tolerance is harmless, but P1 never exercises the real geometry, and the "paged one card short at about half of all widths" rationale is stale.

**Fix:** Feed P1 `clientWidth = Math.round(c + 30)` and `Math.floor(c + 30)`, and correct the JSDoc to describe the 6px of slack. Keep the tolerance as a defence.

### IN-02: [Group 2, 261008-aoe] Retry is a silent no-op while a dismissed overlay plays its 500ms exit

**File:** `src/frontend/screens/Login/index.tsx:273-277`

**Issue:**
- `retryLoginOverlay` returns early when `openOverlay === null`. This is deliberate and documented.
- The Dialog and its Retry button stay mounted and clickable for `LOGIN_DIALOG_EXIT_MS`, so a click in that window does nothing. Before this task it reloaded the app.
- The window is narrow and the click is unlikely, so this is cosmetic.

**Fix:** Optionally disable or hide Retry once dismissed. Alternatively accept it and note it in the comment, which already explains the guard.

### IN-03: [Group 2, 261008-aoe] New `TauriLoginPanel` tests replace `window.location` and never restore it

**File:** `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx:446-455` (`stubReload`)

**Issue:**
- `Object.defineProperty(window, 'location', ...)` is called per test with no restore. This mirrors the pre-existing reload test, but the new describe adds six more stubs.
- Any later test in the file that reads `window.location` sees the last stub.
- It is harmless today, because nothing after it reads `window.location`.

**Fix:** Capture the original descriptor and restore it in `afterEach`.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
