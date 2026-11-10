/**
 * Once-guarded boot module for the Phase 69 stores (D-05, D-07).
 *
 * Listeners registered here last for the life of the app: there is no
 * disposer (D-07). Tests reset stores instead of tearing listeners down.
 *
 * Must be called after `hydrateStoreSnapshot()` and `i18next.init`, before
 * `root.render` (index.tsx), so readInitial() sees the hydrated snapshot.
 *
 * The componentDidMount tail (awaited seeding, mount-time refreshLibrary,
 * frontendReady) is NOT moved here until plan 69-24 adds `runPostMountBoot()`.
 * frontendReady must keep its post-first-commit timing because the backend
 * treats it as "renderer listeners mounted". Statements at or after the first
 * `await` stay in componentDidMount as calls to the named exports below (R10).
 *
 * Never read `window.localStorage` at module scope: node-env tests must be
 * able to import this file.
 */
import { hydrateFocusRowSelection } from 'common/focusRowMigration'
import { applySavedZoomAtBoot } from './savedZoomBoot'
import { getGameInfo } from '../helpers'
import { createConnectivitySync } from '../helpers/connectivitySync'
import { isStore } from 'common/storeCapabilities'
import type { GameStatus } from 'common/types'
import useUiState, { readInitialUi } from './uiState'
import useSettingsState, {
  focusRowMirrorSeed,
  readInitialSettings,
  registerSettingsSideEffects,
  wasFocusRowPickedThisSession
} from './settingsState'
import { handleSteamBottleSetupRequiredSignal } from './SteamBottleSetup'
import { handleSteamClientSetupRequiredSignal } from './SteamClientSetup'
import { handleSteamBridgeSetupRequiredSignal } from './SteamBridgeSetup'
import { handleSteamBridgeRouteNoticeSignal } from './SteamBridgeRouteNotice'
import { handleSteamGoOfflineRequiredSignal } from './SteamGoOfflineNotice'
import { handleEngineStateChangedSignal } from './EngineState'
import { handleSteamRequestNoticeSignal } from './SteamRequestNotice'
import { handleReadOnlyStoresNoticeSignal } from './ReadOnlyStoresNotice'
import { handleSteamBottleLaunchWaitingSignal } from './BottleLaunchWaiting'

// The class captured `libraryStatus` at componentDidMount, which is always the
// initial `[]`, so the "already installing" guard below never fires. Preserved
// as-is (Phase 69 no-behaviour-change); see
// .planning/todos/pending/2026-11-10-install-game-push-stale-status-and-unread-modal-state.md
const LIBRARY_STATUS_AT_REGISTRATION: GameStatus[] = []

let initialised = false

