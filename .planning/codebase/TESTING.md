# Testing Patterns

**Analysis Date:** 2026-11-06

## Test Framework

**Runner:**
- Jest 29.7 (`"jest": "^29.7.0"` in `package.json`), preset `ts-jest` (`"ts-jest": "^29.3.2"`).
- Root config: `jest.config.js`. It uses `projects` to run six independent Jest projects, each with its own config:

| Project | Config | Roots | Test files |
|---|---|---|---|
| Backend | `src/backend/jest.config.js` | `src/backend` | 384 |
| Frontend | `src/frontend/jest.config.js` | `src/frontend` | 297 |
| Meta | `meta/jest.config.js` | `meta` | 67 |
| Common | `src/common/jest.config.js` | `src/common` | 16 |
| Preload | `src/preload/jest.config.js` | `src/preload` | 11 |
| Relay | `relay/jest.config.js` | `relay` | 9 |

Total: 784 test files, counted with `find` across the roots. Each project's `testMatch` is `**/__tests__/**/*.test.ts` (or `.test.tsx` in Frontend). A file outside a `__tests__/` directory is never run.

- Every project sets `resetMocks: true`. Mock implementations are cleared before each test, so a `mockReturnValue` set in one test cannot leak into the next. Do not rely on mock state carrying over between tests.
- `ts-jest` compiles TypeScript. Type errors in a test file fail that file, so keep test code type-correct.
- `workerIdleMemoryLimit: '1GB'` (root `jest.config.js`) recycles a worker once its idle heap passes 1 GB. The comment there records why: jest-runtime's module registry is never reclaimed, and `--runInBand` grew past 4 GB over 234 Backend suites. Do not add `--runInBand` to any script.
- `modulePaths` is set from `tsconfig.json`'s `baseUrl` (`./src/`) in every project, so `import ... from 'backend/...'` and `'common/...'` resolve in tests.

**Assertion Library:**
- Jest's built-in `expect`. No Chai, no Vitest.

