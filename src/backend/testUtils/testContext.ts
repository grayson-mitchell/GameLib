/**
 * D-01: createTestContext builds every AppContext field from fakes (scripted
 * runner, fake clock, capture log, paths under a fake HOME) and returns the
 * fakes alongside the context. A test builds only the slice it needs from them.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, AppPaths } from '../process/context'
import type { ProcessRunner } from '../process/types'
import { createCaptureLog, type CaptureLog } from './captureLog'
import { createFakeClock, type FakeClock } from './fakeClock'
import { createFakeHomeProfile, type FakeHomeProfile } from './fakeHomeProfile'
import {
  createScriptedRunner,
  type ScriptedRunner,
  type ScriptStep
} from './scriptedRunner'

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
    userData: join(profile.root, 'userData')
  }
  // Create directories only for defaults that were not overridden. A caller
  // may pass real repo paths for read-only use (e.g. the sidecar harness's
  // publicDir); creating directories there, or a real userData, would break
  // fake-HOME isolation.
  for (const key of Object.keys(defaults) as (keyof AppPaths)[]) {
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
    ctx: { platform, paths, clock, runner, log },
    runner,
    clock,
    log,
    profile,
    dispose: () => profile.dispose()
  }
}
