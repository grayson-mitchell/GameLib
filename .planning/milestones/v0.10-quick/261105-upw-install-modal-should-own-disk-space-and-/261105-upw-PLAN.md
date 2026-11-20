---
phase: quick-261105-upw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/__tests__/installFlows.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts
  - src/frontend/screens/Library/components/InstallModal/__tests__/steamLibraryRoute.test.ts
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts
  - src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts
  - .planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md (moved to completed/)
  - .planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md
autonomous: true
requirements: [TODO-2026-11-05-steam-installapp-modal-owns-disk-and-folder]

must_haves:
  truths:
    - "With the Steam Experimental InstallApp Feature ON, enableSteamNativeInstall OFF and a mac-native (not bottle-eligible) title, the install-options modal shows the library dropdown, with the free-space line under it, whenever there is more than one registered Steam library"
    - "On that route the Install button sends the selected library root as `path`, so `SteamGame.install()`'s InstallApp branch gets it through `resolveSteamLibraryRoot(args.path)`"
    - "SteamDialog's sign-in gate (`signInRequired`) and its notice copy (contentLightNotice sentence choice) behave as before on every route: the `nativeInstallOn` prop SteamDialog receives is false on the InstallApp route, as it is today"
    - "The renderer never reads `steamExperimentalInstallApp` / `enableSteamNativeInstall`: the route verdict comes only from the backend, through `isSteamExperimentalInstallAppEnabled()` and `isSteamNativeInstallEnabled()`"
    - "With the feature OFF, native install ON, or a bottle-eligible title, the modal and `listSteamLibraryTargets` behave exactly as before"
  artifacts:
    - path: "src/backend/sidecar/installFlowRegistration.ts"
      provides: "getSteamInstallAppTargets invoke handler (8th install-slice channel)"
      contains: "'getSteamInstallAppTargets'"
    - path: "src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts"
      provides: "resolveSteamLibraryRoute (follow-up fetch, never rejects) + deriveSteamLibraryOwnership (pure)"
      exports: ["resolveSteamLibraryRoute", "deriveSteamLibraryOwnership"]
    - path: "src/common/types/ipc.ts"
      provides: "getSteamInstallAppTargets type"
      contains: "getSteamInstallAppTargets"
  key_links:
    - from: "src/frontend/screens/Library/components/InstallModal/index.tsx"
      to: "window.api.getSteamInstallAppTargets"
      via: "resolveSteamLibraryRoute, called only when listSteamLibraryTargets resolved []"
      pattern: "resolveSteamLibraryRoute\\("
    - from: "src/backend/sidecar/installFlowRegistration.ts"
      to: "isSteamExperimentalInstallAppEnabled"
      via: "import from ../storeManagers/steam/experimentalInstallAppSetting"
      pattern: "isSteamExperimentalInstallAppEnabled\\(\\)"
    - from: "InstallModal/index.tsx resolveSteamSectionGating input"
      to: "nativeInstallOn: steamLibraryChoiceOwned"
      via: "gating owns the library choice on native-ON OR the InstallApp route; SteamDialog prop stays steamNativeInstallOn"
      pattern: "nativeInstallOn=\\{steamNativeInstallOn\\}"
---

<objective>
Close todo `2026-11-05-steam-installapp-modal-owns-disk-and-folder` (parent todo
`2026-11-03-steam-experimental-installapp-setting`, step 6 "lost confirmations").

Quick 261105-ord added the opt-in InstallApp route. With it, Steam's own install dialog never
opens, and that dialog was where the user picked the library and saw the free space. Today the
modal treats a non-empty `listSteamLibraryTargets` list as meaning "GameLib installs this". On
the InstallApp route that list is `[]`, so the modal shows no dropdown and no free-space line.
The same signal also drives SteamDialog's sign-in gate and notice copy, which must not change.

Fix: add a separate backend-authoritative IPC, `getSteamInstallAppTargets(appName)`, which
returns `{ installAppRoute: boolean; libraries }`. The modal calls it only when the first list
is `[]`. It then feeds the section-gating resolver a "GameLib owns the library choice" value,
and keeps SteamDialog's `nativeInstallOn` prop exactly as it is today.

