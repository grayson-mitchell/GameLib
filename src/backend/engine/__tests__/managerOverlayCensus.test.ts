/**
 * Phase 61-15 (T-61-45): source census of the settings reads on every store manager's launch and
 * stop paths. A read that skips the overlay would launch (or shut down) the wrong Wine, so this
 * fails the build instead.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) =>
  readFileSync(join(__dirname, '..', '..', 'storeManagers', rel), 'utf8')

/** Text of the first `{ ... }` after `marker`, by brace matching. */
function bodyOf(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`marker not found: ${marker}`)
  const open = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) {
      return source.slice(open, i + 1)
    }
  }
  throw new Error(`unbalanced body for: ${marker}`)
}

const READ = /(?:this\.getSettings|getAppSettings)\(/g
const WRAPPED =
  /getLaunchSettings\(\s*engineKeyFor\((?:[^()]|\(\))*\),\s*await (?:this\.getSettings|getAppSettings)\(/g

function expectAllWrapped(body: string): number {
  const reads = body.match(READ) ?? []
  const wrapped = body.match(WRAPPED) ?? []
  expect(wrapped).toHaveLength(reads.length)
  return reads.length
}

describe('store manager launch-path overlay census', () => {
  const managers: Array<[string, string[]]> = [
    ['legendary/games.ts', ['async launch(', 'async stop(']],
    ['gog/games.ts', ['async launch(', 'async stop(']],
    ['nile/games.ts', ['async launch(', 'async stop(']],
    ['sideload/games.ts', ['async stop(']],
    ['storeManagerCommon/games.ts', ['export async function launchGame(']]
  ]

  it.each(managers)(
    '%s reads settings through getLaunchSettings( in each launch-path body',
    (file, markers) => {
      const source = read(file)
      for (const marker of markers) {
        const reads = expectAllWrapped(bodyOf(source, marker))
        expect(reads).toBeGreaterThanOrEqual(1)
      }
    }
  )

  it('sideload launch delegates to launchGame, which is wrapped', () => {
    expect(bodyOf(read('sideload/games.ts'), 'async launch(')).toContain(
      'launchGame('
    )
  })

  it('storeManagerCommon keeps the browser targetExe read on stored settings', () => {
    const body = bodyOf(
      read('storeManagerCommon/games.ts'),
      'export async function launchGame('
    )
    expect(body).toContain('GameConfig.get(appName).getSettings()')
  })

  it.each(['legendary', 'gog', 'nile', 'sideload'])(
    '%s getSettings() itself stays on stored values (Settings screen, Pitfall 4)',
    (dir) => {
      const body = bodyOf(read(`${dir}/games.ts`), 'async getSettings(')
      expect(body).not.toContain('getLaunchSettings')
    }
  )

  it('every remaining gog read outside launch/stop is annotated as install/metadata', () => {
    const source = read('gog/games.ts')
    const lines = source.split('\n')
    lines.forEach((line, i) => {
      if (!/await this\.getSettings\(\)/.test(line)) return
      const prev = lines[i - 1] ?? ''
      const inWrapper = prev.includes('engineKeyFor(')
      const inGetSettings = /^\s*\(await GameConfig/.test(line)
      const annotated = prev.includes('overlay census:')
      // launch/stop reads are wrapped (engineKeyFor on the previous line); getSettings() itself is excluded
      expect(inWrapper || annotated || inGetSettings).toBe(true)
    })
  })
})
