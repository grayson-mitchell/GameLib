---
phase: quick-260919-8nr
plan: 01
status: complete
subsystem: planning/todos
tags: [todo-hygiene, duplicate-capture, negative-control, no-code-change]
dependency-graph:
  requires: []
  provides:
    - A todo corpus with zero pending/completed duplicate pairs
    - An independently re-measured proof that the Pitfall 5 leak sentinels are live
  affects:
    - .planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md
tech-stack:
  added: []
  patterns:
    - "Corpus-wide scan for files present in both pending/ and completed/"
    - "--diff-filter=A to distinguish a replayed filing commit from the original"
key-files:
  created: []
  modified:
    - .planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md
  deleted:
    - .planning/todos/pending/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md
metrics:
  duration: "~20 minutes"
  completed: 2026-09-19
---

# Quick Task 260919-8nr: Humble Expiration Digest Leak-Sentinel — Already Fixed, Duplicate Retired

The requested fix was **already shipped four days earlier**. The pending todo was a duplicate
capture of a todo that had already been closed and moved to `completed/`. No source file and no
test file was modified by this task; both end byte-identical to HEAD.

## What was actually wrong

`260915-g9p` shipped the exact fix this todo prescribes on 2026-09-15 (`f9044be35`) — distinctive
`ZZ-LEAK-SENTINEL-REVEALED-ZZ` / `ZZ-LEAK-SENTINEL-KEYINDEX-ZZ` tokens, a frozen ISO
`FROZEN_EXPIRATION`, and a structural exact-equality assertion on the digest body. It closed the
todo into `completed/` in `6652c5519`.

Then the todo came back:

| commit      | author date               | commit date               | effect                           |
| ----------- | ------------------------- | ------------------------- | -------------------------------- |
| `fa2ad5030` | 2026-09-15 06:34:55 -0700 | 2026-09-15 06:34:55 -0700 | filed the todo in `pending/`      |
| `6652c5519` | 2026-09-15 12:17:13 -0700 | 2026-09-15 12:17:13 -0700 | closed it, moved to `completed/`  |
| `ab8709ff1` | 2026-09-15 06:34:55 -0700 | 2026-09-16 14:57:01 +1200 | **re-added the `pending/` path**  |

`ab8709ff1` carries the same author date and the same commit subject as `fa2ad5030` but a commit
date a day later in a different timezone, and `git merge-base --is-ancestor 6652c5519 ab8709ff1`
returns **false**. It is a replay of the original filing commit from a line that had never seen
the close. Because the rebase preserved the author date, the duplicate looked *older* than the
close, so nothing about it read as suspicious.

**The reading trap:** `git log --follow` on the `pending/` path lists both filings with identical
subjects and looks like one commit reported twice. Only `--diff-filter=A` separates them, naming
`ab8709ff1` alone as the commit that added the file now on disk.

## Task 1 — Proving the shipped fix is real, not a self-heal

This mattered more than usual. The todo's own thesis is that **this test self-heals to green**, so
a green run is not evidence, and the prior task's SUMMARY asserting that a negative control was
observed is a document, not a measurement. Re-measured from scratch.

**Arm A — `revealedKeyValue`.** Temporarily made `buildDigestCopy` concatenate the field into the
title. Verbatim red:

```
✕ Pitfall 5: digest copy reads only title/expiration — never revealedKeyValue/keyindex
  Expected substring: not "ZZ-LEAK-SENTINEL-REVEALED-ZZ"
  Received string:        "Safe TitleZZ-LEAK-SENTINEL-REVEALED-ZZ's Humble key now expires on 7/31/2026"
  > 461 |     expect(opts.body).not.toContain(REVEALED_SENTINEL)
Tests:       1 failed, 14 passed, 15 total
```

**Arm B — `keyindex`.** Same injection against the other field. Verbatim red:

