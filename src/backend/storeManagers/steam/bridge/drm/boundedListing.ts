/**
 * A bounded, loop-releasing run of a short listing command (`ps`, `lsof`).
 *
 * Sidecar exit contract, half 1 (56-REVIEW WR-02): no handle may hold the event
 * loop past stdin EOF. `ChildProcess.unref()` alone does not do that for an
 * `execFile` child. Measured with Node v22:
 *
 *   - `execFile(..., { timeout })` plus `child.unref()` still holds the loop
 *     for the child's whole lifetime: the stdout/stderr pipes stay ref'd.
 *   - unref'ing the pipes too still holds it until the child exits, because
 *     execFile's own `timeout` kill timer is ref'd and cannot be reached.
 *   - no `timeout` option, our own unref'd kill timer, and unref on the child
 *     and both pipes: the loop drains at once.
 *
 * So the bound is owned here, not by execFile. The kill timer is unref'd and
 * cleared once the child exits. The promise never rejects; if the loop drains
 * first it simply never settles, which is what a caller racing stdin EOF wants.
 *
 * Kept free of other GameLib imports so a test can compile it alone and run it
 * in a plain node child to measure the drain.
 */
import { execFile } from 'node:child_process'

interface BoundedListingResult {
  /** True when the child failed, was killed by the bound, or overran maxBuffer. */
  error: boolean
  stdout: string
}

export function runBoundedListing(
  file: string,
  argv: string[],
  options: { timeoutMs: number; maxBuffer: number }
): Promise<BoundedListingResult> {
  return new Promise<BoundedListingResult>((resolveOut) => {
    let kill: ReturnType<typeof setTimeout> | undefined = undefined
    const child = execFile(
      file,
      argv,
      { maxBuffer: options.maxBuffer },
      (error, stdout) => {
        if (kill !== undefined) clearTimeout(kill)
        resolveOut({ error: error !== null, stdout: String(stdout ?? '') })
      }
    )
    kill = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }, options.timeoutMs)
    kill.unref?.()
    child.unref?.()
    ;(child.stdout as { unref?: () => void } | null)?.unref?.()
    ;(child.stderr as { unref?: () => void } | null)?.unref?.()
  })
}
