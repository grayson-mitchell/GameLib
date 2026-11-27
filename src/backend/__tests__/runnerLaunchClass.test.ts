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
import type { GameSettings } from 'common/types'
import type { LogFrameTarget } from 'common/types/sidecarTransport'

import { createRunnerAdapter } from '../runnerAdapter'
import type { RunnerProps } from '../runnerAdapter'

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

  it('gog launch() sets it on its runner call', () => {
    const body = bodyFrom(source('gog', 'games.ts'), 'async launch(')
    expect(body).toContain('gog.runRunnerCommand(')
    expect(body.match(GAME_CLASS)).toHaveLength(1)
  })

  it('nile launch() sets it on its runner call', () => {
    const body = bodyFrom(source('nile', 'games.ts'), 'async launch(')
    expect(body).toContain('nile.runRunnerCommand(')
    expect(body.match(GAME_CLASS)).toHaveLength(1)
  })

  it('the sideload launch sets it on its native callRunner and on its wine runWineCommand', () => {
    const body = bodyFrom(
      source('storeManagerCommon', 'games.ts'),
      'export async function launchGame('
    )
    const native = body.slice(
      body.indexOf('commandRunner.callRunner('),
      body.indexOf('commandRunner.runWineCommand(')
    )
    const wine = body.slice(body.indexOf('commandRunner.runWineCommand('))
    expect(native.match(GAME_CLASS)).toHaveLength(1)
    expect(wine.match(GAME_CLASS)).toHaveLength(1)
    // On the wine command it sits in `options`, where the adapter reads it.
    expect(wine).toMatch(/options:\s*\{[^}]*spawnClass:\s*'game'/)
  })
})

describe('no other call sets the game class (T-88.2-29)', () => {
  it('exactly the five launch sites name spawnClass in the manager code: no install, auth, list or bridge call does', () => {
    const counts: Record<string, number> = {}
    for (const file of walk(MANAGERS)) {
      const found = stripSourceComments(readFileSync(file, 'utf8')).match(
        /spawnClass/g
      )
      if (found) counts[file.slice(MANAGERS.length + 1)] = found.length
    }
    expect(counts).toEqual({
      'gog/games.ts': 1,
      'legendary/games.ts': 1,
      'nile/games.ts': 1,
      'storeManagerCommon/games.ts': 2
    })
  })

  it.each(['gog', 'nile'] as const)(
    'a %s install through the adapter sends no spawn class',
    async (name) => {
      const r = rig()
      await r.adapter.callRunner(
        ['install', 'game'],
        { ...runnerProps, name, bin: name },
        { abortId: 'game' }
      )
      const request = rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL].parse(
        r.invokes[0]?.args
      )[0]
      expect(request.runner.name).toBe(name)
      expect(request).not.toHaveProperty('spawnClass')
    }
  )
})
