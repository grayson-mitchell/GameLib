---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
plan: 06
subsystem: testing
tags: [uat, live-gate, validation, epic, wkwebview, macos, documentation]

# Dependency graph
requires:
  - phase: 50-01
    provides: "Epic tracer paint, surface-routing invariant, store×platform embeddability"
  - phase: 50-02
    provides: "Native back/forward/URL reporting, 45s timeout, challenge detection, popup handoff, JS dialogs, blocked-scheme counter"
  - phase: 50-03
    provides: "StoreEmbedTimeoutBanner, WebviewUnavailablePanel 'epic-challenged' reason, EpicLauncherBlockedNotice chrome"
  - phase: 50-04
    provides: "288 translations across 48 locales for the new chrome components"
  - phase: 50-05
    provides: "Chrome wiring into WebView/index.tsx's JSX + one auth-triggered reload on return (D-04)"
provides:
  - "50-UAT.md: the Phase 50 live-gate contract — 19 numbered arms, three hard ordering constraints, a quit-tauri-dev environment constraint, and the full dual-sink capture standard"
  - "50-VALIDATION.md: Per-Task Verification Map filled with 16 real rows (one per task across plans 01-05), all 4 Wave 0 boxes ticked with attribution, Manual-Only Verifications pointed at UAT arm numbers, and an honest sign-off with measured wall-clock times"
affects: ["phase-50-ship-gate", "epic-store-embed", "the-live-gate-run-itself"]

actuals:
  tokens: 9622
  tasks: 2
  commits: 2
  plan_head_before: e295cf7010659205e232dd13f088a02349b734ba
  plan_head_after: 22ec650124d4cd5c5791f0a103b07cd10c5cb80c

tech-stack:
  added: []
  patterns:
    - "UAT arms that exercise Epic's D-04 reload use only a disposable local `legendary` credential fixture file, never the real account session or the embedded WebView's cookie jar — satisfies the safety-critical never-sign-out-of-Epic constraint while still exercising the behavior"
    - "A genuinely cold, never-signed-in fake-HOME profile exercises the Sign-in-button arm (L-1) without ever performing a sign-out action, because the profile never had a session to begin with"
    - "Per-task verification rows cite the exact <automated> command copied verbatim from the owning task's own SUMMARY.md, never re-derived, so the map can't silently drift from what was actually run"

key-files:
  created:
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
  modified:
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-VALIDATION.md

key-decisions:
  - "D-04's arm (Item 15) manipulates only a disposable local `legendary` credential fixture file — never the real Epic account or the WebView's cookie jar — because resolveSignInState(...) is sourced from GameLib's own local sign-in probe, not a cookie read, and the safety directive forbids any arm that instructs an Epic sign-out"
  - "Item 2 (Sign in button reachable) runs on the Launch-1 cold profile rather than requiring a sign-out of the real account, since a profile that never had a session cannot violate the sign-out prohibition while still exercising L-1's deliberately-deferred Sign-in question"
  - "Item 14 (blocked-launcher notice) explicitly notes that the as-shipped bounded-width row (Plan 03 Task 1's Option 2A) supersedes UI-SPEC's original floating-toast draft of the D-14 backstop, so the arm tests the real implementation rather than a stale spec description"
  - "Wave 0 Requirement 3 (Epic-specific restore coverage) is attributed to Plan 01 Task 2, not Plan 05, confirmed by grepping storeEmbedReloadLoop.test.tsx directly (the in-file 'Phase 50 Plan 01' comment and the Epic→GOG switch-restore test) rather than trusting an ambiguous plan-text reference"
  - "50-VALIDATION.md's frontmatter nyquist_compliant and wave_0_complete flipped to true, since every Per-Task Verification Map row now has either a real automated command or a named live-gate arm and all 4 Wave 0 boxes are ticked-with-attribution — the Feedback-latency sign-off item is recorded false on its own line since it is a separate, measured criterion that genuinely did not meet the 120s bound"

patterns-established:
  - "Structural Reachability Review (the seven defect-class tests from live-gate-contract-authoring.md) applied concretely to a draft UAT file before its first live run, surfacing three real Test-5 pair-defects (CLEARS, TRUNCATES-OVERWRITES, ONE-SHOT-RESOURCE) resolved through arm ordering/isolation rather than left implicit"

requirements-completed: []

