# Phase 66: Backend dependency injection replacing module-level singletons - Research

**Researched:** 2026-11-09
**Domain:** TypeScript/Node sidecar refactor (constructor/factory DI, one process runner, shrink-only ratchets). No external libraries.
**Confidence:** HIGH on the inventory and the ratchet tooling (measured in this session with the TS compiler API and grep); MEDIUM on plan sizing; the exemption list for Phase 75 is partly an open question.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Narrow deps per consumer, no container library. Boot builds one `AppContext`; each module declares only the slice it uses as a TS type; boot hands it that slice; a test builds only that slice. Nothing takes the whole context, no `getContext()` locator.
- **D-02** Store managers are constructed at boot. Library-manager and game-manager classes take deps via constructors. `bootstrap.ts` builds the manager maps that sit at module level in `storeManagers/index.ts` (`new SteamLibraryManager()` at import time) and hands them to `launcher.ts` and the flow registrations. Nothing is constructed at import time.
- **D-03** Function modules export a `createX(deps)` factory returning their functions; boot wires it. Replaces direct imports of stateful functions (e.g. `utils.ts` helpers). No optional `deps = defaultDeps` parameters.
- **D-04** The injected clock owns `now()`, `setTimeout`, `setInterval`; its timers are `unref()`'d by default. Tests use a fake clock instead of `jest.useFakeTimers`. A timer that must keep the process alive opts out explicitly with a reason.
- **D-05** Process-wide state is owned by the context: anonymous CM client (`steam/anonymousClient.ts`), Mac Steam offline debt + shutdown signal (`steam/macSteamOffline.ts`), connectivity monitor (`online_monitor.ts`), bridge `helperRegistry`, child registries, winetricks queue, etc. Tests get a fresh instance and never reset module state. No allowlist for "process-wide" state; only exceptions are D-07/D-08.
- **D-06** The ratchet counts top-level `let` and also top-level `const` bound to a mutable container: `new Map/Set/WeakMap/WeakSet`, a class instance, or a mutable object/array literal that is later mutated.
- **D-07** The logger import stays (`logInfo`/`logWarning` from `backend/logger`). Writers and redaction are configured once from the context at boot; tests install a capture sink. The logger's own sink state is a sanctioned exception (D-13).
- **D-08** Boot is one ordered list of steps that runs once by construction. The 17 `*Initialized` once-guards in `bootstrap.ts` and its `i18nReady` promise are deleted.
- **D-09** Runner API is async and argv-only: `run(cmd, argv, opts)` + `spawnLongLived(cmd, argv, opts)`. Shell-string `exec` calls become argv. `spawnSync`/`execSync`/`execFileSync` become async; where a sync call truly cannot convert, it goes through a named `runSync` that requires a timeout, and the plan says why.
- **D-10** Every `run` has a timeout by default, per-call override. `spawnLongLived` has no timeout but registers teardown with the runner (GOG `comet`, Steam bridge helper, launched games). Phase 61's CrossOver launch timeout becomes an ordinary per-call value.
- **D-11** The runner absorbs `trackedChildren.ts`, `longLivedChildren.ts` and both `spawnOpenDetached` helpers (`platform/openDetached.ts`, `steam/macSteamOffline.ts`). Every child is tracked and killable by PID. The runner is the only code allowed to use `detached` or `unref()` a child, and owns log capture and redaction. `spawnAsync` in `utils.ts`, `callRunner`/`runWineCommand` in `launcher.ts` and per-store command helpers become thin callers.
- **D-12** Two fakes: (a) scripted fake that never spawns, records cmd/argv/env, returns canned exit codes/output; default for unit tests. (b) real runner with env pinned to `createFakeHomeProfile()`, for tests that must spawn, keeping the named, justified real-profile arm where a defect only arms under a populated profile. Tests stop mocking `child_process`.
- **D-13** Done when both counts (module-level state per D-06; `child_process` imports) are zero outside a short sanctioned list, each enforced by a test. Sanctioned list: the runner module, the logger sink (D-07), the boot entry point, Rust-overlap exemptions (D-14), each with a one-line reason. `jest.mock(` gets a shrink-only ceiling, no target.
- **D-14** Skip TS that Phase 73/75 Rust ports will delete (Phase 73: TS depot pipeline e.g. `steam/depot/lzmaLoaderCore.ts`; Phase 75: VDF/ACF readers, `shortcuts.vdf`, `steam/library/` scan). They sit on an exemption list that empties as those phases delete them. If any spawns, it still goes through the runner once the ban lands. If Phase 75 is re-scoped, a file leaves the list and gets converted.
- **D-15** Order: (1) `AppContext`, clock, runner, both fakes, documented test context, ratchets with ceilings at current counts; (2) store managers and `launcher.ts`; (3) other modules, largest count first. The `child_process` lint ban flips to `error` when its count reaches zero. Each converted module takes the runner from the start; no module is touched twice.
- **D-16** Ratchets follow Phase 62 D-14: ceiling only goes down; CI fails if a change adds a violation; each plan that removes sites lowers the ceiling in the same commit; at zero the rule becomes `error`/test and the ceiling is deleted.
- **D-17** One live macOS smoke at the end, before verification: launch a game from each store, launch a Steam bridge game, run Refresh, start an install, quit. Check no tracked child is orphaned and the sidecar exits promptly at stdin EOF.

### Claude's Discretion
- Concrete `AppContext` fields beyond those named in ROADMAP/D-04/D-05, and how slice types are declared (`Pick<AppContext, ...>` vs per-module interfaces).
- Default `run` timeout value and how long-lived children name themselves in the registry.
- Whether i18n (`t`) follows the logger rule (import stays, configured at boot) or is injected. Default: same as the logger.
- How the module-state census is implemented (TS compiler API vs dependency-cruiser/ESLint), provided it meets D-06 and D-16.
- How many modules each migration plan converts, and its wave structure.

### Deferred Ideas (OUT OF SCOPE)
None. Reviewed-but-not-folded todos: `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md` (Rust/dev-runner signal path), `2026-11-07-stop-steam-launched-games-by-pid.md` (GameLib never spawns Steam-launched games). Out of scope: frontend state (Phase 69), GameInfo split (Phase 70), any user-visible behaviour change.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (TBD). Must-haves derive from the roadmap goal and D-01..D-17:

| Derived ID | Description | Research Support |
|----|-------------|------------------|
| MH-1 | `AppContext` built once at boot, narrow slices, documented test context | Sections "Current shape of boot" and "Pattern" |
| MH-2 | One process runner; zero `child_process` imports outside sanctioned list; enforced by test/lint | Inventory table; Ratchet plug-in design |
| MH-3 | Module-level state count (D-06) at zero outside sanctioned list; enforced by test | Census, census implementation |
| MH-4 | Store managers + `launcher.ts` take deps; no import-time construction | Store manager section |
| MH-5 | Boot once-guards and `i18nReady` deleted | Boot section |
| MH-6 | `jest.mock(` shrink-only ceiling | Ratchet section |
| MH-7 | Live macOS smoke D-17 | Validation Architecture |
</phase_requirements>

## Summary

The repo already contains most of the machinery this phase needs, in scattered form. The runner's job is mostly consolidation: the same "spawn, pipe, unref child and pipes, race an unref'd timer, SIGKILL on deadline" block is hand-copied at least nine times (`engine/runTool.ts`, `engine/demoStatus.ts`, `drm/{drmLaunchSetup,steamclientLayerInstall,valveClient,boundedListing}.ts`, `shortcuts/windowsShortcut.ts`, `steam/sharedRedistInstall.ts` via `unrefWineChild`), each with its own `unrefHandle`. These are exactly the sites where the sidecar exit contract has bitten before, so folding them into one runner that owns `unref()` is the highest-value part of D-11. Many modules already use a `*Deps` bag with a `defaultXDeps()` function (`macSteamOffline.ts`, `steamDownloadMonitor.ts`); migration of those is "hoist the default into boot", not a redesign, though D-03 forbids leaving the default in the module.

Measured today (2026-11-09, non-test `src/backend`): **35** `child_process`-importing files (confirmed), **156** top-level `let` (matches CONTEXT), and **156** top-level `const` bound to a mutable container by my D-06 implementation (312 total across 141 files). The 72 `new Map/Set` figure in CONTEXT is a subset; the larger const half is dominated by store backends (`const x = new TypeCheckedStoreBackend(...)` in `*/stores.ts`: humble 10, gog 9, steam 8, legendary 5, nile 3 ...). The `child_process` ban is blind to 8 `execAsync` and 2 `execSync` shell-string call sites unless `execAsync` is removed from `utils.ts` (callers import it from `backend/utils`, not from `child_process`). There are 19 sync spawn sites; only 3 are inside already-async functions, so D-09's `runSync` escape hatch will genuinely be needed for roughly 8-10 sites.

The hard constraints are structural: `backend/logger` imports `backend/config`, and `config.ts` itself calls `spawnSync`, so the runner must import neither `logger` nor `config` nor `utils`; it takes a log sink and clock by construction. The ratchet script should be a new `meta/` gate in the `steamLineCeiling.cjs` family (exact per-file counts, no whole-file exemption, floor on files scanned) built on the TypeScript compiler API; ESLint `no-restricted-imports` is only suitable at the zero flip, and adding it carelessly would silently drop the existing `electron` ipcMain restriction.

