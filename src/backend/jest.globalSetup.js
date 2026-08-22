/**
 * One reapable parent directory per jest RUN, plus best-effort reaping of
 * stale roots left by earlier runs (Phase 34.2 gap cycle 4, WR-01).
 *
 * Each test FILE still gets its own containment directory, minted by
 * `jest.setupContainment.ts` -- nested INSIDE this run root rather than
 * scattered across the temp root. Isolation semantics are therefore
 * byte-identical to before; what changes is that a run's directories now have
 * a single parent that can be removed as one unit.
 *
 * Defect this closes: `jest.setupContainment.ts`'s `ensureContainmentRoot()`
 * memoized its `mkdtempSync` root on `globalThis`, but jest gives every test
 * FILE a fresh sandbox global -- so the memo never hit across files and the
 * root was minted once per test file, not once per worker. Combined with the
 * deliberate no-teardown policy, nothing ever removed them. The gap-cycle-4
 * review measured 1,968 directories on disk; by 2026-08-23 the live count was
 * 6,057 (~85.6 KB each, ~500 MB), 3,761 of them created in a single day.
 *
 * Why `globalSetup` and not a per-worker memo: three memo strategies were
 * probed empirically before this file was written, and two of them do not
 * work.
 *
 *   - `globalThis` -- sandboxed per test FILE. This is the existing bug.
 *   - `process.env` written from `setupFiles` -- ALSO sandboxed per test
 *     file. Measured: three files in one worker process (identical `pid`)
 *     each read back a different value. This is why the obvious "just use
 *     process.env instead of globalThis" fix does not work, and why it is
 *     recorded here rather than left for someone to rediscover.
 *   - `globalSetup` -- runs ONCE in the parent process before any worker is
 *     forked, so every worker inherits its `process.env` mutations. Measured
 *     working across all test files in both `--runInBand` and
 *     `--maxWorkers=N` modes. That is the seam this file uses.
 *
 * Why not the review's own prescribed fix: it writes a marker file at the
 * PREDICTABLE path `gamelib-jest-home-pid{pid}` whose contents are the real
 * root's path. That reintroduces exactly the world-writable-`/tmp`
 * symlink-capture vector cycle-3's WR-07 closed by moving to `mkdtemp` --
 * an attacker who pre-creates the marker redirects every subsequent write.
 * `mkdtemp`'s unpredictable suffix and mode 0700 are the security controls
 * here and both survive unchanged; this file only changes WHERE a per-file
 * root is minted, never how safely.
 *
 * The no-teardown-hook decision (`tests-clobbering-real-steam-store`, commit
 * `92c29a5e`) also survives: a force-exited worker skips teardown hooks, so
 * teardown cannot be a safety net. Reaping therefore happens at SETUP of the
 * NEXT run, where it is guaranteed to run regardless of how the previous run
 * died. Cleanup is hygiene; mode 0700 remains the control.
 */

const { chmodSync, lstatSync, mkdtempSync, readdirSync, rmSync } = require('fs')
const { join } = require('path')
const { homedir, tmpdir } = require('os')

// One RUN root per jest invocation. Each test file still mints its OWN
// directory inside it (see jest.setupContainment.ts) -- that per-file
// isolation is load-bearing and was NOT safe to collapse. Measured: sharing a
// single root across all suites made settingsFlows.test.ts read a legendary
// user record another suite had written, returning the developer's real
// username where the test asserts `undefined`. The per-file root was
// providing a pristine HOME per suite, not merely containment. What this file
// removes is the unbounded accumulation of TOP-LEVEL directories, by giving
// the whole run one reapable parent.
const RUN_ROOT_PREFIX = 'gamelib-jest-run-'
// Pre-WR-01 top-level roots, still reaped so the 6,057 already on disk drain.
const LEGACY_ROOT_PREFIX = 'gamelib-jest-home-'
const REAPABLE_PREFIXES = [RUN_ROOT_PREFIX, LEGACY_ROOT_PREFIX]
const CONTAINMENT_ROOT_ENV_KEY = 'GAMELIB_JEST_RUN_ROOT'

// WR-05 (gap cycle 4). `structuralContainment.test.ts` must assert that the
// resolved log path lands OUTSIDE the developer's real home, and to do that it
// needs the real home -- but it also exists to prove that `setupFiles` alone
// contains a suite carrying no `jest.mock` of its own, and the import it used
// to obtain that value pulled `jest.setupContainment.ts`'s two `jest.mock`
// registrations into its own module graph, falsifying the claim.
//
// This process is the right place to capture it: `globalSetup` runs in the
// PARENT, before any worker forks and before jest's mocking machinery exists
// at all, so `homedir()` here cannot be anything but the real one. That is
// strictly better provenance than any in-sandbox capture, including
// `jest.requireActual('os').homedir()`. `jest.setupContainment.ts` still takes
// its own pre-mock capture and asserts the two AGREE, so a disagreement is
// loud rather than silently preferring one.
const REAL_HOME_ENV_KEY = 'GAMELIB_JEST_REAL_HOME'

