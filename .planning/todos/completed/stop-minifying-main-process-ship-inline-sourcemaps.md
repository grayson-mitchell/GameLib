---
created: 2026-08-15T08:50:00.000Z
title: "Stop minifying the main process and ship inline sourcemaps"
area: build
needs: code-fix
status: OPEN
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
