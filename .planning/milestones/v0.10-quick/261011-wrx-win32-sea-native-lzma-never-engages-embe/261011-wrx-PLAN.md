---
phase: quick-261011-wrx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/buildSidecarSea.ts
  - meta/__tests__/buildSidecarSea.test.ts
  - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  - .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts
  - .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/
  - .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md
  - .planning/todos/completed/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md
  # CONDITIONAL on Task 3's measurement (see Task 3 STEP 6):
  - .planning/todos/pending/<YYYY-MM-DD>-win32-native-lzma-extraction-dirs-accumulate-in-temp.md
autonomous: true
requirements:
  - QUICK-261011-wrx

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "For target triple `x86_64-pc-windows-msvc`, `pnpm build:sidecar-sea` embeds `node_modules/lzma-native/prebuilds/win32-x64/liblzma.dll` as a second lzma SEA asset under the key `liblzma.dll`, next to the existing `lzma_native.node` addon asset. The darwin and linux triples embed no DLL. If the DLL is missing for the win32 triple, the build fails with a `COMPILE GATE FAILED` error that names `liblzma.dll` and the triple, the same way a missing addon fails it today."
    - "Inside a SEA, the binding creates ONE private directory with `mkdtempSync` under `os.tmpdir()` (basename `gamelib-lzma-native-<pid>-XXXXXX`, chmod 0o700). On win32 it writes `liblzma.dll` into that directory, then on every platform it writes the addon there, then `process.dlopen`s the addon from there. No lzma file is ever written loose in the shared temp root. A missing SEA asset throws before any directory is created."
    - "In a `finally`, the binding runs `rmSync(dir, { recursive: true, force: true })` on both the success and the failure path. If it throws (on Windows a loaded addon or DLL cannot be unlinked), the error is swallowed. The dlopen error is never masked. The outcome is recorded per isolate as `{ dir, leftover }` under `Symbol.for('gamelib.lzmaNative.extraction')`."
    - "When native decode engages, the loader appends the extraction directory and whether it was removed or LEFT BEHIND to its existing `native lzma-native decoder engaged` logInfo line. That is still exactly one logInfo call. If nothing was extracted (dev or unbundled runs), the line has no extraction fragment."
    - "The targeted suites pass on this Windows box, run by path only: `lzmaNativeBinding.test.ts`, `buildSidecarSea.test.ts` and `decompressPool.test.ts` (baseline 2026-10-11: 3 suites, 121 tests, all pass). `pnpm codecheck`, scoped eslint, scoped `npx prettier --check` and `pnpm find-deadcode` are green."
    - "Task 3 either measured a cold-built win32 SEA binary from committed HEAD over 20 fake-HOME self-test runs (`native-win32`, `--expect-native-workers 2`) and recorded the temp-dir leftovers, or it recorded exactly why it could not, and that run is owed to the operator. A live Steam depot install in the packaged Windows app is owed either way. The SUMMARY never claims it."
    - "If the fix is verified, or the SEA build cannot run here, the todo moves to `completed/` with a `## Resolution` section, and its `severity: major` / `platform: windows` / `ready: code` lines are byte-unchanged. If the measurement refutes the fix, the todo stays in `pending/` with a `## Fix attempt (261011-wrx)` section. `pnpm planning-gates` is 12/12."
  artifacts:
    - path: meta/buildSidecarSea.ts
      provides: "LZMA_NATIVE_DLL_ASSET_KEY, lzmaNativeDllPath(triple), exported resolveNativeLzmaAssets(triple, exists?), buildSeaConfig(addon?, dll?)"
      contains: "LZMA_NATIVE_DLL_ASSET_KEY = 'liblzma.dll'"
    - path: src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
      provides: "mkdtemp private extraction dir, win32 DLL co-extraction, finally-cleanup with swallowed unlink failure, per-isolate extraction record"
      contains: "mkdtempSync"
    - path: src/backend/storeManagers/steam/depot/lzmaLoader.ts
      provides: "Engaged logInfo line carries the extraction dir and its removed/LEFT BEHIND state"
      contains: "gamelib.lzmaNative.extraction"
    - path: src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
      provides: "win32 both-files-same-dir, non-win32 addon-only, cleanup-in-finally, swallowed-unlink, real-filesystem round trip, DLL asset-key drift guard"
    - path: meta/__tests__/buildSidecarSea.test.ts
      provides: "win32 second asset, no DLL on other triples, missing-DLL compile gate, real node_modules sibling-library drift guard"
    - path: .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts
      provides: "261011-mza driver port whose temp census counts gamelib-lzma-native-* directories, not only *.node files"
  key_links:
    - from: "meta/buildSidecarSea.ts LZMA_NATIVE_DLL_ASSET_KEY"
      to: "lzmaNativeBinding.ts LZMA_NATIVE_DLL_SEA_ASSET_KEY (sea.getRawAsset)"
      via: "duplicated literal 'liblzma.dll', two-sided drift test in lzmaNativeBinding.test.ts"
      pattern: "liblzma.dll"
    - from: "lzmaNativeBinding.ts LZMA_NATIVE_WIN32_DLL_FILENAME"
      to: "node.napi.node import table (KERNEL32.dll + liblzma.dll, measured 261011-mza)"
      via: "the extracted DLL must be named exactly liblzma.dll in the addon's own directory"
      pattern: "LZMA_NATIVE_WIN32_DLL_FILENAME"
    - from: "lzmaNativeBinding.ts extraction record"
      to: "lzmaLoader.ts engaged logInfo line"
      via: "globalThis[Symbol.for('gamelib.lzmaNative.extraction')], isolate-scoped; key read from the binding static in decompressPool.test.ts so literal drift turns the loader test red"
      pattern: "gamelib.lzmaNative.extraction"
