/**
 * RPC handler registry for the sidecar (Phase 27 Plan 02 placeholder,
 * generalized by Phase 29 Plan 04 — Task 2 into the real store-layer read
 * path).
 *
 * Registers the `health` invoke handler (27-02's own dispatch-path proof,
 * kept for `bootstrap.test.ts`'s Behavior 3 assertion), the curated Steam
 * read/action flow channels (`registerSteamFlows()`, `steamFlowRegistration.ts`),
 * the curated Steam QR-login channels (`registerSteamAuthFlows()`,
 * `steamAuthFlowRegistration.ts` — Phase 30 Plan 01, D-01/D-02/D-08), the
 * curated install-slice channels (`registerInstallFlows(services)`,
 * `installFlowRegistration.ts` — Phase 30 Plan 02,
 * D-05a/D-05b/D-07/D-08/D-12), the curated settings-read channels
 * (`registerSettingsFlows()`, `settingsFlowRegistration.ts` — Phase 30 Plan
 * 06, gap closure for Gap 2 / UAT Test 8), the curated app-shell channels
 * (`registerAppShellFlows()`, `appShellFlowRegistration.ts` — Phase 34.1 Plan
 * 04, D-03/D-08/D-09/D-13), the curated game-details/settings/override
 * channels (`registerGameDetailsFlows({ managers, stores })`,
 * `gameDetailsFlowRegistration.ts` — Phase 34.2 Plan 04, D-01/D-03/D-04), the curated enrichment channels
 * (`registerEnrichmentFlows()`, `enrichmentFlowRegistration.ts` — Phase 34.2
 * Plan 06, D-04/D-07/D-10), the curated shell/files/diagnostics channels
 * (`registerShellFilesFlows()`, `shellFilesFlowRegistration.ts` — Phase 34.3
 * Plans 01+02, REQ-34.3-01/-02/-13 — the link/reveal openers plus the
 * filesystem/diagnostics handlers), the curated clipboard
 * channels (`registerClipboardFlows()`, `clipboardFlowRegistration.ts` — Phase
 * 34.3 Plan 06, REQ-34.3-03/-04/-13 — clipboardWriteText/clipboardReadText/
 * copySystemInfoToClipboard, the ONLY consumers of this slice's two new
 * Rust arms), the curated
 * Humble library/sync + key-state channels (`registerHumbleFlows()`,
 * `humbleFlowRegistration.ts` — Phase 34.4 Plans 04+05, REQ-34.4-07;
 * curated-imports `humble/user.ts`/`humble/library.ts` directly, never
 * `humble/ipc_handler.ts`, which also registers the channels Phase 34.4.1
 * owns), the curated in-app store-embed channels (`registerStoreEmbedFlows()`,
 * `storeEmbedFlowRegistration.ts` -- Phase 40 Plan 05, REQ-40-02/REQ-40-05, which also installs
 * the `rustInvoke`-backed `StoreEmbedSeam` implementation via `storeEmbed.set()`). The renderer's
 * store reads (the boot snapshot and the lazy fetch) are answered by the Rust shell from its
 * `StoreHost` (85-16); since 85-21 (D-03) the sidecar keeps no fallback read handler.
 *
 * Registration runs inside `registerHandlers()` (the 'register-handlers' boot step, D-08),
 * not at import time. `registerStoreWriteHandlers()` runs there, after the flow
 * registrations, so every store instance either handler below can
 * be asked about already exists (REQ-29-01, 29-RESEARCH Pitfall 6) before
 * any RPC frame can reach a handler body.
 *
 * Phase 34.5 Plan 04 (REQ-34.5-13) staked this slice's four registration seams as declared,
 * wired, EMPTY contracts, so plans 05-12 could each touch exactly one module file instead of
 * contending for this file's import/call blocks. All four are populated now. Every seam's
 * channel list, source line, and registration kind is pinned in its own module's header
 * docstring (`runnerAuthFlowRegistration.ts`, plans 34.5-06/34.5-10/REQ-34.5-04;
 * `wineToolsFlowRegistration.ts`, plans 34.5-05/34.5-09/REQ-34.5-03;
 * `shortcutsFlowRegistration.ts`, plans 34.5-08/34.5-11/REQ-34.5-05;
 * `runnerMiscFlowRegistration.ts`, plans 34.5-07/34.5-12/REQ-34.5-06/-07/-08/-09),
 * and cross-checked (import called exactly once, curated-import guard, containment pin) by
 * `__tests__/runnerSliceRegistration.test.ts`.
 *
 * IN-01 (34.2-REVIEW.md round 1): channel COUNTS deliberately do not appear in this file,
 * neither here nor in the call-site comments below. Five of the ten counts this file used to
 * carry had gone stale — the review found one of them. Each count now lives in exactly one
 * place, its own module's `register*Flows()` docstring, and
 * `__tests__/flowRegistrationCensus.test.ts` gates every one of them against the actual
 * `ipcMain.handle`/`ipcMain.on` registrations in that module.
 *
 * Uses platformApi's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) because none of this file's channels are entries in the
 * existing `AsyncIPCFunctions` contract — and no file under this directory
 * may import the real electron module (Task 1/2 acceptance criterion),
 * which `backend/ipc.ts` itself does.
 */

