# 260901-a2w Measurements

Live gate run against `pnpm exec vite build` (not a full Tauri build, per the plan's F6
rationale -- cheap and sufficient). All commands run from the repo root, 2026-09-01.

## Before / after

| | before | after | delta |
|---|---|---|---|
| `check:build-bin-mirror` exit code | 1 (182 build-only entries, capped output) | 0 | -- |
| `build/bin` apparent bytes (Σ `stat().size` over regular files) | 366,874,673 B | 317,967,812 B | **-48,906,861 B (-46.64 MiB)** |
| `public/bin` apparent bytes | 317,967,812 B | 317,967,812 B | 0 (unchanged, as expected -- this task never touches `public/bin`) |
| `build/bin` regular-file count | 489 | 307 | -182 |
| `public/bin` regular-file count | 307 | 307 | 0 |
| `build/bin` symlink count | 12 | 12 | 0 |
| `public/bin` symlink count | 12 | 12 | 0 |
| `diff <(find build/bin -type f | sort) <(find public/bin -type f | sort)` | 182 lines | 0 lines | -182 |
| `diff` of symlink relPath+target sets (build vs public) | 0 lines (already identical, unfixed by this task) | 0 lines | 0 |

`pnpm exec vite build` log confirms both plugins ran in the correct order and neither
starved the other:

```
[prune-stale-helper-binaries] pruned 26 entries, 48906861 bytes freed
...
[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0
```

("26 entries" is the TOP-MOST prune count -- `computePruneSet` collapses each whole stale
directory into one entry rather than listing all 182 files individually; the two numbers
are consistent, not contradictory. `bytesFreed` is the file-level sum: 48,906,861 B, an
exact match to the measured `build/bin` apparent-byte delta above.)

## THE PAIR THIS GATE SUBTRACTS

The saving is:

> **Σ apparent bytes of regular files under `build/bin` BEFORE** minus **the SAME
> quantity AFTER**, on the SAME checkout, with the SAME `public/bin` contents, and with
> no `pnpm download-helper-binaries` run in between.

Measured value: **48,906,861 B = 46.64 MiB** -- exactly matching the plan's predicted
baseline. The post-fix invariant is that `build/bin` and `public/bin` apparent-byte totals
are now EQUAL (delta 0), confirmed above (317,967,812 B on both sides).

## NOT THIS PAIR

Two subtractions were deliberately rejected as the measurement basis:

