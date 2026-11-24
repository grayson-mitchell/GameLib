/**
 * The case lists of the known-fix overlay oracle (88-06, D-03, D-11, D-14). Not a test:
 * `knownFixOverlay.oracle.test.ts` builds each slice's `cases.json` from this module in write mode and
 * compares the committed file against it in compare mode, so the lists the Rust replay (88-10) reads and
 * the lists that were recorded cannot drift.
 *
 * Two slices:
 *
 * overlay_archive   steps over the deterministic ustar+gzip writer and the strict reader
 *   build        `buildOverlayTarGz(files)`: the error, or size, sha256 and (under 64 KiB) base64 of the bytes,
 *                plus the size and sha256 of the gunzipped tar, which does not depend on the zlib build
 *   buildPair    the same files in the given order and reversed: are the bytes identical
 *   buildHeader  the pinned gzip mtime and OS byte and the first tar header's fields
 *   roundTrip    build, then read back with `expected` and `cap`
 *   read         `readOverlayTarGz(archive, expected, cap)` over archive bytes given as base64
 *
 *   The archives a `read` step carries are written by this module's own small ustar encoder and gzipped with
 *   level 0 (stored blocks), so their bytes do not depend on the zlib build; the one thing that does is the
 *   output of `buildOverlayTarGz` itself (level 9), recorded in `build` steps as the plan asks.
 *
 * overlay_install   steps over the installer, the overlay env resolution and the pure helpers
 *   ensure       `ensureOverlayInstalled` through `createKnownFixOverlayInstalls`, with a scripted `fetchArchive`
 *   damage       breaks the installed tree the way the TS incident tests do
 *   verify       `verifyInstalledOverlay`
 *   validate, resolveEnv, profileEnv, appendPathList, lastEnvOption, formatLine, logLine, withEnv,
 *   filterTier1, catalogue   the env resolution and its helpers (a scripted installer answers `resolveEnv`
 *                and `profileEnv`, so the real catalogue is never downloaded)
 *
 * The fixture overlay is `test-overlay-1`, pinned from the archive `buildOverlayTarGz(payload)` produces, so a
 * case never touches the network and never needs the real gst-libav archive.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { gzipSync } from 'zlib'
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { slug } from 'backend/testUtils/launchOracle/census'

// ---------------------------------------------------------------------------------------------
// overlay_archive
// ---------------------------------------------------------------------------------------------

export interface FileSpec {
  path: string
  text?: string
  base64?: string
}

export type ArchiveStep =
  | { op: 'build'; label?: string; files: FileSpec[] }
  | { op: 'buildPair'; files: FileSpec[] }
  | { op: 'buildHeader'; files: FileSpec[] }
  | {
      op: 'roundTrip'
      files: FileSpec[]
      expected: Record<string, number>
      cap: number
    }
  | {
      op: 'read'
      label: string
      archiveBase64: string
      expected: Record<string, number>
      cap: number
    }

export interface ArchiveCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  steps: ArchiveStep[]
}

interface HeaderOpts {
  name: string
  size?: number
  /** Written into the size field as given, instead of an octal `size`. */
  sizeText?: string
  typeflag?: string
  magic?: string
  version?: string
  prefix?: string
  badChecksum?: boolean
}

