---
created: 2026-09-11
title: "`audit-uat` reads YAML blocks in document BODIES too — the 652-field body population is MEASURED (51 files); the whole-file `expected: |` suppression defect does not occur under `@opengsd/gsd-core` 1.14.0, and its gate was retired in 260926-kkt; item A (27-UAT.md) is CLOSED by relocation; only latent item D remains, narrowed by re-measurement to `23.2-HUMAN-UAT.md` (outside the gsd-core milestone window); PARKED pending the v0.8 milestone advancing"
area: planning-records
severity: minor
platform: any
ready: blocked
source: "quick task 260911-vox (the frontmatter block-scalar sweep) — found while proving that sweep's V4 post-condition; deliberately left OUT OF SCOPE there"
files:
  - .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md
  - .planning/debug/deep-link-open-url-abort.md
  - .planning/phases/17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i/17-UAT.md
  - .planning/phases/18-macos-32-bit-detection-badge-crossover-routing/18-UAT.md
  - .planning/phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-HUMAN-UAT.md
resolves_phase: null
---

## NOTE 2026-09-26 — gate retired, suppression defect gone under gsd-core, item D narrowed to 23.2 (quick `260926-ky9`)

This note governs where it contradicts the sections below; nothing below was edited.

1. `.planning/uat-visibility-gate.py` was retired in quick `260926-kkt` (deleted in `1fda931c3`).
   Every statement below that the gate holds, ledgers, or asserts something in
   `pnpm planning-gates` is now historical.
2. Under `@opengsd/gsd-core` 1.14.0, a body `expected: |` block scalar no longer suppresses a
   file. Measured live: `audit-uat` still reads 5 items from `34.3-UAT.md` and 17 from
   `34.5-UAT.md`, both in full.
3. Item D, re-measured through `listMilestonePhaseDirs`: phases 17 and 18 sit inside the current
   milestone window, 23.2 does not. `18-UAT.md` is absent from `audit-uat` because it is
   all-pass (0 items, `headingsSeen: 0`), not because a filter hides it — this corrects the
   260926-kkt SUMMARY's follow-up on that point (the SUMMARY itself is history and stays
   unedited). Item D stays open for `23.2-HUMAN-UAT.md` only (1 item, still absent).
4. Not established here: why `23.2-HUMAN-UAT.md`'s phase directory sits outside the window, or
   whether advancing past `v0.8` brings it in. PARKED item 5's unpark trigger is therefore
   unchanged but unverified under gsd-core.
5. `severity`, `platform` and `ready` are unchanged.

## PARKED 2026-09-18 — item A CLOSED by relocation, item D is all that remains (quick `260918-c6a`)

This section governs where it contradicts every section above, **including the
`## DECISION 2026-09-18` section from `260918-amq`** — specifically its `**A — still OPEN.**`
bullet, which that section's own "All four items, restated by current status" list carried. That
bullet is now superseded: item A is CLOSED. Nothing below was deleted; this file stays append-only.

1. **What item A's remedy actually was, and why flattening stayed excluded.** The two `reason: |`
   blocks at `27-UAT.md` L31/L51 were NOT flattened — the `RE-MEASURED 2026-09-12` census's
   multi-paragraph exclusion (3 paragraphs at L31, 2 at L51) still holds and was not overridden.
   `reason: |` became `reason: <one-line summary sentence>`, and the full narrative moved below it
   into the document body, dedented and verbatim, inside `<!-- reason-narrative:test-N:start -->`
   / `:end` HTML-comment markers. The mechanism that makes this legible to `audit-uat` without
   corrupting anything: `uat.js:158`'s `blockText.match(/reason:\s*(.+)/)` is unanchored, carries
   no `m` flag, and `.` does not cross a newline — it only ever consumes the first line, so a
   one-line summary on the key plus prose below it works exactly as designed. `categorizeItem`
   (`uat.js:116-146`) reads its `reason` argument only on the `result === 'skipped'` branch; both
   target items are `result: pending`, which returns `'pending'` before that branch is ever
   reached, so `category` could not move. Measured evidence, not asserted: `gsd-sdk query
   audit-uat` differed from its pre-edit baseline in exactly two string values (both phase-27
   `reason` fields, `"|"` -> a real sentence, nothing else in the 59-item/8-file JSON moved), and
   `.planning/uat-visibility-gate.py` printed the identical `36 / 154 / 95 / 59 across 12` both
   before and after the edit.

