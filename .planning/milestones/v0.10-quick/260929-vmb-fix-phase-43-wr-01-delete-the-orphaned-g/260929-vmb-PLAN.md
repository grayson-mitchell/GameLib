---
phase: quick-260929-vmb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
autonomous: true
requirements:
  - WR-01

estimate:
  tokens: 30000
  raw_tokens: 15000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - Every rule styling the retired grouped/collapsible/pinned presentation is gone from the Humble Keys stylesheet, along with the comment blocks that documented it — verified by a negative grep measured RED (11 occurrences) before the work.
    - No comment anywhere under Humble/Keys still names a deleted class, so the cleanup does not itself leave the dangling-reference defect WR-02 was filed for.
    - The deletion is BOUNDED — the ten live selectors that must survive are still declared, including the seven badge modifiers reachable only by template-literal interpolation and therefore invisible to a name grep.
    - The diff against the Humble Keys stylesheet is deletion-only — zero added lines — so no tombstone comment or replacement rule was smuggled in.
    - The 535-line source-text stylesheet gate and the rendered-tree negative assertions both still pass, unmodified, at their measured baseline of 2 suites / 87 tests.
  artifacts:
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
  key_links:
    - "The interpolation blind spot: `.humbleKeyStateBadge--{UNPICKED,UNREVEALED,REVEALED,REDEEMED,UNREDEEMABLE}` and `.humbleUrgencyBadge--{danger,warning}` are constructed at HumbleKeyRow/index.tsx:815 and UrgencyBadge/index.tsx:45 as template literals. A grep for their full modifier names returns ZERO, so a dead-CSS sweep driven by name search would condemn seven live rules. The bounded-ness gate exists specifically to catch that over-deletion, which no test in this repo would otherwise detect — the Frontend jest project runs testEnvironment: 'node' with no CSS engine, so nothing can observe an unstyled badge."
    - "The completeness gate and the review's own suggested fix are in direct conflict: the review proposes leaving a `/* delete: .humbleKeysGroupList, ... */` tombstone comment naming all ten classes. That comment would be a fresh dangling reference AND would hold the completeness grep permanently red. The gate is the authority; the review's Fix block is not."
---

<objective>
Delete the orphaned grouped/collapsible/pinned-section CSS that Phase 43's code
review filed as finding WR-01, together with the comment blocks documenting it,
and repair the one cross-file comment that referenced a deleted class.

Purpose: Phase 43 replaced the three Humble Keys tabs with a single unified list
and deleted `HumbleKeyGroup`, `groupKeys.ts` and the three tab screens — but
neither of the two commits that touched this stylesheet removed the rules that
styled the retired presentation. What remains is 78 lines of CSS with zero
consumers, plus three explanatory comment blocks describing a collapsible group
header, a chevron, an `aria-expanded` contract and a pinned "Expiring soon"
section that no longer exist anywhere in the app. That reads to a future editor
as a live, styled, intentionally-maintained surface. It is not.

Output: two stylesheet edits. No `.tsx` change, no test change, no behaviour
change — nothing in this plan can alter a rendered pixel, because every rule
removed has no element to match.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/frontend/screens/Humble/Keys/index.css
@src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
</context>

<measured_facts>
Every number below was measured against the working tree at HEAD (`b3427fa7a`,
tree clean) during planning on 2026-09-29. Re-measure before relying on any of
them — the gates in task 1 do this for you and are the authority. In particular,
**the line numbers in the review are a starting point, not authority**; derive
the edit boundaries from the file you actually open.

## The 91/180 "duplication" is not a duplication

The task brief asked what the overlap between the rule at line 91 and the rule at
line 180 actually is, and whether the review mis-transcribed one of the two
names. Measured answer: **there is no overlap and no mis-transcription.** They are
two distinct class names differing by one character:

| line | selector | note |
|---|---|---|
| 91 | `.humbleKeysGroupList` | plural `Keys` — the outer flex column that stacked the groups |
| 180 | `.humbleKeyGroupList` | singular `Key` — the reset `<ul>` of rows *inside* one group |

The review's ten-name list is correct and names both. Both are dead; both go.

## Census, re-derived with word boundaries and comment awareness

The brief warned that a bare-name grep was wrong three ways. Re-run with
`NAME([^A-Za-z0-9-]|$)` so that a prefix cannot match a longer sibling, across
`src` and `meta`, excluding the target stylesheet itself:

| doomed name | live consumers | non-CSS hits found |
|---|---|---|
| `.humbleKeysGroupList` | 0 | — |
| `.humbleKeyGroup` | 0 | — (prefix contamination confirmed: a bare grep matches its five longer siblings) |
| `.humbleKeyGroupHeading` | 0 | — |
| `.humbleKeyGroupLabel` | 0 | — |
| `.humbleKeyGroupChevron` | 0 | — |
| `.humbleKeyGroupChevron--open` | 0 | — |
| `.humbleKeyGroupCount` | 0 | 1 comment in a *sibling stylesheet* (task 2); 1 negative test assertion |
| `.humbleKeyGroupHeading--static` | 0 | — |
| `.humbleKeysPinnedSection` | 0 | 1 negative test assertion |
| `.humbleKeyGroupList` | 0 | — |

The only two non-CSS references are the negative assertions at
`__tests__/index.test.tsx:1171` and `:1185`, which assert these classes are
**absent** from the rendered tree. They are the regression gate for the very
thing this cleanup tidies up after — they must not be touched.

## Modifier families reachable only by interpolation — the over-deletion hazard

Every `--`-suffixed selector declared in the stylesheet, with how it is reached:

| line | selector | reached by |
|---|---|---|
| 152 | `.humbleKeyGroupChevron--open` | nothing — DEAD |
| 170 | `.humbleKeyGroupHeading--static` | nothing — DEAD |
| 486, 490, 494, 498, 502 | `.humbleKeyStateBadge--{UNPICKED,UNREVEALED,REVEALED,REDEEMED,UNREDEEMABLE}` | **interpolation** at `components/HumbleKeyRow/index.tsx:815` — LIVE |
| 564, 568 | `.humbleUrgencyBadge--{danger,warning}` | **interpolation** at `components/UrgencyBadge/index.tsx:45` — LIVE |

That is the complete modifier census; there is no third interpolated family. The
seven LIVE modifiers return **zero** hits for their full names and would be
condemned by any name-driven sweep. They are out of scope and gate B pins them.

## Edit boundaries, derived from the file and confirmed by simulation

Two contiguous regions. Everything between them (lines 97-114,
`.humbleKeysEmptyState` and its `h5`/`p` descendants) is live and stays.

| region | lines | contents |
|---|---|---|
| 1 | 90-95 | blank separator + the `.humbleKeysGroupList` rule |
| 2 | 115-186 | blank separator + **every remaining doomed rule and all three comment blocks**, contiguous: the rule at 116, the comment at 122-125 + rule at 126, rules at 142/146/152/156, the comment at 165-169 + rule at 170, the comment at 174-175 + rule at 176, and the rule at 180 |

Boundary bytes verified with `od -c`: lines 90, 115 and 187 are each a bare `\n`;
lines 89, 114 and 186 are each a bare `}`. Deleting the *leading* blank of each
region (not the trailing one) leaves exactly one blank line at both seams.

**Simulated and measured, without touching the repo** (`sed -e '115,186d' -e
'90,95d'` into a scratch file — sed applies both ranges against input line
numbers in a single pass, so the two ranges do not disturb each other):

- 819 lines → **741** (78 deleted).
- Seam 1: `}` / blank / `.humbleKeysEmptyState {` — clean.
- Seam 2: `}` / blank / the `260908-vo4` title-line-height comment — clean.
- `prettier --check` on the result: exit 0, "All matched files use Prettier code style!".
- The simulated file was then **transiently swapped into the tree**, both Frontend
  suites run against it, and the tree restored (`git status --porcelain` → 0 lines,
  file byte-identical). Result: **2 suites passed, 87 tests passed**, trailing line
  `Ran all test suites matching /Humble\/Keys\/__tests__\/(index|humbleKeysStylesheet)/i.`
  **The deletion is already proven not to redden either suite.**

## Why the 535-line source-text gate survives

`__tests__/humbleKeysStylesheet.test.ts` names **none** of the ten doomed
selectors. Its risk to this task is not name-based but its **file-wide count
assertions**, which would shift if a deleted rule happened to declare a counted
token. All six such assertions were enumerated:

| assertion | counts | declared by a doomed rule? |
|---|---|---|
| `toHaveLength(3)` | `DIVIDER_CURRENTCOLOR_FALLBACK` | no |
| `?.length ?? 0` ×3 | `ANY_GOGICON_RULE` / `SCOPED_GOGICON_RULE` | no |
| `toHaveLength(1)` | `var(--status-success)` | no |
| `toHaveLength(1)` | `var(--success)` | no |

