---
created: 2026-09-06
title: "An interrupted jest run orphans a `gamelib-sidecar` that then spins at 100% CPU forever"
source: /gsd-debug anticheat-response-frame-drop — five orphans found and killed during that session's cleanup
severity: major
platform: any
ready: live-gate
status: "RESOLVED 2026-09-12 by quick-260912-e6k -- root cause was an EPIPE self-feed in the
  sidecar's own uncaughtException guard, not the test harness; fixed in shipping code and
  live-gated with a negative control."
resolves_phase: null
---

# An interrupted jest run orphans a `gamelib-sidecar` that then spins at 100% CPU forever

## What was observed

Five orphaned `gamelib-sidecar-aarch64-apple-darwin` processes were found on 2026-09-06,
**each pinned at ~100% CPU**, aged 13h51m to 14h45m. On a 10-core machine that is five cores
saturated continuously, for over half a day, by processes nobody knew were running.

```
PID     ELAPSED     CPU      started (derived)
34262   14:45:26    99.5%    19:48
47292   14:25:15   100.1%    20:08
52700   14:22:17    99.9%    20:11
62887   14:12:12   100.0%    20:21
69852   13:51:24   101.0%    20:42
```

All five were `ppid 1` (reparented to init — their parent had died).

## Where they came from

Every start time falls inside a single ~54-minute window, **19:48–20:42 on 2026-09-05**, which
is exactly the window in which the `anticheat-response-frame-drop` debug agent was running
repeated `npx jest --selectProjects Backend` loops. Eight further full-suite runs the next
morning (10:00–10:30) leaked **zero** sidecars.

The distinguishing feature of the agent's loop is that **it was terminated early** — its own
ledger records that it "stopped the loop at 8 runs (rather than the full 12)". So the working
hypothesis is: *killing a jest run mid-flight orphans the sidecar it spawned, and the orphan
then spins.* A run allowed to finish normally cleans up after itself.

This is the same family as the recorded `tauri-dev-shell-does-not-reap-its-node-sidecar`
finding, but on the **test** path rather than the dev-shell path — and materially worse,
because the dev-shell orphans sit idle whereas these burn a core each.

## Evidence captured before the kill

`sample(1)` was run against all five before terminating them. Full dump plus analysis:
`.planning/debug/evidence/sidecar-orphan-spin-2026-09-06/`.

- **100% main-thread spin** — `2450 of 2450` samples on `DispatchQueue_1:
  com.apple.main-thread (serial)`. A single blocking loop that never yields, not a busy queue.
- **All 11 other threads parked** (`node-V8Worker` x4, `DelayedTaskSchedulerWorker`,
  `SignalInspector`, ...).
- **Byte-identical across all five** — normalised stack signatures all hash to
  `77a7b78f9436b659`. Five independent processes on the same offsets means a deterministic,
  reproducible code path, not drift or memory pressure.
- **Symbols stripped** (SEA binary, `???` frames). The offset chain is preserved in the
  evidence README for symbolication against a matching build.

All five died cleanly on `SIGTERM`; no `-9` was needed, which is itself informative — the
signal handler ran, so the loop is not blocking signal delivery.

## Why this matters beyond the wasted CPU

It silently corrupts test measurements. The debug agent recorded a load average of 18–26 during
its own measurement window and attributed it in writing to "an unrelated concurrent process on
the machine". That was wrong — it was its own leak. Any timing-sensitive or load-sensitive test
result gathered while these are alive is measured on a machine with N cores missing, and the
experimenter has no idea. That is precisely the sort of contamination that makes an intermittent
failure look like an unreproducible flake.

Note this cuts both ways and the record should say so: the `getAnticheatInfo` fix's GREEN result
(16/16 runs) was gathered partly under this contamination, which makes it a *harsher* test, not
a weaker one. The verdict there stands.

## Suggested next step

1. Reproduce deliberately: start `npx jest --selectProjects Backend`, kill it mid-run
   (`SIGINT`, then separately `SIGKILL` on the jest process), and check for a surviving
   `gamelib-sidecar` afterwards. Confirm whether a normally-completing run ever leaks.
