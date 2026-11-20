---
phase: quick-260928-sph
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/planning-frontmatter-gate.py
  - .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
  - .planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
autonomous: true
requirements:
  - QUICK-260928-SPH
estimate:
  tokens: 75000
  raw_tokens: 75000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "**A phase ledger whose frontmatter does not parse turns the gate red. This is proven end-to-end against the REAL incident bytes.** Build a copy of the 89 ledgers plus the gate, STATE.md and ROADMAP.md. With the pre-repair `38-VERIFICATION.md` from `0801e07eb^` spliced in, `planning-frontmatter-gate.py` exits non-zero and its `GATE FAILED:` line names `38-VERIFICATION.md`. The unmodified copy exits 0. That is the negative control, and it proves the red comes from the spliced file and not from the copy setup."
    - "**Both incident shapes are REJECT self-test cases built from real historical bytes, hash-pinned.** Two 90-byte ASCII windows are sliced programmatically from `0801e07eb^`'s `38-VERIFICATION.md`, each sha256-asserted before use, following the gate's own HISTORICAL_EXCERPT pattern. Shape (1) is an unquoted plain `score:` scalar containing a colon-space. Shape (2) is a double-quoted `result:` scalar with unescaped inner double quotes. Both are rejected at `status: human_needed`."
    - "**The walk does NOT convict Phase 38's repaired ledger.** An ACCEPT case holds the exact repaired forms `0801e07eb` shipped: a single-quoted score, a backslash-escaped result, plus a `|` block scalar. It must return an `OK:` verdict. The existing `check_divergence_shapes` would convict 10 ledgers (19 problems), `38-VERIFICATION.md` among them, and it is deliberately NOT applied to ledgers."
    - "**The walk covers what audit-uat reads, and a floor stops it going vacuous.** 89 ledgers: 85 under `phases/*/` plus 4 under the archived `milestones/v0.1-phases/*/`. Selection mirrors gsd-core's `uat.cjs:59`/`:203` substring filters. `MINIMUM_PHASE_LEDGERS = 89`, and a walk below it fails loudly."
    - "**The three unparseable terminal-status ledgers stay unedited, visible, and cannot grow.** `34.13-UAT.md` (complete), `34.4.1-VERIFICATION.md` (passed) and `39-VERIFICATION.md` (passed) are pinned by path plus status and reported by name as `NOTE:`. A pinned file FAILS if its shape-read status no longer matches the pin, if it now parses, or if it no longer exists. An UNPINNED unparseable ledger FAILS at any status. The two no-frontmatter files are pinned the same way."
    - "**The runner is unchanged and green.** No new `*-gate.py` file is added, so `MINIMUM_EXPECTED_GATES` stays 12 and `pnpm planning-gates` reports 12/12. The STATE.md/ROADMAP.md policy and its 18 existing self-test lines are untouched."
    - "**The todo's narrative is corrected with a measurement, not restated.** Under gsd-core 1.14.0, shape (1) at column 0 ALONE would not have hidden Phase 38: `repairAmbiguousColonValues` rescues it, so a score-only splice still reads `human_needed`. Shape (2) was load-bearing: a quote-only splice reads `undefined`. The gate docstring and the todo resolution note both record this."
  artifacts:
    - ".planning/planning-frontmatter-gate.py: the phase-ledger walk, its two pin tables, two hash-pinned excerpts, 20 new `ledger:` self-test lines, and the docstring's TARGET POLICY / LIMIT sections rewritten to cover the walk"
    - ".planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md: moved from pending/ with a `## Resolution` note naming `260928-sph`, both commit SHAs, the shipped policy, the shape-(1) correction, and the live audit-uat re-measure"
  key_links:
    - "`main()` calls the new ledger scan AFTER the existing TARGETS walk. Its failures join the SAME final `fail()` call. A ledger failure that only printed and still exited 0 would be invisible to `meta/runPlanningGates.py`, which reads the exit code alone."
    - "The live scan and every `ledger:` self-test case go through ONE function (`check_phase_ledger`) that calls the EXISTING `run_parser` and `extract_frontmatter`. This is the gate's own \"same function, never a reimplementation\" rule, and it is why the self-test proves anything about the live walk."
    - "The pin tables are keyed by path relative to PLANNING_DIR. The scan must look each walked file up by that key, not by basename. Basename keys would let a same-named file in another phase dir inherit a pin."
---

<objective>
Close the pending todo `2026-09-28-no-gate-parses-phase-verification-frontmatter.md`. Extend
`.planning/planning-frontmatter-gate.py` so it also walks every phase VERIFICATION/UAT ledger
that gsd-core `audit-uat` reads and strictly parses its frontmatter. An unparseable ledger can
then never silently drop a phase's open items from the audit again, as Phase 38 did from
2026-09-23 until quick 260928-raq repaired it.

Purpose: the only frontmatter parse gate in the repo covers STATE.md and ROADMAP.md.
`38-VERIFICATION.md` is edited by nearly every Phase 38 quick task and holds the project's entire
deferred-hardware backlog. The next unescaped quote would hide it again with nothing turning red.

Output: the extended gate, with its self-test and docstring, and the todo moved to `completed/`
with a resolution note.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
@.planning/planning-frontmatter-gate.py
@meta/runPlanningGates.py

## Measured at planning time (2026-09-28, HEAD `f43a56e64`, gsd-core 1.14.0). These are scope authority.

These were observed live, not taken from the todo's own list. Where the todo and a measurement
disagree, the measurement wins.

