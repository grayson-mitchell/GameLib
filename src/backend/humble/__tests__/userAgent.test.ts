/**
 * Pins `standardBrowserUserAgent()`'s behavior when running against the REAL sidecar
 * `electronStub.ts` (Phase 34.4.1 Plan 02, Task 4, DEFECT 3).
 *
 * `standardBrowserUserAgent()` (`../userAgent.ts:26-36`) reads `app.userAgentFallback`
 * unconditionally. Real Electron populates that property at startup; `electronStub.ts` (the
 * sidecar's `require('electron')` replacement, installed by `bootstrap.ts`'s `Module._load`
 * hook) previously left it `undefined`, so this function threw
 * `Cannot read properties of undefined (reading 'replace')` the first time anything in the
 * sidecar called it -- silently aborting the Assumption-A4 smoke hook
 * (`sidecar/humbleLoginFlowRegistration.ts`) before `WebviewWindowBuilder::build()` was ever
 * reached. `humbleLoginFlows.test.ts` factory-mocks `standardBrowserUserAgent` entirely and so
 * never exercised the real implementation against the real stub -- this file closes that gap
 * directly.
 *
 * Unlike `humbleFlows.test.ts`/`humbleLoginFlows.test.ts` (which `jest.mock('electron', () =>
 * jest.requireActual('../../platform'))` to get a REAL ipcMain/app pair alongside a
 * lot of other sidecar wiring this file has no need for), this suite imports `electronStub.ts`
 * directly and mocks only the bare `'electron'` specifier to point at it -- `userAgent.ts`'s
 * only touchpoint is `app.userAgentFallback`.
 */

import { standardBrowserUserAgent } from '../userAgent'

describe('standardBrowserUserAgent() against the real sidecar electronStub', () => {
  it('returns a Chrome-shaped UA string with no Electron/x.y.z token', () => {
    const ua = standardBrowserUserAgent()

    // Happy-path shape produced by userAgent.ts:35 -- proves electronStub's
    // `app.userAgentFallback` matched the platform/Chrome-version extraction regexes on
    // userAgent.ts:28-29 directly, rather than falling through to the defensive
    // `fallback.replace(...)` branch on line 33 (which is what threw before this fix).
    expect(ua).toMatch(
      /^Mozilla\/5\.0 \([^)]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\S+ Safari\/537\.36$/
    )
    expect(ua).not.toMatch(/Electron\/\S+/)
  })

  it('does not throw (the DEFECT 3 regression: app.userAgentFallback was undefined)', () => {
    expect(() => standardBrowserUserAgent()).not.toThrow()
  })

  it('carries a platform token matching the current process.platform, not a hardcoded macOS value', () => {
    const ua = standardBrowserUserAgent()
    if (process.platform === 'darwin') {
      expect(ua).toContain('Macintosh')
    } else if (process.platform === 'win32') {
      expect(ua).toContain('Windows NT')
    } else {
      expect(ua).toContain('X11; Linux')
    }
  })
})
