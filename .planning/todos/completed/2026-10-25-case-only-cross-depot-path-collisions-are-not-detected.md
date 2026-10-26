---
created: 2026-10-25
title: "Case-only cross-depot path collisions are not detected, so two claims to one file on a case-insensitive volume are both verified strictly"
source: quick 261025-srj library-wide manifest scan (2026-10-25)
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/pathCollisions.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
severity: medium
platform: any
ready: code
---

`pathCollisions.ts` keys paths case-sensitively: `normalizePath` (~L65) only swaps `\` for `/`, and
the collision map is keyed with it (~L106). macOS volumes, and the Wine bottles that sit on them,
are normally case-insensitive APFS. Two depots that ship the same path in different case therefore
write one file on disk, yet each claim is treated as a separate path and both are verified strictly.

The library-wide manifest scan of 2026-10-25 found 255 differing collisions of this shape:

- **Wasteland 3 (719040)**, macos, 198 collisions, e.g. `WL3.app/.../24044905.wem` in depot 719042
  (owner 719040, 10355 bytes) vs `wl3.app/...` in depot 1522651 (owner 1522650, 19564 bytes). This
  pair is also cross-owner.
- **Californium (402060)**, macos, 53 collisions, e.g.
  `californium.app/Contents/Resources/Data/level2` in 402062 (61884 bytes) vs `Californium.app/...`
  in 402064 (61924 bytes).
- **Civilization V (8930)**, windows, 4 collisions, e.g.
  `Assets/Gameplay/XML/NewText/EN_US/CIV5GameTextInfos_MapMeso.xml` in 8933 (365 bytes) vs
  `.../en_US/...` in 16863 (371 bytes).

Likely consequence, unverified live: post-download structural re-verification
(`verifyStructuralIntegrity` in `reconcile.ts`, ~L290) fails closed to StateFlags=1026, the same
symptom as the just-closed
`.planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`.

The scan data (`results.json`, `rows.json` in the session scratchpad) was ephemeral and was not
kept.

Fix direction: detect collisions on a case-folded key. The appinfo-order winner rule then needs that
same key, and cross-owner pairs fall back to the existing UNRESOLVED path. After the fix, run a live
gate on Californium or Civ V.

**Resolved 2026-10-26 by quick 261026-nhy** (`924a8c264`, `b67e26e3b`). Live gate passed on macOS:
Californium (402060) plan build probed the steamapps volume `case-insensitive=true`, RESOLVED 109
case-only collisions (402064 rank 2 over 402062 rank 1, both spellings logged, 0 UNRESOLVED), and
finalized `StateFlags=4`. A macOS Civ V (8930) install on the same build had no collisions and also
finalized `StateFlags=4`, so case folding invented none across 11,946 files. The Windows-depot
Civ V pairs (8933 vs 16863) and the cross-owner Wasteland 3 shape were covered by unit tests only.
