import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason
} from 'common/types/steam'

export interface SteamBridgeRouteNoticePayload {
  appName: string
  reason: SteamBridgeRouteReason
  knownBadReason: SteamBridgeKnownBadReason | null
  missingSymbols: string[]
}

interface SteamBridgeRouteNoticeState {
  isOpen: boolean
  appName?: string
  reason?: SteamBridgeRouteReason
  knownBadReason: SteamBridgeKnownBadReason | null
  missingSymbols: string[]
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
// override (D-51-11).
export const useSteamBridgeRouteNotice = create<SteamBridgeRouteNoticeState>()(
  (set) => ({
    isOpen: false,
    appName: undefined,
    reason: undefined,
    knownBadReason: null,
    missingSymbols: [],
    open: ({ appName, reason, knownBadReason, missingSymbols }) =>
      set({
        isOpen: true,
        appName,
        reason,
        knownBadReason,
        missingSymbols
      }),
    close: () =>
      set({
        isOpen: false,
        appName: undefined,
        reason: undefined,
        knownBadReason: null,
        missingSymbols: []
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

export interface RouteNoticeContent {
  bodyKey: 'knownBad' | 'scanMiss' | 'win64NoShim'
  showTryBridge: boolean
}

// D-51-08/11: maps the backend's NOTICE_REASONS (bridgeRoute.ts) to the
// dialog's body copy key and whether "Try the bridge anyway" is offered --
// D-51-13's win64-no-shim fail-closed default never offers an override
// (hidden per this plan's objective), the other two always do.
export function resolveRouteNoticeContent(
  payload: SteamBridgeRouteNoticePayload
): RouteNoticeContent {
  switch (payload.reason) {
    case 'known-bad':
      return { bodyKey: 'knownBad', showTryBridge: true }
    case 'scan-miss':
      return { bodyKey: 'scanMiss', showTryBridge: true }
    case 'win64-no-shim':
      return { bodyKey: 'win64NoShim', showTryBridge: false }
    default:
      // Defensive default -- the backend only ever fires this signal for
      // the three reasons above (NOTICE_REASONS, bridgeRoute.ts), but a
      // future NOTICE_REASONS member must render SOMETHING rather than
      // crash the dialog. scan-miss's copy is the most generic of the
      // three ("does not cover every Steam call"), so it is the safer
      // unknown-reason fallback.
      return { bodyKey: 'scanMiss', showTryBridge: true }
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
