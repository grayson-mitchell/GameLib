/**
 * `getShellPath` must expand environment variables and `~` WITHOUT handing
 * the path to a shell (todo 2026-10-05-getshellpath-runs-remote-save-paths-
 * through-a-shell). Its inputs include GOG cloud-save locations that come from
 * `remote-config.gog.com`, and the `getShellPath` invoke channel exposes it to
 * the renderer, so `$(...)`, backticks, `;`, `&` must come back literally.
 *
 * utils.ts no longer imports child_process (66.2-11), so a shell cannot run
 * at all; these cases pin the literal, JS-side results.
 */
import { homedir } from 'os'
import { normalize } from 'path'
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')

import { getShellPath, testingExportsUtils } from '../utils'

const { expandPathVariables } = testingExportsUtils

describe('getShellPath — no shell, JS-side expansion', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    process.env.GAMELIB_TEST_VAR = '/opt/gamelib-test'
    delete process.env.GAMELIB_TEST_UNSET
  })

  afterAll(() => {
    process.env = savedEnv
  })

  it.each([
    ['/saves/$(touch /tmp/pwned)'],
    ['/saves/`touch /tmp/pwned`'],
    ['/saves/x; touch /tmp/pwned'],
    ['/saves/x && touch /tmp/pwned'],
    ['/saves/x | tee /tmp/pwned']
  ])(
    'returns %p literally and spawns nothing (utils.ts imports no child_process)',
    async (input) => {
      await expect(getShellPath(input)).resolves.toBe(normalize(input))
    }
  )

  it('expands $VAR and ${VAR} from process.env', async () => {
    await expect(getShellPath('$GAMELIB_TEST_VAR/saves')).resolves.toBe(
      '/opt/gamelib-test/saves'
    )
    await expect(getShellPath('${GAMELIB_TEST_VAR}/saves')).resolves.toBe(
      '/opt/gamelib-test/saves'
    )
  })

  it('expands a leading ~ to os.homedir()', async () => {
    await expect(getShellPath('~/Saves')).resolves.toBe(
      normalize(`${homedir()}/Saves`)
    )
    await expect(getShellPath('~')).resolves.toBe(normalize(homedir()))
  })

  it('keeps the existing shape for plain paths', async () => {
    await expect(getShellPath('hello')).resolves.toBe('hello')
    await expect(
      getShellPath('$HOME/Library/Application Support/GOG.com')
    ).resolves.toBe(
      normalize(`${process.env.HOME}/Library/Application Support/GOG.com`)
    )
  })
})

describe('expandPathVariables', () => {
  const env = { HOME: '/home/u', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }

  it('POSIX: unset variables expand to empty, like the shell did', () => {
    expect(expandPathVariables('$NOPE/x', false, env, '/home/u')).toBe('/x')
    expect(expandPathVariables('${NOPE}/x', false, env, '/home/u')).toBe('/x')
  })

  it('POSIX: ~user and mid-path ~ are left alone', () => {
    expect(expandPathVariables('~bob/x', false, env, '/home/u')).toBe('~bob/x')
    expect(expandPathVariables('/a/~/b', false, env, '/home/u')).toBe('/a/~/b')
  })

  it('POSIX: a lone $ or %VAR% is literal', () => {
    expect(expandPathVariables('/a$/b', false, env, '/home/u')).toBe('/a$/b')
    expect(expandPathVariables('%LOCALAPPDATA%/x', false, env, '/h')).toBe(
      '%LOCALAPPDATA%/x'
    )
  })

  it('Windows: expands %VAR% (case-insensitive) and leaves unknown ones literal, like cmd did', () => {
    expect(
      expandPathVariables('%LocalAppData%/GOG.com', true, env, 'C:\\Users\\u')
    ).toBe('C:\\Users\\u\\AppData\\Local/GOG.com')
    expect(expandPathVariables('%NOPE%/x', true, env, 'C:\\Users\\u')).toBe(
      '%NOPE%/x'
    )
    expect(expandPathVariables('$HOME/x', true, env, 'C:\\Users\\u')).toBe(
      '$HOME/x'
    )
  })
})
