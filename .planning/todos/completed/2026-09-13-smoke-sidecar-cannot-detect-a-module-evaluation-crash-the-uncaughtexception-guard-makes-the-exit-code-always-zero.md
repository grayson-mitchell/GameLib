---
created: 2026-09-13
title: "pnpm smoke:sidecar cannot detect a module-evaluation crash any more -- the uncaughtException guard swallows it and the gate's only signal is the exit code, which is now always 0"
area: backend/sidecar boot / CI gate
severity: major
platform: any
ready: code
status: completed
source: quick-260913-901 (fix smoke:sidecar hang), Task 3 negative control
files:
  - meta/sidecarStartupSmoke.cjs
  - src/sidecar/installRejectionGuard.ts
  - src/backend/sidecar/processGuards.ts
resolves_phase: null
---

# `pnpm smoke:sidecar` is blind to the exact regression class it was built to catch

## What was measured

A negative control was run against the gate on 2026-09-13 (quick-260913-901 Task 3): a
deliberate `throw new Error('NEGATIVE CONTROL 260913-901')` inserted as the first module-scope
statement of `src/backend/sidecar/bootstrap.ts` after its imports — a backend module scope dying
during evaluation, which is *precisely* the 2026-08-23 `727be5dbb` incident the gate's own header
comment names as its founding reason to exist.

The gate did not notice:

```
NEGATIVE-CONTROL rc=0
[sidecar-smoke] PASS: built, started, exited 0 on stdin EOF.
```

The break was genuinely compiled in and the throw genuinely fired — this is not a build-cache
artefact:

```
break present in SOURCE:           bootstrap.ts:173
break present in BUILT BUNDLE:     1 occurrence
direct run (fake HOME, stdin EOF): EXITED rc=0 in 0.52s
STDERR:  [sidecar] uncaught exception: Error: NEGATIVE CONTROL 260913-901
             at Object.<anonymous> (build/main/sidecar.js:38365:7)
             at Module._compile (node:internal/modules/cjs/loader:1873:14)
__GAMELIB_SIDECAR_READY__ in STDOUT:  0 occurrences
```

The sidecar was **completely dead** — `init()` never completed and the READY sentinel was never
emitted — and the gate still printed PASS.

## Root cause

`src/sidecar/index.ts`'s first import is `./installRejectionGuard`, which calls
`installUncaughtExceptionGuard()`. That guard's own doc comment
(`src/backend/sidecar/processGuards.ts:161-167`) states the mechanism explicitly:

> LOG AND CONTINUE — DELIBERATE, and a deviation from Node's default. Registering ANY
> `uncaughtException` listener suppresses Node's default behaviour of printing the stack and
> exiting non-zero, so this listener is what keeps the process alive.

So a module-evaluation throw is caught, logged to stderr, and the process survives in a dead state
and exits **0** on stdin EOF.

`meta/sidecarStartupSmoke.cjs`'s only success signal is that child exit code
(`if (run.status !== 0)`). The guard makes that code unconditionally 0 for this failure class, so
the check can never fire.

**The guard is correct and must NOT be removed** — it exists so an uncaught backend throw does not
black-screen the app, and it replaced `main.ts:618`. The defect is in the gate's choice of signal.

This was introduced silently: the guard (D-35-10-01, Phase 35) post-dates the gate's founding
incident, so the gate was disarmed by a later, unrelated, individually-correct change.

## Collateral: a false claim is currently shipped

`src/sidecar/installRejectionGuard.ts:42-46` tells future readers:

> DO NOT ADD AN IMPORT TO THIS FILE ... The invariant is checked by the zero-imports gate and by
> `pnpm smoke:sidecar`, which runs the real bundled sidecar — the only check that catches this
> class of regression, since a green jest run and a clean `build:sidecar` both missed attempt (a).

`pnpm smoke:sidecar` does **not** catch that class of regression any more. `bootstrap.ts`'s own
`init()` docblock and `meta/sidecarStartupSmoke.cjs`'s header carry the same assumption. Anyone
reordering imports today is relying on a check that cannot fail.

