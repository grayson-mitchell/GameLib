import { parseMetacriticScore } from '../metacriticScore'

describe('parseMetacriticScore', () => {
  it.each([
    [90, 90],
    ['90', 90],
    [' 79 ', 79],
    ['100', 100],
    [1, 1]
  ])('accepts %p', (input, expected) => {
    expect(parseMetacriticScore(input)).toBe(expected)
  })

  it.each([
    ['0'],
    [0],
    ['101'],
    ['-5'],
    ['87.5'],
    [87.5],
    ['abc'],
    [''],
    [null],
    [undefined],
    [{}],
    [NaN],
    [Infinity]
  ])('rejects %p', (input) => {
    expect(parseMetacriticScore(input)).toBeUndefined()
  })
})
