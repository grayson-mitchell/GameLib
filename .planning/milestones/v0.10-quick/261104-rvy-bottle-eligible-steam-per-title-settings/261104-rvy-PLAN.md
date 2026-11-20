---
phase: quick-261104-rvy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/titleSettings.ts
  - src/backend/storeManagers/steam/__tests__/titleSettings.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md
  - .planning/todos/completed/2026-11-04-bridge-game-settings-read-write-split.md
autonomous: true
requirements:
  - TODO-2026-11-04-bridge-game-settings-read-write-split

must_haves:
  truths:
    - "On macOS, a bottle-eligible Steam title's per-title value for any allowlisted key, written to GamesConfig/<appId>.json, comes back from SteamGame.getSettings() on reopen (and therefore at launch, launcher.ts:145)"
    - "A stale wineVersion / winePrefix / wineCrossoverBottle in the title file never overrides the bottle's value"
    - "A key absent from the title file falls back to the bottle/global value"
    - "Existing G11 (steamEngineOverride) and G3 (steamOverlayOverride 'on'/'off' only) behaviour and tests are unchanged"
    - "With nothing stored for the title, getSettings() returns the bottle settings object itself (D1 test: toBe)"
  artifacts:
    - path: "src/backend/storeManagers/steam/titleSettings.ts"
      provides: "readStoredTitleConfig (single sync read of raw[appId]) + TITLE_AUTHORITATIVE_KEYS allowlist + pickTitleSettings"
      exports: ["readStoredTitleConfig", "TITLE_AUTHORITATIVE_KEYS", "pickTitleSettings"]
    - path: "src/backend/storeManagers/steam/__tests__/titleSettings.test.ts"
      provides: "reader guard/missing/corrupt cases + allowlist pick cases"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts getSettings()"
      to: "titleSettings.ts"
      via: "readStoredTitleConfig(this.appId) -> pickTitleSettings -> spread over getSteamBottleSettings()"
      pattern: "pickTitleSettings\\(readStoredTitleConfig"
    - from: "overlayPolicy.ts readStoredOverlayOverride / engineDecision.ts readStoredEngineOverride"
      to: "titleSettings.ts readStoredTitleConfig"
      via: "delegation; exported signatures and return values unchanged"
      pattern: "readStoredTitleConfig\\(appId\\)"
---

<objective>
Fix the read/write split in the todo `.planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md`. On macOS, the Settings screen writes a bottle-eligible Steam title's per-title keys to `GamesConfig/<appId>.json`, but `SteamGame.getSettings()` returns `getSteamBottleSettings()`, so those keys read back as global defaults, both on reopen and at launch. The fix merges an explicit allowlist of title-authoritative keys from the title file over the bottle settings. The bottle stays authoritative for every other key.

Purpose: values saved per title survive a reopen and take effect at launch.
Output: a new `titleSettings.ts` helper and its tests, a generalised `getSettings()` merge with a regression test per key, the two existing readers delegating to the shared helper, and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md
@src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts
@src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayPolicy.test.ts

Load Skill("gamelib-conventions") before writing any `<verify>` step (the prettier rule).

<locked_decisions>
Per-key authority was decided by the orchestrator. Do not revisit it.
- `steamBottleConfigStore` only ever holds `wineVersion`, `wineCrossoverBottle`/`bottleName` and `provisioned`. So every todo-listed key currently resolves from GLOBAL defaults, and none has a bottle-level value.
- LD-1 Title file wins, when the key is present (`!== undefined`) in `raw[appId]`, for an explicit ALLOWLIST only. If a key is absent, the bottle/global value stays.
- LD-2 The bottle stays authoritative for every other key, especially `wineVersion`, `wineCrossoverBottle`, `winePrefix` and anything bottle-shaped. NEVER spread the whole title entry over the bottle settings, because it can hold stale wine/prefix keys.
- LD-3 `steamEngineOverride` semantics are unchanged. `steamOverlayOverride` still merges only 'on'/'off'. Both exported readers keep their exact behaviour, because the launch path uses them (games.ts:4307/4729, engineState.ts:151, engineDecision.ts:158).
- LD-4 Allowlisted values pass through with no per-key validation beyond the presence check.
- LD-5 launcher.ts:145 calls `game.getSettings()`, so no launcher change is needed.
- LD-6 Tests: one regression test per allowlisted key (`it.each`), a stale wineVersion/winePrefix in the title file does NOT win, the absent-key case falls back, and G11/G3 stay green.
- LD-7 Final task: move the todo to `.planning/todos/completed/`.
</locked_decisions>