/** A ustar header, as the TS archive test's own encoder writes it (the module under test exports none). */
function header(o: HeaderOpts): Buffer {
  const h = Buffer.alloc(512)
  h.write(o.name, 0, 'ascii')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write(
    o.sizeText ?? (o.size ?? 0).toString(8).padStart(11, '0') + '\0',
    124,
    'ascii'
  )
  h.write('00000000000\0', 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write(o.typeflag ?? '0', 156, 'ascii')
  h.write(o.magic ?? 'ustar\0', 257, 'ascii')
  h.write(o.version ?? '00', 263, 'ascii')
  if (o.prefix) h.write(o.prefix, 345, 'ascii')
  let sum = 0
  for (const b of h) sum += b
  if (o.badChecksum) sum += 1
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
  return h
}

function entry(o: HeaderOpts, data: Buffer = Buffer.alloc(0)): Buffer[] {
  const pad = (512 - (data.length % 512)) % 512
  return [
    header({ ...o, size: o.size ?? data.length }),
    data,
    Buffer.alloc(pad)
  ]
}

/**
 * gzip with stored blocks (level 0) and the two header bytes zlib picks per build pinned, so the bytes of a
 * hostile archive are the same on every Node. `tail` is the two zero blocks that end a tar.
 */
function gz(parts: Buffer[], tail = true): Buffer {
  const out = gzipSync(
    Buffer.concat([...parts, ...(tail ? [Buffer.alloc(1024)] : [])]),
    { level: 0 }
  )
  out[8] = 0
  out[9] = 3
  return out
}

/**
 * The hostile archive of the TS install test, as that test builds it: the header run `0ustar\0` + `00`
 * is written at offset 156, so the magic field at 257 stays zero and the reader refuses it for its magic,
 * never reaching the `../x` name. Kept as found (D-20); `hostileDotdotArchive` is the same attack with a
 * correct header, so the path check is what refuses it.
 */
export function hostileTsShapeArchive(): Buffer {
  const h = Buffer.alloc(512)
  h.write('../x', 0, 'ascii')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write('00000000001\0', 124, 'ascii')
  h.write('00000000000\0', 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write('0ustar\0' + '00', 156, 'ascii')
  let sum = 0
  for (const b of h) sum += b
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
  return gz([h, Buffer.alloc(512, 0x78)])
}

/** A well-formed ustar archive whose one entry is named `../x`. */
export function hostileDotdotArchive(): Buffer {
  return gz(entry({ name: '../x', size: 1 }, Buffer.alloc(512, 0x78)))
}

const A = Buffer.from('hello')
const B = Buffer.from('world!!')
const EXPECTED = { 'lib/a.dylib': A.length, 'lib/b.dylib': B.length }
const LIMIT = 1024 * 1024
const text = (path: string, data: Buffer | string): FileSpec => ({
  path,
  text: data.toString()
})
const FILES: FileSpec[] = [text('lib/b.dylib', B), text('lib/a.dylib', A)]
const named = (id: string, steps: ArchiveStep[]): ArchiveCase => ({ id, steps })
const titled = (
  prefix: string,
  title: string,
  steps: ArchiveStep[]
): ArchiveCase => ({
  id: `knownFixOverlayArchive--${slug(`${prefix}${title}`)}`,
  title: `${prefix}${title}`,
  steps
})

const readStep = (
  label: string,
  archive: Buffer,
  expected: Record<string, number> = EXPECTED,
  cap = LIMIT
): ArchiveStep => ({
  op: 'read',
  label,
  archiveBase64: archive.toString('base64'),
  expected,
  cap
})

export function buildArchiveCases(): ArchiveCase[] {
  const ok = (name: string, data: Buffer) => entry({ name }, data)
  const good = [...ok('lib/a.dylib', A), ...ok('lib/b.dylib', B)]
  const BU = 'buildOverlayTarGz > '
  const RJ = 'readOverlayTarGz rejections > '
  /** Every rejection archive: the named entry first, then the good ones. */
  const withFirst = (o: HeaderOpts) => gz([...entry(o, A), ...good])

  return [
    // ---- buildOverlayTarGz ----
    titled(BU, 'round-trips byte-exactly', [
      {
        op: 'roundTrip',
        files: FILES,
        expected: EXPECTED,
        cap: LIMIT
      }
    ]),
    titled(BU, 'is byte-identical across runs and input order', [
      { op: 'buildPair', files: FILES }
    ]),
    titled(BU, 'pins gzip mtime and OS byte and tar header fields', [
      { op: 'buildHeader', files: FILES }
    ]),
    titled(BU, 'rejects bad and duplicate paths', [
      ...['/abs', 'a/../b', './a', 'a//b', 'a\\b', ''].map(
        (path): ArchiveStep => ({
          op: 'build',
          label: path,
          files: [text(path, A)]
        })
      ),
      {
        op: 'build',
        label: 'duplicate',
        files: [text('x', A), text('x', B)]
      }
    ]),

    // ---- readOverlayTarGz rejections ----
    titled(RJ, 'accepts a hand-built good archive', [
      readStep('good', gz(good))
    ]),
    titled(
      RJ,
      'rejects %s',
      [
        ['absolute path', '/etc/x'],
        ['dotdot segment', 'lib/../x'],
        ['dot segment', 'lib/./a.dylib'],
        ['empty segment', 'lib//a.dylib'],
        ['backslash', 'lib\\a.dylib']
      ].map(([label, name]) =>
        readStep(label as string, withFirst({ name: name as string }))
      )
    ),
    titled(
      RJ,
      'rejects typeflag %s',
      [
        ['hardlink', '1'],
        ['symlink', '2'],
        ['directory', '5'],
        ['pax x', 'x'],
        ['pax g', 'g'],
        ['GNU long name', 'L'],
        ['GNU long link', 'K']
      ].map(([label, typeflag]) =>
        readStep(
          label as string,
          gz([
            ...entry({ name: 'lib/a.dylib', typeflag }, A),
            ...ok('lib/b.dylib', B)
          ])
        )
      )
    ),
    titled(RJ, 'rejects a ustar prefix', [
      readStep(
        'prefix evil',
        gz(entry({ name: 'lib/a.dylib', prefix: 'evil' }, A))
      )
    ]),
    titled(
      RJ,
      'rejects non-ustar and GNU magic',
      ['\0\0\0\0\0\0', 'ustar '].map((magic) =>
        readStep(
          JSON.stringify(magic),
          gz(entry({ name: 'lib/a.dylib', magic, version: ' \0' }, A))
        )
      )
    ),
    titled(RJ, 'rejects a bad checksum', [
      readStep(
        'bad checksum',
        gz(entry({ name: 'lib/a.dylib', badChecksum: true }, A))
      )
    ]),
    titled(RJ, 'rejects unexpected, duplicate and missing paths', [
      readStep('unexpected', gz([...good, ...ok('lib/c.dylib', A)])),
      readStep(
        'duplicate',
        gz([...ok('lib/a.dylib', A), ...ok('lib/a.dylib', A)])
      ),
      readStep('missing', gz(ok('lib/a.dylib', A)))
    ]),
    titled(RJ, 'rejects an oversize entry and a data block past the buffer', [
      readStep(
        'oversize entry',
        gz([
          ...ok('lib/a.dylib', Buffer.from('hello world, too long')),
          ...ok('lib/b.dylib', B)
        ])
      ),
      readStep(
        'data block past the buffer',
        gz([header({ name: 'lib/a.dylib', size: 5 })], false)
      )
    ]),
    titled(RJ, 'rejects gunzip output beyond the limit', [
      readStep('limit 600', gz(good), EXPECTED, 600)
    ]),

    // ---- shapes the TS tests leave out (D-14) ----
    named('traversal-name-as-the-only-entry', [
      readStep('dotdot first', gz(entry({ name: '../x' }, A)), { '../x': 5 }),
      readStep(
        'dotdot in the middle of an expected path',
        gz(entry({ name: 'lib/../lib/a.dylib' }, A)),
        { 'lib/../lib/a.dylib': 5 }
      )
    ]),
    named('non-regular-entry-with-an-expected-path', [
      readStep(
        'symlink named like an expected file',
        gz(entry({ name: 'lib/a.dylib', typeflag: '2' })),
        { 'lib/a.dylib': 0 }
      ),
      readStep(
        'directory named like an expected file',
        gz(entry({ name: 'lib/a.dylib', typeflag: '5' })),
        { 'lib/a.dylib': 0 }
      )
    ]),
    named('unexpected-path-as-the-only-entry', [
      readStep('only an unexpected path', gz(ok('lib/c.dylib', A)))
    ]),
    named('missing-paths-in-an-empty-archive', [
      readStep('zero blocks only, two expected', gz([])),
      readStep('zero blocks only, none expected', gz([]), {})
    ]),
    named('entry-smaller-than-the-pinned-size-is-accepted', [
      readStep(
        'a is 3 bytes, pinned 5',
        gz([...ok('lib/a.dylib', Buffer.from('hel')), ...ok('lib/b.dylib', B)])
      ),
      readStep(
        'a is empty, pinned 5',
        gz([...ok('lib/a.dylib', Buffer.alloc(0)), ...ok('lib/b.dylib', B)])
      )
    ]),
    named('size-field-is-not-octal', [
      readStep(
        'letters in the size field',
        gz(entry({ name: 'lib/a.dylib', sizeText: 'zzzzzzzzzzz\0' }, A))
      ),
      readStep(
        'empty size field',
        gz(entry({ name: 'lib/a.dylib', sizeText: '\0' }, A))
      )
    ]),
    named('name-field-shapes', [
      readStep('non-ASCII name', gz(entry({ name: 'lib/é.dylib' }, A)), {
        'lib/é.dylib': 5
      }),
      readStep(
        'a name that fills the 100 byte field',
        gz(entry({ name: 'a'.repeat(100) }, A)),
        { ['a'.repeat(100)]: 5 }
      ),
      readStep('a 99 byte name', gz(entry({ name: 'a'.repeat(99) }, A)), {
        ['a'.repeat(99)]: 5
      }),
      readStep(
        'a control character in the name',
        gz(entry({ name: 'lib/a\tb' }, A)),
        { 'lib/a\tb': 5 }
      )
    ]),
    named('limit-at-and-one-below-the-tar-length', [
      readStep('limit equals the tar length', gz(good), EXPECTED, 3072),
      readStep('limit one below the tar length', gz(good), EXPECTED, 3071)
    ]),
    named('input-that-is-not-gzip', [
      readStep('plain text', Buffer.from('hello, this is not gzip')),
      readStep('empty input', Buffer.alloc(0))
    ]),
    named('build-three-files-sorted-by-bytes', [
      {
        op: 'build',
        label: 'b, a/b, a.c and A',
        files: [
          text('b', 'b'),
          text('a/b', 'ab'),
          text('a.c', 'ac'),
          text('A', 'A')
        ]
      }
    ]),
    named('build-empty-block-sized-and-multi-block-files', [
      {
        op: 'build',
        label: 'empty, 512 bytes, 513 bytes, 1300 bytes',
        files: [
          text('empty', ''),
          text('block', 'k'.repeat(512)),
          text('block-plus-one', 'l'.repeat(513)),
          text('multi', 'm'.repeat(1300))
        ]
      },
      { op: 'build', label: 'no files', files: [] }
    ]),
    named('build-path-limits', [
      {
        op: 'build',
        label: '99 byte path',
        files: [text('a'.repeat(99), A)]
      },
      {
        op: 'build',
        label: '100 byte path',
        files: [text('a'.repeat(100), A)]
      },
      { op: 'build', label: 'non-ASCII', files: [text('lib/é', A)] },
      { op: 'build', label: 'tab', files: [text('lib/a\tb', A)] },
      { op: 'build', label: 'dot segment alone', files: [text('.', A)] },
      { op: 'build', label: 'trailing slash', files: [text('lib/', A)] }
    ])
  ]
}

// ---------------------------------------------------------------------------------------------
// overlay_install
// ---------------------------------------------------------------------------------------------

export type FetchKind =
  | 'ok'
  | 'reject'
  | 'never'
  | 'wrong-bytes'
  | 'hostile-ts-shape'
  | 'hostile-dotdot'
export type PinKind =
  | 'good'
  | 'zero-sha'
  | 'size-plus-one'
  | 'hostile-ts-shape'
  | 'hostile-dotdot'
export type DamageKind =
  | 'extra-in-plugin-subdir'
  | 'corrupted-file'
  | 'wrong-size'
  | 'symlink-in-place-of-a-file'
  | 'lib-is-a-symlink'
  | 'extra-root-file'

export type InstallStep = (
  | {
      op: 'ensure'
      /** Each call is one `ensureOverlayInstalled`; boot A and B have their own single-flight table and root. */
      calls?: { boot: 'A' | 'B' }[]
      pins?: PinKind
      fetch: FetchKind
      timeoutMs?: number
      /** With `fetch: 'never'`: abort through the registry instead of passing the deadline. */
      abort?: true
      entryId?: string
    }
  | { op: 'damage'; kind: DamageKind }
  | { op: 'verify'; target?: 'installed' | 'missing' }
  | { op: 'validate'; raw?: unknown }
  | {
      op: 'resolveEnv'
      raw?: unknown
      platform: 'darwin' | 'linux' | 'win32'
      wineType?: string
      base: Record<string, string>
      install: 'dir' | 'null' | 'reject'
    }
  | {
      op: 'profileEnv'
      appName: string
      runner: Runner
      settings: Record<string, unknown>
      tier1Env: Record<string, string>
      processEnv: Record<string, string>
      install: 'dir' | 'null' | 'reject'
    }
  | { op: 'appendPathList'; existing?: string; dir: string }
  | {
      op: 'lastEnvOption'
      options?: { key: string; value: string }[]
      key: string
    }
  | {
      op: 'formatLine'
      entries: { key: string; value: string; source: string }[]
    }
  | {
      op: 'logLine'
      label: string
      entries: { key: string; value: string; source: string }[]
    }
  | {
      op: 'withEnv'
      settings: Record<string, unknown>
      env: Record<string, string>
    }
  | { op: 'filterTier1'; appName: string; layer: string; parsed: unknown }
  | { op: 'catalogue' }
) & { seed?: SeedEntry[] }

export interface InstallCase {
  id: string
  title?: string
  /** The overlay's files; the fixture archive and every pin come from them. */
  payload?: FileSpec[]
  steps: InstallStep[]
}

export const PAYLOAD: FileSpec[] = [
  text('lib/gstreamer-1.0/libplug.dylib', 'plug'),
  text('lib/libdep.1.dylib', 'dependency bytes')
]

const OVERLAY_ID = 'gst-libav-1.24.13'
const GOOD = { id: OVERLAY_ID, target: 'gstreamer-plugin-path' }
const DIR = `<APPFOLDER>/overlays/${OVERLAY_ID}`
const PLUG = `${DIR}/lib/gstreamer-1.0`

const ensure = (
  fetch: FetchKind,
  extra: Partial<Extract<InstallStep, { op: 'ensure' }>> = {}
): InstallStep => ({ op: 'ensure', fetch, ...extra }) as InstallStep
const damage = (kind: DamageKind): InstallStep => ({ op: 'damage', kind })
const verify = (target?: 'installed' | 'missing'): InstallStep => ({
  op: 'verify',
  ...(target ? { target } : {})
})
const validate = (raw?: unknown): InstallStep => ({ op: 'validate', raw })
const resolveEnv = (
  raw: unknown,
  over: Partial<Extract<InstallStep, { op: 'resolveEnv' }>> = {}
): InstallStep =>
  ({
    op: 'resolveEnv',
    raw,
    platform: 'darwin',
    wineType: 'crossover',
    base: {},
    install: 'dir',
    ...over
  }) as InstallStep

const tier2Profile = (body: unknown): SeedEntry => ({
  path: '<HOME>/public/fixes/1-gog.profile.json',
  text: JSON.stringify(body)
})
const profileEnv = (
  settings: Record<string, unknown>,
  tier1Env: Record<string, string>,
  processEnv: Record<string, string> = {}
): InstallStep => ({
  op: 'profileEnv',
  appName: '1',
  runner: 'gog',
  settings,
  tier1Env,
  processEnv,
  install: 'dir'
})

const IT = (title: string, steps: InstallStep[], payload?: FileSpec[]) =>
  ({
    id: `knownFixOverlayInstall--${slug(`ensureOverlayInstalled > ${title}`)}`,
    title: `ensureOverlayInstalled > ${title}`,
    ...(payload ? { payload } : {}),
    steps
  }) satisfies InstallCase

const OV = (group: string, title: string, steps: InstallStep[]) =>
  ({
    id: `knownFixOverlays--${slug(`${group} > ${title}`)}`,
    title: `${group} > ${title}`,
    steps
  }) satisfies InstallCase

export function buildInstallCases(): InstallCase[] {
  const bundled284100 = JSON.parse(
    readFileSync(
      join(__dirname, '../../../../public/fixes/284100-steam.profile.json'),
      'utf8'
    )
  ) as { overlays?: unknown }
  const crossoverSettings = (
    over: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    wineVersion: { type: 'crossover' },
    enviromentOptions: [{ key: 'GST_PLUGIN_PATH', value: '/opt' }],
    ...over
  })
  const SET = (key: string, value: string) => ({ key, value })

  return [
    // ---- knownFixOverlayInstall.test.ts ----
    IT('installs fresh, then is idempotent', [
      ensure('ok'),
      ensure('ok'),
      verify()
    ]),
    IT('accepts an extra root-level file without fetching', [
      ensure('ok'),
      damage('extra-root-file'),
      verify(),
      ensure('ok')
    ]),
    IT(
      'with %s > is invalid and gets replaced',
      (
        [
          'extra-in-plugin-subdir',
          'corrupted-file',
          'wrong-size',
          'symlink-in-place-of-a-file',
          'lib-is-a-symlink'
        ] as DamageKind[]
      ).flatMap((kind) => [
        ...(kind === 'extra-in-plugin-subdir' ? [ensure('ok')] : []),
        damage(kind),
        verify(),
        ensure('ok'),
        verify()
      ])
    ),
    IT('refuses a sha mismatch and a length mismatch', [
      ensure('ok', { pins: 'zero-sha' }),
      ensure('ok', { pins: 'size-plus-one' })
    ]),
    IT('refuses a hostile archive whose sha matches the pin', [
      ensure('hostile-ts-shape', { pins: 'hostile-ts-shape' })
    ]),
    IT('fails open when the fetch rejects', [ensure('reject')]),
    IT('times out a fetch that never settles', [ensure('never')]),
    IT('shares one fetch between concurrent calls', [
      ensure('ok', { calls: [{ boot: 'A' }, { boot: 'A' }] })
    ]),
    IT('does not share a fetch across two boots (per-instance single-flight)', [
      ensure('ok', { calls: [{ boot: 'A' }, { boot: 'B' }] })
    ]),
    {
      id: `knownFixOverlayInstall--${slug('real catalogue > pins the 10 files and the archive')}`,
      title: 'real catalogue > pins the 10 files and the archive',
      steps: [{ op: 'catalogue' }]
    },

    // ---- install outcomes (D-14) ----
    {
      id: 'outcome-success',
      steps: [ensure('ok'), verify()]
    },
    {
      id: 'outcome-sha-mismatch-with-the-right-length',
      steps: [ensure('wrong-bytes')]
    },
    {
      id: 'outcome-download-failure',
      steps: [ensure('reject')]
    },
    {
      id: 'outcome-timeout-at-the-120000-ms-deadline-and-at-a-custom-one',
      steps: [ensure('never'), ensure('never', { timeoutMs: 50 })]
    },
    {
      id: 'outcome-abort-through-the-registry',
      steps: [ensure('never', { abort: true })]
    },
    {
      id: 'outcome-hostile-archive-with-a-real-dotdot-entry',
      steps: [ensure('hostile-dotdot', { pins: 'hostile-dotdot' })]
    },
    {
      id: 'outcome-invalid-overlay-id',
      steps: [
        ensure('ok', { entryId: 'Bad/Id' }),
        ensure('ok', { entryId: '../escape' }),
        ensure('ok', { entryId: '' })
      ]
    },
    {
      id: 'verify-installed-overlay-reasons',
      steps: [
        verify('missing'),
        ensure('ok'),
        verify(),
        damage('extra-in-plugin-subdir'),
        verify(),
        damage('lib-is-a-symlink'),
        verify()
      ]
    },

    // ---- knownFixOverlays.test.ts ----
    OV('validateOverlayEntries', 'undefined is silent', [validate(undefined)]),
    OV('validateOverlayEntries', 'non-array warns', [validate({})]),
    OV('validateOverlayEntries', 'accepts a catalogue entry', [
      validate([GOOD])
    ]),
    OV(
      'validateOverlayEntries',
      'rejects %s but keeps the others',
      [
        'x',
        { target: 'gstreamer-plugin-path' },
        { id: 5, target: 'gstreamer-plugin-path' },
        { id: OVERLAY_ID },
        { id: OVERLAY_ID, target: 'dll-dir' },
        { ...GOOD, url: 'https://evil.example/x.tar.gz' },
        { ...GOOD, sha256: 'a'.repeat(64) },
        { ...GOOD, archiveSha256: 'a'.repeat(64) },
        { id: 'nope', target: 'gstreamer-plugin-path' },
        { id: '__proto__', target: 'gstreamer-plugin-path' }
      ].map((bad) => validate([bad, GOOD]))
    ),
    OV('validateOverlayEntries', 'keeps a duplicate id once', [
      validate([GOOD, GOOD])
    ]),
    OV('validateOverlayEntries', 'considers at most 8 entries', [
      validate(Array.from({ length: 10 }, () => 'x'))
    ]),
    OV(
      'resolveKnownFixOverlayEnv',
      'is a no-op on %s',
      (['linux', 'win32'] as const).map((platform) =>
        resolveEnv([GOOD], { platform })
      )
    ),
    OV(
      'resolveKnownFixOverlayEnv',
      'is a no-op for wineType %s',
      ['wine', 'toolkit', undefined].map((wineType) =>
        resolveEnv([GOOD], { wineType })
      )
    ),
    OV(
      'resolveKnownFixOverlayEnv',
      'emits GST_PLUGIN_PATH on darwin + crossover',
      [resolveEnv([GOOD])]
    ),
    OV(
      'resolveKnownFixOverlayEnv',
      'returns {} when the install fails or throws',
      [
        resolveEnv([GOOD], { install: 'null' }),
        resolveEnv([GOOD], { install: 'reject' })
      ]
    ),
    OV(
      'resolveKnownFixOverlayEnv',
      'appends to an existing value and warns about GST_PLUGIN_PATH_1_0',
      [
        resolveEnv([GOOD], {
          base: { GST_PLUGIN_PATH: '/a', GST_PLUGIN_PATH_1_0: '/b' }
        })
      ]
    ),
    OV('appendPathList', 'handles empty bases', [
      { op: 'appendPathList', dir: '/d' },
      { op: 'appendPathList', existing: '', dir: '/d' }
    ]),
    OV('appendPathList', 'appends with a colon', [
      { op: 'appendPathList', existing: 'a:b', dir: '/d' }
    ]),
    OV(
      'appendPathList',
      'does not duplicate %s',
      ['/d', '/d/', '/x/../d'].map(
        (existing): InstallStep => ({
          op: 'appendPathList',
          existing: `/p:${existing}`,
          dir: '/d'
        })
      )
    ),
    OV('appendPathList', 'drops empty segments', [
      { op: 'appendPathList', existing: ':a::b:', dir: '/d' }
    ]),
    OV(
      'knownFixProfileOverlayEnv base precedence',
      'tier-1 beats enviromentOptions beats process.env',
      [
        {
          ...profileEnv(
            crossoverSettings(),
            { GST_PLUGIN_PATH: '/t1' },
            { GST_PLUGIN_PATH: '/proc' }
          ),
          seed: [tier2Profile({ overlays: [GOOD] })]
        } as InstallStep,
        profileEnv(crossoverSettings(), {}, { GST_PLUGIN_PATH: '/proc' }),
        profileEnv(
          crossoverSettings({ enviromentOptions: [] }),
          {},
          { GST_PLUGIN_PATH: '/proc' }
        )
      ]
    ),
    OV(
      'knownFixProfileOverlayEnv base precedence',
      'does not double the dir when tier-1 already holds it',
      [
        {
          ...profileEnv(crossoverSettings(), { GST_PLUGIN_PATH: PLUG }),
          seed: [tier2Profile({ overlays: [GOOD] })]
        } as InstallStep
      ]
    ),
    OV('env helpers', 'lastEnvOption: last match wins', [
      {
        op: 'lastEnvOption',
        options: [SET('A', '1'), SET('A', '2')],
        key: 'A'
      },
      { op: 'lastEnvOption', key: 'A' }
    ]),
    OV('env helpers', 'formatKnownFixEnvLine / logKnownFixEnv', [
      { op: 'formatLine', entries: [] },
      {
        op: 'formatLine',
        entries: [
          { key: 'A', value: '1', source: 'tier-1' },
          { key: 'B', value: 'x'.repeat(600), source: 'overlay' }
        ]
      },
      { op: 'logLine', label: 'l', entries: [] },
      {
        op: 'logLine',
        label: 'l',
        entries: [{ key: 'A', value: '1', source: 'overlay' }]
      }
    ]),
    OV('env helpers', 'withKnownFixEnv appends without mutating', [
      {
        op: 'withEnv',
        settings: { enviromentOptions: [SET('A', '1')] },
        env: {}
      },
      {
        op: 'withEnv',
        settings: { enviromentOptions: [SET('A', '1')] },
        env: { B: '2' }
      }
    ]),
    OV('tier boundaries', 'the remote layer drops overlays', [
      {
        op: 'filterTier1',
        appName: '284100',
        layer: 'remote',
        parsed: { title: 't', overlays: [GOOD] }
      }
    ]),
    OV('tier boundaries', 'the bundled 284100 profile validates cleanly', [
      validate(bundled284100.overlays)
    ]),

    // ---- env shapes the TS tests leave out ----
    {
      id: 'env-appends-the-plugin-dir-once-when-already-in-the-base',
      steps: [
        resolveEnv([GOOD], { base: { GST_PLUGIN_PATH: PLUG } }),
        resolveEnv([GOOD], { base: { GST_PLUGIN_PATH: `/a:${PLUG}/` } })
      ]
    }
  ]
}
