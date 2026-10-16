---
phase: 35-electron-cutover-remove-the-electron-build
plan: 08
task: 3
gate: blocking human-verify
verdict: PASS 5/5 on Task 3's own acceptance criteria; the plan's `success_criteria` FAILS, see F-35-08-A. NOT a clean pass.
date: 2026-08-29
platform: macOS 15 (Darwin 25.5.0), arm64
build: dev (`pnpm tauri:dev`), shell binary built 2026-08-29 18:29:32 from working tree at 6be0dd967
driven_by: developer (UI actions) + assistant (pmset sampling, SIGKILL)
windows_linux: NOT ATTEMPTED — no hardware
---

# Phase 35 Plan 08 Task 3 — Live Wake Lock Gate

The six acceptance criteria of Task 3 **all pass on real `pmset` observations**. Separately, the
run found a defect that Task 3's criteria do not cover but the plan's `success_criteria` does:
**a running game also holds a system-sleep assertion**, mislabelled as a download. That is
recorded as F-35-08-A below and ledgered as `D-35-08-02`, and it is the reason this gate must
not be summarised as a clean pass.

## 0. Pre-flight — what was verified BEFORE observing anything

Observing the right binary is a precondition, not a formality: a stale build would have produced
a green reading of code that is not the code under test.

| Check | Result |
|---|---|
| Working tree | clean at `6be0dd967` |
| Shell binary mtime vs `main.rs` mtime | 18:29:32 vs 18:28:04 — binary is NEWER, so it contains the source under test |
| Assertion labels present in the RUNNING binary | `GameLib: a game is running` = 1, `GameLib: a download is in progress` = 1 |
| Label variants WITHOUT the article | 0 and 0 — confirms the exact literals, re-counted after a compressed terminal reading dropped the `a ` and looked like a mismatch |
| Channel literals, sidecar bundle | `wake_lock_start` 1, `wake_lock_stop` 1 |
| Channel literals, shell binary | `wake_lock_start` 3, `wake_lock_stop` 3 |
| `Module._load` electron hook in the running bundle | present — so `launcher.ts`'s `powerSaveBlocker` reaches the real stub, not a bare `require('electron')` |

The channel-name cross-check matters because the sidecar and the shell agree on these strings by
convention only; a mismatch would have produced a silent no-op indistinguishable from "the feature
does not work".

## 1. Method

A change-detecting sampler polled `pmset -g assertions` every 2s and recorded only state
transitions, so the timeline below is the observation, not a reconstruction. It captured every
line `pmset` attributed to `gamelib-shell`, plus the system-wide `PreventUserIdleDisplaySleep` /
`PreventUserIdleSystemSleep` counters and the live shell pid — the pid being what makes a
force-quit visible as an event rather than an inference.

**Confound, recorded rather than allowed to contaminate the reading:** a concurrent Claude Code
session held `caffeinate -i -t 300` (pid 43193, later 53508) through parts of this run, which is
why the system-wide `PreventUserIdleSystemSleep` counter never reads 0. It is owned by
`caffeinate`, not by `gamelib-shell`, so it does not touch attribution. Every claim below is made
from the `(gamelib-shell)` lines only.

## 2. Timeline (state transitions only)

```
2026-08-29 18:38:51 | pid=42756 sysCount=1 dispCount=0   <- step 1 baseline, GameLib holds NONE
2026-08-29 18:43:25 | pid=42756 sysCount=1 dispCount=1   <- step 2 game launched
2026-08-29 18:43:40 | pid=42756 sysCount=1 dispCount=0   <- step 3 game quit, released
2026-08-29 18:44:52 | pid=42756 sysCount=1 dispCount=0   <- step 4 download started (system only)
2026-08-29 18:45:07 | pid=42756 sysCount=1 dispCount=0   <- step 5 download ended, released
2026-08-29 18:45:58 | pid=42756 sysCount=1 dispCount=1   <- game launched again
2026-08-29 18:48:42 | pid=NONE  sysCount=1 dispCount=0   <- Cmd-Q (graceful), released
2026-08-29 18:51:23 | pid=50678 sysCount=1 dispCount=0   <- app restarted, clean baseline
2026-08-29 18:53:50 | pid=50678 sysCount=1 dispCount=1   <- game launched
2026-08-29 18:54:25 | pid=NONE  sysCount=1 dispCount=0   <- SIGKILL, nothing survived
```

