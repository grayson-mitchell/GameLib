import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import {
  assertSteamcmCliPresent,
  parseSteamcmCliResult,
  resolveSteamcmCliPath,
  runSteamcmCliSync,
  STEAMCM_SECRET_OPS
} from '../gamelibSteamcmCli'
import { tmpdir } from 'node:os'

const RUST_CLI = join(
  __dirname,
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-steamcm-cli',
  'src',
  'main.rs'
)

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

  it('refuses every secret-bearing op on argv, before any spawn', () => {
    for (const op of STEAMCM_SECRET_OPS) {
      expect(() => runSteamcmCliSync(op, { key: 'K' })).toThrow(/takes secrets/)
    }
  })

  // 79 review B/IN-06: a secret op added to the Rust CLI but not here would go on argv (visible in
  // `ps`) before the CLI refused it.
  it('STEAMCM_SECRET_OPS matches SECRET_OPS in the Rust CLI', () => {
    const src = readFileSync(RUST_CLI, 'utf-8')
    const block = /const SECRET_OPS: &\[&str\] = &\[([\s\S]*?)\];/.exec(src)
    expect(block).not.toBeNull()
    const rust = [...(block?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
    expect(rust.length).toBeGreaterThan(0)
    expect([...STEAMCM_SECRET_OPS].sort()).toEqual([...rust].sort())
  })

  // 79 review B/IN-05: a stalled CLI is killed at the bound instead of hanging the tool.
  ;(process.platform === 'win32' ? it.skip : it)(
    'kills a CLI that outlives the timeout',
    () => {
      const target = mkdtempSync(join(tmpdir(), 'gamelib-steamcm-cli-t-'))
      const saved = process.env.CARGO_TARGET_DIR
      try {
        mkdirSync(join(target, 'debug'))
        const cli = join(target, 'debug', 'gamelib-steamcm-cli')
        writeFileSync(cli, '#!/bin/sh\nexec sleep 30\n')
        chmodSync(cli, 0o755)
        process.env.CARGO_TARGET_DIR = target
        const start = Date.now()
        expect(() =>
          runSteamcmCliSync('steamcm_anon_close', {}, { timeoutMs: 300 })
        ).toThrow(/signal SIGKILL/)
        expect(Date.now() - start).toBeLessThan(10_000)
      } finally {
        if (saved === undefined) delete process.env.CARGO_TARGET_DIR
        else process.env.CARGO_TARGET_DIR = saved
        rmSync(target, { recursive: true, force: true })
      }
    }
  )
})
