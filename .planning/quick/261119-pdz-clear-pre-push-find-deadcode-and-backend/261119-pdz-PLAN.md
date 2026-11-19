---
phase: quick-261119-pdz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/nativePortCatalogue.ts
  - src/frontend/components/UI/RegionPicker/index.tsx
  - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
  - meta/backendDiCeilings/frontend-components-ui.json
  - src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx
  - src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx
autonomous: true
requirements: [QUICK-261119-pdz]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`pnpm find-deadcode` exits 0. The three findings (NativePortDataStyle, NativePortMac, RegionPickerOption) are gone because their `export` keyword was dropped. No `@public` tag was added and meta/knip-baseline.txt is unchanged"
    - "`pnpm backend-di-ceilings` exits 0 with no shard entry added or raised. The NoticeStack.test.tsx entry is deleted from meta/backendDiCeilings/frontend-components-ui.json because that file now has 0 module mocks. No other shard line changes"
    - "The gate's own counter (`countJestMock` from meta/backendDiCeilings.cjs) reports 0 for each of the four rewritten test files. At HEAD they count 5, 1, 6 and 1"
    - "The rewritten suites cover the same behaviour and have at least as many tests as at HEAD: NoticeStack 2, NativePortInfo 4, Settings LaunchWithoutSteam at least 15, backend launchWithoutSteam 13 (34 in total at HEAD). Every user-visible string and every called-with argument asserted at HEAD is still asserted"
    - "Production behaviour is unchanged. The only non-test source edits are three removed `export` keywords on type declarations that are still used inside their own files"
    - "Each of the nine checks in .husky/pre-push, run on its own, exits 0, and public/locales/en/gamelib.json is left with no diff"
  artifacts:
    - path: "src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx"
      provides: "AppNoticeStack order test against the real notice components under jsdom"
      contains: "@jest-environment jsdom"
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx"
      provides: "NativePortInfo rendered through real i18next with the shipped en gamelib catalogue"
      contains: "initReactI18next"
    - path: "src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx"
      provides: "LaunchWithoutSteam rendered inside a real SettingsContext.Provider"
      contains: "SettingsContext.Provider"
    - path: "src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts"
      provides: "setting-driven launch cases run against the real logger"
      contains: "initHeadless"
    - path: "meta/backendDiCeilings/frontend-components-ui.json"
      provides: "jestMock shard without the NoticeStack.test.tsx entry"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx"
      to: "public/locales/en/gamelib.json"
      via: "i18next init resources { en: { gamelib } }, so the test checks the shipped strings"
      pattern: "resources:"
    - from: "src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx"
      to: "src/frontend/screens/Settings/SettingsContext.tsx"
      via: "a Provider value supplies isDefault, appName, getSetting and setSetting in place of the module-mocked hooks"
      pattern: "SettingsContext.Provider"
    - from: "src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts"
      to: "src/backend/logger/index.ts"
      via: "initHeadless() in beforeAll gives logInfo/logWarning a writer. HOME is redirected by src/backend/jest.setupContainment.ts"
      pattern: "beforeAll\\(\\(\\) => initHeadless\\(\\)\\)"
    - from: "meta/backendDiCeilings.cjs"
      to: "meta/backendDiCeilings/frontend-components-ui.json"
      via: "contract: a 0 file must have no entry (a zero entry fails), and a file below its entry fails as shrank"
      pattern: "NoticeStack"
---

<objective>
Clear the two pre-push checks that still block `git push origin main`: `pnpm find-deadcode` (3 new knip findings) and `pnpm backend-di-ceilings` (the jestMock ratchet: 3 new violations plus NoticeStack 5 > 4). Do it by removing dead code and module mocks. Do not add baseline entries, raise ceilings or tag anything `@public`. Then show that all nine pre-push checks pass.

Purpose: the push is blocked. Both gates are shrink-only ratchets, and their messages say "remove the dead code" and "remove it instead". Growing a baseline would go against what the gates are for.

Output: three removed `export` keywords, four test files rewritten so that none of them uses a jest module mock, one shard line deleted, and a recorded nine-check sweep. The orchestrator pushes. This plan does not.

