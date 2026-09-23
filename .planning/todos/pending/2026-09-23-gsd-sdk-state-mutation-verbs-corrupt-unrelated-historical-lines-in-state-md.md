---
created: 2026-09-23T11:15:41.000Z
title: "gsd-sdk state.* mutation verbs (advance-plan/record-session/add-decision, confirmed 3 separate occurrences) silently corrupt unrelated historical lines deep in STATE.md"
area: tooling
severity: major
platform: any
ready: human
found_by: "Phase 46 plan 02 executor session, 2026-09-23, running the standard state.advance-plan / state.update-progress / state.record-metric / state.add-decision / state.record-session sequence from the execute-plan workflow"
files:
  - .planning/STATE.md
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
