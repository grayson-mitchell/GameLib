---
phase: 260921-saw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "The audit-mode scanScope run against SettingsModal/index.tsx is executed and its ACTUAL violation output recorded BEFORE any artifact is edited"
    - "meta/i18nForkTouchedFiles.json lists src/frontend/screens/Settings/components/SettingsModal/index.tsx"
    - "meta/__tests__/genI18nGateScope.test.ts reports 26 passed / 0 failed with NO 'staleness guard SKIPPED' warning in its output"
    - "DECLARED_UNSCANNED_DEBT still has exactly 41 entries"
    - "Every hardcoded count in the suite (in assertions AND in test titles) equals a number RE-DERIVED from the artifacts on disk after the edit, not copied from the brief"
    - "A dated 2026-09-21 journal entry naming 5d220d1cd, all three before/after counts, the audit result and the regenerate-vs-hand-edit route sits in the same doc comment as its precedents"
    - "Three executed mutation probes prove the green is load-bearing: breaking the debt array, the fork-touched artifact, or the scope artifact each turns a NAMED spec red"
    - "pnpm test:ci is green, or its remaining redness is attributed to a named commit that is not this staleness"
  artifacts:
    - path: "meta/i18nForkTouchedFiles.json"
      provides: "the refreshed CI-readable fork-touched pin"
      contains: "SettingsModal/index.tsx"
    - path: "meta/i18nGateScope.json"
      provides: "the promoted blocking-gate scope (Route A only)"
      contains: "SettingsModal/index.tsx"
    - path: "meta/__tests__/genI18nGateScope.test.ts"
      provides: "count pins matching the artifacts, plus the dated journal entry"
      contains: "2026-09-21"
  key_links:
    - from: "meta/__tests__/genI18nGateScope.test.ts"
      to: "meta/i18nForkTouchedFiles.json"
      via: "direct JSON import driving A-03 / A0 / A2 / A3 / A4"
      pattern: "i18nForkTouchedFiles"
    - from: "meta/__tests__/hardcodedStringGate.test.ts"
      to: "meta/i18nGateScope.json"
      via: "real blocking scanScope() over the promoted scope"
      pattern: "scanScope\\(\\)"
---

<objective>
`meta/i18nForkTouchedFiles.json` has been stale since `5d220d1cd` made
`src/frontend/screens/Settings/components/SettingsModal/index.tsx` fork-touched for the first
time. `pnpm test:ci` is RED at HEAD because of it (`A-17 ANTI-ROT`). Refresh the pin, hold the
declared unscanned debt at 41, and leave every assertion in
`meta/__tests__/genI18nGateScope.test.ts` at full strength.

Purpose: a stale fork-touched pin means the i18n staleness ratchet is measuring yesterday's world,
and a red suite masks unrelated regressions. Both are load-bearing.

Output: refreshed artifacts, re-derived count pins, a dated journal entry, and executed mutation
evidence that the new green is not vacuous.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@meta/__tests__/genI18nGateScope.test.ts
@meta/genI18nGateScope.ts
@meta/hardcodedStringGate.ts
</context>

<interfaces>
<!-- Extracted from the codebase. Do NOT go exploring to rediscover these. -->

`meta/hardcodedStringGate.ts` — the audit-mode entry point (it NEVER mutates the scope snapshot):

    export function scanScope(opts?: {
      scopePath?: string      // default 'meta/i18nGateScope.json'   (CWD-relative)
      allowlistPath?: string  // default 'meta/i18nGateAllowlist.json'
      glossaryPath?: string   // default 'meta/i18nGlossary.json'
      extraFiles?: string[]   // audit-mode widening; de-duped against scope + allowlist
    }): ScopeScanReport

`ScopeScanReport` carries `scannedFiles`, `totalCandidates`, `violations[]`, `allowlisted[]`,
`staleExemptions[]`, `fileExempt[]`. A file already in `scope.files` is NOT re-scanned as an
extra — so once promoted, passing it via `extraFiles` is a silent no-op. That is why the audit
MUST run before the promotion, not after.

