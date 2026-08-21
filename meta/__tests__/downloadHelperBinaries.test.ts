/**
 * First-ever test coverage for meta/downloadHelperBinaries.ts
 * (Phase 34.9 Plan 06). This module was never previously imported under
 * Jest -- every prior meta/ test that referenced it (e.g.
 * meta/__tests__/buildRunnersOnedir.test.ts) read it as TEXT via
 * readFileSync, specifically because importing it would have executed its
 * trailing `void main()` and started a real network download. Plan 06's
 * own entrypoint guard (`if (!process.env.JEST_WORKER_ID)`) is what makes a
 * real import possible here for the first time.
 *
 * `child_process`'s spawn, `fs/promises`' write surface, and global `fetch`
 * are mocked at the module boundary -- no test in this file touches the
 * network or writes under public/bin. The digest/sentinel/traversal/chmod
 * controls Task 1 added and the __darwin_layout freshness marker Task 2
 * added are driven directly through the module's own exports
 * (downloadOnedirAsset/compareDownloadedTags/storeDownloadedTags/
 * darwinLayoutMarker/computeLayoutMarker), asserting on the mocked
 * spawn/fs calls rather than on source text -- the argv-form and
 * single-chmod claims are behavioural, and a source-text assertion could be
 * satisfied by a comment that never runs.
 */
import { readFileSync } from 'fs'
import { EventEmitter } from 'events'
import { join } from 'path'

import { archiveName } from '../buildRunnersOnedir'
import { RELEASE_TAGS } from '../releaseTags'

// A fixed, precomputed fixture pair (sha256 of the literal string below --
// verified independently via `shasum -a 256`) so the mocked digests module
// factory never needs to reference an out-of-scope variable (Jest's
// babel-plugin-jest-hoist only allows `mock`-prefixed references there).
const FIXTURE_CONTENT = 'FIXTURE-ARCHIVE-BYTES'
const FIXTURE_DIGEST =
  'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0'
const FIXTURE_BUFFER = Buffer.from(FIXTURE_CONTENT)
// A different buffer -> a different (but also independently real) sha256,
// used to drive the digest-mismatch case.
const MISMATCHED_BUFFER = Buffer.from('MISMATCHED-BYTES')

jest.mock('child_process', () => ({
  spawn: jest.fn()
}))

jest.mock('fs/promises', () => ({
  chmod: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  rm: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ mode: 0o644 }),
  writeFile: jest.fn().mockResolvedValue(undefined)
}))

// legendary/x64 is the dedicated SENTINEL fixture (its digest entry is left
// as the real PENDING-CI-PUBLISH sentinel); every other combo gets the
// FIXTURE_DIGEST so a full digest-verified extraction can be driven for the
// argv-form/chmod/traversal tests below.
jest.mock('../runnersOnedirDigests.json', () => ({
  layout: 'onedir-v1',
  digests: {
    'legendary_macOS_x86_64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'legendary_macOS_arm64_onedir.tar.gz':
      'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0',
    'gogdl_macOS_x86_64_onedir.tar.gz':
      'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0',
    'gogdl_macOS_arm64_onedir.tar.gz':
      'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0',
    'nile_macOS_x86_64_onedir.tar.gz':
      'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0',
    'nile_macOS_arm64_onedir.tar.gz':
      'c47280f410b8d718a49814cca588a0b52ee2aabc44e759a985cfdbda1ebd1fa0'
  }
}))

import { spawn } from 'child_process'
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'

import {
  compareDownloadedTags,
  computeLayoutMarker,
  darwinLayoutMarker,
  downloadOnedirAsset,
  storeDownloadedTags
} from '../downloadHelperBinaries'

const mockedSpawn = spawn as unknown as jest.Mock
const mockedChmod = chmod as jest.Mock
const mockedMkdir = mkdir as jest.Mock
const mockedReadFile = readFile as jest.Mock
const mockedRm = rm as jest.Mock
const mockedStat = stat as jest.Mock
const mockedWriteFile = writeFile as jest.Mock

const mockedFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockedFetch

// Structural source-text assertion for the unchanged-platform/comet
// regressions below -- their point is that specific literals SURVIVED an
// edit, which is exactly what a text read (not a mocked import) proves.
const DOWNLOAD_HELPER_BINARIES_SOURCE = readFileSync(
  join(__dirname, '..', 'downloadHelperBinaries.ts'),
  'utf-8'
)
const RUNNERS_ONEDIR_DIGESTS_SOURCE = JSON.parse(
  readFileSync(join(__dirname, '..', 'runnersOnedirDigests.json'), 'utf-8')
) as { layout: string; digests: Record<string, string> }

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

