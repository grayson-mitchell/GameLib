import type { GameSettings } from 'common/types'
import { logInfo, LogPrefix } from 'backend/logger'
import type LogWriter from 'backend/logger/targetWriter'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  getLaunchSettings,
  selectEngineForLaunch,
  type SelectEngineRequest
} from 'backend/enginewine/launch'

/**
 * What the launcher and the GOG and Amazon setup do with the Rust engine step's answer (Phase 87, 87-52, D-01).
 *
 * `skip` means the engine layer does not apply and the launch runs exactly as before; `legacy` is a Wine outside the
 * option list (same); `refused` means nothing may start (Rust has shown the dialog); `use` carries the key the caller
 * releases with `endEngineLaunch` and the settings the launch runs with. Nothing here decides anything: the step is
 * Rust's, this only narrows its reply and writes the lines the step produced.
 */
export type LaunchEngineStep =
  | { kind: 'skip' }
  | { kind: 'legacy'; key: string }
  | { kind: 'refused'; key: string }
  | { kind: 'use'; key: string; launchSettings: GameSettings }

interface Reply {
  kind?: unknown
  key?: unknown
  logLines?: unknown
  launchSettings?: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Narrows the `engine_launch_select` answer. A shape the crate never produces is an error, not a skipped step: a
 * launch that guessed would run on an engine nobody chose.
 */
function parseLaunchEngineStep(reply: unknown): {
  step: LaunchEngineStep
  logLines: string[]
} {
  const r: Reply = isObject(reply) ? reply : {}
  const logLines = Array.isArray(r.logLines)
    ? r.logLines.filter((line): line is string => typeof line === 'string')
    : []
  if (r.kind === 'skip') return { step: { kind: 'skip' }, logLines }
  if (typeof r.key !== 'string') {
    throw new Error('engine_launch_select: the answer has no engine key')
  }
  if (r.kind === 'legacy') {
    return { step: { kind: 'legacy', key: r.key }, logLines }
  }
  if (r.kind === 'refused') {
    return { step: { kind: 'refused', key: r.key }, logLines }
  }
  if (r.kind === 'use' && isObject(r.launchSettings)) {
    return {
      step: {
        kind: 'use',
        key: r.key,
        launchSettings: r.launchSettings as unknown as GameSettings
      },
      logLines
    }
  }
  throw new Error('engine_launch_select: unexpected answer')
}

/**
 * The engine step of one launch: the Rust call, then each line it produced into the gamelib log (`Engine: <key>
 * <line>`) and the caller's game launch log when it has one (the setup runs have none).
 */
export async function runLaunchEngineStep(
  deps: RustInvokeDeps,
  request: SelectEngineRequest,
  logWriter?: LogWriter
): Promise<LaunchEngineStep> {
  const { step, logLines } = parseLaunchEngineStep(
    await selectEngineForLaunch(deps, request)
  )
  if (step.kind !== 'skip') {
    for (const line of logLines) {
      logInfo(`Engine: ${step.key} ${line}`, LogPrefix.Backend)
      void logWriter?.logInfo(line)
    }
  }
  return step
}

/**
 * The settings a launch runs with, from Rust's registry: `stored` with the running launch's engine overlaid, or `stored`
 * itself when `key` is `null` or holds no selection. The reply is checked to be an object, because every caller reads
 * keys from it.
 */
export async function launchSettingsFor(
  deps: RustInvokeDeps,
  key: string | null,
  stored: GameSettings
): Promise<GameSettings> {
  const reply = await getLaunchSettings(deps, key, stored)
  if (!isObject(reply)) {
    throw new Error('engine_launch_settings_get: the answer is not an object')
  }
  return reply as unknown as GameSettings
}