`meta/genI18nGateScope.ts` — `writeArtifacts({ snapshot, outDir, rewriteScope })` is the single
write path. Without `rewriteScope`, `meta/i18nGateScope.json` is not opened for writing at all.
`pnpm gen-i18n-gate-scope` runs with `rewriteScope: false`; `pnpm gen-i18n-scope:rewrite` is the
forbidden one.

`meta/__tests__/hardcodedStringGate.test.ts` — derives its scope count from the file
(`expect(report.scannedFiles).toBe(realScope.files.length)`), so it carries NO count pin to
update. It DOES run the real blocking `scanScope()` over the committed scope, which makes the full
Meta run the authoritative check on the promotion.

The suite's count pins and their line numbers at HEAD `76c065291` — re-locate each by CONTENT
before editing, because they shift as you edit:

| line    | text | kind |
|---------|------|------|
| 870-871 | `the REAL 173 -> 214 delta this task exists to prevent` | doc comment |
| 896     | title: `...the REAL 173-file hand-curated snapshot and the fresh snapshot is the REAL 214` | TEST TITLE |
| 897     | `expect(scopeSnapshot.files.length).toBe(173)` | assertion |
| 898     | `expect(forkTouchedSnapshot.files.length).toBe(214)` | assertion |
| 899     | `expect(freshSnapshot().files.length).toBe(214)` | assertion |
| 925     | title: `...refuses with the real 173 -> 214 diff and writes nothing` | TEST TITLE |
| 961     | `expect(rewritten.files.length).toBe(214)` | assertion |
| 979     | `...files.length).toBe(214)` | assertion |

Two of those eight sites are TEST TITLES, not assertions. The run goes green with both titles
still lying. They are part of the required edit.

`DECLARED_UNSCANNED_DEBT` — array literal at lines 289-331, 41 entries, one path per line.

The journal lives in TWO doc comments:
- lines 53-288 (above `DECLARED_UNSCANNED_DEBT`) — used when the DEBT ARRAY moves.
- lines 763-872 (above `freshSnapshot()`, inside `describe('--rewrite-scope guard')`) — used when
  the COUNTS move. Both existing 2026-09-21 entries live in this second comment (lines 827-838
  and 852-867). The new entry goes there too: immediately after the `2026-09-21 continued` entry
  and BEFORE the closing `Built from the committed artifacts...` paragraph — which is itself one
  of the eight count sites above.

Pre-existing stale line, DO NOT "fix" it: line 764 reads `the 216 files of the committed
fork-touched artifact`. That is a dated 35-24-era narrative superseded by every entry below it.
Out of scope; editing it inflates the diff and is not what this task measures.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Run the audit FIRST and let its output pick the route</name>
  <files>
    (reads only — no repo file is modified in this task)
    meta/hardcodedStringGate.ts
    meta/i18nGateScope.json
  </files>
  <action>
Take the scratchpad safety copies BEFORE anything else. The repo forbids `git checkout --` (fires
the post-checkout hook) and `git stash` (disturbs concurrent sessions), so `cp` is the only revert
route you have. Using your session scratchpad as SCRATCH:

    cp meta/i18nForkTouchedFiles.json          "$SCRATCH/forkTouched.orig.json"
    cp meta/i18nGateScope.json                 "$SCRATCH/gateScope.orig.json"
    cp meta/__tests__/genI18nGateScope.test.ts "$SCRATCH/genI18nGateScope.test.orig.ts"

Confirm `git status --porcelain` is empty first. If it is not, STOP and report what is dirty — you
must not absorb another session's in-flight work.

