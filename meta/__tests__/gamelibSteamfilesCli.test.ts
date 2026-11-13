import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertSteamfilesCliPresent,
  parseSteamfilesCliResult,
  resolveSteamfilesCliPath,
  runSteamfilesCliSync
} from '../gamelibSteamfilesCli'

describe('gamelibSteamfilesCli', () => {
  it('resolves the debug binary under src-tauri/target', () => {
    const exe = process.platform === 'win32' ? '.exe' : ''
    expect(resolveSteamfilesCliPath({}, '/repo')).toBe(
      join(
        '/repo',
        'src-tauri',
        'target',
        'debug',
        `gamelib-steamfiles-cli${exe}`
      )
    )
  })

  it('honours CARGO_TARGET_DIR', () => {
    expect(
      resolveSteamfilesCliPath({ CARGO_TARGET_DIR: '/t' }, '/repo')
    ).toContain(join('/t', 'debug'))
  })

  it('assertSteamfilesCliPresent names the build command when the binary is missing', () => {
    expect(() =>
      assertSteamfilesCliPresent(join(tmpdir(), 'definitely-not-the-cli'))
    ).toThrow(
      /gamelib-steamfiles-cli not found.*cargo build -p gamelib-steamfiles-cli --manifest-path src-tauri\/Cargo\.toml.*is cargo on PATH\?/
    )
  })

  it('parseSteamfilesCliResult parses exit 0 and throws on 2, 64 and bad output', () => {
    expect(
      parseSteamfilesCliResult('steamfiles_scan_acfs', 0, '{"a":1}', '')
    ).toEqual({ a: 1 })
    expect(() =>
      parseSteamfilesCliResult('steamfiles_scan_acfs', 2, '', 'boom\n')
    ).toThrow(/steamfiles_scan_acfs.*status 2.*boom/)
    expect(() =>
      parseSteamfilesCliResult('steamfiles_scan_acfs', 64, '', 'usage')
    ).toThrow(/status 64/)
    expect(() =>
      parseSteamfilesCliResult('steamfiles_scan_acfs', 0, 'nope', '')
    ).toThrow(/unparseable/)
  })

  it('runSteamfilesCliSync fails with the build command when the binary is missing (no spawn)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamelib-steamfilescli-test-'))
    const prev = process.env.CARGO_TARGET_DIR
    process.env.CARGO_TARGET_DIR = dir
    try {
      expect(() =>
        runSteamfilesCliSync('steamfiles_scan_acfs', { steamappsDirs: [] })
      ).toThrow(/cargo build -p gamelib-steamfiles-cli/)
    } finally {
      if (prev === undefined) delete process.env.CARGO_TARGET_DIR
      else process.env.CARGO_TARGET_DIR = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
