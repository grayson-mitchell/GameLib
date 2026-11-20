---
phase: quick-260928-upj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py
autonomous: true
requirements:
  - QUICK-260928-UPJ
estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "The positioning todo records option (a), a GTK-box-native Linux layout, as DECIDED by the operator on 2026-09-28. It does so in a new `## Decision (2026-09-28)` section appended at the end of the file, which says why (a) was chosen and why (b), (c) and (d) were not. Every byte above that section is unchanged except the one `ready:` line. The original `## The decision (options, not a recommendation)` section survives verbatim as history."
    - "The todo's frontmatter reads `severity: minor`, then `platform: linux`, then `ready: code`, and the file stays at its `pending/` path. It stays there because the ledger cites it by that path and the layout it tracks is not built."
    - "In `38-VERIFICATION.md`, the Linux branches of `38-E03` and `38-E04` name the decided strategy and the unbuilt layout as their gate, plus the still-open Linux isolation todo. Nothing in either item claims that the layout is implemented, observed, verified or discharged."
    - "Every pre-change value this task replaces survives verbatim in a new dated `linux_rescoped_2026_09_28` field on its item. These are all parsed-equal to the pre-edit commit: `test:`, `expected:`, the macOS and Windows branch text, every other item, and every other top-level key. `deferral_note` changes only by an appended, dated amendment."
    - "Phase 38 stays visible to gsd-core `audit-uat`, and its open/discharged/retired counts are unchanged. `ledger-check.cjs` and `pnpm planning-gates` prove it."
    - "The todo and the ledger land in ONE commit, as the todo's own 'What this gates' section requires. That commit contains no other file except this task's checker."
  artifacts:
    - ".planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md: `ready: code` and an appended `## Decision (2026-09-28)` section"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md: re-scoped Linux branches of `38-E03`/`38-E04`, one `linux_rescoped_2026_09_28` field on each, and an appended `deferral_note` amendment"
    - ".planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py: a quick-task harness that checks both files against the pre-edit commit. It is not a CI gate."
  key_links:
    - "The `blocked_by` of `38-E03`/`38-E04` points to `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md` by full path. Moving the todo to `completed/` would silently orphan both citations."
    - "`38-VERIFICATION.md` frontmatter -> strict YAML (js-yaml 4) -> gsd-core `parseVerificationItems` -> `audit-uat by_phase['38']`. One unescaped quote in a new field silently drops the whole phase from the audit. This already happened once: the break landed on 2026-09-23 and was found on 2026-09-28."
    - "The todo's `## Decision (2026-09-28)` section links to the ledger's `linux_rescoped_2026_09_28` fields and its `deferral_note` amendment. Both sides cite quick `260928-upj` and `option (a)`, so either one can be found from the other."
---

<objective>
Record the operator's LOCKED decision on the Linux `add_child` store-embed positioning todo:
**option (a), a GTK-box-native layout** that works WITH Tauri's `GtkBox` packing instead of
fighting it. Then re-scope the Linux branches of Phase 38 ledger items `38-E03`/`38-E04` in
`38-VERIFICATION.md` in the same change, as the todo's own "What this gates" section requires.
Finally, move the todo's `ready:` off `human`.

The operator was asked directly and chose (a). That choice is final. Do not re-litigate it, and do
not present (a) as still open anywhere.

Purpose: the todo was `ready: human` only because nobody had picked a Linux layout strategy. Now
one has been picked. The ledger's Linux branches still say they wait on that choice, so they are
stale, and the remaining gap is an unbuilt layout rather than a decision.

Output: an appended `## Decision (2026-09-28)` section and `ready: code` on the todo, re-scoped
Linux branches on two ledger items with the pre-change text preserved verbatim, an appended
`deferral_note` amendment, and a checker harness that proves all of it against the pre-edit
commit.

Scope boundary: this is a documentation and decision-recording task only. It touches no file
under `src/`, `src-tauri/` or `meta/`, and no `package.json`. The GTK-box-native layout itself is
work for whichever phase builds the Linux store tab. `38-E03`/`38-E04` are NOT implemented, NOT
verified and NOT discharged by this task. Only the layout STRATEGY is decided.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
@.planning/spikes/026-linux-add-child-runtime/README.md