// Roots younger than this are left alone. A concurrently-running jest process
// (a second terminal, an IDE test runner, a watch-mode session) owns a root
// this process must not delete, and it may legitimately sit idle for a long
// time between files. Six hours is far longer than any run here and far
// shorter than the accumulation window that produced 6,057 directories.
const REAP_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * Best-effort removal of stale containment roots. Never throws: a reaping
 * failure must not be able to fail a test run, because this is hygiene and
 * the security control (0700) does not depend on it.
 *
 * Five conditions must ALL hold before anything is removed. They are
 * deliberately narrow -- this function issues `rm -rf` against a shared,
 * world-writable directory, and this project has already had one incident
 * (`filesystem-scan-snapshot-goes-stale-mid-cleanup`) where a scan snapshot
 * went stale mid-cleanup and nearly destroyed a live install:
 *
 *   1. the entry is DIRECTLY under the real temp root (never recursive)
 *   2. its name starts with `gamelib-jest-run-` or the pre-WR-01
 *      `gamelib-jest-home-` (our prefixes, nothing else)
 *   3. it is a real directory and NOT a symlink -- checked with `lstat`, so
 *      a symlink planted at a matching name is skipped rather than followed
 *   4. its mtime is older than REAP_AFTER_MS
 *   5. it is not the root this run just created
 *
 * Conditions 3 and 4 are re-checked with a FRESH `lstat` immediately before
 * the `rmSync`, not read from the `readdir` snapshot, so a directory that
 * comes into use between the scan and the delete is not removed underneath
 * a live process.
 */
function reapStaleRoots(realTmpRoot, currentRoot) {
  let removed = 0
  let skipped = 0

  let entries = []
  try {
    entries = readdirSync(realTmpRoot, { withFileTypes: true })
  } catch {
    return { removed, skipped }
  }

  const cutoff = Date.now() - REAP_AFTER_MS

  for (const entry of entries) {
    if (!REAPABLE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
      continue
    }

    const candidate = join(realTmpRoot, entry.name)
    if (candidate === currentRoot) continue

    try {
      // Re-stat AT DELETE TIME. The readdir snapshot above is already stale
      // by the time we get here; a root that a concurrent jest process began
      // using one millisecond ago must survive.
      const stat = lstatSync(candidate)
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        skipped++
        continue
      }
      if (stat.mtimeMs >= cutoff) {
        skipped++
        continue
      }
      rmSync(candidate, { recursive: true, force: true })
      removed++
    } catch {
      // Vanished between scan and delete, owned by another user, or locked.
      // All three are fine: something else is managing it, not us.
      skipped++
    }
  }

  return { removed, skipped }
}

module.exports = async function globalSetup() {
  const realTmpRoot = tmpdir()

  const root = mkdtempSync(join(realTmpRoot, RUN_ROOT_PREFIX))
  chmodSync(root, 0o700)

  // Workers are forked AFTER this returns, so every one of them inherits
  // this assignment. `jest.setupContainment.ts` reads it back, validates it,
  // and falls back to minting its own root if it is missing or fails
  // validation -- so a run that somehow bypasses this file is still
  // contained, just less tidily.
  process.env[CONTAINMENT_ROOT_ENV_KEY] = root

  // Same inheritance seam, same reason (WR-05). Captured here in the parent,
  // where no mock of `os` can possibly exist yet.
  process.env[REAL_HOME_ENV_KEY] = homedir()

  const { removed } = reapStaleRoots(realTmpRoot, root)
  if (removed > 0 && process.env.GAMELIB_JEST_QUIET_REAP === undefined) {
    console.log(
      `[jest.globalSetup] reaped ${removed} stale containment root(s) older than 6h`
    )
  }
}

module.exports.RUN_ROOT_PREFIX = RUN_ROOT_PREFIX
module.exports.LEGACY_ROOT_PREFIX = LEGACY_ROOT_PREFIX
module.exports.CONTAINMENT_ROOT_ENV_KEY = CONTAINMENT_ROOT_ENV_KEY
module.exports.REAL_HOME_ENV_KEY = REAL_HOME_ENV_KEY
module.exports.REAP_AFTER_MS = REAP_AFTER_MS
module.exports.reapStaleRoots = reapStaleRoots