```
✕ Pitfall 5: digest copy reads only title/expiration — never revealedKeyValue/keyindex
  Expected substring: not "ZZ-LEAK-SENTINEL-KEYINDEX-ZZ"
  Received string:        "Safe TitleZZ-LEAK-SENTINEL-KEYINDEX-ZZ's Humble key now expires on 7/31/2026"
  > 462 |     expect(opts.body).not.toContain(KEYINDEX_SENTINEL)
Tests:       1 failed, 14 passed, 15 total
```

Each arm failed at the assertion naming **its own** sentinel — 461 for REVEALED, 462 for KEYINDEX —
which is the ordering property that makes a real leak report as a specific, named failure rather
than a vague structural mismatch. Arms were run separately on purpose: jest stops at the first
failed `expect`, so a combined injection would have masked the second sentinel.

Both injections were reverted with the Edit tool, **never `git checkout --`**, which fires this
repo's post-checkout hook. `git diff --exit-code src/backend/humble/expirationAlerts.ts` returned
clean, and the suite returned to **15 passed, 15 total**.

Note the rendered date in the red output is `7/31/2026` on this machine — the west-of-UTC shift of
the frozen `2026-08-01T00:00:00.000Z` instant. That is the sibling concern, not a defect in this
test: the test computes its expected value through the same `toLocaleDateString()` call, so both
sides shift together and it passes in every zone.

## Task 2 — Confirming the duplicate carried nothing unique

`diff` of the two copies showed the only differences are the completed copy's resolution
frontmatter (`status: completed`, `resolved`, `resolved_by`) and its added `Correction` section.
The completed copy is a **strict superset**. Nothing was discarded by deleting the pending one.

The one genuinely unsettled concern — whether Humble expiry dates render a day early west of UTC —
is already carried by its own live pending todo
(`2026-09-15-humble-expiry-dates-may-render-one-day-early-west-of-utc.md`, `severity: medium`,
`ready: live-gate`). It remains open and untouched; settling it needs a live authenticated Humble
sync with the raw upstream value logged before normalization.

## Task 3 — Retired the duplicate, recorded the mechanism

`git rm` on the `pending/` copy, and a `## Duplicate capture` section appended to the `completed/`
copy recording the three-commit table, the `--diff-filter=A` reading trap, the re-measured
negative control, and the corpus-wide check that would have caught it on day one.

That section exists because the filename is the resolver breadcrumb: anyone who greps this todo's
name later lands on the completed copy and now learns why the pending one vanished, instead of
concluding it was lost and filing it a third time.

## Measurements

| measure                                    | before | after |
| ------------------------------------------ | ------ | ----- |
| pending todos                               | 26     | 25    |
| pending/completed duplicate pairs (corpus)  | 1      | **0** |
| `expirationAlerts` suite                    | 15/15  | 15/15 |
| `pnpm planning-gates`                       | 11/11  | 11/11 |
| files changed under `src/`                  | —      | **0** |

## Deviations from plan

The task as requested — replace the sentinel, freeze the date — was **not performed, because it was
already done**. The plan was rewritten on discovery from "fix the test" to "prove the fix, retire
the duplicate". Recorded here rather than silently reframed.

## What this task did NOT establish

- **Whether `ab8709ff1` has other passengers.** Its stat shows one file, so this todo was its only
  effect. Whether the same replayed line re-introduced anything else in a *different* commit was
  not swept — the corpus-wide duplicate scan covers the `todos/` tree only.
- **Date-correctness of the rendered expiry.** Explicitly out of scope, tracked separately.

## Self-Check

- `.planning/todos/pending/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md` — confirmed ABSENT.
- `.planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md` — FOUND, carries the new `Duplicate capture` section.
- `src/backend/humble/expirationAlerts.ts` — `git diff --exit-code` clean, byte-identical to HEAD.
- `src/backend/humble/__tests__/expirationAlerts.test.ts` — untouched, last modified by `f9044be35`.
- Corpus duplicate scan — ZERO pending/completed pairs remain.
- `pnpm planning-gates` — 11/11.

## Self-Check: PASSED
