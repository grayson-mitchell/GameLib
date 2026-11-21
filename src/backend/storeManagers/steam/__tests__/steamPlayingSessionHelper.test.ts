/**
 * Debug bridged-launch-kicks-other-session: the REAL compiled `steam-bridge-helper`
 * `--steam-playing-session` subcommand, run under a fake HOME (no steamclient.dylib). This is the
 * isolated arm of the two-profile rule. The real-profile arm is the live gate, which runs the
 * bundled helper against the operator's live Steam while another device plays (BLoggedOn and
 * BIsOtherSessionPlaying only arm under a real, signed-in client).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

// Outside src/'s tsconfig include; same reviewed relative import as steamAppStateHelper.test.ts.
import { buildHelperCompileArgv } from '../../../../../meta/buildSteamBridgeShims'
import { at } from './fixtures/indexed'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const describeDarwinOnly =
  process.platform === 'darwin' ? describe : describe.skip

describeDarwinOnly(
  'steam-bridge-helper --steam-playing-session (real compiled helper -- darwin only, skipped elsewhere: Mach-O clang compile)',
  () => {
    let profile: FakeHomeProfile
    let helper: string

    beforeAll(() => {
      profile = createFakeHomeProfile({
        prefix: 'gamelib-playingsession-home-'
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

    it('reports steamclient-missing under a fresh HOME, one line, exit 2, no AUTH, nothing registered', () => {
      const res = run('--steam-playing-session')
      expect(res.status).toBe(2)
      expect(oneLine(res.stdout)).toEqual({
        result: 'unavailable',
        reason: 'steamclient-missing'
      })
      // It is a one-shot subcommand: never the bridge server (no LISTEN, INIT or READY lines).
      expect(res.stderr).not.toMatch(/^(AUTH|LISTEN|INIT|READY)/m)
    })

    it.each([
      ['an extra argument', ['--steam-playing-session', '440']],
      ['a flag', ['--steam-playing-session', '--dry-run']]
    ])('rejects %s with a usage line and exit 64', (_name, args) => {
      const res = run(...args)
      expect(res.status).toBe(64)
      expect(oneLine(res.stdout)).toEqual({
        result: 'usage',
        error: 'unknown-argument'
      })
    })
  }
)
