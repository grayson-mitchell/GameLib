---
phase: 49-cross-store-signed-out-offline-mode
plan: 11
subsystem: live-gate
tags: [live-gate, macos, keychain, sidecar-exit, runner-strings, uat, planning-docs]
requires:
  - phase: 49-08
    provides: the bounded boot probe pass, its log literals, and the warm-exit question (D5)
  - phase: 49-09
    provides: the Library sign-in notice and the never-connected row-tone judgment item
  - phase: 49-10
    provides: the five-tile shared selector and the Reconnect-text coverage item
provides:
  - "49-LIVE-GATE.md: a blocking macOS contract of eleven items over ten launches, with a Structural Reachability Review"
  - "49-UAT.md: eleven items in the conventions shape, all pending, numbered to match the contract"
  - "a pending ready: live-gate todo tracking the run"
affects: [49-12]
actuals:
  tokens: 20300
  tasks: 2
  commits: 2
plan_head_before: dce37671bb6c790a12d14ebc9a627a5b45fca567
plan_head_after: d864cfc512133e099caae88f5009a1e6f6b8b1d4
commits: 2
tech-stack:
  added: []
  patterns:
    - "backup after every healthy launch, because gogdl rotates refresh tokens"
    - "archive the runner logs per launch as well as gamelib.log (both rotate to .old)"
    - "measure sidecar drain by running it directly with stdin closed at READY, not by quitting the app"
key-files:
  created:
    - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
    - .planning/phases/49-cross-store-signed-out-offline-mode/49-UAT.md
    - .planning/todos/pending/2026-10-09-phase-49-macos-sign-in-live-gate.md
  modified: []
key-decisions:
  - "Item 9 is measured by driving build/main/sidecar.js directly against the real profile and closing stdin at READY. Quitting the app makes the shell SIGTERM the sidecar's group (main.rs:1883-1927), so the plan's original wording passes vacuously."
  - "Item 4 also sets loginTime=1 with the valid refresh token kept: a valid unexpired GOG token is answered locally and the hosts block would exercise nothing."
  - "A launch 3 (restore plus a healthy clear launch) is inserted, because launch 2's persisted expired latches would contaminate launch 4's absence assertions."
  - "Item 8 is scored by an elapsed window of 44.9 to 50 s, not by the bound reached line, because Rust's own 45 s timeout can win the millisecond race."
  - "Items 10 and 11 use two different never-connected stores so a dismiss cannot hide item 11's absence."
requirements-completed: [R2, R3, R4, R5, R6]
coverage:
  - id: D1
    description: "49-LIVE-GATE.md carries all eleven items with preconditions, inductions with backup and restore, required literals mapped to emitter file:line and sink, and the dual-sink append-and-archive capture standard"
    requirement: "R2, R3"
    verification:
      - kind: other
        ref: "node content check over 49-LIVE-GATE.md (13 required literals, 11 item headings) printed CONTRACT OK"
        status: pass
      - kind: other
        ref: "git grep -n over src/backend/signInProbe finds the [signInProbe] pass started / bound reached / verdict= emitters"
        status: pass
    human_judgment: false
  - id: D2
    description: "A seven-test Structural Reachability Review with an explicit Test 5 pairing pass: 64 rows, 182 pairs considered, 23 flagged, two IMPOSSIBLE items restated before publication"
    requirement: "R3"
    verification:
      - kind: other
        ref: "node check: the review heading and 'Test 1' through 'Test 7' are present (UAT SHAPE OK, REVIEW PRESENT)"
        status: pass
    human_judgment: false
  - id: D3
    description: "49-UAT.md has eleven items in the conventions shape (### N. at column 0, expected: inline, result: opening with pending), numbered to match the contract"
    requirement: "R4, R5, R6"
    verification:
      - kind: other
        ref: "node shape check over 49-UAT.md (UAT SHAPE OK)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The run is tracked by a pending todo with severity major, platform macos, ready live-gate in that order; planning gates are green"
    verification:
      - kind: other
        ref: "pnpm planning-gates: 12/12 passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The contract works when an operator follows it on the Mac: the inductions take effect, the literals appear in the stated sinks, and the restores leave the real accounts intact"
    requirement: "R2, R3, R5, R6"
    verification: []
    human_judgment: true
    rationale: "Standing rule D-E: this plan authors the contract and never runs it. Only plan 49-12's run on the operator's Mac can show it executes. A green planning gate says nothing about that."
status: complete
completed: 2026-10-10
---

# Phase 49 Plan 11: macOS live-gate contract, UAT and tracking todo Summary

**A reviewed, sink-correct, restorable macOS live-gate contract for the runner failure strings (A1-A6), Keychain deny and ignore, and warm-profile sidecar exit, with eleven pending UAT items and a `ready: live-gate` todo. Authored, not run.**

## Performance

- **Duration:** about 45 min (the start time was not recorded at execution start)
- **Completed:** 2026-10-10
- **Tasks:** 2 of 2
- **Files:** 3 created, 0 modified. No source or test changes.

## Accomplishments

