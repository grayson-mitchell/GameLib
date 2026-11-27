---
created: 2026-11-22
title: "Dead imagecache:// branch in the renderer: no backend serves the scheme after D-22"
area: frontend
severity: minor
platform: any
ready: code
source: "86-05 execution (D-22 deleted src/backend/images_cache.ts), 2026-11-22"
files:
  - src/frontend/components/UI/CachedImage/index.tsx
  - src/preload/tauriTransport.ts
---

## Problem

Phase 86 plan 05 (D-22) deleted `src/backend/images_cache.ts` and the `imageFetches` slot of the app
runtime. That module was already dead: its `imagecache://` protocol registration had been a no-op on the
platform stand-in, and nothing imported `getImageFromCache`.

The renderer still carries the consumer side. `CachedImage` (`shouldUseCache`, the `useCache` state and
the `imagecache://` rewrite) and `imageCacheSchemeAvailable()` in `src/preload/tauriTransport.ts`
(hard-coded `false`) guard a branch that can never run under Tauri and now has no backend to serve it
even if the predicate flipped. Their comments also point at the deleted file.

D-22's literal scope was the backend module and the runtime slot, so this was left in place rather than
widened inside a delete-gate plan.

## Direction

Delete the guarded branch: the `useCache` state, the scheme rewrite and the retry that exists only to
recover from it in `CachedImage`, then `imageCacheSchemeAvailable` in `tauriTransport.ts` and its
callers' tests. Fix or drop the comments naming `src/backend/images_cache.ts`. A frontend change, so
check a library render still loads covers and falls back through `fallback` on error.

## Resolution (2026-11-27): the scheme branch is deleted

`CachedImage` no longer carries the scheme state, the rewrite or the retry that existed only to recover from it. An
error now advances straight to the next `fallback` entry, and the component passes the source it is showing to the
`img` element as given. `imageCacheSchemeAvailable` and its doc comment are gone from the preload transport, and no
file under `src/` or `meta/` names the scheme any more.

The fallback chain, the per-src reset and the caller's `onError` are unchanged: the chain is still bounded at the last
entry, a new `src` still resets it, and `onError` still fires on every error. The tests no longer mock the transport.
They assert raw URLs with exact equality, and a comment-stripped source guard pins that `CachedImage` imports nothing
from the preload transport. The jestMock ratchet entry for that test file went from 2 to 1 in the same commit that
removed the mock.

Three files under `src/backend/` still name the deleted `images_cache.ts` on purpose: `infoPortComplete.test.ts` pins
that the file stays deleted, and `diPhaseGates.test.ts` and `portSliceGate.ts` record the floor history of the D-22
deletion. They were not touched.

The Direction asked for a check that a library render still loads covers and falls back on error. The predicate was
hard-coded `false` under Tauri, so the old runtime path was already exactly the new one, and the rewritten unit tests
drive that path: primary, then each fallback in order, bounded. This was verified by tests, not by a live library
render.

Fix commits, by subject because this branch may be rebased on merge:
"refactor(quick-261127-upb): CachedImage renders its source as given, with no cache-scheme branch" and
"refactor(quick-261127-upb): drop the image-cache scheme predicate from the preload transport".