---

<objective>
The todo `.planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md`
is the spec. Make native LZMA decode actually engage inside the win32-x64 SEA sidecar.

Today the win32 prebuild `node.napi.node` imports a separate `liblzma.dll`. The SEA embeds only the
addon, and `lzmaNativeBinding.ts` extracts that one file loose into `os.tmpdir()`. Windows resolves
the addon's imports from the addon's own directory first. `liblzma.dll` is not there, so `dlopen`
fails with "The specified module could not be found." 261011-mza measured this: 21 of 21 runs,
`nativeWorkers:0`.

The fix has three parts. First, embed `liblzma.dll` as a second SEA asset for the win32 triple
only. Second, extract the addon and the DLL into one private `mkdtempSync` directory. That is
never the shared temp root, because a predictable writable directory next to a loaded addon is a
DLL-planting hole. Third, clean up in a `finally`, swallow the Windows unlink-while-mapped failure,
and surface the leftover in the engaged log line so the operator can measure accumulation.

Purpose: Windows users get the native decode speedup that darwin and linux already have. Today
every Windows install runs pure-JS inside a native-ON build.

Output: the build and runtime changes with their tests, the loader log fragment, a ported
measurement driver, an optional cold-SEA verification run, and the todo closed (or annotated if the
measurement refutes the fix).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md
@.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/261011-mza-SUMMARY.md
@meta/buildSidecarSea.ts
@src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts

Measured at planning time (2026-10-11, this Windows box, HEAD `0ef437006`):

- `node_modules/lzma-native/prebuilds/win32-x64/` contains `electron.napi.node` (816,640 B),
  `liblzma.dll` (150,528 B) and `node.napi.node` (815,616 B). `darwin-arm64/` and `linux-x64/`
  contain only the two `*.napi.node` files, with no sibling library. `win32-ia32/` also ships a
  `liblzma.dll`, but it is not a supported sidecar triple.
- `meta/buildSidecarSea.ts`:
  - `LZMA_NATIVE_ASSET_KEY = 'lzma_native.node'` (L230).
  - `LZMA_NATIVE_ADDON_FILENAME = 'node.napi.node'` (L239).
  - `LZMA_NATIVE_PREBUILDS_ROOT` (L241).
  - `NATIVE_LZMA_REQUIRED_TRIPLES` (L265) is darwin-arm64, linux-x64 and win32-x64.
  - `lzmaNativePrebuildDir()` (L611).
  - `lzmaNativePrebuildPath()` (L638).
  - `resolveNativeLzmaAsset()` (L662) is async, NOT exported, and calls `existsSync`. It throws
    `COMPILE GATE FAILED (D-06)` for a required triple and warns otherwise.
  - `buildSeaConfig(nativeLzmaPath?)` (L745).
  - `writeSeaConfig(nativeLzmaPath?)` (L765).
  - `main()` (L1127) calls `resolveNativeLzmaAsset(triple)` and then `writeSeaConfig(nativeLzmaPath)`.
  - Every export consumed only by `meta/__tests__/` carries the comment pair "Consumed by
    meta/__tests__/buildSidecarSea.test.ts (meta/ scope, invisible to ts-prune)." plus
    `// ts-prune-ignore-next` directly above it. Follow that pattern for every new export, or
    `pnpm find-deadcode` (CI-gated in `.github/workflows/lint.yml`) goes red.
- `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts`:
  - It has NO ES `export` keyword, by design (see its header). Statics hang off the callable that
    is assigned to `module.exports`.
  - It imports only node builtins.
  - The SEA branch (L215-247) writes `nativeAddonTempPath()` (`gamelib-lzma-native-<pid>-<hex>.node`
    loose in `tmpdir()`), `dlopen`s it, then runs `rmSync` in a swallowed `finally`.
  - The dev branch (L249-269) `dlopen`s straight from `node_modules/lzma-native/prebuilds/<platform-arch>/`,
    where the win32 `liblzma.dll` is already a sibling. That is why dev mode engages on Windows.
    Leave the dev branch unchanged.
- `src/backend/storeManagers/steam/depot/lzmaLoader.ts`:
  - The engaged `logInfo` array is at L379-393.
  - The failure `logWarning` is at L398-411.
  - The loader imports `lzma-native`, never the binding. `lzma-native/index.js:9-11` does
    `Object.assign(exports, require('node-gyp-build')(__dirname))`.
  - `build:sidecar` is `esbuild ... --packages=external` with NO node-gyp-build alias. So
    `lzmaNativeBinding.ts` is not in that bundle today. The loader therefore must NOT
    `require`/`import` the binding. The extraction record crosses via a `Symbol.for` key on
    `globalThis`, which is isolate-scoped, exactly as each worker extracts.
- `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` asserts only on the
  `SELFTEST pool=` JSON (`nativeWorkers === size`). It needs NO edit. It cannot run on win32
  (`execFileSync('pnpm')` ENOENT, measured by 261011-mza). On ubuntu CI it is the linux end-to-end
  check of the new mkdtemp path.
- Existing test idioms:
  - The binding test spies `require('node:fs')` members with `jest.spyOn`, because spying the ESM
    namespace throws "Cannot redefine property".
  - Platform is pinned with `Object.defineProperty(process, 'platform', { value, configurable: true })`
    (`src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts:58`). Restore the saved
    descriptor in `afterEach`.
  - Do NOT spy `existsSync`. jest's own module resolution may read it.
- Prettier `--file-info`, measured: all six `src/` and `meta/` paths in `files_modified` report
  `{ "ignored": false, "inferredParser": "typescript" }`. The 261011-mza driver path (and so the
  ported copy under `.planning/`) reports `{ "ignored": true, "inferredParser": null }`.
