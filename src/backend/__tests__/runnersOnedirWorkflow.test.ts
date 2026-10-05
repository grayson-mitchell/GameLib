/**
 * Phase 34.9 Plan 04: structural + cross-module tests for
 * .github/workflows/build-runners-onedir-macos.yml -- the on-demand CI
 * workflow that builds the three macOS onedir runners (legendary/gogdl/nile)
 * and publishes them to the `runners-onedir-macos` rolling release.
 *
 * Modeled on src/backend/__tests__/releaseWorkflow.test.ts (the precedent):
 * uses ./helpers/workflowSteps's stripHashComments/extractRunBlock so a step
 * comment describing a behavior can never satisfy (or defeat) a test of that
 * behavior -- 34-REVIEW.md WR-04/WR-05 found exactly this defect class in an
 * earlier workflow test. Every negative assertion here runs against a
 * stripHashComments'd copy for the same reason: this workflow's own header
 * comment necessarily NAMES download-helper-binaries, comet, Windows and
 * Linux while explaining why they're absent, so an unstripped assertion
 * would be self-invalidating.
 *
 * Scoping decision (documented in 34.9-04-SUMMARY.md): the plan's <behavior>
 * list asks for zero "ubuntu" occurrences in the whole comment-stripped
 * source, which would conflict with the plan's own Task 1 instruction that
 * `prepare-release` runs on ubuntu-latest (release creation is deliberately
 * isolated on a cheap runner so the two macOS build legs can't race each
 * other into a duplicate `gh release create`). The negative "ubuntu" check
 * below is scoped to the `build:` job only, matching Task 1's own more
 * precise acceptance criteria ("no ubuntu/windows string appears inside the
 * build job").
 */
import { load as loadYaml } from 'js-yaml'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { archiveName } from '../../../meta/buildRunnersOnedir'
import {
  extractRunBlock as extractRunBlockFrom,
  runStepScript,
  stripHashComments,
  substituteExpressions,
  writeStubExecutable
} from './helpers/workflowSteps'

const WORKFLOW_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'build-runners-onedir-macos.yml'
)

function loadWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, 'utf-8')
}

function loadStrippedWorkflow(): string {
  return stripHashComments(loadWorkflow())
}

function extractRunBlock(stepName: string): string {
  return extractRunBlockFrom(loadWorkflow(), stepName)
}

interface WorkflowMatrixLeg {
  os: string
  arch: string
}

interface ParsedWorkflow {
  on?: unknown
  concurrency?: unknown
  permissions?: Record<string, string>
  jobs: Record<
    string,
    {
      needs?: string | string[]
      'runs-on'?: string
      strategy?: {
        matrix?: { include?: WorkflowMatrixLeg[] }
      }
      steps?: Array<{
        name?: string
        uses?: string
        env?: Record<string, string>
        run?: string
      }>
    }
  >
}

function parseWorkflow(): ParsedWorkflow {
  return loadYaml(loadWorkflow()) as ParsedWorkflow
}

/** Extracts the raw `build:` job's YAML block as text, for job-scoped negative assertions. */
function extractBuildJobBlock(): string {
  const stripped = loadStrippedWorkflow()
  const lines = stripped.split('\n')
  const jobsIndex = lines.findIndex((line) => line.trim() === 'jobs:')
  expect(jobsIndex).toBeGreaterThanOrEqual(0)

  const buildIndex = lines.findIndex(
    (line, index) => index > jobsIndex && line.trim() === 'build:'
  )
  expect(buildIndex).toBeGreaterThanOrEqual(0)

  const buildIndent =
    lines[buildIndex].length - lines[buildIndex].trimStart().length
  let endIndex = lines.length
  for (let index = buildIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') {
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= buildIndent) {
      endIndex = index
      break
    }
  }
  return lines.slice(buildIndex, endIndex).join('\n')
}

describe('build-runners-onedir-macos.yml trigger shape', () => {
  test('the only trigger is workflow_dispatch', () => {
    const parsed = parseWorkflow()
    expect(parsed.on).toEqual({ workflow_dispatch: null })
  })

  test('contains no schedule: trigger', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).not.toContain('schedule:')
  })

  test('contains no push:/tags: trigger', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).not.toContain('push:')
    expect(stripped).not.toContain('tags:')
  })
})

describe('build-runners-onedir-macos.yml permissions', () => {
  test('declares permissions: contents: write', () => {
    const parsed = parseWorkflow()
    expect(parsed.permissions).toEqual({ contents: 'write' })
  })

  test('never references secrets. -- the default github.token suffices', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).not.toContain('secrets.')
  })
})