**How audit-uat reads a ledger (`~/.claude/gsd-core/bin/lib/`; outside this repo, unversioned,
overwritten by a gsd-core upgrade, so cite as "measured against 1.14.0"):**
- `uat.cjs:59` selects UAT files with `f.includes('-UAT') && f.endsWith('.md')`, which covers
  `*-HUMAN-UAT.md` too. `uat.cjs:203` selects VERIFICATION files with
  `f.includes('-VERIFICATION') && f.endsWith('.md')`.
- `uat.cjs:206-212` is the VERIFICATION path. It reads `status` from frontmatter and opens the
  file only when status is `human_needed` or `gaps_found`. A parse failure yields `{}`, so status
  reads as `unknown` and the whole phase silently vanishes from the audit. This is the incident.
- `uat.cjs:137-139,155` is the UAT path. Items are read from the BODY regardless of frontmatter,
  and status deliberately does not gate it. A broken UAT frontmatter therefore does not hide body
  items. It only loses `status` and any `audit_acknowledged` marker, which fails safe.
- `uat.cjs:84-123`: archived `milestones/*-phases/*/` dirs are scanned too, deliberately.
- `frontmatter.cjs:33` shows gsd-core reads frontmatter with a VENDORED js-yaml.
  `extractFrontmatter` (`:701-725`) returns `{}` on any parse error. `frontmatterRegion`
  (`:677-700`) requires a byte-0 `---\n` or `---\r\n` opening fence (it strips one BOM).
  `parseGuardedYamlRegion` (`:515`) first refuses YAML anchors/aliases (`:193`) and the U+E000
  sentinel (`:236`). `loadWithAmbiguousColonRepair` (`:469-499`) retries a failed parse after
  double-quoting COLUMN-0 plain values that contain a colon-space. It never touches indented lines.

**Census of the walk this plan builds.** The selection is `phases/*/` plus `milestones/*-phases/*/`,
one level deep, filtered by the substring rules above. It finds **89 files**: 85 active, of which
53 are `*-VERIFICATION.md`, 17 are `*-UAT.md` and 15 are `*-HUMAN-UAT.md`, plus 4 archived under
`milestones/v0.1-phases/`. Every name matches the exact suffix set, so no wider-substring extras
exist today. Under the repo's `node_modules/js-yaml` 4.1.1:
- **84 parse as a mapping** (80 active + 4 archived). Among them, 14 are `human_needed` and 1 is
  `gaps_found`, which is **15 at an open status**. For all 80 active ones, gsd-core's
  `extractFrontmatter` returns the same `status` as js-yaml. The one representational difference
  is `38-HUMAN-UAT.md`'s boolean `status: false`, which gsd-core stringifies. It is a UAT file and
  out of scope.
- **2 have no frontmatter fence:**
  `phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md`, a prose
  results doc (audit-uat still reads 15 items for phase 30 from bodies), and
  `phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-EMBED-API-VERIFICATION.md`,
  a D-25 crate-source verdict doc, not a verify-phase ledger.
- **3 do not parse:**
  `phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md` (`status: complete`,
  js-yaml error at 62:176, gsd-core status `undefined`);
  `phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md`
  (`status: passed`, 69:152, `undefined`);
  `phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md`
  (`status: passed`, 4:270, BUT gsd-core reads `"passed"` because the column-0 colon repair
  rescues it; this is a live column-0 shape-(1) instance). Each carries exactly one column-0
  `status:` line in its frontmatter region.
- All 87 fence-bearing ledgers open with a byte-exact `---\n`. There are 0 CRLF, 0 BOM and 0
  inexact fences.
- The existing `check_divergence_shapes` would convict **10 ledgers / 19 problems**, including
  `38-VERIFICATION.md` (7). Its `\"` rule fires on the backslash-escaped 38-S08 `result:` that
  `0801e07eb` wrote as the repair.

**The incident's two shapes, split and measured against the real pre-repair bytes**
(`git show 0801e07eb^:.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`):
- Both defects present: js-yaml BAD (4:108), gsd-core status `undefined`, so the phase is hidden.
- Score-only (shape 1, column-0 plain scalar): js-yaml BAD, gsd-core status `"human_needed"`,
  so the phase is VISIBLE because the repair rescued it.
- Quote-only (shape 2, indented double-quoted scalar at 4-space indent): js-yaml BAD, gsd-core
  `undefined`, so the phase is HIDDEN.
- Synthetic fixtures built from the excerpts below behaved as follows under js-yaml / gsd-core.
  The valid ledger is ok / `human_needed`. Shape 1 at column 0 is BAD / `human_needed`. Shape 2
  indented is BAD / `undefined`. Shape 1 indented (the score excerpt as a plain `result:` value
  inside the list entry) is BAD / `undefined`.

**Hash-pinned excerpts. Extract them programmatically; never retype them.** Both are 90 bytes,
pure ASCII, with no apostrophe and no backslash:
- Score excerpt: take the first line starting with `score:` in the pre-repair file, and slice 90
  characters starting at the index of the substring `11 relocated items OPEN`. It contains
  `2026-09-23: ` (the colon-space) and 0 double quotes. sha256
  `d96828c5d2f03bf0081cdd1fe83feaa08d5f4800c66d395511cf7e8092bdc853`.
- Result excerpt: take the first line containing `cls":"selectFieldWrapper` in the pre-repair
  file, and slice 90 characters starting at the index of the substring `the viewport centre as`.
  It contains 3 raw double quotes. sha256
  `07fa7b5a6a446b4867c45d1d544267a5954faf7bddda04ef8988893c2bf4fa6e`.

