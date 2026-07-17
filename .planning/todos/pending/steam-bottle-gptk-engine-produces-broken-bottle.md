---
created: 2026-07-17T04:59:48.231Z
title: Steam bottle setup offers GPTK/Wine engines that produce a broken bottle
area: steam
files:
  - src/backend/storeManagers/steam/bottle.ts (CXBOTTLE_BIN, provisionBottle, isBottleReady)
  - src/backend/launcher.ts:434-442 (toolkit vs crossover engine branches)
  - src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts (resolveSteamBottleEngine)
  - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx (embedded WineSelector)
---

## Problem

The guided Steam-bottle setup (macOS) lets the user pick a non-CrossOver engine
(GPTK/`toolkit`, or plain Wine) via the same `WineSelector` component GOG uses,
implying GPTK is a supported Steam runner as it is for GOG/Epic. It is not —
selecting a non-CrossOver engine silently produces a broken, non-working bottle.

**Root cause — creation is CrossOver-only, run-path is engine-split:**
Bottle *creation* is hardcoded to CrossOver's `cxbottle`
(`bottle.ts` → `CXBOTTLE_BIN`, `cxbottle --create --template win10_64`). But the
run-path in `launcher.ts` treats engine types as mutually exclusive
prefix-vs-bottle models:
- `type === 'toolkit'` (GPTK) → `delete gameSettings.wineCrossoverBottle`
  (launcher.ts:434-437) and runs against a plain `WINEPREFIX`.
- `type === 'crossover'` → `delete gameSettings.winePrefix` (launcher.ts:439-442)
  and uses `CX_BOTTLE`.

So a GPTK Steam bottle: `cxbottle` installs the Windows Steam client INTO the
CrossOver bottle, then provision/launch under `toolkit` drops the bottle binding
and runs GPTK against a different (default) prefix that has no Steam client →
`isBottleReady()` (looks for `steam.exe` in the CrossOver bottle dir) never
passes → silently broken, no error surfaced.

**Secondary — global GPTK choice is silently overridden for Steam:**
`steamBottleDefaults.ts` `resolveSteamBottleEngine()` forces the first
CrossOver-type engine as the default, overriding the user's globally-configured
engine. A user running GPTK for GOG/Epic finds it silently does NOT apply to
Steam (Steam defaults to CrossOver), and manually switching the Steam
WineSelector to GPTK yields the broken mismatch above.

**Impact:** medium. Silent failure + misleading UI affordance. Workaround is to
use CrossOver, which is the default, so most users are unaffected. macOS only.

Discovered 2026-07-17 during Phase 22 (Multiple Steam Bottles) spec-phase
exploration. Related to the Phase 17 dedicated-bottle foundation.

## Solution

Two options (not mutually exclusive):

- **(a) Quick / correct given current architecture** — filter the Steam
  `WineSelector` to CrossOver-type engines only, and/or reject a non-crossover
  `wineVersion` in `provisionBottle` with a clear error message. Removes the
  misleading affordance; matches the fact that Steam bottling requires `cxbottle`.
- **(b) Larger** — build a prefix-based (`toolkit`/`wine`) Steam provisioning
  path so GPTK genuinely works as a Steam runner (create/manage a plain
  `WINEPREFIX`, install the Windows Steam client into it, and point readiness
  checks + dispatch at that prefix instead of the CrossOver bottle dir). This is
  effectively a second bottle backend and overlaps conceptually with Phase 22.

Recommend (a) as a standalone fix regardless of whether (b) is ever pursued.