// Overlapping dispatches would interleave their `gh release upload --clobber`
// calls, leaving the release holding one run's archives beside another run's
// SHA256SUMS/BUILD-MANIFEST -- pin:runner-digests would then pin digests that
// match no published archive. Workflow-level (not per-job) so the whole
// prepare-release -> build chain is serialised, and queued rather than
// cancelled so an in-flight upload is never killed half-way through.
describe('build-runners-onedir-macos.yml concurrency', () => {
  test('declares a workflow-level concurrency group that queues, never cancels', () => {
    const parsed = parseWorkflow()
    expect(parsed.concurrency).toEqual({
      group: 'runners-onedir-macos',
      'cancel-in-progress': false
    })
  })
})

describe('build-runners-onedir-macos.yml jobs shape', () => {
  test('declares exactly two jobs: prepare-release and build', () => {
    const parsed = parseWorkflow()
    expect(Object.keys(parsed.jobs).sort()).toEqual([
      'build',
      'prepare-release'
    ])
  })

  test('build declares needs: prepare-release (the race guard, T-34.9-17)', () => {
    const parsed = parseWorkflow()
    expect(parsed.jobs.build.needs).toBe('prepare-release')
  })

  test('prepare-release runs on ubuntu-latest', () => {
    const parsed = parseWorkflow()
    expect(parsed.jobs['prepare-release']['runs-on']).toBe('ubuntu-latest')
  })
})

describe('build-runners-onedir-macos.yml matrix (parsed via YAML, not regex)', () => {
  // Phase 34.18 retired the Intel (x64) leg (GitHub retired that macOS image
  // in December 2025 and the leg was never assigned a runner across three
  // dispatch attempts -- F-34.16-G). Only one leg remains: this asserts an
  // EXACT single-element shape, not merely "arm64 is present among however
  // many legs exist" -- a `toContainEqual`/length-floor assertion would stay
  // green even if a macos-13/x64 leg were reintroduced alongside it.
  test('declares exactly one leg: {os: macos-14, arch: arm64}', () => {
    const parsed = parseWorkflow()
    const include = parsed.jobs.build.strategy?.matrix?.include
    expect(include).toBeDefined()
    expect(include).toHaveLength(1)
    expect(include).toEqual([{ os: 'macos-14', arch: 'arm64' }])
  })

  test('build runs on ${{ matrix.os }}', () => {
    const parsed = parseWorkflow()
    expect(parsed.jobs.build['runs-on']).toBe('${{ matrix.os }}')
  })
})

describe('build-runners-onedir-macos.yml scope guards (comment-stripped)', () => {
  test('never invokes download-helper-binaries', () => {
    expect(loadStrippedWorkflow()).not.toContain('download-helper-binaries')
  })

  test('never uses the install-deps composite action', () => {
    expect(loadStrippedWorkflow()).not.toContain('install-deps')
  })

  test('never mentions comet', () => {
    expect(loadStrippedWorkflow()).not.toContain('comet')
  })

  test('never mentions win32', () => {
    expect(loadStrippedWorkflow()).not.toContain('win32')
  })

  test('the build job never mentions ubuntu (scoped -- see file header)', () => {
    expect(extractBuildJobBlock()).not.toContain('ubuntu')
  })

  test('never mentions windows-', () => {
    expect(loadStrippedWorkflow()).not.toContain('windows-')
  })
})

describe('build-runners-onedir-macos.yml prepare-release publish step', () => {
  const PUBLISH_STEP_NAME = 'Create or update the rolling release'

  test('contains --prerelease', () => {
    expect(extractRunBlock(PUBLISH_STEP_NAME)).toContain('--prerelease')
  })

  test('contains --latest=false', () => {
    expect(extractRunBlock(PUBLISH_STEP_NAME)).toContain('--latest=false')
  })

  test('targets the literal tag runners-onedir-macos', () => {
    expect(extractRunBlock(PUBLISH_STEP_NAME)).toContain('runners-onedir-macos')
  })

  test('self-heals via gh release edit every run', () => {
    expect(extractRunBlock(PUBLISH_STEP_NAME)).toContain(
      'gh release edit runners-onedir-macos --prerelease --latest=false'
    )
  })

  // Regression pin for 34.16-LIVE-GATE.md run 32815489719, this workflow's
  // first-ever dispatch: prepare-release has no `actions/checkout`, so `gh`
  // fell back to resolving the repo from git remotes and died with
  // "failed to run git: fatal: not a git repository" before its first API
  // call. Both halves are asserted, because either one alone would let the
  // defect back in -- GH_REPO without the no-checkout premise is unmotivated,
  // and the no-checkout premise without GH_REPO is the bug itself.
  test('the publish step passes GH_REPO, because prepare-release deliberately has no checkout for gh to infer the repo from', () => {
    const parsed = parseWorkflow()
    const steps = parsed.jobs['prepare-release'].steps as NonNullable<
      (typeof parsed.jobs)['prepare-release']['steps']
    >

    expect(
      steps.some((step) =>
        String(step.uses ?? '').startsWith('actions/checkout')
      )
    ).toBe(false)

    const publishStep = steps.find((step) => step.name === PUBLISH_STEP_NAME)
    expect(publishStep).toBeDefined()
    expect(publishStep?.env?.GH_REPO).toBe('${{ github.repository }}')
  })
})

