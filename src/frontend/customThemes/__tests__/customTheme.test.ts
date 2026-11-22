import type { CustomTheme } from '../../../common/types/customTheme'
import {
  CUSTOM_THEME_PREFIX,
  MAX_CUSTOM_THEMES,
  MAX_THEME_NAME_LENGTH,
  MAX_TOKENS_PER_THEME,
  MAX_TOKEN_VALUE_LENGTH,
  THEME_ID_PATTERN,
  cleanTokens,
  customThemeKey,
  makeCopy,
  newCustomThemeId,
  nextCopyName,
  parseCustomThemes,
  resolveThemeKey,
  validateThemeName
} from '../customTheme'
import { BUILTIN_TOKENS } from '../builtinTokens'

const yes = () => true
const id = (n: number) => n.toString(16).padStart(16, '0')

const valid = (n = 1, over: Partial<CustomTheme> = {}): CustomTheme => ({
  id: id(n),
  name: `Theme ${n}`,
  base: 'dracula',
  tokens: { '--accent': '#112233' },
  ...over
})

describe('parseCustomThemes totality and ordering', () => {
  it.each([null, undefined, 'x', 7, true, {}, [], { length: 1 }])(
    'returns [] for %p',
    (raw) => {
      expect(parseCustomThemes(raw)).toEqual([])
    }
  )

  it('keeps a valid theme and the stored order of valid entries', () => {
    const a = valid(3)
    const b = valid(1)
    const c = valid(2)
    expect(parseCustomThemes([a, b, c], yes)).toEqual([a, b, c])
  })

  it('drops invalid ids', () => {
    expect(parseCustomThemes([valid(1, { id: '../x' })], yes)).toEqual([])
    expect(parseCustomThemes([valid(1, { id: 'ABCDEF0123456789' })])).toEqual(
      []
    )
    expect(parseCustomThemes([valid(1, { id: id(1) + '0' })])).toEqual([])
  })

  it('keeps the first of two themes sharing an id', () => {
    const first = valid(1, { name: 'first' })
    const second = valid(1, { name: 'second' })
    expect(parseCustomThemes([first, second], yes)).toEqual([first])
  })

  it('drops empty, blank and over-long names', () => {
    expect(parseCustomThemes([valid(1, { name: '' })])).toEqual([])
    expect(parseCustomThemes([valid(1, { name: '   ' })])).toEqual([])
    expect(
      parseCustomThemes([
        valid(1, { name: 'x'.repeat(MAX_THEME_NAME_LENGTH + 1) })
      ])
    ).toEqual([])
    expect(
      parseCustomThemes([valid(1, { name: 'x'.repeat(MAX_THEME_NAME_LENGTH) })])
    ).toHaveLength(1)
  })

  it('drops a theme whose base is not a built-in', () => {
    expect(parseCustomThemes([valid(1, { base: 'custom:abc' })])).toEqual([])
    expect(parseCustomThemes([valid(1, { base: 'constructor' })])).toEqual([])
    expect(parseCustomThemes([valid(1, { base: 'old-file.css' })])).toEqual([])
  })

  it('drops a theme whose tokens are not a plain object', () => {
    for (const tokens of [null, 'x', 5, [], [['--accent', '#fff']]]) {
      expect(parseCustomThemes([{ ...valid(1), tokens }], yes)).toEqual([])
    }
  })

  it('drops a theme with more than 256 tokens', () => {
    const tokens: Record<string, string> = {}
    for (let i = 0; i < MAX_TOKENS_PER_THEME + 1; i++)
      tokens[`--accent-${i}`] = '#112233'
    expect(parseCustomThemes([valid(1, { tokens })], yes)).toEqual([])
  })

  it('keeps at most 50 themes', () => {
    const many = Array.from({ length: 80 }, (_v, i) => valid(i + 1))
    const out = parseCustomThemes(many, yes)
    expect(MAX_CUSTOM_THEMES).toBe(50)
    expect(out).toHaveLength(50)
    expect(out[0]?.id).toBe(id(1))
    expect(out[49]?.id).toBe(id(50))
  })
})

