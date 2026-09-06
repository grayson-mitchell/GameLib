---
quick_id: 260907-fni
slug: f9-live-capture-shell-scrollback
phase: quick-260907-fni
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/captureShellScrollback.ts
  - meta/__tests__/captureShellScrollback.test.ts
  - package.json
  - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
  - .planning/quick/260907-fni-f9-live-capture-shell-scrollback/SUMMARY.md
autonomous: false
requirements:
  - F-9 (todo `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`)
actions_todo: .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
closes_todo: false

must_haves:
  truths:
    - "One command captures the shell's stderr scrollback whole, and the capture file proves on its face that the sink was live from boot, through the cookie gesture, to teardown."
    - "The analyzer refuses to certify a capture whose proof-of-source anchors are absent — an absent target line can never, on its own, be read as a clean watch."
    - "A run that measures nothing (a pre-existing instance, a missing gesture) exits nonzero and is structurally unwritable-up as a result."
    - "The F-9 todo carries a new dated Disposition section and remains `status: pending` with no box checked."
  artifacts:
    - path: "meta/captureShellScrollback.ts"
      provides: "Live stderr capture harness + pure analyzer, re-runnable on the next recurrence"
      exports: ["analyzeCapture", "CAPTURE_ANCHORS", "TARGET_DROP_RE", "COOKIE_LEG_RE"]
    - path: "meta/__tests__/captureShellScrollback.test.ts"
      provides: "Fail-closed gate on the analyzer, driven over fixtures (Meta project, runs in CI)"
    - path: ".planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md"
      provides: "New dated Disposition section recording the run's outcome"
      contains: "## Disposition (2026-09-07, quick task `260907-fni`)"
  key_links:
    - from: "meta/captureShellScrollback.ts"
      to: "src-tauri/src/main.rs:8332"
      via: "TARGET_DROP_RE matches the HEAD diagnostic format including its `channel=` field"
      pattern: "response for unknown/timed-out id=.*channel="
    - from: "meta/captureShellScrollback.ts"
      to: "the stderr capture file"
      via: "the analyzer's only shell-leg source — never gamelib.log, never gamelib-shell.log"
      pattern: "stderr"
---

<objective>
Capture the **full shell scrollback from stderr** across a live run that exercises a Steam-adjacent
cookie operation, and record — as an asserted finding either way — whether
`[shell] response for unknown/timed-out id=N channel=X (dropped)` recurs and which channel it names.

**Purpose.** F-9's discharge condition became *mechanically satisfiable* at HEAD (quick task
`260905-omc` made the diagnostic self-attributing), but the CAPTURE has never happened. This task
builds the capture apparatus, performs one live run, and writes the result up honestly.

**Output.** A committed, re-runnable harness; one live capture; a new dated Disposition section on
the F-9 todo.
</objective>

<non_negotiable_constraints>
Read this section before any task. It governs every task in this plan.

1. **THE TODO MUST NOT BE CLOSED.** `status: pending` stays. No box gets checked. `closes_todo:
   false`. The `id=1575` question stays **UNDETERMINED** and must never be rounded to "no" — its
   scrollback was never captured and no code written afterwards can reconstruct a diagnostic that
   was never emitted. **A clean watch is NOT a discharge.** If this run produces no recurrence, that
   is a finding about *this run's window*, not about id=1575, and the write-up must say so in those
   words.

2. **A CLEAN GREP OF THE WRONG SOURCE IS NOT EVIDENCE OF ABSENCE.** This is the todo's own central
   correction and the reason its first "F-9 watch CLEAN" record was worthless. `gamelib.log` cannot
   see shell `eprintln!` output — the sidecar's stdout is the RPC frame pipe, the shell's
   diagnostics go to **stderr**.

   **A second, newer trap that this plan must design around:** `src-tauri/src/main.rs` has a
   `shell_diag()` helper (main.rs:8521) that writes to **both** stderr and a file
   `~/…/gamelib-shell.log`. The F-9 target line at **main.rs:8332 is a plain `eprintln!`** and does
   **NOT** go through `shell_diag()`, so it **never reaches `gamelib-shell.log` either**. Grepping
   `gamelib-shell.log` would repeat the exact original failure at one remove. **stderr of the shell
   process, captured whole, is the only valid source for the target line.**

3. **DO NOT FABRICATE THE HUMAN-VERIFY OUTCOME.** Task 2 is a blocking operator gesture. This
   project has a recorded incident of auto-mode answering its own human-verify gate. The executor
   **stops** at Task 2 and does not proceed until the operator returns the harness's verdict block
   verbatim. Do not write "I opened the login window"; you did not.

