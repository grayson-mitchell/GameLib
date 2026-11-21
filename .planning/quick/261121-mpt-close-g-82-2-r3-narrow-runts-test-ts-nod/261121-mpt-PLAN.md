---
phase: quick-261121-mpt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/__tests__/runTs.test.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - .planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md
autonomous: true
requirements:
  - QUICK-261121-mpt

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "meta/__tests__/runTs.test.ts passes 13 of 13 against the current package.json, and package.json is byte-identical to HEAD, so codecheck keeps both --incremental flags and its two tsbuildinfo files under node_modules/.cache"
    - "C3-01 test 1 and E-02 pin 1 each still go red, naming the script, when a compile-then-run outfile script in the retired shape is added to a package.json the suite reads (mutation check on a temporary copy of the test; the real package.json is never written)"
    - "E-02 pin 1's stated premise is true and enforced: its title says no package.json script compiles a runnable outfile into node_modules/.cache, and its first expect asserts exactly that with the narrowed predicate. Its meta/*.ts source check keeps the bare path, unchanged"
    - "The C3-01 vacuity guard proves the narrowed predicate fires on three hazard shapes (outfile .cjs, outdir with a .js run, extensionless outfile) and does not fire on tsc incremental state"
    - "The steamBridgeKnownFixes registry-timeout test waits by elapsed real time (yieldUntil on a clock captured at file load), asserts the runWineCommand call straight after the wait, and has an explicit per-test timeout. No turn-counted wait remains in the file"
    - "A slowed-path regression test (250 ms real-time delay on the prefix .reg read) fails with the old 20-turn wait, passes with yieldUntil, and fails with a 5 ms deadline mutant. 10 of 10 runs of the file pass with two busy loops per core"
    - "A pending todo records the macOS gamelib-steampoll watchdog_real grandchild flake with severity, platform and ready in that order, and the todo frontmatter gate passes"
    - "Each task's commit contains only that task's own file. Nothing is pushed"
  artifacts:
    - path: meta/__tests__/runTs.test.ts
      provides: "C3-01 and E-02 pins narrowed to the compile-then-run outfile, a vacuity guard with a tsc-state negative control, and E-02 pin 1 restating its premise"
      contains: "because no package.json script compiles a runnable outfile there"
    - path: src/backend/__tests__/steamBridgeKnownFixes.test.ts
      provides: "real-clock yieldUntil, per-test timeout, slowed-path regression test"
      contains: "const REAL_WAIT_DEADLINE_MS = 15_000"
    - path: .planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md
      provides: "triaged record of the steampoll watchdog grandchild flake (UAT gap G-82-2-r3, cause 3)"
      contains: "ready: code"
  key_links:
    - from: meta/__tests__/runTs.test.ts
      to: package.json
      via: "loadScripts() reads the real scripts object; hasSharedCacheOutfile (SHARED_CACHE_OUTFILE) must not match scripts.codecheck's --tsBuildInfoFile paths but must match an esbuild --outfile/--outdir into node_modules/.cache or a .js/.cjs/.mjs path there"
    - from: src/backend/__tests__/steamBridgeKnownFixes.test.ts
      to: src/backend/knownFixesRegistry.ts
      via: "applyRegistryFixes arms the REGISTRY_FIX_TIMEOUT_MS timer synchronously right before run() in one Promise.race expression, so mockRunWineCommand having a call means the 15 s timer exists and advanceTimersByTimeAsync(15_000) can fire it"
    - from: src/backend/__tests__/steamBridgeKnownFixes.test.ts
      to: src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
      via: "yieldUntil, realNow and REAL_WAIT_DEADLINE_MS are a deliberate local copy of the 82-20 helper, not an import"
---

<objective>
Close UAT gap G-82-2-r3 (phase 82, test 2) so the Test workflow goes green on main: fix the two deterministic runTs pin failures, de-flake the steamBridgeKnownFixes registry-timeout test with the 82-20 real-time wait, and file a triaged todo for the macOS steampoll watchdog flake (out of scope for code).

Purpose: Test run 44858803823 went red on three tests, none in Phase 82 code. (1) Deterministic: quick 261121-kqt (1dc3e622e) put tsc's incremental buildinfo under node_modules/.cache in `codecheck`. The C3-01 and E-02 pins in runTs.test.ts are titled for the compile-then-run outfile but match any mention of that path. (2) Flake: steamBridgeKnownFixes.test.ts:576 counts 20 setImmediate turns before advancing fake timers. If the real .reg read has not landed by then, the 15 s timer is armed only after the advance, `await p` never resolves, and jest's 5 s default kills the test. (3) Flake: the macOS gamelib-steampoll watchdog_real grandchild test. The operator has scoped it to a todo.