describe('parseCustomThemes token handling', () => {
  const tokensOf = (tokens: Record<string, string>) =>
    parseCustomThemes([valid(1, { tokens })], yes)[0]?.tokens

  it('re-stores colour values canonically', () => {
    expect(tokensOf({ '--accent': 'rgba(255, 0, 0, 0.5)' })).toEqual({
      '--accent': '#ff000080'
    })
    expect(tokensOf({ '--accent': '#ABC' })).toEqual({ '--accent': '#aabbcc' })
  })

  it('drops bad token names: wrong shape, unknown, prototype', () => {
    const raw = JSON.parse(
      '{"--accent":"#112233","accent":"#112233","--ACCENT":"#112233",' +
        '"--evil":"#112233","--__proto__":"#112233","__proto__":"#112233",' +
        '"--a b":"#112233","--accent;":"#112233"}'
    ) as Record<string, string>
    const out = tokensOf(raw)
    expect(out).toEqual({ '--accent': '#112233' })
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('accepts every token name present in the built-in seeds', () => {
    const names = new Set(
      Object.values(BUILTIN_TOKENS).flatMap((t) => Object.keys(t))
    )
    const tokens: Record<string, string> = {}
    for (const n of names) tokens[n] = '#112233'
    expect(Object.keys(tokensOf(tokens) ?? {})).toHaveLength(names.size)
  })

  it.each(Object.keys(BUILTIN_TOKENS))(
    'round-trips the whole frozen seed of %s',
    (key) => {
      const seed = BUILTIN_TOKENS[key] ?? {}
      const copy = makeCopy({ base: key, tokens: seed }, id(1), 'c')
      expect(parseCustomThemes([copy], yes)).toEqual([copy])
    }
  )

  it('accepts the live-derived token names but not the non-colour width token', () => {
    expect(tokensOf({ '--focus-ring-color': '#112233' })).toEqual({
      '--focus-ring-color': '#112233'
    })
    expect(tokensOf({ '--focus-ring-width': '3px' })).toEqual({})
  })

  it('drops values that are too long, non-strings or not colours', () => {
    const long = '#' + 'a'.repeat(MAX_TOKEN_VALUE_LENGTH)
    const raw = {
      '--accent': long,
      '--success': 5 as unknown as string,
      '--danger': 'var(--accent)',
      '--primary': 'url(https://e.example/x)',
      '--navbar-accent': '#445566'
    }
    expect(tokensOf(raw)).toEqual({ '--navbar-accent': '#445566' })
  })

  it('keeps a valid gradient and drops an unsupported or hostile one', () => {
    const good = 'linear-gradient(90deg, #000, #333)'
    expect(tokensOf({ '--gradient-01': good })).toEqual({
      '--gradient-01': good
    })
    expect(
      parseCustomThemes(
        [valid(1, { tokens: { '--gradient-01': good } })],
        () => false
      )[0]?.tokens
    ).toEqual({})
    for (const bad of [
      'linear-gradient(90deg, var(--x), #333)',
      'linear-gradient(90deg, url(https://e.example/x), #333)',
      'linear-gradient(#000, #111); color: red',
      'linear-gradient(#000, #111) !important'
    ]) {
      expect(tokensOf({ '--gradient-01': bad })).toEqual({})
    }
  })

  it('IN-03: drops a stored gradient planted in a colour token', () => {
    const good = 'linear-gradient(90deg, #000, #333)'
    expect(tokensOf({ '--accent': good, '--gradient-01': good })).toEqual({
      '--gradient-01': good
    })
  })

  it('CR-01: the Save filter drops a layered image-set gradient', () => {
    const good = 'linear-gradient(90deg, #000, #333)'
    const layered =
      'linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)'
    expect(
      cleanTokens({ '--gradient-01': layered, '--gradient-02': good }, yes)
    ).toEqual({ '--gradient-02': good })
  })

  it.each(Object.keys(BUILTIN_TOKENS))(
    'keeps every token of the %s seed',
    (key) => {
      const seed = BUILTIN_TOKENS[key] ?? {}
      expect(Object.keys(cleanTokens(seed, yes) ?? {}).sort()).toEqual(
        Object.keys(seed).sort()
      )
    }
  )

  it('fails closed on gradients when CSS.supports is unavailable', () => {
    const good = 'linear-gradient(90deg, #000, #333)'
    const out = parseCustomThemes([
      valid(1, { tokens: { '--gradient-01': good, '--accent': '#112233' } })
    ])
    expect(out[0]?.tokens).toEqual({ '--accent': '#112233' })
  })

  it('D-09: nested-override colours of gamelib-light are not stored as tokens', () => {
    const seed = BUILTIN_TOKENS['gamelib-light'] ?? {}
    const entries = Object.entries(seed)
    // `.runnerIcon` #88c0d0 and the log box #dde1e7 are nested rules: no token carries them
    for (const nested of ['#88c0d0', '#dde1e7']) {
      expect(entries.filter(([, v]) => v === nested)).toEqual([])
    }
    // `.genre` #2e3440 coincides with one DECLARED token, and only that one
    expect(
      entries.filter(([, v]) => v === '#2e3440').map(([name]) => name)
    ).toEqual(['--neutral-06'])
    // a copy stores exactly the declared seed, nothing selector-derived
    const copy = makeCopy({ base: 'gamelib-light', tokens: seed }, id(1), 'c')
    expect(Object.keys(copy.tokens).sort()).toEqual(Object.keys(seed).sort())
    expect(copy.base).toBe('gamelib-light')
  })
})

describe('parseCustomThemes never throws', () => {
  // deterministic xorshift so a failure reproduces
  let state = 0x9e3779b9
  const rnd = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.floor(rnd() * xs.length)] as T

  const leaf = (): unknown =>
    pick([
      null,
      undefined,
      0,
      -1,
      Infinity,
      NaN,
      '',
      'x',
      '#fff',
      '__proto__',
      'custom:abc',
      true,
      false,
      [],
      {},
      id(1),
      'dracula',
      '--accent',
      'linear-gradient(#000, #111)'
    ])

  const structure = (depth: number): unknown => {
    if (depth <= 0 || rnd() < 0.3) return leaf()
    if (rnd() < 0.4) {
      return Array.from({ length: Math.floor(rnd() * 4) }, () =>
        structure(depth - 1)
      )
    }
    const obj: Record<string, unknown> = {}
    for (const key of [
      'id',
      'name',
      'base',
      'tokens',
      '--accent',
      '__proto__'
    ]) {
      if (rnd() < 0.5) obj[key] = structure(depth - 1)
    }
    return obj
  }

  it('survives 500 random structures', () => {
    for (let i = 0; i < 500; i++) {
      const raw = structure(4)
      expect(() => parseCustomThemes(raw, yes)).not.toThrow()
      expect(Array.isArray(parseCustomThemes(raw, yes))).toBe(true)
    }
  })

  it('survives a hostile getter', () => {
    const hostile = {
      get id(): string {
        throw new Error('boom')
      },
      name: 'x',
      base: 'dracula',
      tokens: {}
    }
    expect(parseCustomThemes([hostile, valid(2)], yes)).toEqual([valid(2)])
  })
})

describe('resolveThemeKey and makeCopy', () => {
  it('builds the custom key from the prefix', () => {
    expect(customThemeKey('abc')).toBe(`${CUSTOM_THEME_PREFIX}abc`)
  })

  it('resolves built-in, custom and unknown keys', () => {
    const t = valid(1)
    expect(resolveThemeKey('dracula', [t])).toEqual({
      kind: 'builtin',
      key: 'dracula'
    })
    expect(resolveThemeKey(customThemeKey(t.id), [t])).toEqual({
      kind: 'custom',
      theme: t
    })
    expect(resolveThemeKey('custom:nope', [t]).kind).toBe('unknown')
    expect(resolveThemeKey('constructor', [t]).kind).toBe('unknown')
  })

  it('makeCopy keeps the original built-in base and copies tokens', () => {
    const src = valid(1)
    const copy = makeCopy(src, id(2), 'Copy')
    expect(copy).toEqual({ ...src, id: id(2), name: 'Copy' })
    expect(copy.tokens).not.toBe(src.tokens)
  })
})

describe('validateThemeName', () => {
  const others = [
    { id: id(1), name: 'Mine' },
    { id: id(2), name: 'Other' }
  ]

  it('rejects empty and blank names', () => {
    expect(validateThemeName('', others)).toBe('empty')
    expect(validateThemeName('  ', others)).toBe('empty')
  })

  it('rejects a name over 60 characters, accepts exactly 60', () => {
    expect(validateThemeName('x'.repeat(61), others)).toBe('too-long')
    expect(validateThemeName('x'.repeat(60), others)).toBeNull()
  })

  it('rejects another theme name case-insensitively', () => {
    expect(validateThemeName('mine', others)).toBe('taken')
    expect(validateThemeName('  MINE ', others)).toBe('taken')
  })

  it('accepts the theme own name', () => {
    expect(validateThemeName('Mine', others, id(1))).toBeNull()
    expect(validateThemeName('Other', others, id(1))).toBe('taken')
  })

  it('accepts a fresh name', () => {
    expect(validateThemeName('Fresh', others)).toBeNull()
  })
})

describe('nextCopyName', () => {
  const fmtFor = (src: string) => (n: number | null) =>
    n === null ? `${src} copy` : `${src} copy ${n}`

  it('uses the plain copy name when free', () => {
    expect(nextCopyName('Dracula', [], fmtFor('Dracula'))).toBe('Dracula copy')
  })

  it('numbers a second copy of the same source from 2', () => {
    expect(nextCopyName('Dracula', ['Dracula copy'], fmtFor('Dracula'))).toBe(
      'Dracula copy 2'
    )
  })

  it('continues past taken numbers, case-insensitively', () => {
    expect(
      nextCopyName(
        'Dracula',
        ['Dracula copy', 'dracula COPY 2'],
        fmtFor('Dracula')
      )
    ).toBe('Dracula copy 3')
  })

  it('shortens the source part, never the copy suffix, past 60 characters', () => {
    const source = 'S'.repeat(58)
    const out = nextCopyName(source, [], fmtFor(source))
    expect(out.length).toBeLessThanOrEqual(MAX_THEME_NAME_LENGTH)
    expect(out.endsWith(' copy')).toBe(true)
    const numbered = nextCopyName(source, [out], fmtFor(source))
    expect(numbered.length).toBeLessThanOrEqual(MAX_THEME_NAME_LENGTH)
    expect(numbered.endsWith(' copy 2')).toBe(true)
    expect(numbered).not.toBe(out)
  })
})

describe('newCustomThemeId', () => {
  const fixed =
    (...bytes: number[]) =>
    (b: Uint8Array) => {
      b.set(bytes)
      return b
    }

  it('returns 16 lowercase hex characters', () => {
    const out = newCustomThemeId(new Set())
    expect(out).toMatch(THEME_ID_PATTERN)
  })

  it('regenerates on collision', () => {
    let call = 0
    const random = (b: Uint8Array) => {
      call++
      b.fill(call === 1 ? 0xab : 0xcd)
      return b
    }
    const out = newCustomThemeId(new Set(['ab'.repeat(8)]), random)
    expect(call).toBe(2)
    expect(out).toBe('cd'.repeat(8))
  })

  it('formats bytes as zero-padded lowercase hex', () => {
    expect(
      newCustomThemeId(new Set(), fixed(0, 1, 2, 15, 16, 255, 171, 9))
    ).toBe('0001020f10ffab09')
  })
})
