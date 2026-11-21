---
phase: quick-261121-kqt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
autonomous: true
requirements:
  - QUICK-261121-kqt

estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 1
  confidence: low

must_haves:
  truths:
    - "`pnpm codecheck` still type-checks both projects (`src/` via tsconfig.json, `meta/` via tsconfig.meta.json), now incrementally, writing node_modules/.cache/tsc-main.tsbuildinfo and node_modules/.cache/tsc-meta.tsbuildinfo"
    - "A warm `pnpm codecheck` with no source change exits 0 in at most half the wall time of the cold run before it (measured at planning with the same two tsc commands into a scratch dir: 14s cold, 3s warm, both exit 0)"
    - "Incremental does not mask errors: a type error written after a warm run fails the next `pnpm codecheck` AND a repeated run with no further change, with the error naming the file, in BOTH the src project and the meta project; removing the error returns exit 0"
    - "A missing node_modules/.cache directory does not break codecheck: tsc creates the buildinfo directory itself (proved at planning with a nested absent directory). CI is always a cold run, because .github/actions/install-deps caches the pnpm store, not node_modules"
    - "tsconfig.json and tsconfig.meta.json are unchanged; tsconfig.meta.json still declares no compilerOptions, and meta/__tests__/tsconfigMeta.test.ts still passes 7/7 without being edited"
  artifacts:
    - path: package.json
      provides: "codecheck script with --incremental and a per-project --tsBuildInfoFile on each tsc invocation"
      contains: "--tsBuildInfoFile node_modules/.cache/tsc-meta.tsbuildinfo"
  key_links:
    - from: package.json
      to: meta/__tests__/tsconfigMeta.test.ts
      via: "regexes /tsc --noEmit/ and /tsc -p tsconfig\\.meta\\.json --noEmit/ over scripts.codecheck; the new flags go AFTER --noEmit so both still match"
    - from: package.json
      to: .github/workflows/codecheck.yml
      via: "`run: pnpm codecheck` (also .husky/pre-push line 2); no workflow or hook edit, they reach the script by name"
---

<objective>
Make `pnpm codecheck` incremental. Append `--incremental --tsBuildInfoFile node_modules/.cache/tsc-main.tsbuildinfo` to the first tsc invocation and `--incremental --tsBuildInfoFile node_modules/.cache/tsc-meta.tsbuildinfo` to the second (`tsc -p tsconfig.meta.json --noEmit`) in package.json's `"codecheck"` script.

Purpose: `pnpm codecheck` runs on every pre-push, on every executor verify and on every hand-run typecheck. The orchestrator measured 43s today; the planner measured 14s cold and 3s warm with these flags. That saving is worth having only if a warm run still catches every type error, so the verify proves non-masking in both projects, not just speed.

Output: one changed line in package.json. Two .tsbuildinfo files under the gitignored node_modules/.cache/ appear as a side effect of running it and are never committed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@meta/__tests__/tsconfigMeta.test.ts

Grounding gathered at planning (2026-11-21, TypeScript 5.8.3, prettier 3.7.4):
- package.json line 40 today: `"codecheck": "tsc --noEmit && tsc -p tsconfig.meta.json --noEmit"`.
- The one test that reads `scripts.codecheck` is meta/__tests__/tsconfigMeta.test.ts lines 96-113. It pins with substring regexes `/tsc --noEmit/` and `/tsc -p tsconfig\.meta\.json --noEmit/`, not the exact string, and it passes 7/7 at HEAD. Other meta tests (steamLineCeilingWiring, backendDiCeilingsWiring, gameInfoNarrowingWiring, boundaryWiring, planningGatesWiring) match the literal `pnpm codecheck` in .husky/pre-push and .github/workflows/codecheck.yml. They do not read the script body, so this change leaves them alone.
- Neither tsconfig.json (include `["src"]`) nor tsconfig.meta.json (extends tsconfig.json, include `["meta", "src/common/typedefs/*.d.ts"]`, no compilerOptions) sets `incremental` or `tsBuildInfoFile`.
- .gitignore line 4 is `/node_modules`. node_modules/.cache/ already exists locally and holds `boundary-ratchet-backend`, `boundary-ratchet-frontend` and `jiti/`, which belong to other tools and must not be deleted.
- `npx prettier --file-info package.json` prints `{ "ignored": false, "inferredParser": "json-stringify" }`, so prettier sees package.json and the formatter check is real, not vacuous. `npx prettier --check package.json` passes at HEAD.
- Warm-run error semantics were proved in a scratch TS project with the installed tsc: an error written after a warm run fails the next run (exit 2), a repeat run with no change prints the same TS2322 again, and reverting returns exit 0.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Make both codecheck tsc invocations incremental, and prove a warm run is faster and still catches errors in both projects</name>
  <files>package.json</files>
  <precondition>`pnpm codecheck` exits 0 on the working tree before the edit. The tree has unrelated in-progress edits (for example src/backend/storeManagers/steam/bridge/helperProcess.ts and protocol.ts); if they currently fail the typecheck, halt and report it rather than touching those files.</precondition>
  <action>