<allowlist_correction>
PLANNER FINDING. The executor must apply it, and the SUMMARY must call it out.
Two names in the locked allowlist are not GameSettings keys. They are frontend COMPONENT names:
- `alternativeExe`: `src/frontend/screens/Settings/components/AlternativeExe.tsx` writes `useSetting('targetExe', '')`. `targetExe` is already on the allowlist, so this entry collapses into it.
- `preferedLanguage`: `src/frontend/screens/Settings/components/PreferedLanguage.tsx` writes `useSetting('language', '')`. The real key is `language`.
Neither string appears anywhere else in `src/`, and neither exists on `GameSettings` (src/common/types.ts:301-352). A literal allowlist would never match a stored value and would fail the `(keyof GameSettings)[]` typing below. To honour the decision's intent (the keys the Games tab renders), the allowlist is:
`launcherArgs`, `targetExe`, `enviromentOptions`, `wrapperOptions`, `beforeLaunchScriptPath`, `afterLaunchScriptPath`, `language`, `verboseLogs`, `showFps`, `showMangohud`, `lastUsedLaunchOption` (11 keys).
</allowlist_correction>

<interfaces>
Current getSettings() (src/backend/storeManagers/steam/games.ts ~1261-1291):
- If `this.isBottleEligible()`: `settings = getSteamBottleSettings()`. Then `readStoredEngineOverride` is lazily imported from './engine/engineDecision' (`await import`), and `override = readStoredEngineOverride(this.appId)`. Then `overlay = parseOverlayOverride(readStoredOverlayOverride(this.appId))` (static import from './bridge/overlay/overlayPolicy', games.ts:144-149), and `overlayOverride` is 'on'/'off' or undefined. If neither is set it returns `settings` (the SAME object; the D1 test asserts `toBe`). Otherwise it returns `{...settings, steamEngineOverride?, steamOverlayOverride?}`.
- Otherwise it uses `GameConfig.get(this.appId)`.

Both existing readers have the same body: appId guard `/^[0-9]{1,10}$/`, `join(gamesConfigPath, `${appId}.json`)` (gamesConfigPath from 'backend/constants/paths'), `existsSync`, then `JSON.parse(readFileSync(path,'utf8'))` and `raw[appId]?.<key>` in try/catch, with undefined on any failure. Both import from 'fs' (NOT graceful-fs).

games.test.ts mocking (resetMocks is on, so mocks use plain functions over jest.fn()):
- lines 484-497: `jest.mock('../bridge/overlay/overlayPolicy', ...)` exposes `__readStoredOverlayOverrideMock`, and `parseOverlayOverride` is requireActual.
- lines 615-621: `jest.mock('../engine/engineDecision', ...)`, where `readStoredEngineOverride: jest.fn()`.
- ~8361-8433: D1 test, G11 test, and `describe('getSettings() overlay override (60-UAT G3, ...)')`. Its beforeEach sets `steamMetadataStore.get -> forcedMeta()` and `getSteamBottleSettings -> { wineCrossoverBottle: 'GameLibSteam' }`, and it asserts with `toEqual` on the whole settings object.
- overlayPolicy.test.ts mocks 'backend/constants/paths' with `gamesConfigPath: mkdtempSync(...)` and writes real JSON files. Follow that pattern for titleSettings.test.ts.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared title-config reader + allowlist picker; delegate the two existing readers</name>
  <files>src/backend/storeManagers/steam/titleSettings.ts, src/backend/storeManagers/steam/__tests__/titleSettings.test.ts, src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts, src/backend/storeManagers/steam/engine/engineDecision.ts</files>
  <behavior>
    - readStoredTitleConfig('../x'), ('abc'), ('12345678901') return undefined (the appId guard)
    - A missing file returns undefined. Corrupt JSON returns undefined. A file without a raw[appId] entry returns undefined. A non-object raw[appId] (e.g. a string, null or an array) returns undefined
    - A valid file returns the raw[appId] object
    - pickTitleSettings(undefined) returns {}
    - pickTitleSettings({ launcherArgs: '-x', wineVersion: {...}, winePrefix: '/stale', wineCrossoverBottle: 'Old', steamEngineOverride: 'pinned:a', steamOverlayOverride: 'off', junk: 1 }) returns exactly { launcherArgs: '-x' }. The non-allowlisted keys are dropped, including the engine/overlay keys, which keep their own validated path (LD-2, LD-3)
    - pickTitleSettings keeps falsy-but-present values (verboseLogs: false, launcherArgs: '', enviromentOptions: []) and drops keys whose value is undefined (LD-1, LD-4)
    - TITLE_AUTHORITATIVE_KEYS equals the 11 keys from <allowlist_correction>
    - The existing overlayPolicy.test.ts readStoredOverlayOverride cases and the engineDecision.test.ts readStoredEngineOverride cases still pass unchanged
  </behavior>
  <action>
