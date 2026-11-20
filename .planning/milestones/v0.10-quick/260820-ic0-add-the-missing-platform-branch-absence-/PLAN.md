---
phase: quick-260820-ic0
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
autonomous: true
requirements: [QUICK-260820-IC0, T-34.5-17, T-34.5-32]

must_haves:
  truths:
    - "A comment-stripped read of `src/backend/sidecar/wineToolsFlowRegistration.ts` is asserted in CI to contain zero occurrences of `process.platform`, `isMac` and `isLinux` — the mitigation both threat rows declared."
    - "The gate is RED-proven against specimens derived by INSERTING a real branch shape into the real source text (`if (isMac) { return true }`, `if (!isLinux) { return }`, `if (process.platform === 'darwin') { return true }`), not against hand-authored strings."
    - "The RED-proof exercises the SAME code path as the live assertion — one shared `platformTokenHits()` helper and one shared pattern table, so proving the regex fires also proves the gate fires."
    - "The gate does not false-positive on the longer real identifiers this codebase already contains (`isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily`, `effectiveIsMacNative`) — proven by assertion, not by inspection."
    - "The gate runs against a FILLED specimen: the RAW (unstripped) source is asserted to CONTAIN all three tokens, so a broken comment stripper turns the gate red instead of making it vacuous."
    - "`src/backend/sidecar/wineToolsFlowRegistration.ts` is byte-for-byte identical to HEAD — this task builds the guard, it does not touch the guarded module."
    - "Every pre-existing test in `wineToolsFlows.test.ts` (Describes 1-5) still passes unchanged."
    - "`34.5-SECURITY.md` records R2 as CLOSED with the original finding text preserved verbatim, and states what the gate does NOT prove."
    - "The unrelated working-tree changes (` M .planning/STATE.md`, untracked `.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/`) survive untouched and unstaged."
  artifacts:
    - path: "src/backend/sidecar/__tests__/wineToolsFlows.test.ts"
      provides: "Describe 6 — the platform-branch absence gate for T-34.5-17 / T-34.5-32"
      contains: "platformTokenHits"
    - path: ".planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md"
      provides: "R2 closed; threats_open 3 -> 1, threats_closed 359 -> 361; audit-trail row"
      contains: "quick-260820-ic0"
  key_links:
    - from: "src/backend/sidecar/__tests__/wineToolsFlows.test.ts"
      to: "src/backend/sidecar/wineToolsFlowRegistration.ts"
      via: "readFileSync + stripSourceComments source-text read"
      pattern: "readFileSync\\([^)]*wineToolsFlowRegistration"
    - from: "src/backend/sidecar/__tests__/wineToolsFlows.test.ts"
      to: "src/backend/testUtils/stripSourceComments.ts"
      via: "shared comment stripper (NOT a new hand-rolled one)"
      pattern: "from 'backend/testUtils/stripSourceComments'"
---

<objective>
Close security threats `T-34.5-17` (plan 34.5-05) and `T-34.5-32` (plan 34.5-09) — root cause
**R2** in `34.5-SECURITY.md` — by building the control both rows already claim to have.

Both rows declare, verbatim:

> "`grep` asserts no `process.platform`/`isMac`/`isLinux` branch was introduced outside comments"

in `src/backend/sidecar/wineToolsFlowRegistration.ts`. The invariant is TRUE today. **The
assertion does not exist.** So a future edit reintroducing a platform branch ships with zero CI
signal, and the rows were scored OPEN on the project rule that *a grep assertion must be able to
fail against a known-bad input* — here there is no assertion at all.

Purpose: turn "true today by inspection" into a control. Nothing about the module changes.
Output: one new describe block in an existing test file, plus the register closure.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
@src/backend/sidecar/__tests__/wineToolsFlows.test.ts
@src/backend/testUtils/stripSourceComments.ts
@src/backend/sidecar/wineToolsFlowRegistration.ts
</context>

<locked_findings>
Verified by hand before planning. Do NOT re-derive these; they are inputs, not questions.

