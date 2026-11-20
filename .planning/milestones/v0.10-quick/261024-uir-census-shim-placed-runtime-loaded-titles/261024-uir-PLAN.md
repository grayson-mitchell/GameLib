---
phase: quick-261024-uir
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/bridgeCensus.ts
  - meta/__tests__/bridgeCensus.test.ts
  - .planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md
autonomous: true
requirements: [TODO-2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api]

must_haves:
  truths:
    - "When the install tree's only steam_api*.dll is the GameLib shim, the census never classifies the title 'no-steam-api' and never counts it as covered"
    - "A shim with a non-shim `<dll>.gamelib-orig` backup beside it classifies exactly as the unshimmed original would (same class, same detail)"
    - "A shim with no backup but a persisted `<appId>.bridge.scan` verdict classifies 'missing-symbols', with the runtime-loaded marker and the persisted missing symbols in the detail"
    - "A shim with neither backup nor persisted verdict classifies as the new 'unconfirmed' class: routed, not covered, never play-recorded"
    - "An install tree with no steam_api*.dll at all still classifies 'no-steam-api' with the unchanged detail and still counts as covered"
    - "For a static-import title whose steam_api dll beside the exe is the shim, interface versions come from the `.gamelib-orig` backup, else from the persisted verdict's interfaceVersions (the live path's persistedInterfaceVersions fallback)"
    - "The live `pnpm bridge-census` run (read-only, real profile) no longer prints 'none ships in the install tree' for any title whose tree holds a placed shim, and the SUMMARY records before/after covered counts and per-title class changes"
  artifacts:
    - path: "meta/bridgeCensus.ts"
      provides: "readPersistedScanVerdict, pickRuntimeSteamApiDll (pure), 'unconfirmed' class, shim-aware findRuntimeSteamApiDll + dll-version source in the driver"
      contains: "pickRuntimeSteamApiDll"
    - path: "meta/__tests__/bridgeCensus.test.ts"
      provides: "quick 261024-uir describe block: shim-only/backup/verdict/neither/no-dll fixtures"
      contains: "261024-uir"
    - path: ".planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md"
      provides: "Closed todo with a Closed section"
      contains: "## Closed 2026-10-24"
  key_links:
    - from: "meta/bridgeCensus.ts classifyInstalledTitle"
      to: "pickRuntimeSteamApiDll"
      via: "driver gathers per-dll provenance, pure helper picks runtimeLoadedDll / shimOnlyRuntimeDll"
      pattern: "pickRuntimeSteamApiDll\\("
    - from: "meta/bridgeCensus.ts runCensus"
      to: "readPersistedScanVerdict"
      via: "persisted scan verdict threaded into classifyInstalledTitle"
      pattern: "readPersistedScanVerdict\\(metadataText"
    - from: "meta/bridgeCensus.ts summarizeCensus"
      to: "'unconfirmed' class"
      via: "covered excludes it; isRoutedToBridge includes it"
      pattern: "row.class === 'bridge' \\|\\| row.class === 'no-steam-api'"
---

