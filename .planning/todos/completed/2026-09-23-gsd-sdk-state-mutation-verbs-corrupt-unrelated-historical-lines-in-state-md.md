---
created: 2026-09-23T11:15:41.000Z
title: "gsd-sdk state.* mutation verbs (advance-plan/record-session/add-decision, confirmed 3 separate occurrences) silently corrupt unrelated historical lines deep in STATE.md"
area: tooling
severity: major
platform: any
ready: human
status: RESOLVED
resolved: 2026-09-24
resolved_by: quick-260924-vku
resolution: 'RESTRUCTURED STATE.md (moved every archived line that could collide with an SDK field literal into new STATE-HISTORY.md, left exactly one anchored canonical line per field) and added a 13th planning gate, .planning/state-sdk-field-anchor-gate.py, holding that invariant. Does not patch the SDK; detects after the fact, next planning-gates run.'
found_by: "Phase 46 plan 02 executor session, 2026-09-23, running the standard state.advance-plan / state.update-progress / state.record-metric / state.add-decision / state.record-session sequence from the execute-plan workflow"
files:
  - .planning/STATE.md
  - .planning/STATE-HISTORY.md
  - .planning/state-sdk-field-anchor-gate.py
---

# `gsd-sdk query state.*` verbs corrupt archived historical text elsewhere in STATE.md, not just the intended frontmatter/banner fields

**This is a defect in the `gsd-sdk` / `get-shit-done-cc` tooling** (installed globally at
`~/AppData/Roaming/npm/node_modules/get-shit-done-cc`), not in GameLib's own source. Filed here
per this repo's own todo convention because it repeatedly damages this repo's `.planning/STATE.md`
and the workaround must be applied by every executor session until it is fixed upstream or a local
wrapper is built.

## What happens

Running the standard end-of-plan `state.*` mutation sequence (`state.advance-plan`,
`state.update-progress`, `state.record-metric`, `state.add-decision`, `state.record-session`) can
silently rewrite **archived historical text far below the "Current Position" banner**, not just the
frontmatter fields and the current banner the call is meant to update. The apparent mechanism: some
field-replace helper (`stateReplaceField`/`stateReplaceFieldWithFallback` or similar, in
`sdk/src/query/state-mutation.ts`) matches a bare field-name prefix (`Phase: `, `Plan: `,
`Last activity: `) wherever it first appears in the document body, rather than anchoring to the
frontmatter block or the single legitimate "Current Position" banner. STATE.md carries many
historical `Phase: <N> ... EXECUTING` / `Plan: <N> of <M> ...` / `Last activity: <date>` lines as
plain archived prose (not headings, not frontmatter) from past phases, and those are exactly what
get silently overwritten.

## Confirmed occurrences (at least three, independently discovered)

