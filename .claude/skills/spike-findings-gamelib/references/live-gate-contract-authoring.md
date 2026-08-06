# Live-gate contract authoring — the Structural Reachability Review and the dual-sink evidence-capture standard

This is a **project-standing reference**, not a phase artifact. It applies to any future blocking
live-gate contract in this repository, not only to Phase 34.4.2's own gate runs. Phase 34.4.2 is
cited throughout only as the evidence for why each rule exists.

## Section 1 — Why this file exists

Phase 34.4.2 has, across six gate runs (gate run 2 through RERUN-3 plus the two-plan review that
produced this file), found **six distinct contract-authoring defects**:

- Four single-requirement structural impossibilities in gate run 2's own contract (the DummyStore
  https-only block affecting items 3/4 and a precondition; item 6(a)'s concurrency framing against
  AppKit's own sheet-blocks-parent design; item 2's OAuth-runner-only log-line requirement Humble
  cannot emit).
- F-34.4.2-11: a requirement **interaction** defect — a mandatory truncating `tee` colliding with a
  mandatory mid-run relaunch — that individually-correct requirements produced together.
- F-34.4.2-14: a **sink mismatch** — three required log lines demanded of a transcript sink that
  structurally cannot carry sidecar-emitted output, regardless of whether the emitter itself was
  correctly identified.

Contract authoring is a **defect surface in its own right**, on the same footing as the code the
gate exists to verify. The Structural Reachability Review below is a **deliverable**, produced
before the contract's first live run, not a footnote added after a run goes wrong.

**Standing rule (decision D-E): the plan that authors a gate contract may never also run it.** The
plan that authors the contract must run this review — all five tests — before publishing it.

## Section 2 — The five defect-class tests

Apply all five tests to every item, sub-check, and precondition in the contract, and to the
evidence-capture instruction itself. Record a verdict (REACHABLE / IMPOSSIBLE / CONDITIONAL) and
cite evidence (a file:line or a command) for each row, in a table of this shape:

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|

### Test 1 — Origin/scheme reachability

Does any sub-check or precondition require a URL that the surface under test will actually reject
before ever reaching the code the sub-check is trying to exercise? A https-only gate rejecting a
`http://` test-fixture origin is the general shape.

**Worked example (Phase 34.4.2):** `login_window_url_arg` (`src-tauri/src/main.rs:926`, test at
`main.rs:5725`) rejects any non-`https` scheme before any window is built. Gate run 2's contract
required exercising this login path against the DummyStore test fixture, which serves plain
`http://` — the sub-check was IMPOSSIBLE by construction. RERUN-3's contract fixed this by scoping
every login-path item to the store's own real `https` login URL and removing DummyStore as a
precondition entirely.

### Test 2 — Concurrency reachability

Does any sub-check require two things to be driven at once through a UI where the platform's own
modality rules make that impossible? A presented sheet that is application-modal to its parent
window is the general shape — nothing else in that window (including a second login trigger) can
be driven while the sheet is up.

**Worked example (Phase 34.4.2):** RERUN-3's originally-planned Item 5 "Arm 2" asked an operator to
initiate a *second* login via UI click while the first sheet was already presented. A sheet is
application-modal to its parent by AppKit's own `beginSheet:` semantics, and every login trigger in
the app lives inside that same parent window's React tree — no alternate top-level window or tray
entry point exists. The step was IMPOSSIBLE for a human operator to drive. The Structural
Reachability Review caught this before the contract's first live use and replaced it with a
record-only observation of the one scenario's own natural timing.

### Test 3 — Log-line emitter reachability (with the SINK clause)

For every literal an item requires, grep it in current source and record its file:line. This is
**necessary and not sufficient.** The test must also identify **which sink that emitter writes to**,
and confirm the contract's mandated capture actually reads that sink. A required line whose emitter
exists but whose sink is not captured is IMPOSSIBLE just as surely as a required line with no
emitter at all — and grepping the emitter alone will not reveal this.

**The project's two sinks and their partition (confirm each with the cited command before relying
on it — sinks can shift as logging code changes):**

- Rust `[shell]`-prefixed lines reach `tauri:dev`'s own stdout/stderr, and therefore the tee'd
  terminal transcript. They never reach `~/Library/Logs/GameLib/gamelib.log`.
