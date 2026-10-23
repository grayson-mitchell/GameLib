/**
 * Unit tests for the SteamBridgeRouteNotice store + backend-signal wiring
 * (D-51-08/11, Plan 13). No jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring) so the store/handler are exercised
 * directly (zustand's `create` needs no DOM) rather than via mounting
 * GlobalState.tsx. Mirrors SteamBridgeSetup.test.ts.
 */
import {
  useSteamBridgeRouteNotice,
  handleSteamBridgeRouteNoticeSignal,
  resolveRouteNoticeContent,
  knownBadReasonKey
} from '../SteamBridgeRouteNotice'
import type { IpcRendererEvent } from 'backend/platform'

const RESET_STATE = {
  isOpen: false,
  appName: undefined,
  reason: undefined,
  knownBadReason: null,
  missingSymbols: [],
  route: undefined,
  userRoute: null
}

describe('useSteamBridgeRouteNotice store', () => {
  afterEach(() => {
    useSteamBridgeRouteNotice.setState(RESET_STATE)
  })

  it('starts closed with no appName, no reason, and no missingSymbols', () => {
    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(false)
    expect(useSteamBridgeRouteNotice.getState().appName).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().reason).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().knownBadReason).toBeNull()
    expect(useSteamBridgeRouteNotice.getState().missingSymbols).toEqual([])
    expect(useSteamBridgeRouteNotice.getState().route).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().userRoute).toBeNull()
  })

  it('open(payload) sets isOpen + every field from the payload', () => {
    useSteamBridgeRouteNotice.getState().open({
      appName: '440',
      reason: 'known-bad',
      knownBadReason: 'drm-wrapped',
      missingSymbols: [],
      route: 'bottle',
      userRoute: null
    })

    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(true)
    expect(useSteamBridgeRouteNotice.getState().appName).toBe('440')
    expect(useSteamBridgeRouteNotice.getState().reason).toBe('known-bad')
    expect(useSteamBridgeRouteNotice.getState().knownBadReason).toBe(
      'drm-wrapped'
    )
    expect(useSteamBridgeRouteNotice.getState().missingSymbols).toEqual([])
  })

  it('open(payload) saves route and userRoute; close() resets them', () => {
    useSteamBridgeRouteNotice.getState().open({
      appName: '63000',
      reason: 'known-bad',
      knownBadReason: 'does-not-run',
      missingSymbols: [],
      route: 'bridge',
      userRoute: 'bottle'
    })
    expect(useSteamBridgeRouteNotice.getState().route).toBe('bridge')
    expect(useSteamBridgeRouteNotice.getState().userRoute).toBe('bottle')

    useSteamBridgeRouteNotice.getState().close()
    expect(useSteamBridgeRouteNotice.getState().route).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().userRoute).toBeNull()
  })

  it('open(payload) carries missingSymbols verbatim for a scan-miss payload', () => {
    useSteamBridgeRouteNotice.getState().open({
      appName: '570',
      reason: 'scan-miss',
      knownBadReason: null,
      missingSymbols: ['SteamUtils005', 'SteamUser023'],
      route: 'bottle',
      userRoute: null
    })

    expect(useSteamBridgeRouteNotice.getState().missingSymbols).toEqual([
      'SteamUtils005',
      'SteamUser023'
    ])
  })

  it('close() resets every field back to the initial shape', () => {
    useSteamBridgeRouteNotice.getState().open({
      appName: '440',
      reason: 'known-bad',
      knownBadReason: 'drm-wrapped',
      missingSymbols: [],
      route: 'bottle',
      userRoute: null
    })
    useSteamBridgeRouteNotice.getState().close()

    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(false)
    expect(useSteamBridgeRouteNotice.getState().appName).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().reason).toBeUndefined()
    expect(useSteamBridgeRouteNotice.getState().knownBadReason).toBeNull()
    expect(useSteamBridgeRouteNotice.getState().missingSymbols).toEqual([])
  })
})

describe('handleSteamBridgeRouteNoticeSignal (backend signal wiring)', () => {
  afterEach(() => {
    useSteamBridgeRouteNotice.setState(RESET_STATE)
  })

  it('opens the store with the exact payload the backend signal carries', () => {
    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(false)

    handleSteamBridgeRouteNoticeSignal({} as IpcRendererEvent, {
      appName: '2010',
      reason: 'win64-no-shim',
      knownBadReason: null,
      missingSymbols: [],
      route: 'bottle',
      userRoute: null
    })

    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(true)
    expect(useSteamBridgeRouteNotice.getState().appName).toBe('2010')
    expect(useSteamBridgeRouteNotice.getState().reason).toBe('win64-no-shim')
  })

  it('never opens the store unless the signal fires -- proves the frontend does not independently decide eligibility', () => {
    expect(useSteamBridgeRouteNotice.getState().isOpen).toBe(false)
    expect(useSteamBridgeRouteNotice.getState().appName).toBeUndefined()
  })
})

describe('resolveRouteNoticeContent — D-51-08/11/13', () => {
  it("'known-bad' -> { bodyKey: 'knownBad', showTryBridge: true }", () => {
    expect(
      resolveRouteNoticeContent({
        appName: '440',
        reason: 'known-bad',
        knownBadReason: 'drm-wrapped',
        missingSymbols: [],
        route: 'bottle',
        userRoute: null
      })
    ).toEqual({
      bodyKey: 'knownBad',
      showTryBridge: true,
      informational: false
    })
  })

  it("'known-bad' on route 'bridge' -> informational, no Try-the-bridge-anyway (D-51-08 amendment)", () => {
    expect(
      resolveRouteNoticeContent({
        appName: '63000',
        reason: 'known-bad',
        knownBadReason: 'does-not-run',
        missingSymbols: [],
        route: 'bridge',
        userRoute: null
      })
    ).toEqual({
      bodyKey: 'knownBad',
      showTryBridge: false,
      informational: true
    })
  })

  it("'scan-miss' -> { bodyKey: 'scanMiss', showTryBridge: true }", () => {
    expect(
      resolveRouteNoticeContent({
        appName: '570',
        reason: 'scan-miss',
        knownBadReason: null,
        missingSymbols: ['SteamUtils005'],
        route: 'bottle',
        userRoute: null
      })
    ).toEqual({
      bodyKey: 'scanMiss',
      showTryBridge: true,
      informational: false
    })
  })

  it("'win64-no-shim' -> { bodyKey: 'win64NoShim', showTryBridge: false } (D-51-13: never offer an override past the fail-closed default)", () => {
    expect(
      resolveRouteNoticeContent({
        appName: '2010',
        reason: 'win64-no-shim',
        knownBadReason: null,
        missingSymbols: [],
        route: 'bottle',
        userRoute: null
      })
    ).toEqual({
      bodyKey: 'win64NoShim',
      showTryBridge: false,
      informational: false
    })
  })
})

describe('knownBadReasonKey — D-51-08 camelCase mapping for the catalog keys', () => {
  it.each([
    ['drm-wrapped', 'drmWrapped'],
    ['win64-only', 'win64Only'],
    ['p2p-required', 'p2pRequired'],
    ['does-not-run', 'doesNotRun']
  ] as const)('%s -> %s', (reason, expected) => {
    expect(knownBadReasonKey(reason)).toBe(expected)
  })
})
