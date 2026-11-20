import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'

describe('assertAtOrAboveFloor (D-05)', () => {
  it('passes when scanned equals the floor', () => {
    expect(() => assertAtOrAboveFloor('gate', 22, 22)).not.toThrow()
  })

  it('passes above the floor', () => {
    expect(() => assertAtOrAboveFloor('gate', 23, 22)).not.toThrow()
  })

  it('throws at floor minus one (the adjacent boundary)', () => {
    expect(() => assertAtOrAboveFloor('gate', 21, 22)).toThrow(
      /below the floor/
    )
  })

  it('throws on a zero scan', () => {
    expect(() => assertAtOrAboveFloor('gate', 0, 22)).toThrow()
  })

  it('throws on NaN', () => {
    expect(() => assertAtOrAboveFloor('gate', Number.NaN, 22)).toThrow()
  })

  it('refuses a zero, negative or fractional floor as itself vacuous', () => {
    expect(() => assertAtOrAboveFloor('gate', 5, 0)).toThrow(/positive integer/)
    expect(() => assertAtOrAboveFloor('gate', 5, -1)).toThrow(
      /positive integer/
    )
    expect(() => assertAtOrAboveFloor('gate', 5, 1.5)).toThrow(
      /positive integer/
    )
  })

  it('names the gate label, the scanned count and the floor in the message', () => {
    expect(() => assertAtOrAboveFloor('myCensus files', 3, 10)).toThrow(
      /myCensus files.*scanned 3.*floor of 10/
    )
  })
})
