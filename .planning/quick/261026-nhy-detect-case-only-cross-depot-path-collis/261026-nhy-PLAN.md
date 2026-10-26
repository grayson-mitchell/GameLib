---
phase: quick-261026-nhy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/pathCollisions.ts
  - src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
  - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
autonomous: true
requirements:
  - TODO-2026-10-25-case-only-cross-depot-path-collisions
must_haves:
  truths:
    - "On a case-insensitive destination volume, two depots claiming `californium.app/X` and `Californium.app/X` are detected as ONE collision and resolved by the existing same-owner appinfo-rank rule"
    - "A cross-owner case-only pair (Wasteland 3: 719042/owner 719040 vs 1522651/owner 1522650) stays UNRESOLVED, and verifyStructuralIntegrity passes it when the on-disk file is sha1-identical to one claim instead of failing closed to StateFlags=1026"
    - "On a case-sensitive volume (and with the option unset) behaviour is byte-identical to today: `Master.dat` vs `master.dat` is not a collision"
    - "Two bare directory markers on one (folded or exact) path are not reported UNRESOLVED and log no warning"
    - "Every collision found only under case folding logs both spellings"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/pathCollisions.ts"
      provides: "pathCollisionKey, probeCaseInsensitiveVolume, resolveDepotPathCollisions(plan, { caseInsensitive })"
      exports: ["resolveDepotPathCollisions", "pathCollisionKey", "probeCaseInsensitiveVolume"]
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "DepotPlan.caseInsensitivePaths set once by buildDepotPlan"
      contains: "caseInsensitivePaths"
    - path: "src/backend/storeManagers/steam/depot/reconcile.ts"
      provides: "contentClaims keyed by pathCollisionKey(filename, plan.caseInsensitivePaths)"
      contains: "pathCollisionKey"
  key_links:
    - from: "src/backend/storeManagers/steam/depot.ts buildDepotPlan"
      to: "probeCaseInsensitiveVolume(opts.targetSteamappsDir)"
      via: "single await before resolveDepotPathCollisions"
      pattern: "probeCaseInsensitiveVolume\\(opts\\.targetSteamappsDir"
    - from: "src/backend/storeManagers/steam/depot/reconcile.ts verifyStructuralIntegrity"
      to: "pathCollisionKey"
      via: "contentClaims build AND rivals lookup use the same key function"
      pattern: "pathCollisionKey\\("
---

<objective>
Detect cross-depot path collisions that differ only in letter case when (and only when) the
destination volume is case-insensitive, apply the existing winner / UNRESOLVED rules to the
case-folded buckets, and make the post-download structural verifier key its collision claims the
same way so an UNRESOLVED case-only collision gets the sha1 "content actually written" fallback
instead of StateFlags=1026.

