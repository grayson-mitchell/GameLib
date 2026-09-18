/**
 * Quick task 260917-uik. Executed tests for `meta/signMachOResources.ts`, the
 * script that signs every Mach-O under the macOS helper tree before Tauri's
 * bundler copies it into `Contents/Resources/`.
 *
 * READ THIS BEFORE TRUSTING A GREEN RUN. This suite proves the DETECTOR and
 * the ARGV. It proves nothing about the defect it was written for. Whether
 * the signature survives Tauri's `bundle.macOS.files` copy, whether the
 * workflow's throwaway keychain coexists with Tauri's own keychain handling,
 * whether notarization returns `Accepted`, and whether any helper crashes at
 * runtime under the hardened runtime with no entitlements are ALL
 * live-tag-push questions. See the plan's `<verification_reality>` section.
 *
 * Two deliberate shapes:
 *
 * 1. The fixture is SYNTHETIC, built under `mkdtemp`. It deliberately does
 *    NOT reach into `build/bin/arm64/darwin`: that tree is gitignored, absent
 *    on a fresh clone, and version-drifting, so a count pinned to it would rot
 *    the first time `downloadHelperBinaries` bumps a helper. The live-tree
 *    equality check (detector count == `file(1)`'s Mach-O count) is a desk
 *    observation recorded in the SUMMARY, pinned in no gate.
 *
 * 2. The argv assertions are made against a CAPTURED DRY RUN, never against a
 *    source grep. This repo's recorded failure mode is a gate satisfied by the
 *    prose that names the flag -- `meta/signMachOResources.ts`'s own comments
 *    name `--deep` and `--entitlements` while explaining why they are
 *    forbidden, so a source grep for either would convict correct code. One
 *    test goes further and spawns the REAL `sign:macos-resources` package
 *    script end to end, so the package.json wiring and the `JEST_WORKER_ID`
 *    main-guard are exercised rather than assumed.
 */
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  codesignArgs,
  collectMachOFiles,
  deepestFirst,
  isMachO,
  isTimestampServiceFailure,
  parseArgs,
  signMachOResources,
  HELPER_ENTITLEMENTS,
  MACHO_HEADER_BYTES
} from '../../../meta/signMachOResources'

import { createFakeHomeProfile } from '../testUtils/fakeHomeProfile'

const REPO_ROOT = join(__dirname, '..', '..', '..')

/** Builds an 8-byte header from a byte list, zero-padded. */
function header(...bytes: number[]): Buffer {
  const buffer = Buffer.alloc(MACHO_HEADER_BYTES)
  Buffer.from(bytes).copy(buffer)
  return buffer
}

let fixtureRoot = ''
const fixture = {
  machO64le: '',
  machO64be: '',
  machO32be: '',
  machO32le: '',
  fatUniversal: '',
  javaClass: '',
  textNamedLikeABinary: '',
  textNamedLikeASharedObject: '',
  zipArchive: '',
  tooShort: '',
  symlinkToMachO: ''
}

function writeBytes(path: string, bytes: number[]): void {
  writeFileSync(path, Buffer.from(bytes))
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'gamelib-macho-fixture-'))
  const internal = join(fixtureRoot, '_internal')
  const deep = join(internal, 'deep')
  mkdirSync(deep, { recursive: true })

  fixture.machO64le = join(deep, 'macho64le')
  fixture.machO64be = join(deep, 'macho64be')
  fixture.machO32be = join(deep, 'macho32be')
  fixture.machO32le = join(internal, 'macho32le')
  fixture.fatUniversal = join(fixtureRoot, 'fat-universal')
  fixture.javaClass = join(fixtureRoot, 'Decoy.class')
  fixture.textNamedLikeABinary = join(fixtureRoot, 'legendary')
  fixture.textNamedLikeASharedObject = join(
    internal,
    'cd.cpython-312-darwin.so'
  )
  fixture.zipArchive = join(internal, 'base_library.zip')
  fixture.tooShort = join(fixtureRoot, 'steam_appid.txt')
  fixture.symlinkToMachO = join(fixtureRoot, 'alias-to-macho64le')

  // MH_CIGAM_64 -- what every real arm64/x86_64 helper looks like on disk.
  writeBytes(
    fixture.machO64le,
    [0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01]
  )
  // MH_MAGIC_64 (big-endian file)
  writeBytes(
    fixture.machO64be,
    [0xfe, 0xed, 0xfa, 0xcf, 0x00, 0x00, 0x00, 0x0c]
  )
  // MH_MAGIC (32-bit, big-endian file)
  writeBytes(
    fixture.machO32be,
    [0xfe, 0xed, 0xfa, 0xce, 0x00, 0x00, 0x00, 0x0c]
  )
  // MH_CIGAM (32-bit, little-endian file)
  writeBytes(
    fixture.machO32le,
    [0xce, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x00]
  )
  // FAT_MAGIC with a sane nfat_arch of 2.
  writeBytes(
    fixture.fatUniversal,
    [0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x02]
  )
  // FAT_MAGIC's evil twin: a Java class file, major version 52. nfat_arch
  // reads as 0x34 = 52, which is why the plausibility bound exists.
  writeBytes(
    fixture.javaClass,
    [0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]
  )

  writeFileSync(fixture.textNamedLikeABinary, '#!/bin/sh\necho not a Mach-O\n')
  writeFileSync(
    fixture.textNamedLikeASharedObject,
    'this is plain ASCII text\n'
  )
  writeBytes(
    fixture.zipArchive,
    [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]
  )
  writeFileSync(fixture.tooShort, '480')

  symlinkSync(fixture.machO64le, fixture.symlinkToMachO)
})

