---
phase: quick-261117-omv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/jest.config.js
  - src/frontend/__mocks__/styleStub.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx
  - meta/backendDiCeilings/frontend-screens-game.json
  - src/frontend/screens/Login/loginPaths.ts
  - src/frontend/screens/Login/index.tsx
  - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  - src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx
  - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx
  - .planning/todos/completed/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md
autonomous: true
requirements: [TODO-2026-11-17-backend-di-jestmock-ratchet]

must_haves:
  truths:
    - "`pnpm backend-di-ceilings` exits 0 with no FAIL lines"
    - "No meta/backendDiCeilings/*.json entry was added or raised (only frontend-screens-game.json's three GameStatus entries move, 7 -> 6)"
    - "NoticeStackTwoToast.test.tsx and steamLoginPollLifecycle.test.tsx contain zero jest.mock/doMock/setMock calls"
    - "All five suites pass with the same assertions as before (22 SteamLogin tests, 4 NoticeStack tests, GameStatus trio unchanged), plus one new QR-distinctness guard"
    - "The Frontend jest project has no new failing suite compared to the pre-change baseline"
  artifacts:
    - path: "src/frontend/__mocks__/styleStub.ts"
      provides: "empty module that .css/.scss side-effect imports resolve to under jest"
    - path: "src/frontend/jest.config.js"
      provides: "moduleNameMapper entry for \\.s?css$"
      contains: "styleStub"
    - path: "src/frontend/screens/Login/loginPaths.ts"
      provides: "login route constants with no heavy imports"
      contains: "humbleLoginPath"
  key_links:
    - from: "src/frontend/components/UI/HumbleExpiryToast/index.tsx"
      to: "src/frontend/screens/Login/loginPaths.ts"
      via: "import { humbleLoginPath }"
      pattern: "screens/Login/loginPaths"
    - from: "src/frontend/screens/Login/index.tsx"
      to: "src/frontend/screens/Login/loginPaths.ts"
      via: "re-export so existing importers (Humble/Keys, App) keep working"
      pattern: "from './loginPaths'"
---

<objective>
Turn the `Backend DI ceilings` jestMock ratchet green by cutting `jest.mock` calls in five frontend
tests, never by adding or raising a baseline. Resolves todo
`.planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`.

Current gate output (measured at planning time):
- NoticeStackTwoToast.test.tsx: 7, no baseline -> must reach 0
- steamLoginPollLifecycle.test.tsx: 4, no baseline -> must reach 0
- GameStatus.bottleWaiting / .redistSpinner / .steamUpdate: 8 vs baseline 7

Gate contract (meta/backendDiCeilings.cjs header, D-16): above baseline fails, BELOW baseline also
fails ("lower it in this commit"), a nonzero file with no shard entry fails, a zero entry fails.
Lowering an entry is allowed; adding or raising is forbidden. Only AST call expressions count
(jest.mock/doMock/setMock/unstable_mockModule); comments mentioning jest.mock do not.

All approaches below were proven by scratch experiments during planning (scratch copies of each
suite, run against a scratch jest config adding the scss mapper) — they are not guesses:
- GameStatus trio: dropping the `react-router-dom` mock AND the `../../../GameContext` mock both
  pass (Link is only used as an element type, never rendered; `useContext` is already mocked via
  the `react` mock). The `../SteamUpdateInfo` stub stays (it is asserted by identity and its real
  module loads libraryState, which fails in the node env).
- steamLoginPollLifecycle: with a css mapper, dropping the scss, Dialog and authState mocks passes
  22/22 once `gamepadAction: jest.fn()` is added to the fake `window.api`, the render is wrapped in
  `StoreEmbedSuppressionProvider`, and `useAuthState.setState({ steamLogin: mockSteamLogin })` is
  called in beforeEach.