The doomed rules declare only `--text-sm`, `--text-secondary`, `--space-xs`,
`--space-3xs`, `--text-lg`, `--text-default`, `--space-md`, `--space-lg`,
`--space-2xs`, `--semibold`, `--regular`, `--input-background`, `--background` —
disjoint from every counted token. The gate also runs `stripSourceComments`
first, so deleting comment blocks cannot perturb it either.

## Gate baselines measured at HEAD

| gate | at HEAD | after |
|---|---|---|
| A — completeness (doomed names in the stylesheet) | **11 — RED** | 0 |
| B — boundedness (live selectors that must survive) | **10 — GREEN** | 10 (must hold) |
| C — no dangling comment (doomed names in sibling CSS) | **1 — RED** | 0 |

Gate A's 11 is ten selector lines plus one in-comment mention at line 166. Gate
B's count is **10**, not 9: three `.humbleKeysEmptyState` rules (bare, `h5`, `p`)
plus the five state-badge modifiers plus the two urgency-badge modifiers.

## Prettier visibility, measured per path

`npx prettier --file-info` (prettier 3.7.4), one path per invocation:

| path | result |
|---|---|
| `src/frontend/screens/Humble/Keys/index.css` | `ignored: false`, `inferredParser: "css"` |
| `.../components/HumbleClaimWizard/index.css` | `ignored: false`, `inferredParser: "css"` |

Both prettier-visible, so the `--check` in `<verify>` is real assurance and not
the vacuous green the project convention warns about. Baseline at HEAD: exit 0.

**Match the `--file-info` output space-tolerantly.** CLAUDE.md records that
prettier prints a space after each colon and inside the braces, and that is
CORRECT here — measured at the byte level with
`npx prettier --file-info <path> | od -c`, which shows `":` followed by a space
before `false`. An earlier draft of this plan claimed the opposite, that this
machine rendered the braces *without* spaces; that claim was FALSE and was a
misread of rendered terminal output, exactly the collapse-in-the-renderer trap
this project has been caught by before. It is corrected here rather than
silently deleted, because the trap is the reusable lesson: settle whitespace
questions with `od -c`, never by reading a rendered line. The gate uses
`grep -Eq '"ignored":[[:space:]]*false'` defensively — it matches under either
spelling — not because any discrepancy was actually observed.

## Jest invocation

`src/frontend/jest.config.js` sets `displayName: 'Frontend'` (capitalised;
`--selectProjects` is case-sensitive). Baseline at HEAD for the two suites:
**2 suites, 87 tests, green, 0.6s.**
</measured_facts>

<tasks>

<!--
COMMENT-TEXT DISCIPLINE: gate A negative-greps three literals that the task
actions below necessarily also name -- a deletion task cannot say WHICH rules to
delete without naming them. The usual hazard (an executor pastes action prose
into the target file as a comment, self-invalidating the gate) is closed twice
over here: the action forbids a tombstone comment in as many words, and gate C
independently requires ZERO added lines over the file, so any pasted prose fails
before gate A is even consulted. Markers below exempt the three exact literals.
-->
<!-- planner-discipline-allow: humbleKeysGroupList -->
<!-- planner-discipline-allow: humbleKeyGroup -->
<!-- planner-discipline-allow: humbleKeysPinnedSection -->

<task type="tracer">
  <name>Task 1: Delete both regions of dead grouped-presentation CSS, with their documenting comments</name>

  <files>src/frontend/screens/Humble/Keys/index.css</files>

  <read_first>
Open `src/frontend/screens/Humble/Keys/index.css` and derive the edit boundaries
from what you read. Do **not** paste the line numbers out of `<measured_facts>`
on trust — planning measured them at HEAD and the tree is the authority.

Confirm for yourself before editing:

    grep -nE 'humbleKeysGroupList|humbleKeyGroup|humbleKeysPinnedSection' src/frontend/screens/Humble/Keys/index.css
    grep -nE '^\.humbleKeysEmptyState' src/frontend/screens/Humble/Keys/index.css

The first should list ten selector lines and one in-comment mention; the second
should list three rules that sit **between** the two deletion regions and must
survive untouched. If either disagrees with `<measured_facts>`, stop and
re-derive the regions rather than forcing the documented ranges.
  </read_first>

  <action>
Remove two contiguous regions from the stylesheet. Use the Edit tool with the
exact text as the match — not a line-number tool — so that a boundary that has
drifted since planning fails loudly instead of silently slicing the wrong rules.

