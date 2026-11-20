---
phase: quick-261029-nmt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - public/locales/*/gamelib.json (the 48 non-en catalogs)
  - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
  - src/backend/knownFixLaunch.ts
  - src/backend/knownFixesRegistry.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/common/types.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/__tests__/hardcodedStringGate.test.ts
autonomous: true
requirements:
  - NMT-01 lintTranslations green (3 adoptRestart keys in all 49 gamelib catalogs)
  - NMT-02 runnerSliceRegistration green (mkz channels declared, pins bumped)
  - NMT-03 findDeadcode green (8 used-in-module findings resolved at source, baseline untouched)
  - NMT-04 genI18nGateScope green (4 new fork files listed and promoted after audit)
  - NMT-05 hardcodedStringGate green (facetLabels exempted pin 14 -> 16)

must_haves:
  truths:
    - "The suite command `npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam src/backend/__tests__/knownFixesLayered.test.ts meta/__tests__` reports 0 failed suites"
    - "`node meta/findDeadcode.cjs` reports `used-in-module: ... OK`, and meta/deadcode-baseline-used-in-module.txt is unchanged"
    - "Every one of the 49 public/locales/*/gamelib.json catalogs has steam.adoptRestart.{busy,gameRunning,quitTimeout}, each translation keeping the literal {{game}} placeholder where the English has one"
    - "`pnpm codecheck` and `pnpm planning-gates` both exit 0"
  artifacts:
    - path: "meta/i18nGateScope.json"
      provides: "blocking hardcoded-string scope, now 235 files"
      contains: "RunsForMeToggle.tsx"
    - path: "meta/i18nForkTouchedFiles.json"
      provides: "committed fork-touched artifact, now 287 files"
      contains: "tabLocationMemory.ts"
  key_links:
    - from: "src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts"
      to: "src/backend/sidecar/enrichmentFlowRegistration.ts"
      via: "declared enrichment channel list"
      pattern: "getRunsForMeMap"
---

<objective>
Turn the 5 red jest suites (7 tests) on local `main` green so main can be pushed. Each red suite is a gate that a recent local quick task (261029-ji2, 261029-mkz, 261029-n4v) did not update. None of them is a product bug. Fix each one the way that gate's own precedent says, never by weakening the gate.

Output: 48 locale catalogs filled in, 5 source files with exports narrowed or marked, 2 gate JSON artifacts updated, and 3 test files with their pins bumped and a provenance comment next to each bump.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence (the prettier rule).

HARD CONSTRAINTS (read before the first commit):
- Another session is committing to `main` at the same time (GOG login work). Stage EXPLICIT paths only. Never use `git add -A`, `git add .` or `git commit -a`.
- NEVER stage `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/spikes/049-*/run.log`, `.claude/worktrees/`, `.planning/phases/57-*`, `.planning/phases/58-*`, or any other untracked file this plan does not name.
- Before every commit, run `git diff --cached --name-only` and confirm that it lists only this task's files.
- Commit once per task, as `fix(quick-261029-nmt): ...`, and end each message with the Co-Authored-By trailer.

Diagnosis already measured by the planner (2026-10-29). Trust these numbers and re-measure only to verify:
- hardcodedStringGate: exactly 1 failing test, `REQ-41-04 ... W3` at meta/__tests__/hardcodedStringGate.test.ts:1819. `expect(facetResult.exempted).toBe(14)` now receives 16. Cause: a30cda4a0 (quick 261029-mkz) added one `RUNNABILITY_LABELS` tuple, `runsForMe: ['gamelib:library.filterPanel.runsForMe', 'Runs for me']`, to src/frontend/screens/Library/facetLabels.ts. That is one key plus one default text, so +2 exempted literals and 0 violations. The fix is a pin bump. Nothing in the gate changes.
- Audit-mode scan already run: `scanScope({ extraFiles: [the 4 files] })` from meta/hardcodedStringGate.ts reports 0 violations for every one of the 4 files (base 0, with-extras 0). So all 4 follow the 56-30 precedent of an audited-clean file going into BOTH lists. None of them belongs in DECLARED_UNSCANNED_DEBT.
- runnerSliceRegistration: d601ff705 (mkz) added 2 invoke channels, `getRunsForMeMap` and `setRunsForMe`, to `registerEnrichmentFlows`, which took it from 15 to 17. `.planning/IPC-PORT-INVENTORY.md` already records these 2 channels (§ "Quick 261029-mkz", 230 → 232), so do not edit it.
- findDeadcode: an exhaustive grep over `src` and `meta` shows that 7 of the 8 symbols are referenced only inside their own module, and that no test imports any of them. The exception is `steamPendingAdoptionStore`. It is consumed only through a lazy `require('./electronStores') as typeof import('./electronStores')` in `defaultStore()` (macSteamAdoption.ts:56-64), which ts-prune cannot see, and macSteamAdoption.test.ts:18 mocks it by name. So that export is deliberate.
- Precedent for the pin bump: ca4cd8f2d (`test(56-30): ... update channel pin for getGamelibFixStatus`) is the exact template for task 2's test edit. `git show ca4cd8f2d -- src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts`
- Precedent for the locale fill: 295e00db9 (mkz) put REAL translations into all 48 non-en catalogs, not English copies. `git show 295e00db9 -- public/locales/de/gamelib.json`
- Precedent for the scope promotion: 61c223489 (56-30) regenerated `meta/i18nForkTouchedFiles.json` with `pnpm gen-i18n-gate-scope` (which writes the fork-touched artifact only, and never the scope without `--rewrite-scope`), then hand-inserted the audited-clean files into `meta/i18nGateScope.json` in sorted position.
- Prettier: `npx prettier --file-info` shows that `public/locales/*/gamelib.json` is prettier-IGNORED, so the prettier check for those files is omitted on purpose. Every meta/*.json, meta/__tests__/*.ts and src/**/*.ts path in this plan is NOT ignored.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fill steam.adoptRestart.{busy,gameRunning,quitTimeout} into the 48 non-en gamelib catalogs</name>
  <files>public/locales/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it,ja,ka,ko,lt,ml,nb_NO,nl,pl,pt,pt_BR,ro,ru,sk,sl,sr,sv,ta,th,tr,uk,uz,vi,zh_Hans,zh_Hant}/gamelib.json</files>
  <action>
