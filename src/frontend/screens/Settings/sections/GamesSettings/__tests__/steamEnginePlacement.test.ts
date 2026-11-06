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
      "const isMacSteamTitle =\n    !isDefault && isMac && hasCapability(gameInfo?.runner, 'usesBottleRuntime')"
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

  test('overlay override moved from Advanced to Run (261104-unp)', () => {
    const advanced = slice("index={'advanced'}>")
    expect(advanced).not.toContain('<SteamEngineOverride />')
    expect(advanced).not.toContain('<SteamOverlayOverride />')
    const run = slice("index={'run'}>")
    expect(run).toContain('isMacSteamTitle && <SteamOverlayOverride />')
  })

  test('catalogue carries the hint text', () => {
    expect(locale.steam.engine.wineTabHint).toBe(
      'GameLib chooses the Wine engine and bottle for Steam games.'
    )
  })
})

describe('Inert Wine toggles hidden for macOS Steam titles (quick 261104-uxr)', () => {
  const gate = '{!isMacSteamTitle && ('
  const toggles = [
    '<AutoDXVK />',
    '<AutoDXVKNVAPI />',
    '<AutoVKD3D />',
    '<EnableEsync />',
    '<EnableFsync />',
    '<EnableWineWayland />',
    '<EnableWoW64 />',
    '<EnableMsync />',
    '<AdvertiseAvxForRosetta />',
    '<EnableFSR />',
    '<EnableDXVKFpsLimit />'
  ]
  const count = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1

  test('A: the gate sits inside the !isCrossover block', () => {
    const wine = slice("index={'wine'}>")
    const crossover = wine.indexOf('{!isCrossover && (')
    const gated = wine.indexOf(gate)
    expect(crossover).toBeGreaterThan(-1)
    expect(gated).toBeGreaterThan(crossover)
  })

  test('B: all eleven toggles are behind the gate, once each', () => {
    const wine = slice("index={'wine'}>")
    const gated = wine.slice(wine.indexOf(gate), wine.indexOf('<Tools />'))
    expect(wine.indexOf(gate)).toBeGreaterThan(-1)
    for (const tag of toggles) {
      expect(gated).toContain(tag)
      expect(count(wine, tag)).toBe(1)
    }
  })

  test('C: Tools stays outside the gate, under !isCrossover', () => {
    const wine = slice("index={'wine'}>")
    const gateAt = wine.indexOf(gate)
    const tools = wine.indexOf('<Tools />')
    expect(gateAt).toBeGreaterThan(-1)
    expect(count(wine, '<Tools />')).toBe(1)
    expect(tools).toBeGreaterThan(gateAt)
    expect(tools).toBeGreaterThan(wine.indexOf('{!isCrossover && ('))
    expect(wine.slice(gateAt, tools).trim().endsWith(')}')).toBe(true)
  })

  test('D: the Legacy tab keeps its FPS limit toggle', () => {
    expect(slice("index={'legacy'}>")).toContain('<EnableDXVKFpsLimit />')
  })
})