- Operator box caveats (memory):
  - About 40 jest suites fail locally on Windows for unrelated reasons. Run ONLY the targeted
    suites, by path. Never run bare `npx jest` or `pnpm test`.
  - `git checkout -- <file>` triggers husky post-checkout `pnpm i`. To revert a file, use
    `git show HEAD:<path> > <path>`.
- Never stage the three pre-existing unrelated paths: `.planning/state.json`,
  `.planning/debug/rust-test-ci-missing-sidecar.md` and `.planning/milestone.lock`.
- Commit trailer: end every commit message with the Co-Authored-By line from the session's
  commit-attribution reminder.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): win32 liblzma.dll travels end-to-end, embedded as a second SEA asset by the build and co-extracted with the addon into one private mkdtemp dir before dlopen</name>
  <files>meta/buildSidecarSea.ts, meta/__tests__/buildSidecarSea.test.ts, src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts, src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts</files>
  <behavior>
    Build side, in meta/__tests__/buildSidecarSea.test.ts. Add the new names to the existing import list.
    - B1: lzmaNativeDllPath('x86_64-pc-windows-msvc') equals join('node_modules','lzma-native','prebuilds','win32-x64','liblzma.dll'). It returns undefined for 'aarch64-apple-darwin', 'x86_64-unknown-linux-gnu', 'x86_64-apple-darwin' and 'aarch64-unknown-linux-gnu'.
    - B2: buildSeaConfig(addon, dll) has exactly 3 asset keys: SEA_WORKER_ASSET_KEY, LZMA_NATIVE_ASSET_KEY mapped to addon, and LZMA_NATIVE_DLL_ASSET_KEY mapped to dll. buildSeaConfig(addon) keeps exactly 2 keys and no DLL key; the existing test stays green. buildSeaConfig(undefined, dll) has only the worker key, because a DLL is never embedded without its addon.
    - B3: await resolveNativeLzmaAssets('x86_64-pc-windows-msvc', () => true) deep-equals { addonPath: lzmaNativePrebuildPath(triple), dllPath: lzmaNativeDllPath(triple) }.
    - B4: resolveNativeLzmaAssets('x86_64-pc-windows-msvc', p => !p.endsWith('liblzma.dll')) rejects. The message matches /COMPILE GATE FAILED/ and contains both 'liblzma.dll' and 'x86_64-pc-windows-msvc'.
    - B5: for 'aarch64-apple-darwin' and 'x86_64-unknown-linux-gnu' with an all-true predicate (a jest.fn), dllPath is undefined, and the predicate was never called with a path ending in 'liblzma.dll'.
    - B6: an all-false predicate on the win32 triple still rejects with COMPILE GATE FAILED naming the addon prebuild. This is the existing addon gate, kept.
    - B7 (drift guard against the real node_modules tree, cwd-independent): resolve paths via join(__dirname, '..', '..', lzmaNativePrebuildPath(triple)) and its dirname. For every triple in NATIVE_LZMA_REQUIRED_TRIPLES, readdirSync of that triple's prebuild dir, minus 'node.napi.node' and 'electron.napi.node', must equal exactly ['liblzma.dll'] when lzmaNativeDllPath(triple) is defined, and [] otherwise. An lzma-native upgrade that adds or drops a sibling library turns this red.
    - B8: LZMA_NATIVE_DLL_ASSET_KEY is the literal 'liblzma.dll'.
    Runtime side, in src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts.
    - Update the local LzmaNativeBindingResolver type to the new statics. Capture the REAL host platform in a module-level const before any test pins process.platform.
    - Every test that sets the extraction record deletes globalThis[Symbol.for(LZMA_NATIVE_EXTRACTION_RECORD_KEY)] in afterEach.
    - R1 (process.platform pinned 'win32'; node:sea mocked with isSea true and getRawAsset returning a small ArrayBuffer; spies on mkdtempSync, chmodSync, writeFileSync and rmSync; dlopen stubbed):
      - getRawAsset is called with both LZMA_NATIVE_SEA_ASSET_KEY and LZMA_NATIVE_DLL_SEA_ASSET_KEY.
      - mkdtempSync is called exactly once, with nativeExtractDirPrefix().
      - chmodSync is called with (dir, 0o700).
      - writeFileSync is called exactly twice with mode 0o600. Both targets' dirname equals the mkdtempSync return value. The basenames are exactly 'liblzma.dll' (written first) and LZMA_NATIVE_ADDON_FILENAME (written second).
      - Both writes precede dlopen (invocationCallOrder). The dlopen path equals join(dir, LZMA_NATIVE_ADDON_FILENAME).
    - R2: the same setup pinned 'linux'. getRawAsset is never called with the DLL key. writeFileSync is called exactly once, with the addon, into the mkdtemp dir, and dlopen loads from that dir.
    - R3: on success, rmSync is called exactly once with (dir, { recursive: true, force: true }), after dlopen. When dlopen throws, rmSync is still called once with dir, and the ORIGINAL error is rethrown. When rmSync throws EBUSY on the success path, the binding is still returned and nothing throws. When rmSync throws on the failure path, the dlopen error is not masked.
    - R4: after a success-path call, globalThis[Symbol.for(lzmaNativeBinding.LZMA_NATIVE_EXTRACTION_RECORD_KEY)] deep-equals { dir, leftover: false } when rmSync returns, and { dir, leftover: true } when rmSync throws.
    - R5: pinned 'win32', with getRawAsset throwing for the DLL key only. The call throws, and mkdtempSync is never called, so no directory is created for an asset that is not there.
    - R6 (REAL filesystem; no fs spies; sea mocked; dlopen stubbed with an implementation that captures readdirSync(dirname(path)) and, when the real host is not win32, statSync(dirname(path)).mode and 0o777). Run once pinned 'win32' and once pinned 'linux'.
      - The captured listing is exactly the expected file set: ['liblzma.dll', 'node.napi.node'] sorted for win32, and ['node.napi.node'] for linux.
      - dirname(path) sits directly under os.tmpdir(), and its basename starts with 'gamelib-lzma-native-'.
      - On a POSIX host the captured mode is 0o700.
      - Afterwards existsSync(dir) is false and the record says leftover: false.
      - A finally in the test runs rmSync(dir, { recursive: true, force: true }), so a failing assertion leaks nothing.
    - R7: nativeExtractDirPrefix() starts with tmpdir(), contains String(process.pid), and its basename starts with 'gamelib-lzma-native-'. This replaces the old per-file temp-path test.
    - R8: lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY strictly equals the LZMA_NATIVE_DLL_ASSET_KEY imported from meta/buildSidecarSea. The existing addon-key drift test stays.
    - The existing dir-not-a-gate, dev-branch and memoization tests stay and still pass. Adapt the three existing SEA cleanup tests to the directory (rmSync's first argument is now the mkdtemp dir, not a file).
  </behavior>
  <action>
RED first. Write the B1-B8 and R1-R8 tests against the current code, then run the Task-1 jest command
from `<verify>`. Record the failing count. It must be RED, because the new symbols do not exist
yet. Then implement.

Build side, `meta/buildSidecarSea.ts`. Per todo "Fix surface": the second asset is keyed per triple,
and the build fails loudly.
- Add an exported `LZMA_NATIVE_DLL_ASSET_KEY = 'liblzma.dll'` next to `LZMA_NATIVE_ASSET_KEY`.
  - Its doc comment should say the runtime literal lives in `lzmaNativeBinding.ts`, is duplicated
    because `src/` cannot import `meta/`, and is drift-tested.
  - Add a non-exported `LZMA_NATIVE_WIN32_DLL_FILENAME = 'liblzma.dll'`. Its comment cites the
    261011-mza measurement: the import table of `node.napi.node` names exactly `KERNEL32.dll` and
    `liblzma.dll`.
- Add an exported pure `lzmaNativeDllPath(triple): string | undefined`.
  - It returns `join(LZMA_NATIVE_PREBUILDS_ROOT, lzmaNativePrebuildDir(triple), LZMA_NATIVE_WIN32_DLL_FILENAME)`
    only for `'x86_64-pc-windows-msvc'`, and `undefined` for every other triple, because the darwin
    and linux prebuilds link liblzma statically.
  - It must not read process.platform or process.arch (CR-01 host-vs-target discipline).
- Replace the unexported `resolveNativeLzmaAsset` with an exported async
  `resolveNativeLzmaAssets(triple, exists: (p: string) => boolean = existsSync)` that resolves to
  `{ addonPath: string; dllPath?: string } | undefined`.
  - The addon logic is unchanged, except that it calls `exists` instead of `existsSync`.
  - After the addon is found, if `lzmaNativeDllPath(triple)` is defined and `exists` is false for
    it, then a triple in `NATIVE_LZMA_REQUIRED_TRIPLES` throws `COMPILE GATE FAILED (D-06)`.
    - The message names `liblzma.dll`, the triple and the path.
    - It explains that the addon imports the DLL dynamically, so embedding the addon alone
      reproduces the 261011-mza "The specified module could not be found." fallback.
  - A non-required triple emits one loud `console.warn` in the existing "NATIVE LZMA UNAVAILABLE"
    style and returns `undefined`, embedding neither file, because the addon alone cannot load.
  - Add the "Consumed by ... / ts-prune-ignore-next" comment pair above every new export.
- `buildSeaConfig(nativeLzmaPath?, nativeLzmaDllPath?)`: add `assets[LZMA_NATIVE_DLL_ASSET_KEY]`
  only when BOTH are non-empty strings. Update its doc comment. Thread the second argument through
  `writeSeaConfig`.
- `main()`:
  - Destructure the resolved assets. Keep the existing addon log line.
  - When `dllPath` is set, log
    `[build:sidecar-sea] liblzma.dll companion embedded as SEA asset "liblzma.dll" from <dllPath>`.
    Task 3 greps for this exact substring.
  - Pass both paths into `writeSeaConfig`.

Runtime side, `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts`, per todo "Fix surface"
and the DLL-planting rationale.
- Keep the no-ES-export, builtin-imports-only shape. Do not add a logger import.
- Add these constants, each with a doc comment:
  - `LZMA_NATIVE_DLL_SEA_ASSET_KEY = 'liblzma.dll'`, the SEA dictionary key.
  - `LZMA_NATIVE_WIN32_DLL_FILENAME = 'liblzma.dll'`. It is load-bearing: Windows resolves the
    addon's import BY NAME from the addon's own directory, so this must equal the import-table name.
  - `LZMA_NATIVE_EXTRACTION_RECORD_KEY = 'gamelib.lzmaNative.extraction'`.
- Replace the per-file temp-path builder with `nativeExtractDirPrefix()`, returning
  `join(tmpdir(), 'gamelib-lzma-native-' + process.pid + '-')`.
  - Rewrite its SECURITY note (T-23.1-03-01). Unpredictability and exclusivity now come from
    `mkdtempSync`'s atomic create-new-directory.
  - The per-file random name loose in the shared root is retired. The DLL must sit next to the
    addon, and the shared root is exactly the planting surface.
- Rewrite the SEA branch in this order:
  1. Read the addon raw asset. When `process.platform === 'win32'`, also read the DLL raw asset.
     Do both before any filesystem write, so a missing asset creates nothing.
  2. `dir = mkdtempSync(nativeExtractDirPrefix())`, outside the try.
  3. Inside a try:
     - `chmodSync(dir, 0o700)`. Per gamelib-conventions this is the measured correction: mkdtemp's
       0700 is umask-masked, and chmod restores owner-write. On Windows the per-user temp-root ACL
       is the control, and 0o700 only clears the read-only bit.
     - On win32, write the DLL to `join(dir, LZMA_NATIVE_WIN32_DLL_FILENAME)` with mode 0o600.
     - Write the addon to `join(dir, LZMA_NATIVE_ADDON_FILENAME)` with mode 0o600.
     - `process.dlopen(nativeModule, addonPath)`.
  4. In the finally: `leftover = false`, then `rmSync(dir, { recursive: true, force: true })`
     inside its own try, whose catch sets `leftover = true`. Swallow the error the same way the
     existing success-path rmSync is swallowed, and keep that comment's Windows rationale.
     Then assign `{ dir, leftover }` to `globalThis[Symbol.for(LZMA_NATIVE_EXTRACTION_RECORD_KEY)]`,
     using an `as unknown as Record<symbol, unknown>` cast.
  - Keep the T-23.1-03-04 raw-buffer read-only comment.
  - Keep error propagation and memoization exactly as they are: no catch, and `cachedBinding` is
    set only on success.
- Statics:
  - Attach `LZMA_NATIVE_DLL_SEA_ASSET_KEY`, `LZMA_NATIVE_WIN32_DLL_FILENAME`,
    `LZMA_NATIVE_EXTRACTION_RECORD_KEY` and `nativeExtractDirPrefix`.
  - Drop the old temp-path static and update the `LzmaNativeBindingResolver` interface.
  - Add `mkdtempSync` and `chmodSync` to the `node:fs` import.
- Add a dated 261011-wrx paragraph to the file header: what was measured, and why there is now a
  second file and a private directory.
- Sidecar exit contract (gamelib-conventions): add no timer, watcher, socket or child handle. Every
  call here is synchronous.

GREEN: run the Task-1 jest command until both suites pass. Then run `pnpm codecheck`, the scoped
eslint, `pnpm find-deadcode`, the `--file-info` probe and the scoped prettier check from `<verify>`.

Commit only the four files:
`fix(steam): embed liblzma.dll for win32 SEA and co-extract it with the lzma-native addon into a private mkdtemp dir (261011-wrx)`.
Then run `graphify update .`. `graphify-out/` is gitignored.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts meta/__tests__/buildSidecarSea.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx eslint meta/buildSidecarSea.ts meta/__tests__/buildSidecarSea.test.ts src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts</automated>
    <automated>pnpm find-deadcode</automated>
    <automated>for f in meta/buildSidecarSea.ts meta/__tests__/buildSidecarSea.test.ts src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "IGNORED: $f"; exit 1; }; done && npx prettier --check meta/buildSidecarSea.ts meta/__tests__/buildSidecarSea.test.ts src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts</automated>
    <automated>after commit: G=$(git show --name-only --format= HEAD) && F=$(printf '%s\n' "$G" | sort) && test "$F" = "$(printf '%s\n' meta/__tests__/buildSidecarSea.test.ts meta/buildSidecarSea.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts | sort)"</automated>
  </verify>
  <done>
