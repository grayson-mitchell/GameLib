# Bucket B classification — 260922-vzw

## Derivation

Re-derived at HEAD `b61bd6677052854eebecc7d7fdacdf6908a06df1` by `require`-ing
`meta/findDeadcode.cjs`'s own exported helpers (`collectFindings` -> `parseFinding` ->
`excludeKnownParseArtifacts` -> `partitionFindings`), from a throwaway script in the session
scratchpad (never committed):

```
unreachable: 47
usedInModule: 67
tracked search-corpus files (git ls-files '*.ts' '*.tsx' '*.cjs' '*.mjs' '*.js' '*.json' '*.yml' '*.rs'): 1696
```

Matches the plan's expected census exactly (`unreachable 47`, `usedInModule 67`, meta 39 / src 28,
B=64 + parked 4 = 67 as reconciled in the pending todo). `pnpm find-deadcode` at HEAD before this
task's first edit: `unreachable: 47 OK | used-in-module: 67 OK`.

## Method

For every one of the 67 entries: comment-stripped whole-word search across all 1696 tracked
files, then for every hit the ACTUAL line was opened (not trusted from the grep alone) to
determine whether it is a real static import, a `require()`/`jest.requireActual()` destructure
(invisible to ts-prune's reference search, since `require()` returns `any` and defeats static
symbol resolution), a source-text/marker string a test depends on literally, a prose comment, or a
separately-declared same-named local/import from a different module. Both "contended" (has some
hit) and "clean" (zero hits) candidates were opened per the todo's own lesson that a grep-only
pass is wrong in both directions.

Two invisible-consumer mechanisms are in play, not one:

1. **tsconfig scope** — `meta/` is not in `tsconfig.json`'s `include`, so an import FROM a
   `meta/__tests__/*.test.ts` file or another non-analysed `meta/*.ts` production script is
   invisible to ts-prune regardless of which side of the `src/`/`meta/` line the declaration sits
   on (measured precedent: `FakeHomeEnvKey`, declared in `src/`, consumed only from `meta/`).
2. **require()/requireActual() opacity** — even entirely inside `src/` (fully in-scope), a
   `require('../module')` or `jest.requireActual('../module')` destructure is invisible to
   ts-prune's reference search because TypeScript types the return of `require` as `any`; there is
   no static symbol link for the checker to walk. Measured this task: `containmentRoot`,
   `deliverStartupProtocolUrl`, `translateStoreOptions`.

A third, distinct shape recurred across both `meta/` and `src/`: a **file that imports a symbol
and immediately re-exports it** (`export { ... }` specifier list, or `export type { X }`) so its
OWN body can keep using the unqualified name. ts-prune reports the re-exporting file as the
"declaring" file. Six of these live in one block at `meta/buildSidecarSea.ts:159-166` (the in-situ
comment there explains why: `meta/buildDecompressWorkerDev.ts` needed the four helpers WITHOUT
importing `buildSidecarSea.ts` directly, since merely importing it runs a real SEA build as a
module-scope side effect). The remedy for a re-export with NO external consumer of the re-export
itself is to drop it from the `export { }` list only — the underlying `import` stays, because the
file's own body still uses it. That is UNEXPORT applied to a re-export rather than to a
declaration; verified per-entry below, not assumed uniform across the six.

## Verdicts — meta/ (39: 37 bucket B + 2 parked)

