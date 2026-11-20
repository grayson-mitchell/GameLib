---
quick_id: 260922-vzw
phase: quick-260922-vzw
plan: 01
type: execute
wave: 1
depends_on: []
mode: quick
date: 2026-09-22
follows: 260922-lh4
resolves_todo: .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
autonomous: true
requirements: [TODO-2026-09-21-used-in-module-ledger]
files_modified:
  - .planning/quick/260922-vzw-clear-bucket-b-of-the-used-in-module-dea/260922-vzw-CLASSIFICATION.md
  - meta/deadcode-baseline-used-in-module.txt
  - meta/buildRunnersOnedir.ts
  - meta/buildSidecarSea.ts
  - meta/esbuildWorkerBundleShared.ts
  - meta/releaseTags.ts
  - meta/signMachOResources.ts
  - src/backend/humble/loginWindowSeam.ts
  - src/backend/ipc.ts
  - src/backend/jest.setupContainment.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/humbleFlowRegistration.ts
  - src/backend/sidecar/oauthLoginCapture.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/depot/stallTracker.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/store_backend.ts
  - src/backend/testUtils/fakeHomeProfile.ts
  - src/common/types/storePolicy.ts
  - src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx
  - src/frontend/components/UI/NavShell/Tier2PortalContext.tsx
  - src/frontend/components/UI/ThemeSelector/index.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/state/GlobalState.tsx
  - src/preload/tauriTransport.ts
  - .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md

must_haves:
  truths:
    - "`pnpm find-deadcode` exits 0 after EVERY commit of this task, with `unreachable: 47 OK` unchanged throughout"
    - "The used-in-module ledger ends strictly smaller than 67 and no identity line is ever added to it (verify by diffing the task's full commit range)"
    - "Every bucket-B entry was resolved by opening its actual importer(s) over ALL tracked files with comments stripped, and the per-entry verdict + evidence is recorded in 260922-vzw-CLASSIFICATION.md"
    - "No symbol with a live importer anywhere (test, non-analysed meta/ file, source-text-reading test) was un-exported"
    - "Every `// ts-prune-ignore-next` added is the LAST comment directly above its declaration and is preceded by a one-line reason naming the invisible consumer"
    - "The todo is either moved to .planning/todos/completed/ (ledger at 0) or its Status table updated with the residue and why"
  artifacts:
    - path: ".planning/quick/260922-vzw-clear-bucket-b-of-the-used-in-module-dea/260922-vzw-CLASSIFICATION.md"
      provides: "Per-entry verdict table for all 67 identities (verdict, consumer file:line, remedy)"
    - path: "meta/deadcode-baseline-used-in-module.txt"
      provides: "The ledger, shrunk; header count + CLUSTER note brought in line with final state"
  key_links:
    - from: "each `// ts-prune-ignore-next` line"
      to: "node_modules/ts-prune/lib/analyzer.js mustIgnore()"
      via: "last leading comment of the declaration's first token must contain the marker"
      pattern: "ts-prune-ignore-next"
    - from: "meta/deadcode-baseline-used-in-module.txt"
      to: "meta/findDeadcode.cjs checkPopulation()"
      via: "exact set comparison -- a resolved finding with its line still present goes RED as `removed`"
      pattern: "used-in-module: \\d+ OK"
---

<objective>
Clear bucket B (64 entries: `meta/` 37, `src/` 27) of the used-in-module dead-code ledger, plus
decide the 4 parked entries, actioning the pending todo
`.planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md`.

Purpose: the ledger may only shrink; every entry left in it is an unexplained `export` keyword.
Bucket B is the non-mechanical remainder -- each entry needs its consumer opened.
Output: a classification table, source edits (ignore-next or un-export), a shrunk ledger, and the
todo closed or updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
@meta/deadcode-baseline-used-in-module.txt
@.planning/quick/260922-lh4-ship-src-bucket-c-and-fix-the-census/260922-lh4-PLAN.md
@.planning/quick/260922-lh4-ship-src-bucket-c-and-fix-the-census/260922-lh4-SUMMARY.md