**(i) `du -sk build/bin` minus `du -sk public/bin`.** Reproduced from the plan's
`<the_du_trap>` baseline (measured on the unfixed tree, before this task's changes):

| tree | `du` delta | apparent-byte delta |
|---|---|---|
| `x64/win32` | +1,028 KiB | IDENTICAL |
| `arm64/win32` | +2,176 KiB | IDENTICAL |
| `x64/linux` | +2,008 KiB | IDENTICAL |
| `arm64/linux` | +2,704 KiB | IDENTICAL |
| (total non-darwin `du` noise) | 7,916 KiB | 0 |

Four trees whose file lists AND apparent-byte totals are byte-identical between
`build/bin` and `public/bin` still show a combined ~7,916 KiB of `du` delta purely from
APFS block-allocation differences between the two copies on disk. A `du`-based gate would
therefore report a ~7.9 MiB phantom residual even after this fix is applied perfectly --
this is the exact failure mode `260901-8rm-MEASUREMENTS.md`'s RETRACTION section records
(a size claim computed from the wrong pair, followed by two successive fabricated
explanations for the resulting phantom gap). This task's gate (`checkBuildBinMirror.ts`)
sums `stat().size` (via an `lstat`-guarded walk) specifically to avoid this trap, and never
shells out to `du`.

**(ii) Any DMG or installed-`.app` delta.** NOT measured here. No Tauri/release build was
made in this task (only `pnpm exec vite build`, per F6). The Tauri bundle copy step adds
its own ~45 MiB of symlink dereferencing on the darwin trees when producing a packaged
artifact (documented in `260901-8rm-MEASUREMENTS.md`'s retraction) -- that inflation is
pre-existing, orthogonal to this task, and this task neither causes nor removes it.

## PREDICTION (unmeasured)

All 182 stale entries are real `.so`/`.dylib` files copied 1:1 by the bundler (not
symlinks), so the shipped saving in a packaged release build should be approximately the
same ~48.9 MB. **This figure is a prediction, not a measurement** -- no release build was
made in this task.

## Mutation proofs (Step D)

The mirror gate passes trivially on an already-correct tree, so its FAILING direction was
exercised in three separate ways to prove it can actually catch a regression, not merely
that it happens to agree with a correct tree.

### D1 -- re-inject one stale file (the `-type f` diff direction)

```
mkdir -p build/bin/arm64/darwin/nile/_internal
: > build/bin/arm64/darwin/nile/_internal/libzstd.1.dylib
pnpm check:build-bin-mirror
```

Result: **exit 1**, output named the exact injected path:

```
[check-build-bin-mirror] FAILED -- 1 issue(s):
  - only in build/bin (regular file): arm64/darwin/nile/_internal/libzstd.1.dylib
```

Restored (`rm build/bin/arm64/darwin/nile/_internal/libzstd.1.dylib`), re-ran the gate:
**exit 0**.

### D2 -- break one symlink (the direction `find -type f` CANNOT see)

Picked the first real link (`build/bin/arm64/darwin/nile/_internal/Python`, target
`Python.framework/Versions/3.12/Python`), removed it and replaced it with a regular
(empty) file:

```
rm build/bin/arm64/darwin/nile/_internal/Python
touch build/bin/arm64/darwin/nile/_internal/Python
pnpm check:build-bin-mirror
```

Result: **exit 1**, naming both the file-kind mismatch AND the symlink mismatch
separately (the gate's checks (a) and (c) both fired on the same path, independently,
proving they are not the same check):

```
[check-build-bin-mirror] FAILED -- 2 issue(s):
  - only in build/bin (regular file): arm64/darwin/nile/_internal/Python
  - symlink only in public/bin: arm64/darwin/nile/_internal/Python -> Python.framework/Versions/3.12/Python
```

Restored (`rm` the regular file, `ln -s Python.framework/Versions/3.12/Python
build/bin/arm64/darwin/nile/_internal/Python`), re-ran the gate: **exit 0**, with
`symlinks: build=12 public=12` and `delta=0`.

### D3 -- the safety guard fires against a live, populated `build/bin`

Unit tests (T16/T17) already prove `assessPublicBin`'s failing direction in isolation;
D3 proves it once more against the REAL, currently fully-populated `build/bin`, not a
synthetic fixture. A throwaway script under the GSD scratchpad directory (deleted
immediately after use, never committed) imported `pruneStaleHelperBinaries` and called
`pruneStaleHelperBinaries('<repo>/build/bin', <empty tmpdir>)` inside a try/catch,
counting `build/bin`'s regular files before and after via `find -type f | wc -l`.

Result:

```
D3: build/bin file count BEFORE = 307
D3: build/bin file count AFTER  = 307
D3: threw = true
D3: message = pruneStaleHelperBinaries: refusing to prune 6 entries from
  "/Users/graysonmitchell/Projects/GameLib/build/bin" -- "<empty tmpdir>" failed its
  population guard:
D3 PASSED: guard threw and file count is unchanged
```

("6 entries" is the top-most prune-set count against the empty stand-in -- with no
`public/bin` counterpart at all, every top-level `build/bin` entry, e.g. `arm64`, `x64`,
`legendary.LICENSE`, collapses to 6 top-level items, not 307 individually. Consistent with
`computePruneSet`'s minimality property, not a discrepancy.)

The guard threw before any delete ran, and the file count is unchanged -- the safety
property holds against the live tree, not just against unit fixtures.

## Guard rails confirmed unmoved

- `vite.config.ts`'s `build.emptyOutDir` is still `false`.
- `preserveRunnerSymlinksPlugin()` is still in the plugins array and still uses
  `closeBundle` (confirmed via the hook-identity assertion added to
  `meta/__tests__/viteRendererConfig.test.ts`, and via the live build log line
  `[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0`).
- `git diff -- package.json | grep -E '^\+' | grep -vE 'check:build-bin-mirror|^\+\+\+'`
  printed nothing -- no dependency was added.
