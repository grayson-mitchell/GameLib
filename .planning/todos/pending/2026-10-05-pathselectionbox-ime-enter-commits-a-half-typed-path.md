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
