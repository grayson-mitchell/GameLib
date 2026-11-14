---
created: 2026-11-14T00:00:00.000Z
title: 'Harden Phase 70 GameInfo narrowing ratchet and IPC schemas (review follow-ups)'
area: architecture
severity: minor
platform: any
ready: code
source: '.planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-REVIEW.md (WR-02, WR-03, WR-06, WR-07, IN-01, IN-02) and 70-VERIFICATION.md'
files:
  - meta/gameInfoNarrowingCeiling.cjs
  - meta/gameInfoNarrowingBaseline.json
  - src/common/types/ipc/gameInfoSchema.ts
  - src/common/types/ipc/gameDetails.ts
  - src/common/types/ipc/wineTools.ts
  - src/common/types/ipc/settings.ts
  - src/common/types/ipc/schemaTypes.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/testUtils/gameInfoFixtures.ts
---

## Problem

Phase 70's code review left non-blocking hardening items. The operator promoted WR-01/04/05 to Phase 70 gaps; these stay follow-ups:

- **WR-02 — ratchet bypasses.** `meta/gameInfoNarrowingCeiling.cjs` counts only `isStoreGame`/`asStoreGame` and member names. `GameInfoByRunner['x']` (already used in `testUtils/gameInfoFixtures.ts`), `Extract<GameInfo, {runner}>`, `isStore(game, '<store>')` and anything under `src/common` escape the count.
- **WR-03 — `addNewApp` over-accepts.** Its schema is the full `gameInfoSchema` union but dispatch always writes the sideload manager; a non-sideload payload passes, becomes a sideload entry and loses its sideload-only fields. Should be the sideload member schema.
- **WR-06 — type honesty in settings schemas.** `wineTools.ts` uses `.partial() as unknown as z.ZodType<GameSettings>`; the loose `noWineInstallation` arm accepts arbitrary keys when `bin` is absent/empty.
- **WR-07 — `SteamGame.getGameInfo()` returns `{} as SteamGameInfo` on cache miss**, so the type claims `runner: 'steam'` on an empty object.
- **IN-01** — GamePage baseline reason in `gameInfoNarrowingBaseline.json` mentions `namespace`, which that file does not read.
- **IN-02** — a GOG launch option with undefined `name` makes the strict launch schema silently drop the "remember this launch option" write.
- Stale JSDoc mentioning `phase70Passthrough` at `schemaTypes.ts:10`.

## Solution

Count the bypass forms (and scan `src/common` outside store homes) in the ratchet, re-freezing the baseline with reasons; narrow `addNewApp` to the sideload schema; replace the wineTools cast with an honest partial type and tighten the no-wine arm; return `undefined`/a typed miss from `getGameInfo()`; fix the baseline reason, the GOG launch-option name handling and the JSDoc.

## Resolution

Closed by quick task 261114-sbo.

- WR-02: the ratchet now counts `GameInfoByRunner[...]` indexed access, `Extract<...GameInfo...>` and `isStore(<object>, '<literal>')`, scans `src/common` outside its type/guard homes, and the baseline was re-frozen by hand with a reason per entry.
- WR-03: `addNewApp` accepts only `sideloadGameInfoSchema`; the dispatcher and sideload manager are typed `SideloadGameInfo`.
- WR-06: `runWineCommand`'s `gameSettings` is typed `Partial<GameSettings>` and the handler fills absent keys from the global settings; the settings no-wine `wineVersion` arm is a strict object with bounded `lib`/`lib32`/`wineserver`.
- WR-07: `SteamGame.findGameInfo()` returns `SteamGameInfo | undefined`; `getGameInfo()` keeps the documented `{}` sentinel, typed `GameInfo`.
- IN-01: the GamePage baseline reason names the real reads (no `namespace`).
- IN-02: GOG launch option `name` falls back to `''`.
- The stale `phase70Passthrough` JSDoc in `schemaTypes.ts` is gone.
