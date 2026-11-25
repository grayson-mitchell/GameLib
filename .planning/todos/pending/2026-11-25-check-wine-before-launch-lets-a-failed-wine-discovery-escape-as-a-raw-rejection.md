---
created: 2026-11-25T14:05:00.000Z
title: "checkWineBeforeLaunch lets a rejected wine discovery escape as a raw rejection instead of treating it as no wine found"
area: launch
files:
  - src/backend/utils.ts:1209-1215 (checkWineBeforeLaunch awaits getAlternativeWine with no catch)
  - src/backend/utils.ts:1112-1128 (downloadDefaultWine wraps the same call in try/catch and logs it)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine/expected/check-alternatives-discovery-rejects/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-04 check_wine golden (D-20: kept as recorded, not fixed there). When the game wine and the
default wine are both invalid and `RUST_WINE_DISCOVER_ALTERNATIVES` rejects, `checkWineBeforeLaunch` rejects with
the raw error: the golden records `{ error: "wine discovery failed", wineVersionAfter: <the stored wine> }` and no
dialog. The same call inside `downloadDefaultWine` is wrapped in a try/catch that logs and returns null, so the two
call sites of discovery disagree about a failure. A caller that does not wrap the call (`launcher.ts` does not wrap its own call)
gets the rejection where the "was not possible to launch" status would otherwise be shown.

## Solution

Not part of the port. After the Rust op replays the golden, decide whether a failed discovery counts as an empty
list (so the download path runs) or as a failed check (`false`), and change the Rust op and the golden together,
recorded in `deltas.json`.
