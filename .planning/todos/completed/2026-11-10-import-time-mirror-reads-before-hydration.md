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

## Resolution

Resolved 2026-11-10 by quick task 261110-ugu (commit cac3c5ba3).

- Path correction: GlobalStateV2.ts and GlobalState.tsx no longer exist (Phase 69 deleted them). The reads lived in settingsState.ts, authState.ts and libraryState.ts.
- Moved: settingsState `hideChangelogsOnStartup`, `experimentalFeatures`, `focusRow` into `readInitialSettings()`, plus new call-time `readFocusRowMirrorSeed()` replacing the `globalSettingsAtImport`/`focusRowMirrorSeed` exports; authState `dismissedSignInNotices` into `readInitialAuth()`; libraryState `gameOverrides` into `readInitialLibrary()`, passed explicitly to every loader. Store defaults are now literals.
- Ordering verified: index.tsx awaits hydrateStoreSnapshot() (line ~145) before `initStateSubscriptions()` (line 265), which applies the readInitial*() functions in section (1).
- Compensations: CR-01 focusRow hydration kept and re-gated on the post-hydration seed (backend migration never reaches the mirror; recovery for failed hydration). F-49-R1-3 dismissed-set hydration kept, comment corrected (mirror/config.json divergence, failed hydration; union, never writes). handleMetadataChanged kept as the runtime override push channel.
