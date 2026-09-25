---
phase: quick-260926-bsl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
autonomous: true
requirements: [QUICK-260926-bsl]

must_haves:
  truths:
    - "No sitting-4 label in 38-HUMAN-UAT.md (frontmatter sessions row, Current Test prose, `## Sitting 4` heading, Conditions line) claims a `tauri dev` debug build"
    - "Sitting 4 is recorded as the stale INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`), and the attribution is marked INFERRED, not measured"
    - "The basis of the inference (no recorded times/hash; the abutting commit-date windows) is stated compactly in the file, not left to the todo"
    - "An honest-limits paragraph says an unlogged instance cannot be excluded and names the `GAMELIB_SHELL_EXE received=` lines as the way to settle it"
    - "A desk-diff paragraph explains why 38-W01, 38-W02 and 38-W03 still stand, so no future reader re-runs them"
    - "The original `tauri dev` / DEBUG build claim remains visible as marked history, not silently rewritten"
    - "38-W01 PASS, 38-W02 PASS and 38-W03 FAIL-accepted are unchanged; no item block, `result:` or `expected:` line is touched"
    - "The pending todo records decision 1 as partially answered for sitting 4 and stays `ready: human`"
  artifacts:
    - path: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
      provides: "Corrected sitting-4 build label + inference basis + honest limits + desk-diff transfer note"
      contains: "f7af5438ac02bc476a76b6493394243506c98232"
    - path: ".planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md"
      provides: "Dated update answering the todo's own 'check the sitting-4 timings before re-labelling it'"
      contains: "260926-bsl"
  key_links:
    - from: "38-HUMAN-UAT.md Sitting 4 honest-limits paragraph"
      to: ".planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md"
      via: "path reference"
      pattern: "tauri-dev-silently-hands-off-to-a-stale-installed-build"
    - from: "38-HUMAN-UAT.md Sitting 4 honest-limits paragraph"
      to: ".planning/debug/resolved/mouse-dead-dropdown-disclosure.md"
      via: "path reference"
      pattern: "mouse-dead-dropdown-disclosure"
---

<objective>
Correct the Phase 38 sitting-4 build label in `38-HUMAN-UAT.md`, and close the sitting-4 half of
decision 1 in the pending stale-install todo. Docs only; no source changes.

Sitting 4 records "Windows 11, `tauri dev`, DEBUG build". It almost certainly ran the same stale
INSTALLED shell as sitting 5: `%LOCALAPPDATA%/GameLib/gamelib-shell.exe`, v0.7.0, mtime
2026-09-24 07:34, built from `5b6201e26`.

**This is the sitting-4 counterpart of quick `260926-b5r`, with one difference that the wording must
not blur.** b5r's sitting-5 attribution was MEASURED live (the running pid, its log, its bundle's
pre-`3a0e62918` `Dropdown.toggle()`). Sitting 4's is INFERRED from commit dates, because sitting 4
recorded no clock times and no commit hash at all. Every label this plan writes must carry that
distinction.

The three results stand and are not re-run: the code ranges they exercise are byte-identical
between `5b6201e26` and HEAD-at-sitting-4 `0736ec037`.

Purpose: answer decision 1 of
`.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` for
sitting 4 — as re-label, not re-run — and retire that todo's own instruction "check the sitting-4
timings before re-labelling it" with the finding that there are no timings to check.
Output: two edited files. No commit (the orchestrator commits).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/260926-b5r-correct-sitting-5-build-label-in-38-huma/260926-b5r-PLAN.md
@.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
@.planning/debug/resolved/mouse-dead-dropdown-disclosure.md

Target file: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`
(603 lines). Read only these regions by offset; do not read the whole file.

- **Line 11**, frontmatter `sessions:` row, currently:
  `  - "Sitting 4 -- 2026-09-26, Windows 11, tauri dev (debug build) -- 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL accepted by operator decision"`
- **Lines 17-24**, the `## Current Test` bracketed prose. Line 19 carries
  `Sitting 4 (2026-09-26), discharged` and line 24 cites the section by name as `"## Sitting 4"`.
  Line 21 already carries sitting 5's correction parenthetical — copy its shape.