**Baselines.** `pnpm planning-gates` reports 12/12, and `MINIMUM_EXPECTED_GATES = 12`. The gate's
`--self-test` prints 18 `  self-test OK:` lines, and the whole gate runs in about 0.65s, which is
roughly 35ms per node spawn. `audit-uat --raw` gives 429 items across 56 files,
`parse_gap_files: 0`, `by_phase['38'] = 10` (moved from 11 by later 260928-raq commits) and
`by_phase['30'] = 15`. Prettier reports `{ "ignored": true, "inferredParser": null }` for both
`.planning/planning-frontmatter-gate.py` and the pending todo `.md`. `graphify-out/` is
git-ignored.

## Design decisions (planner discretion, grounded in the measurements above)

- **DD-1: extend the existing gate file; add no new gate file.** The todo's fix direction is to
  extend TARGET POLICY, and this gate was written for this exact failure shape. So
  `meta/runPlanningGates.py` and `MINIMUM_EXPECTED_GATES` (12) are NOT edited.
- **DD-2: parse first, and never excuse by status alone.** Strictly parse every ledger with the
  existing `run_parser`. If it parses as a mapping, the verdict is OK. If it does not parse, the
  verdict is FAIL unless the file is PINNED in `KNOWN_UNPARSEABLE_TERMINAL` AND a shape read of
  its single column-0 `status:` line in the frontmatter region equals the pinned status. Then it
  is a `NOTE:`. This resolves the "unparseable file has no readable status" tension. The pattern
  comes from the gate itself: a pinned table (like `TARGETS`), a shape-read regex rather than a
  second parser (like `check_divergence_shapes`/`KEY_LINE_RE`), and NOTE lines counted separately
  because "skipped is not checked". A status-only excuse would let fix-by-relabel turn the gate
  green, meaning someone flips `human_needed` to `passed` on a broken file. The pin plus status
  cross-check closes that. The cross-check also still catches the incident class on a pinned
  file: a pinned ledger flipped back to an open status FAILS.
- **DD-3: fix-by-deletion is guarded as well.** A ledger with no frontmatter fence is FAIL unless
  pinned in `KNOWN_NO_FRONTMATTER`. Deleting the fence is the cheapest way to silence a parse
  failure, and it hides a VERIFICATION file completely. This is the ledger analogue of the gate's
  REQUIRED_STATE_KEYS anti-vacuity rule.
- **DD-4: pins only ever shrink.** A pinned path that no longer exists, now parses, or now has a
  fence, FAILS with "stale pin -- remove it". A module-load `assert` refuses any pinned status in
  `OPEN_VERIFICATION_STATUSES` (`human_needed`, `gaps_found`) and any path pinned in both tables.
- **DD-5: `check_divergence_shapes` is NOT applied to ledgers.** Its premise is the retired
  get-shit-done-cc hand-rolled parser. gsd-core reads ledgers through vendored js-yaml
  (`frontmatter.cjs:33`), for which `\"` and block scalars read identically to this gate's parse.
  Applying it would convict 10 ledgers, including `38-VERIFICATION.md`'s own repair: a gate
  convicting correct code.
- **DD-6: the opening fence must be byte-exact.** A ledger whose first line strips to `---` but
  whose bytes do not begin with `---\n` or `---\r\n` FAILS. gsd-core's `frontmatterRegion` would
  read NO frontmatter from it while `extract_frontmatter` (which uses `.strip()`) would parse it.
  That is a green-while-hidden divergence. It convicts 0 files today (measured).
- **DD-7: scope is 89 files, including the archive.** Walk `milestones/*-phases/*/` as well as
  `phases/*/`, because audit-uat scans archives and a future milestone archive move must not
  shrink the walk. `MINIMUM_PHASE_LEDGERS = 89`, the discovered count, to match the runner's own
  tight-floor convention. Lowering it is a deliberate, recorded edit.
- **DD-8: shape (1) is rejected even though gsd-core rescues it at column 0.** The gate enforces
  the strict property (the block parses under js-yaml 4), not "parses under a consumer's repair
  crutch". The same shape one indent deeper is NOT rescued (measured). `39-VERIFICATION.md`
  therefore remains a pinned NOTE rather than an OK. The docstring states this measured nuance
  plainly, so nobody later "discovers" that the gate is stricter than audit-uat and loosens it.
- **DD-9: stated limits, not implemented.** gsd-core refuses anchors/aliases and U+E000, while
  this gate's js-yaml accepts them. No ledger uses either today: all 80 active parseable ledgers
  read the same status under both parsers, and a refusal would read `undefined`. The docstring
  names this as a limit.

## Out of scope. Do NOT change any of these.

- CLAUDE.md, including its "419 outstanding items across 55 files" figure (the todo forbids it).
- `34.13-UAT.md`, `34.4.1-VERIFICATION.md` and `39-VERIFICATION.md`. They are pinned, not
  repaired.
- `meta/runPlanningGates.py` (DD-1).
- The STATE.md/ROADMAP.md policy: `TARGETS`, `REQUIRED_STATE_KEYS`, `check_document`,
  `check_divergence_shapes`, `VALID_STATE_DOCUMENT`, `HISTORICAL_EXCERPT`, and all 18 existing
  self-test cases. Nobody has re-examined whether the divergence check's premise is stale for
  STATE.md under gsd-core. Note it as an observation in the SUMMARY only.
