# Coding Conventions

**Analysis Date:** 2026-11-06

GameLib is a React + TypeScript renderer (`src/frontend/`), a Node sidecar (`src/backend/`, entry `src/sidecar/index.ts`), a Rust/Tauri v2 shell (`src-tauri/src/`), shared types (`src/common/`), a preload bridge (`src/preload/`), and headless CI tooling (`meta/`). Several files still carry Electron-era names (`electronStores.ts`, `electron_store.ts`, `electronStub.ts`), but `electron` is no longer a dependency. Read the names as historical, not as a signal that Electron is present.

## Naming Patterns

**Files (backend and common):**
- The dominant style is camelCase: 371 of 404 non-test `.ts` files under `src/backend/` (e.g. `src/backend/storeChangeNotifier.ts`).
- A minority use snake_case (33 files), concentrated in older modules: `src/backend/logger/log_writer.ts`, `src/backend/logger/ipc_handler.ts`, `src/backend/electron_store.ts`, `src/backend/store_backend.ts`. Do not rename these. Match the style of the directory you are editing.
- No PascalCase `.ts` files exist under `src/backend/`.
- Frontend components are PascalCase directories holding an `index.tsx`, e.g. `src/frontend/screens/Library/components/FilterChipRow/index.tsx`. Of 313 non-test `.tsx` files under `src/frontend/`, 163 are `index.tsx`. Component-local helpers sit beside the component, e.g. `FilterChipRow/chipLabels.ts`, and styles sit beside it as `index.scss`.
- Sidecar RPC registration modules follow `*FlowRegistration.ts` in `src/backend/sidecar/` (21 files, e.g. `src/backend/sidecar/dialogFlowRegistration.ts`, `src/backend/sidecar/steamFlowRegistration.ts`). Each exports one `registerXFlows()` function called once from `src/backend/sidecar/handlers.ts`. Keep the suffix. `src/backend/sidecar/handlers.ts` documents why each slice has its own file: one module per slice keeps parallel plans from contending for one import block.
- Per-store persistence declarations are named `electronStores.ts` and each is a thin module exporting a `TypeCheckedStoreBackend` instance, e.g. `src/backend/logger/electronStores.ts` (`uploadedLogFileStore`), `src/backend/storeManagers/steam/electronStores.ts`, `src/backend/storeManagers/gog/electronStores.ts`. Fourteen such files exist across `src/` (e.g. `src/backend/downloadmanager/electronStores.ts`, `src/frontend/helpers/electronStores.ts`). The constructor is `new TypeCheckedStoreBackend(name, { cwd, name, accessPropertiesByDotNotation })` (`src/backend/electron_store.ts`). Put a new store declaration in its own `electronStores.ts` and do not inline it into the module that uses it.
- Tests live in `__tests__/` directories beside the code under test, named `*.test.ts` or `*.test.tsx`. Some carry a qualifier: `useSettingsContext.fallback.test.tsx`.
- Manual mocks live in `__mocks__/` directories (see TESTING.md).
- Rust: `snake_case.rs` modules under `src-tauri/src/`, e.g. `store_embed_handoff_policy.rs`, `macos_native_gamepad.rs`.

**Functions and variables:**
- camelCase for functions and variables. Use `const` arrow functions for module-private helpers in backend code (`src/backend/logger/index.ts`: `const logInfo = (...params) => ...`) and `function` declarations for exported functions and React components.
- React components are default exports of named functions: `export default function FilterChipRow() { ... }` (`src/frontend/screens/Library/components/FilterChipRow/index.tsx`). 292 frontend `.tsx` files use `export default`; 37 use only named exports, typically for non-component modules.
- Unused parameters and bindings must start with `_`. ESLint enforces this (see Code Style).
- Constants that name a closed vocabulary use `UPPER_SNAKE_CASE` in code (`UNPORTED_CHANNEL_MARKER`, `FAKE_HOME_ENV_KEYS`) but the logger uses a PascalCase object `LogPrefix` (`src/backend/logger/constants.ts`). Both forms exist. Follow the module you are editing.
- Hooks are `useX` (`useTauriOAuthLogin`, `useDebouncedStoreSearch`, `useSettingsContext`).

