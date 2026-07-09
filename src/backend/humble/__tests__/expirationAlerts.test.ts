/**
 * Unit tests for `detectAndNotifyExpirationTransitions` (HSTORE-03, Phase 15
 * Plan 03). Covers:
 *  - D-92 transition-based dedup: null->date fires, same-date re-seen is a
 *    no-op, date->different-date fires again.
 *  - Locked user decision 3: a first-ever sync (suppressNotifications: true)
 *    seeds the notified-state baseline for EVERY current expiration without
 *    firing a single notification (no storm on fresh Humble connect).
 *  - D-90 digest copy: single-key vs 2+-key body/title forms.
 *  - D-91 click handler: focuses the main window then navigates to
 *    /humble-keys/waiting via the app-wide openScreen message.
 *  - D-93 gates: notifyHumbleExpirations setting off, Notification not
 *    supported, and Steam Deck Game Mode all suppress the OS toast — but the
 *    dedup store still advances so a later sync doesn't re-fire once the gate
 *    lifts.
 *  - Pitfall 5: digest copy is built exclusively from HumbleKey's
 *    display-safe title/expiration fields — never revealedKeyValue/keyindex.
 *
 * Mock boundaries:
 *  - electron                -> Notification (class double capturing ctor
 *                               args + the registered click handler)
 *  - ../main_window          -> getMainWindow
 *  - ../ipc                  -> sendFrontendMessage
 *  - ../electronStores       -> humbleNotifiedExpirationStore (Map-backed)
 *  - backend/config          -> GlobalConfig.get().getSettings()
 *  - backend/constants/environment -> isSteamDeckGameMode (mutable double)
 */

import type { HumbleKey } from 'common/types/humble'

// ── electron mock (Notification class double) ──────────────────────────────
const mockNotificationCtor = jest.fn()
const mockNotificationShow = jest.fn()
let mockIsSupported = true
let lastClickHandler: (() => void) | undefined

class MockNotification {
  static isSupported() {
    return mockIsSupported
  }
  show = mockNotificationShow
  constructor(opts: { title: string; body: string }) {
    mockNotificationCtor(opts)
  }
  on(event: string, cb: () => void) {
    if (event === 'click') {
      lastClickHandler = cb
    }
  }
}

jest.mock('electron', () => ({
  Notification: MockNotification
}))

// ── ../main_window mock ─────────────────────────────────────────────────────
const mockShow = jest.fn()
const mockGetMainWindow = jest.fn(() => ({ show: mockShow }))
jest.mock('../main_window', () => ({
  getMainWindow: (...args: unknown[]) => mockGetMainWindow(...args)
}))