## 3. Evidence for the criteria that require pasted output

### Step 1 — baseline

```
=== 2026-08-29 18:38:51 ===
pid=42756 sysCount=1 dispCount=0
```

No `(gamelib-shell)` line exists. GameLib held zero assertions with the app already running.

### Step 2 — display assertion while a game runs

```
=== 2026-08-29 18:43:27 ===
pid=42756 sysCount=1 dispCount=1
   pid 42756(gamelib-shell): [0x0002e91000019c1b] 00:00:02 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
   pid 42756(gamelib-shell): [0x0002e91100059c1c] 00:00:02 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
   pid 42756(gamelib-shell): [0x0002e91000059c1a] 00:00:02 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
```

The display assertion is present and correctly named. The `PreventUserIdleSystemSleep` line in
this block is F-35-08-A — no download was running.

### Step 4 — system assertion during a download, a DIFFERENT kind

```
=== 2026-08-29 18:44:52 ===
pid=42756 sysCount=1 dispCount=0
   pid 42756(gamelib-shell): [0x0002e96700019c33] 00:00:00 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
```

This is the discriminating observation for T-35-32: `dispCount=0` and the only GameLib assertion
is the system kind. The download did **not** take a display lock, so the two kinds are genuinely
distinct at the OS level and not a single collapsed assertion wearing two labels.

### Step 6 — nothing survives the app

Precondition, immediately before the kill:

```
2026-08-29 18:54:14  shell 50678, game pids 47713 53322
   pid 50678(gamelib-shell): [0x0002eb8000019cfa] 00:00:26 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
   pid 50678(gamelib-shell): [0x0002eb8000059cfb] 00:00:25 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
   pid 50678(gamelib-shell): [0x0002eb8000059cf9] 00:00:26 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
```

After `kill -9 50678`:

```
=== POST-KILL 2026-08-29 18:54:27 ===
shell: GONE
game still running: 47713 53322
--- assertions attributed to gamelib-shell ---
(NONE — nothing survived)
--- full counters ---
   PreventUserIdleDisplaySleep    0
   PreventUserIdleSystemSleep     1     <- caffeinate + powerd, not ours
--- any orphaned assertion naming GameLib, whatever the owner ---
(none)
```

The final check is deliberately owner-agnostic: it greps for the string `GameLib` across every
assertion regardless of owning process, so an assertion re-parented away from the dead pid would
still have been caught. None was.

## 4. BOTH quit paths were exercised, and they prove different things

This distinction is load-bearing and the gate would be weaker without it.

| Path | Time | What it exercises | Result |
|---|---|---|---|
| **Cmd-Q** (graceful) | 18:48:42 | Tauri `RunEvent::Exit` → `wake_lock_release_all()` — **our** shutdown code | Both assertions released |
| **SIGKILL** | 18:54:25 | macOS reclaiming IOKit assertions when the handler does **not** run | Nothing survived |

The plan's step 6 asks for a force-quit, so SIGKILL is what closes the criterion as written. But
Cmd-Q is the only one of the two that can show `wake_lock_release_all()` actually works — under
SIGKILL a completely absent shutdown hook would produce an identical clean reading. Recording only
the force-quit would have left the shutdown release unproven; recording only Cmd-Q would have left
the stated criterion unmet. Both are on the record for that reason.

## 5. No leaked id, across nine distinct assertions

Every distinct `IOPMAssertionID` observed across the whole run, each of which appeared and later
disappeared — no id was ever left held, and none was reused while live:

```
0x0002e91000019c1b  PreventUserIdleSystemSleep   "GameLib: a download is in progress"
0x0002e91000059c1a  PreventUserIdleDisplaySleep  "GameLib: a game is running"
0x0002e91100059c1c  PreventUserIdleDisplaySleep  "GameLib: a game is running"
0x0002e96700019c33  PreventUserIdleSystemSleep   "GameLib: a download is in progress"
0x0002e9aa00019c56  PreventUserIdleSystemSleep   "GameLib: a download is in progress"
0x0002e9aa00059c57  PreventUserIdleDisplaySleep  "GameLib: a game is running"
0x0002eb8000019cfa  PreventUserIdleSystemSleep   "GameLib: a download is in progress"
0x0002eb8000059cf9  PreventUserIdleDisplaySleep  "GameLib: a game is running"
0x0002eb8000059cfb  PreventUserIdleDisplaySleep  "GameLib: a game is running"
```

