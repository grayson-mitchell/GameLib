---
phase: quick-261106-ote
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/chunkDecode.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
  - src/backend/storeManagers/steam/depot/decompressWorker.ts
  - src/backend/storeManagers/steam/depot/decompressPool.ts
  - src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  - .planning/todos/completed/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md
autonomous: true
requirements:
  - TODO-2026-11-05-slim-decode-worker
must_haves:
  truths:
    - "build/main/decompressWorker.js (from pnpm build:decompress-worker-dev) is well under 1 MB (was 14 MB)"
    - "The worker entry's import graph does not include backend/logger, cdnAuth, hostHealth, inflightLimiter, steam-user or axios"
    - "lzmaLoader's once-per-worker native-engaged / fallback log lines still reach gamelib.log, logged by the main thread on the worker's behalf"
    - "With no override and native workers, DecompressPool spawns min(cpus, 4) workers; it grows toward min(cpus, 16) only when a spawned worker reports a non-native decoder"
    - "GAMELIB_DECOMPRESS_POOL_SIZE and opts.size still pin the pool size exactly (no growth)"
    - "Every existing importer of ./decompress and ./lzmaLoader compiles and behaves unchanged (decodeChunk, decompressChunk, sha1, LzmaModule, loadLzmaModule, lzmaDecoderKind, test hooks)"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/chunkDecode.ts"
      provides: "Leaf decoder: decodeChunk, decompressChunk, ChunkDecodeError, LzmaModule (imports only node:crypto, ./crypto, node:zlib, zstddec)"
      exports: ["decodeChunk", "decompressChunk", "LzmaModule"]
    - path: "src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts"
      provides: "Logger-free LZMA loader with an injectable log sink"
      exports: ["loadLzmaModule", "lzmaDecoderKind", "setLzmaLoaderLogSink"]
    - path: "src/backend/storeManagers/steam/depot/lzmaLoader.ts"
      provides: "Main-thread wrapper: installs a backend/logger sink on the core and re-exports it"
  key_links:
    - from: "src/backend/storeManagers/steam/depot/decompressWorker.ts"
      to: "./chunkDecode and ./lzmaLoaderCore"
      via: "static import (no ./decompress, no ./lzmaLoader, no backend/logger)"
      pattern: "from './(chunkDecode|lzmaLoaderCore)'"
    - from: "src/backend/storeManagers/steam/depot/decompressPool.ts"
      to: "worker ready/log messages"
      via: "forwards worker-buffered lzmaLoader log entries to logInfo/logWarning"
      pattern: "logs"
---

<objective>
Implement the todo `.planning/todos/pending/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md`
(it is the spec — read it in full). Spikes 067a/067b measured ~160 MiB RSS per idle decode
worker: a 16-worker pool sat at 2.67 GB before any work. Two causes, fixed in the todo's order:
(1) the 14 MB worker bundle drags in most of the backend through `backend/logger` and
`decompress.ts`'s CDN imports; (2) the pool is `min(cpus, 16)` while native decode keeps only
~0.2 workers busy.

Output: a leaf decoder module, a logger-free LZMA loader core whose worker logs reach the
parent over `postMessage`, a native-aware pool size, tests guarding the bundle size and the
sizing rule, and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md
@src/backend/storeManagers/steam/depot/decompressWorker.ts
@src/backend/storeManagers/steam/depot/lzmaLoader.ts

Load `Skill("gamelib-conventions")` before running verify blocks (formatter rule, fake-HOME rule
for any spawn you add — `decompressWorkerRealBuild.test.ts` already uses `createFakeHomeProfile()`;
keep it that way).

<interfaces>
Facts extracted from the codebase at planning time (line numbers approximate):

decompress.ts (1311 lines)
- imports: node:crypto createHash, ./crypto steamDecrypt, ./hostHealth, ./cdnAuth,
  ./inflightLimiter, `logWarning, LogPrefix` from backend/logger (used only by fetchChunk, ~L1225).
