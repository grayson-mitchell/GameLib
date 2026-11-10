import { split } from 'shlex'

import type { GameSettings } from 'common/types'
import type { ProcessRunner } from './process/types'

export interface GameScopeCommandInput {
  bin: string
  settings: NonNullable<GameSettings['gamescope']>
  /** stderr of `gamescope --help`; decides the old (< 3.12) vs new CLI */
  helpStderr: string
  showMangohud?: boolean
}

/**
 * Pure flag mapping for gamescope. Gamescope has no version option and
 * changed its CLI in 3.12, so (like lutris) the `--help` text decides.
 */
export function buildGameScopeCommand({
  bin,
  settings,
  helpStderr,
  showMangohud
}: GameScopeCommandInput): string[] {
  const oldVersion = !(helpStderr && helpStderr.includes('-F, --filter'))
  const cmd: string[] = [bin]

  if (settings.enableUpscaling) {
    // game res
    if (settings.gameWidth) cmd.push('-w', settings.gameWidth)
    if (settings.gameHeight) cmd.push('-h', settings.gameHeight)

    // gamescope res
    if (settings.upscaleWidth) cmd.push('-W', settings.upscaleWidth)
    if (settings.upscaleHeight) cmd.push('-H', settings.upscaleHeight)

    // upscale method
    if (settings.upscaleMethod === 'fsr') {
      if (oldVersion) cmd.push('-U')
      else cmd.push('-F', 'fsr')
    }
    if (settings.upscaleMethod === 'nis') {
      if (oldVersion) cmd.push('-Y')
      else cmd.push('-F', 'nis')
    }
    if (settings.upscaleMethod === 'integer') {
      if (oldVersion) cmd.push('-i')
      else cmd.push('-S', 'integer')
    }
    // didn't find stretch in old version
    if (settings.upscaleMethod === 'stretch' && !oldVersion) {
      cmd.push('-S', 'stretch')
    }

    // window type
    if (settings.windowType === 'fullscreen') cmd.push('-f')
    if (settings.windowType === 'borderless') cmd.push('-b')
  }

  if (settings.enableLimiter) {
    if (settings.fpsLimiter) cmd.push('-r', settings.fpsLimiter)
    if (settings.fpsLimiterNoFocus) cmd.push('-o', settings.fpsLimiterNoFocus)
  }

  if (settings.enableForceGrabCursor) cmd.push('--force-grab-cursor')

  if (showMangohud) cmd.push('--mangoapp')

  cmd.push(...split(settings.additionalOptions ?? ''))

  // Note: needs to be the last option
  cmd.push('--')
  return cmd
}

/**
 * The `gamescope --help` text that decides the CLI generation. A timeout (5 s) or a spawn error
 * degrades to '' (the old-CLI flag set) rather than failing the launch.
 */
export async function probeGamescopeHelp(
  runner: Pick<ProcessRunner, 'run'>,
  bin: string
): Promise<string> {
  try {
    const result = await runner.run(bin, ['--help'], { timeoutMs: 5_000 })
    return result.timedOut ? '' : result.stderr
  } catch {
    return ''
  }
}
