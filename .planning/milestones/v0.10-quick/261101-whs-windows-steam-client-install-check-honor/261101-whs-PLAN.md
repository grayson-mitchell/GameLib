---
phase: quick-261101-whs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/constants.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
  - .planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md
autonomous: true
requirements: [TODO-2026-10-16-phase-21-native-install-uat-deferred-to-windows, AUTH-05]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "On Windows, SteamUser.isSteamClientInstalled() returns true only when steam.exe exists under the quote-stripped Default Steam path setting. It no longer probes the hardcoded Program Files path, so a Steam installed there does not count when the setting points somewhere else."
    - "On Windows, ensureSteamClientReady's D-10 install gate and D-11 launch gate read the same Steam root. steam.exe under the configured root with no steamapps/libraryfolders.vdf gives needs-launch. Nothing under the configured root gives needs-install, even when Steam exists at Program Files. Both present gives ready."
    - "A blank Default Steam path makes isSteamClientInstalled() return false without probing anything, so it never checks a steam.exe relative to the working directory."
    - "macOS and Linux behaviour is unchanged. Detection still probes STEAM_INSTALL_PATHS (/Applications/Steam.app; /usr/bin/steam and ~/.steam/steam) and never reads GlobalConfig."
    - "The Phase 21 todo has a no-uninstall test recipe for 4a/4b/4c on the operator's own Windows box. Its triage reads severity: medium / platform: windows / ready: live-gate, in that order, and the todo frontmatter gate passes."
  artifacts:
    - path: "src/backend/storeManagers/steam/user.ts"
      provides: "Windows branch of isSteamClientInstalled() that reads defaultSteamPath through a lazy backend/config require"
      contains: "require('backend/config')"
    - path: "src/backend/storeManagers/steam/constants.ts"
      provides: "STEAM_INSTALL_PATHS with darwin/linux entries only"
    - path: "src/backend/storeManagers/steam/__tests__/user.test.ts"
      provides: "Windows unit cases (configured root, empty root with Steam at Program Files, quoted path, blank path) plus pinned mac/linux cases"
      contains: "defaultSteamPath"
    - path: "src/backend/storeManagers/steam/__tests__/clientSetup.test.ts"
      provides: "Cross-gate test that drives ensureSteamClientReady through the ACTUAL isSteamClientInstalled on Windows"
      contains: "requireActual"
    - path: ".planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md"
      provides: "Test recipe (no uninstall needed) plus unblocked triage"
      contains: "## Test recipe (no uninstall needed)"
  key_links:
    - from: "src/backend/storeManagers/steam/user.ts (isSteamClientInstalled)"
      to: "src/backend/storeManagers/steam/clientSetup.ts (hasLibraryFoldersVdf, line 70)"
      via: "identical root derivation: GlobalConfig.get().getSettings().defaultSteamPath.replaceAll(\"'\", '')"
      pattern: "replaceAll\\(\"'\", ''\\)"
    - from: "src/backend/storeManagers/steam/clientSetup.ts:112 (D-10 needs-install gate)"
      to: "SteamUser.isSteamClientInstalled()"
      via: "unchanged call site; now reads the configured root"
      pattern: "SteamUser.isSteamClientInstalled\\(\\)"
    - from: "src/backend/sidecar/steamAuthFlowRegistration.ts:186 (checkSteamInstalled IPC, Login screen)"
      to: "SteamUser.isSteamClientInstalled()"
      via: "unchanged call site; the Login screen's install check follows the same setting"
      pattern: "SteamUser.isSteamClientInstalled\\(\\)"
---

<objective>
Make the Windows Steam-client install check use the Default Steam path setting. That is the root the
D-11 launch gate already reads, so the two Phase 21 client-setup gates stop disagreeing about where
Steam lives. Then add a test recipe to the Phase 21 UAT todo. With it the operator can run 4a, 4b
and 4c on their own Windows box by pointing the setting at an empty folder, without uninstalling
Steam.