2. **This did NOT violate the `260918-amq` convention.** That convention governs `expected: |`
   block scalars — `uatRenderCheckpoint` (`uat.js:81-82`) reads those correctly today, and the
   convention exists to stop new UAT files being authored with that shape. This task touched only
   `reason:` keys, which no verb in the resolved SDK (`get-shit-done-cc` v1.42.3) dedents or
   block-parses (confirmed: the only two `expected:\s*\|`-matching dedent sites in the whole dist
   are `uat.js:81` and `uat.js:82`), in a file the convention does not name. Writing this down so
   the next reader does not mistake a `reason:` relocation for an `expected:` flattening — they are
   different keys, different files in spirit, and neither regresses the other.

3. **Why the ORDER mattered — park AFTER resolving, never before.** Parking first would have buried
   item A the same way `2026-08-17-keyring-available-is-a-silent-prompt-channel.md` was buried on
   2026-09-04 and resurfaced the next day as a **duplicate capture** from someone who did not know
   the file existed — despite its body stating **twice in bold** that the item was not parked. The
   generalisation this precedent forces: **every cheap reader takes the frontmatter key as the
   file's whole state**, and no amount of bold body prose compensates for a `ready:` value that
   says otherwise. Therefore: resolve every live sub-item first, park only when nothing live
   remains. This instruction is addressed to whoever next considers reversing that order on this or
   any other todo.

4. **`severity:` re-argued against the CLAUDE.md vocabulary — both sides recorded, then the call.**
   The call is **`minor`**.
   - *For `minor`:* the vocabulary reads "polish, rough edge, or **a latent trap with no live
     consequence**." With A closed and C decided-and-ledgered (see the `260918-amq` section above),
     item D is all that is left, and D's live consequence today is not merely assumed nil — it was
     **measured** on 2026-09-12: a syntactically perfect item was injected into all 62 phase dirs
     of a scratch copy, 39 surfaced and 23 did not, and D's 17 fields are inside the 23.
     `getMilestonePhaseFilter` removes their phase dirs before any file is opened, so no tool can
     reach them while the milestone is `v0.8`. That is the definition of latent.
   - *For staying `medium` (the argument that loses, and why):* D is **UNMEASURED** past the
     trigger — its consequence is *unknown*, not known-nil, and unknown normally cuts upward. The
     rebuttal: the unknown is about the defect's **magnitude after the trigger fires**, not about
     its existence today; `severity` grades the defect as it currently stands, and re-grading after
     the trigger is exactly what the unpark step (below) is for.
   - *The strongest objection, named and answered rather than ignored:* downgrading severity **and**
     parking in the same edit applies two visibility suppressions at once — which is the very
     burial mechanism item 3 above describes. The answer is that the correct remedy for a
     visibility problem is the **trigger and the breadcrumb** (item 5), not an inflated severity.
     Holding `medium` to keep a file visible would be using `severity` as a visibility lever rather
     than as a grading of the defect — the same category error as widening a ledger to make a gate
     green. If a future reader concludes the trigger is not load-bearing enough, the honest move is
     to strengthen the trigger, not to re-inflate the severity.

5. **UNPARK TRIGGER — explicit and testable.** The trigger is: *the active milestone advances past
   `v0.8`.* Made checkable, not vibed, by resolving where the milestone is actually recorded with a
   bounded command (not `STATE.md` read whole):
   `ls .planning/milestones/ 2>/dev/null; grep -n -i -m 5 'milestone' .planning/STATE.md` — measured
   result: `.planning/milestones/` holds only `v0.1-MILESTONE-AUDIT.md`, `v0.1-REQUIREMENTS.md`,
   `v0.1-ROADMAP.md`, `v0.1-phases` — no `v0.8` milestone file exists yet; the live record is
   `.planning/STATE.md` line 3, `milestone: v0.8`. **The concrete check: `STATE.md`'s `milestone:`
   field must read something other than `v0.8`.**
   Breadcrumb, verified rather than assumed: this todo previously claimed the string
   `getMilestonePhaseFilter` "appears in this todo and in nothing else under `.planning/`". That
   claim is **FALSE as measured today** — `grep -rl 'getMilestonePhaseFilter' .planning/ | sort`
   returns **five** files, not one: `.planning/STATE.md`,
   `.planning/quick/260912-9v7-census-the-audit-uat-body-block-scalar-p/260912-9v7-SUMMARY.md`,
   `.planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/260912-csq-SUMMARY.md`,
   `.planning/quick/260918-c6a-uat-reason-inline-then-park/260918-c6a-PLAN.md`, and this todo
   itself. Recording the true result rather than perpetuating the old claim — the breadcrumb still
   works (grepping the string surfaces this file among the five), it is just not exclusive.
   What unparking requires, plainly: measure the 17 fields, re-grade severity against that
   measurement, and restore `ready:` to a live value.