coverage:
  - id: D1
    description: "50-UAT.md authored: 19 numbered live-gate arms across 4 launches, 3 hard ordering constraints (cold-before-warm with no jar clear, online-before-timeout, Steam-same-session control) plus a quit-tauri-dev environment constraint, the full dual-sink capture standard, and the Structural Reachability Review's seven defect-class tests applied to the draft"
    verification:
      - kind: other
        ref: "node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw — 50-UAT.md: status draft, 19 items parsed, no parse_gap/unparsed_blocks reported (clean parse)"
        status: pass
    human_judgment: false
  - id: D2
    description: "50-VALIDATION.md's Per-Task Verification Map filled with 16 real rows (one per task, plans 01-05), all 4 Wave 0 boxes ticked with plan+task attribution, Manual-Only Verifications table repointed at 50-UAT.md arm numbers, and the Validation Sign-Off filled with measured wall-clock times rather than the seeded estimate"
    verification:
      - kind: other
        ref: "grep -c '50-XX-XX' / grep -cE '^\\| *— *\\|' / grep -c 'MISSING — Wave 0' (summed across 50-0[1-5]-PLAN.md) / grep -c -- '--watch' (summed) / grep -c 'status: draft' — all per Task 2's <verify> block, all passed"
        status: pass
      - kind: other
        ref: "pnpm planning-gates"
        status: pass
    human_judgment: false
  - id: D3
    description: "Run the live gate on real macOS hardware and dispose the folded 2026-09-15 Sign-in todo based on the measured outcome"
    verification: []
    human_judgment: true
    rationale: "Precondition unmet: a GameLib.app process (pid 13672, plus sidecar 13683) is running right now, but it was built 2026-10-12 11:13 and launched 11:14 — seven hours before this phase's first code commit (18:15) and owned by a different session. The running process contains zero phase-50 code. Only the human operator can establish the precondition (a fresh build of HEAD, with the stale orphan process gone) before any arm can be scored. Fabricating or assuming a live result was explicitly prohibited; every arm in 50-UAT.md is left `result: pending`."

duration: unmeasured precisely — session spans a context-compaction boundary with no reliable start timestamp; Task-1-commit to Task-2-commit span measured at 12m30s (01:06:53 to 01:19:23 NZDT)
completed: 2026-10-14
status: complete
---

# Phase 50 Plan 06: Live-Gate UAT Contract + Validation Sign-Off Summary

**Authored the 19-arm Phase 50 live-gate contract and filled the validation map honestly. Task 3's blocking-human precondition was later cleared and the gate RAN — see `## Live gate outcome (2026-10-14)` below, which supersedes the "blocked" framing this summary originally carried.**

## Live gate outcome (2026-10-14)

**This section was added 2026-10-14. Everything below it was written on 2026-10-13, while Task 3
was still blocked, and describes a state that no longer holds.** The frontmatter `status:` has been
corrected from `blocked` to `complete` for the same reason. Nothing in the original text has been
deleted — it is the record of why the checkpoint was returned, and it was correct when written.

**The precondition was cleared and the gate ran**, across four launches on real macOS hardware,
2026-10-13T08:52Z to 2026-10-14T06:00Z. Commit range `3797fb6b0..b0f847214` (12 commits), plus
`bd4a2c555` adding the G-50-16 root cause.

| Outcome | Count | Items |
|---|---|---|
| pass | 13 | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 19 |
| issue | 1 | 16 (G-50-16 — timeout banner never visible) |
| blocked | 4 | 3, 13, 14, 15 |
| skipped | 1 | 18 (conditional arm; its condition never occurred) |

**The goal arm passed on both jars.** Item 1 rendered the Epic store on a genuinely cold packaged
jar (0 `epicgames.com` entries, two-day-stale mtime, provenance tied by binary hash); Item 5
restored a session written by a *previous process* across a full application quit. Item 2
completed a real Epic sign-in inside the raw `WKWebView`, **unchallenged** — `grep -c 'flagged as
challenged'` returned 0 across all five launch transcripts, which is the risk this entire phase
was built against.

**Task 3's second deliverable is now done too.** The folded 2026-09-15 Sign-in todo was disposed
2026-10-14 and moved to `.planning/todos/completed/` with `status: CLOSED`, closed with no code by
its own falsifiable rule — Item 2's pass was that rule's first branch verbatim.

**One gap remains open and this plan does not close it.** G-50-16 (the `StoreEmbedTimeoutBanner`
never becoming visible) was fixed in code by quick task `261014-rso` on 2026-10-14, but no Mac has
seen the banner paint. UAT Item 16 owes a re-run, filed as
`.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md`. The gap
stays `status: failed` in `50-UAT.md` deliberately until that run happens.

The original Task-3 rationale follows below, unaltered.

## Performance

