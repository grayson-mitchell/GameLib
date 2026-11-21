---
phase: quick-261121-pwt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1
  - src/backend/stores/__tests__/storeRoot.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  # Task 2: the 28 other mock-site suites from the planning-time live grep (@5bd0c0b72); the executor re-greps
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
  - src/backend/sidecar/__tests__/clipboardFlows.test.ts
  - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
  - src/backend/sidecar/__tests__/electronUntouched.test.ts
  - src/backend/sidecar/__tests__/engineTempSweepBootWire.test.ts
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
  - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
  - src/backend/sidecar/__tests__/gogPresenceBootWire.test.ts
  - src/backend/sidecar/__tests__/humbleFlows.test.ts
  - src/backend/sidecar/__tests__/humbleLoginFlows.test.ts
  - src/backend/sidecar/__tests__/installFlows.test.ts
  - src/backend/sidecar/__tests__/loggerFlows.test.ts # expected deleted by 84-07; skip if absent
  - src/backend/sidecar/__tests__/migrationsWiring.test.ts
  - src/backend/sidecar/__tests__/onlineMonitorWiring.test.ts
  - src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
  - src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts
  - src/backend/sidecar/__tests__/runnerAuthFlows.test.ts
  - src/backend/sidecar/__tests__/settingsFlows.test.ts
  - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
  - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/backend/sidecar/__tests__/signInProbeBootWire.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
  - src/backend/sidecar/__tests__/steamFlows.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
  - meta/backendDiCeilings/sidecar.json
  - meta/backendDiCeilings/sidecar-tests-boot.json
  - meta/backendDiCeilings/sidecar-tests-flows-1.json
  - meta/backendDiCeilings/sidecar-tests-flows-2.json
  - meta/backendDiCeilings/sidecar-tests-flows-3.json
  - meta/backendDiCeilings/sidecar-tests-flows-4.json
  # Task 3
  - src/backend/stores/storeRoot.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - src/backend/store_backend.ts
  - src/backend/__mocks__/store_backend.ts
  - src/backend/knownFixes.ts
  - src/backend/jest.setupContainment.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/settingsFlowRegistration.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/common/types/storePolicy.ts
  - src/preload/tauriTransport.ts
  - meta/knip-baseline.txt # only if find-deadcode reports a vanished finding
  - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
  - .planning/todos/completed/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md
files_deleted:
  - src/backend/sidecar/fileStore.ts
  - src/backend/sidecar/__tests__/fileStore.test.ts
  - .planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md
autonomous: true
requirements:
  - QUICK-261121-pwt

estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "No suite under src/ redirects backend/store_backend to the deleted sidecar file store. Every suite that did now runs the production conf-backed store (src/backend/store_backend.ts), and the set of failing tests across those suites is identical to the set measured before the first edit (expected empty)"
    - "The behaviour those suites relied on is pinned on the production class in src/backend/stores/__tests__/storeRoot.test.ts (todo step 1): two GameLibStore instances on one root and one resolved path see each other's writes and deletes, two roots never share a file for the same name, and the WR-11 containment cases are unchanged"
    - "src/backend/sidecar/fileStore.ts and its test are deleted in one commit, together with StoreRoot's cell registry (the interface, the member and its factory), its diPhaseGates OWNED_66_4 entry, its jestMock line in meta/backendDiCeilings/sidecar.json and its testContainment STRUCTURALLY_CONTAINED_SUITES entry"
    - "No file under src/ or meta/ names the file store any more (git grep -inw for it returns 0 lines), and every reworded comment describes store_backend.ts's real behaviour, not a renamed copy of the old claim"
    - "An esbuild metafile of the dev sidecar entry (src/sidecar/index.ts) is built before and after the deletion: the file store is absent from its inputs both times, store_backend.ts is present, and the input counts are quoted in the SUMMARY"
    - "pnpm backend-di-ceilings, pnpm find-deadcode, pnpm codecheck and pnpm lint pass. Every migrated suite's jestMock count is lowered by exactly one and no ceiling is raised. meta/knip-baseline.txt changes only by deleting a line knip reports as vanished"
    - "This plan runs only after Phase 84 plans 84-06 and 84-07 have committed. Each commit stages only this task's own paths, so the other sessions' uncommitted files stay untouched. The source todo has moved to .planning/todos/completed/ with a resolution note. Nothing is pushed"
  artifacts:
    - path: src/backend/stores/__tests__/storeRoot.test.ts
      provides: "the root-sharing and containment cases run against GameLibStore, the production store"
      contains: "see each other"
    - path: src/backend/stores/storeRoot.ts
      provides: "StoreRoot with userData, changes, versioning and readOnly only (no cell registry)"
    - path: meta/backendDiCeilings/sidecar.json
      provides: "jestMock baseline without the deleted suite, with lowered counts for the migrated suites it names"
  key_links:
    - from: src/backend/stores/__tests__/storeRoot.test.ts
      to: src/backend/store_backend.ts
      via: "new GameLibStore({ root, cwd, name }) in the two root-sharing cases"
      pattern: "new GameLibStore\\("
    - from: src/backend/sidecar/__tests__/storeLayer.test.ts
      to: src/backend/store_backend.ts
      via: "no backend/store_backend mock, so the suite's stores resolve to the production class"
