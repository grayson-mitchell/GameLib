---
quick_id: 261031-bde
slug: zoom-slider-commit-on-release
mode: quick
files_modified:
  - src/frontend/screens/Accessibility/index.tsx
---

# Quick 261031-bde: Zoom slider commits on release

Settings → Accessibility → Zoom re-zooms the whole window on every `input` event while the
thumb is dragged. The page reflows under the pointer mid-drag. Zoom should apply once, when
the mouse is released.

## Task 1: Draft value while dragging, commit on native `change`

<files>src/frontend/screens/Accessibility/index.tsx</files>

<action>
- Hold a local `zoomDraft` state seeded from `zoomPercent`; re-sync it when `zoomPercent`
  changes from elsewhere (keyboard zoom shortcuts, boot restore).
- React's `onChange` on a range input is the DOM `input` event (fires continuously). Use it
  to update only `zoomDraft`, so the label shows the value being dragged to.
- Commit with `setZoomPercent` from the DOM `change` event, attached via a ref. On a range
  input `change` fires once on pointer release (and per step for keyboard arrows), which is
  exactly the commit point.
</action>

<verify>
- `npx tsc --noEmit -p .` reports no new errors in the file
- `npx prettier --check src/frontend/screens/Accessibility/index.tsx`
</verify>

<done>
Dragging the zoom thumb updates the "Zoom (N%)" label live but the window zoom only changes on
release; arrow keys still change zoom per step.
</done>
