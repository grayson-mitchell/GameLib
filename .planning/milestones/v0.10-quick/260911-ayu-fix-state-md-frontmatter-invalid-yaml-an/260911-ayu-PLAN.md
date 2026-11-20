---
quick_id: 260911-ayu
title: Make `.planning/STATE.md`'s frontmatter parse, and add the planning gate that would have caught it
created: 2026-09-11
mode: quick
phase: quick-260911-ayu
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - 2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md
files_modified:
  - .planning/STATE.md
  - .planning/planning-frontmatter-gate.py
  - meta/runPlanningGates.py
  - package.json
  - pnpm-lock.yaml
  - .planning/todos/pending/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md
  - .planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md
  - .planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md

must_haves:
  truths:
    - "`.planning/STATE.md`'s frontmatter parses as a YAML mapping."
    - "`stopped_at` and `last_activity` survive the fix byte-for-byte -- no narrative text is lost, reworded or truncated."
    - "STATE.md's body below the frontmatter is byte-identical to its pre-fix content."
    - "`pnpm planning-gates` runs a tenth gate that parses STATE.md's frontmatter and fails on a parse error."
    - "The new gate FAILS against the pre-fix STATE.md -- proved by a live run, not by argument."
    - "The new gate FAILS if someone 'fixes' a future parse error by deleting `last_activity` instead."
    - "`MINIMUM_EXPECTED_GATES` is 10, so the new gate cannot later be deleted with everything still green."
    - "The gate reports ROADMAP.md's ABSENT frontmatter as an explicit named line -- 'skipped' cannot be mistaken for 'checked'."
    - "The todo is in `completed/` with a resolution status."
  artifacts:
    - path: ".planning/planning-frontmatter-gate.py"
      provides: "YAML-parse gate over .planning/STATE.md (required) and .planning/ROADMAP.md (optional), with self-test"
      contains: "HISTORICAL_EXCERPT_SHA256"
    - path: "meta/runPlanningGates.py"
      provides: "anti-vacuity floor raised 9 -> 10 with a matching comment-block entry"
      contains: "MINIMUM_EXPECTED_GATES = 10"
    - path: ".planning/STATE.md"
      provides: "frontmatter that parses"
      contains: "last_activity: |-"
  key_links:
    - from: "meta/runPlanningGates.py"
      to: ".planning/planning-frontmatter-gate.py"
      via: "rglob('*-gate.py') suffix discovery under .planning/"
      pattern: "planning-frontmatter-gate\\.py"
    - from: ".planning/planning-frontmatter-gate.py"
      to: "node_modules/js-yaml"
      via: "subprocess node -e, js-yaml v4 load()"
      pattern: "js-yaml"
    - from: "package.json"
      to: "node_modules/js-yaml"
      via: "devDependencies declaration pinning which of the two locked versions hoists to the root"
      pattern: "\"js-yaml\""
---

<objective>
`.planning/STATE.md`'s frontmatter is not valid YAML and has not been for weeks. Nine green
planning gates, every jest project, and `pnpm codecheck` are all blind to it, because nothing in
the repo has ever parsed that block.

Purpose: make the file parse, and — the part that actually matters — add the gate that would have
caught it the day it landed, so the next one is caught in CI instead of incidentally.

Output: a parsing STATE.md whose narrative fields are byte-preserved, a tenth planning gate with a
self-test that carries the real historical defect as a permanent regression fixture, a floor bump
to 10, and the todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md
@meta/runPlanningGates.py
@.planning/todos/todo-frontmatter-gate.py
@meta/__tests__/planningGatesWiring.test.ts
@./CLAUDE.md

Project skills (`.claude/skills/`): `spike-findings-gamelib` and `sketch-findings-gamelib` were
checked. Neither touches planning gates, YAML, or STATE.md. Nothing to apply here.
</context>

<measured_facts>
Measured at planning time in this repo, at `fix/steam-native-install-stability`. Every number
below was produced by `od`/regex/a real parse, never by reading rendered output.

**M-1 — the parse failure.** js-yaml 4.1.1 on STATE.md's frontmatter block:
`bad indentation of a mapping entry (7:508)`. Frontmatter fences are at file lines **1** and
**15** (13 content lines); the body begins at file line **16**.

**M-2 — the true current quote census. The todo's "10 raw quotes" is STALE; do not repeat it.**

| file line | field | bytes | unescaped `"` | escaped `\"` | state |
|---|---|---|---|---|---|
| 6 | `stopped_at` | 383 | 2 (delimiters only) | 2 | CLEAN — it correctly escapes its interior quotes |
| 8 | `last_activity` | 1494 | 4 | 0 | **BROKEN — 2 raw interior quotes** |

