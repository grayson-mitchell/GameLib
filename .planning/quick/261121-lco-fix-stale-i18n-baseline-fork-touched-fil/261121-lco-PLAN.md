---
phase: quick-261121-lco
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
  - meta/i18nCatalogPresenceBaseline.json
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
  - .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md
  - .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md
autonomous: true
requirements:
  - QUICK-261121-lco

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`pnpm gameinfo-narrowing-ceiling` exits 0 because SettingsModalHeader.tsx now counts 0, while meta/gameInfoNarrowingBaseline.json and meta/gameInfoNarrowingCeiling.cjs are byte-identical to HEAD (the ceiling was not raised)"
    - "The settings dialog header still reads 'Steam App ID' for a Steam game and 'App ID' for any other store; SettingsModalHeader.test.tsx passes 5/5 unedited"
    - "`pnpm lint-translations:gamelib` reports 0 hard failures, and meta/__tests__/lintTranslations.test.ts passes 32/32. meta/i18nCatalogPresenceBaseline.json was written by its own generator (`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`): 1728 pairs added, 0 removed, totalPairs 14640 -> 16368, 305 -> 341 keys"
    - "meta/i18nForkTouchedFiles.json is exactly the output of `pnpm gen-i18n-gate-scope` (445 files, the 6 paths quick 261121-dzl made fork-touched added, nothing removed), and meta/__tests__/genI18nGateScope.test.ts has 0 failures, A-17 ANTI-ROT included"
    - "The blocking hardcoded-string gate is not loosened. The five files that audit at 0 violations move into meta/i18nGateScope.json (317 -> 322), so the gate now scans them. tabs.ts (2 false-positive hits) goes into DECLARED_UNSCANNED_DEBT, and meta/__tests__/hardcodedStringGate.test.ts stays green. meta/i18nGateAllowlist.json, meta/i18nGlossary.json, meta/hardcodedStringGate.ts and meta/genI18nGateScope.ts are unchanged"
    - "Each commit holds only paths this task wrote. No file another session left dirty is staged or committed: public/locales/en/gamelib.json, native/steam-bridge/*, src/backend/storeManagers/steam/bridge/*, .planning/state.json and the rest. Nothing is pushed"
    - "The todo is in .planning/todos/completed/ with a Resolution section, and is no longer in pending/"
  artifacts:
    - path: src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
      provides: "App-ID label chosen from the runner string, not from the GameInfo object"
      contains: "isStore(runner, 'steam')"
    - path: meta/i18nCatalogPresenceBaseline.json
      provides: "presence baseline recording the 36 new gamelib keys across 48 locales"
    - path: meta/i18nForkTouchedFiles.json
      provides: "fork-touched list regenerated from the live merge-base diff (445 files)"
    - path: meta/i18nGateScope.json
      provides: "hand-curated blocking scope with the five zero-violation files inserted (322 files)"
    - path: meta/__tests__/genI18nGateScope.test.ts
      provides: "dated ledger entry, tabs.ts declared debt, count pins 317/439 -> 322/445"
  key_links:
    - from: src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
      to: meta/gameInfoNarrowingCeiling.cjs
      via: "countNarrowing(): an isStore() call whose first argument is an identifier matching /runner|store/i is a runner-string identity check and is not counted"
    - from: meta/i18nCatalogPresenceBaseline.json
      to: meta/lintTranslations.ts
      via: "comparePresenceBaseline() symmetric difference against missingPairs(); R13 and the REQ-41-02 committed-tree test"
    - from: meta/i18nForkTouchedFiles.json
      to: meta/__tests__/genI18nGateScope.test.ts
      via: "A-17 ANTI-ROT (equals the live git derivation) and the A-03 RATCHET (fork-touched minus scope equals DECLARED_UNSCANNED_DEBT)"
    - from: meta/i18nGateScope.json
      to: meta/hardcodedStringGate.ts
      via: "scanScope() reads the committed scope; hardcodedStringGate.test.ts asserts the real scope scans clean"
---

<objective>
Turn the three red gates that quick 261121-dzl left on unpushed main back to green, using the repo's own generators and the existing curation path. Do not loosen any gate.

1. Remove the new GameInfo narrowing in SettingsModalHeader.tsx. Do not raise the ceiling.
2. Regenerate meta/i18nCatalogPresenceBaseline.json with its own writer.
3. Regenerate meta/i18nForkTouchedFiles.json with `pnpm gen-i18n-gate-scope`, then do the curation that every earlier regeneration has paired with it: audit, promote into scope, declare debt, update the ledger and the count pins.

Then move the todo to completed/.

Purpose: a push of main as it stands turns the Test and Lint workflows red, and that blocks Phase 82 UAT item 2's re-test (G-82-2-r2 needs a green Test run on a main sha that contains 82-20).

Output: three code/artifact commits and one todo-move commit. Nothing is pushed; pushing is left to the user or orchestrator.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md
@src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
@meta/gameInfoNarrowingCeiling.cjs

