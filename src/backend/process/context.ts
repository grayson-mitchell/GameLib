/**
 * AppContext (Phase 66 D-01): the explicitly built bundle of process-wide
 * collaborators. It is a TYPE plus a factory; there is no getContext() locator
 * and no module state.
 *
 * Per D-01 no module receives the whole AppContext. Each consumer declares a
 * narrow interface whose members are typed from AppContext fields (for example
 * `runner: AppContext['runner']`). Phase 66.1 adds stores and manager maps.
 *
 * Import budget: ./ files only.
 */
import { createClock } from './clock'
import { createProcessRunner } from './runner'
import type { Clock, LogSink, ProcessRunner } from './types'

export interface AppPaths {
  appRoot: string
  publicDir: string
  userData: string
}

export interface AppContext {
  platform: NodeJS.Platform
  paths: AppPaths
  clock: Clock
  runner: ProcessRunner
  log: LogSink
}

export function createAppContext(input: {
  platform: NodeJS.Platform
  paths: AppPaths
  log: LogSink
  baseEnv: NodeJS.ProcessEnv
}): AppContext {
  const clock = createClock()
  const runner = createProcessRunner({
    clock,
    log: input.log,
    platform: input.platform,
    baseEnv: input.baseEnv,
    pinnedEnv: null,
    openerPath: '/usr/bin/open'
  })
  return {
    platform: input.platform,
    paths: input.paths,
    clock,
    runner,
    log: input.log
  }
}
