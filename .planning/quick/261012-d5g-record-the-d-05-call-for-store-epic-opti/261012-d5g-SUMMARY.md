---
phase: quick-261012-d5g
plan: 01
subsystem: docs
tags: [epic, webview, storeembed, wkwebview, tauri, todo-triage]

# Dependency graph
requires:
  - phase: Phase 40
    provides: "/store/epic route, the store === 'epic' guard, WebviewUnavailablePanel reason=epic"
provides:
  - "D-05 call recorded and closed: Option A (Rust-managed raw WKWebView subview, macOS first, owner Phase 50)"
  - "Sign in todo re-triaged onto Phase 50's live gate with a falsifiable closure rule"
  - "Dated decision pointers in the two /store/epic source comments"
affects: [Phase 50, "2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour"]

actuals:
  tokens: 3892
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/todos/completed/2026-10-12-make-the-d-05-call-epic-store-embed-as-a-rust-managed-raw-wkwebview-subview.md
    - .planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx

key-decisions:
  - "D-05 closed: Option A, Rust-managed raw WKWebView subview for /store/epic, macOS first, owner Phase 50. Option B rejected by the 2026-09-29 Linux precedent; Option C folded into A."
  - "Corrected the D-05 todo's own Option C claim: the pristine login window's is_epic_login check is a login-seam arm, not a no-code browsing path."
  - "Sign in todo re-triaged: ready: live-gate, platform: macos, blocked_by now names Phase 50's live gate (the Sign in arm)."

patterns-established: []

requirements-completed: [QUICK-261012-d5g]

coverage:
  - id: D1
    description: "D-05 todo closed (pending -> completed via git rename) with closure keys and a Decision section recording Option A, the Option B rejection, Option C folded-in, the Option C correction, and the four locked sub-decisions"
    requirement: "QUICK-261012-d5g"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12 passed); node -e js-yaml frontmatter parse check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sign in todo re-triaged onto Phase 50's live gate (ready: live-gate, platform: macos, blocked_by Phase 50) with a Decision section stating no interception/no DOM hiding and the falsifiable hand-off rule; all pre-existing sections kept verbatim"
    requirement: "QUICK-261012-d5g"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12 passed); node -e js-yaml frontmatter parse check; heading-count greps"
        status: pass
    human_judgment: false
  - id: D3
    description: "Comment-only decision notes added to the /store/epic guard in WebView/index.tsx and the reason=epic doc comment in WebviewUnavailablePanel.tsx, with no behaviour, string, locale, test or Rust change"
    requirement: "QUICK-261012-d5g"
    verification:
      - kind: unit
        ref: "npx jest -c src/frontend/jest.config.js src/frontend/screens/WebView (16 suites / 316 tests pass)"
        status: pass
      - kind: other
        ref: "npx prettier --check on both exact paths; diff-filter check (0 non-comment +/- lines)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-12
status: complete
---

# Quick Task 261012-d5g: Record the D-05 call for /store/epic Summary

**The D-05 call (Option A: a Rust-managed raw WKWebView subview for `/store/epic`, macOS first,
owned by Phase 50) is now recorded in the three places that still read as undecided: the D-05
todo is closed with a full Decision section, the Epic in-embed Sign in todo is re-triaged onto
Phase 50's live gate with a falsifiable closure rule, and the two source comments in
`WebView/index.tsx` and `WebviewUnavailablePanel.tsx` carry dated pointer notes to the decision.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-12
- **Tasks:** 3/3 completed
- **Files modified:** 4

## Accomplishments
- Closed `.planning/todos/pending/2026-10-12-make-the-d-05-call-...md` via `git mv` to `completed/`,
  added the closure frontmatter keys (`status`, `resolution`, `resolved`, `resolved_by`), and
  appended a `## Decision (2026-10-12)` section carrying the call, the Option B rejection by the
  2026-09-29 Linux precedent, Option C folded into A, a correction of the todo's own Option C "no
  code" claim, and the four locked sub-decisions.
