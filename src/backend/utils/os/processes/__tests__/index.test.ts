import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { genericSpawnWrapper } from '../index'

describe('genericSpawnWrapper', () => {
  it('runs through the runner with the 30 s default timeout and maps the result', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'lspci',
        argv: ['-n'],
        result: { stdout: 'out', stderr: 'err', code: 3 }
      }
    ])
    await expect(
      genericSpawnWrapper({ runner }, 'lspci', ['-n'])
    ).resolves.toEqual({
      stdout: 'out',
      stderr: 'err',
      exitCode: 3,
      signalName: null
    })
    expect(runner.calls[0]?.opts).toMatchObject({
      timeoutMs: 30_000,
      stdin: ''
    })
  })

  it('replaces the environment when env is given', async () => {
    const runner = createScriptedRunner([{ cmd: 'free', argv: ['-b'] }])
    await genericSpawnWrapper({ runner }, 'free', ['-b'], {
      env: { LANG: 'C' },
      timeoutMs: 1000
    })
    expect(runner.calls[0]?.opts).toMatchObject({
      env: { LANG: 'C' },
      replaceEnv: true,
      timeoutMs: 1000
    })
  })

  it('rejects on spawn error', async () => {
    const runner = createScriptedRunner([
      { cmd: 'nope', argv: [], error: { code: 'ENOENT' } }
    ])
    await expect(genericSpawnWrapper({ runner }, 'nope')).rejects.toThrow(
      'ENOENT'
    )
  })

  it('resolves with the kill signal on a timeout', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'slow',
        argv: [],
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])
    await expect(
      genericSpawnWrapper({ runner }, 'slow')
    ).resolves.toMatchObject({
      exitCode: null,
      signalName: 'SIGKILL'
    })
  })
})
