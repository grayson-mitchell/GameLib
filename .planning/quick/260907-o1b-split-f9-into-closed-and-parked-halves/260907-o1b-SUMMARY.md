---
quick_id: 260907-o1b
phase: quick-260907-o1b
plan: 01
subsystem: docs
tags: [f-9, todo-bookkeeping, docs-only]
requires:
  - phase: none (standalone quick task)
provides:
  - "F-9 todo split into a CLOSED AS UNANSWERABLE section (Q1, id=1575) and a PARKED section (Q2, the class question) with a runnable, per-OS unpark grep"
affects: [f-9-todo]
tech-stack:
  added: []
  patterns:
    - "PARKED prose-status convention matched to the sibling todo (2026-08-17-humble-slots-still-prompt-unattended-at-startup.md): quoted status: line naming the section, an explicit ## PARKED <date> heading, an explicit **Unpark line"
key-files:
  created: []
  modified:
    - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
key-decisions:
  - "Q1 (id=1575's specific co-occurrence) closes as permanently unanswerable, recorded as UNDETERMINED forever — not rounded to 'no', and every sentence in the CLOSED section using closed/closes/closing/closure also carries UNDETERMINED (enforced by the plan's mutation-proved gate script)"
  - "Q2 (the timeout shape as a class) parks rather than closes, because 260905-omc and 260907-j8n made a recurrence passively self-recording to gamelib-shell.log — the file no longer requires a live operator to become answerable"
  - "The August parked: 2026-08-23 / parked_by: operator frontmatter values were left untouched; this task reconciled the status: line to match, it did not re-date the original park"
requirements-completed: [F-9]
metrics:
  duration: "~20min"
  completed: 2026-09-07
---

# Quick Task 260907-o1b: Split the F-9 todo into closed and parked halves Summary

**Split the F-9 todo's one undifferentiated `pending` item into its two actual questions and gave
each the disposition it warrants: `id=1575`'s specific co-occurrence closes as permanently
unanswerable (UNDETERMINED, forever, never rounded to "no"); the timeout-shape-as-a-class question
parks with a runnable, per-OS unpark grep now that `260905-omc` and `260907-j8n` made a recurrence
passively self-recording. `closes_todo: false` — the file stays in `.planning/todos/pending/`.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-07
- **Tasks:** 2/2 completed
- **Files modified:** 1

## Baseline and execution notes

- **Baseline sha actually used:** `5ea0fdace` (the actual `git rev-parse HEAD` at execution start,
  not the plan's `8ccd2cd1d`). A concurrent session (`260907-juv`, five commits on helper-process
  orphan reaping, plus a sixth docs commit `260906-mdc`) landed on this branch between planning and
  execution. Verified before editing: `git diff 8ccd2cd1d HEAD -- <the F-9 todo file>` was empty —
  the file itself was untouched by the concurrent session, so the plan's verified facts (F1-F13)
  still applied unchanged at the new baseline.
- **A second concurrent commit landed mid-execution.** Between reading `HEAD` and committing, another
  commit (`7b560e450`, "docs: drop the 260906-mdc quick-task ledger") appeared on the branch. Checked
  before committing: it touched only `.planning/STATE.md` and the unrelated `260906-mdc` quick-task
  artifacts — it never touched the F-9 todo file. My commit (`10e988a57`) parented cleanly onto it via
  a normal `git add` + `git commit`; no reset, rebase, or stash was used, so the concurrent session's
  commits are undisturbed.
- **Observed `git diff --numstat`:** `109` insertions / `2` deletions.
- **Baseline unpark-grep probe, re-run at execution time (matches F13):**
  `~/Library/Logs/GameLib/gamelib-shell.log` had **537** lines; `grep -c 'invoke abandoned\|unknown/timed-out'`
  against it returned a count of **0** and exited **1** (the documented non-error `grep -c` behaviour
  on a zero count). This baseline is now recorded inside the PARKED section for future readers to
  diff their own count against.
- **`closes_todo: false`.** No box checked. The file remains at
  `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`.

## Accomplishments

- **Frontmatter (Task 1).** Exactly two lines rewritten: `status:` now carries the prose `"PARKED
  2026-09-07 — SPLIT INTO TWO QUESTIONS..."` form naming both halves and their opposite dispositions
  in one breath with UNDETERMINED; `blocked_by:` now scopes its old "co-occurrence cannot be settled
  after the fact" clause to `id=1575` specifically, rather than deleting it, since `260905-omc` and
  `260907-j8n` retired that obstacle only for *future* occurrences. All nine other frontmatter keys —
  including `parked: 2026-08-23` and `parked_by: operator`, the pre-existing August park — are
  byte-identical to baseline.