The two raw quotes sit at byte offsets **507** and **538** of line 8, around a quoted build-step
name. Lines 2,3,4,5,7,9-14 are clean. Line 8 contains **zero** backslashes, so it carries no
escape sequences at all — its intended value is exactly the byte slice between its two delimiters.

**M-3 — byte pins.** Pre-fix, at planning time:

| thing | sha256 |
|---|---|
| whole `.planning/STATE.md` | `a8b1141a6f21045e2a46ccb42dc60d4faad2c122c43f05720ac0b42f0cf2bd7d` |
| pre-fix line 6 (383 bytes) | `04f940ba2bb524a9c3b351636564f1712be80ef71b8bceb62a544ee06e7de398` |
| pre-fix line 8 (1494 bytes) | `254b18c0e93cf655c37f65c3f743681fc6259d6807ad943bf179b405c7050040` |
| intended `stopped_at` VALUE (367 bytes) | `6b98b0a7cfd5579667634f2f1a0baf4a3426ba833d60252f2e86685b35387971` |
| intended `last_activity` VALUE (1477 bytes) | `5e2620ef7a684bfcc954ff633637b3a9c4d9b62a85b22e9788bf68e314cf52b6` |
| the 90-byte defect excerpt (see Task 2) | `013b12366fdb0eb74fe955da8e76b3d97d9a9b811aa8bccf2e18027fc11087fb` |

The whole-file hash is a planning-time snapshot: STATE.md is appended to by hand between sessions.
If it differs at execution time, **re-derive the line hashes; do not assume the file moved on in a
way that invalidates the fix.** The per-line and per-value hashes are what the tasks assert.

**M-4 — the fix is already dry-run validated.** Replacing lines 6 and 8 with `|-` literal block
scalars and parsing the resulting frontmatter with js-yaml 4.1.1 gives: PARSE OK, 8 top-level keys,
`stopped_at` and `last_activity` values matching the sha256 pins in M-3 exactly, `progress` preserved
as a nested mapping, `milestone_name` intact as `'— Tauri Shell'`. The whole block parses. This is
not a proposal — it is a measured outcome that the executor must reproduce.

**M-5 — parser availability.** PyYAML is NOT installed. `js-yaml` **4.1.1** resolves at
`node_modules/js-yaml` and resolves correctly with cwd=`.planning/` (which is how
`runPlanningGates.py` invokes gates). It is **undeclared** — neither in `dependencies` nor
`devDependencies` — and `pnpm-lock.yaml` contains **two** versions, `3.14.2` and `4.1.1`. With
`node-linker=hoisted` (`.npmrc`), which of the two lands at the root of `node_modules` is decided
by hoisting, not by declaration. js-yaml 3.x has different `load` semantics. This is the fragility.

**M-6 — CI ordering is safe.** `.github/workflows/codecheck.yml` runs
`./.github/actions/install-deps` before `pnpm planning-gates`, so `node_modules` exists when the
gate runs.

**M-7 — the floor is not pinned by a literal in jest.**
`meta/__tests__/planningGatesWiring.test.ts` asserts `floor >= 6`, not `=== 9`. Bumping to 10 does
not break it. Run it anyway.

**M-8 — prettier cannot touch any of this.** `.planning` is listed in `.prettierignore`. Independently
verified that prettier preserves a `|-` block scalar in markdown frontmatter verbatim even when in
scope. `package.json` IS prettier-scoped — format it after editing.

**M-9 — no in-repo consumer.** `last_activity` and `stopped_at` appear in zero `.ts/.js/.py/.cjs/.mjs/.rs`
files outside `node_modules`. The only consumer is the external `gsd-sdk` CLI, whose `state.*` write
verbs are under a standing ban (see D-AYU-06).

**M-10 — js-yaml 4 throws on duplicate mapping keys** (`duplicated mapping key (2:1)`), so the gate
inherits duplicate-key detection from the parser rather than needing its own.

**M-11 — repo-wide, 54 of 2436 frontmatter-bearing `.md` files under `.planning/` fail to parse**
(mostly historical `*-SUMMARY.md` across phases 14, 21, 23, 28, 29, 34, 34.1-34.8). A repo-wide
gate would be RED at head. Scope stays at STATE.md + ROADMAP.md (D-AYU-04); the 54 are recorded as
a follow-up todo (Task 3), not fixed here.
</measured_facts>

