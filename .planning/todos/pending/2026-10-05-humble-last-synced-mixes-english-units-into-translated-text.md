---
created: 2026-10-05T00:00:00.000Z
title: "Humble \"Last synced\" builds English minute/hour/day units and feeds them into translated strings (\"vor 5 minutes\")"
area: i18n
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.8"
files:
  - src/frontend/screens/Humble/Keys/index.tsx:49-57
  - meta/hardcodedStringGate.ts:268
---

## Problem

Only the `'less than a minute'` branch of `formatRelativeTime` was retrofitted. The minute/hour/day
branches still build English (`` `${minutes} ${... 'minute' : 'minutes'}` ``) and that text is
interpolated into the translated `humbleKeys.lastSynced` and `syncError` strings. The hardcoded-string
gate missed it because `LOWERCASE_TOKEN_RE` (`hardcodedStringGate.ts:268`) exempts single lowercase
tokens — a structural blind spot for unit words.

## Failure scenario

A German user sees "Letzte Synchronisierung vor 5 minutes"; French shows "il y a 5 minutes".

## Suggested fix

Add plural keys (`_one`/`_other` for minutes, hours, days with `{{count}}`), or use
`Intl.RelativeTimeFormat` with `i18n.language`. Consider whether the gate's blind spot needs its own
todo.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