2. Find the spawn site and give it a reaper. Ask specifically whether the child is spawned
   `detached`, and whether anything cleans up on jest teardown vs. only on graceful exit.
3. Symbolicate the offset chain against a build from the capture window to name the loop.
   Do NOT symbolicate against `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` as it
   stands — the test suite (`lzmaNativeSeaRealBuild.test.ts`) rebuilds that binary IN PLACE, so
   the on-disk file is almost certainly not the one these offsets refer to.
4. Consider a cheap standing guard: a pre-test sweep by binary path, in the shape the existing
   `tauri-dev-shell-does-not-reap-its-node-sidecar` sweep already uses.

## Adjacent observation, not the defect

`src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` is a tracked-path build artifact that
the test suite overwrites in place during a normal run. Worth deciding deliberately whether
that is intended — it is the same "tests write to a real project path" shape as the recorded
`tests-clobbering-real-steam-store` incident.

## Resolution

**Root cause.** The sidecar's `uncaughtException` guard (`src/backend/sidecar/processGuards.ts`)
formats `error.stack` and writes it to a stream (stdout/stderr in production). When that stream's
read end is gone (a dead pipe — the app's own Tauri shell dying, `head -c 1` closing early, or a
jest run killing the sidecar's stdout consumer mid-flight), the write raises EPIPE
**asynchronously, as an `'error'` event on the stream** — structurally outside both halves of the
guard's `try`/`catch`. Node escalates an unhandled stream `'error'` into a fresh
`uncaughtException`, which re-enters the same handler, which formats and writes `error.stack`
again, which EPIPEs again. The guard's own (correct, deliberate) "never exit, never re-throw"
doctrine is exactly what turns that into an unbounded 100%-CPU loop instead of a crash.

**Two layers of fix, and which case each covers.**
- **Layer 1** (`installStdioErrorGuards()` in `processGuards.ts`, wired from
  `src/sidecar/installRejectionGuard.ts`): attaches a no-op `'error'` listener to
  `process.stdout`/`process.stderr` so a dead pipe can never escalate into an `uncaughtException`
  at all — this removes the loop's fuel at the source and covers every orphan shape, including
  the parent-kill case a jest-side reaper structurally cannot reach (the sidecar's own parent is
  gone, not the jest process). A synchronous re-entrancy bound
  (`uncaughtExceptionHandlerDepth`) was added to the `uncaughtException` listener itself as
  defence-in-depth, in case anything else ever re-enters it synchronously.
- **Layer 2** (`liveChildren` reaper in
  `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts`): tracks every
  `spawnCapture`'d child and kills it from `afterAll`, `'exit'`, `'SIGINT'` and `'SIGTERM'`. This
  covers the specific leak this todo originally documented (an interrupted jest run of *this*
  test file orphaning its own spawned sidecar) but does NOT cover the parent-kill/Tauri-shell-dies
  case — that is Layer 1's job.

**Live-gate + negative-control results (quick-260912-e6k, Task 3, 2026-09-12).** The plan's
canonical repro as originally transcribed (`<binary> 2>&1 | head -c 1`, no env var) did **not**
reproduce the spin — a 6-minute wait and a 15-run race-timing batch against the preserved pre-fix
binary both showed a decaying startup-burst CPU signature, not a sustained spin, and `lsof`
confirmed the pipe genuinely was broken. The repro was missing `GAMELIB_SIDECAR_SELFTEST=
decompress-pool`: without it the sidecar's ~830-byte RPC-mode boot burst fits inside the pipe's
16KB kernel buffer and completes before `head` closes the read end, so no write ever meets a
closed pipe. With the env var restored, the sidecar takes the self-test branch, whose
`console.log` calls land after `head` has already closed the pipe:

```
# NEGATIVE CONTROL (pre-fix binary, GAMELIB_SIDECAR_SELFTEST=decompress-pool, fake HOME):
42479 42476 100.0       00:10 .../prefix-sidecar
42479 42476  99.6       00:26 .../prefix-sidecar   (killed via SIGTERM after sample(2) captured
                                                      the named loop: TriggerUncaughtException ->
                                                      ErrorStackGetter -> GetFormattedStack, 3
                                                      independent occurrences in a 2s sample)

# POSITIVE GATE (freshly rebuilt post-fix binary, identical repro):
pipeline (binary | head -c 1) completed in 2 seconds; no survivor after an additional 10s grace
period; `ps -eo pid,ppid,%cpu,etime,comm | grep gamelib-sidecar` showed only the pre-existing,
unrelated pid 31779.

# SECONDARY REPRO (parent-kill, stdio:['ignore','pipe','pipe'], SIGKILL parent at 0.3s):
Pre-fix binary  -> survivor: 42982 1 100.0% 00:22, reparented to ppid 1, killed via SIGTERM
                   (died cleanly, confirming this exact 0.3s window reliably catches the pre-fix
                   binary mid-write -- i.e. the timing is meaningful, not a race that happens to
                   miss).
Post-fix binary -> no survivor at all, checked immediately and after 5s.
```

Final sweep after every step: `ps -eo pid,ppid,%cpu,command | grep gamelib-sidecar` printed only
the pre-existing, unrelated sidecar (pid 31779, an already-running real app instance) — no
leaked processes from any part of this investigation.

**Correcting this todo's own rot**, named explicitly rather than silently repeated or deleted:
- The "Adjacent observation" above calls `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`
  a "tracked-path build artifact". **FALSE as of 2026-09-12**: `src-tauri/binaries/.gitignore`
  ignores `gamelib-sidecar-*`, and `git ls-files` under that directory returns only the
  `.gitignore` itself. Nothing there is tracked.
- Suggested step 3 says the symbols are stripped and the offsets need symbolicating against a
  matching build. **No longer needed**: the current binary carries symbols, and `sample(1)`/
  `sample(2)` named the loop directly by symbol (`node::errors::TriggerUncaughtException` ->
  `v8::internal::Accessors::ErrorStackGetter` -> `v8::internal::ErrorUtils::GetFormattedStack`) —
  the full stack is in `260912-e6k-PLAN.md`'s `<diagnosis>` block and in this section above.
- Suggested step 1 frames this as a jest-teardown problem to reproduce via `SIGINT`/`SIGKILL` on
  a jest run. **It was not a jest-teardown problem.** The canonical repro needs no jest and no
  parent-kill at all — a single `<binary> 2>&1 | head -c 1` (with
  `GAMELIB_SIDECAR_SELFTEST=decompress-pool` set) arms it — which relocates the defect from the
  test harness entirely into shipping code.

**A standing finding worth recording for future readers, surfaced during this investigation**:
this todo's own "Where they came from" section frames the dev-shell orphan
(`tauri-dev-shell-does-not-reap-its-node-sidecar`) and this test-path orphan as two different
behaviours — one "sits idle", the other "spins". They are not two different defects; they are
**one defect with differing write pressure**. An orphaned sidecar whose stdio pipe has died only
spins once something inside it still attempts a subsequent write (an RPC self-test's
`console.log`, a malformed-stdin-frame `stderr.write`, or — for the real dev-shell case — any RPC
message reaching a mainWindow-less sidecar's transport). A dev-shell orphan that currently "sits
idle" is one stimulus away from spinning, not a structurally safer case; Layer 1 above is what
actually makes it safe.

**A live-gate hazard worth its own todo**: running the raw pre-fix binary without `HOME`/
`XDG_STATE_HOME`/`LOCALAPPDATA` overrides (unlike `spawnCapture`, which always sets a fake `HOME`)
captured real local GOG session data (a `gogConfigStore` entry containing what appear to be
genuine `userId`/`username`/`galaxyUserId` values) into a scratchpad log during this
investigation. The file was deleted immediately and never committed, but the underlying hazard —
any live-gate script that runs the compiled sidecar directly, without env isolation, risks
capturing real local credentials into whatever captures its stdout — is worth a standing
guideline, not just this one-off catch.
