/**
 * Phase 86 D-25: the Rust shell bakes the IsThereAnyDeal key at COMPILE time, so the release
 * workflow's Tauri build step (the one that runs cargo) must carry `ITAD_API_KEY` from the repo
 * secret. Phase 86 (86-17) removed the key from the sidecar SEA step: no TS ITAD code is left, so the
 * sidecar bundle holds no key and the shell build is its only home. Without it a signed release shows
 * "not set up in this build" for Store Search.
 *
 * A workflow cannot be run from jest, so this is wiring: the workflow is parsed to a steps array
 * and compared by INDEX (a raw-text order check is unsound against step comments), and the two
 * Rust source lines the env var feeds are pinned by text in files other than this one.
 */
import { load } from 'js-yaml'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertAtOrAboveFloor } from '../../src/backend/testUtils/censusFloor'
import { walkStripped } from '../../src/backend/testUtils/infoPortGate'

const REPO_ROOT = join(__dirname, '..', '..')

interface Step {
  name?: string
  uses?: string
  run?: string
  env?: Record<string, unknown>
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>
}

const SECRET = '${{ secrets.ITAD_API_KEY }}'
const SEA_STEP = 'Build self-contained sidecar (Node SEA)'

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8')

/** The file without its `//` comment lines, so prose cannot satisfy a code assertion. */
const rustCode = (rel: string): string =>
  read(rel)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')

