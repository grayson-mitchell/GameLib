---
phase: quick-260925-nxt
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260925-nxt]
files_modified:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md

must_haves:
  truths:
    - "`gsd-sdk query audit-uat` still sees Phase 38 and now reports 25 items for it (was 23), and 50 total (was 48). A FLAT count would mean the array failed to parse or the edit did not register."
    - '`id: "38-C01"` and `id: "38-C04"` no longer appear anywhere in the file -- each parent is REPLACED IN PLACE by its two halves, not kept alongside them.'
    - "Every one of the four new halves carries its own `id`, `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`, `origin_item` and `prior_state`, matching the shape of the surrounding entries."
    - "`status:` is still `human_needed`."
    - "Nothing moved into `human_verification_discharged`. No sitting has happened; the controller sitting is still ahead."
    - "`38-C04b` (stick clicks) is OPEN in `human_verification`, NOT in `human_verification_retired`, and its `blocked_by` names a FEATURE DECISION rather than a hardware or machine-switch cost."
    - "No file under `src/` is touched. No stick-click dispatch is implemented."
    - "Every LIVE cross-reference that read `see 38-C01` or enumerated a `38-C01..Cnn` range is repointed; the FROZEN historical records (`sitting_1_2026_09_23` fields, the `human_verification_retired` array) are left verbatim."
    - "Phase 34.1's `human_verification_relocated` gamepad receipt names the post-split ID set, so the origin's record does not point at IDs that no longer exist."
    - "`38-HUMAN-UAT.md`'s disposition narrative matches the post-split ledger and records that the controller leg's blocking defect is fixed -- with NO result recorded for any item."
  artifacts:
    - path: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"
      provides: "The authoritative ledger, with 38-C01 and 38-C04 split at their branch boundaries"
      contains: '38-C01a'
    - path: ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md"
      provides: "The two-way relocation receipt, updated to the post-split IDs"
      contains: "38-C01a"
    - path: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
      provides: "Narrative disposition matching the post-split ledger"
      contains: "38-C04b"
  key_links:
    - from: "34.1-VERIFICATION.md human_verification_relocated (gamepad entry)"
      to: "38-VERIFICATION.md human_verification ids"
      via: "moved_as field naming the post-split IDs"
      pattern: "38-C01a"
    - from: "38-C02 / 38-C03 / 38-C05 / 38-C06 / 38-C08 platform_gate and scope_note"
      to: "38-C01a"
      via: "cross-reference repoint away from the now-nonexistent 38-C01"
      pattern: "38-C01a"
---

<objective>
Split two compound UAT items in Phase 38's authoritative ledger so the controller leg
is cleanly scoreable in a single sitting, and repair every reference the split
invalidates.

`38-C01` names "the d-pad AND the left stick" — sitting 1 (2026-09-23) measured the
two halves to OPPOSITE results. `38-C04` names "B/back navigation AND stick clicks" —
the stick-click clause describes a dispatch path that does not exist anywhere in this
repo. Relocation rule (4) forbids scoring either as written: "a compound item resolves
to a single pass/fail and the un-run half disappears."

Purpose: the operator is about to hold a controller sitting on Windows 11 with a
PowerA Advantage Wired Controller for Nintendo Switch 2 (`mapping: ''`). The
`checkNintendo` non-standard-mapping defect that blocked the whole controller leg on
2026-09-23 is fixed across quicks `260923-qe5`, `260925-9de`, `260925-m5i` and
`260925-ms5`, and the three other sitting-1 defects are in `todos/completed/`. The
ledger must be scoreable BEFORE the sitting, not after.

Output: four ledger entries replacing two, a repaired origin-phase receipt, and a
narrative that matches. NO application code. NO results recorded.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
@.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
@.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md

<hard_boundaries>
Read these before touching anything. Each is a measured failure mode on this file, not
a style preference.

1. **`status:` MUST stay `human_needed`.** `parseVerificationItems` only emits items
   when `status === 'human_needed'`. `gaps_found` is admitted and then yields ZERO
   items — the phase vanishes from `audit-uat` with nothing turning red. Verified live
   on Phase 34.1 (2026-08-13): 10 open items became 0.
