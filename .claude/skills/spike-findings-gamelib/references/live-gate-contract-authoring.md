# Live-gate contract authoring — the Structural Reachability Review and the dual-sink evidence-capture standard

This is a **project-standing reference**, not a phase artifact. It applies to any future blocking
live-gate contract in this repository, not only to Phase 34.4.2's own gate runs. Phase 34.4.2 is
cited throughout only as the evidence for why each rule exists.

## Section 1 — Why this file exists

Phase 34.4.2 has, across six gate runs (gate run 2 through RERUN-3 plus the two-plan review that
produced this file), found **six distinct contract-authoring defects**, plus two more found by
RERUN-4 that this section's own tally had not yet absorbed:

- Four single-requirement structural impossibilities in gate run 2's own contract (the DummyStore
  https-only block affecting items 3/4 and a precondition; item 6(a)'s concurrency framing against
  AppKit's own sheet-blocks-parent design; item 2's OAuth-runner-only log-line requirement Humble
  cannot emit).
- F-34.4.2-11: a requirement **interaction** defect — a mandatory truncating `tee` colliding with a
  mandatory mid-run relaunch — that individually-correct requirements produced together.
- F-34.4.2-14: a **sink mismatch** — three required log lines demanded of a transcript sink that
  structurally cannot carry sidecar-emitted output, regardless of whether the emitter itself was
  correctly identified.
- F-34.4.2-16: a **pre-existing external-state** defect — item 4's premise (a credential-entry
  event to observe) was invalidated by a live WKWebView cookie jar the contract's own preflight
  never checked, even though the app-side store it did check was correctly recorded as empty.
- F-34.4.2-17: a **UI-level unreachability** defect — item 5's gesture sequence was backend-reachable
  by every test applied to it at authoring time, yet the shipped frontend never offered the control
  the sequence needed.

**Eight distinct contract-authoring defects total, as of this writing.** RERUN-4 also found two
**capture-integrity** defects — F-34.4.2-15 (a concurrent second app instance splitting the
`[shell]` sink) and F-34.4.2-18 (a preflight gap for a pre-existing app instance) — both already
fixed in Section 3 below. They are not counted in the list above: Section 2's tests are
authoring-time reachability tests applied to a contract's items before it runs, while
capture-integrity defects belong to the evidence pipeline's own run-time behaviour, a different
category stated in full by Section 2's own coverage map at the end of this section.

Contract authoring is a **defect surface in its own right**, on the same footing as the code the
gate exists to verify. The Structural Reachability Review below is a **deliverable**, produced
before the contract's first live run, not a footnote added after a run goes wrong.

**Standing rule (decision D-E): the plan that authors a gate contract may never also run it.** The
plan that authors the contract must run this review — all seven tests — before publishing it.

## Section 2 — The seven defect-class tests

Apply all seven tests to every item, sub-check, and precondition in the contract, and to the
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

### Test 6 — Pre-existing external-state reachability

**Its unit of review is the item's PREMISE, not its evidence.** Does this item's premise assume a
fresh or clean state that some state living OUTSIDE what the contract's own preflight checks can
silently invalidate? Name the concrete external-state surfaces this project has: a live WKWebView
cookie jar, a system keychain entry, an already-running external process, a browser session, an
OS-level permission grant.

**General rule the finding produced: an emptied app-side store does not prove a logged-out
session.** For every premise of the form "the user is logged out / the field is empty / no session
exists," the contract must name a POSITIVE observable that confirms it (a rendered login form),
never merely the absence of app-side data. Require the review to record, per item, which external
state its premise depends on and what preflight check or in-run confirmation covers it.

**Worked example (Phase 34.4.2, F-34.4.2-16):** RERUN-4's Preflight Results recorded
`~/Library/Application Support/gamelib/humble_store/config.json`
(`34.4.2-LIVE-GATE-RERUN-4.md`, Preflight Results section) at 2 bytes with an mtime from a prior
session and treated it as a clean starting point. Item 4's premise — a credential-entry event to
observe — was nevertheless false: the WKWebView cookie jar independently held a live Humble
session that auto-completed the login with no form to paste into. Items 1(e) and 3(a) were
invalidated by the identical mechanism in the same run. The contract had no step that cleared the
cookie jar and no observable that would have shown the premise was already broken.

### Test 7 — UI-level reachability, distinct from backend-logic reachability

**Its unit of review is the operator GESTURE SEQUENCE.** Can the described sequence of clicks,
keystrokes and window interactions actually be performed against the shipped frontend as built?

**Why this is not covered by Test 2:** Test 2 reasons about platform modality and backend timing
(is the code path reachable at that moment?) and never inspects whether the UI exposes the
controls the gesture needs. A backend path can be perfectly reachable while the frontend never
offers the operator a way to reach it. Require the test to trace each gesture to the component
that renders the control it names, and to record what the frontend does with that control in the
state the item assumes — including whether navigation, conditional rendering, or a disabled state
removes it.

**General rule: a scenario whose gesture sequence the UI forbids can never PASS, no matter how
correct the backend guard is.** The correct dispositions are to drive the path below the UI,
restate the assertion at unit level, or withdraw the item with its reasoning recorded.

