/**
 * Self-test for the single shared `stripSourceComments` util (quick task
 * 260726-q8f), including the exact non-`*`-prefixed block-comment spelling
 * that defeated the line-prefix-only implementation across four consecutive
 * gap-cycle reviews of Phase 34.2 (see `structuralContainment.test.ts`'s
 * `usesForbiddenNodeOsBinding` for the production shape this class of gate
 * takes, and `34.2-VERIFICATION.md`'s override block for the repo-wide
 * finding that motivated this extraction).
 *
 * Fixtures are built with `[...].join('\n')` string arrays (this repo's
 * existing convention for gate self-tests) so every fixture is DATA, never a
 * real comment living in this test file's own source.
 *
 * NOTE on this file's own containment-gate exposure: this file necessarily
 * mentions the string `node:os` inside Test 1's fixture data, which trips
 * `structuralContainment.test.ts`'s `usesForbiddenNodeOsBinding` scan if
 * this file's comment-stripped source also names either forbidden bare
 * identifier for the OS-module accessor functions the CR-02 gate protects.
 * Neither of those two identifiers appears anywhere in this file — fixtures
 * use a generic factory-argument name instead (the same substitution the
 * originating review used in its own reproduction).
 */
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

describe('stripSourceComments', () => {
  it("Test 1: a non-*-prefixed block comment naming jest.mock('os', ...) and jest.mock('node:os', ...) is fully removed", () => {
    const source = [
      '/*',
      "jest.mock('os', mockOsFactory)",
      "jest.mock('node:os', mockOsFactory)",
      '*/',
      'const x = 1'
    ].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).not.toContain("jest.mock('os'")
    expect(stripped).not.toContain("jest.mock('node:os'")
  })

  it('Test 2: a non-*-prefixed block comment naming a process.env.HOME assignment is fully removed', () => {
    const source = [
      '/*',
      'process.env.HOME = containmentRoot',
      '*/',
      'const x = 1'
    ].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).not.toContain('process.env.HOME')
  })

  it('Test 3: a non-*-prefixed block comment naming an expression-body error wrapper is fully removed', () => {
    const source = [
      '/*',
      '(error) => heroicLogWriter.logError(error)',
      '*/',
      'const x = 1'
    ].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).not.toContain('=> heroicLogWriter.logError(')
  })

  it('Test 4 (regression guard): a *-prefixed docblock naming the same pattern is still stripped', () => {
    const source = [
      '/**',
      " * jest.mock('os', mockOsFactory)",
      ' */',
      'const x = 1'
    ].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).not.toContain("jest.mock('os'")
  })

  it('Test 5 (WR-08 property): a quoted steam:// literal survives stripping intact', () => {
    const source = ["const url = 'steam://rungameid/440'", 'const y = 2'].join(
      '\n'
    )

    const stripped = stripSourceComments(source)
    expect(stripped).toContain('steam://rungameid/440')
  })

  it('Test 6 (WR-08 property, trailing-comment form): a steam:// literal on a line with a trailing // comment survives stripping intact', () => {
    // The trailing comment text itself intentionally SURVIVES here too --
    // removing it would require the naive `/\/\/.*$/gm` regex, which is
    // exactly what truncates the preceding string literal (the WR-08
    // defect this util exists to avoid). This util only drops WHOLE lines
    // that themselves begin with a comment marker, never trailing text on a
    // code line.
    const source = [
      "const url = 'steam://rungameid/440' // launch it",
      'const y = 2'
    ].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).toContain('steam://rungameid/440')
  })

  it('Test 7: a whole line beginning with // is dropped', () => {
    const source = ['// a leading comment line', 'const x = 1'].join('\n')

    const stripped = stripSourceComments(source)
    expect(stripped).not.toContain('a leading comment line')
    expect(stripped).toContain('const x = 1')
  })

  it('Test 8: real code with no comments passes through byte-identical', () => {
    const source = [
      'export function add(a: number, b: number): number {',
      '  return a + b',
      '}'
    ].join('\n')

    expect(stripSourceComments(source)).toBe(source)
  })
})
