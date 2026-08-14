---
created: 2026-08-15T08:50:00.000Z
title: "Bump helper binaries (legendary/gogdl/nile) — legendary moved repo, nile 1.2.0 is breaking"
area: build/runners
needs: code-fix-plus-rebuild
status: OPEN
severity: minor
deferred: true
upstream:
  - 9f14bdd1c (Heroic v2.22.1 — Update legendary and gogdl, #5809)
  - 0e2f4ca3b (Heroic v2.22.1 — update nile to 1.2.0, #5645)
files:
  - meta/downloadHelperBinaries.ts
  - meta/releaseTags.ts
  - meta/runnersOnedirDigests.json
  - src/backend/storeManagers/nile/constants.ts
  - src/backend/storeManagers/nile/user.ts
  - src/common/types/nile.ts
---

## Problem

Upstream moved to legendary `0.21.0`, gogdl `v1.3.0`, nile `v1.2.0`. GameLib is pinned at
legendary `0.20.43`, gogdl `v1.2.1`, nile `v1.1.2`.

**Explicitly deferred, not urgent** (operator decision 2026-08-15). Nothing is broken today —
verified 2026-08-15 that the old `Heroic-Games-Launcher/legendary` release URL still
302-redirects, so current downloads resolve fine.

This todo exists so that whoever *does* bump doesn't get caught by three traps.

## Solution

### Trap 1 — legendary moved repo AND renamed its assets

`Heroic-Games-Launcher/legendary` → **`legendary-gl/legendary`**, and the release assets were
renamed:

| Old | New |
|---|---|
| `legendary_linux_x86_64` | `legendary_linux_x64` |
| `legendary_macOS_x86_64` | `legendary_macOS_x64` |
| `legendary_windows_x86_64.exe` | `legendary_windows_x64.exe` |

`meta/downloadHelperBinaries.ts` hardcodes **both** the old repo (~line 292) and the old
`_x86_64` asset names. Bumping the version tag alone will 404.

### Trap 2 — nile 1.2.0 is a BREAKING data change

The user data file moved `user.json` → **`current_user.json`**, and the payload **flattened**
from `user.extensions.customer_info` to just `user`.

`src/backend/storeManagers/nile/constants.ts:7` still says `user.json`. **Bumping the nile binary
without the code change breaks Amazon login.** Take both or neither — upstream `0e2f4ca3b`
carries the binary bump and the code change together for exactly this reason.

### Trap 3 — GameLib builds its own onedir bundles

GameLib does not simply consume upstream release assets; it builds onedir archives from these
runners. Any bump also requires regenerating those archives **and**
`meta/runnersOnedirDigests.json`. (Note: that file currently carries at least one
`PENDING-CI-PUBLISH` placeholder sentinel — see plan 34.9-09 — so the digest pipeline needs to be
healthy before a bump can be verified end to end.)

Reference: `git show 9f14bdd1c`, `git show 0e2f4ca3b` (Heroic upstream is git remote `origin`).
