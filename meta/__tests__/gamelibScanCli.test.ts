import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertScanCliPresent,
  parseCliResult,
  parseNdjsonLines,
  resolveScanCliPath,
  runScanCliSync
} from '../gamelibScanCli'

describe('gamelibScanCli', () => {
  it('resolves the debug binary under src-tauri/target', () => {
    const exe = process.platform === 'win32' ? '.exe' : ''
    expect(resolveScanCliPath({}, '/repo')).toBe(
      join('/repo', 'src-tauri', 'target', 'debug', `gamelib-scan-cli${exe}`)
    )
  })

  it('honours CARGO_TARGET_DIR', () => {
    expect(resolveScanCliPath({ CARGO_TARGET_DIR: '/t' }, '/repo')).toContain(
      join('/t', 'debug')
    )
  })

  it('assertScanCliPresent names the build command when the binary is missing', () => {
    expect(() =>
      assertScanCliPresent(join(tmpdir(), 'definitely-not-gamelib-scan-cli'))
    ).toThrow(/gamelib-scan-cli not found.*cargo build -p gamelib-scan-cli/)
  })

  it('parseCliResult parses status 0 and throws otherwise', () => {
    expect(parseCliResult('scan_steam_drm', 0, '{"a":1}', '')).toEqual({ a: 1 })
    expect(() => parseCliResult('scan_steam_drm', 2, '', 'boom\n')).toThrow(
      /scan_steam_drm.*status 2.*boom/
    )
    expect(() => parseCliResult('scan_steam_drm', 0, 'nope', '')).toThrow(
      /unparseable/
    )
  })

  it('parseNdjsonLines ignores a trailing empty line', () => {
    expect(
      parseNdjsonLines('{"ok":true,"result":1}\n{"ok":false,"error":"x"}\n')
    ).toEqual([
      { ok: true, result: 1 },
      { ok: false, error: 'x' }
    ])
  })

  it('names the build command when the binary is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamelib-scancli-test-'))
    const prev = process.env.CARGO_TARGET_DIR
    process.env.CARGO_TARGET_DIR = dir
    try {
      expect(() =>
        runScanCliSync('scan_steam_drm', { exePath: '/nope.exe' })
      ).toThrow(
        /cargo build -p gamelib-scan-cli --manifest-path src-tauri\/Cargo\.toml.*is cargo on PATH\?/
      )
    } finally {
      if (prev === undefined) delete process.env.CARGO_TARGET_DIR
      else process.env.CARGO_TARGET_DIR = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