2. **NO `src/` changes.** This plan ships no application code. In particular, do NOT
   wire `buttons[10]`/`buttons[11]` to any action. The pending todo says so under a
   heading reading "Do NOT implement stick clicks", and `nintendo.ts` carries the same
   prohibition in a source comment. Implementing the dispatch is an unscoped feature
   addition and is OUT OF SCOPE.
3. **NOTHING moves to `human_verification_discharged`.** Nothing has been observed. The
   controller sitting has not happened. Sitting 1's observations are PRIOR STATE, not
   results.
4. **The `human_verification` array is in ARRIVAL order, not id order**, and `audit-uat`
   emits POSITIONAL integers with the `id:` dropped entirely. Insert each half AT THE
   POSITION ITS PARENT OCCUPIED. Do NOT reorder any existing entry. Positions after the
   insertions shift — that is expected, and is exactly why nothing else may move too.
5. **New IDs must not collide.** Existing controller ids: `38-C01`..`38-C06` and
   `38-C08` open, `38-C07` retired. This plan uses the suffix form (`38-C01a`,
   `38-C01b`, `38-C04a`, `38-C04b`), which matches 34.1's own split precedent (`5b`,
   `8a`/`8b`, `10a`-`10g`) and keeps the lineage readable.
6. **The file must stay parseable.** `audit-uat` returning the expected count IS the
   parse proof — a FLAT count after an insert means an item was silently dropped.
</hard_boundaries>

<measured_baseline>
Taken at planning time, on this tree:

```
gsd-sdk query audit-uat   ->  phase "38": 23 items;  summary.total_items: 48
npx prettier --check <the three target files>
                          ->  "All matched files use Prettier code style!"
```

Target after this plan: phase 38 = **25** items, total = **50**. Two splits, each
adding one net entry.
</measured_baseline>

<source_facts>
Verified in source at planning time. Use these rather than re-deriving them.

**D-pad, non-standard mapping (the branch the PowerA pad arms):** `nintendo.ts:183`
`const NON_STANDARD_HAT_AXIS = 9`; helper `nintendoHatDirection(hatValue)` at
`nintendo.ts:201`; `nintendo.ts:297-301` reads `axes[NON_STANDARD_HAT_AXIS]` through
that helper and dispatches `padUp`/`padDown`/`padLeft`/`padRight`. The
STANDARD-mapping branch is separate, at `nintendo.ts:277-280` (`buttons[12]` ..
`buttons[15]`). Sitting 1's d-pad FAIL was measured against code that had only the
`buttons[12-15]` branch.

**Left stick:** `checkNintendo`'s own header comment records that "The STICK AXES are
read from the mapping too (quick-260925-9de) -- closing the gap quick-260923-qe5
deliberately left open when it branched only the buttons and the hat." So the
left-stick code path ALSO changed after sitting 1.

**B/back:** `nintendo.ts:263` `checkAction('back', B?.pressed, controllerIndex)`, where
`B` resolves through `nintendoFaceIndices` against the pad's reported `mapping`.
Sitting 1 observed physical A firing `altAction` and physical B firing `mainAction` —
the pre-fix shifted-index behaviour.

**Stick clicks — the whole dispatch census:** `standard.ts:24-25` and `genius.ts:27-28`
have `L3 = buttons[10]` / `R3 = buttons[11]` COMMENTED OUT; `nintendo.ts:25-26`'s LIVE
use is inside `checkGameCube`, where those indices are the GameCube D-PAD
(`checkAction('padLeft'/'padRight', ...)`), not stick clicks; `ps.ts` references
neither index. `leftClick` is DERIVED from `mainAction` at `gamepad.ts:188` only when
`shouldSimulateClick()` is true, and is never a button binding. `rightClick` is always
a FACE button. Therefore NO layout dispatches `buttons[10]`/`buttons[11]` on any
mapping.

**The indices are nonetheless known:** quick `260925-ms5` measured L3 = `buttons[10]`
and R3 = `buttons[11]` live on this pad, with a positive control. Knowing the index
does not create a dispatch path; `checkNintendo`'s stick-click comment block records
exactly that and forbids adding a `checkAction` call there without a separate,
deliberate decision.

