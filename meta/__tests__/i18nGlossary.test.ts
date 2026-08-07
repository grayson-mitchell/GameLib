import { readFileSync } from 'fs'
import { join } from 'path'

// D-02 + D-21: exact, case-sensitive do-not-translate glossary. Mirrors the
// readFile() idiom in meta/lintTranslations.ts.
const GLOSSARY_PATH = join(__dirname, '..', 'i18nGlossary.json')

function readGlossary(): { terms: string[]; rationale: string } {
  return JSON.parse(readFileSync(GLOSSARY_PATH, 'utf-8'))
}

// D-02 brand + platform/unit terms, plus D-21's measured compound/variant
// extensions (ConsoleMode/index.tsx, LogSettings/index.tsx,
// StoreSearch/helpers.ts). Adding a term to the JSON without adding it here
// is fine; removing a required term here fails the test.
const REQUIRED_TERMS = [
  'GameLib',
  'Steam',
  'Epic',
  'GOG',
  'Proton',
  'CrossOver',
  'Steam Deck',
  'Linux',
  'macOS',
  'Windows',
  'MB/s',
  'Amazon',
  'ZOOM',
  'Zoom',
  'Epic/Legendary',
  'Amazon/Nile',
  'Amazon Games'
]

describe('meta/i18nGlossary.json', () => {
  const glossary = readGlossary()

  it('has exactly the keys terms and rationale', () => {
    expect(Object.keys(glossary).sort()).toEqual(['rationale', 'terms'])
  })

  it('terms is a non-empty array of strings, sorted ascending with no duplicates', () => {
    expect(Array.isArray(glossary.terms)).toBe(true)
    expect(glossary.terms.length).toBeGreaterThan(0)
    glossary.terms.forEach((term) => expect(typeof term).toBe('string'))
    expect(glossary.terms).toEqual([...glossary.terms].sort())
    expect(glossary.terms).toEqual([...new Set(glossary.terms)])
  })

  it.each(REQUIRED_TERMS)('includes the required glossary term %p', (term) => {
    expect(glossary.terms).toContain(term)
  })

  it('rationale is a non-empty string mentioning both D-02 and D-21', () => {
    expect(typeof glossary.rationale).toBe('string')
    expect(glossary.rationale.length).toBeGreaterThan(0)
    expect(glossary.rationale).toContain('D-02')
    expect(glossary.rationale).toContain('D-21')
  })
})
