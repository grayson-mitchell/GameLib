import { join } from 'path'
import { protectedRootsFor, type ProtectedRootsDeps } from '../protectedRoots'

const paths: ProtectedRootsDeps['paths'] = {
  userHome: join('/home', 'me'),
  appFolder: join('/home', 'me', '.config', 'gamelib'),
  heroicInstallPath: join('/home', 'me', 'Games', 'Heroic'),
  defaultWinePrefixDir: join('/home', 'me', 'Games', 'Prefixes'),
  defaultWinePrefix: join('/home', 'me', 'Games', 'Prefixes', 'default'),
  sharedWinePrefix: join('/home', 'me', 'Games', 'Prefixes', 'shared')
}

const configWith = (
  settings: Record<string, string>
): ProtectedRootsDeps['config'] => ({
  getSettings: () => settings as never
})

describe('protectedRootsFor', () => {
  it('lists the app paths, the settings paths and the user folders', () => {
    const out = protectedRootsFor({
      paths,
      config: configWith({
        defaultInstallPath: join('/games', 'install'),
        sharedWinePrefix: join('/games', 'shared')
      })
    })
    expect(out).toEqual([
      paths.userHome,
      paths.appFolder,
      paths.heroicInstallPath,
      paths.defaultWinePrefixDir,
      paths.defaultWinePrefix,
      paths.sharedWinePrefix,
      join('/games', 'install'),
      join('/games', 'shared'),
      join(paths.userHome, 'Desktop'),
      join(paths.userHome, 'Documents'),
      join(paths.userHome, 'Downloads'),
      join(paths.userHome, 'Applications')
    ])
  })

  it('drops empty entries and de-duplicates', () => {
    const out = protectedRootsFor({
      paths,
      config: configWith({
        defaultInstallPath: '',
        sharedWinePrefix: paths.sharedWinePrefix
      })
    })
    expect(out.every((p) => p.length > 0)).toBe(true)
    expect(new Set(out).size).toBe(out.length)
    expect(out.filter((p) => p === paths.sharedWinePrefix)).toHaveLength(1)
  })

  it('without a home folder derives no user-folder roots', () => {
    const out = protectedRootsFor({
      paths: { ...paths, userHome: '' },
      config: configWith({ defaultInstallPath: '', sharedWinePrefix: '' })
    })
    expect(
      out.some((p) => /Desktop|Documents|Downloads|Applications/.test(p))
    ).toBe(false)
  })

  it('takes nothing from anything but its two inputs', () => {
    const calls: string[] = []
    protectedRootsFor({
      paths,
      config: {
        getSettings: () => {
          calls.push('getSettings')
          return { defaultInstallPath: '/a', sharedWinePrefix: '/b' } as never
        }
      }
    })
    expect(calls).toEqual(['getSettings'])
  })
})