Purpose: today `SteamUser.isSteamClientInstalled()` (`src/backend/storeManagers/steam/user.ts:220`)
probes a hardcoded Program Files path on Windows, while `hasLibraryFoldersVdf()`
(`src/backend/storeManagers/steam/clientSetup.ts:70`) reads `defaultSteamPath`. Two consequences:
Steam installed on another drive (e.g. `D:\Steam`) reads as "not installed" even when the setting
names it, and an absent Steam cannot be simulated. That second one is why the todo has been parked
as needing a fresh machine.
Output: a Windows branch in `isSteamClientInstalled()`, a pruned `STEAM_INSTALL_PATHS`, unit and
cross-gate tests, and the todo updated with the recipe and re-triaged as `ready: live-gate`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md

Load `Skill("gamelib-conventions")` before Task 2 (todo triage frontmatter rule) and before
writing any `<verify>` evidence (prettier rule).

Grounded facts (verified by the planner on this Windows box, 2026-11-01):
- `isSteamClientInstalled()` lives at `src/backend/storeManagers/steam/user.ts:218-223` under the
  `// ── AUTH-05: Steam client detection` banner. It already uses `platform` imported from
  `'process'` (line 29) and `existsSync` from `graceful-fs` (line 1). user.ts has no `path` import.
- Its only callers are `src/backend/storeManagers/steam/clientSetup.ts:112` (D-10 gate) and
  `src/backend/sidecar/steamAuthFlowRegistration.ts:186` (`checkSteamInstalled` IPC, used by
  `src/frontend/screens/Login/components/SteamLogin/index.tsx:215`). Neither call site changes.
- `STEAM_INSTALL_PATHS` (`src/backend/storeManagers/steam/constants.ts:7-11`) is read only by
  user.ts.
