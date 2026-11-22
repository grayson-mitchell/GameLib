---
phase: quick-261122-rgi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/common/types/steam.ts
  - src/common/types/game_manager.ts
  - src/common/types/ipc/install.ts
  - src/common/types/ipc/ipcSchemaSnapshot.json
  - src-tauri/src/ipc_contract.rs
  - src/preload/api/misc.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/storeManagers/steam/optInDlc.ts
  - src/backend/storeManagers/steam/gameInstallDepot.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/updateBridge.ts
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
  - src/backend/storeManagers/steam/depotRust/retire.ts
  - src/backend/storeManagers/steam/depotRust/install.ts
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/optInDlc.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  - meta/knip-baseline.txt
  - src/backend/__tests__/steamAuthSessionPolicy.test.ts
  - src/backend/storeManagers/steam/__tests__/optInDlc.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/updateBridge.test.ts
  - src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
  - src/frontend/state/__tests__/InstallGameModal.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/optInDlc.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx
  - .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
  - .planning/todos/completed/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
autonomous: true
requirements:
  - TODO-2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog

estimate:
  tokens: 190000
  raw_tokens: 190000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-01: when GameLib's own depot installer will run the install (native installs on, or a bottle/bridge route), the Steam install dialog shows an 'Optional content' group with one unticked tick per owned opt-in DLC (name and size); ticked DLC ids reach buildDepotRefs as the enabled opt-in set and their depots download with the fresh install"
    - "With nothing ticked, a fresh install selects exactly the depots it selects today (opt-in DLC depots still skipped, quick 261120-st3)"
    - "D-01: on a bridge install, switching an opt-in DLC row on queues an update that downloads that DLC's depots into the existing install; the switch reads on only once the backend reports the depots installed"
    - "D-02: switching a row off queues an update that deletes that DLC's depot files and drops the depots from the ACF, because decideRetirement retires depots named in its new disabled input instead of keeping them as still-on-branch"
    - "On a Steam-registered or bottled-Steam install the rows show the DLC state read-only, with a reason pointing at Steam (Phase 74: GameLib's delta updater runs on bridge installs only)"
    - "D-03: the enabled state is read from installed depots alone; no new store, no per-game setting and no new ACF key is written"
    - "Listing opt-in DLC never opens a signed-in Steam session: anonymous PICS first, else a session that is already open"
  artifacts:
    - path: src/backend/storeManagers/steam/optInDlc.ts
      provides: "getSteamOptInDlc(deps, appId, opts): owned opt-in DLC with name, size, installed state and who manages the copy"
      contains: "export async function getSteamOptInDlc"
    - path: src/backend/storeManagers/steam/depot/select.ts
      provides: "listOptInDlc and optInDepotsOfDlc pure helpers"
      contains: "export function listOptInDlc"
    - path: src/backend/storeManagers/steam/depot/planModel.ts
      provides: "DownloadSteamDepotsOpts.chosenOptInDlc"
      contains: "chosenOptInDlc?:"
    - path: src/backend/storeManagers/steam/depotRust/retire.ts
      provides: "decideRetirement disabledOptInDepots input"
      contains: "disabledOptInDepots"
    - path: src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx
      provides: "Install tab 'Optional content' switch rows"
      contains: "SwitchRow"
    - path: src/frontend/screens/Library/components/InstallModal/SteamDialog/optInDlc.ts
      provides: "pure helpers for the dialog's opt-in DLC ticks"
  key_links:
    - from: src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
      to: src/frontend/state/InstallGameModal.ts
      via: "installSteamGame(..., optInChoice) puts steamOptInDlc in the install payload"
      pattern: "installSteamGame\\("
    - from: src/backend/downloadmanager/utils.ts
      to: src/backend/storeManagers/steam/gameInstallDepot.ts
      via: "installQueueElement forwards steamOptInDlc into install(); runNativeDepotDownloadLeased turns it into chosenOptInDlc"
      pattern: "steamOptInDlc"
    - from: src/backend/storeManagers/steam/depot/plan.ts
      to: src/backend/storeManagers/steam/depot/select.ts
      via: "buildDepotRefs: chosenOptInDlc replaces the installed-derived enabled set; dropped DLC depots become optInRetiredDepots"
      pattern: "chosenOptInDlc"
    - from: src/backend/storeManagers/steam/depotRust/install.ts
      to: src/backend/storeManagers/steam/depotRust/retire.ts
      via: "decideRetirement({ ..., disabledOptInDepots: refs.optInRetiredDepots })"
      pattern: "disabledOptInDepots"
    - from: src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx
      to: src/backend/storeManagers/steam/games.ts
      via: "updateGame({ ..., steamOptInDlc }) -> download queue 'update' -> SteamGame.update -> updateBridgeGame({ optInDlc })"
      pattern: "steamOptInDlc"
    - from: src/backend/sidecar/installFlowRegistration.ts
      to: src/backend/storeManagers/steam/optInDlc.ts
      via: "the getSteamOptInDlc invoke channel"
      pattern: "getSteamOptInDlc"
---

<objective>
Give opt-in Steam DLC (a DLC whose depots carry `config.optionaldlc`, e.g. Dota 2 Workshop Tools
313250 / depot 381450) an enable path in GameLib, as the operator decided in 261122-rgi-CONTEXT.md:

- D-01: an "Optional content" tick per owned opt-in DLC in the Steam install dialog (fresh install),
  and an "Optional content" switch row per owned opt-in DLC on the game page's Install tab
  (add to an existing install / remove).
- D-02: switching off deletes that DLC's depot files now and drops the depots from the ACF;
  `decideRetirement` gets an explicit disabled input.
- D-03: installed depots are the only record of "enabled"; no new store, no per-game setting, no
  new ACF key.

Purpose: after quick 261120-st3/tbr GameLib keeps an opt-in DLC that Steam enabled, but cannot enable
or disable one itself.
Output: the `steamOptInDlc` install/update field, `DownloadSteamDepotsOpts.chosenOptInDlc`, the
`getSteamOptInDlc` IPC, the dialog ticks, the Install tab rows, the retirement path, tests, and the
closed source todo.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261122-rgi-opt-in-dlc-enable-path-in-the-install-di/261122-rgi-CONTEXT.md
@.planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
@.planning/quick/261120-tbr-opt-in-dlc-depots-treat-installed-opt-in/261120-tbr-SUMMARY.md
@.planning/quick/261120-st3-honour-config-optionaldlc-in-steam-depot/261120-st3-SUMMARY.md

Load `Skill("gamelib-conventions")` (prettier rule for `<verify>`, sidecar exit contract) and
`Skill("sketch-findings-gamelib")` → `references/game-page.md` §2 and §4 (Install tab groups,
switch rows: noun labels that never flip, pending inside the row, inline failure with Retry, a
group renders only when a row applies).

## Working-tree rules (READ FIRST)