**Types:**
- PascalCase for types and interfaces: `FakeHomeProfile`, `ActiveFilterDescriptor`, `SidecarRpcResponse`.
- Type-only imports use `import type`. 661 such lines exist in non-test `src/` code. Use `import type` for any import that is used only in a type position; `tsconfig.json` sets `isolatedModules: true`.
- Shared IPC contracts live in `src/common/types/ipc` and are imported with the `common/` alias.

**Rust:**
- `snake_case` functions and fields, `CamelCase` types, `SCREAMING_SNAKE_CASE` constants.
- Error values are `Result<T, String>` with a classified prefix such as `keyring:unavailable:...` or `keyring:timeout`. Twelve `Result<..., String>` signatures appear in `src-tauri/src/main.rs` alone, and tests assert the exact string (`src-tauri/src/main.rs`, `keyring_get_result_maps_other_errors_to_a_classified_unavailable_string`).

## Code Style

**Formatting (Prettier):**
- Root config: `.prettierrc.json`. No semicolons, single quotes, `trailingComma: "none"`, `tabWidth: 2`. It has **no `printWidth` key**, so the effective width is Prettier's default of 80. `.editorconfig` also sets `max_line_length = 80` for `*.ts`, `*.tsx`, `*.js`. Verified with `prettier.resolveConfig('src/backend/logger/index.ts')`, which returns no `printWidth`.
- `src/preload/.prettierrc` overrides the width: same settings plus `"printWidth": 120`. It applies only to files under `src/preload/`. Verified with `prettier.resolveConfig('src/preload/ipc.ts')`.
- Always run Prettier scoped to the paths you touched: `npx prettier --check <paths>`. Never use `.` when only a subtree changed, because `src/preload/` has a different width. Use `--file-info` to see which config a path resolves to.
- `.prettierignore` excludes `.planning`, `.claude`, `src-tauri/target`, `src-tauri/gen`, `pnpm-lock.yaml`, and the byte-identical fixture `meta/__tests__/fixtures/upstream-workflows`. Do not reformat the fixture.
- CI runs `pnpm prettier` (`prettier --check .`) in `.github/workflows/lint.yml`. The pre-commit hook (`.husky/pre-commit`) checks the staged content of each file touched by the commit.

**Linting (ESLint, flat config):**
- Config: `eslint.config.mjs`. Presets: `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked`, `eslint-plugin-import-x` (recommended and typescript), `eslint-plugin-react` (flat recommended and jsx-runtime), `eslint-plugin-react-hooks` (recommended-latest), and `eslint-config-prettier` last, which disables style rules that conflict with Prettier.
- Type-aware rules use `tsconfig.eslint.json` as the project. Files ending in `.js`, `.cjs`, `.mjs` are ignored, so the `meta/*.cjs` scripts are not linted by ESLint.
- Ignored directories: `build/`, `.planning/`, `.claude/`.
- **Errors** that matter most:
  - `no-restricted-imports` bans `ipcMain` and `ipcRenderer` from `electron`. Use the helpers in `backend/ipc` or the preload layer instead.
  - `@typescript-eslint/no-misused-promises` (with `checksVoidReturn: false`).
  - `@typescript-eslint/unbound-method`.
  - `@typescript-eslint/no-unused-vars` with `^_` allowed for args, vars, and caught errors.
- **Warnings** on production code (marked `FIXME` in the config as intended to become errors): `no-floating-promises`, `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`, `require-await`, `restrict-template-expressions`, `no-base-to-string`, `no-for-in-array`.
- **Test code** (`**/__tests__/**`, `**/__mocks__/**`) turns off `no-explicit-any` and the five `no-unsafe-*` rules. `unbound-method` is a warning there.
- `pnpm lint` runs `meta/lintScoped.cjs`, not a bare `eslint .`. It lints production and test scopes separately, against two ceilings: `SRC_CEILING = 1130` and `TESTS_CEILING = 661` warnings (zero errors required). The ceilings are exact, not padded: the file's header states "N-1 must be RED and N must be GREEN". A new warning in one scope cannot be absorbed by headroom in the other. Do not raise a ceiling to hide a regression. Lower it when warnings are removed.
- `pnpm lint:src` and `pnpm lint:tests` run either scope alone.
- Dependency rules are a separate gate: `pnpm boundaries` runs `depcruise` against `.dependency-cruiser.cjs` (five `forbidden` rules, all `severity: 'error'`), then `meta/boundaryRatchet.cjs`. See Module Design below.