- decoder region, lines ~17-344 and ~431-483: `export interface LzmaModule` (L28),
  `export interface DepotChunk` (L35, CDN/manifest type — stays), non-exported
  `class ChunkDecodeError` (L71), `RAW_BODY_PREVIEW_BYTES` (L105), zstd decoder module type
  (~L108-121), `export async function decompressChunk(...)` (L164; `await import('zstddec')`
  L244, `await import('node:zlib')` L321), `export const sha1` (L346),
  `export async function decodeChunk(encrypted, key, expectedSha, cbOriginal, lzma): Promise<Buffer>` (L431).
- `DECODE_STAGE_ERROR_CODES` + `export function isDecodeStageError` (L1308) duck-type on
  `.code` — they may stay in decompress.ts, or move to the leaf if the code set is defined
  beside ChunkDecodeError; either way decompress.ts must still export isDecodeStageError.
- importers of `../depot/decompress`: decompressPool.ts (decodeChunk), decompressWorker.ts,
  depot.ts, depotErrors.ts, decompressPool.test.ts, depotPrimitives.test.ts, other depot tests,
  and `.planning/spikes/067b-chunk-decode-bench/node-bench.ts` (decompressChunk, LzmaModule).

lzmaLoader.ts (541 lines)
- imports: `logInfo, logWarning, LogPrefix` from backend/logger (L40), `type LzmaModule` from
  ./decompress (L41), `type LzmaNativeStream` from lzma-native.
- exports: `LzmaDecoderKind`, `setNativeLzmaDecodeEnabledForTests`, `lzmaDecoderKind()`,
  `resetLzmaLoaderForTests()`, `loadLzmaModule()`.
- three log calls, all in `resolveLzmaModule()`: logWarning (native disabled, ~L446), logInfo
  (native engaged, ~L477 — load-bearing: its absence in gamelib.log is how a degraded worker is
  diagnosed), logWarning (native load failed, ~L501). All pass `string[]` + `LogPrefix.Steam`.
- decompressPool.test.ts (~L861-946) loads `../depot/lzmaLoader` inside `jest.isolateModules`
  and asserts the mocked `backend/logger` `logInfo`/`logWarning` calls — the wrapper design
  below keeps these green unchanged.

decompressWorker.ts (223 lines)
- imports parentPort, `decodeChunk, type LzmaModule` from ./decompress,
  `loadLzmaModule, lzmaDecoderKind, type LzmaDecoderKind` from ./lzmaLoader,
  `initHeadless as initLogger` from backend/logger (L46; called as `initLogger(true)` inside
  `if (parentPort)`, ~L192, with a long rationale comment ~L147-191).
- exports `DecompressWorkerRequest`, `DecompressWorkerResponse`,
  `DecompressWorkerReady { type: 'ready'; lzmaKind?: LzmaDecoderKind }`, `handleDecodeMessage`.
- tail: `void getLzma().then(() => port.postMessage({ type: 'ready', lzmaKind: lzmaDecoderKind() }))`.

decompressPool.ts (806 lines)
- `const DECOMPRESS_POOL_MAX_WORKERS = 16` (L103), `resolvePoolSizeOverride()` (L149, reads
  `GAMELIB_DECOMPRESS_POOL_SIZE`, returns undefined on invalid).
- constructor (L269): `this.size = opts.size ?? resolvePoolSizeOverride() ?? Math.min(os.cpus().length, DECOMPRESS_POOL_MAX_WORKERS)`;
  `private readonly size: number` (L259).
- `init()` (L388): spawns `this.size` workers; ANY spawn failure → `inlineFallback = true`,
  terminate all, logWarning. `spawnWorker(spec)` (~L420-470) waits for `isReadyMessage`, adds
  to `nativeWorkerSet` when `msg.lzmaKind === 'native'`, then `wireWorker()`; `wireWorker`'s
  message handler returns early on ready messages (L478).
- `stats()` (L749) returns `{ size, ..., inlineFallback, nativeWorkers }`.
- imports `decodeChunk` from ./decompress (for inlineDecode), `loadLzmaModule` from ./lzmaLoader,
  `logWarning, LogPrefix` from backend/logger.
- depot.ts creates `new DecompressPool()` (~L2960, no opts) and shuts it down (~L3802) — no
  edit needed there. decompressPoolSelfTest.ts passes an explicit `size` (pinned, unaffected).

