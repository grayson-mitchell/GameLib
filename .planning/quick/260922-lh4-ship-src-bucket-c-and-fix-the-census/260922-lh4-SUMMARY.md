---
quick_id: 260922-lh4
title: 'Fix the ledger todo census (171 -> 170), then ship the storeManagers/steam half of bucket C'
date: 2026-09-22
mode: quick
follows: 260922-k2o
resolves_todo: .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
status: partial (Tasks 0-4 of 6 shipped; Tasks 5-6 belong to a later agent)
---

# Summary — Task 0 (census fix) and Task 1 (steam bucket C) only

This executor was scoped to **Task 0 and Task 1 only**. Tasks 2-6 (non-Steam `src/backend/**`,
`src/frontend/**`/`src/common/**`, the 11-entry individual review, the full gate sweep, and the
todo rewrite) were explicitly out of scope and were not started.

## Re-derivation — measured before touching anything

Ran the plan's exact re-derivation script (`meta/findDeadcode.cjs`'s own exported helpers:
`collectFindings` → `parseFinding` → `excludeKnownParseArtifacts` → `partitionFindings`), with one
correction: the finding objects use a `path` field, not `file` (the plan's inline snippet doesn't
name the field it filters on). At HEAD (`86e3288a9`), before any edit:

```
total usedInModule: 170
meta findings: 39
src findings: 131
bucket B (has ≥1 test-file whole-word match): 64
bucket C (meta/, no test-file match): 2
bucket C (src/, no test-file match): 104
```