6. **What is still true and unfixed**, so this park does not read as a completion: `audit-uat`'s
   JSON still carries no internal indicator that phase 34.5 is absent (item C's accepted residue,
   held by `uat-visibility-gate.py`, not repaired), and nothing in CI covers the body block-scalar
   population at large — that remains D3 in quick `260911-j88`.

## DECISION 2026-09-18 — remedy option 2 adopted (quick `260918-amq`) — read this first

This section governs where it contradicts every section below, including `ITEM B CLOSED` and
`RE-MEASURED`. Nothing was deleted from this file; older sections are superseded in place, not
removed.

**Superseded claim, named explicitly.** The `# ` body heading below this section — "`audit-uat`
parses body YAML too, and that population has never been counted" — is FALSE as of the
`RE-MEASURED 2026-09-12` section further down: the population HAS been counted (652 fields / 51
files). That heading is left in place because this file is append-only, but a reader must not take
it at face value; see `RE-MEASURED` for the actual count and see this section for the decision made
against it.

**What was decided.** The 26 existing `expected: |` blocks in `34.3-UAT.md`, `34.5-UAT.md`, and
`34.6-UAT.md` are accepted as permanently ledgered — they stay hidden from `audit-uat`, and that
fact is now asserted every `pnpm planning-gates` run by `.planning/uat-visibility-gate.py`, which
fails if the invisible count drifts in either direction. What changes is authoring: a new CLAUDE.md
convention stops the NEXT UAT file being born suppressed, by teaching the inline `expected:`/
`result:` shape and forbidding the block-scalar form outright.

**What was rejected, and why.** Flattening the 26 existing blocks to repair `audit-uat`.
`uatRenderCheckpoint` (`uat.js:81-82`) deliberately matches `expected: |` and dedents it
correctly — it reads these files right, today. Flattening would regress a reader that already
works in order to repair one that does not, and both parsers live in the same upstream npx package
(`get-shit-done-cc`, pinned `v1.42.3`) that this repo does not control.

**Where the convention now lives.** `CLAUDE.md`, `GSD:conventions` region, under the heading
`### UAT item shape (`expected:` inline, never a block scalar)` — the fourth convention alongside
the three that predate it.

**Root cause, confirmed out of scope.** The upstream scaffold
(`~/.claude/get-shit-done/templates/UAT.md:23` and `workflows/verify-work.md:230`) emits
`expected: |` by default, so a freshly scaffolded UAT file starts non-conforming. Those files live
outside this repo and are not being changed by this decision — the CLAUDE.md convention exists
precisely because the scaffold cannot be fixed from here.

**All four items, restated by current status:**

- **B — CLOSED** 2026-09-12 (quick `260912-n9i`). See `ITEM B CLOSED` below; unchanged by this
  decision.
- **C — DECIDED, accepted as ledgered, NOT fixed.** The whole-file suppression defect (`expected:
  |` deleting every item in a UAT file from `audit-uat`) is the defect this decision addresses —
  by convention for new files, not by repair of old ones. The live residue is named honestly:
  phase 34.5's 22 items and 3 `blocked` results are STILL invisible to `audit-uat` today. That
  invisibility is no longer a silent, unmeasured unknown — it is a known, ledgered, CI-asserted
  condition (`uat-visibility-gate.py` names it exactly) — but the items themselves are still not
  in `audit-uat`'s output.
- **A — still OPEN.** The two `reason: |` fields at `27-UAT.md` L31/L51 still emit the literal
  `"|"`. The trap for the next author: both are MULTI-PARAGRAPH (3 paragraphs at L31, 2 at L51),
  and this todo's own `RE-MEASURED` census hard-excludes multi-paragraph blocks from flattening —
  so item A cannot be closed by the same flattening remedy this todo already used elsewhere
  (`260911-vox`, `260912-n9i`). It needs a different remedy shape, not yet chosen.
- **D — still OPEN and LATENT.** 17 milestone-hidden fields across `17-UAT.md`, `18-UAT.md`, and
  `23.2-HUMAN-UAT.md` remain UNMEASURED — their phase dirs are filtered out before `audit-uat` ever
  opens them. Milestone is still `v0.8`; they enter scope with no gate noticing the moment it
  advances.

