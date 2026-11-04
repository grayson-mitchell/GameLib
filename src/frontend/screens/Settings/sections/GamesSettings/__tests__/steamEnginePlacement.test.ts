import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
const locale = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'public/locales/en/gamelib.json'
    ),
    'utf8'
  )
)

function slice(startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('</TabPanel>', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('Steam engine override placement (quick 261104-tm6)', () => {
  test('defines the shared macOS Steam gate', () => {
    expect(source).toContain(
      "const isMacSteamTitle = !isDefault && isMac && gameInfo?.runner === 'steam'"
    )
  })

  test('Wine tab hosts the Engine override, replacing the inert which-Wine controls', () => {
    const wine = slice("index={'wine'}>")
    const ternary = wine.indexOf('isMacSteamTitle ?')
    const engine = wine.indexOf('<SteamEngineOverride />')
    const selector = wine.indexOf('<WineVersionSelector />')
    expect(ternary).toBeGreaterThan(-1)
    expect(engine).toBeGreaterThan(ternary)
    expect(selector).toBeGreaterThan(engine)
    expect(wine).toContain('gamelib:steam.engine.wineTabHint')
  })

  test('Advanced tab keeps only the overlay override', () => {
    const advanced = slice("index={'advanced'}>")
    expect(advanced).not.toContain('<SteamEngineOverride />')
    expect(advanced).toContain('<SteamOverlayOverride />')
    expect(advanced).toContain('isMacSteamTitle &&')
  })

  test('catalogue carries the hint text', () => {
    expect(locale.steam.engine.wineTabHint).toBe(
      'GameLib chooses the Wine engine and bottle for Steam games.'
    )
  })
})
