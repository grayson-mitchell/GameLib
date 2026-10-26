/**
 * Unit tests for resolveDepotPathCollisions
 * (debug/steam-depot-unclassified-generic-error).
 *
 * The defect these pin, measured from live Steam data 2026-09-07: Fallout 2
 * (38410) declares `master.dat` as a size-0/chunks-0 Directory marker in depot
 * 38414 AND as a 333,177,805-byte / 318-chunk file in depot 38415. Both depots
 * are correctly selected (verified against Steam's own ownership/language
 * rules), both write into one installRoot, and whichever won the race decided
 * the install: when the directory won, `mkdir` created `master.dat/` and the
 * file's `open(dest,'w')` failed EISDIR — surfacing as the UNCLASSIFIED
 * "The Steam download failed." over a 56%-complete install.
 *
 * pathCollisions.ts imports only `backend/logger` plus TYPES from '../depot'
 * (erased at compile time), so unlike reconcile.test.ts this needs no
 * transitive depot.ts module-graph mocks.
 */
import {
  pathCollisionKey,
  probeCaseInsensitiveVolume,
  resolveDepotPathCollisions
} from '../depot/pathCollisions'
import type { DepotPlan, DepotPlanFile } from '../depot'
import { logWarning } from 'backend/logger'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

const DIRECTORY_FLAG = 64
const SYMLINK_FLAG = 512

function dirEntry(filename: string): DepotPlanFile {
  return {
    filename,
    size: 0,
    sha_content: '',
    chunks: [],
    flags: DIRECTORY_FLAG
  }
}

function fileEntry(
  filename: string,
  size: number,
  chunkCount = 1
): DepotPlanFile {
  return {
    filename,
    size,
    sha_content: 'deadbeef',
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      sha: `sha-${filename}-${i}`,
      cb_original: 1,
      offset: i
    })),
    flags: 0
  }
}

function plan(
  depots: { depotId: string; files: DepotPlanFile[] }[]
): Pick<DepotPlan, 'appId' | 'depots'> {
  return {
    appId: '38410',
    depots: depots.map((d) => ({
      depotId: d.depotId,
      gid: `gid-${d.depotId}`,
      key: Buffer.from('key'),
      files: d.files
    }))
  }
}

const names = (p: Pick<DepotPlan, 'depots'>, depotIdx: number): string[] =>
  p.depots[depotIdx].files.map((f) => f.filename)

