import { fixAsarPath } from 'backend/process/appPaths'

jest.mock('../logger')

describe('Constants - fixAsarPath', () => {
  test('need to fix path and replace correctly', () => {
    const fixed_path = fixAsarPath('path/app.asar/bin')
    expect(fixed_path).toBe('path/app.asar.unpacked/bin')
  })

  test(' no need to fix path and replace is skipped', () => {
    const fixed_path = fixAsarPath('fixed/path/app.asar.unpacked/bin')
    expect(fixed_path).toBe('fixed/path/app.asar.unpacked/bin')
  })
})
