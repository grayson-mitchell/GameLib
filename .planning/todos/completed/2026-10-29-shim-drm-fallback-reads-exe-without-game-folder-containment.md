---
created: 2026-10-29
title: "placeShimForGame's no-bottle DRM fallback reads the game exe without the game-folder containment check"
area: steam-bridge
severity: minor
platform: any
ready: code
source: "quick 261029-m0u (library-aware DRM exe containment), out-of-scope remainder, 2026-10-29"
files:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
---

## Problem

Quick 261029-m0u made `detectLaunchDrmWrapper` library-aware. The launch exe and every UE Shipping candidate must now realpath inside `realpath(dirname(exePath))` before any byte is read. `detectDrmWrapper`'s documented precondition (`shimGenerate.ts`, ~line 503) now states that rule.

`placeShimForGame` (`shimGenerate.ts:481-499`) only goes through that resolver when a bridge bottle name resolves (`stampBottle`). When none does, `launchWrapper` is `undefined`, and two reads skip the check:

- `detectDrmWrapper(resolve(gameExePath))` at ~line 496 reads the lexical path with no realpath containment. This contradicts the precondition it documents.
- `detectExeSteamDrm(appId, drmSource)` at ~line 490 reads the same unchecked path for the CEG scan, because `drmSource` falls back to `resolve(gameExePath)`.

`placeShimForGameInner` validates the path lexically first (T-24-06). The gap is a symlinked exe inside the game folder that points outside it. That is the case 261029-m0u refuses on the launch path.

Latent: nothing live hit it. The no-bottle branch is rare, and both reads are bounded PE header and resource scans that execute nothing.

## Next

Pull 261029-m0u's `containedReal` (`drmScanExe.ts`) out into a shared, exported helper, or add a small exported wrapper that does the realpath containment for a single exe. Use it in the no-bottle branch for both `detectDrmWrapper` and the CEG `drmSource`. A refused or unresolvable exe gives `drmWrapper: undefined` and no `drm` signal, with a `logWarning`. Add a `shimGenerate` test: no bottle, and an exe symlink that escapes its game folder, gets refused and is never read.

## Resolution

2026-10-29: fixed by quick 261029-my4 (code commit 1bff92963). `containedGameExeReal` was exported from drmScanExe.ts; the no-bottle branch of placeShimForGame now scans only the contained real path for both `detectDrmWrapper` and the CEG `detectExeSteamDrm`. A refused or unresolvable exe yields no drmWrapper and no drm, with a logWarning. Tests cover an escaping symlink for both scanners plus a contained control. The branch is practically unreachable, because placeShimForGameInner rejects the same null bottle first; the tests force it with a one-shot spy.

Deliberately left out of scope: `readFileEffectiveArch` in withDrmWrapper and the import scan in placeShimForGameInner still read the lexical exe path (bounded header reads, execute nothing).
