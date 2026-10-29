import { createHash } from 'crypto'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import {
  buildDetourPayloadSteps,
  buildHelperExeCompileArgv,
  checkPayloadSha,
  DETOUR_BUILD_ROWS,
  drmNativeOutputDir,
  missingDrmNativeInputs,
  missingDrmNativeTools
} from '../buildDrmNativeParts'

const PIN = 'e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb'
const BUILD = '26.3.0.39832'
const PATCH_DIR = 'native/steam-bridge/steamclient-layer/ntdll-patch'
const HELPER_SRC = 'native/steam-bridge/steamclient-layer/helper/steam.c'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('buildHelperExeCompileArgv', () => {
  it('builds a non-shared x86_64-windows-gnu exe named steam.exe', () => {
    const { command, args } = buildHelperExeCompileArgv('/z/zig', '/out')
    expect(command).toBe('/z/zig')
    expect(args.slice(0, 3)).toEqual(['cc', '-target', 'x86_64-windows-gnu'])
    expect(args).toContain('-O2')
    expect(args).toContain('-fno-sanitize=undefined')
    expect(args[args.indexOf('-o') + 1]).toBe(join('/out', 'steam.exe'))
    expect(args).toContain(HELPER_SRC)
    expect(args).toContain('-luser32')
    expect(args).toContain('-ladvapi32')
    expect(args).not.toContain('-shared')
  })
})

describe('buildDetourPayloadSteps', () => {
  const steps = buildDetourPayloadSteps(
    DETOUR_BUILD_ROWS[BUILD],
    '/tmp/w',
    '/out'
  )

  it('returns the four mingw-w64 steps in order', () => {
    expect(steps.map((s) => s.command)).toEqual([
      'x86_64-w64-mingw32-gcc',
      'x86_64-w64-mingw32-gcc',
      'x86_64-w64-mingw32-ld',
      'x86_64-w64-mingw32-objcopy'
    ])
  })

  it('compiles detour.c freestanding', () => {
    const a = steps[0].args
    for (const f of [
      '-Os',
      '-fno-asynchronous-unwind-tables',
      '-ffreestanding',
      '-fno-stack-protector'
    ]) {
      expect(a).toContain(f)
    }
    expect(a.some((x) => x.endsWith('ntdll-patch/detour.c'))).toBe(true)
  })

  it('assembles shim.S with the per-build macros', () => {
    const a = steps[1].args
    expect(a).toContain('-DWM_REG=r14')
    expect(a).toContain('-DSCRATCH_REG=rbx')
    expect(a).toContain('-DLOAD_PATH_SLOT=0xd0')
    expect(a).toContain(
      '-DSTOLEN_BYTES=0x48,0x83,0xbc,0x24,0xf0,0x00,0x00,0x00,0x00'
    )
  })

  it('links with the link script and every defsym', () => {
    const a = steps[2].args
    expect(a[a.indexOf('-T') + 1].endsWith('ntdll-patch/link.ld')).toBe(true)
    expect(a).toContain('CAVE_VA=0x1700ae000')
    expect(a).toContain('BM_RESUME=0x17004497b')
    expect(a).toContain('LDR_GETDLLHANDLE=0x170014bc0')
    expect(a).toContain('LDR_LOADDLL=0x170015680')
    expect(a).toContain('NT_PROTECT=0x17000f380')
    expect(steps[2].cwd).toBe('/tmp/w')
  })

  it('extracts .cave into the named bin', () => {
    const a = steps[3].args
    expect(a.slice(0, 4)).toEqual(['-O', 'binary', '-j', '.cave'])
    expect(a[a.length - 1]).toBe(join('/out', `detour-cx${BUILD}.bin`))
  })
})

describe('DETOUR_BUILD_ROWS', () => {
  it('holds exactly the one allowlisted build', () => {
    expect(Object.keys(DETOUR_BUILD_ROWS)).toEqual([BUILD])
    const row = DETOUR_BUILD_ROWS[BUILD]
    expect(row.payloadSha256).toBe(PIN)
    expect(row.hookRva).toBe(0x44972)
    expect(row.resumeRva).toBe(0x4497b)
    expect(row.stolenHex).toBe('4883bc24f000000000')
  })
})

