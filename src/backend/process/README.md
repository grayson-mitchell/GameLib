# src/backend/process

The process leaf (Phase 66): the injected clock, the process runner and the
`AppContext` that bundles them. This directory imports only Node builtins and
its own files. It must not import `backend/logger`, `backend/config` or
`backend/utils` (the `runner-is-a-leaf` dependency-cruiser rule enforces it).

## What AppContext holds

`AppContext` is a type plus the `createAppContext()` factory. It has no
`getContext()` locator and no module state. Today it holds:

- `platform`: the `NodeJS.Platform` the app runs on
- `paths`: `appRoot`, `publicDir`, `userData`
- `clock`: the injected `Clock`
- `runner`: the injected `ProcessRunner`
- `log`: a `LogSink` with `info`, `warn` and `error`

Phase 66.1 adds the stores and the manager maps.

## Declaring a slice

No module receives the whole context. Each module declares a narrow interface
whose members are typed from `AppContext` fields, and a `createX(deps)`
factory that closes over it:

    interface MacArchDeps {
      runner: AppContext['runner']
      platform: AppContext['platform']
    }
    export function createMacArch(deps: MacArchDeps) { ... }

Forbidden: a whole-`AppContext` parameter, a `getContext()` locator, and a
`deps = defaultDeps` default argument. The composition root builds the context
once and passes each factory its slice.

## The runner

- `run(cmd, argv, opts)` is the normal path. The default timeout is 30 s
  (`DEFAULT_RUN_TIMEOUT_MS`); `timeoutMs` must be positive and finite.
- `spawnLongLived(cmd, argv, { id, ... })` is for processes that outlive a
  call. It registers a teardown that `teardownAll()` runs at shutdown.
- `runSync(cmd, argv, { timeoutMs, reason })` is the synchronous escape hatch.
  Both the timeout and a non-empty reason are required.
- Argv only, never a shell string.
- Only the runner may detach or `unref()` a child.

## The clock

Every timer is `unref()`'d by default so it cannot hold the sidecar's event loop
open. A timer that must keep the process alive passes
`{ keepAlive: { reason } }`; the reason is mandatory and non-empty.

## Writing a test

Build only the slice you need from `createTestContext()` in
`src/backend/testUtils/testContext.ts`. It returns the context together with
its fakes (`runner`, `clock`, `log`, `profile`) and a `dispose()`:

    const t = createTestContext({
      script: [{ cmd: 'lipo', argv: ['-archs', '/x'], result: { stdout: 'arm64\n' } }]
    })
    const arch = createMacArch({ runner: t.ctx.runner, platform: 'darwin' })
    // ...
    t.runner.expectAllConsumed()
    t.dispose()

- Scripted runner (`createScriptedRunner`) is the default. It never spawns, and
  an unscripted call fails loudly naming the cmd and argv.
  It calls `onSpawn` once with an inert handle, honours `opts.signal`
  (`aborted: true`), validates the `timeout` opt-out like the real runner, and
  supports `hold: true` steps that stay pending until `runner.release(cmd)` or an
  abort. `createScriptedRunner(script, { killCounts })` makes `killTracked`
  record its filter in `calls` and return the scripted counts (default 0).
- Fake clock (`createFakeClock`) replaces `jest.useFakeTimers`: call
  `advance(ms)` or `runAll()`, and `assertNoKeepAlive()` to prove nothing holds
  the loop open.
- Capture log (`createCaptureLog`) records `{ level, msg }` lines in `lines`.
- Real runner (`createRealRunner`) only when the test must actually spawn. It
  runs under a fresh `createFakeHomeProfile()` and its `openDetached` throws.
- The real-profile arm, `createRealRunner({ realProfile: { justification } })`,
  is required only when a defect arms under a populated profile (the
  two-profile rule). The justification must name that defect. Never mock
  `child_process`.

`createTestContext` creates directories only for its fake-HOME defaults. A
`paths` override is used as given and never created.

## Runner semantics (66.1)

- **Drain grace.** When a run timed out, was aborted, or uses
  `resolveOn: 'exit'`, `run()` waits at most `DRAIN_GRACE_MS` (250 ms, on the
  injected clock) after the child's `exit` for its pipes to close. A grandchild
  holding the pipes no longer hangs the call: the pipes are destroyed, the child
  is untracked (so `killTracked` cannot signal a recycled PID), and the result
  carries the exit code/signal with `drainTimedOut: true`. Output after the
  grace is dropped.
- **Timeout opt-out.** Omitting both fields still means `DEFAULT_RUN_TIMEOUT_MS`.
  `timeout: { none: true, reason }` is the only way to run unbounded; the reason
  must be non-empty and the option cannot be combined with `timeoutMs`. Justified
  for installers, game launches and scripts the caller cancels via `signal`.
- **Handle exit state.** `ChildHandle` exposes `exitCode` and `signalCode`
  (null until the child exits), so callers do not need `ChildProcess`.
- **Truncation (WR-02).** Once a chunk is dropped on a stream, no later chunk is
  appended to it. The review's splice was not reproducible; a test pins it.
- **win32 kill.** `killPid` returns the `taskkill` outcome (false on failure or
  when it is missing) so the registry's warning fires. CI is ubuntu-only, so
  only the failure path is CI-verified (A6). `runSync` passes
  `maxBuffer: DEFAULT_MAX_BUFFER_BYTES`, so large stdout is captured, not ENOBUFS.

## Ratchets

`pnpm backend-di-ceilings` counts module-level singletons, `jest.mock` sites
and similar census items per shard in `meta/backendDiCeilings/`. Ceilings only
shrink: when a conversion lowers a count, lower the shard entry in the same
commit. Never raise a ceiling to admit growth.