- The tests were RED before the implementation (the count is recorded in the SUMMARY) and are
  GREEN after.
- Both suites pass on this Windows box, including R6's real-filesystem round trip and B7's real
  `node_modules` sibling-library guard.
- codecheck, eslint, find-deadcode (`unreachable: 46 OK | used-in-module: 0 OK`, or exit 0 if the
  baseline line moved for unrelated reasons) and the scoped prettier check are green.
- One commit holds exactly the four files, and `graphify update .` has run.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The engaged log line names the extraction dir and whether it was removed or LEFT BEHIND, so the operator can measure win32 temp-dir accumulation</name>
  <files>src/backend/storeManagers/steam/depot/lzmaLoader.ts, src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</files>
  <behavior>
    In decompressPool.test.ts, add a new describe next to the existing native-decode-switch describe. It uses the same logger mocks, resetLzmaLoaderForTests() in beforeEach and afterEach, and setNativeLzmaDecodeEnabledForTests(true). Read KEY from require('../depot/lzmaNativeBinding').LZMA_NATIVE_EXTRACTION_RECORD_KEY, the binding's own static, so a literal drift between the binding and the loader turns these red. In afterEach, delete globalThis[Symbol.for(KEY)].
    - L1: set the record to { dir: D, leftover: true } before await loadLzmaModule(). Then logInfo is called exactly once, logWarning never, and the joined message contains D, 'LEFT BEHIND' and 'gamelib-lzma-native-'.
    - L2: with { dir: D, leftover: false }, the joined message contains D and 'removed after load', and does not contain 'LEFT BEHIND'.
    - L3: with no record, the joined message contains neither 'SEA extraction dir' nor 'LEFT BEHIND'. The existing "logInfo exactly once" tests stay green unchanged.
    - L4: a malformed record ('nope', or { dir: 42, leftover: 'x' }) is ignored. loadLzmaModule() still resolves the native decoder, logInfo is called once, and no extraction fragment appears. The loader never rejects, which is a locked requirement.
  </behavior>
  <action>