Purpose: actions `.planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md`
(Wasteland 3 198 collisions, Californium 53, Civ V 4). Builds on the completed predecessor
`.planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`.
Output: updated pathCollisions.ts / depot.ts / reconcile.ts with tests. The live gate (Californium
or Civ V reinstall) is NOT executed here — the SUMMARY records it as a pending operator check, and
the todo file stays in `pending/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md
@src/backend/storeManagers/steam/depot/pathCollisions.ts
@src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts

<interfaces>
Facts gathered at planning time (executor need not re-derive):

- pathCollisions.ts (213 lines): private `normalizePath(filename)` = `filename.replace(/\\/g, '/')`
  at L65 with the "Deliberately CASE-SENSITIVE" comment at L54-64. `resolveDepotPathCollisions(plan:
  Pick<DepotPlan,'appId'|'depots'>): PathCollisionReport` builds `byPath` keyed by normalizePath
  (L106), then per bucket: (a) emptyDirs>0 && content===1 -> drop dirs, resolved; (b) all-content,
  same owner, distinct known appinfoRank -> later rank wins, losers dropped, resolved; (c) else
  UNRESOLVED + logWarning. Report entries are the bucket key `path`. Imports only `backend/logger`
  at runtime plus TYPES from '../depot'.
- Today two bare dir markers on one exact path fall through to (c): the test at
  pathCollisions.test.ts ~L163 ("a directory entry in ONE depot with the same name as a directory in
  another is not a conflict to resolve") expects `report.unresolved` = `['data']`, and an UNRESOLVED
  warning is logged for every shared directory.
- The CASE-SENSITIVE test is at pathCollisions.test.ts ~L194 (Master.dat dir vs master.dat file ->
  empty report, nothing dropped). Tests are jest; helpers `plan([...])`, `dirEntry`, `fileEntry(name,
  size, chunks?)`, `names(p, i)`; logger is jest.mock'ed.
- depot.ts: `DepotPlan` interface at ~L256 (fields appId, depots, totalBytes, name, buildid?,
  skippedDepots). `DepotPlanEntry` carries `ownerAppId?` and `appinfoRank?` (~L241-247).
  `buildDepotPlan(appId, opts: DownloadSteamDepotsOpts)` (~L763); `opts.targetSteamappsDir: string`
  (type at ~L199). Single collision call at ~L940:
  `totalBytes -= resolveDepotPathCollisions({ appId, depots }).droppedBytes`; the `const plan:
  DepotPlan = {...}` literal follows at ~L945.
- Serialization boundary: NONE for this field. The "flags-dropping serialization boundary" comments
  (~L851/955/2882) are the 23-06 census hypothesis H5; the plan is passed in-process — every caller
  (`buildDepotPlan` at ~L1024, ~L4126, ~L4261 -> `downloadDepotFiles(plan, …)` ~L4324) uses the
  object buildDepotPlan returned, and `verifyStructuralIntegrity(plan, installRoot)` is called only
  from downloadDepotFiles (~L3622). A resume rebuilds the plan via buildDepotPlan, so the field is
  recomputed every run. Note one call (~L1358) builds with `targetSteamappsDir: opts.cacheSteamappsDir`
  — the probe then probes that dir, which is the correct volume for that plan.
- reconcile.ts: imports `{ lstat, readlink, stat } from 'node:fs/promises'`, `{ sha1File,
  resolveContainedPath } from '../depot'`, types from '../depot'. In verifyStructuralIntegrity
  (~L290) `contentClaims` is built with `file.filename.replace(/\\/g, '/')` (~L325) and looked up the
  same way (~L360) for the `matchesAnyClaim` fallback, which fires only when `shape.reason ===
  'wrong-size'`.
- reconcilePartialState (~L187): iterates every file independently, no per-path map, no case
  assumption. A collided path (exact OR case-only) has one claim that can never sha1-verify, so it is
  re-queued on each resume — a pre-existing limitation shared with exact-case UNRESOLVED collisions,
  not the case-keying defect. Do NOT change it; record it in the SUMMARY.
- reconcile.test.ts: `makePlan(depots)` at ~L65; collision suite
  `describe('cross-depot file collisions (debug/cross-depot-collision-1026)')` at ~L411 with
  `claim(content)`, `sha1Hex`, a tmp `dir`, `mkdirSync`/`writeFileSync`.
- Prettier: all five files report `"ignored": false` under `npx prettier --file-info`, so the
  scoped `--check` is meaningful.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Case-folded collision key, volume probe, and folded buckets in pathCollisions.ts</name>
  <files>src/backend/storeManagers/steam/depot/pathCollisions.ts, src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts</files>
  <behavior>
    - Existing CASE-SENSITIVE test (~L194) unchanged and still passes with no option and with `{ caseInsensitive: false }`.
    - Mirror test: `{ caseInsensitive: true }`, dir `Master.dat` (depot a) vs file `master.dat` 333177805/318 (depot b) -> resolved length 1, depot a's marker dropped, depot b's file kept.
    - Folded same-owner pair (Californium shape): depot 402062 rank 0 file `californium.app/Contents/Resources/Data/level2` size 61884 vs depot 402064 rank 1 `Californium.app/...` size 61924, both ownerAppId 402060, caseInsensitive true -> 402064 wins, droppedBytes 61884; with caseInsensitive false -> empty report, nothing dropped.
    - Folded cross-owner pair (Wasteland 3 shape): 719042/owner 719040 `WL3.app/a/24044905.wem` 10355 vs 1522651/owner 1522650 `wl3.app/a/24044905.wem` 19564, caseInsensitive true -> unresolved length 1, nothing dropped, the UNRESOLVED warning contains BOTH spellings.
    - Two bare dir markers `WL3.app` / `wl3.app` (caseInsensitive true) and two exact `data` / `data` markers (either mode) -> resolved [], unresolved [], logWarning not called.
    - pathCollisionKey('A\\B.txt', false) === 'A/B.txt'; pathCollisionKey('A\\B.txt', true) === 'a/b.txt'.
    - probeCaseInsensitiveVolume with injected stat: same dev+ino for swapped spelling -> true; swapped ENOENT -> false; different ino -> false; original ENOENT, last segment with no letters (e.g. '/x/123'), or EACCES -> platform fallback (injected 'linux' -> false, 'darwin' -> true, 'win32' -> true).
  </behavior>
  <action>
Per locked decision 1, add an exported `pathCollisionKey(filename: string, caseInsensitive: boolean): string` that does the existing `\`→`/` normalisation and, when caseInsensitive, `.toLowerCase()`s the result. Replace the private `normalizePath` with it (or keep normalizePath as its first step) and rewrite the L54-64 comment: drop the now-false "Deliberately CASE-SENSITIVE" claim and state the conditional rule — folding happens only when the destination volume is case-insensitive (APFS/NTFS defaults, Wine bottles on them), because there two differently-cased claims write one file; on case-sensitive Linux volumes they legitimately coexist, so folding there would invent collisions. Cite the 2026-10-25 scan (Wasteland 3 198, Californium 53, Civ V 4).

Give `resolveDepotPathCollisions` a second optional parameter `opts: { caseInsensitive?: boolean } = {}` (default false so every existing caller and test keeps today's behaviour) and key `byPath` with `pathCollisionKey(file.filename, !!opts.caseInsensitive)`. Per locked decision 3 the Directory-marker-vs-file rule, the same-owner/distinct-rank winner rule and the UNRESOLVED fallback are unchanged — they simply run on the folded buckets. For report entries and log text use the first claim's un-folded normalised spelling (`pathCollisionKey(claims[0].file.filename, false)`), so case-sensitive mode output is byte-identical to today.

Planner's choice for locked decision 3 (dir markers): add an explicit early branch before the existing rules — when every claim in a bucket is an `isEmptyDirectoryEntry`, `continue` silently (not resolved, not unresolved, no log), because one mkdir satisfies all of them on either volume type. Apply it in BOTH modes so the folded case behaves identically to the exact case; this changes today's exact-case behaviour, which reported such a bucket UNRESOLVED and logged a warning per shared directory, contradicting its own test's name. Update the ~L163 test's expectation to `unresolved: []` and assert logWarning was not called, and say in a comment why. Nothing on disk changes: unresolved was log-only (the sole caller uses only `droppedBytes`).

Per locked decision 5, when a bucket's claims carry more than one distinct un-folded spelling, every log line for that bucket (Directory-vs-file, RESOLVED, UNRESOLVED) appends a suffix such as ` [case-only collision on a case-insensitive volume: "WL3.app/…" vs "wl3.app/…"]` listing each distinct spelling with its depot id.

Per locked decision 2, add an exported `probeCaseInsensitiveVolume(dir: string, deps: { stat?: typeof import('node:fs/promises').stat; platform?: NodeJS.Platform } = {})` returning `Promise<boolean>`. It is read-only — never create a file. Take `basename(dir)`, swap the case of each letter. If the swapped string equals the original (no letters), the result is inconclusive. Otherwise stat `dir`, then stat `join(dirname(dir), swapped)`: if both succeed with equal `dev` and `ino`, return true; if the second fails ENOENT, or both succeed with a different ino, return false. Any other outcome is inconclusive (the original missing, EACCES, anything thrown). Inconclusive returns `(deps.platform ?? process.platform) !== 'linux'`. Import `stat` from 'node:fs/promises' and `basename`/`dirname`/`join` from 'node:path'. The test file mocks only the logger, which is fine because tests inject `stat` and never hit the real fs. Give it a doc comment in the file's style that says why it is read-only and why linux is the fallback. Both new exports have real importers (Task 2), so the dead-code export note at L35-37 stays true.

Write the behavior tests first (RED), then implement (GREEN). Put the new cases in a new `describe('case-insensitive volumes (quick 261026-nhy)')` block plus a `describe('probeCaseInsensitiveVolume')` block, matching the existing describe/it naming style.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts && npx eslint src/backend/storeManagers/steam/depot/pathCollisions.ts src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts && npx prettier --check src/backend/storeManagers/steam/depot/pathCollisions.ts src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts</automated>
  </verify>
  <done>All pathCollisions tests pass, including the unchanged ~L194 CASE-SENSITIVE test, its caseInsensitive mirror, the Californium/Wasteland 3 shapes, the dir-marker silence and the probe matrix. `grep -n "Deliberately CASE-SENSITIVE" src/backend/storeManagers/steam/depot/pathCollisions.ts` returns nothing. eslint and scoped prettier are clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Carry the decision on DepotPlan and fold the structural verifier's claim key</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/depot/reconcile.ts, src/backend/storeManagers/steam/__tests__/reconcile.test.ts</files>
  <behavior>
    - Inside the existing collision describe (~L411): a plan with two content claims `Data\\Level2` (content a) and `data\\level2` (content b) in two depots, `caseInsensitivePaths: true`, and the on-disk file written once at `Data/Level2` with content b -> `ok === true`; the same plan with `caseInsensitivePaths` unset -> `ok === false` (proves the flag drives the fallback). Both are gated on the tmp dir actually folding case (write `dir/CaseProbe`, then check `existsSync(join(dir, 'caseprobe'))`). Where it does not fold, return early with a comment: a case-sensitive fs cannot host a case-only collision, so the cases are meaningless there.
    - Existing collision tests (exact-case XCOM shape, flag unset) still pass unchanged.
  </behavior>
  <action>
Per locked decision 4, in depot.ts add an optional `caseInsensitivePaths?: boolean` field to `interface DepotPlan` with a doc comment in the surrounding style. It records whether buildDepotPlan judged the destination volume case-insensitive, and both resolveDepotPathCollisions and verifyStructuralIntegrity's collision fallback must key paths the same way. It is optional so existing test fixtures and construction sites compile, and absent means case-sensitive. It is recomputed on every buildDepotPlan, so a resume never carries a stale value, and the plan crosses no serialization boundary (it is handed in-process to downloadDepotFiles).

In buildDepotPlan, just before the ~L940 call, run `const caseInsensitivePaths = await probeCaseInsensitiveVolume(opts.targetSteamappsDir)` exactly once and log it at logInfo, e.g. `buildDepotPlan: appId=… destination volume case-insensitive=… (probed <dir>)`. Pass `{ caseInsensitive: caseInsensitivePaths }` as the second argument to resolveDepotPathCollisions, and set `caseInsensitivePaths` on the `const plan: DepotPlan` literal. Import `probeCaseInsensitiveVolume` alongside the existing `resolveDepotPathCollisions` import (~L80). Update the ~L934-939 comment so it mentions the case-folded mode. The probe must not throw: it already absorbs errors into the platform fallback, so do not wrap it in a try that could fail the plan.

In reconcile.ts, import `pathCollisionKey` from './pathCollisions'. This is safe: that module's only runtime import is backend/logger, so there is no cycle with '../depot'. Replace BOTH the contentClaims build key (~L325) and the rivals lookup (~L360) with `pathCollisionKey(file.filename, !!plan.caseInsensitivePaths)`, which keeps them identical by construction. Extend the cross-depot comment block (~L308-315 and the function doc ~L275-283) to say the key is case-folded when the plan says the volume is case-insensitive. Give the Wasteland 3 example: 719042 vs 1522651 are cross-owner, so they stay UNRESOLVED and land in this fallback. Leave reconcilePartialState unchanged. It has no per-path map and no case assumption, and its re-queueing of a collided path on resume is the pre-existing limitation it shares with exact-case collisions. Note that in the SUMMARY rather than fixing it here.

Write the reconcile behavior tests first (RED against the unchanged reconcile.ts), then implement. `makePlan` returns a DepotPlan, so set the flag with a spread (`{ ...makePlan([...]), caseInsensitivePaths: true }`).

In the SUMMARY, record as pending operator checks: (1) the live gate, a Californium (402060) or Civ V (8930) reinstall on this Mac, expecting the `case-only collision` log lines and StateFlags=4; (2) the todo stays in `.planning/todos/pending/` until that gate passes; (3) the reconcilePartialState resume-requeue note above.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/reconcile.test.ts src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts && npx tsc --noEmit && npx eslint src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/depot/reconcile.ts src/backend/storeManagers/steam/__tests__/reconcile.test.ts && npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/depot/reconcile.ts src/backend/storeManagers/steam/__tests__/reconcile.test.ts</automated>
  </verify>
  <done>`grep -c "pathCollisionKey(" src/backend/storeManagers/steam/depot/reconcile.ts` is 2 and no `filename.replace(/\\\\/g, '/')` remains in verifyStructuralIntegrity. buildDepotPlan probes once and sets `caseInsensitivePaths` on the plan. The reconcile and pathCollisions suites pass (the folded cases actually run on this macOS tmp dir). `tsc --noEmit`, eslint and scoped prettier are clean. The SUMMARY lists the live gate as pending.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam manifest -> plan | Depot filenames come from Valve-signed but untrusted-shape manifest data |
| plan -> filesystem | Paths are written/stat'ed under installRoot via resolveContainedPath |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nhy-01 | Tampering | verifyStructuralIntegrity folded fallback | mitigate | Fallback still requires whole-file sha1 equality with one claim (`matchesAnyClaim`); folding only widens WHICH claims are rivals, never accepts unmatched content |
| T-nhy-02 | Tampering | probeCaseInsensitiveVolume | mitigate | Read-only (two stat calls, no writes); errors degrade to the platform default, never throw into plan build |
| T-nhy-03 | Elevation | path containment | accept | Keys are comparison-only; every write/stat still goes through resolveContainedPath unchanged, so PathTraversalError behaviour is untouched |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts src/backend/storeManagers/steam/__tests__/reconcile.test.ts` green
- `npx tsc --noEmit` clean
- Scoped eslint + `npx prettier --check` over the five written paths clean
- Default (option unset / caseInsensitive false) output identical to before, except the deliberate dir-marker silence documented in Task 1
</verification>

<success_criteria>
- Case-only collisions are detected exactly when the destination volume folds case, and resolved or reported by the unchanged rules
- The structural verifier uses the same key, so Wasteland 3-shape UNRESOLVED pairs take the sha1 fallback instead of 1026
- Live gate recorded as pending in the SUMMARY; todo left in pending/
</success_criteria>

<output>
Create `.planning/quick/261026-nhy-detect-case-only-cross-depot-path-collis/261026-nhy-SUMMARY.md` when done
</output>