afterAll(() => {
  if (fixtureRoot.length > 0) {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

describe('isMachO -- magic bytes only, never a filename', () => {
  test.each([
    ['MH_CIGAM_64 (cf fa ed fe)', [0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 1]],
    ['MH_CIGAM (ce fa ed fe)', [0xce, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 0]],
    ['MH_MAGIC_64 (fe ed fa cf)', [0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 0x0c]],
    ['MH_MAGIC (fe ed fa ce)', [0xfe, 0xed, 0xfa, 0xce, 0, 0, 0, 0x0c]],
    ['FAT_MAGIC, nfat_arch=2', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]],
    ['FAT_CIGAM, nfat_arch=2', [0xbe, 0xba, 0xfe, 0xca, 2, 0, 0, 0]]
  ])('selects %s', (_label, bytes) => {
    expect(isMachO(header(...bytes))).toBe(true)
  })

  test('REJECTS a Java class file, which shares FAT_MAGIC 0xCAFEBABE', () => {
    // major version 52 (Java 8) -> the u32 after the magic reads as 52
    expect(
      isMachO(header(0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34))
    ).toBe(false)
  })

  test('REJECTS a fat header claiming zero architectures', () => {
    expect(isMachO(header(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0))).toBe(false)
  })

  test('REJECTS a PK zip header', () => {
    expect(isMachO(header(0x50, 0x4b, 0x03, 0x04))).toBe(false)
  })

  test('REJECTS a buffer shorter than 8 bytes without throwing', () => {
    expect(() => isMachO(Buffer.from([0xcf, 0xfa, 0xed]))).not.toThrow()
    expect(isMachO(Buffer.from([0xcf, 0xfa, 0xed]))).toBe(false)
  })
})

describe('collectMachOFiles -- selection over a synthetic tree', () => {
  test('selects exactly the Mach-O files and nothing else', async () => {
    const found = await collectMachOFiles(fixtureRoot)

    expect([...found].sort()).toEqual(
      [
        fixture.fatUniversal,
        fixture.machO32be,
        fixture.machO32le,
        fixture.machO64be,
        fixture.machO64le
      ].sort()
    )
  })

  test('never selects a non-Mach-O decoy, whatever it is called', async () => {
    const found = await collectMachOFiles(fixtureRoot)

    // Two-sided on purpose: the test above could pass against a detector that
    // selects everything if this one did not exist.
    expect(found).not.toContain(fixture.javaClass)
    expect(found).not.toContain(fixture.textNamedLikeABinary)
    expect(found).not.toContain(fixture.textNamedLikeASharedObject)
    expect(found).not.toContain(fixture.zipArchive)
    expect(found).not.toContain(fixture.tooShort)
  })

  test('skips symlinks, and selects the link target exactly once', async () => {
    const found = await collectMachOFiles(fixtureRoot)

    expect(found).not.toContain(fixture.symlinkToMachO)
    expect(found.filter((p) => p === fixture.machO64le)).toHaveLength(1)
  })

  test('returns deepest-first, ties broken lexicographically', async () => {
    const found = await collectMachOFiles(fixtureRoot)

    expect(found).toEqual([
      fixture.machO32be,
      fixture.machO64be,
      fixture.machO64le,
      fixture.machO32le,
      fixture.fatUniversal
    ])
  })

  test('rejects a directory that does not exist', async () => {
    await expect(
      collectMachOFiles(join(fixtureRoot, 'no-such-directory'))
    ).rejects.toThrow()
  })
})

describe('deepestFirst', () => {
  test('orders by descending component count before lexicographic order', () => {
    const sorted = [
      join('a', 'zzz'),
      join('a', 'b', 'aaa'),
      join('a', 'b', 'aab')
    ].sort(deepestFirst)

    expect(sorted).toEqual([
      join('a', 'b', 'aaa'),
      join('a', 'b', 'aab'),
      join('a', 'zzz')
    ])
  })
})

describe('codesignArgs -- the argv shape, built once and used by both paths', () => {
  test('carries --force, --options runtime, --timestamp, --sign and --keychain', () => {
    const args = codesignArgs('/some/binary', 'Developer ID: X', '/kc')

    expect(args).toContain('--force')
    expect(args).toContain('--timestamp')
    expect(args[args.indexOf('--options') + 1]).toBe('runtime')
    expect(args[args.indexOf('--sign') + 1]).toBe('Developer ID: X')
    expect(args[args.indexOf('--keychain') + 1]).toBe('/kc')
    expect(args[args.length - 1]).toBe('/some/binary')
  })

  test('never carries --deep or --entitlements by default', () => {
    const args = codesignArgs('/some/binary', 'Developer ID: X', '/kc')

    expect(args).not.toContain('--deep')
    expect(args).not.toContain('--entitlements')
  })

  test('HELPER_ENTITLEMENTS ships EMPTY -- an entry requires an observed crash', () => {
    expect(Object.keys(HELPER_ENTITLEMENTS)).toEqual([])
  })

  test('positive control: the --entitlements seam DOES fire when a path is mapped', () => {
    // Without this, the "never carries --entitlements" assertion above could
    // pass against a builder that has no entitlements support at all, and the
    // HELPER_ENTITLEMENTS seam would be decorative.
    const args = codesignArgs('/some/binary', 'ID', '/kc', '/some/file.plist')

    expect(args[args.indexOf('--entitlements') + 1]).toBe('/some/file.plist')
  })
})

describe('signMachOResources -- driver behaviour, captured from a dry run', () => {
  test('emits one argv per detected Mach-O, none of them with --deep or --entitlements', async () => {
    const result = await signMachOResources({
      dir: fixtureRoot,
      identity: 'DESK-CHECK',
      keychain: '/dev/null',
      dryRun: true
    })

    expect(result.detected).toBe(5)
    expect(result.signed).toBe(0)
    expect(result.commands).toHaveLength(5)

    for (const args of result.commands) {
      expect(args).toContain('--force')
      expect(args).toContain('--timestamp')
      expect(args[args.indexOf('--options') + 1]).toBe('runtime')
      expect(args[args.indexOf('--sign') + 1]).toBe('DESK-CHECK')
      expect(args[args.indexOf('--keychain') + 1]).toBe('/dev/null')
      expect(args).not.toContain('--deep')
      expect(args).not.toContain('--entitlements')
    }
  })

  test('a zero-Mach-O directory is a HARD FAILURE, never a silent success', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'gamelib-macho-empty-'))
    writeFileSync(join(emptyDir, 'readme.txt'), 'no binaries here\n')

    try {
      await expect(
        signMachOResources({
          dir: emptyDir,
          identity: 'DESK-CHECK',
          keychain: '/dev/null',
          dryRun: true
        })
      ).rejects.toThrow(/ZERO Mach-O files/)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  test('a non-existent directory is a hard failure', async () => {
    await expect(
      signMachOResources({
        dir: join(fixtureRoot, 'nope'),
        identity: 'DESK-CHECK',
        keychain: '/dev/null',
        dryRun: true
      })
    ).rejects.toThrow()
  })
})

describe('isTimestampServiceFailure -- the retry is narrowed, not blanket', () => {
  test('fires on Apple TSA wording', () => {
    expect(
      isTimestampServiceFailure(
        'legendary: errSecInternalComponent\nThe timestamp service is not available.'
      )
    ).toBe(true)
  })

  test('does NOT fire on an unrelated codesign failure', () => {
    expect(
      isTimestampServiceFailure(
        'error: The specified item could not be found in the keychain.'
      )
    ).toBe(false)
  })
})

describe('parseArgs', () => {
  test('accepts --flag value and --flag=value, and the --dry-run boolean', () => {
    expect(
      parseArgs(
        ['--dir', '/a', '--keychain=/b', '--identity', 'ID', '--dry-run'],
        {}
      )
    ).toEqual({ dir: '/a', keychain: '/b', identity: 'ID', dryRun: true })
  })

  test('falls back to APPLE_SIGNING_IDENTITY, which is what the workflow relies on', () => {
    expect(
      parseArgs(['--dir', '/a', '--keychain', '/b'], {
        APPLE_SIGNING_IDENTITY: 'Developer ID Application: Someone (TEAM)'
      })
    ).toEqual({
      dir: '/a',
      keychain: '/b',
      identity: 'Developer ID Application: Someone (TEAM)',
      dryRun: false
    })
  })

  test('refuses to run with no identity at all', () => {
    expect(() => parseArgs(['--dir', '/a', '--keychain', '/b'], {})).toThrow(
      /identity/
    )
  })

  test('REGRESSION: survives the bare `--` separator pnpm forwards verbatim', () => {
    // `pnpm sign:macos-resources -- --dir X ...` puts a literal `--` in argv.
    // The first version of parseArgs matched it as a flag and swallowed
    // `--dir` as its value, dying with "--dir is required" against a command
    // line that plainly contained it. Measured, not anticipated.
    expect(
      parseArgs(
        [
          '--',
          '--dir',
          'build/bin/arm64/darwin',
          '--dry-run',
          '--identity',
          'DESK-CHECK',
          '--keychain',
          '/dev/null'
        ],
        {}
      )
    ).toEqual({
      dir: 'build/bin/arm64/darwin',
      keychain: '/dev/null',
      identity: 'DESK-CHECK',
      dryRun: true
    })
  })

  test('never consumes a following flag as a value', () => {
    expect(() =>
      parseArgs(['--dir', '/a', '--keychain', '--identity', 'ID'], {})
    ).toThrow(/--keychain is required/)
  })

  test('refuses to run with no --dir', () => {
    expect(() =>
      parseArgs(['--keychain', '/b', '--identity', 'ID'], {})
    ).toThrow(/--dir/)
  })
})

/**
 * Reads the REAL `sign:macos-resources` entry out of package.json rather than
 * hand-copying an argv, so drift in that entry surfaces here.
 */
function packageScriptTokens(): string[] {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')
  ) as { scripts: Record<string, string> }

  const script = pkg.scripts['sign:macos-resources']
  expect(script).toBeDefined()

  const tokens = script.split(/\s+/)
  expect(tokens[0]).toBe('node')
  return tokens
}

interface SpawnedRun {
  status: number | null
  stdout: string
  codesignLines: string[]
}

/**
 * Spawns the real package script over the synthetic fixture.
 *
 * `keepJestWorkerId` selects which side of the `JEST_WORKER_ID` main-guard is
 * being exercised -- see the two tests below.
 *
 * Isolated fake HOME per CLAUDE.md's two-profile rule: this run's purpose is
 * not profile-dependent, so it gets a fresh disposable profile rather than the
 * operator's real one.
 */
function spawnPackageScript(keepJestWorkerId: boolean): SpawnedRun {
  const tokens = packageScriptTokens()
  const profile = createFakeHomeProfile({ prefix: 'gamelib-macho-spawn-' })
  try {
    const base: NodeJS.ProcessEnv = { ...process.env }
    if (!keepJestWorkerId) {
      delete base.JEST_WORKER_ID
    }

    const run = spawnSync(
      process.execPath,
      [
        ...tokens.slice(1),
        '--dir',
        fixtureRoot,
        '--dry-run',
        '--identity',
        'DESK-CHECK',
        '--keychain',
        '/dev/null'
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        env: profile.childEnv(base)
      }
    )

    const stdout = run.stdout
    return {
      status: run.status,
      stdout,
      codesignLines: stdout
        .split('\n')
        .filter((line) => line.startsWith('codesign '))
    }
  } finally {
    profile.dispose()
  }
}

describe('the real package script, spawned end to end', () => {
  test('sign:macos-resources --dry-run emits one `codesign ` line per Mach-O', () => {
    const run = spawnPackageScript(false)

    expect(run.status).toBe(0)
    expect(run.codesignLines).toHaveLength(5)

    for (const line of run.codesignLines) {
      expect(line).toContain('--force')
      expect(line).toContain('--options runtime')
      expect(line).toContain('--timestamp')
      expect(line).toContain('--sign DESK-CHECK')
      expect(line).not.toContain('--deep')
      expect(line).not.toContain('--entitlements')
    }
  }, 180000)

  test('MEASURED, not assumed: the JEST_WORKER_ID guard suppresses main() -- an unguarded copy would codesign during a test run', () => {
    // The other half of the pair above, and the reason this file spawns at
    // all. Discovered by execution while writing this suite: the first version
    // of the spawn test inherited jest's own JEST_WORKER_ID and the script
    // exited 0 having done NOTHING, which is precisely the guard doing its
    // job. Asserting both sides is what makes the guard's presence a fact
    // rather than a comment.
    const run = spawnPackageScript(true)

    expect(run.status).toBe(0)
    expect(run.codesignLines).toEqual([])
  }, 180000)
})