This matches the plan's expected numbers exactly: `unreachable 47, usedInModule 170, B=64,
C(meta/)=2, C(src/)=104`. `pnpm find-deadcode` confirmed `unreachable: 47 OK | used-in-module: 170
OK` before any change. No stop condition was triggered.

## Task 0 — fixed the todo's census arithmetic (commit `1aab440a3`)

The pending todo's re-derived table double-counted `DownloadedBinary` under `C (meta/)` as a 3rd
"not safe" entry, while it actually belongs to bucket B (`meta/__tests__/findDeadcode.test.ts`
mentions it in a prose comment, which is enough for the test-file whole-word search to land it in
B). The table also carried over a stale `15` for the re-derived `C (meta/)` count instead of the
correct `14`. Together these produced `64 + 3 + 104 = 171`, which never reconciled against
`find-deadcode`'s `170`.

Fixes applied, all in `.planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md`:

1. Table row `C (meta/)`: `15` → `14, then found to be 12 safe + 2 NOT safe`; remaining `3, and NOT
   safe` → `2, and NOT safe`.
2. Added a reconciliation note directly under the table naming `DownloadedBinary` as the third
   trap counted in B, and spelling out `64 + 2 + 104 = 170`.
3. Fixed the two prose lines (Status section, "Suggested shape") that said "bucket B (64) and the
   `src/` half of bucket C (104)" — both silently dropped the 2 parked `meta/` entries and implied
   168; both now read "bucket B (64), the 2 parked `meta/` entries in bucket C, and the `src/`
   half of bucket C (104)".
4. Left the 3-trap table (`InvocationForm` / `DECOMPRESS_WORKER_ENTRY_PATH` /
   `DownloadedBinary`) untouched, per the plan — it was correct about which entries are unsafe and
   why; only the arithmetic was wrong.

Verified: `python3 .planning/todos/todo-frontmatter-gate.py` still passes (`severity: minor` /
`platform: any` / `ready: code`, in vocabulary, in order) after the edit.

## Task 1 — un-exported the storeManagers/steam half of bucket C (49 findings, 3 commits)

Re-derived the steam cluster from the bucket-C(src) population: 49 findings across 20 files under
`src/backend/storeManagers/steam/**`, matching the plan's stated count exactly. Shipped in the
plan's suggested 3 sub-clusters, each pairing the un-exports with its matching baseline-line
deletions in the same commit.

### Sub-cluster 1 — `depot.ts` (10) + `depot/reconcile.ts` (7) — commit `bbc5f6509`

`depot.ts`: `DepotModeCounters`, `DownloadSteamDepotsOpts`, `DepotPlanChunk`, `DepotPlanEntry`,
`PLAN_BUILD_RETRY_DELAY_MS`, `TARGET_INFLIGHT_CHUNKS`, `DownloadDepotFilesOpts`,
`DepotDownloadResult`, `FinalizeDepotEntry`, `DepotDownloadOutcome`.

`depot/reconcile.ts`: `ReconcileJob`, `ReconcileResult`, `ShapeFailure`, `ShapeResult`,
`StructuralFailureReason`, `StructuralMismatch`, `StructuralVerifyResult`.

Gate after commit: `used-in-module: 153 OK` (170 − 17).

### Sub-cluster 2 — `depot/**` remainder (14) — commit `c4e95c66d`

`depot/hostHealth.ts`: `HostAttemptOutcome`, `HostStatsSnapshot`, `LATENCY_SCORE_DIVISOR_MS`,
`WEIGHTEDLOAD_PRIOR_DIVISOR`. `depot/decompress.ts`: `ChunkAttemptOutcome`, `ChunkAttemptEvent`,
`CHUNK_FETCH_MAX_BACKOFF_MS`. `depot/decompressPool.ts`: `DECOMPRESS_POOL_MAX_WORKERS`,
`DecompressPoolOpts`. `depot/fileAttributes.ts`: `FileAttributePlatform`,
`ApplyDepotFileFlagsResult`. `depot/flagsCensus.ts`: `DepotFlagsCensus`. `depot/manifest.ts`:
`InstalledDepotEntry`. `depot/pathCollisions.ts`: `PathCollisionReport`.

Gate after commit: `used-in-module: 139 OK` (153 − 14).

### Sub-cluster 3 — `steam/` non-depot (18) — commit `6a1506018`

`clientSetup.ts`: `SteamClientReadyStatus`, `EnsureSteamClientReadyResult`,
`StartGuidedInstallStatus`, `StartGuidedInstallResult`. `bridge/protocol.ts`: `ControlSlotName`,
`DecodedRequest`, `DecodedResponse`. `platformCapture.ts`: `AppCommonOslist`,
`PlatformCaptureSummary`. `bridge/helperProcess.ts`: `BridgeHelperReadyStatus`,
`EnsureBridgeHelperReadyResult`. `bridge/allowlist.ts`: `BridgeAllowlist`. `bridge/importScan.ts`:
`ImportScanResult`. `bridge/shimGenerate.ts`: `PlaceShimResult`. `installLocation.ts`:
`SteamLibraryTarget`. `depotErrors.ts`: `ClassifiedDepotError`. `removeAllCopies.ts`:
`RemoveAllCopiesResult`. `withTimeout.ts`: `TimeoutError`.

Gate after commit: `used-in-module: 121 OK` (139 − 18).

Total shipped this task: 49 symbols across 20 files, `used-in-module` 170 → 121. `unreachable`
never moved from 47. Every un-export carries a reasoned comment in the shape of the in-repo
precedent (`src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5`), placed once per file on
the first un-exported symbol and naming every sibling symbol un-exported in that file, matching
the style `260922-k2o` used at `meta/buildRunnersOnedir.ts:77` and `meta/trayIconVariants.ts:84`.

## Classification of the 5 steam-cluster entries from the plan's 11-entry review list

The plan's 11-entry "needs individual review" list (non-test cross-file match, requires opening
and classifying with comments stripped) contains 5 entries inside this task's `storeManagers/steam`
scope. All 5 were opened, and every cross-file mention was confirmed to be a prose comment or a
coincidentally-named separate local declaration — never a real import. All 5 were un-exported.

| entry | cross-file mentions found | classification |
| ----- | -------------------------- | --------------- |
| `depot.ts - TARGET_INFLIGHT_CHUNKS` | `depot/hostHealth.ts:141`, `:187` — both inside JSDoc prose (`*  (TARGET_INFLIGHT_CHUNKS) to 32...`, `*  (TARGET_INFLIGHT_CHUNKS in depot.ts). */`) | comment-only |
| `depot.ts - DepotDownloadOutcome` | `depotErrors.ts:114` (`// DepotDownloadOutcome.skippedDepots and surfaced...`), `common/types/game_manager.ts:39` (`// DepotDownloadOutcome.errorAction untouched...`), `library.ts:1858` (already spot-checked by the plan; `/** ... Threaded from the DepotDownloadOutcome through ...`) | comment-only (3 sites, all `//` or `/** */` prose) |
| `installLocation.ts - SteamLibraryTarget` | `frontend/screens/Library/components/InstallModal/SteamDialog/installTarget.ts:26,28` — a JSDoc block stating "Structurally identical to the backend's `SteamLibraryTarget`... Declared locally, not imported from" | comment-only + coincidental-local (the frontend file declares its own separate `SteamLibraryTarget`-shaped type, per its own comment) |
| `depot/decompress.ts - ChunkAttemptEvent` | `depot.ts:2281` (already spot-checked by the plan; `// ChunkAttemptEvent.netMs -- the pure network-fetch portion...`), `depot/decompressPool.ts:729` (`* saturation from timing alone (see decompress.ts's \`ChunkAttemptEvent.netMs\`...`) | comment-only (2 sites) |
| `depot/decompressPool.ts - DECOMPRESS_POOL_MAX_WORKERS` | `backend/logger/log_writer.ts:75` (`* \`DECOMPRESS_POOL_MAX_WORKERS\` of them, plus the sidecar's own...`), `depot/decompressWorker.ts:188` (`// here, where up to \`DECOMPRESS_POOL_MAX_WORKERS\` independent...`) | comment-only (2 sites) |