Tests / fixtures
- `__tests__/decompressWorkerRealBuild.test.ts`: beforeAll runs the real
  `meta/buildDecompressWorkerDev.ts` (JEST_WORKER_ID stripped) then forks
  `fixtures/decompressWorkerRealBuildChild.js`, which sends `{ ok: true, ready: msg }` with the
  worker's full ready message. Test name currently says "when loadLzmaModule() first calls backend/logger".
- `__tests__/fixtures/poolTestWorker.js` posts `{ type: 'ready' }` (non-native);
  `poolTestWorkerNative.js` posts `{ type: 'ready', lzmaKind: 'native' }`.
- `decompressPool.test.ts` L564-623: `GAMELIB_DECOMPRESS_POOL_SIZE` override describe block.
- `lzmaNativeSeaRealBuild.test.ts`: cold SEA build + self-test; asserts `nativeWorkers === size`.

Repo gates: `pnpm codecheck` (tsc src + meta), `pnpm lint` (scoped), `pnpm find-deadcode`
(ts-prune with baselines in meta/deadcode-baseline-*.txt — new exports must be used or it fails).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Slim the worker entry — leaf decoder module, logger-free LZMA loader core, logs over postMessage</name>
  <files>src/backend/storeManagers/steam/depot/chunkDecode.ts, src/backend/storeManagers/steam/depot/decompress.ts, src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts, src/backend/storeManagers/steam/depot/lzmaLoader.ts, src/backend/storeManagers/steam/depot/decompressWorker.ts, src/backend/storeManagers/steam/depot/decompressPool.ts, src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts</files>
  <behavior>
    - decompressWorkerRealBuild.test.ts: after the real dev build, `statSync(DEV_WORKER_BUNDLE_PATH).size` is below 1 MiB (1_048_576). This is RED before the change (14 MB).
    - Same suite: the bundle text contains no `src/backend/logger` and no `node_modules/steam-user` module path (esbuild's non-minified path comments make this a cheap import-graph guard; if the dev bundle turns out minified with no path comments, drop this string assertion and keep the size one, and say so in the SUMMARY).
    - Same suite: the forked worker still sends ready with lzmaKind in ['native','pure-js'], AND `ready.logs` is a non-empty array whose first entry's `lines[0]` starts with `lzmaLoader:` (proves the once-per-worker decoder line now travels to the parent).
    - Existing decompressPool.test.ts and depotPrimitives.test.ts pass unchanged (re-exports keep every import path valid; isolated-module lzmaLoader logger assertions still see logInfo/logWarning via the wrapper).
  </behavior>
  <action>
Part (1) of the todo's Solution. Write the RealBuild test assertions first and confirm the size assertion fails, then implement:

a) Create `depot/chunkDecode.ts` and MOVE (not copy) into it from decompress.ts: `LzmaModule`, `ChunkDecodeError`, `RAW_BODY_PREVIEW_BYTES`, the zstd module type, `decompressChunk`, `sha1`, `decodeChunk`, and any private helpers only they use (move `DECODE_STAGE_ERROR_CODES` too if it sits with ChunkDecodeError; export what decompress.ts then needs). Allowed imports in chunkDecode.ts: `node:crypto`, `./crypto`, and the existing dynamic `import('node:zlib')` / `import('zstddec')` — nothing else, in particular no `backend/logger`. Export ChunkDecodeError only if decompress.ts or a test needs it. Keep the existing doc comments with the moved code. In decompress.ts, import what fetchChunk needs from ./chunkDecode and add a re-export (`export { decodeChunk, decompressChunk, sha1 } from './chunkDecode'` and `export type { LzmaModule } from './chunkDecode'`) so every existing importer, including 067b's node-bench.ts, keeps working; add a short header note that the decoder lives in chunkDecode.ts so the worker bundle stays small.

b) `git mv depot/lzmaLoader.ts depot/lzmaLoaderCore.ts` (keeps history), then in the core: drop the backend/logger import; import `type LzmaModule` from ./chunkDecode; define and export `type LzmaLogLevel = 'info' | 'warning'`, `interface LzmaLogEntry { level: LzmaLogLevel; lines: string[] }`, `type LzmaLogSink = (entry: LzmaLogEntry) => void`, and `setLzmaLoaderLogSink(sink: LzmaLogSink): void`. Until a sink is set, entries are buffered in a module array; setting a sink flushes the buffer into it in order, then forwards live — so call order never loses a line. Replace the three logInfo/logWarning calls with sink calls carrying the identical line arrays (LogPrefix is applied by whoever owns the logger). `resetLzmaLoaderForTests()` also clears the buffer and sink.

