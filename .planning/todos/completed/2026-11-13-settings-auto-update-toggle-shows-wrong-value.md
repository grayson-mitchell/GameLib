---
created: 2026-11-13T00:00:00.000Z
title: 'Settings shows "Automatically update games" off while the stored value is true'
area: settings
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 20 (operator side note, deferred by the 74 gap-closure round 3, 2026-11-13)'
files:
  - src/frontend/screens/Settings/components/AutoUpdateGames.tsx
  - src/backend/config.ts:321
---

## Problem

During the 74 live gate, Settings showed the "Automatically update games" toggle off while
`store/config.json` held `autoUpdateGames: true`. Toggling it on and then off wrote `false`.
The backend reads the stored value, so the UI and the behaviour disagree: a user who sees "off"
can still get unattended bridge updates at boot.

`AutoUpdateGames.tsx` reads it through `useSetting('autoUpdateGames', true)`. Not root-caused:
candidates are the setting being read from a different scope (game vs global config), a stale
cache in `useSetting`, or the default masking a read that has not resolved.

## Done when

With `autoUpdateGames: true` in the stored config, Settings shows the toggle on after a fresh
launch, and with `false` it shows off; a unit test pins the read path.

## Resolution

Resolved 2026-11-14 by quick 261114-l1j.

- Root cause: the Settings toggle and the boot auto-update both read config.json `defaultSettings` via `getSettings()`, so UI and behaviour agreed. The 74 UAT operator read and hand-edited the `store/config.json` `settings` mirror, which was written through by `setSetting`/`writeConfig` but never resynced at boot.
- Fix: `readSetting` extracted and pinned by `useSettingsContext.getSetting.test.ts`; `resyncSettingsMirror` runs in the sidecar 'config' boot step (config.json wins, mirror-only keys kept, synchronous, guarded).
- Docs: 74-UAT preconditions now name config.json `defaultSettings.autoUpdateGames`; items 20 and 28 and their gaps carry the attribution.
