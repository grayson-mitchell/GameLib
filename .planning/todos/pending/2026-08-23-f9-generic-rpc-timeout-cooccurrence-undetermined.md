---
created: 2026-08-23
title: "F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED"
source: 34.4.1 gap cycle 3, plan 34 (from D-29-06 / F-9, open since gate run 2)
status: "PARKED 2026-09-07 — SPLIT INTO TWO QUESTIONS. Question 1 (did id=1575 co-occur with a cookie operation?) is CLOSED AS PERMANENTLY UNANSWERABLE and its answer is recorded as UNDETERMINED, FOREVER — closed is NOT answered, and it is NOT rounded to no. Question 2 (does this timeout shape co-occur with a cookie operation as a class?) stays OPEN and is PARKED. See the two dated sections below; the PARKED one carries a runnable unpark condition."
severity: low
resolves_phase: null
blocked_by: "nothing external. Q1 (id=1575) is not blocked, it is UNANSWERABLE — that id carries no channel name in the diagnostic as it was emitted, its scrollback was never captured, and no later code can reconstruct a line that was never written; see the CLOSED section below. Q2 (the class question) is not blocked either, it is UNSCHEDULED — it needs a RECURRENCE, which cannot be scheduled. The old 'co-occurrence cannot be settled after the fact' clause was retired for FUTURE occurrences by 260905-omc (the diagnostic now names its channel) and 260907-j8n (it now persists to gamelib-shell.log); it remains exactly true for id=1575 itself."
parked: 2026-08-23
parked_by: operator
revisit_trigger: "the timeout recurs with a cookie operation in the same window"
related_requirement: REQ-34.4.1-GAP-11
---

# F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED

```
[shell] response for unknown/timed-out id=1575 (dropped)
```

A request timed out, was abandoned, and its response arrived to find no waiter.

**`keyring:timeout` specifically did NOT fire** — plan 26's classified 8s message never appeared, and
the post-relaunch boot in gate item 2 was clean. So this is not the keyring path.

## The answer is UNDETERMINED and is recorded as such

The gate contract's specific question was: *did it co-occur with a cookie operation?*

**That is UNDETERMINED, and is deliberately NOT rounded to "no".** `id=1575` carries no channel name.
Answering it requires locating the request that opened that id in the same scrollback.

Rounding an unknown to the convenient answer is the failure this project paid nine live runs for
once already (F-10, correlation shipped as cause).

## The transferable correction — this is the valuable part

This was **first recorded as "F-9 watch CLEAN"** on the strength of a `gamelib.log` grep.

**That grep could not have seen it.** Shell `eprintln!` never reaches the log file — stdout is the
RPC frame pipe, so the shell's diagnostics go to stderr and the log captures neither.

> **A clean grep of the wrong source is not evidence of absence.**

## Discharge condition

Capture the **full shell scrollback** — not `gamelib.log` — across a run that exercises a cookie
operation, and correlate `id=` values to find which request opened the timed-out id.

## Cross-link

`REQ-34.4.1-GAP-11` is the related **observability** requirement: `keyring_get` returns a classified,
bounded-timeout error instead of silently consuming the sidecar's whole 60s RPC budget. It was
un-checked on 2026-08-23 (gap cycle 3, plan 30) because its own body says *"This box stays UNCHECKED
— live-only"*.

**GAP-11 is explicitly NOT a root-cause fix for F-9** — it is observability, and F-9's underlying
cause is not established. Do not close one by satisfying the other.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"), alongside
`REQ-34.4.1-GAP-11` and `D-29-02`. Parked is **not** assigned — no phase owns this. The answer stays
**UNDETERMINED** and must be written as such; a park is not permission to round it to "no".

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

34.6's live gate independently reproduced the **same class** of event this todo tracks — a
different id, a different session, but the same shell-layer shape:
`[shell] response for unknown/timed-out id=10023 (dropped)`, recorded during Step 6 (`egsSync`)'s
`openDialog` finding.

This is a **recurrence of the pattern, not a discharge of this specific case.** The new
occurrence's root cause was diagnosed and is different from what this todo (id=`1575`) needs
answered: it traces to `openDialog` missing from the shell's `LONG_RUNNING_CHANNELS`
(`main.rs:184`), a >60s dialog-picker interaction — tracked in its own committed todo (`99e8300f1`)
— not a cookie operation. So the new occurrence answers "was id=10023's timeout a dialog-picker
issue" (yes); it says nothing about whether id=`1575` (this todo's own case) co-occurred with a
cookie operation. That original question still requires the full shell scrollback across id=1575's
specific window, which was never captured — this todo's own established correction stands
unchanged: "a clean grep of the wrong source is not evidence of absence" (`gamelib.log` cannot see
shell `eprintln!` output).

