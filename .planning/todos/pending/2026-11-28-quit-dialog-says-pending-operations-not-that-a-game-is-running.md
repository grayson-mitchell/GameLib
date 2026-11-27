---
created: 2026-11-28T05:25:00.000Z
title: "The quit dialog says \"pending operations\" instead of saying a game is running and Yes closes it"
area: ui
files:
  - src/backend/quitHandler.ts
  - public/locales/en/translation.json
severity: minor
platform: any
ready: code
found_by: "Live check of 88-HUMAN-UAT item 2 on the dev build, 2026-11-28; operator: \"not great in terms of plain language\""
---

## Problem

Quitting GameLib while a game runs shows the generic text from `src/backend/quitHandler.ts`, key `box.quit.message`:

    There are pending operations, are you sure?

with the title "Exit". Choosing Yes ends the running game: its whole process tree is killed. The text says neither
of those things. "Pending operations" reads like a download or an install, and "are you sure" does not say what
happens.

The same dialog already has a plain, specific message for one case, `box.quit.bridgeHosting` ("A game is running
through the Steam bridge. Quitting GameLib ends any multiplayer session it is hosting. Quit anyway?").

## Idea

Choose the message from the state the handler already reads (`isGameRunning`, `isRunning`, `isLocked`,
`isBridgeHosting`):

- A game is running: say so and name it when there is exactly one, e.g. "SOMA is running. Quitting GameLib closes
  it. Quit anyway?"
- A download or install is running (`isLocked`): "A download is in progress. Quitting GameLib stops it. Quit anyway?"
- Both: name both.

Keep `cancelId: 0`, so a dismissal or a transport failure still means No. Buttons could say "Quit" and "Keep
playing" (or "Cancel") instead of Yes and No.

## Constraints to keep

- New strings go through `deps.t` with English defaults, and the i18n gates must stay green.
- Choosing No must stay the fail-safe (see the cancelId comment block in `quitHandler.ts`).
