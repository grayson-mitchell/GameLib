/**
 * quick 261105-ord Task 1: the REAL compiled `steam-bridge-helper`
 * `--steam-installapp` subcommand, run under a fake HOME (no steamclient.dylib).
 * This is the isolated arm only: a real-profile run would talk to the operator's
 * live Steam, so that arm is the live gate in the plan SUMMARY.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

// Outside src/'s tsconfig include; same reviewed relative import as
// helperIntegration.test.ts.
import { buildHelperCompileArgv } from '../../../../../meta/buildSteamBridgeShims'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const describeDarwinOnly =
  process.platform === 'darwin' ? describe : describe.skip

describeDarwinOnly(
  'steam-bridge-helper --steam-installapp (real compiled helper -- darwin only, skipped elsewhere: Mach-O clang compile)',
  () => {
    let profile: FakeHomeProfile
    let helper: string

    beforeAll(() => {
      profile = createFakeHomeProfile({
        prefix: 'gamelib-installapp-home-'
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
      return JSON.parse(lines[0]) as Record<string, unknown>
    }

    it('reports steamclient-missing under a fresh HOME, one line, exit 2, no AUTH', () => {
      const res = run('--steam-installapp', '440', '--library', '/tmp/x')
      expect(res.status).toBe(2)
      expect(oneLine(res.stdout)).toEqual({
        result: 'unavailable',
        reason: 'steamclient-missing'
      })
      expect(res.stderr).not.toMatch(/^AUTH/m)
    })

    it('accepts --dry-run and behaves the same without Steam', () => {
      const res = run('--steam-installapp', '440', '--dry-run')
      expect(res.status).toBe(2)
      expect(oneLine(res.stdout)).toEqual({
        result: 'unavailable',
        reason: 'steamclient-missing'
      })
    })

    it.each([
      ['non-numeric appId', ['--steam-installapp', 'abc']],
      ['missing appId', ['--steam-installapp']],
      ['appId over 10 digits', ['--steam-installapp', '12345678901']],
      [
        'relative library',
        ['--steam-installapp', '440', '--library', 'relative/path']
      ],
      [
        'library with .. segment',
        ['--steam-installapp', '440', '--library', '/a/../b']
      ],
      [
        'library ending in ..',
        ['--steam-installapp', '440', '--library', '/a/..']
      ]
    ])('rejects %s with a usage line and exit 64', (_name, args) => {
      const res = run(...args)
      expect(res.status).toBe(64)
      expect(oneLine(res.stdout).result).toBe('usage')
    })
  }
)
