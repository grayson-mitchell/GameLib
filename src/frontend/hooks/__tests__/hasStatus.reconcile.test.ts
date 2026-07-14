/**
 * Unit tests for hasStatus's pure status-derivation precedence
 * (GAP-17-BOTTLE-INSTALL-DONE-DESYNC).
 *
 * No jsdom is installed in this project (see src/frontend/jest.config.js
 * docstring) so `hasStatus.ts` cannot be imported un-mocked in a node-env
 * test: it transitively pulls in `hasProgress.ts` -> `InstallProgress.ts`,
 * which touches `window.api.onProgressUpdate` at MODULE LOAD time (a
 * top-level `window.api.onProgressUpdate(...)` call, not inside a hook
 * body), and `./constants.ts` similarly touches `window.localStorage` at
 * module scope. Both are mocked below purely so `deriveInstallStatusKind`
 * (a side-effect-free, non-hook export) can be imported and exercised
 * directly — mirroring the SteamBottleSetup.test.ts pattern of testing pure
 * logic without mounting React.
 */
jest.mock('../hasProgress', () => ({
  hasProgress: () => [{ percent: 0 }, {}]
}))
jest.mock('../constants', () => ({
  getStatusLabel: () => 'label',
  handleNonAvailableGames: async () => true
}))

import { deriveInstallStatusKind } from '../hasStatus'

describe('deriveInstallStatusKind (GAP-17-BOTTLE-INSTALL-DONE-DESYNC done-transition)', () => {
  it('cleared statusEntry (as after the poller\'s "done") + is_installed:true resolves "installed" (Play)', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: undefined,
      is_installed: true
    })

    expect(kind).toBe('installed')
  })

  it('the stale-input contrast: same cleared statusEntry but is_installed:false resolves "notInstalled" — proves why the LIVE is_installed matters', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: undefined,
      is_installed: false
    })

    expect(kind).toBe('notInstalled')
  })

  it('an active statusEntry.status:"installing" resolves "active" regardless of is_installed', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: { status: 'installing' },
      is_installed: false
    })

    expect(kind).toBe('active')
  })

  it('a statusEntry.status:"done" is treated the same as no entry (precedence falls through to is_installed)', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: { status: 'done' },
      is_installed: true
    })

    expect(kind).toBe('installed')
  })

  it('a third-party-managed app (not EA/Ubisoft) resolves "notSupportedGame" even when installed', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: undefined,
      is_installed: true,
      thirdPartyManagedApp: 'EA'
    })

    expect(kind).toBe('notSupportedGame')
  })

  it('an EA-managed third-party app skips the notSupportedGame branch (isEAManaged guard) but the is_installed branch still requires !thirdPartyManagedApp, so it falls through to notInstalled — locks the exact pre-existing precedence, unchanged by this fix', () => {
    const kind = deriveInstallStatusKind({
      statusEntry: undefined,
      is_installed: true,
      thirdPartyManagedApp: 'EA',
      isEAManaged: true
    })

    expect(kind).toBe('notInstalled')
  })
})
