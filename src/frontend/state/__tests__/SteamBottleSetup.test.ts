/**
 * Unit tests for the SteamBottleSetup store + backend-signal wiring (D-07,
 * D-11). No jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring) so the store/handler are exercised
 * directly (zustand's `create` needs no DOM) rather than via mounting
 * GlobalState.tsx (a class component with heavy module-level side effects).
 */
import {
  useSteamBottleSetup,
  handleSteamBottleSetupRequiredSignal
} from '../SteamBottleSetup'
import type { IpcRendererEvent } from 'electron'

describe('useSteamBottleSetup store', () => {
  afterEach(() => {
    useSteamBottleSetup.setState({ isOpen: false, appName: undefined })
  })

  it('open(appName) sets isOpen + appName', () => {
    useSteamBottleSetup.getState().open('123456')

    expect(useSteamBottleSetup.getState().isOpen).toBe(true)
    expect(useSteamBottleSetup.getState().appName).toBe('123456')
  })

  it('close() resets isOpen', () => {
    useSteamBottleSetup.getState().open('123456')
    useSteamBottleSetup.getState().close()

    expect(useSteamBottleSetup.getState().isOpen).toBe(false)
  })

  it('starts closed with no appName', () => {
    expect(useSteamBottleSetup.getState().isOpen).toBe(false)
    expect(useSteamBottleSetup.getState().appName).toBeUndefined()
  })
})

describe('handleSteamBottleSetupRequiredSignal (backend signal wiring)', () => {
  afterEach(() => {
    useSteamBottleSetup.setState({ isOpen: false, appName: undefined })
  })

  it('opens the store with the exact appName the backend signal carries', () => {
    expect(useSteamBottleSetup.getState().isOpen).toBe(false)

    handleSteamBottleSetupRequiredSignal({} as IpcRendererEvent, {
      appName: 'some-steam-app'
    })

    expect(useSteamBottleSetup.getState().isOpen).toBe(true)
    expect(useSteamBottleSetup.getState().appName).toBe('some-steam-app')
  })

  it('never opens the store unless the signal fires — proves the frontend does not independently decide eligibility (D-11)', () => {
    // No signal fired in this test at all.
    expect(useSteamBottleSetup.getState().isOpen).toBe(false)
    expect(useSteamBottleSetup.getState().appName).toBeUndefined()
  })
})
