---
phase: quick-261025-mfz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/constants/paths.ts
  - src/backend/knownFixes.ts
  - src/backend/__tests__/knownFixesLayered.test.ts
  - src-tauri/tauri.conf.json
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - public/fixes/284100-steam.json
  - .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md
autonomous: true
requirements: [QUICK-261025-mfz]

must_haves:
  truths:
    - "A Steam bridge launch of 284100 writes IsInstalled=REG_DWORD 1 under HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95} in the bridge bottle, in both the /reg:32 and /reg:64 views, from a bundled profile shipped with the app"
    - "A local override at fixesPath/local/<appId>-steam.json replaces the bundled profile when present"
    - "A `registry` key in the remote-layer file fixesPath/<appId>-steam.json is ignored (stripped, with a warning)"
    - "Malformed registry entries are skipped with a warning; the launch continues and the applier never rejects"
    - "readKnownFixes keeps its exact behaviour for Epic/GOG/Amazon callers (existing knownFixes.test.ts passes unchanged)"
  artifacts:
    - path: "src/backend/knownFixes.ts"
      provides: "readKnownFixesLayered (local > bundled > remote, remote stripped of trusted-only keys)"
      exports: ["readKnownFixes", "readKnownFixesLayered", "TRUSTED_ONLY_KNOWN_FIX_KEYS"]
    - path: "src/backend/storeManagers/steam/bridgeKnownFixes.ts"
      provides: "registry validation, reg add argv builder, registry application"
      exports: ["applySteamBridgeKnownFixes", "validateRegistryFixes", "buildRegistryFixCommandParts"]
    - path: "public/fixes/284100-steam.json"
      provides: "Bundled Unclaimed World profile with the WMP Active Setup marker"
      contains: "22d6f312-b0f6-11d0-94ab-0080c74c7e95"
    - path: "src-tauri/tauri.conf.json"
      provides: "Packages build/fixes into the bundle"
      contains: "build/fixes"
  key_links:
    - from: "src/backend/storeManagers/steam/bridgeKnownFixes.ts"
      to: "readKnownFixesLayered"
      via: "replaces the readKnownFixes call"
      pattern: "readKnownFixesLayered\\(appId, 'steam'\\)"
    - from: "src/backend/constants/paths.ts"
      to: "publicDir/fixes"
      via: "bundledFixesPath constant"
      pattern: "bundledFixesPath"
    - from: "src-tauri/tauri.conf.json"
      to: "build/fixes"
      via: "bundle.resources entry"
      pattern: "\\.\\./build/fixes/"
---

<objective>
Add the `registry` known-fixes key for the Steam bridge, honoured only from bundled or local
sources (decision 6 of `.planning/notes/per-game-compat-fixes-architecture.md`), and ship a bundled
profile for Unclaimed World (284100) that sets the Windows Media Player Active Setup marker the
game checks for. Update the source todo with the 53-20 diagnosis.

Purpose: 284100's "Missing Windows Media Player" dialog is fixed by one registry value (hand test
2026-10-24). Known-fixes could not express it. After this, that fix is data.

Output: a source-aware layered reader, a validated registry applier, a bundled profile packaged in
both dev and the Tauri build, tests, and an updated todo.

Out of scope, and deferred like D2 in 261024-tny: the applied-fix ledger and reversal
(decision 5). `reg add /f` is idempotent but turning a profile off does not remove the value.
Also out of scope: the GameLib remote fixes repo (todo
`2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md`, do not touch or close
it), `dllOverrides`/`overlays`/`shimFeatures`, routing the `getKnownFixes` IPC (renderer notes)
through the layered reader, and the todo's items 1 (appinfo redist reading) and 3 (Play-button
status).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/notes/per-game-compat-fixes-architecture.md
@.planning/quick/261024-tny-wire-steam-bridge-launch-into-known-fixe/261024-tny-SUMMARY.md
@src/backend/knownFixes.ts
@src/backend/storeManagers/steam/bridgeKnownFixes.ts
@src/backend/__tests__/steamBridgeKnownFixes.test.ts
@src/backend/__tests__/knownFixes.test.ts

Load `Skill("gamelib-conventions")` before writing the todo edit and before any `<verify>` run.

Facts (orchestrator, do not re-derive):
- The marker is hand-placed in the operator's live bottle
  `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-284100`. DO NOT touch that
  bottle or the live fixes dir `~/Library/Application Support/gamelib/fixes/`. Tests use tmp paths
  and mocks only.
- No test in this plan spawns a child process: `runWineCommand` is mocked. If you add one that
  does, it must use `createFakeHomeProfile()` (fake-HOME convention).

