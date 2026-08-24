/**
 * First-ever test coverage for meta/pinRunnerDigests.ts (34.16-05). Global
 * `fetch` and `fs/promises` (`readFile`/`writeFile` only -- this script
 * never touches binaries) are mocked at the module boundary, mirroring
 * meta/__tests__/downloadHelperBinaries.test.ts's idiom. Every fixture is
 * inlined as a `const` at the top of this file, per that suite family's
 * convention -- no shared meta/__tests__/fixtures/ directory is used here.
 *
 * No `RELEASE_TAGS` version literal is baked into any fixture: the
 * agreeing-tag fixtures are built FROM the live `RELEASE_TAGS` import, and
 * the disagreeing fixture is built by appending a suffix to a live value,
 * so this suite cannot rot the moment a runner version is legitimately
 * bumped (34.16-CONTEXT.md constraint 6).
 */

import { RELEASE_TAGS } from '../releaseTags'

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined)
}))

import { readFile, writeFile } from 'fs/promises'

import {
  assertCoversAllKeys,
  buildPinnedJson,
  main,
  parseSha256Sums
} from '../pinRunnerDigests'

const mockedReadFile = readFile as jest.Mock
const mockedWriteFile = writeFile as jest.Mock

const mockedFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockedFetch

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// The currently-tracked file's shape (meta/runnersOnedirDigests.json, post
// 34.16-04) -- deliberately distinct _comment/layout prose from the real
// file so a success-path assertion that accidentally compared against the
// real committed file would be caught, not silently pass.
const CURRENT_DIGESTS_FILE = {
  _comment: 'FIXTURE _comment -- must round-trip byte-identical.',
  layout: 'onedir-v1',
  runId: null as string | null,
  digests: {
    'legendary_macOS_x86_64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'legendary_macOS_arm64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'gogdl_macOS_x86_64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'gogdl_macOS_arm64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'nile_macOS_x86_64_onedir.tar.gz': 'PENDING-CI-PUBLISH',
    'nile_macOS_arm64_onedir.tar.gz': 'PENDING-CI-PUBLISH'
  }
}

// Six distinct, obviously-synthetic 64-hex digests, one per tracked key.
const DIGEST_LEGENDARY_X64 = 'a'.repeat(64)
const DIGEST_LEGENDARY_ARM64 = 'b'.repeat(64)
const DIGEST_GOGDL_X64 = 'c'.repeat(64)
const DIGEST_GOGDL_ARM64 = 'd'.repeat(64)
const DIGEST_NILE_X64 = 'e'.repeat(64)
const DIGEST_NILE_ARM64 = 'f'.repeat(64)

// The success test's expected digests are read from these SAME six
// constants, never re-typed as separate literals -- see the "vacuity guard"
// note in the SUMMARY for how this was proven non-vacuous.
const EXPECTED_DIGESTS: Record<string, string> = {
  'legendary_macOS_x86_64_onedir.tar.gz': DIGEST_LEGENDARY_X64,
  'legendary_macOS_arm64_onedir.tar.gz': DIGEST_LEGENDARY_ARM64,
  'gogdl_macOS_x86_64_onedir.tar.gz': DIGEST_GOGDL_X64,
  'gogdl_macOS_arm64_onedir.tar.gz': DIGEST_GOGDL_ARM64,
  'nile_macOS_x86_64_onedir.tar.gz': DIGEST_NILE_X64,
  'nile_macOS_arm64_onedir.tar.gz': DIGEST_NILE_ARM64
}

const SHA256SUMS_X64_TEXT =
  `${DIGEST_LEGENDARY_X64}  legendary_macOS_x86_64_onedir.tar.gz\n` +
  `${DIGEST_GOGDL_X64}  gogdl_macOS_x86_64_onedir.tar.gz\n` +
  `${DIGEST_NILE_X64}  nile_macOS_x86_64_onedir.tar.gz\n`

const SHA256SUMS_ARM64_TEXT =
  `${DIGEST_LEGENDARY_ARM64}  legendary_macOS_arm64_onedir.tar.gz\n` +
  `${DIGEST_GOGDL_ARM64}  gogdl_macOS_arm64_onedir.tar.gz\n` +
  `${DIGEST_NILE_ARM64}  nile_macOS_arm64_onedir.tar.gz\n`

