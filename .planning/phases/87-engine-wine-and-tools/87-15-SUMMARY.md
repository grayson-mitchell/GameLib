---
phase: 87-engine-wine-and-tools
plan: 15
subsystem: testing
tags: [oracle, golden, jest, launch-step, launch-deadline, process-watch, dialogs, fnd-06, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05); the bottle fixtures (87-11); worked engine golden plans (87-13, 87-14)
provides:
  - the launch-step oracle test and 77 goldens under gamelib-engine/tests/fixtures/golden/launch (skip, legacy, use and refused outcomes, the offline gate, the fallback toast, the engine-switch refusals, the launch-settings overlay, the deadline firing and every cancel reason, quit)
  - vectors/process_match.json, 76 vectors pinning gameProcessWatch's match forms, the prefix derivation, the ps parse and the ps / pgrep listing fallback
affects: [87-50, 87-51, the Rust launch step slice]

actuals:
  tokens: 237684
  tasks: 2
  commits: 2

plan_head_before: 44dd0e4227127033ac6b0c4e9b14a0b8d3b929bc
plan_head_after: a7a0f438417a4526aa7e0b02081b269530b14335

tech-stack:
  added: []
  patterns:
    - "one recording clock per case wraps the fake clock: every timer set, fire, clear and unref (the watcher's) is a trace entry with its fake time, interleaved with the host calls, and `advance` moves the clock timer by timer and drains microtasks between them, so the real watcher polls on the same clock as the real deadline registry"
    - "the host surfaces (notification, window raise, in-app dialog frame, acknowledgement id) are recording fakes handed to the REAL showEngineDialog, showEngineNotice and notifyEngineFallback, so the zero-raise rule for a notice is recorded from the TS run"
    - "the backend jest project maps i18next to a key-returning mock; the oracle spies the mock's `t` onto a real instance over the shipped English catalogue, so a recorded dialog body carries its interpolated reason, detail, title and seconds"
    - "the real decideLaunchEngine runs over a scripted CrossOver (bin dir, probe, build, wineserver kill) and a real installed-pin fixture tree, so the pinned selection passes the registry's existence check"
    - "a tree sha256 is taken over file content with the profile roots as placeholders (a seeded marker names a wineserver by absolute path)"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/launch/ (MANIFEST.json, cases.json, expected/ for 77 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/process_match.json
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the launch cases are authored in cases.json (inputs only: a game, a scripted world and ordered steps select, settings, prime, overlay, registry-clear, arm, advance, end, quit); expected/ is only ever written by the harness"
  - "the decision is real and its collaborators are scripted, so the launch goldens also record the preflight, the wineserver stop on a failed probe and the offline gate's marker reads over seeded fixture bottles; the engine switch (prepareBottleForEngine) is scripted because its goldens are 87-11's"
  - "quit is recorded as a snapshot of what is left armed (active deadlines, pending timers, keep-alive reasons), not a cancel: the TS has no quit path for the deadline, it relies on the sidecar exit contract (unref'd timers, exit by drain)"
  - "the match function is not exported, so the match vectors drive the real watchForGameProcess once over a scripted listing and a captured poll timer"

requirements-completed: [SVC-02]

duration: 14 min
completed: 2026-11-23

status: complete

coverage:
  - id: L1
    description: "D-01 launch step outcomes: skip (native, Browser, a bottle-runtime store, a non-macOS host, an unusable key), legacy, use CrossOver (healthy, trial, forced override, forced override on an expired CrossOver), use the built-in engine (missing, expired, broken, not executable, bin/wine missing, unrecognised --demo-status, a first-need download, an override, an inconclusive probe keeping the bottle's pinned marker), each with the result, the registry and overlay state, the ledger, the launch log lines, the trace and the engineStateChanged events"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#use-crossover-healthy"
        status: pass
    human_judgment: false
  - id: L2
    description: "D-01 fallback toast: shown for cx-missing, cx-expired and cx-broken on an Automatic fallback launch on every launch, never for the setup purpose, a forced engine or an inconclusive probe"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#the pinned-fallback case records the fallback toast notification"
        status: pass
    human_judgment: false
  - id: L3
    description: "D-01 refusals and the offline gate: override unavailable (CrossOver missing or broken, a Wine Manager build not installed), a failed bottle create, a failed or aborted pin download, a rejected selection, the offline refusals (crossover-missing, restore-needs-pin) and the arms that proceed, the engine-switch refusals (restore-failed, bottle busy, game running, shared bottle, other), and a dialog with a window raise and a new ack id on EVERY refused attempt"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#refused-twice-two-dialogs"
        status: pass
    human_judgment: false
  - id: L4
    description: "D-01 launch-settings overlay: the overlay set, read, replaced and cleared, the CrossOver, pinned-on-a-bottle and pinned-on-a-plain-prefix settings, a null or unknown key and a key with no overlay returning the stored object itself, the input never mutated, a refusal clearing the selection and overlay"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#overlay-set-get-clear"
        status: pass
    human_judgment: false
  - id: D1
    description: "D-01/D-08 the launch deadline: fired with no process match (one notification, no raise, no modal, nothing stopped, the launch stays held, the in-app notice pushed or not), cancelled by a first match (unix, Z:, Y:, C: forms, case-insensitive), by endEngineLaunch (launcher-exited), by a watcher that gives up (listing failures, max duration) or never starts (monitor-unavailable), superseded by a second arm, not armed for a plain prefix, no overlay or a null key, the G5 fallback to the armed selection, the timer order, and quit with a deadline armed"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#a deadline-fired case records zero raise calls and one notify (WR-02)"
        status: pass
    human_judgment: false
  - id: V1
    description: "D-08 process_match.json: deriveGameProcessPrefixes and deriveGameProcessPrefix, parsePsLine, the match function over every form (unix path at the start, after a space, quote, = or tab; glued is not a match; case-insensitive; trailing separator keeps a sibling apart; Z:, Y: only under home, C: only under the bottle; basename-only unmatchable; first match wins) and the ps to pgrep listing fallback with the ps error rethrown, asserted as verdicts in the test as well as recorded"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts#process_match.json pins the match forms, the prefixes and the ps parse"
        status: pass
    human_judgment: false
  - id: M1
    description: "82 D-05: golden/launch carries MANIFEST {count: 77, floor: 25} asserted through assertManifest with an empty-list negative; the redaction FILE_FLOOR is 4295, the exact file count of both crates' fixture trees"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineFixtureRedaction.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 15: Launch step goldens Summary

**The D-01 launch step (skip, legacy, use and refused outcomes, the offline gate, the fallback toast, the engine-switch refusals, the launch-settings overlay), its deadline with every cancel reason and its recorded timer order, and the dialog and notice rules are pinned by 77 TS-produced goldens, and the process-watch match forms and the ps parse by 76 vectors, before any Rust for the launch step exists.**

## Performance

- **Duration:** 14 min (2026-11-23T03:22Z to 03:36Z)
- **Tasks:** 2 of 2
- **Files:** 1 new oracle test, 1 edited test, 77 golden case folders (5 files each), 1 hand-authored `cases.json`, 1 MANIFEST, 1 vectors file

## Accomplishments

- `launchEngine.oracle.test.ts` runs the real `selectEngineForLaunch`, `armEngineLaunchDeadline`, `endEngineLaunch`, the engine registry, the launch-settings registry, the bottle ledger, the deadline registry, the real `watchForGameProcess` and the real engine-state owner over a fresh `createFakeHomeProfile()` per case. The decision is the real `decideLaunchEngine` over a scripted CrossOver; the bottle's existence, the per-game bottle creation, the pin download (it seeds the installed engine files on success), the engine switch and the status line are scripted; the runner is the spawn tracer with no script, so a stray spawn fails loudly.
- 77 goldens in `golden/launch`:
  - **eligibility and legacy (6):** native, Browser, a Steam runner, a non-macOS host, an unusable key, a stored legacy wine.
  - **use (5) and fallback (12):** CrossOver healthy, trial, forced, forced on an expired CrossOver, the switching status line; the built-in engine for CrossOver missing, expired, broken, not executable, no `bin/wine`, an unrecognised demo status, a first-need download, a failed download, an aborted download, a rejected selection, the setup purpose, the toast on every launch.
  - **inconclusive (2) and overrides (5):** an invalid-bottle probe launching CrossOver, and keeping a bottle's pinned marker; override to the pin (installed, needs download), a Wine Manager build that is not installed, CrossOver forced while missing or broken.
  - **bottles (4) and offline (8):** a bottle created on first need, a failed create, a shared legacy bottle never created, a plain prefix on the pin; offline refused (CrossOver missing and no pin, restore-needs-pin) and the arms that proceed, and a refused launch pressed twice (two dialogs, two raises, two ack ids).
  - **engine switch (6) and launch settings (6):** DXVK failure refused on CrossOver and continued on the pin, bottle busy, game running, shared bottle, any other failure with no dialog; the overlay on CrossOver, on the pin in a bottle, on the pin in a plain prefix, null and unknown keys, after a refusal, set, get and clear.
  - **deadline (23):** fired with no match (and its timer order, 120 polls then the deadline at 180 s), the unix, `Z:`, `Y:` and `C:` forms and case-insensitivity cancelling at first match, a basename-only launch and a sibling directory firing, `endEngineLaunch` with and without an armed deadline, the watcher giving up on 20 listing failures and on its cap, no watcher, an unusable install path, a plain prefix, no overlay, a null key, a second arm superseding the first, the registry entry gone at fire time (G5), no published state (`pushed=false`), quit with a deadline armed and after a match.
- `vectors/process_match.json` (76 vectors): 14 prefix derivations, 14 first-form derivations, 13 `ps` / `pgrep` line parses, 32 match cases, 3 listing fallbacks.
- The redaction `FILE_FLOOR` went 3907 to 4295, the exact count of files in both crates' fixture trees.

## Task Commits

1. **Task 1 (tracer): a launch selected through the TS launch step recorded end to end** - `15f1c7343` (test)
2. **Task 2: refusals, the deadline, the process watch and the process-match vectors** - `a7a0f4384` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (jest in compare mode, MANIFEST present, prettier clean) and passed. Tracer verified end-to-end, expansion followed. The tracer commit carried 6 cases and a case floor of 5; Task 2 raised the test's floor to 25 (the MANIFEST floor is 25).

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over the oracle and `engineWineFixtureRedaction.test.ts`: 95 passed, offline, compare mode, twice in a row; a write run left the committed tree byte-identical.
- Acceptance: the pinned-fallback case records the fallback toast notification ("CrossOver not found — using built-in engine", asserted over the committed golden); `golden/launch/MANIFEST.json` count 77 (>= 25); a deadline-fired case records zero `raiseMainWindow`, zero `raiseMainWindowForInAppDialog`, zero dialog frames and exactly one `notify` (asserted over the committed golden).
- `npx prettier --check` over the oracle test and the redaction test: clean (`--file-info`: not ignored; the fixtures are ignored). `npx eslint` over the oracle test and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: adding a `raiseMainWindow` call to `showEngineNotice` failed exactly the 7 cases where a deadline fired; changing the `Y:` form to `Q:` failed `deadline-cancel-first-match-y-form`, the vectors test and the verdict test. Both source files restored with `git checkout -- <file>`; no production file is changed by this plan.

## Findings the port must decide on (recorded as goldens, not fixed)

1. **The deadline is a notice and nothing else.** A fired deadline sends one system notification (`launch-deadline-unconfirmed`), pushes the in-app notice through the engine-state owner (`pushed=true`, or `false` when the key never published a state), stops the watcher, and leaves the registry, overlay and ledger entry held until `endEngineLaunch`. It never raises the window, opens a modal, kills a wineserver or stops the game.
2. **Timer order of an armed launch:** the deadline timer (180000 ms) is set first, then the watcher's cap (185000 ms, unref'd) and its first poll (1500 ms, unref'd); each poll sets the next after the listing resolves. A fired deadline clears the watcher's poll and cap timers; a first match clears the poll (already fired), the cap and the deadline. No timer carries a keep-alive reason, which is what `deadline-quit-with-deadline-armed` records (`keepAliveReasons: []`, 3 pending timers, 1 active deadline): quit relies on exit by drain, there is no cancel on quit.
3. **Every refused attempt shows a dialog:** `notify`, `raiseMainWindow`, a new ack id tracked, `raiseMainWindowForInAppDialog` and a `showDialog` frame, each time (`refused-twice-two-dialogs`). Only a download that was aborted refuses with no dialog, and an engine-switch failure other than DXVK, busy, running or shared bottle refuses with no dialog.
4. **The offline gate runs before the decision and only for a bottle with Automatic or CrossOver**; its two arms are `crossover-missing` (Automatic, no pin installed) and `restore-needs-pin` (a non-CrossOver marker with DXVK and the pin absent, Automatic with the current pin installed is not refused). Both refuse with the download-failed text (`offline`).
5. **The fallback toast** is shown for `cx-missing`, `cx-expired` and `cx-broken` on an Automatic launch, on every such launch, and never for `cx-inconclusive`, a forced engine or the setup purpose.
6. **The match function is not exported** (`commandMatches`); a port must reproduce it from the vectors. A form matches at the start of a command line or after whitespace, a double quote or `=`; ps's leading quote on a Windows command is dropped by `parsePsLine`; `Y:` exists only for an install under home, `C:` only under the bottle's `drive_c`; a relative path, an empty path and the root derive no form and the real watcher returns `null` (the armed deadline is stood down).
7. **`crossoverSettings` receives the engine key** (`(key: string) => GameSettings`) though `launchEngine` ignores it.
8. **Recorded dialog text is the shipped English catalogue**, interpolated; the Rust port needs the same strings.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **The plan's Task 1 verify requires a passing run with a MANIFEST,** so the tracer commit carried the oracle test with a case floor of 5 and the process-match section was added in Task 2 with the floor raised to 25 (the MANIFEST floor is the max of the two).
- **"cancelled by quit" is a snapshot, not a cancel,** because the TS has no quit path for the deadline (finding 2).
- **TDD flag not set.** Neither task carries `tdd="true"`; the oracle was proved non-vacuous by mutation, as in 87-05 and 87-12 to 87-14.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- Three defects in my own first draft were caught before the commit: a seeded bottle marker holds the fake profile's absolute wineserver path, so the tree sha256 differed per run (now taken through `normalisePaths`, as in 87-11); a vector named a sibling home under `/Users/<name>`, which the redaction scan rightly flagged (now `/Volumes/Home2`); the first goldens recorded i18n keys because the backend jest project maps `i18next` to a key-returning mock (now a real instance over the shipped catalogue).
- `actuals.tokens` is `estimateTokens` (chars/4) over the realized files (950,736 characters: the test 51,587, the cases 32,176, the vectors 21,601 and the generated goldens the rest); the generated goldens are most of it, which is why it is above the plan's 75,000 estimate.
- `pnpm exec` re-ran the root `prepare` (husky install) on some runs; it changed nothing tracked.

## Known Stubs

None.

## Threat Flags

None. T-87-64 is mitigated: the zero-raise expectation is recorded from the TS run and asserted over the committed golden, and the MANIFEST floor of 25 prevents a vacuous slice. T-87-SC: nothing installed.

## Self-Check: PASSED

Created files exist on disk; both task commits are ancestors of HEAD; the acceptance criteria and the plan-level verification were re-run after the last commit (95 passed, compare mode).