**Suppression comments in production code:**
- 95 `eslint-disable` directives exist across `src/`, `meta/`, and `relay/` outside test directories. The most common are `@typescript-eslint/no-require-imports` (26), `react-hooks/exhaustive-deps` (21), and `@typescript-eslint/no-unused-vars` (11). Every directive names a rule. Only 9 of the 95 carry an inline reason, so new directives should include one: `// eslint-disable-next-line <rule> -- <reason>`.
- Prefer `eslint-disable-next-line` over block `eslint-disable`.
- Type suppressions outside tests: 12 `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck` (e.g. `src/backend/game_config.ts:28` `// @ts-expect-error TODO: ...`, `src/frontend/helpers/electronStores.ts:27` citing an upstream `electron-store` type bug). Use `@ts-expect-error` with a reason; it fails when the error goes away. Do not add `@ts-ignore`. Two `@ts-ignore` sites in `src/frontend/components/UI/Help/index.tsx` (L24, L39) are the pattern to avoid.
- `any` outside tests: about 26 uses (e.g. `src/backend/utils.ts:1743` for a generic `throttle`, `src/backend/storeManagers/steam/user.ts:1330` for `err as any` in catch blocks). Prefer `unknown` and narrow.

**TypeScript strictness** (`tsconfig.json`):
- `strict: true`, `strictNullChecks`, `noImplicitAny`, `noImplicitThis`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `isolatedModules`, `skipLibCheck`, `resolveJsonModule`.
- `noUncheckedIndexedAccess` is **not** enabled. Indexed access returns `T`, so guard array and record reads explicitly when the value can be absent.
- `pnpm codecheck` runs `tsc --noEmit` on `tsconfig.json` and `tsc -p tsconfig.meta.json --noEmit` on the `meta/` scripts.

## Import Organization

Observed order in `src/frontend/screens/Library/components/FilterChipRow/index.tsx`, which is the pattern to copy:

1. React and third-party packages (`react`, `react-i18next`, `@fortawesome/...`).
2. Relative module imports (`../../LibraryContext`).
3. `import type` from aliased paths (`frontend/types`).
4. Sibling modules (`./chipLabels`).
5. Side-effect style imports last (`./index.scss`).

This order is **not enforced**. `eslint-plugin-import-x` is included, but no `import-x/order` rule is configured. Keep the order consistent within a file.

**Path aliases** (`tsconfig.json` sets `"baseUrl": "./src/"`, and `jest.config`/`tsconfig.meta.json` mirror it):
- `backend/...`, `frontend/...`, `common/...`, `preload/...` resolve from `src/`. Example: `import { ipcMain, type IpcMainEvent } from 'backend/platform'` (`src/backend/ipc.ts`).
- Both alias and relative imports are common: 2,617 alias-form and 2,968 relative-form imports in non-test `src/` code. Within one directory, use the form already used there. Sidecar modules under `src/backend/sidecar/` use relative paths for siblings and `'../platform'` for the platform shim.

**Forbidden import edges** (enforced by `.dependency-cruiser.cjs`, see Module Design):
- Store managers under `src/backend/storeManagers/{steam,gog,legendary,nile,sideload}/` must not import each other.
- `src/backend/launcher.ts` reaches store managers only through `src/backend/storeManagers/index.ts`.
- Modules under `src/backend/sidecar/` must not import the real `electron` module. Use `backend/platform`, the sidecar-safe replacement for `electron` (`src/backend/platform/index.ts`).

## Error Handling

