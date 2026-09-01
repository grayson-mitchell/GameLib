import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  buildHelperCompileArgv,
  buildShimCompileArgv,
  helperOutputPath,
  machoArchFlag,
  pruneShimBuildByproducts,
  resolveBridgeArch,
  SHIM_BUILD_BYPRODUCTS,
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

    it('B5: both COMPILE GATE FAILED throws survive, and the prune is not wrapped in try/catch inside compileShim', () => {
      const stripped = sourceText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(stripped.match(/COMPILE GATE FAILED/g) ?? []).toHaveLength(2)

      const fnStart = stripped.indexOf('async function compileShim')
      expect(fnStart).toBeGreaterThan(-1)
      // Slice just the compileShim body (from its declaration to the next
      // top-level export) and assert no try/catch lives inside it.
      const nextFnIndex = stripped.indexOf(
        '\nexport async function main',
        fnStart
      )
      expect(nextFnIndex).toBeGreaterThan(fnStart)
      const compileShimBody = stripped.slice(fnStart, nextFnIndex)
      expect(compileShimBody).not.toMatch(/try\s*{/)
      expect(compileShimBody).not.toMatch(/catch\s*[({]/)
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
})
