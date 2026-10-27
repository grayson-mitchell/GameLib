/**
 * Unit tests for the guided Go Offline store + backend-signal wiring
 * (Phase 54 Plan 07). No jsdom in this project, so the store and the signal
 * handler are exercised directly. Mirrors SteamBridgeRouteNotice.test.ts.
 */
import {
  useSteamGoOfflineNotice,
  handleSteamGoOfflineRequiredSignal
} from '../SteamGoOfflineNotice'
import type { IpcRendererEvent } from 'backend/platform'

const RESET_STATE = {
  isOpen: false,
  action: undefined,
  appName: undefined,
  status: 'idle' as const
}

describe('useSteamGoOfflineNotice store', () => {
  afterEach(() => {
    useSteamGoOfflineNotice.setState(RESET_STATE)
  })

  it('starts closed and idle', () => {
    const s = useSteamGoOfflineNotice.getState()
    expect(s.isOpen).toBe(false)
    expect(s.action).toBeUndefined()
    expect(s.appName).toBeUndefined()
    expect(s.status).toBe('idle')
  })

  it('close() resets every field', () => {
    handleSteamGoOfflineRequiredSignal({} as IpcRendererEvent, {
      action: 'install',
      appName: '230070'
    })
    useSteamGoOfflineNotice.getState().setStatus('still-online')
    useSteamGoOfflineNotice.getState().close()
    const s = useSteamGoOfflineNotice.getState()
    expect(s.isOpen).toBe(false)
    expect(s.action).toBeUndefined()
    expect(s.appName).toBeUndefined()
    expect(s.status).toBe('idle')
  })

  it('setStatus moves between the four statuses', () => {
    for (const st of ['busy', 'still-online', 'ready', 'idle'] as const) {
      useSteamGoOfflineNotice.getState().setStatus(st)
      expect(useSteamGoOfflineNotice.getState().status).toBe(st)
    }
  })
})

describe('handleSteamGoOfflineRequiredSignal', () => {
  afterEach(() => {
    useSteamGoOfflineNotice.setState(RESET_STATE)
  })

  it('opens the store with the payload the backend carries', () => {
    handleSteamGoOfflineRequiredSignal({} as IpcRendererEvent, {
      action: 'install',
      appName: '230070'
    })
    const s = useSteamGoOfflineNotice.getState()
    expect(s.isOpen).toBe(true)
    expect(s.action).toBe('install')
    expect(s.appName).toBe('230070')
    expect(s.status).toBe('idle')
  })

  it('a second signal while open replaces the payload and resets status', () => {
    handleSteamGoOfflineRequiredSignal({} as IpcRendererEvent, {
      action: 'install',
      appName: '1'
    })
    useSteamGoOfflineNotice.getState().setStatus('still-online')
    handleSteamGoOfflineRequiredSignal({} as IpcRendererEvent, {
      action: 'refresh'
    })
    const s = useSteamGoOfflineNotice.getState()
    expect(s.isOpen).toBe(true)
    expect(s.action).toBe('refresh')
    expect(s.appName).toBeUndefined()
    expect(s.status).toBe('idle')
  })
})