**Region 1** — the `.humbleKeysGroupList` rule (a four-declaration flex column)
together with the blank line that precedes it, leaving the preceding
`.WarningMessage.humbleSyncBanner` rule's closing brace followed by one blank line
and then the `.humbleKeysEmptyState` rule.

**Region 2** — everything from the blank line before the `.humbleKeyGroup` rule
through the closing brace of the final list-reset rule. This single contiguous
span contains all nine remaining doomed rules and all three explanatory comment
blocks. The comments go **with** their rules: the collapsible-header rationale
block, the D-86 pinned-heading block, and the pinned-section spacing block each
document a rule being removed, and a comment that outlives its rule is precisely
the WR-02 defect class this cleanup follows. The region ends immediately before
the blank line that precedes the `260908-vo4` title-line-height comment — that
comment and everything after it is live and stays.

The result should be the `.humbleKeysEmptyState p` rule's closing brace, one
blank line, then the `260908-vo4` comment.

**Hard constraints:**

- **Do NOT leave a tombstone comment naming the deleted classes.** The review's
  own `**Fix:**` block suggests exactly this — a `/* delete: ... */` comment
  listing all ten names. Reject it. Such a comment would be a brand-new dangling
  reference of the same class the task is removing, and it would hold the
  completeness gate below permanently red. Deleted code needs no epitaph; `git
  log` already has one.
- **Add nothing.** The diff over this file must be deletion-only — zero added
  lines. No replacement rule, no renamed rule, no re-wrapped survivor.
- **Do NOT touch the `.humbleKeysEmptyState` rule or its `h5`/`p` descendants**,
  which sit between the two regions and are live.
- **Do NOT touch any `--`-suffixed badge rule.** The five `humbleKeyStateBadge`
  modifiers and the two `humbleUrgencyBadge` modifiers are built by template
  literal at their call sites, so their full names grep to zero hits while being
  fully live. They look exactly like the dead rules to a name search and are not.
- **Do NOT edit any `.tsx` or `.ts` file.** In particular leave the two negative
  assertions in `__tests__/index.test.tsx` alone — they prove the grouped
  presentation is absent from the rendered tree and are the regression gate for
  this whole area. This task is CSS-only.
- The remaining file must still satisfy `prettier --check`; it did in simulation,
  because both regions are deleted at rule boundaries.
  </action>

  <verify>
    <automated>
# Gate A -- COMPLETENESS. No doomed selector, and no comment mentioning one,
# survives anywhere in the stylesheet.
#
# Substring matching is CORRECT here, and is the exact inverse of the census
# rule. The census needed word boundaries because `humbleKeyGroup` is a prefix of
# five longer names and a substring match would have reported a live consumer
# where there was none. For completeness the prefix relationship is an ASSET: all
# five siblings are doomed too, so three roots cover all ten names. Verified by
# measurement, not by assumption -- gate B below stays at 10 and both suites stay
# green, so no survivor shares these prefixes.
#
# Measured RED at HEAD during planning: 11 occurrences (10 selectors + 1 in-comment
# mention). This gate is therefore non-vacuous.
cd /Users/graysonmitchell/Projects/GameLib && \
N=$(grep -cE 'humbleKeysGroupList|humbleKeyGroup|humbleKeysPinnedSection' src/frontend/screens/Humble/Keys/index.css || true) && \
printf 'doomed-name occurrences: %s (want 0, was 11)\n' "$N" && [ "$N" -eq 0 ]
    </automated>
    <automated>
# Gate B -- BOUNDEDNESS. Every live selector that must survive is still declared.
# Without this, gate A would pass on a file that deleted far too much -- including
# on an empty file. The seven badge modifiers here are unreachable by name grep
# (built via template literal at HumbleKeyRow/index.tsx:815 and
# UrgencyBadge/index.tsx:45), so nothing else in the repo would notice their loss:
# the Frontend jest project runs testEnvironment: 'node' with no CSS engine.
#
# Measured GREEN at HEAD at exactly 10, and GREEN at 10 against the simulated
# post-deletion file.
cd /Users/graysonmitchell/Projects/GameLib && \
N=$(grep -cE '^\.(humbleKeyStateBadge--(UNPICKED|UNREVEALED|REVEALED|REDEEMED|UNREDEEMABLE)|humbleUrgencyBadge--(danger|warning)|humbleKeysEmptyState)' src/frontend/screens/Humble/Keys/index.css || true) && \
printf 'surviving live selectors: %s (want 10)\n' "$N" && [ "$N" -eq 10 ]
    </automated>
    <automated>