---

<objective>
Close the open half of Phase 82 criterion 5: move the sidecar test suites off the Phase 27 file store, then
delete `src/backend/sidecar/fileStore.ts`. This is 82-04 Task 1, which halted because about 30 suites still
loaded the file in tests. Source spec: `.planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md`.

**Phase 85 check (done at planning).** Phase 85 (store host) is "0 plans, not planned" in ROADMAP.md, and
STATE.md has Phase 84 executing. Phase 85 has done nothing here and does not cover it, so this quick task
does the migration once and closes the todo.

**Measured at planning (@5bd0c0b72). This changes the shape of the work from what the todo expected.**
The todo says "each suite has to move to a test store root deliberately" because the conf-backed store
"behaves differently". That was measured, not assumed. A scratch jest config added one moduleNameMapper
entry that sends the suites' file-store `requireActual` to `src/backend/store_backend.ts`, then ran all 29
mock-site suites. Result: 28 passed. loggerFlows had 2 failures, and the same 2 fail at HEAD with the
file store (a Phase 84 transient, green again by 5bd0c0b72). The suites already build their stores
through the boot's StoreRoot. Whatever they depend on, the production store also provides:
- conf@10.2.0 re-reads the file on every `.store` access, so two instances on one path see each other's
  writes. That is the D-14 property the file store's in-memory cell existed for.
- `translateStoreOptions` carries the WR-11 containment check.
- dot-prop's `disallowedKeys` (node_modules/dot-prop/index.js line 4) rejects `__proto__`, `prototype`
  and `constructor` key segments.

So "a test store root that keeps the path-keyed, contained behaviour" (todo step 1) is the production
store plus `createTestStoreRoot`, which already exists. This plan pins that behaviour with tests on the
production class, rather than writing a second test-only store. A scratch run proved the two re-homed
storeRoot cases pass against GameLibStore.

**Sequencing (hard).** Phase 84 is executing in another session right now: 84-05 committed during
planning. Two of its plans edit this plan's files:
- 84-06 edits fileStore.ts, its test, storeLayer.test.ts and sidecar.json.
- 84-07 deletes loggerFlows.test.ts and edits about 10 of the mock-site suites, testContainment.test.ts,
  jest.setupContainment.ts and four jestMock shards.

Deleting fileStore.ts first would break 84-06 as written. So every task carries a precondition that both
plans have committed.

Purpose: the file store never ran in production, and every later port slice would otherwise have to
reason about it. After this, the suites test the store that ships.
Output: about 30 suites on the production store, behaviour pinned in storeRoot.test.ts, the file store and
its cell registry deleted, ceilings and comments brought into line, and the todo closed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md
@.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-04-PLAN.md
@.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-04-SUMMARY.md
@src/backend/store_backend.ts
@src/backend/stores/storeRoot.ts
@src/backend/testUtils/testStoreRoot.ts

Conventions (Skill gamelib-conventions):
- Every `<verify>` runs `npx prettier --file-info`, then `--check`, over the exact paths written.
  `.planning/**` is prettier-ignored. meta/knip-baseline.txt has no inferred parser, so `--check` would
  error on it. Both are left out of the prettier lists on purpose.
- Nothing here spawns the sidecar or SEA binary. The one spawn is esbuild in Task 3 (same as
  meta/buildSidecar.ts, which records that the fake-HOME convention does not apply), so the two-profile
  rule does not fire.
- The working tree carries other sessions' uncommitted work (bridge/steam files, locales, src-tauri).
  Never `git add -A` or `git add .`. Stage exact paths and commit with a pathspec.
- Memory: a gsd-tools commit without `--files` sweeps every dirty `.planning` file. Use plain `git commit -- <paths>`.

Shared scratch: every task uses `B="${TMPDIR:-/tmp}/gamelib-261121-pwt"`. Task 1 creates it, and it persists across tasks.
</context>

<tasks>

<!-- planner-discipline-allow: filestore -->
<!-- planner-discipline-allow: jest.requireActual('../fileStore') -->
<!-- planner-discipline-allow: FileStoreCell -->
<!-- planner-discipline-allow: createFileStoreCells -->
<!-- planner-discipline-allow: readonly cells -->
<!-- planner-discipline-allow: fileStore.test.ts -->
<!-- These literals name what is being deleted. The negative greps check that they are gone, and the actions only name them as deletion targets, never as text to write. -->