Output: the new IPC with tests, the modal wiring with tests, and the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md
@.planning/quick/261105-ord-steam-experimental-installapp-setting-ma/261105-ord-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing a `<verify>` result or touching the todo files.
Two conventions apply. (1) Run a scoped `npx prettier --check` over the exact paths written, after
confirming each with `npx prettier --file-info <path>`; `.planning/**` is prettier-ignored, so
there is no check for it. (2) The todo files have frontmatter rules: `completed/` is exempt, but
the parent todo stays in `pending/` and must keep `severity:`/`platform:`/`ready:`.

**Path correction.** The todo's `files:` list has wrong paths. The real locations are:
- `src/backend/sidecar/installFlowRegistration.ts` (not storeManagers/steam/)
- `src/frontend/screens/Library/components/InstallModal/` (not screens/Game/InstallModal/)
- `src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx`

<interfaces>
Extracted from the codebase. Use these directly.

src/backend/storeManagers/steam/experimentalInstallAppSetting.ts:
  export function isSteamExperimentalInstallAppEnabled(): boolean  // isMac && setting === true; the ONLY reader of the setting

src/backend/sidecar/installFlowRegistration.ts (existing imports, lines ~129-131):
  import { listSteamLibraryTargets } from '../storeManagers/steam/installLocation'
  import { isSteamNativeInstallEnabled } from '../storeManagers/steam/nativeInstallSetting'
  import { getSteamBottleEligibilityVerdict } from '../storeManagers/steam/installFormIpc'
  // docstring above registerInstallFlows(): "Registers the seven install-slice invoke handlers."
  // existing handler (lines ~275-288):
  ipcMain.handle('listSteamLibraryTargets', async (_event: unknown, ...args: unknown[]) => {
    if (isSteamNativeInstallEnabled()) return listSteamLibraryTargets()
    const appName = args[0]
    if (typeof appName !== 'string' || !/^\d+$/.test(appName)) return []
    try { const verdict = await getSteamBottleEligibilityVerdict(appName)
          return verdict.eligible ? listSteamLibraryTargets() : [] } catch { return [] }
  })

listSteamLibraryTargets() element shape: { path: string; steamappsDir: string; isPrimary: boolean }

src/common/types/ipc.ts (~line 319):
  listSteamLibraryTargets: (appName?: string) => Promise<{ path: string; steamappsDir: string; isPrimary: boolean }[]>

src/preload/api/steam.ts (printWidth 120 via src/preload/.prettierrc):
  export const listSteamLibraryTargets = makeHandlerInvoker('listSteamLibraryTargets')

src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts line 88:
  'installFlowRegistration.ts': { invoke: 7, send: 0 },
  (Gate 2 parses the token after `Registers` in the register*Flows() docstring; number words are accepted)

src/backend/sidecar/__tests__/installFlows.test.ts: startSidecar(), writeInvoke(input, id, channel, args),
  flush(), frames; mockSettings({...}); getSteamLibraries mocked; getSteamBottleEligibilityVerdict mocked via
  jest.mock('../../storeManagers/steam/installFormIpc', ...). Backend jest has resetMocks: true.
  See the existing `describe('quick 261030-o77: listSteamLibraryTargets with the toggle OFF', ...)` block
  (~line 371) for the exact invoke/assert shape to mirror.

src/frontend/screens/Library/components/InstallModal/index.tsx:
  line 67:  type SteamLibraryFetch =
              | { phase: 'pending' }
              | { phase: 'ok'; targets: SteamDialogLibraryOption[] }
              | { phase: 'failed' }
  line 163: const steamLibrariesSettled = libraryFetch.phase !== 'pending'
  line 167: const steamLibraryList = useMemo(() => (libraryFetch.phase === 'ok' ? libraryFetch.targets : []), [libraryFetch])
  lines 368-402: useEffect -> window.api.listSteamLibraryTargets(appName).then(libraries => setLibraryFetch({ phase: 'ok', targets: libraries }))
                 .catch(() => { logError(...); setLibraryFetch({ phase: 'failed' }) })
  line 425: const steamNativeInstallOn = steamLibraryList.length > 0
  lines 427-475: steamGatingRaw = useMemo(() => resolveSteamSectionGating({ ..., nativeInstallOn: steamNativeInstallOn,
                 libraryCount: steamLibraryList.length }), [platform, platformToInstall, windowsDepotOffered,
                 depotSignalResolved, steamLibraryList, steamNativeInstallOn, eligibility.bottleRequired])
  line ~661: <SteamDialog ... steamLibraries={steamLibraryList} nativeInstallOn={steamNativeInstallOn} .../>