Source strings are in public/locales/en/gamelib.json around line 422, under `"steam": { "adoptRestart": { busy, gameRunning, quitTimeout } }`. They were added by ef1cb3b20 (quick 261029-ji2).

For each of the 48 other locales, insert an `adoptRestart` object with all 3 keys into that catalog's existing `steam` object. Put it at the same relative position as in en, which is the first child of `steam` if the en catalog has it first. Use the catalog's existing 4-space indentation, and add or keep trailing commas so the JSON stays valid.

Write a REAL translation for each locale, matching the tone and terminology the catalog already uses for "Steam", "Play" and "GameLib". 295e00db9 is the precedent. Keep `Steam`, `GameLib` and the interpolation token `{{game}}` byte-identical: gameRunning and quitTimeout each contain `{{game}}` exactly once, and busy contains none. Keep "Play" consistent with how the catalog already translates the Play button label. Look up that label in the same file, or in public/locales/<lang>/translation.json, rather than guessing.

Edit with a script or per-file edits. Do not reformat or re-sort the rest of any catalog. The diff must be additions only, plus at most one comma on the preceding line.

After editing, confirm that all 49 files parse and carry all 3 keys:
`node -e "for(const l of require('fs').readdirSync('public/locales')){const j=require('./public/locales/'+l+'/gamelib.json');const a=j.steam&&j.steam.adoptRestart;if(!a||!a.busy||!a.gameRunning||!a.quitTimeout||!a.gameRunning.includes('{{game}}')||!a.quitTimeout.includes('{{game}}'))console.log('BAD',l)}"` must print nothing.

Then make sure `git status --short public/locales` lists only the 48 gamelib.json files you touched, and stage them by explicit path.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/lintTranslations.test.ts</automated>
    Prettier: omitted on purpose. `npx prettier --file-info public/locales/de/gamelib.json` reports `"ignored": true`, and the same holds for every touched path, so a check would be a green that proves nothing.
  </verify>
  <done>lintTranslations passes, including REQ-41-02 (0 hard failures for gamelib) and REQ-41-01 R13 (no presence-baseline drift). The node check prints nothing. The commit contains exactly the 48 catalogs.</done>
</task>

<task type="auto">
  <name>Task 2: Backend gates (declare the mkz channels and bump the pins; resolve the 8 deadcode findings at source)</name>
  <files>src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts, src/backend/knownFixLaunch.ts, src/backend/knownFixesRegistry.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/macSteamAdoption.ts, src/common/types.ts</files>
  <action>
