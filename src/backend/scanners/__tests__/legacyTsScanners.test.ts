import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildDelayImportPe } from '../../storeManagers/steam/bridge/__tests__/fixtures/delayImportPe'
import { buildImportPe } from '../../storeManagers/steam/bridge/__tests__/fixtures/importPe'
import {
  containedRealTs,
  peDelayImportsTs,
  peImportedDllsTs,
  steamDrmTs,
  steamstubSectionTs,
  winemacMetalExportsTs
} from '../legacyTsScanners'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gamelib-legacyts-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function buildSectionPe(names: string[]): Buffer {
  const pe = 0x80
  const optSize = 0xf0
  const table = pe + 24 + optSize
  const buf = Buffer.alloc(table + names.length * 40)
  buf.writeUInt16LE(0x5a4d, 0)
  buf.writeUInt32LE(pe, 0x3c)
  buf.writeUInt32LE(0x4550, pe)
  buf.writeUInt16LE(names.length, pe + 6)
  buf.writeUInt16LE(optSize, pe + 20)
  names.forEach((n, i) => buf.write(n, table + i * 40, 8, 'latin1'))
  return buf
}

describe('legacyTsScanners source', () => {
  it('has no backend/ alias imports', () => {
    const src = readFileSync(
      join(__dirname, '..', 'legacyTsScanners.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/from 'backend\//)
  })
})

describe('containedRealTs', () => {
  it('returns the real path for a file inside the root', async () => {
    const f = join(dir, 'a.exe')
    writeFileSync(f, 'x')
    expect(await containedRealTs({ path: f, rootDir: dir })).toEqual({
      real: realpathSync(f),
      reason: null
    })
  })

  it('rejects a symlink that escapes the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'gamelib-legacyts-out-'))
    try {
      const target = join(outside, 'evil.exe')
      writeFileSync(target, 'x')
      const game = join(dir, 'game')
      mkdirSync(game)
      const link = join(game, 'evil.exe')
      symlinkSync(target, link)
      expect(await containedRealTs({ path: link, rootDir: game })).toEqual({
        real: null,
        reason: 'escapes'
      })
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('treats path == rootDir as escaping', async () => {
    expect(await containedRealTs({ path: dir, rootDir: dir })).toEqual({
      real: null,
      reason: 'escapes'
    })
  })

  it('accepts a symlinked root (bottles dir) and returns the real path', async () => {
    const real = join(dir, 'real')
    mkdirSync(real)
    const f = join(real, 'g.exe')
    writeFileSync(f, 'x')
    const link = join(dir, 'link')
    symlinkSync(real, link)
    const r = await containedRealTs({
      path: join(link, 'g.exe'),
      rootDir: link
    })
    expect(r).toEqual({ real: realpathSync(f), reason: null })
  })

  it('reports realpath-failed for a missing file', async () => {
    expect(
      await containedRealTs({ path: join(dir, 'nope.exe'), rootDir: dir })
    ).toEqual({ real: null, reason: 'realpath-failed' })
  })

  it('reports root-unresolvable for a missing root', async () => {
    expect(
      await containedRealTs({ path: join(dir, 'a'), rootDir: join(dir, 'zz') })
    ).toEqual({ real: null, reason: 'root-unresolvable' })
  })
})

describe('steamstubSectionTs', () => {
  it('detects a .bind section', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(p, buildSectionPe(['.text', '.bind']))
    expect(await steamstubSectionTs({ exePath: p })).toEqual({
      drmWrapper: 'steamstub',
      readError: null
    })
  })

  it('reports none without .bind', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(p, buildSectionPe(['.text', '.rdata']))
    expect(await steamstubSectionTs({ exePath: p })).toEqual({
      drmWrapper: 'none',
      readError: null
    })
  })

  it('reports a read error for a missing file', async () => {
    const r = await steamstubSectionTs({ exePath: join(dir, 'missing.exe') })
    expect(r.drmWrapper).toBeNull()
    expect(typeof r.readError).toBe('string')
  })
})

describe('steamDrmTs', () => {
  it('reports parsed with no markers for a plain PE', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(p, buildSectionPe(['.text', '.bind']))
    const r = await steamDrmTs({ exePath: p })
    expect(r.readError).toBeNull()
    expect(Array.isArray(r.cegMarkers)).toBe(true)
  })

  it('reports parsed false for a truncated PE with no read error', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(p, Buffer.from('MZ'))
    expect(await steamDrmTs({ exePath: p })).toEqual({
      parsed: false,
      cegMarkers: [],
      hasBindSection: false,
      readError: null
    })
  })

  it('reports a read error for a missing file', async () => {
    const r = await steamDrmTs({ exePath: join(dir, 'missing.exe') })
    expect(r.parsed).toBe(false)
    expect(r.cegMarkers).toEqual([])
    expect(r.hasBindSection).toBe(false)
    expect(typeof r.readError).toBe('string')
  })
})

