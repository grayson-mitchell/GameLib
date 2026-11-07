import type {
  GameStatus,
  LaunchParams,
  Runner,
  StatusPromise
} from '../../types'
import type {
  SteamBottleLaunchWaitingCause,
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamGoOfflinePayload,
  SteamRequestNoticePayload,
  SteamSetupDownloadProgress
} from '../steam'

export interface SteamAsync {
  // `origin` (quick-260817-d61) is observability + the Steam keyring deferral
  // trigger ONLY — it must never carry user data. GlobalState.tsx already
  // computes it for every refreshLibrary() call; this just lets it cross the
  // IPC boundary so both backend handlers (Electron's addHandler and the
  // Tauri sidecar's steamFlowRegistration.ts) can attribute a deferred vs.
  // deliberate Steam refresh to what triggered it.
  refreshLibrary: (library?: Runner | 'all', origin?: string) => Promise<void>
  launch: (args: LaunchParams) => StatusPromise
}

export interface SteamFrontendMessages {
  // Phase 17 (17-04): pushed by SteamGame.install()/launch() (17-05) when a
  // bottle-eligible game is un-provisioned; the global listener (17-06)
  // subscribes to this to drive the guided-setup flow.
  steamBottleSetupRequired: (payload: { appName: string }) => void
  // quick 261027-tot: progress of a first-run Steam setup payload download.
  steamSetupDownloadProgress: (payload: SteamSetupDownloadProgress) => void
  // Phase 24 (24-06), D-05/D-06: pushed by helperProcess.ts's
  // ensureBridgeHelperReady() when the shared native Steam-bridge helper is
  // not ready (unreachable within the poll budget, or up but not inited
  // against a live Steam session -- 'not-inited' is a DISTINCT reason from
  // 'unreachable', review finding #7). Registered here -- the first
  // producer wave -- so sendFrontendMessage('steamBridgeSetupRequired', ...)
  // typechecks at first use (finding #1). 24-08 is the first CONSUMER (adds
  // fallbackAvailable to the payload it sends).
  steamBridgeSetupRequired: (payload: {
    appName: string
    reason?: string
    fallbackAvailable?: boolean
    // Phase 51 Plan 03 (D-51-07/09): the symbols a persisted scan found
    // missing, surfaced alongside the setup-required notice so the user
    // sees WHY the bridge is unavailable, not just that it is. Optional —
    // absent for every pre-Phase-51 reason this message already carries.
    missingSymbols?: string[]
    // quick 261107-lum: replay the user's Windows-build choice on retry.
    forceWindowsViaBottle?: true
  }) => void
  // Phase 51 Plan 03 (D-51-02/08): the one-time per-game notice fired when a
  // game launches through a stubbed interface, an identity fallback
  // (D-51-04), or past a known-bad acknowledgement — names the reason and,
  // for a known-bad route, the taxonomy reason too, so 51-16's UI can render
  // the exact wording without re-deriving it from SteamBridgeRouteVerdict.
  // D-51-08 amendment (2026-10-23): a 'known-bad' notice on route 'bridge' is
  // informational -- the bridge is still attempted once the user proceeds.
  // Quick 261023-oq7: 'scan-miss' now also arrives on route 'bridge' as an
  // informational notice (it used to be a bottle notice).
  // `userRoute` is sent back unchanged on acknowledgement so an existing
  // override is never wiped.
  // Phase 54: user.ts acquireAuthenticated emits when the go-offline wrap did
  // not see Mac Steam log off; SteamGoOfflineNotice.ts subscribes.
  steamGoOfflineRequired: (payload: SteamGoOfflinePayload) => void
  // quick 261106-pvk: one-way push when Steam never starts a delegated request
  steamRequestNotice: (payload: SteamRequestNoticePayload) => void
  steamBridgeRouteNotice: (payload: {
    appName: string
    reason: SteamBridgeRouteReason
    knownBadReason: SteamBridgeKnownBadReason | null
    missingSymbols: string[]
    route: 'bridge' | 'bottle'
    userRoute: 'bridge' | 'bottle' | null
    // quick 261107-lum: replay the user's Windows-build choice on retry.
    forceWindowsViaBottle?: true
  }) => void
  // Phase 51 Plan 03 (D-51-16, folded todo): pushed when a bottled-Steam
  // fallback launch has produced no game process within the grace window —
  // `detectedCause` is the bottle-log-derived classification (`null` when no
  // single cause could be distinguished from logs/bootstrap_log.txt /
  // console_log.txt), per the todo's own prescription.
  steamBottleLaunchWaiting: (payload: {
    appName: string
    detectedCause: SteamBottleLaunchWaitingCause | null
  }) => void
  // Phase 21 (21-10), D-10/D-11: pushed by clientSetup.ts's
  // ensureSteamClientReady() (native depot-download opt-in ON, non-bottle
  // path) when the Steam CLIENT itself is either absent ('install') or
  // installed-but-never-launched ('launch-once'). Distinct from
  // steamBottleSetupRequired above — that event is the macOS CrossOver
  // BOTTLE flow; this one is the native/host Steam client itself.
  steamClientSetupRequired: (payload: {
    appName: string
    reason: 'install' | 'launch-once'
  }) => void
  // Emitted while Steam per-game metadata/art is being fetched in the
  // background (throttled). `syncing: true` when the first fetch starts,
  // `false` once the last one finishes — drives the library sync indicator.
  steamMetadataSyncing: (payload: { syncing: boolean }) => void
  // Phase 34.15 (34.15-02), D-06/D-07: pushed on EVERY exit path of
  // SteamLibraryManager.refresh() (all four -- see Plan 05), mirroring
  // steamMetadataSyncing verbatim. Replaces refreshingInTheBackground (which
  // defaults true and resets to true after every unscoped refresh, so it
  // never actually meant "a refresh is running") as the driver of the Steam
  // sync indicator's terminal state. `reason` is present only when
  // `status === 'failed'`.
  steamSyncStatus: (payload: {
    status: SteamSyncStatus
    reason?: SteamSyncFailureReason
  }) => void
  progressUpdate: (progress: GameStatus) => void
}

// Phase 34.15 (34.15-02), D-06/D-07: the Steam library sync tri-state and its
// failure-reason vocabulary. Reason codes are one per distinguishable backend
// failure (Claude's Discretion under D-07), chosen so the inline notice can
// say something more useful than "failed":
//   - 'client-not-ready': the Steam session could not be re-established.
//   - 'logon-rejected': the CM was reached and REFUSED the stored-credential
//     logon (e.g. AccessDenied). Terminal, not a reconnect in flight:
//     steam-user schedules no retry after it, so a repeat replays the refusal.
//   - 'owned-apps-failed': the CM was reached but the owned-app list did not
//     arrive -- the cached library is being served instead.
//   - 'sync-failed': the owned-app list arrived but hydration threw.
// Both runtimes (Electron main + the Tauri sidecar) represent plain string
// unions identically, satisfying D-07's cross-runtime representability
// constraint.
export type SteamSyncStatus = 'idle' | 'syncing' | 'failed'
// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding). Shared-
// contract caution (common/types/ipc.ts) applied: checked for a "reserved
// for" intent signal before un-exporting -- none found, this is an ordinary
// field type of `FrontendMessages.steamSyncStatus`'s payload below, not
// deliberate API surface, so the usual `ts-prune-ignore-next` remedy (used
// twice already in this file, at :81/:185, for genuinely intentional cases)
// does not apply here.
type SteamSyncFailureReason =
  | 'client-not-ready'
  | 'logon-rejected'
  | 'owned-apps-failed'
  | 'sync-failed'