**Severity reassessed: `major` → `medium`, argued against the CLAUDE.md vocabulary.** `major` means
"a feature is broken or a measurement is silently contaminated"; `medium` means "real defect,
bounded blast radius, workaround exists." The tension is real and both readings have merit:

- *For staying `major`:* `audit-uat`'s own JSON output carries zero internal indicator that phase
  34.5 is missing — `summary` just reports a smaller, clean-looking count. A consumer who trusts
  that JSON alone, without cross-referencing `uat-visibility-gate.py`, is exactly as misled today
  as before this decision. The measurement itself is unchanged.
- *For `medium` (the call made here):* the word doing the work in `major`'s definition is
  **silently**. Before this decision, the suppressed population was unmeasured and unwatched by
  anything — nobody could say how big it was or whether it was growing. After it: the exact bound
  (26 blocks, 3 files, 22 items, 3 `blocked`) is enumerated in this file AND independently asserted
  by a passing CI gate on every commit (`OK: 36 UAT-type file(s), ... 59 invisible across 12
  file(s) -- exactly matching the ledger`), which fails the build the moment a NEW invisible item
  appears anywhere, including in a file absent from its ledger. A defect with an exact, CI-enforced
  bound and a documented workaround (run the gate, or read this file, to know what `audit-uat`
  won't show you) fits `medium`'s "bounded blast radius, workaround exists" better than it fits
  `major`'s "silently contaminated." The residual risk named above (a bare `audit-uat` consumer is
  still misled) is real but is now a KNOWN, NAMED gap rather than an undiscovered one — that is the
  distinction this call rests on.

**Readiness reassessed: `human` stays — NOT rubber-stamped to `code`, argued.** The decision that
was outstanding when `ready: human` was set ("should the 26 ledgered blocks be flattened at all,
given the `render-checkpoint` trade?") has now been ANSWERED: no. But `ready: code` would be a
rubber stamp, not an honest reflection of what remains:

- Item A still needs a remedy SHAPE chosen before any code is written — flattening is
  hard-excluded by its own multi-paragraph census, and no alternative shape (rewrite to
  single-paragraph prose? accept as ledgered like C? something else?) has been decided. That is a
  human decision, not a mechanical edit.
- This file already set the precedent that authorship counts as a human decision, not desk work:
  `ITEM B CLOSED` deliberately did NOT write a `## Current Focus` line for `knowledge-base.md` /
  `steam-install-options-opens-nothing.md`, reasoning that "writing one is authorship — deciding
  what that session's current focus IS — not a shape fix." Item A's remedy is the same kind of
  authorship call, one level up: deciding the correct SHAPE for two specific multi-paragraph
  fields is not typing a fix, it is judgment.
- The REMAINING human question differs from the one just answered: the earlier question was
  "flatten or not, given the render-checkpoint trade" (now closed, answered no, for the 26
  ledgered blocks). The remaining question is narrower and specific to item A: "given flattening is
  excluded for these two multi-paragraph fields, what remedy shape applies instead?" Item D is not
  a readiness blocker today — it is correctly `UNMEASURED`/latent pending a milestone change, not
  something a human needs to decide right now.

# `audit-uat` parses body YAML too, and that population has never been counted

## ITEM B CLOSED 2026-09-12 (quick 260912-n9i) — read this first

This section governs where it contradicts the sections below, including the `RE-MEASURED`
section immediately following. Nothing was deleted from this file.

1. **Item B is DONE.** Four open debug sessions (`deep-link-open-url-abort.md`,
   `download-queue-require-crash.md`, `humankind-depot-full-stall.md`,
   `nile-spawn-app-side-latency.md`) now lead their `## Current Focus` section with a
   sub-100-character ASCII prose line, so `audit-open` emits the finding instead of a key. No
   YAML was restructured; two lines (one prose line, one blank line) were added per file.

2. **The measured delta, and why it matters.** This todo's own census (the `RE-MEASURED` section
   below) recorded this population as **1** field reaching `audit-open` — it classified only
   BLOCK SCALARS, so the only `audit-open`-reachable field it could see was
   `deep-link-open-url-abort.md:231` `hypothesis: |`. The live tool actually shows **4** sessions
   reaching the same `audit-open.js:46-50` 100-char first-non-empty-line slice, because **3 of the
   4 are PLAIN KEYS, not block scalars** (`reasoning_checkpoint:` x2, and nile's parenthesised
   `reasoning_checkpoint (SUPERSEDED ...):`). The census's own instrument — built to find block
   scalars — could not see them: the defect `audit-open` actually has is "the first line after the
   heading is a YAML key of any shape", and block-scalar-ness is incidental to it. Record this as
   an instrument limitation, not an arithmetic error in the RE-MEASURED section.

