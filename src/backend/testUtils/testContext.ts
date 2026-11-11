/**
 * D-01: createTestContext builds every AppContext field from fakes (scripted
 * runner, fake clock, capture log, paths under a fake HOME) and returns the
 * fakes alongside the context. A test builds only the slice it needs from them.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, AppInfo, AppPaths } from '../process/context'
import type { ProcessRunner } from '../process/types'
import { createCaptureLog, type CaptureLog } from './captureLog'
import { createFakeClock, type FakeClock } from './fakeClock'
import { createFakeHomeProfile, type FakeHomeProfile } from './fakeHomeProfile'
import {
  createScriptedRunner,
  type ScriptedRunner,
  type ScriptStep
} from './scriptedRunner'

const TEST_APP_INFO: AppInfo = {
  name: 'GameLib',
  version: '0.0.0-test',
  userAgentFallback: 'test-ua',
  isPackaged: false
}

export interface TestContext<R extends ProcessRunner = ScriptedRunner> {
  ctx: AppContext
  runner: R
  clock: FakeClock
  log: CaptureLog
  profile: FakeHomeProfile
  dispose(): void
}

export function createTestContext<R extends ProcessRunner = ScriptedRunner>(
  overrides: {
    script?: readonly ScriptStep[]
    platform?: NodeJS.Platform
    paths?: Partial<AppPaths>
    runner?: R
  } = {}
): TestContext<R> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-test-context-' })
  const appRoot = join(profile.root, 'app')
  const defaults: AppPaths = {
    appRoot,
    publicDir: join(appRoot, 'public'),
    userData: join(profile.root, 'userData'),
    appData: join(profile.root, 'appData'),
    exe: join(profile.root, 'GameLib'),
    knownFolder: (name) =>
      join(profile.root, name === 'desktop' ? 'Desktop' : 'Documents')
  }
  // Create directories only for defaults that were not overridden. A caller
  // may pass real repo paths for read-only use (e.g. the sidecar harness's
  // publicDir); creating directories there, or a real userData, would break
  // fake-HOME isolation.
  for (const key of ['appRoot', 'publicDir', 'userData', 'appData'] as const) {
    if (overrides.paths?.[key] === undefined) {
      mkdirSync(defaults[key], { recursive: true })
    }
  }
  const paths: AppPaths = { ...defaults, ...overrides.paths }
  const runner = (overrides.runner ??
    createScriptedRunner(overrides.script ?? [])) as R
  const clock = createFakeClock()
  const log = createCaptureLog()
  const platform = overrides.platform ?? process.platform
  return {
    ctx: { platform, paths, appInfo: TEST_APP_INFO, clock, runner, log },
    runner,
    clock,
    log,
    profile,
    dispose: () => profile.dispose()
  }
}
