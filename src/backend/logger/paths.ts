import { homedir } from 'os'
import { join } from 'path'

import { isMac, isWindows } from '../constants/environment'

import type { GetLogFileArgs } from 'common/types/ipc/logger'

/**
 * Returns the base directory to store all logs
 */
function getBaseLogPath(): string {
  if (isWindows) {
    const localAppData =
      process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'GameLib', 'logs')
  }
  if (isMac) {
    return join(homedir(), 'Library', 'Logs', 'GameLib')
  }
  const stateHome =
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(stateHome, 'GameLib', 'logs')
}

/**
 * Returns the path to the log file of a game / runner / Heroic
 * @param args Parameters to find the log file. See {@link GetLogFileArgs}
 */
function getLogFilePath(args: GetLogFileArgs): string {
  let relativeFilePath: string
  if (!(args?.appName || args?.runner)) {
    relativeFilePath = 'gamelib'
  } else if (args.runner && !args.appName) {
    relativeFilePath = join('runners', args.runner)
  } else {
    const { appName, runner, type = 'launch' } = args
    relativeFilePath = join('games', `${appName}_${runner}`, type)
  }

  return join(getBaseLogPath(), relativeFilePath + '.log')
}

export { getLogFilePath }