## What remained — ALL FOUR DONE (quick-260913-lkk, 2026-09-13)

1. Give the gate a signal the guard cannot forge. The cheapest correct one already exists and is
   already captured but never inspected: assert `__GAMELIB_SIDECAR_READY__` is present in the
   child's stdout. `spawnSync` already returns `run.stdout`; the sentinel is exported as
   `READY_SENTINEL` from `common/types/sidecarTransport`. A dead sidecar cannot emit it.
2. Consider also failing when the child's stderr contains `[sidecar] uncaught exception:` during
   the smoke run. A clean boot should produce none, and this catches guard-swallowed faults that
   happen *after* the sentinel is written.
3. Re-verify with the SAME negative control this todo records — insert the throw, confirm the gate
   goes RED, restore by `cp` (never `git checkout --`, standing finding
   `git-checkout-fires-post-checkout-hook`), confirm shasum match and an empty `git diff`.
4. Correct the false claim in `src/sidecar/installRejectionGuard.ts:42-46` once the gate actually
   backs it up again.

Do **not** "fix" this by removing or weakening the `uncaughtException` guard, and do not raise or
remove `STARTUP_TIMEOUT_MS`. Note the gate's ETIMEDOUT arm is still sound — it correctly caught
the boot hang that quick-260913-901 fixed. Only the "exited N at startup" arm is dead.

## Resolution (quick-260913-lkk, 2026-09-13)

Item 1 — done. `meta/sidecarStartupSmoke.cjs` now fails unless `run.stdout` contains
`__GAMELIB_SIDECAR_READY__`. The ETIMEDOUT and `run.status !== 0` arms are untouched and
`installUncaughtExceptionGuard()` and `STARTUP_TIMEOUT_MS` are unchanged.

Item 2 — done, but with the todo's stated RATIONALE corrected. The stderr arm was measured before
being written, not assumed: four consecutive clean boots against the real profile emitted **zero**
stderr bytes and zero `[sidecar] uncaught exception:` lines, so the arm is not flaky. However this
todo claimed the arm "catches guard-swallowed faults that happen *after* the sentinel is written".
**That is false.** The guard only writes to stderr while its log sink is null; `bootstrap.init()`
installs that sink at `bootstrap.ts:786`, and the sentinel is written at `bootstrap.ts:1256`. Every
fault in between goes to the logger, never to stderr. The arm's real scope is the EARLY-BOOT /
module-evaluation window — which is the class this gate exists for. The narrower, true scope is
written on the arm itself rather than the flattering one.

Item 3 — done. The same negative control was re-run: `throw new Error('NEGATIVE CONTROL
260913-lkk')` at `bootstrap.ts` module scope gave `smoke rc=1` with
`FAIL: the sidecar exited 0 but never wrote __GAMELIB_SIDECAR_READY__ to stdout`. Note the gate
itself reports **"exited 0"** — the child still exits 0, so the premise here held exactly. Break
confirmed compiled in: 1 occurrence in source, 1 in `build/main/sidecar.js`. Restored by `cp`
(never `git checkout --`), shasum matched and `git diff` empty.

Item 4 — done, plus three more sites found by census.

### This todo's blast-radius claim was PARTLY WRONG

It stated that "`bootstrap.ts`'s own `init()` docblock ... carr[ies] the same assumption".
`grep -n "smoke" src/backend/sidecar/bootstrap.ts` returns **ZERO hits**. `bootstrap.ts` never
mentions the gate at all; there was nothing to correct there. The todo also named only
`installRejectionGuard.ts:42-46` and missed two further live references (`installRejectionGuard.ts:12`,
`src/sidecar/index.ts:48`, both instructions that are true again now the gate is armed).

### New guard against the fix rotting

`meta/sidecarStartupSmoke.cjs` is CommonJS and cannot require the TypeScript `READY_SENTINEL`
export, so it hardcodes the value. A drift assertion in `sidecarRejectionGuard.test.ts` Group 3
binds the two, runs `stripSourceComments` first (so the file's own prose cannot satisfy it), and
carries positive controls against a vacuous read. It was proven RED against a deliberately wrong
literal and GREEN when restored.
