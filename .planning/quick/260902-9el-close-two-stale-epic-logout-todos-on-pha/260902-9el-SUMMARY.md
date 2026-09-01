---
quick_id: 260902-9el
title: "Close two stale Epic-logout todos on Phase 35 release-artifact evidence"
date: 2026-09-02
status: complete
commits:
  - docs(quick-260902-9el): close two stale Epic-logout todos on Phase 35 release-artifact evidence
---

# Summary

**This was a RECORDS-ONLY task. Zero code changes.** No file under `src/`, `src-tauri/` or `meta/`
was read-for-modification, edited, created, or deleted. Every fact used was already verified before
this task started; nothing was re-investigated, re-measured, or re-run.

## What was closed

Two pending todos about Epic logout's cookie clear, both stale for the same underlying reason: the
evidence that would close them already existed and nobody had gone back to apply it.

- `.planning/todos/pending/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md` →
  `.planning/todos/completed/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`
- `.planning/todos/pending/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md` →
  `.planning/todos/completed/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`

**Todo 1** stayed pending for exactly one stated reason: its successor defect
(2026-08-24) was unresolved, and closing todo 1 would have misrepresented an unresolved defect as
resolved. **Todo 2 IS that successor**, and it is now fixed and live-verified on a genuine release
artifact — so the reason todo 1 stayed open is gone.

**Todo 2's own diagnosis is refuted.** It filed the defect under
`[[wry-cookie-delete-lies-about-deleting]]`. The real cause: `clearEpicCookies` opened a hidden
webview on Epic's live login page purely to obtain a window handle the macOS path never used;
building a WKWebView on an `https` URL IS a navigation, and Epic/Cloudflare re-minted five cookies
concurrently with, and for ~1–2s after, the clear loop. The census's `matched=0` was accurate about
an instant that had already stopped being true. Fixed by `b5b3464bd`. The second half of REQ-35-07
(reporting success without a confirming read) was a fail-open in the post-clear census, closed by
`bea07cd17`. Todo 2's own "8 reported vs 7 on disk" open question is answered by the same root
cause — a delta measured across a re-minting window, not an in-memory-vs-disk API divergence — and
that hypothesis is explicitly retired in the closure record.

**Todo 1's stale `blocked_by` was corrected, not silently deleted.** It named a future obligation
of Phase 34.6 ("must OBTAIN an authenticated Epic session as part of its live gate") — a phase that
closed and discharged that exact obligation eight days later, on 2026-08-25, per plan `34.6-14`
(recorded in the todo's own Disposition section). The old string is quoted verbatim in the closure
prose as historical record; it no longer survives in the frontmatter block. This is the **sixth
recorded recurrence** of the `blocked_by`-rot shape in this repository.

## Evidence cited (verified before this task started, not re-derived)

- REQ-35-07 marked Complete 2026-09-01 by quick task `260901-vuy`, `REQUIREMENTS.md:429` (status
  table) and `REQUIREMENTS.md:1143` (body checkbox).
- Both REQ-35-07 clauses live-proven on a **genuine release artifact** at 22:52–22:54 on 2026-08-31
  — Phase 35's sixth adjudication pass, the first verified against a release build rather than a
  debug-packaged one (PID 9781 `gamelib-shell` → PID 9787 bundled `gamelib-sidecar`, both
  sha256-identical to the build's outputs).
- Measured result: `epicgames.com before(total=31, matched=8, verdict=SUPPORTED_NONEMPTY) ->
  after(total=23, matched=0)`; `post-clear verification — 0 Epic-owned cookie(s) remain across 5
  domain(s)`.
- Fixes: `b5b3464bd` ("fix(35): stop the Epic logout re-creating the cookies it deletes") and
  `bea07cd17` ("fix(35): close the fail-open post-clear verification sweep").

## What this closure does NOT claim (carve-outs recorded in both closure sections)

1. **Off-macOS (Windows/Linux) Epic logout is NOT covered.** All evidence is macOS-only. Already
   routed to **Phase 38**, ledgered as **`38-W06`** in `38-VERIFICATION.md`'s `human_verification`
   array. `b5b3464bd` deliberately keeps a hidden window off macOS pointed at
   `https://gamelib.invalid/` — the exact leg nobody has exercised — and `bea07cd17` made an
   unreadable jar throw, so a rejecting read off-macOS surfaces as a user-visible sign-out error.
2. **`D-35-19-15` survives OPEN, with no owning phase.** Its sibling-apex seeding remains
   unexercised and is unreproducible by construction now that `b5b3464bd` removed the hidden window
   that was the only thing seeding those four sibling apexes during a logout. Two independent
   adjudication passes ruled it `D-35-19-15`'s own sub-criterion, not a REQ-35-07 clause — which is
   why REQ-35-07 could close without it. It is not described as closed anywhere in this task's
   output, and it does not re-block either closed todo.

## Concurrent-session handling

A concurrent session was live in this repo the entire time: `.planning/ROADMAP.md` (~96 uncommitted
lines adding Phase 40) and `.planning/STATE.md` (in-flight Phase 40 + quick-task rows). Per the
plan's constraints:

- `.planning/ROADMAP.md` was not read-for-edit and not committed.
- `.planning/STATE.md` received one appended row (this task's Quick Tasks Completed entry) but was
  **deliberately left uncommitted** — committing it would have absorbed the concurrent session's
  in-flight Phase 40 line into this task's commit, splitting that record across two authors. This
  is the correct, deliberate end state, not an oversight.
- The pre-commit safety check (`git diff --cached --name-only` before staging) confirmed no files
  from the concurrent session were staged before this task's commit was made.
- The post-commit scope proof (`git show --stat --no-renames HEAD`) confirmed neither
  `ROADMAP.md` nor `STATE.md` appear in the commit, and `git status --porcelain` confirmed both
  remain dirty afterward — proof the concurrent session's work survived untouched.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes, no architectural decisions, no auth gates.

## Files changed

- `.planning/todos/completed/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md` (moved
  from `pending/`, frontmatter corrected, closure section appended)
- `.planning/todos/completed/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`
  (moved from `pending/`, frontmatter updated, closure section appended)
- `.planning/quick/260902-9el-close-two-stale-epic-logout-todos-on-pha/260902-9el-SUMMARY.md` (this
  file)
- `.planning/STATE.md` (one row appended, **left uncommitted** by design)

## Self-Check: PASSED

- `.planning/todos/completed/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md` — FOUND
- `.planning/todos/completed/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md` — FOUND
- `.planning/todos/pending/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md` — CONFIRMED ABSENT
- `.planning/todos/pending/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md` — CONFIRMED ABSENT
- Commit `a2bf55687` — FOUND in `git log --oneline`
- `.planning/ROADMAP.md` and `.planning/STATE.md` absent from `git show --stat --no-renames HEAD` — CONFIRMED
- `.planning/ROADMAP.md` and `.planning/STATE.md` still dirty in `git status --porcelain` — CONFIRMED
