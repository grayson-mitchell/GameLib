import { buildOverlayPaths } from '../overlayPaths'

describe('buildOverlayPaths', () => {
  const p = buildOverlayPaths('/abs/app folder')!
  test('layout', () => {
    expect(p.root).toBe('/abs/app folder/steam-bridge/overlay')
    expect(p.runnersRoot).toBe('/abs/app folder/steam-bridge/overlay/runners')
    expect(p.traceRoot).toBe('/abs/app folder/steam-bridge/overlay/trace')
    expect(p.runnerDir('26.3.0.39832')).toBe(
      '/abs/app folder/steam-bridge/overlay/runners/crossover-26.3.0.39832'
    )
    expect(p.runnerCxRoot('26.3.0.39832')).toBe(
      '/abs/app folder/steam-bridge/overlay/runners/crossover-26.3.0.39832/CrossOver'
    )
  })
  test.each(['relative', '', '/abs/\x01x'])('bad appFolder %p', (f) => {
    expect(buildOverlayPaths(f)).toBeNull()
  })
  test.each(['../x', '26.3', '1.2.3.4.5.6'])('bad build %p', (b) => {
    expect(p.runnerDir(b)).toBeNull()
    expect(p.runnerCxRoot(b)).toBeNull()
  })
})
