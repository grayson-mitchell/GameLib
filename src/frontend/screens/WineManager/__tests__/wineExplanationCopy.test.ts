/**
 * 2026-10-05 (phase 34.18 review): GameLib supports Apple Silicon Macs only
 * (README's `## Supported Operating Systems`), but the Wine-Crossover and
 * Wine-Staging-macOS explanations still recommended those runners "for Intel
 * Macs". The copy moved to NEW `gamelib:` keys rather than editing the
 * upstream `translation:` English, so the other locales' translations of the
 * old sentence are never silently shown for a changed meaning.
 *
 * A source-text read, not a render: the frontend jest project runs in
 * `node`, and what matters here is which key and English default ship.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const WINE_MANAGER_SOURCE = readFileSync(
  join(__dirname, '..', 'index.tsx'),
  'utf-8'
)
const GAMELIB_EN = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'public', 'locales', 'en', 'gamelib.json'),
    'utf-8'
  )
) as { wineExplanation?: Record<string, string> }

describe('WineManager macOS runner explanations', () => {
  it('no explanation recommends a runner for Intel Macs', () => {
    expect(WINE_MANAGER_SOURCE).not.toMatch(/Intel Mac/i)
  })

  it.each(['wine-crossover', 'wine-staging-macos'])(
    'uses the gamelib:wineExplanation.%s key, catalogued in en without Intel copy',
    (key) => {
      expect(WINE_MANAGER_SOURCE).toContain(`'gamelib:wineExplanation.${key}'`)
      const english = GAMELIB_EN.wineExplanation?.[key]
      expect(english).toBeDefined()
      expect(english).not.toMatch(/Intel/i)
    }
  )
})
