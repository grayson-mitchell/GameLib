---
phase: quick-260928-raq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-VERIFICATION.md
  - .planning/ROADMAP.md
  - .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
  - .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md
autonomous: true
requirements:
  - QUICK-260928-RAQ
estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "Phase 38's ledger is audit-visible again: `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` reports `summary.by_phase['38'] == 10` and `summary.parse_gap_files == 0` (baseline at planning: key `38` ABSENT, because the frontmatter did not parse)."
    - "The syntax repair changed no content: parsed `score` equals the pre-change raw text with every doubled apostrophe read as one, and parsed `38-S08.result` equals its pre-change inner text byte for byte; the pre-change blob at `a8c6d289f` FAILS the same parse (negative control)."
    - "No open item's `blocked_by`, `why_human` or `platform_gate` still asserts the superseded premise that no Windows/Linux implementation exists (the six stale-premise phrases in the verification section). Before Task 2 the same check FAILS on the live file (negative control)."
    - "`38-E01` stays OPEN and now reads as a machine-switch cost: its `blocked_by` names the harness at `.planning/spikes/027-windows-add-child-crosscheck/app`, its `platform_gate` keeps the shipped-app anchor `src-tauri/Cargo.toml:114-128`, and a dated `spike_evidence_2026_09_28` field records what spike 027 did and did NOT establish."
    - "`38-E02` is in `human_verification_discharged` as ANSWERED, scored clause by clause against its own two-branch `expected:`, citing spikes 025/026 and the source lines behind the GtkBox finding, and stating in writing that the SHIPPED app is unchanged (`src-tauri/Cargo.toml:114-128`)."
    - "The Linux branches of `38-E03`/`38-E04` are gated on a named, existing todo file instead of the superseded premise, and `deferral_note` records that this is the one remaining deliberate exception."
    - "Three todos exist in `.planning/todos/pending/` with frontmatter the CI gate accepts, in CLAUDE.md order: the GtkBox positioning decision (minor/linux/human), the `data_store_identifier` no-op (minor/linux/human), and the missing parse gate for phase VERIFICATION/UAT frontmatter (medium/any/code)."
    - "ROADMAP.md's Phase 38 section and Phase 40's Deferred-out line, `38-HUMAN-UAT.md` and Phase 40's origin receipts all agree with the ledger's 2026-09-28 state; the older no-implementation prose stays as history and is marked as SUPERSEDED."
  artifacts:
    - ".planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs: parse-and-count harness (js-yaml 4 parse, gsd-core parser plus audit-uat cross-check, field-scoped assertions, census mode)"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md: valid YAML; 10 open / 16 discharged / 10 retired"
    - ".planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md"
    - ".planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md"
    - ".planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md"
  key_links:
    - "38-VERIFICATION.md frontmatter -> gsd-core `extractFrontmatter` (strict YAML; an unparseable block comes back as an EMPTY mapping, so `status` is undefined) -> `audit-uat` never opens its `human_needed` gate -> Phase 38 missing from `by_phase` with no error. This is the chain Task 1 repairs and every later task re-measures."
    - "The `blocked_by` of `38-E03`/`38-E04` -> the positioning todo's exact filename. That filename is the falsifiable gate: if the todo is renamed or moved without editing the ledger, the gate points at nothing. Task 3's verify checks the file exists."
    - "The discharged `38-E02` -> `40-VERIFICATION.md` `deferred[1]` receipt (`outcome_2026_09_28`). The ledger's own discharge procedure (body step 4) requires the origin receipt to record the outcome."
    - "`audit_tool_note` -> the gate-gap todo, which is the only place the absent CI coverage is recorded."
---

<objective>
Correct Phase 38's ledger items `38-E01` (Windows `add_child`) and `38-E02` (Linux `add_child`),
whose shared premise, that no Windows or Linux implementation exists, was overtaken by spikes 025,
026 and 027 on 2026-09-28. Keep every `blocked_by` falsifiable, as ROADMAP.md Phase 38 rule 2
requires. Make ROADMAP.md, `38-HUMAN-UAT.md` and Phase 40's origin receipts agree with the
corrected ledger. File the Linux defects as todos.

Purpose: the ledger is the project's only audit-visible deferred-hardware backlog. A false blocker
means an item never gets scheduled. A broken parse means the whole backlog disappears from
`audit-uat` without warning.

**A finding from planning that widens scope (measured 2026-09-28):** `38-VERIFICATION.md`'s
frontmatter is NOT valid YAML, and this is already hurting today.
- `score:` is a plain scalar that picked up a `: ` sequence in `e09fbc652` (2026-09-23).
- `38-S08`'s double-quoted `result:` picked up six unescaped double quotes in `aaae8a1d2` (2026-09-23).

Under `@opengsd/gsd-core` 1.14.0, `extractFrontmatter` returns `{}` for this file,
`parseVerificationItems` returns 0 items, and `audit-uat --raw` has NO `38` key in `by_phase`. So
none of the 11 open items is visible. I tested the two-scalar repair on a scratch copy during
planning: js-yaml 4.1.1 parses it, `extractFrontmatter` reads `status: human_needed`, and 11 items
come back. Task 1 makes that repair (syntax only, with content preservation asserted). Every later
edit depends on it: without a parse, no count in this plan can be confirmed by the tool.

**Decision on 38-E02, deliberately different from the shape the request suggested:** the item is
DISCHARGED as ANSWERED, not split into sub-items that stay open.
- Its `expected:` is a two-branch disjunction: "works the same way, OR a documented, named reason
  it cannot".
- Spike 025 answered the attach clause live: YES.
- Spike 026 answered the positioning and geometry clauses with a documented, source-confirmed,
  named reason: `GtkBox` packing.
- So no observation remains. What remains is a design decision.
- ROADMAP.md Phase 38 (line ~4700) says an item blocked on something other than hardware "does not
  belong here, because parking it would disguise a real defect as a hardware excuse". The decision
  therefore goes to a todo.

Why not make the suggested sub-items:
- A retina/scale-factor sub-item would duplicate `38-E03`, which already covers Windows/Linux HiDPI.
- The segfault and the `data_store_identifier` no-op are outside `38-E02`'s `test:`. Both were
  already observed, so they are todos, not pending observations.

`38-E03`/`38-E04` stay OPEN. Their Linux branches are re-gated on the positioning todo because,
unlike `38-E02`, they still have something to observe once a Linux layout exists. This is
reversible: move the entry back if the operator disagrees.

Output: a repaired and corrected ledger, a reusable check harness, three todos, and consistent
companion documents.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/spikes/025-linux-add-child-compile/README.md
@.planning/spikes/026-linux-add-child-runtime/README.md
@.planning/spikes/027-windows-add-child-crosscheck/README.md

Large files: read ONLY the line ranges given in each task's read_first. `38-VERIFICATION.md` is
about 51k tokens and ROADMAP.md is 5669 lines. Neither is @-included on purpose.

Facts established at planning time (re-measure; do not trust blindly):
- Anchors in `38-VERIFICATION.md`, each unique in the file:
  - `score:` is frontmatter line 5.
  - The `38-E01`..`38-E04` entries span lines 92-127.
  - `human_verification_discharged:` starts at line 259; `38-S08` is at 270-280 and its
    `result:` is line 271.
  - The last discharged entry, `38-W06`, starts at 416.
  - The frontmatter closes at line 426.
  - Unique substrings: `11 relocated items OPEN, 15 discharged`, `(Was 13 until 2026-09-26`,
    `an insert would mean the item was silently dropped.)` (the tail of the score line),
    `` cls":"selectFieldWrapper Field " ``, `` cls":"gameList" ``.
