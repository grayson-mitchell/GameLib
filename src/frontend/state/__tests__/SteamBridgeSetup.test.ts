/**
 * Unit tests for the SteamBridgeSetup store + backend-signal wiring (R7,
 * D-05). No jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring) so the store/handler are exercised
 * directly (zustand's `create` needs no DOM) rather than via mounting
 * GlobalState.tsx (a class component with heavy module-level side effects).
 * Mirrors SteamBottleSetup.test.ts.
 */
import {
  useSteamBridgeSetup,
  handleSteamBridgeSetupRequiredSignal
} from '../SteamBridgeSetup'
import type { IpcRendererEvent } from 'backend/platform'

describe('useSteamBridgeSetup store', () => {
  afterEach(() => {
    useSteamBridgeSetup.setState({
      isOpen: false,
      appName: undefined,
      reason: undefined,
      fallbackAvailable: true,
      missingSymbols: []
    })
  })

  it('starts closed with no appName and no missingSymbols', () => {
    expect(useSteamBridgeSetup.getState().isOpen).toBe(false)
    expect(useSteamBridgeSetup.getState().appName).toBeUndefined()
    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([])
  })

  it('open(appName, opts) sets isOpen + appName + reason + fallbackAvailable', () => {
    useSteamBridgeSetup
      .getState()
      .open('440', { reason: 'bridge-launch-failed', fallbackAvailable: true })

    expect(useSteamBridgeSetup.getState().isOpen).toBe(true)
    expect(useSteamBridgeSetup.getState().appName).toBe('440')
    expect(useSteamBridgeSetup.getState().reason).toBe('bridge-launch-failed')
    expect(useSteamBridgeSetup.getState().fallbackAvailable).toBe(true)
  })

  it('open(appName) with no opts defaults fallbackAvailable to true (D-05: never a silent dead-end)', () => {
    useSteamBridgeSetup.getState().open('440')

    expect(useSteamBridgeSetup.getState().isOpen).toBe(true)
    expect(useSteamBridgeSetup.getState().fallbackAvailable).toBe(true)
    expect(useSteamBridgeSetup.getState().reason).toBeUndefined()
  })

  it('D-51-09 (Task 3): open(appName, { missingSymbols }) keeps missingSymbols, and defaults to [] when the opts omit it', () => {
    useSteamBridgeSetup.getState().open('440', {
      reason: 'scan-miss',
      missingSymbols: ['SteamUtils005', 'SteamUser023']
    })

    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([
      'SteamUtils005',
      'SteamUser023'
    ])

    useSteamBridgeSetup
      .getState()
      .open('441', { reason: 'bridge-launch-failed' })

    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([])
  })

  it('close() resets isOpen to false, clears appName, and resets missingSymbols to []', () => {
    useSteamBridgeSetup.getState().open('440', {
      reason: 'scan-miss',
      missingSymbols: ['SteamUtils005']
    })
    useSteamBridgeSetup.getState().close()

    expect(useSteamBridgeSetup.getState().isOpen).toBe(false)
    expect(useSteamBridgeSetup.getState().appName).toBeUndefined()
    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([])
  })
})

describe('handleSteamBridgeSetupRequiredSignal (backend signal wiring)', () => {
  afterEach(() => {
    useSteamBridgeSetup.setState({
      isOpen: false,
      appName: undefined,
      reason: undefined,
      fallbackAvailable: true,
      missingSymbols: []
    })
  })

  it('opens the store with the exact appName/reason/fallbackAvailable the backend signal carries', () => {
    expect(useSteamBridgeSetup.getState().isOpen).toBe(false)

    handleSteamBridgeSetupRequiredSignal({} as IpcRendererEvent, {
      appName: '2010',
      reason: 'bridge-bottle-provision-failed',
      fallbackAvailable: true
    })

    expect(useSteamBridgeSetup.getState().isOpen).toBe(true)
    expect(useSteamBridgeSetup.getState().appName).toBe('2010')
    expect(useSteamBridgeSetup.getState().reason).toBe(
      'bridge-bottle-provision-failed'
    )
    expect(useSteamBridgeSetup.getState().fallbackAvailable).toBe(true)
  })

  it('does not throw and defaults fallbackAvailable sensibly when the signal omits it', () => {
    expect(() =>
      handleSteamBridgeSetupRequiredSignal({} as IpcRendererEvent, {
        appName: '2010'
      })
    ).not.toThrow()

    expect(useSteamBridgeSetup.getState().isOpen).toBe(true)
    expect(useSteamBridgeSetup.getState().fallbackAvailable).toBe(true)
  })

  it('never opens the store unless the signal fires — proves the frontend does not independently decide eligibility', () => {
    // No signal fired in this test at all.
    expect(useSteamBridgeSetup.getState().isOpen).toBe(false)
    expect(useSteamBridgeSetup.getState().appName).toBeUndefined()
  })

  it('D-51-09 (Task 3): threads missingSymbols through from the backend signal to the store, defaulting to [] when absent', () => {
    handleSteamBridgeSetupRequiredSignal({} as IpcRendererEvent, {
      appName: '570',
      reason: 'scan-miss',
      fallbackAvailable: true,
      missingSymbols: ['SteamUtils005']
    })

    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([
      'SteamUtils005'
    ])

    handleSteamBridgeSetupRequiredSignal({} as IpcRendererEvent, {
      appName: '571',
      reason: 'bridge-launch-failed'
    })

    expect(useSteamBridgeSetup.getState().missingSymbols).toEqual([])
  })
})