**Sidecar RPC boundary** (`src/backend/sidecar/sidecarRpc.ts`):
- The Rust shell sends one JSON request per line on stdin. The sidecar runs the registered handler and writes `{ id, ok: true, result }` or `{ id, ok: false, error }`. The failure path is the `catch` at `src/backend/sidecar/sidecarRpc.ts` ~L205:
  ```ts
  } catch (error) {
    const response: SidecarRpcResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
    writeLine(response)
  }
  ```
- A channel with no registered handler returns `ok: false` with an error that begins with `UNPORTED_CHANNEL_MARKER` (`src/backend/sidecar/sidecarRpc.ts` ~L190-200). Do not silently return `undefined` for an unregistered channel. The marker lets the renderer treat a documented seam gap as non-fatal, and it separates "not ported yet" from a real failure.
- `send`-style channels (fire-and-forget) have no response frame. Their listener failures are logged as `[sidecarRpc] listener for '<channel>' threw: ...` and never rethrown.

**Handler pattern** (typical `*FlowRegistration.ts` body, `src/backend/sidecar/steamFlowRegistration.ts`):
- Wrap the one awaited call that can fail, log with `logWarning` including the runner and the error, and rethrow so the frontend receives the failure:
  ```ts
  try {
    await libraryManagerMap[runner].refresh()
  } catch (err) {
    logWarning([`refreshLibrary failed runner=${runner}:`, err], RunnerToLogPrefixMap[runner])
    throw err
  }
  ```
- For secondary, best-effort steps that must not fail the primary action, catch, log at warning, and continue. Example: the Humble ownership recompute after a Steam refresh in the same file.
- Rejections from `logInfo`/`logError`-style wrappers are not awaited. Use the settled variants when the call site needs to attach a `.catch`: `logErrorSettled` and `logInfoSettled` from `src/backend/logger/index.ts` return the promise, while `logError` and `logInfo` return `void`.

**Backend (non-sidecar) code:**
- Throw `Error` with a message that names the failing operation and the input. Example from the Rust side, which does the same: `"keyring:timeout"`.
- Prefer returning typed fallbacks for expected misses (e.g. `keyring_get_result` maps `keyring::Error::NoEntry` to `null`, not an error).
- Do not swallow errors with an empty `catch`. Every `catch` either logs, rethrows, or converts to a documented fallback. Confirmed in `src/backend/sidecar/steamFlowRegistration.ts`; grep `catch (` in that file for the forms in use.

**Frontend:**
- When the sidecar's Rust invoke returns `ok: false`, the pending promise rejects with `new Error(response.error)` (`src/backend/sidecar/sidecarRpc.ts` ~L266-268). Keep the error string meaningful: it is the only text the caller gets.

**Rust shell** (`src-tauri/src/main.rs`):
- Use `shell_eprintln!` for all shell diagnostics. It is a `macro_rules!` defined at `src-tauri/src/main.rs:72` that wraps `stderr_best_effort`, which ignores write errors (EPIPE) and never panics. There are 225 `shell_eprintln!` call sites and zero plain `eprintln!` calls outside the macro. Do not add `eprintln!` or `println!` to the shell.
- Use `[shell]`-prefixed messages for shell diagnostics, e.g. `shell_eprintln!("[shell] spawning sidecar (packaged): \"{program}\"")` in `src-tauri/src/sidecar.rs`.
- Tauri command functions in `src-tauri/src/main.rs` return `Result<T, String>` (12 signatures). Map foreign errors into a classified string prefix so the frontend can branch on it.

## Logging

**Framework:** an in-house logger in `src/backend/logger/` (`index.ts`, `log_writer.ts`, `paths.ts`). It is not a third-party library.

**API** (exported from `src/backend/logger/index.ts`):
- `logDebug`, `logInfo`, `logWarning`, `logError`, plus the settled variants `logInfoSettled` and `logErrorSettled`.
- Each takes the message parts and a `LogPrefix` (or a `FullLogOptions` object with a `prefix` field, see `src/backend/logger/types.ts`).
- `LogPrefix` is a closed set in `src/backend/logger/constants.ts`, e.g. `LogPrefix.Backend`, `LogPrefix.Legendary`, `LogPrefix.Gog`. Runner-specific prefixes come from `RunnerToLogPrefixMap`. Use an existing prefix. Add a new one to the constant, not as a free-form string.

