/**
 * quick 261027-n77: deterministic overlay archive writer and the strict reader.
 * Hostile headers are built with this file's OWN small ustar encoder, so the
 * module under test exports nothing test-only.
 */

import { gzipSync } from 'zlib'
import { buildOverlayTarGz, readOverlayTarGz } from '../knownFixOverlayArchive'

interface HeaderOpts {
  name: string
  size?: number
  typeflag?: string
  magic?: string
  version?: string
  prefix?: string
  badChecksum?: boolean
}

function header(o: HeaderOpts): Buffer {
  const h = Buffer.alloc(512)
  h.write(o.name, 0, 'ascii')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write((o.size ?? 0).toString(8).padStart(11, '0') + '\0', 124, 'ascii')
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

function gz(...parts: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]))
}

const A = Buffer.from('hello')
const B = Buffer.from('world!!')
const expected = new Map([
  ['lib/a.dylib', A.length],
  ['lib/b.dylib', B.length]
])
const LIMIT = 1024 * 1024

describe('buildOverlayTarGz', () => {
  const files = [
    { path: 'lib/b.dylib', data: B },
    { path: 'lib/a.dylib', data: A }
  ]

  it('round-trips byte-exactly', async () => {
    const out = await readOverlayTarGz(
      buildOverlayTarGz(files),
      expected,
      LIMIT
    )
    expect(out.get('lib/a.dylib')).toEqual(A)
    expect(out.get('lib/b.dylib')).toEqual(B)
  })

  it('is byte-identical across runs and input order', () => {
    const one = buildOverlayTarGz(files)
    const two = buildOverlayTarGz([...files].reverse())
    expect(one.equals(two)).toBe(true)
  })

  it('pins gzip mtime and OS byte and tar header fields', () => {
    const arc = buildOverlayTarGz(files)
    expect(arc.readUInt32LE(4)).toBe(0)
    expect(arc[9]).toBe(0x03)
    const tar = require('zlib').gunzipSync(arc) as Buffer
    expect(tar.length % 10240).toBe(0)
    const h = tar.subarray(0, 512)
    expect(h.subarray(0, 11).toString()).toBe('lib/a.dylib')
    expect(h.subarray(100, 107).toString()).toBe('0000644')
    expect(h.subarray(108, 115).toString()).toBe('0000000')
    expect(h.subarray(116, 123).toString()).toBe('0000000')
    expect(h.subarray(136, 147).toString()).toBe('00000000000')
    expect(h.subarray(156, 157).toString()).toBe('0')
    expect(h.subarray(265, 297).every((b) => b === 0)).toBe(true)
    expect(h.subarray(297, 329).every((b) => b === 0)).toBe(true)
  })

  it('rejects bad and duplicate paths', () => {
    for (const path of ['/abs', 'a/../b', './a', 'a//b', 'a\\b', '']) {
      expect(() => buildOverlayTarGz([{ path, data: A }])).toThrow()
    }
    expect(() =>
      buildOverlayTarGz([
        { path: 'x', data: A },
        { path: 'x', data: B }
      ])
    ).toThrow(/duplicate/)
  })
})

describe('readOverlayTarGz rejections', () => {
  const ok = (name: string, data: Buffer) => entry({ name }, data)
  const good = [...ok('lib/a.dylib', A), ...ok('lib/b.dylib', B)]

  it('accepts a hand-built good archive', async () => {
    const out = await readOverlayTarGz(gz(...good), expected, LIMIT)
    expect(out.size).toBe(2)
  })

  it.each([
    ['absolute path', '/etc/x'],
    ['dotdot segment', 'lib/../x'],
    ['dot segment', 'lib/./a.dylib'],
    ['empty segment', 'lib//a.dylib'],
    ['backslash', 'lib\\a.dylib']
  ])('rejects %s', async (_l, name) => {
    await expect(
      readOverlayTarGz(gz(...entry({ name }, A), ...good), expected, LIMIT)
    ).rejects.toThrow()
  })

  it.each([
    ['hardlink', '1'],
    ['symlink', '2'],
    ['directory', '5'],
    ['pax x', 'x'],
    ['pax g', 'g'],
    ['GNU long name', 'L'],
    ['GNU long link', 'K']
  ])('rejects typeflag %s', async (_l, typeflag) => {
    await expect(
      readOverlayTarGz(
        gz(
          ...entry({ name: 'lib/a.dylib', typeflag }, A),
          ...ok('lib/b.dylib', B)
        ),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/unsupported entry type/)
  })

  it('rejects a ustar prefix', async () => {
    await expect(
      readOverlayTarGz(
        gz(...entry({ name: 'lib/a.dylib', prefix: 'evil' }, A)),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/prefix/)
  })

  it('rejects non-ustar and GNU magic', async () => {
    for (const magic of ['\0\0\0\0\0\0', 'ustar ']) {
      await expect(
        readOverlayTarGz(
          gz(...entry({ name: 'lib/a.dylib', magic, version: ' \0' }, A)),
          expected,
          LIMIT
        )
      ).rejects.toThrow(/ustar/)
    }
  })

  it('rejects a bad checksum', async () => {
    await expect(
      readOverlayTarGz(
        gz(...entry({ name: 'lib/a.dylib', badChecksum: true }, A)),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/checksum/)
  })

  it('rejects unexpected, duplicate and missing paths', async () => {
    await expect(
      readOverlayTarGz(gz(...good, ...ok('lib/c.dylib', A)), expected, LIMIT)
    ).rejects.toThrow(/unexpected path/)
    await expect(
      readOverlayTarGz(
        gz(...ok('lib/a.dylib', A), ...ok('lib/a.dylib', A)),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/duplicate/)
    await expect(
      readOverlayTarGz(gz(...ok('lib/a.dylib', A)), expected, LIMIT)
    ).rejects.toThrow(/missing expected/)
  })

  it('rejects an oversize entry and a data block past the buffer', async () => {
    await expect(
      readOverlayTarGz(
        gz(
          ...ok('lib/a.dylib', Buffer.from('hello world, too long')),
          ...ok('lib/b.dylib', B)
        ),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/larger than expected/)
    await expect(
      readOverlayTarGz(
        gzipSync(header({ name: 'lib/a.dylib', size: 5 })),
        expected,
        LIMIT
      )
    ).rejects.toThrow(/truncated/)
  })

  it('rejects gunzip output beyond the limit', async () => {
    await expect(readOverlayTarGz(gz(...good), expected, 600)).rejects.toThrow(
      /exceeded/
    )
  })
})
