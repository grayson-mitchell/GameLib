/**
 * Once-guarded boot module for the Phase 69 stores (D-05, D-07).
 *
 * Listeners registered here last for the life of the app: there is no
 * disposer (D-07). Tests reset stores instead of tearing listeners down.
 *
 * Must be called after `hydrateStoreSnapshot()` and the `i18next.init` CALL,
 * before `root.render` (index.tsx), so readInitial() sees the hydrated
 * snapshot. `init` has been called but may not have finished: with the http
 * backend `i18next.language` is still undefined here, so the language is
 * filled in by `followBootLanguage` once i18next reports `initialized`.
 *
 * The former componentDidMount tail (awaited seeding, mount-time
 * refreshLibrary, frontendReady) is `runPostMountBoot()`, triggered by
 * BootSequence's layout effect so it keeps its post-first-commit timing: the
 * backend treats frontendReady as "renderer listeners mounted".
 *
 * Never read `window.localStorage` at module scope: node-env tests must be
 * able to import this file.
 */
import i18next from 'i18next'
import { toShippedLanguage } from 'common/languages'
import { hydrateFocusRowSelection } from 'common/focusRowMigration'
import { applySavedZoomAtBoot } from './savedZoomBoot'
import { getGameInfo } from '../helpers'
import {
  gogConfigStore,
  nileConfigStore,
  steamConfigStore,
  steamLibraryStore
} from '../helpers/stores'
import { createConnectivitySync } from '../helpers/connectivitySync'
import { isStore } from 'common/storeCapabilities'
import useUiState, { readInitialUi } from './uiState'
import { openInstallGameModal } from './InstallGameModal'
import useSettingsState, {
  applySavedFonts,
  readFocusRowMirrorSeed,
  readInitialSettings,
  registerSettingsSideEffects,
  wasFocusRowPickedThisSession
} from './settingsState'
import useAuthState, { readInitialAuth } from './authState'
import useLibraryState, {
  readInitialLibrary,
  registerLibrarySideEffects
} from './libraryState'
import { registerSleepAssertionSubscriber } from './sleepAssertion'
import { normalizeSignInDismissals } from 'common/signInDismissal'
import { registerDownloadsListeners } from './downloadsState'
import { handleSteamBottleSetupRequiredSignal } from './SteamBottleSetup'
import { handleSteamClientSetupRequiredSignal } from './SteamClientSetup'
import { handleSteamBridgeSetupRequiredSignal } from './SteamBridgeSetup'
import { handleSteamBridgeRouteNoticeSignal } from './SteamBridgeRouteNotice'
import { handleSteamGoOfflineRequiredSignal } from './SteamGoOfflineNotice'
import { handleEngineStateChangedSignal } from './EngineState'
import { handleSteamRequestNoticeSignal } from './SteamRequestNotice'
import { handleReadOnlyStoresNoticeSignal } from './ReadOnlyStoresNotice'
import { handleSteamBottleLaunchWaitingSignal } from './BottleLaunchWaiting'

/**
 * Runs `fn` once i18next has finished initialising (immediately if it has).
 * i18next emits `initialized` even when a resource load failed, so this does
 * not hang on a backend error.
 */
export function runWhenI18nextInitialized(fn: () => void): void {
  if (i18next.isInitialized) {
    fn()
    return
  }
  const onInitialized = () => {
    i18next.off('initialized', onInitialized)
    fn()
  }
  i18next.on('initialized', onInitialized)
}

/**
 * The old GlobalState constructor only ran after i18next had loaded (Suspense
 * through withTranslation), so it always read a resolved language. Reproduce
 * that for the boot value only: if `readInitialSettings` found no language
 * yet, take it from i18next once it has initialised. Later changes still go
 * through `setLanguage`, as before.
 */
export function followBootLanguage(): void {
  if (i18next.language) return
  runWhenI18nextInitialized(() => {
    if (i18next.language) {
      useSettingsState.setState({
        language: toShippedLanguage(i18next.language)
      })
    }
  })
}

let initialised = false

