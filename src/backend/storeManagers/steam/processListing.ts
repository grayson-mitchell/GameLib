/**
 * The `ps` / `pgrep` process listing and line parser the bottle process monitor reads. Phase 61 lifted it into the
 * engine for the non-Steam first-match watcher; that watcher is Rust's now (87-56 deleted `gameProcessWatch.ts`), so
 * the monitor is its only caller and it lives beside it again. Nothing runs at import.
 */
import type { SpawnAsync } from 'backend/spawnAsync'

/**
 * Parse one `ps -axo pid=,command=` line into its pid and command, or
 * `null` if the line does not match the expected shape. Windows command
 * lines contain spaces, so everything after the pid is taken as-is — never
 * split further on whitespace.
 */
export function parsePsLine(
  line: string
): { pid: string; command: string } | null {
  const match = /^\s*(\d+)\s(.*)$/.exec(line)
  if (!match) return null
  const pid = match[1]
  const rawCommand = match[2]
  if (pid === undefined || rawCommand === undefined) return null
  let command = rawCommand.trim()
  if (command.startsWith('"')) {
    command = command.slice(1)
  }
  return { pid, command }
}

/**
 * Phase 59 UAT (G4): `ps` is setuid root, and a sandboxed process cannot exec
 * a setuid binary (`spawn EPERM`, seen under the UAT sandbox profiles).
 * `pgrep -lf .` is not setuid and prints the same `pid command` lines, so it
 * stands in when `ps` cannot spawn. The `ps` error is rethrown if both fail.
 */
export async function processListing(deps: {
  spawnAsync: SpawnAsync
}): Promise<string> {
  const { spawnAsync } = deps
  try {
    return (await spawnAsync('ps', ['-axo', 'pid=,command='])).stdout
  } catch (psError) {
    try {
      return (await spawnAsync('pgrep', ['-lf', '.'])).stdout
    } catch {
      throw psError
    }
  }
}