# Gate C -- DELETION-ONLY DIFF. Zero added lines over this file. Catches a
# tombstone comment, a replacement rule, or any smuggled edit in one check.
#
# Four ways this gate could lie, each closed deliberately:
#  1. `git diff` is captured into a variable FIRST rather than piped straight into
#     grep -- a fallible command in a non-final pipeline stage has its status
#     swallowed, so a broken `git diff` would yield ADDED=0 and read clean having
#     measured nothing.
#  2. A bare `git diff` measures the UNCOMMITTED tree: run this BEFORE the task
#     commit. The usual hazard -- passing vacuously once committed -- is closed by
#     the empty-diff guard, which FAILS. If you have ALREADY committed, re-run as
#     `git diff -U0 <sha>^..<sha> -- <the literal path>` using the SHA from
#     `git rev-parse HEAD` at that moment. No relative `HEAD~N` anchor: this repo
#     runs parallel sessions and worktrees, so HEAD~1 can name another session's
#     commit.
#  3. An empty diff means task 1 wrote nothing -- fail, do not pass on a no-op.
#  4. The path is written LITERALLY into the git invocation, never via a `PATHS=`
#     variable. This shell is zsh, which does NOT word-split unquoted parameter
#     expansions: `-- $PATHS` passes ONE pathspec containing a space and matches
#     no file, reporting a clean exit 0 over a genuinely dirty tree. Do not
#     "tidy" this path into a variable.
cd /Users/graysonmitchell/Projects/GameLib && \
DIFF=$(git diff -U0 -- src/frontend/screens/Humble/Keys/index.css) \
  || { printf 'git diff FAILED -- gate measured nothing\n'; exit 1; } && \
{ [ -n "$DIFF" ] || { printf 'EMPTY DIFF -- task 1 wrote no edit, or it is already committed (see note 2)\n'; exit 1; }; } && \
ADDED=$(printf '%s\n' "$DIFF" | grep -E '^\+' | grep -vE '^\+\+\+' | wc -l | tr -d ' ') && \
REMOVED=$(printf '%s\n' "$DIFF" | grep -E '^-' | grep -vE '^---' | wc -l | tr -d ' ') && \
printf 'added=%s (want 0)  removed=%s (expected ~78)\n' "$ADDED" "$REMOVED" && \
[ "$ADDED" -eq 0 ] && [ "$REMOVED" -gt 0 ]
    </automated>
    <automated>
# Gate D -- FORMATTER. The path is prettier-visible (measured ignored:false /
# inferredParser:"css"), so this is real assurance, not the vacuous green the
# project convention warns about. Scoped to the exact path, never a bare `.`.
# The file-info re-check is matched space-tolerantly on purpose -- see
# <measured_facts>.
cd /Users/graysonmitchell/Projects/GameLib && \
npx prettier --file-info src/frontend/screens/Humble/Keys/index.css 2>/dev/null \
  | grep -Eq '"ignored":[[:space:]]*false' \
  || { printf 'path is prettier-IGNORED -- the --check below would be vacuous\n'; exit 1; } && \
npx prettier --check src/frontend/screens/Humble/Keys/index.css
    </automated>
  </verify>

  <done>
All ten orphaned selectors and all three documenting comment blocks are gone from
`index.css`; a grep for the three doomed name-roots returns zero (it returned 11
before). The ten live selectors — three `.humbleKeysEmptyState` rules and the
seven interpolation-reached badge modifiers — are still declared. The diff over
the file contains zero added lines, so no tombstone comment was left behind. The
file passes a scoped, non-vacuous `prettier --check`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Repair the sibling stylesheet's comment that cites a now-deleted class</name>

  <files>src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css</files>

  <read_first>
This task exists because the census surfaced something the review did not record:
a **second stylesheet** carries a prose reference to one of the deleted classes.
Locate it and read the rules around it before editing:

    grep -n 'humbleKeyGroupCount' src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css

It sits inside the `Step 2 (D-73/UI-SPEC "Step 2 visual hierarchy")` comment
block, a few lines above `.humbleClaimWizardKeyRow`. Read that comment and then
read the `.humbleClaimWizardKeyValue` rule below it — the rule the comment's
"pill chrome" sentence actually describes.
  </read_first>

  <action>
