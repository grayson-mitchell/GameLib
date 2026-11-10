/**
 * A bounded run of a short listing command (`ps`, `lsof`) on the process runner.
 *
 * Sidecar exit contract, half 1 (56-REVIEW WR-02): no handle may hold the event
 * loop past stdin EOF. The runner owns that (it unrefs the child, its pipes and
 * the kill timer), so this is a thin mapper. The promise never rejects: a
 * non-zero exit, a timeout, an overrun buffer or a spawn failure all map to
 * `error: true`. If the loop drains first it simply never settles, which is what
 * a caller racing stdin EOF wants.
 *
 * Kept free of other GameLib imports (types only) so a test can compile it
 * together with the runner and run it in a plain node child to measure the drain.
 */
import type { ProcessRunner } from '../../../../process/types'

interface BoundedListingResult {
  /** True when the child failed, was killed by the bound, or overran maxBuffer. */
  error: boolean
  stdout: string
}

export function createRunBoundedListing(deps: {
  runner: Pick<ProcessRunner, 'run'>
}) {
  return async function runBoundedListing(
    file: string,
    argv: string[],
    options: { timeoutMs: number; maxBuffer: number }
  ): Promise<BoundedListingResult> {
    try {
      const result = await deps.runner.run(file, argv, {
        timeoutMs: options.timeoutMs,
        maxBufferBytes: options.maxBuffer,
        stdin: ''
      })
      const failed = result.code !== 0 || result.timedOut || result.truncated
      return { error: failed, stdout: result.stdout }
    } catch {
      return { error: true, stdout: '' }
    }
  }
}
