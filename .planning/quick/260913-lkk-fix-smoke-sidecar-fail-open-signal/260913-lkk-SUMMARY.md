---
phase: quick-260913-lkk
plan: 01
subsystem: backend/sidecar boot / CI gate
tags: [ci-gate, fail-open, sidecar, negative-control, source-gate]
requires: [quick-260913-901]
provides:
  - 'smoke:sidecar READY-sentinel assertion (a signal the uncaughtException guard cannot forge)'
  - 'smoke:sidecar early-boot swallowed-fault assertion'
  - 'drift gate binding the .cjs literal to the TypeScript READY_SENTINEL export'
affects:
  - meta/sidecarStartupSmoke.cjs
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/sidecar/installRejectionGuard.ts
tech-stack:
  added: []
  patterns:
    - 'Assert a positive liveness signal, not the absence of a failure code'
    - 'Bind a hardcoded cross-language literal with a stripComments source gate + positive controls'
key-files:
  created: []
  modified:
    - meta/sidecarStartupSmoke.cjs
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/sidecar/installRejectionGuard.ts
    - .planning/todos/completed/2026-09-13-smoke-sidecar-cannot-detect-a-module-evaluation-crash-the-uncaughtexception-guard-makes-the-exit-code-always-zero.md
decisions:
  - 'Stderr arm IMPLEMENTED after measurement (4/4 clean boots emitted zero stderr bytes), but scoped honestly to the early-boot window'
  - 'installUncaughtExceptionGuard() and STARTUP_TIMEOUT_MS left untouched — the defect was the gate signal, not the guard'
  - 'Todo CLOSED: gate proven RED under the negative control and GREEN when restored'
metrics:
  tasks: 3
  commits: 3
  completed: 2026-09-13
---

# Quick 260913-lkk: Fix the `smoke:sidecar` fail-open signal — Summary

Armed the only gate that runs the real bundled sidecar with a signal its own
`uncaughtException` guard cannot forge — the `READY_SENTINEL` line in the child's stdout —
and **proved it goes RED** under the negative control it had been silently passing for weeks.

## The deliverable: the gate can now fail

This is the part that matters. The fix without the red run would have been another green check
proving nothing.

### 1. Negative control — `throw` at `bootstrap.ts` module scope

```
SMOKE rc=1
[sidecar-smoke] FAIL: the sidecar exited 0 but never wrote __GAMELIB_SIDECAR_READY__ to
stdout, so `bootstrap.init()` never reached its end — the process was dead on arrival. THE
EXIT CODE IS NOT THE SIGNAL for this failure class: the uncaughtException guard keeps a dead
sidecar at 0. Almost always an import/evaluation-ORDER problem. The swallowed stack follows.
[sidecar] uncaught exception: Error: NEGATIVE CONTROL 260913-lkk
```

The **new sentinel arm fired**, not the pre-existing "exited N at startup" arm — and the gate's
own message reports `exited 0`, confirming the child still exits 0. The premise held exactly.

The break was genuinely compiled in, not a build-cache artefact:

| measurement | count |
|---|---|
| `NEGATIVE CONTROL 260913-lkk` in `src/backend/sidecar/bootstrap.ts` | 1 |
| `NEGATIVE CONTROL 260913-lkk` in `build/main/sidecar.js` | 1 |