Load Skill("gamelib-conventions") before writing any `<verify>` evidence. The formatter rule applies to every path below.

Grounding gathered at planning (2026-11-21, HEAD 88dd4edaf; the only commit after 0a961abb5 is a planning-docs commit from another session). Every number was measured, not assumed:

**Gate 1: gameinfo-narrowing-ceiling.** `pnpm gameinfo-narrowing-ceiling` prints `FAIL [grew]: src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx has 1, baseline 0`. The counted form is line 37's isStore call, whose first argument is the `gameInfo` object. meta/gameInfoNarrowingCeiling.cjs counts `isStore(<object>, '<literal>')` unless the first argument is a string literal, or an identifier or property access named like /runner|store/i (function isObjectSubject). isStore in src/common/storeCapabilities.ts has an overload that takes a plain runner string and returns boolean, the same form SyncSaves/index.tsx, AlternativeExe.tsx and OfflineMode.tsx already use (`isStore(runner, 'legendary')`). At planning, the module's exported `countNarrowing()` was run in memory on the file with `runner` destructured and passed instead. It returned 0, against 1 now.

**Gates 2 and 3: lintTranslations REQ-41-02 and R13.** `pnpm lint-translations:gamelib` exits 1 with `16368 findings, 1728 hard failures`. All 1728 are `added` ("a new key is not localised and was not recorded"): 36 new gamelib keys x 48 locales. 0 are `removed`. The 36 keys are engine.wineTabNote, settings.cards.* (7), settings.fields.* (19), settings.modal.* (5), settings.navbar.wine, settings.navbar.winetricks, steam.directLaunch.description and steam.directLaunch.risk. The sanctioned path is the writer built into meta/lintTranslations.ts, `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` (writePresenceBaseline). It writes ONLY meta/i18nCatalogPresenceBaseline.json and never touches public/locales. The gate's own failure text offers "fill it or regenerate the baseline", and precedent records new fork keys this way: a7bf4dfe5 `chore(64-10): record the customThemes catalogue keys in the i18n presence baseline` and 8835f1dfb (68-09). The baseline is a record of known gaps; filling 48 locales is not asked for here, so `pnpm machine-fill-gamelib` is out of scope. Committed baseline: totalPairs 14640, 305 keys. Expected after regeneration: 16368 pairs, 341 keys. jest lintTranslations.test.ts at HEAD: 2 failed, 30 passed.

**The pre-dirty catalog.** public/locales/en/gamelib.json is dirty from another session, 3 insertions and 3 deletions. At planning its flattened key-to-value map was identical to HEAD's: 939 keys each side, 0 added, 0 removed, 0 value changes. It is a pure reorder. missingPairs() keys off the key set and values only, so a baseline derived from the working tree equals one derived from HEAD. No other locale catalog is dirty. Neither generator in this plan writes any file under public/locales/. This file must never be staged.

**Gate 4: genI18nGateScope A-17 ANTI-ROT.** The todo has this backwards. The committed artifact does NOT list stale removed files; it is MISSING six files that quick 261121-dzl made fork-touched. In jest's diff, the `- Expected` side is the live derivation. The six:
- dzl modified three files that were identical to upstream: screens/Settings/components/AfterLaunchScriptPath.tsx, BeforeLaunchScriptPath.tsx and VerboseLogs.tsx (`M` in `git diff --name-status <baseCommit> HEAD`).
- dzl created three: screens/Settings/components/SettingsModal/SettingsModalHeader.tsx, screens/Settings/sections/GamesSettings/SettingsCard.tsx and screens/Settings/sections/GamesSettings/tabs.ts.

jest genI18nGateScope.test.ts at HEAD: 1 failed, 1 skipped, 25 passed, 27 total.

The generator was dry-run at planning in a sacrificial CWD (GIT_DIR/GIT_WORK_TREE, as its header instructs), and the real artifacts' md5 was unchanged before and after. It printed `Left meta/i18nGateScope.json untouched` and `Wrote meta/i18nForkTouchedFiles.json: 445 fork-touched eligible files.` Its diff against the committed file was exactly +6 paths plus a new `generatedAt` (numstat `7 1`), with no removals and `purpose` byte-identical. The generator diffs the merge base against committed HEAD, not the working tree.

**The curation that a regeneration forces.** Without it, the A-03 RATCHET and the pins go red. After regenerating, the six files are fork-touched but appear in neither meta/i18nGateScope.json nor DECLARED_UNSCANNED_DEBT, so the A-03 RATCHET fails by name. The pins in meta/__tests__/genI18nGateScope.test.ts also read stale counts:
- line 1434 `toBe(317)`
- line 1435 `toBe(439)`
- line 1512 `toBe(439)`
- line 1530 `toBe(439)`
- the titles at lines 1433, 1476, 1499 and 1517, which say 317 and 439.