**Usage:**
```ts
logInfo(`refreshLibrary complete runner=${runner} managers=1`, RunnerToLogPrefixMap[runner])
```
- Put a `key=value` pair (`runner=steam`) in the message so log lines are greppable.
- Log at `logWarning` for recoverable failures and `logError` for failures that will surface to the user.
- 1,753 `logInfo`/`logError`/`logWarning`/`logDebug` calls exist in non-test `src/backend/`. This is the norm.

**Console:** 75 direct `console.log`, `console.warn`, `console.error`, or `console.info` calls remain in non-test `src/backend/`. Treat them as debt. Use the logger for any new code. The one place that legitimately writes raw stderr is the Rust shell (`shell_eprintln!`).

**Redaction:** `src/backend/logger/sanitizeRendererLogMessage.ts` sanitises renderer-originated messages. Logs must never contain tokens, session IDs, or account identifiers. `meta/logSecretGate.ts` exists for this, but it is not referenced from `.github/workflows/`, `package.json`, or `.husky/` as of 2026-11-06, so it is not enforced in CI.

## Comments

**Heavy file-level docstrings are the convention.** Most non-trivial files open with a block comment that states purpose, why the file exists, and the decision or phase that required it. Examples: `src/backend/sidecar/dialogFlowRegistration.ts`, `src/backend/sidecar/handlers.ts`, `src/backend/testUtils/fakeHomeProfile.ts`, `meta/lintScoped.cjs`. Write the same kind of header for a new module that encodes a non-obvious constraint.

**Traceability tokens appear in comments and are expected:**
- Decision IDs: `D-08`, `D-47`, `D-53-13` (over 5,900 `D-` references across `src/`). They point at a planning decision record under `.planning/`.
- Phase and plan references: `Phase 34.2 Plan 04`, `plan 34.5-06`, quick tasks such as `260913-arr`.
- Requirement IDs: `REQ-34.3-09`.
- Threat IDs: `T-34.5-C4-11`.
- Keep these tokens. They are how a reader traces why a guard exists. When you add a guard, cite the decision or the todo that motivated it, using the form already in the file.

**Explain why, not what.** Inline comments state the constraint the code respects, e.g. "`.unref()` only removes its claim on the loop, never its scheduling" (`src/backend/sidecar/appShellFlowRegistration.ts` ~L531-543).

**JSDoc/TSDoc:** used on exported functions in `src/backend/` where the contract is not obvious from the signature. Not required on every export.

**Gotcha comments** are common and should stay: a short "do not do X" with the failure it prevents, e.g. the warning in `.husky/pre-commit` about `$(...)` dropping NUL bytes, or `src/backend/logger/index.ts` explaining why `logError` and `logErrorSettled` differ.

## Function Design

**Size:** no tooling enforces function length. The repo's direction is to split large modules into leaf modules with explicit boundaries: `src/backend/storeManagers/steam/games.ts` was split in Phase 62 into `game*.ts` leaves (`gameConstants.ts`, `gameProtocolUrl.ts`, `gameDrmLaunch.ts`, `gameSessionState.ts`, `gameRequirements.ts`). Follow that direction when a file grows.

**Parameters:**
- Prefer one options object over many positional booleans for anything with more than two parameters. Example: `createFakeHomeProfile(...)` in `src/backend/testUtils/fakeHomeProfile.ts`.
- Use `_`-prefixed names for parameters required by an interface but unused, e.g. `(_event: unknown, ...args: unknown[])` in `src/backend/sidecar/dialogFlowRegistration.ts`.

**Return values:**
- Async functions return `Promise<T>`. Use `async` only when the body awaits. The `@typescript-eslint/require-await` warning flags the rest.
- Return `undefined` for "nothing to report" and a typed `null` for a documented absence. Do not mix the two for the same function.