<decisions>
**D-AYU-01 — Fix form: `|-` literal block scalars, for BOTH narrative fields.**
The todo names the block scalar as the better target because it removes the escaping burden from
the by-hand append path that produced the defect. Both `stopped_at` and `last_activity` get it, not
just the broken one: they share the identical hand-append path, and leaving one escaped and one
block-scalar means the next appender copies whichever field they happened to look at. Validated by
M-4 — byte-exact for both.

**D-AYU-02 — Gate parser: `node` + js-yaml v4, invoked by subprocess from a Python `*-gate.py`.**
PyYAML is absent (M-5) and the repo has no Python dependency management to add it to. The gate must
be a `*-gate.py` to be discovered by `runPlanningGates.py`'s suffix glob and to be protected by the
floor — that is the todo's explicit ask. A hand-rolled YAML subset parser in Python is **rejected**:
it would check something adjacent to "this file parses" rather than the property itself, and the
whole finding here is a check that was adjacent to the truth. The gate FAILS LOUDLY, never skips,
if `node` is absent, if js-yaml is unresolvable, or if the resolved major version is not 4.

**D-AYU-03 — Declare `js-yaml: ^4.1.1` in `devDependencies`.**
Not tidiness. Two versions are in the lock and the root hoist is currently 4.1.1 by luck (M-5); a
future install could hoist 3.14.2 and turn the gate red for a reason that has nothing to do with
any planning document. Declaring it pins which version hoists. `^` matches repo convention.

**D-AYU-04 — Target policy: STATE.md REQUIRED, ROADMAP.md OPTIONAL, absence REPORTED BY NAME.**
`.planning/ROADMAP.md` has no frontmatter at all today (nor does PROJECT.md). A gate that silently
skips it is a fail-open green check — the exact shape this repo's gates exist to end. So:

- `.planning/STATE.md`: frontmatter **required**; must parse; must be a mapping; must contain
  `gsd_state_version`, `status`, `stopped_at`, `last_activity`, `last_updated`, `progress`, with
  `stopped_at` and `last_activity` being **non-empty strings**.
- `.planning/ROADMAP.md`: frontmatter **optional**; if present it must parse; if absent the gate
  prints an explicit `NOTE: .planning/ROADMAP.md — NO frontmatter block (optional target, nothing
  parsed)` line and counts it separately in the summary.

The required-key list is the anti-vacuity core: without it, the cheapest way to make a future parse
error go away is to **delete** `last_activity`, and the gate would go green over the deletion.
`milestone`/`milestone_name` are deliberately NOT pinned — they are volatile and not what this gate
is about.

**D-AYU-05 — The self-test carries the REAL historical bytes, hash-guarded.**
A synthetic `x: "a "b" c"` exercises the same parser rule, but only the real excerpt proves the gate
would have caught THE file. The excerpt is extracted programmatically (Task 2) and the gate asserts
its own fixture's sha256 before using it — so a fixture mistyped from a terminal render fails the
gate loudly instead of silently testing the wrong bytes.

**D-AYU-06 — STATE.md is edited BY HAND.** `gsd-sdk`'s `state.*` write verbs are under a standing
ban in this repo (they report success while deleting hundreds of lines). **No task in this plan may
write STATE.md through gsd-sdk.** Use a byte-level script or a direct edit.

**D-AYU-07 — Commits stage only this task's files, by explicit path.** The working tree carries
pre-existing untracked files unrelated to this work (`.claude/skills/archify/`, `skills-lock.json`).
`git add -A` and `git commit -a` are forbidden here.
</decisions>

<the_trap>
**Confirmed live during planning, twice.** A rendered dump of STATE.md line 8 displayed
`at "Build three onedir runners"` while `od -c` proved the bytes are
`at "Build the three onedir runners"` — the substring `the ` was dropped **by the render**, not by
the file.

Therefore, in every task below: verify with `od -c`, `cmp`, `sha256`, a byte-count, or a real YAML
parse. **A visual scan of `cat`/`sed`/`head` output is not verification and does not discharge any
`<verify>` block in this plan.** This is also why no excerpt of the defective text is quoted
verbatim anywhere in this plan — only its hash is.
</the_trap>

<tasks>

<task type="auto">
  <name>Task 1: Convert both STATE.md narrative fields to `|-` block scalars, byte-preserving their values</name>
  <files>.planning/STATE.md</files>
  <action>
Edit ONLY frontmatter lines 6 and 8 of `.planning/STATE.md`. Do not touch the body. Do not
reformat, rewrap, reword or "tidy" anything, and do not route this through `gsd-sdk` (D-AYU-06).