Do NOT @-load `38-VERIFICATION.md` whole. Its `score:` line alone is about 12k characters. Read
only the line ranges each task's `<read_first>` names.

<planning_observations>
Everything below was observed live at planning time on 2026-09-28. It is the authority for this
plan's `files` and `verify` scope, per MUTABLE-SCOPE (#3786).

- **The ledger is one file.** Grepping the whole `.planning/` tree for `38-E03`/`38-E04` and for
  this todo's filename finds exactly one ledger:
  `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`.
  `38-E03` spans lines 102-111 and `38-E04` spans lines 112-121. `deferral_note` is the single
  physical line 8, a single-quoted YAML scalar. The todo is cited at line 107 (`38-E03`
  `blocked_by`), line 116 (`38-E04` `why_human`) and line 117 (`38-E04` `blocked_by`).
- **Other hits are narrative, not ledger, and are deliberately NOT edited.**
  - `.planning/ROADMAP.md:4648` is a paragraph dated "as of 2026-09-28".
  - `38-HUMAN-UAT.md` around line 680 is dated sitting narrative. Its own text says
    `38-VERIFICATION.md is authoritative`.
  - `40-VERIFICATION.md:108` says the layout-strategy decision "is filed as a todo". That is
    still true.
  - The rest are quick-task and spike history.
  - The todo's "What this gates" section names only `38-VERIFICATION.md`.
- **Split markers, counted per field.**
  - Line 107 (`38-E03` `blocked_by`) contains `(c) ` TWICE: `(c) Linux HiDPI:` and the final
    sentence `Branch (c) is the deliberate exception recorded in` followed by `` `deferral_note`. ``.
    The unique marker is therefore `(c) Linux`.
  - Line 117 (`38-E04` `blocked_by`) contains `(c) Linux:` once.
  - Lines 108, 116 and 118 (`platform_gate`, `why_human`, `platform_gate`) each contain the
    literal `Linux: ` exactly once.
- **Counts and visibility.** `ledger-check.cjs --open 10 --discharged 16 --retired 10
  --no-stale-premise` passes. gsd-core `audit-uat` reports `by_phase['38']` = 10 and
  `parse_gap_files` = 0. `pnpm planning-gates` reports 12/12 in about 6s.
- **Last touch.** Both files were last touched by `63cf948e2` (quick `260928-raq`).
- **Concurrent quick task.** Quick `260928-tvk` is IN FLIGHT on the current branch. Its Task 1
  is committed (`8c7b1821b`), and its PLAN is untracked in the working tree. Its unexecuted Tasks
  2-3 edit this SAME ledger to move `38-S04`, and they cite ledger line ranges 1-12, 36-47 and
  398-431. This plan edits line 8 in place and inserts exactly 2 lines, both below line 102.
  `38-S04` (lines 36-44) therefore does not move. tvk's 398-431 read still covers the `38-S02`
  entry after it shifts from 400-409 to 402-411. Counts can differ at execution time if tvk has
  landed, so no count below is hard-coded. They are read from the pre-edit commit.
- **Prettier.** `npx prettier --file-info` on both edited paths reports
  `{ "ignored": true, "inferredParser": null }`, because `.planning` is in `.prettierignore`. A
  `prettier --check` over them would print a green that matches zero files, so it is not used as
  verification here. The verify blocks assert the ignored status itself, which is the real,
  falsifiable claim.
- **Convention for `ready:` after a decision.** No precedent moves a todo to `completed/` on a
  decision alone.
  - Both `completed/` todos that carry a decision section
    (`2026-09-01-log-upload-boundary-scrub-decision.md` and
    `2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`) were closed only
    once the chosen option shipped in the same quick.
  - `ready:` moves in place in `pending/` to track the NEXT action. For example, `00bc6fa1f`
    moved a todo from `ready: code` to `ready: live-gate` once its desk work landed, and kept it
    in `pending/`.
  - Existing todos pair `platform: windows` with `ready: live-gate`. This repo therefore reads
    `ready:` relative to the machine that `platform:` names.
  - Conclusion: stay in `pending/`, `ready: human` becomes `ready: code`. The next action is
    building the layout on the Linux machine. The machine is owned and available, per the
    `purpose:` field of `38-VERIFICATION.md`.
