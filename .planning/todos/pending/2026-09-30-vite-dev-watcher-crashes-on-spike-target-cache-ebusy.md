---
created: 2026-09-30
title: "A cargo build of spike 027 under .planning/ crashes the running `pnpm tauri:dev` Vite dev server with chokidar EBUSY — vite.config.ts server.watch.ignored does not cover spike target-cache dirs"
found_during: Phase 38 sitting 13 (quick 260930-o75, Windows 11, 2026-09-30)
severity: minor
platform: windows
ready: code
area: build/dev-server
files:
  - vite.config.ts
  - .planning/spikes/027-windows-add-child-crosscheck/.gitignore
---

## What happened

During Phase 38 sitting 13, `pnpm tauri:dev` was running from the repo root for the `38-S14` and
`38-S16` sittings. A `cargo build` of spike 027 was started with
`CARGO_TARGET_DIR=.planning/spikes/027-windows-add-child-crosscheck/target-cache`, which is the
spike README's own `## How to Run` recipe, and it crashed the running Vite dev server. chokidar
threw `EBUSY` on
`...\target-cache\debug\deps\spike_027_windows_add_child_crosscheck.exe`, the exe the linker was
still holding open.

## Why

`vite.config.ts` sets `root: '.'`, so the dev watcher walks the whole repo, `.planning/`
included. `server.watch.ignored` (`vite.config.ts:124-126`) is
`['**/src-tauri/target/**', '**/graphify-out/**']`, and nothing else. The comment above it
(`vite.config.ts:101-123`) describes this EBUSY class in detail: on Windows, `fs.watch` on an exe
the linker holds open throws `EBUSY`, and Vite does not handle that FSWatcher error
(`ignorePermissionErrors` does not cover it). `src-tauri/target` and `graphify-out` were each
added after a measured crash. A spike's `target-cache` is a third instance of the same
written-while-serving shape, now measured too.

`target-cache/` is gitignored only by the spike's own `.gitignore`, which does nothing for
chokidar.

## Fix direction

- Add an entry to `server.watch.ignored`. There are two candidates:
  - `'**/target-cache/**'` names the measured directory. That fits the comment's own rule, "Each
    entry below is a MEASURED failure, named as a specific generated directory ... keeping this
    array observation-only is what makes it auditable".
  - `'**/.planning/**'` is broader. The renderer never imports from `.planning/`, and it would
    also cover any future spike that builds somewhere else under it. But it is a wider entry
    than the array's observation-only convention allows, so pick it deliberately, not by
    default.
- Extend the comment block with a dated line for this quick/sitting, in its existing style.
- Verify: `npx prettier --check vite.config.ts`, and `pnpm codecheck`.

## Why minor, and the workaround

This only bites the dev workflow, when a spike is built while the dev server is up. The Tauri
window and sidecar can stay alive while HMR is gone, the "looks healthy" failure the
`graphify-out` comment already describes. Two workarounds exist: stop `pnpm tauri:dev` before
building a spike, or point `CARGO_TARGET_DIR` outside the repo.

## Why `platform: windows`

`EBUSY` on an open exe is Windows `fs.watch` behaviour. The config edit itself can be made
anywhere. Only reproducing the crash needs the Windows machine, which is why `ready: code`.
