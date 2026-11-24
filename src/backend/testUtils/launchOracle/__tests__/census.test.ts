/**
 * Self-tests for the incident-title census (88-04, D-14, D-15): every `it(` / `test(` title of a
 * named TS test file must be a golden case or a reasoned exclusion, and the scanner must not read
 * titles out of comments, strings or the bodies of other calls.
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { assertCasesCoverTitles, slug, tsTestTitles } from '../census'

const REGISTRY_TEST = join(
  __dirname,
  '..',
  '..',
  '..',
  '__tests__',
  'knownFixesRegistry.test.ts'
)

/** Writes `source` to a throwaway file inside a fake HOME and reads its titles. */
function titlesOf(source: string): string[] {
  const scratch = createFakeHomeProfile({ prefix: 'gamelib-census-' })
  try {
    const file = join(scratch.root, 'sample.test.ts')
    writeFileSync(file, source)
    return tsTestTitles(file)
  } finally {
    scratch.dispose()
  }
}

describe('slug', () => {
  it('lower-cases, turns runs of non-alphanumerics into one dash and trims', () => {
    expect(slug('Keeps a Valid entry, warns!')).toBe(
      'keeps-a-valid-entry-warns'
    )
    expect(slug('  a > b  ')).toBe('a-b')
    expect(slug('%s works (32/64)')).toBe('s-works-32-64')
  })
})

describe('tsTestTitles', () => {
  it('prefixes titles with their enclosing describes joined by " > "', () => {
    expect(
      titlesOf(
        [
          "describe('outer', () => {",
          "  it('first', () => {})",
          "  describe('inner', () => {",
          "    test('second', async () => {})",
          '  })',
          "  it('third', () => {})",
          '})',
          "it('top level', () => {})"
        ].join('\n')
      )
    ).toEqual([
      'outer > first',
      'outer > inner > second',
      'outer > third',
      'top level'
    ])
  })

  it('reads it.each titles verbatim and the skip, only and todo spellings', () => {
    expect(
      titlesOf(
        [
          "describe('d', () => {",
          "  it.each(['a', 'b'])('handles %s', (x) => {})",
          '  it.each([[1, 2]])(',
          "    'adds %i and %i',",
          '    (a, b) => {}',
          '  )',
          "  it.skip('skipped one', () => {})",
          "  it.only('only one', () => {})",
          "  it.todo('later')",
          '})'
        ].join('\n')
      )
    ).toEqual([
      'd > handles %s',
      'd > adds %i and %i',
      'd > skipped one',
      'd > only one',
      'd > later'
    ])
  })

  it('ignores titles in comments and braces, quotes or regexes inside strings', () => {
    expect(
      titlesOf(
        [
          "// it('line comment', () => {})",
          '/* describe("block comment", () => {',
          "  it('inside block', () => {}) */",
          "describe('real', () => {",
          "  const s = 'a } brace and a \\' quote'",
          '  const r = /[}\'"]/',
          '  const t = `tpl } ${1 + 1}`',
          "  it('after the noise', () => {})",
          '})',
          "it('outside', () => {})"
        ].join('\n')
      )
    ).toEqual(['real > after the noise', 'outside'])
  })

  it('throws when a title is not a string literal', () => {
    expect(() => titlesOf('it(name, () => {})')).toThrow(/title/)
  })

  it('reads every it and test of knownFixesRegistry.test.ts', () => {
    const titles = tsTestTitles(REGISTRY_TEST)
    expect(titles.length).toBeGreaterThanOrEqual(46)
    expect(titles).toContain(
      'validateRegistryFixes > warns and returns [] for a non-array'
    )
    expect(titles).toContain('knownFixPrefixDir > is undefined when unknown')
    expect(
      titles.some((t) => t.startsWith('dllOverridesToRegistryFixes > '))
    ).toBe(true)
  })
})

describe('assertCasesCoverTitles', () => {
  const titles = ['d > one', 'd > two %s', 'gate > reads the source']

  it('passes when every title is a case id by slug or a reasoned exclusion', () => {
    expect(() =>
      assertCasesCoverTitles(['d-one', 'd-two-s'], titles, {
        'gate > reads the source': 'source-text gate, dropped per D-15'
      })
    ).not.toThrow()
  })

  it('fails naming each uncovered title (planted gap)', () => {
    expect(() =>
      assertCasesCoverTitles(['d-one'], titles, {
        'gate > reads the source': 'source-text gate, dropped per D-15'
      })
    ).toThrow(/d > two %s/)
    let message = ''
    try {
      assertCasesCoverTitles([], titles, {})
    } catch (error) {
      message = (error as Error).message
    }
    for (const title of titles) expect(message).toContain(title)
  })

  it('does not count an exclusion with an empty reason', () => {
    expect(() =>
      assertCasesCoverTitles(['d-one', 'd-two-s'], titles, {
        'gate > reads the source': '   '
      })
    ).toThrow(/gate > reads the source/)
  })

  it('fails on an exclusion that names no title, so a stale entry cannot hide a drop', () => {
    expect(() =>
      assertCasesCoverTitles(['d-one', 'd-two-s'], titles, {
        'gate > reads the source': 'dropped per D-15',
        'gone > title': 'was renamed'
      })
    ).toThrow(/gone > title/)
  })

  it('fails on an empty title list', () => {
    expect(() => assertCasesCoverTitles(['a'], [], {})).toThrow(/titles/)
  })
})