Edit the prose of that one comment block so it no longer points at a class that
task 1 deleted. This is the same defect class as WR-02 — a comment outliving the
thing it cites — and leaving it would mean this cleanup created the exact defect
it was filed to remove.

The comment currently justifies the revealed key's pill chrome by saying it
matches the deleted count-badge's family. That lineage claim is now unverifiable
prose pointing at nothing. Replace the cross-reference with a **self-contained**
description of the chrome, which the sibling rule already declares outright:
an `--input-background` fill with a `--space-3xs` radius. Describing the chrome
directly is strictly better than re-pointing at some other surviving class —
it cannot rot again.

**Hard constraints:**

- Keep the `D-73`/UI-SPEC "Step 2 visual hierarchy" attribution and the
  `--text-xs`/`--semibold` typography-contract clause exactly as they are. Only
  the clause naming the deleted class changes.
- Change **no declaration**. The diff over this file must be comment lines only;
  `.humbleClaimWizardKeyRow` and `.humbleClaimWizardKeyValue` keep every property
  and value they have today.
- Do not introduce a reference to any other class in place of the deleted one.
  Swapping one cross-file pointer for another just relocates the rot.
- Hand-wrap the comment prose to match the surrounding corpus. Prettier does not
  reflow comment text, so `--check` passes either way — the wrap is house style
  the formatter cannot enforce for you.
  </action>

  <verify>
    <automated>
# Gate E -- NO DANGLING COMMENT. After task 1, no file under Humble/Keys may name
# a deleted class -- in a selector or in prose. Scoped to CSS because this plan is
# CSS-only; the two .tsx negative assertions are deliberately out of scope and
# would be matched by a wider sweep.
#
# Measured RED at HEAD during planning: 1 hit, the HumbleClaimWizard comment.
# Depends on task 1 having run -- the target stylesheet is in this sweep too.
cd /Users/graysonmitchell/Projects/GameLib && \
HITS=$(grep -rnE 'humbleKeysGroupList|humbleKeyGroup|humbleKeysPinnedSection' src/frontend/screens/Humble/Keys --include='*.css' || true) && \
{ [ -z "$HITS" ] || { printf 'SURVIVING REFERENCE(S):\n%s\n' "$HITS"; exit 1; }; } && \
printf 'no CSS file under Humble/Keys references a deleted class\n'
    </automated>
    <automated>
# Gate F -- COMMENT-ONLY DIFF over the wizard stylesheet. A surviving
# non-comment change means the edit overreached into a declaration. Same four
# pipeline/pathspec hazards as gate C, closed the same way; note the literal path.
# CSS block comments have no `//` form, so the comment-line filter accepts `/*`,
# `*`, `*/` and bare continuation prose is caught by requiring the changed line
# not to look like a declaration or a selector.
cd /Users/graysonmitchell/Projects/GameLib && \
DIFF=$(git diff -U0 -- src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css) \
  || { printf 'git diff FAILED -- gate measured nothing\n'; exit 1; } && \
{ [ -n "$DIFF" ] || { printf 'EMPTY DIFF -- task 2 wrote no edit, or it is already committed\n'; exit 1; }; } && \
BAD=$(printf '%s\n' "$DIFF" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
  | sed -E 's/^[+-][[:space:]]*//' \
  | grep -vE '^$' \
  | grep -E '(\{|\}|^[a-z-]+[[:space:]]*:)' | wc -l | tr -d ' ') && \
printf 'changed lines that look like CSS rather than prose: %s (want 0)\n' "$BAD" && \
[ "$BAD" -eq 0 ]
    </automated>
    <automated>
# Gate G -- FORMATTER over the wizard stylesheet. Prettier-visible (measured
# ignored:false / inferredParser:"css"). Scoped to the exact path.
cd /Users/graysonmitchell/Projects/GameLib && \
npx prettier --file-info src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css 2>/dev/null \
  | grep -Eq '"ignored":[[:space:]]*false' \
  || { printf 'path is prettier-IGNORED -- the --check below would be vacuous\n'; exit 1; } && \
npx prettier --check src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
    </automated>
  </verify>

  <done>
No CSS file under `Humble/Keys` names any of the deleted classes, in a selector
or in prose — a sweep that returned one hit before now returns none. The wizard
comment describes the pill chrome self-containedly and keeps its D-73/UI-SPEC and
typography-contract clauses. The diff over that file touches comment prose only,
and the file passes a scoped `prettier --check`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove both Frontend suites are undisturbed at their measured baseline</name>

  <files>(no files written — verification only)</files>

  <read_first>