**Stays pending, UNDETERMINED**, exactly as before. Recorded so a future reader does not mistake
the new id=10023/`openDialog` finding for a resolution of this todo's still-open id=1575 question —
same failure **class**, not the same **case** — rounding one to answer the other would repeat the
exact F-10 correlation-as-cause mistake this todo's own text already warns against.

## Disposition (2026-09-05, quick task `260905-omc`) — does NOT close

The **discharge condition is now mechanically satisfiable on the next recurrence.** It was not
before. Nothing about id=`1575` changed.

`blocked_by` above states the real obstacle: *"id=1575 carries no channel name, so the originating
request must be located in the same scrollback AT THE TIME; co-occurrence cannot be settled after
the fact."* That was true of the **code**, not of the world — and it was still true at HEAD, which
meant the *next* occurrence would have been exactly as unanswerable as this one. Two sites in
`src-tauri/src/main.rs` threw the channel name away:

- `SidecarState.pending` was `HashMap<String, Sender<..>>` — id → sender only. `pending.remove(&id)`
  on the timeout branch destroyed the last trace of which channel opened that id.
- The reader thread could therefore only print the bare id.

Both are fixed. `pending` now carries `(channel, sender)`; abandoned ids are recorded into a
bounded `id -> channel` ring (`ABANDONED_IDS_CAP = 64`, oldest-dropped); the diagnostic reads

```
[shell] response for unknown/timed-out id=1575 channel=getCookies (dropped)
```

and renders `channel=<unrecorded>` — never a guess — when the id is not in the ring. The bounded
timeout `Err` now names its channel too (`sidecar invoke timed out: {channel}`), adopting the
format the **opposite leg of this same transport already used** (`rustInvoke timed out after
60000ms: keyring_get`, `sidecarRpc.ts:385`). That asymmetry — one direction naming its channel, the
other not — was the whole of this todo's blind spot.

**The question this todo asks remains UNDETERMINED.** Did id=`1575` co-occur with a cookie
operation? Unknown, and now unknowable: the scrollback for its window was never captured, and no
code written afterwards can reconstruct a diagnostic that was never emitted. Per this todo's own
standing rule, that is recorded as UNDETERMINED and **not** rounded to "no" — and per its own
cross-link rule, an observability improvement does not discharge it (the same rule that keeps
`REQ-34.4.1-GAP-11` from closing it applies here, to this task, unchanged).

**Stays `pending`. Status unchanged. No box checked.**

What a future reader may now rely on: if this fires again, the terminal line itself names the
channel, so the `revisit_trigger` above ("the timeout recurs with a cookie operation in the same
window") becomes answerable from a single line of scrollback rather than requiring an id
correlation performed live. The correction this todo already carries still stands and still
applies to that capture — **`gamelib.log` cannot see shell `eprintln!` output** (stdout is the RPC
frame pipe; shell diagnostics go to stderr), so the capture must be the full shell scrollback, not
the log file. A clean grep of the wrong source is not evidence of absence.

Gates: `src/backend/__tests__/abandonedInvokeAttribution.test.ts` (9 tests, runs in CI) pins the
wiring; `src-tauri/src/main.rs`'s cargo module covers the helpers (251 passed, manual — CI runs no
cargo step).

## Disposition (2026-09-07, quick task `260907-fni`) — does NOT close