**Primary recommendation:** Build `src/backend/process/` (runner, clock, fakes, `AppContext` types) as a leaf with zero backend imports; add `meta/backendDiCeilings.cjs` (TS compiler API, per-file exact baseline JSON, wired like `steam-line-ceiling`) in Wave 1 at current counts; migrate in D-15 order with the stores factory and `launcher.ts` as the two largest plans.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Process spawn/kill/tracking | Node sidecar (backend `process/`) | Rust shell (process-group reap, Layer B) | Sidecar owns children; Rust reaps if sidecar is SIGKILLed. Runner must not claim to cover the SIGKILL path (longLivedChildren header). |
| AppContext construction | Sidecar boot (`sidecar/bootstrap.ts`) | `src/sidecar/index.ts` entry | Single construction site; nothing at import time |
| Timers / clock | Injected clock (backend `process/`) | -- | Makes the unref half of the exit contract structural |
| Store config/state | Backend `stores` factory built at boot | Frontend via IPC (untouched) | Frontend state is Phase 69 |
| Logging | `backend/logger` (import stays) | boot configures sink | D-07 |
| Lint/ratchet gates | `meta/` + CI (`lint.yml`, `.husky/pre-push`) | jest Meta project | Same as Phase 62/65 |

## Standard Stack

No new runtime dependencies. Everything uses what is installed.

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| TypeScript compiler API (`typescript`) | 5.8.3 | AST census script | `[VERIFIED: node_modules/typescript/package.json]` |
| dependency-cruiser | 18.7.2 | existing import-graph rules (`pnpm boundaries`) | `[VERIFIED: package.json]` |
| ESLint | ^9.29.0 flat config | zero-flip `no-restricted-imports` | `[VERIFIED: package.json, eslint.config.mjs]` |
| jest (ts-jest) | repo pinned | unit + Meta project | `[VERIFIED: jest.config.js]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TS-API census script | dependency-cruiser rule | depcruise sees imports, not top-level declarations; cannot count `let`. Usable only for the `child_process` import ban, and has no per-file ceiling (all-or-nothing, which is why Phase 62 has no baseline). |
| TS-API census script | ESLint `no-restricted-syntax` | Selector can match `Program > VariableDeclaration[kind=let]` but a warning ceiling in `lintScoped.cjs` is a single global number per scope, so a `let` removed in file A hides one added in file B. Per-file exact counts are strictly stronger. |
| Custom DI | tsyringe/inversify/awilix | Rejected by D-01. |

**Package Legitimacy Audit:** no external packages are recommended; nothing to audit. Packages removed: none. Flagged: none.

## Architecture Patterns

### System Architecture Diagram

```
src/sidecar/index.ts  --stdin/stdout frames-->  sidecar/bootstrap.ts  init(input, output)
                                                   |
                       ordered boot steps (run once by construction, D-08)
        1 logger sink -> 2 paths -> 3 clock -> 4 runner -> 5 stores factory
        6 i18n -> 7 manager maps (D-02) -> 8 services (createX(deps), D-03)
        9 flow registrations (receive managers/services as args)
        10 deferred work (online monitor, rosetta, reconcile ...) chained as steps
                                                   |
                                  AppContext { paths, stores, runner, clock, log, ... }
                                                   |  boot hands each consumer its slice
                 +------------------+--------------+----------------+
                 v                  v              v                v
          storeManagers (ctor)   launcher.ts    utils factory    flow registrations
                 \                  |              |                /
                  +------ every spawn: runner.run / spawnLongLived / runSync ------+
                                      |
        process/runner.ts (imports ONLY node builtins; log sink + clock injected)
          - tracked registry (absorbs trackedChildren)    - teardown registry (absorbs longLivedChildren)
          - only place using detached/unref/taskkill      - log capture + redaction
                                      |
                            node:child_process
quit path: handleExit() -> runner.teardownAll() ; sidecar then exits by event-loop drain at stdin EOF
```

### Recommended Project Structure
```
src/backend/process/
  runner.ts          # createProcessRunner({ clock, log, platform }) -- imports node builtins only
  runnerTypes.ts     # RunOptions, RunResult, LongLivedHandle, ProcessRunner, RunSyncOptions
  clock.ts           # createClock() (unref by default) + Clock type
  context.ts         # AppContext type, createAppContext(), slice docs
  testing/
    scriptedRunner.ts  # fake (a): never spawns; records cmd/argv/env; canned results
    realRunner.ts      # fake (b): createProcessRunner with env pinned via createFakeHomeProfile()
    fakeClock.ts       # manual-advance clock
    testContext.ts     # createTestContext(overrides) -- the "documented test context"
meta/backendDiCeilings.cjs + meta/backendDiCeilingsBaseline.json + meta/__tests__/backendDiCeilings*.test.ts
```
Put `testing/` under a path the Meta/ratchet scan excludes the same way `testUtils/` is (the census script above skipped `testUtils`, `__tests__`, `__mocks__`). `src/backend/testUtils/` already exists (`fakeHomeProfile.ts`); putting the fakes there is also fine and keeps `fakeHomeIsolation.test.ts` scan roots unchanged. Planner: choose `testUtils/` for fakes to avoid a new scan exclusion.

### Pattern 1: Narrow slice + factory (D-01/D-03)
```typescript
// per-module slice; no Pick<AppContext,...> required but allowed
export interface MacArchDeps { runner: ProcessRunner; platform: NodeJS.Platform }
export function createMacArch(deps: MacArchDeps) {
  async function machOArchsOf(path: string): Promise<string[]> {
    const r = await deps.runner.run('lipo', ['-archs', path], { timeoutMs: 5_000 })
    return r.code === 0 ? r.stdout.trim().split(/\s+/) : []
  }
  return { machOArchsOf }
}
// bootstrap.ts: const macArch = createMacArch({ runner: ctx.runner, platform: ctx.platform })
```
Recommendation (discretion): per-module interfaces whose members are typed from `AppContext` fields (`runner: AppContext['runner']`). A test builds exactly that interface.

### Pattern 2: Runner contract (D-09/D-10/D-11)
```typescript
interface RunOptions { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number /* default 30_000 */;
  signal?: AbortSignal; onOutput?: (chunk: string, child: ChildHandle) => void;
  logWriters?: LogWriter[]; logSanitizer?: (s: string) => string;
  track?: { runner: string; key: string }; windowsHide?: boolean; stdin?: string }
