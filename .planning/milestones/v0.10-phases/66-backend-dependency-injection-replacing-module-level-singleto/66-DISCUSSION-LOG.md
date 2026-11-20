# Phase 66: Backend dependency injection replacing module-level singletons - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 66-backend-dependency-injection-replacing-module-level-singleto
**Areas discussed:** How deps are passed, Singletons that may stay, Runner contract & test fake, Migration reach & done-when

---

## How deps are passed

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow deps | One AppContext at boot; each module declares only its slice | ✓ |
| Whole AppContext | Every consumer takes the full context; `makeTestContext` | |
| Set-once locator | `setContext()`/`getContext()` | |

| Option | Description | Selected |
|--------|-------------|----------|
| Construct at boot | Manager constructors take deps; bootstrap builds the maps | ✓ |
| Lazy factory getter | Map built on first access from the registered context | |

| Option | Description | Selected |
|--------|-------------|----------|
| `createX(deps)` factory | Module exports a factory; boot wires it | ✓ |
| Deps as a parameter | Every function takes deps first | |
| Optional deps, real default | `fn(args, deps = defaultDeps)` | |

| Option | Description | Selected |
|--------|-------------|----------|
| now() + timers | Clock owns now/setTimeout/setInterval, unref by default | ✓ |
| now() only | Only the time source | |

## Singletons that may stay

| Option | Description | Selected |
|--------|-------------|----------|
| Owned by context | Constructed once at boot, handed out through deps; count can reach zero | ✓ |
| Registered allowlist | Stays module-level if listed with a justification | |
| Mix: caches stay | Pure memo caches allowlisted; lifecycle state moves | |

| Option | Description | Selected |
|--------|-------------|----------|
| let + mutable containers | Also count `const x = new Map/Set/...` | ✓ |
| let only | Matches the roadmap measurement | |

| Option | Description | Selected |
|--------|-------------|----------|
| Import stays, sink injected | Logger functions imported; sinks configured at boot | ✓ |
| Inject it too | Logger in every module's deps | |

| Option | Description | Selected |
|--------|-------------|----------|
| Boot runs once by design | Ordered step list; once-guards deleted | ✓ |
| You decide | Planner picks per guard | |

## Runner contract & test fake

| Option | Description | Selected |
|--------|-------------|----------|
| Two fakes | Scripted non-spawning fake + real runner in fake HOME | ✓ |
| Real spawn only | Every test spawns in a fake HOME | |
| Scripted only | No test spawns | |

| Option | Description | Selected |
|--------|-------------|----------|
| Async, argv-only | `run` + `spawnLongLived`; exec strings → argv; sync → async; residual `runSync` with mandatory timeout | ✓ |
| Mirror child_process | Wrap each API one for one | |

| Option | Description | Selected |
|--------|-------------|----------|
| On by default | Default timeout with override; long-lived children exempt but registered | ✓ |
| Opt-in | Timeout only when the caller asks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Runner absorbs all | trackedChildren, longLivedChildren, both spawnOpenDetached; sole owner of detached/unref; log capture | ✓ |
| Keep registries separate | Runner calls the registries as today | |

## Migration reach & done-when

| Option | Description | Selected |
|--------|-------------|----------|
| Zero, with a sanctioned list | Both counts to zero outside named exceptions; jest.mock ceiling only | ✓ |
| Targets, ratchet the rest | Managers/launcher/runner full; state only shrinks | |
| Runner zero, state ratchet | Ban to zero; state and mocks only shrink | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip it | Phase 73/75 deletion targets go on an exemption list | ✓ |
| Convert anyway | Treat like everything else | |

| Option | Description | Selected |
|--------|-------------|----------|
| Context+runner, then migrate | Pattern, runner, fakes and ratchets first; then managers/launcher; then by count | ✓ |
| Roadmap order | Runner as a later step | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two macOS smokes | After managers/launcher and at the end | |
| One at the end | A single live smoke before verification | ✓ |
| None | Suites and smoke:sidecar only | |

## Claude's Discretion

- AppContext fields beyond those named; how slice types are declared
- Default `run` timeout value; long-lived child naming
- i18n treatment (default: same as the logger)
- How the module-state census is implemented
- Plan sizes and wave structure

## Deferred Ideas

None. 26 todos matched on keywords only. None was folded; the closest two are recorded in CONTEXT.md.