**1. The invariant holds, and the file is a FILLED specimen.**
`src/backend/sidecar/wineToolsFlowRegistration.ts` (224 lines) contains the forbidden tokens at
exactly **5 lines — 204, 207, 218, 220, 222** — all of them whole-line `//` comments carrying
D-13 rationale text. Note this corrects the R2 finding's own text, which lists only 207/218/222.
Zero live occurrences.

Because the RAW file genuinely contains all three tokens, the comment stripper is load-bearing:
the gate cannot be vacuously green. Assert that explicitly (see Task 1).

**2. `stripSourceComments` already handles this file's shape.** All 5 occurrences are lines whose
first non-whitespace characters are `//`, which is exactly what the shared stripper's line filter
drops. Its known limitation (a TRAILING `// ...` on a code line is not stripped) does not apply —
there are no trailing comments carrying these tokens in this file.

**3. Use the shared helper. Do NOT write a new comment stripper.**
`src/backend/testUtils/stripSourceComments.ts`, imported as
`from 'backend/testUtils/stripSourceComments'`. `wineToolsFlows.test.ts` **already imports it**
(line 74) and already imports `readFileSync` from `fs` (line 66) and `join` from `path` (line 67).
No new imports are required for the gate itself.

**4. The substring trap is REAL in this codebase.** A naive `includes('isMac')` /
`includes('isLinux')` would match inside these identifiers, all of which actually exist in `src/`:

    effectiveIsLinuxNative   isLinuxFamily      isMacNative          isMacOverlayTitlebar
    effectiveIsMacNative     isLinuxNative      isMacOSUpToDate      isMacSonomaOrHigher
                                                isMacOnedirRunner    isMacWebview

`\bisMac\b` and `\bisLinux\b` reject every one of them (each has a word character immediately
after the token, so `\b` fails; the `effectiveIs*` forms carry a capital `I` and cannot match a
case-sensitive lowercase pattern). Empirically confirmed against all of the above.

**5. The exported constants the gate must catch are exactly these names.**
`src/backend/constants/environment.ts:23,26` export `isMac` and `isLinux` as bare identifiers, so
a reintroduced branch reads `isMac` / `isLinux` / `!isLinux` and `\b`-anchoring catches it. An
`import { isMac } from '../constants'` line is caught too.

**6. No evidence shard carries these rows.** `34.5-SECURITY-EVIDENCE-{C5,C6,G6}.md` were searched
for `T-34.5-17` / `T-34.5-32`: zero hits. (The one `wineToolsFlowRegistration.ts` mention in
`-C5.md:29` is an unrelated `toggleDXVK` registration-kind citation.) R2's rows came from the BASE
shard, which wrote no evidence file. Task 2 re-verifies this with a command rather than trusting
it, but expect no amendment.
</locked_findings>

<placement_decision>
**Decision: extend the existing `src/backend/sidecar/__tests__/wineToolsFlows.test.ts` with a new
Describe 6. Do not create a new file.**

