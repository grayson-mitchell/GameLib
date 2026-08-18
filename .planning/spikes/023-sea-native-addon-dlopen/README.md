---
spike: 023
name: sea-native-addon-dlopen
type: standard
validates: "Given a native .node addon (lzma-native@8.0.6) embedded as a Node SEA asset, when it is extracted with sea.getRawAsset() and process.dlopen()'d from inside a worker spawned via new Worker(source, { eval: true }) in a REAL compiled SEA binary, then the load succeeds and decodes a real-entropy Steam VZ chunk byte-identically to the pure-JS lzma path"
verdict: VALIDATED
related: [002]
tags: [steam, depot, lzma, native, sea, dlopen, worker_threads]
---

# Spike 023: SEA Native Addon `dlopen()` From an Eval'd Worker

## What This Validates

**Given** `lzma-native`'s native `.node` addon embedded as a Node SEA asset,
**when** it is extracted at runtime via `sea.getRawAsset()` and loaded with
`process.dlopen()` from inside a worker spawned via
`new Worker(source, { eval: true })` (this project's actual packaged-SEA
worker-spawn mode, NOT `new Worker(path)`) in a **real compiled SEA binary**,
**then** the load succeeds and the addon decodes a real-entropy Steam VZ
depot chunk byte-identically to the project's current pure-JS `lzma` path.

Secondary: measure the native-vs-pure-JS decode multiplier against REAL Steam
game bytes on this machine (RESEARCH.md's ~47x figure came from a synthetic
text+random payload).

This decides Phase 23.1's central open risk (RESEARCH.md Assumption A1,
rated HIGH): whether the native-addon integration design in plans 23.1-02
through 23.1-05 is viable at all, or whether the phase needs to fall back to
main-thread-only decode / a different packaging strategy / abandonment in
favor of a WASM route.

## Task 1: Package Legitimacy Gate

**Status: APPROVED by human operator.** Confirmed npm listing (v8.0.6 latest,
repo resolves to `github.com/addaleax/lzma-native`, no `postinstall`
script), confirmed the GitHub repo is real and matches the npm listing
(author `addaleax` = Anna Henningsen, former Node.js TSC member), and
accepted the native-code memory-safety risk as scoped in RESEARCH.md's
Security Domain section (mitigated downstream by `decodeChunk()`'s existing
sha1/size integrity gate).

## Task 2: Scaffold + Real-Entropy Fixture + Non-SEA Eval'd-Worker Benchmark

### Install

`lzma-native@8.0.6` was installed with
`npm --prefix .planning/spikes/023-sea-native-addon-dlopen install`, scoped
entirely to this spike directory. `git status --porcelain package.json
pnpm-lock.yaml pnpm-workspace.yaml` was empty both before and after the
install — the repo's own dependency manifests were not touched.

### Prebuild Inventory

Observed by listing `node_modules/lzma-native/prebuilds/` after install (this
replaces RESEARCH.md/PATTERNS.md's ASSUMPTION that the filename is
`lzma_native.node` with an OBSERVED FACT — it is not):

| Triple directory | `.node` filename(s) |
|---|---|
| `darwin-arm64` | `node.napi.node`, `electron.napi.node` |
| `darwin-x64` | `node.napi.node`, `electron.napi.node` |
| `linux-x64` | `node.napi.node`, `electron.napi.node` |
| `linux-arm64` | `node.napi.node`, `electron.napi.node` |
| `win32-x64` | `node.napi.node`, `electron.napi.node`, `liblzma.dll` |
| `win32-ia32` | `node.napi.node`, `electron.napi.node`, `liblzma.dll` |