SteamDialogLibraryOption is exported from ./SteamDialog/installTarget (structurally { path, steamappsDir, isPrimary }).

Section-gating facts (steamSectionGating.ts, matrix NOT changed by this plan):
  hasChoice = input.nativeInstallOn && input.libraryCount > 1
  libraryDropdown = !wineSection && hasChoice ; freeSpaceLine = libraryDropdown
  contentLightNotice = !isMac && !libraryDropdown   (InstallApp route is macOS-only, so the notice is unaffected)

SteamDialog (UNCHANGED by this plan):
  signInRequired = (nativeInstallOn || gating.wineSection) && steamInstallNeedsSignIn(...)
  destination = resolveSteamInstallPath(selectedPath, steamLibraries, gating.libraryDropdown) -> installSteamGame(..., destination, ...)
  The free-space line renders inside the dropdown's afterSelect when gating.freeSpaceLine.

Source gates that must stay green in index.tsx (installModalSource.test.ts / steamEligibilityWiring.test.ts):
  - no `length > 1` anywhere except `availablePlatforms.length > 1`
  - `libraryCount` appears only on the line `libraryCount: steamLibraryList.length`
  - the dep array keeps `depotSignalResolved,\n      steamLibraryList,` adjacent
  - B7: the first `.catch(` after `.listSteamLibraryTargets(appName)` must contain `setLibraryFetch({ phase: 'failed' })`
    within 400 chars; the union regex `{ phase: 'ok'; targets: SteamDialogLibraryOption[] }` is updated by Task 2
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend getSteamInstallAppTargets IPC (handler, type, preload, census)</name>
  <files>src/backend/sidecar/installFlowRegistration.ts, src/backend/sidecar/__tests__/installFlows.test.ts, src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts, src/common/types/ipc.ts, src/preload/api/steam.ts</files>
  <behavior>
    New describe block in installFlows.test.ts, `quick 261105-upw: getSteamInstallAppTargets`. It mocks
    `../../storeManagers/steam/experimentalInstallAppSetting` with `isSteamExperimentalInstallAppEnabled: jest.fn()`.
    Set the return value in beforeEach, because resetMocks is on. Do not rely on the host's isMac.
    Use `getSteamLibraries` resolving `['/fake/steam/library']`.
    - Feature ON, native OFF, verdict `{ eligible: false }`, args ['570'] -> `{ installAppRoute: true, libraries: [{ path: '/fake/steam/library', steamappsDir: '/fake/steam/library/steamapps', isPrimary: true }] }`
    - Feature OFF, native OFF -> `{ installAppRoute: false, libraries: [] }`; the verdict is not called
    - Feature ON, native ON -> `{ installAppRoute: false, libraries: [] }`; the verdict is not called (the native depot installer owns the install)
    - Feature ON, native OFF, verdict `{ eligible: true }` -> `{ installAppRoute: false, libraries: [] }` (a bottle-routed title always uses GameLib's depot installer)
    - Feature ON, native OFF, verdict rejects -> `{ installAppRoute: false, libraries: [] }` (fail-closed to today's behaviour)
    - it.each over malformed appName [123], [''], ['12; rm -rf /'], ['abc'], [null], plus no args -> `{ installAppRoute: false, libraries: [] }`; the verdict is not called
    - Feature ON, native OFF, not eligible, `getSteamLibraries` resolves [] -> `{ installAppRoute: true, libraries: [] }`
    - Regression: the existing listSteamLibraryTargets tests are unchanged and still pass. With feature ON + native OFF + not eligible, `listSteamLibraryTargets` still resolves [], so SteamDialog's sign-in signal stays unchanged
  </behavior>
  <action>
    RED first: write the describe block above and run it. It must fail with the channel unregistered.

    GREEN, in `src/backend/sidecar/installFlowRegistration.ts`:
    - Import `isSteamExperimentalInstallAppEnabled` from `'../storeManagers/steam/experimentalInstallAppSetting'`.
    - Register `ipcMain.handle('getSteamInstallAppTargets', async (_event: unknown, ...args: unknown[]) => ...)` right after the `listSteamLibraryTargets` handler. Its order is:
      1. If `!isSteamExperimentalInstallAppEnabled() || isSteamNativeInstallEnabled()`, return the closed reply.
      2. Validate `args[0]` as a string matching `/^\d+$/`, the same check `listSteamLibraryTargets` uses. If it fails, return the closed reply.
      3. Await `getSteamBottleEligibilityVerdict(appName)` inside try/catch. On `eligible: true`, or on a throw, return the closed reply.
      4. Otherwise return `{ installAppRoute: true, libraries: await listSteamLibraryTargets() }`. If `listSteamLibraryTargets()` throws, return the closed reply. The handler must never reject.
      The closed reply is `{ installAppRoute: false, libraries: [] }`. Define it as a small local const factory, so no shared mutable object is returned.
    - Add a comment block above the handler. It names quick 261105-upw. It says this is the modal's own discriminator for the InstallApp route, so the `listSteamLibraryTargets` list length keeps meaning only "GameLib's depot installer installs this" (the sign-in gate and notice-copy signal). It also says the settings read stays in `isSteamExperimentalInstallAppEnabled()` (RESEARCH Pitfall 4: no renderer settings read).
    - Change the `registerInstallFlows()` docstring from "Registers the seven install-slice invoke handlers" to "Registers the eight install-slice invoke handlers".
    - Add a bullet for `getSteamInstallAppTargets` to the module docstring's channel inventory, after the `listSteamLibraryTargets` bullet.

    Then:
    - `flowRegistrationCensus.test.ts`: change `'installFlowRegistration.ts': { invoke: 7, send: 0 }` to `invoke: 8`.
    - `src/common/types/ipc.ts`: add `getSteamInstallAppTargets: (appName?: string) => Promise<{ installAppRoute: boolean; libraries: { path: string; steamappsDir: string; isPrimary: boolean }[] }>` right after `listSteamLibraryTargets`. Give it a short comment: quick 261105-upw, backend-authoritative, true only for feature ON + native OFF + non-bottle title on macOS.
    - `src/preload/api/steam.ts`: add `export const getSteamInstallAppTargets = makeHandlerInvoker('getSteamInstallAppTargets')` under `listSteamLibraryTargets`, with a one-line comment.

    Do not change the `listSteamLibraryTargets` handler's behaviour.
    After the code change, run `graphify update .` per CLAUDE.md.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts && npx tsc --noEmit && for p in src/backend/sidecar/installFlowRegistration.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/common/types/ipc.ts src/preload/api/steam.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/backend/sidecar/installFlowRegistration.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/common/types/ipc.ts src/preload/api/steam.ts</automated>
  </verify>
  <done>The new describe block passes, along with every existing installFlows test. The census reads invoke 8 and its docstring gate is green. tsc is clean. Prettier passes on all five paths, and none of them reports ignored.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Modal wiring — own InstallApp discriminator, gating owns the library choice, SteamDialog prop unchanged</name>
  <files>src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts, src/frontend/screens/Library/components/InstallModal/__tests__/steamLibraryRoute.test.ts, src/frontend/screens/Library/components/InstallModal/index.tsx, src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts, src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts</files>
  <behavior>
    steamLibraryRoute.test.ts. Pure, no jsdom. Pass a fake api object `{ getSteamInstallAppTargets: jest.fn(), logError: jest.fn() }`.
    - resolveSteamLibraryRoute(api, '570', [libA]) -> `{ targets: [libA], installAppRoute: false }`; getSteamInstallAppTargets NOT called (native or bottle depot route; behaviour as today)
    - resolveSteamLibraryRoute(api, '570', []) with reply `{ installAppRoute: true, libraries: [libA, libB] }` -> `{ targets: [libA, libB], installAppRoute: true }`; called with '570'
    - resolveSteamLibraryRoute(api, '570', []) with reply `{ installAppRoute: false, libraries: [] }` -> `{ targets: [], installAppRoute: false }`
    - The follow-up rejects -> resolves (does NOT reject) `{ targets: [], installAppRoute: false }`, and api.logError is called once with a message naming the appName and not any path
    - A malformed reply (null, `{}`, libraries not an array, installAppRoute not a boolean) -> `{ targets: [], installAppRoute: false }` (shape-checked, fail-closed)
    - deriveSteamLibraryOwnership({ targets: [libA], installAppRoute: false }) -> `{ nativeInstallOn: true, libraryChoiceOwned: true }`
    - deriveSteamLibraryOwnership({ targets: [libA, libB], installAppRoute: true }) -> `{ nativeInstallOn: false, libraryChoiceOwned: true }`
    - deriveSteamLibraryOwnership({ targets: [], installAppRoute: false }) -> `{ nativeInstallOn: false, libraryChoiceOwned: false }`
    - deriveSteamLibraryOwnership(undefined) (pending or failed fetch) -> `{ nativeInstallOn: false, libraryChoiceOwned: false }`
    - Matrix tie-in: feed resolveSteamSectionGating (darwin, bottleRequired false, depotSignalResolved true, hasWindowsDepot false, Mac) with `nativeInstallOn: libraryChoiceOwned` from the InstallApp-route derivation. With libraryCount 2 it yields `libraryDropdown: true, freeSpaceLine: true, contentLightNotice: false`. The same inputs with installAppRoute false and targets [] yield `libraryDropdown: false, freeSpaceLine: false`.
    steamEligibilityWiring.test.ts (source gates on index.tsx):
    - Update the B7 union regex to `{ phase: 'ok'; targets: SteamDialogLibraryOption[]; installAppRoute: boolean }`
    - New gate: the stripped source contains `nativeInstallOn={steamNativeInstallOn}` (the SteamDialog prop) and `nativeInstallOn: steamLibraryChoiceOwned,` (the resolver input), and contains `resolveSteamLibraryRoute(` exactly once
    - New known-bad: replace `nativeInstallOn={steamNativeInstallOn}` with `nativeInstallOn={steamLibraryChoiceOwned}` in a copy of the source -> the gate fails. This proves the sign-in-gate guard is not vacuous.
    - New gate: no `steamExperimentalInstallApp` and no `enableSteamNativeInstall` identifier in the stripped index.tsx or steamLibraryRoute.ts source (no renderer settings read)
  </behavior>
  <action>
    RED first: write steamLibraryRoute.test.ts and the wiring-test changes, then run them. They must fail.

    Create `steamLibraryRoute.ts`. It is zero-runtime-import except types. `steamSectionGating.ts` explains why: index.tsx imports scss, so pure logic must live outside it to be testable. It exports:
    - `resolveSteamLibraryRoute(api: Pick<Window['api'], 'getSteamInstallAppTargets' | 'logError'>, appName: string, libraries: SteamDialogLibraryOption[]): Promise<{ targets: SteamDialogLibraryOption[]; installAppRoute: boolean }>`
      - A non-empty `libraries` resolves immediately as `{ targets: libraries, installAppRoute: false }`.
      - Otherwise it awaits `api.getSteamInstallAppTargets(appName)`. It shape-checks the reply: `installAppRoute === true` and `Array.isArray(libraries)`. If the check fails, it falls back to `{ targets: [], installAppRoute: false }`.
      - It catches its own rejection. On rejection it logs `quick 261105-upw InstallModal: InstallApp route fetch failed for appName "<appName>"` with no paths, then returns the fallback.
      - It must NEVER reject. The outer `.catch` in index.tsx must keep meaning "the primary `listSteamLibraryTargets` fetch was rejected".
    - `deriveSteamLibraryOwnership(settled: { targets: SteamDialogLibraryOption[]; installAppRoute: boolean } | undefined): { nativeInstallOn: boolean; libraryChoiceOwned: boolean }`
      - `nativeInstallOn = !!settled && !settled.installAppRoute && settled.targets.length > 0`. This is today's signal, and it stays false on the InstallApp route.
      - `libraryChoiceOwned = nativeInstallOn || (!!settled && settled.installAppRoute)`.
    - Write a module docstring. It names quick 261105-upw and the todo. It explains the two meanings. `nativeInstallOn` feeds SteamDialog's sign-in gate and notice copy, and is not changed. `libraryChoiceOwned` feeds the section-gating resolver, so the library dropdown and free-space line render on the InstallApp route. Both are derived from backend replies only, per Pitfall 4.
    - Use `Pick<Window['api'], ...>` only if `window.api` is typed globally as `Window['api']`. Otherwise declare a minimal local interface with the two method signatures, matching ipc.ts.

    Edit `index.tsx`:
    - Union ok variant: `{ phase: 'ok'; targets: SteamDialogLibraryOption[]; installAppRoute: boolean }`.
    - Effect: `window.api.listSteamLibraryTargets(appName).then((libraries) => resolveSteamLibraryRoute(window.api, appName, libraries)).then(({ targets, installAppRoute }) => { if (cancelled) return; setLibraryFetch({ phase: 'ok', targets, installAppRoute }) }).catch(...)`.
      Leave the existing `.catch` body byte-identical: logError plus `setLibraryFetch({ phase: 'failed' })`. Keep the call text `.listSteamLibraryTargets(appName)` exactly, because B7 indexes on it.
      No inner `.catch(` may appear between the fetch and the outer catch.
    - Replace `const steamNativeInstallOn = steamLibraryList.length > 0` with a destructure from `deriveSteamLibraryOwnership(libraryFetch.phase === 'ok' ? libraryFetch : undefined)`. Name the results `steamNativeInstallOn` and `steamLibraryChoiceOwned`. Wrap the call in a `useMemo` keyed on `[libraryFetch]`.
    - Update the comment above it. A non-empty list is no longer the only "GameLib owns the library choice" signal. The InstallApp route supplies its own discriminator, quick 261105-upw.
    - In the resolver input, change `nativeInstallOn: steamNativeInstallOn,` to `nativeInstallOn: steamLibraryChoiceOwned,` and update the adjacent comment. Leave `libraryCount: steamLibraryList.length` untouched.
    - In the memo dep array, replace `steamNativeInstallOn` with `steamLibraryChoiceOwned`, keeping `depotSignalResolved,\n      steamLibraryList,` adjacent.
    - Keep `nativeInstallOn={steamNativeInstallOn}` on `<SteamDialog>` unchanged. This is what keeps the sign-in gate and notice copy as they are, per the todo.
    - Add no `length > 1` and no second `libraryCount`.

    `steamSectionGating.ts`: change the doc comments only, on the `nativeInstallOn` input field and the step-3 comment. They should now say the input means "GameLib owns the library choice". That is true when native install is ON, and also on the InstallApp route (quick 261105-upw). Leave the logic and matrix unchanged. Do not touch steamSectionGating.test.ts. Its 144-combination matrix must still pass unchanged.

    Leave SteamDialog/index.tsx unchanged. That is a hard constraint from the todo.

    Discretion, documented: on the InstallApp route this mirrors native-ON exactly. The dropdown and the free-space line render only when there is more than one library, because D-08 scopes the free-space line to the shown library selection inside the dropdown. With one library, the install goes to the primary library through `resolveSteamLibraryRoot('')`, the same as native-ON today.

    After the code change, run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend src/frontend/screens/Library/components/InstallModal src/frontend/state/__tests__/InstallGameModal.test.ts && npx tsc --noEmit && pnpm lint && for p in src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamLibraryRoute.test.ts src/frontend/screens/Library/components/InstallModal/index.tsx src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamLibraryRoute.test.ts src/frontend/screens/Library/components/InstallModal/index.tsx src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts && test -z "$(git diff --name-only -- src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/screens/Library/components/InstallModal/__tests__/steamSectionGating.test.ts)"</automated>
  </verify>
  <done>Everything in the InstallModal test folder passes, including the unchanged 144-combination steamSectionGating matrix, installModalSource, steamDialogSource and the updated steamEligibilityWiring. InstallGameModal tests pass. tsc and lint are clean. Prettier passes on all five paths. SteamDialog/index.tsx and steamSectionGating.test.ts have no diff.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and annotate the parent's step 6</name>
  <files>.planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md, .planning/todos/completed/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md, .planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md</files>
  <action>
    - `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`.
    - Append a `## Resolution` section to the moved file. It names quick 261105-upw and the new `getSteamInstallAppTargets` IPC. It says the modal now feeds the gating resolver `steamLibraryChoiceOwned` while SteamDialog keeps `steamNativeInstallOn`. It records the single-library behaviour: no picker and no free-space line, the same as native-ON. It records that the todo's `files:` paths were stale and gives the real ones. Leave the existing frontmatter unchanged.
    - In the parent todo `.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md`, append one sentence to step 6: the modal half is done in quick 261105-upw (library dropdown and free-space line on the InstallApp route). Keep its frontmatter, including `severity:`/`platform:`/`ready:`, byte-identical.
    - Both paths are prettier-ignored (`.planning`), so there is no formatter check. Match the surrounding markdown wrap by hand.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/todos/completed/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md && test ! -f .planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md && grep -q '261105-upw' .planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md && pnpm planning-gates</automated>
    Prettier: the written paths are all under `.planning/`, which is prettier-ignored, so a `--check` would be vacuous and is deliberately omitted (gamelib-conventions).
  </verify>
  <done>The todo is in completed/ with a Resolution section. The parent todo's step 6 references 261105-upw. `pnpm planning-gates` passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC | `appName` passed to `getSteamInstallAppTargets` is renderer-supplied |
| sidecar -> renderer reply | the renderer must not trust the reply's shape blindly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-upw-01 | Tampering | `getSteamInstallAppTargets` handler | mitigate | `typeof appName === 'string' && /^\d+$/` before any verdict call. A malformed value returns the closed reply (the it.each test covers this) |
| T-upw-02 | Elevation | install `path` on the InstallApp route | accept | The path comes only from `resolveSteamInstallPath` over registered libraries. The backend re-maps it through `resolveSteamLibraryRoot`/`resolveOverride` (registered folders only, D-08), and that code is unchanged |
| T-upw-03 | Information disclosure | `resolveSteamLibraryRoute` log line | mitigate | Log only the appName, never library paths (unit test asserts) |
| T-upw-04 | Denial of service | follow-up fetch rejection | mitigate | `resolveSteamLibraryRoute` never rejects and fails closed to today's `{ targets: [], installAppRoute: false }`, so the modal can never stick in `pending` |
</threat_model>

<verification>
- Backend and Frontend jest scopes above are green. The steamSectionGating matrix and SteamDialog are untouched.
- `npx tsc --noEmit` and `pnpm lint` are clean.
- Live check (optional, not gating: `ready: code`). On macOS with the feature ON, native OFF and two registered Steam libraries, open "Install with options..." on a mac-native title. The dropdown and free-space line show, and picking the second library installs there through InstallApp. With the feature OFF the modal looks as it does today.
</verification>

<success_criteria>
- On the InstallApp route the modal shows the library dropdown and free-space line, using the same rules as native-ON.
- The sign-in gate and notice copy are unchanged (SteamDialog has no diff, and its `nativeInstallOn` prop is still `steamNativeInstallOn`).
- No settings read in the renderer. The route verdict comes only from `isSteamExperimentalInstallAppEnabled()` and `isSteamNativeInstallEnabled()` in the backend.
- The todo is closed.
</success_criteria>

<output>
Create `.planning/quick/261105-upw-install-modal-should-own-disk-space-and-/261105-upw-SUMMARY.md` when done.
</output>