RED first. Add L1-L4 and run the Task-2 jest command. L1 and L2 must fail, because the loader does
not read the record yet.

In `src/backend/storeManagers/steam/depot/lzmaLoader.ts`:
- Add a private helper `describeNativeExtraction(): string | undefined`.
  - It reads `globalThis[Symbol.for('gamelib.lzmaNative.extraction')]`, using an
    `as unknown as Record<symbol, unknown>` cast.
  - It returns `undefined` unless the value is an object with a string `dir` and a boolean
    `leftover`.
  - Otherwise it returns one of two sentences:
    - When `leftover` is true: "SEA extraction dir <dir> was LEFT BEHIND: Windows cannot unlink a
      loaded addon or the liblzma.dll it maps while this process runs, so each worker of each
      sidecar process that engages native decode leaves one gamelib-lzma-native-* dir in the OS
      temp dir (261011-wrx); count them there to measure accumulation."
    - Otherwise: "SEA extraction dir <dir> was removed after load."
  - Its doc comment must say:
    - The binding writes this key (`lzmaNativeBinding.ts` `LZMA_NATIVE_EXTRACTION_RECORD_KEY`).
    - It is a `globalThis` registry rather than a `require` of the binding, because
      `build:sidecar` bundles with `--packages=external` and no node-gyp-build alias. A static
      require would pull the binding and its try-guarded require of the gitignored
      `lzmaNativeResolvedPaths.generated.cjs` into a bundle graph that does not contain it today.
    - The registry is isolate-scoped, matching the per-worker extraction.
