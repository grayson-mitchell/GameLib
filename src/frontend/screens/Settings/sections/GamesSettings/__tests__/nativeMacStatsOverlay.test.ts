import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')

function slice(startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('</TabPanel>', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('Native macOS stats overlay gate (quick 261104-uas)', () => {
  test('defines the gate with an explicit runner allow-list and no steam', () => {
    const start = source.indexOf('const isMacNativeStatsOverlayTitle =')
    expect(start).toBeGreaterThan(-1)
    const expr = source.slice(start, source.indexOf('\n\n', start))
    for (const part of [
      '!isDefault',
      'isMac',
      'isNative',
      '!isBrowserGame',
      "'legendary'",
      "'gog'",
      "'nile'",
      "'sideload'"
    ]) {
      expect(expr).toContain(part)
    }
    expect(expr).not.toContain('steam')
  })

  test("shouldShowSettings('other') admits native Mac stats-overlay titles", () => {
    expect(source).toContain(
      'isLinux || (isMac && (!isNative || isMacNativeStatsOverlayTitle))'
    )
  })

  test('Other panel renders ShowFPS for those titles', () => {
    const other = slice("index={'other'}>")
    expect(other).toContain(
      '(!isNative || isMacNativeStatsOverlayTitle) && <ShowFPS />'
    )
    expect(other).not.toContain('{!isNative && <ShowFPS />}')
  })

  test('Other panel still hides runtimes for native games', () => {
    const other = slice("index={'other'}>")
    expect(other).toMatch(/\{!isNative &&\s*\(/)
    expect(other).toContain('BattlEyeRuntime')
    expect(other).toContain('EacRuntime')
  })
})
