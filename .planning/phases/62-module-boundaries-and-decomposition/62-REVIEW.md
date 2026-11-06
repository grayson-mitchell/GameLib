---
phase: 62-module-boundaries-and-decomposition
reviewed: 2026-11-06T18:38:04Z
depth: standard
files_reviewed: 96
files_reviewed_list:
  - eslint.config.mjs
  - meta/runnerLiteralSelectors.cjs
  - meta/boundaryRatchet.cjs
  - package.json
  - .dependency-cruiser.cjs
  - src/common/storeCapabilities.ts
  - src/backend/storeManagers/index.ts
  - src/backend/launcher.ts
  - src/backend/crossover_index/index.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/ipc_handler.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/gamedetails/dispatch.ts
  - src/backend/protocol.ts
  - src/backend/save_sync.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/backend/shortcuts/utils.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/oauthLoginCapture.ts
  - src/backend/sidecar/runnerMiscFlowRegistration.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/sidecar/steamFlowRegistration.ts
  - src/backend/signInProbe/verdict.ts
  - src/backend/tools/index.ts
  - src/backend/tools/ipc_handler.ts
  - src/backend/utils.ts
  - src/backend/utils/macArch.ts
  - src/backend/utils/uninstaller.ts
  - src/backend/wiki_game_info/gamesdb/utils.ts
  - src/backend/wiki_game_info/howlongtobeat/utils.ts
  - src/backend/wiki_game_info/umu/utils.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/frontend/components/UI/StoreLogos/index.tsx
  - src/frontend/components/UI/UninstallModal/index.tsx
  - src/frontend/helpers/index.ts
  - src/frontend/helpers/library.ts
  - src/frontend/helpers/reportProblem.ts
  - src/frontend/helpers/steamInstallOptionsEntry.ts
  - src/frontend/helpers/storeDisplayName.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/hooks/hasAnticheatInfo.ts
  - src/frontend/hooks/hasStatus.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/status.ts
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/steamManagedModel.ts
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx
  - src/frontend/screens/Game/GamePage/components/CompatibilityInfo.tsx
  - src/frontend/screens/Game/GamePage/components/Description.tsx
  - src/frontend/screens/Game/GamePage/components/Developer.tsx
  - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx
  - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePicture/index.tsx
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Game/ModifyInstallModal/index.tsx
  - src/frontend/screens/Game/TimeContainer/index.tsx
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Library/components/GameCard/constants.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/WineSelector/engineFilter.ts
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/gameCount.ts
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/useNonSteamLastPlayed.ts
  - src/frontend/screens/Login/components/LoginWarning/index.tsx
  - src/frontend/screens/Settings/components/AlternativeExe.tsx
  - src/frontend/screens/Settings/components/OfflineMode.tsx
  - src/frontend/screens/Settings/components/Tools/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/index.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/state/SteamBottleSetup.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-11-06T18:38:04Z
**Depth:** standard (diff-scoped: `01c875c1e~1..HEAD`, the runner-literal → store-capability conversion 62-13..62-20, plus the eslint/selector wiring)
**Files Reviewed:** 96
**Status:** issues_found

## Summary

Every converted site was checked for runner-set equivalence: does the new predicate hold for exactly the runners the old literal matched, including undefined and unknown runners? For all five real runners, every site in the diff matches the old set. No Critical findings.

**Verified equivalent (not findings):**
- **`storeLaunchHooks` bodies.** Each one has the same statements as the launcher branch it replaced.
  - The Steam bottle persist was already behind an awaited `import()`. Awaiting the hook does not change ordering or error propagation.
  - `resolveEpicOfflineMode` now runs only for legendary. That is equivalent, because the function returns `offlineMode` unchanged for every other runner.
  - The EOS overlay check still runs only for legendary on Linux.
  - `wrapperStoreEnv` and `appNameIndexFinders` match the old switches and their defaults.
- **Unknown-runner crash risk on backend sites.** Backend sites index `storeCapabilities[runner]` directly, so an unknown runner now throws where the old literal returned false. In every reachable path the runner is already validated or already dereferenced first:
  - `protocol.ts` uses `RUNNERS.safeParse` + `findGame`.
  - `steamFlowRegistration.handleLaunch` checks with `hasOwnProperty`.
  - The DM queue runs `pruneUnknownRunnerElements` at startup, and `addToQueue` reads `libraryManagerMap[runner]` first.
  - In `uninstaller`, `tools`, `wiki` and `shortcuts`, `libraryManagerMap[runner]` or `gameInfo.install` is read first.
  - The Steam `{} as GameInfo` sentinel is filtered by `dispatch.getGameInfo`. Where it can reach a converted site (wiki, shortcuts), it already threw earlier before this phase.
