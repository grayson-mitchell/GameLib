import type { WineInstallation } from 'common/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { findWineByOptionValue, wineOptionValue } from '../wineSelection'

// 66.2 WR-03: the Linux factory default is named after the binary ("wine"), while
// getAlternativeWine names the same install by `wine --version` ("wine-9.0").
const storedFactoryDefault: WineInstallation = {
  bin: '/usr/bin/wine',
  name: 'wine',
  type: 'wine'
}
const list: WineInstallation[] = [
  {
    bin: '/home/u/.config/GameLib/tools/proton/GE/proton',
    name: 'GE-Proton',
    type: 'proton'
  },
  { bin: '/usr/bin/wine', name: 'wine-9.0', type: 'wine' }
]

describe('wine selector option keys (66.2 WR-03)', () => {
  test('a fresh Linux profile default matches its list entry despite the name differing', () => {
    const value = wineOptionValue(storedFactoryDefault)
    expect(list.map(wineOptionValue)).toContain(value)
    expect(findWineByOptionValue(list, value)).toBe(list[1])
  })

  test('an option value round-trips to its list entry', () => {
    for (const entry of list) {
      expect(findWineByOptionValue(list, wineOptionValue(entry))).toBe(entry)
    }
  })

  test('no selection and an unknown value map to nothing', () => {
    expect(wineOptionValue(undefined)).toBe('')
    expect(findWineByOptionValue(list, '')).toBeUndefined()
    expect(findWineByOptionValue(list, '/opt/gone/wine')).toBeUndefined()
  })

  // Both selectors must key by the helper, not by name: a by-name `value` is the regression.
  test.each([
    'src/frontend/screens/Settings/components/WineVersionSelector.tsx',
    'src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx'
  ])('%s keys its options by wineOptionValue', (rel) => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', '..', rel),
      'utf8'
    )
    expect(src).not.toMatch(/value=\{\s*(wineVersion\??|version)\.name/)
    expect(src).toMatch(/value=\{wineOptionValue\(version\)\}/)
    expect(src).toMatch(/findWineByOptionValue\(/)
  })
})