- **Line 430**, heading: ``## Sitting 4 — 2026-09-26, Windows 11, `tauri dev` ``
- **Lines 432-434**, the `**Conditions.**` paragraph.
- **Lines 436, 441, 449** — the three result headings. These are the scores. Do not touch them.
- **Lines 567-568**, inside sitting 5's section: "**`38-W04` — NOT RUN...** Sitting 4 recorded /
  that a debug build cannot reach this item." This is a sitting-4 build claim that happens to live
  in sitting 5's section, so it is in scope. `260926-b5r` deliberately left it because relabelling
  sitting 4 was "not established" then; it is established now, and line 496 already states the
  not-run reason does not depend on the build profile.

**Sitting 5's corrected section (lines 483-500) is the template for tone and shape.** Reuse its
structure: a `**Conditions (corrected …, quick …).**` lead, an `Originally recorded as "…"` history
sentence on one physical line, then a transfer paragraph.

## Measured inputs (established — do not re-derive)

Commit-date proxy, all `+1200`:

| what                              | commit       | when                |
| --------------------------------- | ------------ | ------------------- |
| sitting 3 block committed         | `5a0edd4a9`  | 2026-09-25 20:14:47 |
| `gamelib.log.old` window (names the installed exe) | — | 2026-09-25 21:01 → 2026-09-26 05:42 |
| installed shell pid 12812 started | —            | 2026-09-26 05:43:39 |
| sitting 4 content committed       | `0736ec037`  | 2026-09-26 06:29:19 |
| sitting 4 UAT block committed     | `a710fe9cc`  | 2026-09-26 06:30:22 |
| sitting 5 block committed         | `020a50ee9`  | 2026-09-26 07:25:18 |
| sitting 5 label corrected (b5r)   | `69042dd60`  | 2026-09-26 08:07:21 |

Sitting 4's section contains zero clock times and zero commit hashes (sittings 2 and 3 both carry
build hashes). Both candidate windows name the INSTALLED exe and they abut, so there is no dev-build
window on 2026-09-26 before the 06:30 write-up. The only clean dev-build gap is 20:14–21:01 on
2026-09-25, which contradicts the recorded date.

