import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findMacSteamApiFiles,
  cpuTypesRunnable,
  listMachOCpuTypes,
  listMachODylibs,
  machOLinksSteamApi,
  type RangedRead
} from '../directLaunch/machoSteamApi'

const LC_LOAD_DYLIB = 0xc
const LC_LOAD_WEAK_DYLIB = 0x80000018
const LC_REEXPORT_DYLIB = 0x8000001f

function dylibCmd(cmd: number, name: string, le: boolean): Buffer {
  const nameBytes = Buffer.from(name + '\0', 'utf8')
  const cmdsize = Math.ceil((24 + nameBytes.length) / 8) * 8
  const b = Buffer.alloc(cmdsize)
  const w = (v: number, o: number) =>
    le ? b.writeUInt32LE(v, o) : b.writeUInt32BE(v, o)
  w(cmd, 0)
  w(cmdsize, 4)
  w(24, 8) // lc_str offset
  nameBytes.copy(b, 24)
  return b
}

function thin(
  names: Array<[number, string]>,
  opts: { is64?: boolean; le?: boolean } = {}
): Buffer {
  const is64 = opts.is64 ?? true
  const le = opts.le ?? true
  const cmds = Buffer.concat(names.map(([c, n]) => dylibCmd(c, n, le)))
  const header = Buffer.alloc(is64 ? 32 : 28)
  const w = (v: number, o: number) =>
    le ? header.writeUInt32LE(v, o) : header.writeUInt32BE(v, o)
  // magic bytes in file order
  const magic = is64 ? 0xfeedfacf : 0xfeedface
  if (le) header.writeUInt32LE(magic, 0)
  else header.writeUInt32BE(magic, 0)
  w(names.length, 16)
  w(cmds.length, 20)
  return Buffer.concat([header, cmds])
}

function reader(buf: Buffer): RangedRead {
  return (offset, length) =>
    Promise.resolve(buf.subarray(offset, Math.min(buf.length, offset + length)))
}

function fat(slices: Buffer[], is64 = false): Buffer {
  const entry = is64 ? 32 : 20
  const headLen = 8 + slices.length * entry
  const head = Buffer.alloc(headLen)
  head.writeUInt32BE(is64 ? 0xcafebabf : 0xcafebabe, 0)
  head.writeUInt32BE(slices.length, 4)
  let off = Math.ceil(headLen / 16) * 16
  const parts: Buffer[] = [head, Buffer.alloc(off - headLen)]
  slices.forEach((s, i) => {
    const o = 8 + i * entry
    if (is64) head.writeBigUInt64BE(BigInt(off), o + 8)
    else head.writeUInt32BE(off, o + 8)
    parts.push(s)
    off += s.length
  })
  return Buffer.concat(parts)
}

describe('listMachODylibs', () => {
  test('thin 64-bit LE with libsteam_api via LC_LOAD_DYLIB', async () => {
    const buf = thin([[LC_LOAD_DYLIB, '@rpath/libsteam_api.dylib']])
    expect(await listMachODylibs(reader(buf))).toContain(
      '@rpath/libsteam_api.dylib'
    )
  })

  test('only libSystem is clean', async () => {
    const buf = thin([[LC_LOAD_DYLIB, '/usr/lib/libSystem.B.dylib']])
    expect(await listMachODylibs(reader(buf))).toEqual([
      '/usr/lib/libSystem.B.dylib'
    ])
  })

  test.each([
    ['weak', LC_LOAD_WEAK_DYLIB],
    ['reexport', LC_REEXPORT_DYLIB]
  ])('%s load commands are listed', async (_n, cmd) => {
    const buf = thin([[cmd, '@rpath/libsteam_api.dylib']])
    expect(await listMachODylibs(reader(buf))).toEqual([
      '@rpath/libsteam_api.dylib'
    ])
  })

  test('thin 32-bit parses', async () => {
    const buf = thin([[LC_LOAD_DYLIB, 'libsteam_api.dylib']], { is64: false })
    expect(await listMachODylibs(reader(buf))).toEqual(['libsteam_api.dylib'])
  })

  test('big-endian (byte-swapped) magic parses', async () => {
    const buf = thin([[LC_LOAD_DYLIB, 'libsteam_api.dylib']], { le: false })
    expect(await listMachODylibs(reader(buf))).toEqual(['libsteam_api.dylib'])
  })

  test('fat with two slices unions the dylibs', async () => {
    const a = thin([[LC_LOAD_DYLIB, '/usr/lib/libSystem.B.dylib']])
    const b = thin([[LC_LOAD_DYLIB, '@rpath/libsteam_api.dylib']])
    const names = await listMachODylibs(reader(fat([a, b])))
    expect(names).toEqual(
      expect.arrayContaining([
        '/usr/lib/libSystem.B.dylib',
        '@rpath/libsteam_api.dylib'
      ])
    )
  })

  test('fat64 parses', async () => {
    const a = thin([[LC_LOAD_DYLIB, '@rpath/libsteam_api.dylib']])
    expect(await listMachODylibs(reader(fat([a], true)))).toEqual([
      '@rpath/libsteam_api.dylib'
    ])
  })

  test('a Java class file (cafebabe, huge nfat) is unreadable', async () => {
    const b = Buffer.alloc(64)
    b.writeUInt32BE(0xcafebabe, 0)
    b.writeUInt32BE(52, 4)
    expect(await listMachODylibs(reader(b))).toBeNull()
  })

  test('random bytes are unreadable', async () => {
    const b = Buffer.from('this is definitely not a mach-o file at all....')
    expect(await listMachODylibs(reader(b))).toBeNull()
  })

  test('truncated / malicious load commands never throw', async () => {
    const good = thin([[LC_LOAD_DYLIB, 'libsteam_api.dylib']])
    const zero = Buffer.from(good)
    zero.writeUInt32LE(0, 32 + 4) // cmdsize 0
    const past = Buffer.from(good)
    past.writeUInt32LE(99999, 32 + 4) // cmdsize beyond sizeofcmds
    const nameOff = Buffer.from(good)
    nameOff.writeUInt32LE(4000, 32 + 8) // name offset beyond cmdsize
    const cut = good.subarray(0, 40)
    for (const b of [zero, past, nameOff, cut]) {
      expect(await listMachODylibs(reader(b))).toBeNull()
    }
  })

  test('a reader that throws yields null', async () => {
    const boom: RangedRead = () => Promise.reject(new Error('io'))
    expect(await listMachODylibs(boom)).toBeNull()
  })
})