<interfaces>
meta/findDeadcode.cjs exports (do NOT modify this file):
  collectFindings() -> string[]            raw ts-prune lines
  parseFinding(line) -> {path, line, name, usedInModule}
  excludeKnownParseArtifacts(findings) -> findings
  partitionFindings(findings) -> { unreachable, usedInModule }
  parseBaseline(text) -> Set<"path - name">

How ts-prune honours the ignore marker (node_modules/ts-prune/lib/analyzer.js:104-116, mustIgnore):
it takes the export symbol's declaration start LINE position, finds the node at that position, and
checks whether the LAST of that node's leading comment ranges contains `ts-prune-ignore-next`.
Consequences the executor must respect:
  - The marker must be the final comment before the declaration. A JSDoc `/** */` block sitting
    BETWEEN the marker and the declaration defeats it -- place the reason line and the marker
    AFTER any JSDoc, directly above `export ...`.
  - Reason goes on the line(s) ABOVE the marker, never below it (precedent shape:
    src/backend/utils.ts `// Exported only for testing purpose` then `// ts-prune-ignore-next`,
    now at :1864-1866; src/backend/recent_games/recent_games.ts:70; src/common/types/ipc.ts:81/:185).
  - For a symbol exported via an `export { A, B }` list (meta/buildSidecarSea.ts:159-166 re-exports
    DECOMPRESS_WORKER_ENTRY_PATH, resolveEsbuildCli, seaEsbuildFlags, spawnArgv,
    assertNodeGypBuildSingleConsumer, writeLzmaNativeResolvedPaths), the declaration is the export
    SPECIFIER. Put the reason + marker on their own lines inside the braces, directly above that
    specifier. Confirm empirically with `pnpm find-deadcode` (the entry must come back `removed`).
    If a placement does not suppress it, do not guess further than two placements -- leave that
    entry ledgered and record the measured reason in the CLASSIFICATION table.

Un-export comment shape (src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5-7):
  // Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
  // flagged the previously-exported form as a used-in-module finding -- <why no
  // external consumer: e.g. "the test only names it in a comment">).
</interfaces>

Preliminary planner scan (comment-line-stripped, whole-word, 1301 tracked .ts/.tsx/.cjs/.mjs/.js
files; NOT authoritative -- Task 1 must redo it and open every file):
  - meta/: 36 entries have a real `import ... from './<declaring file>'` in meta/__tests__ or a
    non-analysed meta/ script (buildDecompressWorkerDev.ts, checkRunnerInvocations.ts,
    runnerBuildInvocations.ts, downloadHelperBinaries.ts). The three `main` entries
    (buildRunnersOnedir, buildSidecarSea, signMachOResources) only matched OTHER modules' `main`
    imports -- open each: if no test/script imports THAT `main`, un-export it; otherwise ignore-next.
  - src/: every src/**/__tests__ file IS inside tsconfig `include: ["src"]`, so a plain static
    import from a src test would already be visible to ts-prune. src bucket-B hits are therefore
    mostly test-name strings / comments -- BUT several tests read the declaring file's SOURCE TEXT
    (e.g. src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts reads
    GlobalState.tsx via GLOBAL_STATE_PATH and extracts the functions). Such a test may match on the
    literal `export function ...` / `export type ...` text: un-exporting would break it. That is a
    genuine invisible consumer -> ignore-next, unless the test is indifferent to the keyword
    (prove by running it after the un-export).
  - Hits in NON-test src files (e.g. ValidStoreName in src/backend/electron_store.ts,
    SteamBottleConfig in src/common/types/electron_store.ts, isPackagedSidecar in
    src/backend/platform/index.ts, StoreEmbedSuppressionContext in src/frontend/App.tsx) are almost
    certainly imports of a DIFFERENT same-named symbol from another module (ts-prune would see a
    real one). Check the `from` path of each.
  - FakeHomeEnvKey: real importer meta/captureShellScrollback.ts:71-72 (spawned, never imported,
    so outside the analysed project).
</context>