- In `resolveLzmaModule()`'s success path, append the helper's sentence as the last element of the
  existing engaged `logInfo` array, only when it is defined. Keep it to one `logInfo` call, and
  change no existing wording.
- In the failure `logWarning`, extend the "check that the lzma_native.node SEA asset embedded
  correctly" clause to also name the win32 `liblzma.dll` companion asset. That clause is the
  operator's first diagnostic pointer, and a missing DLL was the measured cause.
- Add no timers or handles (exit contract).

GREEN: run the Task-2 jest command until it passes, then codecheck, eslint and prettier from
`<verify>`.

Commit only the two files:
`feat(steam): name the native lzma extraction dir and its removed/left-behind state in the engaged log line (261011-wrx)`.
Then run `graphify update .`.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx eslint src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</automated>
    <automated>for f in src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "IGNORED: $f"; exit 1; }; done && npx prettier --check src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</automated>
    <automated>after commit: G=$(git show --name-only --format= HEAD) && F=$(printf '%s\n' "$G" | sort) && test "$F" = "$(printf '%s\n' src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts | sort)"</automated>
  </verify>
  <done>
- L1 and L2 were RED before the change and are GREEN after.
- `decompressPool.test.ts` and `lzmaNativeBinding.test.ts` pass on this box, and every existing
  loader test is unchanged and green.
- The engaged line is still a single `logInfo` call.
- One commit holds exactly the two files, and `graphify update .` has run.
  </done>
</task>

<task type="auto">
  <name>Task 3: Port the driver (directory-aware temp census), optional cold win32 SEA build plus the 20-run native-win32 arm, then close or annotate the todo</name>
  <files>.planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts, .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/, .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md, .planning/todos/completed/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md</files>
  <precondition>No `gamelib-sidecar-*` or `tauri` process is running, because a running sidecar locks the `.exe` on Windows. Check with `tasklist | grep -i -E 'gamelib|tauri' || echo none`. If one is running, do NOT kill it. Skip STEPs 2-5, which makes the native arm owed, and continue at STEP 6.</precondition>
  <action>
Let OUT = `.planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement`. This
task reuses the 261011-mza Task 2 discipline unchanged:
- a cold build from committed HEAD
- a fresh `createFakeHomeProfile()` per run (two-profile rule: the `decompress-pool` self-test never
  calls `init()`, so isolated-only applies)
- a bounded driver that breaks at the first failure and never retries a failed run

STEP 1, port the driver.
- `cp` `.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts`
  into this task dir. Leave the 261011-mza copy untouched, because it is the record of what that run
  measured.
- Edit the copy with the Edit tool only, because the file contains backslash escapes. Changes:
  - (a) Header: task id 261011-wrx, plus a port note. The temp census now counts EVERY
    `os.tmpdir()` entry whose name starts with `gamelib-lzma-native-`, whether file or directory,
    because 261011-wrx moved extraction into mkdtemp directories. The old `.node` suffix filter
    would read 0 forever and turn the leftover measurement into a vacuous green.
  - (b) Fake-HOME prefix `gamelib-261011-wrx-`.
  - (c) Rename the census function and the column to `tmpExtracts`, and drop the `ADDON_SUFFIX`
    filter.
  - (d) After the run loop, write `OUT/<label>-tmpdir-extracts.txt`. It lists the before names, the
    after names, and the new names (after minus before). For each new entry it records whether it
    is a directory, plus its child file names and byte sizes.
- Keep everything else as it is: per-run fake HOME with `dispose()` in `finally`, the stall timer,
  the SIGKILL, break-on-first-failure, `collectLzmaLogLines`, and the RESULT line.

STEP 2, optional cold build. Run it only if this Windows box can run pnpm build scripts
non-interactively. 261011-mza proved it can.
- Re-run the precondition check.
- Record `git rev-parse HEAD` and `git status --short` in `OUT/build-native-win32.txt`. HEAD must be
  Task 2's commit, and `src/` must be clean.
- Move `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe` into the session scratchpad
  as a backup.
- `rm -f` the other five SEA outputs: `build/main/sidecar.js`, `build/main/sidecar-sea-bundle.js`,
  `build/main/decompressWorker-sea-bundle.js`, `build/sea-config.json` and `build/sidecar-prep.blob`.
  Never delete `build/` wholesale, and never delete `build/main/decompressWorker.js`, which is the
  dev worker.
- Run `pnpm build:sidecar-sea >> OUT/build-native-win32.txt 2>&1` with timeout 600000.
- All six outputs must exist afterwards, which proves the build was cold.
- The build log must contain `liblzma.dll companion embedded as SEA asset "liblzma.dll"`, and
  `build/sea-config.json` must contain `"liblzma.dll"`.