const RUN_ID = 'FIXTURE-RUN-ID-42'
const OTHER_RUN_ID = 'FIXTURE-RUN-ID-99'

// Built FROM the live RELEASE_TAGS import -- never a hardcoded version
// literal (34.16-CONTEXT.md constraint 6). Minimal per-runner shape: this
// script only ever reads `.tag`.
const AGREEING_MANIFEST_X64 = {
  legendary: { tag: RELEASE_TAGS.legendary },
  gogdl: { tag: RELEASE_TAGS.gogdl },
  nile: { tag: RELEASE_TAGS.nile },
  runId: RUN_ID
}
const AGREEING_MANIFEST_ARM64 = {
  legendary: { tag: RELEASE_TAGS.legendary },
  gogdl: { tag: RELEASE_TAGS.gogdl },
  nile: { tag: RELEASE_TAGS.nile },
  runId: RUN_ID
}

// Constructed by appending a suffix to the live value, per the plan's
// explicit instruction -- never by naming a specific old version.
const DRIFTED_TAG = `${RELEASE_TAGS.legendary}-drifted`

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockFetchTextOnce(status: number, text: string) {
  mockedFetch.mockResolvedValueOnce({
    status,
    text: async () => text
  })
}

interface FetchSequenceOverride {
  status?: number
  text?: string
}

interface FetchSequenceOverrides {
  sumsX64?: FetchSequenceOverride
  sumsArm64?: FetchSequenceOverride
  manifestX64?: FetchSequenceOverride
  manifestArm64?: FetchSequenceOverride
}

/** Queues all four fetch() calls, in the exact order main() awaits them. */
function queueFetchSequence(overrides: FetchSequenceOverrides = {}) {
  const seq = {
    sumsX64: { status: 200, text: SHA256SUMS_X64_TEXT, ...overrides.sumsX64 },
    sumsArm64: {
      status: 200,
      text: SHA256SUMS_ARM64_TEXT,
      ...overrides.sumsArm64
    },
    manifestX64: {
      status: 200,
      text: JSON.stringify(AGREEING_MANIFEST_X64),
      ...overrides.manifestX64
    },
    manifestArm64: {
      status: 200,
      text: JSON.stringify(AGREEING_MANIFEST_ARM64),
      ...overrides.manifestArm64
    }
  }
  mockFetchTextOnce(seq.sumsX64.status, seq.sumsX64.text)
  mockFetchTextOnce(seq.sumsArm64.status, seq.sumsArm64.text)
  mockFetchTextOnce(seq.manifestX64.status, seq.manifestX64.text)
  mockFetchTextOnce(seq.manifestArm64.status, seq.manifestArm64.text)
}

async function expectMainToThrow(): Promise<Error> {
  let thrown: Error | undefined
  try {
    await main()
  } catch (error) {
    thrown = error as Error
  }
  expect(thrown).toBeDefined()
  return thrown as Error
}

let mockedWarn: jest.SpyInstance