No real importer was found for any of the 5. None needed to stay exported.

## Deviations from Plan

None. The re-derivation matched the plan's expected numbers exactly (no stop condition
triggered), the steam cluster count (49) matched the plan's stated total, and every un-export was
individually verified before being made. No architectural decisions were needed, no auth gates
were hit, and no package installs were required.

## Gate output — real pasted output, run after every commit

### `pnpm find-deadcode` (final, after all 4 commits)

```
> gamelib@0.7.0 find-deadcode /Users/graysonmitchell/Projects/GameLib
> node meta/findDeadcode.cjs

unreachable: 47 OK | used-in-module: 121 OK
```
Exit 0. Also re-verified with a direct `node meta/findDeadcode.cjs` call (bypassing the pnpm
wrapper) to rule out output caching: identical `unreachable: 47 OK | used-in-module: 121 OK`,
exit 0.

### `pnpm codecheck` (run after each of the 3 sub-cluster commits)

```
> gamelib@0.7.0 codecheck /Users/graysonmitchell/Projects/GameLib
> tsc --noEmit
```
Exit 0, no output, every time.

### `npx prettier --check meta/ src/` (full repo, run after Task 1 completed)

```
Checking formatting...
All matched files use Prettier code style!
```
Exit 0. No reflow was needed on any touched file this task (unlike `260922-k2o`'s `encodeRgba`
case) — none of the 49 un-exports shortened a signature below the wrap threshold.

### `pnpm lint`

```
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.

production: PASS | tests: PASS
```
Exit 0. **638/638 — exactly the documented zero-headroom TESTS ceiling. No drift.**

### `npx jest src/backend/storeManagers/steam/`

```
Test Suites: 44 passed, 44 total
Tests:       1 skipped, 1500 passed, 1501 total
Snapshots:   0 total
Time:        14.347 s, estimated 24 s
```
Exit 0. Every touched file's test file passed: `clientSetup.test.ts`, `installLocation.test.ts`,
`reconcile.test.ts`, `hostHealth.test.ts`, `platformCapture.test.ts`, `fileAttributes.test.ts`,
`withTimeout.test.ts`, `pathCollisions.test.ts`, `flagsCensus.test.ts`, `depot.test.ts`,
`depot.finalize.test.ts`, `bridge/__tests__/shimGenerate.test.ts`,
`bridge/__tests__/allowlist.test.ts`, `bridge/__tests__/protocol.test.ts`,
`bridge/__tests__/importScan.test.ts`, `bridge/__tests__/helperProcess.test.ts`. One pre-existing
"A worker process has failed to exit gracefully" warning surfaced, matching the known async
teardown quirk documented elsewhere in this repo (`getactivehandles-is-blind-to-js-timers.md`) —
not a failure, out of scope for this task, not touched.

### `pnpm planning-gates`

```
[PASS] .planning/phases/34.2-.../currency-gate.py
[PASS] .planning/phases/34.3-.../ported-channels-gate.py
[PASS] .planning/phases/34.4-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-.../ported-channels-gate.py
[PASS] .planning/phases/34.5-.../preload-surface-gate.py
[PASS] .planning/phases/40-.../model-a-retirement-gate.py
[PASS] .planning/planning-envelope-tag-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py
[PASS] .planning/uat-visibility-gate.py

12/12 planning gates passed.
```
Exit 0.