- The score line holds five doubled apostrophes (written as single-quoted-scalar escapes) and two
  lone ones: `` `260925-nxt`'s decision `` and `Phase 35's resolved`.
- `38-S08`'s `result:` holds exactly six unescaped inner double quotes, all inside the two `cls`
  fragments, and no backslashes.
- `38-HUMAN-UAT.md` frontmatter line 4 is
  `source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md deferred[0]]`.
  It does not parse because `[0]` opens a nested flow sequence. The file has exactly one line
  starting `### ` and zero column-0 `expected:`/`result:` lines.
- Census of `.planning/phases/*/*-{VERIFICATION,UAT,HUMAN-UAT}.md` frontmatter under js-yaml
  4.1.1: 78 ok, 2 with no frontmatter, 5 bad (`34.13-UAT.md`, `34.4.1-VERIFICATION.md`,
  `38-HUMAN-UAT.md`, `38-VERIFICATION.md`, `39-VERIFICATION.md`). The three outside Phase 38 carry
  terminal statuses (`complete`/`passed`/`passed`), so audit-uat would skip them even if they
  parsed. No audit consequence today.
- `src-tauri/Cargo.toml:114-128`: `tauri = { version = "2", features = ["unstable"] }` is declared
  only under `[target.'cfg(target_os = "macos")'.dependencies]`. The SHIPPED app still compiles no
  `add_child` off macOS. The spike harnesses (`.planning/spikes/025-linux-add-child-compile/app/Cargo.toml:16`,
  `.planning/spikes/027-windows-add-child-crosscheck/app/Cargo.toml:16`) request `unstable`
  unconditionally, and that is why they could serve as a feasibility implementation.
- The 027 harness has `SPIKE_AUTORUN`/`SPIKE_AUTORUN_EXIT` (main.rs:738, :794) and a Phase 8
  `data_store_identifier` isolation probe (main.rs:698). It does NOT have `SPIKE_SKIP_PROBE_B`,
  which exists only in 025's copy.
- Committed spike 025/026 evidence: `.planning/spikes/025-linux-add-child-compile/run-clean-probe-b-skipped.log`,
  `crash-segfault-journalctl.txt`, `crash-probe-b-stdout.log` and `events-export.json`. Spike
  commits: `c54e047ca` (025), `369f482a4` (026), `1fdbf91ed` (027), `a8c6d289f` (MANIFEST index).
  These logs carry real cookie VALUES. Cite cookie NAMES, file paths and line numbers only. Never
  paste a log line.
- `40-VERIFICATION.md` frontmatter parses. Its `deferred:` array has 6 entries. Entry 0 (line 101)
  is the 38-E01 receipt and entry 1 (line 104) is the 38-E02 receipt, with keys
  `truth`/`addressed_in`/`evidence`. Its `status` is `gaps_closed_partially`, so audit-uat does not
  read it.
- `.prettierignore` lists `.planning`, so `npx prettier --check <.planning path>` silently skips
  and prints a green line. For the `.md` paths here that check is VACUOUS. It still runs for
  CLAUDE.md compliance and is recorded as vacuous. The new `.cjs` gets a REAL check through
  `--ignore-path /dev/null`.
- `pnpm planning-gates` runs 12 gates in about 2s. None of them parses phase VERIFICATION/UAT
  frontmatter: `planning-frontmatter-gate.py` targets only STATE.md and ROADMAP.md.

YAML-writing rules for every value this plan adds or changes:
- Write each value either double-quoted (escape inner double quotes with a backslash, and write no
  other backslash) or single-quoted (double every apostrophe).
- Match the style of the neighbouring fields.
- Run `ledger-check.cjs` after each sub-step whenever in doubt. It reports the parser's line and
  column.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer. Make the Phase 38 ledger parse again, prove the parse-to-audit chain end to end, and build the harness every later edit is checked with</name>
  <files>.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md</files>
  <precondition>`~/.claude/gsd-core/bin/gsd-tools.cjs`, `~/.claude/gsd-core/bin/lib/uat.cjs` and `~/.claude/gsd-core/bin/lib/frontmatter.cjs` exist, and `node_modules/js-yaml/package.json` reports a 4.x version.</precondition>
  <read_first>
    - 38-VERIFICATION.md lines 1-12 (`score`, `audit_tool_note`, `purpose`, `deferral_note`, `relocation_rules`) and lines 259-281 (`38-S06`, `38-S08`)
    - 38-HUMAN-UAT.md lines 1-36
    - .planning/planning-frontmatter-gate.py lines 1-40 (its purpose statement is this exact failure, for STATE.md)
    - .planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md (the house todo shape)
  </read_first>
  <action>
Step 0, baseline. Run `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` from the repo root
and record in the SUMMARY:
- whether `summary.by_phase` has a `38` key (expected: absent);
- `summary.total_items` (419 at planning);
- `summary.total_files` (55 at planning).

Step 1, write `ledger-check.cjs` in this quick task's directory.
- Format: CommonJS. Dependencies: node built-ins, the repo's `node_modules/js-yaml`, and gsd-core's
  `uat.cjs`/`frontmatter.cjs` loaded from `os.homedir()`.
- Header comment: say why the harness exists (the ledger went invisible to audit-uat when its
  frontmatter stopped parsing), give usage for each flag, and state that it is a quick-task harness,
  not a CI gate.
- Paths:
  - Repo root is `path.resolve(__dirname, '../../..')`.
  - The ledger is `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`.
  - The HUMAN-UAT file is its sibling `38-HUMAN-UAT.md`.
  - The Phase 40 file is the single match of `.planning/phases/40-*/40-VERIFICATION.md`. FAIL
    unless exactly one file matches.
- Version check: FAIL unless js-yaml's `package.json` version starts with `4.`. This mirrors
  `planning-frontmatter-gate.py`'s parser choice.
- Frontmatter extraction: the lines between a first line equal to `---` and the next line equal to
  `---`.
- Output and exit code:
  - Collect ALL results. Print one line per check: `PASS <check>`, `FAIL <check>: <detail>`, or
    `SKIP <check>: <reason>`.
  - A SKIP is never counted as a pass.
  - Exit 1 if any check FAILs, otherwise exit 0.
  - A YAML error prints `FAIL frontmatter-parse: <js-yaml reason, line and column>`.

Ledger mode (the default). `--open N`, `--discharged N` and `--retired N` are all required.
- Assert the lengths of `human_verification`, `human_verification_discharged` and
  `human_verification_retired`.
- Assert `status === 'human_needed'`.
- Assert every `id` is unique across all three arrays.
- gsd-core cross-check:
  - `extractFrontmatter(content, path).status` must be `human_needed`. This is the reader whose
    empty-mapping fallback hid the ledger.
  - `parseVerificationItems(content, 'human_needed', path).length` must equal `--open`.
- audit-uat check:
  - Run `execFileSync('node', [<home>/.claude/gsd-core/bin/gsd-tools.cjs, 'audit-uat', '--raw'], { cwd: root })`
    and parse the JSON.
  - Assert `summary.by_phase['38'] === open` and `summary.parse_gap_files === 0`.
  - Print `summary.total_items`.
