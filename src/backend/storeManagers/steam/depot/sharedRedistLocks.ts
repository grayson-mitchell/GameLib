/**
 * In-process FIFO lock per key (WR-02). Unlike a single-flight join, every waiter runs its OWN
 * closure once the holder releases, so it uses its own `signal` and re-reads
 * the index, instead of inheriting another launch's. Keys: `depot:<cache>|<id>` around a
 * depot's whole script-then-full sequence (its two downloads write the same files), and
 * `index:<cache>` around every index read-modify-write. The depot lock may take the index lock;
 * never the reverse, so they cannot deadlock.
 */
export interface SharedRedistLocks {
  withSharedRedistLock<T>(key: string, fn: () => Promise<T>): Promise<T>
  /** Next temp-file sequence number for the shared cache index writer (unique per instance). */
  nextTmpSeq(): number
}

/**
 * One lock table and temp sequence per boot (the SteamInstallRuntime holds it, D-05, 66.4-09).
 * Construction allocates an empty map and a counter: no I/O, timer or handle.
 */
export function createSharedRedistLocks(): SharedRedistLocks {
  const locks = new Map<string, Promise<void>>()
  let tmpSeq = 0

  async function withSharedRedistLock<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const mine = new Promise<void>((r) => {
      release = r
    })
    const tail = prev.then(() => mine)
    locks.set(key, tail)
    await prev
    try {
      return await fn()
    } finally {
      release()
      if (locks.get(key) === tail) locks.delete(key)
    }
  }

  return { withSharedRedistLock, nextTmpSeq: () => ++tmpSeq }
}