- Then delete the backup.
- If the build fails, or cannot run non-interactively, restore the backup `.exe`, keep the log in
  OUT, skip STEPs 3-5, and record "win32 SEA build not run/failed: <reason>". The native arm is then
  OWED to the operator.

STEP 3, the native arm.
- Run `node meta/runTs.cjs --bundle --platform=node --target=node22 .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts --label native-win32 --runs 20 --expect-native-workers 2 --out .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement`.
- Then count, across the run logs:
  - lines containing `native lzma-native decoder engaged`
  - lines containing `failed to load or smoke-test-decode`, copying any `Cause:` verbatim
  - lines containing `LEFT BEHIND`, and lines containing `removed after load`
- Record the `tmpExtracts` growth per run.

STEP 4, branch on what STEP 3 measured. Never retry a failed run.
- (i) 20/20 pass with the engaged line in every run log: the fix is verified on a real win32 SEA.
- (ii) Any run with `nativeWorkers:0` plus the import-failure warning: the fix is REFUTED. Keep the
  captures, copy `Cause:` verbatim, and do not close the todo (see STEP 6).
- (iii) Any `decode=fail`, a missing decode line, a non-zero exit, a SIGKILL or a stall: recurrence
  class. Keep that run's captures, run nothing further, do not close the todo, and record it
  prominently in the SUMMARY.

STEP 5, temp cleanup.
- Delete ONLY the new `gamelib-lzma-native-*` entries from the after-minus-before list. Their owning
  processes have exited, so Windows can unlink them now.
- Never delete an entry from the before list.
- Append the count and the total bytes deleted to `OUT/native-win32-tmpdir-extracts.txt`.
- Do not touch the built `.exe`.

STEP 6, the todo.
- Branch (i), or STEP 2/precondition skipped:
  - `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` under the
    same filename.
  - Keep every frontmatter line byte-identical, including `severity: major`, `platform: windows`
    and `ready: code`.
  - Append `## Resolution (<date>, quick 261011-wrx)` with:
    - the Task 1 and Task 2 commit hashes and a one-line description of each
    - the unit-suite evidence: RED counts, then GREEN
    - the real-SEA result: either the `RESULT` line, engaged count, `LEFT BEHIND` count and
      tmpExtracts growth per run, plus the bytes per leftover directory; or "not run: <reason>"
    - what is OWED: a live Steam depot install in the packaged Windows app, whose `gamelib.log`
      should show the engaged line with its extraction-dir sentence; the accumulation decision; and,
      if STEP 3 did not run, the cold rebuild plus the native-win32 driver run itself, using the
      exact STEP 3 command
    - the linux note: ubuntu CI's `lzmaNativeSeaRealBuild.test.ts` is the first linux real-SEA run
      of the mkdtemp path
- Branch (ii) or (iii): leave the todo in `pending/`, keep its frontmatter unchanged, and append a
  `## Fix attempt (261011-wrx)` section with the measured result and the verbatim `Cause:`.
- Follow-up todo:
  - File it if STEP 3 ran and the new-entry count is above 0, or if STEP 3 did not run.
  - File it as `.planning/todos/pending/<YYYY-MM-DD>-win32-native-lzma-extraction-dirs-accumulate-in-temp.md`,
    using the execution date.
  - Frontmatter, in this order:
    - `created`
    - `title`
    - `area: steam`
    - `severity: medium`
    - `platform: windows`
    - `ready: human`
    - `found_by: "quick-261011-wrx"`
    - `files: [src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts]`
  - The three triage keys must be bare, lowercase and exact, per gamelib-conventions.
  - Body:
    - the measured numbers (directories per run, bytes per directory)
    - the decision the operator owes:
      - accept, because Windows Storage Sense / Disk Cleanup reclaim stale temp content
      - or a synchronous, bounded sweep in the binding before `mkdtempSync` that removes
        `gamelib-lzma-native-<pid>-*` directories whose pid is not alive (`process.kill(pid, 0)`
        throws ESRCH). That sweep must add no timers and no async work at boot, under the sidecar
        exit contract. Note that pid reuse only makes it skip, never delete live state.
    - any owed live run from the Resolution
  - Reference its path from the Resolution.
- Do not implement any sweep in this task. The todo asked only to measure.

STEP 7, gates and commit.
- Run `pnpm planning-gates` (12/12) and the leak scan from `<verify>`.
- Commit the driver, OUT, the todo move (or annotation) and the conditional follow-up todo, and
  nothing else: `docs(quick-261011-wrx): win32 real-SEA native lzma verification and close the liblzma.dll todo`.
  In branch (ii) or (iii), use `annotate` instead of `close`.
  </action>
  <verify>
    <automated>test -f .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts && grep -q 'gamelib-261011-wrx-' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts && grep -q 'tmpExtracts' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts</automated>
    <automated>if STEP 2 ran: grep -q 'liblzma.dll companion embedded as SEA asset "liblzma.dll"' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/build-native-win32.txt && grep -q '"liblzma.dll"' build/sea-config.json</automated>
    <automated>if STEP 3 ran: grep -E '^RESULT label=native-win32 pass=[0-9]+/20' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/native-win32-driver.txt && grep -q 'src matches HEAD' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/native-win32-driver.txt && test -f .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/native-win32-tmpdir-extracts.txt</automated>
    <automated>branch (i) or skipped: C=.planning/todos/completed/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md && test -f "$C" && test ! -f .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md && grep -q '^## Resolution' "$C" && grep -qx 'severity: major' "$C" && grep -qx 'platform: windows' "$C" && grep -qx 'ready: code' "$C". Branch (ii)/(iii): grep -q '^## Fix attempt (261011-wrx)' .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md</automated>
    <automated>if the follow-up todo was filed: python3 .planning/todos/todo-frontmatter-gate.py</automated>
    <automated>pnpm planning-gates</automated>
    <automated>test -z "$(grep -rIlE 'refresh_?token|access_?token|galaxyUserId|"userId"|"username"|accountName' .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/ 2>/dev/null)"</automated>
    <automated>after commit: F=$(git show --name-only --format= HEAD) && test -n "$F" && test -z "$(printf '%s\n' "$F" | grep -v -E '^\.planning/(quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/|todos/(pending|completed)/)')"</automated>
    <automated>Prettier: omitted by design. Every path this task writes is under `.planning/`, and the 261011-mza driver path measured `{ "ignored": true, "inferredParser": null }`. Re-probe `npx prettier --file-info .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts` to confirm `"ignored": true` before omitting `--check`; a check there would be vacuous.</automated>
  </verify>
  <done>
