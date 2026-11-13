import { join } from 'path'
import { steamRootDefault } from '../config'

const home = '/home/u'

describe('steamRootDefault', () => {
  it('uses the shell-discovered root under the rust flag', () => {
    expect(
      steamRootDefault(
        home,
        {
          GAMELIB_STEAMFILES_TEXT: 'rust',
          GAMELIB_STEAM_ROOT_DEFAULT: '  /x/Steam '
        },
        'linux'
      )
    ).toBe('/x/Steam')
  })

  it.each([undefined, '', '   '])(
    'falls back per OS when env is %p under rust',
    (v) => {
      const env = {
        GAMELIB_STEAMFILES_TEXT: 'rust',
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
    }
  )

  it('ignores the env var under the ts flag', () => {
    const out = steamRootDefault(
      home,
      {
        GAMELIB_STEAMFILES_TEXT: 'ts',
        GAMELIB_STEAM_ROOT_DEFAULT: '/x/Steam'
      },
      'linux'
    )
    expect(out).not.toBe('/x/Steam')
  })
})
