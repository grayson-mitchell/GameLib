# Phase 62: Module boundaries and decomposition - Research

**Researched:** 2026-11-06
**Domain:** TypeScript refactor + static-analysis gates (dependency-cruiser, ESLint AST rule), store-capability table, file decomposition, IPC type split, TS/Rust constant parity test
**Confidence:** MEDIUM-HIGH (all repo measurements are first-hand; dependency-cruiser could not be installed in this session, so its baseline counts are derived by script, not by the tool)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flags live in one static per-runner table in `common/`, shaped like `storeCapabilities: Record<Runner, StoreCapabilities>` and read by both frontend and backend. Compiler must force every runner to declare every flag (`satisfies Record<Runner, ...>`, as `storeManagers/index.ts` does for `LibraryManager`). Per-game facts (`is_delisted`, `thirdPartyManagedApp`, `canRunOffline`, ...) stay on `GameInfo`; a flag is never stamped onto each serialised game.
- **D-02:** Store-identity checks stay legitimate, but only through one named helper (e.g. `isStore(game, 'steam')` or the table's `store` field). Identity checks: ProtonDB/compat level, Mac Steam bottle setup, `crossoverOnly`-defaults-on-for-Steam engine rule, Steam playtime source, steam:// links. The raw `runner === '<literal>'` form is banned. Behavioural sites (install managed externally, DLC selection, resumable install, no store page when delisted, ...) become capability flags. Classifying each site as behaviour or identity is part of the work and is recorded per site.
- **D-03:** Frontend reach is every runner literal, not just `'steam'` (gog/legendary/nile/sideload/humble too).
- **D-04:** The literal ban applies everywhere in `src/frontend/**` and `src/backend/**` except `src/backend/storeManagers/**`. Also covers frontend `state/`, `helpers/` and backend `sidecar/*FlowRegistration.ts`. Test files are the planner's call.
- **D-05:** Repoint importers; no façade. After extraction every importer and every `jest.mock` path targets the module that owns the symbol. `games.ts` does not re-export moved symbols.
- **D-06:** Pure moves in separate commits. A move commit = move + import-path edits only. Renames, dedupes, dead-code removal found along the way become todos or a separate follow-up commit.
- **D-07:** Launch, DRM and requirements modules are the minimum. Planner builds a cluster map first and may extract more (e.g. install/uninstall/state). Cohesive leftovers stay in `games.ts`.
- **D-08:** Split `depot.ts` into `steam/depot/` submodules with `steam/depot/index.ts` as the public entry. External importers use `steam/depot`; modules inside `depot/` import siblings directly. Replacing `depot.ts` with `depot/index.ts` must not break the 3 existing `depot/*` modules that import `../depot`.
- **D-09:** Per-domain IPC types live at `src/common/types/ipc/<domain>.ts`, name-paired with the flow registrations (`ipc/steam.ts` pairs with `backend/sidecar/steamFlowRegistration.ts`). Not same directory.
- **D-10:** `src/common/types/ipc/index.ts` assembles umbrella types as intersections (`AsyncIPCFunctions = SteamAsync & GogAsync & ...`, likewise `SyncIPCFunctions`, `TestSyncIPCFunctions`, `FrontendMessages`) so consumers keep imports. Add an explicit check that each channel name is declared in exactly one domain file.
- **D-11:** A census test pairs channels with domains; fails if a `*FlowRegistration.ts` handles a channel not declared in its paired `ipc/<domain>.ts` (style of `flowRegistrationCensus.test.ts`).
- **D-12:** The transport parity test is a jest test that parses Rust source text. Imports constants from `common/types/sidecarTransport.ts`, regex-extracts mirrored `const` values, fails on drift. No cargo in the jest lane. Give each mirrored Rust const a stable marker comment so extraction survives the future `main.rs` split.
- **D-13:** Two tools. dependency-cruiser for the import-graph rules (no cross-manager imports; `launcher.ts` only through `storeManagers/index`). The literal ban is an ESLint rule (e.g. `no-restricted-syntax` on a `BinaryExpression`).
- **D-14:** Each rule's baseline is a ceiling that can only go down (pattern of `meta/lintScoped.cjs`). CI fails if a change adds a violation. Each plan that removes sites lowers its ceiling in the same commit. At zero the rule flips to `error` and its ceiling is deleted. A rule never sits warn-only with no ceiling.
- **D-15:** Phase is done when every rule is at `error` with a zero count.
- **D-16:** Order is rules -> split -> capabilities. (1) tooling + baselines; (2) `games.ts`/`depot.ts`/`ipc.ts` pure moves + parity test; (3) capability flags + literal conversion in the already-split files. The `launcher.ts` boundary fix can go in (2) or (3).
- **D-17:** Two short live macOS smoke runs (after the split, after capabilities). `pnpm tauri:dev`, restart so the sidecar rebuilds. One bridged Steam title, one DRM-mode title (Grim Dawn, 219990), one non-Steam game. Check Library, game page, install modal, Console mode, download queue show the right store-specific controls. Green suite alone is not sufficient.

### Claude's Discretion
- Exact flag names and day-one flag set (derive from per-site audit; prefer behaviour names over store names).
- Name and signature of the identity helper (D-02).
- Whether `__tests__/` are exempt from the literal ban.
- Exact module names and cut lines for the `games.ts` and `depot.ts` splits, within D-05..D-08.
- How the dependency-cruiser baseline is stored and checked (config file plus a meta script, or folded into an existing gate), provided it meets D-14.
- Whether `launcher.ts`'s store-specific setup calls go through new `LibraryManager` methods or a dispatch in `storeManagers/index`.

### Deferred Ideas (OUT OF SCOPE)
- The `src-tauri/src/main.rs` split (separate quick task). D-12's marker comments are meant to survive it.
- Cleanups found during the pure moves (D-06): raised as todos, not done in move commits.
- Reviewed-and-not-folded todos: launch notice toast theming, blank-render fix, x86 shim parity, depot `optionaldlc`, protonfixes import tool, winebus PowerA wedge, Amazon store-exit refresh, native engine source ports, downloads history loss.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (TBD in ROADMAP). CONTEXT.md D-01..D-17 are the contract. The planner should derive plan-level IDs from the decisions, e.g.:

| ID (suggested) | Description | Research Support |
|----|-------------|------------------|
| D-13/D-14 | Boundary rules + ratchet | Standard Stack, Pattern 1/2, Baselines table |
| D-01..D-04 | Capability table + identity helper | Pattern 3, Runner-literal inventory |
| D-05..D-08 | games.ts / depot.ts decomposition | Cluster maps, Pitfalls 1-4 |
| D-09..D-12 | ipc split + transport parity | IPC section, Parity section |
| D-15..D-17 | Zero-at-error, live smoke | Validation Architecture |
</phase_requirements>

## Summary

This is a refactor-and-gates phase with no behaviour change. Four findings change how it should be planned. (1) **The Rust transport constants are not in `main.rs`.** They live in `src-tauri/src/sidecar.rs` (`READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`, `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL`, under a "Contract mirror" header) and the 37 `RUST_*` channel strings appear as `dispatch_rust_channel` match arms in `store_embed.rs`. The parity test must glob `src-tauri/src/*.rs` and find constants by marker, not read `main.rs`. (2) **`games.ts` is one 5,900-line `SteamGame` class**, not a bag of functions. Only ~1,150 lines (lines 1-1260) are free functions and module state. The launch (`launch` 3977 + helpers to 6214), install (1781-3700) and uninstall (6337-7005) bodies are class methods that call each other through `this.*`. Extracting them cannot be a literal "pure move"; it is a mechanical `this.appId` -> parameter rewrite. D-06 needs an explicit reading. (3) **Of the 292 unique IPC channel names, 64 have no `*FlowRegistration.ts` owner** (all 42 `FrontendMessages` backend-to-renderer pushes, plus window-control/test-stub channels handled in `main.ts`/`ipc_handler` files), and 2 names (`refreshLibrary`, `connectivity-changed`) are legitimately declared in two umbrella interfaces. D-10/D-11 need extra non-registration domain files and a per-interface uniqueness check. (4) **A new ESLint `warn` rule would pollute `SRC_CEILING` (1130)** in `lintScoped.cjs` because that ceiling counts every warning. The literal ban needs its own ratchet script.

dependency-cruiser 18.7.2 (published 2026-11-02, Node `^22||^24||>=26`, matches the repo's Node >=22) has a built-in baseline: `--baseline` writes `.dependency-cruiser-known-violations.json`; `--baseline-mode shrink-only` refuses growth; `--ignore-known` hides known ones. That alone satisfies D-14 for the graph rules. Measured today with a script (the tool itself could not be installed): cross-manager imports in production code = 0 (12 edges exist only in test files); `launcher.ts` direct store imports = 8.

**Primary recommendation:** Plan 1 = tooling (`.dependency-cruiser.cjs` + known-violations baseline, a standalone `meta/boundaryRatchet.cjs` for the ESLint literal ban with its own ceilings, CI step in `lint.yml`, pre-push chain). Plans 2-4 = pure-move splits (leaf modules first, class-method clusters last, with the `this.appId` rewrite named honestly). Plan 5+ = capability table, then literal conversion by area, each lowering the ceiling in the same commit; final plan flips every rule to `error`/zero and runs the second live smoke.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capability table + identity helper | `src/common/` (shared) | - | Read by frontend and backend; must not import either (D-01, Integration Points) |
| Import-graph rules (depcruise) | Build/CI tooling (`meta/`, repo root) | - | Static analysis of `src/backend/**` |
| Literal-ban rule | ESLint config + `meta/` ratchet script | - | AST-level; depcruise cannot see `runner === 'x'` |
| Per-store setup dispatch for `launcher.ts` | API/Backend `storeManagers/index.ts` | `LibraryManager`/`GameManager` interface | Only `index` may know concrete managers |
| games.ts / depot.ts modules | Backend `storeManagers/steam/` | - | Pure decomposition |
| Per-domain IPC channel types | `src/common/types/ipc/` | Backend `sidecar/*FlowRegistration.ts` (census only) | Frontend/preload import types; types must not live under `backend/` |
| Transport parity test | Backend jest project (reads Rust text) | Rust shell (marker comments only) | No cargo in the jest lane (D-12) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dependency-cruiser | 18.7.2 (npm `time.modified` 2026-11-02; engines node `^22\|\|^24\|\|>=26`) | Import-graph rules, `forbidden` rules, built-in known-violations baseline | Named in ROADMAP and D-13; `--baseline-mode shrink-only` is a ready-made ratchet (since 18.3.0) [CITED: github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md] |
| eslint (already installed) | ^9.29.0 | Literal-ban rule via core `no-restricted-syntax` | Already the repo's linter; flat config in `eslint.config.mjs` |
| typescript (already) | ^5.8.3 | `satisfies Record<Runner, StoreCapabilities>` | Same idiom as `storeManagers/index.ts` |
| jest + ts-jest (already) | repo | Census, parity and capability tests | Existing projects: backend, common, frontend, preload, meta, relay |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eslint-plugin-import-x (already) | ^4.15.2 | Fallback host for import rules | Not used: D-13 locks dependency-cruiser |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `meta/boundaryRatchet.cjs` for the ESLint rule | Raising `SRC_CEILING` by the baseline | Rejected: `lintScoped.cjs` counts ALL warnings under one number; mixing hides regressions (its own header says so) |
| depcruise `--baseline` file | Hand-coded ceiling number in a `.cjs` | Number-only ceiling is simpler but cannot tell WHICH edge is new; baseline file lists edges. Either meets D-14. Use the file for depcruise, a number for the ESLint rule |

**Installation:**
```bash
pnpm add -D dependency-cruiser@18.7.2   # exact pin; repo uses carets elsewhere, but a gate tool should not float
```

**Version verification:** `npm view dependency-cruiser version` returned `18.7.2`; `time.modified` 2026-11-02; no `scripts.postinstall` printed. Peer deps: none listed.

## Package Legitimacy Audit

slopcheck could not be run (the install attempt in this session was blocked by the permission classifier, so `slopcheck` is unavailable). Per protocol every recommended package is therefore tagged `[ASSUMED]` and the planner gates the install behind a `checkpoint:human-verify`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| dependency-cruiser | npm | many yrs (v18.7.2 on 2026-11-02) | high (widely used) [ASSUMED] | github.com/sverweij/dependency-cruiser (confirmed via `npm view repository.url`) | not run | `[ASSUMED]` - planner adds `checkpoint:human-verify` before install. Named in ROADMAP by the user, official docs fetched; risk is low but the protocol is mechanical |

**Packages removed due to slopcheck [SLOP] verdict:** none (not run)
**Packages flagged [SUS]:** none known

## Architecture Patterns

### System Architecture Diagram

```
 developer commit / CI (lint.yml, pre-push line 2)
          |
          v
 pnpm lint (unchanged: lintScoped.cjs, SRC_CEILING 1130 / TESTS_CEILING 661)
 pnpm boundaries (NEW) -----+--> depcruise --config .dependency-cruiser.cjs src/backend
          |                 |       rules: no-cross-manager, launcher-only-via-index
          |                 |       baseline: .dependency-cruiser-known-violations.json
          |                 |       (--ignore-known; shrink-only to update)
          |                 +--> meta/boundaryRatchet.cjs (ESLint Node API, dedicated rule set)
          |                         rule: no-runner-literal  (frontend + backend minus storeManagers)
          |                         ceiling: N per scope, FAIL if count > N, FAIL if count < N (stale ceiling)
          v
 exit non-zero on any growth

 runtime shape after capabilities (D-01/D-02):
 frontend/screens|state|helpers ---\
 backend/downloadmanager|launcher...--> common/storeCapabilities.ts
                                         storeCapabilities[runner].<flag>   (behaviour)
                                         isStore(game, 'steam')             (identity, one helper)
                                         `satisfies Record<Runner, StoreCapabilities>`
 launcher.ts --> storeManagers/index.ts --> libraryManagerMap[runner].<setup hook> --> gog|legendary|nile|steam|sideload
```

### Recommended Project Structure
```
.dependency-cruiser.cjs                      # rules, tsConfig: 'tsconfig.json'
.dependency-cruiser-known-violations.json    # baseline (only while non-empty)
meta/boundaryRatchet.cjs                     # ESLint-API ceiling for no-runner-literal
meta/__tests__/boundaryRatchet.test.ts       # N-1 red / N green model, like findDeadcode.test.ts
src/common/storeCapabilities.ts              # table + isStore() + types
src/common/types/ipc/                        # index.ts + <domain>.ts (+ frontendMessages.ts, window.ts, testStubs.ts)
src/backend/storeManagers/steam/
  games.ts                                   # class shell + leftovers
  requirements.ts                            # parseSteamStorageRequirement, parseSteamMacMinOSVersion, macArchFromMinOS, getSteamInstallSize
  drm/ (or drmLaunch.ts)                     # DRM env/trace/notice helpers (lines 759-1260)
  sessionState.ts                            # the 6 module-level Maps/Sets (leaf, breaks cycles)
  launch/ , install/ , uninstall/            # class-method clusters as free functions (see Pitfall 1)
  depot/index.ts + plan.ts sharedRedist.ts download.ts machO.ts finalize.ts contentServers.ts orchestrate.ts
src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
src/backend/sidecar/__tests__/transportParity.test.ts
```

### Pattern 1: dependency-cruiser config (graph rules)
**What:** two `forbidden` rules, `tsConfig` pointing at the repo tsconfig so `baseUrl: ./src/` aliases (`backend/...`, `common/...`) resolve.
**Example:**
```js
// Source: shape from dependency-cruiser docs (rules reference) [ASSUMED - option names verified only for --config/--ts-config/--baseline; confirm `forbidden`/`from`/`to` keys against doc/rules-reference.md]
module.exports = {
  forbidden: [
    {
      name: 'no-cross-store-manager',
      severity: 'error',            // baseline file carries any known edges
      comment: 'A store manager may not import another store manager. Share via storeManagerCommon/ or common/.',
      from: { path: '^src/backend/storeManagers/(steam|gog|legendary|nile|sideload)/', pathNot: '__tests__' },
      to:   { path: '^src/backend/storeManagers/(steam|gog|legendary|nile|sideload)/',
              pathNot: '^src/backend/storeManagers/$1/' }   // $1 group back-reference from `from`
    },
    {
      name: 'launcher-only-via-store-managers-index',
      severity: 'error',
      from: { path: '^src/backend/launcher\\.ts$' },
      to:   { path: '^src/backend/storeManagers/', pathNot: '^src/backend/storeManagers/index\\.ts$' }
    }
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, tsPreCompilationDeps: true, doNotFollow: { path: 'node_modules' } }
}
```
Run: `depcruise --config .dependency-cruiser.cjs --output-type err-long --ignore-known src/backend`. Update baseline: `depcruise ... --baseline --baseline-mode shrink-only` (refuses to add) [CITED: doc/cli.md]. Note `$1` group-reference in `pathNot` is a depcruise feature [ASSUMED]; if it misbehaves, write the rule once per manager (5 rules) - mechanical.

The user-facing roadmap says "warn-only then promote". Because the baseline file already exempts known edges, the rules can be `error` from day one and still be green; this is stricter than warn and equal to D-14 ("ceiling that can only go down"). If the planner prefers literal warn-first, `err` reporter exits 0 on warnings, so it needs `--output-type err` plus an explicit count check script - more code for less safety. Recommend `error` + baseline. Record this as a stated interpretation in the plan.

### Pattern 2: Ratchet for the ESLint literal ban (dedicated script)
**What:** `meta/boundaryRatchet.cjs` using `require('eslint').ESLint` with `overrideConfigFile: true` and a minimal config (parser only + the one rule), exactly as `lintScoped.cjs` calls the Node API (not a spawned binary). Fail if `count > CEILING` (new site) AND fail if `count < CEILING` (forces the plan that removed sites to lower the number in the same commit, satisfying "ceiling matches what the plan claims"). Add a `minFiles` floor against scope collapse, as `lintScoped.cjs` does.
**Why not the main config:** `lintScoped.cjs` `SRC_CEILING` counts every warning. Adding a `warn` rule there moves a number that is unrelated and lets a literal regression hide under unrelated headroom. Keep the rule OUT of `eslint.config.mjs` until it is at zero; at zero add it to `eslint.config.mjs` as `error` (D-14/D-15) and delete the ceiling and script.
**Prototype I measured (selector set, `no-restricted-syntax`):** matches `BinaryExpression[operator=/^[!=]==?$/]` with one side `MemberExpression[property.name=/^(runner|store)$/]` or `Identifier[name=/^(runner|store)$/]` and the other a string `Literal` in the store set, plus `SwitchStatement` whose discriminant is `.runner`/`runner`. Result, Node API, files of `src/frontend`, `src/backend`, `src/common`, `src/preload`:

| Scope | Count |
|-------|-------|
| frontend, non-test | 122 |
| frontend, tests | 5 |
| backend outside `storeManagers/`, non-test | 63 |
| backend outside `storeManagers/`, tests | 6 |
| `backend/storeManagers/**` (exempt, D-04) | 2 non-test, 0 test |

These differ from the grep numbers in CONTEXT (136 frontend lines, 66 backend) because AST matching ignores comments but the prototype also matches `store`-named variables and `switch`. **The prototype is a starting point, not the ratified selector.** Plan 1 must settle the selector (see Pitfall 5) and record the exact numbers in the commit. Known false positives to resolve: `backend/jest.setupContainment.ts` (4) and `frontend/typedefs/react-inert.d.ts` (1) matched on non-runner `store` names; `['legendary','gog'].includes(runner)` form (3 frontend sites) is NOT caught by the BinaryExpression selector and needs a `CallExpression[callee.property.name='includes']` selector with an array of store literals. Also grep shows `Runner` is `'legendary'|'gog'|'sideload'|'nile'|'steam'` (`common/types.ts:20`), so 'humble' literals are compared against other fields (`store`, `source`); decide whether they belong in the ban (D-03 says every runner literal).

### Pattern 3: Capability table (single decision site)
```ts
// src/common/storeCapabilities.ts  -- shape only; flag set is Claude's discretion (derive from audit)
import type { Runner } from 'common/types'
export interface StoreCapabilities {
  store: Runner                         // identity field, for isStore()
  installManagedExternally: boolean     // Steam: downloadmanager / Install modal skip generic flow
  supportsDlcSelection: boolean         // legendary, gog (DownloadDialog:639, GameSubMenu:421 use ['legendary','gog'])
  resumableInstall: boolean             // Steam steamResumePending (hooks/hasStatus.ts:184)
  hasStorePage: boolean ...             // delisted handling stays per-game via GameInfo.is_delisted
}
export const storeCapabilities = {
  steam: {...}, gog: {...}, legendary: {...}, nile: {...}, sideload: {...}
} satisfies Record<Runner, StoreCapabilities>
export const isStore = (g: { runner: Runner }, s: Runner) => g.runner === s   // the ONE allowed comparison; lives in common/, exempt via the rule's file ignore
```
Follow `helpers/steamInstallOptionsEntry.ts`: the table/helper owns the decision, callers never inline. Its header records the 34.13 C-04 incident (an inlined conjunct drifted) - keep rationale comments with each converted site (CONTEXT Established Patterns).

### Pattern 4: IPC split (D-09/D-10/D-11)
```ts
// src/common/types/ipc/index.ts
export type AsyncIPCFunctions = SteamAsync & GogAsync & /* ... */
export type SyncIPCFunctions  = ...
```
Keep `src/common/types/ipc.ts` import path working: consumers import `'common/types/ipc'`; with `moduleResolution: node`, a directory `ipc/index.ts` and the old `ipc.ts` BOTH match the path, and the file wins. Delete `ipc.ts` in the same commit that adds `ipc/index.ts`. Only 6 non-test importers (frontend/types.ts, GlobalState.tsx, steamLibraryVisibility.ts, librarySyncIndicator.ts, backend/ipc.ts, preload/ipc.ts) plus 2 tests; also `Steam*` helper types exported from ipc.ts (e.g. `SteamSyncStatus`) must be re-exported from `ipc/index.ts` or repointed.

### Anti-Patterns to Avoid
- **Re-export barrel in `games.ts`** to keep old mocks working (violates D-05; the whole point is mocks stop stubbing moved code).
- **Putting `ipc/<domain>.ts` under `backend/sidecar/`** (breaks the boundary; frontend/preload would import backend).
- **Converting runner sites inside the 7k-line file before splitting** (D-16 order).
- **Counting a rule's ceiling in `lintScoped.cjs`** (see Pattern 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import-graph violation baseline | a custom edge-diff script | `depcruise --baseline --baseline-mode shrink-only` + `--ignore-known` | Built in since 18.3.0 [CITED] |
| TS path alias resolution for the graph | manual regex resolver (like my scratch script) | depcruise `tsConfig` option | Handles `baseUrl: ./src/` aliases |
| Exhaustive per-runner flags | runtime "default false" lookups | `satisfies Record<Runner, StoreCapabilities>` | Compiler forces new runners to declare every flag |
| ESLint run in a gate | spawning `eslint` binary | `require('eslint').ESLint` Node API | `lintScoped.cjs` header: `require.resolve('eslint/bin/eslint.js')` throws on 9.29; spawned binaries invite fail-open exit-code bugs |
| Rust constant extraction | a Rust parser | marker comment + regex on source text | D-12; markers survive the `main.rs` split |

## Runtime State Inventory

Not a rename/migration phase in the data sense. Explicit answers for completeness:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None - verified: no persisted key contains a module path or capability flag; D-01 forbids stamping flags onto serialised `GameInfo` | none |
| Live service config | None - no external service references these module paths | none |
| OS-registered state | None | none |
| Secrets/env vars | None | none |
| Build artifacts | `build/` sidecar bundle (`sidecar.js`) is stale after any backend move: per memory note, `tauri dev` does not rebuild the sidecar. `src/backend/storeManagers/steam/depot/lzmaNativeResolvedPaths.generated.cjs` is a generated file sitting beside the new depot modules; the depot fold must not move or regenerate it. | Rebuild sidecar (`pnpm build:sidecar-sea`, restart `pnpm tauri:dev`) before each live smoke; check the `.generated.cjs` generator's output path is not the thing being edited |

## Cluster Maps

### `steam/games.ts` (7,228 lines, 101 import-statement lines, 32 exports, 602 `this.` uses)

| Region (lines) | Content | Extraction kind |
|---|---|---|
| 1-330 | imports, constants, `nativeInstallsInFlight` Map (306), `bridgeLaunchesInFlight` (314), `bridgeLaunchBottles` (325) | state -> `sessionState.ts` |
| 333-520 | `__reset*ForTests`, `markBridgeFailedThisSession`, `isNativeInstallInFlight`, `mark/clearForcedWindowsViaBottle`, state Sets (348, 359) | state/session -> `sessionState.ts` (pure move, free functions) |
| 522-757 | `buildSteamProtocolUrl`, `parseSteamStorageRequirement`, `parseSteamMacMinOSVersion`, `macArchFromMinOS`, `getSteamInstallSize` | **requirements module** (pure move; ~235 lines) |
| 759-1260 | DRM channel consts/types, `buildDrmLaunchEnvironment`, `drmBottleWinPath`, `drmWineLogPathFor`, `drmWineDebugFromEnv`, `createDrmWineLogAppender`, `prepareDrmTraceFile`, `relogDrmTrace`, `drmModeNoticeShownThisSession` (1182), `engineLabelForLog`, `drmStepNoticeText` | **DRM module** (pure move; ~500 lines) |
| 1262-1780 | class `SteamGame` (`default export`): ctor, `getSettings`, `getGameInfo`, `fetchMetadataIfNeeded`, `getExtraInfo`, `importGame` | stays (class shell) |
| 1781-3700 | `install` + `installNative`, `installBottleNative`, `installBridgeGame` (2415-3048, ~630 lines), `reconcileBridgePrescreen`, `markBridgeGameInstalled/Uninstalled`, `installResultForRefusal` | install cluster (class-method rewrite) |
| 3695-3975 | `isNative`, bottle/bridge eligibility, `bridgeRoute`, `checkBridgeRoute`, `ensurePlatformsCaptured`, shortcuts | eligibility cluster; **called by install, launch and uninstall** -> must be a leaf both depend on |
| 3977-6214 | `launch` + `maybeNotifyDrmModeFailed`, `showEngineDialog`, overlay helpers, `launchBridgeGameBody` (5196-6214, ~1,000 lines) | launch cluster (class-method rewrite) |
| 6214-7005 | `moveInstall`, `repair`, `syncSaves`, `uninstall` + five `uninstall*` privates | uninstall cluster |
| 7005-7228 | `update`, `forceUninstall`, `stop`, `isGameAvailable`, `getBridgeRouteVerdict` (7186, exported) | stays / `getBridgeRouteVerdict` moves with eligibility |

`launch` cluster `this.*` footprint: 164x `this.appId`, plus ~25 distinct private helpers (most are in the launch cluster itself; external ones are `getGameInfo`, `isBottleEligible`, `ensurePlatformsCaptured`, `clearStaleBridgeVerdict`, `reconcileBridgePrescreen`, `persistBridgeDrmSignal`, `ensureBuiltInEngineForInstall`, `resolveBridgeGameInstallRoot`). Install and uninstall clusters likewise call `this.getGameInfo`, `this.isBottleEligible`, `this.resolveBridgeGameInstallRoot`.

**Importers (19 per CONTEXT; production: `downloadmanager/downloadqueue.ts`, `sidecar/steamAuthFlowRegistration.ts`, `gog|legendary|nile|sideload/library.ts` (these import their OWN `./games`, not steam's - verified: zero cross-manager production imports), `steam/{cancelDelete,installFormIpc,library}.ts`; tests listed in `jest.mock` table below).** The `jest.mock` sites that target `steam/games`: `downloadmanager/__tests__/downloadqueue.test.ts:146`, `sidecar/__tests__/{steamEngineFlows:27 (stub `{}`), steamAuthFlows:113 (automock), installFlows:190, downloadQueueFlows:157}.test.ts`, `steam/__tests__/{cancelDelete:32, installFormIpc:42}.test.ts`, plus `library.test.ts`, `macArchKnownFixRouting.test.ts`, `removeCopies.test.ts`, `steamStartupKeyringDeferral.test.ts`, `gog/__tests__/gogImportGame.test.ts` import it. The mock factories name the symbols: `isNativeInstallInFlight`, `getSteamInstallSize`, `markBridgeFailedThisSession`, `buildSteamProtocolUrl`, `getBridgeRouteVerdict`. Each repoint targets the new owner (mostly `sessionState.ts` and `requirements.ts` - easy pure moves).

**Test hazard:** `steam/__tests__/games.test.ts` is 16,373 lines and tests the class through public methods. It stays green through free-function extraction as long as module-level collaborators are mocked by path (they are). Re-run it after every move commit; it is the main behaviour-preservation oracle.

### `steam/depot.ts` (4,598 lines) and `steam/depot/` (21 modules)

Seams (all top-level, no class): `105-1110` plan building (`buildDepotPlan`, `screenDepotPlanForSteamApi`, `prescreenBridgeDepots`, steam-user client wiring, retry); `1111-1686` shared-redist; `1687-2570` download constants + `downloadFileChunks`/`downloadSingleFile`/`resolveContainedPath`/`sha1File`; `2572-2890` Mach-O probing (self-contained, 320 lines); `2891-3822` `healReconciledFileModes` + `downloadDepotFiles` (900 lines, one function); `3823-3965` `finalizeToSteam`; `3966-4115` content-server selection; `4116-4598` outcome/orchestration (`downloadSelectedDepotFiles`, `downloadSteamDepots`).

Existing `depot/` file names that must not collide: `appinfoOrder cdnAuth chunkDecode crypto decompress decompressPool decompressPoolSelfTest decompressWorker fileAttributes flagsCensus hostHealth inflightLimiter lzmaLoader lzmaLoaderCore lzmaNativeBinding lzmaNativeResolvedPaths.generated.cjs manifest pathCollisions reconcile select stallTracker`. Proposed new names (`plan`, `sharedRedist`, `download`, `machO`, `finalize`, `contentServers`, `outcome`) collide with none.

**Importers of `depot.ts` (18 non-`depot/` files):** `steam/library.ts`, `steam/games.ts`, `steam/bridge/originalRestore.ts`, plus tests (`pathCollisions`, `macArchKnownFixRouting`, `library`, `games`, `removeCopies`, `reconcile`, `flagsCensus`, `depotLinktarget`, `depot`, `depot.sharedRedist`, `depot.selectedFiles`, `depot.prescreen`, `depot.finalize`, `steamStartupKeyringDeferral`, `bridge/drm/__tests__/stageDrmBottle`, `bridge/__tests__/{sharedRedistInstall,originalRestore}`). **Back-edges (the 3 D-08 names):** `depot/reconcile.ts` (2 references), `depot/pathCollisions.ts`, `depot/flagsCensus.ts` import `../depot`. Repoint each to the submodule that owns the symbol BEFORE deleting `depot.ts`, or a barrel `index.ts` would create `index -> reconcile -> index`.

**Resolution trap:** while `depot.ts` and `depot/index.ts` both exist, `'./depot'` resolves to the FILE (Node/TS/jest all try `depot.ts` before `depot/index.ts`). So `depot/index.ts` can be created and filled early with no effect, and the switch happens atomically when `depot.ts` is deleted. Plan the fold as: (1) extract submodules out of `depot.ts` one at a time with `depot.ts` temporarily importing from them; (2) final commit: create `index.ts` re-exporting the public API, delete `depot.ts`, repoint the 3 back-edges and test mocks. `jest.mock('../depot')` in the 15+ tests continues to mean "mock the public entry".

## `common/types/ipc.ts` and the flow registrations

- 945 lines. Interfaces: `SyncIPCFunctions` (lines 102-182, 60 keys), `TestSyncIPCFunctions` (190-197, 6), `AsyncIPCFunctions` (200-742, 186), `FrontendMessages` (773-938, 42). Exported at the end: `export type { SyncIPCFunctions, TestSyncIPCFunctions, AsyncIPCFunctions, FrontendMessages }` plus `SteamSyncStatus` (line 758).
- 294 key declarations, 292 unique. `refreshLibrary` is in both `AsyncIPCFunctions` and `FrontendMessages`; `connectivity-changed` in `SyncIPCFunctions` and `FrontendMessages`. D-10's "exactly one domain file" must be "exactly one domain file **per umbrella interface**".
- Name-paired owners (channels counted from `addHandler|addListener|ipcMain.handle|ipcMain.on` literals; approximate): steamAuth 28, appShell 20, shellFiles 20, enrichment 17, humble 16, gameDetails 19, wineTools 15, runnerMisc 14, settings 12, runnerAuth 11, storeEmbed 10, install 9, eosOverlay 8, shortcuts 7, logger 6, downloadQueue 5, humbleLogin 4, clipboard 3, steam 2, oauthLogin 1, dialog 1. **21 registrations; `steam` owns only 2 channels while `steamAuth` owns 28**, so D-09's `ipc/steam.ts` example is a thin file; `ipc/steamAuth.ts` is the big one.
- **64 channels have no registration owner** (e.g. `setZoomFactor`, `minimizeWindow`, `setLegendaryCommandStub`..., `get-connectivity-status`, `gamepadAction`, and all `FrontendMessages` like `gameStatusUpdate`, `launchGame`, `pushGameToLibrary`, `steamSetupDownloadProgress`). They are registered in `main.ts` / `ipc_handler.ts` files or are push-only. They need domain files that do not pair with a `*FlowRegistration.ts`: suggest `ipc/frontendMessages.ts`, `ipc/window.ts`, `ipc/testStubs.ts`, and `ipc/<runner>.ts` for legendary/gog/nile/sideload `ipc_handler`s. The census test (D-11) must therefore have two halves: (a) every registered channel is declared in its paired domain file; (b) every channel in the umbrella is declared in exactly one file per interface, and the no-owner set is an explicit allowlist (tripwire like `EXPECTED` in `flowRegistrationCensus.test.ts`).
- Regex caveat: my owner scan matched literal-first-argument calls only. The census test must use the same shape the existing `flowRegistrationCensus.test.ts` uses (it already counts `ipcMain.handle`/`ipcMain.on` per module) - reuse its parsing rather than re-deriving.
- Typed-invoke consumers: `src/preload/ipc.ts` (line 13) and `src/backend/ipc.ts` (line 10) import `AsyncIPCFunctions, SyncIPCFunctions, FrontendMessages`. Intersections keep `keyof`/indexed-access/`Parameters<...>` working. Verify with `tsc --noEmit` (`pnpm codecheck`); performance on a 294-key intersection of 25+ members is expected fine but check `tsc` time before and after [ASSUMED].

## Transport parity (D-12) - what actually mirrors what

Verified by script (37 of 48 string constants in `sidecarTransport.ts` appear as quoted literals in `src-tauri/src/*.rs`):

| TS (`common/types/sidecarTransport.ts`) | Rust location | Form |
|---|---|---|
| `READY_SENTINEL = '__GAMELIB_SIDECAR_READY__'` | `sidecar.rs:7` `const READY_SENTINEL` | named const, "Mirrors READY_SENTINEL" comment |
| `FRONTEND_MESSAGE_EVENT = 'frontend_message'` | `sidecar.rs:11` | named const |
| `SHELL_WINDOW_FOCUSED = 'shellWindowFocused'` | `sidecar.rs:16` | named const |
| `STORE_SNAPSHOT_CHANNEL = 'sidecar:store-snapshot'` | `sidecar.rs:19` | named const |
| 37x `RUST_*` channels in `RUST_INVOKE_CHANNELS` | `store_embed.rs:1810` `dispatch_rust_channel` match arms | string-literal arms (no const) |
| `SIDECAR_INVOKE/SIDECAR_SEND/OPEN_EXTERNAL/SIDECAR_STORE_SNAPSHOT` | Tauri `#[command] fn` identifiers (`relay_commands.rs`, `main.rs`) | identifiers, not strings (the 11 "misses" in my scan are these plus store-* channels that the Rust side never names) |
| `RUST_INVOKE_KIND = 'rustInvoke'` | `sidecar.rs:487` `kind == Some("rustInvoke")` | literal |
| 60s timeout | `main.rs:142` `INVOKE_TIMEOUT`; test const `RUST_INVOKE_TIMEOUT` at `main.rs:4639`; TS `RUST_INVOKE_TIMEOUT_MS` is in `sidecarRpc.ts`, NOT `sidecarTransport.ts` | out of strict scope; mention |

Consequences for the plan: (1) CONTEXT/ROADMAP say "`main.rs` mirrors"; it is `sidecar.rs` (+ `store_embed.rs`). The test should read all of `src-tauri/src/*.rs`, find constants by a marker (e.g. `// transport-mirror: READY_SENTINEL` on the line above each const), and fail if a marker's const is missing or its value differs. (2) Adding markers is a Rust-source edit (comment only); `rust-test.yml` compiles Rust, comments are safe, but run `cargo fmt --check` if the repo enforces it [ASSUMED]. (3) Also assert the set of `dispatch_rust_channel` arm strings equals `RUST_INVOKE_CHANNELS` (37) - this is the highest-value drift check because a missing arm is a runtime `rustInvoke:unknown-channel` error. Beware `main.rs:5069` area: existing Rust tests already scan this file for arms; reuse their approach (they track "which dispatch_rust_channel match arm this line is inside"). (4) There is precedent for TS-reads-Rust-text: `keyringTokenStore.test.ts` is cited in the Rust source as "independently parsing this constant out of this file".

## `launcher.ts` boundary

Direct store-manager imports today (8): `gog/setup`, `nile/setup`, `legendary/setup` (`legendarySetup`), `legendary/commands` (`LegendaryCommand`), `legendary/electronStores` (`legendaryConfigStore`), `legendary/epicOfflineMode` (`resolveEpicOfflineMode`), `gog/presence`, `legendary/eos_overlay/eos_overlay` (`isEnabled`). Also 13 runner-literal sites in `launcher.ts` itself (12 by grep). Recommended: add an optional hook object to the manager registry in `storeManagers/index.ts` (e.g. `launchHooks[runner]`: `setup`, `presence`, `offlineMode`) rather than widening `LibraryManager` (which `satisfies Record<Runner, LibraryManager>` makes every manager implement). Either is within Claude's Discretion; the dispatch-in-index option keeps the five managers untouched in the move commits. `LegendaryCommand` is a type/value import - if it is only a type, `import type` from a `common/` location is the smaller fix.

## Runner-literal inventory (first-pass classification)

Counts: see Pattern 2 table. Frontend hot files (AST prototype): `Game/GamePage/index.tsx` 8, `Library/components/GameCard/index.tsx` 6, `ConsoleMode/components/LaunchOverlay/index.tsx` 6, `GlobalState.tsx` 5, `GamePage/components/MainButton.tsx` 5, `CloudSavesSync.tsx` 5, `ConsoleMode/InstallOverlay/index.tsx` 5, `Login/components/Runner/index.tsx` 4, `InstallModal/index.tsx` 4, `GameSubMenu` 4, `GameStatus` 4, `AppleWikiInfo` 4, `SteamEngineLaunchNotice` 4. Backend: `launcher.ts` 13, `downloadmanager/utils.ts` 8, `downloadqueue.ts` 6, `gamedetails/dispatch.ts` 4, `utils.ts` 3, `protocol.ts` 3, `runnerMiscFlowRegistration.ts` 3, `steamFlowRegistration.ts` 2.

First-pass classification (representative; the per-site table is a plan deliverable per D-02):

| Site(s) | Class | Candidate flag / action |
|---|---|---|
| `downloadmanager/utils.ts:183,201` (skip install-arg / DLC handling for non-Steam), `:366-391` (`.stop()`, error status gating) | behaviour | `installManagedExternally`, `supportsDlcSelection`, `stopRequiresExplicitCall` |
| `downloadqueue.ts:156,253,387,488` (startup resume, delegated polling) | behaviour | `resumableInstall`, `installManagedExternally` |
| `gamedetails/dispatch.ts:155` (`runner==='steam' && isDelegatedInstallPolling`) | behaviour | `installManagedExternally` |
| `InstallModal/index.tsx:193`, `steamEligibilityProbe.ts:82`, `state/InstallGameModal.ts:407`, `GameCard` (`runner==='steam' && action==='install'`) | behaviour, compound | one shared predicate (e.g. `usesSteamInstallFlow(runner, action)`) per CONTEXT |
| `helpers/steamInstallOptionsEntry.ts` (5) | behaviour | already single site; reroute through the table |
| `hooks/hasStatus.ts:184`, `hooks/constants.ts:38,76`, `GameStatus.tsx:175-242`, `MainButton.tsx:69,227` | behaviour | `resumableInstall`, `installManagedExternally` |
| `filterEngine.ts:371` (`runner==='steam' && is_delisted`) | behaviour + per-game | capability `hasStorePage` AND `GameInfo.is_delisted` (do not stamp) |
| `DownloadDialog:639`, `GameSubMenu:421` (`['legendary','gog'].includes(runner)` for DLC) | behaviour | `supportsDlcSelection` |
| `ConsoleMode/LaunchOverlay:51,90,186-197`, `InstallOverlay:135,210,405` | behaviour | `launchTrackedByStore` / `installHandOffToClient` (naming is discretion) |
| `TimeContainer:55,68` (playtime source) | **identity** | `isStore(game,'steam')` |
| `CompatibilityInfo:58`, `AppleWikiInfo:35-123` (ProtonDB / compat level) | **identity** | `isStore` |
| `GamesSettings:91` (Mac Steam title), `SteamBottleSetup.ts:50`, `GamePage:230` | **identity** | `isStore` |
| `engineFilter.ts:31` (`crossoverOnly ?? runner==='steam'`) | **identity** (explicitly named in D-02) | `isStore` |
| `defaultPlatform.ts:57`, `reportProblem.ts:59` | identity | `isStore` |
| `backend/protocol.ts`, `shortcuts.ts:48` (`addSteamShortcuts && runner!=='steam'`), `wiki_game_info/*`, `crossover_index/index.ts` | identity | `isStore` |

Treat this as a hypothesis table. Sites change class once the surrounding comment (decision IDs like D-27/D-28/REQ-37-02) is read. Do not drop those comments.

## Common Pitfalls

### Pitfall 1: "Pure move" is impossible for class methods
**What goes wrong:** D-06/D-05 assume extractable symbols. `launch`, `install`, `uninstall` are methods of one class that call each other via `this.*` and read `private readonly appId`.
**How to avoid:** Split the work into two kinds of commit, named honestly in the plan: (A) true pure moves for free functions/state/types (requirements, DRM, session state, eligibility predicates) - diff is paths only. (B) "mechanical lift" commits for method clusters: `this.appId` -> `appId` parameter, `this.helper(` -> `helper(appId, ` with helpers exported from the same new module; no logic edits, no reorder. State the oracle for B: `tsc` clean, `games.test.ts` unchanged and green, and a `git diff --color-moved=zebra` review. Get the user's agreement on this reading (Open Question 1) because D-06 literally says "move plus import-path edits only". An alternative that keeps `this.` byte-identical is an inheritance chain (`SteamGameBase` <- `SteamGameInstall` <- `SteamGame`), but eligibility is called by install, launch AND uninstall and launch calls install-cluster helpers, so a chain forces an arbitrary linear order; not recommended.
**Warning signs:** a move diff that touches function bodies beyond `this.` rewrites.

### Pitfall 2: Circular imports from extraction
**What goes wrong:** the new `launch` module needs `getGameInfo`, eligibility checks and session state that currently sit on the class or in `games.ts`; if launch imports `games.ts` for them while `games.ts` imports launch, you get a cycle (jest then yields `undefined` for a `jest.mock`ed binding, a silent failure).
**How to avoid:** extract leaves first in this order: `sessionState.ts` (Maps/Sets, no deps) -> `requirements.ts` -> `drm*` -> eligibility predicates (take `appId`/`GameInfo` args, import `library`/`state` leaf modules, never `games`) -> launch/install/uninstall. `games.ts` imports downward only. Add a depcruise rule `no-circular` scoped to `steam/` (depcruise has a built-in `circular` condition) as part of Plan 1 so the split cannot regress; baseline the current cycles first.
**Warning signs:** `ReferenceError: Cannot access ... before initialization`, or tests where a mocked function is suddenly `undefined`.

### Pitfall 3: Module-level state duplicated by an incorrect move
**What goes wrong:** `bridgeFailedThisSession` etc. exist once per module instance; if both `launch.ts` and `install.ts` declare their own, behaviour silently forks. Also jest module registry: each `jest.mock` factory returns a fresh object per test file.
**How to avoid:** move each Map/Set exactly once into `sessionState.ts` and import it; repoint the `__reset*ForTests` exports with it.

### Pitfall 4: `depot.ts` vs `depot/` resolution and the 3 back-edges
See Cluster Map. Also esbuild bundling (sidecar SEA) resolves the same way; verify with `pnpm build:sidecar-sea` and `pnpm smoke:sidecar` after the fold, and keep `lzmaNativeResolvedPaths.generated.cjs` where its generator expects it.

### Pitfall 5: The literal-ban selector decides the number
`runner === 'steam'` is not the only shape: `['legendary','gog'].includes(runner)`, `switch (runner)` (6 non-test sites), `x.runner !== 'sideload'`, template literals, object-literal dispatch maps keyed by runner (allowed) and `runner: 'steam'` property values in fixtures (allowed). A selector too narrow reaches "zero" while the pattern survives; too wide flags `store`-named variables unrelated to runner. Settle the selector with the ESLint `RuleTester`-style unit test in `meta/__tests__/boundaryRatchet.test.ts` covering each shape (hit and non-hit), BEFORE recording the baseline. Add `// eslint-disable-next-line` handling policy: the sanctioned home for the comparison is `common/storeCapabilities.ts` (path-ignored), no inline disables elsewhere.

### Pitfall 6: Adding the rule to `eslint.config.mjs` early
It would flow into `lintScoped.cjs` counts and `pnpm lint` ceilings (SRC 1130 is already hand-bumped repeatedly, see its header). Keep the rule only in the dedicated script until zero.

### Pitfall 7: Ceiling-number staleness
`lintScoped.cjs` only fails on `>`; the project's own history ("N-1 must be RED and N GREEN") shows ceilings drifting loose. For D-14 ("count in the repo always matches what the plan claims") fail on `!=` for the ESLint ratchet (and `shrink-only` for depcruise, which also errors on stale entries in the baseline check output - confirm).

### Pitfall 8: Hook/CI wiring edits break meta tests
`.husky/pre-push` line 2 is cited by `meta/__tests__/tsconfigMeta.test.ts:94` and `codecheck` is asserted by regex there. Add `pnpm boundaries` to `.github/workflows/lint.yml` as its own step, and to line 2 of pre-push by appending `&& pnpm boundaries` without reflowing lines; run the meta jest project afterwards. There is also `ciTriggerWiring.test.ts` in `meta/__tests__` - read it before editing workflow files.

### Pitfall 9: Stale sidecar during live smoke
Per the project memory note, `tauri dev` does not rebuild the sidecar. Restart `pnpm tauri:dev` (not `:run`, per memory note) and check `sidecar.js` mtime before each D-17 smoke; a fresh worktree needs `build:sidecar-sea` + vite build first.

## Code Examples

### Ratchet script skeleton (model: `meta/lintScoped.cjs`)
```js
// meta/boundaryRatchet.cjs  (plain CJS, prettier-clean by hand; eslint config ignores .cjs)
'use strict'
const { ESLint } = require('eslint')
const CEILINGS = { frontend: 122, backend: 63 }   // numbers set in Plan 1 from the ratified selector
async function main() {
  const tsParser = require('@typescript-eslint/parser')  // verify resolvable from repo root under pnpm (my scratch run needed dist/index.js; use require('typescript-eslint').parser if present)
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ['**/*.ts','**/*.tsx'], languageOptions: { parser: tsParser }, rules: { 'no-restricted-syntax': ['warn', ...SELECTORS] } }], errorOnUnmatchedPattern: false })
  // count messages by scope; fail on count !== ceiling; fail on files < minFiles
}
```
Note on resolving the parser: in this session `require('@typescript-eslint/parser')` by directory path failed and `.../parser/dist/index.js` worked. In the repo, `eslint.config.mjs` already imports `typescript-eslint`; the `.cjs` script should `await import('typescript-eslint')` or reuse the repo config via `overrideConfigFile: 'eslint.config.mjs'` plus an `overrideConfig` that adds only the new rule (cheaper to maintain, but then the type-checked project parse makes it slow - measure).

### depcruise invocation + baseline
```bash
depcruise --config .dependency-cruiser.cjs --output-type err-long --ignore-known src/backend
depcruise --config .dependency-cruiser.cjs --baseline --baseline-mode shrink-only src/backend   # lower the baseline
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `depcruise-baseline` binary | `dependency-cruiser --baseline` (+ `--baseline-mode shrink-only`) | 18.3.0 | Use the flag; the binary is a deprecated alias [CITED: doc/cli.md] |

**Deprecated/outdated:** `depcruise-baseline` (alias only).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | dependency-cruiser rule key names (`forbidden`, `from.pathNot`, `$1` back-reference in `to.pathNot`, `tsPreCompilationDeps`, `options.tsConfig.fileName`) are as sketched | Pattern 1 | Config fails to load or rule matches nothing; verify against `doc/rules-reference.md` and a seeded-violation test in Plan 1 |
| A2 | dependency-cruiser is legitimate (slopcheck not run) | Package Legitimacy | Supply-chain; planner adds `checkpoint:human-verify` |
| A3 | `shrink-only` baseline mode also surfaces stale entries | Pitfall 7 | A stale baseline lets a violation be re-added silently; add a test that seeds a violation |
| A4 | A 25+-member intersection for the IPC umbrella types has negligible `tsc` cost | IPC section | Slower codecheck; measure before/after |
| A5 | `cargo fmt --check` / Rust CI tolerate comment-only marker additions | Parity | Rust CI red; run `rust-test.yml` equivalent locally |
| A6 | Classification table sites are behaviour vs identity as guessed from one-line context | Inventory | Wrong flag shape; planner must read each site's comment before converting |
| A7 | Cross-manager production count is 0 and test count 12 (script-derived, not tool-derived) | Baselines | depcruise may count `import type` or dynamic imports differently; Plan 1 records the tool's own number |

## Open Questions (RESOLVED)

1. **Is a `this.`-to-parameter lift acceptable under D-06 "pure move"?**
   - Known: the launch/install/uninstall bodies are class methods; ~600 `this.` uses.
   - Unclear: whether the user reads "pure move" as byte-identical.
   - **RESOLVED (user ruling 2026-11-06):** mechanical lift allowed. Free code moves byte-for-byte (62-05); class-method clusters are lifted by `this` -> `steamGame` in their own commits (62-06..62-08, THE LIFT RECIPE L1-L10 in 62-06-PLAN.md). Oracle: tsc, byte-unchanged `games.test.ts`, `git diff --color-moved`.
2. **Should the depcruise rules start at `error` + baseline, or `warn`?** **RESOLVED (user ruling 2026-11-06):** `error` from day one with a shrink-only known-violations baseline (62-01), superseding the roadmap's warn-only wording; a CI test also fails on a stale baseline entry. ROADMAP says warn-only, D-14 says ceiling that only goes down. Recommend `error` + known-violations file (strictly safer, equivalent ceiling). The cross-manager rule's production baseline is 0, so it can be `error` with an empty baseline and no ceiling at all from day one; only test-file edges (12) and the `launcher.ts` imports (8) need baselining (or exempt `__tests__` from the cross-manager rule per Discretion).
3. **Do test files fall under the literal ban?** **RESOLVED (planner, 62-02):** exempt `__tests__`, `__mocks__`, `*.test.ts(x)`, `src/backend/jest.setup*.ts`, `*.d.ts`; test files are also exempt from `no-cross-store-manager` (62-01). Counts: 5 frontend + 6 backend. Recommend exempt `__tests__`/`__mocks__` (fixtures set `runner: 'steam'` legitimately), document in the rule comment.
4. **Does `humble` belong in the runner ban?** **RESOLVED (planner, 62-02/62-13):** yes. Literal set steam/gog/legendary/nile/sideload/humble, compared against any name matching `^(runner|store)$|[a-z0-9]Runner$|[a-z0-9]Store$` (widened after plan check); `StoreKey = Runner | 'humble'` for `isStore`. `Runner` has no `'humble'`; humble literals compare other fields. D-03 says every runner literal; define the selector's name set (`runner` only vs `runner|store`).
5. **Where do the 64 owner-less channels live (D-09)?** **RESOLVED (planner, 62-11):** unpaired domain files (`window`, `testStubs`, `mainProcess`, per-runner) by handler location; FrontendMessages by sender path; the census test's `NO_REGISTRATION_OWNER` allowlist is the tripwire. Recommend dedicated non-paired domain files and an allowlist in the census test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | yes | v22.23.4 | - |
| eslint | literal ratchet | yes (repo) | ^9.29.0 | - |
| typescript | codecheck | yes (repo) | ^5.8.3 | - |
| dependency-cruiser | boundary rules | no (not in repo; install blocked in this session) | target 18.7.2 | none; install is Plan 1, gated by human-verify |
| slopcheck | package audit | no | - | `[ASSUMED]` tagging + human-verify |
| cargo / Rust toolchain | marker comments only (compile check) | not probed | - | parity test itself needs none (D-12) |
| macOS + CrossOver + Steam titles | D-17 live smoke | operator machine | - | none; manual UAT |
| graphify | orientation | yes (repo graph) | - | - |

**Missing with no fallback:** none blocking. **Missing with fallback:** dependency-cruiser (install in Plan 1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest (ts-jest), multi-project: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`, `relay` (`jest.config.js`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js`, `meta/jest.config.js` |
| Quick run command | `npx jest --selectProjects <Project> --runTestsByPath <paths>` (e.g. `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts`) |
| Full suite command | `pnpm test:ci` (plus `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode`, `pnpm prettier`) |

### Phase Requirements -> Test Map
| Req (decision) | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-13/D-14 graph | seeded cross-manager import and seeded `launcher.ts -> gog/setup` import are rejected; baseline cannot grow | meta jest (spawn depcruise with `createFakeHomeProfile()` env per convention, or call its API) | `npx jest --selectProjects Meta meta/__tests__/boundaryGates.test.ts` | Wave 0 |
| D-13/D-14 literal | selector hits each shape (`===`, `!==`, `switch`, `.includes`), misses allowed forms; count == ceiling | meta jest | `npx jest --selectProjects Meta meta/__tests__/boundaryRatchet.test.ts` | Wave 0 |
| D-14 CI | gate runs in lint.yml and pre-push | meta jest (model: `ciTriggerWiring.test.ts`, `findDeadcode.test.ts`) | `npx jest --selectProjects Meta meta/__tests__/boundaryWiring.test.ts` | Wave 0 |
| D-01 | every Runner declares every flag; table drives Library/DownloadQueue decisions | unit (common) + tsc | `npx jest src/common/__tests__/storeCapabilities.test.ts` and `pnpm codecheck` | Wave 0 |
| D-02/D-03/D-04 | no raw literal remains (count 0, rule at `error`) | `node meta/boundaryRatchet.cjs` then `pnpm lint` | `pnpm boundaries` | Wave 0 |
| D-05..D-08 | importers/mocks target owners; no `games.ts` re-export of moved symbols | existing `games.test.ts` (16k lines) + `depot*.test.ts` + a small "no re-export" grep test | `npx jest src/backend/storeManagers/steam` | exists / add re-export guard |
| D-08 | no `depot/*` -> `../depot` back-edge; `no-circular` clean in `steam/` | depcruise rule | `pnpm boundaries` | Wave 0 |
| D-09..D-11 | each channel declared once per interface; registrations' channels declared in paired domain file | backend jest (model `flowRegistrationCensus.test.ts`) | `npx jest src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | Wave 0 |
| D-12 | TS constants == marked Rust consts; `RUST_INVOKE_CHANNELS` == `dispatch_rust_channel` arms | backend jest reading `src-tauri/src/*.rs` | `npx jest src/backend/sidecar/__tests__/transportParity.test.ts` | Wave 0 |
| D-17 | Steam-only controls only on Steam games | live macOS UAT | manual: `pnpm tauri:dev` after sidecar rebuild | n/a (manual-only, justified: no automated surface renders the real store controls end-to-end; a UAT file per `Skill("gamelib-conventions")` item shape) |

### Sampling Rate
- **Per task commit:** the touched file's jest test + `pnpm codecheck` (tsc) + `npx prettier --check <exact paths>` (per convention; check `--file-info` first) 
- **Per wave merge:** `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode` (moving exports changes `find-deadcode` baselines `meta/deadcode-baseline-*.txt`; expect to update them in the same commit)
- **Phase gate:** full suite green, `pnpm boundaries` zero at `error`, then D-17 second smoke before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `meta/__tests__/boundaryRatchet.test.ts`, `boundaryGates.test.ts`, `boundaryWiring.test.ts`
- [ ] `src/common/__tests__/storeCapabilities.test.ts`
- [ ] `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts`, `transportParity.test.ts`
- [ ] `pnpm add -D dependency-cruiser@18.7.2` behind `checkpoint:human-verify`
- [ ] `find-deadcode` interplay: every moved/exported symbol can shift `deadcode-baseline-unreachable.txt` / `-used-in-module.txt`; budget for baseline edits in each move commit

## Security Domain

`security_enforcement` is not set to false; the phase is a refactor with no new trust boundary, input path or secret handling.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Steam auth code is moved, not changed) | - |
| V3 Session Management | no | - |
| V4 Access Control | no | - |
| V5 Input Validation | no new input; moving `parse*Requirement` and depot path-containment code (`resolveContainedPath`, `PathTraversalError`) must not alter it | keep bodies identical; `depot.test.ts` covers traversal |
| V6 Cryptography | no | `depot/crypto.ts` untouched |
| V14 Config / supply chain | yes | pin `dependency-cruiser` exactly; human-verify before install; `--ignore-scripts` unnecessary (no postinstall) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Typosquatted dev dependency | Tampering | exact pin + human-verify + lockfile review |
| Gate silently collapsing to zero files (green because nothing linted) | Repudiation | `minFiles` floor, as in `lintScoped.cjs` |
| Child-process test of depcruise inheriting a real profile | Info disclosure | `createFakeHomeProfile()` per conventions |
| Moving log/redaction code out of `games.ts` | Info disclosure | `logSecretGate.ts` (meta) stays green; run it after DRM/launch moves |

## Sources

### Primary (HIGH confidence)
- Repo first-hand: `eslint.config.mjs`, `meta/lintScoped.cjs`, `jest.config.js`, `.github/workflows/lint.yml`, `.husky/pre-push`, `src/common/types/{ipc,sidecarTransport,game_manager}.ts`, `src/backend/storeManagers/{index.ts,steam/games.ts,steam/depot.ts}`, `src-tauri/src/{main,sidecar,store_embed}.rs`, `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`, `src/frontend/helpers/steamInstallOptionsEntry.ts`
- https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md - `--baseline`, `--baseline-mode shrink-only`, `--ignore-known`, `.dependency-cruiser-known-violations.json`, severity/exit behaviour, `--ts-config`/`tsConfig`
- `npm view dependency-cruiser` - version 18.7.2, modified 2026-11-02, node engines, repository

### Secondary (MEDIUM confidence)
- Scripted measurements (cross-manager scan, ESLint AST prototype, IPC channel/owner scan) - reproducible but not the final tools

### Tertiary (LOW confidence)
- depcruise rule-key details (A1) - from training, needs a seeded-violation check

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - tool version verified, install/slopcheck blocked, rule syntax unverified
- Architecture / cluster maps: HIGH - read directly from source
- Pitfalls: HIGH for class-method and ceiling pitfalls (observed), MEDIUM for resolution/cycle ones (reasoned)
- Baseline counts: MEDIUM - depcruise numbers are script-derived; ESLint numbers are from a prototype selector

**Research date:** 2026-11-06
**Valid until:** ~2026-12-06 (counts drift with every commit; re-measure in Plan 1)