| identity | verdict | consumer evidence | tests to run |
|---|---|---|---|
| meta/buildRunnersOnedir.ts - InvocationForm | IGNORE (parked) | `meta/runnerBuildInvocations.ts:62` — `import type { InvocationForm, OnedirRunnerName } from './buildRunnersOnedir'` (production, non-test, meta-scope invisible to ts-prune) | `meta/__tests__/runnerBuildInvocations.test.ts` |
| meta/buildRunnersOnedir.ts - ONEDIR_RUNNERS | IGNORE | `meta/checkRunnerInvocations.ts:60` (production) + `meta/__tests__/buildRunnersOnedir.test.ts:22` + `meta/__tests__/runnerBuildInvocations.test.ts:18` | `meta/__tests__/buildRunnersOnedir.test.ts`, `meta/__tests__/runnerBuildInvocations.test.ts` |
| meta/buildRunnersOnedir.ts - OnedirRunnerName | IGNORE | `meta/checkRunnerInvocations.ts:60` (production, type import) + `meta/runnerBuildInvocations.ts:62` (production, type import) + `meta/__tests__/runnerBuildInvocations.test.ts:18` | `meta/__tests__/runnerBuildInvocations.test.ts` |
| meta/buildRunnersOnedir.ts - RunnerBuildResult | IGNORE | `meta/__tests__/buildRunnersOnedir.test.ts:22` (type import) only | `meta/__tests__/buildRunnersOnedir.test.ts` |
| meta/buildRunnersOnedir.ts - buildManifestObject | IGNORE | `meta/__tests__/buildRunnersOnedir.test.ts:22` only | `meta/__tests__/buildRunnersOnedir.test.ts` |
| meta/buildRunnersOnedir.ts - deriveOnedirInvocation | IGNORE | `meta/__tests__/buildRunnersOnedir.test.ts:22` only | `meta/__tests__/buildRunnersOnedir.test.ts` |
| meta/buildRunnersOnedir.ts - extractUpstreamPyinstallerCommand | IGNORE | `meta/checkRunnerInvocations.ts:60` (production) + tests | `meta/__tests__/buildRunnersOnedir.test.ts`, `meta/__tests__/runnerBuildInvocations.test.ts` |
| meta/buildRunnersOnedir.ts - formatSha256Sums | IGNORE | `meta/__tests__/buildRunnersOnedir.test.ts:22` only | `meta/__tests__/buildRunnersOnedir.test.ts` |
| meta/buildRunnersOnedir.ts - main | **UNEXPORT** | Zero importers anywhere (repo-wide grep for `require(...buildRunnersOnedir...)` and `from '...buildRunnersOnedir'` naming `main` — none). Only self-invoked at the file's own bottom guard (`if (!process.env.JEST_WORKER_ID && ...) { main().catch(...) }`, line ~1013) — that is what makes it "used in module" rather than unreachable. | `meta/__tests__/buildRunnersOnedir.test.ts` |
| meta/buildSidecarSea.ts - DECOMPRESS_WORKER_ENTRY_PATH | IGNORE (parked) | Re-export (`buildSidecarSea.ts:159-166`) of `meta/esbuildWorkerBundleShared.ts:31`; used internally in `buildSidecarSea.ts` at lines 421, 762, 764. Per `<decision>`, kept exported with `ts-prune-ignore-next`; export-list placement caveat applies (see Task 2 note below). | `meta/__tests__/buildSidecarSea.test.ts`, `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/buildSidecarSea.ts - NATIVE_LZMA_REQUIRED_TRIPLES | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:24` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - SEA_WORKER_ASSET_KEY | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:22` only. `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts:724` is a prose test-title mention ("same literal buildSidecarSea.ts exports as SEA_WORKER_ASSET_KEY"), not an import — `decompressPool.ts` declares its OWN local `SEA_WORKER_ASSET_KEY` constant. | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - assertNodeGypBuildSingleConsumer | **UNEXPORT** (re-export list only; import stays) | Re-export at `buildSidecarSea.ts:155/164`, used internally at line 777. No file imports it FROM `buildSidecarSea` (only `meta/__tests__/buildSidecarSea.test.ts`'s import list was checked — absent). Real consumers (`meta/buildDecompressWorkerDev.ts:71`, `meta/__tests__/esbuildWorkerBundleShared.test.ts:27`) import it directly from `./esbuildWorkerBundleShared`, not via this re-export. | `meta/__tests__/buildSidecarSea.test.ts`, `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/buildSidecarSea.ts - buildCodesignArgv | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:18` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - buildEsbuildArgv | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:19` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - buildPostjectArgv | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:17` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - buildSeaBlobArgv | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:16` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - buildSeaConfig | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:21` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - buildWorkerEsbuildArgv | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:20` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - expectedMachoArch | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:33` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - hostTriple | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:28` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - lzmaNativePrebuildDir | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:25` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - lzmaNativePrebuildPath | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:26` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - main | **UNEXPORT** | Zero importers anywhere. Only self-invoked at the file's own bottom guard (`if (!process.env.JEST_WORKER_ID) { main().catch(...) }`, line 1108). | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - nodeDistName | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:34` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - nodeDistUrls | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:35` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - resolveEsbuildCli | IGNORE | Re-export, consumed by `meta/__tests__/buildSidecarSea.test.ts:30` which imports it BY NAME from `'../buildSidecarSea'` (the re-export path itself) | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - resolvePostjectCli | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:31` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - resolveTriple | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:29` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - seaEsbuildFlags | **UNEXPORT** (re-export list only; import stays) | Same shape as `assertNodeGypBuildSingleConsumer`: no consumer of the re-export; real consumers (`meta/buildDecompressWorkerDev.ts:69`, `meta/esbuildWorkerBundleShared.ts:289`) go through `esbuildWorkerBundleShared.ts` directly. | `meta/__tests__/buildSidecarSea.test.ts`, `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/buildSidecarSea.ts - sidecarOutputPath | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:27` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - spawnArgv | **UNEXPORT** (re-export list only; import stays) | Same shape: no consumer of the re-export from `'../buildSidecarSea'`; real consumers (`meta/buildDecompressWorkerDev.ts:70`, `meta/buildRunnersOnedir.ts:514/543/771`, `meta/buildSteamBridgeShims.ts`) import their own local `spawnArgv` copies or go through `esbuildWorkerBundleShared.ts` directly — none names `'../buildSidecarSea'`. | `meta/__tests__/buildSidecarSea.test.ts`, `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/buildSidecarSea.ts - triplePlatform | IGNORE | `meta/__tests__/buildSidecarSea.test.ts:32` only | `meta/__tests__/buildSidecarSea.test.ts` |
| meta/buildSidecarSea.ts - writeLzmaNativeResolvedPaths | **UNEXPORT** (re-export list only; import stays) | Same shape: real consumers (`meta/buildDecompressWorkerDev.ts:72`, `meta/esbuildWorkerBundleShared.ts:121`) go through `esbuildWorkerBundleShared.ts` directly; `meta/__tests__/esbuildWorkerBundleShared.test.ts:25` imports it from `'../esbuildWorkerBundleShared'`, not from `buildSidecarSea`. | `meta/__tests__/buildSidecarSea.test.ts`, `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/esbuildWorkerBundleShared.ts - LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH | IGNORE | `meta/__tests__/esbuildWorkerBundleShared.test.ts:23` only | `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/esbuildWorkerBundleShared.ts - findOtherNodeGypBuildConsumers | IGNORE | `meta/__tests__/esbuildWorkerBundleShared.test.ts:26` only | `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/esbuildWorkerBundleShared.ts - resolveLzmaNativePkgRoot | IGNORE | `meta/__tests__/esbuildWorkerBundleShared.test.ts:24` only. `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts:144` declares its OWN separate, module-private `function resolveLzmaNativePkgRoot()` — same name, no import — coincidental local, not a consumer. | `meta/__tests__/esbuildWorkerBundleShared.test.ts` |
| meta/releaseTags.ts - DownloadedBinary | IGNORE (parked) | `meta/downloadHelperBinaries.ts:15` — `import { ... type DownloadedBinary } from './releaseTags'` (production, meta-scope invisible to ts-prune) | `meta/__tests__/downloadHelperBinaries.test.ts` |
| meta/signMachOResources.ts - main | **UNEXPORT** | Zero importers anywhere. Only self-invoked at the file's own bottom guard (`if (!process.env.JEST_WORKER_ID) { main().catch(...) }`, line 492). | `src/backend/__tests__/signMachOResources.test.ts` |

## Verdicts — src/ (28: 27 bucket B + 1 parked)

| identity | verdict | consumer evidence | tests to run |
|---|---|---|---|
| src/backend/humble/loginWindowSeam.ts - LoginWindowRevealPostResult | **UNEXPORT** | Zero hits anywhere in the repo (whole-word, comment-stripped, all 1696 tracked files). Used only as the return type of `LoginWindowSeam.revealPost` within the same file. | (none named; run the loginWindowSeam suite if one exists) |
| src/backend/ipc.ts - addOneTimeListener | **UNEXPORT** | Only hit: `src/backend/sidecar/__tests__/wineToolsFlows.test.ts:235/541`, a `jest.doMock('../../ipc', () => ({ addOneTimeListener: jest.fn(), ... }))` mock-object property name — coincidental, not an import of the real symbol. No file imports `addOneTimeListener` from `ipc.ts` (only prose comments in `appShellFlowRegistration.ts` mention it). | `src/backend/sidecar/__tests__/wineToolsFlows.test.ts` |
| src/backend/jest.setupContainment.ts - containmentRoot | IGNORE | `src/backend/__tests__/jestGlobalSetup.test.ts:349` — `const { containmentRoot } = require('../jest.setupContainment')`, then read and asserted on at lines 351-353. `require()`'s return type is `any`, so this reference is invisible to ts-prune despite both files being in `tsconfig` `include`. | `src/backend/__tests__/jestGlobalSetup.test.ts` |
| src/backend/sidecar/bootstrap.ts - deliverStartupProtocolUrl | IGNORE | `src/backend/sidecar/__tests__/bootstrapWirings.test.ts:253` — `const { init, deliverStartupProtocolUrl } = require('../bootstrap')`, then actually CALLED at line 500 (`deliverStartupProtocolUrl(['--no-gui', testUrl])`). Same require()-opacity mechanism. | `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` |
| src/backend/sidecar/bootstrap.ts - registerProtocolUrlHandler | **UNEXPORT** | NOT among the names destructured from the `require('../bootstrap')` call (only `init`, `deliverStartupProtocolUrl` are). All hits in `bootstrapWirings.test.ts` are source-text/string-content checks (`initBody.toContain('registerProtocolUrlHandler()')` — a call-site text check, indifferent to the `export` keyword). | `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` |
| src/backend/sidecar/humbleFlowRegistration.ts - isPackagedSidecar | **UNEXPORT** (re-export list only; import stays) | Re-export (`import { isPackagedSidecar } from './isPackagedSidecar'` then `export { isPackagedSidecar }`, lines 148-149), used internally at line 331. `src/backend/sidecar/__tests__/devSecretVault.test.ts`'s in-situ comment (line 76) confirms the mock was explicitly "repointed... from `'../humbleFlowRegistration'` to `'../isPackagedSidecar'`" — the mock now targets `'../isPackagedSidecar'` directly (line 84), not this re-export. `src/backend/sidecar/__tests__/humbleFlows.test.ts`'s `require('../humbleFlowRegistration')` destructures only `registerHumbleFlows`, never `isPackagedSidecar`. No other importer of this re-export exists. | `src/backend/sidecar/__tests__/devSecretVault.test.ts`, `src/backend/sidecar/__tests__/humbleFlows.test.ts`, `src/backend/sidecar/__tests__/isPackagedSidecar.test.ts` |
| src/backend/sidecar/oauthLoginCapture.ts - resolveUserAgent | **UNEXPORT** | Only hit: `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts:701`, a `describe(...)` title string ("resolveUserAgent — diagnostic UA override, exercised via captureOAuthLogin") — the test exercises it indirectly through `captureOAuthLogin`, never imports it. Used internally at line 325. | `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts` |
| src/backend/storeManagers/steam/depot.ts - FILE_CONCURRENCY | **UNEXPORT** | Zero hits anywhere outside its own declaring file. | (none named) |
| src/backend/storeManagers/steam/depot/decompress.ts - DECODE_STAGE_ERROR_CODES | **UNEXPORT** | Only hit: `src/backend/storeManagers/steam/__tests__/depot.test.ts:3111`, a code comment (`err.code = 'unknown_container' // one of DECODE_STAGE_ERROR_CODES`) — comment only, not an import. | `src/backend/storeManagers/steam/__tests__/depot.test.ts` |
| src/backend/storeManagers/steam/depot/decompress.ts - wantsCdnAuthToken | **UNEXPORT** | Zero hits anywhere outside its own declaring file (all other mentions are comments within the same file). | (none named) |
| src/backend/storeManagers/steam/depot/stallTracker.ts - STALL_TIMEOUT_MS | **UNEXPORT** | Zero hits anywhere outside its own declaring file. | (none named) |
| src/backend/storeManagers/steam/electronStores.ts - SteamBottleConfig | **UNEXPORT** (re-export; import stays) | Re-export (`import type { SteamBottleConfig } from 'common/types/steam'` then `export type { SteamBottleConfig }`, line 148), used internally at line 101. All three hits (`src/common/types/electron_store.ts`, `src/common/types/ipc.ts`, `src/common/types/steam.ts`) import `SteamBottleConfig` directly from `common/types/steam` (the ORIGINAL declaration), never from `storeManagers/steam/electronStores.ts`. | (none named; run `pnpm codecheck`) |
| src/backend/storeManagers/steam/installLocation.ts - SteamInstallTarget | **UNEXPORT** | Zero hits anywhere outside its own declaring file; used only as `resolveSteamInstallTarget`'s own return type in the same file. | (none named; run `pnpm codecheck`) |
| src/backend/store_backend.ts - translateStoreOptions | IGNORE | `src/backend/__tests__/cache.test.ts:115` — `const { translateStoreOptions } = jest.requireActual('../store_backend')`, then CALLED at line 123 and asserted at line 252. `jest.requireActual` has the same any-typed opacity as `require()`. | `src/backend/__tests__/cache.test.ts` |
| src/backend/testUtils/fakeHomeProfile.ts - FakeHomeEnvKey | IGNORE (parked) | `meta/captureShellScrollback.ts:71-72` imports it, used at line 596. That file is only ever spawned, never imported — outside the analysed project. | `src/backend/__tests__/shellDiagPersistence.test.ts` |
| src/common/types/storePolicy.ts - ValidStoreName | **UNEXPORT** (re-export; import stays) | Re-export (`import type { ValidStoreName } from './electron_store'` then `export type { ValidStoreName }`, line 419), used internally throughout the file. All three hits (`src/backend/electron_store.ts`, `src/frontend/helpers/electronStores.ts`, `src/common/types/__tests__/storePolicy.test.ts`) import `ValidStoreName` from `common/types/electron_store` (the ORIGINAL declaration, `src/common/types/electron_store.ts:182`), never from `storePolicy.ts`. `src/backend/sidecar/__tests__/testContainment.test.ts:1501` is a comment. | (none named; run `pnpm codecheck`) |
| src/common/types/storePolicy.ts - WRITE_DENIED_FIELDS | **UNEXPORT** | Zero hits anywhere outside its own declaring file. | (none named) |
| src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx - StoreEmbedSuppressionContext | **UNEXPORT** | Heavy import traffic (App.tsx, Dialog.tsx, Dropdown, HumbleExpiryToast, WebView, TourContext, 2 test files) — but every one of them imports `StoreEmbedSuppressionProvider`, `useSuppressStoreEmbed`, `useSuppressStoreEmbedWhile`, or `useStoreEmbedSuppressed`, never the raw `StoreEmbedSuppressionContext` object itself by that name. The two `meta/i18n*.json` hits are filenames in a manifest list, not export names. Used internally at lines 160, 162, 168, 193, 213 of the same file. | `src/frontend/components/UI/NavShell/__tests__/StoreEmbedSuppressionContext.test.tsx`, `src/frontend/components/UI/NavShell/__tests__/useSuppressStoreEmbedWhile.test.tsx`, `src/frontend/components/UI/Dialog/__tests__/dialogStoreEmbedSuppression.test.ts` |
| src/frontend/components/UI/NavShell/Tier2PortalContext.tsx - Tier2PortalValue | **UNEXPORT** | Zero hits anywhere outside its own declaring file. | (none named) |
| src/frontend/components/UI/ThemeSelector/index.tsx - resolveThemeLabel | **UNEXPORT** (re-export; import stays) | Re-export (`import { defaultThemes, resolveThemeLabel } from './themeLabels'` then `export { defaultThemes, resolveThemeLabel }`, line 11), used internally at line 67. `src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx` imports `resolveThemeLabel` directly from `'../themeLabels'` (the original declaration), never from `index.tsx`. No other consumer anywhere. | `src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx` |
| src/frontend/screens/Library/filterEngine.ts - passesMore | **UNEXPORT** | Only hit: `src/frontend/screens/Library/__tests__/filterEngine.test.ts:154`, a test title ("passesMore's both-'only' case returns the UNION...") — prose, not an import; that test file does not import `passesMore`. | `src/frontend/screens/Library/__tests__/filterEngine.test.ts` |
| src/frontend/screens/Library/filterEngine.ts - passesView | **UNEXPORT** | Only hit: `src/frontend/screens/Library/__tests__/engineWiring.test.ts:265`, a test title ("...passesView compares gameKey()") — prose; that file imports only `gameKey` from `filterEngine.ts`. | `src/frontend/screens/Library/__tests__/engineWiring.test.ts` |
| src/frontend/state/GlobalState.tsx - SleepAssertionCall | **UNEXPORT** | Only hit: `GlobalStateSleepAssertionClassification.test.ts:149/154` — the test declares its OWN LOCAL `type SleepAssertionCall = { channel: ...; playing?: boolean }` (line 149) rather than importing GlobalState.tsx's type (that file cannot be `import`-ed under jsdom-less jest — see its own docstring). Coincidental same-named local, not a consumer. | `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` |
| src/frontend/state/GlobalState.tsx - SleepAssertionKind | **UNEXPORT** | Only appears inside a literal marker STRING the test searches for (`'export function classifySleepAssertionKind(status: Status): SleepAssertionKind {'`) — that string match depends on `classifySleepAssertionKind`'s own `export` keyword (see below), not on `SleepAssertionKind` the type's export status. Dropping `export` from the type alias itself does not change this string. | `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` |
| src/frontend/state/GlobalState.tsx - SleepAssertionState | **UNEXPORT** | Only hit: `GlobalStateSleepAssertionClassification.test.ts:148/152/153` — the test declares its OWN LOCAL `type SleepAssertionState = { display: boolean; system: boolean }` (line 148), same coincidental-local shape as `SleepAssertionCall`. | `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` |
| src/frontend/state/GlobalState.tsx - classifySleepAssertionKind | IGNORE | `GlobalStateSleepAssertionClassification.test.ts` reads `GlobalState.tsx`'s SOURCE TEXT at test time (that file cannot be `import`-ed under this project's jsdom-less frontend jest config) and searches for the LITERAL marker `'export function classifySleepAssertionKind(status: Status): SleepAssertionKind {'` (lines 143, 287) to extract and transpile the real function body. Dropping `export` breaks the marker match -> `extractFunctionSource` throws "start marker not found". | `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` |
| src/frontend/state/GlobalState.tsx - reconcileSleepAssertionCalls | IGNORE | Same mechanism: literal marker `'export function reconcileSleepAssertionCalls('` (line 158) drives `extractFunctionSource`. Dropping `export` breaks the marker. | `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` |
| src/preload/tauriTransport.ts - hydrateStore | **UNEXPORT** | Zero hits anywhere outside its own declaring file. | (none named) |

## Summary

- 39 meta/ identities: 7 UNEXPORT (3 bare `main` guards + 4 re-export-list entries), 32 IGNORE
  (includes the 2 parked meta/ traps: `InvocationForm`, `DECOMPRESS_WORKER_ENTRY_PATH`).
- 28 src/ identities: 22 UNEXPORT (4 of which are re-export-list entries), 6 IGNORE (includes the
  1 parked src/ trap: `FakeHomeEnvKey`).
- Total: 29 UNEXPORT, 38 IGNORE. 29 + 38 = 67. ✓ reconciles against the derived population.
- All 4 decision-parked entries (`InvocationForm`, `DECOMPRESS_WORKER_ENTRY_PATH`,
  `DownloadedBinary`, `FakeHomeEnvKey`) verdict IGNORE, matching `<decision>`.
- Every UNEXPORT was checked for a require()/requireActual() blind-spot consumer before being
  finalized (see per-row evidence); none was found for any UNEXPORT entry.
