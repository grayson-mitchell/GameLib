---
created: 2026-08-15T21:40:00.000Z
title: 32-bit Mac Steam titles permanently orphan their native install
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - .planning/debug/steam-bottle-uninstall-reverts.md
---

## Problem

Every 32-bit Mac Steam title leaves an unrunnable native install on disk forever.

The Mach-O architecture check is **post-install by necessity** — you need the binary present to
read its header. The min-OS heuristic (`macArchFromMinOS`) *structurally never returns `'32'`*;
only the Mach-O check may assert it (`games.ts:447`, `electronStores.ts:141`). So the ordering is
forced:

1. Steam reports the title as Mac-native → GameLib installs it **natively**
2. Post-install Mach-O read finds i386 → caches `mac_arch: '32'`
3. `isBottleEligible()` flips true (`games.ts:1558`, `library.ts:225`)
4. The *next* install routes to the CrossOver bottle
5. **The native i386 install is never removed** — no install path in `games.ts` deletes anything;
   every `rmSync` lives in an uninstall path (`uninstallBridgeGame`, `uninstallBottleGameDirectly`)

The orphan can never run on Apple Silicon, and `install()` has no already-installed guard
(`games.ts:884` computes `routeThroughBottle` and proceeds regardless of what exists elsewhere), so
nothing prevents or notices the second install.

**Observed live 2026-08-15:** HOARD (appId 63000) held two complete installs — native
`~/Library/Application Support/Steam/steamapps/common/Hoard` (574M, i386, unrunnable on an M5) and
a CrossOver bottle copy (276M). Both carried a valid `appmanifest_63000.acf`.

## Why it is not already covered

`InstalledInfo` (`src/common/types.ts:346`) is singular — one `install_path`, one `install_size`,
one `platform`, shared by every store. The filesystem permits N installs, the model records 1, and
`install()` enforces 0. That mismatch is what let the two copies diverge silently.

`60e89349a` makes uninstall route by `install_path` and re-resolve to a surviving copy, so the
orphan **is** removable — but only on a second Uninstall pass, with an intermediate state where the
badge correctly stays "installed" after the user clicked Uninstall. Correct, but it reads as a bug
to anyone who does not know why.

## Direction

The cheapest point to prevent the orphan is step 2 — the moment the Mach-O check demotes a title to
`mac_arch: '32'`, that native install is already known-unrunnable on this host. Options to weigh:

- remove the native install at demotion time (needs care: the user may be on an Intel Mac where
  i386 still runs — gate on host arch, not just the verdict)
- leave it but surface it as reclaimable space with an explicit action
- guard `install()` against installing a second copy while another is recorded

Do **not** implement by making the badge flip early — the badge is currently honest, and
`60e89349a` deliberately stopped forcing it.

## Verification

Any fix must not regress the dual-install behaviour just landed: a title with copies in two roots
must still lose only the copy `install_path` points at, and the survivor must stay reachable via
re-resolution. `library.test.ts` covers re-resolution in both directions; keep those green.