- **ledger-check stale phrases.** `ledger-check.cjs --no-stale-premise` rejects its hard-coded
  STALE_PREMISE phrase list in any open item's `blocked_by`, `why_human` or `platform_gate`. New
  text must not say that an implementation is absent using the historical wording that list
  catches. Before writing, read the list at `ledger-check.cjs` lines 99-106.

Checkpoint declarations (none fire, for the stated reasons):
- API coverage: No external API integration: this task only edits planning markdown (a todo file
  and a phase verification ledger), plus a local checker script. The detector was run on this
  plan and returned `detected: true`, but its only signal was this declaration sentence itself.
- Assumption-delta and schema-push: these do not apply. This is a quick task with no phase
  scope, and it touches no ORM schema or migration files.
- Tracer-first: Task 1 is the tracer. It carries one ledger item end-to-end: todo decision ->
  ledger citation -> strict-YAML readers -> live `audit-uat`. Task 2 then expands that to the
  second item and `deferral_note`. The tracer's commit is deliberately deferred to Task 2,
  because the todo's own "What this gates" section requires the ledger re-scope to land "in the
  same change" as the decision. This mirrors quick `260928-raq`, whose single commit `63cf948e2`
  carried both the todos and the ledger.
</planning_observations>
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: build the checker RED, record the decision in the todo, and re-scope 38-E03's Linux branch end-to-end</name>
  <files>.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py, .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <precondition>`git diff --quiet HEAD -- .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md && git diff --cached --quiet` succeeds. That means neither file has uncommitted edits (for example from in-flight quick 260928-tvk) and nothing is staged. If it fails, HALT and report. Do not interleave with another task's uncommitted ledger edit.</precondition>
  <read_first>
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md (whole file, 75 lines)
    - .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md (whole file, 60 lines; the sibling isolation todo. Do NOT edit it.)
    - .planning/spikes/026-linux-add-child-runtime/README.md lines 100-134 (Results)
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md lines 6-8 and 102-121 only
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs lines 1-106 (usage, output convention, STALE_PREMISE list)
    - .planning/todos/todo-frontmatter-gate.py lines 1-20 (the ready vocabulary)
  </read_first>
  <action>
**Step A. Build the checker and prove it RED before any edit.**

Use the Write tool to create
`.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py`. Use Python 3
with PyYAML `safe_load`; PyYAML 5.4.1 is installed. Follow the `ledger-check.cjs` output
convention: one line per check (`PASS <check>` or `FAIL <check>: <detail>`), every check runs,
and the exit code is 1 if any check fails. Start the file with a header comment that says it is a
quick-task harness for quick 260928-upj, not a CI gate, and that nothing runs it automatically.

The checker reads the base version of each file with `git show <base>:<path>` and the live version
from disk. Paths resolve from `__file__`, not from the current directory. It extracts frontmatter
as the text between the first `---` line and the next `---` line.

CLI:
- `--base REV` (default `HEAD`).
- `--items CSV` (default `38-E03,38-E04`).
- `--deferral-note` asserts the amendment. Without it, the checker asserts that `deferral_note` is
  unchanged.
- `--print-counts` prints the three array lengths of the BASE ledger (`human_verification`,
  `human_verification_discharged`, `human_verification_retired`) as `O D R` on one line, then
  exits 0 without running any other check.

Todo checks:
1. The frontmatter holds exactly one each of `severity: minor`, `platform: linux` and
   `ready: code`. The platform line comes immediately after the severity line, and the ready
   line immediately after the platform line.
2. The base file contains exactly one line equal to `ready: human`. The live text starts with the
   base text after that single line is replaced by `ready: code`. This proves that everything
   above the appended section is byte-identical.
3. The appended suffix, after leading blank lines, begins with a line that starts
   `## Decision (2026-09-28)`. The whole file has exactly one such line and exactly one line equal
   to `## The decision (options, not a recommendation)`.
4. The suffix contains every one of these literal markers: `option (a)`, `260928-upj`, `(b)`,
   `(c)`, `(d)`, `38-E03`, `38-E04`, `38-VERIFICATION.md`, `ready: code`, `live-gate`, `UNVERIFIED`,
   `No code was written`, and `2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`.
