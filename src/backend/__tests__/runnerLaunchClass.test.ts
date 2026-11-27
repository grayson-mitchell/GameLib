/**
 * Which runner spawns are Game class (Phase 88.2, 88.2-21, D-05, T-88.2-29). A game outlives GameLib's helpers, so Rust spawns
 * it as `SpawnClass::Game` (never reaped at exit); every other runner spawn (installs, auth, lists, the Steam bridge) stays
 * Helper. Exactly five launch spawns say so, through the new `CallRunnerOptions.spawnClass: 'game'`:
 *
 * - legendary's, gog's and nile's `launch()` runner call,
 * - the sideload native `callRunner` and the sideload wine `runWineCommand` in storeManagerCommon's `launchGame`.
 *
 * Two kinds of proof, because a manager's `launch()` cannot be driven without a launcher, a prefix and a game:
 * - behaviour: the real runner adapter, over a fake `requestRustInvoke`, sends `spawnClass: 'game'` on `launch_runner_call`
 *   and `launch_wine_command` when the caller sets it and sends nothing (the helper default) when it does not, and every
 *   request passes the same zod schema the sidecar checks before the frame is written;
 * - source: each launch site names the class, and no other call in the manager code does.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_RUNNER_CALL,
  RUST_LAUNCH_WINE_COMMAND
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createRunnerStreams } from 'backend/runnerStream'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import LogWriter from 'backend/logger/targetWriter'
import type { RunnerProps } from 'backend/commandRunner'
import type { GameSettings } from 'common/types'
import type { LogFrameTarget } from 'common/types/sidecarTransport'

import { createRunnerAdapter } from '../runnerAdapter'

const RESULT = { stdout: '', stderr: '', fullCommand: 'x' }

function rig() {
  const invokes: Array<{ channel: string; args: unknown[] }> = []
  const deps = {
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      invokes.push({ channel, args })
      return Promise.resolve(RESULT)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
  const target: LogFrameTarget = { kind: 'runner', runner: 'legendary' }
  const writer = new LogWriter(target, false)
  const adapter = createRunnerAdapter({
    ...deps,
    streams: createRunnerStreams({ kill: () => Promise.resolve(true) }),
    getRunnerLogWriter: () => writer,
    flushLogs: () => Promise.resolve()
  })
  return { adapter, invokes }
}

const runnerProps: RunnerProps = {
  name: 'legendary',
  logPrefix: 'Legendary' as RunnerProps['logPrefix'],
  bin: 'legendary',
  dir: '/opt/legendary'
}

describe('the runner adapter carries the spawn class (D-05)', () => {
  it('sends spawnClass game on launch_runner_call for a launch, and no class for an install', async () => {
    const r = rig()
    await r.adapter.callRunner(['launch', 'Fortnite'], runnerProps, {
      abortId: 'Fortnite',
      spawnClass: 'game'
    })
    await r.adapter.callRunner(['install', 'Fortnite'], runnerProps, {
      abortId: 'Fortnite'
    })
    const [launch, install] = r.invokes
    expect(launch?.channel).toBe(RUST_LAUNCH_RUNNER_CALL)
    expect(install?.channel).toBe(RUST_LAUNCH_RUNNER_CALL)
    const launchRequest = rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL].parse(
      launch?.args
    )[0]
    const installRequest = rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL].parse(
      install?.args
    )[0]
    expect(launchRequest.spawnClass).toBe('game')
    expect(installRequest).not.toHaveProperty('spawnClass')
  })

  it('sends spawnClass game on launch_wine_command for the sideload launch, and helper for any other wine command', async () => {
    const r = rig()
    const gameSettings = { winePrefix: '/p' } as GameSettings
    await r.adapter.runWineCommand({
      commandParts: ['/games/x.exe'],
      gameSettings,
      wait: true,
      options: { trackKey: 'x', spawnClass: 'game' }
    })
    await r.adapter.runWineCommand({
      commandParts: ['/games/setup.exe'],
      gameSettings,
      wait: true,
      options: { trackKey: 'x' }
    })
    const [launch, setup] = r.invokes
    expect(launch?.channel).toBe(RUST_LAUNCH_WINE_COMMAND)
    expect(
      rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND].parse(launch?.args)[0].spawnClass
    ).toBe('game')
    expect(
      rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND].parse(setup?.args)[0].spawnClass
    ).toBe('helper')
  })
})

const MANAGERS = join(__dirname, '..', 'storeManagers')

/** The source of one manager file, comments stripped. */
function source(...parts: string[]): string {
  return stripSourceComments(readFileSync(join(MANAGERS, ...parts), 'utf8'))
}

/** From `marker` to the next method (or exported declaration) of the same file: the body of one launch function. */
function bodyFrom(text: string, marker: string): string {
  const start = text.indexOf(marker)
  if (start < 0) throw new Error(`no ${marker}`)
  const rest = text.slice(start + marker.length)
  const next = rest.search(/\n(?: {2}(?:async |get |set )?\w+\(|export )/)
  return next < 0 ? rest : rest.slice(0, next)
}

/** Every non-test `.ts` file under `dir`. */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...walk(path))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(path)
    }
  }
  return out
}

const GAME_CLASS = /spawnClass:\s*'game'/g

describe('the launch sites name the game class (T-88.2-29)', () => {
  it('legendary launch() sets it on its runner call', () => {
    const body = bodyFrom(source('legendary', 'games.ts'), 'async launch(')
    expect(body).toContain('legendary.runRunnerCommand(')
    expect(body.match(GAME_CLASS)).toHaveLength(1)
  })
})

describe('no other call sets the game class (T-88.2-29)', () => {
  it('only the launch sites of the manager code name spawnClass at all', () => {
    const named = walk(MANAGERS)
      .filter((file) =>
        /spawnClass/.test(stripSourceComments(readFileSync(file, 'utf8')))
      )
      .map((file) => file.slice(MANAGERS.length + 1))
      .sort()
    expect(named).toEqual(['legendary/games.ts'])
  })
})
