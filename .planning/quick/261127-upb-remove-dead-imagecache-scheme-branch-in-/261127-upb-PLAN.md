---
phase: quick-261127-upb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/CachedImage/index.tsx
  - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
  - meta/backendDiCeilings/frontend-components-ui.json
  - src/preload/tauriTransport.ts
  - .planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md
  - .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md
autonomous: true
requirements:
  - "quick:261127-upb"
  - "todo:2026-11-22-dead-imagecache-scheme-branch-in-renderer"

estimate:
  tokens: 44000
  raw_tokens: 44000
  tasks: 3
  confidence: low
  # estimate-calibration 2026-11-27: factor 1, 0 samples, confidence low. basis: fixed 20k (workflow, summary
  # template, this plan, the conventions skill, the todo) + T1 14k (CachedImage index.tsx 107 lines, its test 317
  # lines, the ceiling shard, jest/eslint/prettier/ratchet runs) + T2 6k (tauriTransport.ts lines 1-75, two sweeps,
  # codecheck, four test files) + T3 4k (todo move, Resolution, planning-gates)

must_haves:
  truths:
    - "CachedImage passes the source it is showing to the img element exactly as given: an http(s) URL is never rewritten into another scheme"
    - "On every load error CachedImage advances once through `fallback` in order (a single string or a string[]), stops at the last entry and never loops, and still calls the caller's onError each time; a new src resets the chain, `loaded` and the usingFallback class as before"
    - "CachedImage imports nothing from the preload transport, and its test pins that with a comment-stripped source guard"
    - "Nothing under src/ or meta/ names the custom image-cache URL scheme or its availability predicate: `grep -rniE imagecache src/ meta/` prints nothing (35 lines at HEAD)"
    - "The only files under src/ still naming `src/backend/images_cache.ts` are the backend deletion gates (`src/backend/__tests__/infoPortComplete.test.ts`, which pins that the file stays deleted, plus the floor-history notes in `src/backend/__tests__/diPhaseGates.test.ts` and `src/backend/testUtils/portSliceGate.ts`); no renderer or preload comment points at it"
    - "The jestMock shrink-only ratchet records CachedImage's test at 1 mock (was 2) in the same commit that removes the mock, and `node meta/backendDiCeilings.cjs` passes"
    - "The source todo sits in `.planning/todos/completed/` with a Resolution section, and `pnpm planning-gates` reports 12/12"
  artifacts:
    - path: src/frontend/components/UI/CachedImage/index.tsx
      provides: "CachedImage with the scheme branch gone: primary src, then the ordered fallback chain"
      contains: "fallbackIndex"
    - path: src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
      provides: "Fallback-chain tests with no transport mock, http sources asserted raw, and the no-transport-import guard"
      contains: "stripSourceComments"
    - path: meta/backendDiCeilings/frontend-components-ui.json
      provides: "jestMock ceiling for CachedImage's test lowered 2 -> 1"
      contains: "\"src/frontend/components/UI/CachedImage/__tests__/index.test.tsx\": 1"
    - path: src/preload/tauriTransport.ts
      provides: "Transport module without the scheme-availability predicate or its doc comment"
      contains: "export async function invoke"
    - path: .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md
      provides: "Closed todo with its Resolution"
      contains: "## Resolution"
  key_links:
    - from: src/frontend/components/UI/CachedImage/index.tsx
      to: src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
      via: "the test calls the component directly and inspects the returned img element's src/className; the source guard reads index.tsx through stripSourceComments"
      pattern: "readFileSync\\(join\\(__dirname, '..', 'index.tsx'\\)"
    - from: meta/backendDiCeilings/frontend-components-ui.json
      to: src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
      via: "exact per-file jestMock count; a file below its entry fails the ratchet ('shrank: lower it in this commit')"
      pattern: "CachedImage/__tests__/index.test.tsx"
---

