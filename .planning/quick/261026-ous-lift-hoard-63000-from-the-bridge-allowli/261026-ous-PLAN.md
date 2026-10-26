---
phase: quick-261026-ous
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
  - src/backend/storeManagers/steam/bridge/allowlist.ts
  - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
  - meta/__tests__/bridgeCensus.test.ts
autonomous: true
requirements: [QUICK-261026-ous]

must_haves:
  truths:
    - "bridgeAllowlist.knownBadReason('63000') returns null: Hoard no longer gets the known-bad notice before install"
    - "XCOM 200510 (drm-wrapped) and ELEX 411300 (does-not-run) stay in knownBad exactly as they were"
    - "Hoard is still absent from seed (it was never re-added); bridgeAllowlist.has('63000') stays false"
    - "No comment or test name in the touched files still says Hoard is known-bad or does-not-run"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/bridge-allowlist.json"
      provides: "knownBad without the 63000 entry"
    - path: "src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts"
      provides: "positive assertion that Hoard is not known-bad, citing quick 261026-ng9's packaged retest"
      contains: "261026-ng9"
  key_links:
    - from: "src/backend/storeManagers/steam/bridge/allowlist.ts"
      to: "bridge-allowlist.json knownBad"
      via: "knownBadReasonByAppId map, built at module load"
      pattern: "knownBadReasonByAppId"
---

<objective>
Remove Hoard (63000) from the bridge allowlist's `knownBad` list. Quick 261026-ng9 bundled a
known-fix profile (`build/fixes/63000-steam.profile.json`, `fix.wgl.hideExtensions=WGL_ARB_create_context*`),
and a packaged retest on 2026-10-26 showed Hoard runs fine and reaches its menu. The `does-not-run`
entry is now false.

Purpose: stop showing users a "this game does not run" notice for a game that now runs.
Output: an edited JSON bundle, the allowlist.ts module doc, and tests whose real-bundle assertions are
flipped and whose Hoard-as-does-not-run fixtures are relabelled to ELEX.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261026-ng9-productionise-spike-034-shimfeatures-kno/261026-ng9-SUMMARY.md
@src/backend/storeManagers/steam/bridge/bridge-allowlist.json

Load `Skill("gamelib-conventions")` before running the verify blocks. The `<verify>` convention
applies: scoped `npx prettier --check` over the exact paths. `--file-info` was already run at
planning time, and none of the four paths is prettier-ignored, so every check below proves something.

<facts_established_at_planning>
- `bridge-allowlist.json`: `knownBad` = [200510 XCOM drm-wrapped, 63000 HOARD does-not-run,
  411300 ELEX does-not-run]. Hoard is NOT in `seed` (removed 2026-07-21, D-UAT-24-09). Do not add
  it to seed. That is a separate decision, out of scope here.
- `allowlist.ts` schema: `seed: z.array(...).min(1)`; `knownBad: z.array(knownBadEntrySchema)` with
  no `.min()` floor. Two entries remain after the edit, so the schema constraints still hold.
- `allowlist.ts` module doc, lines 23-24: "`knownBad` holds only evidence-backed entries (XCOM 200510,
  Hoard 63000, ELEX 411300 so far)". This is the only known-bad mention of Hoard in that file.
- `allowlist.test.ts` reads the REAL bundle: lines ~163-177 (`toEqual(['200510','63000','411300'])`),
  ~180-184 (`knownBadReason('63000')).toBe('does-not-run')`), ~186-195 (the HOARD known-bad test
  that finds the 63000 knownBad entry and matches `/51-UAT item 4/`). These break.
  Lines ~273-280 (`has(HOARD_APP_ID)` is false, D-UAT-24-09) are about seed, not known-bad. Leave
  them, and keep the `HOARD_APP_ID` const, which they still use.
