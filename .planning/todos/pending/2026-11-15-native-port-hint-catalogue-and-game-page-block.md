---
created: 2026-11-15
title: "Native port hint: checked-in port catalogue + 'Native port available' game-page block with setup help"
area: game-page
files:
  - .planning/notes/native-engine-ports-hint-only.md
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/CompatibilityInfo.tsx
  - src/backend/storeManagers/sideload
severity: minor
platform: any
ready: code
---

## Goal

Tell the user when a native source port exists for a game they own, and help them set it up.
GameLib links to the port and never downloads or launches it. Decision record and survey:
`.planning/notes/native-engine-ports-hint-only.md`.

## Scope

1. **Catalogue** — a checked-in JSON file (e.g. `src/common/nativePortCatalogue.json`) plus a
   typed loader. One row per port:
   - `id`, `name`, `url` (upstream releases page), `licence` (SPDX or a named non-OSI licence)
   - `appIds: number[]` (Steam; one engine → many AppIds), optionally GOG ids later
   - `mac: 'arm64' | 'universal' | 'x86' | 'none'`, plus `linux`/`windows` booleans
   - `dataStyle: 'point' | 'copy' | 'import'`, `dataFiles?: string[]` (for `copy`)
   - `note?` (remaster caveats, e.g. "needs original `baseq2`")
   Seed with the native-Mac rows in the note's table, starting with fallout1-ce (38400) and
   fallout2-ce (38410). Build the list offline from osgameclones; no live fetch.
2. **Game-page block** — "Native port available" in the game info area, shown when the game's
   AppId matches a row on the current platform: name, link, licence, platform support, note, and
   "Steam playtime and achievements are not tracked when you play through the port".
3. **Setup help** — "Show data folder" (reveal install dir), "Copy install path", and steps by
   `dataStyle` (`copy`: list `dataFiles`, "copy, don't move"); a pointer to adding the port as a
   sideloaded game.
4. Strings through i18n (`public/locales/en/gamelib.json`).

## Out of scope

Downloading, pinning, configuring or launching ports; any `nativeEngine` known-fix key; a runtime
picker. (Rejected — see the note.)

## Open

- Gate the block on a data-file presence check (remaster ambiguity), or always show it with the
  note? Decide when the catalogue grows past the Fallout rows.
- Whether to wait for the fallout1-ce spike before shipping the Fallout rows (seen-working rule).
