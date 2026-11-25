---
created: 2026-11-26T12:00:00.000Z
title: "The DiscordRPC settings toggle does nothing now that Discord presence is gone"
area: settings
files:
  - src/frontend/screens/Settings/components/DiscordRPC.tsx (the toggle, bound to the `discordRPC` setting)
  - src/frontend/screens/Settings/components/index.ts:19 (its export)
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx:8,50 (where it renders)
  - src/common/types.ts:155 (`discordRPC` on the app settings)
  - src/common/types/ipc/settingsSchema.ts:160 (`discordRPC: z.boolean()`)
severity: minor
platform: any
ready: code
---

## Problem

Discord presence was dropped by the operator decision of 2026-11-17 (the 82 amendment): 88.1 deleted
`constructAndUpdateRPC` and did not port it, and 88.1-19 removed the `@xhayper/discord-rpc` package once nothing
imported it. The Settings toggle for it (`DiscordRPC.tsx`, bound to the `discordRPC` setting) is still rendered, so a
user can switch it on and nothing happens.

## Solution

Remove or hide the toggle with the settings UI: delete `DiscordRPC.tsx` and its two references, then decide whether
the `discordRPC` key leaves `AppSettings` and `settingsSchema.ts` (it is persisted in existing `config.json` files and
is in the generated IPC schema snapshot, so a removal regenerates `ipcSchemaSnapshot.json` and needs the settings
parity test, `settingsParity.test.ts`, updated). The translation key for the label goes with it.