**DOM testing libraries:**
- `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, and `@testing-library/jest-dom` are listed in `package.json`. No test file imports them. Matches in the repo are inside comments that explain why they are not used.
- The Frontend project has no DOM. `src/frontend/jest.config.js` sets no `testEnvironment` (default `node`), and `package.json` has no `jest-environment-jsdom` or `react-test-renderer`. Component tests call function components directly and inspect the returned React element tree.

**Run Commands:**
```bash
pnpm test                                   # Run all six projects (jest)
pnpm test-watch                             # Watch mode, 25% of CPUs
pnpm test:ci                                # CI mode: --maxWorkers=2 --silent
npx jest <path>                             # One file or a pattern, e.g. npx jest src/backend/sidecar
npx jest --selectProjects Backend           # One project by displayName
npx jest --coverage                         # Coverage (text and html, into ./coverage)
pnpm test:x86-callback-wine                 # Meta-only Wine harness, requires GAMELIB_REQUIRE_WINE_HARNESS=1
```

**Coverage:**
- `collectCoverageFrom: ['**/*.{js,jsx,ts,tsx}', '!**/*.config.js']` is set in the root `jest.config.js`.
- No `coverageThreshold` is configured in any project config. No workflow under `.github/workflows/` mentions coverage. Coverage is informational only.

## CI Test Gates

The test surface is covered by several jobs, not only `jest`:

- `.github/workflows/test.yml` runs, in order:
  1. `pnpm i18n` (parser) and `pnpm i18n-churn-guard`, so the locale churn guard checks a real parser run, not a fresh checkout.
  2. `pnpm test:ci`.
  3. `pnpm smoke:sidecar`, which runs `meta/sidecarStartupSmoke.cjs` against the real bundle. It is not a Jest test. The comment in `test.yml` explains why it is needed: jest supplies its own module registry, so evaluation-order and event-loop failures cannot appear under jest.
- `.github/workflows/rust-test.yml` runs `pnpm exec vite build`, `pnpm build:sidecar-sea`, then `cargo test --bin gamelib-shell` in `src-tauri/`. The vite build is required because `tauri::generate_context!()` embeds `build/renderer` at compile time.
- `.github/workflows/codecheck.yml` runs `pnpm codecheck` (`tsc --noEmit`) and `pnpm planning-gates` (`meta/runPlanningGates.py`, which discovers every `*-gate.py`).
- `.github/workflows/lint.yml` runs `pnpm lint`, `pnpm prettier`, `pnpm find-deadcode`, `pnpm boundaries`.
- `.husky/pre-push` runs `codecheck`, `lint`, `prettier`, `i18n --fail-on-update`, `find-deadcode`, and `boundaries`. It does **not** run `jest`. Run `pnpm test` before pushing.

Clippy runs in CI as a shrink-only per-lint ratchet (`meta/clippyRatchet.cjs`, pinned toolchain) on the macOS leg of `.github/workflows/rust-test.yml` only (quick 261107-8yq). Windows- and Linux-gated code is not linted.

## Test File Organization

**Location:**
- Co-located in a `__tests__/` directory next to the code under test. Examples:
  - `src/backend/sidecar/__tests__/dialogStub.test.ts` for `src/backend/sidecar/`.
  - `src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` for the component beside it.
  - `src/frontend/__tests__/svgReactResolution.test.tsx` for a cross-cutting frontend check.
- Cross-cutting gates live in the `__tests__/` of the directory they police. `src/backend/__tests__/fakeHomeIsolation.test.ts` scans all of `src/` and `meta/`. `meta/__tests__/` holds tests for the CI scripts.
- Fixtures: `meta/__tests__/fixtures/upstream-workflows/` is a byte-identical third-party capture. It is excluded from Prettier and must not be reformatted. Relay helpers are in `relay/src/__tests__/helpers/` and are excluded from test matching.

**Naming:**
- `*.test.ts` or `*.test.tsx`. A qualifier after the subject is common: `useSettingsContext.fallback.test.tsx`, `appShellImportGate.test.ts`, `bootstrapWirings.test.ts`.
- Gate-style files use a noun or a `*Gate` / `*Census` / `*Parity` suffix: `flowRegistrationCensus.test.ts`, `connectedStoresParity.test.ts`, `planningGatesWiring.test.ts`.

**Structure:**
```
src/backend/
├── jest.config.js                  # Backend project
├── jest.setupContainment.ts        # setupFiles: home-dir containment (Backend only)
├── jest.globalSetup.js             # one containment root per run
├── __mocks__/                      # root-level manual mocks (config, constants, i18next, store_backend, @xhmikosr/decompress-unzip)
├── platform/__mocks__/index.ts     # manual mock for backend/platform
├── dialog/__mocks__/dialog.ts
├── wiki_game_info/__mocks__/wiki_game_info.ts
├── testUtils/                      # shared test helpers (fakeHomeProfile.ts, stripSourceComments.ts, tauriShellSource.ts, rustQuoteBalance.ts)
├── __tests__/                      # backend-wide gates (fakeHomeIsolation.test.ts, jestGlobalSetup.test.ts)
└── sidecar/__tests__/              # one file per sidecar slice (80 files)
```

## Test Structure

**Suite Organization:**
- `describe` per unit, `it` per behaviour. Across `src/backend`, `it(` appears about 2.4 times as often as `test(` (5,525 vs 2,353 line-start matches). Use `it`.
- Several suites are organised around numbered behaviours (`Behavior 3` in `bootstrap.test.ts`, which `src/backend/sidecar/handlers.ts` cites), and gate suites are organised around numbered decisions (`D-47`, `D-08`). Keep the label that the surrounding file already uses.
- File header docstring states what the suite pins and why. Most suites open with a block comment explaining the defect or constraint they guard. Keep this style for new suites that guard a regression.

**Patterns:**
- Setup in `beforeEach` or a local factory; teardown with `afterEach` for anything that touches disk, a timer, or a spy.
- Spies: `jest.spyOn(console, 'warn').mockImplementation(...)` is used where the code under test logs; restore it.
- Assertions are direct: `expect(x).toBe(...)`, `toEqual`, `toMatchObject`, `toThrow`. Prefer exact values over `toBeTruthy`.

**Frontend component pattern (no DOM):**
Source: `src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx`.
```ts
jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => ({ humble: { keys: mockKeys } })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, params?: Record<string, unknown>): string => ...
  })
}))
```
Call the component as a function, then walk the returned element (`element.props.className`) as in `src/frontend/__tests__/svgReactResolution.test.tsx`.

## Mocking

**Framework:** Jest's built-in `jest.mock`, `jest.requireActual`, `jest.spyOn`, `jest.doMock`. About 2,206 `jest.mock(` calls exist outside `node_modules`, `.claude/`, and `.planning/`.

**Manual mocks (`__mocks__/`):**
- Jest applies a manual mock for a **node module** automatically when a `__mocks__` directory sits in a root. It does **not** do this for a **user module** such as `backend/platform`. Those are opt-in: the suite must call `jest.mock('backend/platform')` by name. `src/backend/platform/__mocks__/index.ts` says so in its header, and it explains the failure that followed when the opt-in was missing.
- `src/backend/platform/__mocks__/index.ts` spreads the real module and overrides only nine test doubles, so anything not doubled behaves as it really does:
  ```ts
  // spread the real module first; only the doubles below override it
  ```
- `src/backend/__mocks__/@xhmikosr/decompress-unzip.ts` is an automatic mock for a node module.
- The Electron manual mock is gone. The `electron` devDependency was retired (see `src/backend/platform/__mocks__/index.ts` header). Do not reintroduce `src/backend/__mocks__/electron.ts`.
- `src/frontend/__mocks__/svgReactStub.tsx` stubs vite's `?react` SVG import. It is routed by `moduleNameMapper` in `src/frontend/jest.config.js`: `'\\.svg\\?react$': '<rootDir>/src/frontend/__mocks__/svgReactStub.tsx'`.

**Module-level mock with a real-module spread** (`src/backend/sidecar/__tests__/dialogStub.test.ts`):
```ts
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-dialogstub-test-home-${process.pid}`)
  }
})
```
Use this shape: keep the real module's exports, override only what the test must control.

**Mocking the sidecar's Rust bridge:** `requestRustInvoke` (from `src/backend/sidecar/sidecarRpc.ts`) is mocked with an in-memory per-channel program in suites that test forwarding logic. This is how `dialogStub.test.ts` scripts resolve and reject outcomes.

**What to Mock:**
- Anything that reaches the real filesystem outside the containment root, the real network, the real keychain (`keyringTokenStore`), the Rust bridge (`requestRustInvoke`), and Electron-era platform APIs that are not in the sidecar.
- Module-scope side effects that would arm timers or watchers (see the exit contract in `.claude/skills/gamelib-conventions/SKILL.md`).
- React hooks that need a provider (`useContext`) for frontend component tests.

**What NOT to Mock:**
- The unit under test. A test that mocks the function it asserts on proves nothing.
- Pure helpers in `src/backend/testUtils/` and `src/common/`.
- The logger, unless a test asserts on log output. Use the real `logInfo`/`logWarning` and spy on the sink when a message must be checked.
- Real child processes when the defect only arms under a populated profile. Use the named real-profile arm described below.

## Containment (Backend project only)

**Why:** a real `homedir()` lets a backend test rename or overwrite the developer's log and token stores. Measured on 2026-07-26: `src/backend/sidecar/__tests__/bootstrap.test.ts` rotated `~/Library/Logs/GameLib/gamelib.log` on each `bootstrap.init()` call. The fix is structural, not per-suite.

**Mechanism:** `src/backend/jest.config.js` registers `setupFiles: ['<rootDir>/src/backend/jest.setupContainment.ts']` for the whole project, and `globalSetup: '<rootDir>/src/backend/jest.globalSetup.js'` mints one containment root per run.
- `setupContainment.ts` redirects eight variables for every test file before its imports run: `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`. It also mocks `os` so that `homedir()` returns the disposable root.
- The containment root is created with `mkdtemp`, mode 0700. `chmodSync` after it restores owner-write, because `umask 0277` would otherwise leave the directory at 0500. Both lines are needed; do not "tidy" either away.
- Do **not** remove `setupFiles` or `globalSetup` from `src/backend/jest.config.js`. The config comment says so.

**Child processes:** a test or harness that spawns a child process must use `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts`. It returns a disposable handle. Call `dispose()` in `afterEach`, and pass every raw capture to `registerCapture()`, because a diagnostic report embeds the environment verbatim. Do not hand-roll an `env` literal that sets home or config variables.

The enforcement test is `src/backend/__tests__/fakeHomeIsolation.test.ts`. It scans `src/` and `meta/`, comment-stripped, for a spawn site that also assigns a home variable. Its anti-vacuity floor is `MIN_FILES_SCANNED = 600`: a broken walk turns it red instead of passing on zero files. The one declared exemption is `meta/sidecarStartupSmoke.cjs`, because that script must inherit the real profile. The gate re-reads that file to confirm the exemption still assigns none of the eight variables.

Two-profile rule, summarised (full text in `.claude/skills/gamelib-conventions/SKILL.md`): child-process runs are isolated by default, and a named, justified real-profile arm exists for defects that only arm under a populated profile. The real-profile arm is declared where it lives. Do not reuse a profile across invocations.

## Source-Text Gates

Many backend and meta suites do not exercise behaviour. They read source files and assert on their text. 356 test files call `readFileSync`. Examples: `src/backend/__tests__/fakeHomeIsolation.test.ts`, `src/backend/sidecar/__tests__/dialogStub.test.ts`, `meta/__tests__/planningGatesWiring.test.ts`.

**Rules for these gates:**
- Match against comment-stripped source. Use `stripSourceComments` from `src/backend/testUtils/stripSourceComments.ts`. Otherwise the gate passes because a docstring names the rule.
- Set an anti-vacuity floor. A gate that scans zero files must fail.
- Pin the exemption, not the absence of a match. The exemption list is itself asserted.
- `src/backend/testUtils/tauriShellSource.ts` and `rustQuoteBalance.ts` are shared helpers for Rust-source gates.

These gates verify that wiring exists. They do not verify that the wired code works. Pair them with a behavioural test where the defect is runtime.

## Fixtures and Factories

**Test data:** built inline in each suite. There is no shared factory library for domain objects.

**Shared helpers:** `src/backend/testUtils/`:
- `fakeHomeProfile.ts` exports `createFakeHomeProfile()`, `FAKE_HOME_ENV_KEYS`, and `FakeHomeEnvKey`.
- `stripSourceComments.ts` for source-text gates.
- `tauriShellSource.ts` and `rustQuoteBalance.ts` for Rust-source checks.

**Location:**
- Shared helpers: `src/backend/testUtils/`.
- Per-suite fixtures: inline or a sibling file in the same `__tests__/` directory.
- Byte-identical third-party captures: `meta/__tests__/fixtures/`. Do not reformat.

## Coverage

**Requirements:** none enforced. No threshold in any Jest project config, and no coverage step in any workflow.

**View Coverage:**
```bash
npx jest --coverage                         # text summary and ./coverage/index.html
npx jest --coverage --selectProjects Backend
```

## Test Types

**Unit Tests:**
- The majority of the 784 files. Pure logic, sidecar handlers with the Rust bridge mocked, store managers with the network mocked.
- Frontend tests are unit tests on the returned element tree and exported helpers. They do not render to a DOM.

**Integration Tests:**
- Sidecar wiring tests that run real modules under containment: `src/backend/sidecar/__tests__/bootstrap.test.ts` drives the real, unmocked `bootstrap.init()` under the containment root. `src/backend/sidecar/__tests__/appRootResolution.test.ts` resolves app paths against the real `paths.ts` with no `pathShim` mock.
- Relay tests run against an in-memory SQLite stand-in using `node:sqlite` as a D1-compatible client (`relay/jest.config.js` header, `relay/src/__tests__/`).
- Rust: integration of the Rust shell's own logic is covered by inline unit tests (below), not by a separate `tests/` crate. No `src-tauri/tests/` directory exists.

**End-to-End / Smoke:**
- `pnpm smoke:sidecar` (`meta/sidecarStartupSmoke.cjs`): launches the built sidecar bundle and checks it starts and exits on stdin EOF. Runs in `test.yml` after `test:ci`. It is the only check for the exit contract's failure class.
- `pnpm test:x86-callback-wine`: runs `meta/__tests__/x86CallbackWineHarness.test.ts`. The suite skips when Wine or the pinned zig is absent. `GAMELIB_REQUIRE_WINE_HARNESS=1` turns that absence into a failure, so a missing prerequisite cannot pass silently.
- No browser E2E framework is installed.

## Meta and Relay Projects

`meta/` contains CI and build scripts, and each has a Jest suite (67 files). Examples:
- `meta/__tests__/planningGatesWiring.test.ts` checks that every `*-gate.py` is wired.
- `meta/__tests__/runnerLiteralSelectors.test.ts` covers the runner-literal ratchet.
- `meta/__tests__/i18nCatalogChurnGuard.test.ts` covers the locale churn guard.
- `meta/__tests__/lintTranslations.test.ts` and `i18nParserConfig.test.ts` cover the i18n tooling.

`relay/` has 9 suites under `relay/src/__tests__/`, using `relay/src/__tests__/helpers/` for shared setup.

## Rust Tests

**Count:** 442 `#[test]` functions across `src-tauri/src/`. 347 are in `src-tauri/src/main.rs`.

**Location:** inline `#[cfg(test)] mod tests` at the bottom of each module, for example `src-tauri/src/main.rs`, `src-tauri/src/clipboard.rs`, `src-tauri/src/store_embed.rs`, `src-tauri/src/sidecar.rs`, `src-tauri/src/notification_backend.rs`.

**Run:**
```bash
cd src-tauri && cargo test --bin gamelib-shell
```

**Naming:** snake_case sentences that name the behaviour, e.g. `the_invoke_timeout_error_names_the_channel`, `keyring_get_result_maps_no_entry_to_null_not_an_error`, `stderr_best_effort_broken_pipe_returns_err_without_panic`. Keep this style.

**Platform gating:** tests that need a macOS-only type use `#[cfg(target_os = "macos")]`. The rust-test workflow header records a previous compile break where a test function called a gated helper without a matching guard. Gate the test function as well as the helper.

**Error assertions:** compare exact strings for classified errors (`assert_eq!(result, Err("keyring:unavailable:x".to_string()))`).

**CI:** `.github/workflows/rust-test.yml` runs the command above on the runner legs it defines. Its header records that the job was red for a period because `tauri_build::build()` needed a built sidecar in `src-tauri/binaries/`, and the fix was a placeholder step. Verify the latest run before assuming it is green.

## Common Patterns

**Async Testing:**
```ts
it('resolves the pending invoke when the response arrives', async () => {
  const pending = requestRustInvoke('dialog_open', {})
  await expect(pending).resolves.toEqual(expectedResult)
})
```
Return or `await` the promise. A test that does not wait for a rejection can pass with the rejection unhandled.

**Error Testing:**
```ts
it('rejects with the classified error from the bridge', async () => {
  await expect(...).rejects.toThrow('keyring:timeout')
})
```
Assert the message, not only that it throws. Classified prefixes (`UNPORTED_CHANNEL_MARKER`, `keyring:`) are part of the contract.

**Process-level behaviour** (exit on stdin EOF, unref'd handles): not reachable under Jest, because Jest supplies its own registry. Use `pnpm smoke:sidecar` for these, and add a live-gate todo if the defect only shows on a real Mac.

**Real-profile arm:** a test that must read the populated profile is declared and justified where it lives, with a comment explaining why isolation would hide the defect. Do not convert it to a fake profile to make it pass.

## Known Gaps (observed, not a policy)

- `@testing-library/*` is in `package.json` and unused. Remove it or adopt it deliberately; it is not usable in the Frontend project as configured.
- No coverage threshold, so coverage can fall silently.
- Clippy runs on the macOS leg only; `cfg(windows)`/`cfg(target_os = "linux")` code is never linted.
- Frontend component behaviour (rendering, user events) is not tested; only the element tree and hooks are.

---

*Testing analysis: 2026-11-06*