- `meta/__tests__/bridgeCensus.test.ts` is fixture-only: `classifyCensusTitle` gets `knownBadReason`
  passed in and never reads the bundle. So nothing breaks. But three fixtures label Hoard 63000 as
  `does-not-run`, which is now false:
  line ~169 test "a does-not-run title (Hoard 63000) still classifies \"known-bad\" in the census";
  line ~462 "a detected CEG beats a bundled does-not-run reason" (appid 63000 / Hoard);
  line ~506 "a known-bad row never gains the .bind suffix" (appid 63000 / Hoard).
  The line ~100 fixture "Hoard (x64 fixture)" has `knownBadReason: null`. It is not a known-bad claim,
  so leave it. Line ~1550 already uses ELEX.
- `installFormIpc.test.ts` ~589 (63000 + acknowledgeReason 'known-bad'): `handleSetSteamBridgeUserRoute`
  validates `acknowledgeReason` only against `NOTICE_REASONS` and never consults the bundle, and
  electronStores is mocked. It does not depend on Hoard being known-bad. Do NOT change it.
- Other 63000 mentions in src/ (shimCoverage, importScan, objdump fixtures, SharedDepots, games/library,
  steamBridgeKnownFixes) are about install layout or the shim, not known-bad. Leave them.
</facts_established_at_planning>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drop 63000 from knownBad, fix the module doc, flip the real-bundle tests</name>
  <files>src/backend/storeManagers/steam/bridge/bridge-allowlist.json, src/backend/storeManagers/steam/bridge/allowlist.ts, src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts</files>
  <action>
1. bridge-allowlist.json: delete ONLY the `{ "appId": "63000", "title": "HOARD", "reason": "does-not-run", ... }`
   object from `knownBad`. Fix the comma so the JSON stays valid. Leave the 200510 and 411300 entries
   byte-identical, leave `seed` untouched, and keep `version: 2`.
2. allowlist.ts module doc: change "(XCOM 200510, Hoard 63000, ELEX 411300 so far)" to
   "(XCOM 200510 and ELEX 411300 so far; Hoard 63000 was lifted by quick 261026-ous once its bundled
   known-fix profile made it run)", or equivalent wording. Re-wrap the comment so prettier stays clean.
   Change no other text.
3. allowlist.test.ts:
   - The "version 2 ... knownBad entries" test (~163): expected appIds become `['200510', '411300']`.
     Also fix the stale test name ("with XCOM as its evidence-backed knownBad entries") to name XCOM and ELEX.
   - The "the real bundle: ..." test (~180): rename it to say 411300 is does-not-run and 200510 is
     drm-wrapped, and drop the 63000 line from it.
   - Replace the "HOARD (63000) is known-bad as does-not-run, citing 51-UAT item 4" test with a
     positive test, for example "HOARD (63000) is no longer known-bad: its bundled known-fix profile
     makes it run (quick 261026-ng9 packaged retest)". It asserts
     `bridgeAllowlist.knownBadReason(HOARD_APP_ID)` is `null`, and that the parsed bundle's `knownBad`
     has no entry with `appId === HOARD_APP_ID`. Put a one-line comment above it citing the
     261026-ng9 SUMMARY "Live retest: packaged debug build" evidence: 2026-10-26, reached the menu,
     ran 97 s, `GINIT ... ok=1`.
   - Keep `HOARD_APP_ID` and the `has(HOARD_APP_ID)` false test (~273-280) as they are.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node -e "const j=require('./src/backend/storeManagers/steam/bridge/bridge-allowlist.json');const ids=j.knownBad.map(e=>e.appId);if(JSON.stringify(ids)!=='[\"200510\",\"411300\"]'||j.seed.some(e=>e.appId==='63000'))process.exit(1)" && npx jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts && test "$(grep -c 'Hoard 63000, ELEX' src/backend/storeManagers/steam/bridge/allowlist.ts)" = 0 && npx prettier --check src/backend/storeManagers/steam/bridge/bridge-allowlist.json src/backend/storeManagers/steam/bridge/allowlist.ts src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts</automated>
  </verify>
  <done>knownBad is exactly [200510, 411300]. allowlist.test.ts passes and includes the positive Hoard-not-known-bad assertion citing 261026-ng9. The module doc no longer lists Hoard as known-bad. Prettier is clean on all three paths.</done>
