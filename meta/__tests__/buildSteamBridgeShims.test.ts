import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  buildHelperCompileArgv,
  buildShim64CompileArgv,
  buildShimCompileArgv,
  buildSteamClient64CompileArgv,
  helperOutputPath,
  machoArchFlag,
  missingSteamClient64Inputs,
  pruneShim64BuildByproducts,
  pruneShimBuildByproducts,
  pruneSteamClient64BuildByproducts,
  STEAMCLIENT64_BUILD_BYPRODUCTS,
  STEAMCLIENT_FWD_RC_PATH,
  STEAMCLIENT_FWD_SOURCE_PATH,
  steamClient64ByproductPaths,
  steamClient64OutputPath,
  resolveBridgeArch,
  SHIM64_BUILD_BYPRODUCTS,
  SHIM_FEATURES_SOURCE_PATH,
  SHIM_RELEASE_CFLAGS,
  SHIM_BUILD_BYPRODUCTS,
  shim64ByproductPaths,
  shim64OutputPath,
  shimByproductPaths,
  shimOutputPath,
  steamAppIdOutputPath
} from '../buildSteamBridgeShims'

// Structural source assertions (no real compile) -- mirrors the 24-01
// precedent (meta/gen_vtables.ts's test suite) and 21-02's atomic-write
// precedent: node:fs/promises exports are non-configurable getters under
// this project's ts-jest/CJS interop, so a chmod-755 step is proven by
// reading the source text rather than jest.spyOn/jest.mock.
const SOURCE_PATH = join(__dirname, '..', 'buildSteamBridgeShims.ts')
const sourceText = readFileSync(SOURCE_PATH, 'utf-8')