- Lazy-require precedent, which this plan follows instead of a static import:
  `src/backend/storeManagers/steam/macSteamOffline.ts:143-149` says in its own words that
  "backend/config pulls in the whole backend graph (utils, GOG, Electron paths), and user.ts imports
  this module on every startup path and in every suite that touches it". It and
  `src/backend/storeManagers/steam/steamDownloadMonitor.ts:87-90` both use a
  `/* eslint-disable @typescript-eslint/no-require-imports */` …
  `/* eslint-enable @typescript-eslint/no-require-imports */` pair around
  `require('backend/config') as typeof import('backend/config')`. Neither user.ts nor any of its
  unmocked deps (tokenStore, authTrigger, withTimeout, steamUserLogonAbort, signInProbe/*) imports
  backend/config today, so adding a static import would put a whole new subgraph on the startup
  path. The lazy form avoids that, and also sidesteps the import-cycle question.
- `defaultSteamPath` defaults on Windows to `join(process.env['PROGRAMFILES(X86)'], 'Steam')`
  (`src/backend/config.ts:41-45`). Users on default settings therefore see no behaviour change.
- `clientSetup.test.ts` auto-mocks `../user` (line 56) with no `__mocks__` manual mock. Jest builds
  that automock by loading the ACTUAL user.ts with this file's mock factories applied, so
  `jest.requireActual('../user')` is proven loadable in that file.
- jest config uses `resetMocks: true`, so return values and implementations must be set again in
  every test.
- Baselines on this box: the three suites below pass (150 tests). `npx tsc --noEmit` exits 0.
  `node meta/findDeadcode.cjs` exits 0. `npx eslint` over the four code files gives
  0 errors and 43 warnings.
- `pnpm planning-gates` cannot run on this box: `python3` resolves to the Microsoft Store stub.
  Use `python` instead. `python meta/runPlanningGates.py` gives 11/12 at baseline. The single
  FAIL is pre-existing and unrelated: `.planning/state-sdk-field-anchor-gate.py` objects to
  STATE.md's `Plan: Not started`. The todo gate
  `python .planning/todos/todo-frontmatter-gate.py` passes (17 pending todos).
- Memory: about 40 jest suites fail on this Windows box regardless of the change. Run only the
  named suites.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Windows install probe reads the Default Steam path, proven end-to-end through both client-setup gates</name>
  <files>src/backend/storeManagers/steam/user.ts, src/backend/storeManagers/steam/constants.ts, src/backend/storeManagers/steam/__tests__/user.test.ts, src/backend/storeManagers/steam/__tests__/clientSetup.test.ts</files>
  <read_first>src/backend/storeManagers/steam/user.ts (lines 1-40 and 214-224), src/backend/storeManagers/steam/constants.ts, src/backend/storeManagers/steam/clientSetup.ts (lines 60-136), src/backend/storeManagers/steam/macSteamOffline.ts (lines 139-156), src/backend/storeManagers/steam/__tests__/user.test.ts (lines 1-70 and 290-337), src/backend/storeManagers/steam/__tests__/clientSetup.test.ts (lines 1-110)</read_first>
  <behavior>
    user.test.ts, describe 'isSteamClientInstalled()':
    - win32, defaultSteamPath 'D:\\Steam', existsSync true only for join('D:\\Steam', 'steam.exe') → true; existsSync's calls are exactly [[join('D:\\Steam', 'steam.exe')]]
    - win32, defaultSteamPath 'C:\\SteamUAT', existsSync true only for the old hardcoded Program Files Steam.exe path → false, and that path never appears in existsSync's calls (the recipe's premise)
    - win32, defaultSteamPath "'D:\\Games\\Steam'" (single-quoted, the form the setting can carry) → existsSync is called with join('D:\\Games\\Steam', 'steam.exe'), with no quote characters
    - win32, defaultSteamPath '' → false and existsSync not called
    - darwin → existsSync called with '/Applications/Steam.app'; GlobalConfig.get not called
    - linux → existsSync called with '/usr/bin/steam'; GlobalConfig.get not called
    - linux, existsSync true / false → true / false (the two existing host-following tests, now pinned)
    - freebsd → false (existing)
    clientSetup.test.ts, new describe on win32 with the ACTUAL isSteamClientInstalled and defaultSteamPath 'C:\\SteamUAT':
    - steam.exe under the root, no vdf → ensureSteamClientReady('123') resolves { status: 'needs-launch', ready: false } and sends steamClientSetupRequired { appName: '123', reason: 'launch-once' }
    - only the old Program Files Steam.exe exists → { status: 'needs-install', ready: false } and reason 'install'
    - steam.exe and steamapps/libraryfolders.vdf under the root → { status: 'ready', ready: true } and no frontend message
  </behavior>
  <action>
RED first. Write the behaviour above as tests and run the Task 1 jest command. The new Windows cases
and the cross-gate needs-launch case must fail against the current code; record the failing names.
Then make them pass.

Production change, src/backend/storeManagers/steam/user.ts:
- Add a `join` import from `'path'`.
- In `isSteamClientInstalled()`, branch on `platform === 'win32'`, using the `platform` already
  imported from `'process'`. Do NOT use `isWindows` from `backend/constants/environment`: it is
  fixed at module load, and the tests switch `process.platform` per case.
- In the Windows branch, load GlobalConfig with a lazy require, written exactly as in
  macSteamOffline.ts:143-149. Wrap it in the same eslint-disable/enable pair for
  `@typescript-eslint/no-require-imports`, and use the same `as typeof import('backend/config')`
  cast. Add a short comment saying why it is lazy, citing macSteamOffline.ts's reason: user.ts is on
  every startup path and in every suite, and backend/config pulls in the whole backend graph. Do not
  add a top-of-file import of backend/config.
- Get the root as `GlobalConfig.get().getSettings().defaultSteamPath.replaceAll("'", '')`. This is
  character-for-character the derivation `hasLibraryFoldersVdf()` uses at clientSetup.ts:71-72, so
  the D-10 and D-11 gates cannot drift apart.
- If `root.trim()` is empty, return false without calling existsSync. `join('', 'steam.exe')` would
  probe a steam.exe relative to the working directory.
- Otherwise return `existsSync(join(root, 'steam.exe'))`. Use lowercase `steam.exe`, the repo idiom
  at bottle.ts:163 and :189. NTFS is case-insensitive, so it matches Valve's `Steam.exe`.
- Do NOT fall back to the old Program Files path. Per the task goal, the configured path is the one
  root both gates read. A fallback would bring the disagreement back, and would make 4a impossible to
  reproduce on a box where Steam is installed. Default-settings users are unaffected (config.ts:44).
- Keep the non-Windows branch byte-identical: `STEAM_INSTALL_PATHS[platform] ?? []`, then
  `.some((p) => existsSync(p))`.
- Add a doc comment above the method covering three points. On Windows it probes
  `<defaultSteamPath>\steam.exe`, the same root clientSetup.ts's D-11 `hasLibraryFoldersVdf()` reads
  (quick 261101-whs). On darwin and linux it probes `STEAM_INSTALL_PATHS`. A blank setting returns
  false.

src/backend/storeManagers/steam/constants.ts:
- Delete the Windows entry from `STEAM_INSTALL_PATHS`. Nothing reads it any more. Keep the
  `Record<string, string[]>` type so the `?? []` lookup still type-checks.
- Put one comment line above the table: "Windows is absent on purpose:
  SteamUser.isSteamClientInstalled() resolves it from the Default Steam path setting (quick
  261101-whs)." The export stays live (darwin/linux), so find-deadcode is unaffected.

src/backend/storeManagers/steam/__tests__/user.test.ts:
- Next to the other module mocks, add `const mockGlobalConfigGet = jest.fn()` and a `jest.mock`
  of `'backend/config'` whose factory returns `{ GlobalConfig: { get: mockGlobalConfigGet } }`.
  Add `backend/config → GlobalConfig.get (Windows Default Steam path)` to the header's "Mock
  boundaries" list.
- In each Windows test, arm it with
  `mockGlobalConfigGet.mockReturnValue({ getSettings: () => ({ defaultSteamPath: ... }) })`.
- Import `join` from `'path'` and build every expected path with it. Production uses the same
  `join`, so the expectations hold both on this win32 host and under ubuntu CI's posix join.
- Change existsSync per path through `(existsSync as jest.Mock).mockImplementation((p: string) => …)`,
  the cast the existing test at line 329 already uses. The module-level `mockExistsSync` is typed
  from `jest.fn(() => false)`, which takes no parameters.
- Restructure the `describe('isSteamClientInstalled()')` block (lines 294-336):
  - Save `process.platform` in a `beforeEach` and restore it in an `afterEach` with
    `Object.defineProperty(process, 'platform', { value, configurable: true })`. Add a local
    `setPlatform(value)` helper. The current inline restore leaks the override into later tests if
    an assertion throws.
  - Pin the two tests that currently follow the host ('returns false when no platform paths exist',
    'returns true when a matching path exists') to 'linux'. On this Windows box they would now take
    the Windows branch.
  - Add the four Windows cases, plus a linux twin of the darwin case, exactly as listed in
    `<behavior>`. In both the darwin and linux cases, assert `mockGlobalConfigGet` was not called.

src/backend/storeManagers/steam/__tests__/clientSetup.test.ts:
- Add a describe named `on win32 the D-10 and D-11 gates share the Default Steam path root (quick 261101-whs)`.
- In its `beforeEach`:
  - Save `process.platform` and set it to 'win32'.
  - Get the actual class with `jest.requireActual<typeof import('../user')>('../user').SteamUser`.
  - Make the automocked method delegate to it:
    `mockedIsSteamClientInstalled.mockImplementation(() => ActualSteamUser.isSteamClientInstalled())`.
  - Point `mockedGlobalConfigGet` at `defaultSteamPath: 'C:\\SteamUAT'`.
- Restore the platform in an `afterEach`.
- The actual module's `graceful-fs` and lazy `backend/config` requires resolve to this file's
  existing mock factories. So both gates read the same mocked `existsSync` and the same setting,
  which is exactly the agreement under test.
- Write the three cases in `<behavior>`. Drive `existsSync` with `mockedExistsSync.mockImplementation`,
  building paths with `join` from `'path'`: `join(root, 'steam.exe')` and
  `join(root, 'steamapps', 'libraryfolders.vdf')`. The Program Files case returns true only for
  the old hardcoded string.
- Add one line to the file header's mock-strategy comment noting the requireActual delegation.
- If `jest.requireActual('../user')` throws on load in this file, stop and report the error. Do not
  swap in a mock-only test, which would not exercise the shared root.

After the tests are green, run `graphify update .` (graphify-out/ is gitignored, so this produces
no commit noise).
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/user.test.ts src/backend/storeManagers/steam/__tests__/clientSetup.test.ts src/backend/sidecar/__tests__/steamAuthFlows.test.ts && npx tsc --noEmit && npx eslint --max-warnings 43 src/backend/storeManagers/steam/user.ts src/backend/storeManagers/steam/constants.ts src/backend/storeManagers/steam/__tests__/user.test.ts src/backend/storeManagers/steam/__tests__/clientSetup.test.ts && node meta/findDeadcode.cjs && grep -q "require('backend/config')" src/backend/storeManagers/steam/user.ts && ! grep -nE "^import .*'backend/config'" src/backend/storeManagers/steam/user.ts && node -e "const s=require('fs').readFileSync('src/backend/storeManagers/steam/constants.ts','utf8');process.exit(/^\s*win32\s*:/m.test(s)?1:0)" && npx prettier --check src/backend/storeManagers/steam/user.ts src/backend/storeManagers/steam/constants.ts src/backend/storeManagers/steam/__tests__/user.test.ts src/backend/storeManagers/steam/__tests__/clientSetup.test.ts</automated>
  </verify>
  <done>
    - All three suites pass, with more tests than the 150 baseline. The SUMMARY lists the new
      Windows and cross-gate test names, and the RED failures recorded before the fix.
    - tsc exits 0; eslint reports 0 errors and no more than 43 warnings; find-deadcode exits 0.
    - user.ts has the lazy `require('backend/config')` inside `isSteamClientInstalled()` and no
      static import of it.
    - constants.ts has no Windows key.
    - prettier --check passes on all four files. All four report `"ignored": false` (planner probe).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the no-uninstall test recipe to the Phase 21 UAT todo and re-triage it as runnable on the Windows box</name>
  <files>.planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md</files>
  <read_first>.planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md, .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md (lines 342-404 only: items 4a/4b/4c), .planning/todos/todo-frontmatter-gate.py (lines 14-19, ready meanings)</read_first>
  <action>
Load `Skill("gamelib-conventions")` (todo triage frontmatter) first. Edit the todo in place with
Edit, not Write. Match the file's existing wrap of about 100 columns and its plain-prose style.

Frontmatter:
- `title`: "Phase 21 native-install UAT: 4a/4b/4c client-setup items, runnable on the operator's
  Windows box via an empty Default Steam path".
- `source`: append "; unblocked 2026-11-01 by quick 261101-whs" to the existing value.
- `files`: add `src/backend/storeManagers/steam/user.ts` and
  `src/backend/storeManagers/steam/clientSetup.ts` under the UAT path.
- Triage: keep `severity: medium` and `platform: windows` exactly. Change `ready` from `blocked` to
  `live-gate`. The three stay consecutive, bare, lowercase, in the order severity, platform, ready.
  Why `live-gate`:
  - The gate's meanings (todo-frontmatter-gate.py:17-19) define `blocked` as gated on hardware or
    an OS not to hand. The operator's Windows box is to hand, and after Task 1 nothing else is
    needed.
  - The remaining work is a live app run. `platform: windows` names the machine; `ready` names the
    kind of work.
  - Do not widen the vocabulary.
- Delete the frontmatter key that records the fresh-machine blocker (its value begins "a Windows
  account or VM where Steam is not installed"). In the same position, add an `unblocked_by` key
  with a double-quoted value; precedent for this key exists in `.planning/todos/`. Use no
  backslashes in the YAML string. The value must say: quick
  261101-whs made the Windows Steam-client check probe steam.exe under the Default Steam path
  setting, the same root the D-11 launch gate reads, so an empty folder stands in for a Steam-absent
  machine and then a never-launched one. Point to the Test recipe below.
- `revisit_trigger`: "the next Windows live gate: run the Test recipe below on the operator's
  Windows box".
- Keep `parked`, `parked_by` and `resolves_phase` as history.

Body:
- Replace the sentence that ends the first paragraph (the one saying the items are parked and not
  passed) with: "Not yet run, and no longer parked: quick 261101-whs makes these runnable on the
  operator's Windows box with the recipe below."
- Keep the 2026-10-29 paragraph unchanged.
- Append a `## Test recipe (no uninstall needed)` section. Write it as a numbered list of
  observable steps, using PowerShell for the checks:

Before you start:
- Use a GameLib build that contains quick 261101-whs.
- Sign in to Steam inside GameLib.
- Pick a small owned game with a native Windows build. 4c only needs the download to start.
- The `enableSteamNativeInstall` opt-in must be on (it is the default).

Setup:
- (1) Fully exit Steam (tray icon, then Exit).
- (2) Create an empty folder `C:\SteamUAT`.
- (3) Write down the current Settings → General → Default Steam path (normally
  `C:\Program Files (x86)\Steam`), then set it to `C:\SteamUAT`.

4a:
- (4) Start a native install of the game. Expect the D-10 consent dialog before anything
  downloads.
- On consent, expect `SteamSetup.exe` to open Valve's visible installer window, with no silent
  install. That is 4a.

4b:
- (5) In the Valve installer, set the install folder to `C:\SteamUAT`. On the final page untick
  "Run Steam" so it does not launch.
- (6) Run `Test-Path C:\SteamUAT\steamapps\libraryfolders.vdf`. Expect False.
- (7) Start the native install again. This is what 4b step 2 prescribes. Optional observation: the
  open install banner's 3-second recheck poll may move on by itself; record which happened.
- Expect the "launch Steam once" banner, not the consent dialog. That is 4b.
- Re-run the Test-Path check. It must still be False: GameLib never writes the file (T-21-21).

4c:
- (8) With the banner open, run `C:\SteamUAT\steam.exe` once. Sign in and let it finish starting.
  Steam itself now writes `libraryfolders.vdf`.
- Expect GameLib to continue into the depot download on its own within a few seconds (3s poll),
  with no extra Install click. That is 4c.
- Cancel the download once it has visibly started.
- If GameLib's own Steam session drops when the second client signs in, record that as a finding.
  Do not treat it as a 4c pass.

Cleanup:
- (9) Exit the `C:\SteamUAT` Steam (tray icon, then Exit).
- (10) Restore the Default Steam path to the value written down in step 3.
- (11) Launch the original `C:\Program Files (x86)\Steam\Steam.exe` once. The second install
  rewrites `HKCU\Software\Valve\Steam` `SteamPath` (and with it the client `steam://` links open)
  to `C:\SteamUAT`, and launching the original client points it back. Confirm that
  `(Get-ItemProperty HKCU:\Software\Valve\Steam).SteamPath` shows the Program Files path.
- (12) Delete `C:\SteamUAT`.

Caveats:
- While the setting points at `C:\SteamUAT`, GameLib reads Steam libraries from there (see the
  setting's own help text). Already-installed Steam games may show as not installed until step 10.
  This is expected, not a finding.
- [unverified] The second install may also re-point the Windows "Installed apps" Steam uninstall
  entry at `C:\SteamUAT`. Check it after cleanup and record what you see. Do not guess at a repair.

Record results:
- Record 4a/4b/4c in 21-UAT.md's `**Result:**` lines, through `/gsd-verify-work 21`.
- Write no SteamID, account name or other account identifier into the todo or the UAT file.
  </action>
  <verify>
    <automated>T=.planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md && python .planning/todos/todo-frontmatter-gate.py && test "$(awk '/^---$/{n++;next} n==1' $T | grep -A2 '^severity:' | tr '\n' '|')" = "severity: medium|platform: windows|ready: live-gate|" && awk '/^---$/{n++;next} n==1' $T | grep -q '^unblocked_by: "' && test "$(awk '/^---$/{n++;next} n==1' $T | grep -oE '^[a-z_]+_by:' | tr '\n' ' ')" = "unblocked_by: parked_by: " && grep -q '^## Test recipe (no uninstall needed)$' $T && grep -q 'Not yet run, and no longer parked' $T && grep -q 'Test-Path C:\\SteamUAT\\steamapps\\libraryfolders.vdf' $T && grep -q 'SteamPath' $T && grep -q 'Run Steam' $T && ! grep -En '[0-9]{15,}' $T && PG=$(mktemp) && { python meta/runPlanningGates.py > "$PG" 2>&1; true; } && ! grep '^\[FAIL\]' "$PG" | grep -v 'state-sdk-field-anchor-gate.py' && npx prettier --file-info $T | grep -Eq '"ignored":[[:space:]]*true'   # prettier: the todo is under .planning/, which --file-info reports ignored (inferredParser null), so --check would be vacuous and is omitted; the file-info probe proves the omission is legitimate. pnpm planning-gates is replaced by `python meta/runPlanningGates.py` because python3 is the Microsoft Store stub on this box; the only tolerated FAIL is the pre-existing STATE.md field-anchor gate</automated>
  </verify>
  <done>
    - The todo frontmatter gate passes.
    - Triage reads `severity: medium` / `platform: windows` / `ready: live-gate`, consecutive and in
      that order.
    - The fresh-machine blocker key is gone. The only frontmatter keys ending in `_by` are
      `unblocked_by` and then `parked_by`.
    - The body has the `## Test recipe (no uninstall needed)` section, with steps 1-12 covering
      setup, 4a, 4b, 4c, cleanup and caveats.
    - No 15+ digit identifiers appear.
    - The full planning-gate runner shows no new FAIL. The pre-existing STATE.md field-anchor FAIL
      is the only one tolerated.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user setting → filesystem probe | `defaultSteamPath` is user-editable in Settings and now decides the D-10 install gate on Windows |
| GameLib → operator's Windows registry/disk (UAT recipe) | The recipe has the operator install a second Steam, which rewrites per-user Steam registry state |
| planning artifact → public repo | The todo is committed to a public fork |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-whs-01 | Spoofing | `isSteamClientInstalled()` win32 branch | low | accept | A `steam.exe` placed under a user-chosen Default Steam path makes GameLib treat Steam as installed and skip the D-10 guided install. The setting is the local user's own, and the probe is existence-only. The D-11 gate already trusts the same setting. No privilege boundary is crossed. |
| T-whs-02 | Elevation of Privilege | `isSteamClientInstalled()` | low | mitigate | The probe stays `existsSync` only and never spawns or opens the configured `steam.exe`. The Task 1 tests assert that existsSync is the only filesystem call, with the exact probed path. |
| T-whs-03 | Denial of Service | blank Default Steam path | low | mitigate | The `root.trim()` empty guard returns false without probing, so a cwd-relative `steam.exe` can never produce a false "installed". Covered by the blank-path unit test. |
| T-whs-04 | Tampering | operator machine during the UAT recipe | low | mitigate | Recipe cleanup steps 9-12 restore the setting, re-point `HKCU\Software\Valve\Steam` SteamPath by launching the original client, verify with Get-ItemProperty, and delete `C:\SteamUAT`. The uninstall-entry effect is flagged [unverified] for observation rather than asserted. |
| T-whs-05 | Information Disclosure | todo file in a public repo | low | mitigate | The recipe carries no account identifiers. The Task 2 verify rejects any 15+ digit run (SteamID64 shape). |
| T-whs-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or added by this plan, so there is no legitimacy gate to run. Any install appearing during execution is a deviation and must stop. |
</threat_model>

<verification>
- Task 1's automated command passes: three jest suites, tsc, eslint at no more than 43 warnings,
  find-deadcode, the lazy-require/constants structure greps, and prettier over the four code files.
- Task 2's automated command passes: the todo gate, triage order, the recipe section, no
  identifiers, no new planning-gate FAIL, and the prettier file-info probe proving the omitted
  --check would be vacuous.
- Manual (operator, later, outside this task): run the todo's Test recipe on the Windows box and
  record 4a/4b/4c in 21-UAT.md. This plan does not claim those items pass.
</verification>

<success_criteria>
- On Windows, the D-10 install gate and the D-11 launch gate read one root, the Default Steam path.
  A cross-gate test proves needs-install, needs-launch and ready against the actual
  `isSteamClientInstalled()`.
- macOS and Linux detection is unchanged and proven not to consult GlobalConfig.
- The Phase 21 todo is `ready: live-gate` and carries a recipe the operator can run without
  uninstalling Steam.
</success_criteria>

<output>
Create `.planning/quick/261101-whs-windows-steam-client-install-check-honor/261101-whs-SUMMARY.md` when done
</output>