3. **Consequence for the RE-MEASURED reachability table.** That table's `reaches-as-bare-indicator:
   3` row counted `deep-link-open-url-abort.md:231` as one of its three members. That field no
   longer reaches `audit-open` as a bare indicator — the new prose line is emitted in its place —
   so the two surviving `reaches-as-bare-indicator` members are `27-UAT.md:31` and `27-UAT.md:51`,
   both reached via `audit-uat`, not `audit-open`. The block scalar itself is UNCHANGED on disk
   and still reads correctly for a human; only what the tool slices has moved.

4. **A distinct, unfixed defect.** `knowledge-base.md` and `steam-install-options-opens-nothing.md`
   emit an EMPTY `hypothesis` from `audit-open`. The cause is different from item B's shape defect:
   neither file has a `## Current Focus` heading at all, so the tool's first-non-empty-line slice
   has nothing to take. Writing one is authorship — deciding what that session's current focus IS —
   not a shape fix, so it was deliberately NOT done as part of this item. Left open and named here
   so the next author does not mistake it for the same bug as item B.

This todo STAYS OPEN in `pending/`. Item A (the two `reason: |` fields in `27-UAT.md`), item C (the
`expected: |` whole-file suppression in `audit-uat`), and item D (the 17 milestone-hidden fields)
are all untouched by this quick task and remain exactly as the `RE-MEASURED` section below
describes them.

## RE-MEASURED 2026-09-12 at HEAD 6c0c2a96d (quick 260912-9v7) — read this before the sections above

Everything below this section is preserved exactly as written on 2026-09-11. Where this section
contradicts it, **this section governs**. Nothing was deleted, because the point of the record is to
show that the figures moved.

### Remedy decision: SWEEP NOTHING — but NOT via gate clause G1 or G2

The plan's gate **opened**, and then the plan's own hard exclusions emptied its scope to zero fields.
That is a different outcome from "the premise was confirmed at its floor", and the distinction
matters to whoever picks this up next:

- **G1 is REFUTED.** G1 required the reachable count to be `<= 2`. It is **3**. A reachable field
  exists **outside** the two `27-UAT.md` `reason:` fields this todo already knew about:
  `.planning/debug/deep-link-open-url-abort.md:231` `hypothesis: |`, which reaches **`audit-open`**.
- **G2 therefore also fails** its second clause, which requires the reachable remainder to be covered
  by G1.
- **All three reachable fields are multi-paragraph** (3, 2 and 2 paragraphs). The plan hard-excludes
  any block containing a fence, a markdown table, or more than one paragraph from flattening
  *regardless of reachability*. Sweepable scope after exclusions: **0 fields**.

So: no file was converted, and each reachable field is recorded as **needing a different remedy
shape** — a flattening remedy is the wrong instrument for all three.

### The body population — measured, not estimated

| axis | measured at `6c0c2a96d` |
| --- | --- |
| body block-scalar fields | **652** |
| files carrying them | **51** |
| characters | **883,704** (a FLOOR, see below) |
| top-level / nested | 406 / 246 (6 in list items, 240 merely indented) |
| excluded as inside a fenced code block | 7 |
| inverse-population candidates | 294 |

Bucketed: `debug/resolved/` **509** fields / 19 files · `phases/` **102** / 12 · `debug/` (open)
**40** / 19 · `milestones/` **1** / 1. `todos/` and `quick/` carry **zero** — this defect does not
live in either.

**Delta against this todo's own stated floor ("one file, 3 lines"):** the floor was accurate but
under-sized by **51x in files and 217x in fields**. `27-UAT.md`'s three lines are confirmed exactly
at L31, L51 and L86.

**Delta against quick `260912-9v7`'s planner sizing (55 files / 663 fields):** −4 files, −11 fields,
and the difference is **fully accounted**, not waved at: **7** were YAML-shaped lines sitting inside
fenced code blocks (documentation, not fields) and **4** were block-scalar lines nested inside
another block scalar's body, which belong to that outer block's value and must not be counted twice.
The planner's figure was a candidate-line count; this one resolves fields.

The character total is a **floor**, for three reasons: a block scalar nested inside another block's
body is counted once as part of the outer value rather than twice; characters are counted on the
dedented raw extent, which is not the string a YAML parser would emit (chomping `|- |+ >- >+` and
folded `>` line-joining change the final length); and trailing blank lines are trimmed.

