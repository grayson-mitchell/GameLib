---
created: 2026-10-05T00:00:00.000Z
title: "PathSelectionBox shows \"Saved\" as soon as onPathChange is called, even when the consumer rejects the value"
area: ui
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.17"
files:
  - src/frontend/components/UI/PathSelectionBox/index.tsx:105-115
  - src/frontend/screens/Settings/components/EgsSettings.tsx:31-39
---

## Problem

`setJustSaved(true)` runs as soon as `onPathChange` is invoked, regardless of outcome. EgsSettings
commits asynchronously and can reject the value (`egsSync` returns `'Error'`, then `setEgsPath('')`).
The CLAUDE.md vocabulary puts "a shipped claim that is false" at critical; it is filed medium on blast
radius — raise it if you read it the other way.

## Failure scenario

The user enters a bad prefix and presses Enter. The field says "Saved" for 2s while the sync-error
modal is open, then flips to "Not saved yet — press Enter".

## Suggested fix

Start the pulse only once the `path` prop equals the value just committed: record the pending value
in a ref and set `justSaved` in the `[path]` effect when they match.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