import type { LogSink } from '../process/types'
import type { BootServices, ShellState } from '../services/types'

import { registerSteamFlows } from './steamFlowRegistration'
import { registerSteamAuthFlows } from './steamAuthFlowRegistration'
import { registerEngineFlows } from './engineFlowRegistration'
import { registerInstallFlows } from './installFlowRegistration'
import { registerSettingsFlows } from './settingsFlowRegistration'
import { registerDevEpicCookieSweepFlow } from './devEpicCookieSweepRegistration'
import { registerDialogFlows } from './dialogFlowRegistration'
import { registerDownloadQueueFlows } from './downloadQueueFlowRegistration'
import { registerAppShellFlows } from './appShellFlowRegistration'
import { registerGameDetailsFlows } from './gameDetailsFlowRegistration'
import { registerEnrichmentFlows } from './enrichmentFlowRegistration'
import { registerShellFilesFlows } from './shellFilesFlowRegistration'
import { registerClipboardFlows } from './clipboardFlowRegistration'
import { registerHumbleFlows } from './humbleFlowRegistration'
import { registerHumbleLoginFlows } from './humbleLoginFlowRegistration'
import { registerOAuthLoginFlows } from './oauthLoginFlowRegistration'
import { registerRunnerAuthFlows } from './runnerAuthFlowRegistration'
import { registerEngineWineResolvers } from './engineWineResolvers'
import { registerEngineSelectionView } from 'backend/enginewine/selectionView'
import { registerShortcutsFlows } from './shortcutsFlowRegistration'
import { registerRunnerMiscFlows } from './runnerMiscFlowRegistration'
import { registerEosOverlayFlows } from './eosOverlayFlowRegistration'
import { registerStoreEmbedFlows } from './storeEmbedFlowRegistration'
import { registerDepotHostFlows } from './depotHostRegistration'
import { registerSteamPollEventFlows } from './steamPollEventRegistration'
import { managerDepsFromServices } from '../services/managerDeps'
import type { EngineServicesSource } from '../services/engineServices'
import { resolveWinetricksTarget } from '../services/winetricksTarget'
import { gatherGameCommandFacts } from '../services/gameCommandFacts'
import { registerStoreWriteHandlers } from './storeWriteHandlers'

/**
 * Registers every handler and flow channel. Called once by the `register-handlers`
 * boot step (D-08), after the logger and before the RPC server binds; importing
 * this module registers nothing.
 */
/** The config, app-info and host slices the Wine-tools and runner-misc registrations read. */
function toolSlices(services: BootServices) {
  return {
    config: services.config,
    gameConfigs: services.gameConfigs,
    appInfo: services.appInfo,
    dialogs: services.host.dialogs,
    sendFrontendMessage: services.host.sendFrontendMessage,
    appState: services.host.appState,
    notifications: services.host.notifications,
    onlineMonitor: services.onlineMonitor,
    engineState: services.engineState,
    engineRuntime: services.engineRuntime,
    storeRoot: services.storeRoot,
    paths: services.paths,
    aborts: services.aborts,
    appRuntime: services.appRuntime,
    steamBottle: services.steamBottle,
    steamLaunchRuntime: services.steamLaunchRuntime
  }
}