4. **NO IPC CHANNEL MAY BE ADDED OR CHANGED.** This is observability capture only. Do not add
   temporary `eprintln!`/`console.log` instrumentation to `src-tauri/` or `src/` either — the whole
   point is that HEAD is already sufficient. `git diff --stat` over `src/` and `src-tauri/` must be
   **0 files** at the end of this task.

5. **CO-OCCURRENCE NEEDS A MECHANISM, NOT AN ADJACENCY.** See `<hypothesis>` below. Mere adjacency
   in the same window is **correlation**, and writing it up as an answer would repeat the F-10
   correlation-as-cause mistake this todo's own text warns against twice.
</non_negotiable_constraints>

<hypothesis>
State this in the write-up. It is what converts "look for a coincidence" into "test a mechanism".

**The two legs are different directions of the same transport.**

| Leg | Direction | Bound | Diagnostic | Where it lands |
| --- | --- | --- | --- | --- |
| `SidecarState::invoke` | Rust → sidecar | `INVOKE_TIMEOUT` = 60s (main.rs:845), waived for `LONG_RUNNING_CHANNELS` (main.rs:869+) | `[shell] response for unknown/timed-out id=N channel=X (dropped)` (main.rs:8332) + `sidecar invoke timed out: {channel}` (main.rs:986) | **shell stderr** |
| `requestRustInvoke` | sidecar → Rust | `RUST_INVOKE_TIMEOUT_MS` = 60s, waived only for `UNBOUNDED_RUST_CHANNELS` (the three dialog channels, sidecarRpc.ts:96) | `rustInvoke timed out after 60000ms: {channel}` (sidecarRpc.ts:385) | a **rejected Promise**, surfaced by the caller's `logWarning` → **`gamelib.log`** |

Cookie operations — `humble_login_cookies`, `humble_login_cookies_for_domain`,
`humble_login_clear_cookies` (`src/common/types/sidecarTransport.ts`) — run **only on the
sidecar → Rust leg**. None is in `UNBOUNDED_RUST_CHANNELS`, so each carries its own 60s bound.

**H (the causal shape).** A `[shell] … channel=X (dropped)` is causally linked to a cookie operation
only if **X is a non-exempt Rust→sidecar channel whose sidecar handler was, at its 60s expiry,
awaiting an unresolved cookie `rustInvoke`.** That nesting is the only way the two are linked rather
than merely adjacent.

**Two consequences the executor must carry into the write-up:**

- `humbleStartLogin` and `humbleReconnect` are **both in `LONG_RUNNING_CHANNELS`** — they are
  exempt from the 60s bound and therefore **can never produce this diagnostic by timeout**. So a
  recurrence during a login watch naming one of those two would be a disconnect-branch event, not a
  timeout; and a recurrence naming any *other* channel is nesting with a different handler, not with
  the login handler.
- **Neither source alone can settle H.** The stderr capture cannot see the cookie leg's timeout; the
  `gamelib.log` snapshot cannot see the shell leg's drop. The correlation requires **both, over the
  same window, timestamp-aligned** — which is precisely why the harness snapshots `gamelib.log`
  alongside the stderr capture and timestamps every stderr line.
</hypothesis>

<verified_starting_context>
Re-verified against HEAD during planning. Cite line numbers back to these when writing tests.

- **main.rs:8332** emits `[shell] response for unknown/timed-out id={id} channel={channel} (dropped)`,
  reading `abandoned_channel_for()` and rendering the literal `<unrecorded>` (never a guess) on a
  ring miss.
- **main.rs:986-990** `invoke_timeout_message()` returns `sidecar invoke timed out: {channel}`.
- **main.rs:1210 / 1221** `record_abandoned` is called on **both** the timeout and the
  sidecar-disconnect branches. Confirmed present.
- **main.rs:845** `INVOKE_TIMEOUT = Duration::from_secs(60)`; **main.rs:997** `ABANDONED_IDS_CAP = 64`.
- **main.rs:8242** `start_stderr_forwarder` re-emits **the sidecar's own stderr** onto the shell's
  stderr, line-prefixed **`[sidecar:err] `**. So a single stderr capture carries *both* `[shell] …`
  and `[sidecar:err] …` lines. (The cookie leg's timeout is a rejected Promise handled by
  `logWarning`, so it goes to `gamelib.log` — not here. Do not expect it in the stderr capture.)
- **main.rs:8158/8204** the sidecar is spawned `stderr(Stdio::piped())`, which is the pipe the
  forwarder above drains.