describe('resolveDepotPathCollisions', () => {
  describe('the Fallout 2 shape (T-PC1)', () => {
    it('drops the Directory marker and KEEPS the 333MB file', () => {
      const p = plan([
        { depotId: '38414', files: [dirEntry('master.dat')] },
        { depotId: '38415', files: [fileEntry('master.dat', 333177805, 318)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report.resolved).toEqual(['master.dat'])
      expect(report.unresolved).toEqual([])
      // the directory marker is gone…
      expect(names(p, 0)).toEqual([])
      // …and the real file survives, untouched
      expect(names(p, 1)).toEqual(['master.dat'])
      expect(p.depots[1].files[0].size).toBe(333177805)
      expect(p.depots[1].files[0].chunks).toHaveLength(318)
    })

    it('logs the collision loudly — a silent resolution is how this hid', () => {
      resolveDepotPathCollisions(
        plan([
          { depotId: '38414', files: [dirEntry('master.dat')] },
          { depotId: '38415', files: [fileEntry('master.dat', 333177805, 318)] }
        ])
      )

      const msg = jest
        .mocked(logWarning)
        .mock.calls.map((c) => String(c[0]))
        .find((m) => m.includes('master.dat'))

      expect(msg).toBeDefined()
      expect(msg).toContain('38414')
      expect(msg).toContain('38415')
      expect(msg).toContain('333177805')
      expect(msg).toContain('EISDIR')
    })

    it('does not disturb the other files in either depot', () => {
      const p = plan([
        {
          depotId: '38414',
          files: [
            dirEntry('master.dat'),
            dirEntry('sound'),
            fileEntry('fallout2.exe', 1189888)
          ]
        },
        {
          depotId: '38415',
          files: [
            fileEntry('master.dat', 333177805, 318),
            fileEntry('critter.dat', 166951131, 160)
          ]
        }
      ])

      resolveDepotPathCollisions(p)

      // `sound` is a REAL directory entry in the live manifest and must survive
      expect(names(p, 0)).toEqual(['sound', 'fallout2.exe'])
      expect(names(p, 1)).toEqual(['master.dat', 'critter.dat'])
    })
  })

  describe('the normal case cannot regress (T-PC2)', () => {
    it('changes nothing when no path is claimed twice', () => {
      const p = plan([
        { depotId: 'a', files: [dirEntry('sound'), fileEntry('a.bin', 10)] },
        { depotId: 'b', files: [fileEntry('b.bin', 20)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report).toEqual({
        resolved: [],
        unresolved: [],
        droppedBytes: 0
      })
      expect(names(p, 0)).toEqual(['sound', 'a.bin'])
      expect(names(p, 1)).toEqual(['b.bin'])
      expect(jest.mocked(logWarning)).not.toHaveBeenCalled()
    })

    it('a directory entry in ONE depot with the same name as a directory in another is not a conflict to resolve', () => {
      // Both are bare markers; there is no file to prefer, so nothing is
      // dropped and nothing is claimed to be resolved.
      const p = plan([
        { depotId: 'a', files: [dirEntry('data')] },
        { depotId: 'b', files: [dirEntry('data')] }
      ])

      const report = resolveDepotPathCollisions(p)

      // quick 261026-nhy: one mkdir satisfies every bare marker, so this is not
      // a collision at all -- reporting it UNRESOLVED (and warning per shared
      // directory) was noise. Nothing on disk changes either way.
      expect(report.resolved).toEqual([])
      expect(report.unresolved).toEqual([])
      expect(names(p, 0)).toEqual(['data'])
      expect(names(p, 1)).toEqual(['data'])
      expect(jest.mocked(logWarning)).not.toHaveBeenCalled()
    })
  })

  describe('path comparison matches the write path (T-PC3)', () => {
    it('treats backslash and forward slash as ONE path, like resolveContainedPath', () => {
      const p = plan([
        { depotId: 'a', files: [dirEntry('data\\proto\\items')] },
        { depotId: 'b', files: [fileEntry('data/proto/items', 4096)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report.resolved).toEqual(['data/proto/items'])
      expect(names(p, 0)).toEqual([])
      expect(names(p, 1)).toEqual(['data/proto/items'])
    })

    it('is CASE-SENSITIVE — Linux allows differently-cased siblings, so folding case would invent collisions', () => {
      const p = plan([
        { depotId: 'a', files: [dirEntry('Master.dat')] },
        { depotId: 'b', files: [fileEntry('master.dat', 333177805, 318)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report).toEqual({
        resolved: [],
        unresolved: [],
        droppedBytes: 0
      })
      expect(names(p, 0)).toEqual(['Master.dat'])
    })
  })

  describe('refuses to guess (T-PC4)', () => {
    it('two REAL file entries on one path are reported, and NOTHING is dropped', () => {
      const p = plan([
        { depotId: 'a', files: [fileEntry('shared.dat', 100)] },
        { depotId: 'b', files: [fileEntry('shared.dat', 200)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report.resolved).toEqual([])
      expect(report.unresolved).toEqual(['shared.dat'])
      expect(names(p, 0)).toEqual(['shared.dat'])
      expect(names(p, 1)).toEqual(['shared.dat'])
      expect(
        jest
          .mocked(logWarning)
          .mock.calls.map((c) => String(c[0]))
          .find((m) => m.includes('UNRESOLVED'))
      ).toBeDefined()
    })

    it('a symlink against a file is reported, not silently decided', () => {
      const link: DepotPlanFile = {
        filename: 'link',
        size: 0,
        sha_content: '',
        chunks: [],
        flags: SYMLINK_FLAG,
        linktarget: 'elsewhere'
      }
      const p = plan([
        { depotId: 'a', files: [link] },
        { depotId: 'b', files: [fileEntry('link', 50)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report.unresolved).toEqual(['link'])
      expect(names(p, 0)).toEqual(['link'])
    })

    // A Directory-flagged entry that carries real bytes is NOT a bare marker,
    // and dropping it would discard content.
    //
    // This pair is deliberately shaped to ISOLATE the size/chunks half of the
    // "is this a bare marker" test. An earlier version of this test put the
    // odd entry against a plain FILE, which passed even when the size/chunks
    // conditions were deleted — the odd entry counts as content too, so
    // `content.length === 2` routed it to `unresolved` no matter what. It was
    // green for the wrong reason. Pairing it with a BARE MARKER instead keeps
    // `content.length === 1`, so the marker check is the only thing deciding
    // the outcome — and deleting the size/chunks conditions now fails here.
    const oddDirWithContent = (): DepotPlanFile => ({
      filename: 'odd',
      size: 500,
      sha_content: 'abc',
      chunks: [{ sha: 's', cb_original: 500, offset: 0 }],
      flags: DIRECTORY_FLAG
    })

    it('a Directory-FLAGGED entry that carries real content is never discarded', () => {
      const p = plan([
        { depotId: 'a', files: [oddDirWithContent()] },
        { depotId: 'b', files: [dirEntry('odd')] }
      ])

      const report = resolveDepotPathCollisions(p)

      // the bare marker in depot b loses…
      expect(report.resolved).toEqual(['odd'])
      expect(names(p, 1)).toEqual([])
      // …and the content-carrying entry SURVIVES. If the size/chunks half of
      // isEmptyDirectoryEntry is removed, this entry is dropped too and depot
      // a comes back empty.
      expect(names(p, 0)).toEqual(['odd'])
      expect(p.depots[0].files[0].size).toBe(500)
      expect(p.depots[0].files[0].chunks).toHaveLength(1)
    })

    it('a Directory-flagged entry with content against a real file is ambiguous — nothing dropped', () => {
      const p = plan([
        { depotId: 'a', files: [oddDirWithContent()] },
        { depotId: 'b', files: [fileEntry('odd', 500)] }
      ])

      const report = resolveDepotPathCollisions(p)

      expect(report.resolved).toEqual([])
      expect(report.unresolved).toEqual(['odd'])
      expect(names(p, 0)).toEqual(['odd'])
      expect(names(p, 1)).toEqual(['odd'])
    })

    it('several directory markers against ONE file all lose; against TWO files nothing is dropped', () => {
      const many = plan([
        { depotId: 'a', files: [dirEntry('x')] },
        { depotId: 'b', files: [dirEntry('x')] },
        { depotId: 'c', files: [fileEntry('x', 10)] }
      ])
      expect(resolveDepotPathCollisions(many).resolved).toEqual(['x'])
      expect(names(many, 0)).toEqual([])
      expect(names(many, 1)).toEqual([])
      expect(names(many, 2)).toEqual(['x'])

      const ambiguous = plan([
        { depotId: 'a', files: [dirEntry('y')] },
        { depotId: 'b', files: [fileEntry('y', 10)] },
        { depotId: 'c', files: [fileEntry('y', 20)] }
      ])
      const report = resolveDepotPathCollisions(ambiguous)
      expect(report.resolved).toEqual([])
      expect(report.unresolved).toEqual(['y'])
      expect(names(ambiguous, 0)).toEqual(['y'])
    })
  })

  describe('collisions WITHIN one depot are handled too (T-PC5)', () => {
    it('a directory marker and a file on one path in the SAME depot still resolve', () => {
      const p = plan([
        {
          depotId: 'solo',
          files: [dirEntry('master.dat'), fileEntry('master.dat', 999)]
        }
      ])

      expect(resolveDepotPathCollisions(p).resolved).toEqual(['master.dat'])
      expect(names(p, 0)).toEqual(['master.dat'])
      expect(p.depots[0].files[0].size).toBe(999)
    })
  })
})

function ownedPlan(
  depots: {
    depotId: string
    ownerAppId: string
    appinfoRank?: number
    files: DepotPlanFile[]
  }[]
): Pick<DepotPlan, 'appId' | 'depots'> {
  return {
    appId: '402060',
    depots: depots.map((d) => ({
      depotId: d.depotId,
      gid: `gid-${d.depotId}`,
      key: Buffer.from('key'),
      files: d.files,
      ownerAppId: d.ownerAppId,
      appinfoRank: d.appinfoRank
    }))
  }
}

describe('case-insensitive volumes (quick 261026-nhy)', () => {
  const CI = { caseInsensitive: true }

  it('option unset and false keep the CASE-SENSITIVE behaviour', () => {
    for (const opts of [undefined, { caseInsensitive: false }]) {
      const p = plan([
        { depotId: 'a', files: [dirEntry('Master.dat')] },
        { depotId: 'b', files: [fileEntry('master.dat', 333177805, 318)] }
      ])
      expect(resolveDepotPathCollisions(p, opts)).toEqual({
        resolved: [],
        unresolved: [],
        droppedBytes: 0
      })
      expect(names(p, 0)).toEqual(['Master.dat'])
    }
  })

  it('mirror: folded Master.dat dir vs master.dat file drops the marker', () => {
    const p = plan([
      { depotId: 'a', files: [dirEntry('Master.dat')] },
      { depotId: 'b', files: [fileEntry('master.dat', 333177805, 318)] }
    ])
    const report = resolveDepotPathCollisions(p, CI)
    expect(report.resolved).toHaveLength(1)
    expect(names(p, 0)).toEqual([])
    expect(names(p, 1)).toEqual(['master.dat'])
  })

  it('Californium shape: same-owner folded pair resolved by appinfo rank', () => {
    const mk = () =>
      ownedPlan([
        {
          depotId: '402062',
          ownerAppId: '402060',
          appinfoRank: 0,
          files: [
            fileEntry('californium.app/Contents/Resources/Data/level2', 61884)
          ]
        },
        {
          depotId: '402064',
          ownerAppId: '402060',
          appinfoRank: 1,
          files: [
            fileEntry('Californium.app/Contents/Resources/Data/level2', 61924)
          ]
        }
      ])
    const p = mk()
    const report = resolveDepotPathCollisions(p, CI)
    expect(report.resolved).toHaveLength(1)
    expect(report.droppedBytes).toBe(61884)
    expect(names(p, 0)).toEqual([])
    expect(names(p, 1)).toHaveLength(1)

    const q = mk()
    expect(resolveDepotPathCollisions(q, { caseInsensitive: false })).toEqual({
      resolved: [],
      unresolved: [],
      droppedBytes: 0
    })
    expect(names(q, 0)).toHaveLength(1)
  })

  it('Wasteland 3 shape: cross-owner folded pair stays UNRESOLVED and logs both spellings', () => {
    const p = ownedPlan([
      {
        depotId: '719042',
        ownerAppId: '719040',
        appinfoRank: 0,
        files: [fileEntry('WL3.app/a/24044905.wem', 10355)]
      },
      {
        depotId: '1522651',
        ownerAppId: '1522650',
        appinfoRank: 0,
        files: [fileEntry('wl3.app/a/24044905.wem', 19564)]
      }
    ])
    const report = resolveDepotPathCollisions(p, CI)
    expect(report.unresolved).toHaveLength(1)
    expect(report.droppedBytes).toBe(0)
    expect(names(p, 0)).toHaveLength(1)
    expect(names(p, 1)).toHaveLength(1)
    const msg = jest
      .mocked(logWarning)
      .mock.calls.map((c) => String(c[0]))
      .find((m) => m.includes('UNRESOLVED'))
    expect(msg).toContain('WL3.app/a/24044905.wem')
    expect(msg).toContain('wl3.app/a/24044905.wem')
  })

  it('bare directory markers on one folded or exact path are silent', () => {
    const folded = plan([
      { depotId: 'a', files: [dirEntry('WL3.app')] },
      { depotId: 'b', files: [dirEntry('wl3.app')] }
    ])
    const exact = plan([
      { depotId: 'a', files: [dirEntry('data')] },
      { depotId: 'b', files: [dirEntry('data')] }
    ])
    for (const p of [folded, exact]) {
      for (const opts of [CI, undefined]) {
        const r = resolveDepotPathCollisions(p, opts)
        expect(r.resolved).toEqual([])
        expect(r.unresolved).toEqual([])
      }
    }
    expect(jest.mocked(logWarning)).not.toHaveBeenCalled()
  })

  it('pathCollisionKey normalises separators and folds only on request', () => {
    expect(pathCollisionKey('A\\B.txt', false)).toBe('A/B.txt')
    expect(pathCollisionKey('A\\B.txt', true)).toBe('a/b.txt')
  })
})

describe('probeCaseInsensitiveVolume', () => {
  type StatFn = NonNullable<
    Parameters<typeof probeCaseInsensitiveVolume>[1]
  >['stat']
  const enoent = () => Object.assign(new Error('nope'), { code: 'ENOENT' })
  const make = (
    fn: (p: string) => { dev: number; ino: number } | Error
  ): StatFn =>
    ((p: string) => {
      const r = fn(p)
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    }) as unknown as StatFn

  it('same dev+ino for the swapped spelling -> true', async () => {
    const stat = make(() => ({ dev: 1, ino: 5 }))
    await expect(
      probeCaseInsensitiveVolume('/x/steamapps', { stat, platform: 'linux' })
    ).resolves.toBe(true)
  })

  it('swapped ENOENT -> false', async () => {
    const stat = make((p) =>
      p.endsWith('STEAMAPPS') ? enoent() : { dev: 1, ino: 5 }
    )
    await expect(
      probeCaseInsensitiveVolume('/x/steamapps', { stat, platform: 'darwin' })
    ).resolves.toBe(false)
  })

  it('different ino -> false', async () => {
    const stat = make((p) =>
      p.endsWith('STEAMAPPS') ? { dev: 1, ino: 6 } : { dev: 1, ino: 5 }
    )
    await expect(
      probeCaseInsensitiveVolume('/x/steamapps', { stat, platform: 'darwin' })
    ).resolves.toBe(false)
  })

  it('inconclusive cases fall back to the platform default', async () => {
    const missing = make(() => enoent())
    const denied = make(() => Object.assign(new Error('x'), { code: 'EACCES' }))
    const ok = make(() => ({ dev: 1, ino: 5 }))
    for (const [platform, want] of [
      ['linux', false],
      ['darwin', true],
      ['win32', true]
    ] as const) {
      await expect(
        probeCaseInsensitiveVolume('/x/steamapps', { stat: missing, platform })
      ).resolves.toBe(want)
      await expect(
        probeCaseInsensitiveVolume('/x/steamapps', { stat: denied, platform })
      ).resolves.toBe(want)
      await expect(
        probeCaseInsensitiveVolume('/x/123', { stat: ok, platform })
      ).resolves.toBe(want)
    }
  })
})
