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
