---
created: 2026-09-06
title: "An interrupted jest run orphans a `gamelib-sidecar` that then spins at 100% CPU forever"
source: /gsd-debug anticheat-response-frame-drop — five orphans found and killed during that session's cleanup
severity: unknown
status: pending
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
