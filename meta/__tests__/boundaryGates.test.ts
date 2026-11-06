/**
 * Phase 62 plan 01 (D-13, D-14). Proves the `.dependency-cruiser.cjs` rules fire on seeded
 * violations, that the known-violations baseline cannot grow, and that it cannot go stale.
 *
 * Seeded fixtures are generated in a temp dir at test time, never committed as `.ts` under
 * `meta/` (tsconfig.meta.json would typecheck them). Each depcruise child gets its env from
 * `createFakeHomeProfile()` -- never a hand-rolled env literal.
 *
 * Flags confirmed against `depcruise --help` for 18.7.2: `--baseline [file]`,
 * `--baseline-mode <full|shrink-only|format>`, `--ignore-known [file]`, `--output-type json`.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

const REPO_ROOT = join(__dirname, '..', '..')
const CONFIG = join(REPO_ROOT, '.dependency-cruiser.cjs')
const BASELINE = join(REPO_ROOT, '.dependency-cruiser-known-violations.json')
const DEPCRUISE = join(
  REPO_ROOT,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruiser.mjs'
)

const SM = 'src/backend/storeManagers'

interface Violation {
  type?: string
  from: string
  to: string
  rule: { name: string; severity?: string }
}

interface CruiseResult {
  status: number | null
  stderr: string
  /** Violations that are NOT suppressed by --ignore-known. */
  active: Violation[]
  /** Every violation incl. ignored (severity 'ignore'). */
  all: Violation[]
}

function key(v: Violation): string {
  return `${v.rule.name}|${v.from}|${v.to}`
}

/** Pure: sorted keys of a baseline file's content. */
function baselineKeys(content: string): string[] {
  return (JSON.parse(content) as Violation[]).map(key).sort()
}

/** Pure: sorted keys of the live violation set from a `--output-type json` run. */
function liveKeys(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as { summary: { violations: Violation[] } }
  return parsed.summary.violations.map(key).sort()
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
}

function spawnDepcruise(
  cwd: string,
  args: string[],
  baseEnv: NodeJS.ProcessEnv
): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [DEPCRUISE, ...args], {
    cwd,
    encoding: 'utf-8',
    env: baseEnv,
    maxBuffer: 64 * 1024 * 1024
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/**
 * Runs `fn` with a fresh isolated profile and a temp project root inside it, seeded with
 * `files` plus a minimal tsconfig.
 */
function withSeededRoot<T>(
  files: Record<string, string>,
  fn: (ctx: {
    root: string
    env: NodeJS.ProcessEnv
    cruise: (extra?: string[]) => CruiseResult
  }) => T
): T {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-depcruise-' })
  try {
    const root = mkdtempSync(join(profile.root, 'proj-'))
    writeTree(root, {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: './src/', moduleResolution: 'node' }
      }),
      ...files
    })
    const env = profile.childEnv(process.env)
    const cruise = (extra: string[] = []): CruiseResult => {
      // The json reporter always exits 0, so the exit status comes from an `err` run.
      const run = spawnDepcruise(
        root,
        ['--config', CONFIG, '--output-type', 'json', ...extra, 'src'],
        env
      )
      const gate = spawnDepcruise(
        root,
        ['--config', CONFIG, '--output-type', 'err', ...extra, 'src'],
        env
      )
      const all = (
        JSON.parse(run.stdout) as { summary: { violations: Violation[] } }
      ).summary.violations
      return {
        status: gate.status,
        stderr: gate.stderr,
        all,
        active: all.filter((v) => v.rule.severity !== 'ignore')
      }
    }
    return fn({ root, env, cruise })
  } finally {
    profile.dispose()
  }
}

const names = (r: CruiseResult): string[] => r.active.map((v) => v.rule.name)

describe('dependency-cruiser boundary rules (seeded violations)', () => {
  jest.setTimeout(60_000)

  test('no-cross-store-manager fires on a gog -> steam import', () => {
    withSeededRoot(
      {
        [`${SM}/gog/seed.ts`]: `import '../steam/seed'\n`,
        [`${SM}/steam/seed.ts`]: `export const x = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('no-cross-store-manager')
      }
    )
  })

  test('no-cross-store-manager exempts test files', () => {
    withSeededRoot(
      {
        [`${SM}/gog/__tests__/seed.test.ts`]: `import '../../steam/seed'\n`,
        [`${SM}/steam/seed.ts`]: `export const x = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).toBe(0)
        expect(names(r)).toEqual([])
      }
    )
  })

  test('launcher-only-via-store-managers-index fires on a deep static import', () => {
    withSeededRoot(
      {
        'src/backend/launcher.ts': `import './storeManagers/gog/setup'\n`,
        [`${SM}/gog/setup.ts`]: `export const x = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('launcher-only-via-store-managers-index')
      }
    )
  })

  test('launcher-only-via-store-managers-index fires on a dynamic import', () => {
    withSeededRoot(
      {
        'src/backend/launcher.ts': `export async function f() { await import('./storeManagers/steam/bottle') }\n`,
        [`${SM}/steam/bottle.ts`]: `export const x = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('launcher-only-via-store-managers-index')
      }
    )
  })

  test('launcher importing the storeManagers index is allowed', () => {
    withSeededRoot(
      {
        'src/backend/launcher.ts': `import './storeManagers'\n`,
        [`${SM}/index.ts`]: `export const x = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).toBe(0)
        expect(names(r)).toEqual([])
      }
    )
  })

  test('no-depot-parent-back-edge fires on depot/a.ts -> ../depot', () => {
    withSeededRoot(
      {
        [`${SM}/steam/depot.ts`]: `export const x = 1\n`,
        [`${SM}/steam/depot/a.ts`]: `import '../depot'\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('no-depot-parent-back-edge')
      }
    )
  })

  test('no-circular-depot fires on a cycle inside the depot subtree', () => {
    withSeededRoot(
      {
        [`${SM}/steam/depot/a.ts`]: `import './b'\nexport const a = 1\n`,
        [`${SM}/steam/depot/b.ts`]: `import './a'\nexport const b = 1\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('no-circular-depot')
      }
    )
  })

  test('games-split-modules-are-leaves fires on a runtime import of games.ts', () => {
    withSeededRoot(
      {
        [`${SM}/steam/games.ts`]: `export const g = 1\n`,
        [`${SM}/steam/gameLaunch.ts`]: `import { g } from './games'\nexport const l = g\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).not.toBe(0)
        expect(names(r)).toContain('games-split-modules-are-leaves')
      }
    )
  })

  test('games-split-modules-are-leaves allows a type-only import', () => {
    withSeededRoot(
      {
        [`${SM}/steam/games.ts`]: `export type G = number\n`,
        [`${SM}/steam/gameLaunch.ts`]: `import type { G } from './games'\nexport type L = G\n`
      },
      ({ cruise }) => {
        const r = cruise()
        expect(r.status).toBe(0)
        expect(names(r)).toEqual([])
      }
    )
  })
})

