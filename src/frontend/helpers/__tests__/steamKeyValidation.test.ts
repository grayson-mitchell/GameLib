import { isObviouslyMalformed, normalizeKey } from '../steamKeyValidation'

describe('normalizeKey', () => {
  it('trims whitespace and uppercases the input', () => {
    expect(normalizeKey('  abc-def  ')).toBe('ABC-DEF')
  })
})

describe('isObviouslyMalformed', () => {
  it.each([
    ['', true, 'empty string'],
    ['   ', true, 'whitespace-only string'],
    ['AAAAA-BBBBB-CCCCC', false, 'standard 5-5-5 shape (accepted)'],
    [
      'aaaaa-bbbbb-ccccc',
      false,
      'lowercase 5-5-5, normalized first (accepted)'
    ],
    [
      'ABCDE1234567890ABCDEFGHIJ',
      false,
      'long non-dashed valid-shape key (over-rejection guard)'
    ],
    ['short', true, 'under 10 chars after normalization'],
    ['KEY WITH SPACES 123456', true, 'mid-string whitespace / bad charset'],
    ['KEY_WITH_UNDERSCORE12', true, 'underscore not in allowed charset']
  ])('isObviouslyMalformed(%j) === %p (%s)', (input, expected) => {
    expect(isObviouslyMalformed(input)).toBe(expected)
  })
})