Edit exactly one line in package.json, the `"codecheck"` script. Its value must become exactly:
`tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-main.tsbuildinfo && tsc -p tsconfig.meta.json --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-meta.tsbuildinfo`

Three constraints, each with its reason:
- Put the new flags AFTER `--noEmit` in both invocations. meta/__tests__/tsconfigMeta.test.ts matches `/tsc --noEmit/` and `/tsc -p tsconfig\.meta\.json --noEmit/` against the script. Flags placed before `--noEmit` would split those substrings and turn the test red. Placed after, both regexes still match, so the test needs no edit.
- Put the flags on the command line, not in tsconfig.json or tsconfig.meta.json. tsconfig.meta.json extends tsconfig.json, so a `tsBuildInfoFile` set in tsconfig.json would be inherited by the meta project and both projects would write one buildinfo file. Each project needs its own file, which is the reason for `tsc-main` and `tsc-meta`. tsconfigMeta.test.ts also guards that tsconfig.meta.json declares no compilerOptions. And ts-jest, eslint and editors read tsconfig.json, so the setting would reach well beyond codecheck.
- Change nothing else: no other script, no .github/workflows file, no .husky hook. They all call `pnpm codecheck` by name. Leave .github/copilot-instructions.md lines 66-70 unchanged too: their description of what codecheck checks, and their claim that tsconfig.meta.json has no compilerOptions, are still true.

tsc creates the node_modules/.cache/ directory when it is missing, so a fresh clone or a CI runner (always cold, because install-deps caches the pnpm store and not node_modules) works with no setup step.

Then run the verify gates in order (each line is numbered in its trailing comment). Gates 6 and 7 write a temporary probe file: first src/common/kqtIncrementalProbe.ts, then meta/kqtIncrementalProbe.ts. Each gate removes its own probe on every path. Neither probe is ever staged or committed. Gate 4 deletes only the two tsc-*.tsbuildinfo files, never node_modules/.cache/ itself.

Commit with `git add package.json` only. Never use `git add -A` or `git add .`: the working tree carries unrelated dirty files, including native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/*, public/locales/en/gamelib.json, .planning/state.json, .planning/debug/*, .planning/spikes/*, .planning/todos/*, .planning/phases/82-*/82-20-PLAN.md and the root `Schedule I Free Sample.dxvk-cache`. Commit message: `chore(quick-261121-kqt): enable incremental tsc in codecheck`.
  </action>
  <verify>
    <automated>Run each line from the checkout root, in order. Every line must exit 0, and the two grep -c lines must print 1. The trailing comment on each line records what it printed or exited with at planning (HEAD fcf452fc9, working tree as of 2026-11-21) and what it must give after the task; an exit-code gate that fails is written error:<code>. Gates 4, 6 and 7 build, so the planner did not run them at HEAD; their HEAD values are derived as stated.