This task writes nothing. Run it as its **own** shell invocation, after tasks 1
and 2 are already on disk.

This is not stylistic. Chaining a jest run onto the same command as a file write
(`... && npx jest ...`) has returned results for the PRE-write file on this repo —
observed three times, once putting a silently undercounted suite total into a
committed summary that a later task had to correct. Treat any count taken that
way as unmeasured.
  </read_first>

  <action>
Run the two Frontend suites that bear on this change and confirm they are green
at the baseline measured during planning: **2 suites, 87 tests**.

What each suite is for, and why a CSS deletion could plausibly have disturbed it:

- `__tests__/humbleKeysStylesheet.test.ts` is a 535-line **source-text** gate that
  reads this exact stylesheet as a string. The Frontend jest project runs
  `testEnvironment: 'node'` with no CSS engine, so it can only assert what the
  file's text says. It names none of the deleted selectors, but it carries six
  file-wide `match(...).length` count assertions — over the divider fallback, the
  two gogIcon rule forms, `var(--status-success)` and `var(--success)`. Deleting
  rules that happened to declare a counted token would shift those counts. None of
  the deleted rules do (verified during planning), and the suite was measured green
  against a simulated post-deletion file — but run it, do not assume it.
- `__tests__/index.test.tsx` holds the two **negative** assertions at roughly lines
  1171 and 1185 proving the grouped presentation is absent from the rendered tree.
  They concern rendered output, not the stylesheet, so a CSS-only deletion should
  leave them passing. Confirm that it does.

**If either suite goes red, do not weaken or delete an assertion.** Read which one
failed and why first. Those negative assertions are the regression gate for the
grouped presentation and are the whole reason this cleanup is safe; the stylesheet
gate is this area's only formatting/contract safety net. A red here means the
deletion overreached — fix the deletion, not the test.

Two invocation traps this command is shaped to avoid, both previously measured on
this repo:

- `--selectProjects` is CASE-SENSITIVE and the project is `Frontend`, not
  `frontend`. A lowercase value combined with `--passWithNoTests` exits 0 having
  run nothing.
- A bare POSITIONAL path alongside `--selectProjects` is SILENTLY DROPPED — jest
  runs every Frontend suite and reports nothing about your files. Scope with
  `--testPathPattern` and read the TRAILING line: it must say "Ran all test suites
  matching /<pattern>/i.", not "Ran all test suites."

Record the observed suite and test counts in the summary.

Note for context, not action: `pnpm lint` and `pnpm test:ci` are known-red at HEAD
on this repo for unrelated unowned debt (a warning ratchet and a leaked timer
respectively). Neither is in this task's scope and neither is caused by this
change. Do not attempt to fix them here.
  </action>

  <verify>
    <automated>
# Own invocation -- nothing chained after a write. Expect 2 suites / 87 tests,
# the baseline measured at HEAD AND measured again against a simulated
# post-deletion file during planning.
cd /Users/graysonmitchell/Projects/GameLib && \
npx jest --selectProjects Frontend \
  --testPathPattern 'Humble/Keys/__tests__/(index|humbleKeysStylesheet)'
    </automated>
    <automated>
# Assert the run was SCOPED and NON-EMPTY, not a silently-unfiltered full sweep,
# and pin the exact suite/test counts so a silently-vanished suite fails here.
cd /Users/graysonmitchell/Projects/GameLib && \
OUT=$(npx jest --selectProjects Frontend \
  --testPathPattern 'Humble/Keys/__tests__/(index|humbleKeysStylesheet)' 2>&1) && \
printf '%s\n' "$OUT" | grep -q 'Ran all test suites matching' \
  || { printf 'UNSCOPED RUN -- the filter did not apply\n'; exit 1; } && \
printf '%s\n' "$OUT" | grep -qE 'Test Suites:[[:space:]]+2 passed, 2 total' \
  || { printf 'SUITE COUNT != 2\n'; printf '%s\n' "$OUT" | tail -8; exit 1; } && \
printf '%s\n' "$OUT" | grep -qE 'Tests:[[:space:]]+87 passed, 87 total' \
  || { printf 'TEST COUNT != 87\n'; printf '%s\n' "$OUT" | tail -8; exit 1; } && \
printf '%s\n' "$OUT" | tail -6
    </automated>
  </verify>

  <done>
The scoped Frontend run is green at exactly 2 suites / 87 tests, and its trailing
line reads "Ran all test suites matching /.../i." — proving the filter applied
rather than the run silently sweeping every Frontend suite. Neither test file was
modified. Observed counts are recorded in the summary.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None crossed by this change.