PART A (runnerSliceRegistration.test.ts). Mirror ca4cd8f2d exactly:
(1) In the declared enrichment channel list, directly after the `'getGamelibFixStatus'` entry near line 279, add a comma, then the comment line `// Quick 261029-mkz (d601ff705): +2 invoke, the 16th/17th enrichment channels`, then `'getRunsForMeMap'` and `'setRunsForMe'`.
(2) In the handle/listen test near line 575, change the title from `exactly 68 channels` to `exactly 70`, and prepend `Quick 261029-mkz, d601ff705: 68/2 -> 70/2, +2 invoke getRunsForMeMap/setRunsForMe, +0 send; ` to its parenthetical history. Change `expect(handleChannels.length).toBe(68)` to 70, and add a one-line comment above it in the same style as the ca6 comment at about line 589.
(3) In the per-module counts test near line 622, change the title's `/ 15, totalling 67` to `/ 17, totalling 69`, and prepend `Quick 261029-mkz, d601ff705: enrichment 15 -> 17; `. Extend the running-sum comment with `, then +2 getRunsForMeMap/setRunsForMe = 69`. Change the expected values to `[11, 12, 7, 14, 8, 17]` and `toBe(69)`.
Grep the file for any other literal 15/67/68 tied to the enrichment set and update it the same way. ca4cd8f2d touched only these three spots. Leave the historical "38"/"64"/"66" describe titles alone, as ca4cd8f2d did.

PART B (deadcode). Resolve at source per findDeadcode's remedies. Do NOT touch meta/deadcode-baseline-used-in-module.txt.
- Remedy (b), drop the `export` keyword, because each symbol is used only inside its own module and no test imports it:
  - `KnownFixLaunchOverrides` (knownFixLaunch.ts:62). It stays the return type of the exported `readKnownFixLaunchOverrides`. Callers never name it, and TS allows a non-exported interface as an exported function's return type.
  - `RegistryFixLogContext` (knownFixesRegistry.ts:54)
  - `DLL_OVERRIDE_MODES` (knownFixesRegistry.ts:164)
  - `RESTART_POLL_MS` (macSteamAdoption.ts:34). Keep `RESTART_QUIT_TIMEOUT_MS` exported. It is not in the findings list, so leave it alone.
  - `PlayAdoptionDecision` (macSteamAdoption.ts:167)
  - `RestartResult` (macSteamAdoption.ts:235)
  - `KnownFixDllOverrideMode` (common/types.ts:1203)
  Before dropping each one, re-grep `src meta` for the name to confirm there are still no external importers.
- Remedy (c), for `steamPendingAdoptionStore` in electronStores.ts, because the export is deliberate. Remove it from the bottom `export { ... }` list (about line 324). Turn its declaration at about line 39 into `export const steamPendingAdoptionStore = ...`, preceded by `// ts-prune-ignore-next` and a WHY comment. The comment should say that it is consumed only through the lazy `require('./electronStores')` in macSteamAdoption.ts `defaultStore()`, which is kept lazy so electron-store stays out of module load and which ts-prune cannot trace, and that macSteamAdoption.test.ts mocks it by name. Put the WHY comment ABOVE the `// ts-prune-ignore-next` line, so the ignore directive is immediately followed by the export line, as at src/backend/utils.ts:1953.
Then run `node meta/findDeadcode.cjs`. If it still names steamPendingAdoptionStore, ts-prune is reporting a different line: read the reported line number from `npx ts-prune` output and move the directive so it sits directly above that line.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node meta/findDeadcode.cjs && npx jest src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts meta/__tests__/findDeadcode.test.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts src/backend/__tests__/knownFixLaunch.test.ts && npx tsc --noEmit -p . && npx prettier --check src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts src/backend/knownFixLaunch.ts src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/macSteamAdoption.ts src/common/types.ts && git diff --quiet -- meta/deadcode-baseline-used-in-module.txt meta/deadcode-baseline-unreachable.txt 2>/dev/null; git diff --stat -- meta/deadcode-baseline*</automated>
  </verify>
  <done>findDeadcode prints `used-in-module: ... OK` with no NEW findings. Both runnerSliceRegistration failures pass (70/2 handle/listen, and [11,12,7,14,8,17] totalling 69). tsc is clean. No deadcode baseline file shows a diff. The commit contains exactly these 6 files.</done>
</task>

<task type="auto">
  <name>Task 3: Frontend i18n gates (list and promote the 4 audited-clean fork files; bump the facetLabels exempted pin), then run the full verification</name>
  <files>meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts, meta/__tests__/hardcodedStringGate.test.ts</files>
  <action>
(1) Fork-touched artifact. Run `pnpm gen-i18n-gate-scope` with NO `--rewrite-scope` flag, as in the 61c223489 precedent. This rewrites only meta/i18nForkTouchedFiles.json. Then run `git diff meta/i18nForkTouchedFiles.json`. The diff must be exactly +4 `files` entries (tabLocationMemory.ts, librarySessionSearch.ts, RunsForMeToggle.tsx, RunsForMeBadge.tsx) plus the `generatedAt` timestamp. If any other file appears, STOP. That would be drift from the concurrent session or elsewhere, and it is outside this plan. Report it, and do not widen the scope. If the generator cannot run (for example, the merge-base b5b5cad3 is not available), hand-insert the 4 paths in sorted position instead. If meta/i18nGateScope.json changed, revert it with `git checkout -- meta/i18nGateScope.json` before step 2.