- NoticeStackTwoToast: with a css mapper, dropping the 4 scss + react-i18next + react-router-dom
  mocks passes 4/4 using a real i18next instance and a `MemoryRouter` wrapper. The
  `frontend/screens/Login` mock cannot simply be dropped: the real Login screen imports
  `frontend/assets/gamelib-icon.png`, which jest cannot parse. Fix is a real seam: move the route
  constants to a light `loginPaths.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md
@meta/backendDiCeilings/frontend-screens-game.json
@src/frontend/jest.config.js

Load `Skill("gamelib-conventions")` before writing any `<verify>`-adjacent check (prettier rule).

<interfaces>
src/frontend/jest.config.js currently has:
  moduleNameMapper: { '\\.svg\\?react$': '<rootDir>/src/frontend/__mocks__/svgReactStub.tsx' }
  rootDir: '../..' (repo root), resetMocks: true, default testEnvironment node (jsdom suites opt in
  with a `@jest-environment jsdom` docblock).

All .css/.scss imports under src/frontend are bare side-effect imports (`import './index.scss'`,
`import '@fontsource/rubik/index.css'`, etc.) — no `import styles from '*.scss'` anywhere, so an
empty stub module is safe.

src/frontend/screens/Login/index.tsx lines 40-48 export:
  epicLoginPath = '/loginweb/legendary', gogLoginPath = '/loginweb/gog',
  amazonLoginPath = '/loginweb/nile', steamLoginPath = '/loginweb/steam',
  humbleLoginPath = '/loginweb/humble' (preceded by a D-05 comment block naming HumbleExpiryToast)
Importers: src/frontend/components/UI/HumbleExpiryToast/index.tsx (line 11, humbleLoginPath),
src/frontend/screens/Humble/Keys/index.tsx (humbleLoginPath, steamLoginPath, gogLoginPath,
epicLoginPath), src/frontend/screens/Login/index.tsx itself.

frontend/state/authState default export = bindStoreHooks(useAuthStateRaw); it supports
`useAuthState.setState(...)` (NoticeStackTwoToast already uses it). State has
`steamLogin: (result) => Promise<string>`. `resetAllStores` from 'frontend/state/storeKit'.

SteamLogin renders the QR as:
  <QRCode value={challengeUrl} size={200} fgColor="#000000" bgColor="#ffffff"
          aria-label="Steam QR code for mobile login" role="img" />
Dialog (frontend/components/UI/Dialog) calls `window.api.gamepadAction({ action: 'tab' })` on
mount and uses useSettingsState + useSuppressStoreEmbed.

Real-i18next precedent: src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: css/scss moduleNameMapper stub + GameStatus trio 8 -> 6 (baseline lowered 7 -> 6)</name>
  <files>src/frontend/__mocks__/styleStub.ts, src/frontend/jest.config.js, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx, meta/backendDiCeilings/frontend-screens-game.json</files>
  <action>
FIRST, before any edit, record the pre-change Frontend baseline: run `npx jest --selectProjects Frontend 2>&1 | grep -E '^FAIL' | sort > .planning/quick/261117-omv-backend-di-jestmock-ratchet-cut-mocks-in/frontend-fail-before.txt`. At planning time `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` was already failing — pre-existing failures are not this task's concern, only new ones are.

(a) Create `src/frontend/__mocks__/styleStub.ts` containing a short comment (why: jest cannot parse .css/.scss, every style import in src/frontend is side-effect only, so an empty module is a faithful stand-in) and `export {}`. In `src/frontend/jest.config.js` add a second `moduleNameMapper` entry `'\\.s?css$': '<rootDir>/src/frontend/__mocks__/styleStub.ts'` next to the svg entry, with a comment explaining it replaces per-test `jest.mock('x.scss', () => ({}))` calls (quick 261117-omv; the backend-di jestMock ratchet counts those). Do NOT touch the existing per-test scss mocks in other files — they still work through the mapper and their baselines are exact; removing them is out of scope.

(b) In each of the three GameStatus suites delete exactly two calls: `jest.mock('react-router-dom', () => ({ Link: 'a' }))` and `jest.mock('../../../GameContext', () => ({ __esModule: true, default: {} }))`. Keep every other mock, including the `../SteamUpdateInfo` stub (steamUpdate asserts `findByType(tree, mockSteamUpdateInfo)` by identity; the real module loads libraryState and the suite fails to load in the node env — measured by Plan 78-05). Do not change any assertion. Each file goes 8 -> 6.

(c) In `meta/backendDiCeilings/frontend-screens-game.json` LOWER the three GameStatus entries from 7 to 6 (the gate fails on shrink unless lowered in the same commit). Change nothing else in any shard.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx && pnpm -s backend-di-ceilings --shard frontend-screens-game && npx jest --selectProjects Frontend 2>&1 | grep -E '^FAIL' | sort | comm -13 .planning/quick/261117-omv-backend-di-jestmock-ratchet-cut-mocks-in/frontend-fail-before.txt - | (! grep .) && npx prettier --check src/frontend/__mocks__/styleStub.ts src/frontend/jest.config.js src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx meta/backendDiCeilings/frontend-screens-game.json</automated>
  </verify>
  <done>Three GameStatus suites pass unchanged in assertions with 6 jest.mock calls each; their shard entries read 6; the full Frontend project has no FAIL line absent from the pre-change list; prettier --check clean on all six paths (all six report ignored:false under --file-info).</done>
</task>

<task type="auto">
  <name>Task 2: NoticeStackTwoToast 7 -> 0 via a light loginPaths seam, real router and real i18next</name>
  <files>src/frontend/screens/Login/loginPaths.ts, src/frontend/screens/Login/index.tsx, src/frontend/components/UI/HumbleExpiryToast/index.tsx, src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx</files>
  <action>
(a) Create `src/frontend/screens/Login/loginPaths.ts` holding the five route constants (epicLoginPath, gogLoginPath, amazonLoginPath, steamLoginPath, humbleLoginPath) with their exact values, moving the D-05 comment with humbleLoginPath, plus a header line saying it exists so light consumers (HumbleExpiryToast) need not load the whole Login screen (which imports a .png jest cannot parse). It must import nothing. In `src/frontend/screens/Login/index.tsx` replace the five `export const` lines with `export { epicLoginPath, gogLoginPath, amazonLoginPath, steamLoginPath, humbleLoginPath } from './loginPaths'` and, if index.tsx uses any of them internally, also add a named import of those from './loginPaths' (tsc/eslint will tell you). Leave Humble/Keys and App.tsx importing from 'frontend/screens/Login' unchanged. In `src/frontend/components/UI/HumbleExpiryToast/index.tsx` change the import to `from 'frontend/screens/Login/loginPaths'`. Before editing, grep `src/frontend/screens/Login/__tests__` for source gates that read `index.tsx` text for `LoginPath =` (planning found none matching the constants, but confirm).

(b) In NoticeStackTwoToast.test.tsx delete all seven jest.mock calls (four scss, react-i18next, react-router-dom, frontend/screens/Login). Replace them with: a real i18next setup at module top after the jsdomNoticeEnv import — `i18next.use(initReactI18next).init({ lng: 'en', resources: {}, initImmediate: false })` (proven in planning; t(key, defaultValue, opts) then returns the interpolated default, same as the old stub); and wrap the render in `mountBoth` as `MemoryRouter` (from 'react-router-dom') around the existing `StoreEmbedSuppressionProvider` so the real `useNavigate` has a router. Rewrite the "Imported after the mocks above" comment to say no module is mocked (styles resolve through the jest css mapper; i18n and routing are real). Every `describe`/`it`/`expect` stays byte-identical.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx src/frontend/screens/Humble/Keys/__tests__/index.test.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts src/frontend/screens/Login/__tests__/index.test.tsx && npx tsc --noEmit -p . && npx eslint src/frontend/screens/Login/loginPaths.ts src/frontend/screens/Login/index.tsx src/frontend/components/UI/HumbleExpiryToast/index.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx && pnpm -s backend-di-ceilings 2>&1 | (! grep NoticeStackTwoToast) && npx prettier --check src/frontend/screens/Login/loginPaths.ts src/frontend/screens/Login/index.tsx src/frontend/components/UI/HumbleExpiryToast/index.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx</automated>
  </verify>
  <done>NoticeStackTwoToast has 0 jest.mock calls and its 4 tests pass with unchanged assertions; the Login-adjacent suites still pass; tsc and eslint clean; the gate no longer names NoticeStackTwoToast; prettier clean on the four paths.</done>
</task>

<task type="auto">
  <name>Task 3: steamLoginPollLifecycle 4 -> 0 with real Dialog, real store and real QR; gate green; close the todo</name>
  <files>src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx, .planning/todos/completed/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md</files>
  <action>
(a) Delete all four jest.mock calls (`../index.scss`, `frontend/components/UI/Dialog`, `react-qr-code`, `frontend/state/authState`). Keep `mockSteamLogin = jest.fn()` (rename optional). Add imports: `useAuthState` from 'frontend/state/authState', `resetAllStores` from 'frontend/state/storeKit', `StoreEmbedSuppressionProvider` from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext', `QRCode` from 'react-qr-code'. Add `gamepadAction: jest.fn()` to the `api` fake (the real Dialog calls it on mount). In beforeEach, after `mockSteamLogin.mockResolvedValue('done')`, call `useAuthState.setState({ steamLogin: mockSteamLogin })` (resetMocks:true wipes implementations per test, so it must be per-test). In afterEach add `resetAllStores()` after cleanup. Add a local `renderLogin()` helper returning `render(<StoreEmbedSuppressionProvider><SteamLogin dismiss={() => undefined} /></StoreEmbedSuppressionProvider>)` and use it at every existing `render(<SteamLogin .../>)` site (lines ~104, 163, 276, 358 at planning time).

(b) Real QR without weakening the "which code is drawn" assertions: replace both local `drawn` helpers (lines ~273 and ~353) with one top-level `drawn(): string | null` that finds `screen.queryByRole('img', { name: 'Steam QR code for mobile login' })`, returns null if absent, otherwise compares its `innerHTML` against reference markup for each candidate challenge value and returns the matching value (throw an Error naming the markup if none match — never return a silent default). Reference markup per value: render `<QRCode value={v} size={200} fgColor="#000000" bgColor="#ffffff" />` (the exact production props) into its own RTL container, read the svg's innerHTML, unmount; memoise in a Map. The candidate list is every `challengeUrl: 'qr-…'` literal in the file (grep it — at least qr-A, qr-A2, qr-B, qr-C). Add one new `it` asserting all candidates produce pairwise-distinct markup, so the comparison can never be vacuous. All existing `expect(drawn()).toBe('qr-X')` lines stay unchanged.

(c) Rewrite the header paragraph that explains the Dialog/react-qr-code stand-ins: nothing is mocked now; the real Dialog renders (fake window.api supplies gamepadAction), the real auth store is seeded with a jest.fn steamLogin, and the drawn code is identified by matching the real QR svg against reference renders of each candidate. Keep the C2 bullets.

(d) Run the full gate `pnpm backend-di-ceilings`; it must print no FAIL. Then `git mv .planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md .planning/todos/completed/` and append a short `## Resolution` section naming quick 261117-omv, the css mapper, the loginPaths seam, and the GameStatus 7 -> 6 lowering. Do not run `gsd-sdk query commit` (it sweeps all dirty .planning files); stage files explicitly with `git add <paths>`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx && npx eslint src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx && pnpm backend-di-ceilings && git diff HEAD --stat -- meta/backendDiCeilings && test -f .planning/todos/completed/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md && test ! -f .planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md && npx prettier --check src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx</automated>
  </verify>
  <done>steamLoginPollLifecycle has 0 jest.mock calls; all 22 original tests plus the distinctness guard pass; `pnpm backend-di-ceilings` exits 0; `git diff HEAD -- meta/backendDiCeilings` shows only the three 7 -> 6 lowerings; todo lives in completed/. The moved todo is under .planning/, which `npx prettier --file-info` reports as ignored:true, so it is deliberately left out of the prettier check.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test-harness and module-layout change only; no input, IPC, or network surface is touched |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-omv-01 | Tampering | meta/backendDiCeilings/*.json | mitigate | Only lower entries; Task 3 verify prints `git diff --stat` of the shard dir for review, must_haves forbid add/raise |
| T-omv-02 | Repudiation | test assertions | mitigate | Assertions kept byte-identical; QR identity checked against real renders plus a distinctness guard so a weakened comparison cannot pass vacuously |
</threat_model>

<verification>
- `pnpm backend-di-ceilings` exits 0.
- Five target suites pass; no new FAIL in the full Frontend jest project versus the pre-change list.
- `git diff HEAD -- meta/backendDiCeilings` contains only the three GameStatus 7 -> 6 changes.
</verification>

<success_criteria>
CI Lint's `Backend DI ceilings` step would be green, with no baseline added or raised, no assertion
weakened, and the todo moved to `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/261117-omv-backend-di-jestmock-ratchet-cut-mocks-in/261117-omv-SUMMARY.md` when done
</output>