Every earlier regeneration resolved this the same way (the ledger at lines ~150-578, e.g. 261029-nmt, 261103-wjs, 261117-pfj, 82-06). Run each new file through audit-mode `scanScope({ extraFiles })` from meta/hardcodedStringGate.ts. A file with 0 violations is hand-inserted into meta/i18nGateScope.json in sorted position, and the file's `generatedBy` gets a "then quick ..." clause appended. A file with hits is declared in DECLARED_UNSCANNED_DEBT. Fixing a false positive by editing product code was rejected as a route (the 2026-10-05 translationIssue.ts precedent).

Measured at planning: baseline `scanScope()` scanned 317 files with 0 violations. The audit with all six scanned 323 with 2 violations, both in tabs.ts: line 71 `--setting_tab` and line 76 `-setting_tab`. These are localStorage key template literals in settingTabKey/legacyTabKey, identifiers that are never rendered. The other five scanned 0.

Discretion taken (this is the scope decision; the orchestrator can veto it): the five zero-violation files are promoted into scope (317 -> 322), and tabs.ts is declared debt (+1). This is the stricter of the two precedented routes. Declaring all six as debt would also turn the suite green, but it would leave five scannable files unscanned. Insert positions, sorted by JS default sort, with each file's neighbours:
- AfterLaunchScriptPath.tsx goes after `screens/Login/signInTileState.ts` and before `screens/Settings/components/AlternativeExe.tsx`.
- BeforeLaunchScriptPath.tsx goes after AlternativeExe.tsx and before `CheckUpdatesOnStartup.tsx`.
- SettingsModal/SettingsModalHeader.tsx goes after `ResetHeroic.tsx` and before `SettingsModal/index.tsx`.
- VerboseLogs.tsx goes after `SteamOverlayOverride.tsx` and before `WineVersionSelector.tsx`.
- sections/GamesSettings/SettingsCard.tsx goes after `screens/Settings/index.tsx` and before `sections/GeneralSettings/index.tsx`.

**Formatter probe** (`npx prettier --file-info`):
- These report `{ "ignored": false, ... }`: SettingsModalHeader.tsx (typescript), meta/i18nCatalogPresenceBaseline.json, meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json (json) and meta/__tests__/genI18nGateScope.test.ts (typescript). All five pass `npx prettier --check` at HEAD.
- `.planning/todos/**` reports `{ "ignored": true, "inferredParser": null }`. A prettier check over it is vacuous, so the todo move carries none.

**Baselines at HEAD:** `pnpm codecheck` exits 0, eslint on SettingsModalHeader.tsx exits 0, `pnpm planning-gates` gives 12/12, and SettingsModalHeader.test.tsx passes 5/5. hardcodedStringGate.test.ts plus the two gameInfoNarrowing suites pass 223/223; that run takes about 3 minutes.

