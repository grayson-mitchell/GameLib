---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 10
subsystem: testing
tags: [live-gate, tauri, wkwebview, css-grid, humble, structural-reachability-review]

# Dependency graph
requires:
  - phase: 43-05
    provides: "the flex-to-grid conversion of HumbleKeyRow and the border-on-container mitigation for the fractional-track separator bug"
  - phase: 43-07
    provides: "the KEY-column scenario matrix (five row shapes at one fixed width)"
  - phase: 43-08
    provides: "the store logo moved into the new TYPE grid cell"
  - phase: 43-09
    provides: "the shared grid-template-columns declaration across header and data rows"
provides:
  - "REQ-43-19 live-gate contract (43-LIVE-GATE.md): 7 scored-pending geometry items, an 11-precondition list, a 34-row Structural Reachability Review, a full evidence-capture protocol with the dual-sink standard, and an empty Verdict table"
  - "T-43-01 threat-register mitigation folded into the contract as preconditions P10 (never open HumbleClaimWizard) and P11 (redact key-shaped tokens before quoting logs)"
affects: [43-10-task2-operator-run, 43-10-task3-verdict-transcription, humble-keys-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-gate contracts pass every item, precondition, and evidence-capture instruction through the seven-test Structural Reachability Review before publication; any IMPOSSIBLE verdict must be rewritten before the run, never discovered during it"
    - "The contract's author is structurally forbidden from running or scoring it — enforced by leaving the Verdict table empty and stating the rule in the document's own header"
    - "Screenshot-plus-known-scale-reference measurement replaces devtools reads when the required build has devtools compiled out (debug_assertions gated)"

key-files:
  created:
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md
  modified: []

key-decisions:
  - "Devtools-based measurement (getBoundingClientRect/getComputedStyle) is IMPOSSIBLE against the required release build because src-tauri/src/main.rs gates open_devtools() behind #[cfg(debug_assertions)] and Cargo.toml declares no devtools feature; rewrote all geometry items to a screenshot-plus-known-scale-reference method before publishing the contract, per the plan's own rule that no IMPOSSIBLE item may survive to the run"
  - "Added P10 and P11 preconditions closing a T-43-01 threat-register gap found during authoring: the contract's own measurement protocol never required opening HumbleClaimWizard, but nothing in the original draft said so explicitly, and pasting a raw gamelib.log/terminal.log excerpt into a report could leak a real Humble redemption code that the shipping adapter.ts redaction (which only covers backend logging) does not catch"
  - "Login-and-claim and override-pending/override-undo row shapes marked CONDITIONAL/NOT ATTEMPTABLE rather than REACHABLE, because reaching them on the operator's real, already-Steam-connected library would require either an unreachable structural precondition or a real, permanent ownership-override mutation that P7 forbids manufacturing solely for the test"

requirements-completed: [REQ-43-19]

# Metrics
duration: unavailable (session resumed after context compaction; Task 1 authoring spanned two sessions; Tasks 2-3 run 2026-09-11)
completed: 2026-09-10
---

# Phase 43 Plan 10: REQ-43-19 Live-Gate Contract Authoring Summary

**Authored and structurally reviewed the REQ-43-19 live-gate contract for Humble Keys column geometry, the row separator, and two folded store-logo todos — Task 1 of 3; Tasks 2 (operator run) and 3 (verdict transcription) are gated behind a checkpoint this agent may not cross.**

## Performance

- **Duration:** unavailable (compacted session)
- **Tasks:** 1 of 3 completed (Task 1 only; Task 2 is `checkpoint:human-verify`, `gate="blocking"`)
- **Files modified:** 1 (created)

## Accomplishments

- Authored `43-LIVE-GATE.md`: 7 numbered geometry items, each with an explicit measurement method and pass threshold (no "looks right" language — verified by grep, `0` matches)
- Ran all seven defect-class reachability tests (origin/scheme, concurrency, log-line-with-sink, absence-observability, requirement-interaction, pre-existing-external-state, UI-level-reachability) against every item, precondition, and evidence-capture instruction; recorded the result as a 34-row Structural Reachability Review table
- Found and rewrote the one IMPOSSIBLE item before publication: devtools-based measurement is unreachable against the required release build (`debug_assertions`-gated), replaced with a screenshot-plus-known-scale-reference method as the primary path
- Wrote the full evidence-capture protocol in-line (not by reference): session directory, append-only `tee -a`, per-launch delimiter, `gamelib.log` archiving keyed to launch ordinal, single-instance `pgrep` assertion before/after, closing inventory
- Closed a T-43-01 gap found during the review pass: added P10 (never open `HumbleClaimWizard`, whose `revealedKey` state can briefly show a real Humble redemption code) and P11 (scan and redact key-shaped tokens before pasting any raw log excerpt into the document or a report), plus matching Structural Reachability Review rows and an updated row count (32 to 34)
- Left the Verdict table entirely empty, and stated in the document's own words that its author may not score it, per the standing rule in `live-gate-contract-authoring.md` decision D-E

## Task Commits

1. **Task 1: Author the REQ-43-19 gate contract and pass it through the Structural Reachability Review** - `7dbd33f1b` (feat)

Tasks 2 and 3 are not yet executed — Task 2 is a `checkpoint:human-verify` (`gate="blocking"`) requiring an operator to build a packaged Tauri bundle and drive the contract's evidence-capture protocol by hand; Task 3 transcribes that operator's report into this document's Verdict table and disposes the two folded todos. Neither may be performed by the agent that authored the contract.

## Files Created/Modified

- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md` - the REQ-43-19 gate contract: scope table (7 items), preconditions (P1-P11), devtools-unreachable finding with its rewrite, Structural Reachability Review (34 rows), evidence-capture protocol, and an empty Verdict table

## Decisions Made

See `key-decisions` in frontmatter. In short: devtools measurement was rewritten to screenshot-plus-scale before publication (the plan forbids shipping an IMPOSSIBLE item to the run); two preconditions (P10, P11) were added to close a redemption-code-leak gap in the threat register that the original draft's measurement method implicitly avoided but never stated as a rule; and two row shapes (`login-and-claim`, override shapes) were marked CONDITIONAL/NOT ATTEMPTABLE rather than forced REACHABLE, because reaching them would require either a structural impossibility on the operator's real library or a real ownership-data mutation the contract's own P7 forbids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added T-43-01 redemption-code-leak preconditions (P10, P11)**
- **Found during:** Task 1 (Structural Reachability Review pass), after the initial draft of the contract was written
- **Issue:** The plan's threat register (T-43-01) requires guarding against a real Humble redemption code being exposed or leaked during this gate's evidence capture. The initial contract draft never opened `HumbleClaimWizard` in its measurement methods, and never told the operator not to — an operator following the letter of the document could still click into the wizard "just to check," transiently revealing a real, usable code. Similarly, the evidence-capture protocol's `terminal.log`/`gamelib.log` excerpts, if pasted into a written report, could carry a leaked code past the backend's own redaction (`adapter.ts:610-620`), which only covers what the sidecar logs, not what a human transcribes afterward.
- **Fix:** Added P10 (never open `HumbleClaimWizard`; if a screenshot accidentally captures it open, discard and retake rather than redacting) and P11 (scan any pasted log excerpt for a key-shaped token and redact before it enters a committed document). Added matching Structural Reachability Review rows for both, and updated the document's own row-count arithmetic from 32 to 34 to keep the "count them and state the count" acceptance criterion honest.
- **Files modified:** `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md`
- **Verification:** Re-ran the plan's acceptance-criteria greps after the edit — `grep -c 'IMPOSSIBLE'` returns 3 (all three are the same devtools finding, each with an adjacent rewrite note; the document's own line 126 states zero surviving IMPOSSIBLE rows), `grep -c 'looks correct\|looks right\|looks aligned\|appears to'` returns 0, `grep -c 'REACHABLE\|CONDITIONAL'` returns 34, matching the stated row count. Confirmed the P7 precondition row (immediately preceding the insertion point) is byte-for-byte intact after the edit.
- **Committed in:** `7dbd33f1b` (Task 1 commit — the whole file was authored and committed as a single unit, since this deviation was caught and fixed before the file was first committed)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The fix closes a real threat-register gap (T-43-01) with no scope creep — it adds two preconditions and their review rows to a document that was already going to have a Preconditions section and a Structural Reachability Review table; it does not touch the seven scope items, the evidence-capture protocol's commands, or the Verdict table.

## Issues Encountered

None beyond the deviation above. The one structural finding recorded in the document itself (devtools unreachable against the required release build) was anticipated by the plan's own interfaces section (the repo lesson about AX being blind to some Tauri surfaces and needing a screenshot fallback) and was resolved by that fallback before publication, not left as an open issue.

## User Setup Required

None - no external service configuration required. Task 2, next, requires a human operator to build and run a packaged Tauri bundle by hand (that is the point of a live gate), but that is an execution step, not an environment-setup step.

## Next Phase Readiness

Task 1 is complete and committed. This plan cannot proceed further without a human operator: Task 2 is `checkpoint:human-verify` with `gate="blocking"` and requires building a genuinely release-mode packaged `.app` (not `tauri:dev`, not `--debug`), driving the Keys screen, and scoring all 24 Verdict-table rows with raw measurements and launch ordinals. The contract's author (this agent) must not perform that run or fill any Verdict cell, per the standing rule cited in the document's own header. Returning CHECKPOINT now.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10 (Task 1 of 3; plan paused at Task 2 checkpoint)*

## Self-Check: PASSED

- FOUND: .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md
- FOUND commit: 7dbd33f1b
- `grep -c 'IMPOSSIBLE'` = 3 (one finding, three mentions, each with an adjacent rewrite note; zero surviving rows per the document's own line 126)
- `grep -c 'looks correct\|looks right\|looks aligned\|appears to'` = 0
- `grep -c 'REACHABLE\|CONDITIONAL'` = 34, matching the document's stated row count
- P7 precondition row confirmed byte-for-byte intact after the P10/P11 insertion


---

# Tasks 2 and 3 — executed 2026-09-11

**VERDICT: FAIL — 14 PASS / 4 FAIL across 18 scored sub-checks**, plus 4 NOT ATTEMPTABLE,
1 NOT OBSERVED, 1 INCONCLUSIVE, 1 NOT PERFORMED. Full table in `43-LIVE-GATE.md` § Verdict.

Build under test: `gamelib-shell` sha256 `92e31568…f3d08`, release, recovered from the DMG and
hash-verified against `target/release/`. Source `d60fcc85c`. Single instance (PID 50567) for the
whole session. Evidence: `/tmp/gamelib-gate-20260911T043842Z/` — 28.5 KB `terminal.log`, 24 files,
zero zero-length.

## The four failures

1. **Item 6 — the GOG logo never resolves through `fill: currentColor`.** `.gogIcon { fill:
   var(--text-default) }` (`_colors.scss:101`) matches the `<svg>` directly and beats the
   `currentColor` that `.humbleKeyRowStoreLogo` only passes down by inheritance. Steam's logo is
   correct in both themes (`[177,177,177]`=`#b1b1b1` dark, `[57,59,64]`=`#393b41` light).
2. **Item 4 — the row separator is invisible in light themes.** Delta **2** against a ≥3
   threshold, versus 108 and 11–19 in the two dark themes measured. Same 1.0 CSS px line; purely
   contrast.
3. **Item 3 ×2 — the metric failed, the property did not.** Title-text left edges spread 216.5,
   but the tracks are immovable (TYPE 220.0 / KEY 1124.0, spread 0.0 on all 18 rows). Titles are
   centre-aligned by inherited `.App { text-align: center }`. Scored FAIL against the contract as
   written rather than re-scored against the friendlier metric.

## Todo disposition

- `2026-09-08-…-store-icon-geometry-unverified-live.md` → **CLOSED**, item 5 PASS (19.0×19.0 vs
  19.2 target; TYPE left edge 220.0 on all 18 rows).
- `2026-09-08-…-store-logo-fill-currentcolor-unverified-live.md` → **STAYS OPEN**, upgraded from
  "unverified" to "verified broken, cause identified". `minor`→`medium`, `live-gate`→`code`.
- Two NEW todos filed: the light-theme separator, and the centre-alignment design question
  (`ready: human` — it is a decision, and the same answer determines whether item 3's metric or
  the code is what needs changing).

## Four defects in the CONTRACT, found by running it

P5/P8 mutually unsatisfiable; step 8's bounds command names the wrong process AND cannot work
anyway (AX reports 0 windows for a wry window); item 2's pair unreachable for everyone; the
prescribed Preview/Digital-Color-Meter method unusable when the app is on another macOS Space.

**Three of the four share one blind spot**: the 34-row Structural Reachability Review verified
that the things being *measured* were reachable, and never that its own *instructions would
execute*. Recommended addition to `references/live-gate-contract-authoring.md`: every command a
contract says to "paste verbatim" must be run once against a live process before publication, and
shape reachability must be checked against the CODE, not only against the operator's data.

## Protocol steps skipped, recorded as skipped

P8 (impossible — see defect 1). P9 (operator changed theme twice mid-session without the run
pausing; no ordinal opened, no log re-archive — but no item was scored across a switch, so no
measurement is contaminated). Closing `pgrep == 0` NOT PERFORMED — the app was left running.
Measurement method deviated from Preview.app to programmatic pixel reads; declared in the
document.
