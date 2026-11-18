---
created: 2026-11-18T00:00:00.000Z
title: 'Adoption note: "Restart Steam now" button is cluttered and sits on its own line'
area: steam
severity: minor
platform: any
ready: human
files:
  - src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx
  - src/frontend/screens/Game/GamePage/components/AdoptionNote.scss
  - src/frontend/screens/Game/GamePage/index.tsx
---

## Problem

Phase 81 live gate, items 2 and 4 (`81-HUMAN-UAT.md`, launches L1 and L2, 2026-11-18).
Both items passed on behaviour, but the operator does not like the layout of the note
under the status line:

- item 2: the "Restart Steam now" button beside the note "Steam will restart once when
  you press Play." looks cluttered; the operator wants the note only;
- item 4: the button sits on its own line instead of on the same row as Play.

The button is D-02 (81-CONTEXT.md), placed by 81-08 in `AdoptionNote.tsx` and mounted at
`GamePage/index.tsx`.

## Direction

Needs a decision before code: drop the button and keep the note only (Play already
restarts Steam once, so the button is a convenience), or move the action onto Play's row
(for example as a secondary action or a menu item). Review D-02 with the operator. Note
the 1026 waiting edge (`steam-waiting-for-restart`) shows the same button and has a known
no-op gap recorded in the phase's `deferred-items.md`; decide both together. Check the
result in midnightMirage, gruvbox_dark and dracula (item 8's themes).

## Decision (2026-11-19, Phase 81 item 10, Windows)

The operator saw the same layout on Windows and decided the direction: "Restart Steam now" belongs
next to the Play button, not on its own line after the note. Keep the note text under the status
line. The 1026 waiting edge question above is still open.