- **Guaranteed `[shell]` anchors on every run** (verified by enumerating every `eprintln!` in
  main.rs): `[shell] sidecar process spawned OK`, `[shell] sidecar signalled READY (…)` at boot;
  `[shell] sidecar terminated on exit` (or the two `… during exit shutdown` variants) at teardown.
- **Gesture-specific anchors** (fire only when a login window opens):
  `[shell] humble_login_open: login chrome CSS injected '{label}'` and
  `[shell] login-window sheet: present_login_window_as_sheet entered '{label}'`.
- **The cookie exercise needs no credentials.** `HumbleUser.watchForLogin()`
  (`src/backend/humble/user.ts:238`) starts a `setInterval` at
  `COOKIE_POLL_INTERVAL_MS = 1500` (user.ts:52, user.ts:569). Each tick that is not short-circuited
  by `settled || validationInFlight` issues **`seam.takeEvents()` then `seam.cookies()`** — the
  latter is `requestRustInvoke(RUST_HUMBLE_LOGIN_COOKIES, …)` at
  `src/backend/sidecar/humbleLoginFlowRegistration.ts:193`. The 1500ms throttle in `checkCookie` is
  on the *validation* (`finishLogin`), **not** on the cookie read. Watch deadline is
  `LOGIN_WATCH_TIMEOUT_MS = 10 * 60_000` (user.ts:72).
- **Humble login is not completable unattended** (no API; `/processlogin` needs a reCAPTCHA). Do not
  plan or attempt a completed login. Opening and closing the window is the whole gesture.
- **UI route:** `/loginweb/humble` (`src/frontend/screens/Login/index.tsx:39`) mounts
  `HumbleLoginSurface`, which calls `window.api.humbleStartLogin()`
  (`src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:59`).
- **Run mechanics:** `pnpm tauri:dev` = `pnpm build:sidecar && pnpm build:decompress-worker-dev &&
  tauri dev`. `use_worktrees: false` — work on the current branch `fix/steam-native-install-stability`.
- **meta/ conventions:** scripts are `.ts` invoked as
  `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/X.ts`; tests are
  `meta/__tests__/X.test.ts` under the **Meta** jest project (`displayName: 'Meta'`, runs in CI).
- **`scratchpad/` is gitignored** and `.gitignore:65` names it as the home for raw `gamelib-*.log`
  captures precisely because they can carry secret material. Captures go there.
</verified_starting_context>

<environment_traps>
Each has bitten this project before. The harness must design around them, not merely mention them.

- **`pnpm tauri:dev` exits 0 without replacing a running instance.** A second launch silently
  measures nothing. Pre-flight detection + boot anchors inside a freshly-created file are the two
  independent guards.
- **Dev teardown orphans the node sidecar**; sweep by PATH afterwards. **A `vite` orphan survives a
  PATH-based sweep** — report it separately by process name.
- **`gamelib.log` cannot see shell `eprintln!`**, and **`gamelib-shell.log` cannot see this
  particular line either** (constraint 2 above).
- **`git checkout -- <f>` fires this repo's post-checkout hook and throws.** Never use it. To
  compare against a commit, use `git show <sha>:<path>`.
- **`gsd-sdk query commit` / `git commit` absorb whatever is already staged.** The working tree
  currently carries untracked `.claude/skills/archify/` and `skills-lock.json`. **Commit with
  explicit pathspecs only. Never `git add -A`.** Verify each commit's file list with
  `git show --stat --name-only HEAD` before moving on.
- **`git add` fails atomically on a nonexistent pathspec** — a mistyped path stages *nothing* and
  the commit lands empty while exiting 0. Line-count the committed blob, don't trust the exit code.
- **A `&& npx jest` in the same command as a file write reads stale.** Write, then run jest as a
  separate invocation.
- **`--selectProjects` is case-sensitive and fails open.** Use `--selectProjects Meta` exactly, and
  confirm the suite count moved.
</environment_traps>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the capture harness and its fail-closed gate</name>
  <files>meta/captureShellScrollback.ts, meta/__tests__/captureShellScrollback.test.ts, package.json</files>

  <behavior>