Now run the decisive gate. Put the entry file in the SCRATCHPAD, not in the repo: a stray `.ts`
under `meta/` gets swept into the Meta jest project and into `pnpm lint`'s ceilings.

    // $SCRATCH/auditScan.ts
    import { scanScope } from '/Users/graysonmitchell/Projects/GameLib/meta/hardcodedStringGate'
    const TARGET = 'src/frontend/screens/Settings/components/SettingsModal/index.tsx'
    const baseline = scanScope()
    const audit = scanScope({ extraFiles: [TARGET] })
    console.log('baseline:', baseline.scannedFiles, 'files,', baseline.violations.length, 'violations')
    console.log('audit   :', audit.scannedFiles, 'files,', audit.violations.length, 'violations')
    const mine = audit.violations.filter((v: { file: string }) => v.file === TARGET)
    console.log('TARGET  :', mine.length, 'violations')
    console.log(JSON.stringify(mine, null, 2))

Run it FROM THE REPO ROOT — `scanScope`'s default paths are CWD-relative, so running from anywhere
else reads nothing and could report a vacuous zero:

    cd /Users/graysonmitchell/Projects/GameLib && \
      node meta/runTs.cjs --bundle --platform=node --target=node21 "$SCRATCH/auditScan.ts"

`runTs.cjs` bundles the entry into a private tmpdir and runs it from there, but inherits your CWD —
which is what makes the repo-root requirement above load-bearing. If esbuild cannot resolve the
absolute import, the fallback is a scratch entry at `meta/__auditScan.tmp.ts` importing
`'./hardcodedStringGate'`, and you MUST `rm` it before any gate runs in Task 3.

Record the ACTUAL printed numbers. `baseline.violations.length` should be 0. If it is NOT 0, that
is a separate pre-existing failure: name it with the commit it came from and STOP rather than
folding it into this task.

Then branch on the TARGET's own violation count:

- 0 violations -> ROUTE A (promote). The precedent route, mechanically identical to the
  `2026-09-21 continued` and `260902-wbd` journal entries: the file enters BOTH artifacts in the
  same sorted slot, so `forkTouched - scope` never contains it and the unscanned debt holds at 41.
  Proceed to Task 2.

- 1 or more violations -> ROUTE B. STOP. Edit no artifact. Report the violations verbatim (file,
  line, literal) and surface the two honest options WITHOUT picking one:
  (b1) fix the violations in `SettingsModal/index.tsx` so it can be promoted — a code change
  beyond this task's stated scope; or
  (b2) add the path to `DECLARED_UNSCANNED_DEBT`, taking declared debt 41 to 42 — a real widening
  of accepted debt, and a decision the operator owns rather than a bookkeeping step.
  Under Route B the required outcome ("hold at 41") is no longer reachable without a decision, so
  a human makes it. Hand back.

Do NOT run `pnpm gen-i18n-scope:rewrite` at any point in this plan.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -z "$(git status --porcelain)" && echo "PASS: audit ran without mutating the tree" || { echo "FAIL: tree dirty after a read-only task"; git status --porcelain; exit 1; }</automated>
  </verify>
  <done>The audit command has been executed and its real stdout pasted into the task record: baseline scanned-file count, baseline violation count, audit scanned-file count, and the TARGET's own violation count. The route (A or B) is named and justified by that output, not by the brief. `git status --porcelain` is still empty. Under Route B, execution has STOPPED and been handed back with the violations quoted.</done>
</task>

<task type="auto">
  <name>Task 2: Refresh both artifacts, re-derive every count pin, write the journal entry</name>
  <files>
    meta/i18nForkTouchedFiles.json
    meta/i18nGateScope.json
    meta/__tests__/genI18nGateScope.test.ts
  </files>
  <action>
Route A only. Four edits, in this order.

(a) `meta/i18nForkTouchedFiles.json` — regenerate, then restore `generatedAt`.

Run `pnpm gen-i18n-gate-scope` (NOT `:rewrite`). The orchestrator measured its effect on this
tree: exactly one ADD (`SettingsModal/index.tsx`), zero removals, 214 -> 215, and
`meta/i18nGateScope.json` left byte-identical.