**Concurrency.** Another session is committing to this checkout while this runs: 88dd4edaf landed during planning. Its uncommitted files include native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/*, public/locales/en/gamelib.json, .planning/state.json, .planning/debug/*, .planning/spikes/*, .planning/todos/completed/2026-10-31-*.md and 2026-11-01-*.md, the untracked .planning/todos/pending/2026-11-20-*.md and the root `Schedule I Free Sample.dxvk-cache`. Rules for every commit in this plan:
- Commit with an explicit pathspec, `git commit -m "<msg>" -- <paths>`, so only the named paths enter it whatever else is in the index.
- Never use `git add -A`, `git add .`, `git commit -a`, or a gsd-tools commit without `--files` (that sweeps every dirty .planning file).
- End each message with the session's attribution trailers.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Remove the GameInfo narrowing from SettingsModalHeader.tsx so gameinfo-narrowing-ceiling passes, without raising the ceiling</name>
  <files>src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx</files>
  <precondition>`pnpm codecheck` exits 0 on the working tree before the edit (measured 0 at planning). If the other session's dirty src/backend/storeManagers/steam/bridge/* files now break it, halt and report; do not touch them.</precondition>
  <action>
In SettingsModalHeader.tsx, choose the App-ID label from the runner string instead of the GameInfo object:
- Add `runner` to the existing destructure on line 18, so it reads title, app_name as appName, and runner from gameInfo.
- Pass `runner` as the first argument of the isStore call that picks between `gamelib:settings.modal.steamAppId` and `gamelib:settings.modal.appId`, leaving the second argument as `'steam'`.

This picks isStore's plain-string overload (src/common/storeCapabilities.ts: subject `string | null | undefined | { runner?: string | null }`, returns boolean). The rendered output is unchanged: Steam still gets "Steam App ID" and every other runner gets "App ID". The ceiling counts it as an identity check, not a narrowing, because the argument is an identifier matching /runner|store/i (isObjectSubject in meta/gameInfoNarrowingCeiling.cjs).

Change nothing else in the file. Leave the import of isStore in place, because it is still used. Do not touch meta/gameInfoNarrowingBaseline.json or meta/gameInfoNarrowingCeiling.cjs; the todo forbids raising the ceiling, and a baseline entry for a file at 0 is itself a stale-entry failure. Do not edit the test file: tests G and I already prove the steam and gog labels.

Run the verify gates, then commit with `git commit -m "fix(quick-261121-lco): pick the settings header App-ID label from the runner string, not GameInfo" -- src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx` plus the attribution trailers. If graphify is on PATH, run `graphify update .` afterwards. It is AST-only, writes only the gitignored graphify-out/ and does not gate anything.
  </action>
  <verify>
    <automated>Run each line from the checkout root, in order. Every line must exit 0. The HEAD values were measured at planning on 88dd4edaf, with the working tree as described in context.
pnpm -s gameinfo-narrowing-ceiling   # gate 1, the red lint gate [HEAD=error:1 EXPECT==0 GUARD MUTATION: revert the call's first argument to the gameInfo object and it prints FAIL [grew] ... has 1, baseline 0]
grep -cF "isStore(runner, 'steam')" src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx   # gate 2, match count [HEAD=0 EXPECT==1]
git diff --quiet HEAD -- meta/gameInfoNarrowingBaseline.json meta/gameInfoNarrowingCeiling.cjs   # gate 3, a regression guard: the ceiling was not raised or edited [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: add a SettingsModalHeader.tsx entry to meta/gameInfoNarrowingBaseline.json and git diff --quiet exits 1]
npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx   # gate 4, a regression guard: the label behaviour is unchanged, 5 of 5 passed at planning and 5 of 5 must pass after [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: pass 'gog' instead of 'steam' as isStore's second argument and test G (Steam App ID) fails]
npx eslint src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx   # gate 5, a regression guard [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: destructure runner but leave it unused and no-unused-vars fails]
pnpm -s codecheck   # gate 6, a regression guard [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: pass the number 1 as isStore's first argument and tsc fails with no matching overload]
npx prettier --file-info src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx   # gate 7, the formatter check; file-info printed { "ignored": false, "inferredParser": "typescript" } at planning, so it is not vacuous [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: re-indent the destructure line to 4 spaces and --check exits 1]
test "$(git show --name-only --format= HEAD)" = "src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx"   # gate 8, run after the commit: it holds exactly one path [HEAD=error:1 EXPECT==0]</automated>
  </verify>
  <done>`pnpm gameinfo-narrowing-ceiling` exits 0 with the baseline and ceiling script byte-identical to HEAD. SettingsModalHeader.test.tsx passes 5/5 unedited, and eslint, codecheck and prettier are clean on the file. The commit contains only SettingsModalHeader.tsx.</done>
</task>

<task type="auto">
  <name>Task 2: Regenerate the gamelib presence baseline with its own writer so lintTranslations REQ-41-02 and R13 pass</name>
  <files>meta/i18nCatalogPresenceBaseline.json</files>
  <precondition>The working-tree public/locales/en/gamelib.json still has the same flattened key-to-value map as HEAD, and no other file under public/locales is dirty. This is gate 0 below, and it passed at planning. If another session has since added, removed or changed a gamelib key, halt and report: the writer reads the working tree and would record pairs for an uncommitted catalog.</precondition>
  <action>
Run gate 0 first. Then, from the checkout root, run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm -s lint-translations:gamelib`. That is the writer meta/lintTranslations.ts reserves for this job, and it exits 0 unconditionally. Its stdout must read:
- `Wrote meta/i18nCatalogPresenceBaseline.json: 16368 pairs across 341 keys`
- `Added (new blind spot recorded): 1728`, every added line one of the 36 keys listed in context, for a non-en locale
- `Removed (no longer missing): 0`

Save that stdout under the session scratchpad and copy the three summary lines into the SUMMARY. If Added or Removed differ, halt: something other than the 261121-dzl keys has moved.

Take the writer's output verbatim, including its new `generatedAt`. Do not hand-edit the file, and do not compare or "fix" counts by hand; the writer derives `totalPairs` from `missing`, and R21 fails any desync. Do not fill locales and do not run `pnpm machine-fill-gamelib`: recording the gap is the sanctioned path and matches a7bf4dfe5 and 8835f1dfb. The writer touches nothing under public/locales, and public/locales/en/gamelib.json stays unstaged (gate 5).

Run the remaining gates, then commit with `git commit -m "chore(quick-261121-lco): record the 261121-dzl gamelib keys in the i18n presence baseline" -- meta/i18nCatalogPresenceBaseline.json` plus the attribution trailers.
  </action>
  <verify>
    <automated>Run each line from the checkout root, in order. Every line must exit 0. HEAD values were measured at planning.
node -e "const cp=require('child_process'),fs=require('fs');const fl=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const q=p?p+'.'+k:k;v&&typeof v==='object'?fl(v,q,r):(r[q]=v)}return r};const a=fl(JSON.parse(cp.execSync('git show HEAD:public/locales/en/gamelib.json'))),b=fl(JSON.parse(fs.readFileSync('public/locales/en/gamelib.json','utf8')));const ka=Object.keys(a),kb=Object.keys(b);const same=ka.length===kb.length&&ka.every(k=>b[k]===a[k]);const dirty=cp.execSync('git diff --name-only -- public/locales').toString().trim().split('\n').filter(Boolean);console.log('keys',ka.length,kb.length,'same',same,'dirty',dirty.join(','));process.exit(same&&dirty.every(p=>p==='public/locales/en/gamelib.json')?0:1)"   # gate 0, the precondition: the working-tree catalogs carry HEAD's gamelib content. At planning it printed keys 939 939 same true dirty public/locales/en/gamelib.json [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: rename any one key in the working-tree en/gamelib.json and same is false, exit 1]
node -e "const b=require('./meta/i18nCatalogPresenceBaseline.json');const k=Object.keys(b.missing).length;console.log(b.totalPairs,k);process.exit(b.totalPairs===16368&&k===341&&b.generatedBy==='Phase 41 REQ-41-01'?0:1)"   # gate 1, the writer's output landed: printed 14640 305 at planning, must print 16368 341 [HEAD=error:1 EXPECT==0 @88dd4edaf]
pnpm -s lint-translations:gamelib   # gate 2, the CLI gate. At planning its last line read 16368 findings, 1728 hard failures; after, it must read lint-translations[gamelib]: 16368 findings, 0 hard failures (findings do not fail) [HEAD=error:1 EXPECT==0 @88dd4edaf]
npx jest --selectProjects Meta --runTestsByPath meta/__tests__/lintTranslations.test.ts   # gate 3, REQ-41-02's committed-tree test and R13 go green, and R21c self-consistency holds: 2 failed and 30 passed at planning, 32 of 32 must pass after [HEAD=error:1 EXPECT==0 @88dd4edaf]
npx prettier --file-info meta/i18nCatalogPresenceBaseline.json | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check meta/i18nCatalogPresenceBaseline.json   # gate 4, the formatter check; file-info printed { "ignored": false, "inferredParser": "json" } at planning [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: collapse one missing-locale array onto a single line and --check exits 1]
git diff --cached --quiet -- public/locales && test "$(git diff --name-only -- public/locales)" = "public/locales/en/gamelib.json"   # gate 5, a regression guard: no catalog is staged, and only the other session's pre-dirty en file differs from HEAD [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: git add public/locales/en/gamelib.json and git diff --cached --quiet exits 1]
test "$(git show --name-only --format= HEAD)" = "meta/i18nCatalogPresenceBaseline.json"   # gate 6, run after the commit: it holds exactly one path [HEAD=error:1 EXPECT==0]</automated>
  </verify>
  <done>The baseline was written by `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`: 1728 added, 0 removed, 16368 pairs, 341 keys. `pnpm lint-translations:gamelib` reports 0 hard failures, lintTranslations.test.ts passes 32/32, and the file is prettier-clean. No public/locales file is staged or committed. The commit contains only the baseline.</done>
</task>

<task type="auto">
  <name>Task 3: Regenerate i18nForkTouchedFiles.json with pnpm gen-i18n-gate-scope, curate scope and debt for the six new fork-touched files, and close the todo</name>
  <files>meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts, .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md, .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md</files>
  <precondition>The upstream merge-base object is reachable, so `git cat-file -e "$(node -p "require('./package.json').upstream.baseCommit")"` exits 0. It did at planning, because A-17 ANTI-ROT ran and was not skipped. If it fails, halt: the generator cannot run, and A-17 would skip rather than prove anything.</precondition>
  <action>
**Step A. Regenerate.** From the checkout root, run `pnpm -s gen-i18n-gate-scope`. Never run `pnpm gen-i18n-scope:rewrite`, and never pass `--rewrite-scope`: meta/i18nGateScope.json is hand-curated, and the generator must leave it untouched.

It must print `Left meta/i18nGateScope.json untouched` and `Wrote meta/i18nForkTouchedFiles.json: 445 fork-touched eligible files.`, and `git diff --numstat -- meta/i18nForkTouchedFiles.json` must read `7 1`. The +7 are the six paths named in context plus the new `generatedAt`; the -1 is the old `generatedAt`. If any path is removed, if any path outside those six is added, or if `purpose` changed, halt and report: another session's frontend file has landed, and placing it in scope is that session's decision.

Keep the generator's bytes verbatim, including the new `generatedAt`. The todo forbids hand edits, and 47-19 is the precedent for keeping the generator's timestamp.

**Step B. Audit before promoting anything.** Write a throwaway script under the session scratchpad, never inside the repo. It imports `scanScope` from the absolute path of meta/hardcodedStringGate.ts; the module has no self-exec guard and no top-level side effects, so importing it is safe. The script prints:
- `scanScope()`'s scannedFiles and violations count
- `scanScope({ extraFiles: [the six repo-relative paths] })`'s scannedFiles, plus the per-file violation count and line numbers for each of the six.

Run it from the checkout root with `node meta/runTs.cjs --bundle --platform=node --target=node21 <scratch script path>`. Scope paths are CWD-relative. Expected output, as measured at planning:
- baseline: 317 files, 0 violations
- audit: 323 files, 2 violations, both in screens/Settings/sections/GamesSettings/tabs.ts at lines 71 and 76
- the other five: 0 each

Record the output in the SUMMARY. If the numbers differ, apply the same per-file rule rather than this plan's list: 0 violations means promote into scope; any hit means declare as debt. Never edit product code, meta/i18nGateAllowlist.json or meta/i18nGlossary.json to quiet a hit. Those registers are pinned, and a widened allowlist is exactly the loosening the todo forbids.

**Step C. Edit meta/i18nGateScope.json by hand, surgically.** This file is meant for hand curation. Its own `generatedBy` marks it hand-edited, and A5 PROVENANCE RATCHET requires it to stay that way.
- Insert the five zero-violation paths into `files` at the sorted slots listed in context: AfterLaunchScriptPath.tsx, BeforeLaunchScriptPath.tsx, SettingsModal/SettingsModalHeader.tsx, VerboseLogs.tsx and sections/GamesSettings/SettingsCard.tsx, all under src/frontend/screens/Settings/. That takes `files` from 317 to 322.
- Append this clause to the end of the `generatedBy` string, immediately after its final `-- still NOT a pnpm gen-i18n-gate-scope run`: `, then quick 261121-lco added AfterLaunchScriptPath.tsx, BeforeLaunchScriptPath.tsx, VerboseLogs.tsx, SettingsModal/SettingsModalHeader.tsx and GamesSettings/SettingsCard.tsx (made fork-touched by quick 261121-dzl) after an audit-mode scanScope({ extraFiles }) showed 0 violations; GamesSettings/tabs.ts is declared unscanned debt instead -- still NOT a pnpm gen-i18n-gate-scope run`.
- Leave `generatedAt`, `baseCommit`, `baseVersion` and `excluded` untouched. Match the file's existing two-space indentation.

**Step D. Edit meta/__tests__/genI18nGateScope.test.ts.**

(1) Insert a dated ledger entry directly before the ` */` that closes the comment block above `const DECLARED_UNSCANNED_DEBT` (after the "2026-11-18 (phase 64 plan 06)" entry). Write it in the house style: ` * ` prefix, wrapped to the neighbouring entries' width, separated by a ` *` blank line. It records:
- fork-touched 439 -> 445 by a fresh `pnpm gen-i18n-gate-scope` (committed first), scope 317 -> 322.
- Quick 261121-dzl made six src/frontend files fork-touched without regenerating the artifact. It edited the upstream AfterLaunchScriptPath.tsx, BeforeLaunchScriptPath.tsx and VerboseLogs.tsx, and created SettingsModal/SettingsModalHeader.tsx, GamesSettings/SettingsCard.tsx and GamesSettings/tabs.ts.
- The filing todo read the A-17 diff as stale entries; they were missing ones.
- Audit-mode `scanScope({ extraFiles })` found 2 violations, both in tabs.ts (:71, :76): localStorage key templates, identifiers that are never rendered.
- The other five audited ZERO and were hand-inserted in sorted position into scope. They are SCANNED, not declared debt.
- tabs.ts is declared below rather than promoted, because editing product code to quiet a false positive is the route the translationIssue.ts precedent rejected.
- DECLARED_UNSCANNED_DEBT +1.

(2) Add `'src/frontend/screens/Settings/sections/GamesSettings/tabs.ts',` to DECLARED_UNSCANNED_DEBT, directly after `'src/frontend/screens/Settings/sections/GamesSettings/index.tsx',` (line 620 at planning), preceded by a one-line `// quick 261121-lco: ...` comment naming the two key-template hits. The ratchet sorts before comparing, so the position is for readers only.

