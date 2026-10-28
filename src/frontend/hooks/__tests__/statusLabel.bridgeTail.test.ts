/**
 * quick 261029-exu: getStatusLabel covers the bridge install tail — the
 * 'drm-setup' status (missing since 261029-d7v, so tiles fell back to "Not
 * installed") and the 'steam-bridge-finishing' installing context.
 */
jest.mock('frontend/helpers', () => ({}))

// constants.ts reads window.localStorage at import time (no jsdom here); stub
// a minimal window on globalThis before requiring it, as
// reconcileNonAvailableGames.test.ts does.
;(globalThis as any).window = {
  localStorage: { getItem: () => null, setItem: () => undefined }
}
type ConstantsModule = typeof import('../constants')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const constants: ConstantsModule = require('../constants')
const { getStatusLabel } = constants

// Returns the default text with {{vars}} interpolated, so the test sees what
// an untranslated catalog would render.
const t = ((key: string, def: string, vars?: Record<string, string>) =>
  (def ?? key).replace(/{{(\w+)}}/g, (_, k: string) => vars?.[k] ?? '')) as any

describe('getStatusLabel bridge install tail (quick 261029-exu)', () => {
  it("labels 'drm-setup' with its step", () => {
    expect(
      getStatusLabel({
        status: 'drm-setup',
        statusContext: 'Compatibility runner',
        t,
        runner: 'steam'
      })
    ).toBe('Preparing Steam DRM support (Compatibility runner)')
  })

  it('labels the bridge finishing context', () => {
    expect(
      getStatusLabel({
        status: 'installing',
        statusContext: 'steam-bridge-finishing',
        t,
        runner: 'steam'
      })
    ).toBe('Finishing install…')
  })
})
