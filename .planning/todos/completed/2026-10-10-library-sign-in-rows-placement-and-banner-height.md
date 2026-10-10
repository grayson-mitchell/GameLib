---
created: 2026-10-09T21:30:00.000Z
title: 'Library sign-in rows should sit at the top of the Library and the banner could be half as tall (operator request)'
area: ui
severity: minor
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/screens/Library/index.tsx

completed: 2026-10-11
status: "RESOLVED 2026-10-11 in quick task 261011-hj6: the rows now mount once, after the chip row and above FocusRowStrip (the first shelf), in Library/index.tsx, locked by G4 and L1; each row block padding and its footer button block padding were halved (--space-sm to --space-2xs) and the button leaked Settings margin was zeroed, taking one row from about 78px (62px on a fresh launch) to about 41px; rows, copy, dismissal and librarySignInRows.ts are unchanged; top placement and the rendered height are for the operator eye at the next launch; commits d6355aa87 (placement) and 67684475b (density)"
---

# Operator notes from the Phase 49 live gate

Recorded during Run 1, launch 2 (`49-LIVE-GATE.md` § Run 1, operator UI notes). Two requests:

1. The sign-in rows render between the first shelf and the second (`item10-themes` screenshots
   show this). The operator wants them at the top of the Library, above the first shelf.
2. The banner's vertical padding is generous; the operator suggests roughly half the height.

Both are judgment changes, not defects; file them with the 49-09 row design when picking up.
