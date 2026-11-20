# Phase 66: Backend DI replacing module-level singletons - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 22 (new + modified groups)
**Analogs found:** 20 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/process/runner.ts` (+`runnerTypes.ts`) | service (leaf) | request-response + streaming | `src/backend/storeManagers/steam/bridge/drm/boundedListing.ts` + `utils.ts:990 spawnAsync` | role-match (consolidation) |
| `src/backend/process/registry` (absorbs trackedChildren / longLivedChildren) | utility/registry | event-driven | `src/backend/trackedChildren.ts`, `src/backend/longLivedChildren.ts` | exact (absorbed) |
| `src/backend/process/clock.ts` | utility | event-driven (timers) | `boundedListing.ts` unref'd timer idiom | partial |
| `src/backend/process/context.ts` (AppContext, slices) | config/types | transform | `MonitorDeps` in `storeManagers/steam/steamDownloadMonitor.ts` | partial |
| `src/backend/testUtils/scriptedRunner.ts` | test util | request-response | `storeManagers/gog/e2eMock.ts` (stub matching) | role-match |
| `src/backend/testUtils/realRunner.ts` | test util | file-I/O/spawn | `src/backend/testUtils/fakeHomeProfile.ts` | exact base |
| `src/backend/testUtils/fakeClock.ts`, `testContext.ts` | test util | event-driven | `fakeHomeProfile.ts` (factory + `dispose`) | partial |
| `meta/backendDiCeilings.cjs` + `backendDiCeilingsBaseline.json` | utility (gate) | batch | `meta/steamLineCeiling.cjs` + `steamLineCeilingBaseline.json` | exact |
| `meta/__tests__/backendDiCeilings.test.ts`, `backendDiCeilingsWiring.test.ts` | test | batch | `meta/__tests__/steamLineCeiling.test.ts`, `steamLineCeilingWiring.test.ts` | exact |
| `package.json`, `.github/workflows/lint.yml`, `.husky/pre-push` | config | -- | the `steam-line-ceiling` entries | exact |
| `.dependency-cruiser.cjs` (child_process rule) | config | -- | `launcher-only-via-store-managers-index` rule | exact |
| `eslint.config.mjs` (child_process ban) | config | -- | `no-restricted-imports` block (line 59) + runnerLiteral scoped block | exact |
| `sidecar/bootstrap.ts` | boot/controller | request-response | itself (guards lines ~191-283, `init` ~789) | self |
| `storeManagers/index.ts` | factory | CRUD | itself (maps at lines 31-38, hooks 60-110) | self |
| `sidecar/*FlowRegistration.ts` (22) | route registration | request-response | `appShellFlowRegistration.ts` | self |
| `launcher.ts`, `utils.ts` | service | streaming/spawn | themselves (`runWineCommand` ~1640, `callRunner` ~1870, `spawnAsync` 990) | self |
| `platform/openDetached.ts` | utility | fire-and-forget | itself; absorbed to `runner.openDetached` | self |
| `steam/steamDownloadMonitor.ts` | service | streaming | has `deps.spawn` seam already | exact |

## Pattern Assignments

### `src/backend/process/runner.ts` (service leaf, spawn + capture)

**Imports rule:** Node builtins and type-only imports ONLY. Must NOT import `backend/logger`, `config`, `utils` (cycle: logger -> config -> `config.ts:59` spawnSync). Inject `{ clock, log, platform }`. Header style to copy: the "Import budget" block at `trackedChildren.ts:13-14`, and the "Kept free of other GameLib imports" note at `boundedListing.ts:21-22`.

**Timeout + unref idiom (copy exactly)** from `storeManagers/steam/bridge/drm/boundedListing.ts:33-58`. The measured finding (header lines 6-19): do NOT use `execFile({timeout})`; own an unref'd kill timer, unref child and both pipes.
```typescript
kill = setTimeout(() => {
  try { child.kill('SIGKILL') } catch { /* already gone */ }
}, options.timeoutMs)
kill.unref?.()
child.unref?.()
;(child.stdout as { unref?: () => void } | null)?.unref?.()
;(child.stderr as { unref?: () => void } | null)?.unref?.()
```
In the runner the timer comes from the injected `clock.setTimeout` (unref by default, D-04). Clear it on exit.

**Capture/resolve shape** from `utils.ts:990-1023` (`spawnAsync`): spawn, `memoryLog()` push per stream data, optional `onOutput`, `child.on('error', reject)`, `child.on('close', code => resolve({code, stdout: join, stderr: join}))`. `run()` should keep `{code, stdout, stderr}` result shape so `spawnAsync` becomes a thin wrapper. Note `memoryLog` lives in logger land; reimplement a small bounded buffer in the leaf.

**Detached open** (`openDetached`) from `platform/openDetached.ts:29-48`: `spawn('/usr/bin/open', ['-g', url], { detached: true, stdio: 'ignore' })`, `child.on('error', err => onError?.(code))`, `child.unref()`. Preserve: NO `env` option (comment lines 33-35: LaunchServices must see the real session). The runner is the only code allowed `detached`/`unref` (D-11); `runner.openDetached` must keep the no-env behaviour and the `fakeHomeIsolation` gate allows it because there is no env block.

**Spawn with env/cwd/abort signal** (launcher callers to become thin runner callers):
`launcher.ts:1647-1655` (`runWineCommand`): `spawn(bin, commandParts, { env: env_vars, cwd: startFolder })` then `trackChild(child, { runner: 'wine', key: options?.trackKey ?? installFolderName ?? winePrefix })`, `onSpawn?.(child)`, `setEncoding('utf-8')`, log writers.
`launcher.ts:1873-1884` (`callRunner`): `spawn(bin, commandParts, { cwd, env: { ...process.env, ...options?.env }, signal: abortController.signal })`, `trackChild(child, { runner: runner.name, key: options?.trackKey ?? abortId })`. RunOptions needs `signal`, `env`, `cwd`, `trackKey`, `onSpawn`, `onOutput`, `timeoutMs`.

### Registry absorbed into runner (`trackedChildren.ts`, `longLivedChildren.ts`)

Copy semantics, drop the module-level `new Map` (D-05/D-06: registry becomes a per-runner instance field).

`trackedChildren.ts:44-58` untrack-on-close/error + PID-reuse guard:
```typescript
registry.set(child, { pid, runner: meta.runner, key: meta.key })
const untrack = () => { registry.delete(child) }
child.once('close', untrack); child.once('error', untrack)
return untrack
```
`trackedChildren.ts:60-72` kill: win32 `spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true })` else `process.kill(pid, 'SIGTERM')`; try/catch -> warn, return false. This is the sync site needing `runSync` with a short timeout (must finish before `app.exit`). `killTracked(filter)` filters on optional `runner`/`key` (lines 76-83).

`longLivedChildren.ts:46-57` replace-by-id with stale-unregister guard:
```typescript
registry.set(id, teardown)
return () => { if (registry.get(id) === teardown) registry.delete(id) }
```
`longLivedChildren.ts:72-92` `shutdownLongLivedChildren`: iterate, each teardown in own try/catch, log, `registry.clear()` -> becomes `runner.teardownAll()`; `handleExit()` in `utils.ts` calls it. Drop `__resetLongLivedChildrenForTests` (D-05: fresh instance in tests).

### `src/backend/process/clock.ts` (utility)

No exact analog. Take the unref idiom above: every `setTimeout`/`setInterval` returns a handle that has `.unref?.()` called by default; opt-out requires an explicit `{ keepAlive: true, reason }`. Interface: `now()`, `setTimeout`, `setInterval`, `clear*`. `engine/launchDeadline.ts` (LAUNCH_DEADLINE_MS, unref'd timer) is the consumer shape to migrate onto it.

### `src/backend/process/context.ts` (AppContext + narrow slices)

**Analog (shape of a narrow dep seam):** `storeManagers/steam/steamDownloadMonitor.ts:~100-117` `MonitorDeps` (`platform`, `listPids`, `spawn`, `readTail`, `now`, `parentPid`). Copy the interface style. Do NOT copy the `defaultDeps()` fallback `deps: MonitorDeps = defaultDeps()` at `startSteamDownloadMonitor(appId, deps = defaultDeps())` (D-03 forbids it; this file is a migration target).
```typescript
// D-01/D-03 target shape
type MacArchDeps = Pick<AppContext, 'runner' | 'platform'>
export function createMacArch(deps: MacArchDeps) { return { machOArchsOf } }
// bootstrap: const macArch = createMacArch({ runner: ctx.runner, platform: ctx.platform })
```

### `src/backend/testUtils/realRunner.ts` (real runner, fake HOME)

**Analog:** `src/backend/testUtils/fakeHomeProfile.ts`. API to reuse: `createFakeHomeProfile({ prefix })` (line ~170) returns `{ root, env, childEnv(base?), registerCapture(path), dispose() }`. `childEnv()` = `{ ...(base ?? process.env), ...env }` for the eight `FAKE_HOME_ENV_KEYS`. D4: fresh profile every call, never memoize. realRunner = `createProcessRunner({...})` with every spawn's env defaulted from `profile.childEnv()`, and returns `{ runner, profile, dispose }`. Named real-profile arm: expose an explicit option (justified in a comment) as `meta/sidecarStartupSmoke.cjs` does for its exemption.

**Gate to respect:** `src/backend/__tests__/fakeHomeIsolation.test.ts:71-74` `ALLOWED_TO_ASSIGN = [HELPER_REL_PATH, 'src/backend/jest.setupContainment.ts']`, and its `EXEMPTIONS[].file` table. It flags files that spawn AND hand-roll the eight env keys. The runner file must not hand-roll those keys; realRunner takes env from the helper. Floor `MIN_FILES_SCANNED = 600`. After the runner lands, this gate's spawn-site set shrinks to the runner plus tests.

### `src/backend/testUtils/scriptedRunner.ts` (scripted fake, never spawns)

**Analog:** `storeManagers/gog/e2eMock.ts:12-45` first-match stub pattern: stubs ordered most-precise first; a stub matches when `stub.commandParts.every(p => command.includes(p))`; result from `stub.response` or `{ stdout: stub.stdout ?? '', stderr: stub.stderr ?? '' }`. Copy matching (and `RunnerCommandStub` type from `common/types`) but make it an instance (no module `currentStubs`, no `addTestOnlyListener` at import). Records `{cmd, argv, env}` per call; canned `{code, stdout, stderr}`; unmatched call should fail loudly (a default would hide missing scripts). The e2eMock files then become fixtures built on it.

### `src/backend/testUtils/fakeClock.ts`, `testContext.ts`

Factory + `dispose()` shape from `fakeHomeProfile.ts` (`disposed` flag, idempotent). `createTestContext(overrides)` builds each slice from fakes (scriptedRunner, fakeClock, fake-HOME `paths`). Replaces `jest.useFakeTimers` (77 test files) and `jest.mock('child_process')` (45 files). Directory `testUtils/` is already excluded by the census.

### `meta/backendDiCeilings.cjs` (gate; analog `meta/steamLineCeiling.cjs`)

Copy this structure wholesale (222 lines): header contract comment (lines 2-22), constants + `REPO_ROOT`/`DEFAULT_ROOT`/`DEFAULT_BASELINE`, `DEFAULT_MIN_FILES` floor ("Zero files scanned must never read as a pass", lines 31-33), `SKIP_DIRS = new Set(['__tests__','__mocks__','node_modules'])` (add `testUtils`), `collectFiles(root, base, exempt)` (lines 46-66), pure `evaluate(baseline, current)`, `staleExemptions`, `parseArgs` (errors on missing value, never silent fallback, lines 126-146), `main()`, `module.exports = {...}`, `if (require.main === module) main()`.

**Core evaluate semantics to copy and adapt (per-file exact baseline):**
```javascript
if (n > allowed) failures.push(`grew: ${file} ${n} > baseline ${allowed}`)
else if (n < allowed) failures.push(`shrank: lower ${file} to ${n} in this commit (baseline says ${allowed})`)
// baseline loop: stale entry (file gone), entry for a file now at zero => remove
```
No `--update` flag (header line 10-11): numbers move by hand in the same commit.

**Differences required (do not copy):**
- CR-01 hole (65-REVIEW): in steamLineCeiling, an allowlist entry exempts a file at any size (`allowed <= ceiling` handling, evaluate lines 82-100 are the awkward part). For DI ceilings there is no "ceiling" constant; baseline is the exact count per file, and an entry for a file at 0 must fail. Sanctioned list (runner, logger sink, boot entry, Rust-overlap D-14 files) must be a named exact-path table with a one-line reason each AND a count cap per file, never a bare path exemption; stale entries fail (copy `staleExemptions` idea, lines 108-120).
- Counting: use the TypeScript compiler API (`require('typescript')`; no existing meta script does this, so no repo analog) in one pass producing two per-file maps: module-state (top-level `let`/`var` names + top-level `const` bound to `new Map/Set/WeakMap/WeakSet`, class instances, or mutated object/array literals; D-06) and `child_process` imports (static, dynamic `import()`, `require`, `node:` prefix; `import type` excluded or counted separately). Also a third scalar `jest.mock(` ceiling (shrink-only, no target). Add a rule for `execAsync`/`utils` shell wrappers (research line 289).
- Baseline JSON: shape `{ "moduleState": {file: n}, "childProcess": {file: n}, "jestMock": n }` (steam baseline is a flat `{}`).

### `meta/__tests__/backendDiCeilings.test.ts` (analog `steamLineCeiling.test.ts`)

Copy lines 1-26: CLI spawned via `spawnSync` from `node:child_process`, fake HOME from `createFakeHomeProfile`, and `require('../x.cjs')` wrapped in `/* eslint-disable @typescript-eslint/no-require-imports */`. Keep the structure: pure `evaluate` cases (grew / shrank / stale / zero-entry / sanctioned-entry-at-any-size must FAIL), `parseArgs` cases, and CLI end-to-end against a temp tree (`mkdtempSync`, `--root/--baseline/--min-files`). Add AST-counter fixtures: `let x`, `const m = new Map()`, `const o = {}` later mutated, `const k = 1` (not counted), `require('child_process')`, `import('node:child_process')`.

### `meta/__tests__/backendDiCeilingsWiring.test.ts` (analog `steamLineCeilingWiring.test.ts`)

Copy whole file (70 lines) substituting names. Key assertions:
```typescript
expect(pkg.scripts['backend-di-ceilings']).toBe('node meta/backendDiCeilings.cjs')
// lint.yml: gate step index > boundaries step index; near-miss filtered-out test
// pre-push: lines[0] matches /^#!/ ; lines[1] contains 'pnpm steam-line-ceiling && pnpm backend-di-ceilings'
```
Uses `js-yaml` `load`, `stepIndex(steps, run)` finds by exact `s.run`.

### Wiring edits

- `package.json:51`: `"steam-line-ceiling": "node meta/steamLineCeiling.cjs"` -> add sibling `"backend-di-ceilings": "node meta/backendDiCeilings.cjs"`.
- `.github/workflows/lint.yml:36-39`: step pattern with a preceding comment naming the baseline file and the lower-in-same-commit rule:
```yaml
      # Phase 66 D-16: shrink-only module-state / child_process ceilings; lower
      # meta/backendDiCeilingsBaseline.json in the same commit as the removal.
      - name: Backend DI ceilings
        run: pnpm backend-di-ceilings
```
- `.husky/pre-push` line 2 is a single `&&` chain ending `... && pnpm boundaries && pnpm steam-line-ceiling`; append `&& pnpm backend-di-ceilings` (the steam wiring test pins `boundaries && steam-line-ceiling` adjacency, so keep that pair intact and append). Line 1 must stay the shebang.

### `.dependency-cruiser.cjs` (child_process ban, alternative or complement to ESLint)

**Analog:** rule `launcher-only-via-store-managers-index` (lines 49-59). Rule shape:
```javascript
{
  name: 'no-child-process-outside-runner',
  severity: 'error',
  comment: '...',
  from: { path: '^src/backend/', pathNot: ['^src/backend/process/', '/__tests__/', '/__mocks__/', '\\.test\\.ts$', ...SANCTIONED] },
  to: { path: '^(node:)?child_process$', dependencyTypesNot: ['type-only'] } // core module: may need `dependencyTypes: ['core']`
}
```
Header (lines 3-6): every rule `error`, no baseline, `pnpm boundaries` without `--ignore-known`. So while the count is nonzero this rule cannot be `error`: keep the ban in the ceiling script until zero, then flip to this rule/ESLint (D-15/D-16). Do not add a warn-severity baseline here. Verify depcruise resolves core modules (research may need `doNotFollow`/`includeOnly` options).

### `eslint.config.mjs` (child_process ban)

Two analogs. (a) Extend `no-restricted-imports` `paths` (lines 59-69) with `{ name: 'child_process', message }` and `node:child_process`; but that is one global block, so an override block is needed to exempt `src/backend/process/**`. (b) Scoped override block pattern (lines ~100-118): `files: [...]`, `ignores: [...]`, `rules: {...: ['error', ...]}`. Note flat-config `no-restricted-imports` in a later block REPLACES the earlier one for matching files, so restate the `electron` path entry there. Warn-level ceilings go through `meta/lintScoped.cjs` (global `SRC_CEILING = 1130`, `TESTS_CEILING = 661`): do NOT add a warn rule there (a removed warning offsets an added one). Use the dedicated ceiling script until zero.

### `sidecar/bootstrap.ts` (boot restructure, D-08)

Current shape to delete: lines 191-283, module-level `let xInitialized = false` guards (`loggerInitialized`, `onlineMonitorInitialized`, `i18nInitialized`, `anticheatListenerRegistered`, `releasesFetchInitialized`, `migrations...`) each with a comment explaining "init() called many times per test". `init(input = process.stdin, output = process.stdout)` at line ~789 starts `if (!loggerInitialized) { initLogger(); loggerInitialized = true; setUnhandledRejectionLogSink(...); setUncaughtExceptionLogSink(...) }`.

Keep verbatim the ordering constraints in comments: migrations FIRST after `initLogger()` (needs `heroicLogWriter`); sink binding after logger (WR-04: `processGuards.ts` has zero static imports; the sink is bound here); `logError` (not `logWarning`) for the uncaught sink (returns write promise, Phase 72 D-04). Target: `const steps: BootStep[] = [...]` run by a single `runBoot(ctx, steps)`; tests build a context once (createTestContext) rather than calling `init()` repeatedly. Verify with `pnpm smoke:sidecar` since bootstrap installs a `Module._load` hook (research line 295).

### `storeManagers/index.ts` (D-02)

Current import-time construction to move to boot, lines 31-38:
```typescript
export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(), gog: new GOGLibraryManager(),
  legendary: new LegendaryLibraryManager(), nile: new NileLibraryManager(),
  steam: new SteamLibraryManager()
} satisfies Record<Runner, LibraryManager>
```
Keep the `satisfies Record<Runner, ...>` exhaustiveness. Become `createStoreManagers(deps)` returning `{ libraryManagerMap, storeLaunchHooks }`, called from bootstrap. `launchHooks` (lines 60-110) closes over module imports (`gogSetup`, `legendarySetup`, `legendaryConfigStore`, `gogPresence`, `isEosOverlayEnabled`, `sendFrontendMessage`): these become deps. Keep the widening idiom at line ~113 (`export const storeLaunchHooks: Record<Runner, StoreLaunchHooks> = launchHooks`). `autoUpdate` and `initStoreManagers` (lines 125-160) read `libraryManagerMap` directly; make them take the map. Dependency-cruiser rule `launcher-only-via-store-managers-index` must still hold: launcher gets the map via ctx, not by importing store code.

### `sidecar/*FlowRegistration.ts` (22 files)

Analog: `appShellFlowRegistration.ts`. Each exports `register...()`; header (lines 1-50) documents each channel and which real function it wraps. Convert to `registerAppShellFlows(deps: Pick<AppContext, ...>)`, with `ipc`/managers/services passed in rather than imported (e.g. `quit -> handleExit()` becomes `deps.handleExit`). Note: 7,429 lines across 22 files; `appShellFlowRegistration.ts` also has 5 module-level state items. Keep channel names and validation unchanged (no user-visible change). Do the registration conversions in the same plan as the manager that they consume, so no file is touched twice (D-15).

### `launcher.ts`, `utils.ts` (core migration)

- `launcher.ts`: replace `spawn` + `trackChild` at 1647-1655 and 1873-1884 with `runner.spawnTracked`/`run` calls (see runner section for options). Also `spawnSync(gamescope --help)` at ~734 (inside async fn -> `await run`), wineserver `--wait` ~1702 with grace timer 1724-1730 (timer via `clock`), script spawn ~2230. Module-level state: 3 items. Manager maps from ctx.
- `utils.ts`: `spawnAsync` (990-1023) becomes a thin wrapper then is deleted (knip baseline will shrink: lower `meta/knip-baseline.txt` in same commit, it fails on a vanished finding too). `execAsync = promisify(exec)` (line 103, exported ~1870) is the shell-string path; callers `tools/index.ts:1365`, `compatibility_layers.ts` (7 sites) convert to argv. mdfind pitfall: `mdfind kMDItemCFBundleIdentifier = "*.wine"` splits to THREE argv words in the shell; one argv string changes behaviour (research lines 239-241). `handleExit()` calls `runner.teardownAll()` instead of `shutdownLongLivedChildren()`.

### `steam/steamDownloadMonitor.ts` and `drm/*` spawn sites

Already have a `deps.spawn` seam; convert `deps` to `{ runner, clock }` slice, `spawnLongLived` for the streaming `nettop`/`script` children (monitor kills it). Other `run` callers follow `boundedListing.ts` (`runBoundedListing(file, argv, {timeoutMs, maxBuffer})` is nearly the `run` contract: `maxBuffer`, never rejects, resolves `{error, stdout}`; decide whether `run` rejects like `spawnAsync` or resolves like this, and let callers pick a flag).

## Shared Patterns

### Sidecar exit contract (unref everything)
**Source:** `boundedListing.ts:6-19`, `trackedChildren.ts:9-11`; `Skill("gamelib-conventions")`.
**Apply to:** runner, clock, every converted timer/watcher. Unref child, both pipes, kill timer; leave no unbounded in-flight boot work. Verify with `pnpm smoke:sidecar` (`meta/sidecarStartupSmoke.cjs`, deliberately NOT fake-HOME isolated; keep it that way).

### Shrink-only ratchet (Phase 62 D-14, 65)
**Source:** `meta/steamLineCeiling.cjs` header + `evaluate`.
**Apply to:** `backendDiCeilings.cjs`; each plan that removes sites lowers the baseline in the same commit; at zero the rule flips to error and the ceiling goes.

### Fake-HOME isolation for spawn
**Source:** `testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile`), `fakeHomeIsolation.test.ts`.
**Apply to:** realRunner, any test that really spawns, the CLI tests in `meta/__tests__/*`.

### Import-budget headers
**Source:** `trackedChildren.ts:13-14` ("backend/logger and node builtins ONLY"), `longLivedChildren.ts:21-24`.
**Apply to:** `process/**` (zero backend imports), registry modules: state the budget in the header.

### Verify/format
Every task `<verify>`: `npx prettier --check <exact paths>` after `--file-info` check (CLAUDE.md convention). `.planning/**` may be prettier-ignored; say so rather than carry a vacuous check.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `process/clock.ts` | utility | timers | No injected-clock exists; only ad hoc `setTimeout(...).unref?.()` sites (use `boundedListing.ts` idiom) |
| TS-compiler-API census inside `backendDiCeilings.cjs` | gate | batch | No `meta/` script uses the `typescript` API; only line-counting/regex gates exist (`steamLineCeiling`, `hardcodedStringGate.ts`, `knipRatchet.cjs` for reference) |
| `AppContext` / `createAppContext` | config | transform | No existing context/container; closest is `MonitorDeps` seams |
| ordered boot-step list | controller | batch | `bootstrap.ts` today is guard-based; no step-list precedent |

## Metadata

**Analog search scope:** `meta/`, `src/backend/{process-related,testUtils,sidecar,storeManagers,steam,platform}`, `.github/workflows`, `.husky`, `.dependency-cruiser.cjs`, `eslint.config.mjs`.
**Files read:** about 14 (targeted ranges; no large file read whole).
**Pattern extraction date:** 2026-11-09
