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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { archiveName } from '../../../meta/buildRunnersOnedir'
import {
  extractRunBlock as extractRunBlockFrom,
  stripHashComments,
  substituteExpressions
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
  permissions?: Record<string, string>
  jobs: Record<
    string,
    {
      needs?: string | string[]
      'runs-on'?: string
      strategy?: {
        matrix?: { include?: WorkflowMatrixLeg[] }
      }
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
  test('declares exactly {os: macos-13, arch: x64} and {os: macos-14, arch: arm64}', () => {
    const parsed = parseWorkflow()
    const include = parsed.jobs.build.strategy?.matrix?.include
    expect(include).toBeDefined()
    expect(include).toHaveLength(2)

    const sorted = [...(include as WorkflowMatrixLeg[])].sort((a, b) =>
      a.arch.localeCompare(b.arch)
    )
    expect(sorted).toEqual([
      { os: 'macos-14', arch: 'arm64' },
      { os: 'macos-13', arch: 'x64' }
    ])
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
  // arch/runner combination -- not eyeballed agreement. The upload step's
  // archive glob is `*_onedir.tar.gz`, so the load-bearing assertion is that
  // archiveName() itself always produces a name that glob matches, and that
  // the arch-suffix segment it embeds (x86_64/arm64) round-trips through the
  // SAME ${{ matrix.arch }} substitution the SHA256SUMS/manifest filenames
  // use in this exact step.
  test.each([
    ['x64', 'legendary'],
    ['x64', 'gogdl'],
    ['x64', 'nile'],
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
      expect(
        '*_onedir.tar.gz'.replace(
          '*',
          runner + '_macOS_' + (arch === 'x64' ? 'x86_64' : 'arm64')
        )
      ).toBe(expectedArchiveName)

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

describe('build-runners-onedir-macos.yml arch guard step', () => {
  const GUARD_STEP_NAME = 'Verify runner architecture matches the matrix leg'

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
