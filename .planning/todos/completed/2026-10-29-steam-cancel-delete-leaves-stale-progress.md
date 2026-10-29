---
created: 2026-10-29
title: "D-UAT-11: after a Delete Files cancel, the next Steam install's progress opens at the old percentage"
source: Phase 21 Windows UAT pass 2026-10-29 (21-UAT.md D-UAT-11)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
  - src/backend/storeManagers/steam/cancelDelete.ts
severity: minor
platform: any
ready: code
---

Darkest Dungeon (262060) was cancelled at 6% with Delete Files (quick-261027-cux); files and manifest
were removed, but the next install's progress opened at 6%. Stale per-app progress state survives the
delete and should reset to 0 when the partial install is removed.

## Resolution

- **Fix commit:** 14f572a2a (quick-261029-o5a).
- **Root cause:** the frontend zustand store `useInstallProgressRaw` in `src/frontend/state/InstallProgress.ts`, keyed `${appName}_${runner}`, was never cleared. Every mounted `hasProgress` mirrored it, so a reinstall showed the cancelled run's last percent until its first new emit. Delete Files already cleared the localStorage entry, and the backend reconciler seeds from disk, so neither was the holder.
- **Fix:** `deleteCancelledSteamInstall` emits a zero-percent `sendProgressUpdate` after a successful delete. It fires after the in-flight settle wait, so no late depot emit can re-seed. Refusals and Stop & Keep Files are unchanged.
- **Status:** code fix only, not yet live re-tested on Windows. Observation (out of scope): a normal uninstall leaves the same store entry.