Create `src/backend/storeManagers/steam/titleSettings.ts` with three exports. Give each one a `// ts-prune-ignore-next` line, matching overlayPolicy.ts.

(a) `readStoredTitleConfig(appId: string): Record<string, unknown> | undefined`. This is the single sync read of the title's GamesConfig entry. Lift the body of the existing readers into it (the same `/^[0-9]{1,10}$/` guard, `join(gamesConfigPath, `${appId}.json`)`, `existsSync`, then JSON.parse in try/catch returning undefined). Import `existsSync`/`readFileSync` from 'fs' and `gamesConfigPath` from 'backend/constants/paths', exactly as overlayPolicy.ts does. Return `raw[appId]` only when it is a non-null, non-array object. Otherwise return undefined. Port the doc comment explaining WHY the file is read directly: `GameConfig.get(id).config` fills asynchronously (59-UAT G11), and `GameConfig.get` creates a missing file.

(b) `TITLE_AUTHORITATIVE_KEYS`, a readonly array typed `readonly (keyof GameSettings)[]` (GameSettings comes from 'common/types'), holding the 11 keys in <allowlist_correction>. Add a comment block that records LD-1/LD-2. Say the title wins only for these keys and never for bottle-shaped keys (wineVersion/wineCrossoverBottle/winePrefix), because the title file can hold stale ones. Say steamBottleConfigStore holds only wineVersion/wineCrossoverBottle/provisioned, so these keys otherwise resolve from global defaults. Also note that `alternativeExe`/`preferedLanguage` were component names, mapped to `targetExe`/`language`.

(c) `pickTitleSettings(entry: Record<string, unknown> | undefined): Partial<GameSettings>`. Iterate TITLE_AUTHORITATIVE_KEYS and copy `entry[key]` when it is `!== undefined`. Do no other validation (LD-4). The return value must be a fresh object containing ONLY allowlisted keys.

Then make `readStoredOverlayOverride` (overlayPolicy.ts) and `readStoredEngineOverride` (engineDecision.ts) delegate: `return readStoredTitleConfig(appId)?.steamOverlayOverride` and `?.steamEngineOverride` respectively. Keep their names, signatures (`(appId: string): unknown`), export status, ts-prune-ignore lines and doc comments (trim the comment to point at titleSettings.ts for the file-read rationale). Remove the 'fs', 'path' and gamesConfigPath imports from each file ONLY if nothing else in that file still uses them (check with grep before removing). Per LD-3, their observable behaviour must not change. The one difference is a non-object raw[appId], which now yields undefined where it previously did too (the `?.` on a primitive gave undefined), so behaviour is identical. Watch for an import cycle: titleSettings.ts must import nothing from storeManagers/steam beyond types.