Write these tests FIRST, against the exported pure `analyzeCapture()` — driven over inline string
fixtures, never over a live run and never by grepping the harness's own source. Each must be
RED-proved by mutating the *implementation*, not the assertion.

  - **T1 — anchors absent, target absent ⇒ `INVALID_ANCHORS`, not `CLEAN_ASSERTED`.** This is THE
    property. A capture with no `[shell]` boot/gesture/teardown anchors and no target line must
    NOT be certifiable as a clean watch. This project has recreated a fail-open three times; this
    test is the guard against doing it a fourth.
  - **T2 — wrong-source text is rejected in BOTH directions.** Feed a `gamelib.log`-shaped fixture
    that contains the *substring* `response for unknown/timed-out` inside a log message but carries
    zero `[shell] ` anchors. Verdict must be `INVALID_ANCHORS`. (A dirty grep of the wrong source is
    no more evidence of presence than a clean one is of absence.)
  - **T3 — boot anchors present but gesture anchor absent ⇒ `INVALID_ANCHORS`.** A run where the
    operator never opened the login window exercised no cookie operation and measured nothing.
  - **T4 — full anchor set + zero target lines ⇒ `CLEAN_ASSERTED`**, and the returned record carries
    the window duration, the gesture-anchor timestamp, the teardown-anchor timestamp, and the
    derived poll-count with its recipe string.
  - **T5 — full anchor set + a target line ⇒ `RECURRENCE`**, and the record carries the **verbatim**
    matched line, the parsed `id`, and the parsed `channel` — including the `<unrecorded>` literal
    case, which must be surfaced as-is and never coerced to a channel name or to `null`.
  - **T6 — target-line matching is format-pinned to HEAD.** A fixture line in the OLD bare-id form
    (`[shell] response for unknown/timed-out id=1575 (dropped)`, no `channel=`) must NOT match
    `TARGET_DROP_RE`, and must be reported through a distinct `legacyFormatLines` field so a stale
    binary is detected rather than silently miscounted.
  - **T7 — timestamped/raw line-count parity is enforced.** Given a timestamped capture and a raw
    capture of unequal line counts, verdict is `INVALID_ANCHORS` with a parity-mismatch reason: the
    verbatim file and the correlated file must be the same stream.
  - **T8 — cookie-leg detection reads the `gamelib.log` snapshot, and only it.** `COOKIE_LEG_RE`
    matches `rustInvoke timed out after 60000ms: humble_login_cookies` and its two siblings; a
    fixture placing that string in the *stderr* capture instead must not populate the cookie-leg
    field. The two sources are structurally distinct inputs to `analyzeCapture()`.
  - **T9 — nesting is not asserted from adjacency.** Given a `RECURRENCE` plus a cookie-leg line in
    the same window, the record's `nesting` field must be `'UNPROVEN_ADJACENCY'` unless the recurrence's
    channel is a non-exempt Rust→sidecar channel (i.e. absent from `LONG_RUNNING_CHANNELS`). It must
    never be `'CAUSAL'` on co-occurrence alone. Pin `'EXEMPT_CHANNEL_CANNOT_TIMEOUT'` for a
    recurrence naming `humbleStartLogin`/`humbleReconnect`.
  </behavior>

  <action>
Create `meta/captureShellScrollback.ts` as a meta script following this repo's existing meta
conventions (see `meta/lintTranslations.ts` / `meta/checkBuildBinMirror.ts` for shape). It has two
halves: a **pure analyzer** (exported, unit-tested) and a **CLI driver** (operator-run, untested).

Guard the entry point with the shape Phase 41-07 established in this repo:
`require.main === module && !process.env.JEST_WORKER_ID`. Importing this module must never run main
— importing a meta script and having its main rewrite an artifact is a recorded incident here.

**Exports (the analyzer half).**

Export `CAPTURE_ANCHORS` as three named groups, each a list of literal substrings, sourced from the
`eprintln!` inventory in `<verified_starting_context>`. Re-verify each literal against
`src-tauri/src/main.rs` before pinning it; do not retype from this plan. `boot` requires ALL members
present; `gesture` and `teardown` require AT LEAST ONE member each.

Export `TARGET_DROP_RE` matching the HEAD diagnostic with named captures for `id` and `channel`,
requiring the literal `channel=` segment. Export a separate legacy pattern for the pre-`260905-omc`
bare-id form so a stale binary is detected. Export `COOKIE_LEG_RE` matching
`rustInvoke timed out after <n>ms: <channel>` restricted to the three cookie channel names taken
from `src/common/types/sidecarTransport.ts` — import those constants rather than retyping the
strings, so a rename cannot silently break the match.

Export `analyzeCapture({ timestampedStderr, rawStderr, gamelibLogSnapshot })` returning a record with
at minimum: `verdict` (`'INVALID_ANCHORS' | 'CLEAN_ASSERTED' | 'RECURRENCE'`), `reasons[]`,
`anchorsFound` (per group), `targetMatches[]` (verbatim line, id, channel, timestamp),
`legacyFormatLines[]`, `cookieLegMatches[]`, `windowStartedAt`, `gestureAt`, `windowEndedAt`,
`durationMs`, `derivedPollCount`, `derivationRecipe` (a human-readable string stating the formula and
its inputs), and `nesting`.

