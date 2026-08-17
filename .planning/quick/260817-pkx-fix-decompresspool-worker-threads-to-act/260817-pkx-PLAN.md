---
phase: quick-260817-pkx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/buildSidecarSea.ts
  - meta/__tests__/buildSidecarSea.test.ts
  - src/backend/storeManagers/steam/depot/decompressPool.ts
  - src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts
  - src/sidecar/index.ts
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
autonomous: true
requirements: [PKX-01, PKX-02, PKX-03]
must_haves:
  truths:
    - "The packaged SEA sidecar binary spawns real worker_threads for depot chunk decode instead of silently decoding inline on its main thread."
    - "A packaged-binary run can be proven to use workers without a full game install (synthetic decode self-test)."
    - "The dev/Electron sidecar path (node build/main/sidecar.js) is byte-for-byte unchanged in behavior."
    - "The build no longer claims the inline-decode fallback is an accepted tradeoff, because it no longer is one."
  artifacts:
    - path: "meta/buildSidecarSea.ts"
      provides: "Second esbuild bundle of decompressWorker.ts, embedded into the SEA blob as an asset"
      contains: "buildWorkerEsbuildArgv"
    - path: "src/backend/storeManagers/steam/depot/decompressPool.ts"
      provides: "SEA-aware worker resolution (asset source vs __dirname path)"
      contains: "resolveWorkerSpec"
    - path: "src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts"
      provides: "Synthetic VZ/LZMA round-trip proving workers are live in the packaged binary"
      exports: ["runDecompressPoolSelfTest"]
  key_links:
    - from: "meta/buildSidecarSea.ts (sea-config assets)"
      to: "decompressPool.ts resolveWorkerSpec()"
      via: "SEA asset key 'decompressWorker.js'"
      pattern: "decompressWorker\\.js"
    - from: "src/sidecar/index.ts"
      to: "runDecompressPoolSelfTest"
      via: "GAMELIB_SIDECAR_SELFTEST env guard, static import"
      pattern: "GAMELIB_SIDECAR_SELFTEST"
---

<objective>
Make `DecompressPool`'s worker_threads pool actually engage inside the compiled
Node SEA sidecar binary (`src-tauri/binaries/gamelib-sidecar-<triple>`), and
prove it on real hardware.

Purpose: `.planning/debug/humankind-depot-full-stall.md` confirmed (5 live runs
+ direct source read) that the pool has NEVER engaged on the packaged binary —
`resolveWorkerPath()` resolves `path.join(__dirname, 'decompressWorker.js')`,
which only exists in the dev/Electron build; the SEA executable ships no such
companion file, so `new Worker(...)` throws on every spawn, `init()`'s catch
sets `inlineFallback = true` permanently, and every depot chunk decode runs
single-threaded on the sidecar's main thread. This is the confirmed dominant
throughput ceiling behind HUMANKIND taking ~1.5h vs Steam's ~5min, and it
retroactively made the earlier `DECOMPRESS_POOL_MAX_WORKERS` 8->16 fix inert.

Approach (chosen to avoid the cross-platform companion-file problem entirely):
embed the worker bundle **inside the SEA blob as a Node SEA asset**
(`sea-config.json` `assets`), read it at runtime via
`require('node:sea').getAsset('decompressWorker.js', 'utf8')`, and spawn
`new Worker(source, { eval: true })`. No file is shipped next to the binary, so
there is nothing for Tauri `externalBin`/bundle-resources to carry, nothing to
copy per matrix leg, and no `__dirname`/`process.execPath` path resolution to
get wrong per OS. `node:sea` is already used by this codebase
(`isPackagedSidecar()` in `src/backend/sidecar/humbleFlowRegistration.ts`), and
`sea.getAsset` is confirmed present on this project's Node (v26.2.0, engines
`>=22`).