/** What the gamelib-info crate may not contain; the names of the rules `code` breaks. */
const findBanned = (code: string): string[] => {
  const banned: string[] = []
  if (/option_env!/.test(code)) banned.push('option_env!')
  if (/(?<![A-Za-z_])env!\((?!\s*"CARGO_MANIFEST_DIR")/.test(code)) {
    banned.push('env!')
  }
  if (/env::var\("/.test(code)) banned.push('env::var with a literal name')
  if (code.includes('ITAD_API_KEY')) banned.push('ITAD_API_KEY')
  return banned
}

function releaseSteps(doc: Workflow): Step[] {
  const steps = doc.jobs.release?.steps
  if (!steps) throw new Error('jobs.release.steps not found')
  return steps
}

const isTauriBuild = (s: Step): boolean =>
  (s.uses ?? '').startsWith('tauri-apps/tauri-action')

const isFailFast = (s: Step): boolean =>
  (s.run ?? '').includes('test -n "$IN_ITAD_API_KEY"')

/**
 * What the workflow must look like: the fail-fast step first, then the SEA step WITHOUT the key and the
 * Tauri build step carrying the secret. Returns the failures, empty when it holds.
 */
function problems(doc: Workflow): string[] {
  const steps = releaseSteps(doc)
  const found: string[] = []
  const failFast = steps.findIndex(isFailFast)
  const sea = steps.findIndex((s) => s.name === SEA_STEP)
  const tauri = steps.findIndex(isTauriBuild)
  if (failFast < 0) found.push('no "Require the ITAD_API_KEY secret" step')
  if (sea < 0) found.push('no sidecar SEA step')
  if (tauri < 0) found.push('no tauri-action step')
  if (found.length > 0) return found
  if (steps[failFast]?.env?.IN_ITAD_API_KEY !== SECRET) {
    found.push('the fail-fast step does not read the secret')
  }
  if (steps[sea]?.env && 'ITAD_API_KEY' in steps[sea].env) {
    found.push('the sidecar step carries ITAD_API_KEY')
  }
  if (steps[tauri]?.env?.ITAD_API_KEY !== SECRET) {
    found.push('the Tauri build step does not carry ITAD_API_KEY from secrets')
  }
  if (!(failFast < sea))
    found.push('the fail-fast step runs after the SEA step')
  if (!(failFast < tauri)) {
    found.push('the fail-fast step runs after the Tauri build step')
  }
  return found
}

const workflow = load(read('.github/workflows/release-tauri.yml')) as Workflow

describe('release-tauri.yml bakes the ITAD key into the Rust shell (D-25)', () => {
  test('self-test: the workflow has the three steps, the Tauri build carries the secret and the sidecar does not', () => {
    expect(problems(workflow)).toEqual([])
  })

  test('the Tauri build step maps ITAD_API_KEY to the secret, in its own step env', () => {
    const step = releaseSteps(workflow).find(isTauriBuild)
    expect(step?.env?.ITAD_API_KEY).toBe(SECRET)
  })

  test('the sidecar step carries no ITAD_API_KEY (D-25: the key lives only in the shell build)', () => {
    const step = releaseSteps(workflow).find((s) => s.name === SEA_STEP)
    expect(step).toBeDefined()
    expect(Object.keys(step?.env ?? {})).not.toContain('ITAD_API_KEY')
  })

  test('the fail-fast step still runs before both builds', () => {
    const steps = releaseSteps(workflow)
    const failFast = steps.findIndex(isFailFast)
    expect(failFast).toBeGreaterThan(-1)
    expect(failFast).toBeLessThan(steps.findIndex(isTauriBuild))
    expect(failFast).toBeLessThan(steps.findIndex((s) => s.name === SEA_STEP))
  })

  test('the key is a step-level env, never job-level, and no run body echoes it', () => {
    const job = (workflow.jobs.release as { env?: Record<string, unknown> }).env
    expect(Object.keys(job ?? {})).not.toContain('ITAD_API_KEY')
    for (const step of releaseSteps(workflow)) {
      expect(step.run ?? '').not.toMatch(/echo[^\n]*\$\{?(IN_)?ITAD_API_KEY/)
    }
  })

  test('mutation: removing the Tauri step env makes the check fail', () => {
    const mutated = structuredClone(workflow)
    const step = releaseSteps(mutated).find(isTauriBuild)
    if (!step) throw new Error('tauri-action step not found')
    delete step.env
    expect(problems(mutated)).toEqual([
      'the Tauri build step does not carry ITAD_API_KEY from secrets'
    ])
  })

  test('mutation: putting the key back on the sidecar step makes the check fail', () => {
    const mutated = structuredClone(workflow)
    const step = releaseSteps(mutated).find((s) => s.name === SEA_STEP)
    if (!step) throw new Error('sidecar step not found')
    step.env = { ...step.env, ITAD_API_KEY: SECRET }
    expect(problems(mutated)).toEqual(['the sidecar step carries ITAD_API_KEY'])
  })

  test('mutation: a Tauri step env that names another secret makes the check fail', () => {
    const mutated = structuredClone(workflow)
    const step = releaseSteps(mutated).find(isTauriBuild)
    if (!step) throw new Error('tauri-action step not found')
    step.env = { ITAD_API_KEY: '${{ secrets.OTHER }}' }
    expect(problems(mutated)).toHaveLength(1)
  })

  test('mutation: moving the fail-fast step after the Tauri build step makes the check fail', () => {
    const mutated = structuredClone(workflow)
    const steps = releaseSteps(mutated)
    const at = steps.findIndex(isFailFast)
    const [moved] = steps.splice(at, 1)
    if (!moved) throw new Error('fail-fast step not found')
    steps.splice(steps.findIndex(isTauriBuild) + 1, 0, moved)
    expect(problems(mutated)).toContain(
      'the fail-fast step runs after the Tauri build step'
    )
  })
})

describe('the Rust shell reads the baked key at compile time (D-25)', () => {
  test('build.rs reruns when ITAD_API_KEY changes, and still calls tauri_build', () => {
    const buildRs = read('src-tauri/build.rs')
    expect(
      buildRs.match(/cargo:rerun-if-env-changed=ITAD_API_KEY/g)
    ).toHaveLength(1)
    expect(buildRs).toContain('tauri_build::build()')
  })

  test('info_dispatch.rs compiles the key with option_env! and reads the runtime override once', () => {
    const source = rustCode('src-tauri/src/info_dispatch.rs')
    expect(source.match(/option_env!\("ITAD_API_KEY"\)/g)).toHaveLength(1)
    expect(source.match(/"GAMELIB_ITAD_API_KEY"/g)).toHaveLength(1)
  })

  test('the crate hard-codes no environment variable name and bakes nothing (D-25)', () => {
    // EnvSecretSource takes its variable names from the caller; the crate itself names none. Every
    // source file of the crate is read (not just the three that hold the key seam), so a later
    // `option_env!("ITAD_API_KEY")` in `itad/gate.rs` or `wiki/*` cannot slip past.
    const walk = walkStripped(['src-tauri/crates/gamelib-info/src'], {
      ext: /\.rs$/
    })
    // 35 files when this was measured (86 review WR-63); a mis-rooted walk reads none.
    assertAtOrAboveFloor('gamelib-info crate sources read', walk.count, 30)
    for (const file of walk.files) {
      // `env!("CARGO_MANIFEST_DIR")` (runner_caps.rs, itad/coverage.rs) is the one compile-time
      // read the crate makes, and it names no key.
      expect({ file: file.path, banned: findBanned(file.code) }).toEqual({
        file: file.path,
        banned: []
      })
    }
  })

  test('the crate scan fails on a planted baked key or variable read', () => {
    expect(findBanned('const K: &str = option_env!("X");')).not.toEqual([])
    expect(findBanned('let k = std::env::var("ITAD_API_KEY");')).not.toEqual([])
    expect(findBanned('let k = env!("ITAD_API_KEY");')).not.toEqual([])
    expect(findBanned('let k = "ITAD_API_KEY";')).not.toEqual([])
    expect(
      findBanned('include_str!(\n    env!("CARGO_MANIFEST_DIR"),\n)')
    ).toEqual([])
  })
})