- Re-triaged `.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-...md`: `ready: human`
  -> `live-gate`, `platform: any` -> `macos`, `blocked_by` now names Phase 50's live gate (the Sign
  in arm). Appended a `## Decision (2026-10-12)` section with the no-interception/no-DOM-hiding
  call, the falsifiable closure rule, and the superseded "Cloudflare posture" premise note. Every
  pre-existing section (including `## Trap for whoever un-gates Epic`) kept verbatim.
- Added dated, comment-only decision notes to the `store === 'epic'` guard block in
  `WebView/index.tsx` (Appendix A wording) and resolved the stale "a design decision ... stand
  between" clause in `WebviewUnavailablePanel`'s `reason="epic"` doc comment (Appendix B wording).
  No behaviour, string, locale, test or Rust change; the guard and `logInfo` string are
  byte-identical.

## Task Commits

Each task was committed atomically:

1. **Task 1: Close the D-05 todo** - `33a9736ce` (docs)
2. **Task 2: Re-triage the Sign in todo** - `52c2232c6` (docs)
3. **Task 3: Comment-only decision notes in index.tsx and WebviewUnavailablePanel.tsx** - `8cac03211` (chore)

**Plan metadata:** commit deferred to the orchestrator (this plan's `<output>` instructs the
executor not to commit SUMMARY.md, STATE.md or ROADMAP.md).

## Files Created/Modified
- `.planning/todos/completed/2026-10-12-make-the-d-05-call-epic-store-embed-as-a-rust-managed-raw-wkwebview-subview.md` - closed D-05 todo with the recorded Decision section
- `.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md` - re-triaged onto Phase 50's live gate
- `src/frontend/screens/WebView/index.tsx` - dated decision pointer note after the D-05 guard comment block
- `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` - resolved the stale `reason="epic"` doc-comment clause

## Decisions Made
- Confirmed via `git diff --cached --name-status` after each `git add` that only the task's own
  path(s) were staged before every commit — the orchestrator's `ROADMAP.md`, `milestone.lock`,
  `phases/50-*/` and an unrelated pre-existing uncommitted edit to
  `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` were present in the
  working tree throughout and were never staged, edited or reverted.
- Followed the plan's Appendix A/B wording verbatim for the two comment edits rather than
  paraphrasing, per the plan's explicit instruction that the appendices carry the exact wording.

## Deviations from Plan

None — plan executed exactly as written, including the planner's own flagged discretion calls
(sign-in todo `platform: any` -> `macos`; the six-line index.tsx note instead of 3-5 lines so the
completed-todo filename stays whole on one line; the panel edit rewrites the stale clause in place
rather than appending a contradicting note after it).

## Issues Encountered

None. One pre-existing, unrelated uncommitted modification was present in the working tree at
`.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` (not listed among the
orchestrator-owned paths in this task's environment facts, and not touched by any task in this
plan) — it already appends a "Decided 2026-10-12 (quick 261012-d5g)" paragraph to that file's own
`## Consequence for /store/epic` section. This plan's instructions were explicit not to edit that
README, so it was left exactly as found; see Open observations below for the related note the
planner asked to be carried forward regardless.

## User Setup Required

None - no external service configuration required.

## Open observations

- The plan's `<output>` instructs recording this note regardless of current file state: spike 024
  README `## Consequence for /store/epic` still opens "The gate stays" and lists "the design
  decision" as open language — stale after this call, and deliberately out of this plan's scope to
  fix. (Separately observed during execution: the working tree already carries an uncommitted,
  unrelated addition to that same README section recording the D-05 call — see Issues Encountered.
  That addition was not made by this plan and was left untouched either way.)

## Next Phase Readiness

Phase 50 (`.planning/ROADMAP.md` `### Phase 50`) now has its three satellite references — the
closed D-05 todo, the re-triaged Sign in todo, and the two source comments — consistently pointing
at it as owner. No blockers for `/gsd-plan-phase 50` or `/gsd-discuss-phase 50`.

---
*Phase: quick-261012-d5g*
*Completed: 2026-10-12*

## Self-Check: PASSED

All four modified files and the three task commit hashes (`33a9736ce`, `52c2232c6`, `8cac03211`)
were confirmed present on disk / in `git log --oneline --all`.