Output: a packaged macOS SEA sidecar that reports `inlineFallback:false` with
live workers and completes a real LZMA decode through a worker thread.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/humankind-depot-full-stall.md
@meta/buildSidecarSea.ts
@src/backend/storeManagers/steam/depot/decompressPool.ts
@src/backend/storeManagers/steam/depot/decompressWorker.ts
@src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
@src/backend/sidecar/humbleFlowRegistration.ts
@src/sidecar/index.ts

<interfaces>
<!-- Contracts the executor needs. Do not go re-derive these from the codebase. -->

meta/buildSidecarSea.ts (current, relevant surface):
- `SEA_BUNDLE_PATH = join('build','main','sidecar-sea-bundle.js')`
- `SEA_CONFIG_PATH = join('build','sea-config.json')`, `SEA_BLOB_PATH = join('build','sidecar-prep.blob')`
- `SIDECAR_ENTRY_PATH = join('src','sidecar','index.ts')`
- `export function buildEsbuildArgv(platform = process.platform): { command, args }`
  Flags today (order matters for the existing test): `--bundle`, `--platform=node`,
  `--target=node22`, `--format=cjs`, `--alias:electron=./src/backend/sidecar/electronStub.ts`,
  `--alias:i18next-fs-backend=i18next-fs-backend/cjs`, `--inject:./meta/sidecarSeaFsShim.ts`,
  `--outfile=<SEA_BUNDLE_PATH>`, `<SIDECAR_ENTRY_PATH>`.
  win32 -> `{ command: process.execPath, args: [esbuildCli, ...flags] }`;
  every other platform -> `{ command: esbuildCli, args: flags }` (esbuild self-optimizes
  `bin/esbuild` into a native binary off win32 — spawning it through node throws).
- `async function bundleForSea()` — COMPILE GATE: non-zero exit OR missing outfile throws.
- `async function writeSeaConfig()` — writes `{ main, output, disableExperimentalSEAWarning: true }`.
- `export async function main()` — order: warn(Pitfall 1) -> resolveTriple -> bundleForSea ->
  writeSeaConfig -> generateSeaBlob -> copyNodeBinary -> injectBlob -> verifyBinaryArch.

decompressPool.ts (current, relevant surface):
- `private resolveWorkerPath(): string` -> `this.workerPathOverride ?? path.join(__dirname, 'decompressWorker.js')`
- `private spawnWorker(workerPath: string): Promise<Worker>` — resolves only on the explicit
  `{type:'ready'}` handshake, never on 'online'.
- `async init()` — spawns `this.size` workers; catch sets `inlineFallback = true` + `logWarning(...)`.
- `private async replaceWorker()` — calls `this.spawnWorker(this.resolveWorkerPath())`.
- `DecompressPoolOpts.workerPath?: string` — test-only override, used by every existing pool test.
- `stats(): { size, busy, idle, queued, inlineFallback }`

decompressWorker.ts: sends `{ type: 'ready' }` on `parentPort` only after its own module graph
has resolved. `handleDecodeMessage()` does `await getLzma()` BEFORE `decodeChunk(...)`, so any
dispatched task forces the `lzma` module to load inside the worker.

src/backend/sidecar/humbleFlowRegistration.ts (~L140-170) — the established `node:sea` access
shape in this repo (try/catch require, `eslint-disable-next-line @typescript-eslint/no-var-requires`,
safe default when `node:sea` is unavailable). Mirror it; do not invent a second style.

src/backend/storeManagers/steam/__tests__/decompressPool.test.ts L43-L101 — `steamEncrypt()`,
`compressAsync()`, `buildVZChunk()`, `buildPKChunk()` fixture builders. Task 2 lifts the
`steamEncrypt` + `compressAsync` + `buildVZChunk` trio into the self-test module verbatim.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Embed the decompress worker bundle into the SEA blob as an asset</name>
  <files>meta/buildSidecarSea.ts, meta/__tests__/buildSidecarSea.test.ts</files>
  <action>
Extend `meta/buildSidecarSea.ts` to produce a SECOND, fully self-contained esbuild
bundle of the depot decompress worker and embed it in the SEA blob as a named asset.

