---
created: 2026-10-09T21:30:00.000Z
title: 'Library sign-in rows should sit at the top of the Library and the banner could be half as tall (operator request)'
area: ui
severity: minor
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/screens/Library/LibrarySignInNotice/index.scss
  - src/frontend/screens/Library/index.tsx
---

# Operator notes from the Phase 49 live gate

Recorded during Run 1, launch 2 (`49-LIVE-GATE.md` § Run 1, operator UI notes). Two requests:

1. The sign-in rows render between the first shelf and the second (`item10-themes` screenshots
   show this). The operator wants them at the top of the Library, above the first shelf.
2. The banner's vertical padding is generous; the operator suggests roughly half the height.

Both are judgment changes, not defects; file them with the 49-09 row design when picking up.