- **`hasCapability` on undefined runners in the frontend.** `!hasCapability(x, <steam-only flag>)` is identical to the old `x !== 'steam'` for undefined. The flip the caller warned about applies only to the "everything-except-X" flags (`hasStoreCatalog`, `canAddSteamShortcut`, `winePrefixToolsAvailable`). Every such site gets its runner from a typed prop, context or route that is never undefined at runtime:
  - `hasStatus` defaults the runner to `'sideload'`.
  - `GameContext` defaults to `'legendary'`.
  - `showInstallModal` defaults to `'legendary'`.
- **ESLint.** `eslint.config.mjs` has exactly one `no-restricted-syntax` entry (line 115), and none of the spread presets set the rule. So nothing is overwritten for the matched files. Scope and ignores match `SCOPE_FILES` / `SCOPE_IGNORES`.

The two Warnings are a weakened IPC trust-boundary check and the lint gate's name-based blind spot.

## Warnings

### WR-01: `redeemSteamKey` trust-boundary validation now accepts a non-string `store`

**File:** `src/backend/sidecar/steamAuthFlowRegistration.ts:255`

**Issue:** The block is documented as "WR-03's trust-boundary validation … ported VERBATIM … The renderer payload is untrusted at runtime despite its type contract". The old guard was `store !== 'steam'`, which accepted only the string `'steam'`.

The new guard is `!isStore(store as StoreKey | undefined, 'steam')`. The cast hides that `store` is `unknown`, and at runtime `isStore` also accepts an object and compares `subject.runner`. A payload of `{ store: { runner: 'steam' }, key: '…' }` now passes validation and reaches `SteamUser.redeemKey('steam', key)`.

- Old accepted set: `'steam'` (string only).
- New accepted set: `'steam'`, or any object whose `.runner === 'steam'`.

The redeem target is hard-coded, so the impact is limited. Still, the loosened shape check is the exact class of thing this block exists to reject, and the `as` cast keeps tsc from noticing.

**Fix:** Restore the string check at the boundary.

```ts
if (
  typeof store !== 'string' ||
  !isStore(store, 'steam') ||
  typeof key !== 'string' ||
  key.length === 0
) {
  return { store: 'steam', outcome: 'error', message: 'invalid-request' }
}
```

### WR-02: The runner-literal ban is name-based, so live store-literal comparisons pass the gate and "ceiling 0" overstates coverage

**File:** `meta/runnerLiteralSelectors.cjs:44,57-85` (selector). Surviving sites:
- `src/backend/utils.ts:455,461,476`
- `src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx:72`
- `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx:135`
- `src/frontend/screens/Library/components/FocusRowStrip/index.tsx:228`
- `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts:84`

**Issue:** The selectors only fire when the compared operand's name matches `^(runner|store)$|[a-z0-9]Runner$|[a-z0-9]Store$`. Runner-valued variables under any other name bypass the `error` rule silently. Concretely:

- `clearCache(library?: 'gog' | 'legendary' | 'nile')` compares `library === 'gog'`, `=== 'legendary'` and `=== 'nile'`. That is runner identity in backend code, and it was never counted.
- The store-facet code compares `value === 'sideload'` and `descriptor.value === 'sideload'` / `focusRow.value === 'sideload'` (`StoreFacetValue` is a runner subset). None of these are listed in 62-SITE-CLASSIFICATION.md.

Structural blind spots, which `pnpm lint` stays green on:
- computed access (`gameInfo['runner'] === 'steam'`)
- a bare-identifier cast (`(runner as string) === 'steam'`)
- `.indexOf` / `new Set([...]).has(runner)`
- names such as `runnerStr`, `storeName`, `storeKey`, `library`, `value`

Phase 62 reports the ban as complete at 0 sites, but the gate cannot see these.

**Fix:** Two parts.
1. Convert the seven listed sites to `isStore(...)` (identity).
2. Widen the selector: add `library` to `RUNNER_NAME`, add arms for `[left.type='TSAsExpression']` with `left.expression.name` and for computed `property.value='runner'`, and add `indexOf` / `has` call shapes.

