/** Pure fixture tests for meta/sidecarExitCheck.ts (no spawn). */
import {
  assertRepoRoot,
  classifySurvivors,
  descendantsOf,
  exitVerdict,
  parsePs,
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
})
