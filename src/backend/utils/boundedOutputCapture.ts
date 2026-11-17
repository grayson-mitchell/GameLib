/**
 * A bounded, store-neutral capture of runner output. Extracted from `signInProbe/classify` (quick
 * 261117-pfj) so a store manager (legendary's launch-failure capture) can use it without importing
 * the sign-in probe module.
 */

/** Default upper bound on captured runner output, in characters. */
export const DEFAULT_OUTPUT_CAPTURE_LIMIT = 64_000

export interface BoundedOutputCapture {
  /** Feed one raw chunk (stdout or stderr) from `CallRunnerOptions.onOutput`. */
  onOutput(chunk: string): void
  text(): string
  /** True once at least one chunk has arrived, false for a joined spawn. */
  observed(): boolean
}

export function createBoundedOutputCapture(
  cap: number = DEFAULT_OUTPUT_CAPTURE_LIMIT
): BoundedOutputCapture {
  let held = ''
  let seen = false
  return {
    onOutput(chunk: string) {
      seen = true
      const room = cap - held.length
      if (room <= 0) {
        return
      }
      held += chunk.length > room ? chunk.slice(0, room) : chunk
    },
    text: () => held,
    observed: () => seen
  }
}