Then restore the `generatedAt` value from `$SCRATCH/forkTouched.orig.json`, so the only field that
moves is `files`. This is the route the `2026-09-04` journal entry took ("hand-edited surgically
via `pnpm gen-i18n-gate-scope`'s own diff, then re-applied by hand with `generatedAt` held
constant"). It is chosen over a fully manual edit because the generator gets the sorted-slot
insertion right by construction, and over a bare regeneration because holding `generatedAt`
matches every dated precedent in this file and keeps the diff to the one line that carries
meaning. Say exactly this in the journal entry.

Verify the diff is what was expected and nothing else:

    git diff --stat meta/
    git diff meta/i18nForkTouchedFiles.json          # expect exactly one added line
    git diff --quiet meta/i18nGateScope.json && echo "scope untouched by the generator (expected)"

If the generator's diff is anything other than one added line, STOP and report: the tree moved
since the orchestrator measured, and the route needs re-deriving from a fresh audit.

(b) `meta/i18nGateScope.json` — promote by hand.

Insert `src/frontend/screens/Settings/components/SettingsModal/index.tsx` into `files` in its
correct sorted slot. Hand-edit only: the generator will not write this file without
`--rewrite-scope`, and `--rewrite-scope` is forbidden here. Do NOT touch `generatedBy` — the
`A5 PROVENANCE RATCHET` spec asserts the committed marker still reads as hand-curated, and
clobbering it is the exact failure the clobber-guard exists to prevent. Do NOT touch `generatedAt`.

(c) `meta/__tests__/genI18nGateScope.test.ts` — RE-DERIVE, then pin.

Re-derive the three numbers from the artifacts on disk. Do NOT copy 174/215 out of this plan or
the brief; those were inputs, and if anything above went differently they are wrong:

    cd /Users/graysonmitchell/Projects/GameLib && node -e "
      const s = require('./meta/i18nGateScope.json').files;
      const f = require('./meta/i18nForkTouchedFiles.json').files;
      const scope = new Set(s);
      const unscanned = f.filter(x => !scope.has(x));
      console.log('scope', s.length, 'forkTouched', f.length, 'unscanned', unscanned.length);
    "

`unscanned` MUST be 41. If it is not, the promotion did not land in both files — fix that. Never
reach 41 by editing the debt array.

Update all EIGHT count sites from the `<interfaces>` table with the re-derived numbers: six
assertions, TWO TEST TITLES (`A0 fixture sanity`, `A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE`), and
the `the REAL 173 -> 214 delta` line in the doc comment. Then confirm no stale count survives:

    grep -n "173\|214" meta/__tests__/genI18nGateScope.test.ts

Every surviving hit must sit inside a DATED historical journal entry — those record what was true
then, and correcting them would falsify the record. Line 764's `216` is pre-existing and stays
(see `<interfaces>`).

Change NO assertion's logic. The counts are facts about the artifacts; updating them to the new
true values is correct. Widening a comparison, relaxing a `toEqual`, adding a `.skip`, or
loosening the debt array to admit what failed is not — this repo has a standing rule against
widening a gate to admit the value that failed it, and several recorded instances of it happening.

(d) The journal entry. Append a new dated `2026-09-21` entry to the doc comment above
`freshSnapshot()`, immediately after the `2026-09-21 continued` entry and before the
`Built from the committed artifacts...` closing paragraph. Match the voice and detail level of the
entries around it — they are the template. It must state:

  - the cause: commit `5d220d1cd` ("fix(quick-260921-nub): delete dead SettingsModal.scss and
    Dialog__input className") deleted one line from
    `src/frontend/screens/Settings/components/SettingsModal/index.tsx`, making that file
    fork-touched for the first time. Nobody refreshed the pin, so it rotted. Pre-existing, an
    ancestor of HEAD, caused by no in-flight work.
  - all three before/after counts — fork-touched, scope, unscanned debt — the RE-DERIVED ones.
  - the audit result that justified the route, with its real numbers, in the shape the
    `260902-wbd` and `2026-09-21 continued` entries use ("N files scanned, 0 violations").
  - the route: regenerated via `pnpm gen-i18n-gate-scope` with `generatedAt` restored by hand for
    the fork-touched artifact; hand-edited surgically for the scope artifact. Say why, so the next
    person does not re-derive it.
  - why the count holds: the promotion puts the file in BOTH lists in the same sorted slot, so the
    unscanned COUNT holds at 41 while the SET grows — same mechanism as `260902-wbd`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node -e "const s=require('./meta/i18nGateScope.json'),f=require('./meta/i18nForkTouchedFiles.json');const T='src/frontend/screens/Settings/components/SettingsModal/index.tsx';const sc=new Set(s.files);const un=f.files.filter(x=>!sc.has(x));const ok=s.files.includes(T)&&f.files.includes(T)&&un.length===41&&JSON.stringify(s.files)===JSON.stringify([...s.files].sort())&&JSON.stringify(f.files)===JSON.stringify([...f.files].sort());console.error('scope',s.files.length,'fork',f.files.length,'unscanned',un.length);process.exit(ok?0:1)" && pnpm test meta/__tests__/genI18nGateScope.test.ts > "$SCRATCH/targeted.out" 2>&1; cat "$SCRATCH/targeted.out"; grep -q "staleness guard SKIPPED" "$SCRATCH/targeted.out" && { echo "FAIL: git-dependent specs SKIPPED - the run proves less than it looks"; exit 1; }; grep -E "Tests:" "$SCRATCH/targeted.out" | grep -q "26 passed" && ! grep -E "Tests:" "$SCRATCH/targeted.out" | grep -q "failed" && echo "PASS: 26 passed, nothing skipped"</automated>
  </verify>
  <done>Both artifacts contain the target path; both `files` arrays are still sorted and de-duplicated; the re-derived unscanned count is 41; `meta/i18nGateScope.json`'s `generatedBy` and `generatedAt` are unchanged apart from the one inserted path; all eight count sites (including both test titles) carry re-derived numbers; `grep -n "173\|214"` returns only dated-journal hits; the dated journal entry is written with all five required elements; and the targeted jest run reports 26 passed / 0 failed with NO `staleness guard SKIPPED` line in its output.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the green is load-bearing, then sweep the named gates</name>
  <files>
    meta/i18nForkTouchedFiles.json
    meta/i18nGateScope.json
    meta/__tests__/genI18nGateScope.test.ts
    (each mutated and restored; net zero change from Task 2)
  </files>
  <action>
Part 1 — three mutation probes. A green suite after a count edit is exactly the shape of a green
check proving nothing. Each probe mutates ONE thing, runs the targeted suite, records WHICH NAMED
SPEC went red, and restores from the `$SCRATCH` copy with `cp` (never `git checkout --`, never
`git stash`). Re-take the scratchpad copies from the post-Task-2 state first, so a restore returns
you to the FIXED tree rather than the stale one:

    cp meta/i18nForkTouchedFiles.json          "$SCRATCH/forkTouched.fixed.json"
    cp meta/i18nGateScope.json                 "$SCRATCH/gateScope.fixed.json"
    cp meta/__tests__/genI18nGateScope.test.ts "$SCRATCH/genI18nGateScope.test.fixed.ts"

  - M1 — the ratchet still bites on the debt set. Append a fake path
    (`'src/frontend/screens/Brand/ProbeOnlyM1.tsx'`) to `DECLARED_UNSCANNED_DEBT`. Run the suite.
    EXPECT `A-03 RATCHET` red naming the fake path, and `A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE`
    red (its `refusal.added` is compared against the same array). Restore the test file.
  - M2 — the anti-rot check and the count pins still bite. Delete the newly added
    `SettingsModal/index.tsx` line from `meta/i18nForkTouchedFiles.json`. Run the suite. EXPECT
    `A-17 ANTI-ROT` red (this is the original HEAD failure, reproduced on demand) plus the
    `A0 / A2 / A3 / A4` count specs red. Restore the artifact.
  - M3 — the promotion is what holds the debt at 41. Delete the newly promoted
    `SettingsModal/index.tsx` line from `meta/i18nGateScope.json`. Run the suite. EXPECT
    `A-03 RATCHET` red (the file now reads as undeclared drift) and `A0 fixture sanity` red.
    Restore the artifact.

Then confirm the tree is byte-identical to the post-Task-2 state:

    diff -q meta/i18nForkTouchedFiles.json          "$SCRATCH/forkTouched.fixed.json"
    diff -q meta/i18nGateScope.json                 "$SCRATCH/gateScope.fixed.json"
    diff -q meta/__tests__/genI18nGateScope.test.ts "$SCRATCH/genI18nGateScope.test.fixed.ts"

If any probe comes back GREEN, that is a finding, not a convenience: stop and report it — a spec
that cannot detect its own sabotage is not enforcing anything.

Part 2 — the four non-vacuity specs. `A-03 RATCHET non-vacuity`, `A-17 non-vacuity`,
`A-17 ANTI-ROT non-vacuity` and `SANITY: the staleness guard above actually detects an absence`
build their own sabotage internally and pass by construction. Do not mutate them. Instead confirm
in the final run output that all four are PRESENT AND PASSING (not skipped) by name. The specific
hazard: `A-17 ANTI-ROT`, its non-vacuity pair and `SANITY` all live inside `describeIfGitAvailable`,
which degrades to `describe.skip` whenever the upstream merge-base is unreachable — a skip that
prints only a `console.warn`. A run that silently loses those three still says "all passed". If
the warn line appears, the run is not evidence and the task is not done.

Part 3 — the named gates, with what each can and cannot see. Run all five and report each verbatim:

  1. `pnpm test meta/__tests__/genI18nGateScope.test.ts` — the targeted run. SEES: every count
     pin, the A-03 ratchet, the A-17 anti-rot check against the live git derivation. CANNOT see:
     the blocking hardcoded-string scan over the newly promoted file, typecheck, lint.
  2. `pnpm test meta/__tests__` — the whole Meta surface (a path filter; the jest projects in
     `jest.config.js` carry no `displayName`, so `--selectProjects` by name is not available).
     SEES the authoritative check on the promotion: `hardcodedStringGate.test.ts` runs the REAL
     blocking `scanScope()` over the committed scope and asserts zero violations plus
     `scannedFiles === realScope.files.length` (derived from the file, so no count pin to update
     there). CANNOT see: frontend/backend suites, typecheck, lint.
  3. `pnpm codecheck` (`tsc --noEmit`) — SEES type errors from the JSON-shape imports. CANNOT see
     lint errors at all (recorded trap: `codecheck` is blind to CI lint), and cannot see any test
     failure.
  4. `pnpm lint` — SEES the two ESLint ceilings with ONE free slot between them; introduce no new
     warning, and note that an orphaned `eslint-disable` costs +2. This change adds no source
     file, so the count must come back UNCHANGED. CANNOT see test or type failures.
  5. `pnpm test:ci` (`jest --runInBand --silent`) — the whole suite. It is RED at HEAD from exactly
     this stale snapshot, so it must go GREEN here. If it stays red, the remaining failure must be
     NAMED with the commit it came from (`git log -S` on the relevant symbol) and explicitly
     declared not-this-staleness. Do not absorb it, and do not call it "pre-existing" without
     naming the baseline sha.

Report the mutation-probe table (probe, what was broken, which named spec went red) alongside the
five gate results. That table, not the green check, is the evidence this task produces.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && diff -q meta/i18nForkTouchedFiles.json "$SCRATCH/forkTouched.fixed.json" && diff -q meta/i18nGateScope.json "$SCRATCH/gateScope.fixed.json" && diff -q meta/__tests__/genI18nGateScope.test.ts "$SCRATCH/genI18nGateScope.test.fixed.ts" && pnpm test meta/__tests__ > "$SCRATCH/meta.out" 2>&1; cat "$SCRATCH/meta.out"; grep -q "staleness guard SKIPPED" "$SCRATCH/meta.out" && { echo "FAIL: git-dependent specs SKIPPED"; exit 1; }; grep -E "Tests:" "$SCRATCH/meta.out" | grep -q "failed" && { echo "FAIL: Meta surface red"; exit 1; }; pnpm codecheck && pnpm lint && pnpm test:ci</automated>
  </verify>
  <done>All three mutation probes have been executed and each turned a NAMED spec red; the probe table is in the task record. The three `diff -q` checks confirm the tree is byte-identical to the post-Task-2 state. `A-03 RATCHET non-vacuity`, `A-17 non-vacuity`, `A-17 ANTI-ROT non-vacuity` and `SANITY: the staleness guard above actually detects an absence` are all present and passing by name, with no `staleness guard SKIPPED` warning anywhere. All five named gates have been run and their results reported verbatim; `pnpm test:ci` is green, or its remaining failure is attributed to a named commit that is not this staleness.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| generator -> committed artifacts | `pnpm gen-i18n-gate-scope` writes a CI-readable input to a blocking gate |
| hand edit -> `meta/i18nGateScope.json` | the hand-curated input to the BLOCKING hardcoded-string gate |
| test file -> the gates' own strength | count pins and assertion logic live in the same file as the journal prose |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260921saw-01 | Tampering | `meta/i18nGateScope.json` | mitigate | `--rewrite-scope` forbidden by the plan; `generatedBy`/`generatedAt` explicitly off-limits; `A5 PROVENANCE RATCHET` asserts the hand-curated marker survives |
| T-260921saw-02 | Elevation of Privilege | the suite's assertions | mitigate | Task 2 forbids changing any assertion's logic; Task 3's three mutation probes prove each ratchet still bites; a green probe is declared a finding |
| T-260921saw-03 | Repudiation | test titles carrying stale counts | mitigate | two of the eight count sites are TEST TITLES, named explicitly in `<interfaces>`; a `grep -n "173\|214"` sweep confirms no non-journal survivor |
| T-260921saw-04 | Information Disclosure | `describeIfGitAvailable` silent skip | mitigate | every verify greps for `staleness guard SKIPPED` and fails the task if present, so a run that lost three specs cannot be read as evidence |
| T-260921saw-05 | Denial of Service | concurrent sessions | mitigate | no `git checkout --` (fires the post-checkout hook), no `git stash` (disturbs concurrent sessions); revert is `cp` from scratchpad copies taken beforehand |
| T-260921saw-SC | Tampering | npm/pip/cargo installs | accept | this plan installs no packages; no legitimacy gate applies |
</threat_model>

<verification>
- The audit-mode `scanScope({ extraFiles: [...] })` output is recorded with real numbers, and it
  ran BEFORE the promotion (after promotion, `extraFiles` de-dupes against the scope and the run
  becomes a vacuous no-op).
- `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` each contain the target path;
  both `files` arrays remain sorted and de-duplicated.
- `DECLARED_UNSCANNED_DEBT` still has exactly 41 entries, and the re-derived
  `forkTouched - scope` difference is 41.
- All eight count sites carry re-derived numbers; `grep -n "173\|214"` on the suite returns only
  dated-journal hits.
- The dated `2026-09-21` journal entry names `5d220d1cd`, all three before/after counts, the audit
  result, and the regenerate-vs-hand-edit route.
- No assertion's logic changed: `git diff meta/__tests__/genI18nGateScope.test.ts` touches only
  numeric literals, title prose, and added comment lines.
- Three mutation probes each turned a named spec red; the tree is byte-identical afterwards.
- Five gates run and reported: targeted suite, `pnpm test meta/__tests__`, `pnpm codecheck`,
  `pnpm lint` (ceiling count unchanged), `pnpm test:ci`.
</verification>

<success_criteria>
`meta/__tests__/genI18nGateScope.test.ts` reports 26 passed / 0 failed with no
`staleness guard SKIPPED` warning; the unscanned debt is held at 41, not grown to 42;
`pnpm test:ci` is green (or its remaining failure is attributed to a named commit); and the
mutation-probe table shows each ratchet still failing under sabotage.
</success_criteria>

<output>
Create `.planning/quick/260921-saw-refresh-i18n-fork-touched-snapshot/260921-saw-SUMMARY.md` when
done.
</output>