<interfaces>
Current type, src/common/types.ts ~line 1112:
  export interface KnowFixesInfo { title: string; notes?: Record<string,string>; winetricks?: string[];
    runInPrefix?: string[]; envVariables?: Record<string,string>; wikiLink?: string }

src/backend/constants/paths.ts:
  export const fixesPath = join(appFolder, 'fixes')                       (line 61)
  export const publicDir = resolve(app.getAppPath(), app.isPackaged || CI==='e2e' ? 'build' : 'public')  (line 80)
  Sibling bundled assets are declared as fixAsarPath(join(publicDir, ...)).
  In dev publicDir is <repo>/public; packaged it is <Resources>/build (sidecar app root from
  GAMELIB_APP_ROOT). Vite copies public/ into build/ (vite.config.ts outDir 'build').
  Tauri ships build/* entries through src-tauri/tauri.conf.json bundle.resources, e.g.
  "../build/locales/": "build/locales". Under jest, app.getAppPath() is a tmp appBasePath
  (src/backend/platform/__mocks__/index.ts), so bundledFixesPath is a tmp dir in tests.

src/backend/knownFixes.ts: readKnownFixes(appName, runner): KnowFixesInfo | null
  resolve(fixesPath, `${appName}-${storeMap[runner]}.json`), resolve+relative containment,
  existsSync -> null, JSON.parse failure -> logWarning + null. Imports logWarning only.
  Callers: launcher.ts:994,1032, sidecar/enrichmentFlowRegistration.ts:209 (getKnownFixes IPC),
  steam/bridgeKnownFixes.ts:33.

runWineCommand args used by the bridge (bottleDllOverrides.ts / bridgeKnownFixes.ts):
  { commandParts, gameSettings: bridgeBottleSettings, wait, protonVerb: 'run',
    skipPrefixCheckIKnowWhatImDoing: true } -> Promise<{stdout, stderr, code?}>
  Strict success is result?.code === 0 (undefined on "Invalid wine", null on signal).
  steamClientSetup.ts:190-230 is the reg-add precedent: wait: false (reg.exe's own exit code
  proves the write; `wineserver --wait` can block forever), raced against an unref'd 15_000 ms
  timer that is cleared once the race settles.
Existing reg add argv shape (bottleDllOverrides.ts:48):
  ['reg', 'add', key, '/v', name, '/t', 'REG_SZ', '/d', data, '/f']
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Registry type, bundled fixes path, and the layered source-aware reader</name>
  <files>src/common/types.ts, src/backend/constants/paths.ts, src/backend/knownFixes.ts, src/backend/__tests__/knownFixesLayered.test.ts, src-tauri/tauri.conf.json</files>
  <behavior>
    New file knownFixesLayered.test.ts (copy the os.homedir tmp redirect and the `../logger` mock
    `{ logWarning: jest.fn() }` from knownFixes.test.ts; write fixtures under the real exported
    `fixesPath`, `join(fixesPath, 'local')` and `bundledFixesPath`, which all resolve under tmp in
    jest; rm them in afterAll):
    - No file in any layer -> null.
    - Bundled only -> returns the bundled object, `registry` intact.
    - Local and bundled both present -> returns the local object, whole-file (no field from the
      bundled file leaks in).
    - Local present but malformed JSON -> warns and falls through to bundled.
    - Remote only (fixesPath/<app>-steam.json) carrying `registry` and `winetricks` -> returns the
      object with `winetricks` kept, `registry` absent, and logWarning called mentioning `registry`.
    - Bundled absent, remote present, local present -> local wins.
    - Traversing appName (e.g. `../../etc/x`) -> null with a containment warning, for each layer
      (place a file at the traversal target in tmp to prove it is not read).
    - Regression: `readKnownFixes` still returns `registry` untouched from fixesPath (non-Steam
      semantics unchanged); existing knownFixes.test.ts passes without edits.
  </behavior>
  <action>
    Types (src/common/types.ts, next to KnowFixesInfo): add
    `export type KnownFixRegistryView = 32 | 64` and
    `export interface KnownFixRegistryEntry { key: string; name: string; type: 'REG_DWORD' | 'REG_SZ'; value: number | string; views?: KnownFixRegistryView[] }`.
    Add to KnowFixesInfo the optional `registry?: KnownFixRegistryEntry[]` and `evidence?: string`
    (decision 3's evidence link). Doc-comment `registry`: honoured only from bundled or local
    sources (decision 6), `views` defaults to both, applied by the Steam bridge only today.

    Paths (src/backend/constants/paths.ts, after the publicDir block): export
    `bundledFixesPath = fixAsarPath(join(publicDir, 'fixes'))` with a comment that it is the
    curated, in-repo layer (decision 6), source `public/fixes/` in dev and `build/fixes` packaged,
    shipped by the tauri.conf.json resource entry. Also export
    `localFixesPath = join(fixesPath, 'local')`.

    Packaging (src-tauri/tauri.conf.json): add `"../build/fixes/": "build/fixes"` to
    bundle.resources (same shape as the locales entry). Do not touch the per-OS conf files.

    Reader (src/backend/knownFixes.ts): extract the body of readKnownFixes into a private
    `readFixesFileWithin(dir, appName, runner, layerLabel)` that does the same resolve+relative
    containment against `dir`, existsSync, JSON.parse and logWarning-and-null. readKnownFixes
    becomes `readFixesFileWithin(fixesPath, ...)` and must keep its current warning texts and
    return values exactly. Add
    `export const TRUSTED_ONLY_KNOWN_FIX_KEYS = ['registry'] as const` (comment: later
    dllOverrides/overlays/shimFeatures join this list) and
    `export function readKnownFixesLayered(appName, runner): KnowFixesInfo | null`:
    first local (localFixesPath), then bundled (bundledFixesPath), then remote (fixesPath). The first
    layer that yields a parsed object wins as a whole file. A missing or malformed file falls
    through to the next layer. Only the remote result has every TRUSTED_ONLY key removed, on a
    shallow copy, with one logWarning per stripped key naming the key, appName and "remote".
    A parsed value that is not a plain object (array, null, number) is treated as malformed. Use
    only logWarning from ./logger, because the existing steamBridgeKnownFixes.test.ts logger mock
    exports only logWarning and LogPrefix. Keep the module's "MUST NOT import electron" contract.
    Update the module docstring with one paragraph on the layers. Do not change any other caller.
    Write the tests first and see them fail, then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/tauriConf.test.ts && pnpm codecheck && for f in src/common/types.ts src/backend/constants/paths.ts src/backend/knownFixes.ts src/backend/__tests__/knownFixesLayered.test.ts src-tauri/tauri.conf.json; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/common/types.ts src/backend/constants/paths.ts src/backend/knownFixes.ts src/backend/__tests__/knownFixesLayered.test.ts src-tauri/tauri.conf.json</automated>
  </verify>
  <done>Layered reader tests pass (seen red first), the existing knownFixes and tauriConf suites pass unchanged, typecheck is clean, and all five paths are prettier-seen (`ignored:false`) and clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Registry applier in applySteamBridgeKnownFixes and the 284100 bundled profile</name>
  <files>src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts, public/fixes/284100-steam.json</files>
  <behavior>
    Extend steamBridgeKnownFixes.test.ts. Existing cases keep writing to the remote layer and must
    still pass. Add a `writeLocal`/`writeBundled` helper writing under `localFixesPath` /
    `bundledFixesPath` (tmp in jest) and clean both in beforeEach:
    - buildRegistryFixCommandParts on the WMP entry with view 32 equals exactly
      ['reg','add','HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}','/v','IsInstalled','/t','REG_DWORD','/d','1','/reg:32','/f'],
      and the view 64 form ends '/reg:64','/f'.
    - Bundled profile with one entry and no `views` -> runWineCommand called twice, /reg:32 then
      /reg:64, each with gameSettings BRIDGE, wait false, protonVerb 'run',
      skipPrefixCheckIKnowWhatImDoing true. `views: [64]` -> once.
    - The same entry in the REMOTE layer -> runWineCommand never called for reg, warning logged.
    - Local overrides bundled: bundled sets value 1, local sets value 0 -> argv carries '/d','0'.
    - validateRegistryFixes skips each with a warning and keeps the valid sibling: non-array
      `registry`; root not in the allowlist (HKCR\\x, HKU\\x, Software\\x with no root); empty
      path after root; `..`-free but empty segment (`HKLM\\A\\\\B`); trailing backslash; key, name or
      REG_SZ value containing `"`, CR, LF or NUL; empty name; name starting with `/`; unknown type
      (REG_BINARY); REG_DWORD value non-integer, negative, > 0xFFFFFFFF or a string; REG_SZ value
      not a string; views empty, containing 16, or not an array. Duplicates in views are deduped.
    - result.code non-zero, result.code undefined, runWineCommand rejecting -> warning, applier
      still resolves, and env fixes from the same file are still applied.
    - Timeout: runWineCommand returns a never-settling promise; with jest.useFakeTimers() and
      `await jest.advanceTimersByTimeAsync(15_000)` the applier resolves and warns "timed out".
      Restore real timers after.
    - Real-profile check: read the repo's `public/fixes/284100-steam.json` (path via
      jest.requireActual('path') from __dirname, not through bundledFixesPath) and assert
      validateRegistryFixes('284100', parsed.registry) yields exactly one entry with both views,
      and that `evidence` names the source todo.
  </behavior>
  <action>
    In bridgeKnownFixes.ts, switch the read to `readKnownFixesLayered(appId, 'steam')`. Update the
    module docstring: registry, the trust layers (decision 6), and "ledger/reversal deferred
    (decision 5), like D2".

    Export `validateRegistryFixes(appId: string, raw: unknown): ValidRegistryFix[]` where
    ValidRegistryFix is `{ key, name, type, data: string, views: KnownFixRegistryView[] }`. It never
    throws and logs one `logWarning(..., LogPrefix.Steam)` per rejected entry (JSON.stringify the
    entry, sliced to 200 chars). Rules: `raw` must be an array, else warn and return []. Entry must
    be a plain object. `key` must be a string of at most 512 chars, start with exactly one of
    `HKLM\`, `HKEY_LOCAL_MACHINE\`, `HKCU\`, `HKEY_CURRENT_USER\`, have a non-empty remainder with
    no empty segment and no trailing backslash, and contain no `"`, `\r`, `\n`, `\0`. `name`: a
    non-empty string of at most 256 chars, not starting with `/`, and none of those characters.
    `type`: 'REG_DWORD' needs an integer value from 0 to 0xFFFFFFFF (data = String(value)).
    'REG_SZ' needs a string value of at most 1024 chars with none of those characters. `views`
    is optional, defaults to [32, 64], must be a non-empty array of 32 or 64, deduped and
    ordered 32 then 64. Export
    `buildRegistryFixCommandParts(fix, view)` that returns
    ['reg','add',key,'/v',name,'/t',type,'/d',data,`/reg:${view}`,'/f'] (argv array, never a shell
    string).

    Apply registry first inside the existing try, before winetricks, so later fix steps see the
    marker. No status update. This is cheap and the Play-button status is todo item 3, out of scope.
    Loop over fixes and views, call runWineCommand with { commandParts, gameSettings:
    bridgeBottleSettings, wait: false, protonVerb: 'run', skipPrefixCheckIKnowWhatImDoing: true }.
    Use wait: false, unlike the runInPrefix branch, following steamClientSetup.ts: reg.exe's exit
    code proves the write, and `wineserver --wait` can block forever. Race each call against a
    local `REGISTRY_FIX_TIMEOUT_MS = 15_000` timer that is `unref()`'d (sidecar exit contract)
    and cleared in a finally block. Treat only `result?.code === 0` as success. Anything else, a
    timeout or a throw logs a warning naming appId, key, name and view, and the loop continues.
    The function still never rejects and never marks the bridge failed. `/f` makes a repeat
    launch idempotent.

    Create public/fixes/284100-steam.json: title "Unclaimed World", `evidence` set to
    ".planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md",
    `notes` with one entry saying it sets Windows Media Player's Active Setup marker, which the game
    checks at startup, and `registry` holding one entry: key
    `HKLM\Software\Microsoft\Active Setup\Installed Components\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}`
    (JSON-escaped backslashes), name "IsInstalled", type "REG_DWORD", value 1, with no `views`, so
    both views apply.
    Check `notes`' shape against KnowFixesInfo (Record<string,string>) and use a key such as
    "wmp-marker".

    Write the tests first and see them fail. If an existing test in this file breaks because
    registry is now read first, fix the test setup, not the assertion. After the code changes,
    run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/storeManagers/steam && pnpm codecheck && for f in src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts public/fixes/284100-steam.json; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts public/fixes/284100-steam.json</automated>
  </verify>
  <done>Applier tests pass (seen red first) and the whole steam test tree still passes. The 284100 profile validates to one entry with both views. Typecheck is clean, the three paths are prettier-seen and clean, and the graph is updated.</done>
</task>

<task type="auto">
  <name>Task 3: Update the source todo with the 53-20 diagnosis and registry-step status</name>
  <files>.planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md</files>
  <action>
    Load `Skill("gamelib-conventions")` (todo frontmatter section) first. Leave the frontmatter
    byte-identical: keys created, title, source, area, files, severity: medium, platform: macos,
    ready: code, in that order. The todo stays in pending/. Do not edit earlier sections. Append a
    new section `## Status and 53-20 diagnosis (2026-10-25, quick 261025-mfz)` stating:
    - The registry step is DONE by quick 261025-mfz. Known-fixes has a `registry` key, honoured
      only from bundled (`public/fixes/`, packaged as `build/fixes`) or local
      (`fixes/local/<appId>-steam.json`) sources and stripped from the remote layer. The
      bundled profile `public/fixes/284100-steam.json` sets `IsInstalled` = REG_DWORD 1 under the
      WMP Active Setup key in both views on every bridge launch. Ledger/reversal (decision 5) is
      deferred. Item 2 of the work list is therefore covered by that profile.
    - Correction to the "53-20 evidence" section above: the 53-20 "error on startup ... serious
      problem" dialog is Wine's crash dialog ("…has encountered a serious problem and needs to
      close"), not a WMP failure and not unidentified. It is the
      `unimplemented function steam_api64.dll.SteamAPI_InitSafe` crash recorded live in 53-UAT
      item 11 and tracked in
      `2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`. The
      GameLib log at 14:21 on 2026-10-25 shows INIT ok, shims placed, process alive 51 s, and no
      Wine stderr captured.
    - Correction to the census note: the Arch column printing x64 for this PE32 exe is correct.
      It is an AnyCPU .NET assembly, which runs as x64 (D-53-10).
    - Still open: item 1 (reading appinfo/redist dependency data) and item 3 ("Installing Windows
      components…" on the Play button). Whether music and video play is still unknown until the
      shim crash is fixed.
    Write in plain, short sentences, consistent with the existing sections.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates && npx prettier --file-info .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md && head -12 .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md | grep -c '^severity: medium$\|^platform: macos$\|^ready: code$' | grep -qx 3 && grep -q '261025-mfz' .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md</automated>
    Prettier note: `--file-info` reports this path `"ignored": true` (checked at planning time), so
    `prettier --check` would prove nothing. It is omitted on purpose. The file-info call stays in
    the verify block to prove the path is still ignored.
  </verify>
  <done>`pnpm planning-gates` passes. The todo is still in pending/ with the three triage keys unchanged and in order. The new section records registry done (261025-mfz), the 53-20 crash-dialog diagnosis, the census-arch correction, and items 1 and 3 still open.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote known-fixes file -> bridge bottle registry | fixesPath/<app>-<store>.json is downloaded or user-placed and untrusted |
| fixes JSON -> reg.exe argv | file content becomes command arguments in the bottle |
| appName -> filesystem path | appId string selects files in three directories |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mfz-01 | Tampering / Elevation | readKnownFixesLayered remote layer | mitigate | TRUSTED_ONLY_KNOWN_FIX_KEYS (`registry`) stripped from the remote result with a warning (decision 6). Tested. |
| T-mfz-02 | Information disclosure | readFixesFileWithin | mitigate | resolve+relative containment per layer directory, the same idiom as WR-06. Traversal test for each layer. |
| T-mfz-03 | Tampering | buildRegistryFixCommandParts | mitigate | Argv array, no shell. Root allowlist (HKLM/HKCU only), no `"`/CR/LF/NUL, name may not start with `/`, typed values with bounds and length caps. Every rule is tested. |
| T-mfz-04 | Denial of service | registry runWineCommand | mitigate | wait: false plus an unref'd 15 s timeout per call, cleared in finally. The applier never rejects. |
| T-mfz-05 | Repudiation | registry writes not recorded | accept | The ledger/reversal (decision 5) is deferred. The values are benign markers in a per-app bottle. |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/__tests__/tauriConf.test.ts src/backend/storeManagers/steam` passes
- `pnpm codecheck` is clean and `pnpm planning-gates` passes
- `npx prettier --check` is clean over every non-ignored path written
- `grep -n 'readKnownFixesLayered' src/backend/storeManagers/steam/bridgeKnownFixes.ts` finds the call, and `grep -rn 'readKnownFixesLayered' src/backend/launcher.ts src/backend/sidecar` finds nothing (other callers unchanged)
- The operator's live bottle and live fixes dir are untouched (no test path resolves outside tmp)
</verification>

<success_criteria>
- The `registry` key exists, is validated strictly, and is applied to the bridge bottle in both views via reg add /f
- It is honoured from bundled and local sources, local wins, and it is ignored from the remote layer
- public/fixes/284100-steam.json is shipped in dev (public/) and in the Tauri bundle (build/fixes resource)
- The source todo is updated and still pending with ready: code
</success_criteria>

<output>
Create `.planning/quick/261025-mfz-steam-bridge-known-fixes-registry-key-wi/261025-mfz-SUMMARY.md` when done
</output>
