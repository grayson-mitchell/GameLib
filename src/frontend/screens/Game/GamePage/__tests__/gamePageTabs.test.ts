/**
 * Phase 100 (D-01, D-04, D-14): mock-free source gates for the right panel's
 * tabs. There is no jsdom / CSS engine in this jest project, so these prove
 * the SOURCE says so; the operator check is the phase's HUMAN-UAT.
 *
 * Sources are read through `stripSourceComments`, so a comment that merely
 * names a pattern cannot satisfy or trip a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const read = (...parts: string[]) =>
  stripSourceComments(readFileSync(join(__dirname, '..', ...parts), 'utf8'))

const tsx = read('index.tsx')
const css = read('index.css')
const installTab = read('components', 'InstallTab', 'index.tsx')
const protonDbLink = read('components', 'ProtonDbLink.tsx')

function extraPanel(): string {
  const start = tsx.indexOf('index="extra"')
  expect(start).toBeGreaterThan(-1)
  const end = tsx.indexOf('</TabPanel>', start)
  expect(end).toBeGreaterThan(start)
  return tsx.slice(start, end)
}

describe('game page tabs (D-01)', () => {
  it('labels the tabs Install and Ratings through the gamelib catalog', () => {
    expect(tsx).toMatch(/'gamelib:gamepage\.tabs\.install',\s*'Install'/)
    expect(tsx).toMatch(/'gamelib:gamepage\.tabs\.ratings',\s*'Ratings'/)
    expect(tsx).not.toContain('game.install_info')
    expect(tsx).not.toContain('game.extra_info')
  })

  it('keeps the order Install, Achievements, Ratings, Requirements', () => {
    const order = [
      "value={'info'}",
      "value={'achievements'}",
      "value={'extra'}",
      "value={'requirements'}"
    ].map((marker) => tsx.indexOf(marker))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('lets the tab bar scroll sideways as a clipping backstop', () => {
    const start = css.indexOf('.extraInfoTabs {')
    expect(start).toBeGreaterThan(-1)
    const body = css.slice(start, css.indexOf('.gameInfoTabs', start))
    expect(body).toMatch(/overflow-x:\s*auto/)
  })
})

describe('Ratings tab content (D-04, D-01)', () => {
  it('mounts AppleWikiInfo after the hasWikiInfo ternary closes, so it shows without wiki scores', () => {
    const panel = extraPanel()
    const empty = panel.indexOf('<WikiInfoEmptyState')
    const apple = panel.indexOf('<AppleWikiInfo')
    expect(empty).toBeGreaterThan(-1)
    expect(apple).toBeGreaterThan(panel.indexOf(')}', empty))
  })

  it('mounts ProtonDbLink in the Ratings panel after AppleWikiInfo', () => {
    const panel = extraPanel()
    expect(panel.indexOf('<ProtonDbLink')).toBeGreaterThan(
      panel.indexOf('<AppleWikiInfo')
    )
  })

  it('no longer mounts AppleWikiInfo on the Install tab', () => {
    expect(installTab).not.toContain('AppleWikiInfo')
  })

  it('ProtonDbLink is Linux-only, store-catalog games only, and encodes the title', () => {
    expect(protonDbLink).toContain('is.linux')
    expect(protonDbLink).toContain("'hasStoreCatalog'")
    expect(protonDbLink).toContain('encodeURIComponent(gameInfo.title)')
    expect(protonDbLink).toContain('https://www.protondb.com')
  })
})

describe('legacy rows wrapper is gone (D-14 rollout)', () => {
  it('has no legacyRows in the Install tab or the page CSS', () => {
    expect(installTab).not.toContain('legacyRows')
    expect(css).not.toContain('legacyRows')
    expect(css).toContain('& div.extraTab')
  })
})