/** Queues the NEXT spawn() call to emit the given stdout text and exit code. */
function queueSpawnResult(stdoutText: string, code = 0) {
  mockedSpawn.mockImplementationOnce(() => {
    const child = new FakeChildProcess()
    process.nextTick(() => {
      if (stdoutText) child.stdout.emit('data', Buffer.from(stdoutText))
      child.emit('close', code)
    })
    return child
  })
}

function mockFetchOnce(status: number, body: Buffer) {
  mockedFetch.mockResolvedValueOnce({
    status,
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  })
}

// Safe entry listing for a successful nile/arm64 extraction.
const SAFE_NILE_ENTRIES = 'nile/\nnile/nile\nnile/_internal/lib.so\n'

beforeEach(() => {
  jest.clearAllMocks()
  mockedStat.mockResolvedValue({ mode: 0o644 })
  mockedReadFile.mockResolvedValue('{}')
})

describe('downloadOnedirAsset', () => {
  describe('digest gate', () => {
    it('throws naming the filename and both digests on a sha256 mismatch, writes/spawns nothing', async () => {
      mockFetchOnce(200, MISMATCHED_BUFFER)

      let thrown: Error | undefined
      try {
        await downloadOnedirAsset('nile', 'arm64')
      } catch (error) {
        thrown = error as Error
      }

      expect(thrown).toBeDefined()
      expect(thrown?.message).toContain('nile_macOS_arm64_onedir.tar.gz')
      expect(thrown?.message).toContain(FIXTURE_DIGEST) // expected
      const actualMismatchedDigest =
        '080af560ed8126465ef9b0e44aa79de11fb529a5792b209f0936379748455b50'
      expect(thrown?.message).toContain(actualMismatchedDigest) // actual
      expect(mockedWriteFile).not.toHaveBeenCalled()
      expect(mockedSpawn).not.toHaveBeenCalled()
    })
  })

  describe('sentinel gate', () => {
    it('throws naming the file and the fill-in plan for a PENDING-CI-PUBLISH digest, without ever fetching', async () => {
      let thrown: Error | undefined
      try {
        await downloadOnedirAsset('legendary', 'x64')
      } catch (error) {
        thrown = error as Error
      }

      expect(thrown).toBeDefined()
      expect(thrown?.message).toContain('legendary_macOS_x86_64_onedir.tar.gz')
      expect(thrown?.message).toContain('PENDING-CI-PUBLISH')
      expect(thrown?.message).toContain('34.9-09')
      expect(mockedFetch).not.toHaveBeenCalled()
      expect(mockedSpawn).not.toHaveBeenCalled()
    })
  })

  describe('traversal gate', () => {
    it.each([
      ['an absolute path', 'nile/\n/etc/evil\n'],
      ['a parent-traversal path', 'nile/\n../evil\n'],
      ['an entry outside the runner prefix', 'nile/\nother/file\n']
    ])('throws before extraction for %s', async (_label, listing) => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(listing, 0)

      await expect(downloadOnedirAsset('nile', 'arm64')).rejects.toThrow()
      // Only the -tzf listing call happened -- extraction (-xzf) never ran.
      expect(mockedSpawn).toHaveBeenCalledTimes(1)
    })
  })

  describe('argv-form spawn (T-34.9-03)', () => {
    it('invokes tar with an argument array and no shell option, for both list and extract', async () => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(SAFE_NILE_ENTRIES, 0) // -tzf
      queueSpawnResult('', 0) // -xzf

      await downloadOnedirAsset('nile', 'arm64')

      expect(mockedSpawn).toHaveBeenCalledTimes(2)
      for (const call of mockedSpawn.mock.calls) {
        const [command, args, options] = call
        expect(command).toBe('tar')
        expect(Array.isArray(args)).toBe(true)
        expect(
          (options as Record<string, unknown> | undefined)?.shell
        ).toBeUndefined()
      }
      const [, listArgs] = mockedSpawn.mock.calls[0]
      expect(listArgs).toEqual(['-tzf', expect.any(String)])
      const [, extractArgs] = mockedSpawn.mock.calls[1]
      expect(extractArgs[0]).toBe('-xzf')
      expect(extractArgs[2]).toBe('-C')
    })
  })

  describe('no recursive chmod', () => {
    it('chmods exactly once, targeting the top-level {runner}/{runner} entry', async () => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(SAFE_NILE_ENTRIES, 0)
      queueSpawnResult('', 0)
      mockedStat.mockResolvedValue({ mode: 0o644 }) // no exec bit -> chmod required

      await downloadOnedirAsset('nile', 'arm64')

      expect(mockedChmod).toHaveBeenCalledTimes(1)
      expect(mockedChmod).toHaveBeenCalledWith(
        join('public', 'bin', 'arm64', 'darwin', 'nile', 'nile'),
        '755'
      )
    })

    it('does not chmod at all when the exec bit is already set', async () => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(SAFE_NILE_ENTRIES, 0)
      queueSpawnResult('', 0)
      mockedStat.mockResolvedValue({ mode: 0o755 })

      await downloadOnedirAsset('nile', 'arm64')

      expect(mockedChmod).not.toHaveBeenCalled()
    })
  })

  describe('cleanup and destination handling', () => {
    it('removes any stale finalDir before extracting and always cleans up the temp archive', async () => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(SAFE_NILE_ENTRIES, 0)
      queueSpawnResult('', 0)

      await downloadOnedirAsset('nile', 'arm64')

      expect(mockedRm).toHaveBeenCalledWith(
        join('public', 'bin', 'arm64', 'darwin', 'nile'),
        { recursive: true, force: true }
      )
      expect(mockedMkdir).toHaveBeenCalledWith(
        join('public', 'bin', 'arm64', 'darwin'),
        { recursive: true }
      )
      // The temp archive itself is always cleaned up (finally block).
      const tempCleanupCalls = mockedRm.mock.calls.filter(
        (call) =>
          (call[1] as Record<string, unknown>)?.force === true &&
          !(call[1] as Record<string, unknown>)?.recursive
      )
      expect(tempCleanupCalls.length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('filename contract', () => {
  it('meta/runnersOnedirDigests.json has exactly the archiveName() set for all 3 runners x 2 arches', () => {
    const runners = ['legendary', 'gogdl', 'nile'] as const
    const arches = ['x64', 'arm64'] as const
    const expectedKeys = runners
      .flatMap((runner) => arches.map((arch) => archiveName(runner, arch)))
      .sort()
    expect(Object.keys(RUNNERS_ONEDIR_DIGESTS_SOURCE.digests).sort()).toEqual(
      expectedKeys
    )
  })

  it.each([
    ['legendary', 'arm64'],
    ['gogdl', 'x64'],
    ['gogdl', 'arm64'],
    ['nile', 'x64'],
    ['nile', 'arm64']
  ] as const)(
    'downloadOnedirAsset(%s, %s) requests the archiveName() filename from the GameLib rolling release',
    async (runner, arch) => {
      mockFetchOnce(200, FIXTURE_BUFFER)
      queueSpawnResult(`${runner}/\n${runner}/${runner}\n`, 0)
      queueSpawnResult('', 0)

      await downloadOnedirAsset(runner, arch)

      const filename = archiveName(runner, arch)
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining(filename),
        expect.anything()
      )
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://github.com/grayson-mitchell/GameLib/releases/download/runners-onedir-macos/'
        ),
        expect.anything()
      )
    }
  )

  it("legendary/x64's sentinel-gate error also names its archiveName() filename (proves it too was derived via archiveName)", async () => {
    let thrown: Error | undefined
    try {
      await downloadOnedirAsset('legendary', 'x64')
    } catch (error) {
      thrown = error as Error
    }
    expect(thrown?.message).toContain(archiveName('legendary', 'x64'))
  })
})

describe('regression: win32/linux sourcing unchanged for legendary/gogdl/nile', () => {
  it.each([
    'legendary_linux_x86_64',
    'legendary_linux_arm64',
    'legendary_windows_x86_64.exe',
    'legendary_windows_arm64.exe',
    'gogdl_linux_x86_64',
    'gogdl_linux_arm64',
    'gogdl_windows_x86_64.exe',
    'gogdl_windows_arm64.exe',
    'nile_linux_x86_64',
    'nile_linux_arm64',
    'nile_windows_x86_64.exe'
  ])('still contains the literal %s', (literal) => {
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(literal)
  })

  it('no *_macOS_x86_64/*_macOS_arm64 literal remains for legendary/gogdl/nile', () => {
    for (const runner of ['legendary', 'gogdl', 'nile']) {
      expect(DOWNLOAD_HELPER_BINARIES_SOURCE).not.toContain(
        `${runner}_macOS_x86_64'`
      )
      expect(DOWNLOAD_HELPER_BINARIES_SOURCE).not.toContain(
        `${runner}_macOS_arm64'`
      )
    }
  })
})

describe('regression: comet/epic-integration untouched', () => {
  it.each([
    'comet-x86_64-apple-darwin',
    'comet-aarch64-apple-darwin',
    'comet-x86_64-unknown-linux-gnu',
    'comet-aarch64-unknown-linux-gnu',
    'comet-x86_64-pc-windows-msvc.exe',
    'comet-aarch64-pc-windows-msvc.exe',
    'GalaxyCommunication-dummy.exe',
    'EpicGamesLauncher.exe'
  ])('still contains the literal %s', (literal) => {
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(literal)
  })
})

describe('freshness: compareDownloadedTags + __darwin_layout', () => {
  it('returns [legendary, gogdl, nile] when __darwin_layout is absent even though every RELEASE_TAGS value matches (state of every existing checkout today)', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ ...RELEASE_TAGS }))

    const result = await compareDownloadedTags()

    expect(result).toEqual(['legendary', 'gogdl', 'nile'])
  })

  it('returns [] when every RELEASE_TAGS value matches AND __darwin_layout matches darwinLayoutMarker()', async () => {
    const marker = darwinLayoutMarker()
    mockedReadFile.mockResolvedValueOnce(
      JSON.stringify({ ...RELEASE_TAGS, __darwin_layout: marker })
    )

    const result = await compareDownloadedTags()

    expect(result).toEqual([])
  })

  it('leaves the pre-existing per-binary RELEASE_TAGS comparison unchanged when __darwin_layout matches', async () => {
    const marker = darwinLayoutMarker()
    mockedReadFile.mockResolvedValueOnce(
      JSON.stringify({
        ...RELEASE_TAGS,
        legendary: 'stale-tag',
        __darwin_layout: marker
      })
    )

    const result = await compareDownloadedTags()

    expect(result).toEqual(['legendary'])
  })

  it('the real committed public/bin/.release_tags still parses without throwing and yields the three onedir runners', async () => {
    const realReleaseTags = readFileSync(
      join(__dirname, '..', '..', 'public', 'bin', '.release_tags'),
      'utf-8'
    )
    mockedReadFile.mockResolvedValueOnce(realReleaseTags)

    const result = await compareDownloadedTags()

    expect(result.sort()).toEqual(['gogdl', 'legendary', 'nile'])
  })

  it('storeDownloadedTags writes RELEASE_TAGS plus __darwin_layout', async () => {
    await storeDownloadedTags()

    expect(mockedWriteFile).toHaveBeenCalledWith(
      'public/bin/.release_tags',
      JSON.stringify({ ...RELEASE_TAGS, __darwin_layout: darwinLayoutMarker() })
    )
  })
})

describe('computeLayoutMarker (darwinLayoutMarker sensitivity, mutation-proof)', () => {
  it('changes when a digest value changes', () => {
    const a = computeLayoutMarker('onedir-v1', { foo: '1', bar: '2' })
    const b = computeLayoutMarker('onedir-v1', { foo: '1', bar: '3' })
    expect(a).not.toBe(b)
  })

  it('changes when the layout string changes', () => {
    const a = computeLayoutMarker('onedir-v1', { foo: '1' })
    const b = computeLayoutMarker('onedir-v2', { foo: '1' })
    expect(a).not.toBe(b)
  })

  it('is stable when the digests object keys are reordered', () => {
    const a = computeLayoutMarker('onedir-v1', { foo: '1', bar: '2' })
    const b = computeLayoutMarker('onedir-v1', { bar: '2', foo: '1' })
    expect(a).toBe(b)
  })

  it('darwinLayoutMarker() never causes comet or epic-integration to be added by the layout branch', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ ...RELEASE_TAGS }))
    const result = await compareDownloadedTags()
    expect(result).not.toContain('comet')
    expect(result).not.toContain('epic-integration')
  })
})
