---
created: 2026-11-04T09:00:00.000Z
title: "STATE.md `Plan: Not started` fails the SDK field-anchor planning gate"
area: planning
files:
  - .planning/STATE.md
severity: minor
platform: any
ready: code
---

## Problem

`pnpm planning-gates` reports 11/12 (exit 1), found by the Phase 51 Nyquist re-audit on
2026-11-04:

```
PROBLEM: Plan: value 'Not started' does not start with `<N> of <M>` -- state.advance-plan's
compound-format parser (state-mutation.ts:555-559) requires this shape
```

`.planning/STATE.md:75` reads `Plan: Not started` beside `Phase: 60` / `Status: Milestone
complete`. The SDK added Phase 61 (`1a10778e1`) without resetting the field to the required shape.

## Solution

Set the `Plan:` line to a value of the form `<N> of <M>` that fits the current position (for
example `0 of 0` until Phase 61 is planned), preferably with a `gsd-sdk` state command rather
than a hand edit. Then confirm that `pnpm planning-gates` reports 12/12.
