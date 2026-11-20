---
phase: quick/260919-sya
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - ~/.vscode/extensions/gsd-phase-status/parse.js
  - ~/.vscode/extensions/gsd-phase-status/extension.js
  - ~/.vscode/extensions/gsd-phase-status/test-parse.js
  - ~/.vscode/extensions/gsd-phase-status/package.json
  - ~/.vscode/extensions/gsd-phase-status/README.md
  - .planning/quick/260919-sya-make-the-gsd-phase-status-vs-code-extens/260919-sya-SUMMARY.md
autonomous: true
requirements: [SYA-01, SYA-02, SYA-03, SYA-04]

must_haves:
  truths:
    - "`todoTriage` reds a `platform:` that names an OS other than the HOST, and greens one that names the host — on all three hosts, not just macOS."
    - "`tallyTodos`'s `open` counts only todos this machine can act on: 13 against the live 24-file pending tree on macOS."
    - "The `.planning/todos` badge, the status-bar `☐` and every todo tooltip report that same actionable number."
    - "The `.planning/todos/pending` badge and colour are byte-for-byte unchanged (still 24, still orange)."
    - "The new assertions are RED against the pristine pre-edit parse.js — proven, not asserted."
  artifacts:
    - path: "~/.vscode/extensions/gsd-phase-status/parse.js"
      provides: "host-aware todoTriage platform rung + triage-derived tallyTodos"
      contains: "host"
    - path: "~/.vscode/extensions/gsd-phase-status/extension.js"
      provides: "HOST_PLATFORM from process.platform; scanTodos passes frontmatter + host"
      contains: "process.platform"
    - path: "~/.vscode/extensions/gsd-phase-status/test-parse.js"
      provides: "three-host rung assertions, 24-row live-census fixture, red-proof cases"
    - path: "/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/fb4bdbf0-0580-48b2-9658-31b378e8f306/scratchpad/pristine/"
      provides: "pre-edit snapshot of the four source files — the only 'revert' this unversioned extension has"
  key_links:
    - from: "extension.js scanTodos"
      to: "parse.js tallyTodos"
      via: "frontmatter objects + host, not status words"
      pattern: "tallyTodos\\("
    - from: "parse.js tallyTodos"
      to: "parse.js todoTriage"
      via: "actionable derived from the triage verdict, so folder count and per-file badges agree by construction"
      pattern: "todoTriage\\("
---

<objective>
Make the `gsd-phase-status` VS Code extension's todo "actionable" count honest.

Two defects, both measured this session against the live tree at
`/Users/graysonmitchell/Projects/GameLib/.planning/todos/pending` (24 files):

1. **`todoTriage`'s platform rung is a constant, not a host lookup.** `parse.js`
   tests `platform === 'windows'` → red and `platform === 'linux'` → red, and lets
   `macos` fall through to the readiness rungs with an in-situ comment saying
   "macOS is the operator's own machine". On a Windows machine that same list
   paints the 5 `platform: windows` todos red and the 3 `macos` ones green —
   exactly backwards.
2. **`tallyTodos` never learned `ready: blocked`.** v0.10.0 added that vocabulary
   to the triage ladder; the tally still computes `open = total − parked`.
   It returns `{ total: 24, parked: 2, open: 22 }` while 8 files carry
   `ready: blocked` — so `☐ 22` counts 6 items nobody can act on, plus 6 more
   that are for another machine.

Purpose: the folder number and the per-file badges should agree **by
construction**, so a future vocabulary change cannot silently make them disagree
again. That means deriving the tally from `todoTriage`, not forking its rules.

Output: host-aware `todoTriage`, actionable-only `tallyTodos`, updated tooltips
and status bar, new + red-proofed assertions, README row corrected, version bump.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

