/**
 * Unit tests for `authTrigger.ts` — the Steam keyring deferral gate + trigger
 * label seam (quick task 260817-d61).
 *
 * Task 1 covers the module's own contract in isolation. Task 2 extends this
 * file with `noteRefreshTrigger`'s six dispatch-shape cases threaded from the
 * `refreshLibrary` IPC handlers.
 */

import {
  noteSteamAuthTrigger,
  isSteamAuthUnlocked,
  currentTriggerLabel,
  resetSteamAuthTrigger,
  mapRefreshOriginToTrigger,
  noteRefreshTrigger,
  type SteamAuthTrigger
} from '../authTrigger'

beforeEach(() => {
  resetSteamAuthTrigger()
})

describe('noteSteamAuthTrigger / isSteamAuthUnlocked', () => {
  it('noteSteamAuthTrigger("startup") does NOT unlock the gate', () => {
    noteSteamAuthTrigger('startup')
    expect(isSteamAuthUnlocked()).toBe(false)
  })

  it('noteSteamAuthTrigger("user-install") unlocks the gate and returns true on the locked->unlocked transition', () => {
    expect(isSteamAuthUnlocked()).toBe(false)
    const transitioned = noteSteamAuthTrigger('user-install')
    expect(transitioned).toBe(true)
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('a second deliberate note after the gate is already unlocked returns false (no transition)', () => {
    expect(noteSteamAuthTrigger('user-install')).toBe(true)
    expect(noteSteamAuthTrigger('user-play')).toBe(false)
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it.each<SteamAuthTrigger>([
    'user-refresh',
    'game-page',
    'user-install',
    'user-play',
    'login'
  ])('every deliberate trigger (%s) unlocks the gate', (trigger) => {
    expect(noteSteamAuthTrigger(trigger)).toBe(true)
    expect(isSteamAuthUnlocked()).toBe(true)
  })
})

describe('currentTriggerLabel', () => {
  it('defaults to "startup" before anything has been noted', () => {
    expect(currentTriggerLabel()).toBe('startup')
  })

  it('returns the most recent non-deliberate trigger while still locked', () => {
    noteSteamAuthTrigger('startup')
    expect(currentTriggerLabel()).toBe('startup')
  })

  it('returns the trigger that unlocked the gate', () => {
    noteSteamAuthTrigger('user-install')
    expect(currentTriggerLabel()).toBe('user-install')
  })

  it('never returns undefined and never returns a token value', () => {
    expect(typeof currentTriggerLabel()).toBe('string')
    expect(currentTriggerLabel()).not.toContain('token')
  })
})

describe('resetSteamAuthTrigger', () => {
  it('restores the locked state and clears the last trigger label', () => {
    noteSteamAuthTrigger('user-install')
    expect(isSteamAuthUnlocked()).toBe(true)

    resetSteamAuthTrigger()

    expect(isSteamAuthUnlocked()).toBe(false)
    expect(currentTriggerLabel()).toBe('startup')
  })
})

describe('mapRefreshOriginToTrigger', () => {
  it('maps action-icons-refresh-button to user-refresh', () => {
    expect(mapRefreshOriginToTrigger('action-icons-refresh-button')).toBe(
      'user-refresh'
    )
  })

  it.each(['mount', 'push', undefined, 'a-brand-new-origin'])(
    'origin %s falls through to startup (ALLOWLIST, not a denylist)',
    (origin) => {
      expect(mapRefreshOriginToTrigger(origin)).toBe('startup')
    }
  )

  it('maps null to startup', () => {
    expect(mapRefreshOriginToTrigger(null)).toBe('startup')
  })

  it('maps login-success and steam-login to login', () => {
    expect(mapRefreshOriginToTrigger('login-success')).toBe('login')
    expect(mapRefreshOriginToTrigger('steam-login')).toBe('login')
  })

  it('maps nav-tabs-games-tab and redeem-steam-key and game-status to user-refresh', () => {
    expect(mapRefreshOriginToTrigger('nav-tabs-games-tab')).toBe('user-refresh')
    expect(mapRefreshOriginToTrigger('redeem-steam-key')).toBe('user-refresh')
    expect(mapRefreshOriginToTrigger('game-status')).toBe('user-refresh')
  })
})

// ---------------------------------------------------------------------------
// Task 2: noteRefreshTrigger — threading the refresh origin from the
// frontend to both backends. Extends this file rather than creating a
// second one, per the plan's own instruction.
// ---------------------------------------------------------------------------

describe('noteRefreshTrigger (Task 2 — refreshLibrary dispatch threading)', () => {
  it('handleRefreshLibrary(evt, undefined, "mount") leaves the gate LOCKED', () => {
    noteRefreshTrigger(undefined, 'mount')
    expect(isSteamAuthUnlocked()).toBe(false)
  })

  it('handleRefreshLibrary(evt, undefined, "action-icons-refresh-button") UNLOCKS the gate', () => {
    noteRefreshTrigger(undefined, 'action-icons-refresh-button')
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('handleRefreshLibrary(evt, "gog", "login-success") leaves the gate LOCKED (a GOG login must not unlock Steam)', () => {
    noteRefreshTrigger('gog', 'login-success')
    expect(isSteamAuthUnlocked()).toBe(false)
  })

  it('handleRefreshLibrary(evt, "steam", "steam-login") UNLOCKS the gate', () => {
    noteRefreshTrigger('steam', 'steam-login')
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('handleRefreshLibrary(evt, null, "mount") (the Tauri JSON-transport shape) still leaves the gate LOCKED', () => {
    noteRefreshTrigger(null, 'mount')
    expect(isSteamAuthUnlocked()).toBe(false)
  })

  it('handleRefreshLibrary(evt, "all", "action-icons-refresh-button") UNLOCKS the gate (the all-runners branch is Steam-inclusive)', () => {
    noteRefreshTrigger('all', 'action-icons-refresh-button')
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('a named non-Steam runner never unlocks the gate regardless of a deliberate-looking origin', () => {
    noteRefreshTrigger('nile', 'nav-tabs-games-tab')
    expect(isSteamAuthUnlocked()).toBe(false)
  })
})
