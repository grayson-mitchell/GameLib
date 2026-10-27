import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..')
const HEADER_DIR = join(REPO_ROOT, 'native', 'steam-bridge', 'helper')
const FIXTURE = join(__dirname, 'fixtures', 'cbqueue_harness.c')

const CASES = [
  'offer-valid',
  'pop-encode-layout',
  'pop-zeroes-slot',
  'pop-empty',
  'reject-id-163',
  'reject-id-101',
  'reject-size-2571',
  'reject-size-2573',
  'reject-size-0',
  'reject-size-neg',
  'reject-null',
  'overflow-count',
  'drop-oldest',
  'evicted-slot-zero',
  'small-cap-keeps-entry',
  'tiny-cap',
  'usr-repack',
  'reject-1101-mac-size',
  'offer-1101-wire',
  'pop-1101-layout',
  'obs-first-forwards',
  'obs-later-caches-only',
  'obs-other-app',
  'obs-bad-size',
  'req-cached',
  'req-already-queued',
  'req-need-fetch',
  'obs-after-pending',
  'offsets'
]

describe('gamelib_cbqueue.h ring (P55-5, DRAIN queue)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | null = null
  let output = ''

  beforeAll(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-cbqueue-' })
    const bin = join(profile.root, 'cbqueue_harness')
    try {
      execFileSync(
        'clang',
        ['-std=c11', '-Wall', '-Werror', '-I', HEADER_DIR, '-o', bin, FIXTURE],
        { cwd: REPO_ROOT, env: profile.childEnv(), stdio: 'pipe' }
      )
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        return
      }
      throw e
    }
    output = execFileSync(bin, [], {
      cwd: REPO_ROOT,
      env: profile.childEnv(),
      encoding: 'utf8'
    })
  }, 30000)

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