<task type="tracer">
  <name>Task 1: Tracer — baseline, root-sharing pinned on the production store, storeLayer off the file-store mock end to end</name>
  <precondition>Phase 84 plans 84-06 and 84-07 have committed (`test -e .planning/phases/84-logger/84-06-SUMMARY.md && test -e .planning/phases/84-logger/84-07-SUMMARY.md`), and `git status --porcelain -- src/backend/sidecar src/backend/stores src/backend/__tests__ src/backend/__mocks__ meta/backendDiCeilings meta/knip-baseline.txt` prints nothing. If either check fails, HALT and report "blocked on Phase 84 (84-06/84-07 edit this plan's files)". Do not start.</precondition>
  <files>src/backend/stores/__tests__/storeRoot.test.ts, src/backend/sidecar/__tests__/storeLayer.test.ts, meta/backendDiCeilings/sidecar.json</files>
  <read_first>
    - src/backend/stores/__tests__/storeRoot.test.ts (whole file, 120 lines: two cases construct the file store, and the changes-channel and WR-11 describes stay)
    - src/backend/store_backend.ts: the module header, translateStoreOptions, prepareStore and the GameLibStore class
    - src/backend/sidecar/__tests__/storeLayer.test.ts: the header comment (lines ~20-60), the store_backend mock (~58-61) and the CacheStore comment (~262-272)
  </read_first>
  <action>
    Step 0: measure before editing anything.
    - Run `B="${TMPDIR:-/tmp}/gamelib-261121-pwt"; mkdir -p "$B"`.
    - Live-grep the mock sites: `git grep -l "^  default: jest.requireActual('../fileStore').default" -- src | sort > "$B/suites.txt"`.
      The `^  default:` anchor skips the comment-only mention in gameDetailsImportGate.test.ts.
    - Reconcile the list against frontmatter `files_modified` (29 suites at 5bd0c0b72, including storeLayer):
      - A file that 84-06/84-07 deleted drops out (loggerFlows.test.ts is expected to).
      - A new file with the same mock joins the set and is migrated the same way.
      - Any other planned file missing for an unexplained reason: STOP and report.
    - Write `src/backend/stores/__tests__/storeRoot.test.ts`, `src/backend/__tests__/diPhaseGates.test.ts`,
      `src/backend/sidecar/__tests__/bootstrap.test.ts` and `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts`
      one per line to `$B/extra.txt`.
    - Write the node script `$B/failing.cjs`. It reads a jest `--json` file (argv[2]) and prints sorted lines:
      `<repo-relative suite path> :: <assertion fullName>` for each failed assertion, plus
      `<path> :: SUITE FAILED TO RUN` for a failed suite with no failed assertion. Body:
      `const r=require(process.argv[2]);const c=process.cwd()+"/";const o=[];for(const s of r.testResults){const n=s.name.replace(c,"");const f=s.assertionResults.filter(a=>a.status==="failed");if(s.status==="failed"&&f.length===0)o.push(n+" :: SUITE FAILED TO RUN");for(const a of f)o.push(n+" :: "+a.fullName)}console.log(o.sort().join("\n"))`
    - Baseline: `pnpm exec jest --selectProjects Backend --runTestsByPath $(cat "$B/suites.txt" "$B/extra.txt") --json --outputFile="$B/before.json" > "$B/before.log" 2>&1; node "$B/failing.cjs" "$B/before.json" > "$B/before-failing.txt"`.
    - Quote the suite count and `$B/before-failing.txt` in the SUMMARY. Expect it to be empty. If it is not,
      every later comparison holds that exact set, and the SUMMARY names each entry as pre-existing.

    Step 1: storeRoot.test.ts, todo step 1, the deliberate test store root. Drop the default import of the
    sidecar file store. Import the default export of `../../store_backend` as `GameLibStore`, in the same
    import statement as the existing `translateStoreOptions` import. Re-home the two cases that construct
    the file store onto `new GameLibStore({ root, cwd: 'store', name })`, with the same arguments:
    - Rename "two roots never share a file cell, even for the same name" to "two roots never share a store
      file, even for the same name". Keep its assertions.
    - Rename "two stores on one root and one resolved path share one cell" to "two stores on one root and
      one resolved path see each other's writes". Keep its assertion and add a delete round trip: delete
      `k` through the second instance, then expect `first.has('k')` to be false.
    - Leave the changes-channel describe and the 'WR-11 containment' describe byte-identical. They already
      pin containment on `translateStoreOptions`.
    - Add one comment above the two cases. It says the production store gives same-path instances a shared
      view because conf re-reads the file on every access, and that these cases replaced the deleted file
      store's cell-registry cases (quick 261121-pwt).

    Step 2: storeLayer.test.ts.
    - Delete the four-line `jest.mock('backend/store_backend', ...)` factory, the one whose default is the
      file store's default export.
    - Rewrite every comment in the file that names the file store, so it describes the production store as
      `src/backend/store_backend.ts` actually behaves. Read the code first. For the CacheStore comment
      (~266): a fresh CacheStore at the same filename reads and writes the same file, because conf re-reads
      it on every access. It is not a shared in-memory cell.
    - Change no assertion, fixture or count.

    Step 3: run `pnpm backend-di-ceilings`. It reports storeLayer as shrank (5 to 4 at planning). Set that
    exact number in meta/backendDiCeilings/sidecar.json. Never raise any entry.

    Commit with a pathspec of the three files only. Message:
    `test(quick-261121-pwt): pin store-root sharing on the production store; storeLayer off the file-store mock`.
  </action>
  <verify>
    <automated>B="${TMPDIR:-/tmp}/gamelib-261121-pwt"; pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/stores/__tests__/storeRoot.test.ts src/backend/sidecar/__tests__/storeLayer.test.ts --json --outputFile="$B/t1.json" > "$B/t1.log" 2>&1; test -s "$B/suites.txt" && test -e "$B/before-failing.txt" && node "$B/failing.cjs" "$B/t1.json" > "$B/t1-failing.txt" && grep -E "storeRoot.test.ts|storeLayer.test.ts" "$B/before-failing.txt" | diff - "$B/t1-failing.txt" && grep -q "see each other" src/backend/stores/__tests__/storeRoot.test.ts && test "$(grep -c 'new GameLibStore(' src/backend/stores/__tests__/storeRoot.test.ts)" -ge 4 && test "$(grep -c 'WR-11 containment' src/backend/stores/__tests__/storeRoot.test.ts)" -eq 1 && { git grep -niw filestore -- src/backend/stores/__tests__/storeRoot.test.ts src/backend/sidecar/__tests__/storeLayer.test.ts; test $? -eq 1; } && pnpm backend-di-ceilings && pnpm codecheck && F="src/backend/stores/__tests__/storeRoot.test.ts src/backend/sidecar/__tests__/storeLayer.test.ts meta/backendDiCeilings/sidecar.json" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "ignored: $f"; exit 1; }; done && npx prettier --check $F</automated>
    <fails_when>non-zero exit; diff prints a line (a test newly failing, or the re-homed cases failing); `grep -q "see each other"` misses; fewer than 4 `new GameLibStore(` sites; the WR-11 describe count is not 1; the whole-word grep counts above 0; backend-di-ceilings prints "grew", "shrank" or "stale"; codecheck prints "error TS"; prettier prints "Code style issues found" or "ignored: &lt;path&gt;"</fails_when>
  </verify>
  <acceptance_criteria>
    - `git grep -niw filestore -- src/backend/stores/__tests__/storeRoot.test.ts src/backend/sidecar/__tests__/storeLayer.test.ts | wc -l` == 0 [HEAD=9 EXPECT==0 @5bd0c0b72]
    - `grep -c 'GameLibStore' src/backend/stores/__tests__/storeRoot.test.ts` >= 5 [HEAD=0 EXPECT>=5 @5bd0c0b72] (1 import + 4 constructions)
    - `grep -c 'WR-11 containment' src/backend/stores/__tests__/storeRoot.test.ts` == 1 [HEAD=1 EXPECT==1 @5bd0c0b72 GUARD MUTATION: delete-the-WR-11-describe] (preservation guard: deleting or renaming the describe drops the count to 0)
    - `grep -c '"src/backend/sidecar/__tests__/storeLayer.test.ts": 5' meta/backendDiCeilings/sidecar.json` == 0 [HEAD=1 EXPECT==0 @5bd0c0b72] (lowered to the ratchet's reported count, unless 84-06 already moved it, in which case the ratchet's number rules)
    - `$B/before-failing.txt` is quoted in the SUMMARY
  </acceptance_criteria>
  <done>The baseline is recorded. The root-sharing behaviour the suites depend on is pinned on GameLibStore. storeLayer runs the production store with its ceiling lowered. One pathspec commit.</done>