If you deliberately keep the name heuristic, document the known blind spots in the selector header so the "0" is read correctly.

## Info

### IN-01: `isSteam` proxies pick one capability flag for many unrelated decisions

**File:** `src/frontend/screens/Game/GameSubMenu/index.tsx:110`, `src/frontend/screens/Library/components/GameCard/index.tsx:361`

**Issue:**

`GameSubMenu` sets `isSteam = !hasCapability(runner, 'winePrefixToolsAvailable')`, then uses it to gate nine unrelated choices:
- the ProtonDB link by appId (`appNameIsSteamAppId`, line 403)
- the import entry (495)
- Steam-delegated uninstall with no GameLib confirm (541)
- "Remove all copies" (565)
- update / move / change-location (578-597)
- add-to-Steam (`canAddSteamShortcut`, 634)

`GameCard` sets `isSteam = hasCapability(runner, 'canBeDelisted')` and uses it to hide cancel (288, 449), which is an `installManagedExternally` decision.

The runner set is identical today. But this bypasses the table's purpose: a future store that lacks wine tools would silently get Steam's uninstall path. Because `winePrefixToolsAvailable` is an "everything-except" flag, `isSteam` is also `true` for an undefined runner, where it used to be `false`.

**Fix:** Replace `isSteam` with the flag that names each decision. For example, use `hasCapability(runner, 'installManagedExternally')` for the uninstall delegation and cancel-hide, and `canAddSteamShortcut` for add-to-Steam.

### IN-02: Two different flags guard the same `steam-incomplete` / install-surface concept

**File:**
- These use `installManagedExternally`: `src/frontend/hooks/hasStatus.ts:185`, `src/frontend/hooks/constants.ts:73`, `src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts:17`, `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:136`.
- These use `installHandOffToClient`: `src/frontend/screens/Game/GamePage/components/GameStatus.tsx:243`, `src/frontend/screens/Game/GamePage/components/MainButton.tsx:281`, `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:212,409`.

**Issue:** The status producer (`hasStatus`) and the label consumers (`GameStatus`, `MainButton`) decide "resume install" using different flags. Likewise, the ConsoleMode overlay's probe effect and its render branch use different flags. The two flags are identical today. If they ever diverge, the producer and consumer disagree: a context gets set that nothing renders, or a branch renders with no probe.

**Fix:** Pick one flag per concept. `installManagedExternally` fits the resume/poller state; keep `installHandOffToClient` only for the install-start dispatch. Then align the listed sites.

### IN-03: Empty side-effect import left behind

**File:** `src/frontend/screens/Settings/sections/LogSettings/index.tsx:18`

**Issue:** `import {} from 'common/storeCapabilities'` is a leftover from the conversion: the site became a `Partial<Record>` lookup and uses no export. It still forces the module into the import graph as a side-effect import.

**Fix:** Delete the line.

### IN-04: `Record` lookups that replaced `switch` defaults do not guard own-property access

**File:**
- `src/backend/sidecar/oauthLoginCapture.ts:198`
- `src/frontend/helpers/storeDisplayName.ts:28`, reached from `src/frontend/screens/WebView/components/TauriLoginPanel.tsx:50` with a route-param string cast `as Runner`
- `src/frontend/components/UI/StoreLogos/index.tsx:24`
- `src/frontend/screens/Settings/sections/LogSettings/index.tsx` (`labelByRunner[...]`)

**Issue:** A plain `map[key]?.()` / `map[key] ?? other` walks the prototype chain. So `toString`, `constructor` or `hasOwnProperty` do not fall through to the old `default`.

For example, `OAUTH_REDIRECT_MATCHERS['toString']?.(parsed, url)` returns the string `"[object Object]"` as a "match". That contradicts the line-197 comment ("Preserve the old `default: return null` for a runner that slips past the type"). Today this is unreachable: `oauthLoginFlowRegistration` validates with `isKnownRunner`, and the other inputs are internal. `hasCapability` already does this correctly with `hasOwnProperty`.

**Fix:** Guard with `Object.hasOwn(map, key)`, or build these maps with `Object.freeze(Object.assign(Object.create(null), {...}))`, so the comment's claim holds.

---

_Reviewed: 2026-11-06T18:38:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
