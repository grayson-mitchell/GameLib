import { flattenBuiltinTheme } from '../flatten'
import { CORE_TOKENS } from '../tokens'

/** `--name: #123456;` for every core token, so seeding never throws in a case that is about something else. */
const coreDecls = (skip: readonly string[] = []): string =>
  CORE_TOKENS.filter((t) => !skip.includes(t))
    .map((t) => `${t}: #123456;`)
    .join('\n')

const run = (colorsScss: string, themeBlock: string, skip: string[] = []) =>
  flattenBuiltinTheme({
    themesScss: `body {\n${coreDecls(skip)}\n}\nbody.t {\n${themeBlock}\n}\n`,
    colorsScss,
    key: 't'
  })

describe('flattenBuiltinTheme', () => {
  it('keeps the root value of a :root token even when a theme overrides what it references', () => {
    const out = run(
      '--a: #111111;\n--b: var(--a);',
      '--a: #ff0000;\n--c: var(--b);'
    )
    expect(out['--a']).toBe('#ff0000')
    expect(out['--b']).toBe('#111111')
    expect(out['--c']).toBe('#111111')
  })

  it('substitutes a var() inside gradient text with the literal', () => {
    const out = run(
      '--a: #111111;',
      '--g: linear-gradient(90deg, var(--a), rgba(0, 0, 0, 0.5) 100%);'
    )
    expect(out['--g']).toContain('#111111')
    expect(out['--g']).not.toContain('var(')
    expect(out['--g']).toMatch(/^linear-gradient\(/)
  })

  it('drops a gradient token whose inner var cannot resolve', () => {
    const out = run(
      '--a: #111111;',
      '--g: linear-gradient(90deg, var(--nope), #000000);'
    )
    expect(out).not.toHaveProperty('--g')
  })

  it('flattens color-mix(in srgb) to a canonical hex', () => {
    const out = run(
      '--a: #111111;',
      '--m: color-mix(in srgb, #000000, #ffffff 50%);'
    )
    expect(out['--m']).toMatch(/^#[0-9a-f]{6}$/)
    expect(out['--m']).toBe('#808080')
  })

  it('omits live-derived and non-colour tokens', () => {
    const out = run(
      '--a: #111111;',
      '--gradient-body-background: var(--body-background);\n--focus-ring-width: 3px;\n--focus-ring-color: #ff0000;'
    )
    expect(out).not.toHaveProperty('--gradient-body-background')
    expect(out).not.toHaveProperty('--focus-ring-width')
    expect(out).not.toHaveProperty('--focus-ring-color')
  })

  it('seeds an undeclared core token from its fallback chain', () => {
    const out = run('--a: #111111;', '--accent: #00ff00;', ['--success-button'])
    // --success-button falls back to --status-success (a declared #123456).
    expect(out['--success-button']).toBe(out['--status-success'])
    // --navbar-active prefers --accent-overlay over --accent.
    const nav = run(
      '--a: #111111;',
      '--accent-overlay: #aa0000;\n--accent: #00aa00;',
      ['--navbar-active']
    )
    expect(nav['--navbar-active']).toBe('#aa0000')
    // An undeclared --danger takes the consumer's literal fallback.
    expect(run('--a: #111111;', '', ['--danger'])['--danger']).toBe('#cc3333')
  })

  it('throws naming the theme and token when no seed chain can fill a core token', () => {
    expect(() => run('--a: #111111;', '', ['--accent'])).toThrow(/t.*--accent/)
  })

  it('returns keys sorted', () => {
    const out = run('--z: #111111;\n--a: #222222;', '')
    const keys = Object.keys(out)
    expect(keys).toEqual([...keys].sort())
  })
})