**Verdict precedence is fail-closed and must be written so it cannot invert:** compute the anchor
verdict first; if any required group is unsatisfied, or the two stderr files' line counts differ,
return `INVALID_ANCHORS` and do not evaluate the target at all. Only a capture that passes the anchor
gate may be certified either way. Write the code so the "no target lines" branch is unreachable
without a satisfied anchor gate — do not express it as a condition that a later edit could reorder.

`derivedPollCount` = `Math.floor((windowEndedAt - gestureAt) / COOKIE_POLL_INTERVAL_MS)`, importing
`COOKIE_POLL_INTERVAL_MS` from `src/backend/humble/user.ts` rather than hard-coding 1500.
`derivationRecipe` must state that formula, its two timestamp inputs, and that the number is a
**DERIVED** upper bound over ticks not short-circuited by `settled || validationInFlight` — never
presented as an observed count. The write-up corroborates it against `gamelib.log`'s collapsed
status lines and their suppressed counts (the F-2 collapse in `watchForLogin` reports how many
identical rejections were suppressed, which is the observed corroboration).

`nesting` implements the rule in `<hypothesis>`: `'CAUSAL'` is not reachable from co-occurrence.
Import `LONG_RUNNING_CHANNELS` membership by parsing it out of `src-tauri/src/main.rs` (the same
technique `src/backend/__tests__/dialogOptionForwarding.test.ts` uses for
`UNBOUNDED_RUST_CHANNELS`) so the exemption list cannot drift out of sync with the Rust source.

**CLI driver half.**

1. **Pre-flight.** Refuse to run if a dev instance is already alive. Probe with `pgrep -f` for
   `tauri dev`, for `build/main/sidecar.js`, and for the dev binary — derive that binary's name from
   `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`, do not guess it. On any hit, print the
   offending PIDs and the exact `kill` command, and exit **3**. This is the guard against
   `tauri:dev` exiting 0 against a running instance and measuring nothing.
2. **Header.** Create the capture files under `scratchpad/` (gitignored — see `.gitignore:65`) named
   `260907-fni-<ISO timestamp>.stderr.raw.log`, `.stderr.ts.log`, and `.gamelib.log`. Write a header
   block to a fourth `.meta.json` recording: HEAD sha, `git status --porcelain` output, the resolved
   `pnpm tauri:dev` command, and the start time.
3. **Spawn.** Run `pnpm tauri:dev` with stdout to its own file and **stderr captured whole**. Write
   each stderr line to BOTH the raw file (verbatim, byte-for-byte, unmodified) and the timestamped
   file (same line, ISO-8601 prefix). Tee stderr to the operator's terminal so they can see what
   they are doing. Keep the two files line-count-identical; T7 enforces it.
4. **Teardown.** On child exit or SIGINT, record the end time, copy the live `gamelib.log` to the
   snapshot path (resolve its real location; do not assume), then run `analyzeCapture` over the three
   files and print a **verdict block** — the operator pastes this back verbatim in Task 2. Exit 0 for
   `CLEAN_ASSERTED` and `RECURRENCE` alike (both are valid findings), exit **2** for
   `INVALID_ANCHORS`, exit **3** for a pre-existing instance.
5. **Orphan report.** After teardown, `pgrep` for the sidecar by PATH and for `vite` by name.
   **Report survivors and print the kill command; do not kill anything automatically.**

Add a `package.json` script `capture:shell-scrollback` invoking it via the established pattern:
`node meta/runTs.cjs --bundle --platform=node --target=node22 meta/captureShellScrollback.ts`. Note
in the file header that `runTs.cjs` spawns a JS shim on Windows and this harness is therefore a
macOS/Linux operator tool — which is true of the live gesture regardless.

Do not modify anything under `src/` or `src-tauri/`.
  </action>

  <verify>
    <automated>npx jest --selectProjects Meta --testPathPattern captureShellScrollback</automated>
    <automated>npx jest --selectProjects Meta 2>&1 | tail -5</automated>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5</automated>
    <automated>test $(git diff --stat -- src src-tauri | wc -l) -eq 0</automated>
  </verify>

  <done>
