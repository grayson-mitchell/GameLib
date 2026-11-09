# Phase 66: Backend dependency injection replacing module-level singletons - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend modules receive their dependencies instead of reaching for module-level state, so tests
need far fewer module mocks and each long-lived handle has one owner. Three parts, from
ROADMAP.md: (1) **the pattern**, a context built once at sidecar boot (`sidecar/bootstrap.ts`)
carrying paths, config/stores, the process runner and the clock, with a documented test
context; (2) **migration**, store managers and `launcher.ts` first, then other backend modules by
count, under shrink-only ratchets; (3) **one process runner** that every spawn goes through, with
a lint ban on `child_process` imports outside it.

Re-measured 2026-11-09 (non-test `src/backend`): **156** top-level `let` (roadmap said 144),
**72** top-level `const x = new Map/Set` (not in the roadmap count), **35** files importing
`child_process` (roadmap said 32), with 66 call sites: `spawn` ×23, `exec` ×17, `spawnSync` ×12,
`execFile` ×7, `execFileSync` ×5, `execSync` ×2. About 2,870 `jest.mock(` calls across `src/`.

Out of scope: frontend state (Phase 69), the GameInfo split (Phase 70), any behaviour change
visible to the user.

</domain>

<decisions>
## Implementation Decisions

### How dependencies are passed
- **D-01: Narrow deps per consumer, and no container library.** Boot builds one `AppContext`.
  Each module or class declares only the slice it uses (e.g. `{ runner, clock, paths }`) as a
  TypeScript type, and boot hands it that slice. A test builds only that slice. Nothing takes the
  whole context, and there is no `getContext()` locator.
- **D-02: Store managers are constructed at boot.** The library-manager and game-manager
  classes take their deps through constructors. `bootstrap.ts` builds the manager maps that sit
  at module level in `storeManagers/index.ts` today (`new SteamLibraryManager()` at import time)
  and hands them to `launcher.ts` and the flow registrations. Nothing is constructed at import
  time.
- **D-03: Function modules export a `createX(deps)` factory** that returns their functions, and
  boot wires it. This replaces direct imports of stateful functions (e.g. the `utils.ts`
  helpers). Do not use optional `deps = defaultDeps` parameters, because a default that reaches
  for module state hides the coupling again.
- **D-04: The injected clock owns `now()`, `setTimeout` and `setInterval`, and its timers are
  `unref()`'d by default.** Tests use a fake clock instead of `jest.useFakeTimers`. This makes the
  timer half of the sidecar exit contract structural. A timer that must keep the process alive
  has to opt out explicitly and give a reason.

### Module-level state
- **D-05: Process-wide state is owned by the context.** Anything genuinely process-wide becomes
  an object constructed once at boot and handed out through deps: the anonymous CM client
  (`steam/anonymousClient.ts`), the Mac Steam offline debt and shutdown signal
  (`steam/macSteamOffline.ts`), the connectivity monitor (`online_monitor.ts`), the bridge
  `helperRegistry`, the child registries, the winetricks queue, and so on. Tests get a fresh
  instance and never reset module state. There is no allowlist for "process-wide" state. The
  only exceptions are those in D-07/D-08.
- **D-06: The ratchet counts top-level `let` and also top-level `const` bound to a mutable
  container**: `new Map/Set/WeakMap/WeakSet`, a class instance, or a mutable object or array
  literal that is later mutated. Counting `let` alone would let a `let` become
  `const m = new Map()` and the count would drop with no real change.
- **D-07: The logger import stays.** Modules keep importing `logInfo`/`logWarning` from
  `backend/logger`. Its writers and redaction are configured once from the context at boot, and
  tests install a capture sink. The logger's own sink state is a sanctioned exception (D-13).
- **D-08: Boot is one ordered list of steps that runs once by construction.** The 17
  `*Initialized` once-guards in `bootstrap.ts` and its `i18nReady` promise are deleted. They
  exist only because boot steps could be re-entered from module state.

### The process runner
- **D-09: The API is async and argv-only:** one `run(cmd, argv, opts)` plus
  `spawnLongLived(cmd, argv, opts)`. The 17 shell-string `exec` calls become argv, which also
  removes a shell-injection surface. `spawnSync`/`execSync`/`execFileSync` calls become async.
  Where a sync call truly can't be converted, it goes through a named `runSync` that requires a
  timeout, and the plan says why it couldn't be converted.
