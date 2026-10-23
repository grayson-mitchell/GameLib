import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Quick 261024-ho4: comment-stripped source gates for the CrossOver rating
 * confirm. Reads the dialogs as raw text and never imports them (the shared UI
 * kit's stylesheet imports would fail in this jsdom-less jest env).
 */

const ROOT = join(__dirname, '..')
const raw = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripped = (rel: string) => stripSourceComments(raw(rel))

const DIALOGS = [
  'SteamDialog/index.tsx',
  'DownloadDialog/index.tsx',
  'ThirdPartyDialog/index.tsx'
]

describe.each(DIALOGS)('%s', (rel) => {
  const src = stripped(rel)

  test('resolves the risk and shows the shared confirm', () => {
    expect(src).toContain('resolveCrossoverInstallRisk(')
    expect(src).toContain('crossoverRiskDialogOptions(')
    expect(src).toContain('showDialogModal(')
  })

  test('no disabled expression depends on the rating', () => {
    const disabledExprs = src.match(/disabled=\{[^}]*\}/g) ?? []
    for (const expr of disabledExprs) {
      expect(expr).not.toMatch(/risk|rating|crossover/i)
    }
  })
})

test('SteamDialog keeps onClick={handleInstall}', () => {
  expect(stripped('SteamDialog/index.tsx')).toContain('onClick={handleInstall}')
})

test('WineSelector renders the unrated notice and records the reversal', () => {
  const rel = 'WineSelector/index.tsx'
  expect(stripped(rel)).toContain(
    'gamelib:installFlows.crossoverRating.unratedNotice'
  )
  expect(stripped(rel)).toContain('=== null')
  expect(raw(rel)).toContain('261024-ho4')
})
