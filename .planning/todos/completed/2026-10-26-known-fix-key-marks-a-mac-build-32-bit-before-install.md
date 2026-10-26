---
created: 2026-10-26
title: "Known-fix key that marks a Steam title's macOS build as 32-bit, so install goes straight to Windows"
source: conversation 2026-10-26 (after the Hoard 63000 profile shipped)
area: steam-install
files:
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/electronStores.ts
severity: minor
platform: any
ready: code
---
## Problem

On Apple silicon a 32-bit macOS build cannot run, but GameLib only finds out after downloading it.
Before install, `macArchFromMinOS` (`games.ts:537`) can return only `'64' | 'unknown'`, never
`'32'`, by design: a low min-OS proves nothing about bitness (A Hat in Time is min-OS 10.11.6 and
64-bit). The only `'32'` verdict comes from `verifyMacArchGroundTruth` (`library.ts:1729`), which
reads the Mach-O after a native install and then fires `promptI386Recovery` to offer the Windows
route. So every user downloads the Mac build first, and the verdict is stored only in that user's
`steamMetadataStore`. Nobody else benefits from it.

## Proposed shape

A curated per-game fact is the ground truth the pre-install path was refusing to guess.

1. Add a known-fix key, e.g. `macArch: "32"` in `<appId>-steam.json`. It is plain data that only
   picks which platform's depots to download, and it never touches a running game, so make it
   **tier 1**: add it to `TIER1_KNOWN_FIX_KEYS` (`knownFixes.ts:56`). It then works from the
   remote `grayson-mitchell/known-fixes` repo and new titles reach users without an app release.
   Accept only the literal `"32"`. A curated `"64"` adds nothing over min-OS and the Mach-O check.
2. Before install, on an Apple-silicon Mac (`isAppleSiliconMac`, not `!isIntelMac`; see 260821-le0),
   a `macArch: "32"` hint seeds `mac_arch: '32'` with a distinct `mac_arch_source` (e.g.
   `'known-fix'`), and install routes to the Windows (bridge) path as `promptI386Recovery` does
   today, with no Mac download. Keep `mac_arch_verified` false so the Mach-O check still has the
   last word if a Mac build is ever installed.
3. Keep the post-install Mach-O check as the fallback for uncatalogued titles. When it finds `'32'`,
   log it in a form that is easy to turn into a known-fixes entry.

## Notes

- Don't reuse the name `platforms`. `.planning/notes/per-game-compat-fixes-architecture.md` already
  reserves it as a tier-2 key for per-OS / runtime-range / exe-sha scoping, which is a different
  thing.
- Overlaps `2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md` (blocked).
  It sends "a title with a macOS build" to `steam://install`. A `macArch: "32"` title must count as
  Windows-only there, or that routing sends it to the unusable Mac build. The hint does not depend
  on that todo and can land first.
- Seed data: the titles the Mach-O check has already found 32-bit on the operator's Mac (HOARD
  63000 was one, per 260821-le0).

## Resolution

Closed by quick 261027-bqe (2026-10-27), commits a029f1f15 (key, validator, seed module) and b4e8c11e0 (routing wiring, Mach-O fallback log).

- `macArch` is a tier-1 known-fix key; only the literal `"32"` survives `filterTier1KnownFixes`, any other value is dropped with a warning.
- Honoured only when `isAppleSiliconMac` is true (positive probe, never `!isIntelMac`). On Intel and unconfirmed hosts the hint is ignored.
- `seedMacArchFromKnownFix` writes `mac_arch: '32'` with `mac_arch_source: 'known-fix'` and leaves `mac_arch_verified` unset. It is called from `ensurePlatformsCaptured()` before any caller reads `isBottleEligible()`, and `fetchMetadataIfNeeded` re-derives it so an appdetails rewrite cannot drop it. A retracted hint un-seeds the entry.
- `verifyMacArchGroundTruth` still runs for a `known-fix` '32' (Mach-O keeps the last word), logs a paste-ready `<appId>-steam.json` entry on any '32' verdict, and warns when Mach-O contradicts a curated '32'.
- Bundled seeds: 57300 Amnesia: The Dark Descent, 63000 HOARD, 402060 Californium. Mirroring them into the remote known-fixes repo is an operator step.

No live install on Apple silicon was run, so the end-to-end "no Mac download" claim rests on the unit-level routing test (`macArchKnownFixRouting.test.ts`).