- **D-10: Every `run` has a timeout by default**, with a per-call override. `spawnLongLived` has
  no timeout but registers its teardown with the runner. It is for children that live as long as
  the app or a game: GOG `comet`, the Steam bridge helper, launched games. Phase 61's CrossOver
  launch timeout becomes an ordinary per-call value.
- **D-11: The runner absorbs `trackedChildren.ts`, `longLivedChildren.ts` and both
  `spawnOpenDetached` helpers** (`platform/openDetached.ts`, `steam/macSteamOffline.ts`). Every
  child is tracked and killable by PID. The runner is the only code allowed to use `detached` or
  to `unref()` a child, and it owns log capture and redaction. `spawnAsync` in `utils.ts`,
  `callRunner`/`runWineCommand` in `launcher.ts` and the per-store command helpers become thin
  callers of it.
- **D-12: Tests get two fakes.** (a) A scripted fake that never spawns. It records cmd, argv and
  env and returns canned exit codes and output, and it is the default for unit tests.
  (b) The real runner with its env pinned to `createFakeHomeProfile()`, for tests that must
  spawn. Those tests keep the fake-HOME convention's named, justified real-profile arm wherever
  a defect only arms under a populated profile. Tests stop mocking `child_process`.

### Migration reach, order and done-when
- **D-13: The phase is done when both counts are at zero outside a short sanctioned list, each
  enforced by a test**, the way Phase 62's rules ended at `error` with zero. The counts are
  module-level state (D-06) and `child_process` imports. The sanctioned list names the runner
  module itself, the logger sink (D-07), the boot entry point, and the Rust-overlap exemptions
  (D-14). Each entry gives a one-line reason. `jest.mock(` gets a shrink-only ceiling but no
  target number.
- **D-14: Skip TypeScript that the Phase 73/75 Rust ports will delete.** Files the port will
  delete (Phase 73: the TS depot pipeline, e.g. `steam/depot/lzmaLoaderCore.ts`; Phase 75: VDF/ACF
  readers, `shortcuts.vdf`, the `steam/library/` scan) are not converted to DI. They sit on an
  exemption list that empties as those phases delete them. If any of them spawns, it still goes
  through the runner once the ban lands. If Phase 75 is re-scoped and a file will no longer be
  deleted, it leaves the exemption list and gets converted.
- **D-15: Order: the pattern and runner first, then migrate.** (1) `AppContext`, the clock, the
  runner, both fakes, the documented test context, and the ratchets with ceilings at current
  counts. (2) Store managers and `launcher.ts`. (3) The other backend modules, largest count
  first. The `child_process` lint ban flips to `error` when its count reaches zero. Because the
  runner exists before migration starts, each converted module takes it from the start and no
  module is touched twice.
- **D-16: Ratchets follow Phase 62 D-14.** Each count is a ceiling that can only go down. CI
  fails if a change adds a violation, each plan that removes sites lowers the ceiling in the same
  commit, and at zero the rule becomes an `error`/test and its ceiling is deleted.
- **D-17: One live macOS smoke at the end, before verification.** It is on top of the jest
  suites and `smoke:sidecar`. Launch a game from each store, launch a Steam bridge game, run
  Refresh, start an install, then quit. Check that no tracked child is orphaned and that the
  sidecar exits promptly at stdin EOF.

### Claude's Discretion
- The concrete `AppContext` fields beyond those named in ROADMAP/D-04/D-05, and how the narrow
  slice types are declared (`Pick<AppContext, ...>` versus per-module interfaces).
- The default `run` timeout value and how long-lived children name themselves in the registry.
- Whether i18n (`t`) follows the logger rule (import stays, backend configured at boot) or is
  injected. Default: same as the logger.
- How the module-state census is implemented (AST via the TS compiler API versus a
  dependency-cruiser/ESLint rule), provided it meets D-06 and D-16.
- How many modules each migration plan converts, and its wave structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 66: Backend dependency injection replacing module-level singletons" — goal, the three parts, open questions (answered here by D-01 and D-05)