c) Create a new thin `depot/lzmaLoader.ts` (main-thread entry): imports backend/logger, calls `setLzmaLoaderLogSink` at module scope with a sink mapping 'info' to logInfo and 'warning' to logWarning under `LogPrefix.Steam`, and re-exports the core's public API (`loadLzmaModule`, `lzmaDecoderKind`, `resetLzmaLoaderForTests`, `setNativeLzmaDecodeEnabledForTests`, `type LzmaDecoderKind`). Header comment: main-thread code imports this file; only the worker imports the core. This keeps decompressPool.test.ts's isolateModules logger assertions valid with no edit.

d) decompressWorker.ts: import from ./chunkDecode and ./lzmaLoaderCore only; delete the `backend/logger` import and the `initLogger(true)` call. Inside `if (parentPort)`, before `getLzma()`, install a sink that pushes into a local array until ready is sent and afterwards posts `{ type: 'log', entry }`. Extend `DecompressWorkerReady` with optional `logs?: LzmaLogEntry[]` and add an exported `DecompressWorkerLog { type: 'log'; entry: LzmaLogEntry }`; send the buffered logs on the ready message. Replace the long initLogger rationale comment with a short one: the worker no longer owns a log writer (it pulled the backend into a 14 MB bundle, ~160 MiB RSS per worker, spikes 067a/067b); its log lines go to the parent, which also removes the multi-writer gamelib.log rotation hazard the old `skipInitialArchive` flag existed for. Keep the humankind-depot-full-stall reference so the history stays findable.

e) decompressPool.ts: import `decodeChunk` from ./chunkDecode (inline path), keep `loadLzmaModule` from ./lzmaLoader (main thread). Add `logInfo` to the logger import. In spawnWorker's ready handler, forward each `msg.logs` entry to logInfo/logWarning with `LogPrefix.Steam`; in wireWorker's handler, forward `{ type: 'log' }` messages the same way and return early (alongside the existing ready early-return). One small helper `forwardWorkerLog(entry)` used by both. Validate shape defensively (array, string[] lines) — worker messages are trusted-ish but malformed ones must not throw.

Do not touch meta/esbuildWorkerBundleShared.ts unless the build breaks: the entry path is unchanged, so both dev and SEA bundles shrink automatically.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build:decompress-worker-dev && ls -la build/main/decompressWorker.js && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts && pnpm codecheck && for f in src/backend/storeManagers/steam/depot/chunkDecode.ts src/backend/storeManagers/steam/depot/decompress.ts src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/depot/decompressWorker.ts src/backend/storeManagers/steam/depot/decompressPool.ts src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/storeManagers/steam/depot/chunkDecode.ts src/backend/storeManagers/steam/depot/decompress.ts src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/depot/decompressWorker.ts src/backend/storeManagers/steam/depot/decompressPool.ts src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts</automated>
  </verify>
  <done>build/main/decompressWorker.js is under 1 MiB (record the exact byte count, and the old 14 MB, in the SUMMARY); the worker imports neither ./decompress, ./lzmaLoader nor backend/logger (`grep -nE "from '(\./decompress|\./lzmaLoader|backend/logger)'" src/backend/storeManagers/steam/depot/decompressWorker.ts` prints nothing); the RealBuild, decompressPool, depotPrimitives and depot suites pass; codecheck exits 0; prettier --check passes over all seven paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Native-aware pool size — min(cpus, 4) when native, grow to min(cpus, 16) only if a worker is pure-JS</name>
  <files>src/backend/storeManagers/steam/depot/decompressPool.ts, src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</files>
  <behavior>
    - `decompressPoolSizeFor(8, true)` is 4; `(2, true)` is 2; `(8, false)` is 8; `(32, false)` is 16; `(32, true)` is 4; `(0, true)` is 1 (never below 1).
    - Unpinned pool (no opts.size, no env) with `os.cpus()` mocked to 8 entries and the NATIVE fixture: after init, `stats().size === 4` and `stats().nativeWorkers === 4`.
    - Unpinned pool, cpus mocked to 8, NON-native fixture (poolTestWorker.js): after init, `stats().size === 8` (grew), inlineFallback false.
    - `GAMELIB_DECOMPRESS_POOL_SIZE=3` with the non-native fixture: after init, size stays 3 (override pins, no growth). An explicit opts.size also pins.
    - The existing override describe block (L564-623) keeps passing.
  </behavior>
  <action>