<objective>
Delete the renderer's dead image-cache URL-scheme branch. Phase 86 plan 05 (D-22) deleted the backend module that
once served the scheme, and the preload predicate guarding the branch is hard-coded `false` under Tauri, the only
shell. So `CachedImage` carries a branch that cannot run and has no server behind it even if the predicate flipped.

Purpose: remove the dead code and the comments that point at a deleted file, while keeping CachedImage's real
behaviour (render the src, fall back through `fallback` on error). The runtime path does not change: with the
predicate returning `false`, the old code already took exactly the path the new code takes.

Output: a scheme-free `CachedImage` and its rewritten tests, the predicate gone from `src/preload/tauriTransport.ts`,
the jestMock ratchet shard lowered to match, and the source todo moved to `completed/` with a Resolution.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md
@src/frontend/components/UI/CachedImage/index.tsx
@src/frontend/components/UI/CachedImage/__tests__/index.test.tsx

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence: the formatter section governs the
prettier checks below, and the todo-frontmatter section explains why `completed/` is exempt from the triage gate.

Facts measured at HEAD (bac11b689) while planning, so the executor does not need to re-derive them:

- References exist in exactly three files: `src/frontend/components/UI/CachedImage/index.tsx`, its
  `__tests__/index.test.tsx`, and `src/preload/tauriTransport.ts` (the predicate and its doc comment, lines 45-72).
  Nothing in `meta/`, no global type declaration, no preload API surface, no other test or mock names the predicate
  or the scheme. `graphify query` agrees: the predicate's only importer is CachedImage.
- `src/backend/__tests__/infoPortComplete.test.ts`, `src/backend/__tests__/diPhaseGates.test.ts` and
  `src/backend/testUtils/portSliceGate.ts` name the deleted backend file on purpose (the first pins that it stays
  deleted; the other two record the floor history). They are not part of this change and must not be edited.
- `meta/backendDiCeilings.cjs` is a shrink-only ratchet with exact per-file counts: a file BELOW its entry fails
  ("shrank: lower it in this commit"). `meta/backendDiCeilings/frontend-components-ui.json` holds CachedImage's test
  at 2 jest.mock calls (the transport mock and the react mock). Dropping the transport mock without lowering the
  entry to 1 turns the gate red. The shard gate reports `jestMock=90 (17 files)` at HEAD.
- `pnpm lint` uses ceilings as maximums (`maxWarnings`), so fewer warnings cannot fail it; scoped `npx eslint` over
  the touched files is clean at HEAD.
- All four written source/config paths are prettier-visible: `npx prettier --file-info` reports
  `{ "ignored": false, "inferredParser": "typescript" }` for the three .ts/.tsx files and
  `{ "ignored": false, "inferredParser": "json" }` for the shard. `src/preload/.prettierrc` sets printWidth 120 for
  `tauriTransport.ts`; prettier resolves that itself per path. The `.planning/` todo paths are prettier-ignored.
- Jest project names: `Frontend` (src/frontend), `Preload` (src/preload), `Backend` (src/backend), `Meta` (meta).
  CachedImage's suite runs 12 tests green at HEAD in under 1 s.

Working-tree hazard: quick task 261127-u6h has unrelated uncommitted edits in `src-tauri/` and `.planning/`
(including `.planning/state.json`). Stage every commit by explicit path with `git add <path>...`; never
`git add -A`, `git add .`, `git commit -a`, or a gsd-tools commit without `--files`. Before each commit, confirm
with `git diff --cached --name-only` that only this task's paths are staged.
</context>

<tasks>

<!-- planner-discipline-allow: imagecache -->
<!-- planner-discipline-allow: images_cache -->
<!-- planner-discipline-allow: usecache -->
<!-- planner-discipline-allow: useCache -->
<!-- planner-discipline-allow: shouldUseCache -->
<!-- planner-discipline-allow: imageCacheSchemeAvailable -->
<!-- planner-discipline-allow: tauriTransport -->

