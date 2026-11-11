import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createAppContext } from '../context'

describe('createAppContext', () => {
  it('returns exactly platform, paths, clock, runner, log', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    const paths = createTestAppPaths('/t', {
      appRoot: '/a',
      publicDir: '/p',
      userData: '/u',
      appData: '/d',
      exe: '/e',
      knownFolder: () => '/k'
    })
    const appInfo = {
      name: 'GameLib',
      version: '0',
      userAgentFallback: 'ua',
      isPackaged: false
    }
    const ctx = createAppContext({
      platform: 'linux',
      paths,
      appInfo,
      log,
      baseEnv: {}
    })
    expect(Object.keys(ctx).sort()).toEqual([
      'appInfo',
      'clock',
      'log',
      'paths',
      'platform',
      'runner'
    ])
    expect(ctx.platform).toBe('linux')
    expect(ctx.paths).toBe(paths)
    expect(ctx.log).toBe(log)
    expect(typeof ctx.runner.run).toBe('function')
    expect(typeof ctx.clock.now()).toBe('number')
  })

  it('builds a runner that spawns with the given baseEnv', async () => {
    const profile = createFakeHomeProfile()
    const ctx = createAppContext({
      platform: process.platform,
      paths: createTestAppPaths('', {
        appRoot: '',
        publicDir: '',
        userData: '',
        appData: '',
        exe: '',
        knownFolder: () => ''
      }),
      appInfo: {
        name: 'GameLib',
        version: '0',
        userAgentFallback: 'ua',
        isPackaged: false
      },
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      baseEnv: profile.childEnv({ GL_CTX_PROBE: 'yes' })
    })
    const r = await ctx.runner.run(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.GL_CTX_PROBE ?? "")'],
      { env: {} }
    )
    expect(r.stdout).toBe('yes')
    profile.dispose()
  })
})