beforeEach(() => {
  mockedReadFile.mockResolvedValue(JSON.stringify(CURRENT_DIGESTS_FILE))
  mockedWriteFile.mockResolvedValue(undefined)
  mockedWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  mockedWarn.mockRestore()
})

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('main() success path', () => {
  it('writes runnersOnedirDigests.json exactly once, preserving _comment/layout and setting runId + all six digests', async () => {
    queueFetchSequence()

    await main()

    expect(mockedWriteFile).toHaveBeenCalledTimes(1)
    const [writtenPath, writtenText] = mockedWriteFile.mock.calls[0] as [
      string,
      string
    ]
    expect(writtenPath.endsWith('runnersOnedirDigests.json')).toBe(true)

    const parsed = JSON.parse(writtenText)
    expect(Object.keys(parsed)).toEqual([
      '_comment',
      'layout',
      'runId',
      'digests'
    ])
    expect(parsed._comment).toBe(CURRENT_DIGESTS_FILE._comment)
    expect(parsed.layout).toBe(CURRENT_DIGESTS_FILE.layout)
    expect(parsed.runId).toBe(RUN_ID)
    expect(parsed.digests).toEqual(EXPECTED_DIGESTS)

    // Exactly one trailing newline.
    expect(writtenText.endsWith('\n')).toBe(true)
    expect(writtenText.endsWith('\n\n')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Non-200 -> throws naming the URL and status; writeFile never called
// ---------------------------------------------------------------------------

describe('fetch failure gate', () => {
  it.each([
    ['SHA256SUMS-x64', { sumsX64: { status: 404 } }, 'SHA256SUMS-x64', '404'],
    [
      'SHA256SUMS-arm64',
      { sumsArm64: { status: 500 } },
      'SHA256SUMS-arm64',
      '500'
    ],
    [
      'BUILD-MANIFEST-x64.json',
      { manifestX64: { status: 404 } },
      'BUILD-MANIFEST-x64.json',
      '404'
    ],
    [
      'BUILD-MANIFEST-arm64.json',
      { manifestArm64: { status: 403 } },
      'BUILD-MANIFEST-arm64.json',
      '403'
    ]
  ])(
    'a non-200 on %s throws naming the URL and status, writes nothing',
    async (_label, overrides, urlFragment, status) => {
      queueFetchSequence(overrides as FetchSequenceOverrides)

      const thrown = await expectMainToThrow()

      expect(thrown.message).toContain(urlFragment)
      expect(thrown.message).toContain(status)
      expect(mockedWriteFile).not.toHaveBeenCalled()
    }
  )
})

// ---------------------------------------------------------------------------
// Malformed SHA256SUMS line -> throws quoting the offending line
// ---------------------------------------------------------------------------

describe('SHA256SUMS line-shape gate', () => {
  it.each([
    [
      'wrong hex length',
      `${DIGEST_LEGENDARY_X64.slice(0, 63)}  legendary_macOS_x86_64_onedir.tar.gz\n`
    ],
    [
      'uppercase hex',
      `${DIGEST_LEGENDARY_X64.toUpperCase()}  legendary_macOS_x86_64_onedir.tar.gz\n`
    ],
    [
      'single space',
      `${DIGEST_LEGENDARY_X64} legendary_macOS_x86_64_onedir.tar.gz\n`
    ],
    ['missing filename', `${DIGEST_LEGENDARY_X64}  \n`]
  ])(
    '%s throws quoting the offending line, writes nothing',
    async (_label, malformedText) => {
      queueFetchSequence({ sumsX64: { text: malformedText } })

      const thrown = await expectMainToThrow()

      expect(thrown.message).toContain('SHA256SUMS-x64')
      expect(mockedWriteFile).not.toHaveBeenCalled()
    }
  )
})

// ---------------------------------------------------------------------------
// Unknown filename -> throws naming it and the arch; writeFile never called
// ---------------------------------------------------------------------------

describe('known-filename gate', () => {
  it('a filename absent from the tracked digests keys throws naming it and the arch, writes nothing', async () => {
    const unknownLine = `${DIGEST_LEGENDARY_X64}  legendary_macOS_x86_64_onedir_UNKNOWN.tar.gz\n`
    queueFetchSequence({ sumsX64: { text: unknownLine } })

    const thrown = await expectMainToThrow()

    expect(thrown.message).toContain(
      'legendary_macOS_x86_64_onedir_UNKNOWN.tar.gz'
    )
    expect(thrown.message).toContain('x64')
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Coverage gate -- only two of three runners listed for an arch
// ---------------------------------------------------------------------------

describe('coverage gate', () => {
  it('an arch missing one of its three runner lines throws naming the uncovered key, writes nothing', async () => {
    const twoOfThreeText =
      `${DIGEST_LEGENDARY_X64}  legendary_macOS_x86_64_onedir.tar.gz\n` +
      `${DIGEST_GOGDL_X64}  gogdl_macOS_x86_64_onedir.tar.gz\n`
    queueFetchSequence({ sumsX64: { text: twoOfThreeText } })

    const thrown = await expectMainToThrow()

    expect(thrown.message).toContain('nile_macOS_x86_64_onedir.tar.gz')
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// runId agreement gate
// ---------------------------------------------------------------------------

describe('runId agreement gate', () => {
  it('both manifests reporting a null runId throws, writes nothing', async () => {
    queueFetchSequence({
      manifestX64: {
        text: JSON.stringify({ ...AGREEING_MANIFEST_X64, runId: null })
      },
      manifestArm64: {
        text: JSON.stringify({ ...AGREEING_MANIFEST_ARM64, runId: null })
      }
    })

    const thrown = await expectMainToThrow()

    expect(thrown.message).toContain('null')
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })

  it('disagreeing runId values throw naming both, writes nothing', async () => {
    queueFetchSequence({
      manifestX64: {
        text: JSON.stringify({ ...AGREEING_MANIFEST_X64, runId: RUN_ID })
      },
      manifestArm64: {
        text: JSON.stringify({
          ...AGREEING_MANIFEST_ARM64,
          runId: OTHER_RUN_ID
        })
      }
    })

    const thrown = await expectMainToThrow()

    expect(thrown.message).toContain(RUN_ID)
    expect(thrown.message).toContain(OTHER_RUN_ID)
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RELEASE_TAGS drift -- the one non-fatal branch: warns AND still writes
// ---------------------------------------------------------------------------

describe('RELEASE_TAGS drift (non-fatal)', () => {
  it('a manifest tag disagreeing with the live RELEASE_TAGS value warns naming the runner/values/run id, and still writes once', async () => {
    queueFetchSequence({
      manifestX64: {
        text: JSON.stringify({
          ...AGREEING_MANIFEST_X64,
          legendary: { tag: DRIFTED_TAG }
        })
      }
    })

    await main()

    expect(mockedWarn).toHaveBeenCalled()
    const warned = mockedWarn.mock.calls
      .map((call) => String(call[0]))
      .join('\n')
    expect(warned).toContain('legendary')
    expect(warned).toContain(DRIFTED_TAG)
    expect(warned).toContain(RELEASE_TAGS.legendary)
    expect(warned).toContain(RUN_ID)

    expect(mockedWriteFile).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Exported pure-helper unit coverage (fast, no I/O)
// ---------------------------------------------------------------------------

describe('parseSha256Sums (unit)', () => {
  it('parses three well-formed lines into digest/filename pairs', () => {
    const parsed = parseSha256Sums(SHA256SUMS_X64_TEXT, 'x64')
    expect(parsed).toEqual([
      {
        digest: DIGEST_LEGENDARY_X64,
        filename: 'legendary_macOS_x86_64_onedir.tar.gz'
      },
      {
        digest: DIGEST_GOGDL_X64,
        filename: 'gogdl_macOS_x86_64_onedir.tar.gz'
      },
      { digest: DIGEST_NILE_X64, filename: 'nile_macOS_x86_64_onedir.tar.gz' }
    ])
  })
})

describe('assertCoversAllKeys (unit)', () => {
  it('does not throw when every existing key is covered exactly once', () => {
    const parsed = [
      ...parseSha256Sums(SHA256SUMS_X64_TEXT, 'x64'),
      ...parseSha256Sums(SHA256SUMS_ARM64_TEXT, 'arm64')
    ]
    expect(() =>
      assertCoversAllKeys(parsed, Object.keys(CURRENT_DIGESTS_FILE.digests))
    ).not.toThrow()
  })
})

describe('buildPinnedJson (unit)', () => {
  it('carries _comment/layout forward verbatim and sets runId + digests, in the fixed key order', () => {
    const result = buildPinnedJson(
      CURRENT_DIGESTS_FILE,
      EXPECTED_DIGESTS,
      RUN_ID
    )
    expect(Object.keys(result)).toEqual([
      '_comment',
      'layout',
      'runId',
      'digests'
    ])
    expect(result._comment).toBe(CURRENT_DIGESTS_FILE._comment)
    expect(result.layout).toBe(CURRENT_DIGESTS_FILE.layout)
    expect(result.runId).toBe(RUN_ID)
    expect(result.digests).toEqual(EXPECTED_DIGESTS)
  })
})