<task type="tracer" tdd="true">
  <name>Task 1: CachedImage renders its source as given and falls back in order, with no scheme branch</name>
  <files>src/frontend/components/UI/CachedImage/index.tsx, src/frontend/components/UI/CachedImage/__tests__/index.test.tsx, meta/backendDiCeilings/frontend-components-ui.json</files>
  <behavior>
    - An http primary src renders as the raw URL; the first error shows `fallback[0]` as its raw URL (no retry of the primary in between); the next error shows `fallback[1]`; a further error stays on the last entry.
    - A single-string fallback still behaves as a one-entry chain (existing test, unchanged).
    - A non-http src (a bundled asset path) renders as written.
    - A new `src` resets the chain to the primary and clears the usingFallback class (existing tests, unchanged).
    - The comment-stripped source of index.tsx contains no reference to the preload transport module, and does contain `fallbackIndex` (positive control, so an empty or mis-read source cannot pass).
  </behavior>
  <action>
    The end-to-end slice for this change: the one render path (component, its img element, its test harness and the ratchet gate that counts the test's mocks) with the dead branch removed.

    Test first (it starts red because index.tsx still imports from the transport):

    1. In `src/frontend/components/UI/CachedImage/__tests__/index.test.tsx`, delete the transport `jest.mock` block, the `mockImageCacheSchemeAvailable` jest.fn and the comment above them (lines 19-28), and the `beforeEach` that only set that mock's default (lines 30-32). Leave the `react` mock and its harness exactly as they are, including its existing comments.
    2. Delete the test `applies the imagecache retry step to each http source before advancing` (lines 169-191): it asserts the behaviour being removed.
    3. Replace the whole second `describe` (lines 220-294) with a `describe` for http sources that carries the cases in the behavior block: http primary renders raw and the first error advances straight to `fallback[0]`'s raw URL; the chain advances to `fallback[1]` and stays there on a further error; a non-http source renders as written. Assert with exact `toBe` equality on the URL. Do not write negative assertions against the old scheme prefix, and do not mention the scheme, the predicate or the deleted backend file in any test name or comment: an exact-equality check already fails if anything rewrites the URL.
    4. Rewrite the source-guard `describe` (lines 296-317) so its single test asserts that `stripSourceComments` of index.tsx does not match `/tauriTransport/` (the house shape `src/frontend/screens/Login/__tests__/index.test.tsx` line 249 uses) and does match `/fallbackIndex/` as a positive control. Rename the describe and test to say CachedImage makes no shell-capability decision and imports nothing from the preload transport. Drop the old comment about generalising the import-shape check.
    5. Run the suite and see the guard fail against the unchanged component.

    Then the component, `src/frontend/components/UI/CachedImage/index.tsx`:

    6. Delete the transport import (line 7) and the four-line comment above it about the relative specifier (lines 3-6); it explains only that import. The file then imports `useState` from react and `classNames`.
    7. Delete the scheme comment block and the `shouldUseCache` helper (lines 22-32).
    8. Delete the `useCache` state (line 43) and its reset inside the during-render src-change block (line 59). Keep the other three resets (stateSrc, loaded, fallbackIndex) and the comment explaining why the reset runs during render rather than in an effect.
    9. In `onError`, remove the first arm (the retry that existed only to recover from the scheme rewrite). The handler now computes the next fallback index and sets it when it is within `fallbacks.length` (bounded, never loops), then calls `props.onError`. Replace the two stale "if not cached" comments with one comment describing that advance. There is no other retry in this component, so nothing else is removed.
    10. Render the current source directly: the primary `props.src` while `fallbackIndex` is below 0, else `fallbacks[fallbackIndex]`, passed as the img `src` with no rewrite. Keep `loading="lazy"`, the `{...props}` spread order, `handleLoad`, and the className map (`loaded`, `loading`, `usingFallback`) unchanged.
    11. Do not rename the component or its directory: around fifteen importers use the name, and renaming is outside this todo. Write no replacement comment that names the removed scheme, the predicate or the deleted backend file.

    Then the ratchet: in `meta/backendDiCeilings/frontend-components-ui.json`, lower the `jestMock` entry for `src/frontend/components/UI/CachedImage/__tests__/index.test.tsx` from 2 to 1. Edit only that number; the gate has no update flag by design.

    Commit (explicit paths only, after `git diff --cached --name-only` shows exactly these three): `git add src/frontend/components/UI/CachedImage/index.tsx src/frontend/components/UI/CachedImage/__tests__/index.test.tsx meta/backendDiCeilings/frontend-components-ui.json`, subject `refactor(quick-261127-upb): CachedImage renders its source as given, with no cache-scheme branch`.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/CachedImage/__tests__/index.test.tsx && node meta/backendDiCeilings.cjs --shard frontend-components-ui && ! grep -niE 'imagecache|images_cache|usecache|tauriTransport' src/frontend/components/UI/CachedImage/index.tsx && ! grep -niE 'imagecache|images_cache|usecache' src/frontend/components/UI/CachedImage/__tests__/index.test.tsx && npx eslint src/frontend/components/UI/CachedImage/index.tsx src/frontend/components/UI/CachedImage/__tests__/index.test.tsx && npx prettier --file-info src/frontend/components/UI/CachedImage/index.tsx | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/frontend/components/UI/CachedImage/__tests__/index.test.tsx | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info meta/backendDiCeilings/frontend-components-ui.json | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/components/UI/CachedImage/index.tsx src/frontend/components/UI/CachedImage/__tests__/index.test.tsx meta/backendDiCeilings/frontend-components-ui.json</automated>
    Baselines: matching lines in index.tsx [HEAD=13 EXPECT==0]; matching lines in the test file [HEAD=25 EXPECT==0]; shard jestMock total, 17 files either side [HEAD=90 EXPECT==89]; Regression guards that already hold at HEAD and must keep holding (no bracket baseline, since they measure no change): the suite reports 0 failures and a nonzero test count (12 at HEAD). The jest run must report the suite's test count and 0 failures; a run reporting 0 tests is a failure. The red step (5) is evidence, not a gate: record its failing assertion in the SUMMARY.
  </verify>
  <done>CachedImage renders the current source unmodified and advances through `fallback` one entry per error, bounded at the last entry, calling the caller's onError each time; its test file has one jest.mock (react), asserts raw URLs with exact equality, and guards that index.tsx imports nothing from the preload transport; the shard reads 1 and its gate passes; formatter, eslint and the suite are green; one commit holding exactly the three paths.</done>
</task>

<task type="auto">
  <name>Task 2: Delete the scheme predicate from the preload transport and prove nothing else names it</name>
  <files>src/preload/tauriTransport.ts</files>
  <action>
    1. In `src/preload/tauriTransport.ts`, delete the `imageCacheSchemeAvailable` function and its whole JSDoc block (lines 45-72 at HEAD: from the doc comment opening "Whether the running shell registers..." through the function's closing brace), plus the one blank line that separated it, so the `invoke` docblock follows the imports with a single blank line. This also removes the comment naming `src/backend/images_cache.ts`. Leave the module header comment (lines 1-24) alone: it describes a different, earlier-deleted predicate and names nothing touched here.
    2. Sweep. `grep -rniE imagecache src/ meta/` must print nothing. `grep -rln images_cache src/` must list only the three backend deletion-gate files named in the context section; do not edit them (they pin and record the D-22 deletion). If either sweep finds anything else (a type declaration, a preload API surface, another test or mock), remove it in this task and add its path to the commit, and note the deviation in the SUMMARY.
    3. Run `graphify update .` so the local knowledge graph drops the deleted symbols (graphify-out is gitignored; nothing to stage). A failure here is noted in the SUMMARY, not a blocker.

    Commit (explicit path, after `git diff --cached --name-only` shows only it, plus any path step 2 forced): `git add src/preload/tauriTransport.ts`, subject `refactor(quick-261127-upb): drop the image-cache scheme predicate from the preload transport`.
  </action>
  <verify>
    <automated>! grep -rniE 'imagecache' src/ meta/ && [ "$(grep -rln 'images_cache' src/ | sort | tr '\n' ' ')" = "src/backend/__tests__/diPhaseGates.test.ts src/backend/__tests__/infoPortComplete.test.ts src/backend/testUtils/portSliceGate.ts " ] && pnpm -s codecheck && npx jest --selectProjects Frontend Preload Backend Meta --runTestsByPath src/frontend/components/UI/CachedImage/__tests__/index.test.tsx src/preload/__tests__/tauriTransport.test.ts src/backend/sidecar/__tests__/rendererAllowList.test.ts meta/__tests__/isTauriRemoved.test.ts && node meta/backendDiCeilings.cjs && npx eslint src/preload/tauriTransport.ts && npx prettier --file-info src/preload/tauriTransport.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/preload/tauriTransport.ts</automated>
    Baselines: lines naming `imagecache` under src/ and meta/ [HEAD=35 EXPECT==0]; files under src/ naming `images_cache`, which must be exactly the three backend gate files [HEAD=5 EXPECT==3]; full ratchet jestMock total, 365 files either side [HEAD=1583 EXPECT==1582]; Regression guards that already hold at HEAD and must keep holding: 0 failures across the four suites and a nonzero test count (74 at HEAD). `rendererAllowList.test.ts` and `isTauriRemoved.test.ts` read `tauriTransport.ts` as source text, which is why they run here.
  </verify>
  <done>`src/preload/tauriTransport.ts` no longer exports or documents the scheme predicate; no file under src/ or meta/ names the scheme; only the three backend deletion gates still name the deleted backend file; typecheck, the full jestMock ratchet, eslint, prettier and the four suites are green; one commit holding only the transport file (or the paths the sweep forced, each named in the SUMMARY).</done>
</task>

<task type="auto">
  <name>Task 3: Close the source todo with a Resolution</name>
  <files>.planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md, .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md</files>
  <action>
    1. Move the todo with history: `git mv .planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md`. Keep its frontmatter and its Problem and Direction sections byte for byte.
    2. Append a section headed `## Resolution (2026-11-27): the scheme branch is deleted` in the shape the most recent completed quick todos use (`.planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md` is one). Wrap at about 115 columns like the rest of the file. Say, in plain prose:
       - what was removed from CachedImage (the scheme state, the rewrite, and the retry that only recovered from it) and that the predicate and its doc comment are gone from the preload transport;
       - that the fallback chain, the per-src reset and the caller's onError are unchanged, and the tests now assert raw URLs plus a guard that CachedImage imports nothing from the preload transport;
       - that the jestMock ratchet entry for the test went 2 to 1;
       - which files still name the deleted backend module, and why that is intended (the D-22 deletion gate and floor-history notes);
       - how the Direction's library-render check was met: the predicate was hard-coded false under Tauri, so the old runtime path was already exactly the new one, and the rewritten unit tests drive that path (primary, then each fallback in order, bounded). Say plainly that this was verified by tests, not by a live library render;
       - the two fix commits, by subject, because the branch may be rebased on merge.
    3. Run `pnpm planning-gates`. `completed/` is exempt from the triage-frontmatter gate, and the move takes a file out of `pending/`, so the count stays 12/12.

    Commit (explicit paths only; `git mv` already staged both sides, so add only the edited completed file, and confirm with `git diff --cached --name-only` that exactly the pending deletion and the completed file are staged, with `.planning/state.json` and the other quick task's paths NOT staged): `git add .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md`, subject `docs(quick-261127-upb): close the dead image-cache scheme branch todo`. Do not use a gsd-tools commit for this; if one is used anywhere later, it must carry `--files`.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md && grep -q '^## Resolution (2026-11-27)' .planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md && pnpm -s planning-gates</automated>
    Baselines: pending copies of this todo [HEAD=1 EXPECT==0]; Resolution headings in the completed file [HEAD=0 EXPECT==1]. Regression guard, already true at HEAD: `pnpm planning-gates` stays at 12/12. Formatter check omitted on purpose: both paths are under `.planning/`, which `npx prettier --file-info` reports as `{ "ignored": true, "inferredParser": null }`, so `--check` would be vacuous there (gamelib-conventions, formatter section). Match the file's existing wrap by hand instead.
  </verify>
  <done>The todo is in `.planning/todos/completed/` with its original frontmatter and a dated Resolution covering what was removed, what was kept, the ratchet change, the intended remaining backend mentions, the tests-not-live verification and both fix commits; `pnpm planning-gates` is 12/12; one docs commit holding only the move.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote art host -> renderer img | Cover-art URLs from store metadata are loaded by the webview's img element; unchanged by this plan |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-261127-upb-01 | Tampering | CachedImage img src | low | accept | No new input path: the source was already passed raw under Tauri (the predicate returned false), so removing the rewrite changes no request the webview makes. The webview's own CSP still governs which hosts load. |
| T-quick-261127-upb-02 | Denial of Service | CachedImage onError chain | low | mitigate | The fallback advance stays bounded by `fallbacks.length` (never loops); Task 1's tests assert the chain stops at the last entry under repeated errors. |
| T-quick-261127-upb-03 | Repudiation | shared working tree with quick 261127-u6h | low | mitigate | Every commit stages explicit paths and checks `git diff --cached --name-only` first, so no commit attributes the other task's uncommitted src-tauri/ or .planning/ edits to this one. |
| T-quick-261127-upb-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed, added or upgraded by this plan; the legitimacy gate has nothing to inspect. |
</threat_model>

<verification>
- `npx jest --selectProjects Frontend Preload Backend Meta --runTestsByPath src/frontend/components/UI/CachedImage/__tests__/index.test.tsx src/preload/__tests__/tauriTransport.test.ts src/backend/sidecar/__tests__/rendererAllowList.test.ts meta/__tests__/isTauriRemoved.test.ts` is green with nonzero test counts.
- `pnpm -s codecheck` and `node meta/backendDiCeilings.cjs` pass.
- `grep -rniE imagecache src/ meta/` prints nothing; `grep -rln images_cache src/` lists only the three backend gate files.
- `npx prettier --check` over the four source/config paths written (after `--file-info` shows each not ignored) passes.
- `pnpm planning-gates` is 12/12.
- `git log -3 --stat` shows three commits holding only this plan's paths; `git status` still shows the other quick task's src-tauri/ and .planning/ edits unstaged and untouched.
- Optional operator spot-check, not a gate: under `pnpm tauri:dev`, the Library grid loads covers and a game with missing art shows its fallback. It is optional because the removed branch could not run under Tauri; the runtime path before and after is the same one the Task 1 tests drive.
</verification>

<success_criteria>
- CachedImage has no scheme state, rewrite or scheme retry, and still renders the src and falls back through `fallback` in order, bounded, calling the caller's onError.
- The predicate and its doc comment are gone from `src/preload/tauriTransport.ts`; no renderer or preload file names the scheme or the deleted backend module.
- The jestMock ratchet shard is lowered in the same commit as the removed mock, and the full ratchet passes.
- The todo is closed in `completed/` with a Resolution, and planning gates are 12/12.
- No file belonging to quick task 261127-u6h is staged or committed by this plan.
</success_criteria>

<output>
Create `.planning/quick/261127-upb-remove-dead-imagecache-scheme-branch-in-/261127-upb-SUMMARY.md` when done. Record the
red-step failure from Task 1, the measured gate outputs (suite counts, ratchet totals, sweep results), both fix
commit hashes and subjects, and whether `graphify update .` ran. When the quick workflow commits this SUMMARY,
PLAN and STATE, the commit must use `--files` with explicit paths: `.planning/state.json` and other `.planning/`
files carry quick task 261127-u6h's uncommitted edits.
</output>
