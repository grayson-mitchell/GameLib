/**
 * Phase 100 (D-08, D-09, T-100-04, T-100-06): the pure rules behind the left
 * card's "New category…" field. `addCategory` replaces a named category's game
 * list with [], so a blank or existing name must be rejected before it is ever
 * called. No mocks.
 */
import {
  assignedCategories,
  categoryKeyFor,
  validateNewCategoryName
} from '../categoryName'

describe('validateNewCategoryName', () => {
  it('trims and accepts a new name', () => {
    expect(validateNewCategoryName('  Backlog ', ['RPG'])).toEqual({
      ok: true,
      name: 'Backlog'
    })
  })

  it('rejects an empty name', () => {
    expect(validateNewCategoryName('', [])).toEqual({
      ok: false,
      reason: 'empty'
    })
  })

  it('rejects a whitespace-only name', () => {
    expect(validateNewCategoryName('   ', [])).toEqual({
      ok: false,
      reason: 'empty'
    })
  })

  it('rejects an existing name', () => {
    expect(validateNewCategoryName('RPG', ['RPG'])).toEqual({
      ok: false,
      reason: 'exists'
    })
  })

  it('rejects an existing name that arrives padded', () => {
    expect(validateNewCategoryName(' RPG ', ['RPG'])).toEqual({
      ok: false,
      reason: 'exists'
    })
  })

  it('treats a different case as a different name, like the Categories settings', () => {
    expect(validateNewCategoryName('rpg', ['RPG'])).toEqual({
      ok: true,
      name: 'rpg'
    })
  })
})

describe('categoryKeyFor', () => {
  it('builds the `${appName}_${runner}` key CategorySettings uses', () => {
    expect(categoryKeyFor('Quail', 'legendary')).toBe('Quail_legendary')
  })
})

describe('assignedCategories', () => {
  it('lists the categories whose games include the key', () => {
    expect(
      assignedCategories(
        { RPG: ['Quail_legendary'], Done: [] },
        ['RPG', 'Done'],
        'Quail_legendary'
      )
    ).toEqual(['RPG'])
  })

  it('treats a category with no list as not assigned', () => {
    expect(
      assignedCategories({ RPG: undefined }, ['RPG', 'Gone'], 'Quail_legendary')
    ).toEqual([])
  })

  it('keeps the order of the names it is given', () => {
    expect(assignedCategories({ B: ['k'], A: ['k'] }, ['A', 'B'], 'k')).toEqual(
      ['A', 'B']
    )
  })
})