**Dispatch gate, shared by every controller item:** `gamepad.ts:559,678` —
`window.api.gamepadAction` is dispatched ONLY from the `navigator.getGamepads()`
polling loop. No keyboard entry point into `src/preload/api/tauriGamepadInput.ts`.
</source_facts>

<receipt_check_result>
Relocation rule (3) requires the origin phase to keep a receipt naming this phase and
the item ID. **The receipt EXISTS and DOES name these IDs**, so the expected edit is
well-defined — nothing has to be invented.

In
`.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md`,
`human_verification_relocated`, third entry (around lines 77-84):

- `test:` "Gamepad — connect a controller, navigate /console routes with d-pad/left
  stick (all 4 directions), Tab/Shift+Tab, B/back, right stick (scroll), stick clicks"
- `moved_as:` `"38-C01, 38-C02, 38-C03, 38-C04 (SPLIT into four)"`
- `was_uat_item:` `"7"`
- plus `split_reason:`, which enumerates the four branch boundaries, and
  `cannot_be_discharged_at_a_keyboard:`, which points at `38-C03`.

`moved_as` is the field that goes stale: after this change the split is into SIX, not
four. `split_reason`'s closing enumeration ("directional focus incl. cold-start
Up/Left (WR-02/WR-03), right-stick scroll sign, Tab/Shift+Tab, and B/back + stick
clicks") describes the four ORIGINAL boundaries, and is what this change re-cuts.
</receipt_check_result>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Split 38-C01 and 38-C04 in the Phase 38 ledger, and repoint every reference the split invalidates</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <action>
Edit `human_verification` in place. Do not reorder entries, and do not touch
`human_verification_retired` or `human_verification_discharged`.

**1a. Replace the `38-C01` entry with two entries, AT ITS CURRENT POSITION** (between
`38-W06` and `38-C02`; d-pad half first, then left-stick half). The parent entry is
deleted, not kept. Both halves carry the full field set used by the surrounding
entries: `id`, `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`,
`origin_phase`, `origin_item`, `prior_state`.

`38-C01a` — the D-PAD half. `test` names the d-pad ONLY, driving the /console routes in
all four directions. `expected` keeps the parent's cold-start Up/Left clause (broken as
WR-02/WR-03, fixed unit-only during code review, never observed live) and states there
must be no wrap. `why_human` and `blocked_by` follow the surrounding controller items
(physical controller required; the cost is the pairing, not the hardware).
`platform_gate` states the shared dispatch gate (`gamepad.ts:559,678`) AND the branch
this half actually arms: on a pad reporting `mapping: ''`, `nintendo.ts:297-301`
dispatches `padUp`/`padDown`/`padLeft`/`padRight` from
`nintendoHatDirection(axes[NON_STANDARD_HAT_AXIS])` (`:183`, helper at `:201`), which is
a DIFFERENT branch from the standard-mapping `buttons[12-15]` path at `:277-280`.
`origin_phase` stays `"34.1"`; `origin_item` records the lineage, e.g.
`"7 (split); re-split from 38-C01 by quick 260925-nxt"`. `prior_state` must be honest
and must NOT carry the FAIL forward as a result: sitting 1 (2026-09-23) observed the
d-pad producing NO response at all, because the pad reports the d-pad as a hat axis
while the then-current `checkNintendo` read `buttons[12-15]` — that observation was made
against code that HAS SINCE CHANGED (the hat branch now exists), so it is SUPERSEDED and
this half must be re-run from scratch. The d-pad half is now EXPECTED to pass;
expectation is not observation, and no result is claimed here.

`38-C01b` — the LEFT-STICK half. `test` names the left stick ONLY, all four directions.
`expected` mirrors the parent's no-wrap and cold-start clause for the stick.
`platform_gate` states the shared dispatch gate plus the fact that the stick AXIS READ
is itself mapping-dependent on this pad. `prior_state` must record TWO things and
conflate neither: (i) sitting 1 observed focus moving in all four directions from the
left stick, but that observation is NOT DISCHARGEABLE, because it was made while the
item was COMPOUNDED with the d-pad half and a compound item resolves to a single
pass/fail (relocation rule 4) — there was no half-item to record it against; (ii) the
stick axis read has ALSO changed since that sitting (quick `260925-9de` made
`checkNintendo` resolve the stick axes from the reported mapping, closing a gap
`260923-qe5` left open when it branched only the buttons and the hat), so the
observation predates the current code on this half too. Re-run required.