`meta/captureShellScrollback.ts` and its test exist; all nine tests pass; each was RED-proved by
mutating the implementation (record the specific mutation per test — T1's proof is inverting the
verdict precedence so an anchorless capture certifies clean; it must red). Meta suite count moved by
exactly the new suite and nothing regressed. `tsc` clean. Prettier and eslint clean on both new
files. `git diff --stat -- src src-tauri` is empty. Committed with explicit pathspecs only —
verify with `git show --stat --name-only HEAD` that `.claude/skills/archify/` and `skills-lock.json`
were NOT swept in.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Operator performs the live capture run</name>

  <files>scratchpad/260907-fni-*.stderr.raw.log, scratchpad/260907-fni-*.stderr.ts.log, scratchpad/260907-fni-*.gamelib.log, scratchpad/260907-fni-*.meta.json</files>
  <action>STOP HERE. Present the `<how-to-verify>` steps below to the operator verbatim and wait. Do
not run `pnpm capture:shell-scrollback` yourself and do not synthesize its output: the verdict block
is machine-generated by the harness during a run only the operator can perform (opening the Humble
login window is a GUI gesture), and this project has a recorded incident of auto-mode answering its
own human-verify gate. Nothing after this task may proceed on an outcome you did not receive from
the operator. If the operator reports exit 2 or exit 3, the run measured nothing — ask for a re-run
rather than recording a finding.</action>
  <what-built>
`pnpm capture:shell-scrollback` — a one-command harness that launches the app, captures the shell's
stderr scrollback whole to `scratchpad/`, snapshots `gamelib.log` for the same window, and prints a
verdict block. It refuses to run against an already-running instance, and refuses to certify a
capture that cannot prove its own sink was live.
  </what-built>

  <how-to-verify>
**Before starting:** quit any running GameLib dev instance. The harness will refuse and exit 3 if it
finds one, which is the intended behaviour — do not work around it.

1. In a terminal at the repo root, run:

       pnpm capture:shell-scrollback

   Wait for the app window to appear. You will see the shell's stderr streaming in the terminal;
   this is being captured to a file at the same time.

2. Confirm you see these two lines go past early — they are the proof the capture sink is live:

       [shell] sidecar process spawned OK
       [shell] sidecar signalled READY (...)

3. In the app, navigate to the **login screen** and click the **Humble Bundle** tile's log-in
   action. (Route: `/loginweb/humble`.) A Humble login window opens — on macOS it attaches as a
   sheet. You should see:

       [shell] humble_login_open: login chrome CSS injected '...'

   and/or

       [shell] login-window sheet: present_login_window_as_sheet entered '...'

   **Do not type any credentials and do not attempt to log in.** Humble login is not completable
   unattended (reCAPTCHA), and it is not needed: the cookie poll (`humble_login_cookies`, every
   1.5s) starts the moment the window opens and runs whether or not anyone types anything. Opening
   the window IS the cookie exercise.

4. **Leave the login window open for at least 3 minutes**, untouched. Note the wall-clock start and
   end of this wait. (3 minutes ≈ 120 cookie-read polls, and clears the 60s invoke bound twice
   over — the window in which the target diagnostic could fire.)

5. Close the Humble login window (its own close button — this is a normal cancel, not an error).

6. Quit the app normally (Cmd+Q / red X). Confirm you see:

       [shell] sidecar terminated on exit

7. The harness prints a **VERDICT BLOCK** and exits. **Paste that block back verbatim.** Also paste
   the printed capture file paths and the orphan report.

**What each exit code means — do not reinterpret them:**

- **exit 3** — a dev instance was already running. The run measured nothing. Kill it (the harness
  prints the command) and start over at step 1.
- **exit 2 / `INVALID_ANCHORS`** — the capture cannot prove its own sink was live (most likely the
  login window was never opened, or the app was force-killed so the teardown anchor is missing).
  **This run is not a finding of any kind and must not be written up.** Re-run.
- **exit 0 / `RECURRENCE`** — the diagnostic fired. The block names the id and the channel. This is
  the outcome the todo has been waiting for.
- **exit 0 / `CLEAN_ASSERTED`** — it did not fire during a demonstrably-live window. This is a valid
  finding **about this run only** — it says nothing about id=1575 and does not close the todo.

If anything went differently from the above (a crash, a window that never opened, a step you
skipped), say so plainly instead of approving. An inaccurate report here is worse than no run.
  </how-to-verify>

  <done>The operator has pasted a harness-generated verdict block whose `verdict` field is
`CLEAN_ASSERTED` or `RECURRENCE` (exit 0), together with the capture file paths and the orphan
report. An `INVALID_ANCHORS` (exit 2) or pre-existing-instance (exit 3) result is NOT done — it is a
re-run.</done>
  <resume-signal>
Paste the harness's verdict block verbatim, plus the capture file paths and the orphan report. Or
describe what went wrong.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 3: Record the disposition on the F-9 todo</name>
  <files>.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md, .planning/quick/260907-fni-f9-live-capture-shell-scrollback/SUMMARY.md</files>

  <action>
