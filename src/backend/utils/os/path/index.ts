import { accessSync, constants, statSync } from 'fs'
import { delimiter, isAbsolute, join } from 'path'

/**
 * Pure PATH scan, no child process.
 *
 * `which`/`where` is only a PATH lookup, so it is done in-process: that removes the child (and
 * its missing error listener) and keeps the signature the callers already use. First match only;
 * the old `where.exe` arm could return several lines joined together.
 */

function isExecutableFile(p: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(p).isFile()) return false
    if (platform !== 'win32') accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (env[key] !== undefined) return env[key]
  const found = Object.keys(env).find((k) => k.toLowerCase() === key)
  return found === undefined ? undefined : env[found]
}

/**
 * Finds an executable on %PATH%/$PATH.
 * @returns The full path to the first match, or null if none is executable.
 */
export function findExecutableOnPath(
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd()
): string | null {
  const isWin = platform === 'win32'
  const sep = isWin ? ';' : delimiter

  let names = [executable]
  if (isWin && !/\.[^\\/.]+$/.test(executable)) {
    const exts = (envValue(env, 'pathext') ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter((e) => e !== '')
    names = exts.map((e) => executable + e)
  }

  if (isAbsolute(executable)) {
    return names.find((n) => isExecutableFile(n, platform)) ?? null
  }

  const dirs = (envValue(env, 'path') ?? '').split(sep).filter((d) => d !== '')
  if (isWin) dirs.unshift(cwd)
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (isExecutableFile(candidate, platform)) return candidate
    }
  }
  return null
}

/**
 * Finds an executable on %PATH%/$PATH
 * @param executable The executable to find
 * @returns The full path to the executable, or null if it was not found
 */
async function searchForExecutableOnPath(
  executable: string
): Promise<string | null> {
  return Promise.resolve(findExecutableOnPath(executable))
}

/**
 * Helper function; useful if you just need to know whether an executable
 * exists and don't need its path
 */
const hasExecutable = async (executable: string) =>
  searchForExecutableOnPath(executable).then((res) => res !== null)

export { searchForExecutableOnPath, hasExecutable }