**Restored by `cp`** from a pre-edit scratchpad copy (never `git checkout --`, which fires this
repo's post-checkout hook), proven two ways:

```
cd1d895812a6bfb6d8e5a54338648fb4e11adf31  <scratchpad>/pristine/bootstrap.ts
cd1d895812a6bfb6d8e5a54338648fb4e11adf31  src/backend/sidecar/bootstrap.ts
git diff  -- src/backend/sidecar/bootstrap.ts   -> EMPTY
git status --porcelain -- src/backend/sidecar/bootstrap.ts -> EMPTY
```

Then GREEN again: `smoke rc=0`.

### 2. The drift gate has its own RED proof

With the `.cjs` literal deliberately corrupted to `__GAMELIB_SIDECAR_WRONG_LITERAL__`:

```
drift-test rc=1
> 1499 |       expect(stripped).toContain(READY_SENTINEL)
Tests: 1 failed, 40 skipped, 41 total
```

It failed at the binding assertion while its two **positive controls**
(`STARTUP_TIMEOUT_MS`, `spawnSync`) still passed — so the failure is the binding, not an empty
or wrong-path read. Restored by `cp` (shasum `216ff249e9…` matched), GREEN again.

## Measured verdict on the stderr arm (todo item 2) — IMPLEMENTED

The todo only said "consider" this, resting on the unmeasured assumption that a clean boot emits
no `[sidecar] uncaught exception:`. Measured first, per plan piece C — four spawns of
`build/main/sidecar.js` mirroring the gate exactly (`process.execPath`, repo-root cwd,
`encoding: 'utf-8'`, 30s timeout, **no `env` key**):

| run | status | elapsed | stderr bytes | `[sidecar] uncaught exception:` lines |
|---|---|---|---|---|
| 1 | 0 | 1322 ms | **0** | **0** |
| 2 | 0 | 1146 ms | **0** | **0** |
| 3 | 0 | 928 ms | **0** | **0** |
| 4 | 0 | 968 ms | **0** | **0** |

Zero across 4/4, and stderr was **completely empty** (not merely free of that prefix), so the arm
is not flaky. Implemented.

**But the todo's rationale for it was wrong, in the flattering direction.** It claimed the arm
"catches guard-swallowed faults that happen *after* the sentinel is written". It cannot. The guard
writes to stderr only while its log sink is null; `bootstrap.init()` installs that sink at
`bootstrap.ts:786` and the sentinel lands at `bootstrap.ts:1256`. Every fault in those ~470 lines
goes to the logger, never stderr. The arm's real scope is the **early-boot / module-evaluation
window** — which is the class this gate exists for. The narrower, true scope is written on the arm
itself rather than the flattering one.

## Census of `smoke:sidecar` claims — and where the todo was wrong

`grep -rn "smoke:sidecar" src meta package.json .github` — **8 hits**, each judged on its own wording:

| # | Site | Verdict | Action |
|---|---|---|---|
| 1 | `src/backend/sidecar/installedJsonWatcher.ts:145` | HISTORICAL — "Found 2026-08-29 by … and proven by bisection", a true record of a past run, not a claim about present capability | left as-is |
| 2 | `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts:1457` | STALE — "the two checks that can" was false | annotated with what makes it true again |
| 3 | `src/backend/storeManagers/gog/presence.ts:44` | HISTORICAL — records the 30s-budget kill; the ETIMEDOUT arm is still sound | left as-is |
| 4 | `src/sidecar/installRejectionGuard.ts:12` | INSTRUCTION — "whose only real check is `pnpm smoke:sidecar`"; true again now the gate is armed | left as-is |
| 5 | `src/sidecar/installRejectionGuard.ts:43` | **STALE — the named false claim** | corrected; now names the SIGNAL and when it was false |
| 6 | `src/sidecar/index.ts:48` | INSTRUCTION — "Gate any change to this file's import order on `pnpm smoke:sidecar`"; true again | left as-is |
| 7 | `.github/workflows/test.yml:32` | INVOCATION | n/a |
| 8 | `package.json:78` | INVOCATION | n/a |

Plus two claims inside the gate's own header (`:26` and the inline comment above the spawn), both
**STALE** and both corrected.

### The todo's blast-radius claim was PARTLY WRONG — stated explicitly

The todo asserted that "`bootstrap.ts`'s own `init()` docblock … carr[ies] the same assumption".

```
grep -n "smoke" src/backend/sidecar/bootstrap.ts   ->  ZERO hits (exit 1)
```

`bootstrap.ts` never mentions the gate at all. There was nothing to correct there. The todo also
named only `installRejectionGuard.ts:42-46` and missed two further live references
(`installRejectionGuard.ts:12`, `src/sidecar/index.ts:48`). The orchestrator's pre-measurement was
right and the todo was wrong; this is recorded in the closed todo itself, not just here.

**When the claims went stale:** the `uncaughtException` guard is D-35-10-01 (Phase 35), which
post-dates the gate's 2026-08-23 founding incident. The gate was disarmed by a later,
individually-correct change — nobody wrote a false claim; a true one rotted.

## Deviations from the plan — disclosed

1. **The plan's own verify command was a false green, and I did not use it.** Both `<automated>`
   blocks specify `npx jest --selectProjects src/backend …`. That prints
   `You provided values for --selectProjects but no projects were found matching the selection` and
   **exits 0** — no jest project in `jest.config.js` declares a `displayName`, so the selector can
   never match. Had I run the plan as written, every jest verification in this task would have
   passed without executing a single test. I ran the suites by **test path** instead. (The project's
   real display name is `Backend`, per jest's own `PASS Backend …` output.)
2. **Piece C was executed before pieces A and B**, not in the plan's stated A→B→C order. Its verdict
   determines whether the gate gets a fourth arm, so measuring first avoided writing the arm twice.
   No step was skipped.
3. **Sites 4 and 6 of the census were left unedited.** The plan said to expect "at minimum … four"
   stale sites and named four; I corrected those four (counting the gate's two header claims) and
   judged `installRejectionGuard.ts:12` and `index.ts:48` to be INSTRUCTIONS that are true again
   once the gate is armed, rather than stale claims. Recorded here rather than silently.

Nothing else was skipped, reordered, or scaled down.

## Verification

| Check | Result |
|---|---|
| `pnpm smoke:sidecar` under the bootstrap throw | **rc=1**, sentinel-missing FAIL |
| `pnpm smoke:sidecar` restored | **rc=0**, PASS |
| Drift test under a wrong literal | **rc=1** at the binding assertion |
| Drift test restored | PASS |
| `sidecarRejectionGuard` + `fakeHomeIsolation` | **46 passed, 46 total** (2 suites) |
| Exemption anchors in the gate header | both present, 1 occurrence each, one line each |
| `pnpm codecheck` | rc=0 |
| `pnpm lint` | rc=0 — 1123 problems, **0 errors**, 1123 warnings (both ceilings satisfied) |
| `pnpm planning-gates` | **11/11** (measured at execution time; `MINIMUM_EXPECTED_GATES = 11`) |
| `prettier --check` on all edited files | clean |
| `git diff` / `git status` for `bootstrap.ts` | both EMPTY |
| Four pre-existing dirt paths | untouched, unstaged (`??` / ` M`) |

`installUncaughtExceptionGuard()` and `STARTUP_TIMEOUT_MS` are **unchanged**, and no `env` key was
added to the exempt `spawnSync`.

## Security / hygiene

The Task 1 measurement inherits the operator's **real profile** by design (it mirrors the exempt
gate). All captures were written to the session scratchpad, never the repo, and were **deleted** at
task end (`find … -name "child.*"` returns nothing). No session identifiers, environment dumps, or
diagnostic-report contents appear in this summary. Measured incidentally: the child's stderr was
0 bytes on every clean run, so there was nothing sensitive in the stream this task added an
assertion against.

## Commits

| Hash | Message |
|---|---|
| `8e2e42168` | fix(260913-lkk): arm the sidecar smoke gate with a signal the guard cannot forge |
| `6a42cf95b` | docs(260913-lkk): correct the claims that promised a check the gate could not deliver |
| `386beeafe` | docs(260913-lkk): close the smoke:sidecar fail-open todo, correcting its own census |

## Todo disposition

**CLOSED** — `git mv`'d to `.planning/todos/completed/`, `status: completed`. Disposition criteria
met: gate proven RED under the negative control and GREEN when restored, census corrected.

The recorded `git mv` trap was observed and handled: `git status` showed **`RM`** immediately after
the move (staged rename of HEAD content + unstaged working-tree edits). An explicit
`git add <newpath>` converted it to a clean `R `, and the **staged blob** was asserted directly
(`git show :<path>`): `status: completed`, the Resolution section present, and bare-lowercase
`severity: major` / `platform: any` / `ready: code`.

## Known stubs

None.