Write `__tests__/titleSettings.test.ts` following overlayPolicy.test.ts. Mock 'backend/constants/paths' with a `gamesConfigPath` set to `mkdtempSync(join(tmpdir(), 'gamelib-title-cfg-'))`, write the fixture JSON files with writeFileSync, and rmSync the dir in afterAll. Cover every <behavior> bullet that targets titleSettings.ts. Write the tests first (RED), then the implementation (GREEN).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/titleSettings.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayPolicy.test.ts src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts && npx prettier --file-info src/backend/storeManagers/steam/titleSettings.ts && npx prettier --check src/backend/storeManagers/steam/titleSettings.ts src/backend/storeManagers/steam/__tests__/titleSettings.test.ts src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts src/backend/storeManagers/steam/engine/engineDecision.ts</automated>
  </verify>
  <done>titleSettings.ts exports the reader, the 11-key allowlist and the picker, and its tests pass. Both legacy readers delegate to it and their existing test files pass unchanged. Prettier is clean on all four paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Merge allowlisted title keys in getSettings() + per-key regression tests</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - it.each over the 11 TITLE_AUTHORITATIVE_KEYS: when the title entry holds the key (use a representative non-default value per key, e.g. launcherArgs '-novid', targetExe 'C:\\Game\\alt.exe', enviromentOptions [{key:'A',value:'1'}], wrapperOptions [{exe:'w',args:''}], script paths '/s/before.sh' '/s/after.sh', language 'de', verboseLogs true, showFps true, showMangohud true, lastUsedLaunchOption {type:'basic', name:'x', parameters:'-y'} or whatever shape LaunchOption accepts), getSettings() returns { wineCrossoverBottle: 'GameLibSteam', [key]: value }
    - The title entry holds { wineVersion: {name:'stale'}, winePrefix: '/stale', wineCrossoverBottle: 'OldBottle', launcherArgs: '-a' }, and the bottle returns { wineCrossoverBottle: 'GameLibSteam', wineVersion: {name:'bottle'}, winePrefix: '/bottle' }. The result keeps the bottle's three values and gains launcherArgs '-a'
    - The bottle returns { wineCrossoverBottle: 'GameLibSteam', launcherArgs: '-global' } and the title entry lacks launcherArgs. The result keeps '-global' (absent-key fallback)
    - The title entry's launcherArgs '-title' beats the bottle/global '-global'
    - Engine + overlay + an allowlisted key are all stored: all three are merged
    - The existing D1 (toBe identity), G11 and G3 tests pass unchanged
  </behavior>
  <action>
In games.ts, add a static import of `readStoredTitleConfig` and `pickTitleSettings` from './titleSettings'. In the bottle-eligible branch of `getSettings()`, compute `const title = pickTitleSettings(readStoredTitleConfig(this.appId))` after `getSteamBottleSettings()`. Keep the existing `readStoredEngineOverride` (lazy import) and `readStoredOverlayOverride`/`parseOverlayOverride` calls and their validation EXACTLY as they are (LD-3), so the G11/G3 tests keep their mocks. Extend the early return so that `settings` (the same object, for D1) is returned only when the engine override, the overlay override AND `title` (no own keys) are all empty. The merged return becomes `{ ...settings, ...title, ...engine part, ...overlay part }`. Spreading `title` is safe because pickTitleSettings returns only allowlisted keys (LD-2), and it must NEVER be the raw entry. Extend the method's doc comment with a short paragraph citing todo 2026-11-04 and LD-1/LD-2: allowlisted per-title keys win when present, and the bottle stays authoritative for wine/prefix/bottle keys. Make no launcher.ts change (LD-5).