**Only proceed if Task 2 returned exit 0.** On exit 2 or 3 there is no finding to record — return to
the operator and say so; do not write a section describing a run that measured nothing.

Append a **new dated section** to the todo, matching the format of the three Disposition sections
already present (`## Disposition (2026-08-25, plan 34.6-14) — does NOT close`,
`## Disposition (2026-09-05, quick task 260905-omc) — does NOT close`). Read those three first and
match their register: they state what changed, what did NOT change, and why the todo stays open.
Header: `## Disposition (2026-09-07, quick task \`260907-fni\`) — does NOT close`.

Do NOT edit the frontmatter. `status: pending` stays. No box gets checked. Consider updating
`blocked_by`'s narrative only if the run produced a recurrence, and even then only additively — the
`id=1575` clause in it remains true.

**Branch on the verdict.**

*On `RECURRENCE`* — record: the verbatim matched line; the parsed `id` and `channel` (including
`<unrecorded>` verbatim if that is what fired); the capture file path; whether a cookie-leg
`rustInvoke timed out after …: humble_login_cookies*` appeared in the same window's `gamelib.log`
snapshot and at what offset; and the analyzer's `nesting` field with its meaning spelled out. If
`nesting` is `UNPROVEN_ADJACENCY`, **say that in those words** — a cookie op and an abandoned id in
the same window is correlation, and the mechanism in `<hypothesis>` (the timed-out channel's sidecar
handler awaiting an unresolved cookie `rustInvoke`) is what would be required to call it causal.
Naming what would settle it is the deliverable; asserting causation is not.