describe('machOLinksSteamApi and findMacSteamApiFiles (temp dir)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p38-macho-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('classifies files on disk', async () => {
    const links = join(dir, 'links')
    const clean = join(dir, 'clean')
    const junk = join(dir, 'junk')
    writeFileSync(links, thin([[LC_LOAD_DYLIB, '@rpath/libsteam_api.dylib']]))
    writeFileSync(clean, thin([[LC_LOAD_DYLIB, '/usr/lib/libSystem.B.dylib']]))
    writeFileSync(junk, 'nope')
    expect(await machOLinksSteamApi(links)).toBe('links')
    expect(await machOLinksSteamApi(clean)).toBe('clean')
    expect(await machOLinksSteamApi(junk)).toBe('unreadable')
    expect(await machOLinksSteamApi(join(dir, 'missing'))).toBe('unreadable')
  })

  test('finds the bundle dir and the dylib, ignores symlinks', async () => {
    const app = join(dir, 'Foo.app', 'Contents')
    mkdirSync(join(app, 'Plugins', 'steam_api.bundle'), { recursive: true })
    mkdirSync(join(app, 'Frameworks'), { recursive: true })
    writeFileSync(join(app, 'Frameworks', 'LibSteam_API.dylib'), 'x')
    // Unity / Facepunch.Steamworks ships it as a lib-prefixed bundle (WazHack).
    mkdirSync(join(app, 'Plugins', 'libsteam_api.bundle', 'Contents'), {
      recursive: true
    })
    mkdirSync(join(dir, 'elsewhere'))
    writeFileSync(join(dir, 'elsewhere', 'libsteam_api.dylib'), 'x')
    symlinkSync(join(dir, 'elsewhere'), join(dir, 'Foo.app', 'link'))
    const found = (await findMacSteamApiFiles(join(dir, 'Foo.app'))).sort()
    expect(found).toEqual([
      join(app, 'Frameworks', 'LibSteam_API.dylib'),
      join(app, 'Plugins', 'libsteam_api.bundle'),
      join(app, 'Plugins', 'steam_api.bundle')
    ])
  })

  test('a clean tree has none', async () => {
    mkdirSync(join(dir, 'a', 'b'), { recursive: true })
    writeFileSync(join(dir, 'a', 'b', 'game'), 'x')
    writeFileSync(join(dir, 'a', 'steam_api_notes.txt'), 'x')
    expect(await findMacSteamApiFiles(dir)).toEqual([])
  })
})

describe('listMachOCpuTypes and cpuTypesRunnable', () => {
  const I386 = 7
  const X86_64 = 0x01000007
  const ARM64 = 0x0100000c
  const PPC = 18
  const thinOf = (cpu: number, le = true) => {
    const b = Buffer.alloc(28)
    if (le) {
      b.writeUInt32LE(0xfeedface, 0)
      b.writeUInt32LE(cpu, 4)
    } else {
      b.writeUInt32BE(0xfeedface, 0)
      b.writeUInt32BE(cpu, 4)
    }
    return b
  }
  const fatOf = (cpus: number[]) => {
    const b = Buffer.alloc(8 + cpus.length * 20)
    b.writeUInt32BE(0xcafebabe, 0)
    b.writeUInt32BE(cpus.length, 4)
    cpus.forEach((c, i) => b.writeUInt32BE(c, 8 + i * 20))
    return b
  }

  test('reads thin (both byte orders) and fat cpu types', async () => {
    expect(await listMachOCpuTypes(reader(thinOf(I386)))).toEqual([I386])
    expect(await listMachOCpuTypes(reader(thinOf(I386, false)))).toEqual([I386])
    expect(await listMachOCpuTypes(reader(fatOf([I386, PPC])))).toEqual([
      I386,
      PPC
    ])
    expect(await listMachOCpuTypes(reader(Buffer.from('nope')))).toBeNull()
  })

  test('i386/PPC-only never runs; x86_64 runs everywhere; arm64 only on Apple silicon', () => {
    expect(cpuTypesRunnable([I386], 'arm64')).toBe(false)
    expect(cpuTypesRunnable([I386, PPC], 'x64')).toBe(false)
    expect(cpuTypesRunnable([I386, X86_64], 'arm64')).toBe(true)
    expect(cpuTypesRunnable([X86_64], 'x64')).toBe(true)
    expect(cpuTypesRunnable([ARM64], 'arm64')).toBe(true)
    expect(cpuTypesRunnable([ARM64], 'x64')).toBe(false)
  })
})