(3) Update the count pins to the new committed counts:
- line 1434 `toBe(317)` becomes `toBe(322)`
- lines 1435, 1512 and 1530 `toBe(439)` become `toBe(445)`
- the four titles: A0 at 1433 becomes "REAL 322-file" and "committed 445-file", A2 at 1476 becomes "real 322 -> 445 diff", A3 at 1499 becomes "rewrite it to 445", A4 at 1517 becomes "creates it with 445 files".

Leave the historical numbers in older ledger entries alone. Change no assertion logic, and do not touch the A-17/A-03 bodies, the D-17 deferrals or the non-vacuity tests.

**Step E. Verify, then commit the three artifacts.** Run gates 1-6. Then commit with `git commit -m "chore(quick-261121-lco): regenerate i18n fork-touched list; scope five 261121-dzl files, declare tabs.ts debt" -- meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts` plus the attribution trailers.

**Step F. Close the todo.**
- Append a `## Resolution` section to .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md. It names the three commit SHAs (Tasks 1-3) and corrects the A-17 framing: the artifact was missing six newly fork-touched files, not listing removed ones. It also records the 317 -> 322 scope promotion and the tabs.ts debt entry.
- Leave the frontmatter as it is. completed/ is exempt from the triage gate, and the keys are already valid.
- Run `git mv .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md .planning/todos/completed/`.
- Commit with `git commit -m "docs(quick-261121-lco): close the i18n baseline and fork-touched regen todo" -- .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md` plus the attribution trailers.
- Run gates 7-9.

