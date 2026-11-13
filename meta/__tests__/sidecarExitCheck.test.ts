/**
 * Tests for meta/sidecarExitCheck.ts. T1-T7 are pure fixtures. T8 spawns a stub sidecar through
 * runEof under an isolated createFakeHomeProfile().
 *
 * The isolated arm is the right and only arm for T8: the defect it pins (WR-03) is in the
 * harness's control flow (a driver exiting past runEof's finally), not in anything that arms
 * only under a populated profile, so the two-profile rule needs no real-profile arm here.
 */
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import {
  assertRepoRoot,
  classifySurvivors,
  descendantsOf,
  exitCodeFor,
  exitVerdict,
  parsePs,
  runEof,
  type PsRow
} from '../sidecarExitCheck'

const PS = [
  '  100     1   100 /Applications/GameLib.app/Contents/MacOS/gamelib-shell',
  '  200   100   200 node build/main/sidecar.js',
  '  300   200   200 wine64 game.exe',
  '  400   300   200 wineserver -p',
  '  500     1   500 /usr/bin/other'
].join('\n')

function rows(): PsRow[] {
  const r = parsePs(PS)
  if (!Array.isArray(r)) throw new Error('fixture failed to parse')
  return r
}

describe('sidecarExitCheck', () => {
  test('T1 parsePs parses rows and rejects blank/header-only input', () => {
    const r = rows()
    expect(r).toHaveLength(5)
    expect(r[1]).toEqual({
      pid: 200,
      ppid: 100,
      pgid: 200,
      command: 'node build/main/sidecar.js'
    })
    expect(parsePs('')).toMatchObject({ status: 'INVALID' })
    expect(parsePs('  PID PPID PGID COMMAND\n')).toMatchObject({
      status: 'INVALID'
    })
  })

  test('T2 descendantsOf returns transitive children, not the root', () => {
    expect(
      descendantsOf(rows(), 200)
        .map((r) => r.pid)
        .sort()
    ).toEqual([300, 400])
  })

  test('T3 classifySurvivors reports alive and reparented, ignores gone and reused pids', () => {
    const before = descendantsOf(rows(), 200)
    const after: PsRow[] = [
      { pid: 300, ppid: 1, pgid: 200, command: 'wine64 game.exe' },
      { pid: 400, ppid: 300, pgid: 200, command: 'something else entirely' }
    ]
    expect(classifySurvivors(before, after)).toEqual([
      { pid: 300, command: 'wine64 game.exe', state: 'reparented' }
    ])
    const alive: PsRow[] = [
      { pid: 400, ppid: 300, pgid: 200, command: 'wineserver -p' }
    ]
    expect(classifySurvivors(before, alive)).toEqual([
      { pid: 400, command: 'wineserver -p', state: 'alive' }
    ])
    expect(classifySurvivors(before, [])).toEqual([])
  })

  test('T4 eof verdict thresholds and survivors', () => {
    const base = { mode: 'eof' as const, survivors: [], sidecarFound: true }
    expect(exitVerdict({ ...base, latencyMs: 700 })).toBe('PASS')
    expect(exitVerdict({ ...base, latencyMs: 2500 })).toBe('WARN')
    expect(exitVerdict({ ...base, latencyMs: 5100 })).toBe('FAIL')
    expect(
      exitVerdict({
        ...base,
        latencyMs: 100,
        survivors: [{ pid: 1, command: 'x', state: 'alive' }]
      })
    ).toBe('FAIL')
  })

  test('T5 live verdict thresholds', () => {
    const base = { mode: 'live' as const, survivors: [], sidecarFound: true }
    expect(exitVerdict({ ...base, latencyMs: 1600 })).toBe('WARN')
    expect(exitVerdict({ ...base, latencyMs: 800 })).toBe('PASS')
    expect(exitVerdict({ ...base, latencyMs: 5100 })).toBe('FAIL')
    expect(exitVerdict({ ...base, latencyMs: null })).toBe('INVALID')
  })

  test('T6 a missing sidecar pid is INVALID, never PASS', () => {
    expect(
      exitVerdict({
        mode: 'live',
        latencyMs: 10,
        survivors: [],
        sidecarFound: false
      })
    ).toBe('INVALID')
  })

  test('T7 assertRepoRoot rejects a temp dir and accepts the repo root', () => {
    expect(() => assertRepoRoot('/tmp/x', () => false)).toThrow(/repo root/)
    expect(() => assertRepoRoot(process.cwd())).not.toThrow()
  })

  test('T9 exitCodeFor keeps the CLI exit codes: PASS/WARN 0, FAIL 1, INVALID 2', () => {
    expect(exitCodeFor('PASS')).toBe(0)
    expect(exitCodeFor('WARN')).toBe(0)
    expect(exitCodeFor('FAIL')).toBe(1)
    expect(exitCodeFor('INVALID')).toBe(2)
  })

  describe('runEof never-READY path', () => {
    let stubDir = ''
    let stubJs = ''

    beforeAll(() => {
      stubDir = mkdtempSync(join(tmpdir(), 'gamelib-sidecarExitCheck-stub-'))
      stubJs = join(stubDir, 'neverReady.cjs')
      // Writes a marker into HOME (the profile root), prints a line that is not the READY
      // sentinel, then idles on one referenced timer. The 30 s timer is only a safety bound so a
      // regression cannot leak a process forever; a regression still fails T8 because the stub
      // would be alive at assertion time.
      writeFileSync(
        stubJs,
        [
          "const fs = require('node:fs')",
          "const path = require('node:path')",
          "fs.writeFileSync(path.join(process.env.HOME, 'stub-marker'), String(process.pid))",
          "console.log('stub-sidecar: booted, never ready')",
          'setTimeout(() => process.exit(0), 30000)'
        ].join('\n')
      )
    })

    afterAll(() => {
      rmSync(stubDir, { recursive: true, force: true })
    })

    test('T8 eof: a sidecar that never writes READY is SIGKILLed and its profile disposed before runEof resolves', async () => {
      // resetMocks is on for the Meta project: create the spy inside the body.
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`process.exit(${String(code)}) called inside runEof`)
      }) as never)
      try {
        let child: ChildProcess | undefined
        let profile: FakeHomeProfile | undefined
        let markerAtDispose: boolean | undefined
        let childExitedAtDispose: boolean | undefined

        const report = await runEof({
          sidecarJs: stubJs,
          readyWaitMs: 3000,
          onSpawn: (c) => {
            child = c
          },
          createProfile: () => {
            const real = createFakeHomeProfile({
              prefix: 'gamelib-sidecarExitCheck-test-'
            })
            profile = real
            return {
              ...real,
              dispose: () => {
                markerAtDispose = existsSync(join(real.root, 'stub-marker'))
                childExitedAtDispose =
                  child !== undefined &&
                  (child.exitCode !== null || child.signalCode !== null)
                real.dispose()
              }
            }
          }
        })

        expect(exitSpy).not.toHaveBeenCalled()
        expect(report).toMatchObject({
          mode: 'eof',
          verdict: 'INVALID',
          latencyMs: null,
          survivors: []
        })
        expect(report.note).toMatch(/READY/)

        if (child === undefined || child.pid === undefined || !profile) {
          throw new Error('runEof never spawned the stub or minted a profile')
        }
        expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
        expect(() => process.kill(child?.pid as number, 0)).toThrow()
        expect(existsSync(profile.root)).toBe(false)
        // Ordering: reap before dispose, and the directory removed was a populated one.
        expect(markerAtDispose).toBe(true)
        expect(childExitedAtDispose).toBe(true)
      } finally {
        exitSpy.mockRestore()
      }
    }, 30_000)
  })
})