5. No file with the todo's basename exists under `.planning/todos/completed/`.

Ledger checks (base and live both parsed):
1. Both parse to a mapping.
2. Every top-level key except `deferral_note` and `human_verification` is parsed-equal to base.
   This includes `status`, `score`, `human_verification_discharged` and
   `human_verification_retired`.
3. `human_verification` has the same ids in the same order as base.
4. Every item whose id is NOT in `--items` is parsed-equal to base.
5. For each id in `--items`:
   - The live key set equals the base key set plus `linux_rescoped_2026_09_28`.
   - Every key outside the edited set is parsed-equal to base. The edited set for `38-E03` is
     `blocked_by` and `platform_gate`. For `38-E04` it is `why_human`, `blocked_by` and
     `platform_gate`. This covers `test`, `expected` and `regated_2026_09_28`, which must stay
     equal.
6. For each id in `--items`, `linux_rescoped_2026_09_28` is a string containing `260928-upj`,
   `option (a)` and `NOT a discharge`, and it contains each edited field's BASE value verbatim as
   a substring.
7. In the raw live text, each new field's physical line immediately follows that item's
   `regated_2026_09_28` line.
8. Split each edited field at its marker: `(c) Linux` for `blocked_by`, and `Linux: ` for
   `why_human`/`platform_gate`. The base value must contain the marker exactly once. Then:
   - The live text before the marker equals the base text before it. This keeps the macOS and
     Windows branches untouched.
   - The live Linux segment (from the marker on) differs from the base Linux segment.
   - The live Linux segment contains `option (a)`.
   - The live Linux segment contains none of these pending-decision phrases, checked
     case-insensitively: `decision in `, `decision lands`, `positioning decision`, `is resolved`,
     `until it lands`. This negative check is scoped to the live values of those three fields
     only. The new dated field legitimately quotes the old wording and is never scanned.
9. Every live `blocked_by` in `--items` contains both todo paths in full:
   `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`
   and `.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`.
   The live `38-E03` `blocked_by` still ends with the base's final sentence verbatim (`Branch (c)
   is the deliberate exception recorded in` followed by `` `deferral_note`. ``). Each live
   `platform_gate` still ends with its base's final sentence verbatim: the text from the last
   occurrence of `macOS ` to the end.
10. `deferral_note`: with `--deferral-note`, the live value starts with the base value and the
    appended remainder contains `260928-upj` and `option (a)`. Without the flag, it equals base.
11. The live ledger's physical line count equals the base count plus the number of ids in
    `--items`.

Run it before touching either file:
`python3 .planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py --items 38-E03`.
It MUST exit 1, and it must FAIL at least the todo frontmatter, decision-section,
`38-E03` rescope-field and line-count checks. Keep that output for the SUMMARY as the negative
control. A checker that is green on the unedited tree proves nothing, so if it passes, fix the
checker before going on.

**Step B. Record the decision in the todo, per the LOCKED operator choice (a).**

In the frontmatter, change ONLY the line `ready: human` to `ready: code`. Leave `severity: minor`,
`platform: linux`, the title and every other key byte-for-byte as they are.

Leave the whole body exactly as it is, including `## The decision (options, not a
recommendation)`, which stays as the historical record. Then APPEND, after the existing
`## Falsifiable re-open` section, a blank line and a new section headed
`## Decision (2026-09-28): option (a), a GTK-box-native layout`. Hand-match the surrounding wrap
of about 100 columns. The section states each of the following:

- **Who decided.** The operator decided this directly on 2026-09-28, and quick `260928-upj`
  recorded it. It is final.
- **Why (a).** It is the lowest-risk option. It carries no upstream fork or patch. It has no
  exposure to the unexplained native crash. It ships a real, if less flexible, Linux embed
  instead of none.
- **Why not (b).** A `tauri-runtime-wry` change, upstream or forked, would have to be carried
  through every Tauri upgrade, with no guarantee upstream accepts it.
- **Why not (c).** The second-`Window` shape segfaulted natively in 2 of 2 runs and has no root
  cause. The standing "do not choose (c) until the crash is understood" constraint above still
  applies.
