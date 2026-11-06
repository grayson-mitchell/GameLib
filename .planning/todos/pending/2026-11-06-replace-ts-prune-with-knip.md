---
created: 2026-11-06T12:00:00.000Z
title: "Replace ts-prune with knip for unused exports, files and dependencies"
area: tooling
files:
  - package.json
severity: minor
platform: any
ready: code
---

## Problem

`ts-prune` (`^0.10.3`) is a devDependency, but it is unmaintained, no script or CI step runs it,
and 70 files under `src/` and `meta/` carry `// ts-prune-ignore-next` comments. It only finds
unused exports. knip also finds unused files and unused dependencies (57 runtime and 49 dev
dependencies, measured 2026-11-06). From the second architecture review on 2026-11-06 (item 7).

## Solution

Run with `/gsd-quick`, after Phase 62 (and ideally Phase 65) so file moves don't show up as false
positives.

1. Add knip with a config naming the real entry points: the sidecar bootstrap, the frontend
   entry, the `meta/` tools, the jest setup files and any scripts `package.json` runs.
2. Run it and record counts for unused files, exports, dependencies and devDependencies.
3. Add a `pnpm` script and a CI step, warn-only with a shrink-only baseline like Phase 62's.
4. Remove `ts-prune` from `package.json`, and convert or delete the 70 `ts-prune-ignore-next`
   comments. Keep each exemption knip still needs as a knip ignore entry with its reason.

Removing what knip finds is follow-up work in separate commits, not part of adding the tool.