<objective>
Fix `pnpm bridge-census` misclassifying titles whose install tree holds only the GameLib shim (placed over the game's own runtime-loaded steam_api*.dll) as `no-steam-api`. That class counts as covered, so the 2026-10-24 headline "15 of 18 symbols covered" is inflated by titles the shim does not cover (284100, 1167950, ...).

Purpose: the census is the D-51-15 closing measurement. It must mirror the live path, where a shim in the tree means "a steam_api ships" (`findRuntimeLoadedSteamApiDlls` in shimGenerate.ts keeps shim entries with `isGameLibShim: true`), and where the original is read from `.gamelib-orig` or, failing that, the persisted verdict.

Output: pure classifier + driver changes in `meta/bridgeCensus.ts`, new fixtures, a corrected live census measurement recorded in the SUMMARY, and the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md
@meta/bridgeCensus.ts
@meta/__tests__/bridgeCensus.test.ts

<interfaces>
<!-- Extracted from the codebase. Use directly; no exploration needed. -->

meta/bridgeCensus.ts today (line numbers approximate):
- `export type CensusClass = 'bridge' | 'no-steam-api' | 'win64-no-shim' | 'missing-symbols' | 'unknown-version' | 'known-bad' | 'no-binary'` (~111)
- `CensusTitleInput.runtimeLoadedDll?: 'steam_api.dll' | 'steam_api64.dll' | null` (~157): "a steam_api*.dll ships (non-shim) in the install tree"
- `classifyCensusTitleCore` `arch === 'none'` branch (~300): `runtimeLoadedDll` set gives `missing-symbols` with detail `runtimeLoadedSteamApiMarker(dll)` (= `"<dll>@runtime-loaded"`); otherwise `no-steam-api` with detail `'launch exe imports no steam_api and none ships in the install tree'`.
- `withFlags` (~260): `playRecorded` only for class 'bridge' | 'no-steam-api'.
- `isRoutedToBridge` (~364): false for win64-no-shim, no-binary, known-bad 'drm-wrapped'; true otherwise.
- `summarizeCensus` (~380): `covered` counts class 'bridge' | 'no-steam-api'.
- `readPersistedScanArch(metadataJsonText: string | null, appId: string): 'x86' | 'x64' | undefined` (~828): reads `parsed[appId].bridge.scan.arch`. Total over malformed input. Keep it and its tests unchanged.
- Driver: `isGameLibShimBytes(buf)` (~545, mirrors shimGenerate verbatim), `findRuntimeSteamApiDll(dir, depth, found: Set<name>)` (~765, SKIPS shim files: the bug), `classifyInstalledTitle(entry, knownBad, playVerifiedSet, persistedArch, appLogTexts)` (~947, static path reads `dllVersions` from `join(dirname(chosen.path), dllName)` only when it is not a shim, ~991-1006), `runCensus()` (~1066, `metadataText = loadSteamMetadataText()`, passes `readPersistedScanArch(metadataText, entry.appid)`).

Persisted verdict shape (src/backend/storeManagers/steam/bridge/bridgeVerdict.ts `bridgeScanVerdictSchema`; do NOT import it, zero-backend-import rule):
  steam_metadata.json: `{ "<appId>": { "bridge": { "scan": { status: 'clean'|'miss', arch: 'x86'|'x64', missingSymbols: string[], interfaceVersions: Record<string,string>, stubbedInterfaces: string[], shimExportSetVersion: string, scannedAt: string } } } }`

Live-path behaviour to mirror (src/backend/storeManagers/steam/bridge/shimGenerate.ts):
- `ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'`; backup is `target + suffix`.
- `restoreOriginalIfBackedUp` (~793): a backup counts only if `lstat` says a regular, non-symlink file AND `!isGameLibShimBytes(backup bytes)` (a backup carrying shim bytes is refused).
- `findRuntimeLoadedSteamApiDlls` (~282): exact names `steam_api.dll` / `steam_api64.dll` only (a `.gamelib-orig` never matches), symlinks skipped, shim entries KEPT with `isGameLibShim: true` -- a placed shim means "a steam_api ships".
- Runtime-loaded original versions: `original ? readVersionsOrEmpty(original.path) : Object.values(opts?.persistedInterfaceVersions ?? {})` (~1150). Static path: `targetIsGameLibShim ? Object.values(persistedInterfaceVersions) : readVersionsOrEmpty(shimPath)` (~1390).
- Primary dll when both ship: steam_api64.dll.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure classifier -- persisted-verdict reader, runtime-dll picker, 'unconfirmed' class (test-first)</name>
  <files>meta/bridgeCensus.ts, meta/__tests__/bridgeCensus.test.ts</files>
  <behavior>
    New `describe('quick 261024-uir: shim-placed runtime-loaded steam_api', ...)` block in the test file:
    - Baseline guard: `pickRuntimeSteamApiDll([], undefined)` returns `{ runtimeLoadedDll: null, shimOnlyRuntimeDll: null }`; classifying an arch-'none' exe with those inputs gives class 'no-steam-api', the unchanged detail string, and `summarizeCensus([row]).covered === 1`.
    - Shim + backup behaves as the original: `pickRuntimeSteamApiDll([{ name: 'steam_api64.dll', provenance: 'shim-backed' }], undefined)` gives `runtimeLoadedDll: 'steam_api64.dll'`, `shimOnlyRuntimeDll: null`; the resulting row `toEqual`s the row built from `[{ name: 'steam_api64.dll', provenance: 'original' }]` (class 'missing-symbols', detail 'steam_api64.dll@runtime-loaded').
    - Shim-only + persisted miss verdict (284100 shape: status 'miss', arch 'x64', missingSymbols e.g. ['SteamAPI_RestartAppIfNecessary', 'steam_api64.dll@runtime-loaded']): class 'missing-symbols', class is not 'no-steam-api', detail starts with 'steam_api64.dll@runtime-loaded', contains 'SteamAPI_RestartAppIfNecessary' exactly once, does not repeat the marker; covered 0, routed 1.
    - Shim-only + persisted clean verdict: class 'missing-symbols', detail starts with the marker and contains 'persisted bridge.scan clean'; covered 0.
    - Shim-only, no persisted verdict: class 'unconfirmed', arch 'none'; covered 0, routed 1; `playRecorded` false even with `playVerified: true`; detail names the dll and contains neither '/' nor '\\'.
    - Picker precedence: 'original' beats 'shim-backed' beats 'shim-only' for the same name; steam_api64.dll is preferred over steam_api.dll whatever their provenance (live primaryName rule), so `[{steam_api.dll, original}, {steam_api64.dll, shim-only}]` with no verdict picks shim-only steam_api64.dll.
    - `readPersistedScanVerdict` is total: null text, '{not json', 'null', missing entry, missing/invalid status, arch outside x86/x64 all return undefined; non-string missingSymbols entries and any entry containing '/' or '\\' or longer than 128 chars are dropped (T-51-39); a non-object interfaceVersions or non-string values read as {} / are dropped; a valid entry round-trips status/arch/missingSymbols/interfaceVersions.
    - `formatCensusMarkdown` over one 'unconfirmed' row shows `unconfirmed=1` in the class summary and counts it routed, not covered.
  </behavior>
  <action>
    Step 0, before ANY edit to `meta/bridgeCensus.ts`: capture the baseline. Create a temp dir OUTSIDE the repo with `mktemp -d`, then run `pnpm -s bridge-census --json > "$DIR/before.json"` and `pnpm -s bridge-census | tail -1 > "$DIR/before.txt"` (declared real-profile arm, read-only). Shell variables do not persist between Bash calls, so note the literal temp-dir path for Task 3. Never write census output into the repo tree. The todo reports the prior run as "15 of 18 symbols covered"; record the fresh number regardless.

    Then write the tests above FIRST in `meta/__tests__/bridgeCensus.test.ts` (extend the existing import list with `pickRuntimeSteamApiDll`, `readPersistedScanVerdict`), run them, confirm they fail, then implement in the pure half of `meta/bridgeCensus.ts` (above the "Impure I/O driver" divider; `readPersistedScanVerdict` may sit next to `readPersistedScanArch`, which already lives in the driver half but is exported and pure -- follow that placement):

    1. Add `'unconfirmed'` to `CensusClass`.
    2. Export `type RuntimeDllProvenance = 'original' | 'shim-backed' | 'shim-only'` ('original' = a non-shim file on disk; 'shim-backed' = the GameLib shim with a valid non-shim `.gamelib-orig` beside it; 'shim-only' = the shim with no usable backup) and `interface PersistedScanVerdict { status: 'clean' | 'miss'; arch: 'x86' | 'x64'; missingSymbols: string[]; interfaceVersions: Record<string, string> }`.
    3. Export `readPersistedScanVerdict(metadataJsonText: string | null, appId: string): PersistedScanVerdict | undefined` reading `parsed[appId].bridge.scan` with the same totality discipline as `readPersistedScanArch` (untrusted disk content), plus the sanitisation in the behavior list. It mirrors `bridgeScanVerdictSchema` without importing it.
    4. Export pure `pickRuntimeSteamApiDll(found: Array<{ name: 'steam_api.dll' | 'steam_api64.dll'; provenance: RuntimeDllProvenance }>, persistedScan: PersistedScanVerdict | undefined): { runtimeLoadedDll: name | null; shimOnlyRuntimeDll: { dll: name; persistedScan: PersistedScanVerdict | null } | null }`. Pick the name (64 if any entry is 64, else 32), take that name's best provenance; 'original' or 'shim-backed' set `runtimeLoadedDll` (the backup is the original, per brief point 1), 'shim-only' sets `shimOnlyRuntimeDll` with `persistedScan ?? null`.
    5. Add `CensusTitleInput.shimOnlyRuntimeDll?: { dll; persistedScan: PersistedScanVerdict | null } | null` with a quick 261024-uir doc comment, and amend the `runtimeLoadedDll` comment to say it is set for a non-shim file OR a shim whose `.gamelib-orig` backup is the game's original.
    6. In `classifyCensusTitleCore`'s `arch === 'none'` branch, after the existing `runtimeLoadedDll` check and before the `no-steam-api` return: if `shimOnlyRuntimeDll` has a `persistedScan`, return 'missing-symbols' whose detail is the marker, then `; shim placed over the original, no .gamelib-orig backup -- persisted bridge.scan miss: <missingSymbols minus the marker, comma-joined>` for a 'miss' (omit the `: <list>` part when the filtered list is empty) or `; shim placed over the original, no .gamelib-orig backup -- persisted bridge.scan clean (importer coverage not re-measured by the census)` for a 'clean'. Decision: a persisted clean still classifies missing-symbols because the census never evaluates importer PEs (the i94 todo's "bridgeCensus.ts does not learn the importer walk yet"), so an unshimmed original of the same title already classifies as the marker miss; keeping the shimmed title's class identical keeps census output independent of whether a launch has happened. If `shimOnlyRuntimeDll` has no `persistedScan`, return class 'unconfirmed' with detail `<dll> in the install tree is the GameLib shim; no .gamelib-orig backup and no persisted bridge.scan verdict -- original unconfirmed`.
    7. `withFlags` playRecorded stays bridge / no-steam-api only, so 'unconfirmed' is never play-recorded. `isRoutedToBridge` needs no code change ('unconfirmed' is routed: a placed shim is the live path's own evidence of bridge routing), but extend its doc comment and the `summarizeCensus` doc comment to say 'unconfirmed' is routed and never covered. `covered` logic is unchanged (it already excludes the new class); state that explicitly in the doc comment.
    8. Update the `classifyCensusTitle` precedence docblock branch 3 to describe the three shim sub-cases (backup, persisted verdict, neither) and the 'unconfirmed' outcome.

    Do not touch `readPersistedScanArch` or its tests. Keep comment density matching the surrounding code (short JSDoc paragraphs citing the quick id).
  </action>
  <verify>
    <automated>npx jest meta/__tests__/bridgeCensus.test.ts && pnpm codecheck && npx prettier --file-info meta/bridgeCensus.ts && npx prettier --file-info meta/__tests__/bridgeCensus.test.ts && npx prettier --check meta/bridgeCensus.ts meta/__tests__/bridgeCensus.test.ts</automated>
  </verify>
  <done>New fixtures were seen failing, then pass with all 41 pre-existing tests; codecheck is clean; both files report `"ignored": false` and pass `prettier --check`. No `no-steam-api` result is reachable when `shimOnlyRuntimeDll` is set.</done>
</task>

<task type="auto">
  <name>Task 2: Driver -- shim-aware runtime-dll walk, backup/verdict dll-version source, docblock amendments</name>
  <files>meta/bridgeCensus.ts</files>
  <action>
    In the impure driver half of `meta/bridgeCensus.ts`:

    1. Add a driver constant `ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'` with a comment saying it mirrors shimGenerate.ts's constant (not imported, same reason as `GAMELIB_SHIM_MARKER`). Add `lstatSync` to the `node:fs` import.
    2. Add a never-throwing helper `readOriginalBackup(dllPath): string | null` returning the backup path only when `lstatSync` reports a regular non-symlink file and its bytes are not shim bytes (mirrors `restoreOriginalIfBackedUp`'s acceptance test; read-only -- the census NEVER restores, copies or writes anything).
    3. Rework `findRuntimeSteamApiDll` to collect `Array<{ name; provenance: RuntimeDllProvenance }>` instead of a Set of non-shim names: a non-shim file is 'original'; a shim file is 'shim-backed' when `readOriginalBackup(full)` returns a path, else 'shim-only'. Skip symlinked entries (the live walk skips symlinks; use `entry.isSymbolicLink()`). Exact-name match stays, so a `.gamelib-orig` file is never itself an entry. Update its doc comment (it no longer finds only non-shim dlls; cite quick 261024-uir and the live `findRuntimeLoadedSteamApiDlls` it mirrors).
    4. `classifyInstalledTitle` gains a `persistedScan: PersistedScanVerdict | undefined` parameter. In the `arch === 'none'` block, replace the inline 64-over-32 ternary with `pickRuntimeSteamApiDll(found, persistedScan)` and pass both `runtimeLoadedDll` and `shimOnlyRuntimeDll` into `classifyCensusTitle`.
    5. Static path (`arch !== 'none'`, ~991): when the dll beside the chosen exe is NOT the shim, behaviour is unchanged. When it IS the shim, read versions from `readOriginalBackup(dllPath)` via `readInterfaceVersionStrings` if a backup exists; otherwise use `Object.values(persistedScan?.interfaceVersions ?? {})` -- the live path's `persistedInterfaceVersions` fallback (shimGenerate.ts ~1390), so census and launch read the same source. Update the inline comment.
    6. `runCensus`: pass `readPersistedScanVerdict(metadataText, entry.appid)` as the new argument (keep the existing `readPersistedScanArch` argument for exe selection).
    7. Header docblock: append to the amendment trail in the first paragraph a sentence in the existing style: `Amended 2026-10-24 (quick 261024-uir): a steam_api*.dll that is the GameLib shim still means "a steam_api ships" -- the original is read from its .gamelib-orig backup, else from the persisted bridge.scan verdict, else the row is 'unconfirmed' (routed, never covered); it is never 'no-steam-api'.` Keep the "Declared real-profile arm" paragraph accurate: add that the driver also reads `.gamelib-orig` backups inside the operator's bottles and the persisted `steam_metadata.json` scan verdict, read-only, and still passes no `env` to any spawn. Extend the T-51-39 paragraph to say persisted missingSymbols are filtered to path-free strings before they can reach `detail`.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/bridgeCensus.test.ts && pnpm codecheck && npx prettier --file-info meta/bridgeCensus.ts && npx prettier --check meta/bridgeCensus.ts && grep -n "quick 261024-uir" meta/bridgeCensus.ts | head -1 && grep -n "pickRuntimeSteamApiDll(found" meta/bridgeCensus.ts</automated>
  </verify>
  <done>Driver threads per-dll provenance and the persisted verdict into the pure classifier; the static path reads the backup or persisted versions instead of nothing when the dll is the shim; the header trail and real-profile-arm paragraph name quick 261024-uir; tests, codecheck and prettier pass; </done>
</task>

<task type="auto">
  <name>Task 3: Live census re-run, SUMMARY measurement, close the todo, refresh the graph</name>
  <files>.planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md</files>
  <action>
    1. Run `pnpm -s bridge-census --json` and `pnpm -s bridge-census | tail -1` into Task 1's out-of-repo temp dir as after.json / after.txt (declared real-profile arm, read-only). Diff before/after by appid. If the run errors or finds zero bottles, record that verbatim in the SUMMARY and stop short of claiming a corrected count.
    2. Using Task 1's out-of-repo baseline, fill the SUMMARY (`.planning/quick/261024-uir-census-shim-placed-runtime-loaded-titles/261024-uir-SUMMARY.md`, created by the execute workflow) with: before and after summary lines (covered N of M, routed, byClass), and a table of every title whose class or detail changed with columns appid | name | before class | after class | after detail. Only T-51-39 row fields; never a path, never any other ACF or metadata field. Confirm explicitly whether 284100 is now not covered, and list the twelve todo-named appids (1119730, 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 219990, 3410180, 427410, 648800, 284100) with their new class. Name any title that landed 'unconfirmed' (no backup, no verdict). Do not commit the raw census JSON/markdown anywhere in the repo.
    3. Close the todo following commit e9994cfd1's pattern: `git mv` it from `.planning/todos/pending/` to `.planning/todos/completed/` (keep its frontmatter as-is) and append a `## Closed 2026-10-24: <one-line outcome>` section (short paragraphs: the cause fixed, the three shim sub-cases and the new 'unconfirmed' class, the corrected covered count before -> after, and a "Not done here" note that the census still does not run the importer-PE walk, so a runtime-loaded title whose importers the shim fully covers still reads as a marker miss). Commit the close separately as `chore(quick-261024-uir): close todo`.
    4. Run `graphify update .`.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md && test ! -f .planning/todos/pending/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md && grep -c "^## Closed 2026-10-24" .planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md && pnpm -s bridge-census | grep -c "none ships in the install tree" ; npx prettier --file-info .planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md</automated>
    Prettier: the `--file-info` probe reports `{ "ignored": true, "inferredParser": null }` for `.planning/` paths (measured at plan time), so `prettier --check` over the todo would be vacuous and is deliberately omitted per the gamelib-conventions `<verify>` rule. The `none ships` count is informational: it must not include any of the twelve todo-named appids (check the rows by appid in the JSON diff); genuine no-dll titles may legitimately keep that detail.
  </verify>
  <done>Todo lives under completed/ with a Closed section and its own commit; SUMMARY carries before/after covered counts and per-title class changes using only T-51-39 fields; no census output committed; graph refreshed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator bottles -> census | install-tree dlls and `.gamelib-orig` backups are untrusted bytes on disk |
| steam_metadata.json -> census | app-written cache, but treated as untrusted disk content |
| census -> stdout / SUMMARY | rows may be pasted into committed docs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-51-39 | Information disclosure | `detail` text, SUMMARY tables | mitigate | new detail strings name only dll names and fixed phrases; `readPersistedScanVerdict` drops missingSymbols entries containing '/' or '\\' or over 128 chars; SUMMARY uses only row fields; raw census output stays in an out-of-repo temp dir |
| T-uir-01 | Tampering | `.gamelib-orig` backup | mitigate | accepted only as a regular non-symlink file without shim bytes (mirrors `restoreOriginalIfBackedUp`); census is read-only and never restores or writes |
| T-uir-02 | Tampering / DoS | malformed steam_metadata.json | mitigate | `readPersistedScanVerdict` is total; any malformed shape reads as "no verdict" -> 'unconfirmed', never covered |
| T-uir-03 | Spoofing (measurement) | covered count | mitigate | 'unconfirmed' and shim-backed runtime-loaded rows never count as covered; fixture asserts covered 0 |
</threat_model>

<verification>
- `npx jest meta/__tests__/bridgeCensus.test.ts` green, new 261024-uir block included.
- `pnpm codecheck` clean.
- `npx prettier --check meta/bridgeCensus.ts meta/__tests__/bridgeCensus.test.ts` passes (both report `"ignored": false`).
- Live census: none of the twelve todo-named appids is 'no-steam-api'; covered count recorded before/after.
</verification>

<success_criteria>
- A shim in the install tree can never produce 'no-steam-api'.
- Backup present -> identical row to the unshimmed original; verdict only -> missing-symbols with persisted symbols; neither -> 'unconfirmed', routed, not covered.
- Static-import titles read original interface versions from the backup or the persisted verdict.
- Header docblock carries the quick 261024-uir amendment and an accurate real-profile-arm declaration.
- Todo closed in completed/ with a Closed section; corrected covered count recorded in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261024-uir-census-shim-placed-runtime-loaded-titles/261024-uir-SUMMARY.md` when done
</output>