1. **Phase quick-260816-qcn** (documented in STATE.md's own Decisions section, line ~5514):
   `state.add-decision` "reverted status/stopped_at/last_activity/last_updated to a stale Phase
   34.5 banner, deleted the ~350-line counter-convention comment block, wiped
   total_phases/completed_plans/total_plans/completed_plans/percent to 27/19/353/340/70 vs the
   correct 26/20/344/339/98." Recovered via a pre-call `cp` snapshot, reverted byte-for-byte, then
   hand-applied the one intended line.
2. **Phase 34.6-01** (STATE.md line ~5515): the executor skipped `gsd-sdk state.*`/`roadmap.*`
   entirely for that plan's updates and hand-applied both files instead, citing this same "known
   corruption defect."
3. **Phase 46-02** (this session, STATE.md line ~5518): `state.advance-plan`/`state.record-session`
   (not `add-decision` this time -- confirming the defect is not scoped to one verb) overwrote two
   archived historical lines (`Phase: 34.16 (macos-runner-onedir-x64-ci-leg) — EXECUTING` and
   `Plan: 5 of 6 — 34.16-06 LIVE GATE SCORED...`, both far below the real banner) with the current
   plan's `Phase:`/`Plan:` values, and truncated a ~700-word historical "Last activity" narrative
   (the THREE SESSIONS 260923-p95/o2s/tip entry) down to its own bare date. No pre-call snapshot had
   been taken (the recommended protocol from occurrence 1 was not followed), so recovery instead
   pulled the exact original text back from `git show HEAD:.planning/STATE.md` -- viable only
   because those three lines happened to be unchanged between the last commit and the session's
   start. `roadmap.update-plan-progress` and `requirements.mark-complete`, run in the same session,
   were verified clean -- **the defect appears STATE.md-specific**, not general to every `.planning/`
   mutation verb.

## Why this is `major` not `critical`

No data is unrecoverably lost as long as git history exists and someone notices before committing
-- git diff review before every commit is what caught all three occurrences. But it is a real,
repeatedly-reproduced defect (silently contaminating this project's own execution-history record,
the exact class CLAUDE.md's `severity: major` describes) with no fix, only a manual workaround, and
it has now fired on three separate plans across at least three different verbs.

## Workaround (apply until fixed)

1. **Before the FIRST `state.*`/`roadmap.*` mutation call of a session**, snapshot the file:
   `cp .planning/STATE.md /tmp/state-pre-sdk.md` (or the Windows equivalent, e.g. a scratchpad
   copy).
2. **After every `state.*`/`roadmap.*` mutation call**, run `git diff .planning/STATE.md
   .planning/ROADMAP.md .planning/REQUIREMENTS.md` and actually read it -- do not assume only the
   intended fields changed. Specifically grep for the current phase/plan number appearing more than
   once, and for any `Last activity:`/`Phase:`/`Plan:` line whose content shrank rather than grew.
3. If corruption is found: restore the specific corrupted lines from `git show
   HEAD:.planning/STATE.md` (if unchanged since the last commit) or the pre-call snapshot from step
   1, then hand-apply just the intended change with `Edit`, never re-run the same `state.*` verb
   expecting a different result.

## Suggested follow-up

- Report upstream to `get-shit-done-cc`/`gsd-sdk` with this todo's three occurrences as reproduction
  evidence.
- Consider a local pre-flight hook in this repo that snapshots `.planning/STATE.md` automatically
  before any `gsd-sdk query state.*`/`roadmap.*` invocation, so step 1 of the workaround cannot be
  forgotten under time pressure.

## Resolution

Closed by quick task 260924-vku (2026-09-24), taking the operator-chosen route locked at planning
time: **RESTRUCTURE STATE.md and ADD AN ANCHOR GATE.** Did NOT patch the global SDK and did NOT
build a wrapper.

### What was done

1. **Restructure (`db7613cf5`).** Every archived line in `.planning/STATE.md` that could collide
   with an SDK field literal was moved byte-verbatim into a new `.planning/STATE-HISTORY.md`: the
   entire old `## Current Position` body (old lines 72-4534), the entire old `## Session
   Continuity` body (old lines 6005-7748), the pre-restructure frontmatter `last_activity`
   narrative, and two `### Quick Tasks Completed` table rows whose prose happened to contain bold
   `**Status:**`/`**Plan:**` substrings (quoting another tool's parser bug, and using a bold label
   as an internal sub-bullet marker, respectively). `.planning/STATE.md`'s `## Current Position`
   and `## Session Continuity` sections were rewritten to carry exactly one single-line, anchored
   occurrence of each canonical field (`Phase`, `Plan`, `Status`, `Last activity`, `Progress`;
   `Last session`, `Stopped at`, `Resume file`).
2. **Anchor gate (`60f76c954`).** `.planning/state-sdk-field-anchor-gate.py` (the 13th planning
   gate, `meta/runPlanningGates.py`'s floor raised 12 -> 13) transliterates the SDK's own
   bold-anywhere / plain-line-start (case-insensitive) field-match regex and its
   `## Current Position` / `## Session Continuity` section-span regex from
   `sdk/src/query/state-document.ts:12,22` and `state-mutation.ts:64,481`, and asserts every
   canonical field matches STATE.md's body exactly once, inside its required section, with every
   other SDK-read field literal at zero matches. 11-case self-test (8 REJECT incl. the
   `### `-subheading-ends-the-section-early trap, 3 ACCEPT). Real run: PASS on the restructured
   file, FAIL (8 problems) on `git show 29f9db85b:.planning/STATE.md`.

### The proof

- **Move proof** (scratchpad `state_move_proof.py`, not committed): the exact multiset identity
  `O - R + A == N` against `git show 29f9db85b:.planning/STATE.md`, where `R` is the ground-truth
  removed-line set sliced from the pre-restructure file at the same line numbers the restructure
  script used and `A` is the explicit list of new canonical/pointer lines -- not a blind
  `Counter(old) - Counter(new)` subtraction, which silently undercounts when a moved-away archived
  line happens to be byte-identical to a freshly-typed canonical line (it does here: the new
  `Phase: 46 (...) — EXECUTING` line was deliberately worded to match text that already existed
  verbatim in the old archived banner). Plus contiguous, in-order preservation of both large moved
  ranges inside STATE-HISTORY.md, and a re-census confirming every canonical field matches exactly
  once post-restructure.
- **RED worktree control** (`git -c core.longpaths=true worktree add --detach <scratch>/wt-red
  29f9db85b`, removed after): a single `gsd-sdk query state.advance-plan` call corrupted FIVE
  separate locations in one shot -- the frontmatter `last_activity` collapsed from a ~9 KB
  narrative to a bare date; a stale archived `**Plan:** 12 of 19 (...)` bold banner (old line 112,
  inside the superseded "PHASE 35 EXECUTING" block) was incremented to "13 of 19" as if it were
  live; a short, correct archived line `Plan: 1 of 7` (old line 961) was overwritten wholesale with
  that same ~600-character banner text, because `updateCurrentPositionFields`'s section-scoped
  `^Plan:` replace operates over the OLD file's `## Current Position` span, which -- pre-restructure
  -- covers essentially the entire historical record (old body lines 58-4518); and TWO separate
  `**Status:**`/`Status:` occurrences (old lines 177 and 1119, the second of which happened to be
  coincidentally carrying the CURRENT correct status from some earlier, unnoticed corruption) both
  flipped to "Ready to execute". `state.update-progress` separately overwrote a stale
  `**Progress:**[...]  98%` mention inside quoted prose (old line 3514) -- invisibly, since the
  quoted example already happened to read "98%". `state.record-session` did NOT corrupt anything
  this run, because the FIRST `Last session:`/`Stopped at:` pair in the old file's
  `## Session Continuity` span (old lines 6171/6172) happened, by luck of position, to already be
  the correct live pair -- confirming the defect is positional-luck-dependent, not guaranteed on
  every call.
- **GREEN worktree control** (`<scratch>/wt-green` at `60f76c954`, removed after): the identical
  five-verb sequence produced a diff where **every single hunk** is a legitimate canonical or
  frontmatter change -- `status` (frontmatter, re-derived via `normalizeStateStatus`),
  `last_activity` (frontmatter, collapses to the body's short clause by the restructure's own
  design), `completed_plans` (disk rescan, unrelated to this fix), the canonical `Status:`/`Last
  activity:`/`Progress:` lines inside `## Current Position`, the canonical `Last session:`/
  `Stopped at:`/`Resume file:` lines inside `## Session Continuity`, one appended Performance
  Metrics row, and one appended Decisions bullet. Zero archived text touched. The anchor gate was
  re-run against the post-mutation file and stayed GREEN. `state.advance-plan` correctly took the
  `last_plan` branch (`Plan: 7 of 7` triggers `currentPlan >= totalPlans`), which is why `status`
  went to `verifying` (`normalizeStateStatus` matches the substring `verif` inside "Phase
  complete — ready for verification" before it ever reaches the `complete` branch -- a real SDK
  subtlety, not a gate defect).
- **`state.json` deltas**: `status` differed (`executing` on wt-red, since `Ready to execute`
  matches `normalizeStateStatus`'s explicit `ready to execute` branch; `verifying` on wt-green, for
  the `verif`-substring reason above) -- both are read from the CANONICAL/archived-but-coincidental
  body text each tree actually has, not a gate defect. `stopped_at`, `last_activity` and `progress`
  matched between the two trees after the run (the same `--stopped-at` argument was passed to both,
  and `progress.percent` is independently disk-derived by `buildStateFrontmatter` --
  `computeProgressPercent` from `completed_plans`/`total_plans`/`completed_phases`/`total_phases`,
  NOT read from whatever the body's `Progress:` line says, so the body's 98% write never reaches
  the frontmatter percent in either tree).

### Honest limits (carried forward, not resolved by this fix)

- The gate only detects after the fact, the next time `pnpm planning-gates` runs. It does not
  intercept or block a `gsd-sdk query state.*` write as it happens -- there is no hook for that.
- The SDK defect itself is unfixed upstream (see the new upstream-report todo).
- Any SDK or hand write that inserts a new multi-line value, or re-adds a bold `**Field:**`
  anywhere in the body (e.g. a pasted Decisions entry, a quoted code excerpt describing another
  tool's bug -- exactly what created the two Quick-Tasks-Completed collisions this task had to
  defuse), re-arms first-hit mis-targeting until the gate next catches it.
- Frontmatter `last_activity` now collapses to whatever single body line an executor writes, by
  design (the SDK always overwrites it with the body's `Last Activity` hit on every mutation) --
  the old multi-session narrative convention is retired; full history lives in STATE-HISTORY.md.
- `state.update`/`state.patch` take arbitrary field names as CLI arguments and are NOT covered by
  the pinned `SDK_FIELDS` list -- an executor invoking either with an ad-hoc field name could still
  create an unanchored duplicate that this gate would only catch on its next run, not prevent.

### Is the workaround still advised?

**Yes, as belt-and-braces.** The gate is a next-run detector, not a write-time blocker; the
snapshot-plus-diff-review workaround this todo originally prescribed (`cp .planning/STATE.md`
before the first `state.*` call of a session, `git diff` and read it after every call) remains the
only defence between a bad write landing and the next `pnpm planning-gates` run catching it.

Full derivation, measured facts, and every deviation from the plan's stated assumptions:
`.planning/quick/260924-vku-restructure-state-md-so-gsd-sdk-state-ve/260924-vku-SUMMARY.md`.