node -e "const s=require('./package.json').scripts.codecheck,e='tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-main.tsbuildinfo && tsc -p tsconfig.meta.json --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-meta.tsbuildinfo';if(s!==e){console.error('codecheck is: '+s);process.exit(1)}"   # gate 1, exact script string [HEAD=error:1 EXPECT==0 @fcf452fc9]
pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/tsconfigMeta.test.ts   # gate 2, tests passed, a regression guard [HEAD=7 EXPECT==7 @fcf452fc9 GUARD MUTATION: put the new flags before --noEmit (tsc --incremental ... --noEmit) and the /tsc --noEmit/ assertion fails]
npx prettier --file-info package.json | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check package.json   # gate 3, the formatter check; at HEAD file-info printed { "ignored": false, "inferredParser": "json-stringify" }, so it is not vacuous [HEAD=0 EXPECT==0 @fcf452fc9 GUARD MUTATION: re-indent the codecheck line to 4 spaces and --check exits 1]
( rm -f node_modules/.cache/tsc-main.tsbuildinfo node_modules/.cache/tsc-meta.tsbuildinfo && t0=$(date +%s) && pnpm codecheck && t1=$(date +%s) && pnpm codecheck && t2=$(date +%s) && c=$((t1-t0)) && w=$((t2-t1)) && echo "cold=${c}s warm=${w}s" && test -s node_modules/.cache/tsc-main.tsbuildinfo && test -s node_modules/.cache/tsc-meta.tsbuildinfo && [ $((w*2)) -le "$c" ] )   # gate 4, cold then warm. HEAD is derived: without --incremental tsc writes no buildinfo, and ls node_modules/.cache/*.tsbuildinfo matched nothing at planning, so test -s fails. The planner ran the same two tsc commands into a scratch dir: cold 14s, warm 3s [HEAD=error:1 EXPECT==0 @fcf452fc9]
( D=$(mktemp -d) && npx tsc -p tsconfig.meta.json --noEmit --incremental --tsBuildInfoFile "$D/absent/sub/x.tsbuildinfo" && test -s "$D/absent/sub/x.tsbuildinfo"; r=$?; rm -rf "$D"; exit $r )   # gate 5, tsc creates a missing cache directory. It does not depend on the edit, so it already passes; the planner's run wrote a 392688-byte file into a directory that did not exist [HEAD=0 EXPECT==0 @fcf452fc9 GUARD MUTATION: make $D/absent a regular file first (touch "$D/absent") so the directory cannot be created, and test -s fails]
( P=src/kqtIncrementalProbe.ts; L=$(mktemp); { printf 'export const kqtIncrementalProbe: number = 1\n' > "$P" && pnpm codecheck > "$L" 2>&1; } || { echo "clean probe run failed"; cat "$L"; rm -f "$P" "$L"; exit 1; }; printf "export const kqtIncrementalProbe: number = 'x'\n" > "$P"; pnpm codecheck > "$L" 2>&1; r1=$?; pnpm codecheck >> "$L" 2>&1; r2=$?; n=$(grep -c 'kqtIncrementalProbe.ts.*TS2322' "$L"); rm -f "$P"; pnpm codecheck > /dev/null 2>&1; r3=$?; rm -f "$L"; echo "edit-run=$r1 repeat-run=$r2 probe-errors=$n after-revert=$r3"; [ "$r1" -ne 0 ] && [ "$r2" -ne 0 ] && [ "$n" -ge 2 ] && [ "$r3" -eq 0 ] )   # gate 6, src-project non-masking guard. It writes a type error after a warm run and needs the next run AND an unchanged repeat run to fail, naming the probe file. HEAD is derived: without a cache every run re-checks, so this also passes at HEAD [HEAD=0 EXPECT==0 @fcf452fc9 GUARD MUTATION: write the second probe line as number = 2 (still valid) and edit-run is 0, so the gate fails]
( P=meta/kqtIncrementalProbe.ts; L=$(mktemp); { printf 'export const kqtIncrementalProbe: number = 1\n' > "$P" && pnpm codecheck > "$L" 2>&1; } || { echo "clean probe run failed"; cat "$L"; rm -f "$P" "$L"; exit 1; }; printf "export const kqtIncrementalProbe: number = 'x'\n" > "$P"; pnpm codecheck > "$L" 2>&1; r1=$?; pnpm codecheck >> "$L" 2>&1; r2=$?; n=$(grep -c 'kqtIncrementalProbe.ts.*TS2322' "$L"); rm -f "$P"; pnpm codecheck > /dev/null 2>&1; r3=$?; rm -f "$L"; echo "edit-run=$r1 repeat-run=$r2 probe-errors=$n after-revert=$r3"; [ "$r1" -ne 0 ] && [ "$r2" -ne 0 ] && [ "$n" -ge 2 ] && [ "$r3" -eq 0 ] )   # gate 7, the same guard for the meta project. meta/ is outside tsconfig.json's include, so the error can only come from the second, meta-project invocation [HEAD=0 EXPECT==0 @fcf452fc9 GUARD MUTATION: write the second probe line as number = 2 (still valid) and edit-run is 0, so the gate fails]
grep -c 'tsc-main.tsbuildinfo' package.json   # gate 8, match count [HEAD=0 EXPECT==1 @fcf452fc9]
grep -c 'tsc-meta.tsbuildinfo' package.json   # gate 9, match count [HEAD=0 EXPECT==1 @fcf452fc9]
( test ! -e src/common/kqtIncrementalProbe.ts && test ! -e meta/kqtIncrementalProbe.ts && git diff --quiet -- tsconfig.json tsconfig.meta.json && pnpm codecheck )   # gate 10, a regression guard: both probes gone, both tsconfigs untouched, the tree typechecks warm [HEAD=0 EXPECT==0 @fcf452fc9 GUARD MUTATION: leave either probe file in place and test ! -e exits 1]</automated>
  </verify>
  <done>
