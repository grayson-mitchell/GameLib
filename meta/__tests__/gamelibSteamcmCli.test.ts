import { join } from 'node:path'

import {
  assertSteamcmCliPresent,
  parseSteamcmCliResult,
  parseSteamcmNdjson,
  resolveSteamcmCliPath,
  runSteamcmCliSync,
  STEAMCM_SECRET_OPS
} from '../gamelibSteamcmCli'
import { tmpdir } from 'node:os'

describe('gamelibSteamcmCli', () => {
  it('resolves the debug binary under src-tauri/target', () => {
    const exe = process.platform === 'win32' ? '.exe' : ''
    expect(resolveSteamcmCliPath({}, '/repo')).toBe(
      join('/repo', 'src-tauri', 'target', 'debug', `gamelib-steamcm-cli${exe}`)
    )
    expect(
      resolveSteamcmCliPath({ CARGO_TARGET_DIR: '/t' }, '/repo')
    ).toContain(join('/t', 'debug'))
  })

  it('names the build command when the binary is missing', () => {
    expect(() =>
      assertSteamcmCliPresent(join(tmpdir(), 'definitely-not-the-cli'))
    ).toThrow(
      /gamelib-steamcm-cli not found.*cargo build -p gamelib-steamcm-cli --manifest-path src-tauri\/Cargo\.toml/
    )
  })

  it('parses exit 0 and throws on 2, 64 and bad output', () => {
    expect(parseSteamcmCliResult('op', 0, '{"a":1}', '')).toEqual({ a: 1 })
    expect(() => parseSteamcmCliResult('op', 2, '', 'boom\n')).toThrow(
      /status 2.*boom/
    )
    expect(() => parseSteamcmCliResult('op', 64, '', 'usage')).toThrow(
      /status 64/
    )
    expect(() => parseSteamcmCliResult('op', 0, 'nope', '')).toThrow(
      /unparseable/
    )
  })

  it('parses ndjson replies one per line', () => {
    expect(
      parseSteamcmNdjson('{"ok":true,"result":1}\n{"ok":false,"error":"x"}\n')
    ).toEqual([
      { ok: true, result: 1 },
      { ok: false, error: 'x' }
    ])
  })

  it('refuses every secret-bearing op on argv, before any spawn', () => {
    for (const op of STEAMCM_SECRET_OPS) {
      expect(() => runSteamcmCliSync(op, { key: 'K' })).toThrow(/takes secrets/)
    }
  })
})
