// ── D-C serialisation: a module-local promise-chain mutex ───────────────────
//
// Serialises the Rust Refresh's capture sections (a read-modify-write against
// the metadata store must not interleave with another run of itself; 34.15
// D-16 UAT finding F-2).
export interface PlatformCaptureQueue {
  /**
   * Runs `section` after every previously-queued section has settled, REGARDLESS of that prior
   * section's outcome (resolved or rejected). The chain is re-pointed at a swallowed-outcome
   * continuation BEFORE this call returns, so a rejected section can never poison the chain for
   * every later caller; the caller of THIS call still observes the real (un-swallowed) rejection
   * via the returned promise (T-qcn-02).
   */
  withPlatformCaptureLock: <T>(section: () => Promise<T>) => Promise<T>
}

/** The per-boot capture chain (D-05, 66.4-06); construction only holds a resolved promise. */
export function createPlatformCaptureQueue(): PlatformCaptureQueue {
  let chain: Promise<unknown> = Promise.resolve()
  return {
    withPlatformCaptureLock: async <T>(section: () => Promise<T>) => {
      const run = chain.then(section, section)
      chain = run.then(
        () => undefined,
        () => undefined
      )
      return run
    }
  }
}