The main working tree carries ~90 unrelated uncommitted Phase 85 changes (store versioning,
`src/backend/cache.ts`, `src/backend/storeManagers/steam/library/rustRefresh.ts`,
`src/backend/__tests__/diPhaseGates.test.ts`, meta/gen* scripts, deleted storeMigrations fixtures,
...), and another session may be committing Phase 85 work while you run. Therefore:

- Stage ONLY the paths you wrote, each by explicit path (`git add <path> <path> ...`). Never
  `git add -A`, `git add .`, `git commit -a`, `git stash`, `git checkout -- <path>`, `git restore` or
  `git reset` on anything you did not write. Do not edit, format or revert any file outside
  `files_modified`.
- A gsd-tools / gsd-sdk `commit` call sweeps every dirty `.planning/` file unless given `--files`;
  use plain `git commit` after explicit `git add`, or pass `--files`.
- `.husky/pre-commit` runs prettier on staged content and, when a staged path is under
  `src/common/types/ipc/` or is `src-tauri/src/ipc_contract.rs`, `pnpm -s check:ipc-contract`.
- `pnpm codecheck` passes on the current tree (measured at planning time); if it fails on a file
  you did not touch, record it and carry on, do not fix it.
- After code changes, run `graphify update .` (AST-only).

## Baselines measured at planning (working tree, 2026-11-22)

- Task 1 suites (depot.test, depot.cmPlan.test, games.test, downloadmanager utils.test,
  ipcSchemas/install.test, flowRegistrationCensus.test, ipcDomainCensus.test,
  steamAuthSessionPolicy.test): 8 suites passed, 1155 tests.
- Task 2 suites (steamDialogSource.test, InstallGameModal.test): 2 suites passed, 151 tests.
- Task 3 suites (depotJobInputs.test, rustInstall.test, updateEstimate.test, updateBridge.test,
  updateDispatch.test, installTabRows.test, installTabSource.test): 7 suites passed, 139 tests.
- `pnpm -s lint-translations:gamelib`: "0 hard failures". `pnpm -s check:ipc-contract`: up to date.

## Design decisions taken under Claude's discretion (documented, not locked)

1. Field name. One new optional field `steamOptInDlc?: string[]` carries the user's opt-in choice
   on both the install and the update payload: "the complete set of opt-in DLC appIds the user wants
   enabled". Absent means "no choice made" (a fresh install enables none, an update keeps the
   installed set). `installDlcs` is NOT reused: the queue's cancel path calls
   `removeFromQueue(dlc, true)` for every `installDlcs` entry, which would send stray 'done' status
   updates for DLC appIds.
2. One opts field, not two. `DownloadSteamDepotsOpts.chosenOptInDlc?: ReadonlySet<string>`, when
   present, REPLACES the installed-derived enabled set (`optInDlcOfInstalledDepots`). Installed-derived
   minus chosen is the set the user disabled; its installed depots become `optInRetiredDepots`.
3. Who may change an existing install. GameLib runs the add/remove only on bridge installs, through
   the existing bridge delta update (`updateBridgeGame`), because Phase 74 locked "the delta updater
   is for bridge games only; Steam-registered games are always updated by Steam" and Phase 17
   bottled-Steam installs are updated by Steam inside the bottle. On those installs the rows render
   read-only with a reason. The add/remove job is a delta update to the branch's current build plus
   the opt-in change: on a current game only the DLC's depots move; on a stale game the update rides
   along, as Steam itself does when a DLC is enabled.
4. Ownership. Steam ownership needs the licence list, which needs a signed-in session; CLAUDE.md
   allows opening that session only on demand. `getSteamOptInDlc` therefore asks
   `acquireOpenAuthenticated` (never logs on). With a session open, `owned` is true/false; without one
   it is `null` (unknown). Both surfaces show entries whose `owned !== false`. An unowned DLC that is
   ticked or switched on downloads nothing (the depot ownership gate in `selectDepots` drops it), and
   the Install tab row then reports the failure inline.
5. Sizes are the sum of the DLC's depot manifest sizes on the branch for the target OS (oslist absent
   or containing it); an opt-in DLC with no depot for the target OS is not listed (on a Mac-native
   Dota 2 the Windows-only Workshop Tools never shows).

## Interfaces the executor needs (current code, extracted at planning)

- `select.ts`: `optInDlcOfInstalledDepots(appinfo, dlcInfos, installedDepotIds): Set<string>`;
  `optInDlcNotEnabled(dlcInfos, enabled)` (not exported); `branchManifestGid(depot, branch, depotId?, { log })`;
  `dlcAppIds(appinfo): number[]`; `SteamAppInfo { depots?, extended?: { listofdlc?, optionaldlc? } }`;
  `DepotConfig.optionaldlc?: string | number`.
- `plan.ts`: `getOwnedSets(client): Promise<OwnedSets>` (module-private today, L203);
  `buildDepotRefs(appId, opts)` L462-595 computes `enabledOptInDlc` at L520-538;
  `DepotRefsResult` L379-396; `installedDepotIdsOf(opts)` L455.
- `planModel.ts`: `DownloadSteamDepotsOpts` L77-106 (`delta`, `installedDepotIds`).
- `retire.ts`: `decideRetirement({ appId, oldGidByDepot, refs, acfDlcOwner }): RetireDecision`,
  branches: selected → skipped → list-incomplete → still-on-branch → dlc-not-fetched → retire.
- `depotRust/install.ts` L205-257: the `if (opts.delta)` retire block calls `decideRetirement`, then
  `fetchDepotKey(client, { id, manifest, size: 0, ownerAppId })` per retired depot.
- `gameInstallDepot.ts` L545-553: the only `downloadSteamDepots(steamGame.appId, {...})` call; every
  GameLib depot install (native, bottle-native, bridge) passes through it with `args: InstallArgs`
  in scope.
- `updateBridge.ts`: `updateBridgeGame(steamGame, opts?: { unattended?: boolean })` →
  `runBridgeUpdate(steamGame, title, unattended)`; `freshCachedEstimate`; `estimateBridgeUpdate(steamGame, { signal, unattended })`;
  `downloadSteamDepotsRust(appId, { ..., delta: { oldGidByDepot } })`.
- `updateEstimate.ts` L95-106: `depotOpts` with `installedDepotIds`; `resolveBridgeUpdateContext(steamGame)`
  → `{ bridgeBottleName, steamappsDir, installdir, branch, oldGidByDepot }`.
- `games.ts` L485: `async update(overwrites?: { unattended?: boolean })`; bridge test is
  `bridgeBottle.findBridgeInstallBottle(this.deps.paths, this.appId)`; `isNative(): boolean` L352.
- `common/types/game_manager.ts` L81: `update: (updateOverwrites?: { build?, branch?, language?, dlcs?, dependencies?, unattended? })`.
- `downloadmanager/utils.ts`: `installQueueElement` destructure + the FIXED `install({...})` literal
  (L139-155, L258-270); `updateQueueElement`'s `update({...})` literal L512-519.
