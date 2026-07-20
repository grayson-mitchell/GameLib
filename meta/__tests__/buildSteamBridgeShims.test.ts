import { readFileSync } from 'fs'
import { join } from 'path'

import {
  buildHelperCompileArgv,
  buildShimCompileArgv,
  helperOutputPath,
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

  describe('downloadZig.ts is a build-tooling download, never bundled (structural)', () => {
    it('imports downloadZig from ./downloadZig rather than assuming zig is on PATH', () => {
      expect(sourceText).toMatch(/from '\.\/downloadZig'/)
    })
  })
})