Desk diff `5b6201e26` (the installed build's source) against `0736ec037` (HEAD at sitting 4),
re-asserted in Task 1:

1. The first 8405 lines of `src-tauri/src/main.rs` are byte-identical on both sides, sha1
   `f7af5438ac02bc476a76b6493394243506c98232`. That range covers `tray_image()` (`main.rs:141`,
   38-W02) and the `on_page_load` origin-only title reset (`main.rs:6491`, 38-W03's root cause).
2. `src/frontend/components/UI/WindowControls/` and `src/preload/api/tauriWindowChrome.ts` are
   unchanged between those two commits (38-W01).
3. The tray assets (`src-tauri/icons`), the tray pixel test and `src/frontend/themes.scss` are
   unchanged between those two commits.
4. All +633 lines of `main.rs` drift is Phase 46 single-instance machinery
   (`acquire_single_instance`, `current_user_identity`, `create_single_instance_pipe_instance`,
   `deliver_to_running_instance_windows`, `run_windows_single_instance_accept_loop`, `main()`, and
   the test module) — outside the identical range.
5. Contrast sitting 5, whose items were frontend-side: `3a0e62918` and the 2026-09-25 work
   `cdf07ee95`, `959e5c01b`, `0475e74bd` are all confirmed NOT ancestors of `5b6201e26`.

## Measured facts about the gates (do not rediscover; the verify blocks are built on these)

- **`pnpm planning-gates` exits 1 at baseline: 12/13, with exactly one `[FAIL]`** —
  `.planning/planning-envelope-tag-gate.py`, naming exactly 3 files, all under
  `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/`, none touched here. So the gate
  cannot be chained with `&&`; Task 2 compares the failure set against that baseline instead.
- **The full frontmatter of `38-HUMAN-UAT.md` does NOT parse as YAML, and never did**: line 4's
  `source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, …]` is an unquoted flow sequence
  (`missed comma between flow collection entries (3:94)`). `260926-b5r` hit this too. The `sessions:`
  rows alone DO parse (5 rows). Task 1 therefore parses only those rows — a check that is green at
  baseline and still catches a broken sitting-4 scalar.
- **The UAT item-shape convention does not apply to this file.** `38-HUMAN-UAT.md` carries **zero**
  `^expected:` lines and **zero** `### N.` item headings — measured, not assumed. There are no
  `expected: |` blocks here to flatten. Likewise, `audit-uat` cannot see `*-HUMAN-UAT.md` files at
  all (stated in this file's own banner), so "audit-uat visibility unchanged" is vacuous for it. The
  real, non-vacuous invariant is asserted instead: the `^expected:` count stays 0 and
  `.planning/uat-visibility-gate.py` (inside planning-gates) stays PASS.
- Both target files pass `npx prettier --check` at baseline.

</context>

<tasks>

<task type="auto">
  <name>Task 1: Relabel sitting 4 in 38-HUMAN-UAT.md as the stale installed shell, marked inferred, with the desk-diff transfer note</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md</files>
  <action>
**First, re-assert the two cheap checks the transfer note depends on.** If either disagrees with the
context table, STOP and report it rather than writing a claim the tree contradicts:

- `git show 5b6201e26:src-tauri/src/main.rs | head -8405 | shasum` and the same for `0736ec037`
  must both print `f7af5438ac02bc476a76b6493394243506c98232`.
- `git diff --stat 5b6201e26 0736ec037 -- src/frontend/components/UI/WindowControls/ src/preload/api/tauriWindowChrome.ts`
  must print nothing (unchanged).

**Use the Edit tool for every change. Do NOT use `sed -i` or `perl -pi`** — this repo has measured a
`perl -pi` silently no-op at exit 0, and a render silently drop a substring. After editing, re-grep
for each string you intended to write; the verify block does this, but do not skip it in-task.

Make these six edits and no others.

**(a) Frontmatter line 11.** Replace only the build part of the row. The scores tail, from
`-- 38-W01 PASS` onward, stays byte-identical. Target shape:

`  - "Sitting 4 -- 2026-09-26, Windows 11, INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) -- attribution INFERRED from commit dates, not measured; label corrected by quick 260926-bsl -- 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL accepted by operator decision"`

YAML traps in this double-quoted scalar: it must contain **no backslash** (`\G` in
`%LOCALAPPDATA%\GameLib` is an invalid YAML escape and breaks the frontmatter) and **no inner double
quote**. Keep the Windows path out of the row entirely. The row must carry no `debug build` claim in
any form — the withdrawn label lives in the section, not here.

**(b) Current Test prose, line 19.** Change `Sitting 4 (2026-09-26), discharged` to carry a
correction parenthetical, matching the shape line 21 already uses for sitting 5. For example:
`Sitting 4 (2026-09-26, run on the same stale installed shell as sitting 5 — by inference, not measurement; see the correction in its section), discharged`.
Everything after `discharged` on that line and the next stays unchanged, and the region must not
gain a `debug build` claim.

**(c) Heading, line 430.** Change to, for example:
``## Sitting 4 — 2026-09-26, Windows 11, installed shell v0.7.0 (`5b6201e26`), label corrected by inference``.
Keep the prefix `## Sitting 4` byte-exact — line 24 cites the section by that name. It must contain
neither `tauri dev` nor `debug build`.

**(d) Conditions paragraph, lines 432-434.** Replace with a corrected paragraph that leads with the
correction marker and the inference flag, e.g.
`**Conditions (corrected 2026-09-26, quick `260926-bsl`) — INFERRED, not measured.**` It must state:

- Windows 11; the build was almost certainly the stale installed
  `%LOCALAPPDATA%/GameLib/gamelib-shell.exe` (forward slashes, to stay backslash-free), v0.7.0,
  mtime 2026-09-24 07:34, built from `5b6201e26` (the last commit before that mtime)
- its sidecar is the repo's `build/main/sidecar.js`, a compile-time path
  (`resolve_sidecar_entry()`, `main.rs:7823`), so the shell and embedded frontend were stale while
  the backend and the shared `gamelib.log` looked current
- the single-instance guard makes a concurrent `pnpm tauri:dev` hand focus over and exit, which is
  how the mislabel happened unnoticed
- the withdrawn label, preserved as quoted history. The tokens `Originally recorded as` and
  `DEBUG build` MUST sit on the **same physical line**, because the verify gate keys on that. E.g.
  ``Originally recorded as "Windows 11, `tauri dev`, DEBUG build"; that label is withdrawn.``
- the basis, compactly: sitting 4 recorded **no clock times and no commit hash** (sittings 2 and 3
  both carry build hashes), so the only proxy is git author dates — sitting 3's block `5a0edd4a9`
  20:14:47 on 2026-09-25, the `gamelib.log.old` window 21:01 → 05:42 which names the installed exe,
  installed shell pid 12812 started 2026-09-26 05:43:39, sitting 4's content `0736ec037`
  06:29:19 and its UAT block `a710fe9cc` 06:30:22. Both candidate windows name the installed exe and
  abut, leaving no dev-build window on 2026-09-26 before the 06:30 write-up; the only clean
  dev-build gap is 20:14–21:01 on 2026-09-25, which contradicts the recorded date.

Also retire the old paragraph's "Say 'debug build' explicitly — it is what makes `38-W04`/`38-W05`
still un-runnable" argument. The build profile is no longer established, so claim neither release nor
debug. State instead that 38-W04/38-W05 remain un-runnable for a reason that does not depend on the
build profile: no `v*` tag exists, so no CI-produced NSIS/AppImage artifact exists (the reason
sitting 5 measured, recorded at line 496 and lines 567-571).

**(e) Two new paragraphs, directly after the Conditions paragraph, in this order.**

1. `**Why 38-W01, 38-W02 and 38-W03 still stand — a desk diff, not a re-run.**` Record context items
   1-5 and map each item to its reason: 38-W01 to the unchanged `WindowControls/` +
   `tauriWindowChrome.ts`; 38-W02 to `tray_image()` at `main.rs:141` inside the byte-identical 8405
   lines, plus the unchanged tray assets, tray pixel test and `themes.scss`; 38-W03 to the
   `on_page_load` origin-only title reset at `main.rs:6491`, also inside that range. Name the sha1
   `f7af5438ac02bc476a76b6493394243506c98232` and both commits. Say that the whole +633-line
   `main.rs` drift is Phase 46 single-instance machinery, outside the identical range. End with the
   explicit limit: **nothing was re-run on HEAD** — this is an argument from the diff that the
   scores transfer, not an observation. Add the contrast with sitting 5, whose items were
   frontend-side and where the stale bundle genuinely did change behaviour.
2. `**Honest limits of this relabel.**` It must say, without hedging: this is an inference, not a
   measurement — unlike sitting 5, whose installed-shell attribution was measured live. An unlogged
   instance cannot be excluded. The 21:01 → 05:42 window and its attribution to the installed exe
   come from the `/gsd-debug mouse-dead-dropdown-disclosure` session's record
   (`.planning/debug/resolved/mouse-dead-dropdown-disclosure.md`, commit `1f93c5812`), **not** from
   logs readable on this Mac; the Windows logs were not re-read for this correction. The clean way to
   settle it is the `GAMELIB_SHELL_EXE received=` lines in `gamelib.log.old` on the operator's
   Windows machine. Cross-reference
   `.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`.

Do NOT fold these into the section's existing `**Honest-limits paragraph.**` near line 473 — that
one is about the items' own evidence and stays byte-unchanged.

**(f) Lines 567-568**, sitting 5's 38-W04 paragraph. Qualify the dangling sitting-4 claim with a
single clause, e.g. `Sitting 4 recorded that a debug build cannot reach this item (that build label
is now withdrawn — see `## Sitting 4` — but the not-run conclusion does not depend on it).` Leave the
rest of that paragraph, including the `git tag` / `release-tauri.yml:5-6` evidence, unchanged.

**Out of scope — do not touch:** the three result headings at lines 436, 441 and 449; any other
sitting's section; any `result:`/`status:` line; the existing honest-limits paragraph near line 473;
`38-VERIFICATION.md`; and the other files that repeat the old sitting-5 label (already ledgered as
follow-ups by `260926-b5r`). Do not introduce any envelope tag (`</output>`, `</content>` and
friends) — a trailing orphan trips `planning-envelope-tag-gate.py`. Keep prose wrapped near 100
columns, as the surrounding text is.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && F=".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md" && SEC=$(awk '/^## Sitting 4/{s=1} /^## Sitting 5/{s=0} s' "$F") && ROW=$(grep -E '^  - "Sitting 4' "$F") && npx prettier --check "$F" && test "$(printf '%s\n' "$ROW" | grep -ci 'debug build')" = 0 && printf '%s\n' "$ROW" | grep -q '5b6201e26' && printf '%s\n' "$ROW" | grep -qi 'infer' && test "$(printf '%s\n' "$ROW" | grep -c '\\')" = 0 && test "$(printf '%s\n' "$ROW" | sed 's/^  - "//; s/"$//' | grep -c '"')" = 0 && node -e "const fs=require('fs'),y=require('js-yaml');const m=fs.readFileSync(process.argv[1],'utf8').match(/^---\n([\s\S]*?)\n---/);const r=m[1].split('\n').filter(l=>/^  - \"(Sitting|Session)/.test(l));const o=y.load('sessions:\n'+r.join('\n'));if(o.sessions.length!==5)throw new Error('expected 5 session rows, got '+o.sessions.length);console.log('sessions rows parse OK, 5 rows')" "$F" && test "$(sed -n '/^## Sitting 4/p' "$F" | grep -ci 'tauri dev\|debug build')" = 0 && test "$(grep -c '^## Sitting 4 — 2026-09-26' "$F")" = 1 && test "$(printf '%s\n' "$SEC" | grep 'Originally recorded as' | grep -c 'DEBUG build')" = 1 && printf '%s\n' "$SEC" | grep -q 'f7af5438ac02bc476a76b6493394243506c98232' && printf '%s\n' "$SEC" | grep -q '0736ec037' && printf '%s\n' "$SEC" | grep -q 'a710fe9cc' && printf '%s\n' "$SEC" | grep -q 'mouse-dead-dropdown-disclosure' && printf '%s\n' "$SEC" | grep -q '1f93c5812' && printf '%s\n' "$SEC" | grep -q 'tauri-dev-silently-hands-off-to-a-stale-installed-build' && printf '%s\n' "$SEC" | grep -q 'GAMELIB_SHELL_EXE' && printf '%s\n' "$SEC" | grep -qi 'not a measurement\|not measured\|inference, not' && printf '%s\n' "$SEC" | grep -qi 'nothing was re-run\|not a re-run' && test "$(grep -c '^\*\*`38-W01` — PASS\.\*\*' "$F")" = 1 && test "$(grep -c '^\*\*`38-W02` — PASS, all three legs\.\*\*' "$F")" = 1 && test "$(grep -c '^\*\*`38-W03` — FAIL, accepted\.\*\*' "$F")" = 1 && test "$(grep -c '^expected:' "$F")" = 0 && test "$(grep -cE '^### [0-9]+\.' "$F")" = 0 && test "$(grep -c 'Sitting 4 (2026-09-26, ' "$F")" = 1 && grep -q 'withdrawn' "$F" && test "$(git diff --name-only | grep -vc "^$F$")" = 0 && echo "TASK 1 GATE PASS"</automated>
  </verify>
  <done>
- `npx prettier --check` passes on the exact edited path.
- The frontmatter sitting-4 row carries no `debug build` claim, names `5b6201e26`, is flagged as
  inferred, and contains no backslash and no inner double quote. The 5 `sessions:` rows still parse
  as YAML (the full frontmatter's pre-existing `source:` break is untouched and not asserted).
- The `## Sitting 4` heading carries neither `tauri dev` nor `debug build`, and still begins
  `## Sitting 4 — 2026-09-26` so line 24's citation resolves.
- The withdrawn label survives as history on a single physical line matching both
  `Originally recorded as` and `DEBUG build`.
- The section names the sha1 `f7af5438…`, both commits `0736ec037`/`a710fe9cc`, the debug session
  and its commit `1f93c5812`, the pending todo, and `GAMELIB_SHELL_EXE`; and it says in words both
  that the attribution is not a measurement and that nothing was re-run.
- The three result headings are byte-unchanged; `^expected:` count and `### N.` count both stay 0.
- Line 19 carries the correction parenthetical; the 38-W04 paragraph marks the old sitting-4 build
  claim withdrawn.
- `git diff --name-only` names no file other than `38-HUMAN-UAT.md`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Record decision 1 as partially answered in the pending stale-install todo, keep it ready: human, and compare planning-gates against the measured baseline</name>
  <files>.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md</files>
  <action>
Edit `.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`
with the Edit tool. Two edits.

**(a) The `gamelib.log.old` bullet, lines 33-34**, currently ends "Sitting 4 (2026-09-26) may fall
inside that window. **Not established**: check the sitting-4 timings before re-labelling it." Append
a dated update that answers it, e.g.:

`**Update 2026-09-26 (quick `260926-bsl`):** the sitting-4 timings were checked — there are none.
Sitting 4 recorded no clock times and no commit hash, so it was relabelled by INFERENCE from commit
dates (both candidate installed-exe windows abut, leaving no dev-build window on 2026-09-26 before
its 06:30 write-up), and its three results were transferred to HEAD by desk diff rather than re-run.
See `## Sitting 4` in `38-HUMAN-UAT.md`. Still not measured: the `GAMELIB_SHELL_EXE received=` lines
in `gamelib.log.old` on the Windows machine would settle it.`

Keep the existing "**Not established**" sentence in place — the update qualifies it, it does not
replace it.

**(b) Decision 1, lines 41-44.** Prefix it with a partial-answer marker, e.g.
`**Partially answered 2026-09-26.**` recording: sitting 5 was relabelled by quick `260926-b5r`
(measured) and sitting 4 by quick `260926-bsl` (inferred); all six results stand by desk diff and
nothing was re-run; the "At minimum, correct the Conditions lines" minimum is now done for both.
Then state what is still the operator's call, which is why this stays `ready: human`: whether to
accept the sitting-4 inference or confirm it from the Windows logs, and the whole of decision 2
(guarding the trap), which touches the Phase 46 single-instance design.

**Do not change the frontmatter.** `severity: major`, `platform: windows` and `ready: human` stay
exactly as they are — bare, lowercase, in that order (the todo frontmatter gate is strict about
this). Leave the `title:` line alone too; the body update carries the sitting-4 finding, and a
minimal diff is preferable to rewriting a title. Do not move the file to `completed/`. Do not
introduce any envelope tag — a trailing orphan closing tag trips
`planning-envelope-tag-gate.py`, and this repo has measured 43 such instances in planning bodies.

**On the gate comparison in `<verify>`:** `pnpm planning-gates` exits 1 at baseline (12/13; the sole
`[FAIL]` is `planning-envelope-tag-gate.py` over 3 untouched `260925-uok` files), so it cannot be
chained with `&&`. The gate below therefore runs it once and asserts the failure set is unchanged:
exactly one `[FAIL]`, that gate, 3 `260925-uok` mentions. It runs the whole tree, so this single run
covers Task 1's file as well — which is why Task 1 does not repeat it. If the count or the file set
differs, the edit broke something: fix it, do not widen the assertion.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && T=".planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md" && F=".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md" && npx prettier --check "$T" "$F" && test "$(grep -c '^severity: major$' "$T")" = 1 && test "$(grep -c '^platform: windows$' "$T")" = 1 && test "$(grep -c '^ready: human$' "$T")" = 1 && grep -q '260926-bsl' "$T" && grep -q '260926-b5r' "$T" && grep -qi 'partially answered' "$T" && grep -q 'Not established' "$T" && grep -q 'GAMELIB_SHELL_EXE' "$T" && test -f "$T" && test ! -f ".planning/todos/completed/$(basename "$T")" && test "$(git diff --name-only | grep -vcE "^($F|$T)$")" = 0 && OUT=$(pnpm planning-gates 2>&1 || true) && printf '%s\n' "$OUT" | grep -q '12/13 planning gates passed' && test "$(printf '%s\n' "$OUT" | grep -c '^\[FAIL\]')" = 1 && printf '%s\n' "$OUT" | grep -q '\[FAIL\] .planning/planning-envelope-tag-gate.py' && test "$(printf '%s\n' "$OUT" | grep -c '260925-uok')" = 3 && printf '%s\n' "$OUT" | grep -q '\[PASS\] .planning/uat-visibility-gate.py' && printf '%s\n' "$OUT" | grep -q '\[PASS\] .planning/todos/todo-frontmatter-gate.py' && echo "TASK 2 GATE PASS"</automated>
  </verify>
  <done>
- `npx prettier --check` passes on both edited paths (explicit, never a bare `.`).
- The todo still carries `severity: major`, `platform: windows`, `ready: human` bare and lowercase,
  is still in `pending/`, and is not present in `completed/`.
- Its body names both quick IDs, marks decision 1 partially answered, keeps the original
  "**Not established**" sentence, and still points at `GAMELIB_SHELL_EXE` as the settling
  measurement.
- `pnpm planning-gates` reports 12/13 with exactly one `[FAIL]` — `planning-envelope-tag-gate.py`
  over the same 3 untouched `260925-uok` files as the pre-edit baseline. `uat-visibility-gate.py` and
  `todo-frontmatter-gate.py` both PASS.
- `git diff --name-only` names only the two intended files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary                       | Description                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| planning doc → gate tooling    | `planning-frontmatter-gate.py`, `todo-frontmatter-gate.py`, `uat-visibility-gate.py` and `planning-envelope-tag-gate.py` parse these two files |
| planning doc → future reader   | a relabelled sitting is the only record of which binary produced a score                                     |

## STRIDE Threat Register

| Threat ID | Category               | Component                     | Disposition | Mitigation Plan                                                                                                                                                  |
| --------- | ---------------------- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-bsl-01  | Tampering              | 38-HUMAN-UAT.md frontmatter   | mitigate    | No backslash and no inner double quote in the YAML double-quoted sitting-4 row; the verify block parses the 5 `sessions:` rows with js-yaml and asserts the count. |
| T-bsl-02  | Repudiation            | sitting-4 history             | mitigate    | The withdrawn `tauri dev` / DEBUG build label is kept as quoted history on an `Originally recorded as` line, asserted present, rather than deleted.                |
| T-bsl-03  | Tampering              | 38-W01/W02/W03 scores         | mitigate    | The three result headings are asserted byte-present exactly once each; `^expected:` and `### N.` counts asserted still 0.                                          |
| T-bsl-04  | Spoofing (of evidence) | the relabel itself            | mitigate    | The label is explicitly flagged INFERRED in the frontmatter row, the heading and the Conditions lead, and an honest-limits paragraph names the unmeasured link.    |
| T-bsl-05  | Tampering              | planning gate baseline        | mitigate    | The gate set is compared against a measured pre-edit baseline (12/13, one named failure, 3 named files) instead of being chained with `&&` onto a red exit.        |
| T-bsl-06  | Information disclosure | commit hashes / repo paths    | accept      | Only commit hashes, repo-relative paths and a `%LOCALAPPDATA%` shape are written. No session data, cookie value or log content is copied.                          |
| T-bsl-SC  | Tampering              | npm/pip/cargo installs        | n/a         | No package installs in this plan. No dependency is added or changed.                                                                                              |
</threat_model>

<verification>
- Both task gates print their `GATE PASS` line.
- `git status --short` shows only the two target files modified in the tracked tree, plus this
  untracked quick directory.
- No source file under `src/`, `src-tauri/` or `meta/` is modified.
</verification>

<success_criteria>
Sitting 4's record names the binary it almost certainly ran, states plainly that the attribution is
an inference from commit dates rather than a measurement, carries the basis and the unmeasured gap,
and explains from a desk diff why 38-W01 PASS, 38-W02 PASS and 38-W03 FAIL-accepted still hold on
HEAD so nobody re-runs them. The withdrawn label stays visible as history, no score changes, and the
pending todo records decision 1 as half-answered while staying `ready: human`.
</success_criteria>

<output>
Create `.planning/quick/260926-bsl-correct-the-sitting-4-build-label-in-38-/260926-bsl-SUMMARY.md`.

Record in it:

- that the sitting-4 attribution is INFERRED while sitting 5's (quick `260926-b5r`) was MEASURED,
  and that this asymmetry is now written into the file rather than smoothed over
- the two re-asserted desk-diff checks and their results
- the pre-existing gate/parse facts confirmed rather than fixed: the `planning-envelope-tag-gate.py`
  failure over 3 untouched `260925-uok` files, and the unparseable `source:` flow sequence on line 4
  of `38-HUMAN-UAT.md`'s frontmatter
- that this file carries zero `expected:` blocks and zero `### N.` items, so the CLAUDE.md UAT
  item-shape hazard was measured inapplicable here — and that `audit-uat` cannot see
  `*-HUMAN-UAT.md` at all, so no visibility change was possible
- follow-ups left untouched, carried over from `260926-b5r`'s ledger: `38-VERIFICATION.md`,
  `todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md:16`,
  `debug/resolved/epic-cookie-clear-read-divergence.md:206-207`, and the historical 260926-a1l
  PLAN/SUMMARY
- that decision 2 of the stale-install todo, and operator confirmation of the sitting-4 inference
  from the Windows `gamelib.log.old`, both remain open
</output>