Do it with a script, not by hand-retyping the content — the content is 383 and 1494 bytes of prose
containing the exact substring a terminal render was measured to drop (see `<the_trap>`).

Procedure:

1. Read `.planning/STATE.md` as **bytes**. Split on `\n`.
2. Assert `sha256(line[6]) == 04f940ba2bb524a9c3b351636564f1712be80ef71b8bceb62a544ee06e7de398` and
   `sha256(line[8]) == 254b18c0e93cf655c37f65c3f743681fc6259d6807ad943bf179b405c7050040` (M-3). If
   either differs, STOP and re-derive — the file was appended to since planning and the offsets may
   have moved.
3. Derive the two intended values:
   - `stopped_at`: strip the `stopped_at: "` prefix and the trailing `"`, then unescape `\"` -> `"`.
     Assert the result is 367 bytes with sha256 `6b98b0a7cfd5579667634f2f1a0baf4a3426ba833d60252f2e86685b35387971`.
   - `last_activity`: strip the `last_activity: "` prefix and the trailing `"`. **No unescaping** —
     the line contains zero backslashes (M-2). Assert the result is 1477 bytes with sha256
     `5e2620ef7a684bfcc954ff633637b3a9c4d9b62a85b22e9788bf68e314cf52b6`.
4. Replace line 6 with `stopped_at: |-` + newline + two spaces + the `stopped_at` value.
   Replace line 8 with `last_activity: |-` + newline + two spaces + the `last_activity` value.
   Each value stays on ONE long indented line. Do not wrap it.
5. Write the file back as bytes.

Per D-AYU-01 this converts BOTH fields, including the currently-clean `stopped_at`, so the
frontmatter carries one convention rather than two.
  </action>
  <verify>
    <automated><![CDATA[
cd "$(git rev-parse --show-toplevel)" && python3 - <<'PY'
import hashlib, json, pathlib, subprocess, sys
p = pathlib.Path('.planning/STATE.md'); b = p.read_bytes(); lines = b.split(b'\n')
fences = [i+1 for i,l in enumerate(lines[:40]) if l.strip()==b'---']
assert fences[:2] == [1,17], f"expected fences at lines 1,17 post-fix; got {fences[:2]}"
fm = b'\n'.join(lines[1:16]).decode()
JS = 'const y=require("js-yaml");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.stringify({ok:true,v:y.load(s)}))}catch(e){process.stdout.write(JSON.stringify({ok:false,e:e.message}))}})'
r = subprocess.run(['node','-e',JS], input=fm.encode(), capture_output=True)
d = json.loads(r.stdout)
assert d['ok'], f"frontmatter STILL does not parse: {d.get('e')}"
v = d['v']
assert isinstance(v, dict), "frontmatter did not parse to a mapping"
pins = {'stopped_at':'6b98b0a7cfd5579667634f2f1a0baf4a3426ba833d60252f2e86685b35387971',
        'last_activity':'5e2620ef7a684bfcc954ff633637b3a9c4d9b62a85b22e9788bf68e314cf52b6'}
for k, want in pins.items():
    got = hashlib.sha256(v[k].encode()).hexdigest()
    assert got == want, f"{k} value CHANGED: {got} != {want}"
    assert '\n' not in v[k], f"{k} gained a newline"
for k in ('gsd_state_version','status','last_updated','progress'):
    assert k in v, f"lost key {k}"
assert v['progress']['total_phases'] == 39
print("PARSE OK; both values byte-identical to their pre-fix intent; keys intact")
PY
]]></automated>
    <automated><![CDATA[
# The BODY must be byte-identical. Pre-fix body starts at line 16; post-fix at line 18 (+2 lines).
cd "$(git rev-parse --show-toplevel)" && \
  cmp <(git show HEAD:.planning/STATE.md | tail -n +16) <(tail -n +18 .planning/STATE.md) \
  && echo "BODY BYTE-IDENTICAL" \
  && git diff --numstat -- .planning/STATE.md
]]></automated>
    <automated><![CDATA[
# No raw-quote regression anywhere in the new frontmatter, and the block-scalar form is really there.
cd "$(git rev-parse --show-toplevel)" && sed -n '1,17p' .planning/STATE.md | \
  grep -cE '^(stopped_at|last_activity): \|-$' | grep -qx 2 && echo "BOTH FIELDS ARE |- BLOCK SCALARS"
]]></automated>
  </verify>
  <done>