Justification:
- It is already the source-text gate host for this exact module. Describe 2 ("curated-import
  guard", lines 117-140) already does `readFileSync(join(__dirname, '..',
  'wineToolsFlowRegistration.ts'), 'utf-8')` → `stripSourceComments(source)` → `not.toMatch`.
  The new gate is the same technique on the same file for the same plan pair (34.5-05/34.5-09).
- Both imports the gate needs are already present, so a new file would duplicate them for nothing.
- The file is 287 lines with five describes; a sixth is comfortably within this repo's norms.
- A separate file would split this module's source-text invariants across two locations, which is
  precisely how the *next* gate goes missing.

It goes in its **own** describe rather than inside Describe 2 because Describe 2's contract is the
curated-import/foreign-channel guard (T-34.5-15); folding a different threat pair into it would
make the register's `(plan, threat_id)` audit unit harder to trace back to a named test.
</placement_decision>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the platform-branch absence gate, RED-proven by insertion, to wineToolsFlows.test.ts</name>
  <files>src/backend/sidecar/__tests__/wineToolsFlows.test.ts</files>

  <behavior>
    Four assertions, in one new describe block, all routed through ONE shared helper:

    - Invariant (the gate itself): comment-stripped `wineToolsFlowRegistration.ts` yields an
      EMPTY list of platform-token hits.
    - Filled-specimen / stripper-integrity control: the RAW, unstripped source yields ALL THREE
      token names — proving the source really does contain them and the stripper is what makes
      the gate green, so a broken stripper turns the gate RED rather than vacuous.
    - RED-proof: three specimens, each derived by APPENDING one real branch shape to the real
      source text, each yielding exactly the one token name it introduced.
    - False-positive control: specimens appending the longer real identifiers
      (`isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily`, `effectiveIsMacNative`)
      yield an EMPTY list.
  </behavior>

  <action>
Append a new describe block to the END of the file (currently ends at line 287 with the close of
Describe 5). Do not disturb lines 1-287 other than the header-comment edit noted below.

Build it from these pieces, in this order:

1. A module-scope const table, defined once and shared by every assertion in the block. Name it
   `PLATFORM_PATTERNS` and shape it as an array of `{ name, pattern }` entries with exactly three
   members, in this order: `'process.platform'` with `/process\.platform/`, `'isMac'` with
   `/\bisMac\b/`, `'isLinux'` with `/\bisLinux\b/`.

   The `\b` anchoring on the two bare identifiers is load-bearing and MUST be commented as such,
   naming at least `isMacNative` and `isLinuxFamily` as the real in-repo identifiers a naive
   `includes()` would have falsely matched. `process.platform` needs no anchor — the `.` makes it
   unambiguous — but its `.` MUST be escaped.

2. A single helper, `platformTokenHits(sourceText: string): string[]`, returning the `name` of
   every entry in `PLATFORM_PATTERNS` whose `pattern` tests true against the argument. It takes
   ALREADY-PREPARED text and does no stripping itself, so callers choose stripped vs raw.

   This helper is the anti-vacuity mechanism: the live assertion and the RED-proof MUST both go
   through it, so proving the patterns fire is the same act as proving the gate fires. Do NOT
   restate a regex literal inline in any assertion in this block.

3. A `WINE_TOOLS_REGISTRATION_SRC_PATH` const built with `join(__dirname, '..',
   'wineToolsFlowRegistration.ts')`, mirroring Describe 2's existing call, and a single
   `readFileSync(..., 'utf-8')` read of it held in a const for reuse by all four tests.

4. The four tests described in `<behavior>`. Assert with `toEqual` on the returned array — exact,
   not merely truthy — so a test that starts matching the wrong token cannot pass:
   - invariant: `toEqual([])` against `stripSourceComments(realSource)`.
   - filled-specimen control: `toEqual(['process.platform', 'isMac', 'isLinux'])` against the RAW
     `realSource`. Comment this assertion as the stripper-integrity control and say plainly that
     it is expected to change if the D-13 rationale comments at lines 204-222 are ever reworded —
     in which case the correct response is to re-derive it, never to delete it.
   - RED-proof: for each of the three branch shapes below, a specimen built as
     `` `${realSource}\n${branch}\n` ``, passed through `stripSourceComments`, asserted
     `toEqual([<the one token name>])`. Use these exact shapes — real branches, not bare tokens:
       * `if (isMac) { return true }` -> `['isMac']`
       * `if (!isLinux) { return }` -> `['isLinux']`
       * `if (process.platform === 'darwin') { return true }` -> `['process.platform']`
     Title this test in the shape `keyringTokenStore.test.ts` uses, i.e. beginning
     `RED-proof: ...trips against a specimen derived by inserting the forbidden branch into the
     real wineToolsFlowRegistration.ts source`.
   - false-positive control: `it.each` over the five longer identifiers, each specimen built as
     `` `${realSource}\nconst ${identifier} = true\n` ``, stripped, asserted `toEqual([])`.

5. Name both threat IDs (`T-34.5-17`, `T-34.5-32`) and the two plans (34.5-05, 34.5-09) in the
   describe title or in the test titles, so the register's `(plan, threat_id)` audit unit maps to
   a named test by grep.

6. Update the file's top doc comment: it currently opens "Five describe blocks:" with a numbered
   1-5 list. Change it to "Six describe blocks:" and add entry 6 for this gate.

   This is safe and is NOT self-invalidating: that doc comment lives in the TEST file, whereas the
   gate reads `wineToolsFlowRegistration.ts`. Mentioning `process.platform`/`isMac`/`isLinux` in
   the test file's prose cannot affect the assertion. Do not contort the wording to avoid the
   tokens.

Hard prohibitions for this task:
- Do NOT modify `src/backend/sidecar/wineToolsFlowRegistration.ts` — not even temporarily as a
  manual RED experiment. The in-test insertion specimens ARE the RED-proof; that is the whole
  point of deriving them from the real source text in memory.
- Do NOT hand-roll a comment stripper or layer a naive `/\/\/.*$/gm` pass. Use the shared
  `stripSourceComments` already imported at line 74.
- Do NOT touch `src/backend/sidecar/__tests__/testContainment.test.ts`. Its 23 platform mentions
  are an adversarial harness (`withAdversarialPlatformAndEnv` forces `process.platform` to
  `'linux'` and restores it); it is not, and must not become, this gate.
- Do NOT edit Describes 1-5.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/sidecar/__tests__/wineToolsFlows.test.ts 2>&1 | tail -30</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git diff --quiet HEAD -- src/backend/sidecar/wineToolsFlowRegistration.ts && echo "UNCHANGED-OK: guarded module byte-identical to HEAD" || { echo "FAIL: wineToolsFlowRegistration.ts was modified — revert it"; exit 1; }</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx eslint src/backend/sidecar/__tests__/wineToolsFlows.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/backend/sidecar/__tests__/wineToolsFlows.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>

  <done>
    - `npx jest src/backend/sidecar/__tests__/wineToolsFlows.test.ts` is green, with the suite's
      test count increased by exactly the new tests and every pre-existing test still passing.
    - The new describe contains a single `PLATFORM_PATTERNS` table and a single
      `platformTokenHits()` helper; no assertion in the block restates a regex literal inline.
    - `git diff --quiet HEAD -- src/backend/sidecar/wineToolsFlowRegistration.ts` exits 0.
    - `npx eslint` and `npx prettier --check` on the changed file are both clean, run SEPARATELY
      from `tsc` (a green `tsc` says nothing about CI lint on this repo).
    - `npx tsc --noEmit` reports no new errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close R2 in 34.5-SECURITY.md and commit by explicit path</name>
  <files>.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md</files>

  <action>
First, re-verify the evidence-shard question rather than trusting the planner's finding. Run:

    grep -rn 'T-34\.5-17\b\|T-34\.5-32\b' .planning/phases/34.5-*/34.5-SECURITY-EVIDENCE-*.md

Expected: no output — R2's rows came from the BASE shard, which wrote no evidence file. If it DOES
return hits, amend those rows to CLOSED in the same shape used below and add the file to
`files_modified` and to the commit. Record either outcome explicitly in the SUMMARY.

Then make these edits to
`.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md`.
Line numbers are from the pre-edit file; match on the quoted text, not the number.

1. Frontmatter: `threats_open: 3` -> `threats_open: 1` (line 5).
2. Frontmatter: `threats_closed: 359` -> `threats_closed: 361` (line 7).
   Leave `threats_total: 362`, `threats_accepted: 3`, and **`status: blocked`** UNCHANGED — R4 is
   still open, so the phase stays blocked. There is no `AR-` row for this task: nothing is being
   accepted, the control is being built.
3. Line 95 heading: `## Open Threats — 3 rows, 2 root causes`
   -> `## Open Threats — 1 row, 1 root cause`