</task>

<task type="auto">
  <name>Task 2: Relabel the census fixtures that call Hoard does-not-run, then the full gate sweep</name>
  <files>meta/__tests__/bridgeCensus.test.ts</files>
  <action>
In meta/__tests__/bridgeCensus.test.ts, the three fixtures that pass `knownBadReason: 'does-not-run'`
for appid '63000' / 'Hoard' (tests near lines ~169, ~462, ~506) switch to ELEX: `appid: '411300'`,
`name: 'ELEX'`, `installdir: 'ELEX'`. ELEX is the real remaining does-not-run title.
- Rename the ~169 test to "a does-not-run title (ELEX 411300) still classifies \"known-bad\" in the census".
- In the ~169 fixture, the exe is `arch: 'x86'`. ELEX is x64, so set `arch: 'x64'` to stay faithful,
  but only if the test still passes; known-bad classification is expected to short-circuit before
  coverage. If changing the arch breaks it, keep 'x86' and note why in the SUMMARY.
- The ~462 and ~506 tests use the shared `coveredExe` (x86). Leave the exe as it is, because it is
  shared with non-known-bad tests. Change only the appid/name/installdir.
- Change nothing else. The line ~100 "Hoard (x64 fixture)" has knownBadReason null, so it stays.
  Assertions (class/detail) are unchanged.

Then run the gate sweep below. Expected pre-existing failure:
src/backend/sidecar/__tests__/testContainment.test.ts T-34.2-83. Ignore it, but report any other
failure in the SUMMARY. Run `graphify update .` after the edits.

Commit everything as one commit, for example
`fix(quick-261026-ous): lift Hoard (63000) from bridge knownBad -- bundled known-fix profile makes it run`,
with the Co-Authored-By trailer from the session's attribution reminder.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest -c meta/jest.config.js meta/__tests__/bridgeCensus.test.ts && test "$(grep -v '^\s*//' meta/__tests__/bridgeCensus.test.ts | grep -B3 -A3 "appid: '63000'" | grep -c "does-not-run")" = 0 && npx jest src/backend/storeManagers/steam src/backend/__tests__/steamBridgeKnownFixes.test.ts src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.meta.json && npx prettier --check meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/bridge-allowlist.json src/backend/storeManagers/steam/bridge/allowlist.ts src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts && graphify update .</automated>
  </verify>
  <done>No census fixture pairs 63000/Hoard with does-not-run. The census suite, the steam backend suites, the known-fixes suite and the route-notice suite all pass. Both tsc projects are clean, prettier is clean on all four paths, the graph is updated, and there is one commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| bundled allowlist JSON → routing | Developer-curated asset parsed fail-loud at module load (T-24-05) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ous-01 | Tampering | bridge-allowlist.json | mitigate | The zod schema still parses the bundle at load. Task 1's node check plus allowlist.test.ts's schema-parse test prove the edited JSON is valid and that knownBad is exactly [200510, 411300]. |
| T-ous-02 | Denial of Service (user-facing) | Hoard routing | accept | Removing the notice only drops an informational dialog. It is not a routing gate, because does-not-run stays on the bridge per the D-51-08 amendment. The 261026-ng9 packaged retest is the evidence that Hoard runs. |
</threat_model>

<verification>
- knownBad = [200510 drm-wrapped, 411300 does-not-run]; Hoard is absent from both knownBad and seed.
- allowlist.test.ts asserts `knownBadReason('63000') === null` and cites 261026-ng9.
- installFormIpc.test.ts is untouched. It never depended on the bundle.
- Both tsc projects pass, scoped prettier is clean, `graphify update .` has run.
</verification>

<success_criteria>
Hoard (63000) is no longer known-bad in the shipped bundle. Every test that read the real bundle
reflects that, and fixture tests no longer claim Hoard is does-not-run. All gates are green except the
documented pre-existing T-34.2-83 failure.
</success_criteria>

<output>
Create `.planning/quick/261026-ous-lift-hoard-63000-from-the-bridge-allowli/261026-ous-SUMMARY.md` when done
</output>