`git diff --numstat -- .planning/STATE.md` shows exactly `4  2`. The frontmatter parses to a mapping.
`stopped_at` (367 bytes) and `last_activity` (1477 bytes) hash to their pre-fix pins. The body below
the frontmatter is byte-identical to `HEAD`. No step was discharged by reading rendered text.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add `.planning/planning-frontmatter-gate.py`, declare js-yaml, and prove the gate fails on the pre-fix file</name>
  <files>.planning/planning-frontmatter-gate.py, package.json, pnpm-lock.yaml</files>
  <action>
**2a. Declare the parser (D-AYU-03).** Add `"js-yaml": "^4.1.1"` to `devDependencies` in
`package.json`, keeping the block alphabetically ordered as it already is. Run `pnpm install`. Then
run prettier over `package.json` (it is prettier-scoped, M-8). The lockfile will gain a
`devDependencies` entry under the root importer; that is expected. What must NOT happen is a new
js-yaml version entering the tree — verified below.

**2b. Extract the regression fixture programmatically (D-AYU-05).** From the pre-fix blob
(`git show <sha-before-Task-1>:.planning/STATE.md`), take line 8, find the byte offset of the SECOND
match of the regex `(?<!\\)"`, and slice a 90-byte window `[offset-45 : offset+45]`. Assert
`sha256(window) == 013b12366fdb0eb74fe955da8e76b3d97d9a9b811aa8bccf2e18027fc11087fb`.

**Do not retype this window from any rendered output** — write it into the gate source from the
extracted bytes. `<the_trap>` is not hypothetical; it fired on this exact region during planning.

**2c. Write the gate.** New file `.planning/planning-frontmatter-gate.py`, discovered by
`runPlanningGates.py`'s `*-gate.py` rglob under `.planning/`. Follow
`.planning/todos/todo-frontmatter-gate.py` closely: a long docstring that says WHY and warns the
next reader off the wrong fix, `__file__`-relative path resolution (never cwd — the runner sets
cwd=gate.parent but a human runs from the repo root), pure functions shared between the self-test
and the live walk (never a reimplementation), self-test FIRST then the live walk, a `--self-test`
flag, no `--write` flag, and every finding reported in one run.

Required content:

- `TARGETS`: an explicit table of `(path, required: bool)` — `.planning/STATE.md` required,
  `.planning/ROADMAP.md` optional (D-AYU-04). Assert `PLANNING_DIR.name == ".planning"` so
  repointing the gate is a deliberate, visible act.
- `REQUIRED_STATE_KEYS = ("gsd_state_version", "status", "stopped_at", "last_activity",
  "last_updated", "progress")`, with `stopped_at` and `last_activity` additionally required to be
  **non-empty strings**. The docstring must state plainly that this list exists so that deleting a
  troublesome field is not a way to turn the gate green.
- `NODE_YAML_PARSE_JS`: a Python string constant holding the node script. Invoke it as
  `subprocess.run([node, "-e", NODE_YAML_PARSE_JS], input=<frontmatter text>, capture_output=True,
  text=True)` — argv list, no shell, frontmatter on **stdin**, JSON on stdout. Passing text on
  stdin is what lets the self-test's synthetic documents go through the identical parse path as the
  real files.
- The node script must also report `require("js-yaml/package.json").version`.
- **Loud failures, never skips:** `node` not on PATH -> FAIL; js-yaml unresolvable -> FAIL; js-yaml
  major != 4 -> FAIL naming the version found and pointing at the `devDependencies` declaration
  (M-5, D-AYU-03); a target file missing -> FAIL.
- `extract_frontmatter(text)`: lines between the FIRST `---` and the NEXT `---`; a later `---` in
  the body is a horizontal rule and must not re-open the block; an unterminated block is NOT a
  frontmatter block.
- Output, one line per target, naming the file and what was actually checked:
  - `OK: .planning/STATE.md — frontmatter (13 lines) parses as a mapping with N keys; all 6 required keys present; stopped_at 367 chars, last_activity 1473 chars.`
    (report live lengths, do not pin them — they grow with every append)
  - `NOTE: .planning/ROADMAP.md — NO frontmatter block (optional target, nothing parsed).`
  - a final summary counting checked vs. no-frontmatter targets, so "skipped" cannot read as "checked".

