/**
 * quick 261122-n4q: the pure logic in gamelib_installapp.h (folder listing with gaps, folder
 * match, nesting check, move wait state machine), compiled host-side with a fake vtable. The
 * header body is arm64-only, so this suite runs on darwin arm64 only. Nothing here links or
 * dlopens steamclient.
 */
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const HEADER_DIR = join(REPO_ROOT, 'native', 'steam-bridge', 'helper')
const FIXTURE = join(__dirname, 'fixtures', 'installapp_harness.c')

const describeArm64Darwin =
  process.platform === 'darwin' && process.arch === 'arm64'
    ? describe
    : describe.skip

const CASES = [
  'folders-gaps-keep-index',
  'folders-find-skips-gap',
  'folders-find-unregistered',
  'folders-relative-refused',
  'folders-missing-dir-refused',
  'folders-all-gaps-refused',
  'folders-count-out-of-range',
  'within-child',
  'within-sibling-prefix',
  'within-equal',
  'within-root',
  'nesting-inside',
  'nesting-contains',
  'nesting-none',
  'nesting-skips-gap',
  'wait-steam-verifies-itself',
  'wait-nudge-once-then-finish',
  'wait-nudge-then-not-settled',
  'wait-no-validate-slot',
  'wait-fallback-without-files-missing',
  'wait-busy-resets-quiet',
  'wait-not-started',
  'wait-cap'
]

describeArm64Darwin('gamelib_installapp.h pure logic (host harness)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | null = null
  let output = ''

  beforeAll(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-installapp-harness-' })
    const bin = join(profile.root, 'installapp_harness')
    try {
      execFileSync(
        'clang',
        [
          '-arch',
          'arm64',
          '-std=gnu11',
          '-Wall',
          '-Werror',
          '-Wno-unused-function',
          '-I',
          HEADER_DIR,
          '-o',
          bin,
          FIXTURE
        ],
        { cwd: REPO_ROOT, env: profile.childEnv(), stdio: 'pipe' }
      )
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        return
      }
      throw e
    }
    output = execFileSync(bin, [profile.root], {
      cwd: REPO_ROOT,
      env: profile.childEnv(),
      encoding: 'utf8'
    })
  }, 60000)

  afterAll(() => {
    profile?.dispose()
  })

  test.each(CASES)('case %s passes', (name) => {
    if (skipReason) {
      console.warn(`skipped: ${skipReason}`)
      return
    }
    expect(output).toContain(`PASS ${name}\n`)
    expect(output).not.toContain('FAIL')
  })
})