Part (2) of the todo's Solution, sizing from `nativeWorkers` rather than a constant alone (the todo's caution: pure-JS LZMA at ~500 ms/chunk made a 4-worker pool ~2.4x slower in the August humankind-depot-full-stall debug; native is 3 ms/chunk, ~0.2 workers busy).

In decompressPool.ts: add `const DECOMPRESS_POOL_NATIVE_MAX_WORKERS = 4` beside the existing `DECOMPRESS_POOL_MAX_WORKERS = 16` (keep 16 as the pure-JS ceiling) and an exported pure function `decompressPoolSizeFor(cpus: number, allNative: boolean): number` returning `Math.max(1, Math.min(cpus, allNative ? 4 : 16))`. Constructor: if `opts.size` or `resolvePoolSizeOverride()` yields a value, use it and mark the pool pinned (private `sizePinned = true`); otherwise start at `decompressPoolSizeFor(os.cpus().length, true)`. Make `size` mutable (drop `readonly`). In `init()`, after the base spawn succeeds and the pool is not pinned, if `nativeWorkerSet.size < workers.length` compute `target = decompressPoolSizeFor(os.cpus().length, false)` and spawn the extra workers up to target, appending to `workers`/`idle` and updating `size`. A spawn failure during growth must NOT collapse the working base pool to inline: catch, terminate only the failed/partial growth workers, logWarning once (size kept, cause), and continue. Log one logInfo line when growth happens (from/to sizes, nativeWorkers count) so a pure-JS run is visible in gamelib.log. Update the header comment (L2-3) and the DECOMPRESS_POOL_MAX_WORKERS / constructor doc comments to state the new rule and cite spikes 067a/067b's measurements (160 MiB per idle worker; 0.2 workers busy at native speed). `GAMELIB_DECOMPRESS_POOL_SIZE` remains the diagnostic override.

In decompressPool.test.ts add a describe block for the behaviors above. Mock cpus with `jest.spyOn(os, 'cpus')` returning an 8-element array (import `* as os from 'node:os'` in the test; restore in afterEach). If spyOn cannot rebind the namespace export under this jest config, add an internal `cpus?: number` to `DecompressPoolOpts` documented as test-only and use that instead — note which in the SUMMARY. Always `await pool.shutdown()` (or the file's existing teardown helper) so no worker outlives a test. `decompressPoolSizeFor` must be imported by the test so find-deadcode counts it as used.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts && pnpm codecheck && pnpm lint && pnpm find-deadcode && npx prettier --file-info src/backend/storeManagers/steam/depot/decompressPool.ts && npx prettier --file-info src/backend/storeManagers/steam/__tests__/decompressPool.test.ts && npx prettier --check src/backend/storeManagers/steam/depot/decompressPool.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</automated>
  </verify>
  <done>New sizing tests pass alongside the existing override tests; an unpinned native pool on an 8-cpu mock is 4 workers, a non-native one grows to 8, overrides pin; codecheck, lint and find-deadcode exit 0 (if find-deadcode flags new re-exports from Task 1, fix by consuming or un-exporting them — never by adding to the baseline); both --file-info probes report ignored false and prettier --check passes.</done>
</task>

<task type="auto">
  <name>Task 3: Measure against the todo's table, then close the todo</name>
  <files>.planning/todos/completed/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md</files>
  <action>
Run the todo's desk-side Verify steps and record the numbers in the SUMMARY (and the todo's resolution note):