- **Why not (d).** It leaves Linux with no store embed at all. That runs against the project's
  one-launcher core value.
- **What this decides.** Only the strategy.
- **What it does not decide.** The concrete layout shape: orientation, how the main webview and
  the embed divide the shared `GtkBox`, and what share of the window each gets. That is design
  work for whichever phase builds the Linux store tab.
- **An UNVERIFIED question to record.** Spike 026 measured GTK's default even split (both
  webviews at 1280x450). Can anything other than that split be reached through the platform
  widget handle, for example GTK packing properties or size requests, without changing
  `tauri-runtime-wry`? That question belongs to the implementing phase. If no usable layout turns
  out to be reachable within box packing, bring that back to the operator as a finding rather
  than switching to (b).
- **What does not change.** `set_bounds` stays a no-op on Linux under this strategy, by design.
  The renderer-measured slot-rect design that spike 017 validated on macOS does not apply on
  Linux. The shipped app is unchanged, because `src-tauri/Cargo.toml:114-128` still gates
  `unstable` to macOS. The `## Falsifiable re-open` section still stands.
- **The sibling isolation todo is NOT decided here.** That is
  `.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`,
  still `ready: human`. By its own title it still gates whether a Linux embed ships at all. Its
  third option, keeping Linux off the embed, is now in tension with this decision. That call is
  the operator's, in that todo.
- **Why `ready: code`.** The human-decision gate is satisfied. What remains is buildable: design
  and build the GTK-box-native layout in `src-tauri`, and un-gate `unstable` for Linux. Include
  the sentence "No code was written by quick 260928-upj." `ready:` follows the next action, as in
  commit `00bc6fa1f`. Once the layout is built, this todo's remaining work becomes a live Linux
  run and `ready:` should move to `live-gate`.
- **Why it stays in `pending/`.** The layout it tracks is not built. The `blocked_by` fields of
  ledger items `38-E03`/`38-E04` cite this file by its `pending/` path. The two `completed/`
  precedents with a recorded decision closed only once the chosen option had shipped.
- **Same-change note.** The Linux branches of `38-E03`/`38-E04` in `38-VERIFICATION.md` were
  re-scoped in the same commit, in fields named `linux_rescoped_2026_09_28`, together with a dated
  `deferral_note` amendment.

Do not end the file with any stray XML-style closing tag; `pnpm planning-gates` has an
envelope-tag gate.

**Step C. Re-scope ONLY `38-E03`'s Linux branch in `38-VERIFICATION.md`.** This is the tracer
slice. `38-E04` and `deferral_note` wait for Task 2.

Insert ONE new physical line immediately after `38-E03`'s `regated_2026_09_28` line (line 103):
the key `linux_rescoped_2026_09_28` with a double-quoted scalar at 4-space indent, in the same
shape as `regated_2026_09_28`. Its content:

- The Linux branch was re-scoped on 2026-09-28 by quick `260928-upj`. The operator DECIDED the
  Linux layout strategy as option (a), a GTK-box-native layout, recorded in the positioning
  todo's `## Decision (2026-09-28)` section.
- The words `NOT a discharge`, and the statement that it is not a pass or a partial pass: no
  Linux layout code exists, and nothing was built, run or observed.
- Branch (c)'s gate moved from an open design choice to an unbuilt layout, plus the still-open
  Linux isolation todo.
- `set_bounds` stays a no-op on Linux, so this branch will be scored against whatever region the
  GTK-box-native layout allocates the embed, not against a renderer-measured slot rect. Its
  concrete pass criteria are re-derived from the layout actually built, at sitting time, which
  is the same principle as `sweep_notes.re_derive_before_running`.
- Branches (a) and (b), `test:` and `expected:` are unchanged. `test:` prose is the only join
  key back from `audit-uat` output, per `audit_tool_note`.
- The pre-change `blocked_by` and `platform_gate` values, each introduced as "read verbatim:" and
  wrapped in escaped double quotes, exactly as `regated_2026_09_28` does.

Then rewrite ONLY the Linux segment of `38-E03`'s two fields.

`blocked_by`: replace the text from `(c) Linux HiDPI:` up to, but not including, the final
`Branch (c) is the deliberate exception...` sentence. The new segment:
- starts with `(c) Linux HiDPI:` and says it is NOT a cost and no longer an open choice;
- says the layout strategy is decided (option (a), GTK-box-native, 2026-09-28, quick
  `260928-upj`);