export function initStateSubscriptions(): void {
  if (initialised) return
  initialised = true

  // (1) re-read persisted initial state into each store (readInitial)
  useUiState.setState(readInitialUi())
  useSettingsState.setState(readInitialSettings())
  const focusRowSeed = readFocusRowMirrorSeed()
  followBootLanguage()
  useAuthState.setState(readInitialAuth())
  useLibraryState.setState(readInitialLibrary())

  // componentDidMount head (R10: pre-first-await statements): re-apply the
  // saved Accessibility zoom FIRST, before any listener registration, so the
  // 100% window stays short (261015-p3q). Undebounced, unlike setZoomPercent.
  applySavedZoomAtBoot({
    savedZoomPercent: useSettingsState.getState().zoomPercent,
    setZoomFactor: (zoomFactor) => window.api.setZoomFactor(zoomFactor),
    onError: (error) =>
      window.api.logError(`applySavedZoomAtBoot failed: ${String(error)}`)
  })

  // CR-01: fires only when the HYDRATED mirror lacks a `focusRow` key (the
  // backend's `settings/global` migration writes it to config.json and the
  // mirror never receives it) or hydration failed/timed out. Kept deliberately,
  // not redundant with the post-hydration readInitialSettings().
  // `void` is safe ONLY because hydrateFocusRowSelection never rejects.
  if (focusRowSeed.needsMigratedValue) {
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

  // Phase 19 (Plan 06), D-11/D-16: pushed after a validated background
  // CrossOver-index refresh so the grid's `crossoverRatings` slice updates
  // without a manual pull. This is the only IPC round-trip involved --
  // painting a card never fires its own request (D-11/D-13). WR-05: the
  // backend (`refreshCrossoverRatingMap()` in main.ts) now re-fires this
  // event after every `refreshLibrary` completion too, so a game added
  // mid-session gets a badge/filter signal without a restart.
  // Steam sync indicators and the backend's refresh push (moved from the
  // class's componentDidMount, Phase 69-18). The status handler writes only
  // steamSyncStatus; it never touches refreshingInTheBackground (D-06).
  window.api.handleSteamMetadataSyncing((e, { syncing }) => {
    useLibraryState.getState().setSteamMetadataSyncing(syncing)
  })
  window.api.handleSteamSyncStatus((e, { status }) => {
    useLibraryState.getState().setSteamSyncStatus(status)
  })
  window.api.handleRefreshLibrary((e, runner) => {
    void useLibraryState.getState().refreshLibrary({
      checkForUpdates: false,
      runInBackground: true,
      library: runner,
      origin: 'push'
    })
  })

  window.api.handleCrossoverIndexChanged((e, index) => {
    useLibraryState.getState().setCrossoverRatings(index)
  })

  // One-time pull at boot so the grid paints on first load without
  // waiting for the next background refresh's push.
  window.api
    .getCrossoverIndex()
    .then((index) => useLibraryState.getState().setCrossoverRatings(index))
    .catch((error) =>
      window.api.logError(`CrossOver index pull failed: ${String(error)}`)
    )

  // Quick 261029-mkz: "Runs for me" override map -- push on every change,
  // plus a one-time pull so the first paint has it.
  window.api.handleRunsForMeChanged((e, map) => {
    useLibraryState.getState().setRunsForMe(map)
  })
  window.api
    .getRunsForMeMap()
    .then((map) => useLibraryState.getState().setRunsForMe(map))
    .catch((error) =>
      window.api.logError(`Runs-for-me pull failed: ${String(error)}`)
    )

  window.api.handleInstallGame(async (e, appName, runner) => {
    // The backend only pushes this for a game that is not installed (the
    // protocol.ts "Is Not Installed" dialog), so the only in-flight states it
    // can be in are 'installing' (incl. the Steam hand-off) and 'queued'
    // (awaiting install in the download queue). Re-opening the install flow
    // in either would double-enqueue. Read at event time, not registration.
    const currentApp = useLibraryState
      .getState()
      .libraryStatus.find((game) => game.appName === appName)
    if (
      currentApp?.status === 'installing' ||
      currentApp?.status === 'queued'
    ) {
      return
    }
    const gameInfo = await getGameInfo(appName, runner)
    if (!gameInfo || isStore(gameInfo, 'sideload')) {
      return
    }
    openInstallGameModal({ appName, runner, gameInfo })
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

  // Phase 69-19: the per-game status push (the hot path).
  window.api.handleGameStatus((e, args) => {
    void useLibraryState.getState().handleGameStatus({ ...args })
  })

  // Game metadata (override) changes and game pushes update the library.
  window.api.handleMetadataChanged((e, overrides) => {
    useLibraryState.getState().updateGameOverrides(overrides)
  })

  window.api.handleGamePush((e, args) => {
    useLibraryState.getState().applyGamePush(args)
  })

  // Phase 69 D-15: completed-downloads list, boot pull + queue-change refresh.
  registerDownloadsListeners()

  registerAuthListeners()

  // (3) store.subscribe side effects (D-08)
  registerSettingsSideEffects()
  registerLibrarySideEffects()
  registerSleepAssertionSubscriber()
}

/**
 * componentDidMount (post-await): when no updates are held yet, restore the
 * last persisted list from localStorage 'updates'.
 */
export function restoreStoredGameUpdates(): void {
  if (!useLibraryState.getState().gameUpdates.length) {
    const storedGameUpdates = JSON.parse(
      window.localStorage.getItem('updates') || '[]'
    ) as string[]
    useLibraryState.setState({ gameUpdates: storedGameUpdates })
  }
}

/**
 * componentDidMount: the store-user reads that gate the mount-time refresh.
 * Called at the original position (before the awaited seeding) so the reads
 * keep their timing relative to the awaits.
 */
export function readMountStoreUsers(): {
  gogUser: boolean
  amazonUser: boolean
  steamUser: boolean
} {
  return {
    gogUser: gogConfigStore.has('userData'),
    amazonUser: nileConfigStore.has('userData'),
    // debug/steam-refresh-hung-on-startup: a Steam-only login must also gate
    // the mount refresh, or the sync spinner never clears.
    // A signed-out Steam with installed games still needs the mount refresh
    // and its update check (UAT 23).
    steamUser:
      steamConfigStore.has('userData') ||
      steamLibraryStore.get('games', []).some((g) => g.is_installed)
  }
}

/**
 * componentDidMount (post-await): the mount-time "refresh everything", run only
 * when an Epic, GOG, Amazon or Steam user exists.
 */
export function runMountLibraryRefresh(users: {
  legendaryUser: boolean
  gogUser: boolean
  amazonUser: boolean
  steamUser: boolean
}): void {
  if (
    users.legendaryUser ||
    users.gogUser ||
    users.amazonUser ||
    users.steamUser
  ) {
    void useLibraryState.getState().refreshLibrary({
      checkForUpdates: true,
      runInBackground: shouldRunInBackgroundAtMount(),
      origin: 'mount'
    })
  }
}

/**
 * The mount-time refresh's runInBackground: true when any of the four store
 * libraries already holds games.
 */
export function shouldRunInBackgroundAtMount(): boolean {
  const lib = useLibraryState.getState()
  return (
    lib.epicLibrary.length !== 0 ||
    lib.gogLibrary.length !== 0 ||
    lib.amazonLibrary.length !== 0 ||
    lib.steamLibrary.length !== 0
  )
}

/**
 * Humble auth/keys/sync and sign-in probe listeners, plus the pre-await Humble
 * pulls (R10). The 49-07 D-16/R3 rule holds: the expiry health check lives in
 * the sidecar boot pass, so nothing here calls humbleCheckHealth, and nothing
 * here starts a probe (P3).
 */
function registerAuthListeners(): void {
  const auth = useAuthState.getState()

  // D-09: state-only listener -- never opens a dialog/modal directly.
  window.api.handleHumbleAuthState((_e, humbleState) =>
    auth.applyHumbleAuthState(humbleState)
  )

  // 49-07 (D-08): the sidecar writes the persisted expiry flags BEFORE it
  // publishes, so a re-arm off this push reads fresh flags. Sanitised inside
  // applySignInProbeOutcomes (T-49-20).
  window.api.handleSignInProbeOutcomes((_e, { outcomes }) =>
    auth.applySignInProbeOutcomes(outcomes)
  )

  // Keys ONLY (D-26 progressive fill): must not touch `syncing`.
  window.api.handleHumbleKeysUpdated((_e, keys) => auth.applyHumbleKeys(keys))

  window.api.handleHumbleSyncProgress((_e, { done, total }) =>
    auth.applyHumbleSyncProgress(done, total)
  )

  // Live-UAT round 2 (D-31/D-32): the single authoritative end-of-sync signal.
  window.api.handleHumbleSyncStateChanged((_e, syncState) =>
    auth.applyHumbleSyncState(syncState)
  )

  // Sync stays on mount, fire-and-forget, gated on `isLoggedIn` (the connected
  // flag), NOT `username`.
  if (useAuthState.getState().humble.isLoggedIn) {
    void window.api.humbleSync()
  }

  // Cache-then-sync (D-23): render what is on disk immediately.
  void window.api
    .humbleGetKeys()
    .then((keys) => useAuthState.getState().applyHumbleKeys(keys))
  void window.api
    .humbleGetSyncState()
    .then((syncState) =>
      useAuthState.getState().applyHumbleSyncState(syncState, false)
    )
}

/**
 * F-49-R1-1: the backend's getUserInfo() is self-healing in both directions, so
 * it is asked on every mount and the Epic username is seeded from its answer
 * only when the mirror had none. Returns whether user info exists.
 */
export async function seedEpicUserInfo(): Promise<boolean> {
  const epicUserInfo = await window.api.getUserInfo()
  if (epicUserInfo?.displayName && !useAuthState.getState().epicUsername) {
    useAuthState.setState({ epicUsername: epicUserInfo.displayName })
  }
  return Boolean(epicUserInfo)
}

export async function refreshAmazonUserInfo(
  amazonUser: boolean
): Promise<void> {
  if (amazonUser) {
    await window.api.getAmazonUserInfo()
  }
}

/**
 * 49-07 (D-08, Pitfall 11): pull once on mount, because the outcomes push can
 * precede the listener. Read-only getter -- nothing here starts a probe (P3).
 */
export function pullSignInProbeOutcomes(): void {
  window.api
    .getSignInProbeOutcomes()
    .then((outcomes) =>
      useAuthState.getState().applySignInProbeOutcomes(outcomes)
    )
    .catch((error) =>
      window.api.logError(`Sign-in outcomes pull failed: ${String(error)}`)
    )
}

/**
 * F-49-R1-3: the dismissed set is seeded post-hydration by readInitialAuth.
 * This backend read is kept because the mirror can diverge from the backend's
 * config.json (same class as CR-01) and because a failed or timed-out hydration
 * leaves the mirror empty. Hydrate once from the backend's authoritative
 * settings. This is a READ: it never calls setSetting,
 * so dismiss and re-arm stay the only writers. Union with the in-session set so
 * a dismiss that raced the fetch is not undone.
 */
export function hydrateDismissedSignInNotices(): Promise<void> {
  return window.api
    .requestAppSettings()
    .then((settings) => {
      const persisted = normalizeSignInDismissals(
        settings?.dismissedSignInNotices
      )
      if (persisted.length === 0) {
        return
      }
      const current = useAuthState.getState().dismissedSignInNotices
      const merged = normalizeSignInDismissals([...current, ...persisted])
      if (
        merged.length !== current.length ||
        merged.some((store, i) => store !== current[i])
      ) {
        useAuthState.setState({ dismissedSignInNotices: merged })
      }
    })
    .catch((error) =>
      window.api.logError(
        `dismissedSignInNotices hydration failed: ${String(error)}`
      )
    )
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

let postMountStarted = false
let bootEffectRan = false

/**
 * The former GlobalState.componentDidMount tail, in its original order. Runs
 * once; frontendReady stays the last step.
 */
export async function runPostMountBoot(): Promise<void> {
  if (postMountStarted) return
  postMountStarted = true

  // R10: seed isFullscreen/isFrameless, then follow the pushes.
  await seedAndFollowWindowChrome()

  const { gogUser, amazonUser, steamUser } = readMountStoreUsers()

  // F-49-R1-1 (Phase 49 live gate Run 1): this used to be gated on
  // `legendaryUser` (the mirror already holding `userInfo`). legendary
  // 0.21.0 deletes `user.json` when a refresh token is rejected, the backend
  // then purges `userInfo` (`legendary/user.ts:713`), and once it was gone
  // nothing ever asked for it back, even after the file returned. The
  // backend's `getUserInfo()` is self-healing in both directions (rebuilds
  // from the file when present, purges when absent), so call it on every
  // mount and seed the username from its answer when the mirror had none.
  // The cold-boot expired path does not depend on this: the latched flag
  // wins in `resolveSignInState` branch 1 (measured live 2026-10-09).
  const legendaryUser = await seedEpicUserInfo()

  await refreshAmazonUserInfo(amazonUser)

  restoreStoredGameUpdates()

  runMountLibraryRefresh({ legendaryUser, gogUser, amazonUser, steamUser })

  registerControllerListener()

  followConnectivity()

  // 49-07 (D-08, Pitfall 11): pull once on mount, because the outcomes push
  // can precede the listener above. Read-only getter -- nothing here starts
  // a probe (P3).
  pullSignInProbeOutcomes()

  // F-49-R1-3: hydrate the dismissed set from the backend's settings, as a
  // read (see hydrateDismissedSignInNotices).
  void hydrateDismissedSignInNotices()

  useAuthState.getState().rearmFromCurrentState()

  applySavedFonts()

  window.api.frontendReady()
}

/** What BootSequence's layout effect calls; once-guarded. */
export function bootSequenceEffect(): void {
  if (bootEffectRan) return
  bootEffectRan = true
  void runPostMountBoot()
}

/**
 * What BootSequence calls: the old componentDidMount only ran once i18next had
 * loaded, so hold the boot (and frontendReady) until it has initialised.
 */
export function bootSequenceEffectWhenI18nReady(): void {
  runWhenI18nextInitialized(bootSequenceEffect)
}

/** @public Test-only: lets a test prove the once-guard. */
export function __resetInitStateSubscriptionsGuardForTests(): void {
  initialised = false
  postMountStarted = false
  bootEffectRan = false
}
