/**
 * Unit tests for summarizeDepotFlags (Phase 23, 23-06 — G-23-02 trace
 * instrumentation). Pure function over a DepotPlan: no filesystem, no
 * network, no mocks needed.
 */
import {
  summarizeDepotFlags,
  formatDepotFlagsCensus
} from '../depot/flagsCensus'
import type { DepotPlan, DepotPlanFile } from '../depot'

function makeFile(overrides: Partial<DepotPlanFile> = {}): DepotPlanFile {
  return {
    filename: 'placeholder-not-logged.bin',
    size: 1,
    sha_content: 'sha',
    chunks: [{ sha: 'c', cb_original: 1, offset: 0 }],
    ...overrides
  }
}

function makePlan(depots: DepotPlan['depots']): DepotPlan {
  return {
    appId: '12345',
    depots,
    totalBytes: 0,
    name: 'SomeGame',
    skippedDepots: []
  }
}

describe('summarizeDepotFlags', () => {
  it('H1 signature: a plan whose every file has flags: undefined reports flagBearing: 0, executableFlagged: 0, distinctFlagValues: [], with totalFiles > 0', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [
          makeFile({ filename: 'a.bin', flags: undefined }),
          makeFile({ filename: 'b.bin', flags: undefined }),
          makeFile({ filename: 'c.bin', flags: undefined })
        ]
      }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.totalFiles).toBeGreaterThan(0)
    expect(census.totalFiles).toBe(3)
    expect(census.flagBearing).toBe(0)
    expect(census.executableFlagged).toBe(0)
    expect(census.distinctFlagValues).toEqual([])
  })

  it('a mixed-flags plan reports correct per-bit counts and ascending distinct values', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [
          makeFile({ filename: 'exec.bin', flags: 32 }), // Executable
          makeFile({ filename: 'custom-exec.bin', flags: 128 }), // CustomExecutable
          makeFile({ filename: 'readonly.cfg', flags: 8 }), // ReadOnly
          makeFile({ filename: 'dir-entry', flags: 64 }), // Directory
          makeFile({ filename: 'a-symlink', flags: 512 }), // Symlink
          makeFile({ filename: 'plain.txt', flags: undefined })
        ]
      }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.totalFiles).toBe(6)
    // flagBearing = every entry with a truthy flags value (5 of the 6).
    expect(census.flagBearing).toBe(5)
    // executableFlagged = flags & (32 | 128) -> the 32 and 128 entries.
    expect(census.executableFlagged).toBe(2)
    expect(census.readonlyFlagged).toBe(1)
    expect(census.hiddenFlagged).toBe(0)
    expect(census.directoryEntries).toBe(1)
    expect(census.symlinkEntries).toBe(1)
    expect(census.distinctFlagValues).toEqual([8, 32, 64, 128, 512])
  })

  it('flags: 0 counts as NOT flag-bearing — mirrors the production `if (file.flags)` truthiness guard exactly (depot.ts:1195)', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [makeFile({ filename: 'zero-flags.bin', flags: 0 })]
      }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.flagBearing).toBe(0)
    expect(census.executableFlagged).toBe(0)
    expect(census.distinctFlagValues).toEqual([])
  })

  it('computes the census across ALL depots, not just the first', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [makeFile({ filename: 'depot1-exec.bin', flags: 32 })]
      },
      {
        depotId: '2',
        gid: 'g2',
        key: Buffer.from('key'),
        files: [
          makeFile({ filename: 'depot2-readonly.bin', flags: 8 }),
          makeFile({ filename: 'depot2-plain.bin', flags: undefined })
        ]
      }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.totalFiles).toBe(3)
    expect(census.flagBearing).toBe(2)
    expect(census.executableFlagged).toBe(1)
    expect(census.readonlyFlagged).toBe(1)
    expect(census.distinctFlagValues).toEqual([8, 32])
  })

  it('caps distinctFlagValues so a huge, highly-varied manifest cannot blow up log size (T-23-17)', () => {
    // 40 files each carrying a distinct flags value combining Executable(32)
    // with a unique high bit, well above the internal cap.
    const files = Array.from({ length: 40 }, (_, i) =>
      makeFile({ filename: `f${i}.bin`, flags: 32 | (1 << (i + 10)) })
    )
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.totalFiles).toBe(40)
    expect(census.flagBearing).toBe(40)
    expect(census.distinctFlagValues.length).toBeLessThan(40)
    // Still ascending even though capped.
    const sorted = [...census.distinctFlagValues].sort((a, b) => a - b)
    expect(census.distinctFlagValues).toEqual(sorted)
  })

  it('counts a file with no chunks or size 0 as a zeroSizeEntries hit, regardless of flags', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [
          makeFile({ filename: 'empty.txt', size: 0, chunks: [] }),
          makeFile({ filename: 'dir', size: 0, chunks: [], flags: 64 })
        ]
      }
    ])

    const census = summarizeDepotFlags(plan)

    expect(census.zeroSizeEntries).toBe(2)
  })
})

describe('formatDepotFlagsCensus', () => {
  it('never leaks per-file data — only aggregate counts and the capped distinct-values list (T-23-16)', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [
          makeFile({ filename: 'super-secret-user-path/game.bin', flags: 32 })
        ]
      }
    ])

    const line = formatDepotFlagsCensus(summarizeDepotFlags(plan))

    expect(line).not.toContain('super-secret-user-path')
    expect(line).not.toContain('game.bin')
    expect(line).toMatch(/totalFiles=1/)
    expect(line).toMatch(/executableFlagged=1/)
  })

  it('folds extra run-scoped counters (e.g. chmodAttempts) into the same line', () => {
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [makeFile({ filename: 'a.bin', flags: 32 })]
      }
    ])

    const line = formatDepotFlagsCensus(summarizeDepotFlags(plan), {
      chmodAttempts: 1,
      modeCallsites: 1,
      jobCount: 1,
      reconciledSkipped: 0
    })

    expect(line).toMatch(/chmodAttempts=1/)
    expect(line).toMatch(/modeCallsites=1/)
    expect(line).toMatch(/jobCount=1/)
    expect(line).toMatch(/reconciledSkipped=0/)
  })
})