### Which body blocks a tool actually reads — and by what rule

| class | count |
| --- | --- |
| `reaches-as-bare-indicator` | **3** |
| `reaches-truncated` | 0 |
| `reaches-fabricated-structure` | 0 |
| `reaches-correctly` | 4 |
| `not-read-by-any-verb` | **628** |
| `unmeasured` (milestone-hidden) | **17** |
| total | 652 |

The three reachable fields, each verified from captured tool **output**, not from source:

| field | tool | emitted value |
| --- | --- | --- |
| `27-UAT.md:31` `reason: \|` | `audit-uat` | `"\|"` |
| `27-UAT.md:51` `reason: \|` | `audit-uat` | `"\|"` |
| `debug/deep-link-open-url-abort.md:231` `hypothesis: \|` | `audit-open` | `"hypothesis: \|"` |

**The body mechanism is a RAW REGEX, not `parseFrontmatterYamlLines`.** That function appears in
exactly one dist module (`frontmatter.js`) and never touches document bodies. This defect is
therefore **a different mechanism from its parent**, and `260911-vox`'s fabricated-keys behaviour
does **not** transfer — `reaches-fabricated-structure` is measured at **0**. Per-tool rules:

- **`audit-uat`** finds body fields with `blockText.match(/reason:\s*(.+)/)` (`uat.js:158`) and the
  `blocked_by` equivalent (`:159`). Unanchored, no `m` flag, first match wins, `.` stops at the
  newline — so `reason: |` yields the one-character string `"|"`.
- **`audit-open`** does not parse YAML at all. It slices the first non-empty line after
  `## Current Focus` to 100 characters (`audit-open.js:46-50`), so `hypothesis: |` is emitted
  verbatim — **key and indicator together**. This is a second tool reading body blocks, which this
  todo listed as an open question.
- **`uat render-checkpoint`** deliberately matches `expected: |` and dedents it (`uat.js:81-82`).
  All 4 `reaches-correctly` fields reach through this verb.

### The named open question, answered: `27-UAT.md` L86 `detail: |` does **NOT** reach

Answered from output, not by reading the parser: the probes `ORIGINAL BLOCKER`, `detail`,
`Retestable` and `SEAM.md` are **all absent** from `gsd-sdk query audit-uat`. `parseUatItems` only
ever looks for `reason:` and `blocked_by:`; `detail:` is not a key it reads, and test 5's block had
already matched `reason:` at L51 (first match wins).

### A worse defect than this todo describes: `expected: |` **suppresses the entire file**

`parseUatItems`' `testPattern` (`uat.js:150`) requires `expected:` to carry inline text **and**
`result:` to be the very next line. A block scalar puts the body in between, so the pattern never
matches and **every item in the file vanishes from `audit-uat`**.

Proved by control, not inference: `34.5-UAT.md` carries 22 `### N.` items, 23 `expected: |` blocks
and 3 `result: blocked`. Phase 34.5 is **absent** from `audit-uat`. Flattening the **single**
`expected: |` of item 18 in a scratch copy made phase 34.5 **appear**, with exactly one item
(test 18, `blocked`, `reason: "|"`). Nothing else was changed. Affected visible files:
`34.5-UAT.md` (23), `34.6-UAT.md` (2), `34.3-UAT.md` (1).

This is **suppression**, not truncation, and it is strictly worse: truncation shows an operator an
obviously-wrong `"|"`; suppression shows them a clean, complete-looking audit that is missing three
`blocked` items.

### The reader asymmetry, confirmed — it bounds any future remedy

Same file, same syntax, opposite outcomes, both from tool output:
`uat render-checkpoint --file .../34.5-UAT.md` returns test 5 with its `expected: |` block (L104)
**fully dedented and intact**, while `audit-uat` omits phase 34.5 **entirely** because of that same
syntax. **Flattening body `expected: |` would regress `render-checkpoint`, which is correct today,
in order to repair `audit-uat`.** Any future remedy must price that trade.

### Flattening hazard — `260911-vox`'s "0 tables" reasoning does NOT carry over

`260911-vox` accepted flattening partly because it measured **0** markdown tables in its population —
"the one shape that would have become unreadable rather than merely worse". **That zero does not
hold here.** In this body population: **37** blocks contain a fenced code block, **11** contain a
markdown table, **242** are multi-paragraph. Only 348 of 652 are plain single-paragraph prose.
The `note: |` blocks in `.planning/debug/resolved/epic-login-non-interactive.md` wrap verbatim log
excerpts in fences; flattening those is destructive, not lossy. **Re-measure; do not reuse the zero.**

