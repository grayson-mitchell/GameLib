import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { defaultThemes } from 'frontend/components/UI/ThemeSelector/themeLabels'
import {
  globalTokensFrom,
  themeTokensFrom
} from 'frontend/testUtils/scssTokenSource'
import { contrastRatio } from '../colour'
import {
  CONTRAST_FLOORS,
  checkFloors,
  type ContrastFloor
} from '../contrastFloors'
import { resolveColour } from '../tokenResolve'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const themesScss = read('src/frontend/themes.scss')
const globals = globalTokensFrom(read('src/frontend/styles/_colors.scss'))

/** Every token a floor reads, resolved for one built-in theme. */
const resolvedTokens = (themeKey: string): Record<string, string> => {
  const scope = themeTokensFrom(themesScss, `body.${themeKey}`)
  const out: Record<string, string> = {}
  for (const name of new Set(CONTRAST_FLOORS.flatMap((f) => [f.fg, f.bg]))) {
    const value = resolveColour(`var(${name})`, scope, globals)
    if (value !== null) out[name] = value
  }
  return out
}

describe('CONTRAST_FLOORS', () => {
  it('holds exactly the three pure token pairs, each 3:1', () => {
    expect(CONTRAST_FLOORS.map((f) => [f.id, f.fg, f.bg, f.min])).toEqual([
      ['border-body', '--border-color', '--body-background', 3],
      ['border-modal', '--border-color', '--modal-background', 3],
      ['accent-body', '--accent', '--body-background', 3]
    ])
  })

  it('non-vacuity: the global token table is not empty', () => {
    expect(globals.size).toBeGreaterThan(0)
  })

  it.each(Object.keys(defaultThemes))(
    'built-in theme %s resolves every floor token and passes checkFloors',
    (themeKey) => {
      const tokens = resolvedTokens(themeKey)
      expect(Object.keys(tokens).sort()).toEqual([
        '--accent',
        '--body-background',
        '--border-color',
        '--modal-background'
      ])
      expect(checkFloors(tokens)).toEqual([])
    }
  )
})

describe('checkFloors', () => {
  it('reports a border-body failure whose ratio is below 3', () => {
    const failures = checkFloors({
      '--border-color': '#333333',
      '--body-background': '#222222'
    })
    expect(failures).toHaveLength(1)
    expect(failures[0]?.id).toBe('border-body')
    expect(failures[0]?.ratio).toBeLessThan(3)
    expect(failures[0]?.ratio).toBeCloseTo(
      contrastRatio('#333333', '#222222'),
      10
    )
  })

  it('raises no warning when the ratio equals the floor minimum exactly', () => {
    const ratio = contrastRatio('#333333', '#222222')
    const floor: ContrastFloor = {
      id: 'border-body',
      fg: '--border-color',
      bg: '--body-background',
      min: ratio
    }
    const tokens = {
      '--border-color': '#333333',
      '--body-background': '#222222'
    }
    expect(checkFloors(tokens, [floor])).toEqual([])
    expect(
      checkFloors(tokens, [{ ...floor, min: ratio + 0.001 }])
    ).toHaveLength(1)
  })

  it('yields no failure and no throw for missing, transparent, var() or garbage values', () => {
    const cases: Record<string, string>[] = [
      {},
      { '--border-color': '#333333' },
      { '--border-color': 'transparent', '--body-background': '#222222' },
      { '--border-color': 'var(--x)', '--body-background': '#222222' },
      { '--border-color': 'garbage', '--body-background': '%%%' },
      { '--accent': '', '--body-background': '' }
    ]
    for (const tokens of cases) {
      expect(() => checkFloors(tokens)).not.toThrow()
      expect(checkFloors(tokens)).toEqual([])
    }
  })
})
