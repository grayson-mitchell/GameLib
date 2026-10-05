---
created: 2026-10-05T00:00:00.000Z
title: "Winetricks Install stays clickable until the first progress tick — a double-click runs two winetricks installs on the same prefix"
area: wine
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 44"
files:
  - src/frontend/components/UI/Winetricks/index.tsx:118-133
  - src/backend/tools/index.ts:654-663
  - src/backend/tools/index.ts:762-770
---

## Problem

`install()` sets no in-flight state. The backend's immediate `installing-winetricks-component(verb)`
event is handled by `onInstallingChange`, which calls `setInstalling(false)` for any value. The row
stays `available` until the first `progressOfWinetricks` event, which comes from a 1000ms interval
and only once there is output — later still on a first-run winetricks download. `activate()` fires on
each `mousedown`.

The backend has no single-flight guard, and `installingComponent` is module-global.

## Failure scenario

Double-clicking Install on `vcrun2019` (or clicking a second row in that window) runs
`Winetricks.install` twice; two `winetricks -q` processes race on one Wine prefix. Whichever finishes
first clears `installingComponent` to `''`, so the UI shows idle while the other is still running.
The old search UI had the same gap; Phase 44 makes it much easier to hit by giving every row a live
Install button.

## Suggested fix

- In `install()`, `setInstalling(true)` and `setInstallingComponent(component)` immediately.
- In `onInstallingChange`, only `setInstalling(false)` when `component === ''`.
- Backend: reject a second `Winetricks.install` while `installingComponent !== ''`.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
