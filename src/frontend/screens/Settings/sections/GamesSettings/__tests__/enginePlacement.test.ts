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

describe('Engine control placement (quick 261104-tm6)', () => {
  test('defines the shared macOS Steam gate', () => {
    expect(source).toContain(
      "const isMacSteamTitle =\n    !isDefault && isMac && hasCapability(gameInfo?.runner, 'usesBottleRuntime')"
    )
  })

  test('Wine tab hosts the Engine control for every macOS Windows game (D-10)', () => {
    expect(source).toContain(
      'const isMacEngineGame = !isDefault && isMac && showWineTab'
    )
    const wine = slice("index={'wine'}>")
    const ternary = wine.indexOf('isMacEngineGame ?')
    const engine = wine.indexOf('<EngineOverride />')
    const selector = wine.indexOf('<WineVersionSelector />')
    expect(ternary).toBeGreaterThan(-1)
    expect(engine).toBeGreaterThan(ternary)
    expect(selector).toBeGreaterThan(engine)
    expect(wine).toContain('gamelib:engine.wineTabHint')
    expect(wine).not.toContain('gamelib:steam.engine.wineTabHint')
  })

  test('the prefix field shows for plain and legacy prefixes, never for bottle-backed or Steam games', () => {
    const wine = slice("index={'wine'}>")
    const engineBranch = wine.slice(
      wine.indexOf('isMacEngineGame ?'),
      wine.indexOf('isDefault && isMac ?')
    )
    expect(engineBranch).toContain('!isMacSteamTitle')
    expect(engineBranch).toContain("prefixKind === 'plain'")
    expect(engineBranch).toContain("prefixKind === 'legacy'")
    expect(engineBranch).toContain('<WinePrefix />')
    expect(engineBranch).not.toContain('<CrossoverBottle />')
    expect(engineBranch).not.toContain('<WineVersionSelector />')
  })

  test('macOS defaults page: global Engine control, no which-Wine selector or bottle picker (D-09)', () => {
    const wine = slice("index={'wine'}>")
    const defaults = wine.slice(
      wine.indexOf('isDefault && isMac ?'),
      wine.indexOf('<WineVersionSelector />')
    )
    expect(defaults).toContain('<EngineOverride />')
    expect(defaults).toContain('<WinePrefix />')
    expect(defaults).not.toContain('<CrossoverBottle />')
    // Linux and Windows keep the original three components in the fallback branch.
    const fallback = wine.slice(wine.indexOf('<WineVersionSelector />'))
    expect(fallback.indexOf('<WinePrefix />')).toBeGreaterThan(-1)
    expect(fallback.indexOf('<CrossoverBottle />')).toBeGreaterThan(-1)
  })

  test('non-Steam macOS games derive CrossOver-like from the effective engine; AutoDXVK hides for bottles', () => {
    expect(source).toContain('isMacEngineGame && !isMacSteamTitle')
    expect(source).toContain("effectiveEngineId === 'automatic'")
    expect(source).toContain('{!isBottleBacked && <AutoDXVK />}')
  })

  test('overlay override moved from Advanced to Run (261104-unp)', () => {
    const advanced = slice("index={'advanced'}>")
    expect(advanced).not.toContain('<EngineOverride />')
    expect(advanced).not.toContain('<SteamOverlayOverride />')
    const run = slice("index={'run'}>")
    expect(run).toContain('isMacSteamTitle && <SteamOverlayOverride />')
  })

  test('catalogue carries the hint text', () => {
    expect(locale.engine.wineTabHint).toBe(
      'GameLib chooses the Wine engine and bottle for this game.'
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

  test('C: Tools sits after the !isCrossover block, under !hideWineTools (quick 261110-v08)', () => {
    const wine = slice("index={'wine'}>")
    expect(count(wine, '<Tools />')).toBe(1)
    const tools = wine.indexOf('{!hideWineTools && <Tools />}')
    expect(tools).toBeGreaterThan(-1)
    expect(tools).toBeGreaterThan(wine.lastIndexOf('{!isMacSteamTitle && ('))
  })

  test('D: the Legacy tab keeps its FPS limit toggle', () => {
    expect(slice("index={'legacy'}>")).toContain('<EnableDXVKFpsLimit />')
  })
})
