---
created: 2026-08-15T08:50:00.000Z
title: "Stop minifying the main process and ship inline sourcemaps"
area: build
needs: code-fix
status: CLOSED
closed: 2026-08-22
closed_by: '38d0dfc71 (build, electron.vite.config.ts); pending->completed rename was swept into f7287f330 by a concurrent session'
severity: trivial
upstream:
  - af67d374e (Heroic v2.22.1 — Don't minify main, and add source maps, #5766)
files:
  - electron.vite.config.ts
---

## Problem

The main process is built minified with sourcemaps disabled outside development, so production
stack traces are unreadable — exactly when you most need them. Upstream fixed this in Heroic
v2.22.1.

## Solution

Port upstream `af67d374e` (`git show af67d374e` — Heroic upstream is git remote `origin`).

Two lines in `electron.vite.config.ts`:

```diff
-      minify: true,
-      sourcemap: mode === 'development' ? 'inline' : false
+      minify: false,
+      sourcemap: 'inline'
```

Cheapest item from the v2.22.1 review — no locale impact, no test rework, one file.

Worth sanity-checking bundle size and startup time after, since un-minifying the main bundle is
not free; if either regresses meaningfully, `minify: false` can be dropped while keeping
`sourcemap: 'inline'`, which is the part that actually buys the readable traces.

## Outcome (2026-08-22)

Ported upstream verbatim — the two lines in the `main` block only. `preload` and `renderer` keep
`minify: true` / dev-only sourcemaps, matching upstream's scope.

`src/backend/main.ts:28` imports `source-map-support/register`, so the inline map is actually
consumed at runtime; this is not dead weight.

### Measurements (`build/main/main.js`, arm64 macOS)

| variant | code | inline map | total | read+V8 compile |
| --- | ---: | ---: | ---: | ---: |
| before — `minify: true`, no map | 482 KB | — | 482 KB | 0.3 ms |
| `minify: true` + inline map | 482 KB | 3,714 KB | 4,197 KB | 2.9 ms |
| **after — `minify: false` + inline map** | 1,049 KB | 3,741 KB | **4,791 KB** | **3.4 ms** |

`build/main` total: 490 KB → 4,840 KB. Build time unchanged (main chunk 866 ms vs 5.63 s baseline
for the whole `electron-vite build`; wall-clock difference is noise).

The fallback this todo suggested — keep `minify: true`, keep only `sourcemap: 'inline'` — was
measured and **rejected**: the map dominates the artifact, so minifying claws back just 594 KB of
4.8 MB (12%) while giving up the readable un-minified frames. Startup cost of the full change is
~3 ms of read + eager compile, negligible against Electron cold start.

### Verification

Probed the shipped artifact with `sourceMapSupport.mapSourcePosition` (the same call its
`prepareStackTrace` hook uses per frame). Three real generated positions resolved to original
TypeScript:

- `main.js:570:7` → `src/backend/images_cache.ts:10:13`
- `main.js:14242:13` → `src/backend/storeManagers/steam/clientSetup.ts:176:12`
- `main.js:1067:7` → `src/backend/online_monitor.ts:136:13`

Negative control: the same probe against the pre-change artifact fails (`no inline
sourceMappingURL`), so the check is not vacuous.

A fourth probe position, `require("source-map-support/register")` at `main.js:70`, does not map —
that line is Rollup-generated `require` glue for the externalized-deps block and has no original
counterpart. Expected, not a gap.

`tsc --noEmit` clean; `prettier --check` and `eslint` clean on the changed file.
