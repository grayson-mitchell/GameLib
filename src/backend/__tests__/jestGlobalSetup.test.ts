/**
 * Gates for `src/backend/jest.globalSetup.js` (Phase 34.2 gap cycle 4, WR-01).
 *
 * Two properties are under test and they pull in opposite directions, which is
 * the whole difficulty of this fix:
 *
 *   1. HYGIENE -- a run must stop leaving one top-level temp directory per
 *      test file behind. Before the fix, a 174-suite run added 174 top-level
 *      directories and removed none; 6,057 had accumulated (~500 MB).
 *   2. ISOLATION -- each test FILE must still get its own pristine directory.
 *      This was NOT obvious: the first version of this fix collapsed all
 *      suites onto one shared root and broke `settingsFlows.test.ts`, which
 *      read a legendary user record written by an unrelated suite and got the
 *      developer's real username where it asserts `undefined`. The per-file
 *      root had been silently providing a fresh HOME per suite.
 *
 * The reaper deserves the paranoia in the tests below because it issues
 * `rm -rf` inside a shared, world-writable directory. This project has
 * already had one near-miss where a filesystem scan snapshot went stale
 * mid-cleanup against a live install, so every negative case (young dir,
 * symlink, foreign name, current root) is proven to SURVIVE, and each is
 * paired with a positive control proving the reaper is not simply inert.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/* eslint-disable @typescript-eslint/no-require-imports */
// The subject is a CommonJS jest config module, not part of the TS build
// graph; a static import would make ts-jest type-resolve a .js file that
// deliberately has no declarations.
const globalSetupModule = require('../jest.globalSetup.js')
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  RUN_ROOT_PREFIX,
  LEGACY_ROOT_PREFIX,
  CONTAINMENT_ROOT_ENV_KEY,
  REAP_AFTER_MS,
  reapStaleRoots
} = globalSetupModule

/** A sandbox standing in for the real temp root, so no test here can touch it. */
const sandboxes: string[] = []
function makeSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'gamelib-globalsetup-spec-'))
  sandboxes.push(sandbox)
  return sandbox
}

// These sandboxes live under the REAL temp root. Leaving them behind would
// reproduce, in this very suite, the unbounded accumulation WR-01 exists to
// stop -- so they are removed even though each is small.
afterAll(() => {
  for (const sandbox of sandboxes.splice(0, sandboxes.length)) {
    try {
      rmSync(sandbox, { recursive: true, force: true })
    } catch {
      /* best effort: a leftover sandbox is untidy, not a test failure */
    }
  }
})

/** Create a directory inside `sandbox` and backdate it past the reap cutoff. */
function makeAgedDir(sandbox: string, name: string, ageMs: number): string {
  const dir = join(sandbox, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'payload.txt'), 'content')
  const when = (Date.now() - ageMs) / 1000
  utimesSync(dir, when, when)
  return dir
}

const OLD = REAP_AFTER_MS + 60_000
const YOUNG = Math.floor(REAP_AFTER_MS / 2)

