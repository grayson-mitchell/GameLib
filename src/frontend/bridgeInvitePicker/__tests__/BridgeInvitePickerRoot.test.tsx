/**
 * Quick 261101-llf. No jsdom: the component is called as a function with useEffect captured,
 * the store and the Tauri window mocked, and the captured effects are run by hand. The dialog's
 * own display ack (`dialogDisplayed`) is covered by SteamBridgeInviteDialog's tests; here the
 * dialog is stubbed and only the wiring this root adds is proven.
 */
import { isValidElement } from 'react'

const effects: Array<() => (() => void) | void> = []
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (fn: () => (() => void) | void) => {
    effects.push(fn)
  }
}))

const mockOpen = jest.fn()
let subscriber: ((state: unknown, prev: unknown) => void) | undefined
const mockUnsubscribe = jest.fn()
jest.mock('frontend/state/SteamBridgeInvite', () => ({
  useSteamBridgeInvite: {
    getState: () => ({ open: mockOpen }),
    subscribe: (fn: (state: unknown, prev: unknown) => void) => {
      subscriber = fn
      return mockUnsubscribe
    }
  }
}))

const mockClose = jest.fn()
jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: mockClose })
}))

jest.mock('frontend/components/UI/SteamBridgeInviteDialog', () => ({
  __esModule: true,
  default: 'SteamBridgeInviteDialog'
}))

import BridgeInvitePickerRoot from '../BridgeInvitePickerRoot'

const mount = () => {
  effects.length = 0
  const el = BridgeInvitePickerRoot({
    params: { appId: '3205720', ackId: 'a1' }
  })
  const cleanups = effects.map((fn) => fn())
  return { el, cleanups }
}

describe('BridgeInvitePickerRoot', () => {
  beforeEach(() => {
    mockOpen.mockClear()
    mockClose.mockClear()
    mockUnsubscribe.mockClear()
    subscriber = undefined
  })

  it('renders the picker dialog', () => {
    const { el } = mount()
    expect(isValidElement(el)).toBe(true)
    expect((el as { type: unknown }).type).toBe('SteamBridgeInviteDialog')
  })

  it('opens the store once from the URL params on mount', () => {
    mount()
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledWith({ appId: '3205720', ackId: 'a1' })
  })

  it('does not close the window on mount or when the store opens', () => {
    mount()
    expect(mockClose).not.toHaveBeenCalled()
    subscriber?.({ isOpen: true }, { isOpen: false })
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('closes its own window exactly once when the store closes', () => {
    mount()
    subscriber?.({ isOpen: false }, { isOpen: true })
    expect(mockClose).toHaveBeenCalledTimes(1)
    subscriber?.({ isOpen: false }, { isOpen: false })
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes on unmount', () => {
    const { cleanups } = mount()
    ;(cleanups[1] as () => void)()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