This is the live counterpart to the T-35-31 unit test: the id registry released exactly what it
took, nine times out of nine, under real OS assertions rather than a mocked `requestRustInvoke`.

## 6. Acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | Step 2 shows a display-kind assertion attributed to GameLib while a game runs | **PASS** |
| 2 | Step 4 shows a system-kind assertion during a download, DIFFERENT from step 2's | **PASS** — `dispCount=0` throughout the download |
| 3 | Steps 3, 5 and 6 each return to the step-1 baseline | **PASS** — 18:43:40, 18:45:07, 18:54:27 |
| 4 | The report pastes `pmset` lines for steps 1, 2 and 4 | **PASS** — §3 |
| 5 | Platform and build type stated; Windows/Linux marked NOT ATTEMPTED | **PASS** — frontmatter + §8 |
| 6 | (`success_criteria`) neither kind keeps the other awake | **FAIL** — F-35-08-A |

Criteria 1–5 are Task 3's own list and all pass. Row 6 is the plan's `success_criteria`, which
Task 3's criteria never operationalised — it is scored here because the observation happened to
falsify it, and dropping it would make this document a clean pass over a known defect.

## 7. F-35-08-A — a running game also holds a system-sleep assertion

**Observed:** every game launch (18:43, 18:45, 18:53 — 3 of 3) took a
`PreventUserIdleSystemSleep` assertion named `"GameLib: a download is in progress"` alongside the
correct display assertion, and held it for the whole session. No download was running.

**Mechanism, traced in source rather than inferred from the symptom:**

1. `src/frontend/state/GlobalState.tsx:1633` — `allowedPendingOps` contains **both** `'launching'`
   and `'playing'`.
2. On launch the game's status is `'launching'` first, so `pendingOps` is 1 while `playing` is
   still `false` → `window.api.lock(false)`.
3. `src/backend/sidecar/appShellFlowRegistration.ts:300-302` — `!playing && !isSleepBlocked` →
   `powerSaveBlocker.start('prevent-app-suspension')` → the system assertion.
4. Status then becomes `'playing'` → `lock(true)` → the display assertion is taken (correctly).
5. The system assertion is never released, because `unlock()` only fires when `pendingOps` reaches
   0 — i.e. when the game exits.

**Ownership.** This is inherited caller logic — that block mirrors Heroic's `main.ts:618-631`, and
the same sequence exists upstream. It is **not** a defect in plan 35-08's own Rust or stub code,
both of which behaved exactly as specified: they took the kind they were asked for. Under Phase
33's no-op stub the wrong call held nothing and was unobservable. Plan 35-08 made the assertions
real, which turned a latent caller bug into live behaviour.

**Why it still counts against this gate.** The plan's `success_criteria` reads: *"A game running
keeps the display awake; a download running keeps the system awake; neither keeps the other
awake."* A game running currently keeps the system awake too. Ledgered as `D-35-08-02`.

## 8. Second observation — two display assertions per launch

Launches at 18:43 and 18:53 each took **two** display assertions with distinct ids; the launch at
18:45 took one. Two is the expected count, because two independent paths each take a display lock:
`src/backend/launcher.ts:190` and `appShellFlowRegistration.ts:305`. Both were always released, so
this is duplication, not a leak, and no acceptance criterion turns on it.

**The single-display launch at 18:45 is unexplained and is deliberately left that way** rather
than given a plausible cause. It is folded into `D-35-08-02` as a secondary note.

## 9. NOT ATTEMPTED

- **Windows** — no hardware. T-35-33 (`SetThreadExecutionState` is per-thread, so flags set on a
  transient handler thread evaporate silently) remains **untested on any platform**. The
  implementation deliberately holds the flags on a dedicated long-lived thread, but no automated
  test anywhere can observe whether that thread actually holds them, and this gate did not either.
- **Linux** — no hardware. The `systemd-inhibit` child-process arm is unobserved.

Neither was inferred from the macOS result. The macOS arm reaches IOKit directly and shares no
code path with either.

## 10. Reproduction

```bash
# baseline
pmset -g assertions | grep -F "(gamelib-shell)"
# launch a game / start a download through the UI, then re-run the above
# force-quit:
kill -9 $(pgrep -x gamelib-shell)
pmset -g assertions | grep -F "GameLib"   # owner-agnostic: must print nothing
```
