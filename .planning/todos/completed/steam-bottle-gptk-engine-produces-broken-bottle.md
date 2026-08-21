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

## Update 2026-08-16 — mostly closed by Phase 34.13; one guard left

**Scope shrinks. Impact downgrades.** The note above is out of date: it was written
mid-34.13, and the rest of that phase landed three further changes it does not account
for. What is left is a single missing guard, not the multi-part defect this todo was
filed as.

### Landed since the 2026-08-14 note

1. **`getSteamBottleSettings()` now self-heals AND re-persists** (`bottle.ts:310-336`,
   34.13 review A-21). Any candidate `wineVersion` whose `type` is not `'crossover'` is
   replaced with CrossOver's own engine via `resolveCrossoverWine()`, and — the part the
   earlier fix `539bc979c` missed — the correction is written back to
   `steamBottleConfigStore` once, so every *other* reader of that key sees the healed
   value too. `getSteamBottleEligibilityVerdict` reads the store directly and deliberately
   (`installFormIpc.ts`), and was previously served the un-healed engine.
2. **Submission-boundary filter** (`steamBottleDefaults.ts:164-172`, review C-03).
   `resolveSubmittedBottleEngine` returns the armed engine only when
   `isBottleCapableEngine` accepts it, otherwise `undefined` — which `provisionBottle`
   already treats as "derive a sane engine yourself". This closes the hole D-16's
   dropdown filter opened: an engine armed by the Phase-17 fallback or by D-15's
   persisted-value precedence became *invisible and unselectable* yet still submitted.
3. **Non-CrossOver writes are now diagnosable** (`bottle.ts:371-377`).
   `persistBottleWineVersion` logs a warning rather than silently accepting. It stays
   permissive by an explicit recorded decision (review B-WR-08): `launcher.ts`'s
   `checkWineBeforeLaunch` self-heal is a legitimate producer of a non-CrossOver value
   here, so rejecting outright would break the recovery path the function exists to serve.

### The only thing still open

`provisionBottle` persists `opts.wineVersion` **unchecked**:

```ts
// bottle.ts:702-704 — step (2), "Persist the chosen wine/bottle identity"
if (opts?.wineVersion) {
  steamBottleConfigStore.set('wineVersion', opts.wineVersion)
}
```

Its sibling provisioner already rejects at the same point — `provisionBridgeBottle`,
`bottle.ts:1166-1175`, D-08 / T-24-09, *"do not silently create a broken GPTK/toolkit
bottle"*. `steamBottleDefaults.ts:157-162` names this exact asymmetry in a KNOWN
REMAINING GAP comment, and says why it was not closed there: that pass could not edit
`bottle.ts`.

The fix is the `provisionBridgeBottle` guard mirrored into `provisionBottle`, placed
before step 2's store write.

### Impact: downgraded to defense-in-depth

**This is no longer a live failure path.** Change 1 above means a non-CrossOver engine
reaching the store is corrected and re-persisted on the next `getSteamBottleSettings()`
read — and `provisionBottle`'s own step 6 re-reads through that getter. The self-heal
only declines when `resolveCrossoverWine()` finds no CrossOver on disk, and in that case
Steam bottling cannot function at all (creation is hardcoded to CrossOver's `cxbottle`),
so there is no working configuration left to break.

What the missing guard still costs: the store transiently holds a wrong value, the
rejection is implicit (silent correction) rather than an explicit error the caller can
surface, and the two sibling provisioners disagree about the same rule — which is how the
original defect got in. Worth closing as a small standalone task; no longer urgent.

**Option (b)** (a prefix-based `toolkit`/`wine` Steam provisioning path so GPTK genuinely
works as a Steam runner) remains fully out of scope and untouched.

Verified against source 2026-08-16 during quick task `260816-i8a`.

## Update 2026-08-21 — CLOSED by quick task 260821-lge

**The last open item is closed.** `provisionBottle` (`bottle.ts`) now carries a new
step (1c) guard, placed immediately after the (1b) CR-01 shared-bottle guard and
immediately before step (2)'s `steamBottleConfigStore.set('bottleName', ...)` write.
It mirrors `provisionBridgeBottle`'s D-08 guard verbatim: any `opts.wineVersion` whose
`type !== 'crossover'` is rejected with `{status: 'error', error: '...CrossOver...'}`
before any store write, `cxbottle` spawn, `rmSync`, or `downloadFile` call. A
CrossOver engine and an absent `wineVersion` both proceed exactly as before.

**What landed:**
- `bottle.ts` — the step (1c) guard clause (`fix(steam): add CrossOver-only guard to
  provisionBottle`).
- `__tests__/bottle.test.ts` — two new jest tests mirroring the bridge bottle's D-08
  pair: a rejection test (toolkit/GPTK engine → error, no store/spawn/rmSync/download
  calls) and a non-over-fire discriminator (CrossOver engine → still persisted via
  `mockedSet`). The rejection test was demonstrated RED by temporarily commenting out
  the guard's `return` in place, observing the test fail (`mockedSet` received 3 calls
  instead of 0), then restoring the guard. Full suite: 91/91 green.
- `steamBottleDefaults.ts` — the stale "KNOWN REMAINING GAP" doc comment above
  `resolveSubmittedBottleEngine` is corrected to record the gap as closed
  (comment-only change; no executable code touched).

**Option (b)** (the prefix-based GPTK/`toolkit` Steam provisioning path) remains
fully out of scope and untouched — closing this todo does NOT mean GPTK is now a
supported Steam engine. CrossOver stays the only engine that can create or run a
Steam bottle; a GPTK/plain-Wine `wineVersion` is now explicitly rejected rather than
silently self-healed.
