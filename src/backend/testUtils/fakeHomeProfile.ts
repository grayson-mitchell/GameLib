/**
 * A disposable, isolated fake HOME profile for anything that SPAWNS A CHILD
 * PROCESS — the child-process counterpart to `src/backend/jest.setupContainment.ts`.
 *
 * Why this exists (quick task 260913-arr, implementing D1-D4 of
 * `.planning/todos/pending/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md`).
 * The repo already implements home-directory containment once, for jest, and it
 * STOPS AT THE JEST BOUNDARY. `jest.setupContainment.ts` exports only
 * `{ containmentRoot, realHomeAtSetup }`, is wired as a `setupFiles` entry, and
 * mutates its OWN `process.env` — so it cannot build a child-process env for a
 * spawned binary. Every site that spawned the compiled sidecar therefore
 * hand-rolled its own narrower block, and the consequence was realised TWICE:
 * real GOG session data (`userId`/`username`/`galaxyUserId`) written to disk in
 * `260912-e6k`, and again in `260913-901`.
 *
 * ── The two-profile rule, and what this module is NOT ──────────────────────
 * This helper implements the ISOLATED-BY-DEFAULT half of the two-profile rule
 * (see CLAUDE.md, "Fake-HOME isolation for direct binary runs"). It is NOT a
 * mandate to isolate everything. `260913-901` measured the opposite failure:
 * the `major`, PR-blocking defect it fixed — an un-`unref()`-ed 5-minute
 * `setInterval` armed by `setPresence()` at `gog/presence.ts:39` — is created
 * only behind `GOGUser.isLoggedIn()`, so under an EMPTY profile it never arms
 * and the process exits cleanly. A gate isolated by default would have been
 * permanently, confidently green against it. `meta/sidecarStartupSmoke.cjs` is
 * deliberately EXEMPT for exactly that reason; its header says so, and
 * `src/backend/__tests__/fakeHomeIsolation.test.ts` pins the exemption.
 *
 * ── The eight variables are DERIVED, not invented ──────────────────────────
 * `FAKE_HOME_ENV_KEYS` below is the same eight-variable set
 * `jest.setupContainment.ts` redirects (its `envExpectations` table), and the
 * per-variable reasoning lives there rather than being restated here:
 * `HOME`/`USERPROFILE` drive `os.homedir()`; `LOCALAPPDATA`/`APPDATA` are
 * preferred over `homedir()` by `getBaseLogPath()`/`resolveAppDataDir()`'s
 * Windows branches; `XDG_STATE_HOME`/`XDG_CONFIG_HOME` by their Linux
 * branches; `XDG_DATA_HOME` is read by first-party code
 * (`src/backend/constants/paths.ts`'s `flatpakHome`); `XDG_CACHE_HOME` covers
 * the remaining XDG base-directory surface a transitive library could consult.
 *
 * The four hand-rolled blocks this module replaced set only `HOME`,
 * `USERPROFILE`, `XDG_STATE_HOME` and `LOCALAPPDATA` — four of the eight. They
 * were measurably LEAKIER than the jest containment one directory away. That
 * is a defect, not a style gap, and closing it is this module's first job.
 *
 * ── mkdtemp 0700: which call is the security control ───────────────────────
 * Carried forward from `jest.setupContainment.ts`'s IN-05 finding, in its
 * CORRECTED form, because it was deleted once as redundant already:
 *
 *   - `mkdtempSync` is THE SECURITY CONTROL. It is atomic (no TOCTOU), its
 *     suffix is unpredictable, and it creates with mode 0700. Crucially, umask
 *     can only ever REMOVE bits — so a `mkdtemp` directory can NEVER carry
 *     group or other bits for a later `chmod` to strip.
 *   - `chmodSync(root, 0o700)` is NOT redundant and is NOT the security
 *     control. `mkdtemp`'s requested mode is masked by the process umask, and
 *     `umask 0277` yields mode 0500 (MEASURED). The `chmod` restores
 *     owner-write. Do not delete it as a no-op a second time.
 *
 * ── D4: a FRESH profile on every call, always ──────────────────────────────
 * No memoization, no reuse-for-speed, no `globalThis` cache. A reused profile
 * is A DIFFERENT EXPERIMENT: it carries state from the previous run, and that
 * state is capable of masking the very defect the run exists to detect. The
 * framing that reuse buys speed is also wrong on its own terms — the cold cost
 * is caused by the boot doing real network work into an empty profile, and
 * caching the profile caches the symptom rather than removing the work. If a
 * call site is too slow, the lever is pinning that run offline or stubbing the
 * network, never recycling a profile.
 *
 * Reuse is permitted ONLY as an explicitly-named opt-in for a test whose
 * PURPOSE is warm-path behaviour, justified at the call site — which no
 * current caller is.
 */
import { chmodSync, lstatSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

/**
 * The eight home/config/state variables, as a readonly tuple.
 *
 * Exported as ONE list so the helper and its gate
 * (`src/backend/__tests__/fakeHomeIsolation.test.ts`) can never disagree: the
 * gate imports this array rather than retyping the names, so adding a ninth
 * variable here automatically widens what the gate forbids elsewhere.
 */
export const FAKE_HOME_ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'XDG_STATE_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME'
] as const

export type FakeHomeEnvKey = (typeof FAKE_HOME_ENV_KEYS)[number]