- `common/types/ipc/install.ts`: `installFields` (shared by `install` and `updateGame`, both
  `z.strictObject`), `installAsyncArgs`, `InstallAsyncReturns`; `stringList`.
- `installFlowRegistration.ts` L325-338: the `getSteamUpdateInfo` handler is the pattern
  (`managerDepsFromServices(deps)`, numeric appId check, return null on a bad id).
- `preload/api/misc.ts` L29: `export const getSteamUpdateInfo = makeHandlerInvoker('getSteamUpdateInfo')`.
- `anonymousClient.ts`: `deps.anonymousClient.get(reason)` → `getProductInfo(apps, packages, inclTokens)`;
  `isPublicOnlyEntry(entry)`. `installLocation.ts` `fetchInstalldir` L240-300 is the
  anonymous-first, open-session-fallback pattern to copy. `withTimeout`, `STEAM_PICS_TIMEOUT_MS`
  (25 s), `STEAM_PICS_BULK_TIMEOUT_MS` (90 s) from `steam/withTimeout.ts`.
- `steamAuthSessionPolicy.test.ts` L94 `ACQUIRE_OPEN_ALLOW`: every file calling
  `acquireOpenAuthenticated(` must be listed. `AuthSessionReason` has no listing value; pass
  `'user-install'` (it is a log label; the call never logs on).
- `gameRequirements.ts`: `hostSteamDepotOs(): string`.
- Frontend: `installSteamGame(appName, gameInfo, path = '', forceWindowsViaBottle = false)` in
  `frontend/state/InstallGameModal.ts` L134-150; `ToggleSwitch` props `{ htmlId, handleChange, value, title, description?, disabled? }`;
  `SwitchRow` / `RowFailure` in `InstallTab/SwitchRow.tsx`; `useRowAction` in
  `GamePage/actions/rowAction.ts`; `IntegrationRows.tsx` is the group pattern
  (`section.installGroup`, `h3.installGroup__title`); `InstallTab/index.css` already has
  `.installNote` (neutral accent-tinted note); GameContext `is.updating`, `is.queued`, `is.installing`.
- SteamDialog source gates (`steamDialogSource.test.ts`, run on comment-stripped source): exactly one
  `disabled=` term; no `frontend/helpers` import; no `diskSize`/`getInstallInfo`/`writeConfig`/
  `listSteamLibraryTargets` tokens; the FIRST `let cancelled = false` must stay Effect B; no colocated
  stylesheet; region order (degrade notice before `{children}`, shared-bottle notice after it,
  content-light notice after the shared-bottle notice).