**Decision for (1): narrow the pins. Do not move the buildinfo.** Both test titles already say they target the compile-then-run outfile, so the predicate is what is wrong, not codecheck. node_modules/.cache is the shared tool-cache directory (kqt's plan recorded boundary-ratchet and jiti already caching there). Moving tsc's buildinfo would dodge the regex and leave it as a trap for the next legitimate cache. The buildinfo is also not the C3-01 hazard: it is tsc's type-check state and is never executed, so no invocation can run another invocation's output. With this choice package.json stays byte-identical and kqt's measured cold/warm timings still hold. E-02 pin 1's premise is restated as the fact the pin actually depends on (no script compiles a runnable outfile there). Its first expect enforces that restated premise, so the premise stays true by construction and goes red the moment it stops being true. Its meta/*.ts source check keeps the bare path, at full strictness.

**Decision for (2): a local copy of yieldUntil, not a shared util.** Extracting the helper would mean a new src/backend/testUtils module (that directory keeps tests for its utilities in testUtils/__tests__) plus an edit to sharedRedistInstall.test.ts. That file is green, and 82-20's mutant proof and 82-TEST-LEDGER.md entry are recorded against its local REAL_WAIT_DEADLINE_MS. The local copy is about ten lines, keeps the diff inside the failing file, and keeps the clock capture at this file's load. The comment names its twin so a third user can extract both. The pending todo 2026-11-21-bootstrap-legacy-zoom-turn-counted-wait.md is the likely third user.

Output: two edited test files, one new pending todo, three commits (one per task), and a SUMMARY. No production code changes, and nothing is pushed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md
@.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-20-SUMMARY.md
@meta/__tests__/runTs.test.ts
@package.json
@src/backend/__tests__/steamBridgeKnownFixes.test.ts
@src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
@src/backend/knownFixesRegistry.ts
@src/backend/storeManagers/steam/bridgeKnownFixes.ts
@src-tauri/crates/gamelib-steampoll/tests/monitor.rs
@src-tauri/crates/gamelib-steampoll/src/monitor.rs

Load `Skill("gamelib-conventions")` before Task 3 (the todo frontmatter rule) and before writing any SUMMARY claim about the prettier check.

Planner measurements at HEAD 2b35a3f48 (the only commit after 4f7d54a22 touched .planning/phases/84 only; none of the files above changed):
- `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runTs.test.ts`: 2 failed and 11 passed of 13. The failures are exactly C3-01 test 1 (line 72) and E-02 pin 1 (line 185), each receiving `["codecheck"]`.
- Full Meta project: 1 failed suite, 2 failed tests (the two above), 2758 passed, 17 skipped, about 200 s.
- `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/steamBridgeKnownFixes.test.ts`: 81 of 81 pass. The file has one `jest.useFakeTimers` site (line 579) and one turn-counted loop (lines 584-586), and no other setImmediate wait. That test is the only one with this wait shape, so it has no siblings to fix.
- The narrowed regex, run in node against the real package.json, matches 0 scripts (the bare path matches 1: codecheck). Against synthetic inputs it matched the retired outfile shape, the outdir-plus-.js shape, the extensionless outfile shape and an .mjs outfile. It did not match `--tsBuildInfoFile node_modules/.cache/x.tsbuildinfo` or a .json cache path.
- Slowed-path probe (a throwaway test calling applyRegistryFixes directly, deleted afterwards). Under `doNotFake: ['setImmediate']` with `jest.spyOn(fsPromises, 'readFile')` delaying 250 ms through a captured setTimeout, run had 0 calls after 20 setImmediate turns. A real-clock wait saw run called after 250 ms, with the spy called once and `jest.getTimerCount()` == 1 (the 15 s timer armed). `advanceTimersByTimeAsync(15_000)` then settled the promise. So the spy intercepts, the old wait goes RED, and the yieldUntil done-condition is right.
- Task 1's mutation mechanism was dry-run at HEAD with the same commands: the copy differs by one line, 0 runtime-error suites, and both named pins failed naming `zz-outfile-mutant`. The copy was removed by trap, and package.json and meta/ show no git changes.
- `npx prettier --file-info`: both test files `{ "ignored": false, "inferredParser": "typescript" }`. A `.planning/todos/pending/*.md` path is `{ "ignored": true, "inferredParser": null }`.
- `pnpm codecheck` exit 0 (3 s warm). `pnpm planning-gates` exit 0 (12 s). The todo gate reports 14 pending todos. This machine has 30 cores.
- Working tree: many unrelated uncommitted changes. All files this plan edits or reads for proof are clean at HEAD.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): narrow the runTs C3-01 and E-02 pins to the compile-then-run outfile, then prove both still catch a reintroduction</name>
  <files>meta/__tests__/runTs.test.ts</files>
  <precondition>meta/__tests__/runTs.test.ts at HEAD fails exactly C3-01 test 1 and E-02 pin 1, both receiving ["codecheck"], and package.json's codecheck carries two --incremental flags.</precondition>
  <read_first>meta/__tests__/runTs.test.ts lines 1-243 (pins, comments, vacuity guards); `git show 1dc3e622e` (the codecheck change); `git show 5af220b4b --stat` (E-02's origin, which describes pin 1 as tied to the package.json fact); meta/runTs.cjs lines 1-12 (note how it names the retired path without writing it)</read_first>
  <action>
Use the narrowing option (decision recorded in the objective). Edit only meta/__tests__/runTs.test.ts. Do not touch package.json, meta/runTs.cjs, OLD_SHARED_CACHE_SHAPE, NEW_WRAPPER_SHAPE, C3-01 test 2, E-02 pins 2 and 3, `sourceMentionsSharedCachePath`, or the 260906-hq8 block.

1. Run the precondition: `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runTs.test.ts`. Expect 2 failed, 11 passed. If anything else fails, stop and report it.
2. Narrow `hasSharedCacheOutfile`. Add a module-level const `SHARED_CACHE_OUTFILE` directly above the function, holding the regex `/--out(?:file|dir)[=\s]+node_modules\/\.cache\b|node_modules\/\.cache\/[\w./-]*\.[cm]?js\b/`. The function body becomes `return SHARED_CACHE_OUTFILE.test(scriptValue)`, replacing the bare-path regex it has today. Keep the function's name, signature and all three call sites (C3-01 test 1, the C3-01 vacuity guard, E-02 pin 1).
3. Rewrite the comment above it (currently lines 31-37) to say three things:
   - What it matches: either half of the compile-then-run shape, an esbuild `--outfile`/`--outdir` pointing into node_modules/.cache, or a .js/.cjs/.mjs path there.
   - What it excludes, and why: since quick 261121-kqt, `codecheck` keeps tsc's incremental buildinfo there through `--tsBuildInfoFile`. That file is type-check state that is never executed, so it is not the cross-contamination C3-01 measured.
   - Keep the existing point that the same predicate runs against both the real scripts and the synthetic fixture.
4. Extend the C3-01 vacuity guard (test 3, currently lines 101-116):
   - Keep the 'reintroduced-hazard' entry byte-identical.
   - Add 'reintroduced-hazard-outdir' with value `esbuild --bundle --outdir=node_modules/.cache meta/y.ts && node node_modules/.cache/y.js`.
   - Add 'reintroduced-hazard-extensionless' with value `esbuild --bundle --outfile node_modules/.cache/z meta/z.ts && node node_modules/.cache/z`.
   - Add a negative control 'incremental-state' with value `tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/x.tsbuildinfo`.
   - The expected survivors become exactly ['reintroduced-hazard', 'reintroduced-hazard-outdir', 'reintroduced-hazard-extensionless'], in that order.
   - Retitle the test so it says the predicate fires against known-bad synthetic inputs and not against tsc incremental state. Update its inline comment to match.
5. Restate E-02 pin 1's premise:
   - In its title (line 175), keep the head, `pin 1 (derived negative): no meta/*.ts source mentions the shared node_modules/.cache path`, unchanged. Replace the closing clause after the last comma with `because no package.json script compiles a runnable outfile there`.
   - Rewrite the in-test comment (lines 180-184) so it names that restated premise as the thing the first expect asserts.
   - In the E-02 banner comment (lines 119-130), add two or three sentences. Since quick 261121-kqt, tool state legitimately lives under node_modules/.cache (codecheck's tsc buildinfo), so the premise is the narrower fact. The meta/*.ts source check deliberately keeps the bare path (`sourceMentionsSharedCachePath` is unchanged): meta sources are the runner entries, and they only ever named that path to describe the retired runner. If a meta source ever needs to name a tool cache there, narrow that predicate the same way; never delete the pin.
6. Run the file. Expect 13 passed, 0 failed.
7. Run the verify block. Its second half is the mutation check, and it never writes the real package.json:
   - It writes a mutant package.json (the real one plus a `zz-outfile-mutant` script in the retired shape) into a mktemp dir.
   - It makes a temporary copy of the test at meta/__tests__/runTs.outfileMutant.test.ts whose PACKAGE_JSON_PATH line points at the mutant, runs the copy, and requires C3-01 test 1 and E-02 pin 1 both to fail with `zz-outfile-mutant` in their failure output.
   - The EXIT trap deletes the copy and the dir.
   Quote both failure excerpts in the SUMMARY (the received array naming `zz-outfile-mutant`).
8. Commit. Run `git add -- meta/__tests__/runTs.test.ts`, then confirm `git diff --cached --name-only` prints exactly that one path. Commit with subject `test(quick-261121-mpt): narrow runTs C3-01/E-02 pins to the compile-then-run outfile`. Write a body that states the decision and the mutation result, then end the message with the two trailer lines `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_013cjweDqk4gNLHFRqHq63ZJ`. Never use `git add -A` or `git add .`, and never use the gsd-tools commit helper without `--files` (it sweeps every dirty .planning file).
  </action>
  <verify>
    <automated>F=meta/__tests__/runTs.test.ts; M=meta/__tests__/runTs.outfileMutant.test.ts; D=$(mktemp -d); trap 'rm -rf "$M" "$D"' EXIT; NC() { grep -vE '^[[:space:]]*(//|\*|/\*)' "$F"; }; npx jest --selectProjects Meta --runTestsByPath "$F" --json --outputFile="$D/green.json" >/dev/null 2>&1; node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(j.numFailedTests===0&&j.numPassedTests===13&&j.numRuntimeErrorTestSuites===0?0:1)' "$D/green.json" && test "$(NC | grep -cF 'return /node_modules\/\.cache/.test(scriptValue)')" -eq 0 && test "$(NC | grep -cF '[=\s]+node_modules\/\.cache\b|node_modules\/\.cache\/[\w./-]*\.[cm]?js\b/')" -ge 1 && test "$(NC | grep -cF 'SHARED_CACHE_OUTFILE.test(scriptValue)')" -ge 1 && test "$(NC | grep -cF 'return /node_modules\/\.cache/.test(source)')" -ge 1 && test "$(grep -cF 'because no package.json script writes there' "$F")" -eq 0 && test "$(grep -cF 'because no package.json script compiles a runnable outfile there' "$F")" -ge 1 && test "$(NC | grep -cF "'incremental-state'")" -ge 1 && git diff --quiet -- package.json && test "$(node -p "(require('./package.json').scripts.codecheck.match(/--incremental/g)||[]).length")" -eq 2 && test "$(node -p "Object.values(require('./package.json').scripts).filter(v=>/node_modules\/\.cache/.test(v)).length")" -ge 1 && node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts["zz-outfile-mutant"]="esbuild --bundle --platform=node --outfile=node_modules/.cache/zz.cjs meta/zz.ts && node node_modules/.cache/zz.cjs";fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2))' "$D/package.json" && sed "s|^const PACKAGE_JSON_PATH = .*|const PACKAGE_JSON_PATH = '$D/package.json'|" "$F" > "$M" && ! cmp -s "$F" "$M" && { npx jest --selectProjects Meta --runTestsByPath "$M" --json --outputFile="$D/mut.json" >/dev/null 2>&1; true; } && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const a=j.testResults.flatMap(t=>t.assertionResults);const hit=(p)=>a.find(x=>x.title.startsWith(p));const named=(x)=>!!x&&x.status==="failed"&&x.failureMessages.join("\n").includes("zz-outfile-mutant");process.exit(j.numRuntimeErrorTestSuites===0&&named(hit("no package.json script value references"))&&named(hit("pin 1 (derived negative)"))?0:1)' "$D/mut.json" && npx eslint "$F" && npx prettier --check "$F" # file tests passing [HEAD=11 EXPECT==13 @2b35a3f48]; bare scriptValue regex [HEAD=1 EXPECT==0 @2b35a3f48]; narrowed regex body [HEAD=0 EXPECT>=1 @2b35a3f48]; SHARED_CACHE_OUTFILE.test(scriptValue) [HEAD=0 EXPECT>=1 @2b35a3f48]; bare source regex, kept so the E-02 source check stays full strength [HEAD=1 EXPECT>=1 @2b35a3f48 GUARD MUTATION: narrowing or deleting the regex in sourceMentionsSharedCachePath makes it 0]; old pin 1 clause [HEAD=1 EXPECT==0 @2b35a3f48]; new pin 1 clause [HEAD=0 EXPECT>=1 @2b35a3f48]; incremental-state control [HEAD=0 EXPECT>=1 @2b35a3f48]; package.json diff exit [HEAD=0 EXPECT==0 @2b35a3f48 GUARD MUTATION: any edit to package.json makes git diff --quiet exit 1]; codecheck --incremental count [HEAD=2 EXPECT==2 @2b35a3f48 GUARD MUTATION: dropping either --incremental flag makes it 1]; scripts with a bare node_modules/.cache mention, so the green is earned against a package.json that still writes tsc state there [HEAD=1 EXPECT>=1 @2b35a3f48 GUARD MUTATION: moving the tsbuildinfo out of node_modules/.cache makes it 0]; mutant pins failed naming zz-outfile-mutant [HEAD=2 EXPECT==2 @2b35a3f48 GUARD MUTATION: narrowing SHARED_CACHE_OUTFILE so it misses --outfile=node_modules/.cache/zz.cjs makes it 0]</automated>
    <fails_when>the file is not 13/13 green; the bare scriptValue regex survives or the narrowed regex/const is absent; the E-02 source predicate changed; the old pin 1 clause survives or the new one is absent; the vacuity guard lacks the tsc-state control; package.json differs from HEAD or codecheck lost an --incremental; the sed leaves the mutant copy identical; either named pin passes against the mutant package.json, or its failure does not name zz-outfile-mutant; eslint or prettier reports the file</fails_when>
  </verify>
  <acceptance_criteria>
    - `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runTs.test.ts` reports 13 passed and 0 failed [HEAD=11 EXPECT==13 @2b35a3f48]
    - Non-comment `grep -cF 'return /node_modules\/\.cache/.test(scriptValue)'` == 0 [HEAD=1 EXPECT==0 @2b35a3f48]
    - Non-comment `grep -cF 'return /node_modules\/\.cache/.test(source)'` >= 1 [HEAD=1 EXPECT>=1 @2b35a3f48 GUARD MUTATION: narrowing or deleting the regex in sourceMentionsSharedCachePath makes it 0]
    - `grep -cF 'because no package.json script compiles a runnable outfile there'` >= 1 [HEAD=0 EXPECT>=1 @2b35a3f48]
    - Mutation: against a package.json carrying a retired-shape `zz-outfile-mutant` script, C3-01 test 1 and E-02 pin 1 both fail and name it; the SUMMARY quotes both excerpts
    - `git diff --quiet -- package.json` exits 0, and the task commit's `git show --name-only` lists only meta/__tests__/runTs.test.ts
  </acceptance_criteria>
  <done>Both pins pass against the real package.json with codecheck still incremental. Both fail on a reintroduced compile-then-run outfile script. E-02 pin 1's title states a premise its first expect enforces. The task is committed alone.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: bound the steamBridgeKnownFixes registry-timeout wait by real time (82-20 pattern), with a slowed-path RED/GREEN, a mutant and a soak</name>
  <files>src/backend/__tests__/steamBridgeKnownFixes.test.ts</files>
  <precondition>src/backend/__tests__/steamBridgeKnownFixes.test.ts passes 81 of 81 at HEAD and has exactly one jest.useFakeTimers site.</precondition>
  <read_first>src/backend/__tests__/steamBridgeKnownFixes.test.ts lines 1-150 and 541-597; src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts lines 217-253 (the helper to copy) and 983-1016 (its slowed-path test); src/backend/knownFixesRegistry.ts lines 442-530 (timer armed right before run()); src/backend/storeManagers/steam/bridgeKnownFixes.ts lines 228-260 (run closure calls runWineCommand synchronously); .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-20-SUMMARY.md</read_first>
  <behavior>
    - Slowed-path test with the old 20-turn wait: fails at the expect straight after the wait (`Expected number of calls: 1`, `Received number of calls: 0`). This is the CI symptom of run 44858803823, made deterministic
    - The same test with yieldUntil: passes, warns 'timed out', and the readFile spy shows the slowed seam actually ran
    - The same test with REAL_WAIT_DEADLINE_MS = 5: fails (the wait gives up early, which proves the captured clock is not frozen)
    - The original 'times out a never-settling call after 15s and warns' test: passes with yieldUntil and its per-test timeout
  </behavior>
  <action>
Test-only change. Do not modify knownFixesRegistry.ts, bridgeKnownFixes.ts or sharedRedistInstall.test.ts. Use a local copy of yieldUntil rather than a shared util (decision and reasons in the objective). Add no retry, skip or only modifier.

1. Run the precondition: `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/steamBridgeKnownFixes.test.ts` must show 81 passed. Re-run the sibling census with `grep -n 'useFakeTimers\|setImmediate' src/backend/__tests__/steamBridgeKnownFixes.test.ts`. The planner found only the line 576 test (fake timers at 579, a turn-counted loop at 584-586). If the census now shows more waits of that shape, convert each one the same way and raise the `await yieldUntil(` count gate to match. Record why in the SUMMARY.
2. Add a module-scope block directly above `describe('registry fixes application'`, mirroring sharedRedistInstall.test.ts lines 217-253:
   - `REGISTRY_TIMEOUT_TEST_TIMEOUT_MS = 30_000`. Comment: this is only the outer bound. Test run 44858803823 exceeded jest's 5 s default here (G-82-2-r3). The wait inside is bounded by real time, and neither a retry nor a skip is the fix.
   - `const realNow = performance.now.bind(performance)` and `const realSetTimeout = setTimeout`. Comment: these are captured at file load, because under this file's `doNotFake: ['setImmediate']` the live performance.now and Date.now are frozen inside the test (82-20 measured this on jest 29.7).
   - `const REAL_WAIT_DEADLINE_MS = 15_000`, written exactly like that, because the mutant sed matches it.
   - `SLOW_REG_READ_MS = 250`.
   - `async function yieldUntil(done: () => boolean, deadlineMs = REAL_WAIT_DEADLINE_MS): Promise<void>`, with the same body as the twin.
   - Comment the block as a deliberate local copy of sharedRedistInstall.test.ts's yieldUntil (G-82-2-r2), not an import, and say a third user should extract both.
3. Add `promises as fsPromises` to the file's existing `fs` import.
4. RED. Inside `describe('registry fixes application'`, directly after the existing timeout test, add a test titled `times out a never-settling call after 15s even when the prefix .reg read is slow`, with REGISTRY_TIMEOUT_TEST_TIMEOUT_MS as its third argument.
   - Arrange it like the existing test: `jest.useFakeTimers({ doNotFake: ['setImmediate'] })`, `writeBundled` with `views: [32]`, and mockRunWineCommand returning a never-settling promise.
   - Before `try`, also capture `const actualReadFile = fsPromises.readFile.bind(fsPromises)`. Then install `const readFileSpy = jest.spyOn(fsPromises, 'readFile')` with an implementation that first awaits `new Promise((r) => realSetTimeout(r, SLOW_REG_READ_MS))` and then returns `actualReadFile(...args)`. Cast through unknown if the readFile overloads reject the implementation type. This works because knownFixesRegistry.ts reads `fsPromises.readFile` (the `fs` module's promises object) at call time, and under jest the test and the module share that core-module object.
   - Inside `try`, call applySteamBridgeKnownFixes without awaiting it. For this RED run only, the wait is a verbatim copy of the existing test's 20-turn setImmediate loop, followed immediately by `expect(mockRunWineCommand).toHaveBeenCalledTimes(1)`. Then `await jest.advanceTimersByTimeAsync(15_000)`, `await p`, expect a warning containing 'timed out', and `expect(readFileSpy).toHaveBeenCalled()`.
   - In `finally`, call `readFileSpy.mockRestore()` and then `jest.useRealTimers()`. The restore is mandatory: the backend jest config sets `resetMocks: true`, and under jest 29 a surviving spy returns undefined to every later test.
   - Run `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/steamBridgeKnownFixes.test.ts -t 'prefix .reg read is slow' --forceExit`. It must FAIL at the expect after the wait. Quote the `Expected number of calls: 1` / `Received number of calls: 0` text in the SUMMARY. If it passes, the spy did not slow the path. Stop and report; do not invent another seam.
5. GREEN: in the new test, replace the copied loop with `await yieldUntil(() => mockRunWineCommand.mock.calls.length > 0)`, keeping the expect right after it. Re-run the same filter; it must pass. This is the right done-condition: applyRegistryFixes arms the 15 s timer inside `new Promise` immediately before invoking `run(...)` in the same `Promise.race` expression, and the bridge's run closure calls runWineCommand synchronously, so a recorded call means the timer exists.
6. Convert the original test (line 576):
   - Replace its turn-counted loop with the same `yieldUntil` call followed by `expect(mockRunWineCommand).toHaveBeenCalledTimes(1)`.
   - Add REGISTRY_TIMEOUT_TEST_TIMEOUT_MS as its third argument.
   - Rewrite its two-line comment to say setImmediate stays real so yieldUntil can let the real .reg read land, and that the wait is bounded by real time, not a turn count (G-82-2-r3, Test run 44858803823).
   - Keep its title unchanged.
7. Run the verify block. It covers: the file green at 82 tests (81 plus 1); the grep gates; the 5 ms deadline mutant on a temporary copy deleted by the EXIT trap, run with `--forceExit`; eslint, codecheck and prettier; then the soak, 10 runs of the file under two self-terminating busy loops per core, killed by trap. Record `soak passed N/10 with M busy loops` in the SUMMARY. As in 82-20, contention alone may not turn the old wait red, so the binding proof is the RED run plus the mutant, and the soak is supplementary.
8. Commit. Run `git add -- src/backend/__tests__/steamBridgeKnownFixes.test.ts`, then confirm `git diff --cached --name-only` prints exactly that path. Commit with subject `test(quick-261121-mpt): bound steamBridgeKnownFixes registry-timeout wait by real time`. In the body, give the RED text, the mutant result and the soak line, then end the message with the same two trailer lines as Task 1. Never use `git add -A` or `git add .`.
  </action>
  <verify>
    <automated>F=src/backend/__tests__/steamBridgeKnownFixes.test.ts; M=src/backend/__tests__/steamBridgeKnownFixes.deadlineMutant.test.ts; G=$(mktemp); OUT=$(mktemp); trap 'rm -f "$M" "$G" "$OUT"' EXIT; NC() { grep -vE '^[[:space:]]*(//|\*|/\*)' "$F"; }; npx jest --selectProjects Backend --runTestsByPath "$F" --json --outputFile="$G" >/dev/null 2>&1; node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(j.numFailedTests===0&&j.numPassedTests===82&&j.numRuntimeErrorTestSuites===0?0:1)' "$G" && test "$(NC | grep -c 'performance.now.bind(performance)')" -ge 1 && test "$(NC | grep -c 'await yieldUntil(')" -ge 2 && test "$(NC | grep -cE 'i < 20;')" -eq 0 && test "$(NC | grep -c 'REGISTRY_TIMEOUT_TEST_TIMEOUT_MS')" -ge 3 && test "$(NC | grep -c 'mockRestore()')" -ge 1 && test "$(NC | grep -cE 'retryTimes|\.skip\(|\.only\(')" -eq 0 && git diff --quiet -- src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts && sed 's/const REAL_WAIT_DEADLINE_MS = 15_000/const REAL_WAIT_DEADLINE_MS = 5/' "$F" > "$M" && ! cmp -s "$F" "$M" && { npx jest --selectProjects Backend --runTestsByPath "$M" -t 'prefix .reg read is slow' --forceExit --json --outputFile="$OUT" >/dev/null 2>&1; true; } && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(j.numFailedTests===1&&j.numPassedTests===0&&j.numRuntimeErrorTestSuites===0?0:1)' "$OUT" && npx eslint "$F" && pnpm -s codecheck && npx prettier --check "$F" && ( N=$(node -p "require('os').cpus().length*2"); PIDS=(); for c in $(seq 1 $N); do node -e "const e=Date.now()+300000;while(Date.now()<e){}" & PIDS+=($!); done; trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT; ok=0; for i in $(seq 1 10); do npx jest --selectProjects Backend --runTestsByPath "$F" --silent >/dev/null 2>&1 && ok=$((ok+1)); done; echo "soak passed $ok/10 with $N busy loops"; test "$ok" -eq 10 ) # file tests passing [HEAD=81 EXPECT==82 @2b35a3f48]; captured clock [HEAD=0 EXPECT>=1 @2b35a3f48]; yieldUntil awaits [HEAD=0 EXPECT>=2 @2b35a3f48]; turn-counted loops [HEAD=1 EXPECT==0 @2b35a3f48]; per-test timeout refs [HEAD=0 EXPECT>=3 @2b35a3f48]; mockRestore [HEAD=0 EXPECT>=1 @2b35a3f48]; retry/skip/only [HEAD=0 EXPECT==0 @2b35a3f48 GUARD MUTATION: renaming any it( to it.skip( makes it 1]; production files and the 82-20 twin diff exit [HEAD=0 EXPECT==0 @2b35a3f48 GUARD MUTATION: any edit to src/backend/knownFixesRegistry.ts makes git diff --quiet exit 1]; deadline mutant buildable [HEAD=absent EXPECT==present @2b35a3f48]; mutant failed tests [HEAD=absent EXPECT==1 @2b35a3f48]; soak passes [HEAD=absent EXPECT==10 @2b35a3f48]</automated>
    <fails_when>the file is not 82/82 green; no captured clock; fewer than 2 yieldUntil awaits; any turn-counted loop remains in code; fewer than 3 per-test timeout references; no mockRestore; a retry, skip or only modifier appears; a production file or sharedRedistInstall.test.ts changed; the sed leaves the mutant identical; the mutant's slowed test passes or its suite errors; eslint, codecheck or prettier exits non-zero; fewer than 10 of 10 soak runs pass</fails_when>
  </verify>
  <acceptance_criteria>
    - RED observed and quoted in the SUMMARY (`Expected number of calls: 1`, `Received number of calls: 0`) for the slowed test with the old wait
    - Jest JSON for the file: numPassedTests == 82 and numFailedTests == 0 [HEAD=81 EXPECT==82 @2b35a3f48]
    - Non-comment `grep -c 'await yieldUntil('` >= 2 [HEAD=0 EXPECT>=2 @2b35a3f48]
    - Non-comment `grep -cE 'i < 20;'` == 0 [HEAD=1 EXPECT==0 @2b35a3f48]
    - 5 ms mutant: numFailedTests == 1, numPassedTests == 0, numRuntimeErrorTestSuites == 0
    - Soak line `soak passed 10/10 with N busy loops` recorded in the SUMMARY
    - The task commit's `git show --name-only` lists only src/backend/__tests__/steamBridgeKnownFixes.test.ts
  </acceptance_criteria>
  <done>Both registry-timeout tests wait by real time with an explicit per-test timeout. The slowed path is RED with the old wait, GREEN with yieldUntil, and FAILS with the 5 ms mutant. The soak is 10/10. The task is committed alone.</done>
</task>

<task type="auto">
  <name>Task 3: file a triaged pending todo for the macOS gamelib-steampoll watchdog_real grandchild flake</name>
  <files>.planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md</files>
  <read_first>`Skill("gamelib-conventions")` (Todo triage frontmatter section); .planning/todos/pending/2026-11-21-bootstrap-legacy-zoom-turn-counted-wait.md (house shape: created, title, area, severity, platform, ready, files, then Problem / Solution); src-tauri/crates/gamelib-steampoll/tests/monitor.rs lines 541-735; src-tauri/crates/gamelib-steampoll/src/monitor.rs lines 33-58 (WATCHDOG_SH)</read_first>
  <action>
Out of scope for code (operator decision). Write the todo only, and do not touch any Rust file.

Create .planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md. Its frontmatter keys go in this order:
- `created:` the current UTC ISO timestamp
- `title:` gamelib-steampoll watchdog_real grandchild test flakes on macOS runners
- `area: tests`
- `severity: medium`
- `platform: macos`
- `ready: code`
- `files:` listing src-tauri/crates/gamelib-steampoll/tests/monitor.rs and src-tauri/crates/gamelib-steampoll/src/monitor.rs

The three triage values are bare, lowercase and exact, with `platform:` immediately after `severity:` and `ready:` immediately after `platform:`. If a value fails the gate, fix the todo; never widen the gate's vocabulary. Reasons for the values:
- `medium`: a real test defect that turned the Rust test workflow red twice, with a bounded blast radius and a rerun workaround.
- `macos`: observed only on the macOS leg.
- `code`: a desk-ready test change, verified by repeated cargo test runs with no live app gate.

Body, `## Problem` section:
- Test `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first`. Assertion `assert!(alive(rig.grand))` at src-tauri/crates/gamelib-steampoll/tests/monitor.rs:711 failed on Rust test runs 44823009090 and 44858803826 (macOS leg). Both went green on rerun.
- This is the third cause of UAT gap G-82-2-r3 and is not Phase 82 code. The gap's missing item 3 asks for a deadline-based wait or a record of why the test stays flaky, and this todo is that record.

Body, `## Hypothesis (unverified)` section:
- WATCHDOG_SH (src/monitor.rs:35) loops while the parent, the inner shell `$m` and the watched pid are all alive, ticking with `sleep 1 & wait`. Once the test SIGKILLs the inner shell and the shell reaps it, the next tick's `kill -0 "$m"` fails, the loop exits, and `cleanup` kills the recorded grandchild `$g`.
- The test sleeps 1500 ms, kills the inner shell, sleeps 300 ms, then asserts the grandchild is still alive. If a tick lands inside that 300 ms window, the watchdog has already done the job under test, and the precondition fails. Slow pgrep, ps and kill spawns on a loaded macOS runner make that more likely.
- Not measured: whether macOS's /bin/sh reaps `$m` sooner than Linux's.

Body, `## Solution` section, with directions that are not yet decided:
- (a) Reproduce first. Loop the single test many times under CPU load on macOS, e.g. from src-tauri `cargo test -p gamelib-steampoll --test monitor still_kills_the_grandchild_when_the_middle_process_dies_first`, to confirm the window theory.
- (b) Make the precondition tolerate the watchdog winning the race, so the test always ends with the grandchild gone within 5 s.
- (c) Sample the precondition immediately after the SIGKILL, before any sleep.
- No retries.

Commit. Run `git add -- <the todo path>`, then confirm `git diff --cached --name-only` prints exactly that path. Commit with subject `docs(quick-261121-mpt): todo for the macOS steampoll watchdog grandchild flake`, ending the message with the same two trailer lines as Task 1. Use plain git with that explicit path. The gsd-tools commit helper without `--files` would sweep every dirty .planning file.
  </action>
  <verify>
    <automated>T=.planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md; test -f "$T" && FM=$(awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{exit} f' "$T") && S=$(printf '%s\n' "$FM" | grep -n '^severity: medium$' | cut -d: -f1) && P=$(printf '%s\n' "$FM" | grep -n '^platform: macos$' | cut -d: -f1) && R=$(printf '%s\n' "$FM" | grep -n '^ready: code$' | cut -d: -f1) && test -n "$S" && test "$P" -eq $((S+1)) && test "$R" -eq $((P+1)) && grep -q '44823009090' "$T" && grep -q '44858803826' "$T" && grep -q 'monitor.rs:711' "$T" && grep -q 'G-82-2-r3' "$T" && python3 .planning/todos/todo-frontmatter-gate.py | grep -Eq '^OK: [0-9]+ pending todo' && test "$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')" -ge 15 && git diff --quiet -- src-tauri/crates/gamelib-steampoll && npx prettier --file-info "$T" | grep -Eq '"ignored":[[:space:]]*true' # todo is prettier-ignored, so no --check (it would print a vacuous green); todo file [HEAD=absent EXPECT==present @2b35a3f48]; severity, platform, ready on consecutive lines in that order [HEAD=absent EXPECT==present @2b35a3f48]; pending todo count [HEAD=14 EXPECT>=15 @2b35a3f48]; todo gate exit [HEAD=0 EXPECT==0 @2b35a3f48 GUARD MUTATION: deleting the ready: line from the new todo makes the gate exit 1]; steampoll crate diff exit [HEAD=0 EXPECT==0 @2b35a3f48 GUARD MUTATION: any edit under src-tauri/crates/gamelib-steampoll makes git diff --quiet exit 1]</automated>
    <fails_when>the todo is missing; severity, platform and ready are absent, carry other values, or are not on consecutive lines in that order; the run ids, the line reference or the gap id are absent; the todo frontmatter gate fails; any steampoll crate file changed; prettier stops reporting the path as ignored</fails_when>
  </verify>
  <acceptance_criteria>
    - The todo exists with `severity: medium`, `platform: macos`, `ready: code` on consecutive frontmatter lines in that order
    - `ls .planning/todos/pending/*.md | wc -l` >= 15, and `python3 .planning/todos/todo-frontmatter-gate.py` exits 0 [HEAD=14 EXPECT>=15 @2b35a3f48]
    - The body names runs 44823009090 and 44858803826, monitor.rs:711 and G-82-2-r3, and marks the cause as unverified
    - The task commit's `git show --name-only` lists only the todo path
  </acceptance_criteria>
  <done>The flake has a triaged pending todo that passes the CI gate. It is committed alone, and no Rust code changed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test verdict → CI gate | The Test workflow trusts these suites. A narrowed pin that no longer fires, or a wait that passes vacuously, would let the defect it guards ship green |
| proof scaffolding → working tree | Mutation and soak steps create temporary test copies, a mutant package.json and busy-loop processes inside a dirty shared working tree |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261121-mpt-01 | Tampering | `hasSharedCacheOutfile` / `SHARED_CACHE_OUTFILE` in meta/__tests__/runTs.test.ts | medium | mitigate | Task 1 verify runs a temporary copy of the suite against a package.json carrying a retired-shape `zz-outfile-mutant` script. C3-01 test 1 and E-02 pin 1 must both fail and name it. The vacuity guard covers three hazard shapes plus a tsc-state negative control |
| T-261121-mpt-02 | Repudiation | E-02 pin 1 premise | medium | mitigate | The restated premise is in the title and enforced by the pin's first expect. The source-side bare-path predicate is held unchanged by a preservation gate (count == 1), so E-02 loses no strength on meta/*.ts sources |
| T-261121-mpt-03 | Tampering | registry-timeout tests in src/backend/__tests__/steamBridgeKnownFixes.test.ts | medium | mitigate | An expect follows each wait, so a miss fails readably. Explicit 30 s per-test timeout. The slowed-path test asserts its readFile spy ran. The binding proof is RED with the old wait, GREEN with yieldUntil, and FAIL with the 5 ms mutant. No retry, skip or only (gated == 0) |
| T-261121-mpt-04 | Tampering | readFile spy on the shared `fs.promises` object | medium | mitigate | `readFileSpy.mockRestore()` in `finally` (gated >= 1). The backend config sets resetMocks: true, so under jest 29 a surviving spy would return undefined to later tests' real reads |
| T-261121-mpt-05 | Tampering | proof scaffolding in a dirty working tree | medium | mitigate | The real package.json is never written: the mutant lives in a mktemp dir, and `git diff --quiet -- package.json` is gated. Mutant test copies are deleted by EXIT traps. Each commit stages one explicit path and checks `git diff --cached --name-only` first. No `git add -A` or `.`, no unscoped gsd-tools commit, no push |
| T-261121-mpt-06 | Denial of Service | soak busy loops | low | mitigate | Each loop self-terminates after 300 s, and the soak subshell's EXIT trap kills them all |
| T-261121-mpt-07 | Information Disclosure | todo body | low | accept | The todo carries only public CI run ids, repo paths and test names. It has no account data and no log captures |
| T-261121-mpt-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or changed, so there is nothing to gate. The plan uses jest, esbuild-free node one-liners, eslint and prettier already in the lockfile |
</threat_model>

<verification>
- Every task's `<automated>` block exits 0.
- Full Meta project: `npx jest --selectProjects Meta --silent` reports 0 failed tests (HEAD at 2b35a3f48: 2 failed, exactly the two runTs pins; 2758 passed; 17 skipped; about 200 s). Report the counts in the SUMMARY.
- `pnpm planning-gates` exits 0.
- `git log --oneline -3` shows the three task commits. `git show --name-only` for each lists exactly its own file. `git status --short -- package.json src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src-tauri/crates/gamelib-steampoll` is empty, and no `*Mutant*.test.ts` file exists under meta/__tests__ or src/backend/__tests__.
</verification>

<success_criteria>
- Cause (1) fixed: C3-01 test 1 and E-02 pin 1 are green against the incremental codecheck and proven red against a reintroduced compile-then-run outfile script.
- Cause (2) fixed: the registry-timeout waits are bounded by real time with an explicit per-test timeout, proven by RED/GREEN/mutant on a slowed path and a 10/10 soak.
- Cause (3) recorded: a triaged pending todo passes the todo frontmatter gate.
- Three single-file commits on main, none pushed.
</success_criteria>

<source_audit>
| Source | Item | Covered by |
|--------|------|-----------|
| GOAL | Test workflow green on main for G-82-2-r3 (phase 82, test 2) | Tasks 1-2 (code); final verification (full Meta run). The CI observation itself needs a push, which is out of scope here (handoff below) |
| CONTEXT (orchestrator item 1) | Narrow both pins, or move the buildinfo; keep codecheck incremental; mutation check; E-02 premise stays true | Task 1 (narrow chosen, reasons in objective) |
| CONTEXT (orchestrator item 2) | yieldUntil real-time wait, explicit per-test timeout, decide shared vs local and say why, fix siblings, prove under load | Task 2 (local copy chosen; sibling census = 1 site; RED/GREEN/mutant plus soak) |
| CONTEXT (orchestrator item 3) | Pending todo for the steampoll flake with severity/platform/ready in order | Task 3 |
| CONTEXT (constraints) | No push; trailers on every commit; stage explicit paths only | Every task's commit step; threat T-261121-mpt-05 |
| REQ | QUICK-261121-mpt | All tasks |
| RESEARCH | none (quick mode) | n/a |
</source_audit>

<output>
Create `.planning/quick/261121-mpt-close-g-82-2-r3-narrow-runts-test-ts-nod/261121-mpt-SUMMARY.md` when done. Include: both decisions and their reasons; Task 1's mutation excerpts; Task 2's RED text, mutant result and soak line; the full Meta run counts; the three commit shas.

Handoff (not delivered here): nothing is pushed. After the operator pushes, re-test UAT item 2 with `/gsd-verify-work 82`, which reads the Test and Rust test runs for that sha. The Rust test macOS leg can still go red on the steampoll flake until the Task 3 todo is worked.
</output>
