import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { getCometBin } from 'backend/utils'
import { join } from 'path'
import { getCometVersion } from '../index'

// The probe path is derived, never spawned: the runner is scripted.
const cfg = {
  config: createTestGlobalConfig(),
  paths: createTestAppPaths('/fake/root')
}
const bin = getCometBin(cfg)
const CMD = join(bin.dir, bin.bin)

describe('getCometVersion', () => {
  it('returns trimmed stdout and bounds the probe at 5 s', async () => {
    const runner = createScriptedRunner([
      { cmd: CMD, argv: ['--version'], result: { stdout: '0.1.2\n' } }
    ])
    expect(await getCometVersion({ runner, ...cfg })).toBe('0.1.2')
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 5000 })
  })

  it('is invalid on a spawn error', async () => {
    const runner = createScriptedRunner([
      { cmd: CMD, argv: ['--version'], error: { code: 'ENOENT' } }
    ])
    expect(await getCometVersion({ runner, ...cfg })).toBe('invalid')
  })

  it('is invalid on a timeout', async () => {
    const runner = createScriptedRunner([
      {
        cmd: CMD,
        argv: ['--version'],
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])
    expect(await getCometVersion({ runner, ...cfg })).toBe('invalid')
  })

  it('a non-zero exit is not invalid (unchanged behaviour)', async () => {
    const runner = createScriptedRunner([
      { cmd: CMD, argv: ['--version'], result: { code: 1, stdout: 'x' } }
    ])
    expect(await getCometVersion({ runner, ...cfg })).toBe('x')
  })
})
