---
created: 2026-11-27T16:30:00.000Z
title: "errorHandler's legendary error modal shows the error HTML-escaped (&#x2F; for every slash)"
area: launch
files:
  - src/backend/utils.ts:245 (the box.error.legendary.generic call interpolates { error, newline })
  - src/backend/sidecar/bootstrap.ts (the i18next init sets no interpolation.escapeValue)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/error_handler/expected/error-handler-legendary-legendary-py-with-markup/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-05 `error_handler` golden (D-20: kept as recorded, not fixed there).
`errorHandler` sends the legendary generic modal with the raw error interpolated through i18next. The sidecar's
i18next init leaves `interpolation.escapeValue` at its default (true), so the modal message carries HTML entities
where the error held a slash, quote, angle bracket or ampersand: `legendary/cli.py` reads `legendary&#x2F;cli.py`.
The renderer shows plain text, so the user sees the entities. Every traceback path is affected.

## Solution

Not part of the port. The Rust port replays the golden as it is (the `interpolation-escaping` delta records the rule).
After that, decide whether the call should pass `interpolation: { escapeValue: false }` (the renderer escapes on
display), in one deliberate change recorded in `deltas.json`.