- says the branch is blocked on building that layout, and on `unstable` being un-gated for Linux,
  because there is no Linux embed to scale until then;
- names both todo paths in full: the positioning todo, which tracks the layout, and the isolation
  todo, which by its own title gates whether a Linux embed ships.

Keep the final sentence verbatim.

`platform_gate`: rewrite the text after `Linux: `. Keep citing
`tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192` and `wry-0.57.0/src/webkitgtk/mod.rs:963-983`.
Say that both still hold, and that under the decided option (a) they are the layout's premise
rather than its blocker. Say that the branch runs against the region the GTK-box-native layout
allocates, once it is built. Keep the final sentence `macOS display variety is orthogonal and
testable today.` verbatim.

Do not edit `test:`, `expected:` or any other field or item.

YAML safety: inside double-quoted scalars, the only backslash allowed is `\"`, and every inner
double quote must be written that way. Each value stays on one physical line. Do not use the
ledger-check STALE_PREMISE wording. Run `ledger-check.cjs` immediately after the edit, before
anything else. It prints the parser's line and column on a break.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && python3 $Q/upj-check.py --items 38-E03 && python3 .planning/todos/todo-frontmatter-gate.py && read O D R < <(python3 $Q/upj-check.py --print-counts) && node $L --open "$O" --discharged "$D" --retired "$R" --no-stale-premise --includes 'open:38-E03:linux_rescoped_2026_09_28=260928-upj' --includes 'open:38-E03:blocked_by=option (a)'</automated>
    Prettier is deliberately NOT run. Both edited paths are in `.prettierignore`, so `--check` would be vacuous. Task 2's verify asserts the ignored status instead of pretending to format-check.
  </verify>
  <done>
    - The checker exited 1 against the unedited tree, and its FAIL lines are saved for the
      SUMMARY.
    - It now exits 0 with `--items 38-E03`. That includes the `38-E04`-unchanged and
      `deferral_note`-unchanged checks, which run because neither id nor flag is passed yet.
    - The todo gate exits 0.
    - `ledger-check.cjs` passes: the counts equal the pre-edit counts, `audit-uat
      by_phase['38']` is unchanged, `parse_gap_files` is 0, and `--no-stale-premise` passes.
    - Nothing is committed yet. Per the todo's same-change instruction, Task 2 commits.
  </done>
</task>

<task type="auto">
  <name>Task 2: Expand: re-scope 38-E04's Linux branch, amend deferral_note, prove the whole ledger, and commit both files as one change</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <read_first>
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md lines 8 and 103-123 only (38-E03 now ends one line later, and 38-E04 starts at 113)
    - The Task 1 `38-E03` edit and the todo's new `## Decision (2026-09-28)` section, so that the wording matches
  </read_first>
  <action>
**Step A. Re-scope `38-E04`'s Linux branch the same way as `38-E03`.**

Insert ONE new physical line immediately after `38-E04`'s `regated_2026_09_28` line:
`linux_rescoped_2026_09_28`, a double-quoted scalar at 4-space indent. It carries the same
elements as `38-E03`'s field:
- quick `260928-upj`;
- option (a) DECIDED by the operator;
- the words `NOT a discharge`, and that nothing was built, run or observed;
- a note that `test:` and `expected:` are unchanged. Also say that on Linux, `expected:`'s "once
  those backends exist" clause now reads as "once the GTK-box-native layout is built".
- the pre-change `why_human`, `blocked_by` and `platform_gate` values, each introduced as "read
  verbatim:" and wrapped in escaped double quotes.

Rewrite ONLY the Linux segment of three fields.

`why_human`: replace the text from `Linux: `. The new segment says:
- the layout strategy is decided (option (a), quick `260928-upj`) but not built;
- under it, the embed's region is set by GTK box allocation, which follows a window resize
  natively rather than through a renderer-measured `set_bounds` round trip, and `set_bounds` is
  still a no-op there. Label this explicitly as GTK box-packing semantics, NOT measured, because
  spike 026 never resized the window.