/** The engine-services source the Winetricks target resolver reads (`services/winetricksTarget.ts`). */
function engineSourceFrom(services: BootServices): EngineServicesSource {
  return {
    libraryManagers: services.managers.library,
    commandRunner: services.commandRunner,
    spawnAsync: services.spawnAsync,
    runner: services.runner,
    launcher: services.launcher,
    ...toolSlices(services)
  }
}

export function registerHandlers(deps: {
  log: LogSink
  services: BootServices
  /** This boot's app-shell / installed.json watcher / store-embed instances ('app-shell-state' step). */
  shellState: ShellState
}): void {
  const ipc = deps.services.host.ipc
  ipc.handle('health', async () => 'ok')

  registerSteamFlows({
    ipc,
    appRuntime: deps.services.appRuntime,
    config: deps.services.config,
    appState: deps.services.host.appState,
    managers: deps.services.managers,
    stores: deps.services.stores,
    steamInstallRuntime: deps.services.steamInstallRuntime,
    launcher: deps.services.launcher,
    notifications: deps.services.host.notifications,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    steamSession: deps.services.steamSession,
    humble: deps.services.humble
  })
  registerSteamAuthFlows({ ...deps.services, ipc })
  registerEngineFlows({
    ipc,
    managers: deps.services.managers,
    stores: deps.services.stores,
    spawnAsync: deps.services.spawnAsync,
    runner: deps.services.runner,
    config: deps.services.config,
    engineState: deps.services.engineState,
    engineRuntime: deps.services.engineRuntime,
    storeRoot: deps.services.storeRoot,
    paths: deps.services.paths,
    steamBottle: deps.services.steamBottle,
    steamLaunchRuntime: deps.services.steamLaunchRuntime
  })
  registerInstallFlows({ ...deps.services, ipc })
  registerSettingsFlows({
    ipc,
    managers: deps.services.managers,
    stores: deps.services.stores,
    runner: deps.services.runner,
    config: deps.services.config,
    gameConfigs: deps.services.gameConfigs,
    appInfo: deps.services.appInfo,
    infoCaches: deps.services.infoCaches,
    paths: deps.services.paths,
    steamSession: deps.services.steamSession,
    sendFrontendMessage: deps.services.host.sendFrontendMessage
  })
  // D-35-19-15's live gate: a DEV-ONLY single-host Epic cookie sweep, so the
  // `EPIC_COOKIE_HOSTS` sweep can be exercised against ONE sibling apex without
  // `LegendaryUser.logout()` destroying the operator's real Epic session. Self-gated —
  // `registerDevEpicCookieSweepFlow` no-ops in a packaged sidecar, so the channel does not
  // exist in a shipped build. Not on the preload surface by design; see that module's docstring.
  registerDevEpicCookieSweepFlow({
    ipc,
    appInfo: deps.services.appInfo,
    loginWindowSeam: deps.services.humble.loginWindowSeam
  })
  // WR-02: without this, plan 30-03's native picker chain was unreachable — `openDialog`
  // is the only backend channel that reaches `dialog.showOpenDialog`, and its sole other
  // caller (`main.ts`) is not in the sidecar's import graph.
  registerDialogFlows({ ipc, dialogs: deps.services.host.dialogs })
  // Phase 32 Plan 01: the queue-management channels — no ordering constraint
  // relative to the other four calls above (each module owns its own channel
  // names, no cross-module runtime
  // dependency at registration time); placed alongside them, before
  // `registerStoreWriteHandlers()` (32-PATTERNS.md).
  registerDownloadQueueFlows({
    log: deps.log,
    ipc,
    downloadQueue: deps.services.downloadQueue
  })
  // Phase 34.1 Plan 04: the app-shell channels — no ordering constraint
  // relative to the other calls above (own channel names, no cross-module
  // runtime dependency at registration time), placed alongside them, before
  // `registerStoreWriteHandlers()`.
  //
  // Guarded (sidecar-init-rustinvoke-leak): only this top-level, import-time-triggered call
  // suppresses the one-shot boot-time tray_set_icon correction under Jest -- a DIRECT call to
  // registerAppShellFlows() (e.g. appShellFlows.test.ts's own REQ-34.1-07 coverage) is
  // unaffected. See appShellFlowRegistration.ts's own docstring/inline comment for the full
  // mechanism this fixes. `JEST_WORKER_ID` is Jest's own zero-config "am I running under
  // Jest" signal (always set in a Jest worker, never set for the real Tauri sidecar process)
  // -- under real Tauri this is unconditionally `false` and behavior is byte-identical to
  // before.
  registerAppShellFlows({
    ipc,
    storeMirrors: deps.services.storeRoot.mirrors,
    appRuntime: deps.services.appRuntime,
    aborts: deps.services.aborts,
    openExternal: deps.services.host.openExternal,
    requestRustInvoke: deps.services.host.requestRustInvoke,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    managers: deps.services.managers,
    downloadQueue: deps.services.downloadQueue,
    quit: deps.services.quit,
    stores: deps.services.stores,
    config: deps.services.config,
    runner: deps.services.runner,
    engineRuntime: deps.services.engineRuntime,
    dialogs: deps.services.host.dialogs,
    appState: deps.services.host.appState,
    notifications: deps.services.host.notifications,
    paths: deps.services.paths,
    appShell: deps.shellState.appShell,
    skipInitialTraySync: process.env.JEST_WORKER_ID !== undefined
  })
  // Phase 34.2 Plans 04+05: the game-details/settings/override channels — no
  // ordering constraint relative to the other calls above (own
  // channel names, no cross-module runtime dependency at registration time),
  // placed alongside them, before `registerStoreWriteHandlers()`.
  registerGameDetailsFlows({
    ipc,
    appRuntime: deps.services.appRuntime,
    managers: deps.services.managers,
    aborts: deps.services.aborts,
    stores: deps.services.stores,
    notifications: deps.services.host.notifications,
    onlineMonitor: deps.services.onlineMonitor,
    requestRustInvoke: deps.services.host.requestRustInvoke,
    paths: deps.services.paths,
    miscRuntime: deps.services.miscRuntime,
    sendFrontendMessage: deps.services.host.sendFrontendMessage
  })
  // Phase 34.2 Plan 06: the enrichment channels — no ordering
  // constraint relative to the other calls above (own channel names, no
  // cross-module runtime dependency at registration time), placed alongside
  // them, before `registerStoreWriteHandlers()`. `wiki_game_info/stores`
  // is already registered by `createStores` (Phase 29), so this
  // module needs no new store plumbing.
  registerEnrichmentFlows({
    ipc,
    appRuntime: deps.services.appRuntime,
    miscRuntime: deps.services.miscRuntime,
    managers: deps.services.managers,
    stores: deps.services.stores,
    appInfo: deps.services.appInfo,
    onlineMonitor: deps.services.onlineMonitor,
    infoCaches: deps.services.infoCaches,
    gogRuntime: deps.services.gogRuntime,
    paths: deps.services.paths,
    steamGridSecrets: deps.services.steamGridSecrets,
    itadSecrets: deps.services.itadSecrets,
    sendFrontendMessage: deps.services.host.sendFrontendMessage
  })
  // Phase 34.3 Plans 01+02 (REQ-34.3-01/-02/-13): the shell/link-opener and
  // filesystem/diagnostics channels — no ordering constraint
  // relative to the other calls above (own channel names, no cross-module
  // runtime dependency at registration time), placed alongside them, before
  // `registerStoreWriteHandlers()`.
  registerShellFilesFlows({
    ipc,
    storeRoot: deps.services.storeRoot,
    managers: deps.services.managers,
    stores: deps.services.stores,
    runner: deps.services.runner,
    dialogs: deps.services.host.dialogs,
    appState: deps.services.host.appState,
    openExternal: deps.services.host.openExternal,
    pushFrontendMessage: deps.services.host.pushFrontendMessage,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    paths: deps.services.paths,
    config: deps.services.config,
    onlineMonitor: deps.services.onlineMonitor,
    requestRustInvoke: deps.services.host.requestRustInvoke
  })
  // Phase 34.3 Plan 06 (REQ-34.3-03/-04/-13): the clipboard channels — the ONLY
  // consumers of this slice's two new dispatch_rust_channel arms
  // (clipboard_write_text/clipboard_read_text, Plan 03). No ordering constraint
  // relative to the other calls above (own channel names, no cross-module runtime
  // dependency at registration time), placed alongside them, before
  // `registerStoreWriteHandlers()`.
  registerClipboardFlows({
    ipc,
    appState: deps.services.host.appState,
    requestRustInvoke: deps.services.host.requestRustInvoke,
    managers: deps.services.managers,
    stores: deps.services.stores,
    runner: deps.services.runner,
    config: deps.services.config,
    appInfo: deps.services.appInfo,
    infoCaches: deps.services.infoCaches,
    paths: deps.services.paths
  })
  // Phase 84 plan 84-06: the sidecar serves no logger channel. Every renderer logger channel
  // (logError, logInfo, showLogFileInFolder, getLogContent, uploadLogFile, getUploadedLogFiles,
  // deleteUploadedLogFile) is answered by the Rust native router (nativeChannels.json).
  // Phase 34.4 Plans 04+05 (REQ-34.4-07): the library/sync + key-state Humble
  // channels — no ordering constraint relative to the other calls above (own channel
  // names, no cross-module runtime dependency at registration time), placed
  // alongside them, before `registerStoreWriteHandlers()`. Every store this module
  // needs (all 9 Humble stores) is already registered by createStores
  // — zero new store plumbing.
  registerHumbleFlows({
    ipc,
    humble: deps.services.humble,
    config: deps.services.config,
    notifications: deps.services.host.notifications
  })
  // Phase 34.4.1 Plan 02 (REQ-34.4.1-02/-03/-04/-05/-13): the browser-auth channels,
  // plus installing the rustInvoke-backed login-window seam (setLoginWindowSeam)
  // — no ordering constraint relative to the
  // other calls above (own channel names, no cross-module runtime dependency at
  // registration time), placed alongside them, before `registerStoreWriteHandlers()`.
  registerHumbleLoginFlows({
    ipc,
    humble: deps.services.humble,
    requestRustInvoke: deps.services.host.requestRustInvoke
  })
  // Phase 34.4.1 Plan 09 (REQ-34.4.1-08): the `oauthCaptureLogin` handle channel, which
  // drives the four OAuth runners' (legendary/gog/nile) redirect capture through the SAME
  // login-window seam Humble already installed above -- a completely separate concern from
  // Humble's own browser-auth channels (this captures a redirect code, it does not
  // authenticate). No ordering constraint relative to the other calls above (own channel name,
  // no cross-module runtime dependency at registration time), placed alongside them, before
  // `registerStoreWriteHandlers()`.
  registerOAuthLoginFlows({
    ipc,
    loginWindowSeam: deps.services.humble.loginWindowSeam
  })
  // Phase 34.5 Plan 04 (REQ-34.5-13): the four slice-34.5 clusters — runner auth/sign-out,
  // Wine tools, shortcuts, runner misc. Declared here as EMPTY seams by plan 34.5-04 and
  // filled in one module at a time by the cluster plans (34.5-05 through 34.5-12); all four
  // are populated now. No ordering constraint relative to the other calls above (own channel
  // names, no cross-module runtime dependency at registration time), placed alongside them,
  // before `registerStoreWriteHandlers()`.
  registerRunnerAuthFlows({
    ipc,
    managers: deps.services.managers,
    stores: deps.services.stores,
    appInfo: deps.services.appInfo,
    dialogs: deps.services.host.dialogs,
    appState: deps.services.host.appState,
    notifications: deps.services.host.notifications,
    onlineMonitor: deps.services.onlineMonitor,
    signIn: deps.services.signInProbe,
    loginWindowSeam: deps.services.humble.loginWindowSeam,
    gogRuntime: deps.services.gogRuntime,
    nileRuntime: deps.services.nileRuntime,
    paths: deps.services.paths,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    requestRustInvoke: deps.services.host.requestRustInvoke
  })
  // Phase 87 (D-23): the scheduled resolvers of the engine and wine services (the DXVK toggles as of 87-34, the
  // Winetricks apply and catalog reads as of 87-35, the wine commands, the tool buttons and the wine releases
  // listener as of 87-36, which deleted the wine tools cluster's own registration). `winetricksTarget` and
  // `gameCommandFacts` are the decisions TypeScript keeps: which Wine environment a game's tools act on, and the
  // facts about a game only the library holds.
  const engineSource = engineSourceFrom(deps.services)
  registerEngineWineResolvers({
    ipc,
    gameConfigs: deps.services.gameConfigs,
    config: deps.services.config,
    managers: deps.services.managers,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    appRuntime: deps.services.appRuntime,
    requestRustInvoke: deps.services.host.requestRustInvoke,
    winetricksTarget: (runner, appName, opts) =>
      resolveWinetricksTarget(engineSource, runner, appName, opts),
    gameCommandFacts: (runner, appName, opts) =>
      gatherGameCommandFacts(engineSource, runner, appName, opts),
    // `getEngineState` (87-52, D-23): a Steam title's bridge facts, read through the Steam adapter, which stays a lazy
    // import as it was behind the TS handle.
    steamEngineFacts: async (appId) => {
      const { steamEngineFacts } =
        await import('backend/storeManagers/steam/engine/steamEngineDeps')
      return steamEngineFacts(
        {
          stores: deps.services.stores,
          spawnAsync: deps.services.spawnAsync,
          runner: deps.services.runner,
          engineRuntime: deps.services.engineRuntime,
          storeRoot: deps.services.storeRoot,
          paths: deps.services.paths,
          steamBottle: deps.services.steamBottle,
          steamLaunchRuntime: deps.services.steamLaunchRuntime
        },
        appId
      )
    }
  })
  // Rust's engine registry changed on its own (87-42, D-24): the sync selection view applies the frame.
  registerEngineSelectionView(ipc)
  registerShortcutsFlows({
    ipc,
    appRuntime: deps.services.appRuntime,
    managers: deps.services.managers,
    quit: deps.services.quit,
    stores: deps.services.stores,
    infoCaches: deps.services.infoCaches,
    aborts: deps.services.aborts,
    runner: deps.services.runner,
    config: deps.services.config,
    paths: deps.services.paths,
    imageTools: deps.services.host.imageTools,
    dialogs: deps.services.host.dialogs,
    appState: deps.services.host.appState,
    notifications: deps.services.host.notifications,
    sendFrontendMessage: deps.services.host.sendFrontendMessage,
    requestRustInvoke: deps.services.host.requestRustInvoke
  })
  registerRunnerMiscFlows({
    ipc,
    managers: deps.services.managers,
    commandRunner: deps.services.commandRunner,
    launcher: deps.services.launcher,
    runner: deps.services.runner,
    ...toolSlices(deps.services),
    paths: deps.services.paths
  })
  // Phase 34.6 Plan 08 (REQ-34.6-01): the EOS overlay channel cluster — no ordering constraint
  // relative to the other calls above.
  registerEosOverlayFlows({
    ipc,
    appRuntime: deps.services.appRuntime,
    managers: deps.services.managers,
    aborts: deps.services.aborts,
    paths: deps.services.paths,
    sendFrontendMessage: deps.services.host.sendFrontendMessage
  })
  // Phase 40 Plan 05 (REQ-40-02/REQ-40-05): the in-app store-embed channels, plus installing the
  // rustInvoke-backed store-embed seam (storeEmbed.set) — no ordering constraint relative to
  // the other calls above (own channel names, no cross-module runtime dependency at registration
  // time), placed alongside them, before `registerStoreWriteHandlers()`.
  registerStoreEmbedFlows({
    ipc,
    requestRustInvoke: deps.services.host.requestRustInvoke,
    storeEmbed: deps.shellState.storeEmbed
  })
  // Phase 73 Plan 11 (D-03, D-06): the shell-originated channels the Rust depot job uses for CDN
  // tokens, manifest request codes and progress events — no ordering constraint relative to the
  // other calls above (own channel names, backed by the boot-owned job registry), placed before
  // `registerStoreWriteHandlers()`.
  registerDepotHostFlows({
    ipc,
    depotJobs: deps.services.steamInstallRuntime.depotJobs
  })
  // Phase 80 Plan 11 (D-02): shell-originated state events the Rust steam poll sends to change
  // sidecar-owned state; own name, no ordering constraint relative to the calls above.
  registerSteamPollEventFlows({
    ipc,
    manager: () => managerDepsFromServices(deps.services)
  })
  // The store layer last: the root's change channel bound to the one renderer push site and the
  // shell's mirror-event answers routed to the root's cells (85-21: the renderer's writes are
  // native Rust channels, so no write handler is registered here).
  registerStoreWriteHandlers({
    ipc,
    root: deps.services.storeRoot,
    pushFrontendMessage: deps.services.host.pushFrontendMessage
  })
}
