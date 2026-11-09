---
created: 2026-11-08
title: "Version the per-bottle .gamelib-engine.json marker with the Phase 68 engine"
area: engine
files:
  - src/backend/engine/engineSwitch.ts
severity: minor
platform: macos
ready: code
---

**File:** `<bottle>/.gamelib-engine.json`, written atomically (temp then rename) by `writeMarker`
in `src/backend/engine/engineSwitch.ts` and read by `readMarker`.

**Holds:** `{kind, id, wineserverBin, dxvk}`, the engine that last prepared the bottle and the
location of its DXVK copy. It drives DXVK removal before CrossOver runs and the DXVK restore when
a pinned engine returns.

**Why it counts as user data:** it describes the state of the user's own bottle on disk. If a
future shape change makes `readMarker` return null for an old marker, the switch logic loses track
of the DXVK DLLs it installed and cannot remove or restore them.

**Reuse:** Phase 68's engine (`src/backend/storeVersioning/`) is the mechanism: `prepareStoreFile`
with a codec. `readMarker` already validates strictly, which is the reason a version field and a
chain would be cheap to add.

See `.planning/phases/68-versioned-persisted-stores-and-migrations/68-INVENTORY.md`.
