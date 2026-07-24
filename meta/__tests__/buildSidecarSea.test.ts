/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the argv/path
 * shape of the not-yet-existing meta/buildSidecarSea.ts's pure, exported
 * helper functions. RED today -- the module does not exist yet (ts-jest
 * will fail to resolve the import), turned GREEN by Plan 34-02.
 *
 * Modeled on meta/__tests__/gen_vtables.test.ts / the buildHelperCompileArgv
 * pattern in meta/buildSteamBridgeShims.ts: import exported pure
 * argv-builders and assert their output shape without invoking the real
 * node/postject toolchain.
 */
import {
  buildSeaConfigPath,
  buildPostjectArgv,
  buildCodesignArgv,
  sidecarOutputPath,
  hostTriple,
  resolveTriple,
  triplePlatform,
  expectedMachoArch,
  nodeDistName,
  nodeDistUrls
} from '../buildSidecarSea'

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

describe('sidecarOutputPath (per-OS/triple binary naming)', () => {
  test('appends .exe for the Windows MSVC triple', () => {
    expect(sidecarOutputPath('x86_64-pc-windows-msvc')).toMatch(/\.exe$/)
  })

  test('has no .exe extension for the macOS x64 triple', () => {
    expect(sidecarOutputPath('x86_64-apple-darwin')).not.toMatch(/\.exe$/)
  })

  test('has no .exe extension for the macOS arm64 triple', () => {
    expect(sidecarOutputPath('aarch64-apple-darwin')).not.toMatch(/\.exe$/)
  })

  test('has no .exe extension for the Linux gnu triple', () => {
    expect(sidecarOutputPath('x86_64-unknown-linux-gnu')).not.toMatch(/\.exe$/)
  })
})

describe('buildSeaConfigPath', () => {
  test('returns a path pointing at a sea-config.json file', () => {
    expect(buildSeaConfigPath()).toMatch(/sea-config\.json$/)
  })
})

describe('buildPostjectArgv (postject invocation shape, Pattern 3)', () => {
  test('contains the exact sentinel fuse string verbatim', () => {
    const argv = buildPostjectArgv('gamelib-sidecar', 'sidecar-prep.blob', 'darwin')
    expect(argv.args).toEqual(expect.arrayContaining([SENTINEL_FUSE]))
  })

  test('the NODE_SEA macho-segment flag appears only for darwin triples', () => {
    const darwinArgv = buildPostjectArgv('gamelib-sidecar', 'sidecar-prep.blob', 'darwin')
    expect(darwinArgv.args).toEqual(expect.arrayContaining(['NODE_SEA']))

    const winArgv = buildPostjectArgv('gamelib-sidecar.exe', 'sidecar-prep.blob', 'win32')
    expect(winArgv.args).not.toEqual(expect.arrayContaining(['NODE_SEA']))

    const linuxArgv = buildPostjectArgv('gamelib-sidecar', 'sidecar-prep.blob', 'linux')
    expect(linuxArgv.args).not.toEqual(expect.arrayContaining(['NODE_SEA']))
  })

  test('the postject argv itself never references codesign directly', () => {
    const darwinArgv = buildPostjectArgv('gamelib-sidecar', 'sidecar-prep.blob', 'darwin')
    expect(darwinArgv.command).toBe('postject')
    expect(JSON.stringify(darwinArgv)).not.toMatch(/codesign/)
  })
})

describe('buildCodesignArgv (codesign only on macOS, Pattern 3 strip+re-sign)', () => {
  test('darwin produces codesign steps (strip-then-resign)', () => {
    const steps = buildCodesignArgv('gamelib-sidecar', 'darwin')
    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(step.command).toBe('codesign')
    }
  })

  test('win32 produces no codesign steps', () => {
    expect(buildCodesignArgv('gamelib-sidecar.exe', 'win32')).toEqual([])
  })

  test('linux produces no codesign steps', () => {
    expect(buildCodesignArgv('gamelib-sidecar', 'linux')).toEqual([])
  })
})