**Worked example (Phase 34.4.2, F-34.4.2-17):** RERUN-4's item 5 asked the operator to click
Amazon sign-in and then click Humble sign-in during nile's ~7-8s spawn delay, exercising the Rust
`PENDING_VISIBLE_LOGIN_WINDOW` single-flight guard. The Structural Reachability Review's Test 2 row
for that item verified — correctly — that the second initiation would land in the first's
PRE-presentation window, when no sheet is up and the parent is still interactive. The item was
still unperformable, for a reason Test 2 never asked about: clicking a login tile navigates the
whole route away from `/login` (`Runner`'s `handleLogin()`,
`src/frontend/screens/Login/components/Runner/index.tsx:72`, `navigate(props.loginUrl)`) to
`loginweb/:runner` (`src/frontend/App.tsx:200-201`), unmounting the entire `runnerGroup` container
— every OTHER runner's tile, including Humble's — that held it
(`src/frontend/screens/Login/index.tsx:151`). There is no second store's sign-in control left
mounted to click during the delay. **`deferred-items.md`'s own characterisation ("the frontend
disables/clears the other login buttons") was approximate — re-confirmed at this authoring against
current source, the mechanism is a full route navigation that unmounts the login screen outright,
not a disabled/cleared button state.**

### Coverage map — which test catches which measured defect

**Category distinction, stated in the file's own voice, before the table below:** Section 2's
seven tests are **authoring-time reachability tests**, applied to a contract's items, sub-checks
and preconditions before it runs. Section 3's bullets are **run-time capture-integrity
requirements**, applied to the evidence pipeline while it runs. A defect belongs to exactly one
category. Putting a capture-integrity failure in the test list below would make the test list look
more complete than it is — this is why F-34.4.2-15 and F-34.4.2-18 are attributed to Section 3
rules in the table, never to a Section 2 test.

| Finding | What it was | Caught by (test or Section 3 rule) | Category |
|---|---|---|---|
| Gate run 2's four single-requirement impossibilities | A `http://` origin against an `https`-only gate; a concurrency framing forbidden by AppKit sheet modality; an OAuth-only log line demanded of a non-OAuth runner | Test 1 / Test 2 / Test 3 | Authoring-time test |
| F-34.4.2-11 | A mandatory truncating `tee` colliding with a mandatory mid-run relaunch, destroying prior items' transcript evidence | Test 5 | Authoring-time test |
| F-34.4.2-14 | Three required log lines demanded of a transcript sink that structurally cannot carry sidecar-emitted output | Test 3's SINK clause | Authoring-time test |
| F-34.4.2-15 | A concurrent second `gamelib-shell` instance split the `[shell]` sink while `gamelib.log` stayed shared, so a partially-captured run looked successfully measured | Section 3's exactly-ONE-app-instance bullet | Run-time capture-integrity rule, NOT a Section 2 test |
| F-34.4.2-16 | Item 4's premise (a credential-entry event to observe) invalidated by a live WKWebView cookie jar the preflight never checked, though the app-side store it did check was correctly empty | Test 6 | Authoring-time test |
| F-34.4.2-17 | Item 5's gesture sequence was backend-reachable by every test applied to it, but the shipped frontend never offered the control the sequence needed | Test 7 | Authoring-time test |
| F-34.4.2-18 | Preflight checked for the DummyStore harness on its port but not for a pre-existing `gamelib-shell` instance | Section 3's preflight-must-check-for-a-pre-existing-instance clause | Run-time capture-integrity rule, NOT a Section 2 test |

**The map's own limits, stated plainly rather than implied.** This list is drawn from defects this
project has **MEASURED**, and every entry was added to this reference only after a live run had
already paid for it. Nothing here demonstrates the list is complete — the five-test list looked
complete before RERUN-4 measured three misses against it (F-34.4.2-15/-16/-17), and this
seven-test-plus-two-capture-rule list can fail the same way against whatever the next run finds.
The reviewable clause this file is held to (T-34.4.2-42: the count of structural impossibilities
and unresolved requirement interactions actually encountered during a run should be zero) is
restated here on purpose — the count is recorded per run whatever it is, so the next completeness
gap surfaces as a number rather than as a surprise.

**Tests 6 and 7 have caught nothing yet.** Both are derived directly from findings RERUN-4
measured, not validated by a run that applied them and confirmed they hold. The first contract
this reference's Tests 6 and 7 apply to (RERUN-4's successor) is also the first opportunity to find
out whether they actually work.

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

- **Exactly ONE app instance for the whole run — asserted, not assumed** (F-34.4.2-15, the
  RERUN-4 run). Before each launch, assert zero pre-existing instances
  (`pgrep -f 'target/debug/gamelib-shell'` must be empty); after the window appears, record the
  single PID into the transcript; at teardown, record it again. If the count is ever not 1, the
  launch is ABORTED and re-run — its evidence is not scorable.

  **Why this is its own bullet and not a footnote.** A second concurrent instance does not
  announce itself: it **splits the `[shell] sink while leaving `gamelib.log` SHARED**. The Rust
  binary's `eprintln!` lines follow the stderr of whichever process the runner's `tee` wrapped,
  while the sidecar's `[Backend]` lines from *both* processes land in the one `gamelib.log`. The
  resulting evidence set is the most dangerous shape this standard can produce: a populated,
  plausible-looking `gamelib.log` that independently confirms the operator really did drive the
  UI, sitting next to a transcript that is missing every scored `[shell]` literal. A reader who
  checks only that "the logs have content" concludes the items were measured. They were not.

  This is a **capture-integrity** failure, not a product failure, and it is invisible to every
  other rule in this section: the session directory was correct, the delimiters were correct, the
  appends were correct, the per-launch archiving was correct. Section 3's other bullets all
  silently assume a single instance. This bullet is what makes that assumption checkable.

  A stale instance from a previous session causes the same split, so **preflight must check for a
  pre-existing instance** — not only for the DummyStore harness on its port (F-34.4.2-18).

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