export interface FakeHomeProfile {
  /** The `mkdtemp` 0700 root. Every one of the eight variables points inside it. */
  readonly root: string
  /** The eight variables and their values, derived from `root`. */
  readonly env: Readonly<Record<FakeHomeEnvKey, string>>
  /**
   * `base` (default `process.env`) with all eight variables OVERRIDDEN. The
   * spread comes first deliberately: a caller passing its own extra keys keeps
   * them, but can never accidentally leave a real-profile value in place.
   */
  childEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /**
   * Register a path OUTSIDE the profile for shredding at `dispose()` — raw
   * diagnostic reports, `*.out` captures, anything that embeds
   * `environmentVariables`/`commandLine` or a live session frame.
   *
   * This exists because `260913-901` proved a WRITTEN mitigation is not
   * enough: its plan carried an explicit threat-model entry saying to delete
   * the raw reports, and at the end of the task `real-hang.json` (49 KB) and
   * `coldfake-hang.json` (53 KB) were still on disk alongside a `real.out`
   * holding the operator's real GOG username and userId. Cleanup has to be
   * owned by the harness, not by the investigator remembering at the end of a
   * long task.
   */
  registerCapture(path: string): void
  /** Shreds the profile root and every registered capture. Idempotent. */
  dispose(): void
}

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose). `FakeHomeEnvKey`
// above stays exported deliberately: `meta/captureShellScrollback.ts` imports
// it directly (`import { ... type FakeHomeEnvKey } ... from
// '../src/backend/testUtils/fakeHomeProfile'`, used at its own line 596),
// which the ledger's own bucketing missed because that importer lives under
// `meta/`, outside the analysed tsconfig project -- what decides bucket
// membership is where the IMPORTER lives, not where the declaration lives.
interface CreateFakeHomeProfileOptions {
  /**
   * `mkdtemp` prefix, so a stranded directory names the suite that leaked it.
   * Purely diagnostic — it has no bearing on isolation.
   */
  prefix?: string
}

/**
 * Accept an inherited run root only if it still has every property
 * `mkdtempSync` + `chmodSync(0o700)` gave it.
 *
 * This is the validation SHAPE of `jest.setupContainment.ts`'s
 * `inheritedRootIsUsable()`, reimplemented rather than imported: importing
 * that module would drag its two `jest.mock('os'/'node:os')` registrations
 * into the importer's module graph, and `meta/` callers run outside jest
 * entirely, where the import would not resolve at all.
 *
 * The value arrives through the environment, so it is validated rather than
 * trusted — a tampered or merely stale value must fall back to minting under
 * the real tmp root, never silently redirect a profile into an
 * attacker-chosen directory. Failing CLOSED here would be wrong: the fallback
 * is still fully contained, just less tidy.
 */
function inheritedRunRootIsUsable(candidate: string, tmpRoot: string): boolean {
  if (candidate.length === 0 || !isAbsolute(candidate)) return false

  // Containment by path arithmetic, never a `.startsWith()` string prefix --
  // that is unsound for siblings sharing a prefix (`/tmp/foo` vs `/tmp/foobar`).
  const rel = relative(tmpRoot, resolve(candidate))
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return false
  if (rel.includes('/') || rel.includes('\\')) return false
  if (!rel.startsWith('gamelib-jest-run-')) return false

  try {
    // `lstat`, NOT `stat`: a symlink planted at this path must be rejected,
    // not followed. That is the WR-07 vector recorded on the jest side.
    const stat = lstatSync(candidate)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false
    // Mode 0700 is the control; if something widened it, do not adopt it.
    if ((stat.mode & 0o077) !== 0) return false
    return true
  } catch {
    return false
  }
}

/**
 * Mint a fresh, isolated, disposable fake HOME profile.
 *
 * FRESH ON EVERY CALL, per D4 — see the module docstring for why reuse is a
 * different experiment rather than an optimisation.
 */
export function createFakeHomeProfile(
  options: CreateFakeHomeProfileOptions = {}
): FakeHomeProfile {
  const tmpRoot = tmpdir()

  // Nest under the jest run root when one was published by
  // `jest.globalSetup.js` and still validates, so a whole run can be reaped as
  // a unit. This is HYGIENE ONLY -- 0700 on the profile itself is the control,
  // and a `meta/` caller running outside jest simply lands in `tmpdir()`.
  const inherited = process.env.GAMELIB_JEST_RUN_ROOT
  const parent =
    inherited !== undefined && inheritedRunRootIsUsable(inherited, tmpRoot)
      ? inherited
      : tmpRoot

  const root = mkdtempSync(join(parent, options.prefix ?? 'gamelib-fakehome-'))
  // See the module docstring: `mkdtemp` is the security control; this restores
  // owner-write after the umask masked `mkdtemp`'s requested mode (0500 under
  // `umask 0277`, measured). NOT a redundant no-op.
  chmodSync(root, 0o700)

  const env: Record<FakeHomeEnvKey, string> = {
    HOME: root,
    USERPROFILE: root,
    APPDATA: join(root, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(root, 'AppData', 'Local'),
    XDG_CONFIG_HOME: join(root, '.config'),
    XDG_STATE_HOME: join(root, '.local', 'state'),
    XDG_DATA_HOME: join(root, '.local', 'share'),
    XDG_CACHE_HOME: join(root, '.cache')
  }

  const captures: string[] = []
  let disposed = false

  return {
    root,
    env,
    childEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
      return { ...(base ?? process.env), ...env }
    },
    registerCapture(path: string): void {
      captures.push(path)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      // Each removal in its OWN try/catch: one failure (a file held open, a
      // permission surprise) must not strand the rest. A call site that
      // registered no captures shreds only the profile -- the capture list is
      // exactly what this handle was given, nothing is inferred.
      for (const path of [...captures, root]) {
        try {
          rmSync(path, { recursive: true, force: true })
        } catch {
          // Best-effort shredding; a stranded temp path is untidy, not unsafe.
        }
      }
    }
  }
}