- i18n: new keys go into `public/locales/en/gamelib.json` by hand, then regenerate the presence
  baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` (never hand-edit
  the baseline).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): a chosen opt-in DLC travels from the install IPC to depot selection, and the renderer can list owned opt-in DLC</name>
  <files>src/common/types.ts, src/common/types/steam.ts, src/common/types/ipc/install.ts, src/common/types/ipc/ipcSchemaSnapshot.json, src-tauri/src/ipc_contract.rs, src/preload/api/misc.ts, src/backend/sidecar/installFlowRegistration.ts, src/backend/downloadmanager/utils.ts, src/backend/storeManagers/steam/gameInstallDepot.ts, src/backend/storeManagers/steam/depot/planModel.ts, src/backend/storeManagers/steam/depot/plan.ts, src/backend/storeManagers/steam/depot/select.ts, src/backend/storeManagers/steam/optInDlc.ts, src/backend/__tests__/steamAuthSessionPolicy.test.ts, meta/knip-baseline.txt, src/backend/storeManagers/steam/__tests__/optInDlc.test.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts, src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/sidecar/__tests__/ipcSchemas/install.test.ts, src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts, src/backend/sidecar/__tests__/ipcDomainCensus.test.ts</files>
  <read_first>src/backend/storeManagers/steam/depot/select.ts, src/backend/storeManagers/steam/depot/plan.ts (L197-283, L379-595), src/backend/storeManagers/steam/depot/planModel.ts, src/backend/storeManagers/steam/gameInstallDepot.ts (L418-560), src/backend/downloadmanager/utils.ts (L128-290, L455-545), src/common/types/ipc/install.ts, src/backend/sidecar/installFlowRegistration.ts (L230-340), src/backend/storeManagers/steam/installLocation.ts (L230-300), src/backend/storeManagers/steam/updateInfo.ts, src/backend/storeManagers/steam/depotRust/updateEstimate.ts (L30-61), the existing `261120-tbr` describe blocks in depot.test.ts and depot.cmPlan.test.ts</read_first>
  <behavior>
    - listOptInDlc (select.ts): a Dota-shaped fixture (base 570 with depot 381450 `config.optionaldlc` 313250 and `config.oslist` windows, manifest size 5.9e9; DLC 313250 appinfo with `extended.optionaldlc` "1" and `common.name` "Dota 2 Workshop Tools") listed for os windows returns one entry {appId "313250", name "Dota 2 Workshop Tools", bytes 5.9e9, depotIds ["381450"]}; for os macos it returns none
    - listOptInDlc: a DLC with `extended.optionaldlc` absent or "0" is never listed; a depot defined in the DLC app's own `depots` counts; a depot with no manifest on the branch is not counted; a DLC with no appinfo name falls back to a non-empty label
    - optInDepotsOfDlc (select.ts): returns {depotId, ownerAppId, dlcAppId} for every depot whose `config.optionaldlc` is in the given set, ownerAppId = the base appId for base-app depots and the DLC record key for DLC-app depots
    - buildDepotRefs: `chosenOptInDlc: {'313250'}` on a fresh install (no installed set) selects depot 381450 under owner 570; absent `chosenOptInDlc` and no installed set skips it (unchanged); an empty chosen set with depot 381450 installed (installedDepotIds) does NOT select it (chosen replaces the installed-derived set)
    - installQueueElement forwards `steamOptInDlc` from the queue params into `install()` unchanged
    - runNativeDepotDownloadLeased passes `chosenOptInDlc` = the digit-only ids of `args.steamOptInDlc` when there is at least one, and omits the key otherwise
    - getSteamOptInDlc: non-numeric appId → null; anonymous PICS answers → entries with owned null when no session is open, owned true/false from the licence-derived owned set when `acquireOpenAuthenticated` returns a lease (released in finally); a public-only or missing anonymous base entry with no open session → null; an installed bridge copy → manage 'gamelib' and `installed` true for a DLC whose depot is in the ACF; an installed non-bridge copy → manage 'steam'; not installed → manage 'not-installed'; it never calls `acquireAuthenticated`; any thrown error → null
    - the install and updateGame schemas accept `steamOptInDlc`; the new `getSteamOptInDlc` channel validates `[appId, { windowsBuild }?]`
  </behavior>
  <action>
Write the tests first (describe names carry `261122-rgi`), see them fail, then implement.

Shared types (per D-01, D-03). In `src/common/types.ts` add `steamOptInDlc?: string[]` to `InstallArgs` (so `InstallParams` inherits it) and to `UpdateParams`, with a JSDoc: the complete set of opt-in DLC appIds the user wants enabled (quick 261122-rgi); absent = no choice (a fresh install enables none, an update keeps what is installed); Steam only, other runners ignore it. In `src/common/types/steam.ts` add `SteamOptInDlcEntry { appId: string; name: string; bytes: number; owned: boolean | null; installed: boolean }` and `SteamOptInDlcInfo { manage: 'gamelib' | 'steam' | 'not-installed'; entries: SteamOptInDlcEntry[] }`.

IPC. In `src/common/types/ipc/install.ts` add `steamOptInDlc: stringList.optional()` to `installFields` (this covers `install` and `updateGame`, both strict objects, so a retried update re-sending queue params still validates). Add channel `getSteamOptInDlc: z.tuple([nonEmptyString(), optionalArg(z.strictObject({ windowsBuild: z.boolean() }))])` to `installAsyncArgs` and `getSteamOptInDlc: Promise<SteamOptInDlcInfo | null>` to `InstallAsyncReturns`. In `src/preload/api/misc.ts` add `export const getSteamOptInDlc = makeHandlerInvoker('getSteamOptInDlc')` next to `getSteamUpdateInfo`. In `src/backend/sidecar/installFlowRegistration.ts` register a `getSteamOptInDlc` handler shaped like `getSteamUpdateInfo`'s: numeric-appId check (else null), read `windowsBuild === true` from args[1], call `getSteamOptInDlc(managerDepsFromServices(deps), appId, { windowsBuild })`, and update this file's header list of channels. Run `pnpm gen:ipc-contract` to regenerate `src-tauri/src/ipc_contract.rs` and `src/common/types/ipc/ipcSchemaSnapshot.json` (stage both). Update the census/schema tests (`flowRegistrationCensus.test.ts`, `ipcDomainCensus.test.ts`, `ipcSchemas/install.test.ts`) only where they enumerate channels or fields, and add schema cases for the new field and channel.

Queue (install half). In `downloadmanager/utils.ts` `installQueueElement`, add `steamOptInDlc` to the params destructure and to the FIXED `install({...})` literal, with a one-line comment in the style of the `steamForceWindowsViaBottle` note (a field omitted from this literal is silently dropped). Leave the update literal for Task 3.

Depot plan (per D-01, D-03). In `planModel.ts` add `chosenOptInDlc?: ReadonlySet<string>` to `DownloadSteamDepotsOpts`: when present it is the complete enabled opt-in DLC set and replaces the installed-derived one; fresh-install ticks and the Install tab's add/remove supply it. In `plan.ts` `buildDepotRefs`, keep computing the installed-derived set with `optInDlcOfInstalledDepots(appinfo, dlcInfos, installedDepotIdsOf(opts))`, then use `opts.chosenOptInDlc` instead when it is defined; pass the result as `enabledOptInDlc` only when non-empty (unchanged shape); log one ids-only line when a chosen set is in use, e.g. `buildDepotRefs: chosen opt-in DLC <ids or none> for app <appId>` (no SteamID64, no keys). Export `getOwnedSets` (body unchanged) for the listing module.

Selection helpers (select.ts). Add optional `common?: { name?: string }` to `SteamAppInfo`. Add exported pure `optInDepotsOfDlc(appinfo, dlcInfos, baseAppId, dlcIds: ReadonlySet<string>)` returning `Array<{ depotId: string; ownerAppId: string; dlcAppId: string }>` over the base app's depots (owner = baseAppId) and each DLC record's own depots (owner = that record key), digit-only depot ids, matching `String(config.optionaldlc)` against `dlcIds`, deduped by depot id. Add exported pure `listOptInDlc(appinfo, dlcInfos, baseAppId, opts: { os: string; branch?: string })` returning `Array<{ appId; name; bytes; depotIds }>`: for each DLC record whose own `extended.optionaldlc` is "1", the depots naming it (via `optInDepotsOfDlc`) that have a branch manifest (`branchManifestGid(d, branch, id, { log: false })`, branch default 'public') and whose `config.oslist` is absent or lists `opts.os`; skip a DLC with no such depot; bytes = the sum of those manifests' `size` (same `typeof m === 'object'` read as `selectDepots`); name = the DLC's `common.name`, else `DLC <appId>`. Neither helper reads the legacy depot-level `optional`/`dlcappid`/`systemdefined` flags, and neither logs; keep the D-02 census in depot.test.ts green. Extend the header comment by one paragraph naming quick 261122-rgi.

Install pass-through (per D-01). In `gameInstallDepot.ts` at the `downloadSteamDepots(steamGame.appId, {...})` call, filter `args.steamOptInDlc` to digit-only strings; when at least one remains add `chosenOptInDlc: new Set(those)` and log one ids-only line; otherwise add nothing, so a fresh install with nothing ticked is byte-identical to today.

Listing module (new `src/backend/storeManagers/steam/optInDlc.ts`, per D-01, D-03). Header comment: purpose, the exit contract (no timers or handles of its own; `withTimeout`'s timer is the only one), and that it never opens a signed-in session. Export `getSteamOptInDlc(deps: ManagerDeps, appId: string, opts: { windowsBuild?: boolean } = {}): Promise<SteamOptInDlcInfo | null>`, never throwing (catch → `logWarning` ids-only → null). Steps: reject a non-numeric appId (null). Resolve the copy: `findBridgeInstallBottle(deps.paths, appId)` → manage 'gamelib', os 'windows', installed ids = keys of `resolveBridgeUpdateContext(new SteamGame(appId, deps)).oldGidByDepot`; else if the library entry is installed → manage 'steam', os = `isNative()` ? `hostSteamDepotOs()` : 'windows', installed ids from `readAcfInstalledDepots(deps, <steamapps dir two levels above install.install_path>, appId)` (null → none installed); else manage 'not-installed', os = `opts.windowsBuild` ? 'windows' : `hostSteamDepotOs()`, no installed ids. Fetch the base appinfo anonymously first (`deps.anonymousClient.get('opt-in-dlc')` bounded by `withTimeout(..., STEAM_PICS_TIMEOUT_MS, ...)`, then `getProductInfo([n], [], true)` bounded the same way), copying `fetchInstalldir`'s shape. Separately call `deps.steamUser.acquireOpenAuthenticated('user-install')` once (it never logs on); if the anonymous base entry is missing or `isPublicOnlyEntry`, read the base appinfo through that open lease instead; with neither, return null. Read the DLC appinfos for `dlcAppIds(appinfo)` through the same client that answered the base (bulk timeout); call `listOptInDlc` with the resolved os and branch ('public', or the bridge context's branch). Ownership: with an open lease, `getOwnedSets(lease.client)` (a failure leaves owned null, not an error) and owned = owned.apps has the DLC id or owned.depots has one of its depot ids; without a lease owned is null. installed = any of the entry's depotIds is in the installed ids. Release the lease in `finally`. Never call `acquireAuthenticated`. Add `optInDlc.ts` to `ACQUIRE_OPEN_ALLOW` in `src/backend/__tests__/steamAuthSessionPolicy.test.ts`. Tests in the new `__tests__/optInDlc.test.ts` mock the anonymous client, the open-lease call and the ACF/bridge readers.

Run `pnpm find-deadcode`; if it reports the new preload export (or another new export of this task) as a new finding the way `Misc.getSteamUpdateInfo` is recorded, append the matching line to `meta/knip-baseline.txt` in the existing format, and only that line.

Commit with explicit paths: `feat(quick-261122-rgi): carry opt-in DLC choices from the install payload into depot selection; list owned opt-in DLC`, ending with the attribution lines your session supplies.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/sidecar/__tests__/ipcSchemas/install.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/backend/__tests__/steamAuthSessionPolicy.test.ts src/backend/storeManagers/steam/__tests__/optInDlc.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [HEAD: 8 suites passed, 1155 tests (optInDlc.test.ts absent); EXPECT 9 suites passed, >1155 tests, 0 failed]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/storeManagers/steam/__tests__/optInDlc.test.ts -t '261122-rgi' --verbose 2>&1 | grep -c '✓'   [HEAD=0 EXPECT>=14]</automated>
    <automated>grep -c 'chosenOptInDlc?:' src/backend/storeManagers/steam/depot/planModel.ts   [HEAD=0 EXPECT==1]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/gameInstallDepot.ts | grep -c 'chosenOptInDlc'   [HEAD=0 EXPECT>=1]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/optInDlc.ts | grep -c 'acquireAuthenticated('   [HEAD: file absent; EXPECT==0]</automated>
    <automated>pnpm -s check:ipc-contract</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/common/types.ts src/common/types/steam.ts src/common/types/ipc/install.ts src/preload/api/misc.ts src/backend/sidecar/installFlowRegistration.ts src/backend/downloadmanager/utils.ts src/backend/storeManagers/steam/gameInstallDepot.ts src/backend/storeManagers/steam/depot/planModel.ts src/backend/storeManagers/steam/depot/plan.ts src/backend/storeManagers/steam/depot/select.ts src/backend/storeManagers/steam/optInDlc.ts src/backend/__tests__/steamAuthSessionPolicy.test.ts src/backend/storeManagers/steam/__tests__/optInDlc.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/sidecar/__tests__/ipcSchemas/install.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts   (ipcSchemaSnapshot.json is prettier-ignored and ipc_contract.rs / knip-baseline.txt have no parser: omitted on purpose; drop any test path you did not modify)</automated>
  </verify>
  <done>A queued Steam install whose payload carries `steamOptInDlc: ['313250']` reaches `buildDepotRefs` as `chosenOptInDlc` and selects the opt-in depot; with no choice, selection is unchanged; `window.api.getSteamOptInDlc(appId, { windowsBuild })` returns owned/unknown opt-in DLC with name, bytes, installed and manage, without ever opening a signed-in session; the IPC contract is regenerated and fresh; all listed suites pass; committed by explicit path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: install dialog "Optional content" ticks pass the chosen DLC into the install (D-01)</name>
  <files>src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/SteamDialog/optInDlc.ts, src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/optInDlc.test.ts, src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts, src/frontend/state/InstallGameModal.ts, src/frontend/state/__tests__/InstallGameModal.test.ts, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <read_first>src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx (whole file, once), src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts (L1-140 helpers, L336-520 gates, L747-800 region order), src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts, src/frontend/state/InstallGameModal.ts (L120-160), src/frontend/components/UI/ToggleSwitch/index.tsx</read_first>
  <behavior>
    - optInDlc.ts `shownOptInDlc(info)`: null/undefined → []; keeps entries with owned true or null, drops owned false
    - `toggleOptInChoice(choice, appId)`: adds a missing id, removes a present one, never duplicates, returns a new array
    - `pruneOptInChoice(choice, entries)`: drops ids no longer offered
    - `optInDlcSizeLabel(bytes)`: a positive byte count formats with the same base-2 filesize construction as diskSpaceLabels.ts; 0 or a non-finite value → undefined
    - installSteamGame with a 5th argument ['313250'] sends `steamOptInDlc: ['313250']` in the `window.api.install` payload; with the argument omitted or empty the payload carries no `steamOptInDlc` key (today's payload, byte-identical)
    - steamDialogSource gates: still exactly one `disabled=` term leading with eligibilityPending; new required-wiring tokens `window.api.getSteamOptInDlc(`, `gamelib:steam.install.optInDlc.title`, `toggleOptInChoice(` are present
  </behavior>
  <action>
Write the helper tests and the source-gate additions first, then implement.

New `SteamDialog/optInDlc.ts` (pure, no React, imports `filesize` directly and `SteamOptInDlcEntry`/`SteamOptInDlcInfo` from `common/types/steam`, never `frontend/helpers`): `shownOptInDlc`, `toggleOptInChoice`, `pruneOptInChoice`, `optInDlcSizeLabel` as in the behavior block. Test it in the new `SteamDialog/__tests__/optInDlc.test.ts` (describe names carry `261122-rgi`).

`InstallGameModal.ts`: give `installSteamGame` a 5th parameter `optInDlc: string[] = []`; include `steamOptInDlc: optInDlc` in the payload only when it is non-empty (per D-01: ticked ids go into the install; nothing ticked keeps today's payload). Update the JSDoc. Cover both shapes in `InstallGameModal.test.ts`. Other callers stay unchanged.

`SteamDialog/index.tsx` (per D-01):
- Add `const gamelibDepotInstall = nativeInstallOn || gating.wineSection` beside `signInRequired`, with a comment that it is the same "GameLib's own depot installer runs this install" predicate (the opt-in tick means nothing on a delegated steam://install or InstallApp hand-off, where Steam shows its own DLC ticks). Do not rewrite `signInRequired`.
- State `optInInfo` (SteamOptInDlcInfo | null) and `optInChoice` (string[]). A new effect, keyed on `[appName, gamelibDepotInstall, gating.wineSection]`, clears both, then (only when `gamelibDepotInstall`) calls `window.api.getSteamOptInDlc(appName, { windowsBuild: gating.wineSection })`, stores the answer, and on rejection logs through `window.api.logError` with the appName only and leaves the group hidden. Its cancellation flag must be named `optInCancelled`: the source gate locates Effect B by the first `let cancelled = false` in the file. Place the effect after Effect B.
- Derive `optInShown = shownOptInDlc(optInInfo)`; prune `optInChoice` against it when the list changes.
- Render, only when `gamelibDepotInstall && optInShown.length > 0`, an "Optional content" group placed after the library `SelectField` block and before the content-light notice: a heading (`gamelib:steam.install.optInDlc.title`, "Optional content"), a one-line note (`gamelib:steam.install.optInDlc.note`, "Steam doesn't download these unless you tick them."), then one `ToggleSwitch` per entry with `htmlId` `steam-opt-in-dlc-<appId>`, `title` = entry.name, `description` = `optInDlcSizeLabel(entry.bytes)`, `value` = whether `optInChoice` includes the id, `handleChange` = `setOptInChoice(toggleOptInChoice(...))`. Unticked by default. No `disabled` prop on these switches (the one-`disabled=` gate), no new stylesheet, no `frontend/helpers` import; use existing class names only.
- In `proceedInstall`, pass `gamelibDepotInstall ? optInChoice : []` as the 5th argument of `installSteamGame` and add `optInChoice`/`gamelibDepotInstall` to its dependency array. Keep every existing guard and ordering gate intact (persist before install, the dispatch outside the persist try).
- Extend `steamDialogSource.test.ts`'s required-wiring list with the three tokens in the behavior block, plus a comment naming quick 261122-rgi.

i18n: add the two keys above to `public/locales/en/gamelib.json` under `steam.install.optInDlc`, then run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` and stage the regenerated `meta/i18nCatalogPresenceBaseline.json`.

Commit with explicit paths: `feat(quick-261122-rgi): install dialog ticks for owned opt-in DLC`, ending with your session's attribution lines.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts src/frontend/state/__tests__/InstallGameModal.test.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/optInDlc.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [HEAD: 2 suites passed, 151 tests (optInDlc.test.ts absent); EXPECT 3 suites passed, >151 tests, 0 failed]</automated>
    <automated>grep -c 'window.api.getSteamOptInDlc(' src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx   [HEAD=0 EXPECT==1]</automated>
    <automated>grep -c 'toggleOptInChoice(' src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx   [HEAD=0 EXPECT>=1]</automated>
    <automated>pnpm -s lint-translations:gamelib 2>&1 | tail -1   [HEAD: "0 hard failures"; EXPECT "0 hard failures"]</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/screens/Library/components/InstallModal/SteamDialog/optInDlc.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/optInDlc.test.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts src/frontend/state/InstallGameModal.ts src/frontend/state/__tests__/InstallGameModal.test.ts meta/i18nCatalogPresenceBaseline.json   (public/locales/en/gamelib.json is prettier-ignored: omitted on purpose)</automated>
  </verify>
  <done>On a GameLib depot install route the dialog lists owned (or ownership-unknown) opt-in DLC as unticked ticks with name and size; ticked ids reach the install payload as `steamOptInDlc`; nothing ticked sends today's payload; all SteamDialog source gates stay green; committed by explicit path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Install tab "Optional content" rows add or remove a DLC on a bridge install; switching off retires its depots (D-01, D-02, D-03)</name>
  <files>src/backend/storeManagers/steam/depot/select.ts, src/backend/storeManagers/steam/depot/plan.ts, src/backend/storeManagers/steam/depotRust/retire.ts, src/backend/storeManagers/steam/depotRust/install.ts, src/backend/storeManagers/steam/depotRust/updateEstimate.ts, src/backend/storeManagers/steam/updateBridge.ts, src/backend/storeManagers/steam/games.ts, src/common/types/game_manager.ts, src/backend/downloadmanager/utils.ts, src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx, src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json, src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts, src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts, src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts, src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts, src/backend/storeManagers/steam/__tests__/updateBridge.test.ts, src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx, .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md, .planning/todos/completed/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md</files>
  <read_first>src/backend/storeManagers/steam/depotRust/retire.ts, src/backend/storeManagers/steam/depotRust/install.ts (L121-335), src/backend/storeManagers/steam/updateBridge.ts, src/backend/storeManagers/steam/depotRust/updateEstimate.ts (L63-130), src/backend/storeManagers/steam/games.ts (L485-520), src/frontend/screens/Game/GamePage/components/InstallTab/IntegrationRows.tsx, src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx, src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx, src/frontend/screens/Game/GamePage/actions/rowAction.ts (L1-60), the harness and one existing describe block of installTabRows.test.tsx, the decideRetirement cases in depotJobInputs.test.ts</read_first>
  <behavior>
    - decideRetirement: an installed depot listed in `disabledOptInDepots` and not selected is retired with the listed ownerAppId even when it is still on the branch and even when `branchDepotListComplete` is false; a selected depot is still kept 'selected'; with `disabledOptInDepots` absent every existing case is unchanged
    - buildDepotRefs: installed depot 381450 (opt-in DLC 313250) with `chosenOptInDlc` empty yields `optInRetiredDepots` [{depotId '381450', ownerAppId '570'}] and does not select it; with `chosenOptInDlc` {'313250'} it is selected and `optInRetiredDepots` is empty; with `chosenOptInDlc` absent the field is empty or absent
    - downloadSteamDepotsRust (delta): passes `refs.optInRetiredDepots` into decideRetirement, so the disabled depot's key is fetched under owner 570 and it lands in the job's retiredDepots
    - estimateBridgeUpdate forwards `chosenOptInDlc` into its buildDepotRefs opts
    - updateBridgeGame({ optInDlc }): skips the cached estimate, passes `chosenOptInDlc` to both the estimate and downloadSteamDepotsRust (still with `delta`), and on success notifies with the optional-content copy; without optInDlc its behaviour is unchanged
    - SteamGame.update({ steamOptInDlc: ['313250'] }) on a bridge install calls updateBridgeGame with optInDlc {'313250'}; on a non-bridge install it returns an error (Steam manages that copy) and starts nothing; non-digit ids are dropped
    - updateQueueElement forwards `steamOptInDlc` into update()
    - OptInDlcRows: renders nothing for a non-Steam runner, a not-installed game, a null answer or no shown entries; renders the "Optional content" group with one SwitchRow per entry with owned !== false (checked = installed); manage 'steam' rows are disabled with the Steam reason; toggling an off row on a 'gamelib' copy calls updateGame with `steamOptInDlc` = installed opt-in ids plus that id (off: minus it); the row is busy with "Adding…"/"Removing…" until the game leaves its busy status, then the list is re-read; a re-read that does not show the wanted state, or a rejected dispatch, shows the inline failure with Retry; other rows are disabled while one change runs
  </behavior>
  <action>
Write the tests first (describe names carry `261122-rgi`), see them fail, then implement.

Retirement (per D-02). In `retire.ts` add an optional input `disabledOptInDepots?: ReadonlyArray<{ depotId: string; ownerAppId: string }>` with a JSDoc: depots of opt-in DLC the user switched off (quick 261122-rgi, D-02); they are retired even though still on the branch, because the user asked for their files to go. In the loop, after the `selected` check and before `skipped`, retire a depot found in that list using its listed `ownerAppId` (not the ACF `dlcappid`: Steam keys depot 381450 under the base app, see 261120-tbr). Leave `KeptReason` and every other branch as is. Update the file header sentence that says still-listed depots are kept.

Plan (per D-02). In `plan.ts` add optional `optInRetiredDepots?: Array<{ depotId: string; ownerAppId: string }>` to `DepotRefsResult` (optional so existing fixtures need no change). In `buildDepotRefs`, when `opts.chosenOptInDlc` is defined, take the installed-derived DLC ids not in the chosen set, map them with `optInDepotsOfDlc(appinfo, dlcInfos, appId, dropped)` (Task 1), keep only depot ids in `installedDepotIdsOf(opts)`, and return them as `optInRetiredDepots` (ids-only log line when non-empty).

Job (per D-02). In `depotRust/install.ts` add `'optInRetiredDepots'` to the refs passed into `decideRetirement` and pass `disabledOptInDepots: refs.optInRetiredDepots`; widen the `refs` Pick in `retire.ts` accordingly. The existing key fetch and retire log line then cover it. Rust's delta job removes the retired files and its finalize writes InstalledDepots from the selected refs only, which drops the depot from the ACF (D-02); nothing in Rust changes.

Estimate and bridge update (per D-01, D-02). `estimateBridgeUpdate` opts gain `chosenOptInDlc?: ReadonlySet<string>`, forwarded into `depotOpts` when defined. `updateBridgeGame(steamGame, opts?: { unattended?: boolean; optInDlc?: ReadonlySet<string> })` threads `optInDlc` into `runBridgeUpdate`; there, when `optInDlc` is defined: skip `freshCachedEstimate` (it was computed without the change), pass it to `estimateBridgeUpdate`, add `chosenOptInDlc: optInDlc` to the `downloadSteamDepotsRust` opts beside `delta`, log one ids-only line, and on success notify with `gamelib:steam.optInDlc.finished` ("Optional content updated") instead of the update copy. Every other step (running refusal, in-flight join, abort controller, disk check, follow-ups, `invalidateSteamUpdateState`) is unchanged.

Dispatch. `common/types/game_manager.ts` `update` overwrites gain `steamOptInDlc?: string[]`. `downloadmanager/utils.ts` `updateQueueElement` forwards `steamOptInDlc: params.steamOptInDlc` in the `update({...})` literal. `SteamGame.update(overwrites)` accepts `steamOptInDlc`; when it is defined, filter it to digit-only ids into a Set; on a bridge install call `updateBridgeGame(this, { optInDlc })` (attended path, after the existing auth-trigger and auto-update re-arm lines); on any other install return `{ status: 'error', error: i18next.t('gamelib:steam.optInDlc.steamManaged', "Steam manages this copy's optional content. Turn it on or off in Steam.") }` without starting anything. When it is undefined the method is unchanged.

Install tab (per D-01, D-03; sketch-findings game-page §2/§4). New `InstallTab/OptInDlcRows.tsx`, modelled on `IntegrationRows.tsx`, header comment naming quick 261122-rgi and D-01..D-03:
- Props `{ gameInfo }`. Render nothing unless `runner === 'steam'` and the game is installed.
- On mount and appName change, `window.api.getSteamOptInDlc(appName)` (no options: the backend derives the OS from the installed copy) with a cancellation flag; a rejection logs through `window.api.logError` (appName only) and renders nothing.
- Busy status from GameContext: `is.updating || is.queued || is.installing`.
- One pending change at a time `{ appId, want }`. Toggle on a 'gamelib' copy: desired = the ids of entries with `installed` true, plus the row's id (switching on) or minus it (switching off); call `updateGame({ appName, runner, gameInfo, steamOptInDlc: desired })` from `frontend/helpers` (it resolves once queued). A rejection fails the row at once. Once the game has been seen busy and is idle again, re-read the list; if the row's `installed` is not `want`, fail the row. The switch's `checked` is always the backend's `installed` (the state flips only on the backend's answer).
- Group: `section.installGroup` with `h3.installGroup__title` (`gamepage.installTab.optInDlc.title`, "Optional content"), a `p.installNote` (`gamepage.installTab.optInDlc.note`, "Turning one on downloads it. Turning it off removes its files."), then one `SwitchRow` per entry with `owned !== false`: id `installTabOptInDlc-<appId>`, label = entry name (a noun that never flips), description = the size via `size()` from `frontend/helpers` when bytes > 0, checked = installed, busy = this row is pending, busyLabel = reuse `gamepage.installTab.switch.adding` / `.removing` by `want`, disabled with reason when `manage !== 'gamelib'` (`gamepage.installTab.optInDlc.steamManaged`, "Steam manages this copy. Turn optional content on or off in Steam: the game's Properties → DLC.") or when another change is pending or the game is busy (`gamepage.installTab.optInDlc.busy`, "Wait for the current download or update to finish."), failure = `RowFailure` with `gamepage.installTab.optInDlc.failed` ("Couldn't change {{name}}. Details are in the log.") and the shared `gamepage.installTab.retry` label, retrying the same `want`. No group when no row applies. No confirmation dialog on switching off (D-02 says remove now; the note states it). Theme tokens only; no new CSS.
- Mount `<OptInDlcRows gameInfo={gameInfo} />` in `InstallTab/index.tsx` immediately before `<IntegrationRows ... />`.
- Add a `261122-rgi` describe block to `installTabRows.test.tsx` using its existing hook harness and `window.api` mocking.

i18n: add the five Install-tab keys and the two backend keys (`steam.optInDlc.finished`, `steam.optInDlc.steamManaged`) to `public/locales/en/gamelib.json`, then rerun `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` and stage the baseline.

Persistence (D-03): add no store, no setting and no ACF key; the Install tab reads `installed` from the backend each time.

Commit code and tests with explicit paths: `feat(quick-261122-rgi): Install tab switches add or remove opt-in DLC on bridge installs; switching off retires the depots`. Then `git mv` the source todo to `.planning/todos/completed/`, add `resolved: 2026-11-22` and `resolution: quick 261122-rgi` to its frontmatter and a `## Resolution` section (what shipped, the commits, that Steam-registered and bottled-Steam copies show read-only rows because Phase 74 keeps GameLib's delta updater on bridge installs, that ownership is unknown without an open session, and that the ACF optionaldlc lead was not used, per D-03). Commit it alone with explicit paths: `docs(quick-261122-rgi): close the opt-in DLC enable-path todo`. Run `graphify update .`.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts src/backend/storeManagers/steam/__tests__/updateBridge.test.ts src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [HEAD: 7 suites passed, 139 tests; EXPECT 7 suites passed, >139 tests, 0 failed]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/storeManagers/steam/__tests__/optInDlc.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [EXPECT 4 suites passed, 0 failed; test count >= the count after Task 1]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts src/backend/storeManagers/steam/__tests__/updateBridge.test.ts src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx -t '261122-rgi' --verbose 2>&1 | grep -c '✓'   [HEAD=0 EXPECT>=14]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depotRust/retire.ts | grep -c 'disabledOptInDepots'   [HEAD=0 EXPECT>=2]</automated>
    <automated>grep -c 'OptInDlcRows' src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx   [HEAD=0 EXPECT==2]</automated>
    <automated>pnpm -s lint-translations:gamelib 2>&1 | tail -1   [EXPECT "0 hard failures"]</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/depot/select.ts src/backend/storeManagers/steam/depot/plan.ts src/backend/storeManagers/steam/depotRust/retire.ts src/backend/storeManagers/steam/depotRust/install.ts src/backend/storeManagers/steam/depotRust/updateEstimate.ts src/backend/storeManagers/steam/updateBridge.ts src/backend/storeManagers/steam/games.ts src/common/types/game_manager.ts src/backend/downloadmanager/utils.ts src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx meta/i18nCatalogPresenceBaseline.json src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts src/backend/storeManagers/steam/__tests__/updateBridge.test.ts src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx   (gamelib.json and the .planning todo are prettier-ignored: omitted on purpose; drop any test path you did not modify)</automated>
    <automated>pnpm -s planning-gates   [EXPECT exit 0; .planning/todos/todo-frontmatter-gate.py inside it no longer counts the moved todo as pending]</automated>
  </verify>
  <done>On a bridge install the Install tab lists owned (or ownership-unknown) opt-in DLC as switch rows; switching one on queues an update that downloads its depots and the row turns on after the backend re-read; switching one off queues an update that deletes its depot files and drops them from the ACF via decideRetirement's disabled input; Steam-registered and bottled-Steam copies show read-only rows with the Steam reason; no store, setting or ACF key was added; the source todo is in completed/ with a Resolution; all suites pass; code and docs committed separately by explicit path.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → sidecar IPC | `getSteamOptInDlc` args and the `steamOptInDlc` install/update field cross from the webview |
| sidecar → Steam CM | PICS reads (anonymous, or a session that is already open) and licence-derived ownership |
| sidecar → filesystem | retirement deletes files of depots the user switched off |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rgi-01 | Tampering | `steamOptInDlc` payload → depot selection | medium | mitigate | zod `stringList` bounds (4096 x 4096) at the boundary; `gameInstallDepot.ts` and `SteamGame.update` keep digit-only ids; an id only matters if PICS names it in a depot's `config.optionaldlc` and the ownership gate in `selectDepots` grants the depot |
| T-rgi-02 | Tampering | retirement (`decideRetirement` disabled input) | high | mitigate | `optInRetiredDepots` is derived server-side only: installed ACF depot ids whose PICS `config.optionaldlc` names a DLC in installed-derived minus chosen; the renderer cannot name a depot id; Rust deletes only files owned by the retired manifests (existing Phase 74 path) |
| T-rgi-03 | Elevation of privilege | `getSteamOptInDlc` session use | medium | mitigate | the module calls `acquireOpenAuthenticated` only (never logs on, never reads the keyring); `steamAuthSessionPolicy.test.ts` Rule F allow-list and the Task 1 grep gate (no `acquireAuthenticated(` in optInDlc.ts) enforce it |
| T-rgi-04 | Information disclosure | new log lines | low | mitigate | every new line carries appIds/DLC ids/depot ids only; no SteamID64, token or depot key |
| T-rgi-05 | Denial of service | listing PICS reads on page open | low | mitigate | every CM call is bounded by `withTimeout` (25 s single, 90 s bulk); failures resolve null and the UI renders nothing; no timer or handle outlives the call (sidecar exit contract) |
| T-rgi-06 | Tampering | `getSteamOptInDlc` appId | low | mitigate | zod `nonEmptyString` plus the handler's and module's numeric-appId checks return null |
| T-rgi-SC | Tampering | npm/pip/cargo installs | high | accept | this plan installs no package; `filesize` is already a dependency |
</threat_model>

<verification>
- All three tasks' `<verify>` blocks pass.
- Full touched-suite run: `pnpm exec jest --runTestsByPath` over every test path in `files_modified` → 0 failed.
- `pnpm codecheck` exit 0; `pnpm -s check:ipc-contract` up to date; `pnpm -s lint-translations:gamelib` "0 hard failures".
- `pnpm find-deadcode` reports no finding that is new against `meta/knip-baseline.txt`.
- `git log --name-only` over this plan's own commits (pin them by sha; another session may commit in between) shows only `files_modified` paths; none of the pre-existing Phase 85 dirty files appear in any commit.
- D-03 review: the plan's diff adds no ACF key, no store and no setting (the Steam ACF writer in Rust is untouched; the only persisted change is the depot set Rust already writes).
- The SteamDialog stripped-source gates (exactly one `disabled=` term; Effect B is the first `let cancelled = false`) are enforced by `steamDialogSource.test.ts` in Task 2's jest run.

## Multi-source coverage audit

| Source | Item | Covered by |
|--------|------|------------|
| GOAL (todo) | tick for owned opt-in DLC in the install dialog | Task 2 (data: Task 1) |
| GOAL (todo) | add-to-existing-install path | Task 3 |
| GOAL (todo) | untick path; decideRetirement no longer keeps a disabled DLC's depots | Task 3 |
| REQ | TODO-2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog | Tasks 1-3; closed in Task 3 |
| CONTEXT D-01 | dialog "Optional content" ticks, name + size, unticked, into the install as enabledOptInDlc | Task 1 (pipeline), Task 2 (UI) |
| CONTEXT D-01 | Install tab switch rows (SwitchRow pattern), on = download, off = remove, note text | Task 3 |
| CONTEXT D-02 | switch off deletes depot files now and drops them from the ACF; decideRetirement disabled input | Task 3 |
| CONTEXT D-03 | installed depots are the record; no store/setting; no ACF optionaldlc key | Tasks 1 and 3 (no new persistence; D-03 review in verification) |
| CONTEXT out of scope | non-Steam stores; non-opt-in DLC | excluded |
| RESEARCH | none (no research phase for this quick task) | n/a |

Interpretation flagged for the operator (not a gap in the locked text, but a boundary it did not
state): rows on Steam-registered and bottled-Steam copies are read-only, because Phase 74 keeps
GameLib's delta updater on bridge installs; and ownership shows as unknown (row still offered) when
no signed-in session is open, because opening one on page open would break the on-demand session
rule.
</verification>

<success_criteria>
- Fresh GameLib depot install with a ticked opt-in DLC downloads that DLC's depots; with none ticked
  the selection matches today's.
- Bridge install: switching a row on downloads the DLC into the existing install; switching it off
  removes its files and its ACF depot entries.
- Steam-managed copies show read-only rows; the listing never opens a signed-in session.
- No new store, setting or ACF key; the source todo is closed with a Resolution.
- Every task commit contains only its own explicit paths.
</success_criteria>

<output>
Create `.planning/quick/261122-rgi-opt-in-dlc-enable-path-in-the-install-di/261122-rgi-SUMMARY.md` when done
</output>