- `.planning/quick/260928-raq-*/ledger-check.cjs` (another quick task's harness).
- `.planning/STATE.md` (the quick orchestrator records the task).
- Any ledger file under `.planning/phases/` or `.planning/milestones/`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer — walk phase ledgers end-to-end and prove red on the real pre-repair 38-VERIFICATION.md</name>
  <files>.planning/planning-frontmatter-gate.py</files>
  <read_first>
.planning/planning-frontmatter-gate.py, the whole file in one pass. Note `fail`, `find_node`,
`run_parser`, `extract_frontmatter`, `mutate`, `_case_reject`/`_case_accept`, `self_test`'s
`case_count` closure pattern, `check_target_file`, and `main`'s result and summary handling.
Reuse these. Do not re-implement them.
  </read_first>
  <action>
Build the thinnest complete path first: the CLI walks ledgers, parses each through the existing
node/js-yaml helper, reaches a verdict, and a ledger failure reaches the same final `fail()`.
Pins, the two incident REJECT cases and the repaired-form ACCEPT case are all in this task.
Task 2 expands the self-test matrix and the docstring.

1. Module constants, placed after `NON_EMPTY_STRING_KEYS`:
   - `OPEN_VERIFICATION_STATUSES = ("human_needed", "gaps_found")`.
   - `MINIMUM_PHASE_LEDGERS = 89`, with a comment citing the 2026-09-28 census (85 active + 4
     archived) and the runner's tight-floor convention (DD-7).
   - `KNOWN_NO_FRONTMATTER`, a tuple of (path relative to PLANNING_DIR as a posix string, reason)
     holding the two no-fence files from the census. Each reason is one line: 30-HUMAN-UAT is a
     prose results doc whose items audit-uat reads from the body (`uat.cjs:155`), and
     40-EMBED-API-VERIFICATION is a D-25 crate-source verdict doc, not a verify-phase ledger.
   - `KNOWN_UNPARSEABLE_TERMINAL`, a tuple of (relative path, pinned status) holding the three
     unparseable files with `complete`, `passed` and `passed` (DD-2).
   - A comment above both tables: "NEVER add a pin to make a real failure go away -- fix the
     ledger. Pins only shrink; a stale pin fails." (DD-4)
   - Module-load `assert`s next to the existing PLANNING_DIR assert. No pinned status may be in
     `OPEN_VERIFICATION_STATUSES`, and no path may appear in both tables (DD-4).
   - `STATUS_LINE_RE`, which matches a whole column-0 line `status:` followed by optional spaces,
     an optional matching single or double quote, a `[A-Za-z_]+` value, the same closing quote,
     and an optional trailing ` #comment`. Use a backreference for the quote.
   - `LEDGER_SCORE_EXCERPT` / `LEDGER_SCORE_EXCERPT_SHA256` and `LEDGER_RESULT_EXCERPT` /
     `LEDGER_RESULT_EXCERPT_SHA256`. EXTRACT THEM PROGRAMMATICALLY with a throwaway python3
     script in a mktemp scratch file, never retyped. The script runs the `git show 0801e07eb^:...`
     read and the slicing rule exactly as stated in the planning-time measurements, prints `repr()`
     and sha256 for each, and asserts both hashes equal the two values pinned in `<context>`.
     Paste the `repr()` output. If either hash differs, STOP and report: the extraction rule or
     the history has changed. Comment them the way `HISTORICAL_EXCERPT` is commented: which
     commit, which line, and why they are hash-guarded.

2. `find_phase_ledgers(planning_dir: Path) -> list[Path]`. Walk the directories directly under
   `planning_dir / "phases"`, and the directories directly under each
   `planning_dir / "milestones" / "*-phases"`. Select the files in them whose name ends `.md` and
   contains `-UAT` or `-VERIFICATION`, mirroring `uat.cjs:59`/`:203` (DD-7). Return them sorted.
   Take `planning_dir` as a parameter, never the global, so Task 2 can point it at an empty temp
   dir.

3. `read_status_line(frontmatter_text: str) -> str | None`. Apply STATUS_LINE_RE line by line to
   the frontmatter REGION only, never the body. Return the lowercased value when EXACTLY ONE line
   matches. Return None for zero matches or for more than one (fail closed). It is a shape read,
   not a parser. Say so in its docstring.

4. `check_phase_ledger(text, node, label, pinned_no_frontmatter=False, pinned_status=None) -> tuple[bool, str]`.
   This is the SAME function used by the live walk and every `ledger:` self-test case. Order:
   - (a) If the first line does not strip to `---`: if pinned_no_frontmatter, return a `NOTE:`
     message that names the file and says it is pinned no-frontmatter; otherwise FAIL, saying
     audit-uat reads no status from it and that deleting the fence is not a fix (DD-3).
   - (b) If pinned_no_frontmatter and a fence exists: FAIL as a stale pin.
   - (c) If the bytes do not begin with `---\n` or `---\r\n`: FAIL, citing gsd-core's
     `frontmatterRegion` byte-0 rule (DD-6).
   - (d) If `extract_frontmatter` returns None: FAIL as an unterminated block. This never NOTEs.
   - (e) Call `run_parser`. If it parses and is a mapping: if pinned_status, FAIL as a stale pin
     ("now parses -- remove it"); otherwise return OK. The message starts `OK:` and includes the
     parsed status. Report the status via `str(value.get("status")).lower()` so the scan can
     count open statuses. If it parses but is not a mapping: FAIL.
   - (f) If it does not parse: read the status by shape. If not pinned: FAIL, including the js-yaml
     error and the shape-read status. When that status is open, say explicitly that this is the
     exact shape that hid Phase 38 from audit-uat. If pinned: a shape-read status of None or one
     that differs from the pin is a FAIL (a pinned file whose status moved is the incident
     class). If it equals the pin, return `NOTE:`, naming the file, the pinned status, and that
     audit-uat never opens it at that status.
   - Do NOT call `check_divergence_shapes` anywhere in this function (DD-5).

5. `check_phase_ledgers(planning_dir, node) -> list[tuple[bool, str]]`. First check that each
   pinned path exists under planning_dir, and emit a FAIL result ("stale pin -- file no longer
   exists") for any that does not. Then call `find_phase_ledgers`. If the count is below
   `MINIMUM_PHASE_LEDGERS`, call `fail()` with a message naming the count, the floor and both
   roots; a walk that finds nothing must not pass. Then run `check_phase_ledger` per file, with
   pins looked up by posix path relative to planning_dir (not basename). Label each by
   `str(path)`.

6. `main()`. After the existing TARGETS loop and its summary print, run `check_phase_ledgers`,
   print every message, then print EXACTLY this one summary line, filled from counters:
   `PHASE LEDGERS: {walked} walked (floor {MINIMUM_PHASE_LEDGERS}); {ok} parsed as a mapping ({open} at an open status: human_needed/gaps_found); {nofm} pinned no-frontmatter NOTE; {unp} pinned unparseable-terminal NOTE; {failed} failed.`
   Merge the ledger failures with the TARGETS failures into the ONE existing final `fail()` call,
   so any ledger failure exits non-zero.

7. Self-test, tracer subset. Add helpers `_ledger_reject(label, text, node, **pins)` and
   `_ledger_accept(label, text, node, expect_prefix, **pins)`. Both call `check_phase_ledger`
   and print `  self-test OK: ledger: {label} ...`. The accept helper must also FAIL if the
   verdict's prefix is not `expect_prefix` (`OK:` vs `NOTE:`); a NOTE where OK was expected is a
   distinct regression. Wire them into `self_test()`'s `case_count` closure. Add these cases, all
   printing with the `ledger:` label prefix:
   - Two hash assertions, one per excerpt, each printing a `self-test OK: ledger:` line.
   - `VALID_LEDGER_DOCUMENT`, a module constant built from the excerpts. It contains
     `status: human_needed`, `score: '<score excerpt>'` single-quoted, and a `human_verification:`
     list whose entry has `id: "38-S08"`, a `result:` double-quoted with every `"` in the result
     excerpt backslash-escaped (derive this in code from the excerpt; never retype it), and an
     `expected: |` block scalar. It is ACCEPTed with expect_prefix `OK:`. This is the repaired
     form `0801e07eb` shipped, and it proves DD-5.
   - REJECT incident shape (1): route through `mutate()` to turn the single-quoted score into the
     unquoted plain scalar at column 0.
   - REJECT incident shape (2): route through `mutate()` to turn the escaped result back into the
     raw-quote form.
   That makes 5 `ledger:` lines.

Commit only this file:
`git add .planning/planning-frontmatter-gate.py && git commit -m "feat(quick-260928-sph): walk phase VERIFICATION/UAT ledgers in the frontmatter gate" -- .planning/planning-frontmatter-gate.py`,
with the attribution lines from the session's system reminder.
  </action>
  <verify>
    <automated>
cd /home/graysonmitchell/GameLib || exit 1
python3 -m py_compile .planning/planning-frontmatter-gate.py || exit 1
npx prettier --file-info .planning/planning-frontmatter-gate.py | grep -Eq '"ignored":[[:space:]]*true' || { echo "gate .py is NOT prettier-ignored -- a prettier --check is now required"; exit 1; }
ST=$(python3 .planning/planning-frontmatter-gate.py --self-test) || { echo "FAIL: self-test red"; exit 1; }
N=$(printf '%s\n' "$ST" | grep -c '^  self-test OK: ledger:'); [ "$N" -ge 5 ] || { echo "FAIL: expected >=5 ledger self-test lines, got $N"; exit 1; }
[ "$(printf '%s\n' "$ST" | grep -c '^  self-test OK:')" -ge 23 ] || { echo "FAIL: existing 18 self-test lines not all still present"; exit 1; }
OUT=$(python3 .planning/planning-frontmatter-gate.py) || { echo "FAIL: live gate red"; exit 1; }
printf '%s\n' "$OUT" | grep -Fq 'PHASE LEDGERS: 89 walked (floor 89); 84 parsed as a mapping (15 at an open status: human_needed/gaps_found); 2 pinned no-frontmatter NOTE; 3 pinned unparseable-terminal NOTE; 0 failed.' || { echo "FAIL: live summary differs from the planning-time census"; printf '%s\n' "$OUT" | tail -3; exit 1; }
E2E=$(mktemp -d); trap 'rm -rf "$E2E"' EXIT
find .planning/phases .planning/milestones -type f \( -name '*-UAT*.md' -o -name '*-VERIFICATION*.md' \) -exec cp --parents {} "$E2E/" \;
cp .planning/planning-frontmatter-gate.py .planning/STATE.md .planning/ROADMAP.md "$E2E/.planning/"
python3 "$E2E/.planning/planning-frontmatter-gate.py" > "$E2E/green.out" 2>&1 || { echo "FAIL: negative control -- the UNMODIFIED copy is red"; tail -5 "$E2E/green.out"; exit 1; }
git show '0801e07eb^:.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md' > "$E2E/.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md" || exit 1
if python3 "$E2E/.planning/planning-frontmatter-gate.py" > "$E2E/red.out" 2>&1; then echo "FAIL: the real pre-repair 38-VERIFICATION.md did NOT turn the gate red"; exit 1; fi
grep -q 'GATE FAILED:.*38-VERIFICATION.md' "$E2E/red.out" || { echo "FAIL: red for the wrong reason"; tail -5 "$E2E/red.out"; exit 1; }
grep -q 'human_needed' "$E2E/red.out" || { echo "FAIL: failure message does not report the shape-read open status"; exit 1; }
echo "TRACER OK"
    </automated>
  </verify>
  <done>
The live gate exits 0 and prints the exact PHASE LEDGERS summary line with 89 / 84 / 15 / 2 / 3 /
0. The real pre-repair 38-VERIFICATION.md turns a copied tree red with a GATE FAILED line naming
it and its human_needed status, and the unmodified copy is green. The self-test prints at least 5
`ledger:` lines plus all 18 pre-existing lines. The commit contains only the gate file.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expand the ledger self-test matrix (pins, relabel, deletion, fence, floor) and rewrite the docstring</name>
  <files>.planning/planning-frontmatter-gate.py</files>
  <read_first>
.planning/planning-frontmatter-gate.py: only the regions Task 1 added (grep for
`check_phase_ledger`, `KNOWN_UNPARSEABLE_TERMINAL`, `_ledger_reject`), plus the module docstring
(lines 1-96 before Task 1's edits). Do not re-read the whole file.
  </read_first>
  <behavior>
Each case below must be verified by `check_phase_ledger` or `check_phase_ledgers`. Every derived
document goes through `mutate()`, so a stale anchor fails loudly and never silently tests an
unmutated document.
- REJECT shape (1) INDENTED: the score excerpt as an unquoted plain `result:` value inside the
  list entry. gsd-core's column-0 repair does not rescue this variant (measured `undefined`).
- REJECT shape (2) with `status: gaps_found`: the second open status.
- REJECT fix-by-relabel: shape-(2)-broken with `status: passed`, NOT pinned. An unpinned
  unparseable ledger fails at any status.
- ACCEPT with expect_prefix `NOTE:`: shape-(2)-broken, `status: passed`, pinned_status="passed".
- REJECT pinned flip: shape-(2)-broken, `status: human_needed`, pinned_status="passed".
- REJECT pinned, status line removed: shape-(2)-broken with the `status:` line deleted,
  pinned_status="passed".
- REJECT pinned, ambiguous status: shape-(2)-broken with a second column-0 `status: passed` line
  added, pinned_status="passed".
- REJECT stale unparseable pin: VALID_LEDGER_DOCUMENT with pinned_status="passed", because it
  parses now.
- REJECT fix-by-deletion: a body-only document with no fence, not pinned.
- ACCEPT with expect_prefix `NOTE:`: the same body-only document with pinned_no_frontmatter=True.
- REJECT stale no-frontmatter pin: VALID_LEDGER_DOCUMENT with pinned_no_frontmatter=True.
- REJECT unterminated fence: an opening `---` and keys, with no closing fence.
- REJECT inexact opening fence: VALID_LEDGER_DOCUMENT with its first line changed to `--- `
  (trailing space) via `mutate()`, per DD-6.
- REJECT parses but not a mapping: a bare list between fences.
- Scan-level floor: `check_phase_ledgers` pointed at an empty temp directory named `.planning`
  must exit through `fail()`. Capture its stderr with `contextlib.redirect_stderr`, exactly as the
  existing missing-file case does, so no literal `GATE FAILED:` line leaks into a passing run.
  Assert the captured text mentions the floor.
The total is 15 new `ledger:` lines, which with Task 1's 5 makes 20.
  </behavior>
  <action>
Add the 15 cases in `<behavior>` to `self_test()` using Task 1's `_ledger_reject` and
`_ledger_accept` helpers and `mutate()`. Keep each case's label beginning with a short
description, as the existing labels do.

Extend the final summary `print` in `self_test()` with one sentence covering the ledger matrix:
both incident shapes rejected from hash-pinned history, the repaired form accepted, and pins that
shrink-only and cross-check status. Leave the sentence about the existing STATE.md coverage
intact.

Rewrite the module docstring. Keep every existing paragraph's substance. Change:
- The first line: the gate now also covers phase VERIFICATION/UAT ledgers, and cites
  `260928-sph`.
- TARGET POLICY: add a PHASE-LEDGER WALK sub-section. Include the incident (Phase 38 invisible
  to audit-uat from 2026-09-23 until 260928-raq's `0801e07eb`) and the audit-uat mechanism, cited
  as measured against `@opengsd/gsd-core` 1.14.0 with the `uat.cjs`/`frontmatter.cjs` line
  numbers from `<context>`, including the note that those files are outside the repo and move on
  upgrade. Include the scope (both roots and the substring selection) and the verdict rules
  (DD-2/3/4/6). Include why `check_divergence_shapes` is not applied (DD-5), with the measured
  10/19 figure. Include the shape-(1) nuance (DD-8): the column-0 form alone is rescued by
  gsd-core's `repairAmbiguousColonValues`, so it did NOT by itself hide Phase 38; shape (2) did.
  It is rejected anyway because the gate checks the strict property, and the indented form is
  not rescued. `39-VERIFICATION.md` is the live column-0 instance, and that is why it is a pinned
  NOTE rather than an OK.
- THE LIMIT: replace "does not run against any of the other ~2400 frontmatter-bearing files" with
  an honest statement. The ledgers are now walked for parse, fence and status only, not for
  divergence shapes. Anchors, aliases and U+E000 are refused by gsd-core but accepted here
  (DD-9, 0 today). Everything else under `.planning/` is still unwalked. The body of a UAT file is
  audit-uat's concern, not this gate's.

Commit only this file:
`git add .planning/planning-frontmatter-gate.py && git commit -m "test(quick-260928-sph): cover ledger pins, relabel, deletion, fence and floor in the frontmatter gate self-test" -- .planning/planning-frontmatter-gate.py`,
with the attribution lines.
  </action>
  <verify>
    <automated>
cd /home/graysonmitchell/GameLib || exit 1
python3 -m py_compile .planning/planning-frontmatter-gate.py || exit 1
ST=$(python3 .planning/planning-frontmatter-gate.py --self-test 2>&1) || { echo "FAIL: self-test red"; printf '%s\n' "$ST" | tail -5; exit 1; }
N=$(printf '%s\n' "$ST" | grep -c '^  self-test OK: ledger:'); [ "$N" -ge 20 ] || { echo "FAIL: expected >=20 ledger self-test lines, got $N"; exit 1; }
[ "$(printf '%s\n' "$ST" | grep -c '^  self-test OK:')" -ge 38 ] || { echo "FAIL: expected >=38 self-test lines total (18 existing + 20 ledger)"; exit 1; }
printf '%s\n' "$ST" | grep -q '^GATE FAILED:' && { echo "FAIL: a captured GATE FAILED line leaked into a passing self-test"; exit 1; }
python3 .planning/planning-frontmatter-gate.py | grep -Fq 'PHASE LEDGERS: 89 walked (floor 89); 84 parsed as a mapping (15 at an open status: human_needed/gaps_found); 2 pinned no-frontmatter NOTE; 3 pinned unparseable-terminal NOTE; 0 failed.' || { echo "FAIL: live summary changed"; exit 1; }
head -5 .planning/planning-frontmatter-gate.py | grep -q '260928-sph' || { echo "FAIL: docstring head does not cite 260928-sph"; exit 1; }
echo "EXPANSION OK"
    </automated>
  </verify>
  <done>
`--self-test` exits 0 with at least 20 `ledger:` lines and at least 38 lines total, and leaks no
`GATE FAILED:` line. The live summary line is unchanged. The docstring cites 260928-sph and
records DD-5, DD-8 and the stated limits. The commit contains only the gate file.
  </done>
</task>

<task type="auto">
  <name>Task 3: Gate battery, live audit-uat re-measure, close the todo, commit as one sequence</name>
  <files>.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md, .planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md</files>
  <read_first>
.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md. Read the
whole file; its `## Fix direction` and `## Also note` sections are what the resolution note
answers.
  </read_first>
  <action>
Re-measure audit-uat live: run `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` and
record `summary.total_items`, `total_files`, `parse_gap_files` and `by_phase['38']`. The
planning-time values were 429 / 56 / 0 / 10. This task edits no ledger, so they should be
unchanged. If they differ, explain the difference by the commits since `f43a56e64` in the
SUMMARY. Do NOT edit CLAUDE.md's figure.

Close the todo. Account for two measured repo traps: `git mv` commits HEAD content and drops
unstaged edits, and a plain `mv` of a planning file can crash a planning gate until it is staged.
The ORDER is therefore:
1. `git mv` the file from `pending/` to `completed/`.
2. Edit the moved file to append a `## Resolution` section.
3. `git add` it.
4. Run `pnpm planning-gates`.
5. Commit with explicit paths.
Do all of that in one sequence. `completed/` is exempt from the todo frontmatter gate, so leave
the frontmatter as it is.

The resolution note must record, concretely:
- The quick id `260928-sph` and both Task 1/Task 2 commit SHAs.
- The shipped policy in one paragraph: 89 ledgers across both roots, parse-first, the two pin
  tables with shrink-only stale-pin failure, the status cross-check, the byte-exact fence, and the
  floor.
- That `MINIMUM_EXPECTED_GATES` stays 12 because no gate file was added. The todo listed
  `meta/runPlanningGates.py` for exactly that contingency.
- That the three terminal files were pinned, not repaired, and why that costs nothing: audit-uat
  never opens a VERIFICATION file at `passed`, and reads UAT items from the body regardless of
  status.
- The measured correction to this todo's own `## Mechanism`/`## Measured` narrative (DD-8).
  Splicing the real pre-repair bytes shows the score-only defect still reads `human_needed` under
  gsd-core 1.14.0, while the quote-only defect reads `undefined`. So the six unescaped quotes in
  `aaae8a1d2`, not the `e09fbc652` colon, are what hid Phase 38. Both shapes are still rejected.
- That the walk was widened past the todo's `.planning/phases/*` wording to the archived
  `milestones/*-phases/` dirs, because audit-uat scans them.
- That `check_divergence_shapes` is deliberately not applied to ledgers (10/19 convictions,
  including 38's own repair).
- The DD-9 limit.
- The live audit-uat re-measure, with a sentence that CLAUDE.md's 419/55 figure was left
  untouched as the todo instructs.

Both todo paths are prettier-IGNORED (measured at planning time: `ignored: true`, parser null),
so a `--check` over them would be VACUOUS. It is deliberately omitted. Say so in the SUMMARY.
Hand-match the surrounding corpus's wrap, which is about 100 columns in recent resolution notes.

Commit with explicit paths:
`git commit -m "docs(quick-260928-sph): close the phase-ledger frontmatter gate todo" -- .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md .planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md`,
with the attribution lines.

Finally, run `graphify update .` as a local step, per CLAUDE.md. `graphify-out/` is git-ignored,
so this produces no commit.
  </action>
  <verify>
    <automated>
cd /home/graysonmitchell/GameLib || exit 1
C=.planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
P=.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
npx prettier --file-info "$C" | grep -Eq '"ignored":[[:space:]]*true' || { echo "completed todo is NOT prettier-ignored -- a prettier --check is now required"; exit 1; }
NOTE=$(git show "HEAD:$C") || { echo "FAIL: todo not committed at the completed/ path"; exit 1; }
printf '%s' "$NOTE" | grep -q '^## Resolution' || { echo "FAIL: no Resolution section in the committed todo"; exit 1; }
printf '%s' "$NOTE" | grep -q '260928-sph' || { echo "FAIL: resolution note does not name the task id"; exit 1; }
printf '%s' "$NOTE" | grep -q 'aaae8a1d2' || { echo "FAIL: resolution note omits the load-bearing-shape correction"; exit 1; }
if git cat-file -e "HEAD:$P" 2>/dev/null; then echo "FAIL: todo still present at pending/ in HEAD"; exit 1; fi
python3 .planning/planning-frontmatter-gate.py > /dev/null || { echo "FAIL: gate red"; exit 1; }
pnpm planning-gates | tee /dev/stderr | grep -q '^12/12 planning gates passed' || { echo "FAIL: planning-gates not 12/12"; exit 1; }
DIRTY=$(git status --porcelain -- CLAUDE.md meta/runPlanningGates.py .planning/phases .planning/milestones) || { echo "FAIL: git status itself errored"; exit 1; }
[ -z "$DIRTY" ] || { echo "FAIL: an out-of-scope path is modified: $DIRTY"; exit 1; }
git diff --quiet f43a56e64 HEAD -- CLAUDE.md meta/runPlanningGates.py .planning/phases .planning/milestones || { echo "FAIL: an out-of-scope path was committed"; exit 1; }
echo "CLOSE OK"
    </automated>
  </verify>
  <done>
The todo is in `completed/` in HEAD, gone from `pending/`, and carries a `## Resolution` naming
260928-sph, both SHAs, the aaae8a1d2 correction and the live audit-uat numbers. `pnpm
planning-gates` reports 12/12. CLAUDE.md, the runner, and every ledger under `phases/` and
`milestones/` are byte-identical to `f43a56e64`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo planning files -> gate | Hand-edited ledger frontmatter is untrusted input to the parse. It crosses into a node subprocess on stdin. |
| gate verdict -> CI / `pnpm planning-gates` | The runner trusts the exit code alone. A printed-but-exit-0 failure is invisible. |
| future editors -> pin tables | The cheapest way to silence a red gate is to edit the gate, not the ledger. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-SPH-01 | Tampering | `KNOWN_UNPARSEABLE_TERMINAL` / `KNOWN_NO_FRONTMATTER` | high | mitigate | Pins are shrink-only: a stale pin FAILS. A module-load assert refuses open statuses in pins. Fix-by-relabel and fix-by-deletion are REJECT self-test cases, and the pinned-flip case proves the status cross-check (DD-2/3/4). |
| T-SPH-02 | Repudiation | `main()` exit path | high | mitigate | Ledger failures are merged into the ONE final `fail()`. Task 1's e2e asserts a non-zero exit on the real pre-repair file, and the negative control asserts zero on the unmodified copy. |
| T-SPH-03 | Tampering | self-test fixtures | medium | mitigate | Both excerpts are extracted programmatically and sha256-asserted before use. Every derived document goes through `mutate()`, which fails loudly on a stale anchor. |
| T-SPH-04 | Elevation of Privilege | node subprocess | low | mitigate | Reuse the existing `run_parser`: argv list, no shell, and document text on stdin. No new subprocess shape is introduced. |
| T-SPH-05 | Denial of Service | gate runtime | low | accept | About 110 node spawns at a measured ~35ms each gives roughly 4s. The runner has no timeout, and CI already runs this gate. |
| T-SPH-06 | Information Disclosure | Task 1 e2e copy under `mktemp -d` | low | mitigate | The copy holds only planning ledgers, STATE.md and ROADMAP.md (no credentials). A `trap ... EXIT` removes it. |
| T-SPH-07 | Tampering (fail-open) | node / js-yaml resolution | medium | mitigate | Reuse `find_node`/`run_parser`, which already fail loudly on a missing node, an unresolvable js-yaml, or a non-4.x version. No skip path is added. |

No package installs. No `T-SPH-SC` row applies.
</threat_model>

<verification>
- `python3 .planning/planning-frontmatter-gate.py --self-test` exits 0 with at least 20
  `ledger:` lines and at least 38 lines total.
- `python3 .planning/planning-frontmatter-gate.py` exits 0 and prints
  `PHASE LEDGERS: 89 walked (floor 89); 84 parsed as a mapping (15 at an open status: human_needed/gaps_found); 2 pinned no-frontmatter NOTE; 3 pinned unparseable-terminal NOTE; 0 failed.`
- A copied tree with the real pre-repair `38-VERIFICATION.md` spliced in is RED and names it.
  The unmodified copy is GREEN.
- `pnpm planning-gates` reports 12/12.
- CLAUDE.md, `meta/runPlanningGates.py`, and every ledger file are unchanged since `f43a56e64`.
- Formatter: both written paths are prettier-ignored (asserted in-band via `--file-info`). A
  `--check` would be vacuous and is omitted by design.
</verification>

<success_criteria>
The next hand-edit that leaves any open-status phase ledger's frontmatter unparseable turns
`pnpm planning-gates`, and therefore CI, red on the day it lands. This is proven against the real
Phase 38 incident bytes. No correct ledger is convicted, the three known-bad terminal ledgers stay
visible by name without being edited, and the todo is closed with its own narrative corrected by
measurement.
</success_criteria>

<output>
Create `.planning/quick/260928-sph-pick-up-and-resolve-the-pending-todo-at-/260928-sph-SUMMARY.md` when done. Include:
- the three commit SHAs
- the measured gate runtime
- the live audit-uat numbers
- the in-band note that both written paths are prettier-ignored, so the formatter check is omitted
- the observation that the divergence-shape check's premise has not been re-examined for STATE.md
- the observation of `38-HUMAN-UAT.md`'s boolean `status: false` (out of scope, untouched)
</output>