### Reported as UNMEASURED — not as zero

**17 fields across `17-UAT.md`, `18-UAT.md` and `23.2-HUMAN-UAT.md` are UNMEASURED.** Their phase
dirs are removed by `getMilestonePhaseFilter` before any file is opened, so `audit-uat` never sees
them and no statement about their reachability is possible. Measured empirically: a syntactically
perfect item was injected into all **62** phase dirs of a scratch copy; **39** surfaced, **23** did
not. (`17-UAT.md:22` is the one exception — it reaches `render-checkpoint`, which takes an explicit
`--file` and so is not subject to the milestone filter.) **If the current milestone advances, these
enter scope with no gate noticing.**

Reconciliation: **82** UAT/VERIFICATION files on disk, **8** emitted. Omissions: 36 milestone-filtered,
22 VERIFICATION files whose status is not `human_needed`/`gaps_found`, 16 UAT-type files with no
result the `testPattern` can reach.

### The four known `audit-uat` lies — disposition

- **Ruled OUT — `gaps_found` hides a phase.** Exactly one file on disk carries `gaps_found`
  (`13-VERIFICATION.md`) and it is milestone-hidden, so its status is not what excludes it.
  `uat.js:306` explicitly admits `gaps_found`.
- **CONFIRMED LIVE — `status` hides items.** Only `pending|skipped|blocked` are emitted
  (`uat.js:154`). The on-disk result vocabulary totals **98** result lines of which only **10** are
  in the accepted set. **88 of 98 are invisible regardless of block scalars.**
- **CONFIRMED LIVE — dropped `id:`, positional emission.** `38-VERIFICATION.md` carries **36** `id:`
  keys; emitted items have no `id` and are numbered positionally 1..**34** (`uat.js:188-215`).
- **Ruled OUT — empty `human_verification` scrapes prose.** All 7 verification results came from a
  populated frontmatter array, so the body fallback (`uat.js:231+`) was never reached.

### Severity RAISED: `medium` -> `major`

This todo set its own revisit condition: *"If the census in step 1 finds the body population is
large, or step 2 finds more tools reading it, revisit."* **Both fired.** Against the `CLAUDE.md`
vocabulary, `major` = "a feature is broken or **a measurement is silently contaminated**":

- the population is **652 fields / 51 files**, not "two fields, one file";
- a **second tool** (`audit-open`) reads body blocks, so "one tool" no longer holds;
- decisively, the stated reason for staying below `major` was that *"the operator sees an
  obviously-wrong `|` rather than plausible-but-false prose."* **The suppression defect breaks
  exactly that assumption.** `audit-uat` silently omits phase 34.5 and its three `blocked` items,
  and its `summary` reports 8 phases / 59 items with no indication anything is missing. That is a
  silently contaminated measurement.

`ready:` moved `code` -> `human`. It is no longer desk work: the sweep was **declined on
measurement**, and what remains is a decision — whether to restructure UAT files at all, given that
any `expected: |` flattening trades a `render-checkpoint` regression for an `audit-uat` repair, in a
parser that lives in an upstream npx package this repo does not control. Leaving `ready: code` would
invite the next author to run precisely the sweep this measurement forbids.

### Measurement provenance

SDK pinned at execution time: `gsd-sdk` -> `~/.npm/_npx/4db0de1f85c3165e/.../bin/gsd-sdk.js`,
**v1.42.3**. (The second cache, `9785a834b31d581d` v1.27.0, has no `sdk/dist/query/` and did not
answer.) All line citations were verified against that resolution rather than inherited.
The `debug/resolved/` finding carries a **passing negative control**: the specimen is absent at
`debug/resolved/` with an open status (the readdir never descends) **and** absent at `debug/` with
`status: resolved` (the status skip), while the **positive control** — same file, open status, at
`debug/` top level — is **present**, which is what rules out "the probe does nothing".

### Noted, deliberately NOT done

The census strengthens the argument that `planning-frontmatter-gate.py`'s `TARGETS` should widen to
cover bodies — **nothing in CI catches any of this**. That remains **D3 in quick `260911-j88`**,
deliberately deferred. It is recorded here as an argument, not adopted.

## What was proved

Quick `260911-vox` swept every block-scalar field in `.planning/` **frontmatter** — 160 fields
across 68 files — to single-line single-quoted scalars, because the GSD SDK's frontmatter parser is
line-based and returned the bare indicator (`|`, `>`) instead of the narrative beneath it.