describe('buildSteamBridgeShims', () => {
  describe('output paths (BLOCKER 2 -- single shared bundled location)', () => {
    it('helper output path is public/bin/${arch}/darwin/steam-bridge-helper', () => {
      expect(helperOutputPath('arm64')).toBe(
        join('public', 'bin', 'arm64', 'darwin', 'steam-bridge-helper')
      )
    })

    it('shim output path is the build-time equivalent of builtBridgeShimPath', () => {
      expect(shimOutputPath('arm64')).toBe(
        join('public', 'bin', 'arm64', 'darwin', 'steam_api.dll')
      )
    })

    it('never emits to native/steam-bridge/** (no divergence, BLOCKER 2)', () => {
      expect(shimOutputPath('arm64')).not.toContain(
        join('native', 'steam-bridge')
      )
      expect(helperOutputPath('arm64')).not.toContain(
        join('native', 'steam-bridge')
      )
    })

    it('stages steam_appid.txt next to the built helper (finding #4)', () => {
      expect(steamAppIdOutputPath('arm64')).toBe(
        join('public', 'bin', 'arm64', 'darwin', 'steam_appid.txt')
      )
    })

    it('paths are arch-parameterized (not hardcoded x64), matching process.arch precedent', () => {
      expect(helperOutputPath('x64')).toBe(
        join('public', 'bin', 'x64', 'darwin', 'steam-bridge-helper')
      )
      expect(shimOutputPath('x64')).toBe(
        join('public', 'bin', 'x64', 'darwin', 'steam_api.dll')
      )
    })

    it('51-15 Task 2: shim64OutputPath sits BESIDE shimOutputPath, same darwin dir, different filename', () => {
      expect(shim64OutputPath('arm64')).toBe(
        join('public', 'bin', 'arm64', 'darwin', 'steam_api64.dll')
      )
      expect(shim64OutputPath('arm64')).not.toBe(shimOutputPath('arm64'))
    })
  })

  describe('buildHelperCompileArgv (argv-form, never shell-string, T-24-06)', () => {
    it('compiles bridge_helper.c with clang to the bundled helper path', () => {
      const { command, args } = buildHelperCompileArgv('arm64')
      expect(command).toBe('clang')
      expect(Array.isArray(args)).toBe(true)
      expect(args).toContain(
        join('native', 'steam-bridge', 'helper', 'bridge_helper.c')
      )
      expect(args).toContain(helperOutputPath('arm64'))
    })

    it('a chmod-755 step exists for the compiled helper (non-win32 downloadAsset convention)', () => {
      expect(sourceText).toMatch(/chmod\([^)]*helperOutputPath\(\)[^)]*0o755\)/)
    })

    // 51-10 Task 2: bridge_helper.c now `#include "bridge_dispatch.h"` --
    // the generated header 51-10 Task 1 emits into
    // native/steam-bridge/generated/, a DIFFERENT directory from
    // bridge_helper.c's own (native/steam-bridge/helper/). clang's quoted
    // #include first searches the including file's own directory, so this
    // -I is required for that #include to resolve at all.
    it('includes -I pointing at native/steam-bridge/generated (51-10 Task 2)', () => {
      const { args } = buildHelperCompileArgv('arm64')
      const includeIndex = args.indexOf('-I')
      expect(includeIndex).toBeGreaterThan(-1)
      expect(args[includeIndex + 1]).toBe(
        join('native', 'steam-bridge', 'generated')
      )
    })
  })

  describe('buildShimCompileArgv (real compile gate, finding #5a)', () => {
    it('uses zig cc -target x86-windows-gnu with the 24-01 generated source as input', () => {
      const { command, args } = buildShimCompileArgv('/path/to/zig', 'arm64')
      expect(command).toBe('/path/to/zig')
      expect(args[0]).toBe('cc')
      expect(args).toContain('-target')
      expect(args).toContain('x86-windows-gnu')
      expect(args).toContain(
        join('native', 'steam-bridge', 'generated', 'steam_api_shim.c')
      )
      expect(args).toContain(
        join('native', 'steam-bridge', 'generated', 'steam_api.def')
      )
    })

    it('emits to the SINGLE shared bundled location matching builtBridgeShimPath (BLOCKER 2)', () => {
      const { args } = buildShimCompileArgv('/path/to/zig', 'arm64')
      const outIndex = args.indexOf('-o')
      expect(outIndex).toBeGreaterThan(-1)
      expect(args[outIndex + 1]).toBe(shimOutputPath('arm64'))
      expect(args[outIndex + 1]).not.toContain(join('native', 'steam-bridge'))
    })

    it('the resolved zig binary path drives the command (obtained via downloadZig.ts)', () => {
      const { command } = buildShimCompileArgv(
        join('.build-tools', 'zig', 'zig'),
        'arm64'
      )
      expect(command).toBe(join('.build-tools', 'zig', 'zig'))
    })

    it('is a release build: -O2 and UBSan off, no sanitizer flags (quick 261023-tyf)', () => {
      const { args } = buildShimCompileArgv('/path/to/zig', 'arm64')
      expect(args).toContain('-O2')
      expect(args).toContain('-fno-sanitize=undefined')
      expect(args.filter((a) => a.startsWith('-fsanitize'))).toEqual([])
      expect(args.filter((a) => /^-O/.test(a))).toHaveLength(1)
      expect(args.indexOf('-O2')).toBeLessThan(args.indexOf('-o'))
      expect(args.indexOf('-fno-sanitize=undefined')).toBeLessThan(
        args.indexOf('-o')
      )
    })

    it('compiles shim_features.c right after steam_api_shim.c, which stays the first .c (quick 261026-ng9)', () => {
      const { args } = buildShimCompileArgv('/path/to/zig', 'arm64')
      expect(SHIM_FEATURES_SOURCE_PATH).toBe(
        join('native', 'steam-bridge', 'shim', 'shim_features.c')
      )
      expect(args).toContain(SHIM_FEATURES_SOURCE_PATH)
      const shimIdx = args.indexOf(
        join('native', 'steam-bridge', 'generated', 'steam_api_shim.c')
      )
      expect(args.indexOf(SHIM_FEATURES_SOURCE_PATH)).toBe(shimIdx + 1)
      expect(args.findIndex((a) => a.endsWith('.c'))).toBe(shimIdx)
    })
  })

  describe('buildShim64CompileArgv (51-15 Task 2: second compile target -- steam_api64.dll)', () => {
    it('uses zig cc -target x86_64-windows-gnu with the 51-15 Task 1 generated x64 source/def as input', () => {
      const { command, args } = buildShim64CompileArgv('/path/to/zig', 'arm64')
      expect(command).toBe('/path/to/zig')
      expect(args[0]).toBe('cc')
      expect(args).toContain('-target')
      expect(args).toContain('x86_64-windows-gnu')
      expect(args).toContain(
        join('native', 'steam-bridge', 'generated', 'steam_api_shim.c')
      )
      expect(args).toContain(
        join('native', 'steam-bridge', 'generated', 'steam_api64.def')
      )
    })

    it('emits to shim64OutputPath, beside (never overwriting) the x86 steam_api.dll', () => {
      const { args } = buildShim64CompileArgv('/path/to/zig', 'arm64')
      const outIndex = args.indexOf('-o')
      expect(outIndex).toBeGreaterThan(-1)
      expect(args[outIndex + 1]).toBe(shim64OutputPath('arm64'))
      expect(args[outIndex + 1]).not.toBe(shimOutputPath('arm64'))
    })

    it('the resolved zig binary path drives the command, same as the x86 argv builder', () => {
      const { command } = buildShim64CompileArgv(
        join('.build-tools', 'zig', 'zig'),
        'arm64'
      )
      expect(command).toBe(join('.build-tools', 'zig', 'zig'))
    })

    it('is a release build: -O2 and UBSan off, no sanitizer flags (quick 261023-tyf)', () => {
      const { args } = buildShim64CompileArgv('/path/to/zig', 'arm64')
      expect(args).toContain('-O2')
      expect(args).toContain('-fno-sanitize=undefined')
      expect(args.filter((a) => a.startsWith('-fsanitize'))).toEqual([])
      expect(args.filter((a) => /^-O/.test(a))).toHaveLength(1)
      expect(args.indexOf('-O2')).toBeLessThan(args.indexOf('-o'))
      expect(args.indexOf('-fno-sanitize=undefined')).toBeLessThan(
        args.indexOf('-o')
      )
    })

    it('compiles shim_features.c right after steam_api_shim.c, which stays the first .c (quick 261026-ng9)', () => {
      const { args } = buildShim64CompileArgv('/path/to/zig', 'arm64')
      expect(SHIM_FEATURES_SOURCE_PATH).toBe(
        join('native', 'steam-bridge', 'shim', 'shim_features.c')
      )
      expect(args).toContain(SHIM_FEATURES_SOURCE_PATH)
      const shimIdx = args.indexOf(
        join('native', 'steam-bridge', 'generated', 'steam_api_shim.c')
      )
      expect(args.indexOf(SHIM_FEATURES_SOURCE_PATH)).toBe(shimIdx + 1)
      expect(args.findIndex((a) => a.endsWith('.c'))).toBe(shimIdx)
    })

    it('shim_features.c exists, owns the only DllMain, and the generated shim has none', () => {
      expect(existsSync(SHIM_FEATURES_SOURCE_PATH)).toBe(true)
      expect(readFileSync(SHIM_FEATURES_SOURCE_PATH, 'utf8')).toContain(
        'DllMain'
      )
      expect(
        readFileSync(
          join('native', 'steam-bridge', 'generated', 'steam_api_shim.c'),
          'utf8'
        )
      ).not.toContain('DllMain')
    })
  })

  // Spike 033 run C: Hoard aborted with `panic: member access within
  // misaligned address ... requires 8 byte alignment` on a legal 4-byte
  // aligned LARGE_INTEGER* because zig defaulted to Debug + UBSan.
  describe('SHIM_RELEASE_CFLAGS (quick 261023-tyf: release build, UBSan off)', () => {
    it('is exactly -O2 plus an explicit UBSan-off', () => {
      expect([...SHIM_RELEASE_CFLAGS]).toEqual([
        '-O2',
        '-fno-sanitize=undefined'
      ])
    })
  })

  describe('argv-form invocation (never a shell string, T-24-06)', () => {
    it('both compile commands return real argv arrays, not a single interpolated string', () => {
      const helperCmd = buildHelperCompileArgv('arm64')
      const shimCmd = buildShimCompileArgv('/path/to/zig', 'arm64')
      expect(Array.isArray(helperCmd.args)).toBe(true)
      expect(Array.isArray(shimCmd.args)).toBe(true)
      // Structural guard: spawn() call sites in source never build a
      // shell-interpolated command string.
      expect(sourceText).not.toMatch(/spawn\(`/)
      expect(sourceText).not.toMatch(/exec\(/)
    })
  })

  // CR-01 (34-REVIEW.md gap cycle 2): the bundled bridge outputs were pathed
  // by the BUILD HOST's process.arch and compiled with no `-arch`, so the
  // `--target x86_64-apple-darwin` release leg (built on an Apple-Silicon
  // macos-latest runner) shipped arm64 bytes at bin/arm64/... while its own
  // x64 sidecar looks for bin/x64/... at runtime. These assertions exercise
  // the real resolution path used by compileHelper()/compileShim() (which
  // call the *OutputPath helpers with no argument, i.e. through the default
  // parameter), not just the explicitly-parameterized form.
  describe('resolveBridgeArch (CR-01: target-driven, not host-driven)', () => {
    it('returns the GAMELIB_BRIDGE_TARGET_ARCH override when set', () => {
      expect(resolveBridgeArch({ GAMELIB_BRIDGE_TARGET_ARCH: 'x64' })).toBe(
        'x64'
      )
    })

    it('falls back to process.arch when the var is absent', () => {
      expect(resolveBridgeArch({})).toBe(process.arch)
    })

    it('falls back to process.arch when the var is the empty string (unset matrix field)', () => {
      expect(resolveBridgeArch({ GAMELIB_BRIDGE_TARGET_ARCH: '' })).toBe(
        process.arch
      )
    })

    it('CR-01 REGRESSION: an x64 override drives the DEFAULT-ARGUMENT output paths, not just explicit ones', () => {
      const previous = process.env.GAMELIB_BRIDGE_TARGET_ARCH
      process.env.GAMELIB_BRIDGE_TARGET_ARCH = 'x64'
      try {
        // No argument: this is exactly how compileHelper()/compileShim()/
        // stageSteamAppId() call these helpers.
        expect(helperOutputPath()).toBe(
          join('public', 'bin', 'x64', 'darwin', 'steam-bridge-helper')
        )
        expect(shimOutputPath()).toBe(
          join('public', 'bin', 'x64', 'darwin', 'steam_api.dll')
        )
        expect(steamAppIdOutputPath()).toBe(
          join('public', 'bin', 'x64', 'darwin', 'steam_appid.txt')
        )
        expect(helperOutputPath()).not.toContain(join('bin', 'arm64', 'darwin'))
      } finally {
        if (previous === undefined) {
          delete process.env.GAMELIB_BRIDGE_TARGET_ARCH
        } else {
          process.env.GAMELIB_BRIDGE_TARGET_ARCH = previous
        }
      }
    })

    it('CR-01 REGRESSION: the compile argv carries a -arch matching the target, so the Mach-O is not host-native', () => {
      const x64 = buildHelperCompileArgv('x64')
      const archIndex = x64.args.indexOf('-arch')
      expect(archIndex).toBeGreaterThan(-1)
      expect(x64.args[archIndex + 1]).toBe('x86_64')
      expect(x64.args).toContain(helperOutputPath('x64'))

      const arm64 = buildHelperCompileArgv('arm64')
      expect(arm64.args[arm64.args.indexOf('-arch') + 1]).toBe('arm64')
      expect(arm64.args).toContain(helperOutputPath('arm64'))
    })

    it('machoArchFlag refuses an arch it cannot name, rather than silently emitting host-native bytes', () => {
      expect(machoArchFlag('arm64')).toBe('arm64')
      expect(machoArchFlag('x64')).toBe('x86_64')
      expect(() => machoArchFlag('ia32')).toThrow()
      expect(() => buildHelperCompileArgv('ia32')).toThrow()
    })

    it('the source never re-derives a bundled path from process.arch directly (host-vs-target guard)', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      // process.arch may appear ONLY as resolveBridgeArch()'s fallback.
      const occurrences = stripped.match(/process\.arch/g) ?? []
      expect(occurrences).toHaveLength(1)
      expect(stripped).toMatch(/return process\.arch/)
    })
  })

  describe('downloadZig.ts is a build-tooling download, never bundled (structural)', () => {
    it('imports downloadZig from ./downloadZig rather than assuming zig is on PATH', () => {
      expect(sourceText).toMatch(/from '\.\/downloadZig'/)
    })
  })

  // todo item 6 (quick-260901-kl2): stop shipping zig cc -shared's own
  // steam_api.pdb / steam_api_shim.lib linker byproducts. B4's source-text
  // ordering regex was REMOVED in r5 -- it false-RED'd twice on correct code
  // (r2: matched the definition instead of the call; r4: assumed empty
  // parens against the plan's own mandated parameterised signature). The
  // ordering property is now carried BEHAVIOURALLY by seeded M1/M2 in Task 2
  // (scratchpad mutation harness), not by a regex here.
  describe('shim build byproducts (todo item 6, quick-260901-kl2)', () => {
    it('B1: shimByproductPaths(arm64) returns exactly the .pdb and .lib paths', () => {
      const paths = shimByproductPaths('arm64')
      expect(paths).toHaveLength(2)
      expect(paths).toEqual(
        expect.arrayContaining([
          join('public', 'bin', 'arm64', 'darwin', 'steam_api.pdb'),
          join('public', 'bin', 'arm64', 'darwin', 'steam_api_shim.lib')
        ])
      )
    })

    it('B2: arch-parameterized, including the GAMELIB_BRIDGE_TARGET_ARCH default-argument path', () => {
      expect(shimByproductPaths('x64')).toEqual(
        expect.arrayContaining([
          join('public', 'bin', 'x64', 'darwin', 'steam_api.pdb'),
          join('public', 'bin', 'x64', 'darwin', 'steam_api_shim.lib')
        ])
      )

      const previous = process.env.GAMELIB_BRIDGE_TARGET_ARCH
      process.env.GAMELIB_BRIDGE_TARGET_ARCH = 'x64'
      try {
        expect(shimByproductPaths()).toEqual(
          expect.arrayContaining([
            join('public', 'bin', 'x64', 'darwin', 'steam_api.pdb'),
            join('public', 'bin', 'x64', 'darwin', 'steam_api_shim.lib')
          ])
        )
      } finally {
        if (previous === undefined) {
          delete process.env.GAMELIB_BRIDGE_TARGET_ARCH
        } else {
          process.env.GAMELIB_BRIDGE_TARGET_ARCH = previous
        }
      }
    })

    it('B3: OVER-REACH GUARD -- neither the byproduct list nor its paths ever name a keeper file', () => {
      expect(SHIM_BUILD_BYPRODUCTS).not.toContain('steam_api.dll')
      expect(SHIM_BUILD_BYPRODUCTS).not.toContain('steam-bridge-helper')
      expect(SHIM_BUILD_BYPRODUCTS).not.toContain('steam_appid.txt')

      const paths = shimByproductPaths('arm64')
      expect(paths).not.toContain(shimOutputPath('arm64'))
      expect(paths).not.toContain(helperOutputPath('arm64'))
      expect(paths).not.toContain(steamAppIdOutputPath('arm64'))
    })

    it('51-15 Task 2: shim64ByproductPaths(arm64) returns the x64 .pdb and the SAME .lib name as the x86 build (measured: zig cc names the .lib after the source file, not -o)', () => {
      const paths = shim64ByproductPaths('arm64')
      expect(paths).toHaveLength(2)
      expect(paths).toEqual(
        expect.arrayContaining([
          join('public', 'bin', 'arm64', 'darwin', 'steam_api64.pdb'),
          join('public', 'bin', 'arm64', 'darwin', 'steam_api_shim.lib')
        ])
      )
    })

    it('51-15 Task 2: OVER-REACH GUARD -- neither the x64 byproduct list nor its paths ever name a keeper file (the x64 .dll included)', () => {
      expect(SHIM64_BUILD_BYPRODUCTS).not.toContain('steam_api64.dll')
      expect(SHIM64_BUILD_BYPRODUCTS).not.toContain('steam_api.dll')
      expect(SHIM64_BUILD_BYPRODUCTS).not.toContain('steam-bridge-helper')
      expect(SHIM64_BUILD_BYPRODUCTS).not.toContain('steam_appid.txt')

      const paths = shim64ByproductPaths('arm64')
      expect(paths).not.toContain(shim64OutputPath('arm64'))
      expect(paths).not.toContain(shimOutputPath('arm64'))
      expect(paths).not.toContain(helperOutputPath('arm64'))
      expect(paths).not.toContain(steamAppIdOutputPath('arm64'))
    })

    it('51-15 Task 2: pruneShim64BuildByproducts removes the x64 .pdb/.lib without touching the x64 .dll or any x86 artifact', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'gamelib-shim64-prune-'))
      const previousCwd = process.cwd()
      try {
        const darwinDir = join(tmp, 'public', 'bin', 'arm64', 'darwin')
        mkdirSync(darwinDir, { recursive: true })
        const dll64Bytes = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
        writeFileSync(join(darwinDir, 'steam_api64.dll'), dll64Bytes)
        writeFileSync(join(darwinDir, 'steam_api64.pdb'), 'pdb64-sentinel')
        writeFileSync(join(darwinDir, 'steam_api_shim.lib'), 'lib-sentinel')
        writeFileSync(join(darwinDir, 'steam_api.dll'), 'x86-dll-sentinel')

        process.chdir(tmp)
        pruneShim64BuildByproducts('arm64')

        expect(() => readFileSync(join(darwinDir, 'steam_api64.pdb'))).toThrow()
        expect(() =>
          readFileSync(join(darwinDir, 'steam_api_shim.lib'))
        ).toThrow()
        const dll64After = readFileSync(join(darwinDir, 'steam_api64.dll'))
        expect(Buffer.compare(dll64After, dll64Bytes)).toBe(0)
        expect(readFileSync(join(darwinDir, 'steam_api.dll'), 'utf-8')).toBe(
          'x86-dll-sentinel'
        )
      } finally {
        process.chdir(previousCwd)
        rmSync(tmp, { recursive: true, force: true })
      }
    })

    it('B5: both COMPILE GATE FAILED throws survive (x86), and the prune is not wrapped in try/catch inside compileShim', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      // 6 total: 2 each for compileShim (x86), compileShim64, compileSteamClient64.
      expect(stripped.match(/COMPILE GATE FAILED/g) ?? []).toHaveLength(6)

      const fnStart = stripped.indexOf('async function compileShim(')
      expect(fnStart).toBeGreaterThan(-1)
      // Slice just the compileShim body (from its declaration to the next
      // top-level function, compileShim64) and assert no try/catch lives
      // inside it.
      const nextFnIndex = stripped.indexOf(
        '\nasync function compileShim64',
        fnStart
      )
      expect(nextFnIndex).toBeGreaterThan(fnStart)
      const compileShimBody = stripped.slice(fnStart, nextFnIndex)
      expect(compileShimBody).not.toMatch(/try\s*{/)
      expect(compileShimBody).not.toMatch(/catch\s*[({]/)
    })

    it('B5b (51-15 Task 2): both COMPILE GATE FAILED throws survive (x64), and the prune is not wrapped in try/catch inside compileShim64', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      const fnStart = stripped.indexOf('async function compileShim64')
      expect(fnStart).toBeGreaterThan(-1)
      // Slice just the compileShim64 body (from its declaration to the
      // next top-level export) and assert no try/catch lives inside it.
      const nextFnIndex = stripped.indexOf(
        '\nexport async function main',
        fnStart
      )
      expect(nextFnIndex).toBeGreaterThan(fnStart)
      const compileShim64Body = stripped.slice(fnStart, nextFnIndex)
      expect(compileShim64Body).not.toMatch(/try\s*{/)
      expect(compileShim64Body).not.toMatch(/catch\s*[({]/)
      expect(compileShim64Body).toContain('COMPILE GATE FAILED')
    })

    it('51-15 Task 2: main() builds the helper, then the x86 shim, then the x64 shim, in that order', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const mainStart = stripped.indexOf('export async function main')
      expect(mainStart).toBeGreaterThan(-1)
      const mainBody = stripped.slice(mainStart)
      const helperIdx = mainBody.indexOf('compileHelper()')
      const shimIdx = mainBody.indexOf('compileShim()')
      const shim64Idx = mainBody.indexOf('compileShim64()')
      expect(helperIdx).toBeGreaterThan(-1)
      expect(shimIdx).toBeGreaterThan(helperIdx)
      expect(shim64Idx).toBeGreaterThan(shimIdx)
    })

    it('B6: the prune has a fail-loud post-condition naming a surviving byproduct', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(stripped).toMatch(/throw new Error\(\s*`[^`]*\$\{path\}[^`]*`/)
    })

    it('B7: P2 -- the prune cannot alter the DLL (temp-dir fixture, Buffer equality, no compiler involved)', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'gamelib-shim-prune-'))
      const previousCwd = process.cwd()
      try {
        const darwinDir = join(tmp, 'public', 'bin', 'arm64', 'darwin')
        mkdirSync(darwinDir, { recursive: true })
        const dllBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        writeFileSync(join(darwinDir, 'steam_api.dll'), dllBytes)
        writeFileSync(join(darwinDir, 'steam_api.pdb'), 'pdb-sentinel')
        writeFileSync(join(darwinDir, 'steam_api_shim.lib'), 'lib-sentinel')
        writeFileSync(join(darwinDir, 'steam-bridge-helper'), 'helper-sentinel')
        writeFileSync(join(darwinDir, 'steam_appid.txt'), '480')

        process.chdir(tmp)
        pruneShimBuildByproducts('arm64')

        expect(() => readFileSync(join(darwinDir, 'steam_api.pdb'))).toThrow()
        expect(() =>
          readFileSync(join(darwinDir, 'steam_api_shim.lib'))
        ).toThrow()
        const dllAfter = readFileSync(join(darwinDir, 'steam_api.dll'))
        expect(Buffer.compare(dllAfter, dllBytes)).toBe(0)
        expect(
          readFileSync(join(darwinDir, 'steam-bridge-helper'), 'utf-8')
        ).toBe('helper-sentinel')
        expect(readFileSync(join(darwinDir, 'steam_appid.txt'), 'utf-8')).toBe(
          '480'
        )
      } finally {
        process.chdir(previousCwd)
        rmSync(tmp, { recursive: true, force: true })
      }
    })

    it('B8: calling pruneShimBuildByproducts twice in a row is a no-op the second time and does not throw', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'gamelib-shim-prune-idem-'))
      const previousCwd = process.cwd()
      try {
        const darwinDir = join(tmp, 'public', 'bin', 'arm64', 'darwin')
        mkdirSync(darwinDir, { recursive: true })
        writeFileSync(join(darwinDir, 'steam_api.dll'), 'dll-sentinel')
        writeFileSync(join(darwinDir, 'steam_api.pdb'), 'pdb-sentinel')
        writeFileSync(join(darwinDir, 'steam_api_shim.lib'), 'lib-sentinel')

        process.chdir(tmp)
        pruneShimBuildByproducts('arm64')
        expect(() => pruneShimBuildByproducts('arm64')).not.toThrow()
      } finally {
        process.chdir(previousCwd)
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  })
  describe('steamclient64 forwarder (52-03)', () => {
    it('output path sits beside the shims', () => {
      expect(steamClient64OutputPath('arm64')).toBe(
        join('public', 'bin', 'arm64', 'darwin', 'steamclient64.dll')
      )
    })

    it('argv: x64 windows shared build of the forwarder, no .def, no ws2_32', () => {
      const { command, args } = buildSteamClient64CompileArgv('/zig', 'arm64')
      expect(command).toBe('/zig')
      expect(args[0]).toBe('cc')
      expect(args[args.indexOf('-target') + 1]).toBe('x86_64-windows-gnu')
      expect(args).toContain('-shared')
      for (const flag of SHIM_RELEASE_CFLAGS) expect(args).toContain(flag)
      expect(args[args.indexOf('-o') + 1]).toBe(
        steamClient64OutputPath('arm64')
      )
      expect(args).toContain(STEAMCLIENT_FWD_SOURCE_PATH)
      // 52-26 (item 22): the version resource, compiled with the forwarder.
      expect(args).toContain(STEAMCLIENT_FWD_RC_PATH)
      // 52-REVIEW WR-02: the .rc is its own input and follows the .c (the
      // import-lib name derives from the first source).
      expect(args.slice(-2)).toEqual([
        STEAMCLIENT_FWD_SOURCE_PATH,
        STEAMCLIENT_FWD_RC_PATH
      ])
      expect(args.indexOf(STEAMCLIENT_FWD_SOURCE_PATH)).toBeLessThan(
        args.indexOf(STEAMCLIENT_FWD_RC_PATH)
      )
      expect(existsSync(STEAMCLIENT_FWD_RC_PATH)).toBe(true)
      expect(args).not.toContain('-lws2_32')
      expect(args.some((a) => a.endsWith('.def'))).toBe(false)
    })

    describe('missingSteamClient64Inputs (52-REVIEW WR-01)', () => {
      it('returns [] when every input exists', () => {
        expect(missingSteamClient64Inputs(() => true)).toEqual([])
      })
      it('names a missing .rc', () => {
        expect(
          missingSteamClient64Inputs((p) => p !== STEAMCLIENT_FWD_RC_PATH)
        ).toEqual([STEAMCLIENT_FWD_RC_PATH])
      })
      it('names every missing input in order', () => {
        expect(missingSteamClient64Inputs(() => false)).toEqual([
          STEAMCLIENT_FWD_SOURCE_PATH,
          STEAMCLIENT_FWD_RC_PATH
        ])
      })
    })

    it('byproducts never name a keeper and prune removes them fail-loud', () => {
      for (const name of STEAMCLIENT64_BUILD_BYPRODUCTS) {
        expect(name.endsWith('.dll')).toBe(false)
      }
      expect(STEAMCLIENT64_BUILD_BYPRODUCTS).not.toContain('steam_api64.pdb')
      expect(steamClient64ByproductPaths('arm64')).not.toContain(
        steamClient64OutputPath('arm64')
      )
      const tmp = mkdtempSync(join(tmpdir(), 'gamelib-sc64-prune-'))
      const previousCwd = process.cwd()
      try {
        const darwinDir = join(tmp, 'public', 'bin', 'arm64', 'darwin')
        mkdirSync(darwinDir, { recursive: true })
        writeFileSync(join(darwinDir, 'steamclient64.dll'), 'keep')
        for (const name of STEAMCLIENT64_BUILD_BYPRODUCTS) {
          writeFileSync(join(darwinDir, name), 'x')
        }
        process.chdir(tmp)
        pruneSteamClient64BuildByproducts('arm64')
        for (const name of STEAMCLIENT64_BUILD_BYPRODUCTS) {
          expect(() => readFileSync(join(darwinDir, name))).toThrow()
        }
        expect(
          readFileSync(join(darwinDir, 'steamclient64.dll'), 'utf-8')
        ).toBe('keep')
      } finally {
        process.chdir(previousCwd)
        rmSync(tmp, { recursive: true, force: true })
      }
    })

    it('main() calls compileSteamClient64 after compileShim64', () => {
      const mainBody = sourceText.slice(
        sourceText.indexOf('export async function main')
      )
      expect(mainBody.indexOf('compileSteamClient64()')).toBeGreaterThan(
        mainBody.indexOf('compileShim64()')
      )
    })
  })
})
