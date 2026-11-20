---
quick_id: 260823-ris
slug: close-out-34-9-review-fix-in-03
date: 2026-08-23
status: complete
type: docs
commits:
  - 2f16aebf0
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-FIX.md
code_changes: none
---

# Quick task 260823-ris — `34.9-REVIEW-FIX.md` closed out

## What was wrong

The fix pass claimed `status: partial`, `findings_fixed: 5`, `outstanding: [IN-03]`, and its
Outstanding section said IN-03 "is not fixed; it is formally deferred as ledger item 11".

Every word of that was true when quick task `260822-h37` wrote it (commit `00a486adf`). It stopped
being true **the same day**: quick task `260822-hrf` renamed `meta/cleanDistMac.ts` →
`meta/cleanDist.ts` (`df7af9f4a`) and generalized it to a required `--platform=` mac/win/linux
argument with no silent default (`ab1ee0448`), wiring `clean:dist-win` / `clean:dist-linux` into
`dist:win`/`release:win`/`dist:linux`/`release:linux`. `deferred-items.md:336` carried the IN-03
**FIXED** row and item 11 its closure note from that moment. Only the fix-pass sibling lagged.

The consequence was live, not cosmetic: `reviewStatus()` in
`~/.vscode/extensions/gsd-phase-status/parse.js` reads a fix pass's `status:` **in place of** the
review's own, so `partial` painted **both** `34.9-REVIEW.md` and `34.9-REVIEW-FIX.md` yellow in the
Explorer for a finding that was closed. Phase 34.9 is closed and verified; the last thing it
needed was an amber artifact implying unfinished work.

## What changed

One file, docs-only. No code was touched — the code change this records landed on 2026-08-22.

- Frontmatter: `status: all_fixed` (the repo's dominant value for a fully-closed fix pass — 7 of 12
  siblings use it; `artifactStatus()` normalises `_`→`-` and maps `all-fixed` → `complete`),
  `findings_fixed: 6`, `outstanding: []`. `fixed: 2026-08-22` was **kept**, not bumped — all six
  findings genuinely landed on the 22nd; only this record is dated the 23rd, which a new
  `record_updated: 2026-08-23` field states instead of silently overloading `fixed:`.
- Dispositions table: IN-03 `DEFERRED` → `FIXED`, evidence quoted from `deferred-items.md:336`.
- `## Outstanding` → `## Outstanding — none`, recording what IN-03 was, when it closed, and that
  the precondition's *second* branch (generalize without waiting for a reproducing build) is what
  landed — one of the two branches item 11 itself named, not a substitution for it.
- The `## Verification` block's transcript was **re-run, not hand-edited**.

## What was deliberately preserved

Item 11's **UNCONFIRMED** caveat survives the closure verbatim in substance. Closing the item did
not retire it: this machine is macOS arm64 with no win/linux build to run, so win/linux coverage is
**synthetic-fixture-only** — `meta/__tests__/cleanDist.test.ts`'s three-platform `dist/` fixture
proves each platform's clean removes only its own entries and leaves the other two byte-identical.
That is a fixture-level non-deletion proof, not a live win/linux build observation. A closure that
quietly dropped the caveat would have been a worse defect than the stale status it fixed, since it
would have manufactured an observation this hardware cannot produce.

## Gates — all three re-run in full, each with an observed rejection

A status flip invalidates all three of `260822-h37`'s transcripts, so none was carried over.

### Gate 1 — dispositions match ledger

```
  CR-01 -> FIXED  (matches ledger)
  WR-01 -> FIXED  (matches ledger)
  WR-02 -> FIXED  (matches ledger)
  IN-01 -> FIXED  (matches ledger)
  IN-02 -> FIXED  (matches ledger)
  IN-03 -> FIXED  (matches ledger)
DISPOSITIONS-MATCH-LEDGER 6/6
```

### Gate 2 — honesty gate (live pass + two observed rejections)

```
LIVE                           -> OK all_fixed (outstanding: none)
RED-PROOF row flipped          -> DISHONEST: status all_fixed with non-FIXED rows IN-03
RED-PROOF outstanding refilled -> DISHONEST: status all_fixed while outstanding names IN-03
HONESTY-GATE-OK (1 live pass, 2 observed rejections)
```

Both directions are proven: a non-FIXED row under an `all_fixed` claim is rejected, **and** a
repopulated `outstanding:` under the same claim is rejected. The checker also rejects the inverse
(`UNDERCLAIMS`) — a `partial` status when every row is FIXED and nothing is outstanding, which is
precisely the state this task found and repaired.

### Gate 3 — badge replay against the real extension `parse.js`

```
fix.status                  = all_fixed
REVIEW badge               -> complete
REVIEW-FIX badge           -> complete
RED-PROOF (status partial) -> inprogress
RED-PROOF (no fix pass)    -> blocked
ARTIFACT_KINDS order        = REVIEW-FIX.md at 0, REVIEW.md at 6 (ok)
BADGE-GATE-OK
```

Replayed against the installed extension's real module, not a reimplementation. The `partial`
red-proof is what makes the green meaningful: the gate still reports `inprogress` for the pre-edit
value, so it is measuring the flip rather than agreeing with whatever it is handed. The
`ARTIFACT_KINDS` ordering line was **added to the gate script and re-run** rather than asserted
from a side check — `34.9-REVIEW-FIX.md` also ends in `-REVIEW.md`, so a reversed order would read
the fix pass as a plain review.

### Census + repo gates

```
REVIEW-SWEEP-OK 24/24 mapped, unmapped 0     (34.9-REVIEW-SWEEP-CHECK.cjs, exit 0)
7/7 planning gates passed                    (pnpm planning-gates)
```

## Scope

Nothing else in phase 34.9 was touched. The other 18 open ledger items stand unchanged — six routed
to Phase 34.16 and blocked on a default-branch push, items 8 (`PathSelectionBox`) and 20 (repo-wide
lint debt) still genuinely unowned. This file's own scope statement still holds: it dispositions
`34.9-REVIEW.md`'s six findings only, and does not speak for the four cycle reviews (which carry
their own `disposition:` fields as of `260823-d7j`) or for the phase.

## Note for the next reader

A concurrent session was active in this working tree throughout. The commit used
`git commit --only <path>` with two explicit paths and was verified after the fact to contain
exactly those two files — 19 unrelated modified paths were left untouched.