</task>

<task type="auto">
  <name>Task 2: The remaining mock-site suites onto the production store, with comments rewritten to its real behaviour and ceilings lowered</name>
  <precondition>Task 1 is committed and `$B/suites.txt`, `$B/extra.txt`, `$B/failing.cjs` and `$B/before-failing.txt` exist under `B="${TMPDIR:-/tmp}/gamelib-261121-pwt"`.</precondition>
  <files>every path in $B/suites.txt except storeLayer.test.ts (28 at planning, the Task 2 block of files_modified; 27 once 84-07 deletes loggerFlows.test.ts), src/backend/sidecar/__tests__/bootstrap.test.ts, src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts, meta/backendDiCeilings/sidecar.json, meta/backendDiCeilings/sidecar-tests-boot.json, meta/backendDiCeilings/sidecar-tests-flows-1.json, meta/backendDiCeilings/sidecar-tests-flows-2.json, meta/backendDiCeilings/sidecar-tests-flows-3.json, meta/backendDiCeilings/sidecar-tests-flows-4.json</files>
  <read_first>
    - For each suite: only the region around its store_backend mock and each line `git grep -niw` reports for the file store. Do not read the whole of each flow suite.
    - src/backend/store_backend.ts (the behaviour every reworded comment must match: translateStoreOptions defaults configName to 'config'; prepareStore creates the store directory at construction and runs versioning; GameLibStore's store accessors)
  </read_first>
  <action>
    Step 1: delete the mock. In every file of `$B/suites.txt` except storeLayer.test.ts, delete the four-line
    factory that redirects `backend/store_backend` to the file store's default export.
    - At planning, all 29 blocks had the identical shape:
      - `jest.mock('backend/store_backend', () => ({`
      - `  __esModule: true,`
      - the requireActual default line
      - `}))`
    - A multi-line `perl -0pi` substitution anchored on those four exact lines is fine. Afterwards, confirm
      that each file lost exactly one `jest.mock(` call.
    - If a comment directly above the block exists only to explain that mock, delete it too. Example:
      testContainment.test.ts's "electron / electron-store ... route Jest's own module resolution at the
      REAL sidecar shims" banner at ~199-202.
    - If such a comment also covers other mocks that stay, reword it instead.
    - Do not touch any other mock.

    Step 2: rewrite the comments. Change every remaining whole-word mention of the file store (case
    insensitive) in these suites, bootstrap.test.ts and gameDetailsImportGate.test.ts. Do it by meaning,
    never by renaming the identifier, and check each claim against store_backend.ts:
    (a) Where a comment means "the real store code runs under test", name `store_backend.ts`, the
        conf-backed production store.
    (b) Same-path sharing (D-14) comes from conf re-reading the file on every `.store` access. It is not an
        in-memory cell.
    (c) bootstrapWirings.test.ts ~392. The old reasoning, that the store only creates its directory on its
        first write, is now false: `prepareStore` creates the store directory at construction. Rewrite the
        justification for the pre-create step: it mirrors an app start, and the anticheat write must not
        depend on which store created the folder first. Keep the step.
    (d) skeletonFlows.test.ts ~600, the CR-01 comment. The second guard is now dot-prop's `disallowedKeys`
        inside conf 10.2.0, alongside `applyStoreWrite`'s guard (c′).
    (e) electronUntouched.test.ts ~155. REAL_STORE_PATH mirrors `translateStoreOptions`: with no name,
        configName defaults to 'config'.
    (f) enrichmentFlows.test.ts ~860. Retitle the test to say it round-trips through the real store.
    (g) testContainment.test.ts ~866, and any sibling preamble description. The approved preamble no longer
        carries a store mock. Since quick 261121-pwt the suites run the production store, and containment is
        still structural (jest.setupContainment.ts).
    (h) gameDetailsImportGate.test.ts ~330. Keep its history of the electronUntouched mock rename. Add that
        quick 261121-pwt removed the redirect, so the suite now runs the production store. Do not quote the
        old requireActual expression.
    (i) bootstrap.test.ts ~11. Name the production store among the shims.

    Leave testContainment's STRUCTURALLY_CONTAINED_SUITES entry for the soon-deleted test alone. Task 3
    removes it with the file.

    Step 3: run `pnpm backend-di-ceilings`. Apply every "shrank: lower X to N" line exactly. Expect one per
    migrated suite, spread across sidecar.json and sidecar-tests-boot/flows-1/2/3/4.json. Never raise an
    entry. If the ratchet reports "grew" or "stale", STOP: something other than this task changed the tree.

    Step 4: run the comparison (the verify command). If a suite newly fails:
    - Do not restore the mock, add a different store mock, or weaken an assertion.
    - Identify the conf-vs-file-store difference behind it. Candidates:
      - conf persists `defaults` at construction;
      - tab-indented JSON instead of 2-space;
      - the directory is created at construction;
      - versioning stamps declared stores and keeps and reports a corrupt file rather than resetting it.
    - Move the test's fixture or setup to production behaviour, and record each such change in the SUMMARY.
    - If a test asserts a behaviour that production lacks and that a user could observe, STOP (Rule 4) and report.

    Commit with a pathspec of exactly the files edited. Message:
    `test(quick-261121-pwt): sidecar suites run the production store instead of the file-store mock`.
  </action>
  <verify>
    <automated>B="${TMPDIR:-/tmp}/gamelib-261121-pwt"; pnpm exec jest --selectProjects Backend --runTestsByPath $(cat "$B/suites.txt" "$B/extra.txt") --json --outputFile="$B/t2.json" > "$B/t2.log" 2>&1; node "$B/failing.cjs" "$B/t2.json" > "$B/t2-failing.txt" && diff "$B/before-failing.txt" "$B/t2-failing.txt" && { git grep -l "jest.requireActual('../fileStore')" -- src; test $? -eq 1; } && { git grep -niw filestore -- 'src/backend/sidecar/__tests__/*.test.ts' ':!src/backend/sidecar/__tests__/fileStore.test.ts' > "$B/t2-hits.txt"; test $? -le 1; } && test "$(grep -c . "$B/t2-hits.txt")" -eq 1 && pnpm backend-di-ceilings && pnpm codecheck && F="$(cat "$B/suites.txt" | tr '\n' ' ') src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts meta/backendDiCeilings/sidecar.json meta/backendDiCeilings/sidecar-tests-boot.json meta/backendDiCeilings/sidecar-tests-flows-1.json meta/backendDiCeilings/sidecar-tests-flows-2.json meta/backendDiCeilings/sidecar-tests-flows-3.json meta/backendDiCeilings/sidecar-tests-flows-4.json" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "ignored: $f"; exit 1; }; done && npx prettier --check $F</automated>
    <fails_when>non-zero exit; diff prints any line (a newly failing or newly passing test, either of which must be explained); a requireActual redirect to the file store survives anywhere in src; the whole-word count in sidecar/__tests__ (excluding the file store's own test) is not exactly 1 (the one allowed hit is testContainment's list entry, removed in Task 3); backend-di-ceilings prints "grew", "shrank" or "stale"; codecheck prints "error TS"; prettier prints "Code style issues found" or "ignored: &lt;path&gt;"</fails_when>
  </verify>
  <acceptance_criteria>
    - `git grep -l "jest.requireActual('../fileStore')" -- src | wc -l` == 0 [HEAD=30 EXPECT==0 @5bd0c0b72] (29 mock sites + 1 comment)
    - `git grep -niw filestore -- 'src/backend/sidecar/__tests__/*.test.ts' ':!src/backend/sidecar/__tests__/fileStore.test.ts' | wc -l` == 1 [HEAD=83 EXPECT==1 @5bd0c0b72]
    - `diff "$B/before-failing.txt" "$B/t2-failing.txt"` prints nothing
    - `pnpm backend-di-ceilings` prints PASS, with the jestMock total lower than the Task 1 baseline by the number of suites migrated in this task
  </acceptance_criteria>
  <done>Every mock-site suite runs the production store with an unchanged failing-test set. Comments describe conf's actual behaviour. Ceilings are lowered exactly. One pathspec commit.</done>
