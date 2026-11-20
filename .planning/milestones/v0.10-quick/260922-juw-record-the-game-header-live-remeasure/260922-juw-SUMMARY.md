---
phase: quick-260922-juw
status: complete
date: 2026-09-22
files_modified:
  - .planning/todos/completed/2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles-unverified-live.md
---

# Record the live re-measure of the GAME column header offset

## What changed

Four amendments to one todo. No code.

1. **`status:` frontmatter** — the sentence *"The predicted 4.89px correction has NOT been
   re-measured live."* is replaced by the measurement: header 340.0 CSS px vs six row titles
   340.0-341.0, divergence max 1.0 against the +/-2 threshold, PASS; header moved right 4.5 CSS
   px against d84's predicted 4.89. The status line also names what is still owed.
2. **`## NOT verified live` heading** marked `SUPERSEDED 2026-09-22`, its body left verbatim.
   Supersede-don't-rewrite: the section is the record of what was legitimately unknown on
   2026-09-13 and it is also the specification the run-4 measurement was taken against.
3. **New `## Verified live 2026-09-22` section** with the build identity, a run-3-vs-run-4
   table, the threshold sweep, the scanner's negative control, the visual band-identity check,
   the undischarged bullet, and an evidence-durability note.
4. **`## Severity justification`'s closing sentence** — it claimed *"closure of that Phase 43
   blocker still depends on the live re-measurement described above, which has not happened"*,
   which is now false. Corrected, and it now points at where the real residue is.

## The finding worth keeping: the ask was 3 bullets and only 2 were discharged

The superseded section specifies THREE things for the adjudicating run. Run 4 took the first
two. **The third — "Re-confirm TYPE and KEY remain at their prior near-zero offsets (0.0 and
0.5 respectively)" — was never taken**, and `43-UAT.md` test 9's measured block carries no TYPE
or KEY figures at all.

This was nearly missed. The natural move on finding a PASS on the headline metric is to write
"re-measured, PASSED" and close, which would have quietly discarded a sibling check the todo
itself asked for. The reasoning that makes the omission low-risk is sound and is recorded —
the fix moves only the header's gap, TYPE sits upstream of any gap, KEY's track is anchored
off the container's right edge — but reasoning is not measurement, and this repo's
`a-pass-can-cover-an-unreachable-surface` / `enumerated-pass-conditions-can-bless-defective-evidence`
lessons are both about exactly this substitution. It is recorded as OUTSTANDING inside the PASS
section rather than folded into the verdict.

## Evidence durability, stated rather than assumed

The run-4 captures are in an **ephemeral session scratchpad** under `/private/tmp/claude-501/`,
not in `43-12-evidence/` where run 3's are. They still exist right now, but they are not
committed and will not survive. The todo now says so and points at `43-UAT.md` test 9
(committed `a1f2f2d0d`) as the durable citation, so a future reader is not sent to a path that
has evaporated. Whether to commit the captures is the operator's call — they are screenshots of
a real library — and was deliberately left out of this task.

## Also left alone, deliberately

`ready: live-gate` in the frontmatter is now vestigial: the live work it was waiting for has
happened. It was NOT changed. The frontmatter gate scopes `pending/` only, so the value is
inert here, and rewriting triage keys on a closed todo was not what this task was for.

## Verification

- `pnpm planning-gates` — **12/12 passed**.
- Each of the four replacements ran under an `assert count == 1` and the file was written only
  after all four matched, so a stale anchor could not produce a partial edit. One did go stale
  on the first attempt (the heading reads `Phase 43 closing**:`, not `Phase 43**:`) and the
  assert caught it with nothing written.
- No code touched, so no typecheck/lint/test run is implicated.