**2d. Self-test cases.** At minimum:
  - assert `sha256(HISTORICAL_EXCERPT) == HISTORICAL_EXCERPT_SHA256` before any case uses it — the
    fixture guards itself against a render-dropped substring;
  - REJECT: `last_activity: "<HISTORICAL_EXCERPT>"` — the real defect, real bytes;
  - REJECT: minimal synthetic raw-quote scalar (same parser rule, human-readable);
  - REJECT: a `|-` block whose continuation line is un-indented to column 0 — the NEW trap that
    D-AYU-01's form introduces, so it is covered from day one;
  - REJECT: duplicate top-level key (js-yaml 4 throws, M-10);
  - REJECT: tab-indented mapping entry;
  - REJECT: frontmatter that parses but is not a mapping (a bare list);
  - REJECT: a STATE-shaped document **missing `last_activity`** — the fix-by-deletion control;
  - REJECT: a STATE-shaped document with `last_activity: ""` — the fix-by-emptying control;
  - ACCEPT: a valid STATE-shaped document carrying `stopped_at`/`last_activity` as `|-` blocks with
    raw `"` inside them (the positive control for the whole fix);
  - ACCEPT: a document with NO frontmatter, when the target is optional;
  - REJECT (scan-level): a missing target file. Capture its `GATE FAILED:` stderr rather than
    printing it, as `todo-frontmatter-gate.py` case 15 does — a literal `GATE FAILED:` line in a
    passing run misleads the next person who greps the log.

Assert the case count at the end, and print a closing sentence stating what was proved.
  </action>
  <verify>
    <automated><![CDATA[
cd "$(git rev-parse --show-toplevel)" && python3 .planning/planning-frontmatter-gate.py --self-test
]]></automated>
    <automated><![CDATA[
# LIVE NEGATIVE CONTROL. A gate that has never been seen to fail has not been seen at all.
# The gate resolves targets from __file__, so a scratch tree named `.planning` exercises the REAL
# live path (not just the pure function) against the REAL pre-fix file.
set -e
cd "$(git rev-parse --show-toplevel)"
CTL="$(mktemp -d)/ctl/.planning"; mkdir -p "$CTL"
cp .planning/planning-frontmatter-gate.py "$CTL/"
git show "$(git rev-list -1 HEAD~1 -- .planning/STATE.md 2>/dev/null || echo HEAD~1)":.planning/STATE.md > "$CTL/STATE.md"
# Confirm the control file really is the broken one before drawing any conclusion from the run.
python3 -c "import hashlib,sys;b=open('$CTL/STATE.md','rb').read().split(b'\n')[7];h=hashlib.sha256(b).hexdigest();assert h=='254b18c0e93cf655c37f65c3f743681fc6259d6807ad943bf179b405c7050040',f'control file is NOT the pre-fix one: {h}';print('control fixture verified: pre-fix line 8 present')"
if ( cd "$CTL" && python3 planning-frontmatter-gate.py ); then
  echo "NEGATIVE CONTROL FAILED: the gate reported GREEN over the known-broken STATE.md"; exit 1
fi
echo "NEGATIVE CONTROL PASSED: the gate goes RED on the pre-fix file"
]]></automated>
    <automated><![CDATA[
# Live run against the FIXED tree, and proof the ROADMAP absence is reported by name.
cd "$(git rev-parse --show-toplevel)" && \
  out=$(cd .planning && python3 planning-frontmatter-gate.py) && echo "$out" && \
  echo "$out" | grep -q 'ROADMAP.md' && \
  echo "$out" | grep -qE 'NOTE: .*ROADMAP\.md .*NO frontmatter' && \
  echo "ROADMAP ABSENCE REPORTED BY NAME (not silently skipped)"
]]></automated>
    <automated><![CDATA[
# No new js-yaml version entered the tree: the lock's version-entry census must be unchanged.
cd "$(git rev-parse --show-toplevel)" && \
  test "$(grep -cE '^  js-yaml@3\.14\.2:$|^  js-yaml@4\.1\.1:$' pnpm-lock.yaml)" -eq 2 && \
  test -z "$(grep -oE '^  js-yaml@[0-9.]+:' pnpm-lock.yaml | sort -u | grep -vE '3\.14\.2|4\.1\.1')" && \
  node -e 'const v=require("js-yaml/package.json").version;if(v!=="4.1.1"){console.error("js-yaml moved to",v);process.exit(1)};console.log("js-yaml still 4.1.1, no new package entered the tree")'
]]></automated>
  </verify>
  <done>
`--self-test` is green with every reject case rejecting for its own stated reason. The gate has been
observed RED against the real pre-fix STATE.md and GREEN against the fixed one. ROADMAP.md's missing
frontmatter appears as a named `NOTE:` line and in the summary count. `js-yaml` is declared at
`^4.1.1`, resolves to 4.1.1, and the lockfile's js-yaml version census is unchanged at
`{3.14.2, 4.1.1}`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Raise the floor 9 -> 10, record the 54-file finding, close the todo</name>
  <files>meta/runPlanningGates.py, .planning/todos/pending/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md, .planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md, .planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md</files>
  <action>