describe('jest.globalSetup — reapStaleRoots safety conditions', () => {
  it('POSITIVE CONTROL: removes an aged directory carrying either prefix', () => {
    const sandbox = makeSandbox()
    const run = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}aaaaaa`, OLD)
    const legacy = makeAgedDir(sandbox, `${LEGACY_ROOT_PREFIX}bbbbbb`, OLD)

    const { removed } = reapStaleRoots(
      sandbox,
      join(sandbox, 'not-a-real-root')
    )

    expect(existsSync(run)).toBe(false)
    expect(existsSync(legacy)).toBe(false)
    expect(removed).toBe(2)
  })

  it('a directory YOUNGER than the cutoff survives — a concurrent jest run owns it', () => {
    const sandbox = makeSandbox()
    const young = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}cccccc`, YOUNG)
    const old = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}dddddd`, OLD)

    reapStaleRoots(sandbox, join(sandbox, 'nope'))

    expect(existsSync(young)).toBe(true)
    // Paired positive control: the reaper ran and was capable of deleting.
    expect(existsSync(old)).toBe(false)
  })

  it('a name NOT carrying one of our prefixes survives, however old', () => {
    const sandbox = makeSandbox()
    const foreign = makeAgedDir(sandbox, 'someone-elses-tmpdir', OLD)
    const nearMiss = makeAgedDir(sandbox, 'gamelib-jest', OLD)
    const ours = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}eeeeee`, OLD)

    reapStaleRoots(sandbox, join(sandbox, 'nope'))

    expect(existsSync(foreign)).toBe(true)
    expect(existsSync(nearMiss)).toBe(true)
    expect(existsSync(ours)).toBe(false)
  })

  it('a SYMLINK at a matching name is skipped, not followed — the WR-07 vector', () => {
    const sandbox = makeSandbox()
    const victim = makeAgedDir(sandbox, 'precious-real-directory', OLD)
    const trap = join(sandbox, `${RUN_ROOT_PREFIX}ffffff`)
    symlinkSync(victim, trap)
    const when = (Date.now() - OLD) / 1000
    try {
      utimesSync(trap, when, when)
    } catch {
      /* lutimes is not available everywhere; the lstat check is what matters */
    }

    reapStaleRoots(sandbox, join(sandbox, 'nope'))

    // The symlink's TARGET must be untouched. This is the property that makes
    // the review's prescribed marker-file design unsafe.
    expect(existsSync(victim)).toBe(true)
    expect(existsSync(join(victim, 'payload.txt'))).toBe(true)
  })

  it('the CURRENT run root is never removed, even when it looks stale', () => {
    const sandbox = makeSandbox()
    const current = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}gggggg`, OLD)
    const other = makeAgedDir(sandbox, `${RUN_ROOT_PREFIX}hhhhhh`, OLD)

    reapStaleRoots(sandbox, current)

    expect(existsSync(current)).toBe(true)
    expect(existsSync(other)).toBe(false)
  })

  it('never throws, and reports zero, when the scan root does not exist', () => {
    const missing = join(tmpdir(), 'gamelib-globalsetup-spec-does-not-exist')
    expect(() => reapStaleRoots(missing, 'irrelevant')).not.toThrow()
    expect(reapStaleRoots(missing, 'irrelevant')).toEqual({
      removed: 0,
      skipped: 0
    })
  })

  it('does not descend — a matching name NESTED one level down is untouched', () => {
    const sandbox = makeSandbox()
    const outer = makeAgedDir(sandbox, 'plain-holder', OLD)
    const nested = join(outer, `${RUN_ROOT_PREFIX}iiiiii`)
    mkdirSync(nested)
    const when = (Date.now() - OLD) / 1000
    utimesSync(nested, when, when)

    reapStaleRoots(sandbox, join(sandbox, 'nope'))

    // Per-file roots live one level down inside a run root. If the reaper
    // descended it could delete a live suite's home out from under it.
    expect(existsSync(nested)).toBe(true)
  })
})

describe('jest.globalSetup — run root creation', () => {
  const savedEnv = process.env[CONTAINMENT_ROOT_ENV_KEY]

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[CONTAINMENT_ROOT_ENV_KEY]
    } else {
      process.env[CONTAINMENT_ROOT_ENV_KEY] = savedEnv
    }
  })

  it('exports a 0700 run root under the real temp root via the environment', async () => {
    delete process.env[CONTAINMENT_ROOT_ENV_KEY]

    // This is the one test here that touches the REAL temp root, because
    // that is the behaviour under test. It therefore cleans up after itself:
    // without the rmSync below, this suite adds a leaked run root on every
    // run -- a smaller copy of the exact defect WR-01 is about. Measured
    // during development as delta=+2 per run instead of +1.
    let root: string | undefined
    try {
      await globalSetupModule()

      root = process.env[CONTAINMENT_ROOT_ENV_KEY]
      expect(root).toBeDefined()
      expect(root?.startsWith(join(tmpdir(), RUN_ROOT_PREFIX))).toBe(true)
      expect(existsSync(root as string)).toBe(true)
      expect(statSync(root as string).mode & 0o777).toBe(0o700)
    } finally {
      if (
        root !== undefined &&
        root.startsWith(join(tmpdir(), RUN_ROOT_PREFIX))
      ) {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('self-test: the prefixes are distinct, so run roots and per-file roots cannot be confused', () => {
    expect(RUN_ROOT_PREFIX).not.toEqual(LEGACY_ROOT_PREFIX)
    expect(RUN_ROOT_PREFIX.startsWith(LEGACY_ROOT_PREFIX)).toBe(false)
    expect(LEGACY_ROOT_PREFIX.startsWith(RUN_ROOT_PREFIX)).toBe(false)
  })

  it('self-test: the reap window is long enough to outlast a slow run', () => {
    // A full backend run is ~35s. Anything under an hour would risk deleting
    // a live run's root on a loaded machine.
    expect(REAP_AFTER_MS).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })
})

describe('jest.config.js — the globalSetup entry is registered', () => {
  // Read as SOURCE rather than `require`d: jest's resolver cannot load this
  // config inside a sandbox (it does `require('../../tsconfig')`, an
  // extensionless .json). The runtime proof in the next describe is the
  // load-bearing one -- it can only pass if globalSetup genuinely ran.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const source: string = require('fs').readFileSync(
    join(__dirname, '..', 'jest.config.js'),
    'utf-8'
  )

  it('the Backend project points at this module', () => {
    // Without this wiring the whole fix is inert: setupContainment.ts falls
    // back to minting a top-level root per test file, which is the leak.
    expect(source).toMatch(
      /globalSetup:\s*'<rootDir>\/src\/backend\/jest\.globalSetup\.js'/
    )
  })

  it('self-test: the file really is being read, and setupFiles is untouched', () => {
    expect(source).toContain("displayName: 'Backend'")
    expect(source).toMatch(
      /setupFiles:\s*\['<rootDir>\/src\/backend\/jest\.setupContainment\.ts'\]/
    )
    // The two entries are distinct keys; a regex that matched either would
    // make the assertion above meaningless.
    expect(source).not.toMatch(
      /globalSetup:\s*'<rootDir>\/src\/backend\/jest\.setupContainment/
    )
  })
})

describe('containment root nesting (the isolation property)', () => {
  it('this suite is running inside a per-file root nested in a run root', () => {
    // Proves the two properties hold together AT RUNTIME for this very file:
    // the process has a run root, and this file's HOME is a DISTINCT
    // directory inside it -- not the run root itself, which is what broke
    // suite isolation in the first attempt.
    const runRoot = process.env[CONTAINMENT_ROOT_ENV_KEY]
    expect(runRoot).toBeDefined()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { containmentRoot } = require('../jest.setupContainment')

    expect(containmentRoot).not.toEqual(runRoot)
    expect(containmentRoot.startsWith(`${runRoot}/`)).toBe(true)
    expect(containmentRoot).toContain(LEGACY_ROOT_PREFIX)
  })
})
