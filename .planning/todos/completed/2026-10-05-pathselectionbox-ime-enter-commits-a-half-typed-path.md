---
created: 2026-10-05T00:00:00.000Z
title: "PathSelectionBox commits on the Enter that confirms an IME candidate — a half-typed path is saved (and on EgsSettings, synced)"
area: ui
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.17"
files:
  - src/frontend/components/UI/PathSelectionBox/index.tsx:189-201
  - src/frontend/screens/Settings/components/EgsSettings.tsx:31-39
---

## Problem

The `onKeyDown` handler checks only `e.key` and `e.repeat`; it never checks
`e.nativeEvent.isComposing` or `keyCode === 229`. In WebKit (WKWebView on macOS, WebKitGTK on Linux —
the Tauri webviews) `compositionend` fires before `keydown`, so the candidate-confirming Enter
arrives as `key === 'Enter'`.

## Failure scenario

A Japanese or Chinese user types a path segment with an IME and presses Enter to pick a candidate.
The partial path is saved immediately; on EgsSettings that fires a real `egsSync(<partial path>)` IPC
and an error or success modal.

## Suggested fix

`if (e.key !== 'Enter' || e.repeat || e.nativeEvent.isComposing || e.keyCode === 229) return`, plus a
test for it.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

Confirmed by reading: `onKeyDown` checked only `e.key` and `e.repeat`.

**Changed.** `src/frontend/components/UI/PathSelectionBox/index.tsx` — the Enter handler now also
returns when `e.nativeEvent.isComposing` or `e.keyCode === 229`, with a comment naming the WebKit
compositionend-before-keydown order. The existing keyboard-event fixtures in
`__tests__/index.test.tsx` gained `nativeEvent: { isComposing: false }` (the handler now reads it).

**RED.** Two new cases — Enter with `nativeEvent.isComposing: true`, and Enter with `keyCode: 229` —
both failed on the unfixed component (`onPathChange` called once with the half-typed value).

**GREEN.** `jest --selectProjects Frontend --runInBand src/frontend/components/UI/PathSelectionBox`:
10/10 pass. `pnpm codecheck` exit 0; eslint on both files: 0 errors (1 pre-existing
`require-await` warning on the `openDialogMock` stub); prettier `--check` clean on both.

**Not verified.** No live IME run in WKWebView or WebKitGTK; the harness asserts the handler's
branch, not the engine's event order.