describe('resolveTriple (CR-01: target-driven, not host-driven)', () => {
  test('returns the override when GAMELIB_SIDECAR_TARGET_TRIPLE is set', () => {
    expect(
      resolveTriple({ GAMELIB_SIDECAR_TARGET_TRIPLE: 'x86_64-unknown-linux-gnu' })
    ).toBe('x86_64-unknown-linux-gnu')
  })

  test('falls back to hostTriple() when the var is absent', () => {
    expect(resolveTriple({})).toBe(hostTriple())
  })

  test('falls back to hostTriple() when the var is the empty string (unset matrix field)', () => {
    expect(resolveTriple({ GAMELIB_SIDECAR_TARGET_TRIPLE: '' })).toBe(hostTriple())
  })

  test('CR-01 REGRESSION: an x86_64-apple-darwin override yields the x86_64 output filename, not aarch64', () => {
    const env = { GAMELIB_SIDECAR_TARGET_TRIPLE: 'x86_64-apple-darwin' }
    expect(sidecarOutputPath(resolveTriple(env))).toMatch(
      /gamelib-sidecar-x86_64-apple-darwin$/
    )
  })
})

describe('hostTriple (previously untested)', () => {
  test('returns a member of the four known triples', () => {
    expect([
      'x86_64-pc-windows-msvc',
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'x86_64-unknown-linux-gnu'
    ]).toContain(hostTriple())
  })

  test('nodeDistName(hostTriple()) does not throw', () => {
    expect(() => nodeDistName(hostTriple())).not.toThrow()
  })
})

describe('nodeDistName', () => {
  test('maps each of the five supported triples', () => {
    expect(nodeDistName('aarch64-apple-darwin')).toBe('darwin-arm64')
    expect(nodeDistName('x86_64-apple-darwin')).toBe('darwin-x64')
    expect(nodeDistName('x86_64-unknown-linux-gnu')).toBe('linux-x64')
    expect(nodeDistName('aarch64-unknown-linux-gnu')).toBe('linux-arm64')
    expect(nodeDistName('x86_64-pc-windows-msvc')).toBe('win-x64')
  })

  test('throws on an unsupported triple', () => {
    expect(() => nodeDistName('mips-unknown-none')).toThrow()
  })
})

describe('nodeDistUrls', () => {
  test('macOS x64 triple yields the correct archive/shasums/inner-binary paths', () => {
    const result = nodeDistUrls('x86_64-apple-darwin', 'v22.11.0')
    expect(result.archiveUrl).toBe(
      'https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-x64.tar.gz'
    )
    expect(result.shasumsUrl).toBe(
      'https://nodejs.org/dist/v22.11.0/SHASUMS256.txt'
    )
    expect(result.innerBinaryPath).toBe('node-v22.11.0-darwin-x64/bin/node')
  })

  test('Windows triple yields a .zip archive and a node.exe inner path', () => {
    const result = nodeDistUrls('x86_64-pc-windows-msvc', 'v22.11.0')
    expect(result.archiveName).toMatch(/\.zip$/)
    expect(result.innerBinaryPath).toBe('node-v22.11.0-win-x64/node.exe')
  })

  test('throws when version lacks the v prefix', () => {
    expect(() => nodeDistUrls('x86_64-apple-darwin', '22.11.0')).toThrow()
  })
})

describe('triplePlatform', () => {
  test('maps darwin/win32/linux triples', () => {
    expect(triplePlatform('aarch64-apple-darwin')).toBe('darwin')
    expect(triplePlatform('x86_64-apple-darwin')).toBe('darwin')
    expect(triplePlatform('x86_64-pc-windows-msvc')).toBe('win32')
    expect(triplePlatform('x86_64-unknown-linux-gnu')).toBe('linux')
  })

  test('throws on an unknown triple', () => {
    expect(() => triplePlatform('mips-unknown-none')).toThrow()
  })
})

describe('expectedMachoArch', () => {
  test('maps both darwin triples', () => {
    expect(expectedMachoArch('aarch64-apple-darwin')).toBe('arm64')
    expect(expectedMachoArch('x86_64-apple-darwin')).toBe('x86_64')
  })

  test('throws for a non-darwin triple', () => {
    expect(() => expectedMachoArch('x86_64-unknown-linux-gnu')).toThrow()
  })
})