- `--rev <commit>`: read the ledger from `git show <commit>:<ledger path>` instead of disk. The
  audit-uat check then prints SKIP, because audit-uat reads only the live tree.
- `--open-ids <csv>`: the set of `human_verification` ids must equal the list.
- `--discharged-includes <csv>`: each id must be in the discharged array with a non-empty string
  `result`.
- `--includes <scope>=<substring>` (repeatable):
  - Split at the FIRST `=`.
  - `scope` is one of `open:<id>:<field>`, `discharged:<id>:<field>`, `retired:<id>:<field>` or
    `top:<key>`.
  - Assert the field is a string that contains the substring.
- `--no-stale-premise`:
  - For every `human_verification` entry, `blocked_by`, `why_human` and `platform_gate` must not
    contain, case-insensitively, any phrase in a `STALE_PREMISE` array.
  - Fill `STALE_PREMISE` by copying, character for character, the six phrases listed under
    "Stale-premise phrases" in this plan's verification section.
  - Report every hit as `FAIL stale-premise: <id>.<field>`.
  - The check is field-scoped on purpose. History fields that quote a superseded value verbatim are
    NOT scanned.
- `--human-uat`: `38-HUMAN-UAT.md` frontmatter parses to a mapping, and its `source` is an array of
  exactly 3 strings.
- `--origin40`: the Phase 40 frontmatter parses, `deferred` has exactly 6 entries, and the entries
  whose `evidence` contains `38-E01` and `38-E02` each carry a non-empty string
  `outcome_2026_09_28`.
- `--syntax-preserved-from <commit>`:
  - From that commit's blob, take the raw text after `score: ` on the frontmatter line that starts
    with it.
  - From the same blob, take the raw inner text of `38-S08`'s `result:` line, meaning everything
    between the `"` that opens after `result: ` and the line's final `"`.
  - Assert the parsed `score` equals the raw score with every doubled apostrophe replaced by a
    single one.
  - Assert the parsed `38-S08` `result` equals the raw inner text exactly.
- `--census [--expect-bad N]`:
  - Walk every directory under `.planning/phases/` for files matching
    `/-(VERIFICATION|UAT|HUMAN-UAT)\.md$/`.
  - Print ok / no-frontmatter / bad counts, and each bad file with the parser's reason.
  - Run no ledger checks in this mode.
  - With `--expect-bad`, FAIL unless the bad count equals N.

Format the script with `npx prettier --write --ignore-path /dev/null <script>`.