Do not push.
  </action>
  <verify>
    <automated>Run each line from the checkout root, in order. Every line must exit 0. HEAD values were measured at planning. Gates 1-6 run before the Step E commit, and gates 7-9 after Step F.
node -e "const f=require('./meta/i18nForkTouchedFiles.json'),s=require('./meta/i18nGateScope.json');const P='src/frontend/screens/Settings/';const prom=['components/AfterLaunchScriptPath.tsx','components/BeforeLaunchScriptPath.tsx','components/SettingsModal/SettingsModalHeader.tsx','components/VerboseLogs.tsx','sections/GamesSettings/SettingsCard.tsx'].map(x=>P+x);const tabs=P+'sections/GamesSettings/tabs.ts';const sorted=JSON.stringify(s.files)===JSON.stringify([...new Set(s.files)].sort());const ok=f.files.length===445&&s.files.length===322&&sorted&&prom.every(x=>s.files.includes(x)&&f.files.includes(x))&&f.files.includes(tabs)&&!s.files.includes(tabs)&&f.generatedBy==='pnpm gen-i18n-gate-scope'&&s.generatedBy.includes('261121-lco');console.log(f.files.length,s.files.length,sorted);process.exit(ok?0:1)"   # gate 1, the artifact shape: 445 fork-touched; 322 in scope, sorted and unique; the five promoted; tabs.ts fork-touched but not in scope; scope provenance still hand-curated with the new clause. Printed 439 317 true at planning, must print 445 322 true [HEAD=error:1 EXPECT==0 @88dd4edaf]
npx jest --selectProjects Meta --runTestsByPath meta/__tests__/genI18nGateScope.test.ts   # gate 2, A-17 ANTI-ROT, the A-03 RATCHET and the A0-A5 pins all pass: 1 failed, 1 skipped and 25 passed at planning; 0 failed, 1 skipped and 26 passed after [HEAD=error:1 EXPECT==0 @88dd4edaf]
npx jest --selectProjects Meta --runTestsByPath meta/__tests__/hardcodedStringGate.test.ts   # gate 3, a regression guard: the blocking gate scans the widened real scope clean. It takes about 3 minutes, so give it a 600000 ms timeout [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: also insert tabs.ts into meta/i18nGateScope.json and its two key-template literals fail the real-scope scan]
git diff --quiet HEAD -- meta/i18nGateAllowlist.json meta/i18nGlossary.json meta/hardcodedStringGate.ts meta/genI18nGateScope.ts meta/lintTranslations.ts meta/gameInfoNarrowingBaseline.json   # gate 4, a regression guard: no gate source or exemption register was loosened [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: add a tabs.ts entry to meta/i18nGateAllowlist.json and git diff --quiet exits 1]
for p in meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || exit 1; done && npx prettier --check meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts   # gate 5, the formatter check over the three written paths, each of which reported "ignored": false at planning. The todo is under .planning (ignored), so a check over it would prove nothing and none is run [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: indent one inserted scope path with 6 spaces instead of 4 and --check exits 1]
npx eslint meta/__tests__/genI18nGateScope.test.ts   # gate 6, a regression guard. eslint.config.mjs uses eslint-config-prettier, so this checks lint rules, not formatting; gate 5 covers formatting [HEAD=0 EXPECT==0 @88dd4edaf GUARD MUTATION: add an unused top-level const and @typescript-eslint/no-unused-vars fails]
A=$(git show --name-only --format= HEAD~1) && R=$(git show --name-status --format= HEAD) && N=$(git show --name-only --format= HEAD) && test "$(printf '%s\n' "$A" | sort | paste -s -d ' ' -)" = "meta/__tests__/genI18nGateScope.test.ts meta/i18nForkTouchedFiles.json meta/i18nGateScope.json" && printf '%s\n' "$R" | grep -Eq '^R[0-9]*[[:space:]]+\.planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen\.md[[:space:]]+\.planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen\.md$' && test "$N" = ".planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md"   # gate 7, after Step F: the artifact commit holds exactly the three meta paths, and the todo commit is exactly the one rename. Each git output is captured first so a failing git cannot hide behind a pipe [HEAD=error:1 EXPECT==0 @88dd4edaf]
test -f .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md && test ! -e .planning/todos/pending/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md && test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md)" = "1" && pnpm -s planning-gates   # gate 8, the todo is closed with exactly one Resolution heading, and the planning gates still pass (12 of 12 at planning) [HEAD=error:1 EXPECT==0 @88dd4edaf]
pnpm -s gameinfo-narrowing-ceiling && pnpm -s lint-translations:gamelib && npx jest --selectProjects Meta --runTestsByPath meta/__tests__/lintTranslations.test.ts meta/__tests__/genI18nGateScope.test.ts   # gate 9, the closing check: every gate the todo named is green together on the committed tree [HEAD=error:1 EXPECT==0 @88dd4edaf]</automated>
  </verify>
  <done>meta/i18nForkTouchedFiles.json is the generator's verbatim output: 445 files, +6/-0. meta/i18nGateScope.json has the five zero-violation files in sorted position (322) plus the appended provenance clause, and nothing else changed. genI18nGateScope.test.ts carries the dated ledger entry, tabs.ts in DECLARED_UNSCANNED_DEBT and the pins at 322/445, and the suite has 0 failures. hardcodedStringGate.test.ts is green. Allowlist, glossary and gate sources are unchanged. The artifact commit holds exactly the three meta paths. The todo is in completed/ with a Resolution section, in its own commit. Nothing is pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| working tree -> committed gate artifacts | Two generators read live state (the locale catalogs, and the git diff against the merge base) and write committed records that CI trusts as ground truth. A record derived from uncommitted or foreign state lies to every later run |