4. The italic parenthetical at lines 97-100: keep it intact and append one sentence recording R2's
   closure the way R3's is recorded — that R2 (2 rows) was closed on 2026-08-20 by
   `quick-260820-ic0` building the missing control, a fix rather than a disposition.
5. Line 102 heading: retitle to CLOSED, matching R3's shape at line 123 exactly
   (`### R3 — CLOSED 2026-08-20 — <original title> (...)`):

       ### R2 — CLOSED 2026-08-20 — A promised `grep` assertion that does not exist (2 rows, Elevation of Privilege)

6. **PRESERVE lines 104-121 VERBATIM** — the two-row table and all three finding paragraphs. Do
   not reword, do not trim, do not "fix" them. Append the closure block AFTER line 121, following
   the shape of R3's closure at lines 157-181. It must state:
   - `**CLOSED 2026-08-20 (quick-260820-ic0).**` and that the fix was to BUILD the declared
     control, not to change the guarded module — `wineToolsFlowRegistration.ts` is byte-identical
     to its pre-task state and the invariant it asserts was already true.
   - Where the control lives: Describe 6 of `src/backend/sidecar/__tests__/wineToolsFlows.test.ts`,
     reading the module with `readFileSync` and the shared
     `backend/testUtils/stripSourceComments`, asserting zero hits for `process.platform`,
     `\bisMac\b`, `\bisLinux\b`.
   - How it is RED-proven: specimens derived by INSERTING real branch shapes
     (`if (isMac) { return true }`, `if (!isLinux) { return }`,
     `if (process.platform === 'darwin') { return true }`) into the real source text, run through
     the same `platformTokenHits()` helper as the live assertion — so the RED-proof exercises the
     gate, not a parallel copy of its regex.
   - The word-boundary decision and why: `isMac`/`isLinux` are short substrings, and this repo
     really does contain `isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily` and
     `effectiveIsMacNative`; a naive `includes()` would have matched all of them. Covered by a
     dedicated false-positive control.
   - The filled-specimen property: the raw module DOES contain all three tokens (in D-13 comments),
     so a broken comment stripper turns the gate RED rather than silently vacuous — asserted
     explicitly.
   - A correction to this finding's own text, offered as a correction and not by editing the
     preserved paragraph: the comment references are at lines **204, 207, 218, 220, 222**, five
     lines, not the three listed above.
   - **What this gate does NOT prove**, so the register does not overclaim in the other direction:
     it is a source-text gate over ONE file, keyed to the three tokens the mitigation named. It
     does not cover `isWindows`, does not cover platform branching reached indirectly (e.g. a
     helper in another module that itself branches), does not cover a token appearing inside a
     string literal, and asserts nothing about runtime behaviour. A behavioural
     adversarial-platform test was considered and deliberately NOT written: the declared
     mitigation is a source-text grep and this closure delivers the mitigation as declared. If
     behavioural coverage is wanted later it is new scope, not a gap in this closure.