Facts established at planning time (HEAD d02b10267; the task was filed against 043d5483c, and the only commit between them, d02b10267, touched steamLaunchWatch and its tests):
- `pnpm find-deadcode` exits 1 with exactly three lines: `types | src/common/nativePortCatalogue.ts | NativePortDataStyle`, `... | NativePortMac`, `types | src/frontend/components/UI/RegionPicker/index.tsx | RegionPickerOption`. `git grep` finds no use of any of the three outside its own file. In each file the type is still used locally (`NativePortEntry.mac`, `NativePortEntry.dataStyle`, `RegionPickerProps.options`), so the declarations stay and only `export` goes. tsconfig.json has no `declaration` option, so an exported interface may reference a non-exported type. RegionPicker came from Phase 47 (47-16, ed0d5e6fe), and `RegionPickerOption` has never been imported anywhere else.
- `node meta/backendDiCeilings.cjs` exits 1 with four FAIL lines: backend launchWithoutSteam.test.ts at 1 (no baseline), NoticeStack.test.tsx at 5 against a baseline of 4, NativePortInfo.test.tsx at 1 (no baseline), and Settings LaunchWithoutSteam.test.tsx at 6 (no baseline). The gate's `countJestMock` gives the same 5/1/6/1. It counts `mock`/`doMock`/`setMock`/`unstable_mockModule` calls on `jest`. It does not count `jest.fn`, `jest.spyOn` or `jest.requireActual`, and it ignores comments.
- The commits that added the mocks: the backend logger mock came in 61d80ed3b (quick-261117-q1t). The Settings component's six mocks came in d8d53ef42 (quick-261117-q1t). NativePortInfo's react-i18next mock came in 20e70fdc1 (quick-261117-r4c). NoticeStack's fifth mock (the ThemeSaveFailedNotice stub) came in ab124b14a (64-09).
- These zero-mock patterns already exist in the repo, and each was probed during planning with a throwaway test that was then deleted:
  - **jsdom plus real modules.** Examples are src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx and src/frontend/components/UI/ThemeSaveFailedNotice/__tests__/ThemeSaveFailedNotice.test.tsx. Each uses an `@jest-environment jsdom` docblock, imports `frontend/testUtils/jsdomNoticeEnv` FIRST, initialises a real `i18next.use(initReactI18next)`, renders with `@testing-library/react`, and assigns `window.api` with `Object.assign(window, ...)`. Probe 1: under the default node environment, NoticeStack.test.tsx with the real notices fails with `ReferenceError: window is not defined` at src/preload/tauriAttach.ts:44. With the docblock and jsdomNoticeEnv, the same identity assertions pass in about 0.5s. They print `console.warn` lazy-miss lines from src/preload/tauriTransport.ts, which are harmless and also appear in NoticeStackTwoToast. Probe 2: LaunchWithoutSteam renders under jsdom inside a real `SettingsContext.Provider`. For the DRM case it produced `.toggleWithInfo`, a disabled unchecked `#launchWithoutSteam`, and a `.helpLink--iconOnly` button with aria-label `infobox.help`. Clicking that button showed `.poppedElement` with the DRM reason text.
  - **real backend logger.** src/backend/storeManagers/steam/__tests__/adoptionWatch.test.ts:15,41-42 and adoptionStatus.test.ts:10,35 import `initHeadless` from `backend/logger` and call it in `beforeAll`. The backend jest containment setup (src/backend/jest.setupContainment.ts) redirects HOME, so the writer never touches the real profile.
  - Precedent: quick 261117-omv took NoticeStackTwoToast from 7 to 0 and steamLoginPollLifecycle from 4 to 0 the same way (see .planning/quick/261117-omv-backend-di-jestmock-ratchet-cut-mocks-in/261117-omv-SUMMARY.md).
