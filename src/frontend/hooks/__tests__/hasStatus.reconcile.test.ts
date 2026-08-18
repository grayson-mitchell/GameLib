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
import { makeFaithfulT } from '../../screens/Game/GamePage/components/__tests__/faithfulTranslate'

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

/**
 * D-UAT-04 (21-16): getStatusLabel's steam-branch copy fix + waiting-hint
 * branch. This file's top-level `jest.mock('../constants', ...)` stubs
 * getStatusLabel entirely (needed so `deriveInstallStatusKind` above can be
 * imported without `../constants`'s module-scope `window.localStorage`
 * touch throwing in this jsdom-less env — see file docstring). To exercise
 * the REAL implementation here, stub `window.localStorage` first and pull
 * it in via `jest.requireActual`, which bypasses the mock factory above.
 *
 * quick-260819-ch5: `fakeT` used to be
 * `(key, fallback) => fallback ?? key` — a defaults-returning mock. That is
 * this repo's ledgered "editing a `t()` DEFAULT is a silent no-op when the
 * key exists" trap, seen from the test side: it measured the INLINE DEFAULT
 * argument, not the catalog value i18next actually renders, so this suite
 * sat outside `labelSuiteI18nCensus`'s scan directory and would have stayed
 * green through the "Finish in Steam" -> "Resume Install" catalog change.
 * Replaced with the shared `makeFaithfulT`, which resolves against the real
 * `gamepage.json`/`gamelib.json` catalogs the same way i18next does.
 */
describe('getStatusLabel (real implementation, T-21-16 waiting-hint + copy fix)', () => {
  let getStatusLabelReal: (typeof import('../constants'))['getStatusLabel']
  const fakeT = makeFaithfulT('gamepage') as never

  beforeAll(() => {
    ;(global as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined
      }
    }
    getStatusLabelReal = jest.requireActual('../constants').getStatusLabel
  })

  afterAll(() => {
    delete (global as unknown as { window?: unknown }).window
  })

  it('returns the restart-hint string when statusContext is "steam-waiting-for-restart"', () => {
    const label = getStatusLabelReal({
      status: 'installing',
      runner: 'steam',
      statusContext: 'steam-waiting-for-restart',
      t: fakeT
    })
    expect(label).toBe('Restart Steam to finish')
  })

  it('returns the improved active-install copy when statusContext is undefined', () => {
    const label = getStatusLabelReal({
      status: 'installing',
      runner: 'steam',
      statusContext: undefined,
      t: fakeT
    })
    expect(label).toBe('Installing…')
  })

  // T-AOG (quick/260719-aog): paused-download hint
  it('returns the "Paused" label when statusContext is "steam-paused"', () => {
    const label = getStatusLabelReal({
      status: 'installing',
      runner: 'steam',
      statusContext: 'steam-paused',
      t: fakeT
    })
    expect(label).toBe('Paused')
  })

  it('restart-hint precedence is unaffected by the new paused branch', () => {
    const label = getStatusLabelReal({
      status: 'installing',
      runner: 'steam',
      statusContext: 'steam-waiting-for-restart',
      t: fakeT
    })
    expect(label).toBe('Restart Steam to finish')
  })

  it('non-steam runners are unaffected — still render Downloading {{percent}}%', () => {
    const label = getStatusLabelReal({
      status: 'installing',
      runner: 'gog',
      percent: 42,
      t: fakeT
    })
    expect(label).toBe('Downloading 42%')
  })

  // D-UAT-09 (21-17): notInstalled + steam + steam-incomplete resume signal
  // quick-260819-ch5: retargeted from "Finish in Steam" — GameLib resumes
  // this install itself now.
  it('returns "Resume Install" for status notInstalled + runner steam + statusContext steam-incomplete', () => {
    const label = getStatusLabelReal({
      status: 'notInstalled',
      runner: 'steam',
      statusContext: 'steam-incomplete',
      t: fakeT
    })
    expect(label).toBe('Resume Install')
  })

  it('a non-steam notInstalled game returns the plain notinstalled copy, even with steam-incomplete context', () => {
    const label = getStatusLabelReal({
      status: 'notInstalled',
      runner: 'gog',
      statusContext: 'steam-incomplete',
      t: fakeT
    })
    expect(label).toBe('This game is not installed')
  })

  it('a steam notInstalled game with no resume context returns the plain notinstalled copy (no regression)', () => {
    const label = getStatusLabelReal({
      status: 'notInstalled',
      runner: 'steam',
      statusContext: undefined,
      t: fakeT
    })
    expect(label).toBe('This game is not installed')
  })

  // quick-260819-ch5: sentinel proving the mock is faithful — a t that
  // returned its inline default instead of the catalog value could not make
  // the 'Resume Install' assertions above pass by accident, because the key
  // `gamelib:steam.status.resumeInstall` already resolves in the catalog.
  it('sentinel: makeFaithfulT resolves gamelib:steam.status.resumeInstall through the catalog, not the inline default', () => {
    expect(
      makeFaithfulT('gamepage')(
        'gamelib:steam.status.resumeInstall',
        'INLINE-DEFAULT-SENTINEL'
      )
    ).toBe('Resume Install')
    expect(
      makeFaithfulT('gamepage')(
        'gamelib:steam.status.resumeInstall',
        'INLINE-DEFAULT-SENTINEL'
      )
    ).not.toBe('INLINE-DEFAULT-SENTINEL')
  })
})