7. Line 344, in the Accepted Risks Log preamble, currently reads:
   `**The 4 remaining open rows — R2 ×2, R3, R4 — are NOT accepted.**`
   This was ALREADY stale before this task (R3 closed under `quick-260820-fyl` without it being
   updated). Correct both drifts in one pass: it becomes the 1 remaining open row, R4, still not
   accepted. Leave the three `AR-` table rows untouched.
8. Append one row to the Security Audit Trail table, immediately after the existing
   `quick-260820-fyl` row (line 362), matching that row's column shape:

       | 2026-08-20 | 362 | 361 | 1 | quick-260820-ic0 — R2 (`T-34.5-17` plan 34.5-05, `T-34.5-32` plan 34.5-09) closed by BUILDING the declared `grep` control in `wineToolsFlows.test.ts` Describe 6, RED-proven against insertion-derived branch specimens. The guarded module is unchanged. R4 remains OPEN. |

9. Gate section line 368: `**PHASE 34.5 SECURITY BLOCKED — `threats_open: 3`.**`
   -> `` **PHASE 34.5 SECURITY BLOCKED — `threats_open: 1`.** ``
10. Gate section lines 374-375, currently listing R2 and R4 as remaining: reduce to R4 only
    (1 row — a `transfer` whose target retired on a bar it did not meet), still not accepted.
    Leave line 377 (`No next-phase routing is emitted while `threats_open > 0`.`) unchanged — it
    still holds.

