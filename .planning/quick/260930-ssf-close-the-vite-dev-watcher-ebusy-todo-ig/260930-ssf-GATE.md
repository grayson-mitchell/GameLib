# 260930-ssf — gate record

BASELINE: RED
POSTFIX: GREEN

**Established by measurement of watcher membership, not by re-observing the crash.** Read the
"what this does and does not establish" section before citing this file.

## How the gate was run

The probe is `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/watcherProbe.mjs`
(committed this time; 260925-re8's probe was scratchpad-only and is lost). It calls vite's
`createServer({ configFile: 'vite.config.ts', mode: 'development' })` and reads
`server.watcher.getWatched()` once the key count is stable across 3 samples 2 s apart. It did
**not** call `server.listen()` (the `--listen` fallback was not needed: the chokidar watcher is
built inside `createServer` itself). So there was no port bind, no dep-optimizer write and no
plugin startup hook. The port configured for the probe is 5199, never 5173. No `cargo build` was
run and no live dev server was exercised or disturbed.

Nothing is passed inline under `server.watch`: vite's `mergeConfig` concatenates arrays, so an
inline `ignored` would silently append to the file's list and void the measurement.

## Measurement — a real vite dev server, same on-disk tree, before and after

vite 6.3.5, `root: '.'`. Values copied verbatim from `evidence/probe-baseline.txt` and
`evidence/probe-postfix.txt`.

| metric                         | baseline (unedited) | post-fix |
| ------------------------------ | ------------------: | -------: |
| total_dirs                     |                2016 |     1498 |
| total_entries                  |               13110 |     9265 |
| target_cache_dirs              |             **519** |    **0** |
| target_cache_entries           |            **3846** |    **0** |
| src_tauri_target_dirs (ctrl)   |                   0 |        0 |
| graphify_out_dirs              |                   0 |        0 |
| planning_dirs (ctrl, excl. tc) |                 716 |      717 |
| watcher_errors                 |                   0 |        0 |
| settled                        |                 yes |      yes |

Settle trajectory (dir count): baseline `1002,1829,2016,2016,2016`; post-fix
`1002,1498,1498,1498`. `watcher_errors: 0` in both runs, but nothing was writing concurrently,
so that zero is not evidence of safety.

## Resolved ignore list in force

Dumped from `server.watcher.options.ignored`, repo root shown as `{repo}`.

Baseline:

```
**/.git/** | **/node_modules/** | **/test-results/** | {repo}/node_modules/.vite/** | **/src-tauri/target/** | **/graphify-out/**
```

Post-fix:

```
**/.git/** | **/node_modules/** | **/test-results/** | {repo}/node_modules/.vite/** | **/src-tauri/target/** | **/graphify-out/** | **/target-cache/**
```

## Why the zero is load-bearing

- The `src-tauri/target` control is 0 in both runs (and `graphify-out` is 0 in both): the ignore
  mechanism works, and the probe can tell a covered subtree from an uncovered one.
- The `.planning` control is above 0 post-fix (717 dirs): the watcher still walks the
  dot-directory, so the `target-cache` zero comes from the ignore entry and not from the watcher
  skipping `.planning`.
- Vite's bundled chokidar builds `_userIgnored = anymatch(list, undefined, ANYMATCH_OPTS)` with
  `ANYMATCH_OPTS = {dot: true}` in `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js`. That
  `dot: true` is why a `**` glob reaches through `.planning`.
- Planning-time model check with the hoisted `anymatch` 3.1.3 (a model, not the watcher): with
  `dot: true` the glob matches the `target-cache` dir and everything beneath it, and not the
  parent spike dir; with `dot: false` the same glob misses the path through `.planning`. The
  real-watcher evidence is the `.planning` control above.

## The pin and its RED proof

`meta/__tests__/viteRendererConfig.test.ts` moved from 43 to 46 tests: the exact-array `toEqual`
pin now lists the three entries, a dedicated case (`ignores spike target-cache dirs in the
dev-server watcher`, run under both modes, also asserting `not.toContain('**/.planning/**')`),
and a source-text guard for the 260930-ssf rationale and `dot: true`.

With only the `target-cache` element line removed from `vite.config.ts` (numstat 0 1), the suite
is `Tests: 4 failed, 42 passed, 46 total`: the exact-array pin and the new case, each under both
modes. The source-text guard stays green because the comment is untouched. `vite.config.ts` was
then restored with `git checkout` and `git diff --quiet` confirmed byte-exact. Output:
`evidence/red-proof.txt`. With the entry present the suite is 46 passed, 46 total.

## Decision OD-1

`'**/target-cache/**'`, the named measured directory, not `'**/.planning/**'`. Each entry in this
array is a measured failure named as a specific generated directory; keeping it observation-only
is what makes it auditable. A wider planning-tree glob would also cover any future spike that
builds elsewhere under `.planning/`, but that is speculation, and it breaks the rule. The exact
`toEqual` pin plus `not.toContain('**/.planning/**')` make any widening a deliberate test edit.

## Coverage

| spike(s)                                 | build target                                                         | covered by                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 025, 027                                 | `CARGO_TARGET_DIR=.planning/spikes/<id>/target-cache`                | the new entry (depth-independent glob). Only 027's dir exists on disk   |
| 013, 016, 019, 020, 021, 022, 024, 029   | `CARGO_TARGET_DIR` pointed at `src-tauri/target`                     | the existing first entry                                                |
| 011 (`parity-probe/`)                    | README recipe `cd parity-probe && cargo build`: `parity-probe/target/` | NEITHER. No crash observed, no such dir on disk. Stated, not fixed    |
| 028                                      | no `Cargo.toml` of its own                                           | n/a                                                                     |

## What this does and does NOT establish

**Does:** vite's dev-server watcher, on the pre-fix config, held 519 dirs / 3846 entries under the
spike 027 `target-cache`, and on the post-fix config holds none, with the controls behaving as
they must.

**Does NOT:** re-observe the EBUSY crash. The crash was not re-reproduced live: no `cargo build`
was run under a live `pnpm tauri:dev`, and no FSWatcher error was produced during this gate. The
crash evidence remains the todo's Phase 38 sitting 13 observation. A reader must not cite this
file as "the crash was reproduced and then went away".

**Re-run trigger:** a Vite or chokidar upgrade that changes ignore-glob matching (in particular
the `dot: true` option) should re-run `watcherProbe.mjs` and confirm `target_cache_dirs: 0` with
`planning_dirs` above 0.