In games.test.ts, add a module mock next to the overlayPolicy mock (~line 497) that follows its resetMocks-safe pattern: `jest.mock('../titleSettings', ...)` with a `storedMock = jest.fn()`, exposing `__readStoredTitleConfigMock: storedMock`, `readStoredTitleConfig: (...args) => storedMock(...args)`, and `pickTitleSettings` plus `TITLE_AUTHORITATIVE_KEYS` taken via `jest.requireActual('../titleSettings')`. Under resetMocks the stored mock returns undefined by default, so every existing test sees no title keys. Add `describe('getSettings() per-title keys (todo 2026-11-04 read/write split)')` right after the G3 describe block. Reuse its beforeEach shape (forcedMeta + getSteamBottleSettings mock) and cover every <behavior> bullet. Drive the it.each from the actual `TITLE_AUTHORITATIVE_KEYS` with a value map typed `Record<(typeof TITLE_AUTHORITATIVE_KEYS)[number], unknown>`, so a key added later without a test fails to typecheck. Use `mockReturnValueOnce` on the stored mock, as G3 does.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/titleSettings.test.ts && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm codecheck</automated>
  </verify>
  <done>All 11 per-key cases, the stale-wine case, the absent-key fallback and the title-beats-global case pass, and D1/G11/G3 still pass. The full games.test.ts file is green, `pnpm codecheck` (both tsc projects) is clean, and prettier is clean on both paths.</done>
</task>

<task type="auto">
  <name>Task 3: Move the todo to completed</name>
  <files>.planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md, .planning/todos/completed/2026-11-04-bridge-game-settings-read-write-split.md</files>
  <action>
Use `git mv .planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md .planning/todos/completed/`. The conventions skill says `completed/` is exempt from the triage-frontmatter gate, so no key is required. Keep the existing severity/platform/ready keys, and add a `status:` line after `found_by:`, following the style of completed todos (e.g. completed/tray-dark-light-icons-are-identical.md). Example: `status: 'RESOLVED 2026-11-04 (quick 261104-rvy): getSettings() merges an allowlist of 11 title-authoritative keys from GamesConfig/<appId>.json over the bottle settings; bottle stays authoritative for wine/prefix/bottle keys.'` Append a short `## Resolution` section to the body. It should name the per-key decision (the allowlist, the bottle-authoritative remainder), the `alternativeExe`→`targetExe` / `preferedLanguage`→`language` correction, and the new files. Then run `pnpm planning-gates` to confirm the gate stays green.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md && grep -q '^status:' .planning/todos/completed/2026-11-04-bridge-game-settings-read-write-split.md && pnpm planning-gates && npx prettier --file-info .planning/todos/completed/2026-11-04-bridge-game-settings-read-write-split.md</automated>
  </verify>
  <done>The todo is in completed/ with a status line and a Resolution section, nothing is left in pending/, and planning-gates passes. Prettier: if `--file-info` reports `"ignored": true`, say so in the SUMMARY and skip the check. Otherwise run `npx prettier --check` on that one path and it must pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GamesConfig/<appId>.json -> launch settings | user-writable JSON on disk feeds launch arguments, env and wrappers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rvy-01 | Tampering | readStoredTitleConfig path | mitigate | keep the `/^[0-9]{1,10}$/` appId guard before join(), so there is no path traversal |
| T-rvy-02 | Tampering | getSettings merge | mitigate | merge only the 11 allowlisted keys through pickTitleSettings and never spread the raw entry, so stale or forged wineVersion/winePrefix/wineCrossoverBottle cannot redirect the bottle (LD-2) |
| T-rvy-03 | Elevation | launcherArgs/enviromentOptions/wrapperOptions/scripts | accept | the same user-owned file already drives these keys for every non-bottle title via GameConfig. This is parity, not new exposure (LD-4) |
| T-rvy-04 | DoS | corrupt title JSON | mitigate | try/catch returns undefined, so it falls back to bottle settings |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/titleSettings.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayPolicy.test.ts src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts` is green
- `pnpm codecheck` is clean
- `grep -n "pickTitleSettings(readStoredTitleConfig" src/backend/storeManagers/steam/games.ts` matches once
- `grep -rn "alternativeExe\|preferedLanguage" src/backend` shows no allowlist entry (comment mentions only)
</verification>

<success_criteria>
Per-title values for the 11 allowlisted keys round-trip through getSettings() for bottle-eligible titles. Bottle wine/prefix/bottle keys can't be overridden from the title file. G11/G3 are unchanged. The todo is closed.
</success_criteria>

<output>
Create `.planning/quick/261104-rvy-bottle-eligible-steam-per-title-settings/261104-rvy-SUMMARY.md` when done. It must note the allowlist correction (alternativeExe/preferedLanguage were component names, not keys).
</output>