**3a. Floor bump.** In `meta/runPlanningGates.py`, set `MINIMUM_EXPECTED_GATES = 10` and add a
`9 -> 10 (quick task 260911-ayu)` entry to the comment block above it, in the same voice as the
existing `6 -> 7`, `7 -> 8`, `8 -> 9` entries: name the new gate, say what it holds, and say why a
floor left at 9 would let it be deleted with everything still green. The specific point worth making
here: this gate exists because a defect sat in `STATE.md` for weeks while nine gates reported green,
so it is precisely the kind of gate whose deletion would be invisible.

**3b. Record the out-of-scope finding (M-11).** New file
`.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`
recording that 54 of 2436 frontmatter-bearing `.md` files under `.planning/` fail to YAML-parse
(mostly `*-SUMMARY.md` in phases 14, 21, 23, 28, 29, 34, 34.1-34.8), that this is why the new gate is
scoped to STATE.md rather than repo-wide, and that widening the gate requires fixing them first.

**This file lands in `pending/`, so it MUST carry the triage keys or `todo-frontmatter-gate.py` goes
red on your own commit** (`./CLAUDE.md` `## Conventions`; the runner will now execute both gates):

```
severity: minor
platform: any
ready: code
```

placed in that order, bare and lowercase, `platform:` immediately after `severity:`, `ready:`
immediately after `platform:`.

**3c. Close the todo.** `git mv` the pending todo to `.planning/todos/completed/`, keeping the
filename (98 of 118 completed todos keep their date prefix). Add a `status:` line to its frontmatter
in the established completed-todo shape:
`status: "RESOLVED 2026-09-11 by quick-260911-ayu -- ..."`. The resolution text must correct the
todo's own stale claim: the defect was **2** raw interior quotes in `last_activity`, not 10, and
`stopped_at` was already clean (M-2). It should also note that the todo's `gsd-sdk`-corruption
hypothesis is neither confirmed nor refuted by this work — the standing hand-write ban is unchanged
either way (D-AYU-06).

**3d. Commit.** Stage by explicit path only — the tree carries unrelated untracked files (D-AYU-07).
`git add -A` and `git commit -a` are forbidden.
  </action>
  <verify>
    <automated><![CDATA[
cd "$(git rev-parse --show-toplevel)" && \
  grep -qE '^MINIMUM_EXPECTED_GATES = 10$' meta/runPlanningGates.py && \
  grep -v '^#' meta/runPlanningGates.py | grep -c 'MINIMUM_EXPECTED_GATES = 10' | grep -qx 1 && \
  grep -q '9 -> 10' meta/runPlanningGates.py && \
  echo "FLOOR IS 10 AND THE COMMENT BLOCK RECORDS THE BUMP"
]]></automated>
    <automated><![CDATA[
# 10 gates discovered, 10 green -- the count is the point, not just the colour.
cd "$(git rev-parse --show-toplevel)" && \
  test "$(find .planning -name '*-gate.py' | wc -l | tr -d ' ')" -eq 10 && \
  pnpm planning-gates | tee /dev/stderr | grep -qx '10/10 planning gates passed.'
]]></automated>
    <automated><![CDATA[
cd "$(git rev-parse --show-toplevel)" && \
  test ! -e .planning/todos/pending/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md && \
  test -e .planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md && \
  grep -q '^status: "RESOLVED 2026-09-11 by quick-260911-ayu' .planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md && \
  new=.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md && \
  grep -qx 'severity: minor' "$new" && grep -qx 'platform: any' "$new" && grep -qx 'ready: code' "$new" && \
  echo "TODO CLOSED, FOLLOW-UP FILED WITH VALID TRIAGE FRONTMATTER"
]]></automated>
    <automated><![CDATA[
cd "$(git rev-parse --show-toplevel)" && npx jest meta/__tests__/planningGatesWiring.test.ts
]]></automated>
    <automated><![CDATA[
# D-AYU-07: nothing unrelated was swept into the commit.
cd "$(git rev-parse --show-toplevel)" && \
  git show --name-only --format= HEAD | tee /dev/stderr | grep -q . && \
  ! git show --name-only --format= HEAD | grep -vE '^(\.planning/(STATE\.md|planning-frontmatter-gate\.py|todos/(pending|completed)/[0-9-a-z.]+\.md|quick/260911-ayu[^ ]*)|meta/runPlanningGates\.py|package\.json|pnpm-lock\.yaml)$' && \
  echo "COMMIT CONTAINS ONLY THIS PLAN'S FILES (allowlist, not a blocklist)"
]]></automated>
  </verify>
  <done>
