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

## Update 2026-08-14 — Phase 34.13-03 (partial)

Option (a)'s **frontend-filter half shipped** as D-16, in
`src/frontend/screens/Library/components/InstallModal/WineSelector/`
(`engineFilter.ts` + `index.tsx`). `WineSelector` now offers only
`type === 'crossover'` engines in its dropdown and seeds its default engine
from that same filtered list whenever `runner === 'steam'` — covering both
the new Steam install form (via `InstallModal/index.tsx`'s pass-through) and
the existing guided `SteamBottleSetup.tsx` surface, which inherits the
filter automatically through its `runner="steam"` prop with zero edits to
that file (the `resolveCrossoverOnly` default). A user can no longer select
GPTK/plain-Wine for a Steam bottle through this UI.

**Still open — option (a)'s backend-rejection half did NOT ship:**
`provisionBottle` in `src/backend/storeManagers/steam/bottle.ts` still
accepts any `WineInstallation` unrejected; it does not validate
`wineVersion.type === 'crossover'` before calling `cxbottle`. A `toolkit`/
`wine` engine already persisted into the Steam bottle config store (e.g.
from before this filter existed, or via direct config manipulation) still
reaches `provisionBottle` unrejected and still silently produces the broken
bottle described above.

**Still open — the `resolveSteamBottleEngine` silent-override half did NOT
ship:** `steamBottleDefaults.ts`'s `resolveSteamBottleEngine()` is
untouched by this plan. This plan's D-16 filter only governs which engines
are OFFERED and which is SEEDED when none is set — it deliberately does NOT
add a corrective override that force-switches an already-set non-CrossOver
`wineVersion` to a CrossOver one (that would be `resolveSteamBottleEngine`'s
silent-override half, out of scope here by explicit plan-level prohibition).

**Option (b)** (the prefix-based GPTK provisioning path) remains fully out
of scope — untouched.

**Todo stays in `pending/`, not closed.** The misleading UI affordance is
now hidden for new selections, but the underlying engine mismatch in the
backend is not fixed, so a user who has already persisted a `toolkit`
engine into the bottle store (from before this filter shipped) is still
exposed to the silent-broken-bottle failure mode on their next
provision/launch.