describe('checkPayloadSha', () => {
  const row = DETOUR_BUILD_ROWS[BUILD]
  it('accepts a buffer matching the pin', () => {
    const buf = Buffer.from('payload')
    const r = checkPayloadSha(buf, {
      ...row,
      payloadSha256: createHash('sha256').update(buf).digest('hex')
    })
    expect(r).toEqual({ ok: true })
  })
  it('rejects a different buffer with the actual digest', () => {
    const buf = Buffer.from('other')
    const r = checkPayloadSha(buf, row)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.actual).toBe(
      createHash('sha256').update(buf).digest('hex')
    )
  })
  it('rejects empty and oversized buffers', () => {
    expect(checkPayloadSha(Buffer.alloc(0), row).ok).toBe(false)
    expect(checkPayloadSha(Buffer.alloc(0x1001), row).ok).toBe(false)
  })
})

describe('prerequisite probes', () => {
  it('lists absent sources in order', () => {
    const missing = missingDrmNativeInputs(() => false)
    expect(missing.map((m) => m.split('/').pop())).toEqual([
      'detour.c',
      'shim.S',
      'link.ld',
      'steam.c'
    ])
    expect(missingDrmNativeInputs(() => true)).toEqual([])
  })
  it('lists absent mingw tools', () => {
    expect(missingDrmNativeTools(() => false)).toEqual([
      'x86_64-w64-mingw32-gcc',
      'x86_64-w64-mingw32-ld',
      'x86_64-w64-mingw32-objcopy'
    ])
    expect(missingDrmNativeTools((t) => t.endsWith('-ld'))).toEqual([
      'x86_64-w64-mingw32-gcc',
      'x86_64-w64-mingw32-objcopy'
    ])
  })
})

describe('drmNativeOutputDir', () => {
  it('is the gitignored staging dir, never a bundled dir', () => {
    const d = drmNativeOutputDir(BUILD)
    expect(d).toBe(
      join('build', 'steamclient-layer', `steamclient-layer-cx${BUILD}`)
    )
    expect(d).not.toContain('public/bin')
    expect(d).not.toContain(join('build', 'bin'))
  })
})

describe('source gates', () => {
  it('uses the fake-HOME helper and exposes main', () => {
    const src = read('meta/buildDrmNativeParts.ts')
    expect(src).toContain('createFakeHomeProfile')
    expect(src).toContain('export async function main')
  })
  it('is not wired into the shim build or release CI', () => {
    expect(read('meta/buildSteamBridgeShims.ts')).not.toContain(
      'buildDrmNativeParts'
    )
    const wf = read('.github/workflows/release-tauri.yml')
    expect(wf).not.toContain('buildDrmNativeParts')
    expect(wf).not.toContain('mingw')
  })
  it('keeps the helper HKCU-only with no DRM responder', () => {
    const src = read(HELPER_SRC)
    expect(src).not.toMatch(/HKEY_LOCAL_MACHINE|HKLM/)
    expect(src).not.toMatch(/steam_drm_thread|STEAMSTART|DIPC|OpenEventW/)
  })
  it('sets up the shim game-process env, registry writes in HKCU', () => {
    const src = read(HELPER_SRC)
    for (const piece of [
      'Steam3Master_SharedMemLock',
      'Global\\\\Valve_SteamIPC_Class',
      'Software\\\\Valve\\\\Steam\\\\ActiveProcess',
      'L"pid"',
      'L"SteamClientDll64"',
      'L"SteamPath"',
      'RegisterClassExW',
      'CreateWindowW'
    ]) {
      expect(src).toContain(piece)
    }
    // port renamed setup_steam_registry to write_registry, then inits the layer
    expect(src).toMatch(/\bwrite_registry\(steam_dir/)
    expect(src).toContain('steamclient_init_registry')
    // every registry write goes through an HKCU root
    const writes = src.match(/set_(?:sz|dword)\(\s*HKEY_\w+/g) ?? []
    expect(writes.length).toBeGreaterThanOrEqual(5)
    for (const w of writes) expect(w).toContain('HKEY_CURRENT_USER')
  })
  it('carries no 32-bit detour', () => {
    const dir = join(__dirname, '..', '..', PATCH_DIR)
    expect(readdirSync(dir).filter((f) => /detour32/.test(f))).toEqual([])
  })
})