Every triple ships BOTH a plain-Node NAPI build (`node.napi.node`) and an
Electron-flavored NAPI build (`electron.napi.node`) side by side — plans
23.1-03/04 must resolve `node.napi.node` specifically (the sidecar is a
plain-Node SEA binary, not Electron) and must NOT assume the filename is
`lzma_native.node`; that string is only used below as the SEA **asset key**
(the dictionary key `sea-config.json`'s `assets` map uses), which is
independent of, and does not need to match, the real on-disk prebuild
filename.

Win32 additionally ships a companion `liblzma.dll` beside the `.node` file —
plans 23.1-03/04 must account for this as a second binary to embed/dlopen
correctly on Windows if that triple is pursued; out of this spike's
darwin-arm64 scope to verify further.

### Real-Entropy Fixture

Route taken: **local real game bytes** (not live CDN capture — the live
route was not attempted this spike; a local-bytes fixture was sufficient to
answer this spike's questions without a Steam auth session).

- Source file: `Humankind.app/Contents/PlugIns/libEOSSDK-Mac-Shipping.dylib`
  (a real installed Steam title's compiled binary, 50,968,672 bytes on disk)
- Slice: 1,048,576 bytes (1 MiB) starting at offset 2,097,152 (well past the
  Mach-O header region)
- Compressed with this repo's own pinned `lzma@2.3.2` package to an
  `lzma_alone` stream, then wrapped in the Steam VZ container layout
  (`make-chunk.mjs`)
- Uncompressed size: 1,048,576 bytes
- Compressed (lzma_alone) size: 451,554 bytes
- VZ container total size: 451,563 bytes
- sha1 of uncompressed bytes: `2e461366a896f36a8e47f583f2e79d96c676bb5b`

Fixture written to `fixtures/real-vz-chunk.bin` (gitignored — reproducible
via `node make-chunk.mjs` on a machine with the same Steam library, or any
machine with a large installed Steam title by editing
`CANDIDATE_SOURCE_FILES`).

### Non-SEA Eval'd-Worker Benchmark Result

`node bench-eval-worker.mjs` spawns a worker via
`new Worker(source, { eval: true })` — the exact production packaged-SEA
spawn shape, with no SEA packaging involved yet — decodes the real-entropy
VZ fixture with both `lzma-native` and the pure-JS `lzma` package inside that
worker, and asserts `Buffer.compare(...) === 0` plus a sha1 match against the
fixture's recorded uncompressed sha1.

```json
{"task":"bench-eval-worker","byteIdentical":true,"sha1Match":true,"pureJsMs":86.962667,"nativeMs":15.088375,"speedup":5.763554193211661,"runs":5,"uncompressedSize":1048576}
```

**Result: PASS.** `lzma-native` loads and decodes correctly inside an
eval'd-source worker (non-SEA), byte-identical to the pure-JS path.

**Measured real-chunk speedup: ~5.76x** (median of 5 runs each:
pure-JS 86.96ms, native 15.09ms, for a 1 MiB uncompressed / 451,554-byte
compressed chunk). This is **materially lower than RESEARCH.md's ~47x
synthetic text+random benchmark** — RESEARCH.md's own Assumption A3 flagged
this exact gap ("no one has yet benchmarked... against a real captured Steam
depot LZMA chunk") and this measurement closes it with a real number, not a
better one. A likely explanation (not independently verified this spike):
real compiled-binary bytes have different entropy/compressibility
characteristics than a text+random synthetic mix, which can change the ratio
of time spent in each decoder's inner loop vs. its I/O/stream-plumbing
overhead. **This number is the one Task 4's go/no-go decision must weigh**,
not the synthetic 47x figure.

Full evidence (worker spawn shapes, resolved paths, both decoders' raw
per-run timings): see `run.log`.

## Task 3: Real Compiled SEA Binary — dlopen() From an Eval'd Worker

**Result: VALIDATED.** A real compiled SEA binary was built (esbuild → sea-config →
`--experimental-sea-config` → postject → codesign strip/re-sign, mirroring
`meta/buildSidecarSea.ts`'s own pipeline) and run 10 times. Every run:

```json
{"task":"sea-main-verdict","mode":"eval","isSea":true,"nodeVersion":"v26.2.0","dlopenFromEvalWorker":true,"sha1Match":true,"decodeMs":29.365708,"error":null,"stage":null}
```

- `isSea: true` — confirms the binary genuinely ran as a Single Executable Application, not
  plain `node`.
- `dlopenFromEvalWorker: true` (field present unconditionally on every run, success or
  failure, so a crash cannot be misread as a pass) — `process.dlopen()` of a
  `sea.getRawAsset('lzma_native.node')`-extracted `.node` addon succeeded from inside a
  worker spawned via `new Worker(source, { eval: true })`, the exact production packaged-SEA
  spawn shape.
- `sha1Match: true` — the native-decoded output matches task 2's recorded uncompressed sha1
  exactly.
- `decodeMs`: 25.4–30.3ms across 10 runs (median ~27ms) for the SEA path, vs. ~14–15ms for
  the non-SEA eval'd-worker path (task 2) — SEA-path overhead (mostly the per-call
  `getRawAsset()` + temp-file write + `dlopen()`, which the production design would want to
  do ONCE per worker lifetime, not once per decode) accounts for the difference. This spike's
  harness re-does the extract+dlopen on every worker spawn for simplicity; plans 23.1-03/04
  should dlopen once per worker and reuse the binding for the worker's lifetime.

### Mechanism (as actually built, with one deviation from the plan's literal description)

The core mechanism matches the plan: esbuild-bundle `lzma-native`'s JS wrapper normally while
aliasing `node-gyp-build` (`--alias:node-gyp-build=./binding-shim.cjs`) to a shim that
resolves the binding itself via `sea.getRawAsset()` + `process.dlopen()` (SEA) or a direct
`process.dlopen()` of the on-disk prebuild (dev). `sea-config.json`'s `assets` map has
exactly two keys: `worker.js` and `lzma_native.node`.

**One load-bearing finding not anticipated by the plan text:** esbuild does not preserve each
bundled source file's own `__dirname` — once `lzma-native/index.js` and `binding-shim.cjs`
are bundled into one output file, EVERY `__dirname` reference inside that bundle reflects the
single OUTPUT file's own location at runtime, not each file's original on-disk directory.
Confirmed two ways: (1) a minimal two-file esbuild repro (a nested module's own `__dirname`
tracked the *outfile's* directory and changed when the outfile moved, not the nested file's
source directory); (2) directly inside this spike's real bundle — `binding-shim.cjs`'s
`resolveNativeBinding(dir)` logged `dir="."` when called from inside the compiled SEA
binary's eval'd worker (an eval'd worker has no backing file at all, so `__dirname` there
degenerates to `.`). This means the plan's literal "Dev branch: compute
`<lzma-native package root>/prebuilds/...`" step **cannot use the `dir` argument
`node-gyp-build`'s caller passes in** — that argument is not trustworthy post-bundle. Fix
applied: `build-sea.mjs` resolves `lzma-native`'s real package root and observed prebuild
filename at BUILD TIME (before esbuild ever runs) and writes them into a small generated CJS
data module (`resolved-paths.generated.cjs`) that `binding-shim.cjs` requires directly — a
plain data require has no `__dirname` dependency of its own, so it survives bundling intact.
Carried forward to `.planning/spikes/MANIFEST.md`'s Requirements as a load-bearing rule for
plans 23.1-03/04 (the production `binding-shim`/`lzmaLoader.ts` equivalent must NOT derive its
prebuild-resolution path from `__dirname` inside the bundled module either).

The SEA main script embeds the task-2 fixture (VZ chunk bytes) as a base64 string literal in
a second generated file (`fixture-embedded.generated.cjs`), required by `sea-main.cjs` and
compiled directly into the SEA blob's `main` script — this keeps `sea-config.json`'s
`assets` map at exactly the two keys the plan's acceptance criteria require (a third
"fixture.bin" asset was deliberately avoided).

`process.dlopen()` succeeding on the first attempt meant the plan's REFUTED-path branch
(control runs isolating SEA vs. eval'd-worker vs. native-addon as the responsible variable)
was not needed — `sea-main.cjs` still implements both controls (`--argv[2]=main-thread` /
`file-worker`) for completeness and future debugging, but they were not exercised this spike.

Full evidence (all 10 runs' JSON verdict lines, `sea-config.json` contents, binding-shim's
per-run `[binding-shim]` diagnostic lines): see `run.log`.

## Task 4: Go/No-Go Decision

**Decision: `proceed`** — verdict VALIDATED. Selected by the human operator (relayed via the
orchestrator) after reviewing Task 3's evidence.

Rationale, as given:
- RESEARCH.md Assumption A1 (HIGH risk) is now a measured VALIDATED fact on darwin-arm64:
  `process.dlopen()` of a SEA-embedded native addon succeeds from inside a
  `{ eval: true }`-spawned worker in a real compiled SEA binary, byte-identical output,
  10/10 runs.
- The real-chunk speedup (~5.8–6.6x) is materially below RESEARCH.md's ~47x synthetic
  estimate, but still a clear, non-marginal win over the current pure-JS path (~87–99ms →
  ~14–30ms per ~1 MiB chunk) — not the `proceed-anyway` scenario's "marginal speedup" concern.

Plans 23.1-02 through 23.1-05 **execute as written**, carrying forward two corrected details
from this spike:
1. The real prebuild filename is `node.napi.node`, **not** `lzma_native.node` — that string
   remains valid only as the SEA asset-map key (`sea-config.json`'s `assets` dictionary key),
   independent of the on-disk filename it was embedded from.
2. The SEA-aware binding shim / `lzmaLoader.ts` equivalent in plans 23.1-03/04 must resolve
   `lzma-native`'s package root **at build time**, not via a runtime `__dirname` reference
   inside the bundled module — esbuild flattens `__dirname` for every file merged into one
   output bundle to that output file's own location (confirmed empirically this spike; see
   Task 3's Mechanism section). The same fix this spike applied (bake the resolved path into
   a small generated data module the runtime code plainly `require()`s) is the pattern to
   reuse in production.

Additionally carried forward: linux-x64/win32-x64 native-prebuild loading remains
**UNVERIFIED** (RESEARCH.md Assumption A2) — this spike ran on darwin-arm64 only. Those two
triples stay on the existing pure-JS `lzma` fallback path until CI independently proves the
native path loads correctly there; this is the existing, already-implemented safety net
(`DecompressPool`'s inline-fallback discipline), not new scope.

## Files

| File | Role |
|---|---|
| `package.json` | private spike package, exactly one dependency: `lzma-native@8.0.6` (exact-pinned) |
| `make-chunk.mjs` | builds `fixtures/real-vz-chunk.bin` from real game bytes |
| `bench-eval-worker.mjs` | non-SEA eval'd-worker benchmark (task 2) |
| `binding-shim.cjs` | (task 3) node-gyp-build replacement: getRawAsset()+dlopen() in SEA, direct dlopen() in dev |
| `sea-worker-entry.cjs` | (task 3) the worker's bundled source, decodes the fixture via lzma-native |
| `sea-main.cjs` | (task 3) SEA main entry: reads the bundled worker back out, spawns it eval'd |
| `build-sea.mjs` | (task 3) miniature build pipeline mirroring `meta/buildSidecarSea.ts` |
| `run.log` | dual-sink forensic evidence log (all invocations, appended) |

## Investigation Trail

1. Task 1's package-legitimacy checkpoint approved by the human operator
   before any install ran.
2. Scaffolded the spike directory per `.planning/spikes/CONVENTIONS.md`;
   installed `lzma-native@8.0.6` scoped to the spike dir only
   (`npm --prefix ... install`); confirmed the repo's own `package.json`/
   `pnpm-lock.yaml`/`pnpm-workspace.yaml` were untouched.
3. Inventoried the installed prebuilds — found the assumed
   `lzma_native.node` filename does NOT exist on disk; the real filename is
   `node.napi.node` (plus a separate `electron.napi.node` variant per
   triple, an assumption-correcting finding for plans 23.1-03/04).
4. Built a real-entropy VZ fixture from a 1 MiB slice of an actual installed
   Steam title's compiled binary (`Humankind`'s `libEOSSDK-Mac-Shipping.dylib`),
   compressed with this repo's own pinned `lzma@2.3.2`.
5. Ran the non-SEA eval'd-worker benchmark: `lzma-native` decodes the real
   fixture correctly (byte-identical + sha1-match) inside a
   `new Worker(source, { eval: true })` spawn. Measured speedup ~5.76x —
   well below the 47x synthetic figure, recorded as the real number to carry
   forward.