- `scripts.codecheck` in package.json equals the exact string in the action, and gate 1 checks this. `grep -c 'tsc-main.tsbuildinfo' package.json` returns 1 and `grep -c 'tsc-meta.tsbuildinfo' package.json` returns 1.
- Two consecutive `pnpm codecheck` runs both exit 0, and the second takes at most half the wall time of the first. Both times are recorded in the SUMMARY.
- node_modules/.cache/tsc-main.tsbuildinfo and node_modules/.cache/tsc-meta.tsbuildinfo exist and are non-empty. `git status --porcelain` lists neither, because node_modules is gitignored.
- In each project, a type error written after a warm run fails both the next run and a repeated run, and the error names the probe file. Removing the probe returns exit 0. The SUMMARY records each probe's echoed `edit-run=… repeat-run=… probe-errors=… after-revert=…` line.
- meta/__tests__/tsconfigMeta.test.ts passes 7/7, unedited. `npx prettier --check package.json` passes.
- The task commit touches only package.json (`git show --stat HEAD`). No probe file exists, and no unrelated dirty file was staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| warm tsbuildinfo cache → type-check verdict | A persisted cache now decides which files tsc re-checks. A cache that wrongly says "unchanged" would let `pnpm codecheck`, the pre-push hook and every executor's verify pass on code that does not typecheck |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261121-kqt-01 | Tampering | warm-run verdict of `scripts.codecheck` in package.json | medium | mitigate | Verify gates 6 and 7 write a type error after a warm run, in each project. Each must fail on the next run AND on a repeat run with no change (the masking case: errors re-reported from the cache, not dropped), with the error naming the file. Reverting must return exit 0. CI (.github/workflows/codecheck.yml) is always cold because install-deps caches the pnpm store and not node_modules, so the authoritative gate never reads a stale cache |
| T-261121-kqt-02 | Information Disclosure | node_modules/.cache/tsc-*.tsbuildinfo | low | accept | The files hold file lists, hashes and diagnostics for this checkout only. They live under `/node_modules` (.gitignore line 4), so they are never committed, and the done criteria check that `git status --porcelain` lists neither file |
| T-261121-kqt-03 | Denial of Service | node_modules/.cache/ shared with boundary-ratchet and jiti | low | mitigate | Gate 4 deletes only the two named tsc-*.tsbuildinfo files. The action forbids deleting the directory, which holds other tools' caches |
| T-261121-kqt-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no package and changes no dependency, so there is nothing to gate. The script uses the tsc already in the lockfile (TypeScript 5.8.3) |
</threat_model>

<verification>
- Every line of Task 1's `<automated>` block exits 0.
- `pnpm codecheck` is green, and fast on a warm cache.
- `git show --stat HEAD` lists only package.json. No unrelated dirty file was staged, including native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/*, public/locales/en/gamelib.json, .planning/state.json, .planning/debug/*, .planning/spikes/* and the root `.dxvk-cache`.
</verification>

<success_criteria>
`pnpm codecheck` type-checks both projects incrementally, with one buildinfo file per project under node_modules/.cache/. A warm run takes at most half the cold run's time. In both projects a warm run still fails on a newly written type error, including on a repeat run with no further change. tsconfigMeta.test.ts passes unedited, both tsconfigs are untouched, and package.json is prettier-clean.
</success_criteria>

<output>
Create `.planning/quick/261121-kqt-enable-incremental-tsc-in-codecheck/261121-kqt-SUMMARY.md` when done. Record the cold and warm times from gate 4 and both probes' echoed result lines from gates 6 and 7.
</output>
