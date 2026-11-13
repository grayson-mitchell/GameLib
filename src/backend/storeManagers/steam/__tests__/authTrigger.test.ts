/**
 * Unit tests for `authTrigger.ts` — the Steam keyring deferral gate + trigger
 * label seam (quick task 260817-d61).
 *
 * Task 1 covers the module's own contract in isolation. Task 2 extends this
 * file with `noteRefreshTrigger`'s six dispatch-shape cases threaded from the
 * `refreshLibrary` IPC handlers.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  createSteamAuthTrigger,
  mapRefreshOriginToTrigger,
  mapRefreshOriginToLogonGrant,
  type SteamAuthTrigger,
  type SteamAuthTriggerState
} from '../authTrigger'

// One boot-owned latch set per case (D-05, D-66.3-13): no reset hook, a fresh instance each time.
let state: SteamAuthTriggerState
beforeEach(() => {
  state = createSteamAuthTrigger()
})
const noteSteamAuthTrigger: SteamAuthTriggerState['noteSteamAuthTrigger'] = (
  trigger
) => state.noteSteamAuthTrigger(trigger)
const isSteamAuthUnlocked = () => state.isSteamAuthUnlocked()
const currentTriggerLabel = () => state.currentTriggerLabel()
const resetSteamAuthTrigger = () => state.resetSteamAuthTrigger()
const noteRefreshTrigger: SteamAuthTriggerState['noteRefreshTrigger'] = (
  runner,
  origin
) => state.noteRefreshTrigger(runner, origin)
const consumeSteamRefreshLogonGrant = () =>
  state.consumeSteamRefreshLogonGrant()

describe('instances and constants (D-66.3-09, D-05)', () => {
  it('two instances never share an unlock or a logon grant', () => {
    const other = createSteamAuthTrigger()
    expect(noteSteamAuthTrigger('user-refresh')).toBe(true)
    noteRefreshTrigger('steam', 'action-icons-refresh-button')
    expect(other.isSteamAuthUnlocked()).toBe(false)
    expect(other.consumeSteamRefreshLogonGrant()).toBeNull()
    expect(other.currentTriggerLabel()).toBe('startup')
  })

  it('the trigger lists are frozen arrays; the only Set is the inferred-origin allowlist', () => {
    const source = stripSourceComments(
      readFileSync(join(__dirname, '..', 'authTrigger.ts'), 'utf8')
    )
    expect(source.match(/new Set\(/g)).toHaveLength(1)
    expect(source).toMatch(/INFERRED_REFRESH_ORIGINS[^=]*=\s*new Set\(/)
    expect(source.match(/Object\.freeze\(\[/g)).toHaveLength(2)
  })
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
    'login',
    'boot-probe'
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

describe('mapRefreshOriginToLogonGrant / store-exit grant (quick 261114-aqa)', () => {
  it.each([
    ['steam-store-exit', 'store-exit'],
    ['action-icons-refresh-button', 'user-refresh'],
    ['redeem-steam-key', 'user-refresh'],
    ['steam-go-offline-retry', 'user-refresh'],
    ['steam-sync-notice-retry', 'user-refresh'],
    ['clear-cache', 'user-refresh'],
    ['login-success', 'login'],
    ['steam-login', 'login'],
    ['game-status', null],
    ['nav-tabs-games-tab', null],
    ['mount', null],
    [undefined, null],
    [null, null],
    ['__proto__', null],
    ['constructor', null]
  ])('origin %s -> %s', (origin, grant) => {
    expect(mapRefreshOriginToLogonGrant(origin)).toBe(grant)
  })

  it('steam-store-exit arms a one-shot store-exit grant, keyring label stays user-refresh', () => {
    state.noteRefreshTrigger('steam', 'steam-store-exit')
    expect(state.isSteamAuthUnlocked()).toBe(true)
    expect(state.currentTriggerLabel()).toBe('user-refresh')
    expect(state.consumeSteamRefreshLogonGrant()).toBe('store-exit')
    expect(state.consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('a non-Steam runner with steam-store-exit arms no grant', () => {
    state.noteRefreshTrigger('gog', 'steam-store-exit')
    expect(state.consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('an explicit Refresh still yields user-refresh', () => {
    state.noteRefreshTrigger('steam', 'action-icons-refresh-button')
    expect(state.consumeSteamRefreshLogonGrant()).toBe('user-refresh')
  })
})

describe('mapRefreshOriginToTrigger', () => {
  it('maps action-icons-refresh-button to user-refresh', () => {
    expect(mapRefreshOriginToTrigger('action-icons-refresh-button')).toBe(
      'user-refresh'
    )
  })

  it('maps steam-store-exit to user-refresh (quick 261030-qqh)', () => {
    expect(mapRefreshOriginToTrigger('steam-store-exit')).toBe('user-refresh')
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

  it('maps redeem-steam-key to user-refresh; game-status and nav-tabs-games-tab fall through to startup', () => {
    expect(mapRefreshOriginToTrigger('redeem-steam-key')).toBe('user-refresh')
    expect(mapRefreshOriginToTrigger('game-status')).toBe('startup')
    expect(mapRefreshOriginToTrigger('nav-tabs-games-tab')).toBe('startup')
  })

  it.each([
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'valueOf'
  ])(
    'WR-04 own-property guard: inherited Object.prototype name %s never resolves through the prototype chain, maps to startup',
    (origin) => {
      const result = mapRefreshOriginToTrigger(origin)
      expect(typeof result).toBe('string')
      expect(result).toBe('startup')
    }
  )

  it('WR-04 own-property guard: a non-string origin whose string coercion is an allowlisted key maps to startup', () => {
    const origin = ['login-success'] as unknown as string
    expect(mapRefreshOriginToTrigger(origin)).toBe('startup')
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

  it('steam-store-exit arms a one-shot store-exit grant for steam only', () => {
    noteRefreshTrigger('steam', 'steam-store-exit')
    expect(consumeSteamRefreshLogonGrant()).toBe('store-exit')
  })

  it('steam-store-exit on a non-Steam runner leaves the gate locked and arms no grant', () => {
    noteRefreshTrigger('gog', 'steam-store-exit')
    expect(isSteamAuthUnlocked()).toBe(false)
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it.each(['__proto__', 'constructor'])(
    'WR-04 end-to-end: noteRefreshTrigger("steam", %s) keeps the gate locked and the label a string "startup", never an object or function',
    (origin) => {
      noteRefreshTrigger('steam', origin)
      expect(isSteamAuthUnlocked()).toBe(false)
      expect(typeof currentTriggerLabel()).toBe('string')
      expect(currentTriggerLabel()).toBe('startup')
    }
  )
})

// ---------------------------------------------------------------------------
// Phase 49 (49-06, D-14): the boot-probe trigger. A deliberate, backend-only
// trigger: it unlocks the gate with the same sticky semantics, and no renderer
// origin string can produce it (T-49-16).
// ---------------------------------------------------------------------------

describe("'boot-probe' trigger (Phase 49 D-14)", () => {
  it('unlocks a locked gate and reports the transition', () => {
    expect(noteSteamAuthTrigger('boot-probe')).toBe(true)
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('is sticky: a second deliberate note returns false', () => {
    expect(noteSteamAuthTrigger('boot-probe')).toBe(true)
    expect(noteSteamAuthTrigger('user-refresh')).toBe(false)
    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('labels keyring reads as boot-probe after the note', () => {
    noteSteamAuthTrigger('boot-probe')
    expect(currentTriggerLabel()).toBe('boot-probe')
  })

  it("is not renderer-reachable: mapRefreshOriginToTrigger('boot-probe') is 'startup'", () => {
    expect(mapRefreshOriginToTrigger('boot-probe')).toBe('startup')
  })

  it('a renderer dispatch carrying the origin boot-probe leaves the gate locked', () => {
    noteRefreshTrigger(undefined, 'boot-probe')
    expect(isSteamAuthUnlocked()).toBe(false)
  })

  it("'startup' still never unlocks the gate", () => {
    noteSteamAuthTrigger('startup')
    expect(isSteamAuthUnlocked()).toBe(false)
  })
})

describe('one-shot refresh logon grant (Phase 54)', () => {
  it('an explicit Refresh grants user-refresh once', () => {
    noteRefreshTrigger('steam', 'action-icons-refresh-button')
    expect(consumeSteamRefreshLogonGrant()).toBe('user-refresh')
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it.each([
    [undefined, 'login-success', 'login'],
    [null, 'steam-go-offline-retry', 'user-refresh'],
    ['steam', 'redeem-steam-key', 'user-refresh'],
    ['steam', 'steam-sync-notice-retry', 'user-refresh'],
    [undefined, 'clear-cache', 'user-refresh'],
    ['steam', 'steam-login', 'login']
  ])('runner %s origin %s grants %s', (runner, origin, expected) => {
    noteRefreshTrigger(runner, origin)
    expect(consumeSteamRefreshLogonGrant()).toBe(expected)
  })

  it.each([
    'mount',
    'push',
    'game-status',
    'nav-tabs-games-tab',
    'login-screen',
    'boot-probe',
    '__proto__',
    null,
    undefined
  ])('origin %s grants nothing', (origin) => {
    noteRefreshTrigger(null, origin)
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('login-screen maps to startup', () => {
    expect(mapRefreshOriginToTrigger('login-screen')).toBe('startup')
  })

  it('boot-probe and user-install unlock the keyring gate but grant nothing', () => {
    noteSteamAuthTrigger('boot-probe')
    noteSteamAuthTrigger('user-install')
    expect(isSteamAuthUnlocked()).toBe(true)
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('a named non-Steam runner grants nothing', () => {
    noteRefreshTrigger('gog', 'login-success')
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('resetSteamAuthTrigger clears a pending grant', () => {
    noteRefreshTrigger('steam', 'action-icons-refresh-button')
    resetSteamAuthTrigger()
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })

  it('both orderings of boot-probe and mount grant nothing', () => {
    noteSteamAuthTrigger('boot-probe')
    noteRefreshTrigger(null, 'mount')
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
    resetSteamAuthTrigger()
    noteRefreshTrigger(null, 'mount')
    noteSteamAuthTrigger('boot-probe')
    expect(consumeSteamRefreshLogonGrant()).toBeNull()
  })
})
