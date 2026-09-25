---
created: 2026-09-25T00:00:00+13:00
title: "Decide whether to migrate off deprecated get-shit-done-cc 1.42.3 to open-gsd/gsd-core"
area: tooling
severity: medium
platform: any
ready: human
found_by: "Research on 2026-09-25 during quick task 260925-o9b, while closing .planning/todos/completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md as obsolete"
files: []
---

# Decide whether to migrate off deprecated get-shit-done-cc 1.42.3 to open-gsd/gsd-core?

## What GameLib pins

`get-shit-done-cc` **1.42.3**. CLAUDE.md records this pin itself, in its UAT-shape convention
section, describing `get-shit-done-cc` as "pinned `v1.42.3`"; the SDK is installed at
`~/AppData/Roaming/npm/node_modules/get-shit-done-cc`.

## Why that pin is now a dead end

The package is deprecated on npm and its GitHub repo was archived 2026-06-26. The consequence is
what matters and should be stated as such: no gsd tooling defect GameLib hits can EVER be fixed
upstream in that line. Every one of them is permanently GameLib's to work around locally — which
has already happened once, in the STATE.md field-anchor defect and the 13th planning gate written
to contain it (`.planning/state-sdk-field-anchor-gate.py`). The cost of staying is not
hypothetical; it is a local gate per upstream defect, forever.

## What the successor is

`open-gsd/gsd-core` — a DIFFERENT package, not a version bump, with a restructured tree
(`sdk/src/query/*.ts` became `src/*.cts`). It has already fixed several STATE.md defects GameLib
worked around locally: #4243, #1255, #4481, #4823, and ADR-1372 T6.

## The decision, and its blast radius

Three options, stated neutrally and with no preferred answer: migrate to gsd-core; fork-and-pin
the frozen line and carry local patches; or stay frozen deliberately and keep absorbing defects
locally. This is a human call, not a code change. Blast radius covers every `/gsd-*` workflow,
all 13 planning gates, the shapes of the documents under `.planning/`, and the upstream templates
that CLAUDE.md already flags as unversioned, machine-shared and overwritten by a `gsd` upgrade
(the UAT template and the phase-prompt template).
