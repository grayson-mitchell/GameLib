---
created: 2026-09-25T21:40:00+13:00
title: Vite dev watcher also walks `build/` and `public/bin`, both written while the server is up
area: tooling
files:
  - vite.config.ts
  - meta/__tests__/viteRendererConfig.test.ts
  - .planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md
severity: minor
platform: windows
ready: live-gate
found_by: "Measured while gating quick task 260925-re8 on the operator's Windows 11 machine, 2026-09-25 — a by-product of that gate, not an observed crash"
---

# Third and fourth candidates in the `260924-vat` / `260925-re8` EBUSY class — measured, never observed failing

## Read this first — this is a measurement, not a defect report

**No crash has been observed on either path.** This is deliberately filed as
`minor` / `live-gate` for that reason. `260925-re8` declined to add these to
`server.watch.ignored` precisely because every entry in that array is currently a
*measured failure*, and adding one on reasoning alone dilutes the property that
makes the array auditable. That decision stands until a gate arm produces an
EBUSY naming one of these paths.

Do not "fix" this by adding the globs. Reproduce first.

## What was measured

Read-only, via vite's Node API (`createServer` → `listen` →
`server.watcher.getWatched()`) on vite 6.3.5 with the repo's own `vite.config.ts`:

| watched subtree     | dirs |
| ------------------- | ---: |
| `build/`            |  169 |
| `public/bin`        |  present (counted within the 1382 total) |
| `src-tauri/target/` |    0 |
| `graphify-out/`     |    0 (after `260925-re8`) |

Full numbers and method:
`.planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md`.

## Why `build/` is watched at all — the non-obvious part

`resolveChokidarOptions()` (in `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js`)
appends the resolved outDir to `ignored` **only when `emptyOutDir` is true**:

```js
if (emptyOutDir) {
  ignored.push(...[...resolvedOutDirs].map((outDir) => escapePath(outDir) + "/**"))
}
```

`vite.config.ts` sets `emptyOutDir: false`, so that branch never runs and the
build output stays watched. A reader who assumes "vite ignores its own outDir"
is wrong for this repo specifically, and wrong for a reason that is one config
flag away from flipping.

`public/bin` is watched because vite adds `publicDir` as an explicit watch target
(the same `chokidar.watch([root, ...])` call), commented there as "the public
directory might be outside of the root directory".

## Why these are plausible members of the class

Both hold large generated binaries written by steps that can run while a dev
server is up — which is the exact precondition for the `fs.watch`-on-a-file-held-open-for-writing
EBUSY that killed the dev server twice already:

- `build/` — sidecar bundle, `bin/`, `locales/`, SEA prep blob. `pnpm build:sidecar`
  writes here, and `emptyOutDir: false` means it accumulates rather than being
  cleared.
- `public/bin` — downloaded helper binaries (`legendary`, `gogdl`, `nile`), written
  by `download-helper-binaries`. Note the download is tag-idempotent, not
  presence-idempotent, so a re-download rewrites real `.exe` files.

`.exe` files written by a downloader or a bundler are the same shape as the
linker-held `gamelib_shell.exe` that produced `260924-vat`.

## How to gate it

Start `pnpm exec vite` (that is what `beforeDevCommand` runs — no cargo build
needed), then in a second shell run **either**:

- `pnpm build:sidecar` — targets `build/`
- `pnpm download-helper-binaries` (verify the real script name first) — targets `public/bin`

Watch for `EBUSY: resource busy or locked, watch '...'`, `errno: -4082`,
`syscall: 'watch'`, `Emitted 'error' event on FSWatcher instance`, and a non-zero
vite exit. Remember the failure mode from `260925-re8`: vite can die while the
Tauri window and sidecar stay alive, so the app looks healthy with HMR silently
gone — check the vite process's exit, not the window.

## If it reproduces

Add the specific directory (`'**/build/**'` and/or `'**/public/bin/**'`) to
`server.watch.ignored`, extend the in-situ comment with the observation, and
extend the exact-array assertion in
`meta/__tests__/viteRendererConfig.test.ts` (`keeps the watcher ignore list to
measured failures only`) — that test pins the array exactly and will fail until
the addition is deliberate, which is the point.

Do not widen `**/src-tauri/target/**`, and do not restate vite's own defaults
(`.git`, `node_modules`, `test-results`, cacheDir) — the in-situ comment forbids
both, with reasons.