## Module Design

**Exports:**
- Named exports for everything except React components (default export) and `*FlowRegistration.ts` modules (one `registerXFlows` export).
- Export only what other modules use. The repo runs `pnpm find-deadcode` (`meta/findDeadcode.cjs`) in CI and pre-push. An export with no consumer fails it. A comment in `src/backend/testUtils/fakeHomeProfile.ts` (~L131) records an export dropped after `find-deadcode` flagged it as having no consumer, which is the pattern to follow.

**Barrel files:** `src/backend/storeManagers/index.ts` is the one sanctioned entry point for store managers. Other directories use barrels selectively. Do not add a barrel that re-exports a whole subtree and creates new cycles.

**Dependency boundaries** (`.dependency-cruiser.cjs`, run by `pnpm boundaries`, which then runs `meta/boundaryRatchet.cjs`):
- `no-cross-store-manager`: store managers must not import each other (tests exempt).
- `launcher-only-via-store-managers-index`: `src/backend/launcher.ts` imports store managers only through `src/backend/storeManagers/index.ts`.
- `no-depot-parent-back-edge` and `no-circular-depot`: `steam/depot/**` must not import `steam/depot.ts`, and the depot subtree must have no cycle.
- `games-split-modules-are-leaves`: the `game*.ts` modules split out of `steam/games.ts` must not runtime-import `games.ts`.
- Known pre-existing violations are listed in `.dependency-cruiser-known-violations.json` (303 lines). The file may only shrink (`--baseline-mode shrink-only`). Do not add to it to make a new edge pass.

**Circular imports:** the `games.ts` <-> `library.ts` cycle is known and is excluded from the depot rule on purpose. Do not expand cycles elsewhere; the boundary gate will not catch new ones outside the depot subtree.

## Repo-Specific Conventions (summaries, full text in `.claude/skills/gamelib-conventions/SKILL.md`)

These are enforced by a gate or are discipline-only. Read the skill before doing any of the listed actions.

- **Todo frontmatter** (`.planning/todos/pending/`): every pending todo must carry `severity:`, `platform:`, and `ready:`, bare and lowercase, in that order. Enforced by `.planning/todos/todo-frontmatter-gate.py`, run through `pnpm planning-gates` (`meta/runPlanningGates.py`) in `.github/workflows/codecheck.yml`. The `/gsd-add-todo` template omits them.
- **Fake-HOME isolation:** a child process spawned from `src/` or `meta/` must use `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts`, not a hand-rolled `env` literal. The in-repo spawn sites are enforced by `src/backend/__tests__/fakeHomeIsolation.test.ts`. The one declared exemption is `meta/sidecarStartupSmoke.cjs`. The ad-hoc scratchpad half is discipline-only.
- **Sidecar exit contract:** no handle may keep the event loop alive past stdin EOF. `unref()` each timer, watcher, socket, and child handle. Work that cannot be `unref()`'d goes in `releaseOnStdinEof()` (`src/backend/sidecar/stdinEofRelease.ts`). Discipline-only; `pnpm smoke:sidecar` covers only part of it.
- **UAT item shape:** `*-UAT.md` items use `### N.` headings at column 0, an inline `expected:`, and a `result:` line that opens with a bare or bracketed status word. Nothing in CI checks this.
- **`<verify>` blocks in plans:** run `npx prettier --check` over the exact paths written, never `.`. Use `--file-info` first. This is backstopped by `.husky/pre-commit`, which is skipped by rebase, cherry-pick, and `--no-verify`.

## Commit Messages

Conventional-commit style with a GSD phase scope: `type(NN-PP): subject`. Observed in `git log`: `test(62-05): pin steam/games.ts export surface`, `refactor(62-05): move DRM launch helpers into gameDrmLaunch.ts`, `docs(roadmap): add phases 69-71`, `chore(62-04): add transport-mirror markers in sidecar.rs`. Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Plan-level docs use `docs(NN-PP): complete <name> plan`.

---

*Convention analysis: 2026-11-06*
