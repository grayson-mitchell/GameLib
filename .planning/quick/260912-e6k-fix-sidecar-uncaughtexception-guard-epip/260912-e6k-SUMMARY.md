---
phase: quick-260912-e6k
plan: 01
status: complete
date: 2026-09-12
commits:
  - 551917a49  # fix: remove EPIPE self-feed fuel from the uncaughtException guard
  - 726776e4e  # fix: reap spawnCapture's children on afterAll/exit/SIGINT/SIGTERM
  - 7e2671854  # docs: close the sidecar-orphan-spin todo, file follow-ups
---

# Quick Task 260912-e6k — Summary

Closes `.planning/todos/pending/2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md`
(now in `completed/`).

## The todo named a surface, not the defect

It was filed as a test-harness leak: "an interrupted jest run orphans a `gamelib-sidecar`". The
interrupted jest run is real, and it is the most common trigger, but it is not the defect. The
defect is in **shipping sidecar code** and fires whenever the sidecar's stdio pipe dies with a
write still to come — including when the real Tauri shell dies.

`installUncaughtExceptionGuard()` in `src/backend/sidecar/processGuards.ts` registers an
`uncaughtException` handler that formats `error.stack` and writes the message to `process.stderr`.
When stderr is a pipe with no reader, that write raises **EPIPE asynchronously, as an `error` event
on the stream** — so the guard's own two `try`/`catch` blocks are structurally incapable of
catching it. An unhandled `error` event on `process.stderr` is escalated by Node into another
`uncaughtException`, which re-enters the same handler, formats `error.stack` again, writes again,
EPIPEs again. Unbounded, one full core, forever. The guard's documented "never re-throw, never
exit" policy is exactly what makes it spin instead of dying.

`sample(1)` on a live spinner (the current binary carries symbols, so the loop names itself — the
2026-09-06 evidence could only record raw offsets):

```
uv_run → uv__run_check → node::Environment::CheckImmediate → node::InternalMakeCallback
  → v8::internal::Isolate::ReportPendingMessages
  → v8::internal::MessageHandler::ReportMessage
  → node::errors::TriggerUncaughtException          <-- re-entry
  → Builtins_JSEntryTrampoline (the JS handler)
  → v8::internal::Accessors::ErrorStackGetter        <-- error.stack
  → v8::internal::ErrorUtils::FormatStackTrace
  → node::PrepareStackTraceCallback
  → Builtins_ArrayPrototypeJoin → Builtin_CallSitePrototypeToString
```

2149 of 2149 main-thread samples inside that loop; all other threads parked.

## What changed

**Layer 1 — `src/backend/sidecar/processGuards.ts` (the fix).** New `installStdioErrorGuards()`
attaches an `error` listener to `process.stdout` and `process.stderr`. A stream that *has* an
`error` listener does not escalate the event into an `uncaughtException` — Node only does that when
the event has no listener at all. That removes the loop's only fuel. The listener body is
deliberately empty: any byte written from inside a stream-error handler is fuel for the loop being
extinguished, and a stdio stream that just errored has no surviving channel to report on anyway.
Called first in `installRejectionGuard.ts`, ahead of both guards.

A **synchronous re-entrancy bound** was also added to the `uncaughtException` handler. The plan and
the source comment both state plainly that this is *defence-in-depth, not the fix* — the observed
loop re-enters asynchronously via the next tick, which a depth counter reset in `finally` cannot
bound. It is there so the handler can never feed itself synchronously, not because it closes this
bug.

**Layer 2 — `lzmaNativeSeaRealBuild.test.ts` (the leak).** `spawnCapture` now tracks live children
in a module-level `liveChildren` set, reaped from `afterAll` and from `exit`/`SIGINT`/`SIGTERM`.
Honest limit: **SIGKILL on jest cannot be intercepted.** That case is covered by Layer 1 — a
reaped-parent child now exits on its own instead of spinning.

Constraints held: `processGuards.ts` still has **zero static imports** (WR-04); no diagnostic byte
is written to stdout; **no `process.exit`, re-throw, or exit-code change** was added to either
guard; `installRejectionGuard.ts` still has exactly one import specifier.

## Live gate — PASSES, with a working negative control

Run by the orchestrator directly. Control and gate differ only by the fix, so the gate measures the
fix and not the weather.