interface RunResult { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean }
interface ProcessRunner {
  run(cmd: string, argv: readonly string[], opts?: RunOptions): Promise<RunResult>   // never rejects on nonzero exit; rejects on spawn error (ENOENT) only
  spawnLongLived(cmd: string, argv: readonly string[], opts: LongLivedOptions & { id: string }): LongLivedHandle
  runSync(cmd: string, argv: readonly string[], opts: { timeoutMs: number; reason: string; ... }): SyncResult
  killTracked(filter): number; killAllTracked(): number; teardownAll(): void
  openDetached(url: string, onError?): void   // the only `detached: true` in the codebase
}
```
`run` timeout implementation: `child.kill('SIGKILL')` from an unref'd timer from the injected clock; unref the child and both pipes (per the repo's measured finding in `drm/boundedListing.ts`: `execFile({timeout})` + `child.unref()` still holds the loop; own the bound, not `execFile`). `runSync` passes `timeout` to `spawnSync` (which, unlike async spawn, honours it and blocks, so no handle outlives it).

Default `run` timeout: recommend 30 s with explicit overrides: engine `--demo-status` keeps `DEMO_STATUS_CAP_MS`, launch-deadline stays `LAUNCH_DEADLINE_MS = 180_000` (that one is a *deadline over a whole launch pipeline* in `engine/launchDeadline.ts`, not a child timeout; do not fold it into `run`. D-10's "Phase 61 CrossOver launch timeout becomes an ordinary per-call value" refers to the per-child caps in `engine/runTool.ts`/`demoStatus.ts`/`bottlePrimitives.ts`) `[ASSUMED: planner/user should confirm that reading of D-10]`.

### Anti-Patterns to Avoid
- **Runner importing `backend/logger`/`config`/`utils`**: cycle (logger -> config -> `spawnSync` in `config.ts:59`). Inject `log`.
- **`deps = defaultDeps`**: banned by D-03; existing `defaultMacSteamOfflineDeps()` style must move to boot.
- **Converting `let` to `const x = new Map()`**: caught by D-06 census; do not "fix" a count by wrapping.
- **Allowlist entries that exempt a file at any count** (65-REVIEW CR-01): baseline entries must be exact per-file counts (see below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bounded child with unref'd kill timer | another copy of the spawn/unref/timer block | `runner.run({timeoutMs})` | 9 hand copies exist; each re-derives the loop-holding pitfall |
| Child registry/kill | new Map of ChildProcess | runner's tracked registry | absorbs `trackedChildren.ts` |
| Test spawn isolation | hand-rolled `env` literal | `createFakeHomeProfile()` (real runner arm) | `fakeHomeIsolation.test.ts` leaked real GOG data twice |
| Fake timers | `jest.useFakeTimers` (77 test files) | `fakeClock` | structural exit contract |
| Module-state census | regex grep | TS compiler API (needs AST to see top-level only, destructuring, `as`/`satisfies` wrappers) | grep counts nested/`let` inside functions |

## Inventory 1: the 35 `child_process`-importing files (non-test, `src/backend`)

`SYNC` = enclosing function is not async (sync call cannot simply become `await`); line = first call site. Exemption column = D-14 candidates.

| File (lines) | Calls | Shell-string? | Sync? | Notes / disposition |
|---|---|---|---|---|
| `config.ts:59` | spawnSync(`flatpak info`) | no | SYNC (`getSteamCompatFolder`) | runSync; flatpak only; imported by logger -> must not import runner at module load if runner needs config (it doesn't) |
| `engine/demoStatus.ts:114` | spawn + own timer | no | async | `run` with timeout; has own `unrefHandle` |
| `engine/runTool.ts:79` | spawn + own timer | no | async | `run`; Phase 61 timeout caps |
| `knownFixesRegistry.ts:24` | type-only `ChildProcess` | -- | -- | type import; allow `import type` or use runner's `ChildHandle` |
| `launcher.ts:734` | spawnSync(gamescope --help) | no | inside async `prepareLaunch` | convert to `await run` |
| `launcher.ts:1647,1702,1873,2230` | spawn x4 (`runWineCommand`, wineserver --wait, `callRunner`, script) | no | async | core of D-11; 1729 grace timer; 2230 spawn of a script path |
| `platform/openDetached.ts:37` | spawn detached `/usr/bin/open -g` | no | async | absorbed -> `runner.openDetached` |
| `shortcuts/shortcuts/windowsShortcut.ts:154` | spawn powershell.exe | no | async | `run`, timer 171 |
| `sidecar/knownFolders.ts:131` | spawnSync (reg query) | no | SYNC (`readWindowsShellFolder`) | boot-time Windows folder resolution; runSync or make boot step async |
| `sidecar/nativeImageShim.ts:175,252` | execFileSync `/usr/bin/sips` x2 | no | SYNC (`runSips`, `getSize`) | emulates Electron `nativeImage` sync API -> runSync (reason: sync API contract) |
| `storeManagers/gog/games.ts:837` | spawn (`comet`) | no | async | `spawnLongLived` id `gog-comet` (line 861) |
| `steam/bridge/drm/boundedListing.ts:22,37` | execFile `unzip -l`-style | no | async | `run`; header documents the loop-hold finding |
| `steam/bridge/drm/drmLaunchSetup.ts:170` | spawn `/usr/bin/pgrep -x steam_osx` | no | async | `run` (exit 1 = not running) |
| `steam/bridge/drm/steamclientLayerInstall.ts:169` | spawn `/usr/bin/codesign` | no | async | `run` |
| `steam/bridge/drm/valveClient.ts:310` | spawn `/usr/bin/unzip` | no | async | `run` |
| `steam/bridge/helperRegistry.ts:10` | type-only | -- | -- | owns `unrefHandle`; D-05: becomes context-built object |
| `steam/bridge/helperSpawn.ts:157` | spawn helper | no | async | `spawnLongLived`; `registerLongLivedChild` at 369 |
| `steam/bridge/sharedRedistInstall.ts:71` | type-only (`unrefWineChild`) | -- | -- | goes through `runWineCommand` `onSpawn` |
| `steam/depot/fileAttributes.ts:113` | spawnSync(attrib) | no | SYNC | **D-14 exempt (Phase 73 deletes depot attribute handling; 73-CONTEXT lists `fileAttributes.ts` among the Rust ports)** |
| `steam/library/runningPoll.ts:23,88` | spawnSync (Windows) , execFileSync `ps -eo args` | no | SYNC x2 | in `steam/library/` but it is a process poll, not a file scan: **do not exempt; convert** (see Open Questions) |
| `steam/macSteamAdoption.ts:198` | spawn pgrep | no | async | `run` |
| `steam/macSteamOffline.ts:163` | execFile pgrep; also owns `spawnOpenDetached` wrapper (134) | no | async | `run`, `runner.openDetached` |
| `steam/runningFromFolder.ts:59` | spawn `/bin/ps` | no | async | `run` |
| `steam/steamClientProcess.ts:102` | execFile (tasklist/ps) | no | async | `run` |
| `steam/steamDownloadMonitor.ts:136,211` | spawn (nettop/script, streaming) | no | async | `spawnLongLived` (streams stdout, killed by monitor) ; already has `deps.spawn` seam |
| `steam/steamInstallApp.ts:53` | execFile | no | async | `run` |
| `tools/index.ts:790,1084,1365` | execFile (winetricks list), spawn winetricks (streaming), `execAsync(\`which ${dependency}\`)` | **1365 yes** | async | winetricks install = `spawnLongLived`-style streaming; `which` -> `run('which',[dep])` (or `command -v`: not a binary; keep `which`) |
| `trackedChildren.ts:60` | spawnSync(taskkill) | no | SYNC (`killEntry`, quit path) | absorbed into runner; `runSync` with short timeout (reason: must complete before `app.exit`) |
| `utils.ts:103,810,935,996` | `execAsync=promisify(exec)`, spawn (probe, 810), spawnSync `wineserver -k` (935, in async fn), `spawnAsync` (996) | **execAsync: 1279 `rsync --version`, 1498 `arch -x86_64 /usr/sbin/sysctl ...`** | mixed | `spawnAsync` becomes thin caller; **remove exported `execAsync`** (also exported at 1870) |
| `utils/compatibility_layers.ts:4,35,39,230,281,316,409,420` | execSync `which wine` / `wine --version`; execAsync x5 (`mdfind ...`, `'${wineBin}' --version`) | **yes, 7** | getDefaultWine SYNC | see pitfall on `mdfind` word splitting |
| `utils/graphics/vulkan/index.ts:23,42,62` | spawnSync x3 | no | SYNC x3 | runSync or make callers async (callers are `getGpuInfo` chain: measure) |
| `utils/helperBinaries/index.ts:51` | spawnSync `--version` | no | inside async `getCometVersion` | `await run` |
| `utils/macArch.ts:40,47,61` | execFileSync lipo, file; execFile | no | SYNC x2 | `machOArchsOf` sync; check callers |
| `utils/os/path/index.ts:21` | spawn (`which`/`where`) | no | async | `run`; consumers already async |
| `utils/os/processes/index.ts:21` | spawn | no | async | `run` |
| `wine/manager/downloader/utilities.ts:174` | spawnSync `du` | no | SYNC (`getFolderSize`) | `run`+callers async, or runSync |

Totals: **19 sync call sites** (spawnSync 12, execFileSync 5, execSync 2 per CONTEXT; confirmed by AST: 3 already in async functions, 16 in sync functions, of which 1 exempt). **Shell-string sites: 8 `execAsync` + 2 `execSync` = 10** by direct inspection (CONTEXT's "exec x17" counts something broader, likely including `RegExp.exec`; flag to planner: re-measure with the AST script, do not trust 17). No `shell: true` spawn exists in non-test backend code `[VERIFIED: grep]`. No `fork(`/`execa`/`cross-spawn`. Two `worker_threads` users (`depot/decompressPool.ts`, `decompressWorker.ts`) are Phase-73-deleted, ignore. Also non-backend: `src/common/types.ts:15` imports `ChildProcess` (type only; outside the ban scope).

**D-14 exemption list that actually touches `child_process`:** only `steam/depot/fileAttributes.ts` (1 import). Library-wide Phase 75 exemption does NOT cover any `child_process` file with certainty (runningPoll is the only one in `steam/library/`). The module-state exemptions are bigger (below).

### Shell-string conversion pitfalls (security + correctness)
- `compatibility_layers.ts:230`: `mdfind kMDItemCFBundleIdentifier = "*.wine"`. A shell splits this into THREE argv words (`kMDItemCFBundleIdentifier`, `=`, `*.wine`); a naive single-string argv changes mdfind's behaviour. Preserve the split: `run('mdfind', ['kMDItemCFBundleIdentifier', '=', '*.wine'])`. Same for the `com.codeweavers.CrossOver` query at 316. Pin with a scripted-fake test asserting argv. `[VERIFIED: source read]`; mdfind semantics `[ASSUMED]` -- live-check on macOS.
- `tools/index.ts:1365` interpolates `dependency` into a shell string; today the list is a constant (`7z, cabextract, zenity, unzip, curl`) so not exploitable, but argv removes the class. `compatibility_layers.ts:281,420` interpolate `wineBin` (a user-selectable path) inside single quotes: a path containing `'` is an injection today (genuine, not just theoretical: `wineBin` comes from filesystem discovery and user settings). argv fixes it.
- `execAsync` defaults used `/bin/sh` and inherited `shell` env; `which`, `mdfind`, `arch` are found via PATH. `run` uses `spawn` with PATH lookup, same. On Windows `which` was never valid; keep the existing platform guards.

## Inventory 2: module-state census (D-06)

Method (reproducible): TS compiler API over every non-test, non-`.d.ts` file in `src/backend` (excluding `__tests__`, `__mocks__`, `testUtils`). Count (a) each declared name of a top-level `let`/`var`; (b) top-level `const` whose initializer (after stripping `as`/`satisfies`/parens) is a `new` expression other than `RegExp/URL/URLSearchParams/TextDecoder/TextEncoder/Error/Date/Intl.*`; (c) top-level `const` bound to an object/array literal that the same file later mutates (property/element assignment, `++/--` on a property, or `.push/.pop/.shift/.unshift/.splice/.set/.add/.delete/.clear/.sort/.reverse/.assign` on it). Result: **141 files, 156 `let` (matches CONTEXT's 156 exactly), 156 mutable-container `const`, 312 total.** `[VERIFIED: ran script this session]`.

Known gap in the heuristic (a real gameability hole, state it to the planner): `const reg = createRegistry()` (a call returning a Map) is not counted syntactically. Close it with a type-checker pass (flag a top-level `const` whose declared type's symbol is `Map/Set/WeakMap/WeakSet/Array` or a class instance) or accept and document the residual. Recommended: syntactic pass in Wave 1, add type-checker pass in the same script behind `ts.createProgram` only if cold runtime stays under ~20 s (the repo's `knip`/`lint` already take longer); otherwise ban the pattern in code review and add a deliberately failing fixture test documenting the hole.

Top files (total = let + container-const). Migration plans should be grouped largest first:

| Total | File | Notes |
|---|---|---|
| 17 | `sidecar/bootstrap.ts` | the 17 once-guards + `i18nReady` handled by D-08 (note: guards are 17 `let`s; `i18nReady` is an 18th in the source but counted within `let` total; confirm after deletion that the file reaches 0, apart from the sanctioned boot entry) |
| 10 | `humble/stores.ts` | `new TypeCheckedStoreBackend`/`CacheStore` instances |
| 9 | `storeManagers/gog/stores.ts` | stores |
| 9 | `storeManagers/steam/macSteamOffline.ts` | D-05 owner object (offline debt + shutdown signal) |
| 8 | `platform/index.ts` | |
| 8 | `storeManagers/steam/stores.ts` | stores |
| 7 | `engine/engineState.ts`, `online_monitor.ts`, `sidecar/processGuards.ts`, `steam/anonymousClient.ts` | D-05 named owners |
| 5 | `sidecar/appShellFlowRegistration.ts`, `signInProbe/pass.ts`, `legendary/stores.ts`, `steam/authTrigger.ts`, `steam/bridge/helperRegistry.ts`, `steam/bridge/shimCoverage.ts`, `steam/depot/lzmaLoaderCore.ts` (**exempt: Phase 73**), `steam/gameSessionState.ts`, `steam/userSignInState.ts` | |
| 4 | `steam/state.ts`, `tools/winetricksQueue.ts`, `utils.ts` | |
| 3 | `downloadmanager/downloadqueue.ts`, `humble/library.ts`, `launcher.ts`, `sidecar/ipcValidation.ts`, `sidecar/sidecarRpc.ts`, `gog/user.ts`, `legendary/library.ts`, `nile/stores.ts`, `steam/library/pollState.ts` (Phase-75 candidate), `tools/index.ts` | |
| 2 (x ~20 files) / 1 (x ~60 files) | long tail | batch by directory |

By directory (total): steam (excl. bridge/depot/library) 58, sidecar 47, steam/bridge 24, engine 20, gog 18, humble 17, steam/depot 11 (mostly exempt), utils 9, tools 9, legendary 9, steam/library 8, signInProbe 8, platform 8, online_monitor 7, nile 5, utils.ts 4, storeVersioning 4, downloadmanager 4. Full per-file output is reproducible by the script; Wave 1 must commit the script and baseline so the list is regenerable (do not rely on this document's table).

**Phase 73/75 exemptions for module state:** `steam/depot/` (11 total across `lzmaLoaderCore.ts` 5, `appinfoOrder.ts` 2, `sharedRedist.ts` 2, `cdnAuth.ts` 1, `lzmaNativeBinding.ts` 1): per 73-CONTEXT, `select.ts`, `appinfoOrder.ts`, `cdnAuth.ts`, `contentServers`-side CM logic and `sharedRedist.ts` lease/ledger **stay in TypeScript** (D-02/D-03/D-04/D-12), so only the lzma loader files (`lzmaLoaderCore.ts`, `lzmaNativeBinding.ts`, `lzmaLoader.ts`), `decompress*`, `download*`, `chunkDecode.ts`, `reconcile.ts`, `fileAttributes.ts`, `machO.ts`, `pathCollisions.ts`, `flagsCensus.ts`, `finalize.ts`, `manifest.ts` are deleted. Exempt only those; convert `appinfoOrder.ts`, `cdnAuth.ts`, `sharedRedist.ts` normally `[CITED: 73-CONTEXT.md D-01..D-04, D-12, D-15, "Packaging being retired"]`. Phase 73 is not finished (plans 18-21 are unexecuted per `.planning/phases/73-*`), so the exemption list must name files exactly and each entry must be removed when the file is deleted (stale entry fails, as `steamLineCeiling.cjs` already does). Phase 75 (not started, 0 plans) will delete `@node-steam/vdf`/`steam-shortcut-editor` readers and the local scan in `steam/library/`, but ROADMAP's own open question says owned-apps fetch and enrichment may stay TS. Recommendation: **do not pre-exempt any `steam/library/` file** except those that read VDF/ACF/shortcuts (`acfState.ts`, `installedMap.ts`, `installPollOnce.ts`: planner to confirm by reading imports) and keep the exemption as a baseline entry with a count and a one-line reason. Small files (pollState 3, restartHold 2, runningPoll 2, uninstallPolling 1) are process/poll state, not file formats: convert.

## Ratchet design (how Phase 62's machinery works and where new gates plug in)

Existing, verified:
- `pnpm lint` -> `node meta/lintScoped.cjs`: two ESLint-API scopes with **global warning ceilings** (`SRC_CEILING = 1130`, `TESTS_CEILING = 661`) plus file-count floors (375 / 220). Errors always fail. Global ceilings cannot express per-file ratchets.
- `pnpm boundaries` -> `depcruise --config .dependency-cruiser.cjs src/backend`; Phase 62 D-15: all rules `error`, no baseline. Rules scope with `from.path`; type-only imports can be excluded via `dependencyTypesNot: ['type-only']` (used already for games-split).
- `pnpm steam-line-ceiling` -> `meta/steamLineCeiling.cjs` + `steamLineCeilingBaseline.json`; pure `evaluate(baseline, current)` unit-tested in `meta/__tests__/steamLineCeiling.test.ts`; wiring pinned in `steamLineCeilingWiring.test.ts` (package.json script, `lint.yml` step order, `.husky/pre-push` line 2). **CR-01 is already fixed in the current file**: `evaluate` rejects an entry at/under the ceiling in the baseline loop whatever the file's size, and a missing/invalid entry leaves the file held to the plain ceiling. `[VERIFIED: source read]`. The lesson to carry: a baseline entry must be an exact count that can only equal the current count, never a path-level exemption.
- Gates run in CI (`lint.yml`, `codecheck.yml`, `test.yml`) and in `.husky/pre-push`.

Plug-in plan (recommended): one script `meta/backendDiCeilings.cjs` that, in a single TS-API pass over `src/backend`, produces two exact per-file maps (module-state count; `child_process` import count incl. `require`, dynamic `import()`, `node:` prefix, `import type` excluded), reads `meta/backendDiCeilingsBaseline.json` of shape `{ "moduleState": {file: n}, "childProcess": {file: n}, "sanctioned": {file: {kind, max, reason}} }`, and:
1. fails if any file's count exceeds its baseline entry, or a file absent from the baseline has count > 0 (this is the "CI fails if a change adds a violation");
2. fails if a file's count is *below* its baseline entry (forces lowering in the same commit, D-16), and if an entry is stale (file gone) or 0 (remove it);
3. sanctioned entries carry an exact `max` AND a reason string and are still count-checked (the CR-01 lesson), so a sanctioned file cannot grow;
4. has an anti-vacuity floor on files scanned (~141 files have state; scan population ~600+ backend files; set floor at about 50% like `lintScoped`);
5. is wired exactly like `steam-line-ceiling`: package.json script, `lint.yml` step, `.husky/pre-push` chain, wiring test. No `--update` flag (numbers move by hand, as in 65 D-13).
6. `jest.mock(` ceiling: a Meta-project test (or a section of the same script) counting `jest.mock(` occurrences across `src/` (currently **2,859**; top targets `backend/logger` 223, `os` 103, `backend/utils` 84, `backend/constants/environment` 73, `backend/platform` 68, `backend/store_backend` 57, `child_process` 42 in 45 files). Count with the AST (call expression `jest.mock`) so comments don't count (the repo's own gate-idiom lesson: strip comments). Ceiling per directory or global? Recommend per-top-level-directory ceilings so frontend churn can't mask backend progress; no target number (D-13).
7. At zero for a count: the ban becomes an ordinary rule: for `child_process`, ESLint `no-restricted-imports` at `error` **merged into the existing `paths` array** (the current global block restricts `electron` `ipcMain`/`ipcRenderer`; a later flat-config block with `no-restricted-imports` REPLACES the options, silently deleting that restriction) with the runner module and sanctioned files in an `ignores`/`files` override. The ceiling entries and the script's child_process section are then deleted in the same commit. Module-state at zero becomes a pure test (zero outside sanctioned list); keep the script, drop the baseline.

Do not make the interim `child_process` ban a depcruise rule: no per-file ceiling and depcruise can't see `execAsync` anyway.

The 10 shell-string sites matter to the ban: `execAsync`/`execSync` are hidden behind `backend/utils`, so the ban's count does not capture `tools/index.ts:1365` (importer, not a `child_process` import). Include a rule/test that `backend/utils` no longer exports `execAsync` once the callers are converted (a plain unit assertion on exports, or knip).

## Current shape of boot and registrations

- `sidecar/bootstrap.ts` (1,385 lines): `export function init(input, output)` at line 789 is the single entry; it is called many times per test file (idempotency is the stated reason for guards, lines 191-283). Guards (all `let` booleans): `loggerInitialized`, `onlineMonitorInitialized`, `i18nInitialized`, `releasesFetchInitialized`, `migrationsInitialized`, `playtimeLockClearInitialized`, `legacyZoomCleanupInitialized`, `engineTempSweepInitialized`, `storeUserReconcileInitialized`, `rosettaCheckInitialized`, `playtimeQueueDrainInitialized`, `gogPresenceInitialized`, `signInProbeOutcomesHandlerInitialized`, `signInProbeInitialized` (+ others in the 191-283 range; my census says 17 `let` in the file) and `let i18nReady: Promise<void>` (283), chained by `checkRosettaWhenMac()` (650) and the store-user reconcile. **Test fallout is the dominant risk**: `bootstrap.test.ts`, `skeletonFlows.test.ts` and `*Flows.test.ts` re-enter `init()` per test with fresh streams, and `jest.setupContainment.ts` exists precisely because the real `init()` ran three times and clobbered real logs (see its header). D-08 changes this to "build context once, return it": tests must construct their own `AppContext` via `createTestContext()` and call `buildBootSteps(ctx).run()` or the like; `init()` becomes a thin `createAppContext()` + `runBootSteps()`. Plan the test rewrites (89 files in `sidecar/__tests__`) as a dedicated plan; this is the biggest hidden cost.
- `i18nReady` encodes a real ordering constraint (rosetta dialog needs the catalog; comments at 636, 702, 1319): the ordered step list must keep "i18n resolved" as a step that later steps `await`, not as a module `let`. Chain by awaiting a step result held in a local of the boot function, not by a re-enterable promise.
- Bootstrap also installs a `Module._load` hook (comments in `openDialog.ts:15`, `storeManagerCommon/games.ts:63`): module loading under the sidecar differs from jest; verify DI changes with `pnpm smoke:sidecar` on the built bundle, not only jest.
- `storeManagers/index.ts` (160 lines): `libraryManagerMap` (5 `new XLibraryManager()` at import), `launchHooks`/`storeLaunchHooks` (module-level object closing over `gogSetup`, `legendarySetup`, `legendaryConfigStore`, `gogPresence`, ...), `autoUpdate`, `initStoreManagers`. `libraryManagerMap`/`gameManagerMap` are referenced in **~289 non-test source lines across ~45 files** (launcher, utils, protocol, save_sync, downloadqueue, shortcuts, tools, 8 flow registrations ...). This is the widest blast radius in the phase. Recommended mechanism: introduce `ManagerMaps` (`{library, game}` maps) built in boot step 7 and passed to consumers' factories; for the transition, keep `libraryManagerMap` as an *exported function-free* re-export? No: D-02 forbids import-time construction and D-01 forbids a locator, so there is no bridge; the plan must convert consumers in the same wave as the index. Mitigation: split into (a) construct managers with constructor deps while `storeManagers/index.ts` still exports a settable binding, (b) convert consumers, (c) delete the binding. Per D-15 "no module touched twice" is hard to honour here; the planner should accept that `storeManagers/index.ts` consumers import from a type-only module and receive maps by parameter, doing the conversion in one multi-plan wave, with the repo non-green between plans only if each plan is atomic per consumer directory. Safer: land `index.ts` + all 8 flow registrations + `launcher.ts` consumers in one wave, other 30 consumers next, sequenced by dependency (depcruise rule `launcher-only-via-store-managers-index` already forces launcher to go through the index, so the index conversion is naturally launcher's first step).
- Flow registrations (22 files, 7,429 lines): each exports a `register...(…)` called from the bootstrap; they currently import managers/services directly. They already take `ipc` args in places; convert to `registerXFlows(deps)` with a narrow slice (D-01). Tests (`sidecar/__tests__/*Flows.test.ts`) already mock heavily, so they gain most from DI.
- `launcher.ts` (2,273 lines): `runWineCommand` at 1557 (spawn 1647, `trackChild` 1651, wineserver `--wait` 1702 with grace timer 1724-1730), `callRunner` at 1789 (spawn 1873, `trackChild` 1880, `signal: abortController.signal` from `createAbortController(abortId)`), plus spawn at 2230 and gamescope probe at 734. `launcher_callRunner.test.ts`, `launcher_runWineCommandResolveOnExit.test.ts`, `launcher_launchSingleFlight.test.ts`, `launcher.engineStep.test.ts` all mock `child_process` today. `runner.run` must support: `onSpawn(child)` hook (used by `sharedRedistInstall` `unrefWineChild`), `signal`, streaming `onOutput(data, child)`, `logWriters` + `logSanitizer`, tracking key, `stdio` encodings, and resolve-on-exit-vs-close semantics (`runWineCommand` has a "wait:false" mode: do not lose it; `launcher_runWineCommandResolveOnExit` pins it). Treat `callRunner`/`runWineCommand` as thin callers only for argv/env building; the spawn core moves.
- `utils.ts` (1,912 lines): `spawnAsync` at 990 (spawn at 996, `memoryLog()` capture, resolves `{code, stdout, stderr}`, rejects on `'error'`), `execAsync = promisify(exec)` at 103 and exported at 1870, probe spawn at 810 (header comment 760: bounded by `spawn timeout`, not unref), `handleExit()` at 258 (calls `killAllTracked()` at 302, `shutdownLongLivedChildren()` at 318, then exit). 59 non-test backend files import `backend/utils`; `utils.ts` is a cycle hub, so factoring it (D-03 `createX(deps)`) into `createUtils` is a long tail: do it by moving each stateful helper into the module that owns it, not by one big factory. `handleExit` becomes `ctx.runner.killAllTracked(); ctx.runner.teardownAll()`.
- `trackedChildren.ts`: registry `Map<ChildProcess, {pid, runner, key}>`; untracks on `close`/`error`; `killEntry` uses `taskkill /PID /T /F` on win32 else `process.kill(pid,'SIGTERM')`; header: stays in the sidecar's process group (no `detached`) so the Rust group reap covers it. Keep exactly these semantics (Phase 72 D-13).
- `longLivedChildren.ts`: `Map<id, teardown>`; `registerLongLivedChild(id, teardown)` replaces same id and returns an unregister that only deletes if still the same teardown; `shutdownLongLivedChildren()` runs each defensively then clears. Callers: `gog/games.ts:861` (`'gog-comet'`), `bridge/helperSpawn.ts:369`. Keep replace-by-id + identity-guarded unregister.
- Two `spawnOpenDetached`: `platform/openDetached.ts:29` (detached `/usr/bin/open -g`, `stdio:'ignore'`, `child.unref()`; **deliberately no `env` option** so the user's real session resolves `steam://`) and the `macSteamOffline.ts:134` wrapper that adds a warn log. Runner's `openDetached` must keep inheriting the real env: but the fake-HOME gate currently relies on "the missing env option is what `fakeHomeIsolation.test.ts` requires" for this site; once centralised, the gate's exemption for it moves to the runner module (simplifies the gate, per CONTEXT).
- Phase 61 timeouts: `engine/launchDeadline.ts` `LAUNCH_DEADLINE_MS = 180_000` (armed before the engine starts, cancelled on first process match; timer unref'd; `active` Map registry at load) is deadline-over-pipeline state, to be a context-owned object using the clock. Per-child caps live in `engine/runTool.ts`, `engine/demoStatus.ts` (`DEMO_STATUS_CAP_MS`), `engine/bottlePrimitives.ts:91-115` (`timeoutMs` passed to an exec fn).

### Import-cycle constraints
- `process/runner.ts` imports Node builtins and type-only imports only. `backend/logger` imports `backend/config` and `utils/systeminfo`; `config.ts` and `trackedChildren.ts` both need to spawn. Inject `log: { info, warn }` and `clock` into `createProcessRunner`. Add a depcruise rule `runner-is-a-leaf` (`from: ^src/backend/process/` `to: ^src/backend/(?!process/)`, excluding type-only) in Wave 1.
- Fakes live outside the production import graph.
- `config.ts:59` is the one spawn reachable from logger's import chain; either make `getSteamCompatFolder` accept an injected `runSync` or compute the flatpak check at boot and cache it in `paths`. Recommended: compute at boot into `paths` (it is process-constant), deleting the spawn from `config.ts`.

## Test-side findings

- **Mocking today:** 45 test files `jest.mock('child_process')` (the 42 literal `jest.mock('child_process'` matches plus node: variants); ~70 test files mention `child_process` in total; `useFakeTimers` in **77** files; `jest.mock(` total **2,859** across `src/`. Notable: `trackedChildren.test.ts`, `launcher_*.test.ts` (5), `helperSpawn/helperProcess/helperRegistry/helperIntegration/helperNetHarness/cbqueue`, `sharedRedistInstall.test.ts`, `drm/*`, `macArch.test.ts`, `compatibility_layers.test.ts`, `checkRosettaInstall.test.ts`, `winetricks*.test.ts`, `nativeImageShim.test.ts`, `windowsShortcut.test.ts`, `fileAttributes.test.ts`. Each converts from `jest.mock('child_process')` plus a hand-built fake `EventEmitter` child to a scripted fake. The scripted fake must be able to stream output chunks and emit exit after a clock tick (several tests assert ordering of `data` before `close`, e.g. `launcher_runWineCommandResolveOnExit`).
- **`createFakeHomeProfile()`** (`src/backend/testUtils/fakeHomeProfile.ts`): fresh mkdtemp 0700 profile every call, no memoization (D4); `FAKE_HOME_ENV_KEYS` is the eight-variable list (HOME, USERPROFILE, LOCALAPPDATA, APPDATA, XDG_STATE_HOME, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME). The real-runner fake (b) = `createProcessRunner({...})` with `baseEnv` pinned to the profile's env; spawn sites that must keep a named real-profile arm (two-profile rule) pass `env` explicitly with a justification comment, as today.
- **`fakeHomeIsolation.test.ts`:** scans `src/` and `meta/` (floor `MIN_FILES_SCANNED = 600`) for files that spawn a child AND hand-roll an env block with the eight variables; `ALLOWED_TO_ASSIGN` is the helper + `jest.setupContainment.ts`; has an exemption table with an "exemption anchor" assertion against raw (not stripped) comments (e.g. `openDetached.ts`'s comment). After centralisation the spawn-site population in `src/backend` collapses to the runner module; update the exemption table to point at the runner's `openDetached` and keep the gate green (keep scanning `meta/`, which still spawns). Do not delete the gate: `meta/` and `src/` spawn sites outside backend remain.
- **`e2eMock.ts` (gog/legendary/nile):** a mutable `currentStubs` list; stub matches when every `commandParts` entry is contained in the command; `addTestOnlyListener('setGogdlCommandStub' ...)` registers at import (module state, 1 `let` each) and is consumed by `library.ts` via `runGogdlCommandStub`. These are e2e (Playwright-era) hooks; convert to a scripted-fake script (`{match: parts, stdout, stderr | response}`) injected at boot only when the test-only channel is enabled. Don't break `RunnerCommandStub` in `common/types`. `gog/__tests__/library.test.ts:135` mocks `../e2eMock`.
- **Fake clock replacing `jest.useFakeTimers`:** `Clock { now(): number; setTimeout(fn, ms, opts?: {keepAlive?: {reason: string}}): Cancel; setInterval(...); }`. Real clock calls `.unref()` unless `keepAlive`. Fake clock exposes `advance(ms)` and `runAll()` and records `unref` default so a test can assert "no timer holds the loop". `Date.now()` mocking remains for non-clock code; modules that now take `clock.now()` drop `jest.setSystemTime`. Migrate the 77 `useFakeTimers` files opportunistically as their module converts (ceiling-free; they are covered by the `jest.mock(` ratchet only indirectly: consider a second count `useFakeTimers` as informational, no gate).
- Existing sidecar-exit regression: `meta/sidecarStartupSmoke.cjs` (`pnpm smoke:sidecar`) is deliberately NOT fake-HOME isolated (its header pins why; GOG presence interval only arms under a populated profile). Keep it as is; do not "fix" it with the fake runner.

## Plan sizing and waves

This is the largest phase proposed: ~312 state sites in 141 files, 19+10 spawn-family sites in 35 files, ~289 manager-map references, 89 sidecar test files touching boot, 45 + 77 test files mocking child_process / timers. Propose 3 waves, ~16-20 plans (planner may split further; no single plan above ~8 modules):

**Wave 1: foundation (blocking, sequential, ~4 plans)** (D-15 step 1)
1. `process/` leaf: `Clock`, `ProcessRunner` (`run`, `spawnLongLived`, `runSync`, `openDetached`, tracked + teardown registries absorbing `trackedChildren`/`longLivedChildren`), unit tests with the real runner on trivial binaries (`node -e`) under fake-HOME; depcruise `runner-is-a-leaf`.
2. Fakes + `createTestContext()` + docs (`AppContext` fields, slice declaration convention, how to write a test); `fakeHomeIsolation` gate update.
3. `meta/backendDiCeilings.cjs` + baseline at current counts (312 module state, 35 files for child_process, `jest.mock(` ceilings) + wiring (package.json, lint.yml, pre-push) + `evaluate` unit tests incl. the CR-01 shapes (entry equal to/below current; sanctioned entry growth) + census unit tests with fixture sources (`let`->`const new Map` must not drop the count).
4. Boot restructure: `AppContext` built in bootstrap; ordered step list; delete the 17 once-guards + `i18nReady` (D-08); rewrite `bootstrap.test.ts`/`skeletonFlows`-style tests to build a context once. Highest risk in the wave; isolate. Do the manager maps in Wave 2, not here.

**Wave 2: stores, managers, launcher (D-15 step 2, ~5-6 plans)**
5. Stores factory (`*/stores.ts`: humble 10, gog 9, steam 8, legendary 5, nile 3, plus wiki/crossover/downloadmanager stores) built from `paths`; consumers receive stores through slices. Large fan-in (dozens of importers).
6. `storeManagers/index.ts` + manager classes via constructors; maps built at boot; launch hooks moved to boot (D-02).
7. Flow registrations take slices (22 files, grouped in 2-3 plans by domain: steam/auth, install/download, misc).
8. `launcher.ts`: `callRunner`/`runWineCommand`/gamescope/script spawn -> runner; `trackChild` -> runner; manager maps from boot; absorb `spawnAsync`.
9. `utils.ts` residue: `execAsync` removal (callers `tools/index.ts`, `compatibility_layers.ts`), `handleExit` -> `runner.teardownAll`, `utils.ts` 4 module-state items; `longLivedChildren` callers (`gog/games.ts`, `helperSpawn.ts`) move to `spawnLongLived`.

**Wave 3: remaining modules, largest count first (D-15 step 3, ~7-9 plans, parallelizable by directory because each plan owns disjoint files)**
10. `steam/macSteamOffline.ts` (9) + `online_monitor.ts` + `anonymousClient.ts` + `processGuards.ts` (D-05 named owners; each becomes a context-built object; `processGuards.ts` header says it intentionally has zero static imports for a WR-04 reason: read it first).
11. `engine/` (20) + `platform/index.ts` (8 + `openDetached`).
12. `steam/` top-level (58 incl. authTrigger, gameSessionState, userSignInState, state ...), split in two plans.
13. `steam/bridge/` (24) + drm spawners (bounded children -> `run`), `helperRegistry` as owned object.
14. `humble/`, `gog/`, `legendary/`, `nile/`, `signInProbe/`, `tools/`+winetricksQueue, `utils/` + `vulkan`/`macArch`/`helperBinaries`/`os/*`/`wine/manager`, `knownFolders`/`nativeImageShim`/`config.ts` sync sites (`runSync` with recorded reasons).
15. Long tail (the 1-2 count files) + flip the `child_process` ban to ESLint `error` (merged `paths`), delete ceilings at zero, finalize sanctioned list with reasons and delete exemption entries for files Phase 73 has already removed.
16. Live macOS smoke plan (D-17), non-autonomous (human-verify checkpoint).

Parallelism: Wave 3 plans should declare disjoint `files_modified`; the ceiling baseline JSON is a shared file that every plan lowers in its own commit, which creates merge conflicts under parallel execution. Mitigation: shard the baseline per directory (`meta/backendDiCeilings/<area>.json`) or sequence plans touching baseline; recommend sharding, with the script merging shards.

### Risks to plan for
1. **Sync calls that cannot go async:** `config.ts getSteamCompatFolder` (called synchronously during settings resolution), `knownFolders.readWindowsShellFolder`, `nativeImageShim` sips x2 (emulates a sync Electron API), `trackedChildren.killEntry` (quit path must finish before `app.exit`), `compatibility_layers.getDefaultWine`, `vulkan` x3, `macArch.machOArchsOf`, `getFolderSize`, `runningPoll` x2, `fileAttributes` (exempt). Measure each caller chain with the call-graph; expect ~8-10 `runSync` sites, each needing a one-line reason and a timeout (D-09). `runSync` MUST pass `timeout` to `spawnSync` and set `killSignal: 'SIGKILL'`.
2. **Detached children:** only the runner may use `detached`/`unref()` (D-11); verify `openDetached` retains `stdio:'ignore'`, no env override, and `child.unref()` so quit does not wait. Tracked children must NOT be detached (Rust group reap relies on it).
3. **Sidecar exit contract (skill `gamelib-conventions`):** a runner timeout timer that is not unref'd, a pipe that is not unref'd, or an unbounded in-flight boot step holds the loop; `smoke:sidecar` misses slow exit. The clock's default-unref (D-04) and `run`'s child+pipe unref (D-09) are the structural fix; add a runner unit test that spawns `sleep`, drops the reference, and asserts the process under test can exit (use a child node process running a tiny script, not the jest process).
4. **Behavioural drift in `callRunner` / `runWineCommand`:** abort semantics (`signal`), exit-vs-close resolution, encoding, log writers, sanitizer. Pin with characterization tests against the existing `launcher_*` suites before moving code.
5. **Shell-string -> argv word splitting** (mdfind) and Windows quoting (argv + `.cmd` shims: Node refuses to spawn `.cmd`/`.bat` without a shell since the 2024 CVE-2024-27980 fix on Windows; the repo has no `shell: true` use, keep it that way and note any Windows `.cmd` target) `[ASSUMED]` on the exact Node behaviour, verify on the CI Windows leg.
6. **Stores factory fan-in** and import-time side effects (`TypeCheckedStoreBackend` constructors touch disk under `app` paths; `jest.setupContainment.ts` redirects HOME for jest). Build stores after `paths` in boot.
7. **Census gaming:** call-returned containers (see gap above); `export let`; `var`; destructured `let`; mutated `const` object literals; module-level `let` inside `declare global` blocks (not counted by the script, fine). Make a fixtures-based test that each shape is counted.
8. **Phase 73 in flight:** its plans 18-21 are unexecuted and will delete depot files while Phase 66 runs; exemption entries are named-file, count-checked and removed when files vanish; conflicts on `gameInstallDepot.ts`/`sharedRedistInstall.ts` possible if executed concurrently.
9. **Knip ratchet** (`meta/knip-baseline.txt`, identity ratchet that also fails on a *vanished* finding): deleting `trackedChildren.ts`, `longLivedChildren.ts`, `execAsync`, `spawnAsync` exports may shrink the knip baseline; lower it in the same commit.
10. **Pre-push/CI time:** a TS-API program over ~600 files; use per-file `createSourceFile` (no type-check) for the syntactic pass (the census above took ~seconds).

## Common Pitfalls

### Pitfall 1: Runner imports the logger and creates a cycle
**What goes wrong:** `backend/logger` -> `backend/config` -> (needs runner for flatpak) -> runner -> `backend/logger`.
**How to avoid:** inject `log`; depcruise `runner-is-a-leaf`; move the flatpak probe to boot.
**Warning signs:** `undefined` imports at module load; depcruise cycle report.

### Pitfall 2: Ratchet with an exempting allowlist
**What goes wrong:** an entry exempts a file at any size/count (65-REVIEW CR-01).
**How to avoid:** entries are exact counts; growth and shrink both fail; entry equal to zero fails; test those shapes with `evaluate` unit tests.

### Pitfall 3: `no-restricted-imports` override replaces the electron rule
**What goes wrong:** a second flat-config block for `src/backend/**` redefines the rule and the `ipcMain`/`ipcRenderer` restriction disappears silently.
**How to avoid:** extend the single `paths` array in the existing block; scope sanctioned files with a later block that restates both entries; add a lint-fixture test.

### Pitfall 4: Boot re-entrancy assumed by tests
**What goes wrong:** deleting guards while tests still call `init()` repeatedly duplicates listeners (`backendEvents.on` accumulates per call, per the guard comments) and re-chains `i18nReady`.
**How to avoid:** tests build a context + run boot steps once per test with a fresh context; `init()` stays one-shot by construction (a second call in-process is a programmer error: throw or return the same context, decide in the plan; throwing is more honest).

### Pitfall 5: Treating `LAUNCH_DEADLINE_MS` as a child timeout
**How to avoid:** it is a pipeline deadline cancelled on first process match; keep it as a clock-based object; only per-child caps become `run` options (A1).

### Pitfall 6: `unref()` on a piped child still holds the loop
**What goes wrong:** `child.unref()` plus `execFile({timeout})` leaves stdout/stderr sockets and the child's own lifetime holding the loop (measured in `drm/boundedListing.ts` header).
**How to avoid:** runner owns an unref'd kill timer, unrefs child, stdout, stderr.

### Pitfall 7: Fake-HOME rule applied backwards
**What goes wrong:** pinning a real-spawn test to a fake profile hides defects that arm only under a populated profile (gog presence interval, `260913-901`).
**How to avoid:** keep the named, justified real-profile arm where applicable; `smoke:sidecar` stays unisolated.

## Code Examples

### Census core (the shape Wave 1 should ship; verified run this session)
```javascript
// meta/backendDiCeilings.cjs (sketch; run with createSourceFile, no type-check)
const ts = require('typescript')
for (const st of sf.statements) {                       // TOP LEVEL ONLY
  if (!ts.isVariableStatement(st) || hasDeclare(st)) continue
  const isLet = !(st.declarationList.flags & ts.NodeFlags.Const)
  for (const d of st.declarationList.declarations) {
    if (isLet) { count += namesOf(d.name).length; continue }     // destructuring counted per name
    let init = unwrap(d.initializer)                              // strip as / satisfies / parens
    if (ts.isNewExpression(init) && !IMMUTABLE_NEW.has(init.expression.getText())) count++
    else if ((ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)) && mutatedLater(sf, d.name.text)) count++
  }
}
```

### Scripted fake runner usage
```typescript
const runner = createScriptedRunner([
  { cmd: 'lipo', argv: ['-archs', '/x'], result: { code: 0, stdout: 'arm64 x86_64\n', stderr: '' } },
  { cmd: 'mdfind', argv: ['kMDItemCFBundleIdentifier', '=', '*.wine'], result: { code: 0, stdout: '' } }
])
const macArch = createMacArch({ runner, platform: 'darwin' })
expect(await macArch.machOArchsOf('/x')).toEqual(['arm64', 'x86_64'])
expect(runner.calls[0]).toMatchObject({ cmd: 'lipo', env: undefined })   // unmatched call throws, never spawns
```

## State of the Art

| Old approach | Current approach | Impact |
|---|---|---|
| `jest.mock('child_process')` + hand-built EventEmitter children (45 files) | scripted fake runner via DI | tests stop depending on Node internals |
| hand-copied bounded-spawn blocks (9) | one `run` | exit contract in one place |
| 17 `*Initialized` module booleans | one-shot ordered boot steps | tests no longer need guards for re-entrancy |

## Runtime State Inventory

Not a rename/migration phase in the stored-data sense; this is a code refactor. Explicit answers: **Stored data:** none (no keys/paths renamed; stores factory must keep every store's name/`cwd`/schema/`tokenBearing` identical or on-disk data orphans). **Live service config:** none. **OS-registered state:** none (the Rust shell's process-group reap is unchanged). **Secrets/env vars:** none renamed; the runner must keep env pass-through behaviour exactly (`{...process.env, ...options.env}` in `callRunner`; no env option for `openDetached`). **Build artifacts:** the built sidecar bundle `build/main/sidecar.js` must be rebuilt (`pnpm build:sidecar`; see memory: `tauri dev` does not rebuild it) before any live test.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-10's "Phase 61 CrossOver launch timeout" means per-child caps (`runTool`, `demoStatus`, `bottlePrimitives`) and not `LAUNCH_DEADLINE_MS` | Runner contract | If the user meant the 180 s deadline, it becomes a `run` option instead of a clock-owned object |
| A2 | Default `run` timeout 30 s is acceptable | Runner contract | Some callers (rsync/sysctl probes) are short, others (winetricks list) longer; every long one must pass an override |
| A3 | `mdfind` treats `kMDItemCFBundleIdentifier = "x"` as three argv words after shell splitting; argv `['kMDItemCFBundleIdentifier','=','*.wine']` is equivalent | Shell-string pitfalls | macOS app discovery regresses; live-check |
| A4 | Windows `.cmd`/`.bat` spawn without `shell` fails on current Node | Risks | A Windows launcher script path could break under argv-only; verify on CI Windows leg |
| A5 | `steam/library/` local-scan files that Phase 75 deletes are `acfState`, `installedMap`, `installPollOnce`; others are poll/process state | Census exemptions | wrong exemption list; planner must read imports before baselining |
| A6 | The 17 "exec" figure in CONTEXT is mis-measured (10 shell-string sites found) | Inventory | none if the AST re-measure agrees; otherwise find the other sites |
| A7 | Per-top-level-directory `jest.mock(` ceilings are preferable to a single number | Ratchet | planner may prefer a single global ceiling |
| A8 | Sharded baselines (per area) are better than one JSON under parallel plans | Waves | merge conflicts if kept as one file |

## Open Questions

1. **Does Phase 75 delete `steam/library/runningPoll.ts` and the small poll-state files?** Roadmap scope says "the local library scan in `steam/library/` (~4.6k lines)" without enumerating. Recommendation: convert these (runner + state owner); exempt only VDF/ACF-reading files by name.
2. **Where do `libraryManagerMap` consumers (~45 files) get managers in non-boot code paths (e.g. `protocol.ts`, `save_sync.ts`, `shortcuts/*`)?** Each needs a slice with `{managers}`; the plan must list the consumers explicitly (use `graphify query` / grep at plan time).
3. **`init()` second call semantics** once guards are gone: throw vs return same context. Recommend throw in production, tests use `createTestContext()`.
4. **Type-checker pass in the census** (call-returned containers): ship in Wave 1 or defer with a documented fixture? Recommend ship if runtime is acceptable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| node / pnpm / jest / depcruise / eslint | all gates | yes (repo toolchain) | typescript 5.8.3; dependency-cruiser 18.7.2 | -- |
| Live macOS + CrossOver + Mac Steam | D-17 smoke | operator-dependent | -- | human-verify checkpoint; no fallback for D-17 |
| Windows / Linux CI legs | argv/`.cmd` behaviour, sync call removal | CI only | -- | rely on CI build+test |

Per memory: a fresh worktree needs `build:sidecar-sea` + `vite build` before `tauri:dev` runs; the dev launch is `pnpm tauri:dev` (not `tauri:dev:run`, which skips the dev-vault flag); `tauri dev` does not rebuild the sidecar, so restart dev and check `sidecar.js` mtime before live-testing backend changes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest + ts-jest (projects incl. Backend, Meta) |
| Config file | `jest.config.js` (`meta/jest.config.js` for Meta) |
| Quick run command | `pnpm jest <path> --maxWorkers=2` (per touched file) |
| Full suite command | `pnpm test:ci` (= `jest --maxWorkers=2 --silent`) |
| Gates | `pnpm codecheck`, `pnpm lint`, `pnpm prettier`, `pnpm boundaries`, `pnpm find-deadcode`, `pnpm steam-line-ceiling`, new `pnpm backend-di-ceilings`, `pnpm smoke:sidecar`, `pnpm planning-gates` |

### Phase Requirements -> Test Map
| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| MH-1 | `AppContext` built once; slices typed; test context builds a slice | unit | `pnpm jest src/backend/process` | Wave 0 |
| MH-2 | runner: timeout kills + unrefs; argv only; tracked kill by PID; teardown fan-out; `runSync` requires timeout; `openDetached` is the only detached | unit (real runner on `node -e` under fake HOME) | `pnpm jest src/backend/process/__tests__/runner` | Wave 0 |
| MH-2 | no `child_process` import outside sanctioned list | meta/ceiling | `pnpm backend-di-ceilings` | Wave 0 |
| MH-3 | module-state count <= baseline; census counts each D-06 shape (incl. `let` -> `const new Map`) | meta unit + gate | `pnpm jest meta/__tests__/backendDiCeilings` | Wave 0 |
| MH-4 | managers constructed at boot; no import-time construction | unit: importing `storeManagers/index` constructs nothing (spy on constructors) | `pnpm jest src/backend/storeManagers/__tests__` | Wave 0 |
| MH-5 | once-guards gone: source-grep test (comment-stripped, floor on files) asserts no `*Initialized` lets in `bootstrap.ts`; a second `init` behaves per decision | unit | `pnpm jest src/backend/sidecar/__tests__/bootstrap` | partial |
| MH-6 | `jest.mock(` ceilings | meta | `pnpm backend-di-ceilings` | Wave 0 |
| exit contract | sidecar still exits at stdin EOF promptly | smoke | `pnpm build:sidecar && pnpm smoke:sidecar` | exists |
| wiring | script/CI/pre-push wiring | meta | `pnpm jest meta/__tests__/backendDiCeilingsWiring` | Wave 0 |

### Sampling Rate
- **Per task commit:** the touched module's tests + `pnpm backend-di-ceilings` + `npx prettier --check <exact paths>` (scoped, never `.`; `--file-info` first per CLAUDE.md `<verify>` rule).
- **Per wave merge:** `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode`, `pnpm smoke:sidecar` (after `pnpm build:sidecar`).
- **Phase gate:** full suite green, both counts at their final values, then the D-17 live smoke before `/gsd-verify-work`.

### D-17 live macOS smoke (human checkpoint, after Wave 3)
`pnpm build:sidecar-sea`/`pnpm build:sidecar`, restart `pnpm tauri:dev`. Steps: launch a game from each store (Epic, GOG, Amazon, Steam native/bottled, a sideload), launch a Steam bridge game (verify per the strict criterion in memory), run Refresh, start an install, then quit via in-app quit and separately via Cmd+Q. Check: `pgrep` shows no GameLib-tracked children (comet, bridge helper, wine, `/usr/bin/open` stragglers) after quit; sidecar PID gone within the stdin-EOF budget; offline-debt restore still fires (`macSteamOffline` detached open). Follow memory rules: network off only for the offline action; say "ready for human" when handing over.

### Wave 0 Gaps
- [ ] `src/backend/process/**` + `__tests__` (runner, clock, registries)
- [ ] `src/backend/testUtils/{scriptedRunner,realRunner,fakeClock,testContext}.ts`
- [ ] `meta/backendDiCeilings.cjs` + baseline + `meta/__tests__/backendDiCeilings*.test.ts`
- [ ] `package.json` script, `lint.yml` step, `.husky/pre-push` entry, wiring test
- [ ] depcruise rule `runner-is-a-leaf`

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | argv-only spawn; no shell interpretation of paths or names |
| V12 Files/Resources | yes | runner never builds shell strings; `windowsHide`; env passed explicitly |
| V14 Configuration | yes | runner is the single place for `detached`/env policy; real-env inheritance for `openDetached` documented |
| V2/V3/V4/V6 | no | untouched |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Shell injection through interpolated names/paths (`which ${dependency}`, `'${wineBin}' --version`; a `'` in a path breaks out of the quotes) | Tampering / Elevation | `run(cmd, argv)`; the 10 shell-string sites are eliminated; lint ban stops reintroduction |
| Orphaned/untracked children after quit | DoS / Repudiation | single tracked registry + teardown; D-17 check |
| Kill-by-name hitting other users' processes | Tampering | kill by tracked PID only (Phase 72 D-13 preserved) |
| Secrets in captured child output | Information disclosure | runner owns log capture and redaction (D-11); reuse `logSanitizer`; `meta/logSecretGate.ts` already gates logs |
| Hung child blocking exit or a request | DoS | default timeout on every `run` (D-10) |
| Real HOME written by spawning tests | Information disclosure | `createFakeHomeProfile()` for the real runner arm |

## Project Constraints (from CLAUDE.md)
- Tech stack: React + TypeScript on Rust/Tauri shell; GameLib is independent, upstream mergeability is not a concern (do not raise it).
- Conventions to honour: todo files need `severity:`/`platform:`/`ready:` frontmatter; child processes from `src/` or `meta/` in tests use `createFakeHomeProfile()` with a named real-profile arm where needed; every timer/watcher/socket/child in the sidecar is `unref()`'d and no unbounded in-flight boot work (exit by event-loop drain at stdin EOF); UAT items keep the `### N.` / `expected:` / `result:` shape; every task `<verify>` runs `npx prettier --check` over the exact paths (check `--file-info` first; omit and say so if all paths are prettier-ignored).
- Direct repo edits only through a GSD workflow; GSD commands use a hyphen (`/gsd-execute-phase`).
- Steam stack frozen (`steam-session`, `steam-user`, `@node-steam/vdf`, axios, `steam://` via `shell.openExternal`); not changed by this phase.
- Memory: use `pnpm tauri:dev`; restart dev after backend changes; `tauri dev` does not rebuild the sidecar.
- The gamelib-conventions skill was not loaded in this session; the sidecar-exit and fake-HOME facts above come from CLAUDE.md, the `longLivedChildren.ts`/`boundedListing.ts`/`fakeHomeProfile.ts`/`fakeHomeIsolation.test.ts` headers, and CONTEXT. Planner should load `Skill("gamelib-conventions")` before writing `<verify>` blocks.

## Sources

### Primary (HIGH confidence, this session)
- Repo source read/ran: `src/backend/{trackedChildren,longLivedChildren,utils,launcher,config}.ts`, `platform/openDetached.ts`, `steam/macSteamOffline.ts`, `storeManagers/index.ts`, `sidecar/bootstrap.ts`, `engine/launchDeadline.ts`, `testUtils/fakeHomeProfile.ts`, `__tests__/fakeHomeIsolation.test.ts`, `gog/e2eMock.ts`
- `meta/lintScoped.cjs`, `meta/steamLineCeiling.cjs`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `.github/workflows/lint.yml`, `.husky/pre-push`, `package.json`, `meta/__tests__/steamLineCeilingWiring.test.ts`
- TS compiler API census and sync-call scripts run against `src/backend` (typescript 5.8.3)
- `.planning/phases/66-.../66-CONTEXT.md`, `.planning/phases/73-.../73-CONTEXT.md`, `.planning/ROADMAP.md` Phase 75, `65-REVIEW.md` CR-01

### Secondary / Tertiary
- None. No external web sources used; no library documentation was needed (no new dependencies).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new dependencies; tooling verified in repo)
- Inventory/census: HIGH for file lists and counts (script-run); MEDIUM for the const-container half (heuristic with a stated gap)
- Architecture: MEDIUM (design recommendations; manager-map blast radius measured only by line count)
- Pitfalls: HIGH where sourced from in-repo headers; MEDIUM where marked [ASSUMED]

**Research date:** 2026-11-09
**Valid until:** ~2026-11-23 (Phase 73 plans 18-21 are still landing and will change the depot exemption list; re-run the census and the child_process grep at plan time)
