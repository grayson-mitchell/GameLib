---
phase: quick-260930-ssf
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QUICK-260930-SSF
files_modified:
  - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/watcherProbe.mjs
  - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-baseline.txt
  - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-postfix.txt
  - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/red-proof.txt
  - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md
  - vite.config.ts
  - meta/__tests__/viteRendererConfig.test.ts
  - .planning/todos/pending/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md
  - .planning/todos/completed/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md
  - .planning/spikes/027-windows-add-child-crosscheck/README.md

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A real Vite dev server built from the edited vite.config.ts holds 0 watched directories and 0 watched entries inside any `target-cache` directory. The same probe on the unedited config held more than 0: same probe, same on-disk tree, measured both times."
    - "The post-fix `.planning` control is above 0. The watcher still walks the dot-directory, so the target-cache zero comes from the ignore entry and not from the watcher skipping `.planning`. The `src-tauri/target` control is 0 in both runs, which proves the ignore mechanism works and the probe can tell covered from uncovered."
    - "`server.watch.ignored` is exactly `['**/src-tauri/target/**', '**/graphify-out/**', '**/target-cache/**']`, per the orchestrator's locked decision OD-1 (name the measured directory, not the whole planning tree). The jest pin asserts it exactly, and the probe's dump of the resolved list shows it in force."
    - "Removing the new entry turns `meta/__tests__/viteRendererConfig.test.ts` red with 4 failed / 42 passed / 46 total, so the pin is not vacuous. The file is then restored byte-exact."
    - "The todo sits in `.planning/todos/completed/` with its triage keys unchanged, `status: RESOLVED` / `resolved: 2026-09-30` added, no original line altered, and a Result section stating plainly that the EBUSY crash was not re-reproduced live."
    - "No tracked file still cites the todo under its old `pending/` path. The spike 027 README pointer moves to `completed/` as a one-line diff."
  artifacts:
    - path: ".planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/watcherProbe.mjs"
      provides: "Committed, re-runnable read-only watcher probe (re8's probe was scratchpad-only and is lost)"
      contains: "getWatched"
    - path: ".planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-postfix.txt"
      provides: "Post-fix watcher membership, controls, and the resolved ignore list in force"
      contains: "target_cache_dirs: 0"
    - path: ".planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md"
      provides: "Gate record: baseline RED, post-fix GREEN, controls, RED proof, decision, coverage, and what is NOT established"
      contains: "POSTFIX: GREEN"
    - path: "vite.config.ts"
      provides: "Third measured entry in server.watch.ignored plus its dated rationale paragraph"
      contains: "260930-ssf"
    - path: "meta/__tests__/viteRendererConfig.test.ts"
      provides: "Exact-array pin, dedicated target-cache case, and 260930-ssf source-text guard"
      contains: "260930-ssf"
    - path: ".planning/todos/completed/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md"
      provides: "Closed todo carrying the measured outcome and the honest no-live-repro statement"
      contains: "status: RESOLVED"
  key_links:
    - from: "vite.config.ts server.watch.ignored"
      to: "chokidar _userIgnored (anymatch, ANYMATCH_OPTS dot:true) via resolveChokidarOptions in node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js"
      via: "The probe dumps server.watcher.options.ignored and the post-fix value must end in the three-entry list"
    - from: "meta/__tests__/viteRendererConfig.test.ts toEqual pin"
      to: "vite.config.ts server.watch.ignored"
      via: "direct import of ../../vite.config, resolved under both modes"
    - from: ".planning/spikes/027-windows-add-child-crosscheck/README.md side-effect note"
      to: ".planning/todos/completed/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md"
      via: "re-pointed citation (pending/ to completed/)"
---

<objective>
Close pending todo `2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md`, which is
the spec: read it in full. In Phase 38 sitting 13 (quick 260930-o75, Windows 11), a `cargo build`
of spike 027 into `.planning/spikes/027-windows-add-child-crosscheck/target-cache` crashed a
running `pnpm tauri:dev`. chokidar threw EBUSY on the linker-held spike exe. `vite.config.ts`
`server.watch.ignored` covers only `src-tauri/target` and `graphify-out`.

**Orchestrator decision OD-1 (locked, do not revisit):** add `'**/target-cache/**'`, NOT the
whole-planning-tree glob. The reason comes from the comment above the array: each entry is a
MEASURED failure named as a specific generated directory, and keeping the array
observation-only is what makes it auditable. `target-cache` is the measured directory.

**Measure the fix; do not assume it.** The measured path runs through `.planning`, a
dot-directory. Neither existing entry has ever had to match through one, and a picomatch
`**` does not cross dot-segments unless `dot: true`. This plan therefore reuses 260925-re8's
proven read-only method (`createServer` then `server.watcher.getWatched()`, with a control
row). It commits the probe this time and measures before and after the edit.

**The live EBUSY crash is NOT re-reproduced.** The todo is `ready: code`. The SUMMARY, GATE and
closed todo must each say so plainly. The evidence is watcher membership on a real Vite dev
server, not a crash.