This plan deletes CSS rules with no matching elements and edits one block-comment
in a second stylesheet. It adds no code path, no input handling, no I/O, no
dependency, no network or filesystem access, and no privilege transition. CSS is
not executable here; the deleted rules were unreachable even as style, because
every element they selected was removed in Phase 43. There is no attacker-reachable
surface to model, and inventing STRIDE rows for a dead-CSS deletion would be
security theatre rather than analysis — so none are filed.

## STRIDE Threat Register

Not applicable. No trust boundary, no data flow, and no executable change.
Against the configured ASVS level 1 with a blocking threshold of `high`, this
plan contributes zero threats at any severity.

The genuine risks here are CORRECTNESS risks, not security ones, and each is
handled by a gate rather than by a mitigation row:

- **Over-deletion of the interpolation-reached badge modifiers.** Seven live
  rules grep to zero hits by name, no test can observe an unstyled badge (the
  Frontend project has no CSS engine), and the failure would ship silently as a
  visual regression. Closed by gate B, which pins the surviving selector count at
  a measured 10.
- **Under-deletion, or a tombstone comment reintroducing the dangling reference.**
  Closed by gate A (zero doomed names), gate C (zero added lines), and gate E
  (no CSS file under Humble/Keys names a deleted class).
- **Collateral damage to the source-text stylesheet gate.** Closed by task 3's
  pinned suite and test counts, pre-validated against a simulated deletion.

No package-manager install occurs in this plan, so the package-legitimacy gate
does not arm and no `T-*-SC` row is filed.
</threat_model>

<verification>
Run from the repo root, after all three tasks:

1. **Completeness** — task 1 gate A. Zero doomed-name occurrences in the
   stylesheet. Measured RED at HEAD (11), so a green here is informative.
2. **Boundedness** — task 1 gate B. Exactly 10 live selectors survive, including
   the seven badge modifiers no name grep can see.
3. **Deletion-only** — task 1 gate C. Zero added lines over `index.css`.
4. **Formatter** — task 1 gate D and task 2 gate G. `prettier --check` over each
   exact path, both confirmed prettier-visible, never a bare `.`.
5. **No dangling comment** — task 2 gate E. No CSS file under `Humble/Keys` names
   a deleted class. Measured RED at HEAD (1 hit).
6. **Comment-only** — task 2 gate F. The wizard stylesheet's diff touches prose
   only.
7. **Suites undisturbed** — task 3. 2 suites / 87 tests, trailing "Ran all test
   suites matching" line present.

Deliberately out of scope and expected to remain untouched: the two negative
assertions in `__tests__/index.test.tsx`; `.humbleKeysEmptyState` and its
descendants; every `humbleKeyStateBadge--*` and `humbleUrgencyBadge--*` rule;
the already-resolved `.humbleKeyRowAction` comment at roughly line 359 (a record
of a prior deletion, not a live selector); the review's separate WR-02 finding
(fixed in quick task 260929-uw6) and its IN-01 Info item; and the known-red
`pnpm lint` / `pnpm test:ci` gates.
</verification>

<success_criteria>
- Every rule styling the retired grouped/collapsible/pinned presentation is gone,
  along with the three comment blocks documenting it — verified by a gate that was
  measured RED before the work.
- No tombstone comment was left behind; the diff over the stylesheet is
  deletion-only.
- The deletion is bounded: the ten live selectors still exist, including the seven
  badge modifiers that are reachable only by template-literal interpolation and so
  would be invisible to a name-driven sweep.
- No CSS file under `Humble/Keys` still references a deleted class, so the cleanup
  does not leave behind the same dangling-reference defect it was filed to remove.
- Both edited paths pass a scoped, non-vacuous `prettier --check`.
- The 535-line source-text stylesheet gate and the rendered-tree negative
  assertions are unmodified and green at 2 suites / 87 tests.
</success_criteria>

<output>
Create `.planning/quick/260929-vmb-fix-phase-43-wr-01-delete-the-orphaned-g/260929-vmb-SUMMARY.md` when done.

Record in it: the line ranges actually deleted at execution time and whether they
differed from the 90-95 / 115-186 measured at planning; the final line count of
`index.css` (planning simulated 819 → 741); the before/after values of gates A, B
and E; the exact replacement wording written into the wizard comment; and the
observed jest suite/test counts.
</output>