- Sidecar-side `logInfo`/`logWarning` calls (`src/backend/logger/index.ts`) reach
  `~/Library/Logs/GameLib/gamelib.log` and **never** the tee'd terminal transcript — the sidecar's
  stdout is consumed as the RPC frame pipe, not surfaced as human-readable text (this project's own
  `sidecar-console-and-logger-are-invisible` lesson).
- Sidecar STDERR does reach the tee'd transcript, prefixed `[sidecar:err]`.
- Sidecar `console.*` calls reach **nothing at all** — no sink captures them.

**Worked example (Phase 34.4.2, F-34.4.2-14):** RERUN-3's contract required three lines of the
tee'd terminal transcript — `Humble sync finished:` (`src/backend/humble/library.ts:954`, `logInfo`),
`Humble disconnect: cookie census before(...)` (`src/backend/humble/user.ts:1049`, `logInfo`), and
`Humble login-window cookie read UNSUPPORTED_OR_ERROR for window {seamLabel} — aborting watch`
(`src/backend/humble/user.ts:461`, `logWarning`). All three emitters exist and were correctly
grepped and cited at authoring time — Test 3 as originally written was satisfied. But all three are
sidecar-emitted, and none of them can ever reach the transcript the contract demanded of them. This
is why one of the three (item 4's line) was recorded absent from the transcript with no cause ever
assigned: the contract asked a real emitter for evidence via a sink that cannot carry it.

### Test 4 — Absence-observability

For every required ABSENCE, confirm the PRESENCE case would have produced an observable signal. An
absence assertion over a code path that logs nothing on success proves nothing — a passing "the
line never appeared" check is meaningless unless a regression reintroducing the line would actually
have appeared.

**Worked example (Phase 34.4.2):** the autofill-affordance deletion's absence check
(`grep -c GAMELIB_AUTOFILL_GLYPH src-tauri/src/main.rs` → `0`) is meaningful because a regression
reintroducing a reader for that env var WOULD produce an observable line, mutation-proven by the
`PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS` test. Contrast: item 6(a)'s "not refused by the single-flight
guard" sub-check for a hidden window is *structurally guaranteed* rather than falsifiable — the
guard only runs inside `if visible == true`, so a hidden window never reaches the guard's code at
all. Both are legitimate to keep in a contract, but the review must record which kind of absence
each one is, so "confirmation of an existing structural guarantee" is never misread as "a novel
live discovery."

### Test 5 — Requirement-interaction reachability

**Its unit of review is the PAIR, not the requirement.** Tests 1-4 examine each item, sub-check, and
precondition individually — and every one of them can pass Tests 1-4 while still combining to
destroy each other's evidence. This is the concrete gap F-34.4.2-11 exposed: a mandatory truncating
`tee` (individually reachable, individually correct) and a mandatory mid-run relaunch (individually
reachable, individually correct) combined to destroy the transcript for two of the six items this
entire gate cycle existed to measure. Neither requirement alone fails any of Tests 1-4; only their
interaction does.

**For every pair of requirements (A, B) in the contract — including preconditions, sub-checks, and
the evidence-capture instruction itself — ask: does satisfying A ever destroy, truncate, restart,
clear, overwrite, or otherwise invalidate B's own evidence or preconditions?**

Give the author a concrete hunting list rather than an abstraction:

- Anything that **RESTARTS** the app or a process.
- Anything that **TRUNCATES or OVERWRITES** a file (a `>` redirect, a `tee` without `-a`, a log
  rotation).
- Anything that **CLEARS** state (a logout, a disconnect, a cookie wipe, a storage clear, a cache
  purge).
- Anything that **RESETS** a store.
- Anything that changes an **environment variable** a later item depends on.
- Anything that consumes a **one-shot resource** (a clipboard entry, a single-use token, a queued
  upstream request).

**Require the review to record the pairing pass explicitly** — how many pairs were considered, and
which ones were flagged — so "found nothing" and "did not look" stay distinguishable, exactly as
Test 4 already requires for absence checks.

**Practical scoping rule:** the pass is over **state-mutating requirements against
evidence-bearing ones**, not the full n² cross product of every requirement against every other. A
contract with M state-mutating requirements (relaunches, clears, resets, env-var changes) and N
evidence-bearing requirements (log-line assertions, artifact checks) needs at most M×N pairs
considered, not (M+N)². The author must state which reduction they applied — e.g. "considered every
{relaunch, clear, env-var change} against every {required log line, required artifact}" — so a
reader can judge whether the reduction was sound, not merely trust that it was applied.

**Worked example (Phase 34.4.2, F-34.4.2-11):** the pairing pass would have flagged exactly this
pair — {the evidence-capture `tee` instruction} × {item 3(c)'s mandated relaunch} — as: does the
relaunch (a mid-run app restart, on the hunting list) invalidate the tee'd transcript (an
evidence-bearing requirement)? Yes: a bare `tee` (no `-a`) truncates to zero on every new process
start. This single pairwise check, run once during authoring, would have caught the defect before
any live run.

## Section 3 — The dual-sink evidence-capture standard

This is the concrete fix for F-34.4.2-11 and F-34.4.2-14. Every future contract in this project
must implement it in full — it is not optional guidance.

- **One session directory per gate run**, created ONCE before the first launch, named with a UTC
  timestamp (e.g. `/tmp/gamelib-gate-<ISO8601-UTC>/`), so a prior run's evidence can never be mixed
  in or overwritten by a later run.
- **The terminal transcript is APPENDED, never truncated.** Use `tee -a <session-dir>/terminal.log`
  into a single session-scoped file for every launch. Never a bare `tee`, never a `>` redirect.
- **A delimiter line is written into that file before each launch**, carrying the launch ordinal and
  a UTC timestamp, by a command that cannot be confused with app output — for example:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session-dir>/terminal.log`.
  The contract must state this exact delimiter text, so the runner can grep for it
  (`grep -n '^=== GATE LAUNCH'`) and a reader can find each launch's section boundaries.
- **`gamelib.log` is archived per launch**, copied to a launch-numbered file inside the session
  directory (`cp ~/Library/Logs/GameLib/gamelib.log <session-dir>/gamelib-launch-${N}.log`), and the
  copy must happen while it still exists — **before the next launch's first write renames it to
  `.old`** (`src/backend/logger/log_writer.ts:72-74`: `existsSync(this.logFilePath)` then
  `renameSync(this.logFilePath, this.oldLogFilePath)`). Also archive any pre-existing `.old` file on
  the very first pass, since it may hold evidence from a launch before the session began.
- **Every item records which launch ordinal covered it**, so a reader can locate its evidence
  (both the terminal-log delimiter section and the archived `gamelib-launch-${N}.log`) without
  guessing which of several launches produced it.
- **A closing inventory**: at session end, the runner lists the session directory
  (`ls -la <session-dir>/`) and records each file's line count (`wc -l <session-dir>/*`), so a
  missing or zero-length capture is visible immediately during the gate run itself, rather than
  discovered during write-up after the app has already been closed and the evidence is gone.

## Section 4 — Two rules the project has paid for twice

**(i) Never use a tee'd transcript to prove a backend path did NOT run.** Absence in a transcript
is not absence in execution. This project shipped that inference once as corroboration for the
F-34.4.2-12 debug session's own (later-retracted) log-silence claim, and had to correct the record
in place once the sidecar-invisibility mechanism was understood — the log's silence discriminated
nothing, because sidecar output could never have reached that transcript regardless of whether the
code ran, deadlocked before it, or sailed straight through it. Do not repeat this inference; if a
"path did not run" claim needs proof, it needs a channel that would show *presence* if the path did
run, and Test 4 (absence-observability) applies to it directly.

**(ii) A green test suite never closes a live gate.** Every blocking defect discovered across
Phases 34.4.1 and 34.4.2 — the sheet-attachment wedge, the autofill non-fill, the origin-confusion
race, the Humble disconnect deadlock — was found by a human operator driving the UI on real
hardware. The automated suite (`cargo test` / `npm run test:ci`) was green throughout every one of
them. A live-gate contract's own existence is the acknowledgment that this project's automated
suite, however comprehensive, cannot substitute for a human-driven hardware run — do not let a green
suite talk a future author out of authoring or running the gate.
