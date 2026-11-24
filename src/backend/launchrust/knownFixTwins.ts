/**
 * RED stub (88-13): the twins answer nothing yet, so the vectors test fails on its comparisons.
 */
import type { GameSettings, KnowFixesInfo, Runner } from 'common/types'
import type { LogPrefix } from 'backend/logger'
import type { AppPaths } from 'backend/process/context'

export function readKnownFixes(
  _deps: {
    paths: Pick<AppPaths, 'fixesPath' | 'bundledFixesPath' | 'localFixesPath'>
  },
  _appName: string,
  _runner: Runner
): KnowFixesInfo | null {
  return null
}

export function formatKnownFixEnvLine(
  _entries: Array<{ key: string; value: string; source: string }>
): string | null {
  return null
}

export function logKnownFixEnv(
  _label: string,
  _entries: Array<{ key: string; value: string; source: string }>,
  _logPrefix: LogPrefix
): string | null {
  return null
}

export function withKnownFixEnv(
  gameSettings: GameSettings,
  _env: Record<string, string>
): GameSettings {
  return gameSettings
}
