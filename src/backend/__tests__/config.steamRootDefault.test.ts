import { join } from 'path'
import { steamRootDefault } from '../config'

const home = '/home/u'

describe('steamRootDefault', () => {
  it('uses the shell-discovered root', () => {
    expect(
      steamRootDefault(
        home,
        {
          GAMELIB_STEAM_ROOT_DEFAULT: '  /x/Steam '
        },
        'linux'
      )
    ).toBe('/x/Steam')
  })

  it.each([undefined, '', '   '])('falls back per OS when env is %p', (v) => {
    const env = {
      GAMELIB_STEAM_ROOT_DEFAULT: v,
      'PROGRAMFILES(X86)': 'C:\\PF'
    } as NodeJS.ProcessEnv
    expect(steamRootDefault(home, env, 'darwin')).toBe(
      join(home, 'Library/Application Support/Steam')
    )
    expect(steamRootDefault(home, env, 'linux')).toBe(
      join(home, '.steam/steam')
    )
    expect(steamRootDefault(home, env, 'win32')).toBe(join('C:\\PF', 'Steam'))
  })
})