- The ported driver counts directories.
- Either the cold-built win32 SEA from committed HEAD has a recorded native-win32 result, with the
  engaged, failure and LEFT BEHIND counts and the temp leftovers, or the reason it did not run is
  recorded and the run is stated as OWED to the operator.
- Leftovers created by this task are removed and counted, and the `.exe` is the cold build of
  Task 2's HEAD (or the restored backup).
- The todo is closed with a Resolution (branch (i) or skipped), or annotated (branch (ii) or (iii)),
  with its triage keys byte-unchanged.
- The follow-up todo exists if and only if its trigger fired.
- `pnpm planning-gates` is 12/12, the leak scan is empty, and the commit holds only `.planning/`
  paths.
- The SUMMARY claims no live Steam depot install on Windows. That stays owed to the operator.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SEA blob → filesystem | Embedded native code (the addon and liblzma.dll) is materialized on disk, then mapped into the process |
| shared OS temp root → loader search path | Windows resolves the addon's `liblzma.dll` import by name from the addon's own directory first |
| build tree → shipped binary | The build decides per triple which native files the sidecar carries |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-wrx-01 | Elevation of privilege | lzmaNativeBinding.ts SEA extraction (DLL planting) | high | mitigate | Both files go into a fresh `mkdtempSync` directory, never the shared root. mkdtemp's atomic create-new means no pre-placement is possible. `chmodSync(dir, 0o700)` makes it private on POSIX; on Windows the per-user temp-root ACL applies. Tests R1, R6 and R7 assert the directory, its basename and its 0700 mode. |
| T-261011-wrx-02 | Tampering | lzmaNativeBinding.ts raw SEA buffers | medium | mitigate | `getRawAsset` views are only read, via `writeFileSync` (kept T-23.1-03-04 comment). No write into the blob. |
| T-261011-wrx-03 | Denial of service | Windows temp root (leftover extraction directories) | low | accept | Windows cannot unlink mapped images. Leftovers are measured (Task 3 census plus the engaged-line sentence), and a follow-up todo puts the sweep-or-accept decision to the operator. Storage Sense reclaims temp content. |
| T-261011-wrx-04 | Tampering | meta/buildSidecarSea.ts per-triple assets | medium | mitigate | A missing `liblzma.dll` for the win32 triple is a `COMPILE GATE FAILED` (B4). The B7 drift guard fails when the real prebuild tree's sibling libraries change. |
| T-261011-wrx-05 | Information disclosure | engaged log line in gamelib.log | low | accept | It adds a temp path containing the OS username. The failure warning already logs the temp addon path in `Cause:`, and gamelib.log already holds user paths. No secrets are added. |
| T-261011-wrx-06 | Denial of service | operator's local build tree and sidecar `.exe` (Task 3) | low | mitigate | The precondition requires that no sidecar or tauri process is running. Only the six named SEA outputs are deleted, never `build/` wholesale. The old `.exe` is backed up to the scratchpad and restored if the build fails. |
| T-261011-wrx-07 | Information disclosure | Task 3 measurement captures | low | mitigate | Every run uses a fresh `createFakeHomeProfile()`, disposed in `finally`. The leak scan over OUT must be empty before commit. |
| T-261011-wrx-SC | Tampering | npm/pip/cargo installs | high | mitigate | This plan installs no package. `lzma-native`'s prebuilds are already in the lockfile-pinned tree. Any install would need the package-legitimacy gate plus a blocking human checkpoint. |
</threat_model>

<verification>
- Run the targeted suites by path only. Never run the full jest run on this box:
  - `npx jest src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts meta/__tests__/buildSidecarSea.test.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`
    passes. The baseline before this plan was 3 suites and 121 tests, all passing.
- `pnpm codecheck`, `pnpm find-deadcode`, scoped eslint and scoped `npx prettier --check` over the
  six `src/` and `meta/` paths are green.
- `pnpm planning-gates` is 12/12.
- The win32 real-SEA result (Task 3) is recorded, or stated as owed together with its exact command.
- `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` is unedited. ubuntu CI
  exercises the linux mkdtemp path through it.
</verification>

<success_criteria>
- The win32 SEA build carries `liblzma.dll` as a second asset. darwin and linux carry none. A missing
  win32 DLL breaks the build loudly.
- The SEA binding never writes into the shared temp root. The addon (plus the DLL on win32) lands in
  one private mkdtemp directory, which is removed in a `finally`. A Windows unlink failure is
  swallowed and recorded.
- The engaged log line tells the operator where the extraction directory went and whether it
  survived.
- The todo is closed with an honest Resolution, or annotated if refuted. Anything not verified on
  this box (at minimum the live Windows Steam depot install) is stated as owed, never claimed.
</success_criteria>

<output>
Create `.planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/261011-wrx-SUMMARY.md` when done.
</output>