Finally, commit. **Commit by explicit path only.** The working tree carries UNRELATED changes that
must survive untouched and unstaged: ` M .planning/STATE.md` and untracked
`.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/`.

- `git stash` is PROHIBITED (run in error three times on this project; twice stranded a concurrent
  session's work). Never `git stash`, never pop.
- `git add -A` and `git add .` are PROHIBITED.
- `gsd-sdk query commit` is PROHIBITED — it stages the entire tree.

Run `git status --short` first, then stage exactly:

    git add src/backend/sidecar/__tests__/wineToolsFlows.test.ts \
            .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md \
            .planning/quick/260820-ic0-add-the-missing-platform-branch-absence-/PLAN.md \
            .planning/quick/260820-ic0-add-the-missing-platform-branch-absence-/SUMMARY.md

Then `git status --short` again and CONFIRM `.planning/STATE.md` shows as unstaged-modified (` M`)
and `260819-p2d-uat-3413-bottle-prefill-note/` still shows as untracked (`??`) BEFORE committing.
If either is staged, unstage it with `git restore --staged <path>` and re-check.

Commit message:

    test(quick-260820-ic0): add the missing platform-branch absence gate (T-34.5-17, T-34.5-32)
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -c 'quick-260820-ic0' .planning/phases/34.5-*/34.5-SECURITY.md</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && awk '/^---$/{n++; next} n==1' .planning/phases/34.5-*/34.5-SECURITY.md | grep -E '^(status|threats_open|threats_closed|threats_total|threats_accepted):'</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -n 'Open Threats — \|### R2 — \|PHASE 34.5 SECURITY BLOCKED' .planning/phases/34.5-*/34.5-SECURITY.md</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git status --short | grep -E '(STATE\.md|260819-p2d)' </automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git show --stat --oneline HEAD | head -20</automated>
  </verify>

  <done>
    - Frontmatter reads `threats_open: 1`, `threats_closed: 361`, `threats_total: 362`,
      `threats_accepted: 3`, and `status: blocked` is UNCHANGED.
    - The Open Threats heading reads `1 row, 1 root cause`; the R2 heading is retitled CLOSED with
      lines 104-121 of the original finding preserved verbatim; the closure block states both what
      the gate proves and what it does not.
    - The Accepted Risks Log preamble and the Gate section both name R4 as the only remaining open
      row; no `AR-` row was added.
    - A `quick-260820-ic0` audit-trail row exists reading `362 | 361 | 1`.
    - The evidence-shard grep result (hits or none) is recorded in the SUMMARY.
    - `git status --short` still shows ` M .planning/STATE.md` and `?? .planning/quick/260819-p2d-...`
      as UNSTAGED/untracked after the commit.
    - `git show --stat HEAD` lists ONLY the four intended paths.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| future editor -> `wineToolsFlowRegistration.ts` | A platform branch reintroduced into the sidecar's curated Wine registration module diverges from, and eventually contradicts, the upstream `tools/index.ts` guards the D-13 comments say are authoritative. This task builds the CI tripwire on that boundary. |
| gate -> its own evidence | A source-text gate that cannot fail is indistinguishable from no gate. This is the exact defect being closed, so the gate's own non-vacuity is inside the boundary. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| `T-34.5-17` | Elevation of Privilege | `wineToolsFlowRegistration.ts` (plan 34.5-05) | mitigate | Build the declared control: Describe 6 of `wineToolsFlows.test.ts` asserts zero `process.platform` / `\bisMac\b` / `\bisLinux\b` in the comment-stripped module. |
| `T-34.5-32` | Elevation of Privilege | `wineToolsFlowRegistration.ts` (plan 34.5-09) | mitigate | Same control; the two rows share one root cause (R2) and are closed by the same assertion. |
| `T-IC0-01` | Tampering | the new gate itself | mitigate | RED-proven against specimens derived by INSERTING real branch shapes into the real source, routed through the same `platformTokenHits()` helper as the live assertion — no parallel regex copy. |
| `T-IC0-02` | Spoofing | `\bisMac\b` / `\bisLinux\b` patterns | mitigate | Dedicated false-positive control over five longer identifiers that really exist in this repo (`isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily`, `effectiveIsMacNative`). |
| `T-IC0-03` | Tampering | `stripSourceComments` regression | mitigate | Filled-specimen assertion: the RAW module is asserted to contain all three tokens, so a broken stripper turns the gate RED instead of vacuous. |
| `T-IC0-04` | Repudiation | concurrent-session work in the tree | mitigate | Commit by explicit path only; `git stash` / `git add -A` / `gsd-sdk query commit` prohibited; `git status --short` asserted before AND after staging. |
| `T-34.5-SC` | Tampering | npm/pip/cargo installs | mitigate | No packages are installed by this task. Not applicable. |
</threat_model>

<out_of_scope>
Explicitly NOT done. Each was considered and rejected for a stated reason — do not "helpfully" add
them, and do not record them as gaps.

- **Modifying `src/backend/sidecar/wineToolsFlowRegistration.ts`.** The invariant already holds
  (zero live occurrences). This task adds its guard, nothing else. Task 1 verifies the file is
  byte-identical to HEAD.
- **A behavioural adversarial-platform test.** Considered and deliberately not chosen: the
  register's declared mitigation is a source-text grep, and this task closes the mitigation as
  declared. Noted here and in the ledger closure for the record. Behavioural coverage would be new
  scope.
- **Touching `src/backend/sidecar/__tests__/testContainment.test.ts`.** Its 23 platform mentions
  are the `withAdversarialPlatformAndEnv` harness, not a token-absence gate. Leave it alone.
- **Widening the token list to `isWindows` or the `isMacNative`/`isLinuxNative` family.** The
  mitigation names three tokens; the closure delivers three. The non-coverage is disclosed in the
  ledger's "what this gate does NOT prove" paragraph rather than silently expanded away.
- **Any `AR-` accepted-risk row.** Nothing is being accepted — the control is being built.
- **Clearing `status: blocked`.** R4 is still open.
</out_of_scope>

<verification>
1. `npx jest src/backend/sidecar/__tests__/wineToolsFlows.test.ts` — green, Describes 1-5 unchanged
   and passing, Describe 6 added.
2. `git diff --quiet HEAD -- src/backend/sidecar/wineToolsFlowRegistration.ts` — exits 0.
3. `npx eslint` and `npx prettier --check` on the changed test file — both clean, run separately
   from `tsc`.
4. `npx tsc --noEmit` — no new errors.
5. `34.5-SECURITY.md` frontmatter: `threats_open: 1`, `threats_closed: 361`, `status: blocked`.
6. `git status --short` after commit still shows ` M .planning/STATE.md` and the untracked
   `260819-p2d-...` directory.
</verification>

<success_criteria>
- A future edit that reintroduces `process.platform`, `isMac` or `isLinux` as live code into
  `src/backend/sidecar/wineToolsFlowRegistration.ts` fails CI, and the failing test names
  `T-34.5-17` / `T-34.5-32`.
- That claim is proven, not asserted: the gate goes RED against specimens derived by inserting
  real branch shapes into the real source, through the same helper the live assertion uses.
- The gate does not fire on the longer identifiers this repo already contains, proven by assertion.
- The guarded module is unchanged.
- `34.5-SECURITY.md` records R2 CLOSED with its original finding text preserved and its limits
  disclosed; `threats_open` drops 3 -> 1 with R4 correctly left open and the phase still blocked.
- No unrelated working-tree change was staged, committed, stashed, or lost.
</success_criteria>

<output>
Create `.planning/quick/260820-ic0-add-the-missing-platform-branch-absence-/SUMMARY.md` when done.

It MUST record:
- The exact new test names added, and the pre/post test counts for `wineToolsFlows.test.ts`.
- The RED-proof outcome verbatim — which specimen produced which token list.
- The evidence-shard grep result (hits, or confirmed none).
- The commit SHA and the exact list of files in `git show --stat HEAD`.
- Confirmation that `.planning/STATE.md` and `260819-p2d-uat-3413-bottle-prefill-note/` were left
  unstaged and untouched.
</output>