- so, once that layout is built, the Linux branch measures that native reallocation for visible
  lag, tearing or stale-geometry frames.

`blocked_by`: replace the text from `(c) Linux`. The new segment says:
- the layout is decided (option (a), quick `260928-upj`);
- the branch is blocked on building that GTK-box-native layout, which is tracked in the
  positioning todo (full `pending/` path). This is the same todo that `38-E03`'s Linux branch
  names.
- it is also blocked on the isolation todo (full `pending/` path) before any Linux embed ships.

`platform_gate`: rewrite the text after `Linux: `. Keep citing
`wry-0.57.0/src/webkitgtk/mod.rs:963-983` and its `is_in_fixed_parent` gate. Say that it still
holds, and that under option (a) it is the premise rather than the blocker. Say that drag-resize
latency on Linux is measured against the GTK-box-native layout once it is built. Keep the final
sentence `macOS hardware variety is orthogonal and testable today.` verbatim.

Leave `test:`, `expected:`, `regated_2026_09_28`, `origin_*` and `prior_state` untouched.

**Step B. Amend `deferral_note`, append-only, in place on line 8.**

Keep every existing character, and append before the closing single quote a sentence starting
` AMENDED AGAIN 2026-09-28 (quick` followed by `` `260928-upj`): ``. It states:
- the operator decided the Linux layout strategy (option (a), GTK-box-native, recorded in the
  positioning todo's `## Decision (2026-09-28)` section);
- the ONE partial exception persists but changes kind. The Linux branches of `38-E03`/`38-E04`
  now name an UNBUILT layout, plus the still-open Linux isolation todo. That is neither a
  deferral cost nor an open layout choice.
- they stay in this array for the reason already given, which is that moving them would hide an
  un-run half;
- nothing was observed or discharged, and no count changed.

This is a SINGLE-quoted scalar, so double any apostrophe (`''`) or avoid apostrophes. Do not
touch `score:`, because no count moves.

**Step C. Prove the whole ledger.** Run the verify command below and fix every FAIL before
committing. The line-count check must report exactly +2 physical lines against the pre-edit
commit. Record that delta in the SUMMARY, for in-flight quick `260928-tvk`, whose PLAN cites
ledger line ranges.

**Step D. Commit both files as ONE change.**

1. Check that `git diff --cached --quiet` still succeeds, so that nothing staged gets absorbed.
2. Stage exactly the three paths with `git add --`: the todo, the ledger, and `upj-check.py`.
3. Assert that `git diff --cached --name-only` lists exactly those three and nothing else. The
   untracked `260928-tvk-PLAN.md` must stay untracked.
4. Commit with a `docs(quick-260928-upj): ...` subject. Name what it does: option (a) recorded,
   todo moved to `ready: code`, and the `38-E03`/`38-E04` Linux branches re-scoped. End with the
   attribution lines your session requires.
5. Do not use `-a`, `--only` or `--no-verify`, and do not push.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && T=.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md && V=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md && python3 $Q/upj-check.py --items 38-E03,38-E04 --deferral-note && python3 .planning/todos/todo-frontmatter-gate.py && read O D R < <(python3 $Q/upj-check.py --print-counts) && node $L --open "$O" --discharged "$D" --retired "$R" --no-stale-premise --includes 'open:38-E03:linux_rescoped_2026_09_28=260928-upj' --includes 'open:38-E04:linux_rescoped_2026_09_28=260928-upj' --includes 'open:38-E04:blocked_by=option (a)' --includes 'top:deferral_note=260928-upj' && pnpm -s planning-gates && PT=$(npx prettier --file-info $T) && PV=$(npx prettier --file-info $V) && printf '%s' "$PT" | grep -Eq '"ignored":[[:space:]]*true' && printf '%s' "$PV" | grep -Eq '"ignored":[[:space:]]*true'</automated>
    Run the command above BEFORE the commit. Its last two clauses assert that prettier IGNORES both paths, which makes the formatter check vacuous by measurement rather than skipped silently.
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat && F=$(git show --name-only --format= HEAD) && test "$(printf '%s\n' "$F" | sort | tr '\n' ' ')" = ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md .planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md " && python3 $Q/upj-check.py --base HEAD~1 --items 38-E03,38-E04 --deferral-note && test -z "$(git status --porcelain -- .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md)"</automated>
    Run the command above AFTER the commit. It checks that the commit holds exactly the three paths, that the checker is still green against the commit's own parent, and that nothing is left uncommitted on either file.
  </verify>
  <done>
    - The pre-commit verify exits 0: the checker passes with both items and `--deferral-note`,
      the todo gate passes, `ledger-check.cjs` passes with counts equal to the pre-edit counts,
      `pnpm planning-gates` reports every gate passing, and prettier reports both paths as
      ignored.
    - One commit holds exactly the todo, the ledger and `upj-check.py`, and the post-commit
      verify exits 0.
    - `38-E03`/`38-E04` are still in `human_verification` and are not discharged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

N/A. This change is planning documents only and has no attack surface. It crosses no trust
boundary, handles no input, credential or network path, and changes no shipped code.
Security-relevant STRIDE threats: none.

## Record-integrity risks (not security threats; mitigated because they have broken this repo before)

| Risk ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---------|----------|-----------|----------|-------------|-----------------|
| T-260928-upj-01 | Tampering (record integrity) | `38-VERIFICATION.md` frontmatter | medium | mitigate | `ledger-check.cjs` runs strict js-yaml, gsd-core `parseVerificationItems` and live `audit-uat` with counts read from the pre-edit commit. `upj-check.py` proves parsed equality of everything outside the six edited values. This targets the failure where one unescaped quote silently hides the whole phase. |
| T-260928-upj-02 | Repudiation (overclaim) | 38-E03/38-E04 re-scope wording | medium | mitigate | The checker requires `NOT a discharge` in each new field, keeps both items in `human_verification` (ids unchanged), and requires the todo's `No code was written` sentence. |
| T-260928-upj-03 | Tampering (commit scope) | the single commit | low | mitigate | The precondition requires an empty index. Staging is explicit, the exact three-path set is asserted before and after commit, and the untracked `260928-tvk` PLAN stays untracked. |
</threat_model>

<verification>
- Negative control: `upj-check.py` exits 1 on the unedited tree. The SUMMARY records its FAIL
  lines.
- `upj-check.py --items 38-E03,38-E04 --deferral-note` exits 0 against both `HEAD` (pre-commit)
  and `HEAD~1` (post-commit).
- `ledger-check.cjs` passes with the pre-edit counts, `--no-stale-premise`, and live `audit-uat`
  `by_phase['38']` unchanged with `parse_gap_files` 0.
- `python3 .planning/todos/todo-frontmatter-gate.py` exits 0, and `pnpm planning-gates` passes
  every gate.
- The prettier `--file-info` probe reports `"ignored": true` for both edited paths. A formatter
  check is vacuous there by measurement, so none is claimed.
- `git diff` of the commit touches nothing under `src/`, `src-tauri/`, `meta/` or `package.json`.
</verification>

<success_criteria>
- The todo carries `ready: code` and an appended `## Decision (2026-09-28): option (a), a
  GTK-box-native layout` section with the why and why-not, the UNVERIFIED even-split question,
  and the sibling-isolation tension. Its original options section is byte-identical, and it
  stays in `pending/`.
- The Linux branches of `38-E03`/`38-E04` name the decided strategy and the unbuilt layout. Their
  pre-change text survives verbatim in `linux_rescoped_2026_09_28`, and `deferral_note` is
  amended append-only. No item is discharged, and no count moves.
- Phase 38 stays visible to `audit-uat` with unchanged counts.
- One commit carries both files plus the checker.
</success_criteria>

<output>
Create `.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/260928-upj-SUMMARY.md`. It must record:
- the negative-control FAIL lines;
- the final checker, ledger-check and planning-gates outputs;
- the +2 ledger line delta and where it landed (below line 102), for in-flight quick
  `260928-tvk`;
- the prettier ignored-status probe result;
- the files deliberately NOT edited, with the reason for each: `ROADMAP.md:4648`,
  `38-HUMAN-UAT.md` around line 680, `40-VERIFICATION.md:108`, and the sibling isolation todo;
- the open tension between option (a) and the isolation todo's keep-Linux-off-the-embed option,
  as an operator call in that todo.
</output>
