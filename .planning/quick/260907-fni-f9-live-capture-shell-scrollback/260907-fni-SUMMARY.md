---
id: 260907-fni
slug: f9-live-capture-shell-scrollback
title: "F-9 — live-capture the shell scrollback and run the first real gesture"
status: complete
completed: 2026-09-07
actions_todo: .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
closes_todo: false
commits:
  - 726165a22 docs — plan
  - fd0cf895a feat — capture harness + fail-closed analyzer, 9 RED-proved behaviors (T1-T9)
  - bef1fa4ca fix — REPO_ROOT from cwd not __dirname, assertRepoRoot() guard, T10 (4 tests)
  - 25ef2708a docs — record the CLEAN_ASSERTED disposition on the F-9 todo
---

# F-9 — live-capture the shell scrollback and run the first real gesture

## The F-9 question is still UNDETERMINED

`id=1575` never had its own scrollback captured, and this task did not run during that window — it
ran a *different* login gesture, weeks later. **A clean watch of a different window answers nothing
about a specific past id.** The todo stays `pending`, byte-identical outside one appended section, no
box checked. This is not a discharge.

## The harness shipped with a defect its own nine tests could not see — state this plainly, not as a footnote

Task 1 built `meta/captureShellScrollback.ts` and RED-proved all nine required behaviors (T1-T9) by
mutating the implementation, each one confirmed to fail its specific test before being reverted. All
nine passed. **The tool still could not run.**

Every one of those nine tests drives `analyzeCapture()` over inline string fixtures. None of them
exercises the CLI driver's path resolution at all — that half of the file was untested by
construction, because the plan scoped RED-proofs to the analyzer's behaviors, not the harness's
ability to locate the repo. The gap was real: the very first live invocation crashed before
`pnpm tauri:dev` was ever spawned —

```
Error: ENOENT: no such file or directory,
  open '/private/var/folders/.../T/gamelib-runts-YelaWg/src-tauri/src/main.rs'
```

`meta/runTs.cjs` bundles a meta script into `mkdtempSync(os.tmpdir(), 'gamelib-runts-')` and runs it
*from there*. My `REPO_ROOT = join(__dirname, '..')` (line 76) resolved to that temp directory, not
the repo — so `readLongRunningChannels()` threw before anything was measured, and would also have
launched `pnpm tauri:dev` from the temp directory had the read not failed first, since REPO_ROOT was
also the app's spawn `cwd`. **The nine-test gate was fully green while the tool could not run at
all.** That is a structural blind spot in what I shipped, not an edge case — a suite that only ever
calls the pure function under test can certify correctness of logic it never actually invokes end to
end.

Fixed by the orchestrator in `bef1fa4ca`, not by me:
- `REPO_ROOT = process.cwd()` — the convention `meta/checkBuildBinMirror.ts:197` and
  `meta/genI18nGateScope.ts:459` already document for exactly this trap.
- `assertRepoRoot()`, called before either module-scope source read, whose message states plainly
  that **nothing was captured and nothing was measured** by the run — so a no-capture crash can never
  be misread as a clean watch, the same fail-closed principle as the analyzer's own anchor gate.
- T10 (4 tests), RED-proved by disabling the guard — three of four red, the fourth (the accepting
  case for a correct repo root) correctly stays green, pinning that the guard cannot false-fire on a
  normal run.

Meta suite: 38 suites / 1036 passed / 1 skipped. prettier, eslint, `tsc --noEmit -p
tsconfig.eslint.json` clean. `git diff --stat -- src src-tauri` empty throughout.

## Task 2 — the live gesture (operator-discharged)

The `checkpoint:human-verify` gate for Task 2 required an operator to quit any running dev instance,
run `pnpm capture:shell-scrollback`, and perform a real Humble-login gesture. That gate was
discharged outside this executor's own turns: the operator quit their instance, the harness was
launched, and the gesture was performed. Command: `pnpm tauri:dev` (via the harness), `headSha
bef1fa4ca`, `startedAt 2026-09-07T00:28:01.707Z`.

**Verdict: `CLEAN_ASSERTED`, exit 0.** The target diagnostic did not fire during a demonstrably-live
window — asserted, not assumed, because the anchor gate ran first and all required anchors were
present before any target/cookie-leg logic was evaluated:

- Boot: `[shell] sidecar process spawned OK`, `[shell] sidecar signalled READY (...)`
- Gesture: `[shell] humble_login_open: login chrome CSS injected for '...'`,
  `[shell] login-window sheet: present_login_window_as_sheet entered for '...'`
- Teardown: `[shell] sidecar terminated on exit`

Window: `windowStartedAt` 2026-09-07T00:28:10.772Z → `gestureAt` 2026-09-07T00:29:38.309Z →
`windowEndedAt` 2026-09-07T00:33:39.980Z (`durationMs` 329208, ~5.5 min total).

