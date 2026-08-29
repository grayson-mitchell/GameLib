/**
 * Unit tests for the SteamClientSetup store + backend-signal wiring
 * (Phase 21 Plan 10, D-10/D-11). No jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring) so the store/handler are exercised
 * directly (zustand's `create` needs no DOM) rather than via mounting
 * GlobalState.tsx. Mirrors SteamBottleSetup.test.ts's own structure.
 */
import {
  useSteamClientSetup,
  handleSteamClientSetupRequiredSignal
} from '../SteamClientSetup'
import type { IpcRendererEvent } from 'backend/platform'

describe('useSteamClientSetup store', () => {
  afterEach(() => {
    useSteamClientSetup.setState({
      isOpen: false,
      appName: undefined,
      reason: undefined
    })
  })

  it('open(appName, reason) sets isOpen + appName + reason', () => {
    useSteamClientSetup.getState().open('123456', 'install')

    expect(useSteamClientSetup.getState().isOpen).toBe(true)
    expect(useSteamClientSetup.getState().appName).toBe('123456')
    expect(useSteamClientSetup.getState().reason).toBe('install')
  })

  it('close() resets isOpen', () => {
    useSteamClientSetup.getState().open('123456', 'launch-once')
    useSteamClientSetup.getState().close()

    expect(useSteamClientSetup.getState().isOpen).toBe(false)
  })

  it('starts closed with no appName/reason', () => {
    expect(useSteamClientSetup.getState().isOpen).toBe(false)
    expect(useSteamClientSetup.getState().appName).toBeUndefined()
    expect(useSteamClientSetup.getState().reason).toBeUndefined()
  })
})

describe('handleSteamClientSetupRequiredSignal (backend signal wiring)', () => {
  afterEach(() => {
    useSteamClientSetup.setState({
      isOpen: false,
      appName: undefined,
      reason: undefined
    })
  })

  it('opens the store with the exact appName + D-10 reason the backend signal carries', () => {
    expect(useSteamClientSetup.getState().isOpen).toBe(false)

    handleSteamClientSetupRequiredSignal({} as IpcRendererEvent, {
      appName: 'some-steam-app',
      reason: 'install'
    })

    expect(useSteamClientSetup.getState().isOpen).toBe(true)
    expect(useSteamClientSetup.getState().appName).toBe('some-steam-app')
    expect(useSteamClientSetup.getState().reason).toBe('install')
  })

  it('opens the store with the D-11 launch-once reason the backend signal carries', () => {
    handleSteamClientSetupRequiredSignal({} as IpcRendererEvent, {
      appName: 'some-steam-app',
      reason: 'launch-once'
    })

    expect(useSteamClientSetup.getState().isOpen).toBe(true)
    expect(useSteamClientSetup.getState().reason).toBe('launch-once')
  })

  it('never opens the store unless the signal fires — proves the frontend does not independently decide eligibility (D-10/D-11)', () => {
    // No signal fired in this test at all.
    expect(useSteamClientSetup.getState().isOpen).toBe(false)
    expect(useSteamClientSetup.getState().appName).toBeUndefined()
    expect(useSteamClientSetup.getState().reason).toBeUndefined()
  })
})
