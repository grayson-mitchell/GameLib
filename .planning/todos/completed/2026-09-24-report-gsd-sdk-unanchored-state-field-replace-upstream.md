---
created: 2026-09-24T11:30:00.000Z
title: "Report upstream to get-shit-done-cc: gsd-sdk state.* field-replace helpers match the FIRST bold/plain field literal anywhere in the document body instead of anchoring to frontmatter or the Current Position/Session Continuity sections"
area: tooling
severity: minor
platform: any
ready: human
found_by: "Quick task 260924-vku (2026-09-24), closing .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md by restructuring GameLib's own STATE.md rather than patching the SDK"
files: []
---

# Report upstream: `gsd-sdk query state.*` field-replace helpers are unanchored

**This is a report-upstream todo, not a repo defect** — GameLib's own copy of the defect was
closed by restructuring `.planning/STATE.md` (see the resolved todo cited in `found_by` above) and
adding `.planning/state-sdk-field-anchor-gate.py` as a standing invariant. This todo tracks the one
remaining action item: telling the `get-shit-done-cc`/`gsd-sdk` maintainers, since every other
project using this SDK carries the same latent defect and gets no benefit from GameLib's local
workaround.

## SDK version

`get-shit-done-cc` **1.42.3** (installed at
`~/AppData/Roaming/npm/node_modules/get-shit-done-cc`, `gsd-sdk v1.42.3`).

## Exact file:line regexes

- `sdk/src/query/state-document.ts:12` (`stateExtractField`) and `:22` (`stateReplaceField`):
  ```ts
  const boldPattern = new RegExp(`\\*\\*${escaped}:\\*\\*[ \\t]*(.+)`, 'i');
  const boldMatch = content.match(boldPattern);
  if (boldMatch) return boldMatch[1].trim();
  const plainPattern = new RegExp(`^${escaped}:[ \\t]*(.+)`, 'im');
  ```
  Both patterns are matched against the FULL document body (no section scoping, no anchor to
  frontmatter), and `.match()` without a `g` flag returns only the FIRST match — wherever in the
  document it happens to occur, including inside an archived banner, a quoted code excerpt, or a
  Quick-Tasks-Completed table cell that happens to contain the substring `**Field:**` or a
  line-start `Field:`.

- `sdk/src/query/state-mutation.ts:64` (`updateCurrentPositionFields`) and `:481`
  (`stateAdvancePlan`), both using:
  ```ts
  const posPattern = /(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i;
  ```
  This section regex additionally has a `### counts` trap: the lookahead `(?=\n##|$)` matches ANY
  line starting with two literal hash characters, including a `### ` subheading, so a subheading
  placed inside what a human would call "the Current Position section" silently truncates the
  matched span before reaching it.

## Minimal reproduction

Given a `STATE.md` body containing, in this order:
```
## Current Position

> Some archived historical banner text.
> **Plan:** 12 of 19 (an old, superseded plan count)

...(thousands of lines of archived narrative, some containing plain `Plan: N of M` lines)...

Plan: 7 of 7 — the CURRENT, live plan count
```
running `gsd-sdk query state.advance-plan` reads `stateExtractField(content, 'Plan')`, which
matches the ARCHIVED bold `**Plan:** 12 of 19` first (bold takes priority over plain, and neither
is anchored), increments it to 13, and writes the new value back into the archived banner —
leaving the live `Plan: 7 of 7` line completely untouched. A live reproduction against this exact
shape (GameLib's own pre-restructure `STATE.md`, `git show 29f9db85b9ab91ebabe77d98eb5d6ad767f43af1`)
is preserved in `.planning/quick/260924-vku-restructure-state-md-so-gsd-sdk-state-ve/260924-vku-SUMMARY.md`
under "RED worktree control": a single `state.advance-plan` call corrupted five separate archived
locations in one shot (an archived bold `**Plan:**` banner, a short archived plain `Plan:` line
overwritten wholesale with ~600 characters of unrelated banner text, two separate `Status:`
occurrences, and the frontmatter `last_activity` scalar collapsed from a multi-kilobyte narrative
to a bare date).

## Suggested upstream fix

Anchor every `state.*` field replace to the `## Current Position` / `## Session Continuity`
sections (or, for the fields genuinely global to the document like `Progress`, to frontmatter)
rather than scanning the whole body for the first match. Concretely:

1. Compute the target section's span ONCE (the existing `posPattern`/`positionPattern` regex
   already does this for `Current Position` — extend the same approach to `Session Continuity` for
   `Last session`/`Stopped At`/`Resume File`).
2. Run `stateExtractField`/`stateReplaceField`'s bold-then-plain search WITHIN that span only, not
   against the full document body.