Step 2, repair `38-VERIFICATION.md` with SYNTAX-ONLY edits. Use the Edit tool and the unique
anchors listed in context.
- (a) Turn `score:` into a single-quoted scalar:
  - Insert one apostrophe immediately after `score: `.
  - Append one apostrophe after the closing `dropped.)` at the end of that line.
  - Double the two lone apostrophes (`260925-nxt`'s → `260925-nxt`''s, and `Phase 35's` →
    `Phase 35''s`).
  - Leave the five existing doubled pairs alone. They were always written as escapes and now parse
    as one apostrophe each.
- (b) In `38-S08`'s `result:` only, put a backslash in front of each of the six inner double quotes
  in the two `cls` fragments. No other character in the file changes in this step.

Step 3, repair `38-HUMAN-UAT.md` line 4 so that each of the three `source:` elements is its own
double-quoted string. The text of each element is unchanged. Nothing else in the file changes in
this task.

Step 4, confirm the tracer path.
- Run `ledger-check.cjs --open 11 --discharged 15 --retired 10 --human-uat --syntax-preserved-from a8c6d289f`.
- It must pass and must show audit-uat `by_phase['38'] === 11`. That is the first confirmation
  under gsd-core that this ledger is visible at all.
- Record in the SUMMARY the new `total_items` (expected 430 = 419 + 11).

Step 5, append a dated amendment to `audit_tool_note`. It is a single-quoted scalar, so double
every apostrophe you write. The amendment starts with `AMENDED 2026-09-28 (quick 260928-raq):` and
states:
- This is a THIRD silent failure mode, measured, and it had already happened.
- The tool the note names is not on PATH on this machine. Its successor is
  `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` (`@opengsd/gsd-core` 1.14.0).
- That successor reads frontmatter with a STRICT YAML parse. An unparseable block comes back as an
  EMPTY mapping, so `status` is undefined, the `human_needed` gate never opens, and the phase drops
  out of `by_phase` with no error and no `parse_gap`.
- This file had been invalid YAML since `e09fbc652` (2026-09-23), when `score:` gained a colon-space
  sequence as a plain scalar, and `aaae8a1d2` (2026-09-23) added six unescaped double quotes inside
  `38-S08`'s double-quoted `result:`.
- On 2026-09-28 gsd-core read 0 of the 11 open items.
- Both scalars were repaired syntax-only, with parsed content asserted equal to the written text,
  and the tool confirmed it: `by_phase["38"]` went from absent to 11.
- The score history's "Confirmed at the tool" counts dated 2026-09-25 and 2026-09-26 came after the
  break. A strict reader cannot have produced them from this file, so they came from a more lenient
  reader that can no longer be re-run. Label this as an INFERENCE, not a measurement.
- Nothing gates this. Name the todo filed in Step 7 by its exact filename.
- After any edit to this file, run `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs`
  before trusting a count.

Step 6, run `ledger-check.cjs --census`.
- Expected: 80 ok, 2 with no frontmatter, 3 bad (`34.13-UAT.md`, `34.4.1-VERIFICATION.md`,
  `39-VERIFICATION.md`).
- Record the measured numbers. If they differ, investigate before proceeding. Do not force them.

Step 7, create `.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md`.
- Frontmatter, in this order:
  - `created: 2026-09-28`
  - a `title` stating that no gate parses phase VERIFICATION/UAT frontmatter, and that Phase 38's
    ledger was invalid YAML from 2026-09-23 while gsd-core audit-uat silently read 0 of its 11 open
    items
  - `found_during: quick 260928-raq`
  - `severity: medium`
  - `platform: any` (immediately after `severity:`)
  - `ready: code` (immediately after `platform:`)
  - `area: planning-records`
  - a `files` list: `.planning/planning-frontmatter-gate.py`, `meta/runPlanningGates.py`, and the
    three still-invalid files
- Body sections:
  - Mechanism: the extractFrontmatter → status → human_needed gate → by_phase chain.
  - Measured:
    - baseline absent → 11 after the repair;
    - the census before (78/2/5) and after (your measured numbers);
    - the reproducible command `node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --census`;
    - the three remaining bad files are terminal-status, so there is no audit consequence today.
  - Why medium: the one live instance is fixed, but this ledger is edited by nearly every Phase 38
    quick and will break again unseen.
  - Fix direction: extend `planning-frontmatter-gate.py`'s TARGET POLICY. At minimum, cover any
    phase VERIFICATION/UAT file whose `status` is `human_needed` or `gaps_found`, where a parse
    failure silently drops items. Include a REJECT self-test built from this incident's two shapes,
    and raise `MINIMUM_EXPECTED_GATES` only if a new gate file is added. CLAUDE.md says a gate is a
    deliberate decision on its merits. The merits here are that the existing gate was written for
    this exact failure on STATE.md.
  - Also note: CLAUDE.md's UAT-section figure "419 outstanding items across 55 files" was measured
    while Phase 38 was invisible, so it excludes Phase 38. It is a dated measurement. Re-measure
    before quoting it; do not edit it from this todo.
- Do not put a closing-tag-shaped token (a less-than sign followed by a slash) anywhere in the body.
  The envelope-tag gate flags them.

Commit: stage exactly this task's four files and confirm `git diff --cached --name-only` lists
those four and nothing else. Then commit as `docs(quick-260928-raq): repair Phase 38 ledger YAML so audit-uat can see it again, add ledger-check harness`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m && node $Q/ledger-check.cjs --open 11 --discharged 15 --retired 10 --human-uat --syntax-preserved-from a8c6d289f --includes 'top:audit_tool_note=260928-raq' --includes 'top:audit_tool_note=2026-09-28-no-gate-parses-phase-verification-frontmatter.md' && if node $Q/ledger-check.cjs --rev a8c6d289f --open 11 --discharged 15 --retired 10 >/dev/null 2>&1; then echo 'NEGATIVE CONTROL DID NOT FAIL (pre-change blob)'; exit 1; fi && node $Q/ledger-check.cjs --rev a8c6d289f --open 11 --discharged 15 --retired 10 2>&1 | grep -q 'FAIL frontmatter-parse' && if node $Q/ledger-check.cjs --open 11 --discharged 15 --retired 10 --no-stale-premise >/dev/null 2>&1; then echo 'NEGATIVE CONTROL DID NOT FAIL (stale premise must still be present before Task 2)'; exit 1; fi && node $Q/ledger-check.cjs --census --expect-bad 3 && T=.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md && grep -A2 -x 'severity: medium' $T | tr '\n' '|' | grep -qx 'severity: medium|platform: any|ready: code|' && pnpm -s planning-gates && npx prettier --check --ignore-path /dev/null $Q/ledger-check.cjs && npx prettier --check .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md $T</automated>
  </verify>
  <done>
- audit-uat shows `by_phase['38'] === 11` (baseline: absent) and `parse_gap_files === 0`.
- The pre-change blob FAILS with `FAIL frontmatter-parse`.
- `--no-stale-premise` FAILS on the live file. This is the pre-Task-2 negative control.
- Parsed content matches the pre-change raw text.
- The census reports 3 bad.
- The gate-gap todo passes the CI vocabulary gate in CLAUDE.md order.
- planning-gates reports 12/12.
- The `.cjs` prettier check is real. The `.md` checks are vacuous because `.prettierignore`
  excludes `.planning`, and the SUMMARY says so.
  </done>
</task>

<task type="auto">
  <name>Task 2: Narrow 38-E01 to a live-Windows cost, discharge 38-E02 as ANSWERED, re-gate the Linux branches of 38-E03/38-E04, update the Phase 40 receipts, and file the two Linux todos</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-VERIFICATION.md, .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md, .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md</files>
  <reversibility rating="reversible">Discharging 38-E02 is a move between two arrays in one file. Moving the entry back (and re-running ledger-check with the old counts) fully reverses it.</reversibility>
  <read_first>
    - 38-VERIFICATION.md lines 1-12 again (Task 1 changed `score` and `audit_tool_note`), lines 92-128 (38-E01..38-E04 and the start of `sweep_notes`), and lines 406-426 (the last discharged entries and the frontmatter close)
    - 40-VERIFICATION.md lines 100-118 (the `deferred:` receipts)
    - .planning/spikes/MANIFEST.md lines 360-413 (Idea C requirements, including the "Open before shipping" bullet and the three 2026-09-28 bullets)
    - the three spike READMEs (already in context)
  </read_first>
  <action>
Sub-step A: create the two Linux todos FIRST, because the ledger will cite their exact filenames.
Both use the frontmatter order of Task 1's todo, with these values:
- `found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq`
- `severity: minor`
- `platform: linux` (immediately after `severity:`)
- `ready: human` (immediately after `platform:`)
- `area: store-embed`

Todo A1: `2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`.
- Title: on Linux an `add_child` store embed cannot be positioned. `set_bounds` is a silent no-op
  because Tauri packs `WindowChild` webviews into the window's shared `GtkBox`. The Linux layout
  strategy must be decided before the embed is un-gated there.
- `files`: `src-tauri/Cargo.toml`, `.planning/spikes/026-linux-add-child-runtime/README.md`,
  `.planning/spikes/025-linux-add-child-compile/app/src/main.rs`.
- Body, Mechanism:
  - `tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192`: `WebviewKind::WindowChild` is packed into
    `default_vbox()` on every non-Windows/macOS/iOS/Android target. The main webview uses the same
    box (`:5210-5215`).
  - `wry-0.57.0/src/webkitgtk/mod.rs:687-717`: `add_to_container` gives a `GtkBox` parent
    `pack_start`, and only a `GtkFixed` parent gets `is_in_fixed_parent`.
  - `:963-983`: `set_bounds` writes only when `is_in_fixed_parent`, and otherwise returns Ok having
    written nothing.
- Body, Measured (spike 026 steps 1-3):
  - The readback straight after `add_child` was {0,0,0,0}.
  - Both webviews were pinned at {x:0,y:0,w:1280,h:450}, an even split of a 900px window.
  - Three requested rects all returned Ok with an identical readback.
  - Cite `run-clean-probe-b-skipped.log` by path only.
- Body, Why minor: the SHIPPED embed is macOS-only (`src-tauri/Cargo.toml:114-128`; Phase 40
  D-01/D-03), so nothing live is affected. This is a design wall for any future Linux store tab.
- Body, The decision (options, not a recommendation):
  - (a) a layout strategy that works with GTK box packing (spike 026's option a);
  - (b) a tauri-runtime-wry change, upstream or forked, that puts Linux `WindowChild` webviews in a
    `GtkFixed`. wry's `add_to_container` already supports a `GtkFixed` parent;
  - (c) a separate top-level Window per store. CONSTRAINED: a second `Window` holding two child
    webviews segfaulted natively in `libwebkit2gtk-4.1.so.0.19.7` in 2 of 2 runs, at the identical
    offset. See spike 026 step 4 and `.planning/spikes/025-linux-add-child-compile/crash-segfault-journalctl.txt`.
    The crash is not root-caused. The single-embed-on-the-main-window shape was clean with that
    phase skipped. Do not choose (c) until the crash is understood;
  - (d) the status quo: Linux keeps the Phase 40 non-macOS panel (plan 40-10) and gets no embed.
  - The segfault is recorded HERE, not as its own todo: it is reachable only through option (c),
    and a standalone todo would have no trigger.
- Body, What this gates:
  - the LINUX branches of Phase 38 ledger items `38-E03` and `38-E04`, whose `blocked_by` names
    this exact filename;
  - when the decision lands, re-scope those two branches in the ledger in the same change.
- Body, Falsifiable re-open: if a future tauri-runtime-wry stops packing `WindowChild` into
  `default_vbox()`, or wry's `set_bounds` drops the `is_in_fixed_parent` gate, re-run spike 025's
  bounds round-trip before assuming anything.

Todo A2: `2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`.
- Title: on Linux, `data_store_identifier` per-store cookie isolation is a silent no-op, and every
  webview shares one `WebKitWebContext`. Decide the Linux isolation story before an embed ships
  there. Windows parity is unverified.
- `files`: `.planning/spikes/026-linux-add-child-runtime/README.md`, `.planning/spikes/MANIFEST.md`,
  `.planning/spikes/027-windows-add-child-crosscheck/app/src/main.rs`.
- Body, Mechanism:
  - `wry-0.57.0/src/lib.rs:2479-2481`: `fetch_data_store_identifiers` is hard-coded to the macOS
    `wkwebview` backend.
  - The builder field is declared as cross-platform (`lib.rs:1581/1620/1639`).
  - Spike 026 grepped `webkitgtk/mod.rs` and found it never reads the field.
- Body, Measured: spike 026 step 5. The `isolatedStore` embed saw all 10 shared-jar cookies,
  including every `store.steampowered.com` and `gog.com` cookie. Cite names and paths only.
- Body, What it contradicts:
  - MANIFEST's Idea C requirement "Per-store isolation works on children via
    `data_store_identifier` (macOS 14+)" is true on macOS and has no Linux equivalent.
  - This settles spikes 015/018's "Windows/Linux parity unverified" caveat for Linux, in the
    negative.
- Body, Why minor: the same shipped-app gate as A1.
- Body, The decision:
  - accept one shared jar on Linux and document the hygiene cost;
  - a wry/tauri-runtime-wry change so the GTK backend honours the identifier (for example a
    per-identifier web context). Label this as an unverified option;
  - keep Linux off the embed.
- Body, Windows: UNVERIFIED. Spike 027 only type-checked the call. The `38-E01` sitting runs the
  027 harness, whose autorun Phase 8 (`.planning/spikes/027-windows-add-child-crosscheck/app/src/main.rs:698`)
  exercises exactly this. Record that result HERE, not against `38-E01`.

Sub-step B: correct `38-E01` IN PLACE.
- Keep `id`, `test`, `expected`, `origin_phase`, `origin_item` and `prior_state` verbatim.
- Insert a new field `spike_evidence_2026_09_28` directly after `id:`. This follows the precedent
  of `38-S14`'s `sitting_5_2026_09_26`. It states:
  - NARROWED, NOT DISCHARGED. Nothing ran on Windows; spikes 025-027 all ran from a Linux session.
  - ANSWERED: the compile-level question only. Spike 027 (`1fdbf91ed`) ran
    `cargo check --target x86_64-pc-windows-gnu` over spike 016's unmodified harness. It finished
    clean and type-checked every `add_child`/`WebviewBuilder`/`data_store_identifier`/`on_page_load`
    call against the real `webview2-com`/`windows` crates.
  - NOT type-checked: the MSVC triple that `release-tauri.yml` ships. That attempt stopped at
    resource embedding on a missing `llvm-rc` on the Linux host, before `main.rs` compiled. This is
    a tooling gap, not a code finding. A native Windows build uses MSVC by default and answers it
    for free.
  - Source reading NARROWS the runtime question but does not close it. `wry-0.57.0/src/webview2/mod.rs:230-274`
    creates a `WS_CHILD` HWND, and `:1526-1553` `set_bounds` is an unconditional `SetWindowPos`.
    That is the macOS family, not Linux's `GtkBox` family, so do NOT assume spike 026's Linux
    positioning no-op carries over.
  - Spike 026 is also the standing warning against closing on source alone: on Linux, a generic
    builder field was silently ignored at runtime.
  - Quote the pre-change `blocked_by` value verbatim, and say it named an implementation gap that
    the harness at `.planning/spikes/027-windows-add-child-crosscheck/app/` closes for THIS item's
    question.
  - The harness's autorun also runs a `data_store_identifier` isolation phase. Record what it shows
    in Todo A2 by filename; it is NOT scored here.
  - Evidence: `.planning/spikes/027-windows-add-child-crosscheck/README.md`,
    `.planning/spikes/026-linux-add-child-runtime/README.md`, and `.planning/spikes/MANIFEST.md`
    (Idea C).
- Replace `why_human`:
  - It requires a live Windows host running WebView2, and nothing else stands in front of the
    observation.
  - Neither the compile-level answer nor the source reading observes attach, placement at a slot
    rect, or geometry tracking. Spike 026 showed that an API accepting a call and returning Ok is
    not evidence that it did anything.
  - It remains a NAMED UNKNOWN (D-04) until a live run.
- Replace `blocked_by` with a machine-switch COST. It must start with the words `machine switch`,
  and it says:
  - boot the Windows machine (OWNED and available);
  - run `cargo run` natively in `.planning/spikes/027-windows-add-child-crosscheck/app/` with
    `SPIKE_AUTORUN=1` (add `SPIKE_AUTORUN_EXIT=1` for an unattended exit) — the same autorun that
    spikes 016 and 025 used;
  - the compile-level question is answered (spike 027); the cost is the switch, not an
    implementation.
- Replace `platform_gate` with two greppable anchors:
  - SHIPPED APP, unchanged: `src-tauri/Cargo.toml:114-128` declares the `unstable` feature only
    under the macOS target table, so GameLib's own Windows build compiles no `add_child`.
  - FEASIBILITY HARNESS: `.planning/spikes/027-windows-add-child-crosscheck/app/Cargo.toml:16`
    requests `unstable` unconditionally, which is why the harness, not the shipped app, is the
    artifact this item runs.
  - Also: WebView2 exists only on Windows (`wry-0.57.0/src/webview2/`), so the runtime half cannot
    be reached from macOS or Linux by construction.
  - FALSIFIABLE: if the shipped app ever un-gates `unstable` for Windows, run this item against the
    shipped build instead.

Sub-step C: DISCHARGE `38-E02`.
- Remove its entry from `human_verification`.
- Append it at the END of `human_verification_discharged`, after `38-W06`. The arrays are in
  arrival order.
- Field order: `id`, then `result`, then a new `premise_correction_2026_09_28`, then every original
  field VERBATIM (`test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`,
  `origin_item`, `prior_state`).

The `result` starts with `ANSWERED --` and states:
- It was discharged by quick `260928-raq` on 2026-09-28 from SPIKE evidence, not from an operator
  sitting.
- It is scored clause by clause against this item's own two-branch `expected:`.
- Setting: observed LIVE and natively on the operator's own Pop!_OS 22.04 desktop
  (`libwebkit2gtk-4.1.so.0.19.7`), unattended under `SPIKE_AUTORUN=1`, and read from the harness's
  own event log. Every clause is a programmatic readback, not an eye-based judgement.
- Artifact: spike 016's unmodified harness, rebuilt as `.planning/spikes/025-linux-add-child-compile/app/`
  (`c54e047ca`; runtime findings `369f482a4`).
- CLAUSE 1, attach: YES.
  - `add_child` on the config-created main window returned Ok in 2ms.
  - A real `store.steampowered.com` page loaded, and `on_navigation`/`on_page_load` fired.
  - `cookies()` read back the real cookies it set. Give cookie names only.
- CLAUSE 2, sized or positioned to a slot rect: NO. The documented, named reason the `expected:`
  asks for is source-confirmed: `tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192` plus
  `wry-0.57.0/src/webkitgtk/mod.rs:963-983` (`is_in_fixed_parent`, set by `:687-717` only for a
  `GtkFixed`). Three requested rects all read back {x:0,y:0,w:1280,h:450}.
- CLAUSE 3, ResizeObserver-visible geometry updates: NO, for the same reason. There is no placed
  rect to update.
- X11 vs Wayland:
  - The live run used one display session, and spike 025/026 did not record its type.
  - The named reason sits in GTK widget packing, which the cited source does not branch on by
    display server.
  - So it holds for both BY SOURCE, not by a second live run.
- WHAT THIS DOES NOT CLAIM: the SHIPPED app is unchanged. `src-tauri/Cargo.toml:114-128` still
  gates `unstable` to macOS. This discharge answers the D-04 backend-feasibility question the item
  was filed to ask; it does not claim that GameLib has a Linux embed.
- NOT SCORED HERE (outside `test:`): the `data_store_identifier` no-op and the second-Window
  segfault. Name Todo A2 and Todo A1 by filename.
- The follow-on design decision is not an observation. Quote ROADMAP Phase 38's principle that an
  item blocked on something other than hardware does not belong in this ledger, and name Todo A1.
- Evidence: `.planning/spikes/025-linux-add-child-compile/README.md`,
  `.planning/spikes/026-linux-add-child-runtime/README.md`, and `.planning/spikes/MANIFEST.md`
  (Idea C).

The `premise_correction_2026_09_28` field says:
- The `why_human` and `blocked_by` below are kept VERBATIM as filed and are SUPERSEDED for this
  item's question.
- They assumed a Linux-gated implementation had to land in `src-tauri` first. It did not: spike
  016's harness requests `unstable` unconditionally (`.planning/spikes/025-linux-add-child-compile/app/Cargo.toml:16`),
  so it already was a Linux feasibility implementation, and it built natively with zero source
  changes.
- They remain TRUE of the shipped app, which is not what this item asked.

Sub-step D: re-gate `38-E03` and `38-E04` IN PLACE.
- Keep `test`, `expected`, `origin_phase`, `origin_item` and `prior_state` verbatim.
- For each, add `regated_2026_09_28` directly after `id:`. It says what changed and why (spikes
  025-027), and quotes every replaced value verbatim.
- `38-E03`, replace `blocked_by` with a per-branch statement:
  - (a) additional macOS displays: display availability only, runnable today;
  - (b) Windows HiDPI: a machine switch, meaningful only once `38-E01`'s live sitting has shown a
    child placed at a slot rect on WebView2;
  - (c) Linux HiDPI: NOT a cost. `add_child` cannot place a child at a slot rect on Linux at all
    (spike 026), so there is no slot geometry to scale until the decision in
    `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`
    lands. Branch (c) is the deliberate exception recorded in `deferral_note`.
- `38-E03`, replace `platform_gate` with per-branch anchors:
  - shipped app `src-tauri/Cargo.toml:114-128` (branches b and c need a non-macOS implementation
    before a shipped-app run; the spike harnesses are feasibility probes);
  - Linux `tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192` plus `wry-0.57.0/src/webkitgtk/mod.rs:963-983`
    (while both hold, no Linux slot rect exists);
  - macOS display variety is orthogonal and testable today.
- `38-E04`, replace `why_human`, `blocked_by` and `platform_gate` in the same per-branch shape:
  - other macOS hardware: runnable against the shipped embed today;
  - Windows: first needs a child placed at a slot rect on WebView2 (`38-E01`);
  - Linux: no slot to drag at all (the `set_bounds` no-op). Its `blocked_by` names the same todo
    filename.
  - Keep the existing reference to plan 40-11's Item 3.
- None of the replaced fields may contain any of the six stale-premise phrases in this plan's
  verification section.

Sub-step E: append to `deferral_note`, single-quoted, starting `AMENDED AGAIN 2026-09-28 (quick 260928-raq):`. It says:
- `38-E01`'s `blocked_by` now states a cost.
- `38-E02` left the array.
- ONE partial exception remains, and it is deliberate: the LINUX branches of `38-E03`/`38-E04`
  name a design-decision todo, not a cost.
- They stay in the array because, unlike `38-E02`, they still have something to observe once a
  Linux layout exists. Moving them to a todo would hide an un-run half, which is exactly what
  relocation_rules (4) exists to prevent.

Sub-step F: update `score`. It is single-quoted since Task 1, so double every apostrophe you write.
- (1) Change the unique text `11 relocated items OPEN, 15 discharged` to
  `10 relocated items OPEN, 16 discharged`.
- (2) Insert a new clause IMMEDIATELY BEFORE the unique text `(Was 13 until 2026-09-26`. The
  clause opens `(Was 11 until 2026-09-28, when quick 260928-raq` and says:
  - `38-E02` was DISCHARGED as ANSWERED from spike 025/026 evidence, not from a sitting. Attach
    works; positioning cannot, for a documented, source-confirmed reason, which is the second
    branch of the item's own `expected:`.
  - `38-E01` was NARROWED in place, not discharged.
  - Confirmed at the tool: gsd-core audit-uat `by_phase["38"]` moved 11 -> 10.
  - This is the FIRST such confirmation under gsd-core. The same quick found the frontmatter
    invalid since `e09fbc652`, and the step from absent to 11 was the syntax repair (see
    `audit_tool_note`).
  - Close the clause with `.)` and a space.

Sub-step G: in `40-VERIFICATION.md`, add a double-quoted `outcome_2026_09_28` field to two
`deferred:` entries. Change nothing else.
- The entry whose `evidence` names `38-E01`: NARROWED, not closed. Spike 027 type-checked
  `add_child` against WebView2 from a Linux host. `38-E01` stays OPEN for a live Windows run. The
  evidence clause above stays true of the shipped app (`src-tauri/Cargo.toml:114-128`).
- The entry whose `evidence` names `38-E02`: ANSWERED and DISCHARGED from `38-VERIFICATION.md` by
  quick 260928-raq. `add_child` attaches and loads on Linux webkit2gtk (spike 025) but cannot be
  positioned at a slot rect (spike 026, source-confirmed `GtkBox` packing). The `truth` above is
  therefore only PARTLY true. The follow-on decision is Todo A1, by filename.
- This carries out the ledger body's discharge procedure, step 4.

After each sub-step from B onward, run ledger-check with the counts that sub-step leaves:
- after C and later: `--open 10 --discharged 16`;
- before C: `--open 11 --discharged 15`.
Record the audit-uat move 11 -> 10 in the SUMMARY.

Commit: stage exactly the four files, confirm `git diff --cached --name-only`, then commit as
`docs(quick-260928-raq): narrow 38-E01, discharge 38-E02 as answered, re-gate 38-E03/E04 Linux branches, file Linux embed todos`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m && P=2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md && node $Q/ledger-check.cjs --open 10 --discharged 16 --retired 10 --human-uat --origin40 --no-stale-premise --open-ids 38-W04,38-W05,38-S04,38-S10,38-S12,38-S14,38-S16,38-E01,38-E03,38-E04 --discharged-includes 38-E02 --includes 'discharged:38-E02:result=ANSWERED' --includes 'discharged:38-E02:result=src-tauri/Cargo.toml:114-128' --includes 'discharged:38-E02:result=.planning/spikes/025-linux-add-child-compile/README.md' --includes 'discharged:38-E02:result=.planning/spikes/026-linux-add-child-runtime/README.md' --includes 'discharged:38-E02:result=tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192' --includes 'discharged:38-E02:result=wry-0.57.0/src/webkitgtk/mod.rs:963-983' --includes 'discharged:38-E02:premise_correction_2026_09_28=.planning/spikes/025-linux-add-child-compile/app/Cargo.toml:16' --includes 'open:38-E01:blocked_by=machine switch' --includes 'open:38-E01:blocked_by=.planning/spikes/027-windows-add-child-crosscheck/app' --includes 'open:38-E01:platform_gate=src-tauri/Cargo.toml:114-128' --includes 'open:38-E01:spike_evidence_2026_09_28=.planning/spikes/027-windows-add-child-crosscheck/README.md' --includes 'open:38-E01:spike_evidence_2026_09_28=wry-0.57.0/src/webview2/mod.rs' --includes "open:38-E03:blocked_by=$P" --includes "open:38-E04:blocked_by=$P" --includes 'open:38-E03:regated_2026_09_28=260928-raq' --includes 'open:38-E04:regated_2026_09_28=260928-raq' --includes 'top:deferral_note=AMENDED AGAIN 2026-09-28' --includes 'top:score=10 relocated items OPEN, 16 discharged' --includes 'top:score=(Was 11 until 2026-09-28' && for f in .planning/todos/pending/$P .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md; do test -f "$f" && grep -A2 -x 'severity: minor' "$f" | tr '\n' '|' | grep -qx 'severity: minor|platform: linux|ready: human|' || { echo "todo frontmatter wrong: $f"; exit 1; }; done && grep -q 'crash-segfault-journalctl.txt' .planning/todos/pending/$P && pnpm -s planning-gates && npx prettier --check .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-VERIFICATION.md .planning/todos/pending/$P .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md</automated>
  </verify>
  <done>
- The ledger parses, with 10 open, 16 discharged and 10 retired.
- audit-uat `by_phase['38']` moved 11 -> 10 and `parse_gap_files` is 0.
- `--no-stale-premise` now PASSES. In Task 1 it FAILED on the same file.
- 38-E02's discharge scores all three clauses and states the shipped-app limit.
- 38-E01 reads as a machine-switch cost that names the harness path.
- The Linux branches of 38-E03/E04 name the positioning todo.
- Both Phase 40 receipts carry `outcome_2026_09_28`, and `deferred` still has 6 entries.
- Both Linux todos pass the vocabulary gate in CLAUDE.md order, and the positioning todo records
  the segfault constraint.
- planning-gates reports 12/12. The `.md` prettier checks are vacuous, and the SUMMARY says so.
  </done>
</task>

<task type="auto">
  <name>Task 3: Make ROADMAP.md and 38-HUMAN-UAT.md agree with the corrected ledger, keeping the superseded prose as marked history</name>
  <files>.planning/ROADMAP.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md</files>
  <read_first>
    - .planning/ROADMAP.md lines 4636-4711 (the Phase 38 section) and lines 5063-5072 (Phase 40's "Deferred out, not closed")
    - 38-HUMAN-UAT.md lines 1-36 and its last 30 lines
  </read_first>
  <action>
ROADMAP.md, four scoped Edits. Never use Write on this file. Keep all existing prose; mark it
rather than delete it.

1. Insert a new paragraph, followed by a blank line, immediately BEFORE the paragraph that starts
   `**Items: 23 OPEN as of 2026-09-23, plus 2 DISCHARGED and 9 RETIRED.**`.
   - It opens with `**Items: 10 OPEN as of 2026-09-28, plus 16 DISCHARGED and 10 RETIRED**` and
     cites quick `260928-raq`.
   - It says the ledger's `score:` carries every intermediate count, so the older paragraphs are
     historical.
   - It records the two changes, neither of them from a sitting:
     - `38-E02` was discharged as ANSWERED. Spike 025: attach, a real store page load and cookie
       reads work. Spike 026: a child cannot be positioned at a slot rect on Linux, for a
       source-confirmed `GtkBox`-packing reason, which is the item's own second `expected:` branch.
     - `38-E01` was narrowed to a live Windows run, which is a machine-switch cost. Spike 027
       type-checked the harness against WebView2 from Linux.
   - It says the section's older premise, that no Windows/Linux implementation existed and that
     these were implementation tasks first, is SUPERSEDED for the feasibility question, while the
     SHIPPED app is unchanged (`src-tauri/Cargo.toml:114-128`).
   - It names the three new todos by filename.
   - It notes, with a warning sign, that the same quick found this phase's ledger had been
     invisible to gsd-core `audit-uat` since 2026-09-23 because its frontmatter was invalid YAML,
     and repaired it. Point to the ledger's `audit_tool_note` and the gate-gap todo.
   - It cites as evidence `.planning/spikes/025-linux-add-child-compile/README.md`,
     `.planning/spikes/026-linux-add-child-runtime/README.md`,
     `.planning/spikes/027-windows-add-child-crosscheck/README.md` and `.planning/spikes/MANIFEST.md`
     (Idea C).
   - In the same Edit, append ` (historical, superseded by the 2026-09-28 count above)` right after
     the bold `**Items: 23 OPEN as of 2026-09-23, plus 2 DISCHARGED and 9 RETIRED.**`. This matches
     the house pattern already used for the 2026-09-04 paragraph.

2. In the "Items: 34 as of 2026-09-04" paragraph, immediately after the sentence that ends
   `before it is a verification task.` (unique in the file), insert
   ` ⚠ **SUPERSEDED 2026-09-28 (quick 260928-raq)** for the feasibility question — see the 2026-09-28 paragraph above; the shipped app's macOS-only gate it describes is unchanged.`

3. Directly after the text `exists for it to have exercised.`, which ends the paragraph about
   `38-E01`/`38-E02` being untouched by the 40-11 gate, append
   ` (Still true of the SHIPPED app on 2026-09-28: spikes 025–027 exercised a feasibility harness, not the shipped app, and 38-E02 has since been discharged on that evidence — see the 2026-09-28 paragraph above.)`

4. In Phase 40's "Deferred out, not closed" paragraph, directly after the text
   `stating that 40-11's macOS PASS does **not** close them.`, insert
   ` **Updated 2026-09-28 (quick 260928-raq):** 38-E02 was discharged as ANSWERED on spike 025/026 evidence; 38-E01 is narrowed to a live Windows run (spike 027 answered the compile-level question).`

`38-HUMAN-UAT.md` edits.
- Frontmatter: change `updated: 2026-09-26` to `updated: 2026-09-28`. Do NOT add to `sessions:`,
  because no sitting happened.
- In the `## Current Test` bracket paragraph, directly after the text
  `as of 2026-09-26 it holds 11 open items, 15 discharged, 10 retired.`, insert a sentence. It says
  that on 2026-09-28 quick 260928-raq, which was NOT a sitting, discharged 38-E02 as ANSWERED on
  spike evidence, so the ledger now holds 10 open, 16 discharged and 10 retired, and it points to
  the new section below by its heading text.
- Append a new section at the END of the file with the heading
  `## Spike evidence — 2026-09-28 (not a sitting)`. Use two or three short paragraphs:
  - No operator sitting took place, and no `sessions:` entry changed.
  - Which items changed, and how: `38-E02` discharged as ANSWERED; `38-E01` narrowed; the Linux
    branches of `38-E03`/`38-E04` re-gated.
  - The artifact paths: the three spike READMEs and spike 025's committed logs, by path only.
  - The ledger had been invisible to gsd-core `audit-uat` and was repaired.
  - `38-VERIFICATION.md` is authoritative.
- The new text MUST NOT contain any line that starts with `### `, `expected:` or `result:`.
  gsd-core parses those shapes in this file.
- Use bold paragraph lines for any sub-labels.

Commit: stage exactly the two files, confirm `git diff --cached --name-only`, then commit as
`docs(quick-260928-raq): align ROADMAP Phase 38/40 and 38-HUMAN-UAT with the corrected ledger`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m && R=.planning/ROADMAP.md && H=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md && S38="$(awk '/^### Phase 38:/{f=1} /^### Phase 39:/{f=0} f' $R)" && S40="$(awk '/^### Phase 40:/{f=1} /^### Phase 41:/{f=0} f' $R)" && test "$(printf '%s\n' "$S38" | grep -c 'Items: 10 OPEN as of 2026-09-28')" -eq 1 && printf '%s\n' "$S38" | grep -q 'historical, superseded by the 2026-09-28 count above' && printf '%s\n' "$S38" | grep -q 'SUPERSEDED 2026-09-28 (quick 260928-raq)' && printf '%s\n' "$S38" | grep -q 'Still true of the SHIPPED app on 2026-09-28' && for p in .planning/spikes/025-linux-add-child-compile/README.md .planning/spikes/026-linux-add-child-runtime/README.md .planning/spikes/027-windows-add-child-crosscheck/README.md 2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md 2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md 2026-09-28-no-gate-parses-phase-verification-frontmatter.md; do printf '%s\n' "$S38" | grep -qF "$p" || { echo "ROADMAP Phase 38 missing: $p"; exit 1; }; done && printf '%s\n' "$S40" | grep -q 'Updated 2026-09-28 (quick 260928-raq)' && for f in .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md .planning/spikes/025-linux-add-child-compile/README.md .planning/spikes/026-linux-add-child-runtime/README.md .planning/spikes/027-windows-add-child-crosscheck/README.md; do test -f "$f" || { echo "cited path missing: $f"; exit 1; }; done && test "$(grep -c '^### ' $H)" -eq 1 && test "$(grep -cE '^(expected|result):' $H)" -eq 0 && grep -qx 'updated: 2026-09-28' $H && grep -qx '## Spike evidence — 2026-09-28 (not a sitting)' $H && node $Q/ledger-check.cjs --open 10 --discharged 16 --retired 10 --human-uat --origin40 --no-stale-premise && pnpm -s planning-gates && npx prettier --check $R $H</automated>
  </verify>
  <done>
- The Phase 38 section holds exactly one 2026-09-28 count paragraph.
- The 2026-09-23 count and the 2026-09-04 honesty note are marked historical/SUPERSEDED, not
  deleted.
- The 40-11 paragraph carries the shipped-app clarifier, and Phase 40's Deferred-out paragraph
  carries the 2026-09-28 update.
- Every spike README and todo filename cited by ROADMAP exists on disk.
- `38-HUMAN-UAT.md` is at `updated: 2026-09-28`, with the corrected counts and the new non-sitting
  section. It still has exactly one line starting `### ` and zero column-0 `expected:`/`result:`
  lines.
- ledger-check still reports audit-uat `by_phase['38'] === 10` with `parse_gap_files === 0`.
- planning-gates reports 12/12. The prettier checks are vacuous under `.prettierignore`, and the
  SUMMARY says so.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ledger frontmatter → gsd-core audit-uat | The only tool that counts Phase 38's backlog. A parse failure silently drops the phase, with no error. |
| committed spike logs → prose written in this task | The spike 025/026 logs hold real third-party cookie values. Nothing from them may be copied into a planning doc. |
| planning record → future reader | A discharge that overstates what was observed becomes a false shipped claim. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-raq-01 | Tampering | 38-VERIFICATION.md frontmatter (every edit in Tasks 1-3) | high | mitigate | After every task, `ledger-check.cjs` asserts a js-yaml 4 parse, gsd-core `extractFrontmatter` status, a `parseVerificationItems` count and audit-uat `by_phase['38']`. The pre-change blob FAILS the same check (negative control), which proves the check discriminates. |
| T-raq-02 | Tampering | Task 1 syntax repair of `score` and `38-S08.result` | medium | mitigate | `--syntax-preserved-from a8c6d289f` asserts that the parsed values equal the pre-change raw text (doubled apostrophes read as one). A repair that drops or alters text fails. |
| T-raq-03 | Repudiation | The 38-E02 discharge `result` (an overclaim that GameLib has a Linux embed) | medium | mitigate | `--includes` requires the result to carry the shipped-app anchor `src-tauri/Cargo.toml:114-128`, both spike README paths and both source-line anchors. The result must say it came from spike evidence, not a sitting. |
| T-raq-04 | Information Disclosure | Todos/ledger prose citing spike logs | low | mitigate | The action rules allow cookie NAMES, file paths and line numbers only, never a pasted log line or cookie value. This is enforced by review of the diff before each commit. |
| T-raq-05 | Tampering | Todo frontmatter vocabulary | low | mitigate | `pnpm planning-gates` (todo-frontmatter-gate.py) plus an order check (severity → platform → ready) in each verify. |
| T-raq-06 | Denial of Service | A stale-premise check that silently passes | low | mitigate | Task 1 runs `--no-stale-premise` against the live file and REQUIRES it to fail before Task 2, so the check is proven able to see the premise it later clears. |
</threat_model>

<verification>
Stale-premise phrases. `ledger-check.cjs`'s `--no-stale-premise` copies these six verbatim and
matches them case-insensitively against `blocked_by`, `why_human` and `platform_gate` of every
`human_verification` entry. They are the exact wording, measured at planning time, of 38-E01,
38-E02 and 38-E04's `blocked_by`, 38-E01 and 38-E02's `why_human`, 38-E03's `platform_gate`, and
38-E04's `why_human` and `platform_gate`:
1. implementation exists yet
2. code path exists to observe yet
3. no code path to observe yet
4. blocked on those items landing first
5. backends to exist first
6. until those backends land

Phase-level checks, run after Task 3:
- `node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --open 10 --discharged 16 --retired 10 --human-uat --origin40 --no-stale-premise`
  exits 0 and shows audit-uat `by_phase['38'] === 10`, `parse_gap_files === 0`.
- `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` `summary.total_items` has risen by
  exactly 10 from the Step-0 baseline (419 at planning; so 429). The net change is +11 from the
  repair and -1 from the discharge.
- `node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --census --expect-bad 3`
  exits 0.
- `pnpm planning-gates` reports 12/12.
- `git diff --stat a8c6d289f -- src src-tauri src/backend meta package.json` is empty. No
  application code or gate was touched.
</verification>

<success_criteria>
- Phase 38's 10 open items are visible to gsd-core `audit-uat` (they were invisible at planning),
  and a harness exists that proves it on demand.
- No open ledger item still asserts that no Windows/Linux implementation exists.
- `38-E01` names a runnable harness and a machine-switch cost.
- `38-E02` is discharged with a clause-by-clause, evidence-cited, scope-limited result.
- The Linux branches of `38-E03`/`38-E04` point at a real, falsifiable todo.
- The Linux GtkBox positioning gap (with the segfault as a constraint on one option), the
  `data_store_identifier` no-op, and the missing frontmatter gate are each filed as a todo with
  CI-valid triage keys.
- ROADMAP.md, `38-HUMAN-UAT.md` and the Phase 40 receipts no longer contradict the ledger. Older
  prose is kept and marked SUPERSEDED, not deleted.
- Three atomic commits, one per task, each staging only that task's files.
</success_criteria>

<output>
Create `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/260928-raq-SUMMARY.md` recording:
- the Step-0 audit-uat baseline, and every by_phase['38'] measurement (absent -> 11 -> 10);
- both census runs;
- both negative-control outcomes;
- the note that the `.md` prettier checks were vacuous under `.prettierignore`;
- the decision (and reason) to discharge 38-E02 rather than split it;
- the three todo paths.
</output>