A live cookie-gesture run was captured and analyzed by the apparatus this task built
(`pnpm capture:shell-scrollback` + `meta/captureShellScrollback.ts`'s `analyzeCapture()`). Verdict:
**`CLEAN_ASSERTED`** — the target diagnostic did not fire during a demonstrably-live window.

**This is an asserted null finding, not an assumed one.** The capture's proof-of-source anchors
were present and checked before anything else was evaluated:

- Boot: `[shell] sidecar process spawned OK`, `[shell] sidecar signalled READY (...)`
- Gesture: `[shell] humble_login_open: login chrome CSS injected for '...'`,
  `[shell] login-window sheet: present_login_window_as_sheet entered for '...'`
- Teardown: `[shell] sidecar terminated on exit`

Window: `windowStartedAt` 2026-09-07T00:28:10.772Z → `gestureAt` 2026-09-07T00:29:38.309Z →
`windowEndedAt` 2026-09-07T00:33:39.980Z. `durationMs` 329208 (~5.5 min total, ~4.6 min from gesture
to teardown). `derivedPollCount` 161, via the recipe the analyzer prints verbatim:
`floor((windowEndedAt − gestureAt) / COOKIE_POLL_INTERVAL_MS[1500]) = 161` — a **derived upper
bound** over ticks not short-circuited by `settled || validationInFlight`, never an observed count.

**Observed corroboration**, independently read from the same run's `gamelib.log` snapshot: the F-2
collapsed status line shows **1 + 7×7 = 50 observed validations** over ~222s of the window
(~4.4s apart) — `(12:29:40) Humble login validation rejected candidate session: session_expired`,
then seven repeats of `Humble login still waiting (status unchanged; 6 rejection(s) suppressed
since the last line): session_expired`. The derived 161 and the observed 50 do not conflict: they
measure different things (every 1500ms tick vs. `checkCookie`'s throttled validation), and 161 is
consistent with an upper bound over the same interval. State both, keep the distinction — one is
derived, one is observed.

The gesture exercised **all three** cookie channels, not only the poll:
`humble_login_clear_cookies` (a real Humble disconnect fired 3s before the window opened, clearing
21 `humblebundle.com` cookies), `humble_login_cookies_for_domain` (the same event's before/after
cookie census), and `humble_login_cookies` (`watchForLogin()`'s poll, running the whole window,
rejecting on `session_expired`). No credentials were entered — the session was already expired, so
this was a clean exercise of the cookie machinery with nothing to type, exactly as planned.

`nesting` is `null` in the result — **because there was no co-occurrence to evaluate, not because
an adjacency was checked and cleared.** `cookieLegMatches` (the sidecar→Rust leg's own
`rustInvoke timed out after …ms: humble_login_cookies*` timeout diagnostic) was empty: none of the
three cookie channels actually timed out this run, they completed normally (rejected, but
answered). `nesting` is only ever computed when a `RECURRENCE` and a cookie-leg timeout coincide;
neither condition held, so there was nothing for the field to assert.

Independent verification directly against the capture files (not just the analyzer's own verdict):
`response for unknown/timed-out` in raw stderr — **0**. `rustInvoke timed out` in the `gamelib.log`
snapshot — **0**. `sidecar invoke timed out` in raw stderr — **0**. `keyring:timeout` in either —
**0**. `^\[shell\]` lines in raw stderr — **31**, proof the sink was live and would have caught the
target line had it fired. Raw/timestamped line parity: **51 / 51**.

Capture files: `scratchpad/260907-fni-2026-09-07T00-28-01-703Z.{stderr.raw,stderr.ts,gamelib,meta,stdout}.log`
(gitignored — never committed). Orphan report: none found. Run metadata: `headSha bef1fa4ca`.

**One harness defect surfaced and was fixed before this run could produce a result.** The tool's
own first invocation crashed before the app ever launched: `meta/runTs.cjs` bundles the script into
a `mkdtempSync(os.tmpdir(), 'gamelib-runts-')` temp directory and runs it from there, so
`REPO_ROOT = join(__dirname, '..')` resolved to the temp dir, not the repo, and
`readLongRunningChannels()` threw `ENOENT` reading `src-tauri/src/main.rs` before `pnpm tauri:dev`
was ever spawned. **Task 1's own nine tests could not see this**, because all nine drive
`analyzeCapture()` over inline string fixtures and never exercise the CLI half's path resolution at
all — the test gate was fully green while the tool could not run. Fixed in `bef1fa4ca` by resolving
`REPO_ROOT` from `process.cwd()` (this repo's established convention for scripts run this way, per
`meta/checkBuildBinMirror.ts:197` and `meta/genI18nGateScope.ts:459`) and adding `assertRepoRoot()`,
run before either module-scope source read, whose message states plainly that nothing was captured
and nothing was measured — so a no-capture exit cannot be misread as a clean watch. A new T10 (4
tests) pins the guard's contract and was itself RED-proved by disabling it.

**In both branches this task's plan requires stating explicitly, restated here:**

- **`id=1575` remains UNDETERMINED and is NOT rounded to "no".** That id's own scrollback was never
  captured at the time it fired, and no later run — however clean — can reconstruct a diagnostic
  that was never emitted. A clean watch of a *different* window answers nothing about it, exactly
  as the 2026-08-25 (id=10023) and 2026-09-05 (attribution fix) dispositions above already
  established for their own, different findings.
- **This run is not a discharge of this todo.** `status: pending` is unchanged, byte-identical
  outside this appended section. No box is checked. `closes_todo: false`.
- **The transferable correction, extended by this task:** `gamelib.log` cannot see shell
  `eprintln!` output (already established). **Neither can `gamelib-shell.log`** — `shell_diag()`
  (`main.rs:8521`) writes to both stderr and that file, but the target diagnostic at `main.rs:8332`
  is a plain `eprintln!` that never routes through `shell_diag()`. A dev-time grep of
  `gamelib-shell.log` would be a *second* wrong source, not a fallback for the first. Only the
  shell process's own stderr, captured whole, is a valid source for this diagnostic.
- **What a future reader may now rely on:** the next recurrence is capturable by one command,
  `pnpm capture:shell-scrollback` (repo root, quits/refuses if a dev instance is already running).
  Its analyzer is fail-closed by construction — it refuses to certify a capture whose boot/gesture/
  teardown `[shell]` anchors are not all present, so the "clean grep of the wrong source" failure
  that produced this todo's original, worthless first record cannot be repeated through this path.
  Exit 0 with `verdict: RECURRENCE` or `CLEAN_ASSERTED` is a usable result; exit 2
  (`INVALID_ANCHORS`) or exit 3 (a pre-existing instance already running) means the run measured
  nothing and must be re-run, not written up.

**Stays `pending`, UNDETERMINED for id=1575, exactly as before.**

## Disposition (2026-09-07, quick task `260907-j8n`) — does NOT close

**What changed.** The shell's four RPC transport-failure diagnostics now route through
`shell_diag()` instead of a bare `eprintln!`, so they persist to `gamelib-shell.log` in addition
to stderr (`main.rs`, commit `6fb96c76a`). Two of the four — `SidecarState::invoke`'s timeout arm
and its disconnect arm — **emitted nothing at all before this task.** A 60s abandonment with no
late response left no shell-side trace whatsoever; it was visible only as a rejected promise in
the renderer. Both arms now emit one line naming both `id` and `channel`
(`invoke abandoned (timeout): id=… channel=…` / `invoke abandoned (sidecar closed): id=… channel=…`),
placed before `self.record_abandoned(…)` because `abandonedInvokeAttribution.test.ts`'s ordering
pin (`record_abandoned(&id, &channel);\s*Err(…)`, only whitespace between) forces that placement —
proven by mutation, see the SUMMARY's RED-proof (d). The other two sites (the reader thread's
`response for unknown/timed-out` and `response frame with a missing or non-string id` lines) were
converted from `eprintln!` to `shell_diag` with no change to their rendered stderr text.

**What a future reader may now rely on: a recurrence is PASSIVELY recorded.** No scheduled capture
session, no `pnpm capture:shell-scrollback` run, no operator present at the keyboard. It survives
in a **packaged build**, where LaunchServices discards stderr and every previous observation route
was blind. This is a strictly weaker but strictly always-on complement to `260907-fni`'s active
capture harness, which requires a deliberate live run.

**Correcting `260907-fni`'s extension to the transferable correction, above.** That disposition
stated:

> Neither can `gamelib-shell.log` — `shell_diag()` (`main.rs:8521`) writes to both stderr and that
> file, but the target diagnostic at `main.rs:8332` is a plain `eprintln!` that never routes
> through `shell_diag()`. A dev-time grep of `gamelib-shell.log` would be a *second* wrong source,
> not a fallback for the first.

**That was true when written and remains true for every occurrence of these four diagnostics
BEFORE commit `6fb96c76a`.** It becomes **false for these four diagnostics specifically**, for
every occurrence **from `6fb96c76a` onward**: `gamelib-shell.log` is now a valid source for them.
Do **not** generalise this correction — the other ~164 bare `eprintln!` sites in `main.rs` remain
invisible to `gamelib-shell.log`, and `260907-fni`'s original correction stands unchanged for every
one of them. A grep of `gamelib-shell.log` for *any other* shell diagnostic is still a clean grep
of the wrong source. A reader comparing the two dispositions should read `260907-fni`'s claim as
scoped to captures taken before `6fb96c76a`, and this one as scoped to captures taken at or after
it — they do not contradict each other; they describe two different points in time for the same
four lines.

**What this does NOT do, stated plainly:**

- It does not establish F-9's cause. It is observability. This todo's own cross-link rule — the
  one that keeps `REQ-34.4.1-GAP-11` from closing it — applies to this task unchanged.
- It cannot retroactively answer `id=1575`. That id's scrollback was never captured, and no code
  written afterwards can reconstruct a diagnostic that was never emitted.
- **`id=1575` remains UNDETERMINED and is NOT rounded to "no."**
- It does not make the analyzer smarter: see the residual below.

**The named residual.** After this change, an invoke abandoned with **no late response** emits
`[shell] invoke abandoned (timeout): id=… channel=…` (or the `sidecar closed` counterpart) — a line
`meta/captureShellScrollback.ts`'s `analyzeCapture()` does **not** recognise, so it will not raise
a `RECURRENCE` verdict on it. The analyzer's verdict remains keyed exclusively on `TARGET_DROP_RE`
(the late-response line). This is a deliberate consequence of the "do not edit the harness"
constraint, not an oversight: the new lines are additional evidence present in the raw capture,
which is what a human reads. Widening the analyzer is a legitimate follow-on, out of scope here,
and is **not** filed as a todo by this task.

**Gates.** `src/backend/__tests__/shellDiagPersistence.test.ts` (15 tests, runs in CI) pins all
four call sites, counted per-branch, RED-proved by mutating the implementation. The cargo module
added beside it (`main.rs`, `invoke_abandoned_message` tests) is a **manual** gate — this project's
CI runs no cargo step. `abandonedInvokeAttribution.test.ts` (9/9) and
`captureShellScrollback.test.ts` (15/15) both pass **unedited**.

**Stays `pending`. Status unchanged. No box checked. `closes_todo: false`.**

## CLOSED AS UNANSWERABLE 2026-09-07 (quick task 260907-o1b) — question 1: the answer is UNDETERMINED, FOREVER

This file has always asked **two** questions, and they want **opposite** dispositions. Naming them
plainly: **Q1** — did `id=1575` specifically co-occur with a cookie operation? **Q2** — does this
timeout shape co-occur with a cookie operation as a **class**? This section closes Q1 only, and its
recorded answer is UNDETERMINED. Q2 is addressed in the PARKED section below and stays open.

Q1 is closed, UNDETERMINED, because it is **permanently unanswerable**: `id=1575`'s scrollback was
never captured at the time it fired, and no code written afterwards can reconstruct a diagnostic
that was never emitted.

**Closing is not rounding to "no."** The recorded answer is UNDETERMINED, and it stays UNDETERMINED
forever. Every one of the five dispositions above already refused to round this to "no" — the
2026-08-25 disposition called it a recurrence of the pattern, not a discharge; the 2026-09-05
disposition made the *next* occurrence answerable while stating id=1575 itself remains UNDETERMINED;
the 2026-09-07 `260907-fni` disposition asserted a clean watch of a *different* window that answers
nothing about id=1575, UNDETERMINED; and the 2026-09-07 `260907-j8n` disposition made recurrence
passively recorded going forward while restating id=1575 remains UNDETERMINED and is not rounded to
"no." This closure does not achieve by accident of bookkeeping what none of those five attempted:
"closed" here means *the question was retired for lack of any possible evidence*, not *the question
was resolved*. UNDETERMINED is the permanent, final answer to Q1, and it is closed as UNDETERMINED,
never as "no."

Closing beats parking for this half: parking implies "later," and for `id=1575` there is no later —
the evidence window is gone and cannot be reopened. A park with no possible trigger is
indistinguishable from a forgotten item, which is worse than an honest, permanent UNDETERMINED
closure.

This task also reconciled a **pre-existing** frontmatter inconsistency (present since August, not
introduced here): `parked: 2026-08-23` / `parked_by: operator` have coexisted with `status: pending`
and a `## Park` section since the file was first parked. Those August `parked:` / `parked_by:`
values are left untouched at their original date — this task did not invent the park, it reconciled
the status line to match what the body already said.

The file deliberately **stays in `.planning/todos/pending/`**, because Q2 is still open. Only one of
the two questions closed here, and it closed to UNDETERMINED, not to an answer; a move to
`.planning/todos/completed/` would misrepresent that the file's business is finished. It is not — Q2
is now PARKED, below, with a runnable unpark condition.

## PARKED 2026-09-07 — question 2: does this timeout shape co-occur with a cookie operation (the class question)?

This half can park now when it could not before: `260905-omc` made the diagnostic name its channel,
and `260907-j8n` made it persist to a file — so a recurrence of this timeout shape is now **passively
recorded**, with no operator at the keyboard and no scheduled capture session required, and it
survives a packaged build, where LaunchServices discards stderr and every prior observation route
was blind.

**Unpark condition:** run the grep below against `gamelib-shell.log`. A non-zero count means the
timeout shape recurred since persistence began (`6fb96c76a`) and names its channel — see below for
exactly what that does and does not establish.

```
# macOS
grep -c 'invoke abandoned\|unknown/timed-out' ~/Library/Logs/GameLib/gamelib-shell.log
# Linux (and any non-macOS build that sets HOME)
grep -c 'invoke abandoned\|unknown/timed-out' ~/.config/gamelib/gamelib-shell.log
```

- **`grep -c` exits 1 on a zero count.** It prints `0` and returns exit code `1` when there are no
  matches — that is not an error, and a reader running this in a `set -e` shell should not mistake
  the non-zero exit for a failure.
- **The file's lines are not `[shell] `-prefixed.** `shell_diag` writes `"[shell] {message}"` to
  stderr but `"{epoch_secs} pid={pid} {message}\n"` to the file. Do not add `[shell]` to the grep
  pattern above; it will match nothing against this file. Real sample, verified live:
  `1788755786 pid=30321 sidecar process spawned OK`.
- **On Windows this file very likely does not exist at all.** `shell_diag` (`main.rs`) resolves its
  directory from `std::env::var("HOME")` only, and Windows sets `USERPROFILE`, not `HOME` — the sole
  `USERPROFILE` reference in `main.rs` belongs to a different function. On a normal Windows shell the
  path resolution returns nothing and the file write is a silent no-op; stderr still gets the line,
  the file does not. This unpark condition is macOS/Linux only and does not claim Windows coverage.
- **Persistence began at commit `6fb96c76a`.** A zero count over lines that predate that commit
  establishes nothing — they were never written to this file in the first place.
- **Baseline observed at execution time (2026-09-07):** `~/Library/Logs/GameLib/gamelib-shell.log`
  had **537** lines and the grep above returned a count of **0** (exit 1), matching the same probe
  taken at planning time. A future reader can diff their own count against this baseline to tell
  growth from a cold start.

**What a non-zero count DOES and does NOT establish.** It **does** establish that the timeout
recurred, and that the line names its `channel` — precisely what `id=1575` lacked. It does **not**,
by itself, establish co-occurrence with a cookie operation. That requires correlating the *other*
leg: the sidecar→Rust side's own timeout diagnostic, ``rustInvoke timed out after …ms:
humble_login_cookies*`` (`sidecarRpc.ts:385`), which goes to **`gamelib.log`** — a different file
from `gamelib-shell.log`. Two legs, two files; a trigger that names only one leg is misleading.

**The `260907-j8n` residual, restated for a reader who runs this grep.** `analyzeCapture()`
(`meta/captureShellScrollback.ts`) does not recognise the two new `invoke abandoned` lines — its
`RECURRENCE` verdict is keyed exclusively on `TARGET_DROP_RE` — so the active capture harness would
not have raised `RECURRENCE` on an event this passive grep finds. And `TARGET_DROP_RE` is anchored
`^\[shell\] `, so by the file-vs-stderr prefix difference above it could never match a
`gamelib-shell.log` line even for the one shape it does recognise. The harness and the log observe
**different event populations**, in two independent ways. `pnpm capture:shell-scrollback`
(`260907-fni`) remains the stronger, deliberate route for a live gesture; this grep is the weaker,
always-on complement.

**Nothing automated reads this file.** Nothing currently reads `gamelib-shell.log`, and `audit-uat`
cannot see this todo at all. This parked item is only meaningfully different from a forgotten one if
a human actually runs the grep above — this project has a recorded failure exactly here (*a parked
status buries the item it exempts*). Wiring this grep into an automated audit was **deliberately
deferred** by the operator as a broader change, and is therefore **not** filed as a todo by this
task.

**No IPC change.** This task changes no channel, no command signature, and no frame shape —
`.planning/IPC-PORT-INVENTORY.md` discipline is not engaged.

Q1's answer is, and remains, UNDETERMINED and is not rounded to "no." This task closes no box,
checks nothing, and is `closes_todo: false`.
