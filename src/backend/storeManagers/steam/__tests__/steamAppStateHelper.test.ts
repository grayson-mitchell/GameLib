/**
 * Phase 81 Plan 04 Task 1: the REAL compiled `steam-bridge-helper`
 * `--steam-appstate` subcommand, run under a fake HOME (no steamclient.dylib).
 * This is the isolated arm of the two-profile rule. The real-profile arm is
 * the 81-20 live gate, which runs the bundled helper against the operator's
 * live Steam (BLoggedOn and GetAppInstallState only arm under a real client).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

// Outside src/'s tsconfig include; same reviewed relative import as
// steamInstallAppHelper.test.ts.
import { buildHelperCompileArgv } from '../../../../../meta/buildSteamBridgeShims'
import { at } from './fixtures/indexed'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const describeDarwinOnly =
  process.platform === 'darwin' ? describe : describe.skip

describeDarwinOnly(
  'steam-bridge-helper --steam-appstate (real compiled helper -- darwin only, skipped elsewhere: Mach-O clang compile)',
  () => {
    let profile: FakeHomeProfile
    let helper: string

    beforeAll(() => {
      profile = createFakeHomeProfile({
        prefix: 'gamelib-appstate-home-'
      })
      const buildDir = mkdtempSync(join(profile.root, 'helper-build-'))
      helper = join(buildDir, 'steam-bridge-helper')
      const { command, args } = buildHelperCompileArgv()
      const customArgs = [...args]
      customArgs[customArgs.indexOf('-o') + 1] = helper
      execFileSync(command, customArgs, {
        cwd: REPO_ROOT,
        env: profile.childEnv(),
        stdio: 'pipe'
      })
      chmodSync(helper, 0o755)
    }, 60000)

    afterAll(() => {
      profile.dispose()
    })

    const run = (...args: string[]) => {
      const res = spawnSync(helper, args, {
        env: profile.childEnv(),
        encoding: 'utf8',
        timeout: 30000
      })
      return {
        status: res.status,
        stdout: res.stdout,
        stderr: res.stderr
      }
    }

    const oneLine = (stdout: string) => {
      const lines = stdout.split('\n').filter(Boolean)
      expect(lines).toHaveLength(1)
      return JSON.parse(at(lines, 0)) as Record<string, unknown>
    }

    it('reports steamclient-missing under a fresh HOME, one line, exit 2, no AUTH', () => {
      const res = run('--steam-appstate', '440')
      expect(res.status).toBe(2)
      expect(oneLine(res.stdout)).toEqual({
        result: 'unavailable',
        reason: 'steamclient-missing'
      })
      expect(res.stderr).not.toMatch(/^AUTH/m)
    })

    it.each([
      ['non-numeric appId', ['--steam-appstate', 'abc'], 'bad-appid'],
      ['missing appId', ['--steam-appstate'], 'missing-appid'],
      [
        'appId over 10 digits',
        ['--steam-appstate', '12345678901'],
        'bad-appid'
      ],
      ['a zero appId', ['--steam-appstate', '0'], 'bad-appid'],
      [
        'an extra argument',
        ['--steam-appstate', '440', '--dry-run'],
        'unknown-argument'
      ],
      [
        'a --library argument',
        ['--steam-appstate', '440', '--library', '/x'],
        'unknown-argument'
      ]
    ])('rejects %s with a usage line and exit 64', (_name, args, error) => {
      const res = run(...args)
      expect(res.status).toBe(64)
      expect(oneLine(res.stdout)).toEqual({ result: 'usage', error })
    })
  }
)
