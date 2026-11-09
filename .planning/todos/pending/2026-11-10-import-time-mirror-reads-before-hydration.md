---
created: 2026-11-10T12:00:00.000Z
title: "Import-time mirror reads run before store-snapshot hydration"
area: frontend-state
files:
  - src/frontend/state/GlobalStateV2.ts:105 (gameOverrides read at create time)
  - src/frontend/state/GlobalState.tsx (module-scope globalSettings / focusRowMirrorSeed)
severity: minor
platform: any
ready: code
---

## Problem

Both reads run at ES-module evaluation, before `await hydrateStoreSnapshot()` in
`index.tsx`, so they see the empty snapshot and return defaults. The existing
mount-time compensations (CR-01 focusRow hydration, F-49-R1-3 dismissed-set
hydration, handleMetadataChanged) mask the problem.

Phase 69 preserves this timing (no-behaviour-change rule). The fix is moving
both reads into a post-hydration `readInitial()` run from
`initStateSubscriptions()`. This todo is the "fix in phase or todo" outcome for
RESEARCH A5.
