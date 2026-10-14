---
created: 2026-10-14T00:00:00.000Z
title: "Store-embed suppression sticks with no visible holder, hiding the Epic subview and blocking UAT Item 16's recovery half"
area: webview/store-embed
severity: major
platform: macos
ready: code
found_by: "Live gate of UAT Item 16, 2026-10-14 (Launch 5). Same defect that confounded UAT Item 3 on 2026-10-14 (Launch 3); this run reproduced it and narrowed it considerably."
files:
  - src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx
  - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  - src/frontend/state/TourContext.tsx
  - src/frontend/components/UI/Dropdown/index.tsx
  - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
---

## The symptom

The Epic embed slot shows `StoreEmbedPlaceholder`'s "Paused while a window is open" — D-19's
suppression filler — **while no window, dialog, dropdown or toast is open**. The subview is hidden
(`storeEmbedHide()`), so it cannot paint whatever else happens.

Observed on 2026-10-14 in Launch 5: present at app launch, **released on its own with no user
action**, then **returned** and persisted for at least 90s until the app was killed. During the
stuck period `count of windows` for the process was **1** (the main window) and nothing was visible
on screen to close — see `live-gate-261014-item16/item16-suppressed-recovery-blocked.png`.

## Why it matters beyond cosmetics

It **blocked a live-gate criterion**. UAT Item 16's recovery half (revert the hosts block, click
the banner's `Reload`, confirm the store repaints) could not be scored: the `Reload` click landed —
System Events resolved the click point to `button Reload of group 1 of group 3 of UI element 1 of
scroll area 1 ...` and the button took a visible focus ring — but the store could not repaint,
because a hidden subview does not paint. It also confounded UAT Item 3 (subview transparency) on an
earlier launch, for the same reason.

So this one defect has now cost two UAT arms across two separate gates.

## What is known, and what is NOT

**Suppression is a reference count** acquired through **two** hooks in
`StoreEmbedSuppressionContext.tsx`. Measured at HEAD:

| hook | production consumers |
| --- | --- |
| `useSuppressStoreEmbed()` — unconditional, on mount | `HumbleLogin`, `OAuthLogin`, `Dialog` |
| `useSuppressStoreEmbedWhile(active)` — conditional | `TourContext`, `Dropdown`, `HumbleExpiryToast` |

**UAT Item 3's original result listed only five of these six and omitted `HumbleExpiryToast`** —
corrected in that item on 2026-10-14.

**The holder is invisible.** That is the single most useful constraint this run added, and it cuts
against the `HumbleExpiryToast` candidate: the toast is a *visible* element when `visible` is true,
and nothing was visible. It is correspondingly kinder to the `TourContext` theory — this repo has a
known defect where an introjs tooltip renders nothing while still mounted
(`introjs-tooltip-renders-nothing-intermittently.md`), and an invisible-but-mounted tour step would
hold the refcount with no window for anyone to close. **Neither is confirmed.**

**It is intermittent and it self-releases**, which rules out a simple "acquired once, never
released" leak and points at a component whose `active` flag flaps, or at an acquire/release pair
that is unbalanced only on some paths.

## How to actually settle it rather than guess again

Do **not** spend another live launch on eyeball observation — two have been spent. The count is
ordinary React state and can be read directly:

- Add a temporary `console.debug` (or a dev-only readout) of the suppression count plus the
  acquiring component name in `StoreEmbedSuppressionContext`'s reducer, then drive the app until
  the placeholder appears and read who holds it. `suppressionCountReducer` is already exported and
  pure, so the instrumentation can be a one-line addition at its call site.
- Cheaper still for a first pass: the Web Inspector is reachable on the dev build (Cmd+Opt+I; note
  it opens **docked inside** the main window, which changes layout — undock or close it before
  measuring anything geometric).

**Instrument warning.** This app's AX tree is unreliable for this kind of work: `entire contents`
returned 53 elements on one call and zero on the next with the screen unchanged, and a probe that
silently returned empty produced a false "pass" during this very gate. Use `screencapture` with
frontmost asserted at capture time, and remember region captures are occludable — an occluding
window is not merely a bad screenshot, it is a condition under which the subview genuinely stops
painting (`an-occluded-wkwebview-does-not-render-and-the-epic-store-does-not-boot.md`).