- **Two appended sections (Task 2).** `## CLOSED AS UNANSWERABLE 2026-09-07 (quick task 260907-o1b)`
  states the split, closes Q1 as permanently unanswerable, and states explicitly — in the same
  sentence as every use of "closed" — that the recorded answer is UNDETERMINED and is not rounded to
  "no". `## PARKED 2026-09-07` gives Q2's copy-pasteable unpark grep with both per-OS paths (macOS
  `~/Library/Logs/GameLib/gamelib-shell.log`, non-macOS `~/.config/gamelib/gamelib-shell.log`), the
  `grep -c` exit-1 caveat, the real log-line-shape sample (`{epoch} pid={pid} {message}`, not
  `[shell] `-prefixed), the Windows `HOME`-vs-`USERPROFILE` non-coverage caveat, the
  `6fb96c76a` persistence-start scoping, both legs and both files (`gamelib-shell.log` for the
  shell→timeout leg, `gamelib.log` for the sidecar `rustInvoke timed out …: humble_login_cookies*`
  leg), the `analyzeCapture()` / `TARGET_DROP_RE` residual restated from `260907-j8n`, the
  nothing-automated-reads-this limitation (naming `audit-uat` and the project's own recorded failure
  `a-parked-status-buries-the-item-it-exempts`), and an explicit no-IPC-change statement.
- **The existing body (5 Disposition sections + the August `## Park` section) is untouched.** Verified
  with a direct diff over the full original extent, `git show HEAD:<file> | sed -n '14,294p'` against
  the current file's same range: identical.
- **The plan's mutation-proved `<gate_script>` was run verbatim** and initially caught 3 sentences in
  my first draft of the CLOSED section that used "closed"/"closes" without carrying UNDETERMINED in
  the same sentence. Per the plan's instruction ("fix the PROSE it is judging, never the gate"), I
  rewrote those three sentences — not the gate — and the gate then passed clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three sentences in the first CLOSED-section draft used "closed"/"closes" without UNDETERMINED in the same sentence**
- **Found during:** Task 2, running the mutation-proved `<gate_script>` verbatim.
- **Issue:** "This section closes Q1 only.", "Q1 is closed because it is **permanently
  unanswerable**: ...", and "Only one of the two questions closed here; a move to
  `.planning/todos/completed/` would misrepresent that the file's business is finished." each said
  "closed"/"closes" in a sentence that did not also say UNDETERMINED — exactly the failure mode the
  gate exists to catch.
- **Fix:** Reworded each of the three sentences in place to carry UNDETERMINED alongside "closed"/
  "closes", without changing their meaning or removing any load-bearing content.
- **Files modified:** `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`
- **Commit:** `10e988a57` (folded into the single task commit; no separate commit was made since the
  file had not yet been committed when the gate caught this)

### Deferred / documentation-only findings

**2. The plan's own `<verify>` block's ad hoc `sed -n '14,295p'` diff command references a line
number (295) one past the original file's actual length (294 lines, confirmed by `wc -l` and
`git show HEAD:<file>` both before and after this task's edit).** Comparing `sed -n '14,295p'`
against the pre-edit file (which has no line 295) versus the post-edit file (whose line 295 is the
newly appended blank separator before `## CLOSED...`) produces a spurious one-line diff that is an
artifact of the plan's off-by-one, not evidence of an altered pre-existing line. I verified the
actual claim — the untouched region diffs clean — directly over the file's real extent
(`sed -n '14,294p'` both sides): identical. This is a plan-authoring quirk, not a defect in the
executed edit or the file itself; no action taken beyond noting it here, per the instruction not to
"fix the gate" — this is the informal `<verify>` snippet, not the mutation-proved `<gate_script>`,
and the substantive claim it was checking for (append-only, existing body untouched) is independently
confirmed true.

None - source or test files. No IPC change, no source-code change, no new file, no move out of
`pending/`.

## Self-Check

- `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` exists:
  FOUND
- `.planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` does
  NOT exist: CONFIRMED
- Commit `10e988a57` exists in `git log`: FOUND
- Frontmatter parses with all 11 original keys present: CONFIRMED
- `git diff --numstat` for the file: `109` insertions / `2` deletions: CONFIRMED
- Pre-existing body (lines 14-294) byte-identical to baseline: CONFIRMED
- Mutation-proved `<gate_script>` passes: CONFIRMED (after the one in-place prose fix above)
- `git status --porcelain -- src src-tauri meta`: empty, no source/test change: CONFIRMED

## Self-Check: PASSED