export function initStateSubscriptions(): void {
  if (initialised) return
  initialised = true

  // (1) re-read persisted initial state into each store (readInitial)
  useUiState.setState(readInitialUi())
  useSettingsState.setState(readInitialSettings())

  // componentDidMount head (R10: pre-first-await statements): re-apply the
  // saved Accessibility zoom FIRST, before any listener registration, so the
  // 100% window stays short (261015-p3q). Undebounced, unlike setZoomPercent.
  applySavedZoomAtBoot({
    savedZoomPercent: useSettingsState.getState().zoomPercent,
    setZoomFactor: (zoomFactor) => window.api.setZoomFactor(zoomFactor),
    onError: (error) =>
      window.api.logError(`applySavedZoomAtBoot failed: ${String(error)}`)
  })

  // CR-01: first launch of a profile whose mirror has no `focusRow` key yet.
  // `void` is safe ONLY because hydrateFocusRowSelection never rejects.
  if (focusRowMirrorSeed.needsMigratedValue) {
    void hydrateFocusRowSelection({
      requestAppSettings: () => window.api.requestAppSettings(),
      setSetting: (payload) => window.api.setSetting(payload),
      applyFocusRow: (value) => useSettingsState.setState({ focusRow: value }),
      hasUserPicked: () => wasFocusRowPickedThisSession(),
      onError: (error) =>
        window.api.logError(
          `focusRow first-launch hydration failed: ${String(error)}`
        )
    })
  }

  // (2) window.api.handle* listeners

  window.api.handleInstallGame(async (e, appName, runner) => {
    const currentApp = LIBRARY_STATUS_AT_REGISTRATION.filter(
      (game) => game.appName === appName
    )[0]
    if (!currentApp || (currentApp && currentApp.status !== 'installing')) {
      const gameInfo = await getGameInfo(appName, runner)
      if (!gameInfo || isStore(gameInfo, 'sideload')) {
        return
      }
      useUiState.setState({
        showInstallModal: { show: true, appName, runner, gameInfo }
      })
    }
  })

  // Phase 17 (17-06), D-07: opens the guided bottle-setup flow whenever the
  // backend emits `steamBottleSetupRequired` (every Install/Play entry point).
  // No frontend eligibility check on gameInfo.is_mac_native (D-11 stays
  // backend-owned).
  window.api.handleSteamBottleSetupRequired(
    handleSteamBottleSetupRequiredSignal
  )
  // Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided-install flow.
  window.api.handleSteamClientSetupRequired(
    handleSteamClientSetupRequiredSignal
  )
  // Phase 24 (24-09), R7/D-05: explicit bridge-failure dialog, never a silent
  // auto-fallback, never a dead end.
  window.api.handleSteamBridgeSetupRequired(
    handleSteamBridgeSetupRequiredSignal
  )
  // Phase 51 Plan 13 (D-51-08/11): up-front bridge ROUTE notice, fired BEFORE
  // any install attempt for a known-bad / scan-miss / win64-no-shim route.
  window.api.handleSteamBridgeRouteNotice(handleSteamBridgeRouteNoticeSignal)
  // Phase 54: guided Go Offline step when the go-offline wrap did not see Mac
  // Steam log off; no logon happened.
  window.api.handleSteamGoOfflineRequired(handleSteamGoOfflineRequiredSignal)
  // Phase 59 Plan 11: backend-computed per-title engine state for the game page.
  window.api.handleEngineStateChanged(handleEngineStateChangedSignal)
  // quick 261106-pvk: Steam never picked up a delegated install/uninstall.
  window.api.handleSteamRequestNotice(handleSteamRequestNoticeSignal)
  window.api.handleReadOnlyStoresNotice(handleReadOnlyStoresNoticeSignal)
  // Phase 51 Plan 08 (D-51-16): records a bottled-Steam launch's "waiting for
  // Steam" classification; the matching clear() lives in handleGameStatus.
  window.api.handleSteamBottleLaunchWaiting(
    handleSteamBottleLaunchWaitingSignal
  )

  // (3) store.subscribe side effects (D-08)
  registerSettingsSideEffects()
}

/**
 * R10: the first awaited statement of componentDidMount. Seeds both flags,
 * THEN follows the pushes (a push before the seed would be overwritten by it).
 */
export async function seedAndFollowWindowChrome(): Promise<void> {
  useUiState.setState({
    isFullscreen: await window.api.isFullscreen(),
    isFrameless: await window.api.isFrameless()
  })
  window.api.handleFullscreen((_e, isFullscreen: boolean) => {
    useUiState.setState({ isFullscreen })
  })
  // quick 261102-dma: follow the Use frameless window toggle after the seed
  // above, so the WindowControls gate does not keep showing GameLib's buttons
  // next to the native frame.
  window.api.handleFramelessChanged((isFrameless: boolean) =>
    useUiState.setState({ isFrameless })
  )
}

export function registerControllerListener(): void {
  window.addEventListener(
    'controller-changed',
    (e: CustomEvent<{ controllerId: string }>) => {
      document.body.classList.toggle(
        'controllerLayout',
        e.detail.controllerId !== ''
      )
      useUiState.setState({ activeController: e.detail.controllerId })
    }
  )
}

/**
 * Keep `connectivity` equal to the sidecar's. The pushes and the one pull reach
 * the webview by different routes, so arrival order says nothing about which
 * is newer; connectivitySync orders them by the sidecar's epoch/seq stamp and
 * re-pulls after a quiet spell while not online.
 */
export function followConnectivity(): void {
  const connectivitySync = createConnectivitySync({
    pull: () => window.api.getConnectivityStatus(),
    onChange: (connectivity) => useUiState.setState({ connectivity }),
    log: (message) => window.api.logInfo(message)
  })
  window.api.onConnectivityChanged((_, snapshot) =>
    connectivitySync.receive(snapshot)
  )
  void connectivitySync.pull()
}

/** @public Test-only: lets a test prove the once-guard. */
export function __resetInitStateSubscriptionsGuardForTests(): void {
  initialised = false
}