Files under edit (all OUTSIDE this git repo — see `<not_committable>`):
- `~/.vscode/extensions/gsd-phase-status/parse.js` (1059 lines; the pure parser, deliberately does **not** `require('vscode')`)
- `~/.vscode/extensions/gsd-phase-status/extension.js` (594 lines; the only place that may read `process.platform`)
- `~/.vscode/extensions/gsd-phase-status/test-parse.js` (781 lines, **260 assertions**, green at exit 0 as of this plan — the planning brief's "205 as of v0.8.0" is stale; 260 is the re-counted number)
- `~/.vscode/extensions/gsd-phase-status/package.json` (`version: 0.10.0`)
- `~/.vscode/extensions/gsd-phase-status/README.md` (todo badge table at ~line 248)

<interfaces>
<!-- Current contracts. Extracted from the source this session. No exploration needed. -->

parse.js — the two functions under change:

  todoTriage(fm, folder) -> { badge, color, label }
    fm     : parseFrontmatter() result, or null
    folder : 'pending' | 'completed'
    badge  : exactly 2 chars on every pending non-parked path
             (severity digit 1-4 or '?', plus one readiness/platform letter),
             with two deliberate 1-char exceptions: '✓' complete, '▶' in progress
    Rung order today (do NOT reorder):
      complete -> parked -> inprogress -> platform -> ready(code/live-gate/human/blocked) -> '?'
    Letters in use: B(parked/blocked) W L(wrong platform) .(code) G(live-gate) H(human) ?(untriaged)
    Colours in use: charts.green charts.purple charts.yellow charts.red charts.blue descriptionForeground

  tallyTodos(statuses) -> { total, parked, open }
    statuses : one artifactStatus() result per pending file, null included
    open     : total − parked   <-- the defect

  todoFileStatus(fmStatus, folder) -> 'complete' | 'parked' | 'inprogress' | 'pending'
    FOLDER is authoritative for done-ness; frontmatter only decides parked/in-progress.

extension.js — the consumers:

  scanTodos(root, dir)            reads each pending file's `fm` through the mtime+size
                                  cache, then throws it away: `statuses.push(fm ? todoStatus(fm.status) : null)`
                                  returns { pending: tallyTodos(statuses), completed: { total } }
  todoSummary()                   `Todos: ${completed.total}/${all} done · ${pending.open} open${parked}`
  decorateTodoFile(uri, folder)   calls todoTriage(fm, folder)
  todoDecoration(uri, lower, dir) three folder rows; see the pin in Task 2
  updateStatusBar()               `☐ ${state.todos.pending.open}` at ~line 316
  TODO_OPEN_COLOR = 'charts.orange'; TODO_DONE_COLOR = 'charts.green'  (lines 64-65)
</interfaces>

<measured_numbers>
Measured this session by replaying the real `parse.js` over the live 24-file
pending tree. Do NOT re-derive these; DO re-assert them.

  tallyTodos today          { total: 24, parked: 2, open: 22 }
  platform census           any 15 · windows 5 · macos 3 · linux 1
  ready census              blocked 8 · live-gate 6 · human 5 · code 5
  triage colours today      purple 5 · red 6 · orange 4 · blue 6 · green 3
  actionable under new rule macOS 13 · Windows 12 · Linux 11

Exact cross-tab of the 24 (`todoFileStatus | platform | ready`) — this IS the
fixture for Task 1, reproduce it row-for-row:

  2  parked  | any     | blocked
  3  pending | any     | blocked
  3  pending | any     | code
  4  pending | any     | human
  3  pending | any     | live-gate
  1  pending | linux   | code
  3  pending | macos   | live-gate
  3  pending | windows | blocked
  1  pending | windows | code
  1  pending | windows | human

Check it sums: 24 files; actionable@macos = 3+4+3+3 = 13; actionable@windows =
(10 any-non-blocked... i.e. 3+4+3) + 1 + 1 = 12; actionable@linux = 10 + 1 = 11.
</measured_numbers>
</context>

<not_committable>
`~/.vscode/extensions/gsd-phase-status/` is **outside this git repo and has no
`.git` of its own**. Do NOT attempt `git add` on any file under
`~/.vscode/extensions/`; it will either fail or, worse, look like it worked.

The only committable artifacts for this quick task are the `.planning/quick/260919-sya-*/`
files. Per project rule (memory: "gsd-sdk commit stages entire tree"), scope the
commit explicitly with `--files`.

`git stash` is banned in this project and there is nothing to stash here anyway.
**The scratchpad snapshot taken in Task 1 is the only undo this work has.**
</not_committable>

<tasks>

<task type="auto">
  <name>Task 1: Snapshot the pristine files, then RED-PROOF the new assertions against them</name>
  <files>
    /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/fb4bdbf0-0580-48b2-9658-31b378e8f306/scratchpad/pristine/{parse.js,extension.js,test-parse.js,package.json},
    /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/fb4bdbf0-0580-48b2-9658-31b378e8f306/scratchpad/redproof/{parse.js,test-parse.js}
  </files>
  <action>
    Do this BEFORE touching a single source file. There is no version control to
    fall back on (see `<not_committable>`).

    Step A — snapshot. Copy `parse.js`, `extension.js`, `test-parse.js` and
    `package.json` from `~/.vscode/extensions/gsd-phase-status/` into
    `<scratchpad>/pristine/`. Record their sha256 sums in the same directory as
    `SHA256SUMS.txt` so a later diff can prove exactly what changed.

    Step B — baseline. Run `node test-parse.js` in the extension directory.
    Record the exit code and the `ok` line count. Both are already known: exit 0,
    **260** `ok` lines, final line "All parser tests passed." If either differs,
    STOP and report — the baseline moved under you and every number below is
    suspect.

    Step C — red-proof. In `<scratchpad>/redproof/`, place the PRISTINE `parse.js`
    alongside a copy of `test-parse.js` extended with the new assertions you
    intend to land in Task 3. Write them now, against the target API, exactly as
    they will be written later:

      1. Host-aware rung, driven at all three hosts. At minimum:
         - `{severity:'medium', platform:'windows', ready:'code'}` at host
           `'windows'` must be GREEN (`3.`, ready to pick up at the desk).
           Pristine code returns red `3W` -> RED. **This is the assertion that
           fails if the rung is left hardcoded to macOS.**
         - `{severity:'medium', platform:'macos', ready:'code'}` at host
           `'windows'` must be RED with the new `M` letter (`3M`).
           Pristine code returns green `3.` -> RED.
         - The symmetric pair at host `'linux'` for `platform:'linux'` /
           `platform:'macos'`.
         - Host `'macos'` must reproduce today's verdicts for windows/linux/macos
           — the macOS behaviour is CORRECT and must not regress.
      2. `tallyTodos` over the 24-row fixture from `<measured_numbers>` must
         return `open: 13` at host `'macos'`, `12` at `'windows'`, `11` at
         `'linux'`. Pristine code returns 22 regardless -> RED. **This is the
         assertion that fails if `open` still ignores `ready: blocked`.**

    Run the redproof copy: `node <scratchpad>/redproof/test-parse.js`. It MUST
    exit non-zero, and the failures MUST be exactly the new assertions (plus any
    hard `TypeError` from the changed `tallyTodos` signature — note it, that also
    counts as red). Capture the output to `<scratchpad>/redproof/RED.txt`.

    A test that is green here proves nothing and must be rewritten before you
    proceed. Do not continue to Task 2 until RED.txt shows red on both defects
    independently.
  </action>
  <verify>
    <automated>SCRATCH=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/fb4bdbf0-0580-48b2-9658-31b378e8f306/scratchpad; test -f "$SCRATCH/pristine/SHA256SUMS.txt" &amp;&amp; (cd ~/.vscode/extensions/gsd-phase-status &amp;&amp; node test-parse.js | grep -c '^ok  ') &amp;&amp; node "$SCRATCH/redproof/test-parse.js" &gt;"$SCRATCH/redproof/RED.txt" 2&gt;&amp;1; grep -q 'FAIL' "$SCRATCH/redproof/RED.txt"</automated>
  </verify>
  <done>
    `<scratchpad>/pristine/` holds all four files plus SHA256SUMS.txt; the live
    suite is green at 260 assertions; `<scratchpad>/redproof/RED.txt` shows the
    new assertions failing against the PRISTINE parser, with at least one failure
    attributable to the hardcoded platform rung and at least one to the
    `ready: blocked` blind spot.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Host-aware rung in parse.js; frontmatter + host plumbed through extension.js</name>
  <files>
    ~/.vscode/extensions/gsd-phase-status/parse.js,
    ~/.vscode/extensions/gsd-phase-status/extension.js,
    ~/.vscode/extensions/gsd-phase-status/package.json
  </files>
  <behavior>
    - `todoTriage(fm, folder, host)` reds a known OS platform that is not `host`, greens one that is.
    - `platform: any`, a missing `platform:`, and an unrecognised value (`flurbled`) are ALWAYS actionable, at every host.
    - A falsy/unknown `host` disables the platform rung entirely rather than reddening everything.
    - Rung ORDER is unchanged: complete → parked → inprogress → platform → readiness → `?`.
    - Badge stays exactly 2 chars on every pending non-parked path, including the new `M` letter.
    - `tallyTodos(fms, host).open` counts only todos whose triage verdict is actionable.
    - `.planning/todos/pending`'s badge AND colour are unchanged by all of this.
  </behavior>
  <action>
    **parse.js — the platform rung.**

    Add a third parameter `host` to `todoTriage(fm, folder, host)`. Replace the
    two hardcoded `platform === 'windows'` / `=== 'linux'` branches with a single
    host comparison over a known-OS table:

      - Define a module-level map from canonical platform value to
        `{ letter, label }`: `macos` → `M` / "macOS only — not this machine",
        `windows` → `W` / "Windows only — not this machine",
        `linux` → `L` / "Linux only — not this machine". `M` is free — the
        letters in use are B W L . G H ? and the two 1-char exceptions ✓ ▶.
      - The rung fires only when the frontmatter platform is a KEY of that map
        AND `host` is truthy AND `platform !== host`. Everything else falls
        through to the readiness rungs exactly as today.
      - Export the map (or a `HOST_PLATFORMS` list) so extension.js and the tests
        share one vocabulary rather than two copies.

    Rewrite the in-situ comment. The current one ("macOS is the operator's own
    machine and so is NOT a blocker — it falls through to the readiness rungs
    deliberately") is now FALSE and is the exact sentence that made the bug look
    intentional. Replace it with the real rule: platform beats readiness because
    a todo you cannot verify HERE is not one you can pick up here, and "here" is
    a host lookup, not a constant. Note explicitly that `any`/missing/unknown are
    actionable everywhere.

    **parse.js — actionable, derived not forked.**

    Do NOT add a field to `todoTriage`'s return object: ~20 existing assertions
    compare that object whole via `JSON.stringify`, and widening it turns a
    behaviour change into a 20-line diff of pinned expectations. Instead derive
    actionability from the verdict's COLOUR, which is the channel the badges
    already use:

      - `const TRIAGE_STOOD_DOWN_COLORS = new Set(['charts.purple', 'charts.red'])`
        — purple is parked-or-blocked, red is wrong-platform. Everything else
        (green ready, blue live-gate, orange human, yellow in progress,
        descriptionForeground untriaged) is actionable.
      - `function triageActionable(triage)` → `!TRIAGE_STOOD_DOWN_COLORS.has(triage.color)`.
      - Comment WHY this is colour-keyed: it is what makes the folder number and
        the per-file badges agree by construction. Note the standing obligation
        it creates — if a future rung ever paints something red or purple that
        IS actionable, the set must be revisited. Task 3 pins that mapping with a
        cross-product sweep so the obligation is enforced, not just written down.
      - Export both.

    **parse.js — tallyTodos.**

    New signature `tallyTodos(fms, host)`: `fms` is one `parseFrontmatter()`
    result per PENDING file (null included — a todo with no frontmatter is still
    a todo). Return:

      { total, parked, unparked, open }

      total    — `fms.length`, unchanged
      parked   — `todoFileStatus(fm && fm.status, 'pending') === 'parked'`
      unparked — `total − parked`. **This is the OLD `open`.** It exists solely so
                 the `todos/pending` row's colour is unaffected (see below).
      open     — count of `triageActionable(todoTriage(fm, 'pending', host))`.
                 This is the actionable number.

    Rewrite the function's doc comment. Keep and re-point the existing rationale
    about the pending badge having to agree with the Explorer's file count — it
    is still the reason `total` survives. Add why `open` narrowed and what
    `unparked` is for.

    **extension.js — the host, and the plumbing.**

    - Near TODO_OPEN_COLOR (lines 64-65), add
      `const HOST_PLATFORM = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform] || null;`
      with a comment that `null` is deliberate on an unrecognised platform: it
      disables the rung rather than reddening every platform-tagged todo on, say,
      FreeBSD. parse.js stays pure — this is the only place `process.platform` is
      read, and the value travels as an argument.
    - `scanTodos`: collect `fm` objects instead of status words
      (`fms.push(fm)` where it currently pushes `todoStatus(fm.status)`), and call
      `tallyTodos(fms, HOST_PLATFORM)`. No extra I/O: the frontmatter is already
      read through the mtime+size cache. If `todoStatus` becomes unused in
      extension.js, leave the import alone only if something else still uses it —
      otherwise drop it from the `require('./parse')` destructure.
    - `decorateTodoFile`: pass the host — `todoTriage(fm, folder, HOST_PLATFORM)`.
    - `todoSummary()`: report the new meaning. Replace
      `${pending.open} open${parked}` with the actionable count and the
      stood-down count, e.g.
      `Todos: C/A done · 13 actionable, 11 stood down (2 parked)`. Compute
      stood-down as `pending.total - pending.open`; keep the parked number
      visible, it is the only place that distinction still surfaces.
    - `todoDecoration`, `todos/pending` row (~line 452): **PIN THIS.** Its badge
      is already `pending.total` — leave it. Its colour is
      `pending.open ? TODO_OPEN_COLOR : TODO_DONE_COLOR`; switch that to
      `pending.unparked ? ...` so the row behaves identically to today. Changing
      the pending row is explicitly out of scope, and `open` narrowing would
      otherwise flip it green the moment every remaining todo is stood down.
      Update its tooltip to the new wording (`24 pending — 13 actionable, 11
      stood down`), since the tooltip is prose, not the pinned badge.
    - `todoDecoration`, `todos` parent row (~line 470): unchanged code, new
      meaning — it already reads `pending.open`.
    - `updateStatusBar()` (~line 316): the `☐` expression needs no change.
      Its comment ("Open todos, not pending ones: a parked todo is a decision…")
      does — it now excludes blocked and wrong-platform too. Rewrite it.

    **package.json**: bump `version` `0.10.0` → `0.11.0`.
  </action>
  <verify>
    <automated>cd ~/.vscode/extensions/gsd-phase-status && node -e "const p=require('./parse');const A=[{platform:'windows',ready:'code',severity:'medium'},{platform:'macos',ready:'code',severity:'medium'}];const r=(h)=>A.map(f=>p.todoTriage(f,'pending',h).badge).join(',');console.log('macos',r('macos'));console.log('windows',r('windows'));console.log('linux',r('linux'));if(r('windows')!=='3.,3M')throw new Error('rung not host-aware');if(r('macos')!=='3W,3.')throw new Error('macOS regressed');console.log('OK')"</automated>
  </verify>
  <done>
    `todoTriage(fm,'pending','windows')` greens `platform: windows` and reds
    `platform: macos` with badge `3M`; host `'macos'` reproduces today's
    verdicts; `tallyTodos` accepts frontmatter + host and returns the four-field
    shape; `extension.js` reads `process.platform` exactly once and `parse.js`
    still contains no `require('vscode')`; `package.json` says `0.11.0`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Land the assertions, re-assert the live numbers, correct the README</name>
  <files>
    ~/.vscode/extensions/gsd-phase-status/test-parse.js,
    ~/.vscode/extensions/gsd-phase-status/README.md,
    .planning/quick/260919-sya-make-the-gsd-phase-status-vs-code-extens/260919-sya-SUMMARY.md
  </files>
  <action>
    **Land the red-proofed assertions.** Move the assertions written in Task 1's
    redproof copy into the real `test-parse.js`, in the `todoTriage` block that
    starts at the `// --- todoTriage: severity+readiness badges on pending todos
    (v0.10.0) ---` comment. Label the block for v0.11.0.

    **Three known-stale assertions must be updated — expect these reds, they are
    not new bugs:**

    1. `test-parse.js:610` —
       `eq(p.tallyTodos(st), { total: 5, parked: 1, open: 4 }, …)`. Signature and
       shape both changed. Rewrite it to drive frontmatter objects and a host,
       and to expect the four-field result. Keep its point intact: a todo with
       **no `status:` line at all** is still counted (that is what the `null`
       entry is for) — do not lose that case while reshaping.
    2. `test-parse.js:611` — `tallyTodos([])` must still tally to all-zeros;
       update to the new shape and pass a host.
    3. The 2-character cap sweep at ~line 741. It loops
       8 severities × 8 readiness × 8 platforms and pins
       `eq(combos, 512, 'triage: the cap sweep really covered the whole
       cross-product (non-vacuity)')`. Add the host dimension — drive
       `['macos','windows','linux', null]` — and **update 512 to the new product
       (2048)**. That non-vacuity assertion exists precisely so a widened sweep
       cannot quietly stop covering the cross-product; do not delete it, and do
       not "fix" the red by shrinking the loop. The 2-char invariant must hold at
       every host, `M` included.

    **New assertions to add beyond the red-proof set:**

    - Unknown/absent host: `todoTriage({platform:'windows',ready:'code',severity:'medium'},'pending',null)`
      is GREEN — an unrecognised OS disables the rung rather than reddening
      everything. Same for `undefined` and `''`.
    - `platform: any`, missing `platform`, and `platform: 'flurbled'` are
      actionable at all three hosts.
    - Rung precedence survives: a parked todo with `platform: windows` at host
      `'macos'` is still purple `B` (parked beats platform); a `completed/` file
      with a blocking platform is still `✓` at every host.
    - Colour→actionable mapping is pinned non-vacuously: sweep the cross-product
      and assert `triageActionable(t) === !['charts.purple','charts.red'].includes(t.color)`,
      plus assert that the sweep actually observed **both** an actionable and a
      stood-down verdict (otherwise the sweep could pass vacuously).
    - The 24-row live-census fixture from `<measured_numbers>`, asserted at all
      three hosts: `open` = 13 / 12 / 11, with `total: 24`, `parked: 2`,
      `unparked: 22` at every host (parked and unparked are host-independent —
      assert that too; it catches a tally that accidentally makes the file count
      host-dependent).
    - Case and whitespace, matching the existing convention at :729-732:
      `platform: '  Windows  '` at host `'windows'` is actionable.

    **Run the suite** in the extension directory: `node test-parse.js`. Exit 0,
    `ok` count strictly greater than the 260 baseline, zero FAIL lines.

    **Re-assert against the live tree** (the fixture is a reproduction; this
    proves the reproduction is faithful). Replay `tallyTodos` over
    `/Users/graysonmitchell/Projects/GameLib/.planning/todos/pending` at each
    host and confirm 13 / 12 / 11 with total 24. If the live tree has drifted
    since this plan was written (a todo added or closed), the numbers move —
    report the new census rather than editing the fixture to match without
    saying so.

    **README.** The todo badge table at ~line 248: the `todos/` row currently
    reads "open todos, or ✓ when there are none". Change it to the actionable
    count, and extend the surrounding prose (the sentence "`.planning/todos`
    itself is badged with the number still open") to state the rule: parked,
    `ready: blocked`, and todos tagged for another OS are excluded; `pending/`
    still shows the raw file count. Say that the host comes from
    `process.platform`, so the same tree reads differently on a different
    machine — that is the point.

    **Observed but OUT OF SCOPE — record it, do not fix it.** The second README
    table ("Individual todo files … | In `pending/` | ○ | grey |") is stale
    independently of this change: v0.10.0 replaced that flat `○` with the
    severity+readiness triage badge, and the README never mentions `severity:`,
    `platform:` or `ready:` anywhere (grep returns zero hits). Note it in the
    SUMMARY as a pre-existing documentation gap so it is not lost, and leave it.

    **SUMMARY.** Write `260919-sya-SUMMARY.md` recording: the before/after
    numbers (22 → 13 on macOS), the three-host census, the red-proof evidence
    (that the new assertions failed against the pristine parser), the assertion
    count before and after, the stale README table above, and — prominently —
    **that VS Code must be reloaded (Developer: Reload Window) before any
    `parse.js` / `extension.js` change takes effect.** The extension is loaded
    once at startup; without a reload the badges will still show the old numbers
    and look like the fix failed.

    **Commit only the planning artifacts.** Nothing under `~/.vscode/extensions/`
    is committable — see `<not_committable>`. Scope the commit with `--files` to
    the `.planning/quick/260919-sya-*/` directory.
  </action>
  <verify>
    <automated>cd ~/.vscode/extensions/gsd-phase-status && node test-parse.js > /tmp/sya-suite.txt 2>&1 && grep -q 'All parser tests passed' /tmp/sya-suite.txt && test "$(grep -c '^ok  ' /tmp/sya-suite.txt)" -gt 260 && node -e "const p=require('./parse'),fs=require('fs');const d='/Users/graysonmitchell/Projects/GameLib/.planning/todos/pending';const fms=fs.readdirSync(d).filter(f=>/\.md$/i.test(f)).map(f=>p.parseFrontmatter(fs.readFileSync(d+'/'+f,'utf8')));const got=['macos','windows','linux'].map(h=>p.tallyTodos(fms,h).open).join(',');console.log('live actionable:',got,'total',fms.length);if(got!=='13,12,11')throw new Error('live tree disagrees with the plan census: '+got)"</automated>
  </verify>
  <done>
    Suite exits 0 with more than 260 assertions and zero FAILs; the live tree
    replays to 13/12/11 actionable at macOS/Windows/Linux over 24 files; the
    cap sweep's non-vacuity count reads 2048; README's `todos/` row describes the
    actionable rule; SUMMARY records the numbers, the red-proof, the stale
    second README table and the reload requirement; only `.planning/quick/260919-sya-*/`
    is committed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| todo frontmatter → parse.js | Arbitrary operator-authored YAML values reach the triage ladder. Already handled by `normalizeTriageValue` (string-guard + trim + lowercase); the new host comparison must not widen it. |
| `process.platform` → parse.js | A host string crosses into the pure parser as an argument. Unrecognised values must degrade to "no host" (rung off), never to "everything is foreign". |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sya-01 | Information disclosure | tooltips / status bar | accept | Counts only; no todo content or path leaves the Explorer surface. No change to what is rendered per file. |
| T-sya-02 | Denial of service | `todoTriage` in `tallyTodos` | accept | Tally now runs the ladder once per pending file (24) instead of a string compare. Pure, allocation-light, no I/O — frontmatter is already cached on mtime+size. |
| T-sya-03 | Tampering | unrecognised `host` value | mitigate | Falsy/unknown host disables the platform rung (asserted in Task 3), so a bad `process.platform` cannot redden every platform-tagged todo. |
| T-sya-SC | Tampering | package installs | n/a | No dependency is added or changed. `package.json` edit is the `version` field only. |
</threat_model>

<verification>
1. `node test-parse.js` in `~/.vscode/extensions/gsd-phase-status`: exit 0, >260 `ok`, zero `FAIL`.
2. Live replay: `tallyTodos` over the 24-file pending tree → `open` 13 (macos) / 12 (windows) / 11 (linux), `total` 24, `parked` 2.
3. `grep -c "require('vscode')" parse.js` → 0. The parser stays pure.
4. `grep -c 'process.platform' extension.js` → exactly 1.
5. `diff -r <scratchpad>/pristine ~/.vscode/extensions/gsd-phase-status` names only the five intended files.
6. Manual, after `Developer: Reload Window`: `.planning/todos` badges `13`, the status bar reads `☐ 13`, and `.planning/todos/pending` still badges `24` in orange.
</verification>

<success_criteria>
- `todoTriage` compares `platform:` against a host passed in from `extension.js`; the macOS constant and its now-false comment are gone.
- `M` joins `W`/`L`; badge is still exactly 2 chars across the widened cross-product (2048 combos, asserted).
- `tallyTodos`'s `open` is derived from `todoTriage`'s verdict, not from a second copy of the vocabulary.
- `.planning/todos/pending` badge and colour are unchanged; only the parent row, the status bar and the tooltips move.
- New assertions were proven RED against the pristine parser before the fix existed.
- README's `todos/` row matches the shipped behaviour.
- `version` is `0.11.0`; the reload requirement is written down where the operator will see it.
</success_criteria>

<output>
Create `.planning/quick/260919-sya-make-the-gsd-phase-status-vs-code-extens/260919-sya-SUMMARY.md` when done.
</output>
