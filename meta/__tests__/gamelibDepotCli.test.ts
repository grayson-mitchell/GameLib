import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertDepotCliPresent,
  DEPOT_CLI_BUILD_COMMAND,
  parseDepotCliOutput,
  resolveDepotCliPath,
  runDepotCli
} from '../gamelibDepotCli'

describe('gamelibDepotCli', () => {
  it('names the pnpm build command', () => {
    expect(DEPOT_CLI_BUILD_COMMAND).toBe('pnpm depot-cli:build')
  })

  it('resolves the debug binary and honours CARGO_TARGET_DIR', () => {
    const exe = process.platform === 'win32' ? '.exe' : ''
    expect(resolveDepotCliPath({}, '/repo')).toBe(
      join('/repo', 'src-tauri', 'target', 'debug', `gamelib-depot-cli${exe}`)
    )
    expect(resolveDepotCliPath({ CARGO_TARGET_DIR: '/t' }, '/repo')).toContain(
      join('/t', 'debug')
    )
  })

  it('a missing binary error names pnpm depot-cli:build', () => {
    expect(() =>
      assertDepotCliPresent(join(tmpdir(), 'definitely-not-depot-cli'))
    ).toThrow(/gamelib-depot-cli not found.*pnpm depot-cli:build/)
  })

  it('runDepotCli rejects up front when the binary is missing', async () => {
    await expect(
      runDepotCli(
        'run',
        {},
        { cacheDir: '/x', cli: join(tmpdir(), 'definitely-not-depot-cli') }
      )
    ).rejects.toThrow(/pnpm depot-cli:build/)
  })

  it('parseDepotCliOutput splits events from the single final line', () => {
    const out =
      '{"jobId":"j","seq":0,"kind":"planned"}\n' +
      '{"jobId":"j","seq":1,"kind":"progress"}\n' +
      '{"ok":true,"result":{"status":"completed"}}\n'
    const r = parseDepotCliOutput(out)
    expect(r.events.map((e) => e.kind)).toEqual(['planned', 'progress'])
    expect(r.final).toEqual({ ok: true, result: { status: 'completed' } })
  })

  it('parseDepotCliOutput rejects a missing or doubled final line', () => {
    expect(() => parseDepotCliOutput('{"jobId":"j","seq":0}\n')).toThrow(
      /no final line/
    )
    expect(() =>
      parseDepotCliOutput('{"ok":false,"error":"a"}\n{"ok":true,"result":1}\n')
    ).toThrow(/two final lines/)
    expect(() => parseDepotCliOutput('nope\n')).toThrow(/unparseable/)
  })

  const built = existsSync(resolveDepotCliPath())
  // The package.json verify path builds first; without the binary this arm cannot run.
  const live = built ? it : it.skip

  live(
    'spawns the real CLI in a fake HOME: bad input -> ok:false, exit 2',
    async () => {
      const cacheDir = mkdtempSync(join(tmpdir(), 'depot-cli-test-'))
      try {
        const r = await runDepotCli('run', '{not json', { cacheDir })
        expect(r.status).toBe(2)
        expect(r.final).toEqual({ ok: false, error: 'bad-input' })
        expect(r.events).toEqual([])
      } finally {
        rmSync(cacheDir, { recursive: true, force: true })
      }
    }
  )
})