(2) Blocking scope. The planner's `scanScope({ extraFiles })` audit already measured 0 violations for all 4 files. Hand-insert all 4 paths into meta/i18nGateScope.json `files` in sorted position, which takes it from 231 to 235. Append to the end of its `generatedBy` provenance string: `, then quick 261029-nmt added tabLocationMemory.ts, librarySessionSearch.ts, RunsForMeToggle.tsx and RunsForMeBadge.tsx after an audit-mode scanScope({ extraFiles }) showed 0 violations`. Do not add anything to DECLARED_UNSCANNED_DEBT, because none of the 4 files has an audit hit.

(3) genI18nGateScope.test.ts:
- Append a dated paragraph to the history block comment directly above `const DECLARED_UNSCANNED_DEBT` (after the "2026-10-29 (plan 56-30, A-17 closure)" paragraph, about lines 341-350). Write it in the same voice. It should cover: `2026-10-29 (quick 261029-nmt): fork-touched 283 -> 287, scope 231 -> 235`; the 4 files and their origin quicks (tabLocationMemory.ts and librarySessionSearch.ts from 261029-n4v, RunsForMeToggle.tsx and RunsForMeBadge.tsx from 261029-mkz); that all 4 audited ZERO violations with `scanScope({ extraFiles })` and were hand-inserted into scope; and that DECLARED_UNSCANNED_DEBT needs no edit.
- Update the count pins in the A0–A4 specs (about lines 1117-1214): change 231 to 235 and 283 to 287, in both the `it(...)` titles and the `toBe(...)` values. Then grep the whole file for every remaining `231` and `283` and update the ones that describe the CURRENT snapshot. Leave the historical narrative that says "258 -> 283" / "212 -> 231" untouched.

(4) hardcodedStringGate.test.ts:1819. Change `expect(facetResult.exempted).toBe(14)` to 16. Add a comment directly above it: `// quick 261029-nmt: 14 -> 16. a30cda4a0 (quick 261029-mkz) added the runsForMe RUNNABILITY_LABELS tuple -- +1 key literal +1 defaultText literal, both exempted, 0 violations; re-measured, not assumed.` Before committing, confirm that the measured value really is 16 by running the test.

Commit these 4 files, staged by explicit path.

(5) Full verification, run after all 3 commits:
- `npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam src/backend/__tests__/knownFixesLayered.test.ts meta/__tests__` must report 0 failed suites. hardcodedStringGate alone takes about 90 s, so use a timeout of at least 600000.
- `pnpm codecheck` must exit 0.
- `pnpm planning-gates` must exit 0.
- If time allows, also run the full `pnpm test` and record the result.
If anything is red, diagnose it. If it is red because of the concurrent session's commits rather than this plan, record that in the SUMMARY with evidence (`git log` and the failing file) instead of fixing their work.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && npx prettier --check meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam src/backend/__tests__/knownFixesLayered.test.ts meta/__tests__ && pnpm codecheck && pnpm planning-gates</automated>
  </verify>
  <done>A-17 ANTI-ROT, the A-03 RATCHET and A0–A4 pass with 287/235. REQ-41-04 W3 passes with exempted 16. The full suite command shows 0 failures. codecheck and planning-gates both exit 0. `git status` shows ROADMAP.md, STATE.md and the spike run.log still unstaged and untouched by this plan.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test pins, gate artifacts, locale strings and export visibility only. No runtime input path changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nmt-01 | Tampering | gate artifacts (baseline / scope / debt list) | mitigate | Deadcode baseline must show no diff (Task 2 verify). Scope additions only after the measured 0-violation audit. No DECLARED_UNSCANNED_DEBT growth. |
| T-nmt-02 | Tampering | concurrent session's working tree | mitigate | Explicit-path staging plus a `git diff --cached --name-only` check before every commit. ROADMAP/STATE/run.log are never staged. |
| T-nmt-03 | Information disclosure | locale strings | accept | Static UI copy. `{{game}}` interpolation preserved, no new data flow. |
</threat_model>

<verification>
Full command `npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam src/backend/__tests__/knownFixesLayered.test.ts meta/__tests__` reports 0 failures. `pnpm codecheck` and `pnpm planning-gates` both exit 0. No deadcode baseline diff. Three commits, each with only its own task's files.
</verification>

<success_criteria>
All 5 previously red suites (7 tests) pass. No gate was weakened: the baseline is untouched, the debt list did not grow, and every pin bump carries a measured provenance comment. Local main is pushable.
</success_criteria>

<output>
Create `.planning/quick/261029-nmt-fix-the-5-red-jest-suites-on-main-so-it-/261029-nmt-SUMMARY.md` when done
</output>
