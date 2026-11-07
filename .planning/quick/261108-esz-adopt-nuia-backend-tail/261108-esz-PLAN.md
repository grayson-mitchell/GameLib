---
phase: quick-261108-esz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/testUtils/indexed.ts
  - src/backend/wine/**
  - src/backend/utils/**
  - src/backend/utils.ts
  - src/backend/testUtils/ipcDomainParse.ts
  - src/backend/testUtils/ipcSchemaFixtures.ts
  - src/backend/testUtils/rustQuoteBalance.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/knownFixesRegistry.ts
  - src/backend/launcher.ts
  - src/backend/knownFixOverlayArchive.ts
  - src/backend/save_sync.ts
  - src/backend/storeSearch/__tests__/cheapshark.test.ts
  - src/backend/wiki_game_info/**
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/__tests__/pass.test.ts
  - src/backend/scanners/__tests__/scanChannelParity.test.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/sideload/library.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/appshell/__tests__/appshellModules.test.ts
  - src/backend/logger/sanitizeRendererLogMessage.ts
  - src/backend/platform/__tests__/types.usage.test.ts
  - src/backend/steamgrid/__tests__/secretStore.test.ts
  - meta/indexedAccessRatchet.cjs
  - meta/__tests__/indexedAccessRatchet.test.ts
  - meta/indexedAccessBaseline.json
  - .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md
autonomous: true
requirements:
  - todo-2026-11-07-nouncheckedindexedaccess-remaining-buckets

must_haves:
  truths:
    - "All 19 tail buckets are at 0, listed in ADOPTED_BUCKETS and the exact ratchet-test assertion, and absent from meta/indexedAccessBaseline.json"
    - "`node meta/indexedAccessRatchet.cjs` exits 0 after EVERY commit of this task"
    - "No site was fixed with a non-null `!` or a widening cast (`as any`, `as unknown`, `as T` dropping undefined)"
    - "Valid-input behaviour of every source site is unchanged; only error paths (missing element) may now throw/skip/return early"
    - "No test assertion got weaker: a missing element/call fails loudly, never passes vacuously"
    - "The todo stays in pending/, frontmatter intact, with its remaining list and total recomputed from the committed baseline"
  artifacts:
    - path: "src/backend/testUtils/indexed.ts"
      provides: "Shared backend test helper(s) `defined(value, what)` (and `at(xs, i, what)` only if used)"
      exports: ["defined"]
    - path: "meta/indexedAccessRatchet.cjs"
      provides: "ADOPTED_BUCKETS includes all 19 tail buckets"
      contains: "'src/backend/wine'"
  key_links:
    - from: "meta/indexedAccessRatchet.cjs ADOPTED_BUCKETS"
      to: "meta/indexedAccessBaseline.json"
      via: "adopted bucket must be 0 and absent from baseline"
      pattern: "src/backend/(wine|utils|testUtils)"
    - from: "tail-bucket __tests__/*.test.ts"
      to: "src/backend/testUtils/indexed.ts"
      via: "import { defined } from '<relative>/testUtils/indexed'"
      pattern: "testUtils/indexed"
---

<objective>
Adopt `noUncheckedIndexedAccess` for the 19 small backend buckets (tail sweep, ~122 sites at
planning time), mirroring quicks 261108-ekv / 261108-d3t: fix sites, append each bucket to
ADOPTED_BUCKETS + the exact ratchet-test assertion, delete its baseline key, update the todo.

Output: ONE COMMIT PER BUCKET (19 commits), split across 3 tasks so each fresh executor
carries <= ~55 sites. Bucket names are exactly what `bucketOf()` returns (note
`src/backend/utils.ts`, `src/backend/knownFixesRegistry.ts`, `src/backend/launcher.ts`,
`src/backend/knownFixOverlayArchive.ts`, `src/backend/save_sync.ts` are single-file buckets;
their tests live in `src/backend/__tests__`, a separate bucket NOT in scope).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261108-ekv-adopt-nouncheckedindexedaccess-for-backe/261108-ekv-PLAN.md
@meta/indexedAccessRatchet.cjs
@meta/__tests__/indexedAccessRatchet.test.ts
@.planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md

Load `Skill("gamelib-conventions")` before committing (prettier `<verify>` rule, todo
frontmatter rule). Tasks 2 and 3 also read this plan's SUMMARY-so-far
(`261108-esz-SUMMARY.md`, appended per task) for the helper path and commit log.

## Shared-file protocol (applies to every task, every commit)

Other adoption quicks run before/after this one and other sessions commit to main. NEVER trust
counts in this plan; the four shared files (`meta/indexedAccessRatchet.cjs` ADOPTED_BUCKETS,
`meta/__tests__/indexedAccessRatchet.test.ts` exact `expect(ADOPTED_BUCKETS).toEqual([...])`,
`meta/indexedAccessBaseline.json`, the todo) are read fresh at each commit.

1. **Drift gate (start of each task):** run `node meta/indexedAccessRatchet.cjs`. If it is red
   for buckets NOT owned by this plan, make a separate first commit
   `chore(quick-261108-esz): reconcile indexed-access baseline drift` editing ONLY the
   baseline JSON to the measured counts (mirror d04cc89f4). If red for one of THIS plan's
   buckets, set that bucket's baseline to the measured number inside the same drift commit
   (it is reconciled before work, not hidden). Then proceed; every later commit must leave the
   ratchet at exit 0.
2. **Per-bucket commit** `refactor(quick-261108-esz): adopt noUncheckedIndexedAccess for <bucket>`:
   fix all sites (`node meta/indexedAccessRatchet.cjs --list <bucket>` must print none);
   append `'<bucket>'` at the end of ADOPTED_BUCKETS and of the ratchet-test assertion (keep
   existing order); delete the bucket's key from the baseline JSON; in the todo, add the
   bucket to the intro's "adopted" sentence (append "and for `<bucket>` (quick 261108-esz)" —
   or, once several tail buckets are in, a single grouped clause listing them), remove its
   list line, and recompute "(N in all)" as the sum of the committed baseline JSON values
   (`node -e "const b=require('./meta/indexedAccessBaseline.json');console.log(Object.values(b).reduce((a,c)=>a+c,0))"`).
   Todo stays in pending/ with `severity:`, `platform:`, `ready:` intact. If the baseline is
   empty after the last bucket, do NOT move the todo — note it in the SUMMARY.
3. **Staging:** the working tree has the user's unrelated dirty files. `git add <exact paths>`
   only; never `-A`, `.`, or `commit -a`.

## Fix patterns (no `!`, no widening casts, ever)

Source (only error-path behaviour may change; prefer explicit throw/skip/early-return over
invented defaults):
- `s.split(sep)[0]` — `String.prototype.split` always returns >= 1 element, so
  `const [first = ''] = s.split(sep)` or `s.split(sep)[0] ?? ''` is behaviour-identical.
  `split(...)[1]` and beyond CAN be missing: throw an explicit `Error` naming the input shape
  (e.g. `df` output with no data line in `utils/filesystem/unix.ts`) or return the function's
  existing failure value.
- Index after a `findIndex`/`length` guard (e.g. `releases[index]` in
  `wine/manager/utils.ts`, `wineList[0]` in `utils.ts`, `filePaths[0]` in
  `utils/openDialog.ts`, `cpus[0]` in `utils/systeminfo`): bind once
  (`const entry = releases[index]`) and move the guard onto the bound value (`if (!entry)` /
  `if (entry === undefined) return|throw|continue`), then use `entry` everywhere. Mutations
  through the bound reference are the same object, so semantics are unchanged.
- Regex groups (`m[1]`, `match[1]`): guard the group (`const g = m?.[1]; if (g === undefined) return <existing failure value>`). `?.` in source is allowed only where its result already flows into existing undefined/null handling (e.g. `m?.[1]?.trim()` feeding a `name && ...` check in `utils/macArch.ts`).
- Loop index over typed arrays/strings (`header[i]` in knownFixOverlayArchive, `lines[i]` in
  knownFixesRegistry): iterate `entries()`/`for...of`, or bind + `if (x === undefined) break|throw`
  matching the surrounding error semantics (malformed archive = throw).
- Record lookups (`gogVariableMap[variableName]` in save_sync, `commandsRunning[key]` style in
  launcher): bind to a const and test the binding; keep existing `??` fallbacks — they are the
  code's own obvious fallback.
- Numeric destructuring compared with `>`/`===` (`semverGt` in `utils.ts`): results MUST stay
  byte-identical for every input, including malformed versions where a part is missing
  (`undefined` comparisons are all false). Defaulting missing parts to `NaN` preserves this
  (`undefined > x` and `NaN > x` are both false; check the `===` chains still give the same
  final boolean) — prove it with the existing `src/backend/__tests__/utils.test.ts` suite.
- `latest` from `find(...) ?? releases[0]` (wine downloader): if undefined, skip adding the
  `-latest` entry (empty release list), do not fabricate one.

Tests:
- Use `defined(value, 'what')` from `src/backend/testUtils/indexed.ts` (created by the first
  bucket commit that needs it — Task 1's wine commit; content copied from
  `src/backend/storeManagers/steam/__tests__/fixtures/indexed.ts`). Export only helpers that
  are imported somewhere at that commit (knip flags unused exports); add `at()` in the commit
  that first uses it. Import it with a relative path, as other backend tests import
  `testUtils/fakeHomeProfile`.
- `mock.calls[0][0]` → `defined(mock.calls[0], 'first call')[0]` (or `toHaveBeenNthCalledWith`
  where it states the same thing). Array element then property → `defined(arr[i], '...').prop`.
- `?.` only inside matchers that fail on `undefined` (`toBe(x)`/`toEqual(x)` with defined x);
  never in call arguments, order comparisons, conditions, or `toBeUndefined`/`not.*` matchers.
- Test counts per touched suite must not drop.

## Per-task verification template

Let `S=<session scratchpad>`, `B=<bucket(s) adopted in this task>`, `F=<exact paths changed in
this task, incl. shared files>`. After the task's last commit:
- `node meta/indexedAccessRatchet.cjs` exit 0, and `--list <b>` empty for each b in B
- `pnpm codecheck`
- `npx jest <touched test dirs/files> <colocated suites of touched source> meta/__tests__/indexedAccessRatchet.test.ts`
- `npx eslint <F minus meta/*.cjs, .json, .md>` (meta/*.cjs is eslint-ignored)
- `pnpm boundaries`; `pnpm find-deadcode > $S/esz-knip.txt 2>&1` then confirm no line names a
  path in F (may be red on main from unrelated work)
- `pnpm planning-gates`
- `git diff <task-start-sha>..HEAD -- src | grep '^+' | grep -v '^+++'` shows no non-null
  `!` (pattern `[A-Za-z0-9_)\]]!($|[.;,)\[ ])`) and no `as (any|unknown)`
- `npx prettier --file-info <F>` first; then `npx prettier --check <F>` dropping (and noting)
  any path reported ignored
- `git show --stat` of each commit lists only that bucket's paths + the 4 shared files
  (+ `src/backend/testUtils/indexed.ts` in the commit that creates/extends it)
</context>

<tasks>

<task type="auto">
  <name>Task 1: wine, utils, utils.ts (3 commits, ~54 sites, mostly source)</name>
  <files>src/backend/testUtils/indexed.ts, src/backend/wine/manager/utils.ts, src/backend/wine/manager/downloader/utilities.ts, src/backend/wine/manager/__tests__/removeWineVersion.test.ts, src/backend/wine/manager/downloader/__tests__/main/getter.test.ts, src/backend/utils/compatibility_layers.ts, src/backend/utils/filesystem/unix.ts, src/backend/utils/filesystem/__tests__/windows.test.ts, src/backend/utils/macArch.ts, src/backend/utils/openDialog.ts, src/backend/utils/systeminfo/index.ts, src/backend/utils.ts, meta/indexedAccessRatchet.cjs, meta/__tests__/indexedAccessRatchet.test.ts, meta/indexedAccessBaseline.json, .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</files>
  <action>Run the drift gate. Before editing, snapshot `node meta/indexedAccessRatchet.cjs --list` lines for the three buckets into the scratchpad so the exact site set is known (the `files` list above is the planning-time set; fix whatever `--list` reports). Commit A `src/backend/wine`: create `src/backend/testUtils/indexed.ts` with `defined` (pattern section), fix the two test files with it; in `wine/manager/utils.ts` bind `releases[index]` once in both the update-merge loop and `removeWineVersion` (keep the existing `index !== -1` / not-found handling; the IPC-untrusted `installDir` comment and logic must stay intact); in `downloader/utilities.ts` guard the `published_at.split('T')[0]` site and skip the `-latest` unshift when no release exists. Commit B `src/backend/utils`: apply source patterns (split[0], openDialog `filePaths[0]` → return undefined as today when absent, systeminfo `cpus[0]` bound with an explicit fallback only if the function already has one, otherwise throw, unix `df` second line → explicit Error), fix windows.test with `defined`. Commit C `src/backend/utils.ts`: `semverGt` byte-identical (NaN-default reasoning in patterns), `wineList[0]` / `firstFoundWine` bound and guarded by the existing empty-list branch, `release.split('.')` major via `[major = NaN]`-style only if comparisons stay identical. Each commit follows the per-bucket protocol (ADOPTED_BUCKETS, assertion, baseline key, todo). Append a Task 1 section to `261108-esz-SUMMARY.md` (commits, helper path and exports, any behaviour notes on error paths).</action>
  <verify>
    <automated>Per-task verification template with B = src/backend/wine, src/backend/utils, src/backend/utils.ts; jest targets: src/backend/wine src/backend/utils src/backend/__tests__/utils.test.ts meta/__tests__/indexedAccessRatchet.test.ts</automated>
  </verify>
  <done>Three bucket commits (plus an optional drift commit first), each leaving the ratchet at exit 0; the three buckets adopted and absent from the baseline; helper exists and is used; all template checks green; SUMMARY Task 1 section written.</done>
</task>

<task type="auto">
  <name>Task 2: testUtils, downloadmanager, knownFixesRegistry.ts, launcher.ts, knownFixOverlayArchive.ts, save_sync.ts (6 commits, ~40 sites)</name>
  <files>src/backend/testUtils/ipcDomainParse.ts, src/backend/testUtils/ipcSchemaFixtures.ts, src/backend/testUtils/rustQuoteBalance.ts, src/backend/testUtils/indexed.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/knownFixesRegistry.ts, src/backend/launcher.ts, src/backend/knownFixOverlayArchive.ts, src/backend/save_sync.ts, meta/indexedAccessRatchet.cjs, meta/__tests__/indexedAccessRatchet.test.ts, meta/indexedAccessBaseline.json, .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</files>
  <action>Read the SUMMARY so far, run the drift gate, snapshot `--list` for the six buckets. One commit per bucket in the order listed. `src/backend/testUtils`: these are test-support parsers (ipcDomainParse, ipcSchemaFixtures, rustQuoteBalance) — a missing match/element there means the parsed source changed shape, so throw a descriptive Error (the consuming tests then fail loudly) rather than defaulting; run every test that imports these files (`grep -rl` for each basename under src and meta) and do not touch `indexed.ts` semantics. `src/backend/downloadmanager`: tests only — `defined()` / `at()` per patterns (add `at` to indexed.ts in this commit if used). `src/backend/knownFixesRegistry.ts`: registry-path segments and reg-file body parsing — missing `segments[0]`/`[1]` must take the same branch the current code takes for short paths (check `segments.length` ordering: hoist the length check or bind with undefined-aware comparison), `lines[i]` via bound/`for...of`, regex group guarded returning `false` (the function's existing mismatch value). `src/backend/launcher.ts`: 6 sites — bind-and-guard, keep `??`/existing fallbacks, the PowerShell `modifiedCommand[argumentListIndex]` rewrite must guard the bound element (skip rewrite if absent, which equals today's runtime outcome of no valid index). `src/backend/knownFixOverlayArchive.ts`: `header[i]` in the checksum loop and `header[156]` — header is a fixed-size block already length-checked; bind and throw `overlay archive: truncated header` on undefined (malformed archive already throws). `src/backend/save_sync.ts`: bind `match[0]`/`match[1]`, skip the iteration if missing; keep the `?? variableName` fallback. Jest: colocated suites in src/backend/__tests__ (knownFixes*, launcher*, knownFixOverlay*, save sync tests if present) plus downloadmanager. Append a Task 2 SUMMARY section.</action>
  <verify>
    <automated>Per-task verification template with B = src/backend/testUtils, src/backend/downloadmanager, src/backend/knownFixesRegistry.ts, src/backend/launcher.ts, src/backend/knownFixOverlayArchive.ts, src/backend/save_sync.ts; jest targets: src/backend/downloadmanager src/backend/__tests__/knownFix src/backend/__tests__/launcher every consumer of the three testUtils files, meta/__tests__/indexedAccessRatchet.test.ts</automated>
  </verify>
  <done>Six bucket commits (plus optional drift commit), each leaving the ratchet at exit 0; buckets adopted and absent from the baseline; all template checks green; SUMMARY Task 2 section written.</done>
</task>

<task type="auto">
  <name>Task 3: storeSearch, wiki_game_info, signInProbe, scanners, storeManagers/sideload, appshell, logger, platform, steamgrid, storeManagers/nile (10 commits, ~28 sites)</name>
  <files>src/backend/storeSearch/__tests__/cheapshark.test.ts, src/backend/wiki_game_info/howlongtobeat/utils.ts, src/backend/wiki_game_info/umu/utils.ts, src/backend/wiki_game_info/applegamingwiki/__tests__/utils.test.ts, src/backend/signInProbe/classify.ts, src/backend/signInProbe/__tests__/pass.test.ts, src/backend/scanners/__tests__/scanChannelParity.test.ts, src/backend/storeManagers/sideload/games.ts, src/backend/storeManagers/sideload/library.ts, src/backend/appshell/__tests__/appshellModules.test.ts, src/backend/logger/sanitizeRendererLogMessage.ts, src/backend/platform/__tests__/types.usage.test.ts, src/backend/steamgrid/__tests__/secretStore.test.ts, src/backend/storeManagers/nile/games.ts, src/backend/testUtils/indexed.ts, meta/indexedAccessRatchet.cjs, meta/__tests__/indexedAccessRatchet.test.ts, meta/indexedAccessBaseline.json, .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</files>
  <action>Read the SUMMARY so far, run the drift gate, snapshot `--list` for the ten buckets. One commit per bucket in the listed order (prefer per-bucket; do not group). Test-only buckets (storeSearch, scanners, appshell, platform, steamgrid): `defined()`/`at()` from `src/backend/testUtils/indexed.ts` per patterns. Source sites: howlongtobeat/umu parsers — bind and return the function's existing "no data" value on a missing element; `signInProbe/classify.ts` — this classifies sign-in probe results, so a missing element must fall through to the existing unknown/indeterminate classification, never to a "signed in" result; sideload games/library and nile games — bind-and-guard, skip/return as the surrounding function already does for not-found; `logger/sanitizeRendererLogMessage.ts` — a missing group must leave the message unredacted ONLY if that is impossible to reach for valid input; otherwise keep redaction conservative (redact on doubt) since this is a log-sanitising boundary. Jest: each touched bucket's test dir plus colocated suites for touched source (`src/backend/logger`, `src/backend/wiki_game_info`, `src/backend/signInProbe`, sideload/nile tests if present). After the last commit confirm none of the 19 buckets remains in the baseline JSON. Append a Task 3 SUMMARY section with the final remaining-sites total.</action>
  <verify>
    <automated>Per-task verification template with B = src/backend/storeSearch, src/backend/wiki_game_info, src/backend/signInProbe, src/backend/scanners, src/backend/storeManagers/sideload, src/backend/appshell, src/backend/logger, src/backend/platform, src/backend/steamgrid, src/backend/storeManagers/nile; jest targets: those directories plus meta/__tests__/indexedAccessRatchet.test.ts</automated>
  </verify>
  <done>Ten bucket commits (plus optional drift commit), each leaving the ratchet at exit 0; all 19 tail buckets now in ADOPTED_BUCKETS and the assertion, none in the baseline; todo total equals the baseline sum; all template checks green; SUMMARY complete.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer IPC -> wine/manager/utils.ts removeWineVersion | `release` is untrusted; only the backend-recorded installDir may be removed |
| renderer log text -> logger/sanitizeRendererLogMessage.ts | Untrusted strings must stay redacted |
| remote catalogue/HTML -> wiki_game_info parsers, wine release JSON | Malformed remote data now reaches explicit error/skip paths |
| tests | Assertions must not pass vacuously |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261108-esz-01 | Tampering | removeWineVersion | mitigate | Bind `releases[index]` and keep removing only its recorded `installDir`; never fall back to the IPC-supplied path |
| T-261108-esz-02 | Information disclosure | sanitizeRendererLogMessage | mitigate | Missing-group branch keeps redaction conservative; logger jest suite must pass |
| T-261108-esz-03 | Spoofing | signInProbe/classify.ts | mitigate | Missing element falls to the existing unknown classification, never "signed in"; signInProbe suite passes |
| T-261108-esz-04 | Repudiation (test integrity) | tail-bucket tests | mitigate | `defined()`/`at()` throw on missing values; `?.` banned outside failing matchers; test counts unchanged |
| T-261108-esz-05 | Tampering (repo state) | commits | mitigate | Stage exact paths only; ratchet exit 0 per commit; shared files read fresh |
</threat_model>

<verification>
- Ratchet exits 0 after every commit; all 19 buckets adopted, at 0, absent from baseline.
- `pnpm codecheck`, scoped jest, eslint, boundaries, planning-gates green; find-deadcode has no
  finding on touched paths; no added `!` or widening casts; scoped prettier check passes.
</verification>

<success_criteria>
- 19 per-bucket commits (plus any drift-reconcile commits), each self-consistent.
- No valid-input behaviour change; no weakened assertions.
- Todo in pending/ with accurate remaining list and recomputed total.
</success_criteria>

<output>
Append per task to `.planning/quick/261108-esz-adopt-nuia-backend-tail/261108-esz-SUMMARY.md`.
</output>