describe('build-runners-onedir-macos.yml upload step', () => {
  const UPLOAD_STEP_NAME =
    'Publish onedir archives and digests to the rolling release'

  test('contains --clobber', () => {
    expect(extractRunBlock(UPLOAD_STEP_NAME)).toContain('--clobber')
  })

  test('uploads the arch-suffixed SHA256SUMS-${{ matrix.arch }}, not a bare SHA256SUMS', () => {
    const block = extractRunBlock(UPLOAD_STEP_NAME)
    expect(block).toContain('SHA256SUMS-${{ matrix.arch }}')
    expect(block).not.toMatch(/[^-]SHA256SUMS(?!-)/)
  })

  test('uploads the arch-suffixed BUILD-MANIFEST-${{ matrix.arch }}.json', () => {
    expect(extractRunBlock(UPLOAD_STEP_NAME)).toContain(
      'BUILD-MANIFEST-${{ matrix.arch }}.json'
    )
  })

  // Cross-module: proves the filenames this workflow uploads are the exact
  // strings meta/buildRunnersOnedir.ts's archiveName() produces, for every
  // runner -- not eyeballed agreement. The upload step's archive glob is
  // `*_onedir.tar.gz`, so the load-bearing assertion is that archiveName()
  // itself always produces a name that glob matches, and that the arch-suffix
  // segment it embeds (arm64) round-trips through the SAME
  // ${{ matrix.arch }} substitution the SHA256SUMS/manifest filenames use in
  // this exact step. Phase 34.18 retired the x64 leg (archiveName() now
  // throws on any arch other than "arm64" -- meta/buildRunnersOnedir.ts), so
  // the x64 rows this test.each once carried were removed rather than
  // asserting on an arch that no longer exists.
  test.each([
    ['arm64', 'legendary'],
    ['arm64', 'gogdl'],
    ['arm64', 'nile']
  ] as const)(
    'arch=%s runner=%s: archiveName() names a file the *_onedir.tar.gz glob catches, and the digest filenames this step uploads for the same arch',
    (arch, runner) => {
      const block = substituteExpressions(extractRunBlock(UPLOAD_STEP_NAME), {
        'matrix.arch': arch
      })

      const expectedArchiveName = archiveName(runner, arch)
      expect(block).toContain('*_onedir.tar.gz')
      expect(expectedArchiveName).toMatch(/_onedir\.tar\.gz$/)
      expect('*_onedir.tar.gz'.replace('*', runner + '_macOS_' + arch)).toBe(
        expectedArchiveName
      )

      expect(block).toContain(`SHA256SUMS-${arch}`)
      expect(block).toContain(`BUILD-MANIFEST-${arch}.json`)
    }
  )

  test('the upload step runs in the same directory buildRunnersOnedir.ts writes its output to', () => {
    expect(extractRunBlock(UPLOAD_STEP_NAME)).toContain(
      '.build-tools/runners-onedir/out'
    )
  })
})

// 2026-10-05 (phase 34.16 review): the `shasum -c` step used to run AFTER the
// upload, so even a failing check could not stop a publish. It is also only a
// same-run self-consistency check (SHA256SUMS is computed from these same
// archives), so it must not be labelled as verification.
describe('build-runners-onedir-macos.yml SHA256SUMS self-check step', () => {
  function buildSteps() {
    return parseWorkflow().jobs.build.steps ?? []
  }

  test('the shasum -c check runs before the upload step', () => {
    const steps = buildSteps()
    const checkIndex = steps.findIndex((step) =>
      /shasum -a 256 -c/.test(step.run ?? '')
    )
    const uploadIndex = steps.findIndex((step) =>
      /gh release upload/.test(step.run ?? '')
    )
    expect(checkIndex).toBeGreaterThanOrEqual(0)
    expect(uploadIndex).toBeGreaterThanOrEqual(0)
    expect(checkIndex).toBeLessThan(uploadIndex)
  })

  test('the shasum -c step is not named as a verification', () => {
    const check = buildSteps().find((step) =>
      /shasum -a 256 -c/.test(step.run ?? '')
    )
    expect(check?.name).toBeDefined()
    expect(check?.name).not.toMatch(/verif/i)
  })
})

