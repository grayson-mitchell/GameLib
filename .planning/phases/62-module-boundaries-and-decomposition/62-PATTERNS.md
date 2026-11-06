# Phase 62: Module boundaries and decomposition - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 19 new/modified file groups
**Analogs found:** 17 / 19 (2 partial, see "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `meta/boundaryRatchet.cjs` | config/gate script | batch (lint API count vs ceiling) | `meta/lintScoped.cjs` (ceiling/minFiles/ESLint Node API); `meta/findDeadcode.cjs` (baseline, `require.main` guard) | exact |
| `meta/__tests__/boundaryRatchet.test.ts` | test (wiring + CLI) | batch | `meta/__tests__/findDeadcode.test.ts` | exact |
| `.dependency-cruiser.cjs` + `.dependency-cruiser-known-violations.json` | config | batch | `meta/deadcode-baseline-*.txt` (baseline shape); no depcruise config exists | partial |
| `.github/workflows/lint.yml`, `.husky/pre-push`, `package.json` (`boundaries` script) | config | CI wiring | `lint.yml` steps 26-30; `pre-push:2` | exact |
| `src/common/storeCapabilities.ts` (+ `isStore`) | model/utility | static table lookup | `src/backend/storeManagers/index.ts` `satisfies Record<Runner, …>`; `src/frontend/helpers/steamInstallOptionsEntry.ts` | exact (idiom) |
| `src/common/__tests__/storeCapabilities.test.ts` | test | transform | `src/frontend/helpers/__tests__/steamInstallOptionsEntry*.test.ts` (spec B4 style) | role-match |
| Runner-literal conversions (`downloadmanager/utils.ts`, `downloadqueue.ts`, `gamedetails/dispatch.ts`, `launcher.ts`, frontend screens/state/helpers/hooks) | service/component | request-response | `steamInstallOptionsEntry.ts` (single decision site) | exact |
| `src/backend/launcher.ts` + `storeManagers/index.ts` (launch hooks dispatch) | service | request-response | `storeManagers/index.ts` `libraryManagerMap` | exact |
| `steam/sessionState.ts`, `steam/requirements.ts`, `steam/drm*.ts` (type-A pure moves from `games.ts`) | utility/state | transform | source regions of `steam/games.ts` itself (L306-520, L522-757, L759-1260) | exact (move) |
| `steam/launch/*`, `install/*`, `uninstall/*` (type-B mechanical lifts) | service | request-response | `games.ts` class methods L1781-7005 | exact (lift) |
| `steam/depot/index.ts` + `plan/sharedRedist/download/machO/finalize/contentServers/outcome.ts` | service | batch / file-I/O | existing `steam/depot/*.ts` siblings (`reconcile.ts`, `pathCollisions.ts`) | role-match |
| `src/common/types/ipc/index.ts` + `ipc/<domain>.ts` | model (types) | request-response | `src/common/types/ipc.ts` itself (L95-110, L758-945) | exact (split) |
| `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | test (census) | batch | `sidecar/__tests__/flowRegistrationCensus.test.ts` | exact |
| `src/backend/sidecar/__tests__/transportParity.test.ts` | test (parity) | file-I/O (reads Rust text) | `keyringTokenStore.test.ts` (TS parses Rust const, cited in Rust source); `flowRegistrationCensus.test.ts` (readFileSync + regex) | role-match |
| `src-tauri/src/sidecar.rs` (marker comments only) | config | n/a | existing "Contract mirror" header L3-19 | exact |
| Any test spawning `depcruise`/`eslint` | test | child process | `src/backend/__tests__/signMachOResources.test.ts:595-625` | exact |
| `jest.mock` repoints (9 sites on `steam/games`, ~15 on `depot`) | test edits | n/a | existing mocks, see research | n/a |

## Pattern Assignments

### `meta/boundaryRatchet.cjs` (gate script, batch)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/meta/lintScoped.cjs`

**Header/imports** (L36-38): plain CJS, ESLint Node API (no spawned binary; a crash must never look like a pass).
```js
'use strict'

const { ESLint } = require('eslint')
```

**Ceiling + floor constants** (L68, L116-117): one number per scope, with a dated history comment per change; "N-1 must be RED and N must be GREEN". Floor = 50% of measured file count, to catch scope collapse.
```js
const SRC_CEILING = 1130
const SRC_MIN_FILES = 375
```

**Scope table** (L119-151): `eslintOptions` (`cache`, `cacheLocation`, `ignorePatterns`, `errorOnUnmatchedPattern: false` so the floor check gets to run), `patterns`, `maxWarnings`, `minFiles`. Copy this shape; add `overrideConfigFile: true` plus `overrideConfig` carrying only the `no-restricted-syntax` selectors so the warnings never enter `SRC_CEILING`.

**Core pattern** (L162-211): lint, sum counts, push ALL failures (no short-circuit), then return false.
```js
const results = await eslint.lintFiles(scope.patterns)
...
if (results.length < scope.minFiles) { failures.push(...) }
if (warningCount > scope.maxWarnings) { failures.push(...) }
```
**Deviation required (Pitfall 7):** also fail on `warningCount < ceiling` (stale ceiling), message "lower the ceiling in the same commit".

**Entry/crash guard** (L225-254): run all scopes unconditionally, OR results, and `main().catch(... process.exit(1))`. From `findDeadcode.cjs`: wrap `main()` in `if (require.main === module)` and export pure helpers so the jest test can `require` it safely (see test below). `findDeadcode.cjs` deliberately has NO `--update-baseline` flag; do the same (ceilings are moved by hand in the commit).

---

### `meta/__tests__/boundaryRatchet.test.ts` (test, batch)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/meta/__tests__/findDeadcode.test.ts`

**Imports + require of a `.cjs` under test** (L11-27):
```ts
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const findDeadcode = require('../findDeadcode.cjs')
const REPO_ROOT = join(__dirname, '..', '..')
```
Structure: pure-helper `describe` blocks (parser/selector hit and non-hit cases, incl. `.includes([...])`, `switch (runner)`, `runner: 'steam'` fixture non-hit, `store`-named non-runner variable non-hit) PLUS a CLI end-to-end `describe` that spawns the real gate against the real repo and asserts exit 0 (header: a pure-only suite let a broken shipped command pass once). The CLI spawn MUST use `createFakeHomeProfile()` (see Shared Patterns).

**Wiring-test sibling:** `meta/__tests__/ciTriggerWiring.test.ts` L12-36 loads workflow YAML via `js-yaml` `load(readFileSync(...))` and includes a self-test that the file really is read plus a near-miss arm that proves the check can fail. Copy this to assert `lint.yml` has a `pnpm boundaries` step, and `.husky/pre-push` line 2 contains it. Pitfall 8: `meta/__tests__/tsconfigMeta.test.ts:94` cites `.husky/pre-push:2`, so append `&& pnpm boundaries` to line 2 without reflowing, then re-run the meta jest project.

---

### `.dependency-cruiser.cjs` + known-violations baseline (config)

**Analog:** none for depcruise itself (see No Analog Found). Baseline-discipline analog: `/Users/graysonmitchell/Projects/GameLib/meta/findDeadcode.cjs` (baseline files `meta/deadcode-baseline-*.txt`; "no `--update-baseline` flag; adding an entry is a hand edit"). For depcruise use `--baseline --baseline-mode shrink-only` per RESEARCH Pattern 1; take the rule skeleton from RESEARCH L166-187 and verify option names against depcruise docs with a seeded-violation test (A1/A3).

**CI/pre-push wiring analog** (`.github/workflows/lint.yml`, steps L24-30):
```yaml
      - name: Lint code.
        run: pnpm lint
      - name: Prettier code.
        run: pnpm prettier
      - name: Find dead code
        run: pnpm find-deadcode
```
Add `- name: Module boundaries` / `run: pnpm boundaries` in the same shape. `package.json` scripts follow `"lint": "node meta/lintScoped.cjs"` (L48).

---

### `src/common/storeCapabilities.ts` (table + `isStore`)

**Analog 1 (exhaustiveness):** `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/index.ts` L1-18
```ts
import type { DMQueueElement, GameInfo, Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'

export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(),
  gog: new GOGLibraryManager(),
  legendary: new LegendaryLibraryManager(),
  nile: new NileLibraryManager(),
  steam: new SteamLibraryManager()
} satisfies Record<Runner, LibraryManager>
```
Copy: `export const storeCapabilities = { ... } satisfies Record<Runner, StoreCapabilities>`. `common/` must not import `backend/` or `frontend/` (see `common/types/game_manager.ts` L13-18 comment on this rule). Use `import type { Runner } from 'common/types'` (the `Runner` union is at `common/types.ts:20`).

**Analog 2 (single decision site + rationale comments):** `/Users/graysonmitchell/Projects/GameLib/src/frontend/helpers/steamInstallOptionsEntry.ts` L1-37 (header records D-27/D-28 and the 34.13 C-04 drift incident) and L58-84:
```ts
export function showSteamCardInstallOptions({ runner, isInstalled, isQueued, isInstallable, isDelisted }: SteamCardInstallOptionsState): boolean {
  return (runner === 'steam' && !isInstalled && !isQueued && isInstallable && !isDelisted)
}
```
This is the model for the compound-behaviour predicates (`runner === 'steam' && action === 'install'` in `InstallModal`, `GameCard`, `steamEligibilityProbe.ts`, `state/InstallGameModal.ts:407`). Rewrite bodies to read `storeCapabilities[runner].<flag>` and keep the header rationale; do NOT drop decision-ID comments. Preserve the documented split between `showSteamCardInstallOptions` and `showSteamSubMenuInstallOptions` (pinned by test spec B4). Per-game facts (`is_delisted` etc.) remain call arguments, never table fields.

**Exemption:** the one sanctioned `g.runner === s` comparison lives in `common/storeCapabilities.ts`; path-ignore it in the ratchet config rather than inline `eslint-disable`.

---

### Runner-literal conversion sites (backend)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/downloadmanager/utils.ts` L336-391 (representative of what is converted)
```ts
if (runner === 'steam') {
  libraryManagerMap[runner].getGame(appName).stop(false).catch(...)
}
...
if (runner !== 'steam' || deferredToSetup || wasAborted || status === 'error') { sendGameStatusUpdate({ appName, runner, status: 'done' }) }
if (runner === 'steam' && status === 'error') { ... }
```
Behaviour sites -> `storeCapabilities[runner].stopRequiresExplicitCall` / `installManagedExternally` (names are discretion). Keep the adjacent comment blocks (L336, L394-399). Record a per-site behaviour/identity classification in the plan (D-02). Frontend equivalent: `src/frontend/state/InstallGameModal.ts:407` `if (runner === 'steam' && action === 'install' && gameInfo)`.

---

### `src/backend/launcher.ts` boundary fix (+ dispatch in `storeManagers/index.ts`)

**Analog:** `storeManagers/index.ts` `libraryManagerMap` (above) is the registry to extend with a sibling hook table (RESEARCH recommends `launchHooks[runner]`: `setup`, `presence`, `offlineMode`) so the five managers stay untouched. Direct imports to remove (grep of `launcher.ts`): `gog/setup`, `nile/setup`, `legendary/setup`, `legendary/commands` (`LegendaryCommand`; if type-only, `import type` from a `common/` home), `legendary/electronStores`, `legendary/epicOfflineMode`, `gog/presence`, `legendary/eos_overlay/eos_overlay`. Only `storeManagers/index` may remain. Dispatch hook table should itself be `satisfies Record<Runner, ...>` or `Partial<Record<...>>` with a stated reason.

---

### `steam/sessionState.ts`, `steam/requirements.ts`, `steam/drm*.ts` (type-A pure moves)

**Analog:** the source regions in `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/games.ts` (do not re-read; cluster map in RESEARCH L263-281): L306/314/325/348/359 Maps/Sets plus `__reset*ForTests` (L333-520) -> `sessionState.ts` (leaf, no deps, move each exactly once, Pitfall 3); L522-757 -> `requirements.ts`; L759-1260 -> DRM module. Order: sessionState -> requirements -> drm -> eligibility predicates -> launch/install/uninstall (Pitfall 2, no cycle back into `games.ts`). Per D-05 repoint importers and `jest.mock` paths to the new owner (mock factories name `isNativeInstallInFlight`, `getSteamInstallSize`, `markBridgeFailedThisSession`, `buildSteamProtocolUrl`, `getBridgeRouteVerdict`); no re-export from `games.ts`. Oracle after each commit: `tsc`, `steam/__tests__/games.test.ts` (16k lines, unchanged and green), `git diff --color-moved=zebra`.

### `steam/launch|install|uninstall` (type-B lifts)

`this.appId` -> `appId` parameter, `this.helper(` -> `helper(appId, `; no logic edits (Pitfall 1). Needs the user's agreement that this reading of D-06 is acceptable (Open Question 1) before execution.

---

### `steam/depot/index.ts` and new depot submodules

**Analog:** existing `steam/depot/*.ts` siblings; back-edges to fix (verified):
- `depot/flagsCensus.ts:21` `} from '../depot'`
- `depot/pathCollisions.ts:32` `import type { DepotPlan, DepotPlanFile } from '../depot'`
- `depot/reconcile.ts:19-20` `import { sha1File, resolveContainedPath } from '../depot'` and `import type { DepotPlan, DepotPlanFile } from '../depot'`

Repoint each to the owning submodule (e.g. `./download`, `./plan`) BEFORE deleting `depot.ts`, else `index -> reconcile -> index`. While both `depot.ts` and `depot/index.ts` exist, `'./depot'` resolves to the file, so fill `index.ts` early with no effect, switch atomically by deleting `depot.ts`. Avoid names already in `depot/` (`appinfoOrder cdnAuth chunkDecode crypto decompress* fileAttributes flagsCensus hostHealth inflightLimiter lzmaLoader* manifest pathCollisions reconcile select stallTracker`) and do not touch `lzmaNativeResolvedPaths.generated.cjs`. Verify with `pnpm build:sidecar-sea` and `pnpm smoke:sidecar`.

---

### `src/common/types/ipc/index.ts` + domain files

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/common/types/ipc.ts`

**Interface header with the ts-prune marker** (L95-103):
```ts
import type { StoreEmbedBounds, StoreEmbedNavEvent } from 'backend/store/storeEmbedSeam'
import type { SignInProbeOutcomeMap } from '../signInState'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  setZoomFactor: (zoomFactor: string) => void
```
Carry `// ts-prune-ignore-next` (or an equivalent) to the new umbrella exports, and fix relative imports (`'../signInState'` becomes `'../../signInState'` under `ipc/`).

**Tail export block to reproduce from `ipc/index.ts`** (final lines):
```ts
export type {
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  AsyncIPCFunctions,
  FrontendMessages
}
```
Also re-export `SteamSyncStatus` (L758: `export type SteamSyncStatus = 'idle' | 'syncing' | 'failed'`). `SteamSyncFailureReason` is intentionally unexported with a ts-prune rationale comment: keep it local to its domain file and keep the comment. Delete `ipc.ts` in the same commit that adds `ipc/index.ts` (file beats directory in resolution). Assemble `AsyncIPCFunctions = SteamAsync & GogAsync & …`. Two names (`refreshLibrary`, `connectivity-changed`) are intentionally in two umbrella interfaces, so uniqueness is per umbrella. 64 channels have no registration owner: add unpaired `ipc/frontendMessages.ts`, `ipc/window.ts`, `ipc/testStubs.ts`.

---

### `sidecar/__tests__/ipcDomainCensus.test.ts` (census)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`

**Imports and dir constants** (L38-42):
```ts
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const SIDECAR_DIR = join(__dirname, '..')
const HANDLERS = join(SIDECAR_DIR, 'handlers.ts')
```
**Hand-maintained tripwire table** (L47-): `const EXPECTED: Record<string, { invoke: number; send: number }> = { 'appShellFlowRegistration.ts': {...}, ... }` with a dated comment per change; the file's header explains why a table plus docstring check. Reuse its `ipcMain.handle`/`ipcMain.on` parsing rather than re-deriving. Copy the `NO_COUNT_CLAIM` Set idiom (L~122) for the explicit allowlist of owner-less channels (halves: (a) registered channel is declared in its paired `ipc/<domain>.ts`; (b) each channel is declared once per umbrella interface). Name pairing: 21 registrations; `steamAuth` owns ~28 channels and `steam` only 2.

---

### `sidecar/__tests__/transportParity.test.ts`

**Analogs:** `flowRegistrationCensus.test.ts` (readFileSync + regex on source text) and the existing `keyringTokenStore.test.ts` TS-parses-Rust precedent (cited in Rust source as "independently parsing this constant out of this file").

**TS side** (`/Users/graysonmitchell/Projects/GameLib/src/common/types/sidecarTransport.ts`): import the exported constants (`READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`, `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL`, `RUST_INVOKE_CHANNELS`, `RUST_INVOKE_KIND`). **Rust side** is `src-tauri/src/sidecar.rs` L3-19, NOT `main.rs` (CONTEXT/ROADMAP are wrong on this):
```rust
// ---- Contract mirror (keep in lockstep with src/common/types/sidecarTransport.ts) ----
/// Printed once by the sidecar on stdout ... Mirrors READY_SENTINEL.
const READY_SENTINEL: &str = "__GAMELIB_SIDECAR_READY__";
const FRONTEND_MESSAGE_EVENT: &str = "frontend_message";
pub(crate) const SHELL_WINDOW_FOCUSED: &str = "shellWindowFocused";
pub(crate) const STORE_SNAPSHOT_CHANNEL: &str = "sidecar:store-snapshot";
```
Plan: add a comment-only marker line above each (e.g. `// transport-mirror: READY_SENTINEL`); test globs `src-tauri/src/*.rs`, finds each const by marker, regex-extracts the string value, `expect(...).toBe(TS value)`; fail if a marker is missing. Also assert `dispatch_rust_channel` match-arm strings in `store_embed.rs` (~L1810) equal `RUST_INVOKE_CHANNELS` (37), the highest-value drift check. `rustInvoke` literal at `sidecar.rs:~487`.

---

### Tests that spawn child processes (any phase-62 test running `depcruise`/`eslint`)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/__tests__/signMachOResources.test.ts` L61 and L595-625
```ts
import { createFakeHomeProfile } from '../testUtils/fakeHomeProfile'
const profile = createFakeHomeProfile({ prefix: 'gamelib-macho-spawn-' })
try {
  const run = spawnSync(process.execPath, [...], {
    cwd: REPO_ROOT, encoding: 'utf-8', env: profile.childEnv(base)
  })
  ...
} finally { /* dispose profile */ }
```
`createFakeHomeProfile` is defined in `src/backend/testUtils/fakeHomeProfile.ts:193`. `meta/` callers outside jest land in `tmpdir()`. `fakeHomeIsolation.test.ts` enforces this for in-repo spawn sites, so a hand-rolled `env` literal will fail it. Never hand-roll `env`.

## Shared Patterns

### Ceiling that only moves down (D-14)
**Source:** `meta/lintScoped.cjs` L40-117 (ceiling constants with dated history, N-1 RED / N GREEN, `minFiles` floor). **Apply to:** `boundaryRatchet.cjs` and the depcruise baseline. Every plan that removes sites edits the ceiling number in the same commit; at zero, move the rule into `eslint.config.mjs` as `error` and delete script and ceiling. Do NOT add the warn rule to `eslint.config.mjs` early (it would flow into `SRC_CEILING` 1130).

### Single decision site with preserved rationale
**Source:** `src/frontend/helpers/steamInstallOptionsEntry.ts` L1-37. **Apply to:** every converted runner-literal site and every capability-table flag: keep the decision-ID comments (D-27, D-28, REQ-37-02, 34.13 C-04) beside the new flag or helper.

### Exhaustive per-runner record
**Source:** `storeManagers/index.ts` `satisfies Record<Runner, LibraryManager>`. **Apply to:** `storeCapabilities`, and the `launcher.ts` hook table.

### Census/tripwire tests
**Source:** `flowRegistrationCensus.test.ts` (EXPECTED table, dated change comments, docstring re-derivation) and `findDeadcode.test.ts` (pure half plus real-CLI half; near-miss arm proves the check can fail). **Apply to:** `ipcDomainCensus`, `transportParity`, `boundaryRatchet` tests.

### Pure-move commit discipline
**Source:** D-05/D-06; RESEARCH Pitfalls 1-4. Type-A moves are path-only diffs; type-B are `this.`-lifts only. Cleanups found go to todos with `severity:`/`platform:`/`ready:` frontmatter, not move commits.

### Conventions for every `<verify>`
`npx prettier --check` over exact paths written (scoped, check `--file-info` first; `.cjs` is eslint-ignored but must be prettier-clean by hand; `meta/` may be prettier-ignored, so check). Sidecar: `tauri dev` does not rebuild it; restart `pnpm tauri:dev` (not `:run`) before D-17 smokes.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.dependency-cruiser.cjs` | config | batch | No depcruise config in repo; use RESEARCH Pattern 1 sketch and verify option names (A1) with a seeded-violation test |
| `.dependency-cruiser-known-violations.json` | baseline | batch | Tool-generated format (`--baseline`); closest discipline analog is `meta/deadcode-baseline-*.txt` |

## Metadata

**Analog search scope:** `meta/`, `meta/__tests__/`, `src/backend/storeManagers/`, `src/backend/sidecar/__tests__/`, `src/backend/downloadmanager/`, `src/backend/testUtils/`, `src/frontend/helpers/`, `src/common/types/`, `src-tauri/src/sidecar.rs`, `.github/workflows/lint.yml`, `.husky/pre-push`
**Files scanned:** ~20 read or excerpted (games.ts/depot.ts regions taken from RESEARCH cluster maps, not re-read)
**Pattern extraction date:** 2026-11-06