**Derived vs. observed poll counts — both stated, kept distinct.** `derivedPollCount` 161 is a
*derived upper bound*, `floor((windowEndedAt − gestureAt) / 1500)`, over every tick, never
short-circuited by `settled || validationInFlight` — never presented as an observed count.
Independently, the `gamelib.log` snapshot's F-2 collapsed status line shows **1 + 7×7 = 50 observed
validations** over ~222s (~4.4s apart). The two do not conflict: they measure different things (every
1500ms read-tick vs. `checkCookie`'s throttled validation), and 161 as an upper bound over the same
interval is consistent with a throttled-to-~3.2×-fewer observed count.

**All three cookie IPC channels were exercised**, not only the poll the plan minimally required:
`humble_login_clear_cookies` (a real disconnect 3s before the window opened, clearing 21
`humblebundle.com` cookies), `humble_login_cookies_for_domain` (the same event's before/after
census), and `humble_login_cookies` (`watchForLogin()`'s poll, running the whole window, rejecting on
`session_expired`). No credentials were entered — the session was already expired, so this exercised
the cookie machinery with nothing to type, as planned.

`nesting` is `null` — **because there was no co-occurrence to evaluate, not because an adjacency was
checked and cleared.** `cookieLegMatches` was empty: none of the three channels timed out this run,
they all completed normally (rejected, but answered). `nesting` is only ever computed when
`RECURRENCE` and a cookie-leg timeout coincide; neither held.

Independent verification against the raw capture files, not just the analyzer's own verdict:
`response for unknown/timed-out` — 0. `rustInvoke timed out` — 0. `sidecar invoke timed out` — 0.
`keyring:timeout` — 0. `^\[shell\]` lines in raw stderr — 31 (proof the sink was live and would have
caught the target line). Raw/timestamped line parity: 51/51. Orphan report: none found.

Capture files (`scratchpad/260907-fni-2026-09-07T00-28-01-703Z.*.log`) are gitignored and were not
committed.

## The transferable gain

The todo's own `blocked_by` named the obstacle: no one had ever captured the shell's full scrollback,
so no recurrence could ever be answered. That obstacle is now removed. A future recurrence is
capturable by one command — `pnpm capture:shell-scrollback`, run from the repo root, refuses to run
if a dev instance is already alive — whose analyzer is fail-closed by construction: it will not
certify a capture whose boot/gesture/teardown anchors are not all present, so the "clean grep of the
wrong source" failure that produced this todo's original, worthless first record cannot recur through
this path. Exit 0 (`RECURRENCE` or `CLEAN_ASSERTED`) is a usable result; exit 2 (`INVALID_ANCHORS`)
or exit 3 (an instance already running) means nothing was measured and the run must be repeated, not
written up.

**`gamelib-shell.log` is a second wrong source, not a fallback for the first.** The todo already
established that `gamelib.log` cannot see shell `eprintln!` output (stdout is the RPC frame pipe).
This task's reading of `main.rs` extends that: `shell_diag()` (`main.rs:8521`) writes to both stderr
and `gamelib-shell.log`, but the target diagnostic at `main.rs:8332` is a plain `eprintln!` that never
routes through `shell_diag()` — so a dev-time grep of `gamelib-shell.log` would silently miss the same
line `gamelib.log` misses, for a different mechanical reason. Only the shell process's own stderr,
captured whole, is a valid source for this diagnostic.

## Verification

| Gate | Result |
| --- | --- |
| `captureShellScrollback.test.ts` (T1-T9 + T10) | 15/15, all RED-proved by mutating the implementation |
| Meta suite (`--selectProjects Meta`) | 38 suites / 1036 passed / 1 skipped |
| `tsc --noEmit -p tsconfig.eslint.json` (the config that actually type-checks `meta/**/*.ts`) | clean |
| prettier, eslint on both new files | clean |
| `git diff --stat -- src src-tauri` | empty throughout |
| Live capture independent grep verification | 0 target/legacy/cookie-leg/keyring hits; 31/31 `[shell]` anchor lines present; 51/51 raw/timestamped line parity |

## Notes for the next reader

- **`id=1575` remains UNDETERMINED and is NOT rounded to "no".** Consistent with the 2026-08-25 and
  2026-09-05 dispositions already on the todo for their own, different findings.
- **This run is not a discharge.** `status: pending` unchanged, no box checked, `closes_todo: false`.
- **CI still runs no cargo step** (unrelated fact, restated from the prior disposition, still true).
- Regex named-capture groups (`(?<id>...)`) required constructing via `new RegExp(String.raw\`...\`)`
  rather than a literal token, since root `tsconfig.json` targets `es2017` and the literal-token
  syntax check requires ES2018+ — runtime behavior is identical either way.