| shared checkout -> this task's commits | Another session is editing and committing in the same checkout while this runs |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261121-lco-01 | Tampering | meta/i18nCatalogPresenceBaseline.json, written from the working-tree catalogs | high | mitigate | Task 2 gate 0 proves, before the writer runs, that the working-tree en/gamelib.json has HEAD's exact key-to-value map and that no other catalog is dirty. The writer's stdout must be exactly +1728/-0 or the task halts. lintTranslations.test.ts R13 and R21 then re-derive the set and the self-consistency independently |
| T-261121-lco-02 | Elevation of Privilege | gate loosening: gameinfo ceiling baseline, i18n allowlist, glossary, gate sources, `--rewrite-scope` | high | mitigate | Task 1 gate 3 and Task 3 gate 4 assert, by git diff --quiet, that meta/gameInfoNarrowingBaseline.json, meta/gameInfoNarrowingCeiling.cjs, meta/i18nGateAllowlist.json, meta/i18nGlossary.json, meta/hardcodedStringGate.ts, meta/genI18nGateScope.ts and meta/lintTranslations.ts are unchanged. The action forbids `gen-i18n-scope:rewrite`. Scope only gains files (more scanning, not less), and each one was audited at 0 violations first |
| T-261121-lco-03 | Tampering | meta/i18nForkTouchedFiles.json picking up another session's fork-touched files | medium | mitigate | Step A halts unless the diff is exactly the six named paths plus generatedAt (numstat 7 1). A foreign file's scope placement is left to the session that owns it, per the 81-08 precedent in the ledger |
| T-261121-lco-04 | Repudiation | commits sweeping another session's dirty files | medium | mitigate | Every commit uses `git commit -m ... -- <explicit paths>`. Task 1 gate 8, Task 2 gate 6 and Task 3 gate 7 assert each commit's exact path set, and Task 2 gate 5 asserts no public/locales path is staged |
| T-261121-lco-05 | Information Disclosure | committed artifacts | low | accept | The artifacts hold only locale codes, i18n key names and repo-relative source paths, already public in this repository. The scratch audit script and the writer's saved stdout stay under the session scratchpad and are never committed |
| T-261121-lco-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed and no dependency changes. Every tool used (jest, eslint, prettier, esbuild via meta/runTs.cjs, typescript) is already pinned in the lockfile |
</threat_model>