3. Require the bold form to be LINE-START too (`^\\*\\*Field:\\*\\*`), not merely
   `\\*\\*Field:\\*\\*` anywhere mid-line — a bold field literal quoted inside a table cell or a
   sentence (as happened twice in GameLib's own Quick-Tasks-Completed table) should never be
   treated as a live field.
4. Fix the `### counts` trap by changing the section-span lookahead from `(?=\n##|$)` to something
   that only stops at a heading of the SAME OR SHALLOWER level as the opening heading (e.g. `(?=\n#{1,2}[^#]|$)` for a `##`-level section, so a `###` subheading inside it does not
   terminate the span early).

## Workaround in place (GameLib-local, not a substitute for the upstream fix)

- `.planning/STATE.md` restructured so exactly one line per canonical field exists, anchored
  inside its section (quick task 260924-vku).
- `.planning/state-sdk-field-anchor-gate.py` (13th planning gate) re-asserts this invariant on
  every `pnpm planning-gates` run and fails loudly if it is ever violated again — including via
  belt-and-braces drift detection that re-derives the field-literal list from the installed SDK
  source and fails if a future SDK version adds a literal this repo's pinned list does not know
  about.
- This is a DETECTION mechanism, not a PREVENTION mechanism: it catches a re-introduced collision
  the next time the gate runs, not at the moment an `gsd-sdk query state.*` call writes it.

## Resolution (2026-09-25): closed as obsolete — no reportable upstream exists

All facts below were verified live on 2026-09-25 in the parent session (quick task 260925-o9b).
No network re-verification was performed here; this is a transcription of that research.

**There is nowhere to file.** `gsd-build/get-shit-done` — the repo named in this todo's own
`bugs` URL — was archived read-only on 2026-06-26. Its issue tracker shows 0 open issues; no
report can be filed there at all. Its README states development relocated to "GSD Core in the
Open GSD repository".

**The version GameLib runs is frozen.** `get-shit-done-cc` on npm is deprecated, with the
deprecation message "Package no longer supported". `dist-tags.latest` is still 1.42.3, published
2026-05-16; the registry's `time.modified` is 2026-05-23. The consequence is the load-bearing
one: the defect this todo describes can never be fixed in the version GameLib runs, no matter who
reports it.

**Development continues elsewhere, as a restructured tree.** The active successor is
`open-gsd/gsd-core` — `pushed_at` 2026-09-25, 163 open issues, default branch `next`, homepage
opengsd.net. The SDK sources this todo cites by path have MOVED: `sdk/src/query/state-document.ts`
is now `src/state-document.cts`, and `sdk/src/query/state-mutation.ts` is now `src/state.cts`.
Every file:line citation in the body above therefore addresses a tree that no longer exists in
that shape.

**Three of this todo's four suggested fixes are already fixed upstream in gsd-core.** Suggestion
3 (require the bold form to be line-start) is FIXED at `src/state-document.cts:572` as
`^([ \t]*\*\*Field:\*\*[ \t]*)(.*)$`, upstream issue #4243 — and note that its in-code comment
cites this todo's exact failure mode, a bold field label quoted mid-sentence capturing the
rewrite and destroying the rest of its line. Suggestion 4 (the `### counts` lookahead trap) is
FIXED: the `(?=\n##|$)` lookahead was replaced by `collectSection(..., { levelBounded: true })` /
`tokenizeHeadings` per ADR-1372 T6. The frontmatter-shadowing half is FIXED body-only per upstream
#1255. Already-closed upstream issues covering this same defect class: #4481 (extract side,
bold-anywhere), #4823 (plain branch, whole-body and case-insensitive), #4469, #4419.

**Suggestions 1-2 remain PARTLY open upstream.** Section-scoping helpers exist —
`stateCurrentPositionSlice` (upstream #2956) and `stateReplaceFieldInSession` (#2444) — and some
callers scope correctly, but `record-session` (`src/state.cts:1991-2023`) and the phase-complete
path (`src/state.cts:6674-6683`) still pass whole-document content. The in-code comment at
`src/state.cts:1975` openly acknowledges that `stateReplaceField` "replaces the FIRST
case-insensitive label match anywhere in the document". This residual is tracked upstream by open
epic #4629, "STATE.md writes declare intent and are verified".

**Deliberately NOT re-reported upstream, and here is why.** gsd-core's maintainers already track
the residual in #4629 and document it in their own source comments; GameLib does not run
gsd-core; and the package GameLib DOES run can never receive the fix. A new issue would duplicate
closed work on a codebase this project is not a user of.

**GameLib's protection is unaffected.** The existing local workaround stands — the restructured
`.planning/STATE.md` plus `.planning/state-sdk-field-anchor-gate.py` (the 13th planning gate) —
and this closure changes nothing about it.

**Operational note.** The `gh` CLI is not installed on this machine (absent from both the Bash
and the PowerShell PATH), so no upstream issue could have been filed from here regardless.

The live exposure that outlives this todo — GameLib pinned to a deprecated, frozen SDK line — is
now tracked by
`.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md`.