That sweep's live-tool gate captured `gsd-sdk query audit-uat` before and after. Before the sweep
its output carried **four** fields whose entire value was a bare block-scalar indicator. After the
sweep it carries **two** — and the two survivors are not frontmatter at all:

| audit-uat path | file | source line | in frontmatter? | status |
| --- | --- | --- | --- | --- |
| `results[0].items[0].reason` | `27-UAT.md` | L31 | **no — body** | **still `"\|"` today** |
| `results[0].items[1].reason` | `27-UAT.md` | L51 | **no — body** | **still `"\|"` today** |
| `results[7].items[5].expected` | `38-VERIFICATION.md` | frontmatter | yes | fixed by `260911-vox` |
| `results[7].items[5].why_human` | `38-VERIFICATION.md` | frontmatter | yes | fixed by `260911-vox` |

`27-UAT.md`'s frontmatter fences sit at file lines **1 and 7**. Its `reason: |` lines sit at **31
and 51** — thirty-odd lines below the closing fence, inside a YAML block in the document **body**.
They reach `audit-uat`'s output regardless. So `audit-uat`'s item parser reads body YAML, and the
same no-block-scalar-support defect applies there.

A third body-block line exists in that one file — `detail: |` at **L86** — and it is **not** known
whether it reaches `audit-uat`'s output. That ambiguity is the point of this todo.

## Why this was not fixed in `260911-vox`

The census that defined that sweep's scope (`filesWithBlockScalars: 68`, `blockScalarFields: 160`)
walked **frontmatter only** — it matched block-scalar lines between the opening and closing `---`
fences and ignored everything after. The body population was therefore invisible to it, and
widening the sweep mid-flight would have meant converting files against a scope nobody had
measured. `260911-vox` recorded the finding and left it here instead.

## What this todo asks for — a census FIRST, not a fix

**Do not sweep anything before measuring.** The history of the todo this one descends from
(`2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`, now in `completed/`) is
three consecutive rounds of a population moving under the previous author's feet, each round
producing a figure that was wrong by the time someone acted on it. Repeat that mistake here and it
will be the fourth.

1. **Measure the body population.** How many `.planning/*.md` files carry block-scalar fields
   *after* their closing frontmatter fence, how many fields, how many characters. One file
   (`27-UAT.md`) is known to hold 3 such lines; that is a floor of one file, not a census.
2. **Establish which body blocks any GSD tool actually reads.** This is the part that decides
   severity. `audit-uat` demonstrably reads *some* body YAML — it surfaced L31 and L51. It is not
   established which body blocks it reads, by what rule it finds them, or whether any other SDK
   verb (`audit-open`, `phase-lifecycle`, `frontmatter.get`) does the same. A body block no tool
   reads is a legibility problem; one a tool reads is a live contamination problem.
3. **Only then decide the remedy.** The frontmatter convention (single-line, single-quoted,
   apostrophes doubled — quick `260911-hyy`) may or may not be the right shape for body blocks,
   because the body parser's quoting behaviour has not been characterised the way
   `scratchpad/sdktest.mjs` characterised the frontmatter one in `260911-vox`.

## Known cost of the frontmatter remedy, if it is reused here

Flattening a block scalar to one line is **not lossless**. Across `260911-vox`'s 160 fields it
destroyed paragraph structure in 25 and list structure in 3, irreversibly, for any human reading
the raw file. Accept that cost again only against a measured benefit.

## Severity and readiness, justified

- **`severity: medium`.** A live GSD tool (`audit-uat`) emits `"|"` where an operator expects a
  sentence — so this is a real defect with a live consumer, not mere legibility. It stays below
  `major` because the blast radius is bounded and known: two fields, one file, one tool, and the
  operator sees an obviously-wrong `"|"` rather than plausible-but-false prose. If the census in
  step 1 finds the body population is large, or step 2 finds more tools reading it, revisit.
- **`ready: code`.** Census and conversion are desk work — read, measure, convert, verify against
  both parsers. No live gate, no OS dependency, no human decision outstanding.
- **`platform: any`.** No OS dependency.

## Residual worth knowing

`planning-frontmatter-gate.py` covers only `STATE.md` and `ROADMAP.md`. It does not check
frontmatter across the 68 files `260911-vox` swept, and it certainly does not check document
bodies. **Nothing in CI will catch a regression in either population.** Widening the gate's
`TARGETS` remains D3 in quick `260911-j88`, deliberately deferred.