- `49-LIVE-GATE.md`: eleven items mapped onto ten launches (a launch map, because launch order is not item order), a preflight, shell helpers for the dual-sink capture standard (`tee -a`, a `=== GATE LAUNCH N — <UTC> ===` delimiter, per-launch archive of `gamelib.log` **and** the three runner logs, a one-instance `pgrep` assertion, a closing `ls -la` and `wc -l`), a redaction and teardown section, and a blank result table for 49-12. Every required literal is mapped to its emitter file:line and its sink in one table; no sidecar literal is demanded of `terminal.log`.
- The Structural Reachability Review: 64 rows (41 REACHABLE, 21 CONDITIONAL, 2 IMPOSSIBLE-as-worded, both restated), per-test sections for Tests 1-7, and a Test 5 pass over 14 state-mutating requirements against 13 evidence-bearing ones (182 pairs considered, 23 flagged, each with a recorded disposition).
- `49-UAT.md`: eleven items, each heading naming its launch ordinal and each item carrying its evidence files. It carries the three human-judgment items the wave-4 plans routed here: 49-09's never-connected row tone across `midnightMirage`, `gruvbox_dark`, `dracula` (item 10), 49-10's Reconnect text on the real Epic/GOG/Amazon tiles (items 1, 3, 5), and 49-08's warm-profile exit timing (item 9).
- The pending todo `2026-10-09-phase-49-macos-sign-in-live-gate.md` (`severity: major`, `platform: macos`, `ready: live-gate`).

## Task Commits

1. Task 1: `8e18b3e4a` docs(49-11): author the macOS live-gate contract for runner strings, Keychain and warm exit
2. Task 2: `d864cfc51` docs(49-11): add the structural reachability review, UAT items and live-gate todo

## What the review changed (the reason it exists)

The review found two structural impossibilities in the plan's own item wording, both restated before publication:

- **Item 9 (the plan's wording: quit the app at pass start, measure exit, PID gone).** Quitting makes the Rust shell SIGTERM the sidecar's process group and print `[shell] sidecar terminated on exit` whether or not the sidecar would have drained by itself, so the check passes vacuously. The contract instead runs `build/main/sidecar.js` directly on the real profile (the named real-profile arm of the two-profile rule), closes stdin when READY appears, and times the exit with `perl` (macOS `date` has no `%N`). `pnpm smoke:sidecar` is not used: its 30 s timeout is below the 45 s bound and would false-fail on a warm profile.
- **Item 4 (block `auth.gog.com` with valid credentials).** A valid unexpired GOG token is answered from `auth.json` with no network call, so the block would exercise nothing. The induction also sets `loginTime=1`, keeping the valid refresh token.

It also drove six structural changes (launch 3, runner-log archiving, backup after every launch, item 8 as its own launch scored by an elapsed window, two stores for items 10/11, an arm B for items 5/6) and one operational finding: **`pnpm tauri:dev` sets `GAMELIB_DEV_SECRET_VAULT=1`; `pnpm tauri:dev:keyring` does not** (`package.json:32-33`), the reverse of the older Steam keyring gate's "build with `pnpm tauri:dev`". Items 7 and 8 need the keyring build and an unset variable or they are vacuous.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Task 1 verify command's item regex is mangled by this host's shell quoting**
- **Found during:** Task 1 verification
- **Issue:** The plan's `node -e "…"` verify builds `new RegExp('Item '+i+'\\\\b|…')`. Run through this Windows Git Bash and Node spawn path, the backslashes are halved and the pattern becomes `Item 5` + a backspace character, so items 5 and 7-11 reported `NO ITEM` although the headings exist (items 1-4 and 6 matched only through the `^N\. ` alternative on unrelated list lines). Confirmed by dumping the heading characters (ASCII 32, 8212) and testing `/Item 5\b/` directly (true).
- **Fix:** Re-ran the same assertions building the word boundary with `String.fromCharCode(92)`: all 13 literals and all 11 `### Item N` headings present, `CONTRACT OK`. The Task 2 verify was run the same way. The contract itself was not changed.
- **Files modified:** none
- **Commit:** none (verification-only)

**Total deviations:** 1 auto-fixed (Rule 3, verification harness quoting). **Impact:** none on deliverables.

### Plan-wording restatements (recorded in the review, not deviations from intent)

Items 4 and 9 were restated as described above; the plan allowed renumbering only on withdrawal and nothing was withdrawn.

## Issues Encountered

- `pnpm planning-gates` ran green here (12/12) through `pnpm`; bare `python3` is not on this box's Git Bash PATH, but `py -3` and `python` both resolve. The pnpm script itself worked, so no alternate form was needed for the gate.
- The Co-Authored-By trailer on both commits is `Claude Sonnet 5.5`, per the harness attribution instruction, not the `Claude Fable 5.1` line the dispatch notes named. Flagged for the orchestrator.

## Known Stubs

None.

## Threat Flags

None. No source change; no new endpoint, auth path, file access or schema. T-49-30 to T-49-32 are mitigated by the contract's redaction step, review, and per-induction restores; the session `secrets/` directory is mode 0700 under `/tmp` and deleted at teardown (`rm -P` is deliberately not claimed as a secure erase on APFS).

## Next Phase Readiness

Ready for 49-12. The operator-supplied facts the contract could not verify from this Windows box are discovered at its preflight: the `userData` directory name, the credential files' key names, the Epic OAuth hostname legendary contacts, and whether a Keychain "Always Allow" already exists. 49-12 should record the number of structural impossibilities it meets at run time, whatever it is.

## Self-Check: PASSED

- Created files exist: `49-LIVE-GATE.md`, `49-UAT.md`, the pending todo - FOUND.
- Commits `8e18b3e4a`, `d864cfc51` - FOUND in `git log`.
- Task 1 criteria: every item names its launch and evidence files; every required literal has an emitter and a sink; every credential or hosts edit has a restore and a positive observable; no prettier check (all three paths measured `{ "ignored": true, "inferredParser": null }`).
- Task 2 criteria: 64 review rows each with a verdict and evidence; Test 5 states 182 pairs and 23 flagged; the todo's three triage lines are consecutive and in order; `pnpm planning-gates` 12/12.
