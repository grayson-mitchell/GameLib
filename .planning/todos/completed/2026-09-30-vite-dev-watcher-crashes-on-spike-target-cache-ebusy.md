---
created: 2026-09-30
title: "A cargo build of spike 027 under .planning/ crashes the running `pnpm tauri:dev` Vite dev server with chokidar EBUSY — vite.config.ts server.watch.ignored does not cover spike target-cache dirs"
found_during: Phase 38 sitting 13 (quick 260930-o75, Windows 11, 2026-09-30)
severity: minor
platform: windows
ready: code
status: RESOLVED
resolved: 2026-09-30
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

## Result (quick-260930-ssf, 2026-09-30)

Added `'**/target-cache/**'` to `server.watch.ignored` in `vite.config.ts` (decision OD-1), with a
dated rationale paragraph in the existing comment block. It names the measured directory rather
than `'**/.planning/**'`: a wider entry breaks the array's observation-only rule, and the
renderer never imports from `.planning/`. The list is now exactly
`['**/src-tauri/target/**', '**/graphify-out/**', '**/target-cache/**']`.

Measured on a real Vite 6.3.5 dev server (`createServer`, no `listen()`, read-only, same on-disk
tree): before the edit the watcher held 519 dirs / 3846 entries under `target-cache`; after it,
0 dirs / 0 entries. Controls: `src-tauri/target` is 0 in both runs, so the probe can tell covered
from uncovered; the `.planning` control (target-cache excluded) is 716 before and 717 after, so
the watcher still walks the dot-directory and the zero comes from the entry. The glob works
through `.planning` because Vite's bundled chokidar matches ignore globs with `dot: true`.

The jest pin `meta/__tests__/viteRendererConfig.test.ts` moved from 43 to 46 tests. Removing the
entry turns it red at 4 failed / 42 passed / 46 total; `vite.config.ts` was then restored
byte-exact.

The EBUSY crash was not re-reproduced live: no `cargo build` was run under a live
`pnpm tauri:dev`. The evidence is watcher membership on a real Vite dev server, not a crash. The
crash evidence remains the sitting-13 observation above.

Coverage: spikes 025 and 027 (which build into a `target-cache`) are covered. Spike 011's
`parity-probe/target/` is covered by no entry; no crash has been observed there, so it was not
added.

Full record: `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md`.

## Resolution

Fixed by 91a9ee0ff (the `vite.config.ts` entry, rationale, probe and before/after evidence) and
pinned by 0719c7c5b (the jest pin, its RED proof and the gate record). Gate record:
`.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md`.