**1b. Replace the `38-C04` entry with two entries, AT ITS CURRENT POSITION** (between
`38-C03` and `38-C05`; B/back half first, then stick-click half).

`38-C04a` — the B/BACK half, scoreable in this sitting. `test` names B/back navigation
only. `expected`: pressing the button PRINTED B navigates back. `platform_gate`: shared
dispatch gate plus `nintendo.ts:263` (`checkAction('back', B?.pressed, ...)`, with `B`
resolved through `nintendoFaceIndices` against the pad's reported `mapping`).
`prior_state`: sitting 1 found this UNSCOREABLE — the pad's face indices arrived as raw
HID `[Y, B, A, X]`, so physical A fired `altAction` while the hint bar read "A: Game
details" and physical B fired `mainAction`; recording a pass or fail then would have
baked the pad defect into the item. That defect is FIXED (quicks `260923-qe5`,
`260925-9de`, `260925-m5i`, `260925-ms5` — the mapping is now READ, not assumed, and
actions bind to the PRINTED LABEL). Expected to pass; not observed; re-run required.

`38-C04b` — the STICK-CLICK half. **This item STAYS OPEN in `human_verification`.** It
is NOT retired and does NOT go in `human_verification_retired`. Per the user's locked
decision it is kept visible as an UNMET EXPECTATION rather than dropped out of
`audit-uat`. `test` names left/right stick clicks (L3/R3) activating the element under
focus or cursor. `expected` states the expectation AND states plainly that no code path
delivers it today, so the item is open as an unmet expectation rather than as a pending
observation. `why_human` states that a human pressing a stick click cannot resolve this
today, because there is nothing to observe. `blocked_by` must name a **FEATURE DECISION,
not a hardware or machine-switch cost**: no layout in this repo dispatches
`buttons[10]`/`buttons[11]` to any action on any mapping, so there is nothing for an
operator to press; deciding what action a stick click should produce and wiring it into
every layout is an unscoped feature addition nobody has made. `platform_gate` must be a
SOURCE-LEVEL expression per relocation rule (2), never a prose blocker — give the full
census from `<source_facts>` above (`standard.ts:24-25` and `genius.ts:27-28` commented
out; `nintendo.ts:25-26` live only inside `checkGameCube`, where those indices are the
GameCube D-PAD; `ps.ts` has neither; `leftClick` derived from `mainAction` at
`gamepad.ts:188` and never a button binding; `rightClick` always a face button) — and
make it FALSIFIABLE: if any layout gains a `checkAction` call on those indices, this
item becomes observable and must be re-scoped. `prior_state` records the chain: sitting
1 unscoreable for shifted indices; quick `260925-ms5` then MEASURED L3 = 10 and R3 = 11
live with a positive control; that measurement did NOT make the item dischargeable,
because knowing an index does not create a dispatch to attach it to; the standing source
finding is
`.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.

Add one extra named field to `38-C04b` — call it `not_a_deferral_cost` — stating that
this item's `blocked_by` deliberately breaks the pattern the frontmatter's
`deferral_note` describes, and naming `38-E01`/`38-E02` as the existing precedent (both
read "no implementation exists yet -- this is an implementation task before it is a
verification task"). Without this, a reader trusting `deferral_note` would read the
value as a switching cost and go looking for a controller.

**1c. Repoint the LIVE cross-references to the now-nonexistent `38-C01`.** These are
dangling as of this edit:

- `38-C02` `platform_gate`: "... — see 38-C01."
- `38-C03` `platform_gate`: "... — see 38-C01."
- `38-C05` `platform_gate`: "... — see 38-C01."
- `38-C05` `scope_note`: "... THE SAME unmeasured surface as 38-C01..C04 ..."
- `38-C06` `platform_gate`: "... the same gate as 38-C01..C05 ..."
- `38-C06` `scope_note`: "Run in the same sitting as 38-C01..C05 -- one controller
  discharges all six"
- `38-C08` `scope_note`: "... one controller discharges all SEVEN surviving controller
  items (38-C01..C06 plus this one)."

Repoint each to `38-C01a` (or to the post-split range) and correct the counts: there are
now NINE open controller items (`38-C01a`, `38-C01b`, `38-C02`, `38-C03`, `38-C04a`,
`38-C04b`, `38-C05`, `38-C06`, `38-C08`), of which **eight** are dischargeable in a
controller sitting — `38-C04b` is not, for the reason above. Say so wherever a count is
quoted, so the sitting's operator is not hunting a ninth result.

**1d. Leave the FROZEN records verbatim.** Do NOT rewrite the `sitting_1_2026_09_23`
fields on `38-C03` and `38-C08` (which reference `38-C01`/`38-C04`), and do NOT touch
the `human_verification_retired` array (`38-C07`'s `platform_gate` reads "Same gate as
38-C01..C06"). Those record what was true when they were written; the new halves name
their parent in `origin_item`, which is the reader's path back. State this decision in
SUMMARY.md so it reads as deliberate rather than missed.

**1e. Update the frontmatter narrative fields.**

- `score:` — follow the file's own established pattern. It currently opens "23 relocated
  items OPEN, 2 discharged ..., 9 retired". Make it 25 OPEN and prepend a dated note:
  quick `260925-nxt` SPLIT `38-C01` into `38-C01a`/`38-C01b` and `38-C04` into
  `38-C04a`/`38-C04b` per relocation rule (4). This is NOT a discharge, NOT a pass and
  NOT a new item — nothing was observed; two compound items became four scoreable ones.
  Include the tool confirmation exactly as the file does for prior edits: `audit-uat`
  moved 23 -> 25 and 48 -> 50, which is the check that the array still parses; a FLAT
  count after an insert would mean an item was silently dropped.
- `deferral_note:` — append a bounded amendment. It currently asserts that as of
  2026-09-01 EVERY `blocked_by` value states a deferral COST. That is now false for
  `38-C04b`, and was already false for `38-E01`/`38-E02`. Name the three exceptions
  explicitly. Do not rewrite the rest of the note, and do NOT rename the key.
- `sweep_notes.windows_linux_dependency:` — it says "The eight controller items do not".
  That was already stale after `38-C07`'s retirement (seven) and is now nine. Correct
  the count and note that eight of the nine are dischargeable in one sitting.

Leave `status: human_needed`, `verified: null`, `audit_tool_note`, `purpose`,
`relocation_rules` and `created` untouched.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && gsd-sdk query audit-uat | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);const p=d.results.find(r=>r.phase==='38');if(!p){console.error('FAIL: phase 38 absent from audit -- the file stopped parsing or status changed');process.exit(1)}if(p.items.length!==25){console.error('FAIL: phase 38 items='+p.items.length+', expected 25');process.exit(1)}if(d.summary.total_items!==50){console.error('FAIL: total_items='+d.summary.total_items+', expected 50');process.exit(1)}console.log('OK: audit sees phase 38 with 25 items, 50 total')})"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && node -e "const fs=require('fs');const F='.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md';const t=fs.readFileSync(F,'utf8');const fm=t.split(/^---$/m)[1];const fail=m=>{console.error('FAIL: '+m);process.exit(1)};if(!/^status: human_needed$/m.test(fm))fail('status is not human_needed');for(const id of ['38-C01','38-C04']){if(t.includes('id: \"'+id+'\"'))fail('parent '+id+' is still present as an id')}const iOpen=fm.indexOf('human_verification:'),iRet=fm.indexOf('human_verification_retired:'),iDis=fm.indexOf('human_verification_discharged:');if(iOpen<0||iRet<0||iDis<0)fail('one of the three arrays is missing');const open=fm.slice(iOpen,iRet),ret=fm.slice(iRet,iDis),dis=fm.slice(iDis);const halves=['38-C01a','38-C01b','38-C04a','38-C04b'];const req=['test:','expected:','why_human:','blocked_by:','platform_gate:','origin_phase:','origin_item:','prior_state:'];for(const id of halves){const n=(t.match(new RegExp('id: \"'+id+'\"','g'))||[]).length;if(n!==1)fail(id+' appears '+n+' times as an id, expected 1');const i=open.indexOf('id: \"'+id+'\"');if(i<0)fail(id+' is not in the OPEN array');if(ret.includes(id))fail(id+' leaked into human_verification_retired');if(dis.includes(id))fail(id+' is in human_verification_discharged -- nothing was observed');const nx=open.indexOf('  - id:',i+5);const blk=open.slice(i,nx===-1?undefined:nx);for(const f of req){if(!blk.includes(f))fail(id+' is missing the '+f+' field')}}const body=t.split(/^---$/m).slice(1).join('---');const dangling=body.split('\n').filter(l=>!l.trim().startsWith('#')).filter(l=>/see 38-C01\./.test(l)).length;if(dangling)fail(dangling+' dangling \'see 38-C01.\' cross-reference(s) remain');console.log('OK: parents gone, four halves present and fully shaped, dispositions correct, no dangling refs')"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && git status --porcelain -- src/ | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{if(s.trim()){console.error('FAIL: this plan must not touch src/');process.exit(1)}console.log('OK: no src/ changes')})"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx prettier --check ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && pnpm planning-gates</automated>
  </verify>
  <done>
`38-C01` and `38-C04` no longer exist as ids. `38-C01a`, `38-C01b`, `38-C04a` and
`38-C04b` sit at their parents' array positions with the full field set, no existing
entry has moved, `status` is still `human_needed`, `38-C04b` is OPEN (not retired, not
discharged), `audit-uat` reports 25 items for phase 38 and 50 total, no dangling
`see 38-C01.` reference survives, nothing under `src/` changed, prettier is clean on the
written path, and `pnpm planning-gates` passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Phase 34.1's relocation receipt and the Phase 38 narrative to match the post-split ledger</name>
  <files>.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md</files>
  <action>
**2a. `34.1-VERIFICATION.md` — the two-way receipt (relocation rule 3).** Edit the third
entry of `human_verification_relocated` (the gamepad one, `was_uat_item: "7"`), found
around lines 77-84. See `<receipt_check_result>` for its verified current content.

- `moved_as:` change `"38-C01, 38-C02, 38-C03, 38-C04 (SPLIT into four)"` to name the
  post-split set: `38-C01a`, `38-C01b`, `38-C02`, `38-C03`, `38-C04a`, `38-C04b` — SPLIT
  into six. Keep the same one-line shape the field already has.
- `split_reason:` extend it (do not rewrite the existing text, which explains WHY
  compound items are forbidden and is still correct). Append a dated note: on 2026-09-25,
  quick `260925-nxt` re-cut two of the four original boundaries, because both proved
  compound in practice at the first sitting. `38-C01` named the d-pad AND the left stick
  and the two halves measured to OPPOSITE results (stick moved focus, d-pad dead) —
  exactly the failure mode this field already describes. `38-C04` named B/back AND stick
  clicks, and the stick-click clause turned out to describe a dispatch that does not
  exist in any layout, so its two halves are not merely separable but have entirely
  different dispositions: `38-C04a` is scoreable at the next sitting, `38-C04b` is open
  as an unmet expectation pending a feature decision.
- Do NOT touch `cannot_be_discharged_at_a_keyboard` (it points at `38-C03`, which is
  unchanged), `test`, `moved_to`, `moved_on`, `platform_gate` or `was_uat_item`.
- Do NOT change 34.1's `status`, its `human_verification: []`, or anything in
  `human_verification_resolved`. That phase's own audit posture must not move.

**2b. `38-HUMAN-UAT.md` — the narrative.** Two edits, and a hard prohibition.

PROHIBITION: record NO result for any item. No sitting has happened. Do not add a
session block. Do not write PASS, FAIL, or "expected to pass" as though it were an
outcome.

Edit 1 — the "Disposition of the seven surviving controller items" list (line ~109).
Retitle it for the post-split count (nine items, eight of them dischargeable in one
sitting) and rewrite the bullets so they match the ledger:

- `38-C01a` (d-pad) and `38-C01b` (left stick) — the split is DONE at the ledger, not
  merely "must be split". Note the d-pad half's sitting-1 FAIL is superseded by the hat
  fix and the left-stick half's sitting-1 observation is not dischargeable because it was
  made while compounded. Both need a fresh run.
- `38-C03` — still unscoreable-as-of-sitting-1 wording is now WRONG: the shifted-index
  defect that made it unscoreable is fixed, so it is scoreable at the next sitting. Fix
  the bullet.
- `38-C04a` (B/back) — scoreable at the next sitting, for the same reason.
- `38-C04b` (stick clicks) — OPEN as an unmet expectation, NOT scoreable and NOT retired.
  Say plainly that no layout dispatches `buttons[10]`/`buttons[11]`, that the indices WERE
  measured (L3 = 10, R3 = 11, quick `260925-ms5`) and that measuring them did not make it
  dischargeable, and that it is deliberately kept in `human_verification` so the unmet
  expectation stays visible to `audit-uat` rather than disappearing. Point at
  `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.
- `38-C08` — unchanged in substance, but its sitting-1 reason (a) "shifted indices" is now
  fixed; reason (2), the caret being ~90% dead to a pointer, was ALSO fixed (the
  install-caret todo is in `todos/completed/`). Say which of its two blockers survive
  rather than leaving the old two-reason text standing.
- `38-C02`, `38-C05`, `38-C06` — still scoreable, unchanged.

Edit 2 — the "CONTROLLER LEG NOT RUN" paragraph immediately above it (line ~100). It
presently reads as a live blocker ("the reason is a defect, not an absence of hardware").
Record that the blocking defect is FIXED: `checkNintendo` now READS the reported
`mapping` instead of assuming standard positions, the d-pad hat axis is handled
(`nintendoHatDirection`, `axes[9]`), the stick axes are resolved from the mapping too,
and actions bind to the PRINTED LABEL — landed across quicks `260923-qe5`,
`260925-9de`, `260925-m5i` and `260925-ms5`. Name the other three sitting-1 defects
(install caret, library card art, `isWritable_windows`) as resolved and in
`.planning/todos/completed/`. Keep the paragraph's measured detail about what was OBSERVED
on 2026-09-23 — that is the historical record and stays. Frame the fix as "the leg is now
runnable", not as a result.

Also update the frontmatter `updated:` field to `2026-09-25`, and leave
`status: not_started` and `sessions: []` alone — no sitting has happened.

Leave the `## Scope`, `## Retired` and `## Before the controller sitting` sections alone
except where they name `38-C01`: `## Scope` says "**38-C01 … 38-C05** need only a game
controller" — repoint that range to the post-split ids. Do not rewrite those sections
otherwise.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && node -e "const fs=require('fs');const fail=m=>{console.error('FAIL: '+m);process.exit(1)};const R='.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md';const r=fs.readFileSync(R,'utf8');const i=r.indexOf('human_verification_relocated:'),j=r.indexOf('human_verification_resolved:');if(i<0||j<0)fail('34.1 relocation/resolved arrays not found');const rel=r.slice(i,j);for(const id of ['38-C01a','38-C01b','38-C04a','38-C04b','38-C02','38-C03']){if(!rel.includes(id))fail('34.1 receipt does not name '+id)}if(/moved_as:[^\n]*\"?38-C01,/.test(rel))fail('34.1 receipt still names the pre-split 38-C01 in moved_as');if(!/^human_verification: \[\]$/m.test(r))fail('34.1 human_verification is no longer empty');const U='.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md';const u=fs.readFileSync(U,'utf8');for(const id of ['38-C01a','38-C01b','38-C04a','38-C04b']){if(!u.includes(id))fail('38-HUMAN-UAT.md does not name '+id)}if(!/^status: not_started$/m.test(u))fail('38-HUMAN-UAT.md status changed -- no sitting has happened');if(!/^sessions: \[\]$/m.test(u))fail('38-HUMAN-UAT.md sessions is no longer empty');const body=u.slice(u.indexOf('## Results'));if(/Session 3|Sitting 3/i.test(body))fail('a new session block was added -- no sitting has happened');console.log('OK: receipt repointed, narrative names the post-split ids, no result recorded')"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx prettier --check ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md" ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && pnpm planning-gates</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && gsd-sdk query audit-uat | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);const p=d.results.find(r=>r.phase==='38');if(!p||p.items.length!==25){console.error('FAIL: phase 38 item count moved -- expected 25');process.exit(1)}console.log('OK: phase 38 still 25 items after the narrative edits')})"</automated>
  </verify>
  <done>
34.1's gamepad `human_verification_relocated` receipt names all six post-split IDs and no
longer names the pre-split `38-C01`/`38-C04` in `moved_as`; 34.1's own `human_verification`
is still `[]`. `38-HUMAN-UAT.md`'s disposition list and controller-leg paragraph match the
post-split ledger and record the blocking defect as fixed, with `status: not_started`,
`sessions: []`, and no session block or result added. Prettier is clean on both written
paths, `pnpm planning-gates` passes, and phase 38 still audits at 25 items.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary                                     | Description                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| planning documents -> `gsd-sdk query audit-uat` | A malformed or mis-statused frontmatter block silently yields zero items; the project's whole deferred-hardware backlog disappears. |
| planning documents -> the human operator     | A ledger entry that misstates what is scoreable sends an operator to press a button that dispatches nothing.                        |

## STRIDE Threat Register

| Threat ID  | Category           | Component                        | Disposition | Mitigation Plan                                                                                                                                       |
| ---------- | ------------------ | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-38N-01   | Denial of Service  | `38-VERIFICATION.md` frontmatter | mitigate    | Verify asserts `status: human_needed` AND an exact post-edit item count of 25/50 via `audit-uat`. A flat or zero count fails the task.                 |
| T-38N-02   | Information Disclosure (loss) | `human_verification` array       | mitigate    | Verify asserts each half is in the OPEN array and absent from retired/discharged, so `38-C04b` cannot silently vanish from the audit.                  |
| T-38N-03   | Repudiation        | 34.1 relocation receipt          | mitigate    | Verify asserts the receipt names all six post-split ids and no longer names the pre-split set in `moved_as` — one-way relocation is how items orphan.  |
| T-38N-04   | Tampering          | `src/` application code          | mitigate    | Verify asserts `git diff --name-only -- src/` is empty. No stick-click dispatch may be added under cover of a ledger edit.                             |
| T-38N-SC   | Tampering          | npm/pip/cargo installs           | accept      | No package is installed by this plan. No `package.json` change, no lockfile change, no new dependency — so the legitimacy gate has nothing to audit.   |
</threat_model>

<verification>
Run from the repo root, after both tasks:

1. `gsd-sdk query audit-uat` — phase 38 reports **25** items (was 23) and
   `summary.total_items` is **50** (was 48). This is simultaneously the parse proof and
   the did-the-edit-register proof.
2. `npx prettier --check` over the three exact written paths (explicit paths, never a
   bare `.`).
3. `pnpm planning-gates` — includes `.planning/uat-visibility-gate.py` and the todo
   frontmatter gate.
4. `git status --porcelain` — the only modified files are the three in
   `files_modified`. `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`
   is NOT modified: that todo states it does not edit the Phase 38 files and that the
   operator re-scores separately, so leaving it in `pending/` is the correct outcome. Its
   `severity:`/`platform:`/`ready:` frontmatter is therefore untouched by construction.
</verification>

<success_criteria>
- Phase 38 audits at 25 items, project total 50, with `status: human_needed` intact.
- `38-C01` and `38-C04` are gone as ids; `38-C01a`, `38-C01b`, `38-C04a`, `38-C04b` each
  carry the full nine-field shape at their parents' array positions.
- No existing entry moved; no entry reached `human_verification_discharged`.
- `38-C04b` is OPEN, with a `blocked_by` naming a feature decision and a source-level,
  falsifiable `platform_gate`.
- 34.1's relocation receipt names the post-split IDs.
- `38-HUMAN-UAT.md`'s narrative matches the ledger, records the controller leg's blocking
  defect as fixed, and records no result.
- No `src/` change. `npx prettier --check` clean on all three written paths.
  `pnpm planning-gates` passes.
</success_criteria>

<output>
Create `.planning/quick/260925-nxt-split-compound-uat-item-38-c01-and-resol/260925-nxt-SUMMARY.md` when done.

Record in it: the before/after audit counts as measured at the tool (not asserted), the
exact array positions the four halves occupy, the deliberate decision to leave the
`sitting_1_2026_09_23` fields and the `human_verification_retired` array frozen, and the
fact that `38-C04b` is open rather than retired together with the reason the user chose.
</output>