1. Add module constants next to the existing ones:
   `SEA_WORKER_BUNDLE_PATH = join('build','main','decompressWorker-sea-bundle.js')` and
   `DECOMPRESS_WORKER_ENTRY_PATH = join('src','backend','storeManagers','steam','depot','decompressWorker.ts')`.
   Also add `SEA_WORKER_ASSET_KEY = 'decompressWorker.js'` and export it — Task 2's
   runtime `getAsset()` call must use the same literal, and a test asserts they agree.

2. Factor the existing flag list out of `buildEsbuildArgv` into a private
   `seaEsbuildFlags(outfile: string, entry: string): string[]` returning the exact
   same nine flags in the exact same order, with `--outfile=` and the trailing entry
   parameterised. `buildEsbuildArgv` keeps its current signature and output verbatim
   (its existing tests must not need editing). `--packages=external` stays ABSENT —
   re-adding it crashes the SEA runtime with `ERR_UNKNOWN_BUILTIN_MODULE`.

3. Export `buildWorkerEsbuildArgv(platform: NodeJS.Platform = process.platform)`
   returning the same `{ command, args }` shape and the same win32-vs-other command
   split as `buildEsbuildArgv` (win32 runs the CLI through `process.execPath`;
   everywhere else spawns the resolved esbuild binary directly). The worker bundle
   MUST carry the identical `--alias:electron=...`, `--alias:i18next-fs-backend=...`
   and `--inject:./meta/sidecarSeaFsShim.ts` flags — `decompressWorker.ts` imports
   `./decompress`, which reaches `backend/logger`, which reaches the electron stub;
   omitting the alias reproduces Rule-1 fix 2 inside the worker isolate.

4. Add `async function bundleWorkerForSea()` mirroring `bundleForSea()`'s COMPILE GATE
   discipline exactly: throw on a non-zero esbuild exit AND throw on "exit 0 but no
   file emitted at SEA_WORKER_BUNDLE_PATH". Also throw if `DECOMPRESS_WORKER_ENTRY_PATH`
   is missing, matching `bundleForSea()`'s entry-point guard.

5. Extract the sea-config object into an exported pure `buildSeaConfig()` returning
   `{ main: SEA_BUNDLE_PATH, output: SEA_BLOB_PATH, disableExperimentalSEAWarning: true,
   assets: { [SEA_WORKER_ASSET_KEY]: SEA_WORKER_BUNDLE_PATH } }`, and have
   `writeSeaConfig()` serialise that (so a test can assert the asset wiring without
   running a real build). Extend `writeSeaConfig()`'s existing `existsSync` precondition
   to also require `SEA_WORKER_BUNDLE_PATH`, with the same "must run before
   writeSeaConfig()" error shape.