- No production seam is needed. `launchWithoutSteam` already takes `LaunchWithoutSteamSeams`. The two frontend components already take everything they need from props, context and `window.api`.
- HEAD baselines for the files this plan writes: `npx eslint` reports 4 warnings, all on mock lines (3 in NativePortInfo.test.tsx at lines 6, 7 and 14, and 1 in the Settings test at line 11) and 0 elsewhere. The four suites pass 34/34 (2 + 4 + 15 + 13). `npx prettier --file-info` reports `"ignored": false` for all seven paths, with parser `typescript` for the six TS files and `json` for the shard, so every prettier check below is real. The `pnpm lint` ceilings are max-only, so fewer warnings cannot fail them.
- According to the task brief, the other seven pre-push checks passed at 043d5483c. `node meta/steamLineCeiling.cjs` was re-measured as PASS at d02b10267. Test files are out of scope for steam-line-ceiling and gameinfo-narrowing-ceiling.
- Concurrency: another session commits to main while this runs (d02b10267 landed during planning). Stage only the exact paths listed in each task, never `git add -A` or `git add .`. Leave every other dirty file alone (`.planning/state.json`, src/frontend/screens/Discounts/**, and so on). Do not use a gsd commit helper without `--files`, because it sweeps every dirty `.planning` file.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@meta/backendDiCeilings.cjs
@src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Drop the three dead type exports and take NoticeStack.test.tsx from 5 module mocks to 0 (one path through both failing gates)</name>
  <files>src/common/nativePortCatalogue.ts, src/frontend/components/UI/RegionPicker/index.tsx, src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx, meta/backendDiCeilings/frontend-components-ui.json</files>
  <read_first>
    - src/common/nativePortCatalogue.ts lines 14-30 (the two type aliases and the `NativePortEntry` fields that use them)
    - src/frontend/components/UI/RegionPicker/index.tsx lines 1-24 (`RegionPickerOption` and `RegionPickerProps.options`)
    - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx (whole file, 59 lines)
    - src/frontend/components/UI/NoticeStack/index.tsx (`AppNoticeStack` has no hooks and returns an element tree whose children are the four imported notice components)
    - src/frontend/testUtils/jsdomNoticeEnv.ts lines 1-20 (why it is imported first, and why `window` is extended, not replaced)
    - meta/backendDiCeilings/frontend-components-ui.json (line 12 is the NoticeStack entry)
  </read_first>
  <action>
Knip findings (find-deadcode):
- In src/common/nativePortCatalogue.ts, remove only the leading `export` keyword from the `NativePortMac` and `NativePortDataStyle` type aliases (lines 14-15). Keep both aliases, because `NativePortEntry.mac` and `NativePortEntry.dataStyle` use them.
- In src/frontend/components/UI/RegionPicker/index.tsx, remove only the leading `export` keyword from `interface RegionPickerOption` (line 5). Keep the interface, because `RegionPickerProps.options` uses it.
- Do not add an `@public` tag and do not edit meta/knip-baseline.txt. Planning found no consumer outside these files, so there is no justification for either. If a later change needs one of these types elsewhere, it re-adds the export in the same commit as the import. Do not touch src/frontend/screens/Discounts/** or src/frontend/screens/StoreSearch/**.

NoticeStack test (jestMock ratchet, 5 to 0):
- Rewrite src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx so it has no jest module-mock calls. That covers the five stubs: the redundant `../index.scss` one (the frontend jest moduleNameMapper already sends `.scss` to src/frontend/__mocks__/styleStub.ts) and the four notice-component stubs.
- Put an `@jest-environment jsdom` docblock at the very top. Make the first import `import 'frontend/testUtils/jsdomNoticeEnv'`, as in NoticeStackTwoToast.test.tsx. Then import the four real notice components, `NoticeStack`/`AppNoticeStack` from `../index`, and the `at` fixture, as the file does today.
- Delete the "Imported after the mocks above" comment. You may replace it with a one-line note that the real notice modules are loaded and the test checks only element-type identity, so nothing renders. Keep that note general and do not quote the mock call form.
- Keep both `it` blocks and every assertion exactly as they are. AppNoticeStack has no hooks, so calling it directly is still valid, and identity against the real imports proves the same order.
- Probe 1 at planning showed the node environment fails on `window` (src/preload/tauriAttach.ts:44), so the docblock and the env import are required. Lazy-miss `console.warn` output from tauriTransport is expected and harmless.

Shard (same commit, per the gate contract in meta/backendDiCeilings.cjs, lines 50-55):
- In meta/backendDiCeilings/frontend-components-ui.json, delete the whole `"src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx": 4,` line. A file at 0 must have no entry, because a zero entry fails as stale or zero, and leaving 4 fails as shrank.
- The entry is in the middle of the object, so deleting the whole line, trailing comma included, leaves valid JSON. Change nothing else in that file or in any other shard.

At the end of this task `pnpm backend-di-ceilings` still exits 1, with exactly the three new-violation lines that Task 2 removes. That is expected.

Commit: stage exactly these four paths by name and commit them as one commit, for example `refactor(quick-261119-pdz): drop dead type exports; NoticeStack test runs on the real notices`. Do not push.
  </action>
  <verify>
    <automated>pnpm find-deadcode && node -e "const fs=require('fs');const {countJestMock}=require('./meta/backendDiCeilings.cjs');let t=0;for(const p of process.argv.slice(1)){const n=countJestMock(fs.readFileSync(p,'utf8'),p);console.log(n,p);t+=n}process.exit(t?1:0)" src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx && ! (node meta/backendDiCeilings.cjs 2>&1 | grep -q NoticeStack) && npx jest --runTestsByPath src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx && npx tsc --noEmit && npx eslint --max-warnings 0 src/common/nativePortCatalogue.ts src/frontend/components/UI/RegionPicker/index.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx && npx prettier --check src/common/nativePortCatalogue.ts src/frontend/components/UI/RegionPicker/index.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx meta/backendDiCeilings/frontend-components-ui.json</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm find-deadcode 2>&1 | grep -c '^FAIL'` [HEAD=3 EXPECT==0], and the command exits 0
    - `grep -cE "^export (type|interface) (NativePortMac|NativePortDataStyle)\b" src/common/nativePortCatalogue.ts` [HEAD=2 EXPECT==0]
    - `grep -cE "^type (NativePortMac|NativePortDataStyle) =" src/common/nativePortCatalogue.ts` [HEAD=0 EXPECT==2] (the aliases are kept)
    - `grep -c "^export interface RegionPickerOption" src/frontend/components/UI/RegionPicker/index.tsx` [HEAD=1 EXPECT==0], and `grep -c "^interface RegionPickerOption" src/frontend/components/UI/RegionPicker/index.tsx` [HEAD=0 EXPECT==1]
    - the `countJestMock` helper reports NoticeStack.test.tsx [HEAD=5 EXPECT==0]
    - `grep -c "NoticeStack/__tests__/NoticeStack.test.tsx" meta/backendDiCeilings/frontend-components-ui.json` [HEAD=1 EXPECT==0], and `node -e "JSON.parse(require('fs').readFileSync('meta/backendDiCeilings/frontend-components-ui.json','utf8'))"` exits 0
    - `node meta/backendDiCeilings.cjs 2>&1 | grep -c '^FAIL'` [HEAD=4 EXPECT==3]. The three that remain are the new-violation lines for the files Task 2 owns, and none of them mentions NoticeStack
    - Regression guards. These already hold at HEAD and must still hold afterwards, so they carry no count baseline:
      - `grep -c "@public"` on src/common/nativePortCatalogue.ts and src/frontend/components/UI/RegionPicker/index.tsx gives 0 for each. No justification tag was added
      - `git diff --quiet d02b10267 -- meta/knip-baseline.txt` exits 0. The knip baseline is untouched
      - jest: NoticeStack.test.tsx passes 2/2 (2 tests at HEAD), and NoticeStackTwoToast.test.tsx still passes
      - `npx eslint --max-warnings 0` on the three TS files exits 0 (0 warnings at HEAD). `npx tsc --noEmit` exits 0
      - `npx prettier --check` on the four exact paths exits 0. File-info at planning reports `"ignored": false` for all four, so this check is real
      - `git show --name-only --format= HEAD` lists exactly these four paths
  </acceptance_criteria>
  <done>`pnpm find-deadcode` is green. NoticeStack.test.tsx has 0 module mocks, its shard entry is gone, and its two tests pass unchanged against the real notice components. The DI gate's only remaining failures are the three files Task 2 owns. One atomic commit with four paths exists, and nothing was pushed.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite the backend launchWithoutSteam, NativePortInfo and Settings LaunchWithoutSteam tests without module mocks (backend-di-ceilings green)</name>
  <files>src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts, src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx, src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx</files>
  <read_first>
    - the three test files in full (they are 214, 121 and 179 lines)
    - src/backend/storeManagers/steam/__tests__/adoptionWatch.test.ts lines 10-45 (the `initHeadless` beforeAll pattern and its comment)
    - src/backend/logger/index.ts lines 10-25 and 125-135 (`logInfo` dereferences the writer that `initHeadless` assigns)
    - src/frontend/screens/Game/GamePage/components/NativePortInfo.tsx (whole file; useTranslation('gamelib'), window.api calls)
    - src/frontend/screens/Game/GamePage/components/__tests__/gamelibT.ts lines 1-6 (the relative import path of public/locales/en/gamelib.json from this directory)
    - src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx (whole file)
    - src/frontend/screens/Settings/SettingsContext.tsx and src/frontend/types.ts lines 153-170 (`SettingsContextType`)
    - src/frontend/components/UI/ToggleSwitch/index.tsx and src/frontend/components/UI/InfoBox/index.tsx (the DOM they render: `input#htmlId.hiddenCheckbox`; the `.helpLink--iconOnly` button with aria-label t(text); `.poppedElement` appears only after the button is clicked)
    - src/frontend/components/UI/ThemeSaveFailedNotice/__tests__/ThemeSaveFailedNotice.test.tsx lines 1-60 (jsdom setup, i18next init, the `Object.assign(window, { api })` shape)
  </read_first>
  <action>
General rules for all three files:
- No jest module-mock calls of any kind, and no names destructured from `jest`.
- `jest.fn`, `jest.spyOn` and `jest.requireActual` are fine, because the gate does not count them.
- Do not write comments that quote the mock call form.
- Keep every assertion's literal strings and called-with arguments.
- Do not change production code. Planning found that none of the three needs a seam.

(a) src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts (1 to 0; the mock was added in 61d80ed3b):
- Delete the `backend/logger` module mock and its comment.
- Import `initHeadless` from `backend/logger` and call it in a top-level `beforeAll`. Above it, put a one-line comment like the one at adoptionWatch.test.ts:41: the real logger needs a writer, and the backend jest containment setup redirects HOME.
- Leave everything else as it is, including `bridgeModule` via `jest.requireActual`, the `jest.spyOn(bridgeModule, 'launchBridgeGameBody')` cases and every assertion. The test spawns nothing, so the fake-HOME spawn rule does not apply.

(b) src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx (1 to 0; the react-i18next mock was added in 20e70fdc1):
- With react-i18next real, `useTranslation` is a real hook, so the component can no longer be called as a plain function. Every case must render.
- Set up jsdom:
  - put an `@jest-environment jsdom` docblock first, then `import 'frontend/testUtils/jsdomNoticeEnv'`;
  - import `i18next` and `initReactI18next`;
  - import the en catalogue as a default JSON import, using the same relative path gamelibT.ts uses;
  - call `void i18next.use(initReactI18next).init({...})` with `lng: 'en'`, `ns: ['gamelib']`, `defaultNS: 'gamelib'`, `resources: { en: { gamelib } }`, `initImmediate: false` and `interpolation: { escapeValue: false }`. `escapeValue: false` matches production (src/frontend/index.tsx:259). Without it, interpolation HTML-escapes the `/` in `DATA/`.
- Render with `render`/`cleanup` from `@testing-library/react`, with `afterEach(cleanup)`. In `beforeEach`, install the three `window.api` jest.fn doubles with `Object.assign(window, { api: {...} })`. Never replace `globalThis.window` under jsdom.
- Replace the `flat`/`text`/`els`/`button` element-tree helpers with DOM equivalents:
  - "renders nothing" means the render container has no child, for each of the three cases (gog runner, AppId 730, platform `unknown`);
  - text assertions use the container's `textContent`;
  - a button is the `button` element whose `textContent` equals the label, clicked with `fireEvent.click`.
- Keep all 4 tests, every `toContain` string and every `toHaveBeenCalledWith` URL or path. Keep `makeGameInfo`.
- In "hides the path buttons", the old `list.length > 0` becomes "the `[role="note"]` block is present".
- Leave gamelibT.ts alone, because other suites import it.

(c) src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx (6 to 0; the mocks were added in d8d53ef42):
- Render the real component tree under jsdom. This is the shape Probe 2 confirmed at planning.
- Set up the environment:
  - put the jsdom docblock and the jsdomNoticeEnv import first;
  - initialise real i18next with `lng: 'en'`, `resources: {}`, `initImmediate: false` and `interpolation: { escapeValue: false }`. With empty resources, `t(key, default)` returns the English default (the old stub returned the default) and InfoBox's `t('infobox.help')` returns the key `infobox.help`;
  - wrap the component in the default export of src/frontend/screens/Settings/SettingsContext.tsx as a `.Provider`;
  - render inside `await act(async () => {...})` so that the effect and the verdict promise settle inside act.
- Build the Provider value with a small helper that returns a full `SettingsContextType` (import the type from `frontend/types`):
  - `isDefault` and `appName` come from parameters;
  - `getSetting` returns the per-test stored value for key `launchWithoutSteam` and the fallback for any other key;
  - `setSetting` is a jest.fn the tests can inspect;
  - the remaining fields keep the defaults in SettingsContext.tsx.
- `verdict` stays a module jest.fn, re-primed in `beforeEach` because the Frontend project has `resetMocks: true`. Install it with `Object.assign(window, { api: { steamDirectLaunchVerdict: verdict } })`.
- Keep the `describeLaunchWithoutSteamControl` describe block unchanged (8 tests).
- Map the 7 component tests onto the DOM:
  1. **default context.** With `isDefault: true`, the container is empty and `verdict` is not called.
  2. **verdict request.** `verdict` is called with `'570'`.
  3. **DRM view.** The view is `{ applies: false, reason: 'steam-drm' }` and the stored value is `true`. Expect a `.toggleWithInfo` wrapper, and `#launchWithoutSteam` disabled and not checked. The `.helpLink--iconOnly` button has aria-label `infobox.help`. After `fireEvent.click` on it, `.poppedElement` textContent equals the DRM reason string from the old test. There is no `.saves-warning`.
  4. **steam-api view, stored true.** The checkbox is checked and not disabled, and exactly one `.infoBox.saves-warning` is present.
  5. **clean mac-native view, stored true.** The checkbox is checked and there is no `.saves-warning`.
  6. **toggle.** With the clean view and the stored value `false`, a `fireEvent.click` on the checkbox calls `setSetting` with `('launchWithoutSteam', true)`.
  7. **failed verdict hides the toggle.** Make this tell "rejected" apart from "not yet resolved": render for `'570'` with a resolved clean view and assert the checkbox is present. Then make `verdict` reject and `rerender` (inside act) with a Provider value for appName `'440'`. Assert that `verdict` was called with `'440'` and the container is empty. If the catch did not store the error view, the earlier view would persist and the checkbox would stay.

Commit: stage exactly these three paths by name and commit them as one commit, for example `test(quick-261119-pdz): launchWithoutSteam, NativePortInfo and LaunchWithoutSteam tests run without module mocks`. Do not push.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const {countJestMock}=require('./meta/backendDiCeilings.cjs');let t=0;for(const p of process.argv.slice(1)){const n=countJestMock(fs.readFileSync(p,'utf8'),p);console.log(n,p);t+=n}process.exit(t?1:0)" src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx && pnpm backend-di-ceilings && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx && npx tsc --noEmit && npx eslint --max-warnings 0 src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx && npx prettier --check src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - the `countJestMock` helper reports 0 for each file [HEAD: backend launchWithoutSteam=1, NativePortInfo=1, Settings LaunchWithoutSteam=6, NoticeStack=5; EXPECT==0 for all four]
    - `pnpm backend-di-ceilings 2>&1 | grep -c '^FAIL'` [HEAD=4 EXPECT==0], and the command exits 0
    - `git diff --numstat d02b10267 -- meta/backendDiCeilings/` prints exactly one line: `0`, `1`, `meta/backendDiCeilings/frontend-components-ui.json` (0 lines added, 1 deleted, which is Task 1's deletion). No shard line was added or raised. If another session has changed a shard in the meantime, record that in the SUMMARY and do not revert it
    - `grep -c "beforeAll(() => initHeadless())" src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts` [HEAD=0 EXPECT==1]
    - `grep -c "jest-environment jsdom" src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx` gives 1 for each [HEAD=0 EXPECT==1]
    - `npx eslint --max-warnings 0` on the three files: the warning count [HEAD=4 EXPECT==0]. All four HEAD warnings are on mock lines (no-unsafe-assignment, no-unsafe-argument, no-unsafe-return). `npx tsc --noEmit` exits 0
    - Regression guards. These already hold at HEAD and must still hold after the rewrite, so they carry no count baseline:
      - jest test counts do not drop and every test passes: launchWithoutSteam.test.ts 13 (13 at HEAD), NativePortInfo.test.tsx 4 (4 at HEAD), Settings LaunchWithoutSteam.test.tsx at least 15 (15 at HEAD), NoticeStack.test.tsx 2 (2 at HEAD)
      - every user-visible string asserted at HEAD is still asserted. In NativePortInfo.test.tsx, `grep -c "Sustainable Use License\|MASTER.DAT, CRITTER.DAT, DATA/\|point it at the game's install folder\|https://github.com/alexbatalov/fallout1-ce/releases"` gives 4 at HEAD and must not drop. In the Settings test, `grep -c "Not available: this game uses Steam DRM, which needs the Steam app."` gives 1 at HEAD and must not drop
      - `npx prettier --check` on the three exact paths exits 0. File-info reports `"ignored": false` (typescript) for each, so this check is real
      - this task leaves production code untouched: `git show --name-only --format= HEAD` lists only the three test paths
  </acceptance_criteria>
  <done>All four rewritten suites have 0 module mocks by the gate's own counter, and `pnpm backend-di-ceilings` exits 0 with no baseline added or raised. Every behaviour asserted at HEAD is still asserted, now on rendered DOM or through the real logger. Test counts are not lower. One atomic commit with three paths exists, and nothing was pushed.</done>
</task>

<task type="auto">
  <name>Task 3: Run each of the nine .husky/pre-push checks on its own and confirm all pass</name>
  <files>none (verification only. `pnpm i18n` may rewrite public/locales/en/gamelib.json as a side effect, and that is restored, not committed)</files>
  <read_first>
    - .husky/pre-push lines 1-11 (the nine checks, in order)
  </read_first>
  <action>
1. **Record the catalogue state.** Before running anything, record whether public/locales/en/gamelib.json is already dirty: `git status --porcelain -- public/locales/en/gamelib.json`. Another session may have legitimate edits there.

2. **Run the nine checks.** Run each check on its own and record the exit code of every one. Do not chain them with `&&`: one red check must not hide the rest (the hook's own comment explains this, Phase 78). Use bash, not zsh, so the two-word i18n entry splits. The loop is: `bash -c 's=0; for c in codecheck lint prettier "i18n --fail-on-update" find-deadcode boundaries steam-line-ceiling backend-di-ceilings gameinfo-narrowing-ceiling; do pnpm $c >/dev/null 2>&1; r=$?; echo "$r pnpm $c"; [ $r -eq 0 ] || s=1; done; exit $s'`. For any check that prints a nonzero code, re-run it alone with its output visible and read the failure.

3. **Clean up after `pnpm i18n`.**
   - If gamelib.json was clean in step 1 and is dirty now, test whether the change is only a key reorder. The test compares HEAD and the working copy after sorting keys and exits 0 when the content is equal: `node -e "const fs=require('fs'),cp=require('child_process');const c=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o).sort().reduce((r,k)=>(r[k]=c(o[k]),r),{}):o;const h=JSON.stringify(c(JSON.parse(cp.execFileSync('git',['show','HEAD:public/locales/en/gamelib.json'],{encoding:'utf8'}))));const w=JSON.stringify(c(JSON.parse(fs.readFileSync('public/locales/en/gamelib.json','utf8'))));process.exit(h===w?0:1)"`.
   - If it exits 0, run `git checkout -- public/locales/en/gamelib.json`.
   - If it exits 1, the i18n check changed content, not just order. Treat that as a failure and report it. Do not commit the change.
   - If the file was already dirty in step 1, leave it alone and note that in the SUMMARY.

4. **Handle any failure.**
   - If a failure is in a path this plan wrote (the seven paths in `files_modified`), fix it in that file and make a follow-up commit that stages only that path. Then re-run the whole loop.
   - If a failure is in a path this plan did not write, do not edit it: it may be another session's in-flight work. Record the check, the FAIL lines and the commit that last touched the path (`git log -1 --format=%h -- <path>`) in the SUMMARY, and report it to the orchestrator as blocking the push.

5. **Do not push.** The orchestrator pushes. Do not run `graphify update` here: the hook runs it after a passing push.
  </action>
  <verify>
    <automated>bash -c 's=0; for c in codecheck lint prettier "i18n --fail-on-update" find-deadcode boundaries steam-line-ceiling backend-di-ceilings gameinfo-narrowing-ceiling; do pnpm $c >/dev/null 2>&1; r=$?; echo "$r pnpm $c"; [ $r -eq 0 ] || s=1; done; exit $s' && git diff --quiet -- public/locales/en/gamelib.json</automated>
  </verify>
  <acceptance_criteria>
    - the number of loop lines whose exit code is not `0` [HEAD=2 EXPECT==0]. The two at HEAD are find-deadcode and backend-di-ceilings. The loop exits 0 and prints nine lines
    - `git diff --quiet -- public/locales/en/gamelib.json` exits 0 after any reorder is restored. This assumes the file was clean before the sweep; otherwise the SUMMARY records why it is not
    - `git log --format= --name-only --grep 'quick-261119-pdz' d02b10267..HEAD -- src meta` lists only paths from the seven in `files_modified` (repeats are fine): no other source or meta file was touched by this plan's commits
    - nothing was pushed: `git rev-list --count origin/main..HEAD` is above 0
  </acceptance_criteria>
  <done>Each of the nine pre-push checks exits 0 when run on its own. Any catalogue reorder from `pnpm i18n` has been restored. The SUMMARY records the nine exit codes, and records any failure owned by another session with its commit. The tree is ready for the orchestrator's `git push origin main`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test-only rewrites, three removed type-export keywords and one ratchet-shard line. No runtime input crosses a new boundary. The production components and the backend launch path are unchanged. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pdz-01 | Repudiation | The four rewritten suites ("green" bought by weakening tests) | medium | mitigate | Task 2's acceptance pins test counts at or above HEAD (2/4/15/13) and greps for the HEAD-asserted strings and URLs. The failed-verdict case is strengthened to a rerender that can tell rejection apart from "pending". The DRM case still asserts the reason text, now after opening the real popover. |
| T-pdz-02 | Tampering | meta/backendDiCeilings/*.json and meta/knip-baseline.txt (ratchet erosion) | high | mitigate | No entry is added or raised. Task 2 checks `git diff d02b10267 -- meta/backendDiCeilings/` for added lines (EXPECT 0), and Task 1 checks that knip-baseline.txt is unchanged. The only shard edit is the deletion that the gate contract requires for a file at 0. No `@public` tag is added. |
| T-pdz-03 | Information Disclosure | Real logger initialised in the backend test (`initHeadless`) | low | mitigate | src/backend/jest.setupContainment.ts redirects HOME and the XDG/AppData variables for every Backend suite, so the writer lands in a disposable profile. This is the same pattern adoptionWatch/adoptionStatus already use. The test spawns no child, so the fake-HOME spawn gate is not involved. |
| T-pdz-04 | Tampering | Concurrent session's working tree and commits | medium | mitigate | Each commit stages its exact paths by name, never `git add -A` or `.`. Unrelated dirty files are left alone. gamelib.json is restored only if it was clean before the sweep and the diff is a pure key reorder. Failures in paths this plan does not own are reported, not fixed. |
| T-pdz-SC | Tampering | npm/pip/cargo installs | low | accept | No packages are installed. jsdom, @testing-library/react, i18next and react-i18next are already dependencies, and existing suites use them. |
</threat_model>

<verification>
- `pnpm find-deadcode` exits 0 (Task 1) and `pnpm backend-di-ceilings` exits 0 (Task 2). These are the two pre-push steps that were failing.
- The gate's own `countJestMock` reports 0 for all four rewritten test files. No shard line was added or raised, and the NoticeStack entry is deleted.
- The four suites pass with test counts at or above HEAD. `npx tsc --noEmit` is clean, and scoped `eslint --max-warnings 0` and scoped `prettier --check` pass on every path written.
- All nine .husky/pre-push checks exit 0 when run one at a time (Task 3).
</verification>

<success_criteria>
- `git push origin main` would pass the pre-push hook. The orchestrator pushes; this plan does not.
- The ratchets moved only downward: three knip findings removed, 13 jestMock sites removed (5+1+6+1), and one shard entry deleted.
- Behaviour coverage is preserved: every HEAD assertion still holds, against real modules instead of module stubs.
</success_criteria>

<output>
Create `.planning/quick/261119-pdz-clear-pre-push-find-deadcode-and-backend/261119-pdz-SUMMARY.md` when done
</output>