### Conventions this phase must keep
- `Skill("gamelib-conventions")` — fake-HOME isolation (two-profile rule, `fakeHomeIsolation.test.ts`), the sidecar exit contract (unref every handle; no unbounded in-flight boot work; exit by event-loop drain at stdin EOF), and the `<verify>` prettier check. D-04, D-10, D-11 and D-12 implement the first two structurally.
- `src/backend/testUtils/fakeHomeProfile.ts` — `createFakeHomeProfile()`, the base for the real-spawn fake (D-12)
- `src/backend/__tests__/fakeHomeIsolation.test.ts` — the existing spawn-site gate, which the runner should simplify

### Prior phase decisions
- `.planning/phases/62-module-boundaries-and-decomposition/62-CONTEXT.md` — D-13..D-16: the ratchet pattern (ceiling only goes down, ends at `error` with zero), dependency-cruiser + scoped lint ceilings. Phase 66 reuses it (D-16).
- `.planning/phases/72-renderer-trust-boundary-and-process-hardening/72-CONTEXT.md` — D-13: kill tracked children by PID; why `trackedChildren.ts` exists
- `.planning/phases/61-unified-macos-engine-for-all-stores/61-CONTEXT.md` — the CrossOver launch timeout the runner takes over (D-10)
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-CONTEXT.md` — which TS depot files are deleted (D-14 exemptions)
- `.planning/ROADMAP.md` § Phase 75 — which Steam local-file TS is deleted (D-14 exemptions)

### Ratchet tooling to reuse
- `meta/lintScoped.cjs` — per-scope lint ceilings (Phase 62 D-14 model)
- `.dependency-cruiser.cjs` — import-graph rules; candidate home for the `child_process` ban
- `meta/steamLineCeiling.cjs` — Phase 65 line-ceiling gate. Do not copy its allowlist hole (65-REVIEW CR-01: an allowlist entry exempts its file at any size).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/trackedChildren.ts` — PID registry (`trackChild`/`killTracked`/`killAllTracked`); its header says it is "deliberately small so Phase 66's process runner can absorb it"
- `src/backend/longLivedChildren.ts` — teardown registry used by `handleExit()`; goes into `spawnLongLived` (D-11)
- `src/backend/utils.ts:990` `spawnAsync` — closest existing shape to `run()`: output capture through `memoryLog()`
- `src/backend/storeManagers/{gog,legendary,nile}/e2eMock.ts` — existing command stubs; candidates to become scripted-fake fixtures

### Established Patterns
- Store managers: classes built at import time in module-level maps (`libraryManagerMap` in `storeManagers/index.ts`); D-02 moves construction to boot
- Import-budget headers (e.g. "must not import `backend/utils`") on registry modules show where cycles bite; the runner sits below `utils.ts`
- `bootstrap.ts` boot sequencing uses 17 module-level once-guards (lines ~191-283); D-08 replaces them

### Integration Points
- `src/backend/sidecar/bootstrap.ts` — where `AppContext` is built and the boot step list runs
- `src/backend/sidecar/*FlowRegistration.ts` — receive managers and services from boot instead of importing them
- `src/backend/launcher.ts` (2,273 lines) — `callRunner`/`runWineCommand` become runner callers; takes the manager maps from boot
- `src/backend/utils.ts` `handleExit()` — quit path; calls the runner's teardown instead of `shutdownLongLivedChildren()`
- Phase 63 Rust ports — the runner and context give them one place to swap an implementation

</code_context>

<specifics>
## Specific Ideas

- The ratchet must not be gameable by turning `let` into `const` plus a container (D-06).
- No "registered singleton" escape hatch for process-wide state. One owner, built at boot (D-05).
- Converting shell-string `exec` calls to argv is a security win as well as a cleanup, and it should be called out in the threat model.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase's scope.

### Reviewed Todos (not folded)
The `todo.match-phase` matcher returned 26 todos, all on keyword overlap (launch, sidecar, src).
None is about DI or the process runner. The closest two:
- `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md` — a dev-shell orphan whose root cause is in the Rust/dev-runner signal path, not backend spawn ownership. D-11 may make it easier to diagnose but does not claim to fix it.
- `2026-11-07-stop-steam-launched-games-by-pid.md` — needs the PID of a game Steam launched, which GameLib never spawns. The runner's PID tracking doesn't reach it. Out of scope.

</deferred>

---

*Phase: 66-backend-dependency-injection-replacing-module-level-singleto*
*Context gathered: 2026-11-09*