- **Duration:** Task 1 → Task 2 commit span: 12m30s (precise session-start time unavailable across a compaction boundary)
- **Completed (Tasks 1-2):** 2026-10-13T01:19:23+13:00
- **Tasks:** 2/3 completed; Task 3 blocked at a `blocking-human` checkpoint
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `50-UAT.md` authored from scratch: 19 numbered arms across 4 launches, covering every ROADMAP-named minimum arm (cold jar, warm signed-in jar, Sign-in button, occlusion recovery, timeout→reload, back/forward/URL parity vs GOG, Steam positive control) plus one arm per shipped decision no automated test can see (D-06 transparency `[ASSUMED]`, zoom-aware bounds at 120%/80%, popup handoff, popup rate-limiting, native JS dialog, blocked-launcher-scheme notice, challenge fallback, last-URL restore across restart, D-04's auth-triggered reload).
- `50-VALIDATION.md`'s six seeded placeholder rows replaced with 16 real per-task rows spanning plans 01-05, each citing a real Task ID, threat refs, and the exact `<automated>` command copied verbatim from that task's own SUMMARY.md; all 4 Wave 0 Requirements boxes ticked with plan+task attribution; Manual-Only Verifications repointed at `50-UAT.md` arm numbers; sign-off filled with measured wall-clock times (`cargo test`: 7.168s; `pnpm test:ci`: 194.43s — exceeding the 120s bound, recorded honestly rather than ticked).
- `pnpm planning-gates` confirmed 12/12 clean after both tasks.
- Task 3 (the live hardware run) correctly identified as blocked by a measured, unmet precondition and returned as a checkpoint rather than fabricated, self-approved, or skipped silently.

## Task Commits

1. **Task 1: Author `50-UAT.md` with the live-gate UAT contract** - `d71bff501` (docs)
2. **Task 2: Fill `50-VALIDATION.md`'s verification map and sign it off honestly** - `22ec65012` (docs)
3. **Task 3: Run the live gate and dispose the folded Sign-in todo** - NOT STARTED, blocked at a `blocking-human` checkpoint (see below)

_No plan-metadata commit has been made yet — per the orchestrator's explicit instruction, this plan's final commit excludes STATE.md/ROADMAP.md, which remain the orchestrator's responsibility. This SUMMARY.md and this commit are the plan's own closing docs commit for the work actually completed._

## Files Created/Modified
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md` - new file, 241 lines, 19 arms (Task 1)
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-VALIDATION.md` - Per-Task Verification Map, Wave 0 Requirements, Manual-Only Verifications, Validation Sign-Off all rewritten with real data; `status: draft` left unchanged per Task 2's own instruction (Task 2)

## Decisions Made

See `key-decisions` in the frontmatter above for the full list. The two safety-relevant ones: the D-04 reload arm and the Sign-in-button arm were both designed so that no UAT arm instructs or implies an Epic sign-out, per this plan's safety-critical constraint (an 8-hour account lockout was measured on this repo from a cookie-only clear on a cold jar).

## Deviations from Plan

### Auto-fixed Issues

None — both completed tasks executed per the plan's own `<action>` text. No Rule 1-3 auto-fixes were needed; all data gaps (Wave 0 attribution, measured wall-clock times, UAT arm-to-requirement mapping) were resolved by direct investigation (grep against source, running the real test suites) rather than by inventing values.

**Total deviations:** 0
**Impact on plan:** None.

## Known Stubs

None. Every UAT arm in `50-UAT.md` is a real, fully-specified procedure with concrete evidence anchors (exact log literals, exact file/line references); none render empty data or placeholder text. All 19 `result:` values are intentionally `pending` — this is the plan's own required state (the live gate has not run), not a stub.

## Threat Flags

None. This plan creates no new code surface — it is documentation (a test contract and a validation sign-off) over already-shipped, already-threat-modeled code from plans 01-05.

## Issues Encountered

None beyond the precondition block on Task 3, which is not an "issue" in the deviation sense — it is the expected, correctly-identified outcome of this dispatch's `<live_run_precondition_UNMET>` directive.

## User Setup Required

**The live gate (Task 3) requires operator action before it can run at all:**
1. Confirm the current `GameLib.app` process (pid 13672, sidecar pid 13683) is not needed by whatever session owns it, then quit it (or confirm it has already exited).
2. Produce a fresh build of HEAD (this phase's code commits landed 2026-10-12 18:15 onward; the running build predates them by 7 hours and contains zero phase-50 code).
3. Confirm zero pre-existing `gamelib-shell` instances (`pgrep -f 'target/debug/gamelib-shell'` prints nothing) before the first live-gate launch.
4. Once the precondition is established, a continuation agent (or the operator directly) can run Task 3 per `50-06-PLAN.md`'s own `<action>` text and `50-UAT.md`'s Protocol section.

## Next Phase Readiness

Tasks 1 and 2 are fully committed and give the phase a complete, honest documentation trail: every automated deliverable from plans 01-05 is now mapped to a real verification, and every remaining human-judgment gap is named as a specific `50-UAT.md` arm number rather than left vague. Phase 50 cannot be marked validated/shipped until Task 3 actually runs on real hardware and every arm's `result:` is filled in — this SUMMARY does not claim otherwise.

## Self-Check: PASSED

- `50-UAT.md` exists: confirmed (`ls` + `audit-uat --raw` parsed it, 19 items, status draft).
- `50-VALIDATION.md` modified and present: confirmed (Read tool content matches what was written).
- Commit `d71bff501` exists in git log: confirmed (`git log --oneline` on branch `quick-261002-b63`).
- Commit `22ec65012` exists in git log: confirmed (same).
- `pnpm planning-gates` reports 12/12: confirmed, re-run after Task 2's commit.