<verification>
- Every `<automated>` line in Tasks 1-3 exits 0. Task 3 gate 9 re-proves the three named suites and the ceiling together on the final committed tree.
- `git log --oneline -4` shows the four commits of this quick, in order (fix, chore, chore, docs), and `git status --porcelain` still lists the other session's dirty files exactly as they were, unstaged.
- Nothing was pushed: `git log origin/main..HEAD` is longer by exactly four commits than it was before the task.
</verification>

<success_criteria>
`pnpm gameinfo-narrowing-ceiling` exits 0, and the narrowing was removed in SettingsModalHeader.tsx, not absorbed by raising the ceiling. lintTranslations.test.ts passes 32/32, with the presence baseline written by its own writer (+1728/-0). genI18nGateScope.test.ts has 0 failures: i18nForkTouchedFiles.json is the generator's own output (445), and the five clean files are promoted into the blocking scope while tabs.ts is declared debt. hardcodedStringGate.test.ts stays green. No gate source or exemption register is loosened, only this task's paths are committed, the todo is in completed/, and nothing is pushed.
</success_criteria>

<output>
Create `.planning/quick/261121-lco-fix-stale-i18n-baseline-fork-touched-fil/261121-lco-SUMMARY.md` when done. Record:
- the three summary lines from the baseline writer's stdout
- the `pnpm gen-i18n-gate-scope` stdout and the numstat
- the scanScope audit output (baseline and per-file)
- the four commit SHAs
- the before and after test counts for each suite
</output>