<decision>
Parked entries (InvocationForm, DECOMPRESS_WORKER_ENTRY_PATH, DownloadedBinary, FakeHomeEnvKey):
DECIDED -- give each a reasoned `// ts-prune-ignore-next` naming its invisible importer, keep them
exported, and delete their ledger lines. Rationale: (1) they are deliberate exports with live
consumers, which is exactly the gate's own remedy (c) in findDeadcode.cjs's failure message;
(2) detection power is identical either way -- ts-prune reports these as used-in-module whether or
not the invisible importer still exists, so the ledger line was never guarding anything the site
marker does not; (3) the site comment is where someone tempted to un-export will actually read it,
whereas the ledger note is 100+ lines away in a file nobody opens while editing the code.
Do NOT un-export any of them. DECOMPRESS_WORKER_ENTRY_PATH is subject to the export-list placement
caveat in <interfaces>: if the marker cannot suppress it after two placements, it stays ledgered
with the measured reason.
</decision>

<tasks>

<task type="auto">
  <name>Task 1: Re-derive the population and classify all 67 entries</name>
  <files>.planning/quick/260922-vzw-clear-bucket-b-of-the-used-in-module-dea/260922-vzw-CLASSIFICATION.md</files>
  <action>
Write a throwaway Node script in the session scratchpad (NOT the repo) that requires
./meta/findDeadcode.cjs and derives the population exactly as 260922-lh4-PLAN.md's "Re-derivation
method" does (collectFindings -> parseFinding -> excludeKnownParseArtifacts -> partitionFindings).
Windows gotchas measured while planning: split every file/ledger read on /\r?\n/ and trim (CRLF
otherwise makes every name silently miss); pass git ls-files globs in double quotes; do NOT strip
block comments with a /\*[\s\S]*?\*/ regex -- glob strings like '**/*.ts' make it eat whole files;
strip comment LINES (lines starting with //, *, /*) instead and then read the surviving hits by eye.
Expected at HEAD: unreachable 47, usedInModule 67, B=64 (meta/ 37, src/ 27), C=3. If those differ,
STOP and report -- something moved.

Search corpus per the todo's Method step 2: git ls-files for .ts/.tsx/.cjs/.mjs/.js/.json/.yml/.rs.
For EVERY one of the 67 entries (contended and clean alike, per Method step 4) open the declaring
file at the symbol and each hit file, and decide one verdict:
  IGNORE -- a live consumer ts-prune cannot see: a meta/__tests__ or non-analysed meta/ importer,
            a source-text-reading test that depends on the `export` keyword, a spawned script.
  UNEXPORT -- hits are comments, test-name strings, or a separately declared same-named symbol /
            an import of a same-named symbol from a different module.
  DELETE -- only if the symbol has zero uses even inside its module (unlikely: these are all
            "used in module" by definition); prefer UNEXPORT.
Parked four: verdict IGNORE per the <decision> block.

Write 260922-vzw-CLASSIFICATION.md: a header with the derivation numbers and HEAD sha, then one
table row per entry: identity | verdict | consumer evidence (file:line, or "comment only at
file:line") | tests to run after the edit (every test file whose name/text references the declaring
file or the symbol). Commit it alone as `docs(quick-260922-vzw): classify the 67 used-in-module
entries`.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/quick/260922-vzw-clear-bucket-b-of-the-used-in-module-dea/260922-vzw-CLASSIFICATION.md','utf8');const n=(t.match(/^\| (meta|src)\//gm)||[]).length;if(n!==67)throw new Error('rows '+n);console.log('rows',n)" && pnpm find-deadcode</automated>
  </verify>
  <done>67 classified rows, each with a verdict and file:line evidence; derivation numbers match the expected census; find-deadcode still `unreachable: 47 OK | used-in-module: 67 OK`.</done>
</task>

<task type="auto">
  <name>Task 2: Apply the meta/ 39 (37 bucket B + InvocationForm + DECOMPRESS_WORKER_ENTRY_PATH)</name>
  <files>meta/buildRunnersOnedir.ts, meta/buildSidecarSea.ts, meta/esbuildWorkerBundleShared.ts, meta/releaseTags.ts, meta/signMachOResources.ts, meta/deadcode-baseline-used-in-module.txt</files>
  <action>
Apply each meta/ verdict from the CLASSIFICATION table. IGNORE entries: add a one-line reason naming
the consumer (e.g. "Consumed by meta/__tests__/buildSidecarSea.test.ts, which is outside tsconfig
include and invisible to ts-prune.") followed by `// ts-prune-ignore-next`, as the last comments
directly above the declaration -- after any JSDoc (see <interfaces> for why). For the
meta/buildSidecarSea.ts:159-166 `export { ... }` list, place reason + marker inside the braces above
each affected specifier; the existing in-situ comment explaining why that block exists stays.
UNEXPORT entries (likely only some of the three `main`s): drop `export` with the repairFailure.ts
comment shape. Parked InvocationForm (importer meta/runnerBuildInvocations.ts:62), DownloadedBinary
(importer meta/downloadHelperBinaries.ts:15) and DECOMPRESS_WORKER_ENTRY_PATH (re-export owned by
meta/esbuildWorkerBundleShared.ts:31, imported by meta/buildDecompressWorkerDev.ts) get IGNORE per
the <decision> block -- never un-export them.

Delete every resolved identity line from meta/deadcode-baseline-used-in-module.txt in the SAME
commit (no --update-baseline; never add a line; do not touch deadcode-baseline-unreachable.txt or
findDeadcode.cjs). Work file-by-file and run `pnpm find-deadcode` after each file: a line whose
marker did not take shows as still-found; a stale line shows as `removed`.

Several tests read meta source text by path (meta/__tests__/buildSidecarSea.test.ts,
meta/__tests__/runTs.test.ts, src/backend/__tests__/releaseWorkflow.test.ts and the steam
decompress/lzma tests reference buildSidecarSea.ts) -- added comment lines can break a line-number
or block-shape assertion. Run them. If a real-build test self-skips for lack of environment, record
that in the SUMMARY rather than treating it as a pass. Commit as `refactor(quick-260922-vzw): mark
meta/ test-consumed exports with ts-prune-ignore-next`.
  </action>
  <verify>
    <automated>pnpm find-deadcode && npx prettier --check meta/ src/ && npx eslint meta/buildRunnersOnedir.ts meta/buildSidecarSea.ts meta/esbuildWorkerBundleShared.ts meta/releaseTags.ts meta/signMachOResources.ts && pnpm codecheck && npx jest meta/__tests__/buildRunnersOnedir.test.ts meta/__tests__/runnerBuildInvocations.test.ts meta/__tests__/buildSidecarSea.test.ts meta/__tests__/esbuildWorkerBundleShared.test.ts meta/__tests__/runTs.test.ts meta/__tests__/findDeadcode.test.ts src/backend/__tests__/releaseWorkflow.test.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts</automated>
  </verify>
  <done>No meta/ identity remains in the ledger except any DECOMPRESS-style entry that measurably could not be suppressed (recorded with reason); find-deadcode green with unreachable still 47; all listed tests pass (plus any extra the CLASSIFICATION table named).</done>
</task>

<task type="auto">
  <name>Task 3: Apply the src/ 28 (27 bucket B + FakeHomeEnvKey), update the ledger header, close or update the todo</name>
  <files>src/backend/humble/loginWindowSeam.ts, src/backend/ipc.ts, src/backend/jest.setupContainment.ts, src/backend/sidecar/bootstrap.ts, src/backend/sidecar/humbleFlowRegistration.ts, src/backend/sidecar/oauthLoginCapture.ts, src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/depot/decompress.ts, src/backend/storeManagers/steam/depot/stallTracker.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/installLocation.ts, src/backend/store_backend.ts, src/backend/testUtils/fakeHomeProfile.ts, src/common/types/storePolicy.ts, src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx, src/frontend/components/UI/NavShell/Tier2PortalContext.tsx, src/frontend/components/UI/ThemeSelector/index.tsx, src/frontend/screens/Library/filterEngine.ts, src/frontend/state/GlobalState.tsx, src/preload/tauriTransport.ts, meta/deadcode-baseline-used-in-module.txt, .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md</files>
  <action>
Apply each src/ verdict from the CLASSIFICATION table, with the same shapes as Task 2. FakeHomeEnvKey
gets IGNORE naming meta/captureShellScrollback.ts:71-72 (spawned by
src/backend/__tests__/shellDiagPersistence.test.ts, never imported, so outside the analysed
project) per the <decision> block. For every UNEXPORT, immediately run each test file the
CLASSIFICATION row named -- especially source-text readers like
src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts; if a test breaks
because it matches the `export` keyword, revert that one to IGNORE and correct the table row.
Gotchas from the todo: an un-export whose only remaining use is type-level (`typeof X`) trips
no-unused-vars -- fix with a reasoned `// eslint-disable-next-line` and negative-control it (remove,
see the error, restore); an un-export can shorten a signature under prettier's wrap width -- run
`npx prettier --write` on touched files then re-check.

Split into commits as convenient (e.g. backend / frontend+common+preload), each deleting exactly the
ledger lines its edits resolve and each leaving find-deadcode, prettier, eslint (touched files),
`pnpm codecheck` and the affected jest files green. Message shape:
`refactor(quick-260922-vzw): resolve src/ used-in-module entries (<area>)`.

In the final commit also: (a) update the ledger header -- `# POPULATION: used-in-module (N
identities)` to the final N, and replace the now-stale "CLUSTER: the 39 meta/ entries" narrative
with a short note that 260922-vzw resolved bucket B and the parked four via ignore-next markers
(keep the historical measurement lines; `#` lines are annotations, not identities). (b) The todo:
add a `260922-vzw` row to its Status table. If the ledger is at 0 identities, append a closing
`## Closed -- 2026-09-22` section (final counts, the ignore-next vs un-export split, commit range,
confirmation that no baseline line was ever added -- prove with `git diff <start>..HEAD --
meta/deadcode-baseline-*.txt | grep '^+[^+#]'` returning nothing) and `git mv` it to
.planning/todos/completed/. Otherwise update the Status/"What remains" sections with the residue
and the measured reason for each. Any NEW todo filed must carry `severity:` / `platform:` / `ready:`
frontmatter per CLAUDE.md and pass `pnpm planning-gates`.
  </action>
  <verify>
    <automated>pnpm find-deadcode && npx prettier --check meta/ src/ && pnpm codecheck && pnpm planning-gates && git diff b61bd6677..HEAD -- meta/deadcode-baseline-used-in-module.txt meta/deadcode-baseline-unreachable.txt | grep -E '^\+[^+#]' ; test $? -eq 1</automated>
  </verify>
  <done>All src/ entries resolved (or residue documented with measured reason); find-deadcode `unreachable: 47 OK | used-in-module: N OK` with N the final count; no `+` identity line in either baseline across the task range; eslint clean on every touched file; every test named in the CLASSIFICATION table passes; todo moved to completed/ (N=0) or its Status updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer -> CI gate | ledger edits decide what `find-deadcode` (pre-push + Lint job) will accept |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vzw-01 | Tampering | meta/deadcode-baseline-used-in-module.txt | mitigate | Only deletions; Task 3 verify greps the full commit range for any added identity line and fails if one exists |
| T-vzw-02 | Repudiation | `// ts-prune-ignore-next` markers | mitigate | Every marker carries a reason line naming the concrete consumer file; CLASSIFICATION table records evidence per entry |
| T-vzw-03 | Denial of service | un-exporting a symbol with an invisible consumer | mitigate | Consumers checked over all tracked files; affected tests (including source-text readers) run after every un-export; parked four never un-exported |
</threat_model>

<verification>
- `pnpm find-deadcode` green at every commit; `unreachable` stays 47.
- `npx prettier --check meta/ src/`, eslint on touched files, `pnpm codecheck` green at every commit.
- Every test file named in the CLASSIFICATION table ran and passed (self-skips recorded as such).
- Ledger only shrank: no `^+` identity line in either baseline across `b61bd6677..HEAD`.
</verification>

<success_criteria>
Ledger reduced from 67 toward 0 with every resolution individually evidenced; no behaviour or test
broken; todo closed (moved to completed/) or updated with a measured residue.
</success_criteria>

<output>
Create `.planning/quick/260922-vzw-clear-bucket-b-of-the-used-in-module-dea/260922-vzw-SUMMARY.md` when done
</output>
