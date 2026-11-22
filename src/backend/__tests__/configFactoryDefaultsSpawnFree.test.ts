import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createGlobalConfig } from '../config'
import { dirname } from 'path'

// D-66.2-01: the config factory defaults run before any runner exists, so they
// must spawn nothing. The default wine is a PATH scan.
describe('config factory defaults are spawn-free', () => {
  const profile = createFakeHomeProfile()
  afterAll(() => profile.dispose())

  it('getFactoryDefaults makes no runner call', () => {
    const runner = createScriptedRunner([])
    const paths = createTestAppPaths(profile.root)
    const defaults = createGlobalConfig({
      requestRustInvoke: jest.fn(),
      root: createTestStoreRoot(dirname(paths.configPath)),
      paths
    }).getFactoryDefaults()
    expect(defaults).toBeDefined()
    expect(runner.calls.length).toBe(0)
  })
})