6. In `main()`: call `await bundleWorkerForSea()` immediately after `await bundleForSea()`
   and before `await writeSeaConfig()`. DELETE the `console.warn` Pitfall-1 block at the
   top of `main()` — its claim ("no build/main/decompressWorker.js companion file is
   shipped... accepted throughput regression") becomes false with this change and would
   be actively misleading in build logs. Replace it with a single `console.log` stating
   the worker bundle is embedded as SEA asset `decompressWorker.js` and consumed at
   runtime by `DecompressPool` via `node:sea.getAsset`.

7. Update the file's header doc comment: Pitfall 1 is no longer an accepted tradeoff —
   record the mechanism (SEA asset, not a companion file) and cite
   `.planning/debug/humankind-depot-full-stall.md` as the evidence trail for why it
   mattered.

8. Tests in `meta/__tests__/buildSidecarSea.test.ts` (extend, do not restructure the file):
   - `buildWorkerEsbuildArgv()`'s flags equal `buildEsbuildArgv()`'s flags except the
     `--outfile=` value and the trailing entry path (assert by diffing the two arrays,
     not by re-listing literals — a re-listed literal cannot catch a future flag added
     to only one of the two bundles).
   - the worker argv's entry is the `decompressWorker.ts` path, and its outfile is
     `build/main/decompressWorker-sea-bundle.js`.
   - the worker argv contains no `--packages=external`.
   - both the win32 and non-win32 branches are asserted unconditionally (WR-06 rule:
     never gate a branch assertion on the host platform).
   - `buildSeaConfig().assets` maps exactly `SEA_WORKER_ASSET_KEY` ->
     `SEA_WORKER_BUNDLE_PATH`, and `SEA_WORKER_ASSET_KEY === 'decompressWorker.js'`.
   - WR-10-style source-scan guard: read `meta/buildSidecarSea.ts`, strip comment lines
     (`grep -v`-equivalent in JS: drop lines matching `^\s*(\*|//|/\*)`), and assert the
     remaining executable source contains no `console.warn(` call mentioning
     `inline single-thread`. Before committing, confirm this assertion FAILS against the
     pre-change source (paste the old warn text into a temp string and assert the matcher
     rejects it) — a grep gate that cannot fail on a known-bad input guards nothing.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/buildSidecarSea.test.ts && npx tsc --noEmit && npx eslint meta/buildSidecarSea.ts meta/__tests__/buildSidecarSea.test.ts</automated>
  </verify>
  <done>`buildWorkerEsbuildArgv` and `buildSeaConfig` are exported and tested; `main()` bundles the worker and the sea-config declares the `decompressWorker.js` asset; the misleading Pitfall-1 build warning is gone and a source-scan test proves it cannot come back.</done>
</task>

<task type="auto">
  <name>Task 2: Resolve the worker from the SEA asset at runtime + add a packaged-binary self-test</name>
  <files>src/backend/storeManagers/steam/depot/decompressPool.ts, src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts, src/sidecar/index.ts, src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</files>
  <action>
A. `decompressPool.ts` — replace `resolveWorkerPath()` with a spec-returning resolver.

   - Add `type WorkerSpec = { kind: 'path'; value: string } | { kind: 'source'; value: string }`.
   - `private resolveWorkerSpec(): WorkerSpec`:
     1. `this.workerPathOverride` wins and returns `{ kind: 'path', ... }` — every existing
        pool test passes `workerPath`, so their behavior must be untouched.
     2. Otherwise, if running inside a SEA binary, return
        `{ kind: 'source', value: sea.getAsset('decompressWorker.js', 'utf8') }`.
        Access `node:sea` through a `try/catch` require in the SAME shape as
        `isPackagedSidecar()` in `src/backend/sidecar/humbleFlowRegistration.ts`
        (~L140-170), including its `eslint-disable-next-line` comment; if `node:sea` is
        unavailable, or `isSea()` is false, or `getAsset` throws, fall through to (3).
     3. `{ kind: 'path', value: path.join(__dirname, 'decompressWorker.js') }` — the
        unchanged dev/Electron path.
   - Cache the resolved spec in a private field on first use so `replaceWorker()` does
     not re-read the (potentially multi-MB) asset string on every recovery.
   - `spawnWorker(spec: WorkerSpec)`: `new Worker(spec.value, spec.kind === 'source' ? { eval: true } : undefined)`.
     Everything else in `spawnWorker` (the `{type:'ready'}` handshake contract, the
     'online'-is-not-success reasoning) stays exactly as-is.
   - `init()` and `replaceWorker()` call `resolveWorkerSpec()` instead of
     `resolveWorkerPath()`. `init()`'s log line must not print the asset SOURCE (it is a
     whole bundle) — log `spec.kind` plus, for `path`, the path.
   - Rewrite `init()`'s catch-block `logWarning` text: it currently tells operators this
     is "a known, accepted throughput regression" in a packaged SEA sidecar. After this
     change that is FALSE — a fallback in a packaged binary is now a real defect. New text
     must say so and name the two things to check (the SEA asset `decompressWorker.js`
     and `buildSidecarSea.ts`'s `bundleWorkerForSea` step). Keep the error message, the
     pool size and `spec.kind` in the line.
   - Update `resolveWorkerSpec`'s doc comment to record WHY the asset mechanism was chosen
     over a companion file (no Tauri resource plumbing, no per-triple copy step, no
     `__dirname`/`process.execPath` divergence across OSes) and cite the debug file.

   FALLBACK, only if Task 3's live run proves `{ eval: true }` unusable inside a real SEA
   binary: write the asset once per process to `os.tmpdir()` (mode 0o600, unique name) and
   return `{ kind: 'path', ... }` for it. Do NOT implement both paths speculatively —
   implement `eval` first, and only add the tmpdir path if the hardware run demands it.

B. New `src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts` exporting
   `runDecompressPoolSelfTest(): Promise<number>` (resolves to a process exit code):
   - Lift `steamEncrypt()`, `compressAsync()` and `buildVZChunk()` verbatim from
     `decompressPool.test.ts` L43-L79 (VZ/LZMA, deliberately not PK/zlib — a VZ chunk
     forces the real pure-JS LZMA decoder to run inside the worker isolate).
   - Build ~64KB of deterministic filler bytes, LZMA-compress, wrap as VZ, `steamEncrypt`
     with a `randomBytes(32)` key, compute `sha1(data)` via `../depot/decompress`'s `sha1`.
   - `const pool = new DecompressPool({ size: 2, taskTimeoutMs: 15_000 })`, `await pool.init()`,
     print `SELFTEST pool=` + `JSON.stringify(pool.stats())`.
   - `await pool.decode(encrypted, key, expectedSha, data.length)` inside try/catch; on
     success print `SELFTEST decode=ok bytes=<n> match=<true|false>`, on failure print
     `SELFTEST decode=fail code=<err.code> message=<err.message>`.
   - `await pool.shutdown()` in a `finally`.
   - Return 0 ONLY when all three hold: `inlineFallback === false`, `size === 2` with
     `idle === 2` right after init, and the decoded bytes equal the original. Otherwise 1.
   - SECURITY (T-21-15-02 discipline): never print the key, the ciphertext, or the decoded
     bytes — only lengths, the sha comparison result, and error codes/messages.

C. `src/sidecar/index.ts` — add the self-test entry guard:
   - `import { runDecompressPoolSelfTest } from 'backend/storeManagers/steam/depot/decompressPoolSelfTest'`
     as a STATIC import. Do not use `await import(...)`: ts-jest downlevels dynamic imports
     through jest's registry, so a dynamic-import defect that only exists in the esbuild
     bundle is structurally invisible to the test suite.
   - Before `installUnhandledRejectionGuard()`/`init()`:
     `if (process.env.GAMELIB_SIDECAR_SELFTEST === 'decompress-pool') { void runDecompressPoolSelfTest().then((code) => process.exit(code)); } else { installUnhandledRejectionGuard(); init() }`.
     The RPC loop must NOT start in self-test mode — stdout is the RPC pipe, and the
     self-test writes plain lines to it.
   - Document in the file header that this branch exists so a packaged binary can be
     proven to use worker threads without a real game install.

D. Tests in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` (append; the
   existing 15 must still pass untouched):
   - `jest.mock('node:sea', ...)` returning `{ isSea: () => true, getAsset: () => 'module.exports = {}' }`
     and assert a pool constructed WITHOUT `workerPath` resolves a `source`-kind spec
     (expose `resolveWorkerSpec` via a narrow cast in the test rather than making it public).
   - with `isSea: () => false`, assert it resolves a `path`-kind spec ending in
     `decompressWorker.js`.
   - assert an explicit `workerPath` override still wins over a `isSea: () => true` mock
     (regression guard for every existing test in the file).
   - assert the asset key requested is exactly `decompressWorker.js` (same literal Task 1
     exports as `SEA_WORKER_ASSET_KEY`).
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/decompressPool.test.ts && npx tsc --noEmit && npx eslint src/backend/storeManagers/steam/depot/decompressPool.ts src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts src/sidecar/index.ts</automated>
  </verify>
  <done>`resolveWorkerSpec()` returns a SEA-asset source inside a SEA binary and the unchanged `__dirname` path otherwise; `runDecompressPoolSelfTest()` exists and is reachable via `GAMELIB_SIDECAR_SELFTEST=decompress-pool`; the stale "accepted throughput regression" warning text is gone; all decompressPool tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Live gate — prove workers spawn in the rebuilt macOS SEA binary</name>
  <files>.planning/quick/260817-pkx-fix-decompresspool-worker-threads-to-act/260817-pkx-SUMMARY.md</files>
  <action>
This task is the whole point of the plan: a green jest suite says nothing about the
packaged binary (this project has been burned by exactly that three times). Nothing here
is complete until the compiled binary itself reports live workers.

1. Rebuild: `pnpm build:sidecar-sea` (native build — `resolveTriple()` falls back to
   `hostTriple()` = `aarch64-apple-darwin` on this machine; no cross-arch download path is
   exercised). The build must print the new "embedded as SEA asset" log line and must NOT
   print the deleted Pitfall-1 inline-fallback warning.

2. Run the packaged binary's self-test directly (NOT `node build/main/sidecar.js` — that is
   the dev path and would pass for the wrong reason):
   `GAMELIB_SIDECAR_SELFTEST=decompress-pool ./src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`

3. PASS requires ALL of:
   - exit code 0
   - a `SELFTEST pool=` line whose JSON has `"inlineFallback":false`, `"size":2`, `"idle":2`
   - a `SELFTEST decode=ok ... match=true` line (proves the round trip AND that `lzma`
     loaded inside the worker isolate — `handleDecodeMessage` awaits `getLzma()` before
     `decodeChunk`, so a broken lzma bundle surfaces here as `decode=fail`)
   - the run prints NO `DecompressPool: worker_threads pool failed to initialize` warning
   Capture the literal stdout/stderr into the SUMMARY — do not paraphrase it.

4. If it fails on a worker module/eval error (e.g. the eval'd worker cannot resolve
   something, or `__dirname` inside `[worker eval]` breaks a bundled package), apply Task
   2's documented tmpdir fallback (write the asset to `os.tmpdir()` once per process, spawn
   by path), then repeat steps 1-3 from a clean build. Do not declare success on any
   evidence other than a fresh run of the rebuilt binary.

5. Regression sweep: `npx jest src/backend/storeManagers/steam/`. Expect 33/34 suites; the
   single failure, `depot.finalize.test.ts`, is the pre-existing, already-documented
   JavaScript heap OOM (`Ineffective mark-compacts near heap limit`) unrelated to these
   files — confirm the crash signature matches before dismissing it, and record it.

6. Write the SUMMARY with an explicit KNOWN GAP section:
   - Windows (`x86_64-pc-windows-msvc`) and Linux (`x86_64-unknown-linux-gnu`) release
     matrix legs are UNVERIFIED — single-platform dev machine, no CI run performed here.
   - State the reason for expected portability honestly: the SEA-asset mechanism ships no
     companion file and does no path resolution, so it has no per-OS surface of its own;
     but "no obvious per-OS surface" is not evidence, and the first Windows/Linux release
     build must be checked for the same `SELFTEST pool=` signature before this is
     considered closed on those platforms.
   - Note the follow-up that remains OPEN and out of scope here: per-worker decode speed is
     still bounded by the pure-JS `lzma` package (~5 MB/s single-threaded); this fix
     restores parallelism (up to `min(cores, 16)`), it does not make each decode faster.
   - Note that this fix retroactively re-activates the earlier
     `DECOMPRESS_POOL_MAX_WORKERS` 8->16 change, which was inert on the packaged binary.
   - Note that a real HUMANKIND install has NOT been re-run — the end-user throughput claim
     is unproven until it is.
  </action>
  <verify>
    <automated>pnpm build:sidecar-sea && GAMELIB_SIDECAR_SELFTEST=decompress-pool ./src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin | tee /tmp/pkx-selftest.log && grep -q '"inlineFallback":false' /tmp/pkx-selftest.log && grep -q 'decode=ok' /tmp/pkx-selftest.log && grep -q 'match=true' /tmp/pkx-selftest.log && ! grep -q 'failed to initialize' /tmp/pkx-selftest.log</automated>
  </verify>
  <done>The rebuilt macOS SEA binary runs its self-test to exit 0 with `inlineFallback:false`, live idle workers, and a successful VZ/LZMA decode round trip; the literal output is recorded in the SUMMARY along with the Windows/Linux known gap.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| build pipeline -> shipped binary | Code embedded at build time executes with full sidecar privileges at runtime |
| main thread -> worker isolate | Depot decryption key + encrypted chunk bytes cross this boundary per task |
| self-test env var -> sidecar entry | An env var selects a non-RPC code path in the shipped binary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-PKX-01 | Tampering | worker script load path | mitigate | The worker source is compiled into the SEA blob from repo source at build time and read via `sea.getAsset` — it is no longer loaded from a file sitting next to the executable, removing the writable-adjacent-file load surface the `__dirname` approach would have had if the companion-file route were taken instead |
| T-PKX-02 | Information disclosure | `decompressPoolSelfTest.ts` stdout | mitigate | Self-test prints only byte LENGTHS, a boolean sha/bytes match, and error codes/messages — never the key, ciphertext, or decoded bytes (same T-21-15-02 discipline as `decompressWorker.ts`) |
| T-PKX-03 | Elevation of privilege | `GAMELIB_SIDECAR_SELFTEST` branch | accept | The branch runs a fixed, self-contained synthetic decode against locally-generated random key material and then exits; it accepts no attacker-controlled input, opens no network/IPC surface, and cannot start the RPC loop |
| T-PKX-04 | Denial of service | `new Worker(source, {eval:true})` in SEA | mitigate | `init()`'s existing catch/`inlineFallback` guarantee is preserved unchanged — a failed asset read or eval spawn degrades to inline decode (slow, never broken), and now logs a warning that correctly identifies it as a defect rather than an accepted tradeoff |
| T-PKX-SC | Tampering | package installs | n/a | This plan installs no npm/pip/cargo packages — `node:sea` is a Node builtin, `esbuild`/`postject` are already direct dependencies |
</threat_model>

<verification>
1. `npx tsc --noEmit` clean.
2. `npx eslint` clean on all six changed/added files.
3. `npx jest meta/__tests__/buildSidecarSea.test.ts` — all pass, including the new
   flag-parity, asset-wiring and source-scan guards.
4. `npx jest src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` — the
   pre-existing 15 plus the new `resolveWorkerSpec` cases pass.
5. `npx jest src/backend/storeManagers/steam/` — 33/34 suites; only the known
   `depot.finalize.test.ts` heap OOM fails, crash signature confirmed as the documented
   pre-existing one.
6. LIVE (authoritative): the rebuilt `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`
   self-test exits 0 with `"inlineFallback":false`, `"idle":2`, `decode=ok match=true`, and
   no inline-fallback warning.
</verification>

<success_criteria>
- The compiled macOS SEA sidecar spawns real worker_threads for depot decode, proven by
  the packaged binary's own output, not by any jest result.
- A VZ/LZMA chunk decodes correctly THROUGH a worker inside that binary.
- The dev/Electron path (`__dirname` + `build/main/decompressWorker.js`) is behaviorally
  unchanged, and every pre-existing `decompressPool.test.ts` case passes without edits.
- No source or build output still describes the inline fallback as an accepted tradeoff,
  and a comment-stripped source-scan test (proven to fail on the old text) prevents its
  return.
- The SUMMARY records the Windows/Linux release-matrix legs as an explicit known gap, and
  records that end-user install throughput remains unproven until a real HUMANKIND run.
</success_criteria>

<output>
Create `.planning/quick/260817-pkx-fix-decompresspool-worker-threads-to-act/260817-pkx-SUMMARY.md` when done.
</output>