1. RSS probe: `sh .planning/spikes/067a-node-pipeline-stage-profile/build.sh`, then for N in 1, 4, 16 run `SPIKE_SMOKE=1 GAMELIB_DECOMPRESS_POOL_SIZE=$N node .planning/spikes/067a-node-pipeline-stage-profile/state/build/harness.js` and capture `rssAfterInitMiB`; also run once with no override to capture the default pool's size and RSS. Compare with 342 / 817 / 2,668 MiB. If the harness needs network or sign-in in smoke mode, or fails for a reason unrelated to this change, record that and move on — do not modify spike files beyond rebuilding their state/build outputs.
2. Decode correctness: rebuild 067b's bench so it picks up chunkDecode.ts (`./node_modules/.bin/esbuild --bundle --platform=node --target=node22 --format=cjs --packages=external --outfile=.planning/spikes/067b-chunk-decode-bench/state/build/node-bench.js .planning/spikes/067b-chunk-decode-bench/node-bench.ts`), then `PASSES=1 node .planning/spikes/067b-chunk-decode-bench/state/build/node-bench.js`; it must report every chunk's SHA1 matching. If `state/enc/` is absent the first run regenerates it (per its README).
3. Optional, if time allows: `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` (cold SEA build; confirms the SEA worker bundle — same entry — still engages native decode with `nativeWorkers === size`). Record pass/skip/fail.

If steps 1-2 confirm the drop and correctness, close the todo: `git mv .planning/todos/pending/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md .planning/todos/completed/`, then append a `## Resolution` section (match the surrounding corpus's wrap and style; keep the existing frontmatter intact): quick task 261106-ote; bundle size before/after; RSS per pool size before/after; the sizing rule (min(cpus,4) native, grow to min(cpus,16) when a worker is pure-JS, override pins); 067b SHA1 result; and "Optional follow-up: one live native install via 067a's run.sh to confirm throughput stays at the network ceiling and peak RSS drops." If verification fails, leave the todo in pending and report why.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/todos/completed/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md && test ! -f .planning/todos/pending/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md && grep -c '^## Resolution' .planning/todos/completed/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md && pnpm planning-gates && npx prettier --file-info .planning/todos/completed/2026-11-05-slim-the-depot-decode-worker-and-shrink-its-pool.md</automated>
    Formatter: this task writes only a `.planning/` path, which prettier ignores (the --file-info probe above prints `"ignored": true`), so `prettier --check` would be vacuous and is deliberately omitted.
  </verify>
  <done>067a RSS numbers and 067b SHA1 result recorded; todo lives in completed/ with a Resolution section and the optional live-install follow-up noted; planning-gates passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| worker thread → main thread | decode results and (new) log entries cross via postMessage; worker runs our own bundled code on CDN-supplied chunk bytes |
| CDN → decoder | encrypted chunk bytes are untrusted input to chunkDecode.ts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261106-01 | Tampering | chunkDecode.ts decodeChunk | mitigate | Code is moved verbatim: size check then SHA1 gate against manifest `expectedSha`, zstd `cbOriginal` allocation guard preserved; 067b bench re-verifies every chunk SHA1 |
| T-261106-02 | Denial of Service | decompressPool forwardWorkerLog | mitigate | Shape-check log messages (array of string lines, known level) and ignore malformed ones so a bad message cannot throw in the pool's message handler |
| T-261106-03 | Information Disclosure | forwarded worker logs | accept | Only the existing lzmaLoader decoder-status lines cross; no keys, tokens or URLs (unchanged content) |
| T-261106-04 | Denial of Service | smaller pool | mitigate | Growth to min(cpus,16) when any worker is pure-JS; growth failure keeps the base pool instead of collapsing to inline |
</threat_model>

<verification>
- build/main/decompressWorker.js under 1 MiB after `pnpm build:decompress-worker-dev`.
- Scoped jest suites (decompressWorkerRealBuild, decompressPool, depotPrimitives, depot) green.
- `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode` exit 0.
- Scoped `npx prettier --check` over every src path written.
- 067a RSS probe and 067b SHA1 bench recorded.
</verification>

<success_criteria>
- Worker bundle well under 1 MB (from 14 MB) and per-worker idle RSS in the tens of MiB per 067a's probe.
- Default pool is 4 workers on a native machine with ≥4 cores; pure-JS workers trigger growth; override pins.
- lzmaLoader decoder lines still appear in gamelib.log once per worker, via the main thread.
- Todo closed with measurements; live install left as an optional follow-up.
</success_criteria>

<output>
Create `.planning/quick/261106-ote-slim-the-depot-decode-worker-bundle-and-/261106-ote-SUMMARY.md` when done.
</output>
