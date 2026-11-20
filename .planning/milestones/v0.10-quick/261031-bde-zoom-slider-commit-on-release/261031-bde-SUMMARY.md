---
quick_id: 261031-bde
status: complete
commit: 703d979f4
---

# Quick 261031-bde: Zoom slider commits on release

**Problem:** dragging Settings → Accessibility → Zoom re-zoomed the window on every drag tick
(React `onChange` = DOM `input`), reflowing the page under the pointer.

**Fix** (`src/frontend/screens/Accessibility/index.tsx`): the input is driven by a local
`zoomDraft` (re-synced from `zoomPercent` for external changes such as zoom shortcuts). React
`onChange` moves only the draft and the "Zoom (N%)" label. `setZoomPercent` runs from a native
`change` listener attached via ref, which fires on pointer release and per keyboard step.

**Verified:** `npx prettier --check` on the file, `tsc --noEmit` clean for the file, Accessibility
jest suite 3/3 (it covers fonts only; no zoom test exists). **Not live-checked in the app.**