Purpose: a spike build under `.planning/` can no longer kill the dev server's HMR while the
Tauri window "looks healthy".
Output: one ignore entry plus its dated rationale, the jest pin and its RED proof, a committed
probe with before/after evidence, a gate record, and the todo closed into `completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md
@vite.config.ts
@meta/__tests__/viteRendererConfig.test.ts
@.planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md
@.planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md

## Planning-time measurements (2026-09-30, this machine; re-check before relying on them)

**Todo line citations: verified against the live file.** In `vite.config.ts`, the rationale
comment block is lines 101-123 and `watch: { ignored: [...] }` is lines 124-126, matching the
todo exactly. Inside the block: the 260924-vat paragraph is 101-108, the 260925-re8 paragraph
110-117, and the "Each entry below is a MEASURED failure ..." paragraph 119-123, which ends
"See 260925-re8-GATE.md.". Lines are LF on disk (0 CR bytes; `git ls-files --eol` reports
`w/lf`, with `* text=auto eol=lf` in `.gitattributes`).

**`grep -c $'\r'` is unreliable on this machine.** It matched every line of an LF file and 0
lines of a real CRLF file. If a CR check is needed, use `tr -cd '\r' < FILE | wc -c`.

**Jest pin, `meta/__tests__/viteRendererConfig.test.ts`.**
- Baseline is `Tests: 43 passed, 43 total` for this one suite.
- Docblock items 1-7 are at lines 5-37. Item 7 (re8) is at 34-37.
- `describe.each(['production', 'development'])` spans lines 89-306, so every `it()` inside it
  counts twice.
- The graphify-out case is at 259-267.
- The exact-array pin `keeps the watcher ignore list to measured failures only` is at 269-279
  and asserts `toEqual(['**/src-tauri/target/**', '**/graphify-out/**'])`. Adding the entry
  WITHOUT updating it turns the suite red. `pnpm codecheck` would not catch that, because
  jest is a separate gate.
- The `source-text guards` describe is at 331-373, and the re8 guard is at 364-372.

**What `pnpm codecheck` actually covers.** It is `tsc --noEmit && tsc -p tsconfig.meta.json
--noEmit`. `tsconfig.json` excludes `vite.config.ts`. `tsconfig.meta.json` includes `meta`,
and the meta test imports `../../vite.config`, so the second pass type-checks the config
through that import.

**Formatter visibility.** `npx prettier --file-info` reports:
- `vite.config.ts` and `meta/__tests__/viteRendererConfig.test.ts`:
  `{ "ignored": false, "inferredParser": "typescript" }`, so the check is real. Both are
  prettier-clean at HEAD.
- `.planning/spikes/027-windows-add-child-crosscheck/README.md`:
  `{ "ignored": true, "inferredParser": null }`. Every `.planning/` path is ignored.

Root `.prettierrc.json` is `trailingComma: none`, `singleQuote`, `semi: false`, and
printWidth defaults to 80. The three-entry array is 85 columns on one line, so prettier
breaks it one element per line.

**Why the glob can reach through `.planning`.**
- Vite 6.3.5's bundled chokidar builds `_userIgnored = anymatch(list, undefined,
  ANYMATCH_OPTS)` with `ANYMATCH_OPTS = {dot: true}`, in
  `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js` (search `ANYMATCH_OPTS`).
  `resolveChokidarOptions()` in the same chunk APPENDS the user list after
  `**/.git/**`, `**/node_modules/**`, `**/test-results/**` and the cacheDir glob.
- Model check with the hoisted `anymatch` 3.1.3. This is a model, not the watcher:
  - With `dot: true`, `**/target-cache/**` matches the `target-cache` dir itself and the
    `debug/deps/*.exe` beneath it. It does NOT match the parent spike dir or the todo file
    whose name contains `target-cache`.
  - With `dot: false`, it FAILS to match through `.planning`.
- `dot: true` is therefore load-bearing. The probe's `.planning` control is what proves it on
  the real watcher.

**Watcher side-effects of the probe.**
- In `dep-DBxKXgDP.js`, `_createServer` (line 38328) builds the watcher at line 38362
  (`const watcher = watchEnabled ? chokidar.watch(`) whether or not the server listens.
- `initServer` is at 38705. Outside middleware mode it runs ONLY from the patched
  `httpServer.listen` (38722-38724). It is what calls `pluginContainer.buildStart()` and each
  environment's `listen`, and so the dep optimizer.
- So a probe that never calls `listen()` gets the real watcher and none of those side-effects.
- All four meta plugins (`assembleRendererDist`, `preserveRunnerSymlinks`,
  `pruneStaleHelperBinaries`, `pruneUnofferedLocales`) are `apply: 'build'` anyway, so none
  of them runs under serve. Tracked files: the only tracked path
containing `target-cache` is the todo's own filename, never a directory segment.

**The target-cache on disk.** Only `.planning/spikes/027-windows-add-child-crosscheck/target-cache`
exists (gitignored, 3328 files). It is the RED baseline's subject.

**Spike coverage, for the SUMMARY's honest coverage statement.** Grounded by each spike's
`Cargo.toml` and README recipe:

| spike(s) | build target | covered by |
| --- | --- | --- |
| 025, 027 | `CARGO_TARGET_DIR=.planning/spikes/<id>/target-cache` (each has `.gitignore: target-cache/`) | the new entry. The glob is depth-independent, so a relative `CARGO_TARGET_DIR` resolved from `app/` is still covered |
| 013, 016, 019, 020, 021, 022, 024, 029 | `CARGO_TARGET_DIR` pointed at `src-tauri/target` | the existing first entry |
| 011 (`parity-probe/`) | README recipe is `cd parity-probe && cargo build`, so default `parity-probe/target/` | NEITHER. No crash observed, no such dir on disk. NOT added, per the observation-only rule; state it, do not fix it |
| 028 | no `Cargo.toml` of its own (README only) | n/a |

**Closing convention (from `50be9d978`, quick-260930-qmu):**
- Rename the todo with `git mv` from `pending/` to `completed/`.
- Keep the frontmatter intact and add `status: RESOLVED` and `resolved: <date>` immediately
  after `ready:`.
- Append `## Result (quick-<id>, <date>)` and `## Resolution` sections. Leave every existing
  line as history.
- Re-point any live citation of the old path as a one-line diff (the `c3cc2ef44` precedent).

Here the only live citation is `.planning/spikes/027-windows-add-child-crosscheck/README.md`
line 167.

**Planning gates.** `PYTHONUTF8=1 pnpm planning-gates` reports `12/12 planning gates passed`
at HEAD. Without `PYTHONUTF8` one gate crashes on cp1252; that is pre-existing.

**Leave `.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/` alone.** It is
untracked and belongs to another session. Stage explicit paths only, and never run
`git add -A`, `git add .` or `git add .planning`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Measure the dev watcher on target-cache, add the entry (OD-1), re-measure end-to-end</name>
  <files>.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/watcherProbe.mjs, .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-baseline.txt, .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-postfix.txt, vite.config.ts, meta/__tests__/viteRendererConfig.test.ts</files>
  <precondition>`.planning/spikes/027-windows-add-child-crosscheck/target-cache` exists and contains files (gitignored and local-only; 3328 files at planning time). Without it, the baseline cannot show the defect.</precondition>
  <read_first>vite.config.ts (lines 93-127), meta/__tests__/viteRendererConfig.test.ts (lines 1-60 and 245-300), .planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md, the todo</read_first>
  <action>
One path through every layer: instrument, then config, then pin, then re-measure. Work from the
repo root. Let QD = `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig`.

**1. Write the probe `QD/watcherProbe.mjs`.** It is an ES module that uses only Node built-ins
plus `vite`: the bare import resolves up to the repo's `node_modules`, so no install is needed.
It is read-only.

Arguments are positional: `label` (`baseline` or `postfix`), `outPath`, and an optional third
argument `--listen`. On bad arguments it exits 64.

It calls vite's `createServer` with this inline config: `configFile: 'vite.config.ts'`,
`mode: 'development'`, `logLevel: 'silent'`, `server: { port: 5199, strictPort: true }`.
- Pass NOTHING under `server.watch` inline. Vite's mergeConfig concatenates arrays, so an
  inline `ignored` would silently append to the file's list and void the measurement.
- By default, do NOT call `server.listen()`. The chokidar watcher is constructed inside
  `createServer` itself. Not listening means no port bind, no dep-optimizer write into the
  shared `node_modules/.vite` cache, and no plugin startup hooks, so a live `pnpm tauri:dev`
  on 5173 is untouched.
- With `--listen`, call `server.listen()` on 5199. This is the re8 path, used only as a
  fallback.

Register a `server.watcher.on('error')` counter before sampling.

Settle: sample `server.watcher.getWatched()` every 2000 ms. The watcher counts as settled when
the key count is identical across 3 consecutive samples; the hard cap is 120 s. Also arm an
overall 150 s watchdog that exits 2. The watchdog timer must be `unref()`-ed, per this repo's
exit-contract habit.

Normalise every key and the cwd by turning backslashes into `/`. Make each key repo-relative
by stripping the normalised cwd prefix case-insensitively.

Report exactly these `key: value` lines, LF-terminated. Write them to `outPath` (mkdir -p its
dir) and echo them to stdout:
- `label`
- `vite_version`: vite's exported `version`
- `listened`: yes/no
- `settled`: yes/no
- `settle_trajectory`: comma-joined key counts
- `total_dirs`: key count
- `total_entries`: sum of child-array lengths
- `target_cache_dirs` and `target_cache_entries`: over keys where any `/`-split path segment is
  exactly `target-cache`, counting that dir itself
- `src_tauri_target_dirs`: keys equal to or under `src-tauri/target`
- `graphify_out_dirs`: keys equal to or under `graphify-out`
- `planning_dirs`: keys equal to or under `.planning`, EXCLUDING any key with a `target-cache`
  segment, so the control is independent of the metric under test
- `watcher_errors`
- `ignored_resolved`: `server.watcher.options.ignored`, each string normalised with the repo
  root replaced case-insensitively by the literal token `{repo}`, joined with ` | `
- `has_target_cache_entry`: yes only if that list contains exactly `**/target-cache/**`

No absolute path and no environment variable may appear in the output. Then
`await server.close()` and exit 0.

**2. Record the baseline on the UNEDITED config.** Run
`node QD/watcherProbe.mjs baseline QD/evidence/probe-baseline.txt`.
- If `total_dirs` is 0, the watcher did not start without listen. Re-run with `--listen` and
  continue.
- The expected result is RED: `target_cache_dirs` above 0, `src_tauri_target_dirs` 0,
  `planning_dirs` above 0.
- If `target_cache_dirs` is 0 while `planning_dirs` is above 0, STOP. Do not edit
  `vite.config.ts`, and return to the orchestrator: the premise that the watcher walks
  target-cache is contradicted.

**3. Edit `vite.config.ts` (OD-1).**

a. Append `'**/target-cache/**'` as the LAST element of `server.watch.ignored`. Do not reorder
   or alter the two existing entries, and do not restate Vite defaults.

b. Insert one new comment paragraph between the 260925-re8 paragraph and the "Each entry below
   is a MEASURED failure" paragraph. Match the block's style: `    //` prefix, a blank `//`
   separator line, and every line hand-wrapped to 80 columns or fewer. Prettier does not wrap
   comments. The paragraph opens `Quick task 260930-ssf (2026-09-30):` and says, in about
   8-12 lines:
   - target-cache/ is the third member of this EBUSY defect class, found in Phase 38 sitting 13
     (quick 260930-o75, Windows 11).
   - A `cargo build` of spike 027 with `CARGO_TARGET_DIR` at its `target-cache`, the spike
     README's own recipe, killed a running `pnpm tauri:dev` with chokidar EBUSY on the spike
     exe the linker held open.
   - The watcher held N dirs / M entries under it on the pre-fix config. Use the REAL
     `target_cache_dirs` / `target_cache_entries` from `probe-baseline.txt`, never invented
     figures.
   - It is named as the directory rather than the whole planning tree. The renderer never
     imports from `.planning`, but a wider entry breaks the observation-only rule below.
   - The glob reaches through `.planning` only because Vite's bundled chokidar matches ignore
     globs with `dot: true`. Keep that exact phrase; Task 2's source-text guard depends on it.

c. In the "Each entry below..." paragraph, change only its last sentence to
   `See 260925-re8-GATE.md and 260930-ssf-GATE.md.` Re-wrap only that paragraph's tail if
   needed.

d. Every existing token the source-text guards depend on must survive: `260924-vat`, `EBUSY`,
   `260925-re8`, `graphify-out`, `HMR`, `not evidence about the packaged build`, `F-34.9-01`
   and `260922-hjb`.

**4. Update the exact-array pin** in `meta/__tests__/viteRendererConfig.test.ts` (the
`keeps the watcher ignore list to measured failures only` case) to the three-element array,
in the same order. Change nothing else in the test here; Task 2 adds the dedicated case and
the guard.

**5. Format.** Run `npx prettier --write vite.config.ts meta/__tests__/viteRendererConfig.test.ts`.
Both were clean at HEAD, so this only lays the arrays out one element per line. Then confirm
`git diff --stat` touches only these two tracked files.

**6. Re-measure.** Run `node QD/watcherProbe.mjs postfix QD/evidence/probe-postfix.txt`, with
the same `--listen` choice as the baseline. The expected result is GREEN. If the post-fix
gate below fails, STOP and report. Never loosen the gate or edit the probe to fit.

**7. Commit** with explicit paths only: the probe, both evidence files, `vite.config.ts` and
the test. Use the message `fix(quick-260930-ssf): ignore spike target-cache dirs in the Vite dev
watcher`.
  </action>
  <verify>
    <automated>QD=.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig; B=$QD/evidence/probe-baseline.txt; P=$QD/evidence/probe-postfix.txt; v(){ sed -n "s/^$2: //p" "$1"; } &&
test -s $QD/watcherProbe.mjs && grep -q 'getWatched' $QD/watcherProbe.mjs && test -s $B && test -s $P &&
[ "$(v $B label)" = baseline ] && [ "$(v $P label)" = postfix ] && [ "$(v $B vite_version)" = 6.3.5 ] && [ "$(v $P vite_version)" = 6.3.5 ] &&
[ "$(v $B settled)" = yes ] && [ "$(v $P settled)" = yes ] && [ "$(v $B watcher_errors)" = 0 ] && [ "$(v $P watcher_errors)" = 0 ] &&
[ "$(v $B has_target_cache_entry)" = no ] && [ "$(v $P has_target_cache_entry)" = yes ] &&
[ "$(v $B target_cache_dirs)" -gt 0 ] && [ "$(v $B target_cache_entries)" -gt 0 ] &&
[ "$(v $P target_cache_dirs)" = 0 ] && [ "$(v $P target_cache_entries)" = 0 ] &&
[ "$(v $B src_tauri_target_dirs)" = 0 ] && [ "$(v $P src_tauri_target_dirs)" = 0 ] && [ "$(v $P graphify_out_dirs)" = 0 ] &&
[ "$(v $B planning_dirs)" -gt 0 ] && [ "$(v $P planning_dirs)" -gt 0 ] &&
[ "$(v $B ignored_resolved)" = '**/.git/** | **/node_modules/** | **/test-results/** | {repo}/node_modules/.vite/** | **/src-tauri/target/** | **/graphify-out/**' ] &&
[ "$(v $P ignored_resolved)" = '**/.git/** | **/node_modules/** | **/test-results/** | {repo}/node_modules/.vite/** | **/src-tauri/target/** | **/graphify-out/** | **/target-cache/**' ] &&
! grep -qE '[A-Za-z]:[/\\]' $B $P &&
grep -q '260930-ssf' vite.config.ts && grep -q '260930-o75' vite.config.ts && grep -q 'dot: true' vite.config.ts && grep -q '260930-ssf-GATE.md' vite.config.ts &&
grep -q '260924-vat' vite.config.ts && grep -q 'EBUSY' vite.config.ts && grep -q '260925-re8' vite.config.ts && grep -q 'HMR' vite.config.ts &&
[ "$(sed -n '/Quick task 260930-ssf/,/watch: {/p' vite.config.ts | awk 'length > 80' | wc -l)" = 0 ] &&
J=$(pnpm exec jest meta/__tests__/viteRendererConfig.test.ts 2>&1); grep -qE '^Tests: +43 passed, 43 total$' <<<"$J" && grep -qE '^Test Suites: +1 passed, 1 total$' <<<"$J" &&
npx prettier --check vite.config.ts meta/__tests__/viteRendererConfig.test.ts &&
pnpm codecheck && echo TASK1_OK</automated>
    <automated># Formatter gate, honestly scoped: vite.config.ts and the test are prettier-visible ({ "ignored": false, "inferredParser": "typescript" }), so the check above is real coverage. The probe and both evidence files live under .planning/, which prettier ignores; no --check is written for them because it would be vacuous.
npx prettier --file-info vite.config.ts | grep -Eq '"ignored":[[:space:]]*false'</automated>
  </verify>
  <done>
- The baseline probe on the unedited config shows target-cache watched (above 0 dirs and above
  0 entries) with no `target-cache` entry in force.
- The post-fix probe shows 0 / 0, with the three-entry list in force, the `.planning` control
  above 0 and the `src-tauri/target` control 0.
- `vite.config.ts` carries the entry and its dated 260930-ssf paragraph (real measured
  numbers, the `dot: true` note, the OD-1 reason), and every prior rationale token is intact.
- The exact-array pin is updated and the suite is 43/43 green. Prettier is clean on both .ts
  files and `pnpm codecheck` is green. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Harden the pin, prove it can fail, and write the gate record</name>
  <files>meta/__tests__/viteRendererConfig.test.ts, .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/red-proof.txt, .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md</files>
  <read_first>meta/__tests__/viteRendererConfig.test.ts (lines 1-45, 245-300, 331-374), both probe evidence files from Task 1, .planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md (structure to mirror)</read_first>
  <action>
Let QD = `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig`.

**1. Extend `meta/__tests__/viteRendererConfig.test.ts`** in the house style of the re8
additions.
- a. Docblock: add item 8 after item 7. It says `server.watch.ignored` must not lose its
  `target-cache` entry (quick task 260930-ssf). It is the same EBUSY class as 6 and 7,
  measured in Phase 38 sitting 13, when a `cargo build` of spike 027 into its `target-cache`
  killed a running `pnpm tauri:dev`.
- b. Inside the `describe.each` block, directly after the graphify-out case, add a comment
  citing 260930-ssf and the REAL baseline numbers from `probe-baseline.txt`. Then add
  `it('ignores spike target-cache dirs in the dev-server watcher', ...)`, asserting three
  things:
  - `Array.isArray(ignored)`
  - `toContain('**/target-cache/**')`
  - `not.toContain('**/.planning/**')`, which pins OD-1: the named directory, not the whole
    planning tree.
- c. In the `source-text guards` describe, after the re8 guard, add
  `it('keeps the 260930-ssf rationale next to the target-cache ignore', ...)`. It asserts that
  `source` contains `260930-ssf`, `target-cache` and `dot: true`. That last token is why the
  entry works through a dot-directory, and a future chokidar/vite upgrade reader needs it.
- d. Leave every existing case as it is.

The expected count is 43 + 2 (the new case, run under both modes) + 1 (the guard) = 46.

**2. RED proof: the pin must be able to fail.** `vite.config.ts` was committed in Task 1 and
this task never edits it, so it can be restored exactly.
- a. Delete only the array element line in place:
  `sed -i "/^ *'\*\*\/target-cache\/\*\*',\{0,1\}$/d" vite.config.ts`
- b. Confirm `git diff --numstat -- vite.config.ts` reads exactly one deletion and zero
  additions.
- c. Run `pnpm exec jest meta/__tests__/viteRendererConfig.test.ts` and capture the output.
  The expected result is `Tests: 4 failed, 42 passed, 46 total`: the exact-array pin and the
  new case, each under both modes. The source-text guard stays green because the comment is
  untouched.
- d. Restore with `git checkout -- vite.config.ts`, then confirm `git diff --quiet -- vite.config.ts`.
- e. Write `QD/evidence/red-proof.txt` in this order:
  1. A line `removed: the target-cache element line of server.watch.ignored (numstat 0 1)`.
  2. From the captured output, ONLY the `Tests:` and `Test Suites:` summary lines and the
     lines naming the two failing test titles. Never paste stack traces; they carry absolute
     paths.
  3. A final line `restored: yes (git diff --quiet -- vite.config.ts exit 0)`.
- f. If the red run is not exactly 4 failed, STOP and report. Do not adjust tests to hit the
  number.

**3. Green again.** Re-run the suite and expect `Tests: 46 passed, 46 total`. Then run
`npx prettier --write` on the test file only, then `--check` it.

**4. Write `QD/260930-ssf-GATE.md`**, mirroring the re8 gate record.
- Two exact column-0 lines near the top: `BASELINE: RED` and `POSTFIX: GREEN`.
- Sections, in order:
  1. **How the gate was run.** Probe path; `createServer` without listen (or with `--listen`,
     whichever was used); port 5199, never 5173; no cargo build and no live dev server
     exercised.
  2. **Measurement.** A table of baseline vs post-fix: total dirs/entries, target-cache
     dirs/entries, the `src-tauri/target` control, graphify-out, the `.planning` control,
     `watcher_errors`, settled. Copy the values verbatim from the evidence files.
  3. **Resolved ignore list in force.** Both runs, verbatim `ignored_resolved`.
  4. **Why the zero is load-bearing.**
     - The `src-tauri/target` control is 0 in both runs: the mechanism works and the probe
       discriminates.
     - The `.planning` control is above 0 post-fix: the dot-directory is walked, so the zero
       is the entry.
     - `ANYMATCH_OPTS = {dot: true}` in `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js`.
     - The planning-time anymatch 3.1.3 model check: with `dot: false`, the same glob misses
       the path. Label it a model, not the watcher.
  5. **The pin and its RED proof.** Cite `evidence/red-proof.txt`.
  6. **Decision OD-1.** The named directory, not the whole planning tree, with the
     observation-only reason.
  7. **Coverage.** The spike table from this plan's context, including spike 011's uncovered
     `parity-probe/target/`, stated and not fixed.
  8. **What this does and does NOT establish.** It does NOT re-observe the EBUSY crash. No
     `cargo build` was run under a live `pnpm tauri:dev`. The crash evidence remains the
     todo's sitting-13 observation. This file must contain the phrase `not re-reproduced live`.
- No drive-letter absolute paths anywhere. Hand-wrap to the corpus (about 100 columns).

**5. Refresh the graph.** Run `graphify update .` (CLAUDE.md rule after code edits).
`graphify-out/` is gitignored and already in the watcher ignore list, so this is safe with a
live dev server. Skip it with a note if the command fails.

**6. Commit** with explicit paths: the test, `red-proof.txt` and `GATE.md`. Use the message
`test(quick-260930-ssf): pin the target-cache watcher ignore and prove the pin can fail`.
  </action>
  <verify>
    <automated>QD=.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig; RP=$QD/evidence/red-proof.txt; G=$QD/260930-ssf-GATE.md &&
git diff --quiet -- vite.config.ts &&
test -s $RP && grep -qE '^Tests: +4 failed, 42 passed, 46 total$' $RP && grep -qF 'keeps the watcher ignore list to measured failures only' $RP && grep -qF 'ignores spike target-cache dirs in the dev-server watcher' $RP && grep -q '^restored: yes' $RP &&
grep -qF "it('ignores spike target-cache dirs in the dev-server watcher'" meta/__tests__/viteRendererConfig.test.ts && grep -qF "it('keeps the 260930-ssf rationale next to the target-cache ignore'" meta/__tests__/viteRendererConfig.test.ts &&
J=$(pnpm exec jest meta/__tests__/viteRendererConfig.test.ts 2>&1); grep -qE '^Tests: +46 passed, 46 total$' <<<"$J" && grep -qE '^Test Suites: +1 passed, 1 total$' <<<"$J" &&
test -s $G && grep -qx 'BASELINE: RED' $G && grep -qx 'POSTFIX: GREEN' $G && grep -qi 'not re-reproduced live' $G && grep -q 'parity-probe' $G && grep -q 'red-proof.txt' $G &&
! grep -qE '[A-Za-z]:[/\\]' $G $RP &&
npx prettier --check meta/__tests__/viteRendererConfig.test.ts && npx tsc -p tsconfig.meta.json --noEmit && echo TASK2_OK</automated>
    <automated># Formatter gate, honestly scoped: the test file is prettier-visible, so the --check above is real. red-proof.txt and GATE.md are under .planning/ (prettier-ignored); no check is written for them because it would be vacuous. They are hand-matched to the corpus instead.
npx prettier --file-info meta/__tests__/viteRendererConfig.test.ts | grep -Eq '"ignored":[[:space:]]*false'</automated>
  </verify>
  <done>
- The suite is 46/46 green, with the dedicated target-cache case under both modes and the
  260930-ssf source-text guard.
- Removing the entry was measured red at exactly 4 failed / 42 passed / 46 total, then
  `vite.config.ts` was restored byte-exact.
- GATE.md records baseline RED, post-fix GREEN, both controls, the RED proof, OD-1, honest
  coverage (including spike 011's gap) and the explicit not-re-reproduced-live limit.
- Committed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo into completed/ and re-point the spike 027 citation</name>
  <files>.planning/todos/pending/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md, .planning/todos/completed/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md, .planning/spikes/027-windows-add-child-crosscheck/README.md</files>
  <read_first>the todo (whole file), .planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md (frontmatter plus its Result/Resolution sections, as the closing precedent), .planning/spikes/027-windows-add-child-crosscheck/README.md (lines 158-167), QD/260930-ssf-GATE.md</read_first>
  <action>
Follow the `50be9d978` closing convention exactly.

**1. Move the todo.** `git mv` it from `.planning/todos/pending/` to `.planning/todos/completed/`,
keeping the same filename.

**2. Frontmatter.** Insert two lines immediately after `ready: code`: `status: RESOLVED`, then
`resolved: 2026-09-30`. Leave `severity: minor`, `platform: windows`, `ready: code` and every
other key byte-identical.

**3. Body history is not rewritten.** The body's `vite.config.ts:101-123` / `:124-126`
citations describe the pre-fix file and stay as they are. The history-not-pointer rule from
this repo's citation work applies.

**4. Append `## Result (quick-260930-ssf, 2026-09-30)`.** Hand-wrap to about 100 columns, as
in the existing body. It covers:
- The entry added, per OD-1, and why it is not the whole planning tree.
- Baseline vs post-fix target-cache dirs/entries and both control values, copied from the
  evidence files.
- The jest pin at 46/46, and its RED proof at 4 failed.
- The sentence "The EBUSY crash was not re-reproduced live", followed by the reason: no
  `cargo build` was run under a live `pnpm tauri:dev`, and the evidence is watcher membership
  on a real Vite dev server.
- One line on coverage: spikes 025/027 are covered; spike 011's `parity-probe/target/` is
  covered by no entry, with no crash observed and not added.
- A pointer to `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md`.

**5. Append `## Resolution`.** One short paragraph: the fix commit (`git log -1 --format=%h --
vite.config.ts`), the pin commit (`git log -1 --format=%h -- meta/__tests__/viteRendererConfig.test.ts`),
and the gate record path.

**6. Re-point the live citation.** At `.planning/spikes/027-windows-add-child-crosscheck/README.md`
line 167, change only the directory component of the todo path from `pending` to
`completed`: a one-line diff. The surrounding "Side effect worth knowing" prose is history and
stays.

**7. Run `PYTHONUTF8=1 pnpm planning-gates`.** Expect `12/12 planning gates passed`.

**8. Commit** with explicit paths: both todo paths (the rename) and the README. Never touch
`.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/`. Use the message
`docs(quick-260930-ssf): close the vite dev-watcher target-cache EBUSY todo`.
  </action>
  <verify>
    <automated># Every git call's status is captured before its output is inspected (no git in a non-final pipeline stage), so a broken git reads as a failure, never as clean. BASE = Task 2's commit, the last one before this task touched the todo or README, so the diffs below hold whether or not Task 3 is committed yet.
QD=.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig; N=2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md; C=.planning/todos/completed/$N; P=.planning/todos/pending/$N; R=.planning/spikes/027-windows-add-child-crosscheck/README.md &&
BASE=$(git log -1 --format=%H -- meta/__tests__/viteRendererConfig.test.ts) && [ -n "$BASE" ] &&
test -f $C && ! test -e $P && LP=$(git ls-files -- $P) && [ -z "$LP" ] && LC=$(git ls-files -- $C) && [ -n "$LC" ] &&
FM=$(awk '/^---$/{c++; next} c==1' $C) && grep -qx 'severity: minor' <<<"$FM" && grep -qx 'platform: windows' <<<"$FM" && grep -qx 'ready: code' <<<"$FM" && grep -qx 'status: RESOLVED' <<<"$FM" && grep -qx 'resolved: 2026-09-30' <<<"$FM" &&
grep -qx '## Result (quick-260930-ssf, 2026-09-30)' $C && grep -qx '## Resolution' $C && grep -qi 'not re-reproduced live' $C && grep -q '260930-ssf-GATE.md' $C &&
NT=$(git diff --numstat -M $BASE -- $P $C) && [ "$(cut -f2 <<<"$NT")" = 0 ] &&
grep -qF "todos/completed/$N" $R && NR=$(git diff --numstat $BASE -- $R) && [ "$(cut -f1,2 <<<"$NR")" = "$(printf '1\t1')" ] &&
GG=$(git grep -l -F "todos/pending/$N" -- . ":(exclude)$QD"; echo "rc=$?") && [ "$GG" = "rc=1" ] &&
CA=$(git diff --cached --name-only -- .planning/quick/260930-rph-close-the-login-window-title-todo-live-v) && [ -z "$CA" ] &&
PG=$(PYTHONUTF8=1 pnpm planning-gates 2>&1) && grep -q '12/12 planning gates passed' <<<"$PG" && echo TASK3_OK</automated>
    <automated># Formatter gate: every path this task writes (the todo in completed/ and the spike README) is under .planning/, which prettier ignores ({ "ignored": true, "inferredParser": null }, measured for the README at planning time). A --check here would print a green that proves nothing, so none is written. These files are hand-matched to the surrounding corpus instead.
npx prettier --file-info .planning/spikes/027-windows-add-child-crosscheck/README.md | grep -Eq '"ignored":[[:space:]]*true'</automated>
  </verify>
  <done>
- The todo is renamed into `completed/`: tracked there and gone from `pending/`.
- The triage keys are unchanged; `status: RESOLVED` and `resolved: 2026-09-30` are added.
- Zero original lines are altered.
- The Result section carries the measured numbers and the explicit not-re-reproduced-live
  statement; Resolution names both commits.
- The spike 027 README points at `completed/` as a one-line diff, and no tracked file outside
  this quick dir cites the old `pending/` path.
- Planning gates are 12/12, and the other session's untracked directory is untouched.
- Committed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local cargo build output → Vite dev-server watcher | Files written by an unrelated build process (linker-held exes) cross into chokidar's fs.watch set when `root: '.'` walks the whole repo |
| probe process → operator's live dev session | The probe runs a second Vite instance on the same checkout, possibly while `pnpm tauri:dev` is up |
| executor → committed evidence | Probe and jest output are committed under `.planning/` |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ssf-01 | Denial of Service | Vite dev watcher vs a `cargo build` writing into a spike `target-cache` | low | mitigate | Add `'**/target-cache/**'` to `server.watch.ignored` (Task 1). Proven by the post-fix probe at 0/0 with controls, and pinned by the exact-array jest case plus a dedicated case whose failure was measured (Task 2). |
| T-ssf-02 | Tampering | Speculative widening of the ignore list (whole planning tree, `build/`, `public/bin`), which would dilute the observation-only rule and could hide real-source HMR | medium | mitigate | OD-1 names the measured directory only. The exact `toEqual` pin plus `not.toContain` for the planning-tree glob make any widening a deliberate test edit. The probe's exact `ignored_resolved` equality proves nothing else is in force. |
| T-ssf-03 | Information Disclosure | Committed probe and jest evidence embedding absolute paths or environment | low | mitigate | The probe outputs counts only, with the repo root replaced by `{repo}` and no env dump. `red-proof.txt` keeps only summary and test-title lines, never stack traces. The verifies assert that no drive-letter path appears in any evidence file or in GATE.md. The fake-HOME two-profile rule does not apply: nothing spawns the sidecar or SEA binary, and the vite config reads no profile state. |
| T-ssf-04 | Repudiation | A SUMMARY, GATE or closed todo implying the EBUSY crash was re-reproduced or verified live | medium | mitigate | All three must state that it was not re-reproduced live (grep-gated in Tasks 2 and 3). The evidence is labelled as watcher membership, not a crash. |
| T-ssf-05 | Denial of Service | The probe disturbing a live `pnpm tauri:dev` (port 5173 collision, dep-optimizer rewriting the shared `node_modules/.vite`) | low | mitigate | The probe does not call `listen()` by default, so there is no port bind, optimizer run or plugin startup hook. The fallback listens on 5199 only. All meta plugins are `apply: 'build'`. |
| T-ssf-SC | Tampering | npm/pip/cargo installs | high | accept | No package-manager install in this plan. `vite` 6.3.5 and `anymatch` are already present, so the package-legitimacy gate has nothing to evaluate. |
</threat_model>

<verification>
- Task 1: the baseline probe shows RED on the unedited config and the post-fix probe shows
  GREEN with both controls. The resolved ignore list in force is exactly Vite's four defaults
  plus the three named entries.
- Task 2: jest is 46/46 green, and the RED proof with the entry removed is 4 failed / 42
  passed / 46 total, after which `vite.config.ts` is restored byte-exact.
- `npx prettier --check vite.config.ts meta/__tests__/viteRendererConfig.test.ts` is clean.
  Both paths are prettier-visible, so this is real coverage.
- `pnpm codecheck` is green. Its meta pass type-checks `vite.config.ts` through the test's
  import.
- `PYTHONUTF8=1 pnpm planning-gates` reports 12/12 after the todo move.
- No `.planning/` path gets a prettier check: they are all ignored, and each verify says so.
- The live EBUSY crash was NOT re-reproduced. That is by design, because the todo is
  `ready: code`.
</verification>

<success_criteria>
- `server.watch.ignored` equals `['**/src-tauri/target/**', '**/graphify-out/**', '**/target-cache/**']`,
  proven in force on a real Vite dev server (target-cache 0/0 post-fix against more than 0
  pre-fix, with the `.planning` and `src-tauri/target` controls) and pinned by a jest case
  measured able to fail.
- The dated 260930-ssf rationale paragraph sits in the block's style, with real measured
  numbers, the OD-1 reason and the `dot: true` dependency note.
- The todo is closed into `completed/` per the `50be9d978` convention, and its sole live
  citation is re-pointed.
- The SUMMARY, GATE and closed todo each state plainly that the crash was not re-reproduced
  live.
- Untracked `.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/` is
  untouched.
</success_criteria>

<output>
Create `.planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-SUMMARY.md` when done.

The SUMMARY must state, plainly and in its own words:
1. **No live repro.** The EBUSY crash was NOT re-reproduced live: no `cargo build` was run
   under a live `pnpm tauri:dev`. What was measured is dev-watcher membership, before and
   after, on a real Vite 6.3.5 dev server.
2. **Line numbers.** The todo's cited line numbers (`vite.config.ts:101-123` comment, `:124-126`
   array) were verified against the live file before the edit, and they matched.
3. **Coverage.**
   - The new entry covers spikes 025 and 027, whose recipes build into a `target-cache`. Only
     027's exists on disk.
   - Spikes 013, 016, 019, 020, 021, 022, 024 and 029 build into `src-tauri/target`, which the
     first entry already covered.
   - Spike 011's `parity-probe/target/` is covered by NO entry. No crash has been observed
     there and it was deliberately not added, per the observation-only rule.
4. **Why the glob works.** It reaches through `.planning` only because Vite's bundled chokidar
   passes `dot: true`. A future Vite/chokidar upgrade that changes ignore-glob matching should
   re-run the committed probe (`watcherProbe.mjs`).
5. **The pin.** The jest pin moved 43 to 46, and its RED proof was 4 failed.
6. **Commits.** The three task commits, as short hashes.
</output>