// ── ../ipc mock ──────────────────────────────────────────────────────────────
const mockSendFrontendMessage = jest.fn()
jest.mock('../ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

// ── ../electronStores mock (Map-backed humbleNotifiedExpirationStore) ──────
const notifiedExpirationData = new Map<string, { expiration: string }>()
const mockNotifiedExpirationStore = {
  get: jest.fn((key: string) => notifiedExpirationData.get(key)),
  set: jest.fn((key: string, value: { expiration: string }) => {
    notifiedExpirationData.set(key, value)
  }),
  has: jest.fn((key: string) => notifiedExpirationData.has(key)),
  clear: jest.fn(() => notifiedExpirationData.clear())
}
jest.mock('../electronStores', () => ({
  humbleNotifiedExpirationStore: mockNotifiedExpirationStore
}))

// ── backend/config mock (GlobalConfig.get().getSettings()) ─────────────────
let mockNotifyHumbleExpirations = true
const mockGetSettings = jest.fn(() => ({
  notifyHumbleExpirations: mockNotifyHumbleExpirations
}))
jest.mock('backend/config', () => ({
  GlobalConfig: { get: () => ({ getSettings: mockGetSettings }) }
}))

// ── backend/constants/environment mock (mutable double) ────────────────────
const mockEnvironment = { isSteamDeckGameMode: false }
jest.mock('backend/constants/environment', () => mockEnvironment)

// ── Imports (after mocks) ───────────────────────────────────────────────────
import { detectAndNotifyExpirationTransitions } from '../expirationAlerts'

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'order-1',
    machineName: 'sometitle_steam',
    state: 'UNREVEALED',
    title: 'Some Title',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

describe('detectAndNotifyExpirationTransitions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    notifiedExpirationData.clear()
    mockIsSupported = true
    mockEnvironment.isSteamDeckGameMode = false
    mockNotifyHumbleExpirations = true
    lastClickHandler = undefined
  })

  test('null -> date on a non-baseline sync: pushed to newlyExpiring, store updated, one notification fires', () => {
    const key = makeKey({ expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith(
      key.machineName,
      { expiration: '2026-08-01' }
    )
    expect(mockNotificationShow).toHaveBeenCalledTimes(1)
  })

  test('D-92 dedup: same expiration re-seen is a no-op, no second fire', () => {
    const key = makeKey({ expiration: '2026-08-01' })
    notifiedExpirationData.set(key.machineName, { expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  test('D-92: date -> different-date fires again and updates the store to the new date', () => {
    const key = makeKey({ expiration: '2026-09-15' })
    notifiedExpirationData.set(key.machineName, { expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith(
      key.machineName,
      { expiration: '2026-09-15' }
    )
    expect(mockNotificationShow).toHaveBeenCalledTimes(1)
  })

  test('locked decision 3: first-ever sync (suppressNotifications true) seeds ALL current expirations with ZERO notifications', () => {
    const keyA = makeKey({
      machineName: 'a_steam',
      title: 'Game A',
      expiration: '2026-08-01'
    })
    const keyB = makeKey({
      machineName: 'b_steam',
      title: 'Game B',
      expiration: '2026-09-01'
    })

    detectAndNotifyExpirationTransitions([keyA, keyB], {
      suppressNotifications: true
    })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith('a_steam', {
      expiration: '2026-08-01'
    })
    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith('b_steam', {
      expiration: '2026-09-01'
    })
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  test('D-90: a single affected key uses the singular digest body naming the game title', () => {
    const key = makeKey({ title: 'Solo Game', expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotificationCtor).toHaveBeenCalledTimes(1)
    const opts = mockNotificationCtor.mock.calls[0][0]
    expect(opts.body).toContain('Solo Game')
  })

  test('D-90: 2+ affected keys use the plural digest body with a count', () => {
    const keyA = makeKey({ machineName: 'a_steam', expiration: '2026-08-01' })
    const keyB = makeKey({ machineName: 'b_steam', expiration: '2026-09-01' })

    detectAndNotifyExpirationTransitions([keyA, keyB], {
      suppressNotifications: false
    })

    expect(mockNotificationCtor).toHaveBeenCalledTimes(1)
    const opts = mockNotificationCtor.mock.calls[0][0]
    expect(opts.body).toContain('2')
  })

  test('D-91: clicking the notification focuses the window then navigates to /humble-keys/waiting', () => {
    const key = makeKey({ expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(lastClickHandler).toBeDefined()
    lastClickHandler?.()

    expect(mockShow).toHaveBeenCalledTimes(1)
    expect(mockSendFrontendMessage).toHaveBeenCalledWith(
      'openScreen',
      '/humble-keys/waiting'
    )
  })

  test('D-93: notifyHumbleExpirations off — store still advances but no notification fires', () => {
    mockNotifyHumbleExpirations = false
    const key = makeKey({ expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith(
      key.machineName,
      { expiration: '2026-08-01' }
    )
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  test('Pitfall 4: Notification.isSupported() false suppresses the toast (dedup state still advances)', () => {
    mockIsSupported = false
    const key = makeKey({ expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith(
      key.machineName,
      { expiration: '2026-08-01' }
    )
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  test('Pitfall 4: Steam Deck Game Mode suppresses the toast (dedup state still advances)', () => {
    mockEnvironment.isSteamDeckGameMode = true
    const key = makeKey({ expiration: '2026-08-01' })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).toHaveBeenCalledWith(
      key.machineName,
      { expiration: '2026-08-01' }
    )
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  test('Pitfall 5: digest copy reads only title/expiration — never revealedKeyValue/keyindex', () => {
    const key = {
      ...makeKey({ title: 'Safe Title', expiration: '2026-08-01' }),
      keyindex: 7,
      revealedKeyValue: 'SECRET-KEY-VALUE'
    } as HumbleKey & { keyindex: number; revealedKeyValue: string }

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    const opts = mockNotificationCtor.mock.calls[0][0]
    expect(opts.body).not.toContain('SECRET-KEY-VALUE')
    expect(opts.body).not.toContain('7')
    expect(opts.title).not.toContain('SECRET-KEY-VALUE')
  })

  test('no newly-expiring keys: no notification, no store writes', () => {
    const key = makeKey({ expiration: null })

    detectAndNotifyExpirationTransitions([key], { suppressNotifications: false })

    expect(mockNotifiedExpirationStore.set).not.toHaveBeenCalled()
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })
})
