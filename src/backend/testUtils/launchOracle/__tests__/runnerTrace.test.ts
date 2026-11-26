/**
 * Self-test for the recording command-runner deps (88.2-01): the log-frame spy keeps call order
 * across two writers, a second write on one runner writer carries `rotate: false`, and the deps
 * never touch the real HOME. The runner under test is the real `createCommandRunner`.
 */
import { createCommandRunner } from 'backend/commandRunner'
import { withEngineOracleProfile } from 'backend/testUtils/engineWineOracle/harness'
import LogWriter from 'backend/logger/targetWriter'
import { withPinnedBaseEnv } from '../baseEnv'
import { createRunnerTrace, recordStream } from '../runnerTrace'

const GOG = {
  name: 'gog' as const,
  logPrefix: 'Gog' as never,
  bin: 'gogdl',
  dir: undefined
}

describe('createRunnerTrace', () => {
  it('records log frames in call order across two writers, the runner writer first', async () => {
    await withEngineOracleProfile(async (profile) => {
      const trace = createRunnerTrace(profile, {
        platform: 'linux',
        script: [
          {
            chunks: [
              { stream: 'stdout', text: 'one' },
              { stream: 'stdout', text: 'two' }
            ]
          }
        ]
      })
      try {
        const extra = new LogWriter(
          { kind: 'game', appName: 'app1', runner: 'gog', type: 'launch' },
          false
        )
        const cr = createCommandRunner(trace.deps)
        await withPinnedBaseEnv(profile.fake, () =>
          cr.callRunner(['download', 'app1'], GOG, { logWriters: [extra] })
        )
        const targets = trace.records.logFrames.map((frame) =>
          JSON.stringify(frame.target)
        )
        // Each writer gets the command line and then `Game Output:`, the caller's writer (pushed
        // first) before the runner's own.
        const game = JSON.stringify({
          kind: 'game',
          appName: 'app1',
          runner: 'gog',
          type: 'launch'
        })
        const runnerTarget = JSON.stringify({ kind: 'runner', runner: 'gog' })
        expect(targets.slice(0, 4)).toEqual([
          game,
          game,
          runnerTarget,
          runnerTarget
        ])
        // Each chunk is delivered to both writers in turn: caller's writer, then the runner's.
        const raw = trace.records.logFrames.filter((frame) => 'raw' in frame)
        expect(raw.map((frame) => ('raw' in frame ? frame.raw : ''))).toEqual([
          'one',
          'one',
          'two',
          'two'
        ])
        trace.expectScriptConsumed()
      } finally {
        trace.restore()
      }
    })
  })

  it('claims the rotate flag once per writer: the second write on the runner writer is false', async () => {
    await withEngineOracleProfile(async (profile) => {
      const trace = createRunnerTrace(profile, {
        platform: 'linux',
        script: [
          { chunks: [{ stream: 'stdout', text: 'a' }] },
          { chunks: [{ stream: 'stdout', text: 'b' }] }
        ]
      })
      try {
        const cr = createCommandRunner(trace.deps)
        await withPinnedBaseEnv(profile.fake, async () => {
          await cr.callRunner(['list', 'first'], GOG, {})
          await cr.callRunner(['list', 'second'], GOG, {})
        })
        const runnerFrames = trace.records.logFrames.filter(
          (frame) => (frame.target as { kind: string }).kind === 'runner'
        )
        expect(runnerFrames.length).toBeGreaterThan(2)
        expect(runnerFrames.map((frame) => frame.rotate)).toEqual(
          runnerFrames.map((_frame, index) => index === 0)
        )
        // The line frames carry no clock: nothing in a recorded frame varies between runs.
        const line = runnerFrames.find((frame) => 'line' in frame)
        expect(line && 'line' in line && Object.keys(line.line)).toEqual([
          'level',
          'prefix',
          'message'
        ])
      } finally {
        trace.restore()
      }
    })
  })

  it('never records the real HOME, and refuses a spawn whose env carries one outside the profile', async () => {
    const realHome = process.env.HOME
    await withEngineOracleProfile(async (profile) => {
      const trace = createRunnerTrace(profile, {
        platform: 'linux',
        script: [{ chunks: [] }]
      })
      try {
        const cr = createCommandRunner(trace.deps)
        await withPinnedBaseEnv(profile.fake, () =>
          cr.callRunner(['list', 'home'], GOG, {})
        )
        const spawn = trace.records.spawns[0]
        expect(spawn?.env?.HOME).toBe(profile.home)
        if (realHome && realHome !== profile.home) {
          expect(JSON.stringify(trace.records)).not.toContain(realHome)
        }
      } finally {
        trace.restore()
      }

      // Without the pinned base env the spawn would carry the shell's own HOME: the trace says so.
      const unpinned = createRunnerTrace(profile, {
        platform: 'linux',
        script: [{ chunks: [] }]
      })
      try {
        const cr = createCommandRunner(unpinned.deps)
        const result = await cr.callRunner(['list', 'unpinned'], GOG, {
          env: { HOME: '/somewhere/else' }
        })
        expect(result.error).toMatch(/HOME outside the fake profile/)
      } finally {
        unpinned.restore()
      }
    })
  })

  it('a step with a program only takes that program, and a script left over fails the case', async () => {
    await withEngineOracleProfile(async (profile) => {
      const trace = createRunnerTrace(profile, {
        platform: 'linux',
        script: [{ program: 'wineserver' }, { program: './gogdl' }]
      })
      try {
        const cr = createCommandRunner(trace.deps)
        await withPinnedBaseEnv(profile.fake, () =>
          cr.callRunner(['list', 'order'], { ...GOG, dir: profile.home }, {})
        )
        expect(trace.records.spawns.map((spawn) => spawn.program)).toEqual([
          './gogdl'
        ])
        expect(() => trace.expectScriptConsumed()).toThrow(/unconsumed/)
      } finally {
        trace.restore()
      }
    })
  })
})

describe('recordStream', () => {
  it('records each chunk in the order it arrives', () => {
    const stream = recordStream()
    const child = {} as never
    stream.onOutput('a', child)
    stream.onOutput('b\n', child)
    stream.onOutput('', child)
    expect(stream.chunks).toEqual(['a', 'b\n', ''])
  })
})
