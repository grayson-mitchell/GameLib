/**
 * Session-only Games search + alphabet letter (todo 2026-10-29). In-memory
 * module state; D-22 / WR-11 forbid any storage key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

import {
  readLibrarySessionSearch,
  writeLibrarySessionSearch,
  resetLibrarySessionSearchForTests
} from '../librarySessionSearch'

beforeEach(() => {
  resetLibrarySessionSearchForTests()
})

describe('librarySessionSearch', () => {
  it('starts cleared', () => {
    expect(readLibrarySessionSearch()).toEqual({
      filterText: '',
      alphabetFilterLetter: null
    })
  })

  it('reads back what was written, and a later clear reads back cleared', () => {
    writeLibrarySessionSearch({
      filterText: 'portal',
      alphabetFilterLetter: 'P'
    })
    expect(readLibrarySessionSearch()).toEqual({
      filterText: 'portal',
      alphabetFilterLetter: 'P'
    })
    writeLibrarySessionSearch({ filterText: '', alphabetFilterLetter: null })
    expect(readLibrarySessionSearch()).toEqual({
      filterText: '',
      alphabetFilterLetter: null
    })
  })

  it('reset restores the defaults', () => {
    writeLibrarySessionSearch({ filterText: 'x', alphabetFilterLetter: 'X' })
    resetLibrarySessionSearchForTests()
    expect(readLibrarySessionSearch().filterText).toBe('')
  })

  it('never touches localStorage or sessionStorage (D-22)', () => {
    const makeStore = () => ({
      getItem: jest.fn(),
      setItem: jest.fn()
    })
    const g = globalThis as unknown as Record<string, unknown>
    const local = makeStore()
    const session = makeStore()
    g.localStorage = local
    g.sessionStorage = session
    writeLibrarySessionSearch({ filterText: 'a', alphabetFilterLetter: 'A' })
    readLibrarySessionSearch()
    expect(local.setItem).not.toHaveBeenCalled()
    expect(local.getItem).not.toHaveBeenCalled()
    expect(session.setItem).not.toHaveBeenCalled()
    expect(session.getItem).not.toHaveBeenCalled()
  })
})

describe('Library/index.tsx wiring (source gate)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('initialises filterText and the letter from the session store', () => {
    expect(source).toMatch(
      /\[filterText, setFilterText\] = useState\(\s*\(\) => readLibrarySessionSearch\(\)\.filterText\s*\)/
    )
    expect(source).toMatch(
      /\[alphabetFilterLetter, setAlphabetFilterLetter\] = useState<\s*string \| null\s*>\(\(\) => readLibrarySessionSearch\(\)\.alphabetFilterLetter\)/
    )
  })

  it('writes back from a useEffect', () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*writeLibrarySessionSearch\(/
    )
  })

  it('clearAllFilters still clears both', () => {
    const start = source.indexOf('const clearAllFilters = () => {')
    expect(start).toBeGreaterThan(-1)
    let depth = 0
    let end = start
    for (let i = source.indexOf('{', start); i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = source.slice(start, end)
    expect(body).toContain("setFilterText('')")
    expect(body).toContain('setAlphabetFilterLetter(null)')
  })

  it('writes no storage key for the search or letter', () => {
    expect(source).not.toMatch(
      /(storage|localStorage|sessionStorage)\.setItem\([^)]*(filterText|alphabetFilterLetter)/
    )
  })
})