</task>

<task type="auto">
  <name>Task 3: Delete the file store and its cell registry with every ledger, baseline and stale comment; prove the runtime graph; close the todo</name>
  <precondition>Tasks 1 and 2 are committed, and `$B/before-failing.txt` exists under `B="${TMPDIR:-/tmp}/gamelib-261121-pwt"`.</precondition>
  <files>src/backend/sidecar/fileStore.ts (delete), src/backend/sidecar/__tests__/fileStore.test.ts (delete), src/backend/stores/storeRoot.ts, src/backend/__tests__/diPhaseGates.test.ts, src/backend/sidecar/__tests__/testContainment.test.ts, meta/backendDiCeilings/sidecar.json, src/backend/store_backend.ts, src/backend/__mocks__/store_backend.ts, src/backend/knownFixes.ts, src/backend/jest.setupContainment.ts, src/backend/sidecar/handlers.ts, src/backend/sidecar/settingsFlowRegistration.ts, src/backend/sidecar/storeWriteHandlers.ts, src/common/types/storePolicy.ts, src/preload/tauriTransport.ts, meta/knip-baseline.txt (only if knip demands), .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md, .planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md → .planning/todos/completed/</files>
  <read_first>
    - src/backend/stores/storeRoot.ts lines 1-60 and 78-157 (header, cell types, StoreRoot, the cell factory, createStoreRoot)
    - src/backend/__tests__/diPhaseGates.test.ts: the OWNED_66_4 list (~625-680)
    - src/backend/sidecar/__tests__/testContainment.test.ts: STRUCTURALLY_CONTAINED_SUITES (~1028) and Block C (~1269-1290, set equality, so a listed file that is gone is reported as phantom)
    - meta/buildSidecar.ts (the dev bundle flags the metafile check reproduces)
  </read_first>
  <action>
    Step 1: prove the file is dead before deleting it (D-19).
    - Run `npx esbuild --bundle --platform=node --target=node22 --format=cjs --packages=external --log-level=warning --outfile="$B/sidecar-before.js" --metafile="$B/meta-before.json" src/sidecar/index.ts`.
      This writes to the scratch dir, never to build/main/sidecar.js, which another session's dev run may be using.
    - Read the metafile's `inputs` keys. Record the input count (591 at planning). Confirm that no key ends
      with `src/backend/sidecar/fileStore.ts` and that `src/backend/store_backend.ts` is present.
    - Re-grep importers with `git grep -nE "sidecar/fileStore|from '\.\./fileStore'" -- src meta`. The only
      hit should be the file store's own test.
    - If either check shows a live path, STOP and report. Do not delete.

    Step 2: delete, all in one commit.
    - `git rm` src/backend/sidecar/fileStore.ts and src/backend/sidecar/__tests__/fileStore.test.ts.
    - storeRoot.ts:
      - Remove the cell interface, the cells interface, StoreRoot's cell-registry member, the cell factory
        function and its use in createStoreRoot. Re-grep first: at planning nothing else read them.
      - Rewrite the header's first paragraph. Stores used to share module state; the root now holds that
        state as instances: the renderer push (changes), plus, since Plan 18, versioning and readOnly. Drop
        the file-cell registry clause, and fix the "all three" count so it matches what remains.
    - diPhaseGates.test.ts: delete the OWNED_66_4 entry for the deleted file. Its own comment says the list
      holds files that "still exist".
    - meta/backendDiCeilings/sidecar.json: delete the deleted test's jestMock line. The ratchet fails on a
      stale entry.
    - testContainment.test.ts: delete the deleted test's STRUCTURALLY_CONTAINED_SUITES entry. If a
      classification comment describes that suite, delete or date it too.

    Step 3: reword the comments in the comment-only files. Run `git grep -niw` (case insensitive) across
    src/ and meta/ and fix every remaining hit by meaning, checked against code. Planning-time targets:
    - store_backend.ts (~63, ~105, ~148): the sidecar file store is deleted (quick 261121-pwt), and WR-11's
      containment now lives only here.
    - __mocks__/store_backend.ts (~17): the containment check used to live in a second, now-deleted store.
    - knownFixes.ts (~168, ~173): point at store_backend.ts's `assertContained` as the containment idiom,
      and keep the null-not-throw contrast.
    - jest.setupContainment.ts (~154, as left by 84-07).
    - sidecar/handlers.ts (~541): the store's own guard is store_backend's containment.
    - settingsFlowRegistration.ts (~151): the D-07 clobber note becomes history of the deleted store, or is dropped.
    - storeWriteHandlers.ts (~166): the storage layer's rejection is now dot-prop's `disallowedKeys` in conf.
    - storePolicy.ts (~42, ~46): the CR-01 history names "the Phase 27 sidecar file store, deleted in quick
      261121-pwt". The single-sourcing sentence lists only the live consumers.
    - preload/tauriTransport.ts (~404): this file has its own .prettierrc (printWidth 120), so keep its wrap.
    These are comment-only edits. If a file's hit turns out not to be about the deleted module, leave the
    file out.

    Step 4: fix the ownership legend. In .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    line 13, the `SC` legend names the deleted file as the persistence layer. Change it to the TypeScript
    store classes over `store_backend.ts` (conf), and add a dated parenthetical: the file store never ran in
    production and was deleted by quick 261121-pwt. That table is what Phase 85 plans against.

    Step 5: knip. Run `pnpm find-deadcode`.
    - If it reports a baseline line whose finding vanished ("remove this line"), delete exactly that line
      from meta/knip-baseline.txt.
    - If it reports a new finding, fix the code (for example an export orphaned by the deletion). Never add
      a baseline line; the baseline header forbids it.
    - At planning, no baseline line named the file store or storeRoot. graceful-fs and isSafeKeyPath both
      have other importers, so the expected change is none.

    Step 6: run the remaining gates (the verify command). That includes the after-deletion metafile, which
    must build with exit 0 and contain store_backend.ts. Then run `graphify update .`; graphify-out is
    gitignored, so nothing to stage.

    Step 7: commit with a pathspec of every path above (the deletions included). Message:
    `refactor(quick-261121-pwt): delete the sidecar file store and its cell registry (Phase 82 criterion 5)`.

    Step 8: close the todo.
    - `git mv` .planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md into
      .planning/todos/completed/.
    - Append a `## Resolution` section with: the date; quick 261121-pwt; the three code commit hashes; the
      measured facts (suite count migrated, the before/after failing set, the metafile input counts before
      and after); and the reason no separate test store root was needed (production conf store plus
      createTestStoreRoot, pinned in storeRoot.test.ts).
    - Note that Phase 85 need not repeat the work.
    - Commit with `git commit -- <old path> <new path>`. Message:
      `docs(quick-261121-pwt): close the fileStore migration todo`.
  </action>
  <verify>
    <automated>B="${TMPDIR:-/tmp}/gamelib-261121-pwt"; pnpm exec jest --selectProjects Backend --runTestsByPath $(cat "$B/suites.txt" "$B/extra.txt") --json --outputFile="$B/t3.json" > "$B/t3.log" 2>&1; test ! -e src/backend/sidecar/fileStore.ts && test ! -e src/backend/sidecar/__tests__/fileStore.test.ts && { git grep -inw filestore -- src meta; test $? -eq 1; } && test "$(grep -cE 'FileStoreCell|createFileStoreCells|readonly cells' src/backend/stores/storeRoot.ts)" -eq 0 && test "$(grep -c "'fileStore.test.ts'" src/backend/sidecar/__tests__/testContainment.test.ts)" -eq 0 && node "$B/failing.cjs" "$B/t3.json" > "$B/t3-failing.txt" && diff "$B/before-failing.txt" "$B/t3-failing.txt" && pnpm backend-di-ceilings && pnpm find-deadcode && pnpm codecheck && pnpm lint && npx esbuild --bundle --platform=node --target=node22 --format=cjs --packages=external --log-level=warning --outfile="$B/sidecar-after.js" --metafile="$B/meta-after.json" src/sidecar/index.ts && node -e 'const k=Object.keys(require(process.argv[1]).inputs);const fs=k.some(p=>p.endsWith("src/backend/sidecar/fileStore.ts"));const sb=k.some(p=>p.endsWith("src/backend/store_backend.ts"));console.log("inputs="+k.length+" fileStoreInput="+fs+" storeBackend="+sb);process.exit(!fs&&sb?0:1)' "$B/meta-after.json" && test ! -e .planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md && grep -q "^## Resolution" .planning/todos/completed/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md && pnpm planning-gates && F="src/backend/stores/storeRoot.ts src/backend/__tests__/diPhaseGates.test.ts src/backend/sidecar/__tests__/testContainment.test.ts meta/backendDiCeilings/sidecar.json src/backend/store_backend.ts src/backend/__mocks__/store_backend.ts src/backend/knownFixes.ts src/backend/jest.setupContainment.ts src/backend/sidecar/handlers.ts src/backend/sidecar/settingsFlowRegistration.ts src/backend/sidecar/storeWriteHandlers.ts src/common/types/storePolicy.ts src/preload/tauriTransport.ts" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "ignored: $f"; exit 1; }; done && npx prettier --check $F # drop from F any comment file Step 3 left untouched; knip-baseline.txt (no parser) and the .planning files (ignored) are excluded on purpose; deleted files cannot be checked</automated>
    <fails_when>non-zero exit; a `test` fails (a deleted file survives, the whole-word grep over src/meta counts above 0, the cell registry is still in storeRoot.ts, or testContainment still lists the deleted suite); diff prints a line; backend-di-ceilings prints "grew", "shrank" or "stale"; find-deadcode prints "new knip finding" or "remove this line"; codecheck prints "error TS"; lint reports warnings above a ceiling; esbuild exits non-zero, or the node check prints fileStoreInput=true or storeBackend=false; the todo is still in pending or has no Resolution section; planning-gates prints a FAIL line; prettier prints "Code style issues found" or "ignored: &lt;path&gt;"</fails_when>
  </verify>
  <acceptance_criteria>
    - `test -e src/backend/sidecar/fileStore.ts` exits 1 [HEAD=present EXPECT==absent @5bd0c0b72]
    - `git grep -inw filestore -- src meta | wc -l` == 0 [HEAD=144 EXPECT==0 @5bd0c0b72]
    - `grep -cE 'FileStoreCell|createFileStoreCells|readonly cells' src/backend/stores/storeRoot.ts` == 0 [HEAD=7 EXPECT==0 @5bd0c0b72]
    - `grep -c "'fileStore.test.ts'" src/backend/sidecar/__tests__/testContainment.test.ts` == 0 [HEAD=1 EXPECT==0 @5bd0c0b72]
    - The SUMMARY quotes both metafile results (before: 591 inputs at planning, fileStore absent, store_backend present; after: the count, fileStore absent, store_backend present)
    - `git show --stat HEAD~1` (the refactor commit) lists only this task's paths. `git status --porcelain` shows the other sessions' pre-existing dirty files still dirty and unstaged
  </acceptance_criteria>
  <done>The file store, its test and its cell registry are gone in one commit, with every ledger, ceiling and stale comment brought into line. The runtime graph is proven unchanged, and all gates are green. The todo is moved to completed with a resolution note, in its own docs commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → sidecar store writes | `storeSet`/`storeDelete` frames carry renderer-controlled key paths and store names into the store layer (guards: storePolicy, applyStoreWrite, the store's own containment and key checks) |
| jest suites → real filesystem | migrated suites now write through the production store; containment is the Backend project's structural HOME redirect (jest.setupContainment.ts) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pwt-01 | Tampering | store path containment (WR-11) | medium | mitigate | The deleted store's containment check was a duplicate. The production check is `translateStoreOptions`/`assertContained` in store_backend.ts. storeRoot.test.ts's 'WR-11 containment' describe stays byte-identical and is gated (count == 1). The migrated skeletonFlows/sidecarRejectionGuard path-escape tests must stay in the unchanged failing-set diff. |
| T-pwt-02 | Elevation of Privilege | prototype-key guard (CR-01) | medium | mitigate | The deleted store's `isSafeKeyPath` walk is replaced, on the production path, by `applyStoreWrite`'s guard (c′) plus dot-prop's `disallowedKeys` in conf 10.2.0 (verified at planning). skeletonFlows' CR-01 regression test now runs against the production store and must stay green (diff gate). |
| T-pwt-03 | Information Disclosure | migrated suites writing token-bearing store files | low | mitigate | No suite gains a spawn or a real-HOME path. jest.setupContainment.ts (setupFiles, Backend project) still redirects HOME/APPDATA/XDG_* for every suite, and testContainment.test.ts, one of the migrated suites, must stay in the unchanged failing-set diff. |
| T-pwt-04 | Repudiation | concurrent Phase 84 executor | medium | mitigate | Each task's precondition requires the 84-06/84-07 SUMMARYs to exist and this plan's directories to be clean. Commits use pathspecs, so the other sessions' dirty files are never staged. |
| T-pwt-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed, added or upgraded by this plan (conf 10.2.0 and dot-prop are already resolved and pinned). The legitimacy gate has nothing to check. |
</threat_model>

<verification>
- `B="${TMPDIR:-/tmp}/gamelib-261121-pwt"; diff "$B/before-failing.txt" "$B/t3-failing.txt"` prints nothing: every formerly mocked suite, plus storeRoot, diPhaseGates, bootstrap and gameDetailsImportGate, has the same failing set as before the first edit.
- `git grep -inw filestore -- src meta | wc -l` is 0.
- `git grep -l "jest.requireActual('../fileStore')" -- src | wc -l` is 0.
- `pnpm backend-di-ceilings && pnpm find-deadcode && pnpm codecheck && pnpm lint && pnpm planning-gates` all pass.
- Dev-bundle metafile after deletion: esbuild exits 0, store_backend.ts is in the inputs, and the deleted file is not.
- `git log --format=%s -4` shows the three code commits and the docs commit, each scoped by pathspec.
</verification>

<success_criteria>
- The ~30 sidecar suites test the store that ships (store_backend.ts) instead of a store that never ran in production. No test-only store was invented. The behaviour they relied on (same-path sharing, separate roots, containment) is pinned on GameLibStore in storeRoot.test.ts.
- src/backend/sidecar/fileStore.ts, its test and StoreRoot's cell registry are deleted. Phase 82 criterion 5's file-store clause is met.
- The ceilings, ledgers, knip baseline, Block C census and every comment agree with the tree.
- The todo is closed in .planning/todos/completed/ with a resolution note naming the commits and measurements.
</success_criteria>

<output>
Create `.planning/quick/261121-pwt-migrate-the-sidecar-test-mocks-off-files/261121-pwt-SUMMARY.md` when done. Include:
- the baseline failing set;
- the migrated suite count, reconciled against the planning list;
- every comment whose claim changed in meaning, not just in wording;
- any fixture change made in Task 2 Step 4;
- both metafile results;
- the knip outcome;
- the commit hashes.
</output>