| Run | `ps` output | Verdict |
|---|---|---|
| **Negative control** — pre-fix binary (sha `1328a82b…`), `GAMELIB_SIDECAR_SELFTEST=decompress-pool HOME=<fake> $PRE 2>&1 \| head -c 1` | `46897 46896 98.9 00:08 …/prefix-sidecar` | **spins** ✅ reproduces |
| **Positive gate** — post-fix binary (sha `fb63f885…`), identical command | `NO SURVIVOR` at 8s **and** at 20s | **terminates** ✅ |
| **Secondary repro** — post-fix, parent SIGKILLed at 0.3s (the todo's own framing; the case Layer 2's reaper explicitly cannot cover) | `NO SURVIVOR (child 46936 exited)` | ✅ |

Control held at 98.9–100.1% CPU across four samples over 26s — sustained, not a decaying startup
burst. `sample` of it contains the named loop (9 `TriggerUncaughtException`/`ErrorStackGetter`
frames). All spawned processes killed; final sweep clean apart from one unrelated pre-existing
sidecar with a live parent (pid 31779, ppid 31765, 0.0% CPU).

Desk gates: `npx jest --selectProjects Backend -t sidecar` → **56 suites, 718 tests, all pass**
(incl. `sidecarRejectionGuard.test.ts` and `lzmaNativeSeaRealBuild.test.ts`). `pnpm lint` exit 0.
`pnpm planning-gates` **10/10**.

## ⚠ The plan's repro command was WRONG, and the executor caught it

The canonical repro requires `GAMELIB_SIDECAR_SELFTEST=decompress-pool`. That env var was dropped
when the reproduction was transcribed into prose for the planner — an orchestrator transcription
error. The executor ran the command as written, measured **no spin**, and **stopped rather than
declaring the gate passed**, across four increasingly rigorous attempts (40s poll, 6-minute poll,
`lsof` confirmation that the pipe really was broken, and a 15-run rapid-fire batch). That was the
correct call and it is why the final gate is trustworthy.

Re-measured on the same preserved pre-fix binary, both ways:

- **without** the env var: `42306 42305 2.6 00:06` — idle
- **with** the env var: `42326 42324 100.0 00:06` → `98.9 00:26` — spins

## Two findings worth more than the fix

**1. An idle orphan is one stimulus away from a spinning one.** The recorded memory note
`tauri-dev-shell-does-not-reap-its-node-sidecar` says dev-shell orphans "sit idle" while test-path
orphans spin, and treated those as two behaviours. They are **one defect plus differing write
pressure**. Without the selftest env var the sidecar enters RPC mode, its ~830-byte boot burst fits
entirely inside the pipe's 16 KB kernel buffer, and it then idles with nothing further to write —
so no write ever meets the closed read end. With the selftest, a `console.log` lands *after*
`head -c 1` has closed the pipe, and that write is the one that lights the loop. The "idle" orphans
were never safe; they were merely unstimulated.

**2. Running the sidecar without a fake `HOME` leaks real session data.** Found by the executor
during investigation: a diagnostic run of the raw binary without env isolation captured genuine
local GOG session values (`userId`, `username`, `galaxyUserId`) into a scratchpad log. That file was
deleted and the processes killed. This is why `spawnCapture` sets a fake `HOME` — worth knowing
before anyone runs the sidecar by hand for a live gate.

## Deliberately NOT done

- **No `process.exit()` on a dead transport.** The file's own doctrine forbids a guard that
  introduces a new exit path, and whether the sidecar *should* exit when its RPC transport dies is a
  separate behavioural decision the operator has not made. Recommending it as a follow-up:
  post-fix, an orphaned RPC-mode sidecar no longer burns a core, but it still lingers idle
  (the pre-existing `tauri-dev-shell-does-not-reap-its-node-sidecar` behaviour). That is a large
  improvement, not a complete one.
- **The `test.skip`'d real-sized decode was not un-skipped.** It now reports
  `SELFTEST decode=ok bytes=65536 match=true` on a current binary, so its "KNOWN FAILING" label has
  rotted — but verifying and un-skipping it deliberately is its own task. Filed as
  `.planning/todos/pending/2026-09-12-lzma-sea-real-sized-decode-test-skip-may-now-pass.md`.

## Two of the todo's own claims had rotted

Corrected in the closure note rather than repeated:

- It called `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` a "tracked-path build
  artifact". **False today** — `src-tauri/binaries/.gitignore` ignores `gamelib-sidecar-*`, and
  `git ls-files` returns only the `.gitignore` itself. Rebuilding in place does not dirty the tree.
- Its step 3 said symbols are stripped and the offsets need symbolicating against an old build.
  **No longer true** — the current binary carries symbols and `sample(1)` named the loop directly.
