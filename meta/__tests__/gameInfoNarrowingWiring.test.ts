/**
 * Pins the wiring of `pnpm gameinfo-narrowing-ceiling` (phase 70, D-15): the
 * package.json script, the lint.yml CI step (after Module boundaries and the Steam line ceiling) and the
 * pre-push hook. The lint.yml step is guarded like Backend DI ceilings so a red earlier step
 * cannot hide it (70 gap G1).
 */

import { load } from 'js-yaml'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')

interface Step {
  id?: string
  name?: string
  uses?: string
  if?: string
  run?: string
}
interface ParsedWorkflow {
  jobs?: { lint?: { steps?: Step[] } }
}

function read(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), 'utf-8')
}

function stepIndex(steps: Step[], run: string): number {
  return steps.findIndex((s) => s.run === run)
}

const GATE_RUN = 'pnpm gameinfo-narrowing-ceiling'

/** True when the gate step still runs after a red earlier step but not after a failed install. */
function gateUnmasked(steps: Step[]): boolean {
  const deps = steps.find((s) => (s.uses ?? '').includes('install-deps'))
  const gate = steps.find((s) => s.run === GATE_RUN)
  if (!deps || deps.id !== 'deps' || !gate) return false
  const cond = gate.if ?? ''
  return (
    cond.includes('!cancelled()') &&
    cond.includes("steps.deps.outcome == 'success'")
  )
}

const lintYml = read('.github', 'workflows', 'lint.yml')
const prePush = read('.husky', 'pre-push')
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
}

function lintSteps(): Step[] {
  return (load(lintYml) as ParsedWorkflow).jobs?.lint?.steps ?? []
}

describe('gameinfo-narrowing-ceiling gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('package.json script runs the gate', () => {
    expect(pkg.scripts['gameinfo-narrowing-ceiling']).toBe(
      'node meta/gameInfoNarrowingCeiling.cjs'
    )
  })

  it('lint.yml runs the gate after Module boundaries and the Steam line ceiling', () => {
    const steps = lintSteps()
    const gate = stepIndex(steps, 'pnpm gameinfo-narrowing-ceiling')
    const boundaries = stepIndex(steps, 'pnpm boundaries')
    const steamCeiling = stepIndex(steps, 'pnpm steam-line-ceiling')
    expect(boundaries).toBeGreaterThanOrEqual(0)
    expect(steamCeiling).toBeGreaterThan(boundaries)
    expect(gate).toBeGreaterThan(steamCeiling)
  })

  it('near-miss: with the step filtered out the check would fail', () => {
    const steps = lintSteps().filter(
      (s) => s.run !== 'pnpm gameinfo-narrowing-ceiling'
    )
    expect(stepIndex(steps, 'pnpm gameinfo-narrowing-ceiling')).toBe(-1)
  })

  it('70 gap G1: the gate step runs even when an earlier Lint step is red', () => {
    expect(gateUnmasked(lintSteps())).toBe(true)
  })

  it('near-miss: without the if guard the gate would be masked', () => {
    const steps = lintSteps().map((s) => {
      if (s.run !== GATE_RUN) return s
      const { if: _if, ...rest } = s
      return rest
    })
    expect(gateUnmasked(steps)).toBe(false)
  })

  it('pre-push runs the ratchet on its own line and never chains with &&', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain('pnpm codecheck')
    expect(lines).toContain(
      'pnpm gameinfo-narrowing-ceiling || checks_status=1'
    )
    expect(lines.some((l) => l.includes('&& pnpm'))).toBe(false)
    expect(
      lines.findIndex((l) => l.startsWith('pnpm gameinfo-narrowing-ceiling'))
    ).toBeGreaterThan(
      lines.findIndex((l) => l.startsWith('pnpm backend-di-ceilings'))
    )
  })
})

const EXPECTED_ORDER = [
  'codecheck',
  'lint',
  'prettier',
  'i18n',
  'find-deadcode',
  'boundaries',
  'steam-line-ceiling',
  'backend-di-ceilings',
  'gameinfo-narrowing-ceiling'
]

/** The pre-Phase-78 line 2: an && chain, so a red check hides every later one. */
const PRE_78_CHAIN =
  'pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode && pnpm boundaries && pnpm steam-line-ceiling && pnpm backend-di-ceilings'

const describePosix = process.platform === 'win32' ? describe.skip : describe

describePosix('pre-push hook behaviour (stub pnpm)', () => {
  function runHook(
    hookText: string,
    fail: string
  ): { status: number | null; log: string[] } {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-prepush-' })
    try {
      const bin = join(profile.root, 'bin')
      mkdirSync(bin)
      const logFile = join(profile.root, 'pnpm.log')
      writeFileSync(logFile, '')
      writeFileSync(
        join(bin, 'pnpm'),
        '#!/bin/sh\necho "$1" >> "$PNPM_STUB_LOG"\n[ "$1" = "$PNPM_STUB_FAIL" ] && exit 1\nexit 0\n',
        { mode: 0o755 }
      )
      const hook = join(profile.root, 'pre-push')
      writeFileSync(hook, hookText, { mode: 0o755 })
      const r = spawnSync('bash', [hook], {
        cwd: profile.root,
        input: '',
        encoding: 'utf8',
        env: profile.childEnv({
          PATH: `${bin}:/usr/bin:/bin`,
          PNPM_STUB_LOG: logFile,
          PNPM_STUB_FAIL: fail
        })
      })
      return {
        status: r.status,
        log: readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
      }
    } finally {
      profile.dispose()
    }
  }

  it('all green runs every check in order and exits 0', () => {
    const r = runHook(prePush, '')
    expect(r.status).toBe(0)
    expect(r.log).toEqual(EXPECTED_ORDER)
  })

  it.each(EXPECTED_ORDER)(
    'a red %s still runs every check and fails the push',
    (name) => {
      const r = runHook(prePush, name)
      expect(r.status).not.toBe(0)
      expect(r.log).toEqual(EXPECTED_ORDER)
    }
  )

  it('a red ratchet alone fails the push', () => {
    const r = runHook(prePush, 'gameinfo-narrowing-ceiling')
    expect(r.status).not.toBe(0)
  })

  it('near-miss: the pre-78 && chain never reaches prettier after a red lint', () => {
    const oldHook = [
      '#!/bin/bash',
      PRE_78_CHAIN,
      'checks_status=$?',
      'exit "$checks_status"',
      ''
    ].join('\n')
    const r = runHook(oldHook, 'lint')
    expect(r.status).not.toBe(0)
    expect(r.log).not.toContain('prettier')
  })
})