`MINIMUM_EXPECTED_GATES = 10` with a matching comment entry. `pnpm planning-gates` prints
`10/10 planning gates passed.` over 10 discovered gate files. The wiring jest test still passes. The
todo is in `completed/` with a `RESOLVED 2026-09-11 by quick-260911-ayu` status that corrects its own
stale 10-quote claim. The follow-up todo is in `pending/` and passes `todo-frontmatter-gate.py`. The
commit touches only this plan's files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo content -> YAML parser | The gate feeds repo-controlled markdown frontmatter to a parser. Content is trusted (in-repo, reviewed), but the parser choice still matters. |
| npm registry -> node_modules | A `devDependencies` declaration is added. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-AYU-01 | Elevation of Privilege | `js-yaml.load()` in the gate's node helper | mitigate | js-yaml **4** `load()` is the safe schema — no arbitrary type construction, no code execution from a YAML tag. The gate hard-fails if the resolved major is not 4 (D-AYU-02), so it can never silently fall back to 3.x semantics. |
| T-AYU-02 | Tampering | The gate's own regression fixture | mitigate | The fixture's sha256 is asserted inside the self-test before any case uses it. A fixture corrupted by a render-dropped substring (`<the_trap>`) fails the gate loudly instead of silently testing different bytes. |
| T-AYU-03 | Information Disclosure | `STATE.md` narrative content | accept | The fields hold internal development narrative already committed to a public fork's history. The fix is byte-preserving; nothing new is exposed. |
| T-AYU-04 | Denial of Service | CI, via a gate that cannot find its parser | mitigate | `node`-missing / js-yaml-unresolvable / wrong-major all fail LOUDLY with an actionable message naming the `devDependencies` declaration. Failing closed is correct here: a gate that skips on a missing parser is the fail-open shape this whole task exists to end. Install ordering is already correct in CI (M-6). |
| T-AYU-SC | Tampering | npm install (`js-yaml`) | accept | **No new package enters the tree.** `js-yaml` is already installed at 4.1.1 and already present in `pnpm-lock.yaml` twice as a transitive dependency; this change only *declares* the version that already resolves, pinning which of the two hoists to the root. Proved rather than asserted: Task 2's verify requires the lockfile's `js-yaml@` version census to remain exactly `{3.14.2, 4.1.1}` and the resolved version to remain 4.1.1. `js-yaml` is `nodeca/js-yaml`, a top-tier npm package already trusted transitively by this repo's toolchain, so no `[ASSUMED]`/`[SUS]` legitimacy checkpoint is warranted for a zero-delta declaration. |
</threat_model>

<verification>
Run from the repo root, in order, after all three tasks:

1. `python3 .planning/planning-frontmatter-gate.py --self-test` — green.
2. The Task 2 live negative control — the gate goes RED against the pre-fix STATE.md.
3. `pnpm planning-gates` — `10/10 planning gates passed.`
4. `npx jest meta/__tests__/planningGatesWiring.test.ts` — green.
5. `cmp` proof that STATE.md's body is byte-identical to `HEAD`'s below the frontmatter.
6. `git show --name-only --format= HEAD` contains no file outside this plan's `files_modified`.

Every one of these is a byte comparison, a hash, an exit code or a real parse. None of them is
discharged by reading rendered text (`<the_trap>`).
</verification>

<success_criteria>
- `.planning/STATE.md`'s frontmatter parses as a YAML mapping (M-1's error is gone).
- `stopped_at` and `last_activity` hash to their pre-fix intended values — **no narrative lost**.
- STATE.md's body is byte-identical to its pre-fix content; `git diff --numstat` is `4  2`.
- A tenth planning gate exists, is discovered by suffix, runs in CI, and has been **observed failing**
  against the real pre-fix file.
- The gate cannot be satisfied by deleting or emptying `last_activity`.
- ROADMAP.md's absent frontmatter is reported by name; "skipped" cannot be read as "checked".
- `MINIMUM_EXPECTED_GATES = 10`, comment block updated in the established voice.
- The todo is in `completed/` with a status that corrects its own stale quote count.
- The 54-file repo-wide finding is recorded as a follow-up todo with valid triage frontmatter, not
  silently dropped and not fixed here.
</success_criteria>

<output>
Create `.planning/quick/260911-ayu-fix-state-md-frontmatter-invalid-yaml-an/260911-ayu-SUMMARY.md` when done.
</output>
