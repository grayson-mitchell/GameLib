import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason
} from 'common/types/steam'

// Consumed by SteamBridgeRouteNotice.tsx only through inferred call-site types
// (resolveRouteNoticeContent's parameter), never a named type import -- ts-prune
// sees that as module-local even though it's this module's public IPC contract.
// ts-prune-ignore-next
export interface SteamBridgeRouteNoticePayload {
  appName: string
  reason: SteamBridgeRouteReason
  knownBadReason: SteamBridgeKnownBadReason | null
  missingSymbols: string[]
  // D-51-08 amendments (2026-10-23): a 'known-bad' or 'scan-miss' notice on
  // route 'bridge' is informational -- the bridge is still attempted once the
  // user proceeds.
  route: 'bridge' | 'bottle'
  // Sent back unchanged on acknowledgement so an existing override survives.
  userRoute: 'bridge' | 'bottle' | null
}

interface SteamBridgeRouteNoticeState {
  isOpen: boolean
  appName?: string
  reason?: SteamBridgeRouteReason
  knownBadReason: SteamBridgeKnownBadReason | null
  missingSymbols: string[]
  route?: 'bridge' | 'bottle'
  userRoute: 'bridge' | 'bottle' | null
  open: (payload: SteamBridgeRouteNoticePayload) => void
  close: () => void
}

// D-51-08/11 (Plan 13): single global store driving the EXPLICIT bridge
// ROUTE notice -- opened EXCLUSIVELY in response to the backend
// `steamBridgeRouteNotice` push (games.ts's install(), gated on
// `bridgeRoute.noticeRequired`), never by a frontend eligibility check.
// Mirrors SteamBridgeSetup.ts's shape (D-07 precedent) -- a fourth
// guided-choice surface rather than a new invocation shape. Distinct from
// SteamBridgeSetup.ts: that store opens on a bridge-install FAILURE
// (R7/D-05); this one opens BEFORE any install attempt, for a route the
// backend already decided needs the user's explicit sign-off (D-51-08) or
// override (D-51-11). Since the D-51-08 amendment of 2026-10-23 it also opens
// for a non-DRM known-bad title that stays on the bridge route; that notice
// is informational (the bridge is still attempted).
export const useSteamBridgeRouteNotice = create<SteamBridgeRouteNoticeState>()(
  (set) => ({
    isOpen: false,
    appName: undefined,
    reason: undefined,
    knownBadReason: null,
    missingSymbols: [],
    route: undefined,
    userRoute: null,
    open: ({
      appName,
      reason,
      knownBadReason,
      missingSymbols,
      route,
      userRoute
    }) =>
      set({
        isOpen: true,
        appName,
        reason,
        knownBadReason,
        missingSymbols,
        route,
        userRoute
      }),
    close: () =>
      set({
        isOpen: false,
        appName: undefined,
        reason: undefined,
        knownBadReason: null,
        missingSymbols: [],
        route: undefined,
        userRoute: null
      })
  })
)

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in GlobalState.tsx) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component --
// this project's frontend jest config has no jsdom (see jest.config.js
// docstring), so class-component instantiation/mounting isn't feasible here.
// Mirrors SteamBridgeSetup.ts's handleSteamBridgeSetupRequiredSignal.
export const handleSteamBridgeRouteNoticeSignal = (
  _e: IpcRendererEvent,
  payload: SteamBridgeRouteNoticePayload
): void => {
  useSteamBridgeRouteNotice.getState().open(payload)
}

// Same as SteamBridgeRouteNoticePayload above: only consumed via resolveRouteNoticeContent's
// inferred return type (destructured in the .tsx, never imported by name).
// ts-prune-ignore-next
export interface RouteNoticeContent {
  bodyKey: 'knownBad' | 'scanMiss' | 'win64NoShim'
  showTryBridge: boolean
  // True for any notice on the bridge route (non-DRM known-bad, scan-miss):
  // proceed-or-cancel only, the bridge is still attempted.
  informational: boolean
  // Whether the dialog adds the known-bad line: a known-bad reason is set but
  // is not already the notice's own reason (one combined dialog, quick
  // 261023-oq7).
  showKnownBadLine: boolean
}

// D-51-08/11: maps the backend's NOTICE_REASONS (bridgeRoute.ts) to the
// dialog's body copy key and whether "Try the bridge anyway" is offered --
// D-51-13's win64-no-shim fail-closed default never offers an override
// (hidden per this plan's objective). Since quick 261023-oq7 a scan-miss
// arrives on route 'bridge' and is informational like a bridge-route
// known-bad notice (the bridge is attempted anyway; no override to offer).
// A bottle-route known-bad notice (drm-wrapped) offers "Try the bridge
// anyway".
export function resolveRouteNoticeContent(
  payload: SteamBridgeRouteNoticePayload
): RouteNoticeContent {
  const showKnownBadLine =
    payload.knownBadReason !== null && payload.reason !== 'known-bad'
  switch (payload.reason) {
    case 'known-bad':
      return payload.route === 'bridge'
        ? {
            bodyKey: 'knownBad',
            showTryBridge: false,
            informational: true,
            showKnownBadLine
          }
        : {
            bodyKey: 'knownBad',
            showTryBridge: true,
            informational: false,
            showKnownBadLine
          }
    case 'scan-miss':
      return {
        bodyKey: 'scanMiss',
        showTryBridge: false,
        informational: payload.route === 'bridge',
        showKnownBadLine
      }
    case 'win64-no-shim':
      return {
        bodyKey: 'win64NoShim',
        showTryBridge: false,
        informational: false,
        showKnownBadLine
      }
    default:
      // Defensive default -- the backend only ever fires this signal for
      // the three reasons above (NOTICE_REASONS, bridgeRoute.ts), but a
      // future NOTICE_REASONS member must render SOMETHING rather than
      // crash the dialog. scan-miss's copy is the most generic of the
      // three ("does not cover every Steam call"), so it is the safer
      // unknown-reason fallback.
      return {
        bodyKey: 'scanMiss',
        showTryBridge: false,
        informational: payload.route === 'bridge',
        showKnownBadLine
      }
  }
}

const KNOWN_BAD_REASON_KEYS: Record<SteamBridgeKnownBadReason, string> = {
  'drm-wrapped': 'drmWrapped',
  'win64-only': 'win64Only',
  'p2p-required': 'p2pRequired',
  'does-not-run': 'doesNotRun'
}

// D-51-08: maps the bundled known-bad taxonomy (SteamBridgeKnownBadReason,
// common/types/steam.ts) to the camelCase suffix used by the
// `steam.bridge.knownBad.*` catalog keys (public/locales/en/gamelib.json,
// Plan 04) -- the SAME four keys SteamBridgeSetup.tsx-adjacent copy never
// reads but this dialog's known-bad body line does.
export function knownBadReasonKey(reason: SteamBridgeKnownBadReason): string {
  return KNOWN_BAD_REASON_KEYS[reason]
}