describe('peImportedDllsTs', () => {
  it('lists imported DLL names in file order', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(
      p,
      buildImportPe({ plus: true, dlls: ['Engine.dll', 'x.dll'] })
    )
    expect(await peImportedDllsTs({ exePath: p })).toEqual({
      names: ['Engine.dll', 'x.dll'],
      readError: null
    })
  })

  it('reports a read error for a missing file', async () => {
    const r = await peImportedDllsTs({ exePath: join(dir, 'missing.exe') })
    expect(r.names).toBeNull()
    expect(typeof r.readError).toBe('string')
  })
})

describe('peDelayImportsTs', () => {
  it('reads steam_api64 delay imports', async () => {
    const p = join(dir, 'a.exe')
    writeFileSync(
      p,
      buildDelayImportPe({
        plus: true,
        dlls: [{ name: 'steam_api64.dll', imports: ['SteamAPI_Init'] }]
      })
    )
    expect(await peDelayImportsTs({ exePath: p })).toEqual({
      parsed: true,
      dll: 'steam_api64.dll',
      arch: 'x64',
      symbols: ['SteamAPI_Init'],
      conflict: false,
      readError: null
    })
  })

  it('reports a read error for a missing file', async () => {
    const r = await peDelayImportsTs({ exePath: join(dir, 'missing.exe') })
    expect(r).toMatchObject({
      parsed: false,
      dll: null,
      arch: 'none',
      symbols: [],
      conflict: false
    })
    expect(typeof r.readError).toBe('string')
  })
})

describe('winemacMetalExportsTs', () => {
  const winemac = (bundle: string) =>
    join(
      bundle,
      'Contents',
      'Resources',
      'wine',
      'lib',
      'wine',
      'x86_64-unix',
      'winemac.so'
    )

  // Minimal thin x86_64 Mach-O with LC_SYMTAB + LC_DYSYMTAB, defined externals only.
  function thin(names: string[]): Buffer {
    const strs = Buffer.concat([
      Buffer.from([0]),
      ...names.map((n) => Buffer.from(n + '\0'))
    ])
    const cmds = 24 + 80
    const symoff = 32 + cmds
    const stroff = symoff + names.length * 16
    const h = Buffer.alloc(32)
    h.writeUInt32LE(0xfeedfacf, 0)
    h.writeUInt32LE(2, 16)
    h.writeUInt32LE(cmds, 20)
    const st = Buffer.alloc(24)
    st.writeUInt32LE(0x2, 0)
    st.writeUInt32LE(24, 4)
    st.writeUInt32LE(symoff, 8)
    st.writeUInt32LE(names.length, 12)
    st.writeUInt32LE(stroff, 16)
    st.writeUInt32LE(strs.length, 20)
    const dy = Buffer.alloc(80)
    dy.writeUInt32LE(0xb, 0)
    dy.writeUInt32LE(80, 4)
    dy.writeUInt32LE(0, 16)
    dy.writeUInt32LE(names.length, 20)
    const nl = Buffer.alloc(names.length * 16)
    let o = 1
    names.forEach((n, i) => {
      nl.writeUInt32LE(o, i * 16)
      nl.writeUInt8(0x0f, i * 16 + 4)
      o += n.length + 1
    })
    return Buffer.concat([h, st, dy, nl, strs])
  }

  const put = (names: string[]) => {
    const f = winemac(dir)
    mkdirSync(join(f, '..'), { recursive: true })
    writeFileSync(f, thin(names))
  }

  it('passes when _macdrv_functions is defined', async () => {
    put(['_macdrv_functions'])
    expect(await winemacMetalExportsTs({ wineBundlePath: dir })).toEqual({
      ok: true
    })
  })

  it('fails listing the missing names when only two of three exist', async () => {
    put(['_macdrv_view_create_metal_view', '_macdrv_view_get_metal_layer'])
    const r = await winemacMetalExportsTs({ wineBundlePath: dir })
    expect(r).toMatchObject({
      ok: false,
      reason: 'winemac.so lacks the macdrv metal-view exports',
      missing: ['_macdrv_functions', '_macdrv_view_release_metal_view']
    })
  })

  it('fails when winemac.so is absent', async () => {
    const r = await winemacMetalExportsTs({ wineBundlePath: dir })
    expect(r).toMatchObject({ ok: false, reason: 'winemac.so not found' })
  })

  it('fails when the file is not a parseable Mach-O', async () => {
    const f = winemac(dir)
    mkdirSync(join(f, '..'), { recursive: true })
    writeFileSync(f, Buffer.from('not macho'))
    const r = await winemacMetalExportsTs({ wineBundlePath: dir })
    expect(r).toMatchObject({
      ok: false,
      reason: 'winemac.so is not a parseable x86_64 Mach-O'
    })
  })
})