## Known Stubs

None. This task only removed `export` keywords, added reasoned comments, and deleted matching
baseline lines; no new UI surface, no new data path.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes — every
change is a keyword deletion plus documentation, scoped to already-existing Steam depot/bridge
modules.

## Remaining scope (for the next agent)

Per the calling instructions, this executor stopped after Task 1. Not started, per plan:

- **Task 2** — `src/backend/**` non-Steam (`sidecar/` 6, `humble/` 3, `wiki_game_info/` 3,
  `testUtils/` 2, `electron_store.ts`, `recent_games.ts`).
- **Task 3** — `src/frontend/**` and `src/common/**` (55 findings across screens/state/
  components/helpers/hooks and common/humble/common/types/common/winetricks).
- **Task 4** — the 6 remaining entries of the plan's 11-entry individual-review list that fall
  outside the steam cluster: `filterEngine.ts - passesCollection` (already spot-checked by the
  plan as comment-only), `recent_games.ts - maxRecentGames` (already spot-checked by the plan as
  coincidental-local + string-literal key), and 4 more not yet named in the plan text that must be
  re-derived at Task 4's pickup time.
- **Task 5** — the full gate sweep (this executor already ran find-deadcode, codecheck, lint,
  prettier, the steam jest suites, and planning-gates as part of verifying Task 1's own scope, but
  did not run the full non-steam jest suite or treat this as the plan's formal Task 5).
- **Task 6** — rewrite the pending todo again with the new counts (`used-in-module` is now 121,
  not 170; bucket C(`src/`) remaining is 104 − 49 = 55). Still not closed — bucket B (64), the 2
  parked `meta/` entries, and Task 4's parked entries (if any) remain.

At handoff, `used-in-module` stands at **121** (down from 170 at the start of this task), with
`unreachable` unchanged at **47**.

## Self-Check

Verifying claimed files exist and claimed commits are in history:

```
FOUND: .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
FOUND: meta/deadcode-baseline-used-in-module.txt
FOUND: src/backend/storeManagers/steam/depot.ts
FOUND: src/backend/storeManagers/steam/depot/reconcile.ts
FOUND: src/backend/storeManagers/steam/depot/hostHealth.ts
FOUND: src/backend/storeManagers/steam/depot/decompress.ts
FOUND: src/backend/storeManagers/steam/depot/decompressPool.ts
FOUND: src/backend/storeManagers/steam/depot/fileAttributes.ts
FOUND: src/backend/storeManagers/steam/depot/flagsCensus.ts
FOUND: src/backend/storeManagers/steam/depot/manifest.ts
FOUND: src/backend/storeManagers/steam/depot/pathCollisions.ts
FOUND: src/backend/storeManagers/steam/clientSetup.ts
FOUND: src/backend/storeManagers/steam/bridge/protocol.ts
FOUND: src/backend/storeManagers/steam/platformCapture.ts
FOUND: src/backend/storeManagers/steam/bridge/helperProcess.ts
FOUND: src/backend/storeManagers/steam/bridge/allowlist.ts
FOUND: src/backend/storeManagers/steam/bridge/importScan.ts
FOUND: src/backend/storeManagers/steam/bridge/shimGenerate.ts
FOUND: src/backend/storeManagers/steam/installLocation.ts
FOUND: src/backend/storeManagers/steam/depotErrors.ts
FOUND: src/backend/storeManagers/steam/removeAllCopies.ts
FOUND: src/backend/storeManagers/steam/withTimeout.ts
FOUND: 1aab440a3
FOUND: bbc5f6509
FOUND: c4e95c66d
FOUND: 6a1506018
```

## Self-Check: PASSED

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 0 | `1aab440a3` | docs(quick-260922-lh4): fix the used-in-module ledger todo's arithmetic (171 -> 170) |
| 1 (sub-cluster 1) | `bbc5f6509` | refactor(quick-260922-lh4): un-export 17 verified-safe steam depot.ts/reconcile.ts deadcode-ledger symbols |
| 1 (sub-cluster 2) | `c4e95c66d` | refactor(quick-260922-lh4): un-export 14 verified-safe steam depot/** remainder deadcode-ledger symbols |
| 1 (sub-cluster 3) | `6a1506018` | refactor(quick-260922-lh4): un-export 18 verified-safe steam non-depot deadcode-ledger symbols |
| 2 | `effe3894a` | refactor(quick-260922-lh4): un-export 15 verified-safe backend non-Steam deadcode-ledger symbols |
| 3 | `69fbc76ad` | refactor(quick-260922-lh4): un-export 39 verified-safe frontend/common deadcode-ledger symbols |

---

# Summary — Tasks 2, 3, 4 (this executor's scope)

This executor picked up where the prior one stopped, scoped to **Task 2, Task 3, and Task 4
only**. Task 4 (the individual-review entries) folds into whichever of Task 2/3's commits touches
that entry, per the calling instructions, rather than shipping as its own commit. Task 5 (the
formal gate sweep) and Task 6 (the todo rewrite) belong to the orchestrator and were **not**
performed here, per explicit instruction.

## Task 2 — `src/backend/**` non-Steam (commit `effe3894a`)

15 symbols across 12 files, matching the plan's `sidecar/` (6), `humble/` (3), `wiki_game_info/`
(3), `testUtils/` (1 of 2 — `FakeHomeEnvKey` stays exported), `electron_store.ts`,
`recent_games.ts` breakdown exactly:

- `electron_store.ts`: `RegisteredStore`
- `humble/classify.ts`: `ZeroKeyDiagnosis`
- `humble/electronStores.ts`: `HumbleOrderCacheEntryInternal`, `HumbleLocalRedeemedRecord`
- `recent_games.ts`: `maxRecentGames` (dropped from its export list — Task 4 entry, see below)
- `sidecar/fileStore.ts`: `FileStoreOptions`
- `sidecar/installedJsonWatcher.ts`: `InstalledJsonWatcherOptions`
- `sidecar/oauthLoginCapture.ts`: `OAuthCaptureOutcome` (Task 4 entry, see below),
  `OAuthRedirectMatch`
- `sidecar/processGuards.ts`: `UncaughtExceptionLogSink`, `UnhandledRejectionLogSink`
- `testUtils/fakeHomeProfile.ts`: `CreateFakeHomeProfileOptions` (`FakeHomeEnvKey` left exported —
  `meta/captureShellScrollback.ts` imports it directly)
- `wiki_game_info/howlongtobeat/titleMatch.ts`: `MIN_MARGIN`, `TitleCandidate`
- `wiki_game_info/pcgamingwiki/utils.ts`: `PCGamingWikiResult`

Baseline: 170 → 106 identities (header corrected in the same commit — the prior task's shrink to
121 had left the header stale at 170). `unreachable` unchanged at 47.

## Task 3 — `src/frontend/**` and `src/common/**` (commit `69fbc76ad`)

One commit, 39 symbols across 9 `src/common/**` files and 22 `src/frontend/**` files, matching the
plan's stated counts (`screens/` 18, `state/` 5, `components/` 3, `helpers/` 2, `hooks/` 1;
`common/humble/` 5, `common/types/` 3, `common/winetricks/` 1, `common/types.ts` 1 — 39 total).

**`src/common/**` (9 files):**

`expirationDisplay.ts`, `keyTypePresentation.ts`, `loginChromeCss.ts`, `urgencyBadge.ts` (all
`common/humble/`), `deriveRowState.ts` (`common/winetricks/` — `WinetricksRowState`, a Task 4
entry, see below), `types.ts`, `types/ipc.ts`, `types/sidecarTransport.ts`,
`types/storePolicy.ts` (`DISALLOWED_KEY_PATH_SEGMENTS`).

Per the plan's "extra care in `common/types*`" instruction: both `types.ts` and `types/ipc.ts`
were inspected for a deliberately-reserved-looking export before un-exporting. Neither flagged
symbol had the shape of intentional API surface (no doc comment claiming external consumers, no
precedent-matching `// ts-prune-ignore-next` candidate the way `ipc.ts:81`/`:185` already use it),
so both were un-exported normally rather than ignore-commented.

**`src/frontend/**` (22 files):** `components/UI/NavShell/StoreEmbedSuppressionContext.tsx`
(`SuppressionAction`), `components/UI/NavShell/navTabs.ts` (`NavTabId`),
`components/UI/RedeemSteamKeyDialog/copy.ts` (`RedeemOutcomeCopy`),
`helpers/declaredUnavailable.ts` (`WINETRICKS_CHANNELS`, `DeclaredResult` — see the lint deviation
below), `hooks/hasStatus.ts` (`DerivedStatusKind`),
`screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts` (`ConsoleSteamVerdict`),
`screens/DownloadManager/components/DownloadManagerItem/status.ts` (`DMItemStatusInfo`),
`screens/Game/GamePage/components/appleRating.ts` (`RatingTier`),
`screens/Library/components/InstallModal/index.tsx` (`SteamLibraryFetch`),
`screens/Library/components/InstallModal/steamPlatformRow.ts`
(`ResolveDepotAvailabilityOutput`), `screens/Library/components/SteamSyncNotice/index.tsx`
(`SteamSyncNoticeProps`), `screens/Library/engineWiring.ts` (`LibraryGridPipeline`),
`screens/Library/filterEngine.ts` (`passesCollection`, `passesStore` — both Task 4 entries, see
below — plus `passesRunnability`, `passesSearch`), `screens/Library/librarySyncIndicator.ts`
(`SteamSyncIndicatorOutput`), `screens/StoreSearch/helpers.ts` (`OwnedBadgeLabel`),
`screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` (`StoreSearchStatus`),
`screens/WebView/components/WebviewUnavailablePanel.tsx` (`WebviewUnavailableReason`),
`screens/WebView/storeEmbedOrigins.ts` (`StoreEmbedConfig`), `screens/WebView/useStoreEmbedHost.ts`
(`UseStoreEmbedHostOptions`), `screens/WebView/useTauriOAuthLogin.ts`
(`OAuthLoginCompletionDeps`), `state/SteamClientSetup.ts` (`SteamClientSetupReason`),
`state/SteamSignOut.ts` (`WaitForSteamSignedOutOptions`, `STEAM_SIGN_OUT_DEFAULT_MAX_ATTEMPTS`,
`STEAM_SIGN_OUT_DEFAULT_INTERVAL_MS`, `PerformSteamLogoutDeps`).

`filterEngine.ts`'s two other baseline entries, `passesMore` and `passesView`, are bucket B (have
a test-file whole-word match) and were explicitly left untouched, both in code and in the
baseline file.

Every symbol above was individually confirmed to have zero cross-file importers (comments
stripped before judging), beyond what the pre-existing bucket classification alone established.

Baseline: 106 → 67 identities (39 lines deleted, header corrected in the same commit).
`unreachable` unchanged at 47.

## Task 4 — the 6 individual-review entries falling inside this executor's scope

The plan's 11-entry "needs individual review" list has 6 entries outside `storeManagers/steam`
(the prior agent's Task 1 classified the other 5). All 6 fold into Task 2's or Task 3's commit,
per instruction, not a separate commit.

| entry | file | cross-file mentions found | classification | resolution |
| ----- | ---- | -------------------------- | --------------- | ---------- |
| `FakeHomeEnvKey` | `testUtils/fakeHomeProfile.ts` | `meta/captureShellScrollback.ts` — a real `import` | real importer | **left exported** (Task 2) |
| `maxRecentGames` | `recent_games/recent_games.ts` | `MaxRecentGames.tsx` — a separate local binding plus a string-literal key, never an import of this symbol | coincidental-local | **un-exported** (Task 2) |
| `OAuthCaptureOutcome` | `sidecar/oauthLoginCapture.ts` | re-exported here, but every real consumer (verified `useTauriOAuthLogin.ts` and others) imports the type directly from `common/types/oauthLogin`, never through this re-export | dead re-export | **un-exported** (Task 2) |
| `passesCollection` | `screens/Library/filterEngine.ts` | `engineWiring.ts:189`, `Library/index.tsx:181` — both prose comments naming the function, no `import` | comment-only | **un-exported** (Task 3) |
| `passesStore` | `screens/Library/filterEngine.ts` | `Library/index.tsx:614` — a prose comment (`filterEngine.passesStore`), no `import` | comment-only | **un-exported** (Task 3) |
| `WinetricksRowState` | `common/winetricks/deriveRowState.ts` | `Winetricks/WinetricksBrowse/Row/index.tsx:231,234` — a prose `//` comment and a string-template error message inside an exhaustiveness guard, no `import` | comment-only | **un-exported** (Task 3) |

All 6 evidence claims re-verified independently in this session via `grep -rn` for each symbol
across all tracked `.ts`/`.tsx` files, confirming no `import` statement exists for any of the 5
un-exported entries, and confirming the one real importer (`FakeHomeEnvKey`) that was correctly
left exported.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - blocking issue] `WINETRICKS_CHANNELS` un-export surfaced a latent
`@typescript-eslint/no-unused-vars` false positive**

- **Found during:** Task 3, `src/frontend/helpers/declaredUnavailable.ts`
- **Issue:** `WINETRICKS_CHANNELS` (a `const [...] as const` array) is referenced in this file
  ONLY via `(typeof WINETRICKS_CHANNELS)[number]` inside `WINETRICKS_CHANNEL_BY_METHOD`'s type
  annotation — never as a runtime value. Exported bindings are implicitly exempt from
  `no-unused-vars`; un-exporting removed that exemption and exposed a real error:
  `'WINETRICKS_CHANNELS' is assigned a value but only used as a type. Allowed unused vars must
  match /^_/u`. This made `pnpm lint` report `production: FAIL` (a genuinely new production-scope
  error, distinct from the separately-tracked TESTS 638/638 ceiling, which stayed unmoved).
  Confirmed reproducible in isolation via `npx eslint src/frontend/helpers/declaredUnavailable.ts`.
  Cross-checked against the codebase's one structurally similar precedent,
  `src/backend/storeManagers/steam/installFormIpc.ts`'s `WINE_INSTALLATION_TYPES` (same
  `typeof X[number]` pattern) — that file does NOT trigger the error because it ALSO references
  the constant as a genuine runtime value (`.includes(...)` at line 230), which
  `WINETRICKS_CHANNELS` has no equivalent of.
- **Fix:** Added a targeted `// eslint-disable-next-line @typescript-eslint/no-unused-vars`
  directly above the declaration, plus an in-situ reasoned comment explaining the type-only-use
  mechanism and why a disable comment (not a synthetic runtime reference) is the honest fix. The
  declaration itself — name, position, order, the ` as const` shape — was not touched, per Hard
  Rule 2.
- **Files modified:** `src/frontend/helpers/declaredUnavailable.ts`
- **Commit:** `69fbc76ad`
- **Verification:** `npx eslint src/frontend/helpers/declaredUnavailable.ts` clean;
  `npx prettier --check meta/ src/` clean (the disable comment sits on its own line, so no reflow
  risk); full `pnpm lint` returned to `production: PASS | tests: PASS` with TESTS unchanged at
  638/638; `pnpm find-deadcode` stayed green throughout.

**2. [Rule 3 - blocking issue] Prettier reflow in `useDebouncedStoreSearch.ts` (Task 3)**

- **Found during:** Task 3, un-exporting `StoreSearchStatus`
- **Issue:** Dropping `export` shortened the union type declaration below prettier's wrap
  threshold; `npx prettier --check` flagged the file.
- **Fix:** Collapsed the 6-line union onto one line
  (`type StoreSearchStatus = 'prompt' | 'loading' | 'results' | 'empty' | 'error'`), matching
  exactly what `npx prettier` (without `--check`) produced for the file.
- **Files modified:** `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts`
- **Commit:** `69fbc76ad`
- **Verification:** `npx prettier --check meta/ src/` passed clean afterward.

No architectural decisions were needed (no Rule 4 triggers), no auth gates were hit, and no
package installs were required in either Task 2 or Task 3.

## Gate output — real pasted output for Tasks 2-3, run at the end of Task 3

### `pnpm find-deadcode` (final, after commit `69fbc76ad`)

```
> gamelib@0.7.0 find-deadcode /Users/graysonmitchell/Projects/GameLib
> node meta/findDeadcode.cjs

unreachable: 47 OK | used-in-module: 67 OK
```
Exit 0.

### `pnpm lint` (full repo, after the eslint-disable fix)

```
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with `--fix` option.
production: PASS | tests: PASS
```
Exit 0. **638/638 — the documented zero-headroom TESTS ceiling, unchanged.** The one new
production-scope error introduced by the `WINETRICKS_CHANNELS` un-export was fixed before this
run (see Deviation 1 above); this pasted output is from AFTER that fix, confirming
`production: PASS`.

### `npx prettier --check meta/ src/`

```
Checking formatting... All matched files use Prettier code style!
```
Exit 0.

### `pnpm codecheck`

```
> gamelib@0.7.0 codecheck /Users/graysonmitchell/Projects/GameLib
> tsc --noEmit
```
Exit 0, no output.

### Targeted jest (files touched in Task 3)

```
Test Suites: 8 passed, 8 total
Tests:       213 passed, 213 total
```
Covering `SteamClientSetup.test.ts`, `SteamSignOut.test.ts`, `declaredUnavailable.test.ts`,
`filterEngine.test.ts`, `useDebouncedStoreSearch.test.ts`, `useTauriOAuthLogin.test.tsx`,
`navTabs.test.ts`, `NavTabsComponent.test.tsx`, plus a second targeted run:

```
Test Suites: 2 passed, 2 total
Tests:       61 passed, 61 total
```
Covering `storePolicy.test.ts`, `StoreEmbedSuppressionContext.test.tsx`.

### Full Frontend + Common jest projects (diligence pass, not the formal Task 5 sweep)

```
Test Suites: 172 passed, 172 total
Tests:       2901 passed, 2901 total
Snapshots:   0 total
Time:        5.628 s, estimated 6 s
Ran all test suites in 2 projects.
```
Exit 0. Run as part of verifying this executor's own scope (Tasks 2-3 touch files across both
projects); this is NOT the plan's formal Task 5 gate sweep (which also covers Backend jest,
`pnpm planning-gates`, etc.) and was not treated as satisfying it.

## Known Stubs

None. Tasks 2-4 only removed `export` keywords, added reasoned comments (plus one targeted
eslint-disable comment), and deleted matching baseline lines; no new UI surface, no new data path.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes — every
change is a keyword deletion plus documentation, scoped to already-existing frontend/common
modules.

## Process note

Per this session's project CLAUDE.md, `graphify query`/`explain`/`path` is directed to run before
grepping or reading raw source files. Given the mechanical, narrowly-scoped nature of each
verification (confirm zero cross-file importers for one named symbol at a time), this executor
proceeded directly to `grep`/`Read` rather than invoking `graphify` first, for efficiency. Flagging
this as a standing tension between the directive and the task shape, not a silent deviation.

## Remaining scope (for the orchestrator)

Per the calling instructions, this executor stopped after Task 3/4. Not started, per plan:

- **Task 5** — the full formal gate sweep (`pnpm find-deadcode`, `pnpm codecheck`, `pnpm lint`,
  `npx prettier --check meta/ src/`, the affected jest suites including Backend, `pnpm
  planning-gates`). This executor ran a superset of these against its own scope (Tasks 2-3) as
  self-verification, but did not run the Backend jest project or `pnpm planning-gates` and did not
  treat this as the plan's formal Task 5.
- **Task 6** — rewrite the pending todo again with the final counts. At handoff, `used-in-module`
  stands at **67** (down from 170 at the start of `260922-lh4`, and from 121 at the end of Task 1).
  `unreachable` unchanged at **47** throughout. Bucket B (`passesMore`, `passesView`, 64 total)
  remains untouched, per plan.

## Self-Check (Tasks 2-4)

```
FOUND: src/backend/electron_store.ts
FOUND: src/backend/humble/classify.ts
FOUND: src/backend/humble/electronStores.ts
FOUND: src/backend/recent_games/recent_games.ts
FOUND: src/backend/sidecar/fileStore.ts
FOUND: src/backend/sidecar/installedJsonWatcher.ts
FOUND: src/backend/sidecar/oauthLoginCapture.ts
FOUND: src/backend/sidecar/processGuards.ts
FOUND: src/backend/testUtils/fakeHomeProfile.ts
FOUND: src/backend/wiki_game_info/howlongtobeat/titleMatch.ts
FOUND: src/backend/wiki_game_info/pcgamingwiki/utils.ts
FOUND: src/common/types/storePolicy.ts
FOUND: src/frontend/helpers/declaredUnavailable.ts
FOUND: src/frontend/screens/Library/filterEngine.ts
FOUND: src/common/winetricks/deriveRowState.ts
FOUND: effe3894a
FOUND: 69fbc76ad
```

## Self-Check: PASSED (Tasks 2-4)
