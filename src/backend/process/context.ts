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
  appData: string
  /** The shell executable; resolved on read (it throws when the shell did not hand it down). */
  exe: string
  knownFolder: (name: 'desktop' | 'documents') => string
}

/** App name, version, user agent and packaged flag (structurally the host/appInfo AppInfo). */
export interface AppInfo {
  name: string
  version: string
  userAgentFallback: string
  isPackaged: boolean
}

export interface AppContext {
  platform: NodeJS.Platform
  paths: AppPaths
  appInfo: AppInfo
  clock: Clock
  runner: ProcessRunner
  log: LogSink
}

export function createAppContext(input: {
  platform: NodeJS.Platform
  paths: AppPaths
  appInfo: AppInfo
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
    appInfo: input.appInfo,
    clock,
    runner,
    log: input.log
  }
}
