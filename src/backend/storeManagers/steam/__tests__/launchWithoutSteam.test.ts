import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { launchMacNativeWithoutSteam } from '../directLaunch/launchWithoutSteam'
import { STEAM_DIRECT_TRACK_RUNNER } from '../directLaunch/directLaunchVerdict'

describe('launchMacNativeWithoutSteam', () => {
  let install: string
  let binary: string
  beforeEach(() => {
    install = mkdtempSync(join(tmpdir(), 'p38-launch-'))
    mkdirSync(join(install, 'Game.app', 'Contents', 'MacOS'), {
      recursive: true
    })
    binary = join(install, 'Game.app', 'Contents', 'MacOS', 'Game')
    writeFileSync(binary, 'x')
  })
  afterEach(() => {
    rmSync(install, { recursive: true, force: true })
  })

  function setup(script: Parameters<typeof createScriptedRunner>[0]) {
    const runner = createScriptedRunner(script)
    const statuses: string[] = []
    const deps = {
      runner,
      sendStatus: (s: 'playing' | 'done') => void statuses.push(s),
      log: () => undefined
    }
    return { runner, statuses, deps }
  }

  test('spawns the binary with the PICS args, tracked, and reports playing then done', async () => {
    const { runner, statuses, deps } = setup([{ cmd: binary }])
    const cwd = join(install, 'Game.app')
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: ['-windowed'],
      workingDir: cwd
    })
    expect(ok).toBe(true)
    await new Promise((r) => setImmediate(r))
    expect(runner.calls).toHaveLength(1)
    const call = runner.calls[0]
    expect(call?.cmd).toBe(binary)
    expect(call?.argv).toEqual(['-windowed'])
    expect(call?.cwd).toBe(cwd)
    expect(call?.opts).toMatchObject({
      track: { runner: STEAM_DIRECT_TRACK_RUNNER, key: '10' },
      timeout: { none: true },
      resolveOn: 'exit'
    })
    expect(statuses).toEqual(['playing', 'done'])
  })

  test.each([
    ['dot-dot escape', () => join(install, '..', 'evil')],
    ['absolute elsewhere', () => '/bin/sh'],
    ['missing on disk', () => join(install, 'nope')]
  ])('%s is refused without spawning', async (_n, pick) => {
    const { runner, deps } = setup([])
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: pick(),
      args: []
    })
    expect(ok).toBe(false)
    expect(runner.calls).toHaveLength(0)
  })

  test('a spawn error before onSpawn resolves false and sends done', async () => {
    const { statuses, deps } = setup([
      { cmd: binary, error: { code: 'ENOENT' } }
    ])
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: []
    })
    expect(ok).toBe(false)
    expect(statuses).toEqual(['done'])
  })

  test('a working dir outside the install falls back to the binary folder', async () => {
    const { runner, deps } = setup([{ cmd: binary }])
    await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: [],
      workingDir: '/tmp'
    })
    expect(runner.calls[0]?.cwd).toBe(
      join(install, 'Game.app', 'Contents', 'MacOS')
    )
  })
})
