import { z } from 'zod'

import type { GameStatus, StatusPromise } from '../../types'
import type {
  SteamAdoptionRestartOutcome,
  SteamAdoptionStatus,
  SteamAdoptionStatusPayload,
  SteamBottleLaunchWaitingCause,
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamDirectLaunchView,
  SteamRequestNoticePayload,
  SteamSetupDownloadProgress
} from '../steam'
import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns,
  type PushFns
} from './schemaTypes'
import { launchOptionSchema } from './settingsSchema'

// `origin` (quick-260817-d61) is observability + the Steam keyring deferral trigger ONLY: it
// must never carry user data, hence the tight bound.
const refreshOrigin = z.string().max(256)

// D-11: strict LaunchParams, including the LaunchOption union.
const launchParamsArg = z.strictObject({
  appName: nonEmptyString(256),
  runner: runnerArg(),
  launchArguments: launchOptionSchema.optional(),
  skipVersionCheck: z.boolean().optional(),
  args: z.array(z.string().max(8192)).max(1024).optional()
})

export const steamAsyncArgs = {
  refreshLibrary: z.tuple([
    optionalArg(z.union([runnerArg(), z.literal('all')])),
    optionalArg(refreshOrigin)
  ]),
  launch: z.tuple([launchParamsArg]),
  // quick 261117-p38 / q1t: the "Launch without Steam" verdict for the per-game setting toggle.
  steamDirectLaunchVerdict: z.tuple([z.string().regex(/^\d{1,10}$/)]),
  // Phase 81 D-05: the one-shot "Launch without Steam" on a refused Play restart's notice.
  steamLaunchWithoutSteamOnce: z.tuple([z.string().regex(/^\d{1,10}$/)]),
  // Phase 81 D-01..D-03: the game page's pending-adoption read (appId is renderer input).
  steamAdoptionStatus: z.tuple([z.string().regex(/^\d{1,10}$/)]),
  // D-02 / D-03: the note's two actions (same renderer-input appId rule).
  steamAdoptionRestartNow: z.tuple([z.string().regex(/^\d{1,10}$/)]),
  steamAdoptionOpenSteam: z.tuple([z.string().regex(/^\d{1,10}$/)])
}

interface SteamAsyncReturns {
  refreshLibrary: Promise<void>
  launch: StatusPromise
  steamDirectLaunchVerdict: Promise<SteamDirectLaunchView>
  steamLaunchWithoutSteamOnce: Promise<boolean>
  steamAdoptionStatus: Promise<SteamAdoptionStatus>
  steamAdoptionRestartNow: Promise<SteamAdoptionRestartOutcome>
  steamAdoptionOpenSteam: Promise<void>
}

// D-12: typing only, never parsed at runtime. Every payload originates in the backend, so the
// object arms are z.custom type carriers rather than strict shapes.
const isObject = (v: unknown) => typeof v === 'object' && v !== null

export const steamFrontendMessagesArgs = {
  // Phase 17 (17-04): a bottle-eligible game is un-provisioned; drives the guided-setup flow.
  steamBottleSetupRequired: z.tuple([z.custom<{ appName: string }>(isObject)]),
  // quick 261027-tot: progress of a first-run Steam setup payload download.
  steamSetupDownloadProgress: z.tuple([
    z.custom<SteamSetupDownloadProgress>(isObject)
  ]),
  // Phase 24 (24-06), D-05/D-06: the shared native Steam-bridge helper is not ready.
  // Phase 51 Plan 03: `missingSymbols` explains WHY; quick 261107-lum:
  // `forceWindowsViaBottle` replays the user's Windows-build choice on retry.
  steamBridgeSetupRequired: z.tuple([
    z.custom<{
      appName: string
      reason?: string
      fallbackAvailable?: boolean
      missingSymbols?: string[]
      forceWindowsViaBottle?: true
    }>(isObject)
  ]),
  // quick 261106-pvk: one-way push when Steam never starts a delegated request.
  steamRequestNotice: z.tuple([z.custom<SteamRequestNoticePayload>(isObject)]),
  // Phase 81 (D-07, D-03): the game page's adoption status, pushed on every record write/clear and
  // every signed-in change. `seq` rises strictly per boot; the renderer drops anything not newer.
  steamAdoptionStatusChanged: z.tuple([
    z.custom<SteamAdoptionStatusPayload>(isObject)
  ]),
  // Phase 51 Plan 03 (D-51-02/08): the one-time per-game notice fired when a game launches
  // through a stubbed interface, an identity fallback, or past a known-bad acknowledgement.
  // `userRoute` is sent back unchanged on acknowledgement so an override is never wiped.
  steamBridgeRouteNotice: z.tuple([
    z.custom<{
      appName: string
      reason: SteamBridgeRouteReason
      knownBadReason: SteamBridgeKnownBadReason | null
      missingSymbols: string[]
      route: 'bridge' | 'bottle'
      userRoute: 'bridge' | 'bottle' | null
      forceWindowsViaBottle?: true
    }>(isObject)
  ]),
  // Phase 51 Plan 03 (D-51-16): a bottled-Steam fallback launch produced no game process
  // within the grace window; `detectedCause` is `null` when no single cause was distinguishable.
  steamBottleLaunchWaiting: z.tuple([
    z.custom<{
      appName: string
      detectedCause: SteamBottleLaunchWaitingCause | null
    }>(isObject)
  ]),
  // Phase 21 (21-10), D-10/D-11: the native/host Steam client is absent ('install') or
  // installed-but-never-launched ('launch-once').
  steamClientSetupRequired: z.tuple([
    z.custom<{ appName: string; reason: 'install' | 'launch-once' }>(isObject)
  ]),
  // Throttled while Steam per-game metadata/art is fetched in the background.
  steamMetadataSyncing: z.tuple([z.strictObject({ syncing: z.boolean() })]),
  // Phase 34.15 (34.15-02), D-06/D-07: pushed on EVERY exit path of
  // SteamLibraryManager.refresh(); `reason` is present only when `status === 'failed'`.
  steamSyncStatus: z.tuple([
    z.custom<{
      status: SteamSyncStatus
      reason?: SteamSyncFailureReason
    }>(isObject)
  ]),
  progressUpdate: z.tuple([z.custom<GameStatus>(isObject)])
}

export type SteamAsync = InvokeFns<typeof steamAsyncArgs, SteamAsyncReturns>
export type SteamFrontendMessages = PushFns<typeof steamFrontendMessagesArgs>

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
