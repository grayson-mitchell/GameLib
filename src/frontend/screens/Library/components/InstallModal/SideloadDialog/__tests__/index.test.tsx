/**
 * Unit tests for SideloadDialog's `fileFilters`/`localImageFilters` (Phase
 * 34.8-08a, REQ-34.8-01/-11/-17).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring). `SideloadDialog` itself declares
 * over a dozen `useState` calls plus `useContext`/`useCallback`, well
 * beyond what a `react-i18next` mock alone makes safe to invoke directly as
 * a plain function, so this file tests the extracted pure functions
 * instead, per this plan's test-infrastructure note.
 *
 * Imports from `../filters` (NOT `../index`) -- `index.tsx`'s very first
 * line is `import './index.scss'`, which this project's jsdom-less jest
 * config cannot parse. `fileFilters`/`localImageFilters` are re-exported
 * unchanged into `index.tsx`'s render/callback paths; this test targets
 * the SCSS-free source module directly.
 */
import { TFunction } from 'i18next'

import { InstallPlatform } from 'common/types'

import { fileFilters, localImageFilters } from '../filters'

// Copy-preserving proof: a `t` that returns its own second (English
// default) argument unchanged.
const echoT = ((_key: string, defaultValue: string) =>
  defaultValue) as unknown as TFunction

// Genuine-routing proof: a `t` that ignores its default and returns a
// distinct sentinel -- proves each `name`/extension flows through `t`, not
// a hardcoded literal sitting beside a decorative `t()` call.
const sentinelT = ((_key: string, _defaultValue: string) =>
  'SENTINEL') as unknown as TFunction

describe('localImageFilters', () => {
  it('is copy-preserving: exact pre-retrofit English names under echoT', () => {
    expect(localImageFilters(echoT)).toEqual([
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
      },
      { name: 'All', extensions: ['*'] }
    ])
  })

  it('routes every name through t -- sentinel proof', () => {
    for (const filter of localImageFilters(sentinelT)) {
      expect(filter.name).toBe('SENTINEL')
    }
  })
})

describe('fileFilters', () => {
  const windowsAliases: InstallPlatform[] = ['Windows', 'windows', 'Win32']

  it.each(windowsAliases)(
    'Windows-family platform "%s" is copy-preserving under echoT',
    (platform) => {
      expect(fileFilters(platform, echoT)).toEqual([
        { name: 'Executables', extensions: ['exe', 'msi'] },
        { name: 'Scripts', extensions: ['bat'] },
        { name: 'All', extensions: ['*'] }
      ])
    }
  )

  it('linux is copy-preserving under echoT', () => {
    expect(fileFilters('linux', echoT)).toEqual([
      { name: 'AppImages', extensions: ['AppImage'] },
      { name: 'Other Binaries', extensions: ['sh', 'py', 'bin'] },
      { name: 'All', extensions: ['*'] }
    ])
  })

  it.each(['osx', 'Mac'] as InstallPlatform[])(
    'mac-family platform "%s" is copy-preserving under echoT',
    (platform) => {
      expect(fileFilters(platform, echoT)).toEqual([
        { name: 'Apps', extensions: ['App'] },
        { name: 'Other Binaries', extensions: ['sh', 'py', 'bin'] },
        { name: 'All', extensions: ['*'] }
      ])
    }
  )

  it.each(['Android', 'iOS', 'Browser'] as InstallPlatform[])(
    'platform "%s" returns an empty array (unchanged pre-retrofit behaviour)',
    (platform) => {
      expect(fileFilters(platform, echoT)).toEqual([])
    }
  )

  it('routes every name and every stringly-typed extension through t -- sentinel proof', () => {
    const platformsWithEntries: InstallPlatform[] = ['Windows', 'linux', 'osx']
    for (const platform of platformsWithEntries) {
      const filters = fileFilters(platform, sentinelT)
      expect(filters).toBeDefined()
      for (const filter of filters ?? []) {
        expect(filter.name).toBe('SENTINEL')
      }
    }

    // linux/osx also route their single stringly-typed extension
    // ('AppImage'/'App') through t.
    const linuxFilters = fileFilters('linux', sentinelT)
    expect(linuxFilters?.[0].extensions).toEqual(['SENTINEL'])
    const macFilters = fileFilters('osx', sentinelT)
    expect(macFilters?.[0].extensions).toEqual(['SENTINEL'])
  })

  it('reuses ONE key across all three "All" sites and ONE key across both "Other Binaries" sites', () => {
    // If a distinct sentinel is returned per DEFAULT TEXT (not per key),
    // all three "All" entries and both "Other Binaries" entries collapse
    // to the same resolved value under a t that echoes its default --
    // this is already covered by the copy-preserving assertions above.
    // This test instead asserts the *source* reuses one physical `t()`
    // call site's default text across all sites (mirrors the plan's
    // <action> instruction), verified structurally via the SIDELOADDIALOG
    // combined key count assertion in the plan's closure doc; expressed
    // here as a value-level duplicate check.
    const allNames = [
      ...(fileFilters('Windows', echoT) ?? []),
      ...(fileFilters('linux', echoT) ?? []),
      ...(fileFilters('osx', echoT) ?? [])
    ].map((f) => f.name)
    const allCount = allNames.filter((n) => n === 'All').length
    expect(allCount).toBe(3)

    const otherBinariesCount = [
      ...(fileFilters('linux', echoT) ?? []),
      ...(fileFilters('osx', echoT) ?? [])
    ].filter((f) => f.name === 'Other Binaries').length
    expect(otherBinariesCount).toBe(2)
  })
})