describe('known-violations baseline (D-14)', () => {
  jest.setTimeout(60_000)

  const X = {
    [`${SM}/gog/x.ts`]: `import '../steam/target'\n`,
    [`${SM}/steam/target.ts`]: `export const t = 1\n`
  }
  const Y = { [`${SM}/nile/y.ts`]: `import '../steam/target'\n` }

  test('a new violation Y is not absorbed by a baseline holding X', () => {
    withSeededRoot({ ...X, ...Y }, ({ root, env, cruise }) => {
      // Write a baseline containing only X by cruising a tree without Y first.
      const baselineFile = join(root, 'baseline.json')
      const xOnly = join(root, `${SM}/nile/y.ts`)
      const yContent = readFileSync(xOnly, 'utf-8')
      writeFileSync(xOnly, 'export const y = 1\n')
      const wrote = spawnDepcruise(
        root,
        ['--config', CONFIG, '--baseline', baselineFile, 'src'],
        env
      )
      expect(wrote.status).toBe(0)
      writeFileSync(xOnly, yContent)
      const r = cruise(['--ignore-known', baselineFile])
      expect(r.status).not.toBe(0)
      expect(r.active.map((v) => v.from)).toEqual([`${SM}/nile/y.ts`])
    })
  })

  test('--baseline-mode shrink-only leaves a new violation out of the rewritten baseline', () => {
    withSeededRoot({ ...X, ...Y }, ({ root, env }) => {
      const baselineFile = join(root, 'baseline.json')
      const yPath = join(root, `${SM}/nile/y.ts`)
      const yContent = readFileSync(yPath, 'utf-8')
      writeFileSync(yPath, 'export const y = 1\n')
      spawnDepcruise(
        root,
        ['--config', CONFIG, '--baseline', baselineFile, 'src'],
        env
      )
      writeFileSync(yPath, yContent)
      spawnDepcruise(
        root,
        [
          '--config',
          CONFIG,
          '--baseline',
          baselineFile,
          '--baseline-mode',
          'shrink-only',
          'src'
        ],
        env
      )
      const keys = baselineKeys(readFileSync(baselineFile, 'utf-8'))
      expect(keys).toHaveLength(1)
      expect(keys[0]).toContain(`${SM}/gog/x.ts`)
      expect(keys.join('\n')).not.toContain('nile/y.ts')
    })
  })

  test('stale-baseline check detects a fixed violation left in the baseline', () => {
    withSeededRoot(X, ({ root, env, cruise }) => {
      const baselineFile = join(root, 'baseline.json')
      spawnDepcruise(
        root,
        ['--config', CONFIG, '--baseline', baselineFile, 'src'],
        env
      )
      // Fix X; the baseline still lists it.
      writeFileSync(join(root, `${SM}/gog/x.ts`), 'export const x = 1\n')
      const run = spawnDepcruise(
        root,
        ['--config', CONFIG, '--output-type', 'json', 'src'],
        env
      )
      const live = liveKeys(run.stdout)
      expect(live).toEqual([])
      expect(baselineKeys(readFileSync(baselineFile, 'utf-8'))).not.toEqual(
        live
      )
      expect(cruise().status).toBe(0)
    })
  })
})

describe('real repository', () => {
  jest.setTimeout(120_000)

  function cruiseRepo(extra: string[]): {
    status: number | null
    stdout: string
    stderr: string
  } {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-depcruise-' })
    try {
      return spawnDepcruise(
        REPO_ROOT,
        ['--config', CONFIG, ...extra, 'src/backend'],
        profile.childEnv(process.env)
      )
    } finally {
      profile.dispose()
    }
  }

  test('src/backend is clean with no baseline', () => {
    const run = cruiseRepo(['--output-type', 'err'])
    expect(run.status).toBe(0)
  })

  test('no baseline file exists and the boundaries script does not use one', () => {
    expect(existsSync(BASELINE)).toBe(false)
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')
    ) as { scripts: Record<string, string> }
    expect(pkg.scripts.boundaries).not.toContain('--ignore-known')
  })
})