describe('build-runners-onedir-macos.yml arch guard step', () => {
  // Plan 34.18-02 renamed this step to append
  // "(matrix.arch=${{ matrix.arch }})" -- a cosmetic change made to hold the
  // file's non-comment `matrix.arch` interpolation count steady at its
  // pre-edit baseline of 7 after the arch-verify step's `if` conditional was
  // collapsed to a single literal. The guard's behavior (uname -m / ::error::
  // / exit 1) is unchanged; only its exact-match `name:` lookup needed
  // updating.
  const GUARD_STEP_NAME =
    'Verify runner architecture matches the matrix leg (matrix.arch=${{ matrix.arch }})'

  test('exists and references uname -m', () => {
    expect(extractRunBlock(GUARD_STEP_NAME)).toContain('uname -m')
  })

  test('fails loudly (::error:: + exit 1) on mismatch', () => {
    const block = extractRunBlock(GUARD_STEP_NAME)
    expect(block).toContain('::error::')
    expect(block).toMatch(/::error::[\s\S]*?exit 1/)
  })

  test('the guard step precedes the build step', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).toMatch(
      /Verify runner architecture matches the matrix leg[\s\S]*?Build the three onedir runners/
    )
  })
})

// Replaces the D-02 branch-name guard (todo 2026-10-05 "refuses main and
// points at a stale branch"). That guard compared github.ref_name against the
// default branch and told the operator to re-dispatch on a named feature
// branch -- correct only while main lacked the build script. Once main
// carried it, the guard refused the one ref whose RELEASE_TAGS should ship
// and redirected dispatches onto a branch 1,510 commits behind. The guard now
// asks the question it was always standing in for: does the commit under
// dispatch carry the build script? It is EXECUTED below against a stubbed
// `gh` serving a synthetic tree, not pattern-matched.
describe('build-runners-onedir-macos.yml build-script guard step', () => {
  const GUARD_STEP_NAME =
    'Refuse to run from a ref without the onedir build script'
  const REPO_ROOT = join(__dirname, '..', '..', '..')
  const DISPATCH_SHA = '0123456789abcdef0123456789abcdef01234567'

  let workdir: string

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'gamelib-onedir-guard-'))
  })

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true })
  })

  /**
   * A `gh` stub modelling `gh api repos/<repo>/contents/<path>?ref=<sha>`:
   * it serves `<path>` out of FAKE_TREE, printing the file and exiting 0 when
   * it exists, exiting 1 (as gh does on a 404) when it does not. It also
   * refuses any ref other than DISPATCH_SHA, so a guard that stopped pinning
   * the lookup to the dispatched commit would fail here. Any other gh
   * invocation fails loudly so the guard cannot quietly depend on one.
   */
  function stubGh(): string {
    const binDir = join(workdir, 'bin')
    mkdirSync(binDir)
    writeStubExecutable(
      binDir,
      'gh',
      [
        '#!/usr/bin/env bash',
        '[ "$1" = "api" ] || { echo "unexpected gh call: $*" >&2; exit 99; }',
        'for arg in "$@"; do',
        '  case "$arg" in',
        '    repos/*/contents/*)',
        '      path="${arg#repos/*/contents/}"',
        '      ref="${path##*\\?ref=}"',
        '      path="${path%%\\?*}"',
        `      [ "$ref" = "${DISPATCH_SHA}" ] || { echo "unexpected ref: $ref" >&2; exit 97; }`,
        '      [ -f "$FAKE_TREE/$path" ] || { echo "HTTP 404: Not Found" >&2; exit 1; }',
        '      cat "$FAKE_TREE/$path"',
        '      exit 0',
        '      ;;',
        '  esac',
        'done',
        'echo "no contents path in: $*" >&2',
        'exit 98',
        ''
      ].join('\n')
    )
    return binDir
  }

  function seedTree(options: { script: boolean; packageScript: boolean }) {
    const tree = join(workdir, 'tree')
    mkdirSync(join(tree, 'meta'), { recursive: true })
    if (options.script) {
      writeFileSync(join(tree, 'meta', 'buildRunnersOnedir.ts'), '// stub\n')
    }
    const scripts: Record<string, string> = { lint: 'eslint .' }
    if (options.packageScript) {
      scripts['build-runners-onedir'] = 'node meta/runTs.cjs'
    }
    writeFileSync(
      join(tree, 'package.json'),
      JSON.stringify({ scripts }, null, 2)
    )
    return tree
  }

  function runGuard(tree: string, sha = DISPATCH_SHA) {
    const binDir = stubGh()
    return runStepScript(extractRunBlock(GUARD_STEP_NAME), workdir, {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_TREE: tree,
      GH_REPO: 'owner/repo',
      REF_NAME: 'main',
      SHA: sha
    })
  }

  test("prepare-release's FIRST step is the build-script guard (position, not mere presence -- a guard placed after gh release create would create the rolling release before refusing)", () => {
    const parsed = parseWorkflow()
    const steps = parsed.jobs['prepare-release'].steps
    expect(steps).toBeDefined()
    expect((steps as NonNullable<typeof steps>).length).toBeGreaterThan(0)
    expect((steps as NonNullable<typeof steps>)[0].name).toBe(GUARD_STEP_NAME)
  })

  test('passes a dispatch on main when the commit carries both the script file and the package.json script', () => {
    const result = runGuard(seedTree({ script: true, packageScript: true }))
    expect(result.stdout + result.stderr).not.toContain('::error::')
    expect(result.status).toBe(0)
  })

  test('passes against THIS checkout -- main as it stands carries what the build leg runs', () => {
    const result = runGuard(REPO_ROOT)
    expect(result.stdout + result.stderr).not.toContain('::error::')
    expect(result.status).toBe(0)
  })

  test('fails loudly (::error:: + non-zero) when meta/buildRunnersOnedir.ts is absent at the dispatched commit', () => {
    const result = runGuard(seedTree({ script: false, packageScript: true }))
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('::error::')
    expect(result.stdout).toContain('meta/buildRunnersOnedir.ts')
  })

  test('fails loudly (::error:: + non-zero) when package.json lacks the build-runners-onedir script', () => {
    const result = runGuard(seedTree({ script: true, packageScript: false }))
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('::error::')
    expect(result.stdout).toContain('build-runners-onedir')
  })

  test('fails closed (::error:: + non-zero) when the commit sha resolves empty, rather than silently permitting the run', () => {
    const result = runGuard(seedTree({ script: true, packageScript: true }), '')
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('::error::')
  })

  test('the script name the guard checks is the one the build step runs', () => {
    expect(extractRunBlock(GUARD_STEP_NAME)).toContain(
      '"build-runners-onedir":'
    )
    expect(loadStrippedWorkflow()).toContain(
      'run: pnpm build-runners-onedir --arch=${{ matrix.arch }}'
    )
  })

  test('reads the token, repo, ref and commit through env:, not by direct interpolation into the shell body', () => {
    const parsed = parseWorkflow()
    const steps = parsed.jobs['prepare-release'].steps as NonNullable<
      ParsedWorkflow['jobs'][string]['steps']
    >
    const guardStep = steps.find((step) => step.name === GUARD_STEP_NAME)
    expect(guardStep).toBeDefined()
    expect((guardStep as NonNullable<typeof guardStep>).env).toEqual({
      GH_TOKEN: '${{ github.token }}',
      GH_REPO: '${{ github.repository }}',
      REF_NAME: '${{ github.ref_name }}',
      SHA: '${{ github.sha }}'
    })
    expect(extractRunBlock(GUARD_STEP_NAME)).not.toContain('${{')
  })

  test('no longer compares against the default branch or names a branch to re-dispatch onto (comments included)', () => {
    const raw = loadWorkflow()
    expect(raw).not.toContain('default_branch')
    expect(raw).not.toContain('fix/steam-native-install-stability')
  })
})

describe('build-runners-onedir-macos.yml build invocation', () => {
  test('invokes pnpm build-runners-onedir with the matrix arch', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).toContain(
      'run: pnpm build-runners-onedir --arch=${{ matrix.arch }}'
    )
  })
})

describe('build-runners-onedir-macos.yml action versions', () => {
  test('uses actions/checkout@v6', () => {
    expect(loadStrippedWorkflow()).toContain('actions/checkout@v6')
  })

  test('uses pnpm/action-setup@v4', () => {
    expect(loadStrippedWorkflow()).toContain('pnpm/action-setup@v4')
  })

  test('uses actions/setup-node@v6', () => {
    expect(loadStrippedWorkflow()).toContain('actions/setup-node@v6')
  })
})
