import { existsSync, renameSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Waits until `logPath` can be renamed, i.e. no fire-and-forget `appendFile` from a previous
 * case's logger still holds it open.
 *
 * Why (Windows only): the log writer rotates `gamelib.log` to `.old` on its first write. The
 * logger's writes are never awaited by production callers, so a case that boots the sidecar
 * leaves appends in flight; the NEXT case's fresh writer then renames the file while that
 * handle is still open, and win32 refuses the rename with EPERM (POSIX renames an open file
 * without complaint). The EPERM surfaces as an unhandled rejection attributed to whichever
 * case happens to be running, so the red moves between runs. Draining the file between cases
 * removes the overlap without touching the writer.
 */
export async function settleLogFile(
  logPath: string,
  timeoutMs = 3000
): Promise<void> {
  if (process.platform !== 'win32') return
  const probe = `${logPath}.settle-probe`
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (!existsSync(logPath)) return
    try {
      renameSync(logPath, probe)
      renameSync(probe, logPath)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY') throw error
      if (Date.now() >= deadline) throw error
      await sleep(20)
    }
  }
}