*On `CLEAN_ASSERTED`* — record it as an **asserted** null finding, never an assumed one: the run's
wall-clock duration; the gesture-to-teardown window; the cookie channels actually exercised by name
(`humble_login_cookies` and `humble_login_take_events` on the poll path) with the derived poll count
**and its recipe verbatim**, plus the observed corroboration from the `gamelib.log` snapshot
(`watchForLogin`'s collapsed status line and its suppressed count); the capture file path; and the
proof-of-source anchor list — the specific `[shell]` lines present in that same file, demonstrating
the sink was live from boot, through the gesture, to teardown, and would have caught the target line
had it fired.

**In both branches, state explicitly:**
- The `id=1575` question **remains UNDETERMINED and is not rounded to "no"**. Its scrollback was
  never captured; no later code and no later run can reconstruct a diagnostic that was never
  emitted. A clean watch in a different window is not a discharge.
- This run **is not a discharge** of the todo. `status: pending`, no box checked.
- The transferable correction, extended by this task: `gamelib.log` cannot see shell `eprintln!` —
  **and neither can `gamelib-shell.log`**, because `shell_diag()` (main.rs:8521) writes to that file
  but the target diagnostic at main.rs:8332 is a plain `eprintln!` that does not route through it.
  Only the shell process's stderr, captured whole, is a valid source.
- **What a future reader may now rely on:** the next recurrence is capturable by one command,
  `pnpm capture:shell-scrollback`, whose analyzer is fail-closed — it refuses to certify a capture
  that cannot prove its own sink was live, so the "clean grep of the wrong source" failure that
  produced this todo's first, worthless record cannot be repeated through this path.

Then write `SUMMARY.md` in the quick directory following the format of
`.planning/quick/260905-omc-…/SUMMARY.md`, with frontmatter `closes_todo: false` and
`actions_todo:` pointing at the F-9 todo. Include a "Two things I got wrong" section if applicable —
that section in the `260905-omc` summary is why its RED-proof discipline held.

Commit docs with explicit pathspecs only.
  </action>

  <verify>
    <automated>grep -c '^## Disposition (2026-09-07' .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md</automated>
    <automated>grep -c '^status: pending$' .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md</automated>
    <automated>grep -v '^#' .planning/quick/260907-fni-f9-live-capture-shell-scrollback/SUMMARY.md | grep -c 'closes_todo: false'</automated>
    <automated>test $(git diff --stat HEAD~3 -- src src-tauri 2>/dev/null | wc -l) -eq 0</automated>
  </verify>

  <done>
The todo carries exactly one new `## Disposition (2026-09-07, quick task 260907-fni)` section;
`status: pending` is unchanged and byte-identical to before (prove with
`git show HEAD~1:<path> | head -13` compared against the current frontmatter — never
`git checkout --`, which fires this repo's post-checkout hook); no checkbox changed; SUMMARY.md
exists with `closes_todo: false`. Docs committed with explicit pathspecs, verified via
`git show --stat --name-only HEAD`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
| --- | --- |
| live app stderr → capture file on disk | Untrusted third-party content (`[sidecar:err]` forwards arbitrary Node stderr) crosses into a file that could be staged |
| capture file → the committed todo/SUMMARY | Captured text crosses into a public repo |
| the operator's observation → the written record | An unobserved outcome could be asserted as observed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
| --- | --- | --- | --- | --- |
| T-FNI-01 | Information disclosure | capture files under `scratchpad/` | mitigate | Captures are written **only** under `scratchpad/`, which `.gitignore:65` covers precisely because raw `gamelib-*.log` captures carry nile plaintext PKCE material. Task 3 quotes **only** matched diagnostic lines — which are structurally payload-free per T-28-04 (a channel name is a fixed identifier from a known set, never a `result`/`error` body) — never bulk capture text. |
| T-FNI-02 | Repudiation | the human-verify gate | mitigate | Task 2 is `gate="blocking"` and requires the operator to paste the harness's machine-generated verdict block **verbatim**; the executor may not synthesize it. `auto_advance` is `false` in `.planning/config.json`. Recorded prior incident: auto-mode answering its own human-verify gate. |
| T-FNI-03 | Tampering (of the evidentiary record) | `analyzeCapture` verdict precedence | mitigate | Fail-closed by construction: the anchor gate is evaluated first and dominates, so an absent target line can never yield a certified verdict on its own. Test T1 exists specifically for this and is RED-proved by inverting the precedence. |
| T-FNI-04 | Spoofing (of the source) | which file is grepped | mitigate | `analyzeCapture` takes the stderr capture and the `gamelib.log` snapshot as **structurally distinct inputs**; T2 and T8 pin that shell-leg findings can only come from stderr and cookie-leg findings only from the log snapshot. Both `gamelib.log` and `gamelib-shell.log` are named as invalid sources for the target line. |
| T-FNI-05 | Denial of service (measuring nothing) | `pnpm tauri:dev` against a live instance | mitigate | Pre-flight `pgrep` refusal (exit 3) plus boot anchors required inside a freshly-created capture file — two independent guards against the recorded "exits 0 without replacing a running instance" trap. |
| T-FNI-SC | Tampering | package-manager installs | n/a | **No packages are installed by this task.** No `npm`/`pnpm add`, no `pip`, no `cargo add`. The Package Legitimacy Gate is not engaged; if the executor finds itself wanting a dependency, stop and report instead. |
</threat_model>

<verification>
- `npx jest --selectProjects Meta --testPathPattern captureShellScrollback` — 9/9.
- `npx jest --selectProjects Meta` — suite count up by exactly one, zero regressions. Record the
  before/after numbers; STATE.md's last measurement was 37 suites / 1018 passed / 1 skipped.
- `npx tsc --noEmit` — clean.
- Prettier and eslint clean on both new files (`.husky/pre-push` runs prettier and it is red
  repo-wide, so **dry-run and diff against the baseline rather than assuming** — do not accept
  "pre-existing" without naming the baseline sha).
- `git diff --stat -- src src-tauri` empty across all three commits: this task adds no IPC and no
  instrumentation.
- Every analyzer test RED-proved by mutating the **implementation**, not the assertion. Record the
  specific mutation per test in SUMMARY.md.
- `pnpm lint` is at ~4188 warnings against a 4157 ceiling at HEAD (Phase 39 debt) — pushes are
  already blocked by the hook. Do not attempt to fix that here; note it and stop if it blocks a
  push.
</verification>

<success_criteria>
1. `pnpm capture:shell-scrollback` exists, is committed, and captures the shell's stderr **whole**
   to a gitignored file that is proof-of-source on its face.
2. The analyzer is **fail-closed**: an anchorless capture is `INVALID_ANCHORS`, never
   `CLEAN_ASSERTED`. RED-proved.
3. One live run was performed **by the operator**, who returned the machine-generated verdict block
   verbatim.
4. The outcome is written up as an **asserted** finding — a named channel with its verbatim line, or
   a null result with its duration, exercised channels, derived poll count **with recipe**, observed
   corroboration, capture path, and anchor list.
5. Co-occurrence, if observed, is reported as **adjacency** unless the nesting mechanism in
   `<hypothesis>` is shown. No correlation is written up as cause.
6. **The todo is still `pending`. No box is checked. `id=1575` is still UNDETERMINED.**
7. No IPC channel added or changed; `src/` and `src-tauri/` untouched.
</success_criteria>

<output>
Create `.planning/quick/260907-fni-f9-live-capture-shell-scrollback/SUMMARY.md` when done.
</output>
</content>
</invoke>
