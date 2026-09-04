/**
 * Containment proof + declared-list gate for the sidecar's `pathShim`/
 * `backend/logger/paths` mock kit (Phase 34.2 gap cycle 2, plan 34.2-18 --
 * closes verification gap #3 / CR-03 / WR-01, REQ-34.2-07/-14).
 *
 * **Block A** is the platform-conditional evidence the plan's own objective
 * demands: `sidecarRejectionGuard.test.ts`'s CR-03 gap was "confirmed green
 * on macOS. A green local run is therefore NOT evidence of a fix." The four
 * in-scope suites' own tests are ALL run on this developer's real macOS
 * host, where `pathShim.ts`'s real `resolveAppDataDir()` and
 * `logger/paths.ts`'s real `getBaseLogPath()` take their `darwin` branch
 * unconditionally -- which reads ONLY `homedir()`, never
 * `env.APPDATA`/`env.XDG_CONFIG_HOME`/`env.XDG_STATE_HOME`/
 * `env.LOCALAPPDATA`. That means simply exporting those four env vars on
 * this host, by itself, exercises nothing: the real darwin resolvers would
 * never consult them regardless of whether any mock is in effect. To make
 * the Windows/Linux code paths genuinely observable here, this suite ALSO
 * forces `process.platform` to `'linux'` for its own duration (mirroring
 * this repo's own established `overrideProcessPlatform` precedent,
 * `src/backend/__tests__/constants.test.ts`) -- restored in `afterAll`. With
 * both the hostile env vars AND the forced non-darwin platform in place,
 * Block A proves the `pathShim`/`backend/logger/paths` mocks below (the
 * SAME shape as the four in-scope suites') still resolve every path inside
 * `os.tmpdir()`, because those mocks ignore `platform` and `env` entirely --
 * a property a bare `os.homedir()` mock does NOT have.
 *
 * **Block B** is a declared-list (not derived) source gate over the four
 * in-scope suites' own text, proving each still carries all four elements
 * of the containment kit, matched against COMMENT-STRIPPED source (mirrors
 * `gameDetailsImportGate.test.ts`'s own `stripComments` convention) --
 * required because every one of these four files' own explanatory prose
 * necessarily names the exact patterns under test and would otherwise
 * self-satisfy the gate trivially.
 *
 * Hardened in gap-cycle-3 plan 34.2-23 (WR-01/WR-04/WR-07): the
 * "no longer claims NO FILESYSTEM WRITES" gate below now matches RAW source
 * rather than `stripComments` output (the claim can only ever appear on a
 * `*`-prefixed docblock line, which `stripComments` always removes -- see
 * the WR-01 self-test immediately below that gate); the
 * `backend/constants/environment` mock's comment now states plainly that it
 * is LOAD-BEARING for RED-PROOF-2 rather than "included for parity"; and
 * Block A's `process.platform`/env-var mutations are applied and restored
 * inside each test body that needs them (via `withAdversarialPlatformAndEnv`),
 * never left outstanding in a `beforeAll`/`afterAll` pair that could leak
 * into a later test file sharing the same Jest worker.
 *
 * **Block C** (plan 34.2-23, WR-08) and **Block D** (plan 34.2-23, T-34.2-84)
 * close the gap the paragraph above used to describe. Containment for this
 * whole directory is now STRUCTURAL: `src/backend/jest.setupContainment.ts`,
 * registered once via `src/backend/jest.config.js`'s `setupFiles` entry
 * (plan 34.2-19), redirects `os.homedir()` and the HOME/USERPROFILE/APPDATA/
 * LOCALAPPDATA/XDG_* environment variables for every backend test file
 * before that file's own imports run -- so a suite added tomorrow with zero
 * containment code of its own is contained by construction, with no
 * per-suite opt-in required. `IN_SCOPE_SUITES`' hand-maintained kit (Block
 * A/B) is retained as DEFENCE IN DEPTH on top of that structural floor, not
 * as the sole containment mechanism. Block C is a `readdirSync`-derived
 * set-equality tripwire proving every `*.test.ts` file actually present in
 * this directory is classified by exactly one of the two declared lists
 * below (`IN_SCOPE_SUITES` or `STRUCTURALLY_CONTAINED_SUITES`) -- replacing
 * the prior 11-suite accepted-debt list this file used to declare, which
 * plan 34.2-19 closed structurally and which had therefore become a false
 * statement about the tree. Block D reads
 * `jest.config.js` and `jest.setupContainment.ts` directly and asserts the
 * structural mechanism itself is still wired up, so its removal is caught
 * here as a third independent failure site (alongside
 * `structuralContainment.test.ts` and `bootstrap.test.ts`'s own tripwire).
 *
 * Every gate in this file carries a self-test proving that gate can fail --
 * `stripComments`' own self-test (pre-existing), the WR-01 anti-claim
 * self-test, the Block C tripwire self-test, and the Block D structural-gate
 * self-test.
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative, resolve, isAbsolute } from 'path'
import { tmpdir } from 'os'
import {
  stripSourceComments as stripComments,
  stripTrailingLineCommentTs
} from 'backend/testUtils/stripSourceComments'

// ── WR-02 (gap cycle 4): ONE root, minted atomically ───────────────────────
// `mkdtempSync` — atomic (no TOCTOU), mode 0700, unpredictable suffix —
// replacing `join(tmpdir(), 'gamelib-testcontainment-test-home-' +
// process.pid)`, a predictable path created implicitly by `mkdir(recursive)`
// with default permissions. On a shared, world-writable Linux CI `/tmp`
// another uid could pre-create it as a symlink and receive an arbitrary-path
// write as the CI user. Same remedy cycle 3's WR-07 applied to
// `jest.setupContainment.ts`; this file and `loggerFlows.test.ts` were the two
// that still carried the old pattern.
//
// `mock`-prefixed and declared before the factories that read it: ts-jest's
// hoist transform only lets a `jest.mock()` factory reference an out-of-scope
// identifier when that identifier is `mock`-prefixed (same convention as
// `loggerCallSiteGuard.test.ts`'s `mockScratchDir`). All three factories below
// now read ONE value; the path used to be re-derived as a literal in each.
const mockTmpRoot = jest
  .requireActual<typeof import('fs')>('fs')
  .mkdtempSync(
    jest
      .requireActual<typeof import('path')>('path')
      .join(
        jest.requireActual<typeof import('os')>('os').tmpdir(),
        'gamelib-testcontainment-'
      )
  )

// ── os — redirect homedir() to the disposable tmp root above
// (mirrors the four in-scope suites' own kit) ───────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  return {
    ...actual,
    homedir: () => mockTmpRoot
  }
})

// ── pathShim — the SAME mock shape the four in-scope suites use: no
// platform branch, no environment variable participating. Block A's whole
// point is proving THIS shape stays safe even when `process.platform` and
// every relevant env var are adversarial. ───────────────────────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = mockTmpRoot
  return {
    getPath: (name: string) => {
      switch (name) {
        case 'appData':
          return tmpRoot
        case 'userData':
          return actualPath.join(tmpRoot, 'GameLib')
        case 'temp':
          return actualOs.tmpdir()
        case 'home':
          return tmpRoot
        default:
          throw new Error(
            `[pathShim mock] getPath('${name}') is not shimmed for this test`
          )
      }
    }
  }
})

// ── backend/logger/paths — same reasoning: the mock must stay safe under
// the same adversarial env/platform conditions Block A forces. Does NOT
// call jest.requireActual('backend/logger') -- see sidecarRejectionGuard
// .test.ts's own note on the logger/log_writer circular-require hazard. ─────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual('path')
  const logBaseDir = actualPath.join(mockTmpRoot, 'logs')
  return {
    getLogFilePath: (
      args: { appName?: string; runner?: string; type?: string } = {}
    ): string => {
      let relativeFilePath: string
      if (!(args?.appName || args?.runner)) {
        relativeFilePath = 'gamelib'
      } else if (args.runner && !args.appName) {
        relativeFilePath = actualPath.join('runners', args.runner)
      } else {
        const { appName, runner, type = 'launch' } = args
        relativeFilePath = actualPath.join(
          'games',
          `${appName}_${runner}`,
          type
        )
      }
      return actualPath.join(logBaseDir, relativeFilePath + '.log')
    }
  }
})

// ── backend/constants/environment — LOAD-BEARING (WR-04; previously and
// INCORRECTLY documented as "included for parity"). Consumer:
// `backend/logger/paths.ts`'s `getBaseLogPath()`, which branches on the
// `isWindows`/`isMac` flags THIS mock provides and never reads
// `process.platform` directly (`sidecar/pathShim.ts:31`'s
// `resolveAppDataDir()` is the counterpart that DOES read
// `process.platform` directly -- both must stay adversarial for Block A's
// proof to be non-vacuous end-to-end). Pinning `isMac: false` (alongside
// `isWindows: false`) forces `getBaseLogPath()` down its XDG_STATE_HOME
// (Linux/else) branch regardless of the real host OS. On this developer's
// own darwin host, WITHOUT this pin, `getBaseLogPath()` would take its
// `isMac` branch unconditionally (`join(homedir(), 'Library', 'Logs',
// 'GameLib')`), which reads NEITHER `process.platform` NOR any of Block A's
// four sentinel env vars -- making RED-PROOF-2 (removing the
// `backend/logger/paths` mock below and observing only the getLogFilePath
// test fail) vacuous: that test would keep passing for the wrong reason
// (the real darwin resolver never touching the adversarial state Block A
// sets up), not because containment genuinely held. Removing this mock
// silently turns RED-PROOF-2 false. Do not delete it. ──────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── electron / electron-store — constants/paths.ts imports `app` from
// 'electron' at module scope; route Jest's own module resolution at the
// REAL sidecar shims (mirrors the four in-scope suites' own kit) ───────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

describe('Block A: env-simulating containment proof (34.2 gap cycle 2, plan 34.2-18, REQ-34.2-07/-14)', () => {
  const ENV_KEYS = [
    'APPDATA',
    'XDG_CONFIG_HOME',
    'XDG_STATE_HOME',
    'LOCALAPPDATA'
  ] as const
  type EnvKey = (typeof ENV_KEYS)[number]

  /**
   * Deterministic sentinel path for `key` -- absolute, guaranteed-not-to-
   * exist, OUTSIDE `os.tmpdir()` (a sentinel INSIDE tmpdir would make every
   * assertion below vacuous, since an uncontained resolution would still
   * land inside tmpdir and pass). A pure function of `process.pid`, so the
   * precondition tests below can check the sentinel shape without actually
   * mutating `process.env`.
   */
  function computeSentinelPath(key: EnvKey): string {
    return `/gamelib-containment-sentinel-${process.pid}-${key}`
  }

  /**
   * WR-07: sets `process.platform` to `'linux'` and all four `ENV_KEYS` to
   * their sentinel paths, runs `run`, then restores BOTH inside this same
   * function's own `finally` -- never deferred to `afterAll`. Jest reuses a
   * worker process across every test FILE in a run (not just within this
   * describe block); a `beforeAll`/`afterAll`-scoped mutation left
   * outstanding by a force exit silently leaks a fake `'linux'` platform and
   * four bogus path roots into every later suite sharing that worker -- the
   * exact pattern this repo's `tests-clobbering-real-steam-store` lesson
   * (commit `92c29a5e`) already flagged as unsafe.
   *
   * `process.platform` is restored via `Object.defineProperty` inside this
   * function's own `finally`, NOT `jest.replaceProperty` (this project pins
   * `jest@^29.7.0`, confirmed via `npx jest --version`, and
   * `jest.replaceProperty` has been available since Jest 29.4 -- it was
   * tried first here and empirically rejected, not overlooked). On this
   * project's Node version, `process.platform`'s own descriptor is
   * `{ value: 'darwin', writable: false, configurable: true }`
   * (`Object.getOwnPropertyDescriptor(process, 'platform')`):
   * `jest.replaceProperty`'s replacement succeeds, but its `.restore()`
   * internally performs a plain `object[key] = originalValue` assignment
   * (`node_modules/jest-mock/build/index.js`), which throws
   * `TypeError: Cannot assign to read only property 'platform' of object
   * '#<process>'` against a `writable: false` descriptor -- reproduced
   * directly: the whole test FILE failed to run with that error the first
   * time this mechanism was used. `Object.defineProperty` does not have this
   * problem because it redefines the property (value AND its writability)
   * rather than assigning through it, exactly as the pre-plan-34.2-23 version
   * of this file already did -- only the SCOPE moved (per-test via this
   * helper's `finally`, not a suite-wide `beforeAll`/`afterAll` pair). The
   * four env vars are restored via plain assignment/`delete`, which is safe
   * for `process.env` (a Proxy with fully mutable string properties, not a
   * fixed-descriptor native binding like `process.platform`).
   */
  function withAdversarialPlatformAndEnv<T>(
    run: (sentinelPaths: Record<EnvKey, string>) => T
  ): T {
    const sentinelPaths = {} as Record<EnvKey, string>
    const originalEnv: Partial<Record<EnvKey, string>> = {}
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      sentinelPaths[key] = computeSentinelPath(key)
      process.env[key] = sentinelPaths[key]
    }

    // RED PROPERTY (see module docstring): force the non-darwin resolution
    // branch pathShim.ts's real resolveAppDataDir() / logger/paths.ts's real
    // getBaseLogPath() would take on Windows/Linux. Without this, on THIS
    // macOS host, both real resolvers' darwin branch never consults any of
    // the four env vars above -- the sentinel values alone would exercise
    // nothing, and removing either mock below would NOT fail here. Mirrors
    // `overrideProcessPlatform` in `src/backend/__tests__/constants.test.ts`.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    })

    try {
      return run(sentinelPaths)
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
      for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = originalEnv[key]
        }
      }
    }
  }

  it('precondition: none of the four sentinel paths pre-exist on disk', () => {
    for (const key of ENV_KEYS) {
      expect(existsSync(computeSentinelPath(key))).toBe(false)
    }
  })

  it('precondition: every sentinel path is OUTSIDE os.tmpdir()', () => {
    const tmpRoot = resolve(tmpdir())
    for (const key of ENV_KEYS) {
      const rel = relative(tmpRoot, resolve(computeSentinelPath(key)))
      expect(rel.startsWith('..') || isAbsolute(rel)).toBe(true)
    }
  })

  it('REQ-34.2-07/-14: a freshly-required constants/paths still yields appFolder/userDataPath/fixesPath inside os.tmpdir()', () => {
    withAdversarialPlatformAndEnv(() => {
      let appFolder!: string
      let userDataPath!: string
      let fixesPath!: string
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const paths = require('../../constants/paths')
        /* eslint-enable @typescript-eslint/no-require-imports */
        ;({ appFolder, userDataPath, fixesPath } = paths)
      })

      const tmpRoot = resolve(tmpdir())
      for (const candidate of [appFolder, userDataPath, fixesPath]) {
        const rel = relative(tmpRoot, resolve(candidate))
        expect(rel.startsWith('..')).toBe(false)
        expect(isAbsolute(rel)).toBe(false)
      }
    })
  })

  it('REQ-34.2-07/-14: getLogFilePath({}) still resolves inside os.tmpdir()', () => {
    withAdversarialPlatformAndEnv(() => {
      let logPath!: string
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { getLogFilePath } = require('backend/logger/paths')
        /* eslint-enable @typescript-eslint/no-require-imports */
        logPath = getLogFilePath({})
      })

      const tmpRoot = resolve(tmpdir())
      const rel = relative(tmpRoot, resolve(logPath))
      expect(rel.startsWith('..')).toBe(false)
      expect(isAbsolute(rel)).toBe(false)
    })
  })

  it('WR-07: process.platform and all four env vars are restored to their pre-test originals within the same test body that changed them, not deferred to a hook', () => {
    const originalPlatform = process.platform
    const originalEnv = {} as Partial<Record<EnvKey, string>>
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
    }

    withAdversarialPlatformAndEnv((sentinelPaths) => {
      expect(process.platform).toBe('linux')
      for (const key of ENV_KEYS) {
        expect(process.env[key]).toBe(sentinelPaths[key])
      }
    })

    // If this ran in a beforeAll/afterAll pair, the restoration wouldn't be
    // observable synchronously here -- it would only happen once the WHOLE
    // describe block finished. Asserting it immediately, in the very next
    // statement after the adversarial call returns, is what proves
    // restoration happens inside this test's own control flow, not a hook.
    expect(process.platform).toBe(originalPlatform)
    for (const key of ENV_KEYS) {
      expect(process.env[key]).toBe(originalEnv[key])
    }
  })

  // RED-PROOF (recorded verbatim in 34.2-18-SUMMARY.md): commenting out the
  // `jest.mock('../pathShim', ...)` block above makes the first assertion
  // test fail on THIS macOS host (appFolder/userDataPath/fixesPath resolve
  // to a path under the `XDG_CONFIG_HOME` sentinel instead), because
  // `withAdversarialPlatformAndEnv` has already forced `process.platform` to
  // `'linux'` for the duration of that test. Restored immediately
  // afterwards, `git diff` confirmed clean.
  //
  // RED-PROOF 2 (recorded verbatim in 34.2-18-SUMMARY.md): commenting out
  // the `jest.mock('backend/logger/paths', ...)` block above makes ONLY the
  // `getLogFilePath({})` assertion test fail, for the same reason -- the
  // real `getBaseLogPath()` reads the `LOCALAPPDATA`/`XDG_STATE_HOME`
  // sentinel directly once `process.platform` is forced non-mac/non-win
  // (and `backend/constants/environment`'s `isMac: false` pin routes it down
  // that branch -- see WR-04's comment above the environment mock; this is
  // exactly why that mock is load-bearing for THIS proof). Restored
  // immediately afterwards, `git diff` confirmed clean.
})

// ── Block B: declared-list source gate ──────────────────────────────────────

/**
 * The four suites this gate holds to the full containment kit
 * (`pathShim`/`backend/logger/paths`/`backend/constants/environment` mocks
 * plus the `getLogFilePath({})` tripwire). DECLARED, not derived (this
 * repo's own D-13 precedent, `gameDetailsImportGate.test.ts`) -- a
 * `readdirSync`-derived list would silently shrink to fit whatever exists,
 * defeating the anti-vacuity purpose of pinning an exact count below.
 *
 * As of plan 34.2-23, this per-suite kit is DEFENCE IN DEPTH layered on top
 * of the structural containment `src/backend/jest.setupContainment.ts`
 * provides to the whole backend project (plan 34.2-19) -- it is no longer
 * the sole containment mechanism for these four files, only the most
 * heavily-proven one.
 */
const IN_SCOPE_SUITES = [
  'gameDetailsFlows.test.ts',
  'enrichmentFlows.test.ts',
  'sidecarRejectionGuard.test.ts',
  'loggerFlows.test.ts'
]

/**
 * Every OTHER `*.test.ts` suite in this directory (plan 34.2-23, gap cycle 3
 * -- replaces the prior accepted-debt list this file used to declare, which
 * named an 11-suite containment HOLE that plan 34.2-19 closed structurally;
 * keeping that declaration would have been the same
 * over-claim-by-stale-declaration failure this phase was cited for three
 * verification rounds running).
 *
 * Membership here carries NO obligation beyond being consciously classified
 * -- these suites rely on the `setupFiles` entry in
 * `src/backend/jest.config.js` (`jest.setupContainment.ts`) alone, with no
 * per-suite mock kit of their own, and that is SAFE precisely because
 * containment is now structural: registered once, before any suite's own
 * imports run, for the whole backend project, rather than something each
 * suite author must remember to opt into.
 *
 * `testContainment.test.ts` (this file) classifies ITSELF here: it is just
 * another backend suite that benefits from structural containment like any
 * other, and excluding it would leave the Block C tripwire below with a
 * permanent one-file blind spot.
 *
 * `structuralContainment.test.ts`'s membership was INACCURATE from 2026-07-26
 * to 2026-08-23 (WR-05, gap cycle 4): plan 34.2-25 gave it a top-level import
 * of `backend/jest.setupContainment`, so it carried that module's two
 * `jest.mock` registrations in its own graph and no longer relied on
 * `setupFiles` alone. The import is gone and the classification is accurate
 * again — and it no longer depends on anyone noticing: that file's own
 * "WR-05" describe block walks its static import graph and fails if any file
 * in it registers a mock, so this entry cannot rot the same way twice.
 *
 * The directory holds 28 `*.test.ts` files as of Phase 34.3 Plan 06 (27
 * before this plan added `clipboardFlows.test.ts`; 26 before plan 34.3-01
 * added `shellFilesFlows.test.ts`; 25 before gap cycle 4 plan 34.2-26 added
 * `loggerCallSiteGuard.test.ts`, itself classified here rather than left as
 * the deliberately-open Block C failure that plan left as live evidence the
 * tripwire fires); 4 are `IN_SCOPE_SUITES` and the 24 below account for the
 * rest (counts recomputed from `readdirSync` by this plan, not carried
 * forward by hand -- see Block C's own anti-vacuity test, which asserts
 * every name declared here still exists on disk).
 *
 * `loggerCallSiteGuard.test.ts` (plan 34.2-26) is classified as
 * structurally contained: it carries no `os`/`pathShim` mock of its own and
 * relies entirely on the `setupFiles` mechanism, mocking only
 * `backend/logger/paths` (a module below the code it tests) plus
 * `electron`/`backend/config`.
 *
 * `clipboardFlows.test.ts` (Phase 34.3 Plan 06) is classified as
 * structurally contained: it uses the identical `os`/`electron`/
 * `electron-store` mock kit already classified here for
 * `appShellFlows.test.ts`/`shellFilesFlows.test.ts`, calling
 * `registerClipboardFlows()` directly rather than booting the full sidecar
 * via `../bootstrap`'s `init()`.
 *
 * `humbleFlows.test.ts` (Phase 34.4 Plan 04) is classified as structurally
 * contained: it uses the identical `electron`/`electron-store` mock kit
 * already classified here for `steamAuthFlows.test.ts`, driving the real
 * sidecar via `../bootstrap`'s `init()`.
 *
 * `netStub.test.ts` (Phase 34.4 Plan 06, D-06) is classified as structurally
 * contained: it uses the identical `os`/`electron`/`electron-store` mock kit
 * already classified here for `dialogStub.test.ts`/`lifecycleStub.test.ts`,
 * additionally mocking `backend/logger` (avoids a real log write from one
 * code path it deliberately exercises) -- no new containment surface. A
 * `readdirSync` recount at this plan's execution time (not carried forward
 * by hand, correcting the stale "28" figure above by one -- `humbleFlows.test.ts`
 * had already raised it to 29 without this comment being updated) puts the
 * directory at 30 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 26 below.
 *
 * `humbleLoginFlows.test.ts` (Phase 34.4.1 Plan 02) is classified as
 * structurally contained: it uses the identical `electron`/`electron-store`
 * mock kit already classified here for `humbleFlows.test.ts`/
 * `clipboardFlows.test.ts`, calling `registerHumbleLoginFlows()` directly
 * (mirroring `clipboardFlows.test.ts`'s style) rather than booting the full
 * sidecar via `../bootstrap`'s `init()` -- its own frame-shape describe block
 * drives the real `sidecarRpc` transport via the lighter-weight
 * `startRpcServer()`, which shares the same underlying stream-binding
 * containment guarantees as `init()`. No new containment surface.
 *
 * `storeEmbedFlows.test.ts` (Phase 40 Plan 05, REQ-40-02/REQ-40-05) is
 * classified as structurally contained: unlike the humble analog above it
 * does not mock `electron`/`electron-store` at all, because
 * `storeEmbedFlowRegistration.ts`'s import graph (`../platform`,
 * `./sidecarRpc`, `../../common/types/sidecarTransport`,
 * `../store/storeEmbedSeam`, `../logger`) never touches
 * `electron`/`electron-store`/`axios`/`backend/utils` the way
 * `humble/user.ts`/`humble/library.ts` do -- it calls
 * `registerStoreEmbedFlows()` directly and drives the real `sidecarRpc`
 * transport via `startRpcServer()`, exactly as the humble test's
 * frame-shape describe block does above. No new containment surface.
 *
 * `storeEmbedWireContract.test.ts` (added 2026-09-05, Phase 40 Plan 11's
 * live gate) is classified as structurally contained for exactly the same
 * reasons as `storeEmbedFlows.test.ts` directly above -- same import graph,
 * no `electron`/`electron-store` mocking, drives the real `sidecarRpc`
 * transport via `startRpcServer()`. Its one additional import is a static
 * JSON fixture (`meta/fixtures/store-embed-wire-args.json`), read via
 * `import` at module scope; a JSON asset opens no containment surface --
 * it touches no filesystem API at test time and pulls in no module graph.
 * It exists because the live gate found the sidecar emitting POSITIONAL
 * args where the Rust parsers read an OBJECT, with every suite green
 * because each side was tested only against itself.
 *
 * `oauthLoginCapture.test.ts` (Phase 34.4.1 Plan 09) is classified as
 * structurally contained: it factory-mocks only `backend/logger` (mirrors
 * `electronUntouched.test.ts`'s convention) -- it never touches `electron`,
 * `electron-store`, `pathShim`, or `../bootstrap`'s `init()` at all, because
 * `oauthLoginCapture.ts`/`oauthLoginFlowRegistration.ts` import nothing from
 * any of those (their only dependencies are `../humble/loginWindowSeam`,
 * pure types with no I/O, and `./electronStub`'s `ipcMain` recorder). No new
 * containment surface.
 *
 * `runnerSliceRegistration.test.ts` (Phase 34.5 Plan 04, REQ-34.5-13) is
 * classified as structurally contained: it never calls `jest.mock('electron', ...)`
 * itself, so `runnerAuthFlowRegistration.ts`'s load-bearing `import '../storeManagers'`
 * (which eagerly constructs every store manager) resolves `electron` through the
 * project-wide, tmpdir-based `src/backend/__mocks__/electron.ts` auto-mock -- the
 * SAME "contained by construction, no per-suite opt-in required" floor Block C's own
 * docstring describes, not a hand-maintained kit of its own. The file's own direct
 * import of `../electronStub` (for `handlerRegistry`/`listenerRegistry`) touches no
 * filesystem at module scope. No new containment surface.
 *
 * `pathShim.test.ts` (Phase 34.5 Plan 01, REQ-34.5-01) is classified as
 * structurally contained: it declares no `jest.mock(...)` call of any kind. It
 * imports the real `os` `homedir` plus `realHomeAtSetup` from
 * `backend/jest.setupContainment` precisely so it can assert `getPath()`
 * resolves under the containment root -- the same "contained by construction,
 * no per-suite opt-in required" floor Block C's docstring describes, not a
 * hand-maintained kit. It cannot be an `IN_SCOPE_SUITE`: those are required to
 * carry a `jest.mock('../pathShim', ...)` call, and this is the suite that
 * tests `pathShim` itself. A `readdirSync` recount at this plan's execution
 * time (not carried forward by hand, correcting the stale "30" figure above)
 * puts the directory at 34 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 30 below.
 *
 * `wineToolsFlows.test.ts` (Phase 34.5 Plan 05, REQ-34.5-03) is classified as
 * structurally contained: it never calls `jest.mock('electron', ...)` itself,
 * relying on the same project-wide, tmpdir-based `src/backend/__mocks__/electron.ts`
 * auto-mock `runnerSliceRegistration.test.ts` already relies on for
 * `wineToolsFlowRegistration.ts`'s real `../config`/`../wine/manager/utils`/
 * `../dialog/dialog`/`../backend_events` import chain -- "contained by
 * construction, no per-suite opt-in required," not a hand-maintained kit of
 * its own. Its one per-suite addition is a factory mock of `../../launcher`
 * (avoiding that heavier module's launch-orchestration/child_process side
 * effects, irrelevant to proving registration kind and pass-through
 * forwarding), and a direct import of `../electronStub` for
 * `handlerRegistry`/`listenerRegistry` that touches no filesystem at module
 * scope. No new containment surface. A `readdirSync` recount at this plan's
 * execution time (not carried forward by hand, correcting the stale "34"
 * figure above) puts the directory at 35 `*.test.ts` files: 4
 * `IN_SCOPE_SUITES` + 31 below.
 *
 * `runnerAuthFlows.test.ts` (Phase 34.5 Plan 06, REQ-34.5-04) is classified as structurally
 * contained: it DOES declare its own `jest.mock('os', ...)` disposable-per-process-homedir
 * override (mirroring `steamAuthFlows.test.ts`'s own precedent exactly, same shape and same
 * reason -- this suite reaches the real `configStore` chain transitively through
 * `../storeManagers`'s load-bearing import, which eagerly constructs every store manager
 * including `legendaryConfig`/`gogdlConfig`/`gog_store`), so it is defence-in-depth ON TOP OF
 * the structural floor `jest.setupContainment.ts` already provides for every backend suite, not
 * a suite relying SOLELY on the structural floor with zero containment code of its own (the bar
 * `STRUCTURALLY_CONTAINED_SUITES`'s name literally describes). It cannot be an `IN_SCOPE_SUITE`:
 * those are required to carry a `jest.mock('../pathShim', ...)` call, which this suite has no
 * reason to make (it never touches `pathShim` at all). A `readdirSync` recount at this plan's
 * execution time puts the directory at 36 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 32 below.
 *
 * `runnerMiscFlows.test.ts` (Phase 34.5 Plan 07, REQ-34.5-06/REQ-34.5-09) is classified as
 * structurally contained: it DOES declare its own `jest.mock('os', ...)` disposable-per-process-
 * homedir override (mirroring `runnerAuthFlows.test.ts`'s own precedent), because
 * `runnerMiscFlowRegistration.ts` reaches `backend/constants/paths.ts` transitively (via
 * `wine/runtimes/runtimes.ts`), whose module-scope `homedir()` calls (`userHome`/`flatpakHome`)
 * are real unless redirected — so it is defence-in-depth ON TOP OF the structural floor
 * `jest.setupContainment.ts` already provides, not a suite relying solely on that floor. It also
 * factory-mocks `backend/utils` and `backend/logger` (short-circuiting the heavy
 * storeManagers/config/launcher/discord-rpc and GameConfig/GlobalConfig/backendEvents import
 * graphs those two modules would otherwise eagerly construct at module scope), neither of which
 * is invoked by this suite — only registration kind is proven, no handler body is ever called.
 * It cannot be an `IN_SCOPE_SUITE`: those are required to carry a `jest.mock('../pathShim', ...)`
 * call, which this suite has no reason to make (it never touches `pathShim` at all). A
 * `readdirSync` recount at this plan's execution time puts the directory at 37 `*.test.ts` files:
 * 4 `IN_SCOPE_SUITES` + 33 below.
 *
 * `shortcutsFlows.test.ts` (Phase 34.5 Plan 08, REQ-34.5-05) is classified as structurally
 * contained: it declares NO `jest.mock('os', ...)` of its own, deliberately -- its own header
 * explains this follows `pathShim.test.ts`'s precedent (a second, differently-scoped `homedir()`
 * override would be redundant with, and could disagree with, the structural
 * `jest.setupContainment.ts` mock this suite specifically compares its resolved paths against via
 * `realHomeAtSetup`). It DOES drive the real `shortcuts/shortcuts/shortcuts.ts` `addShortcuts`/
 * `generateMacOsApp` chain (the darwin `.app`/`run.sh` write path, the first code path in this
 * slice that writes real files outside the app-support dir by design) -- every one of those writes
 * lands under the structurally redirected `os.homedir()`, never the developer's real
 * `~/Applications`, exactly as the structural floor's own docstring promises for any suite that
 * adds zero containment code of its own. It factory-mocks `backend/config`, `backend/utils`,
 * `backend/ipc`, `backend/dialog/dialog`, `backend/logger`, `backend/storeManagers`,
 * `backend/shortcuts/nonesteamgame/nonesteamgame`, `backend/shortcuts/utils` and
 * `@shockpkg/icon-encoder` (isolating `convertPngToICNS`'s three real dependencies so its control
 * case can succeed without a real 512x512 PNG fixture), plus the standard `electron`/
 * `electron-store` real-shim preamble with `nativeImage.createFromBuffer` additionally overridden
 * -- none of this is a containment mock, all of it is scoping which real code path runs. It cannot
 * be an `IN_SCOPE_SUITE`: those are required to carry a `jest.mock('../pathShim', ...)` call, and
 * this suite deliberately imports the REAL `pathShim.getPath` (via the real, unmocked
 * `electronStub.app.getPath`) because proving the `GAMELIB_SHELL_EXE -> getPath('exe') ->
 * shortcuts.ts:227` chain end-to-end is this suite's whole point. A `readdirSync` recount at this
 * plan's execution time puts the directory at 38 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 34 below.
 *
 * `seamBranchParity.test.ts` (Phase 34.4.1 gap cycle, plan 34.4.1-10 Task 2, REQ-34.4.1-11/
 * REQ-34.4.1-GAP-04) is classified as structurally contained: it declares NO `jest.mock(...)` of
 * any kind, the same "contained by construction, no per-suite opt-in required" floor
 * `electronReachLedger.test.ts`/`pathShim.test.ts` already rely on. It reads real `.ts` source
 * files off disk via plain `fs.readFileSync`/`readdirSync` for static text analysis only -- it
 * never imports, requires, or executes `humble/user.ts`, `storeManagers/legendary/user.ts`, or
 * any other backend module, so there is no `electron`/`electron-store`/`pathShim` import chain to
 * contain in the first place. A `readdirSync` recount at this plan's execution time puts the
 * directory at 39 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 35 below.
 *
 * `humbleSecretStore.test.ts` (Phase 34.4.1 gap-cycle plan 13, F-1 BLOCKING closure) is
 * classified as structurally contained: it follows `keyringTokenStore.test.ts`'s own
 * already-approved convention exactly -- it mocks `../sidecarRpc` (`requestRustInvoke`) and
 * `../../logger` directly, and additionally mocks `../../humble/electronStores` with an in-memory
 * map (never `requireActual`, per `tests-clobbering-real-steam-store`'s warning that an unmocked
 * electron-store reaches the REAL app-support dir). `../humble/secretStore` is exercised for
 * real (its own default `ElectronHumbleSecretStore` only ever touches the mocked `electron`
 * (safeStorage) via the project-wide auto-mock and the mocked `electronStores` above -- no real
 * `pathShim`/`os.homedir()` surface anywhere in this suite's import graph. A `readdirSync`
 * recount at this plan's execution time puts the directory at 40 `*.test.ts` files: 4
 * `IN_SCOPE_SUITES` + 36 below.
 *
 * `appRootResolution.test.ts` (Phase 34.5 gap cycle, plan 34.5-16 Task 3, G-1) is classified as
 * structurally contained: it declares no `jest.mock(...)` of any kind. It imports the real
 * `../electronStub` (asserting `app.getAppPath()`'s two arms directly, saving/restoring
 * `process.env.GAMELIB_APP_ROOT` around every test and spying on `process.cwd()` rather than
 * mocking any module) and reads real `.ts`/`.rs` source files off disk via plain
 * `fs.readFileSync` for its static text assertions against `main.rs` -- the same "contained by
 * construction, no per-suite opt-in required" floor `electronReachLedger.test.ts`/
 * `seamBranchParity.test.ts` already rely on. It cannot be an `IN_SCOPE_SUITE`: those are
 * required to carry a `jest.mock('../pathShim', ...)` call, which this suite has no reason to
 * make (it never touches `pathShim` at all -- `electronStub.getAppPath()` is the seam under
 * test, not `pathShim`'s own `case 'exe'`). A `readdirSync` recount at this plan's execution
 * time puts the directory at 41 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 37 below.
 *
 * `devSecretVault.test.ts` (34.5 gap cycle 4 plan 36) is classified as structurally contained: it
 * DOES declare its own `jest.mock('../pathShim', ...)` -- but unlike `IN_SCOPE_SUITES`'s four
 * suites, that mock is a REAL-module pass-through for every name except `'temp'` (redirected to a
 * disposable per-test `mkdtemp` dir), not the four-element hostile-env-var containment kit
 * `IN_SCOPE_SUITES` requires (Block B's own gate) -- so it cannot be an `IN_SCOPE_SUITE`. Its
 * second describe block (Task 2, the bootstrap wiring exclusivity proof) drives the REAL
 * `../bootstrap` `init()`, whose real `electronStub.app.getPath('appData'|'userData')` resolution
 * relies on the structural floor (`jest.setupContainment.ts`) precisely because this suite adds no
 * hand-rolled `homedir()`/env-var containment of its own -- exactly the "contained by
 * construction, no per-suite opt-in required" guarantee this whole Block C exists to prove. A
 * `readdirSync` recount at this plan's execution time puts the directory at 42 `*.test.ts` files:
 * 4 `IN_SCOPE_SUITES` + 38 below.
 *
 * `steamFlows.test.ts` (Phase 34.5 gap cycle 6, plan 34.5-46 Task 2) is classified as
 * structurally contained: it reuses `skeletonFlows.test.ts`'s isolation preamble
 * verbatim -- a `jest.mock('os', ...)` disposable-homedir redirect plus `electron` /
 * `electron-store` / `axios` / `backend/utils` / `backend/constants/environment` mocks --
 * not the four-element `pathShim`/`backend/logger/paths` containment kit `IN_SCOPE_SUITES`
 * requires, so it cannot be an `IN_SCOPE_SUITE`. It never imports `pathShim` at all; the
 * dispatch under test (`handleLaunch`'s runner routing) has no `pathShim` surface. A
 * `readdirSync` recount at this plan's execution time puts the directory at 43
 * `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 39 below.
 *
 * `invokeReturnValueSweep.test.ts` (Phase 34.5 gap cycle 6, plan 34.5-45 Task 3) is classified as
 * structurally contained: it declares NO `jest.mock(...)` of any kind. It reads the four
 * `*FlowRegistration.ts` modules off disk via plain `fs.readFileSync` for static text analysis
 * only -- it never imports, requires, or executes any of them, so there is no `electron`/
 * `electron-store`/`pathShim` import chain to contain in the first place, the same "contained by
 * construction, no per-suite opt-in required" floor `seamBranchParity.test.ts`/
 * `appRootResolution.test.ts` already rely on. A `readdirSync` recount at this plan's execution
 * time puts the directory at 44 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 40 below.
 *
 * `nativeImageShim.test.ts` (Phase 34.5 gap cycle 6, plan 34.5-45 Task 1) is classified as
 * structurally contained: it declares NO `jest.mock(...)` of any kind. It imports only
 * `../nativeImageShim` (a pure `sips`-backed module with no `electron`/`electron-store`/
 * `pathShim` surface at all -- it shells out to `/usr/bin/sips` directly, never through
 * `electronStub`) plus Node built-ins (`node:child_process`, `node:fs`, `node:os`, `node:path`)
 * for its own fixture generation and dimension probing. No containment surface exists for this
 * suite to opt into. A `readdirSync` recount at this plan's execution time puts the directory at
 * 45 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 41 below.
 *
 * `externalDynamicImportGate.test.ts` (quick/260815-vvz, Task 2) is classified as structurally
 * contained: it declares NO `jest.mock(...)` of any kind. It reads real `.ts` source files off
 * disk via plain `fs.readdirSync`/`fs.readFileSync` for static TS-AST analysis only -- it never
 * imports, requires, or executes any backend module, so there is no `electron`/`electron-store`/
 * `pathShim` import chain to contain in the first place, the same "contained by construction, no
 * per-suite opt-in required" floor `seamBranchParity.test.ts`/`invokeReturnValueSweep.test.ts`
 * already rely on. A `readdirSync` recount at this plan's execution time puts the directory at
 * 46 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 42 below.
 *
 * `migrationsWiring.test.ts` (todo 2026-08-16, quick task 260822-s8y) is classified as
 * structurally contained, and is the clearest case yet for why the structural floor replaced the
 * hand-maintained kit. It declares NO `jest.mock('os', ...)` of its own -- it mocks only
 * `electron`/`electron-store` (routed at the real sidecar shims) plus `axios` and `fs/promises`'s
 * `cp`. It does REAL filesystem work under `homedir()`: it drives the real
 * `LegendaryGlobalConfigFolderMigration`, whose source is `homedir()/.config/legendary` and whose
 * destination is `appFolder/legendaryConfig/legendary`. Both resolve under
 * `jest.setupContainment.ts`'s disposable per-process root, so no real developer data is read or
 * written -- which is exactly the "contained by construction, no per-suite opt-in required"
 * guarantee this Block C exists to prove, exercised here by a suite that would otherwise have had
 * every reason to be listed as accepted debt. It cannot be an `IN_SCOPE_SUITE`: it declares none
 * of the four-element `pathShim`/`backend/logger/paths` kit Block B gates on. A `readdirSync`
 * recount at this task's execution time puts the directory at 47 `*.test.ts` files:
 * 4 `IN_SCOPE_SUITES` + 43 below.
 *
 * `flowRegistrationCensus.test.ts` (IN-01, `34.2-REVIEW.md` round 1) is classified
 * structurally contained on the same floor as `externalDynamicImportGate.test.ts`: it declares
 * NO `jest.mock(...)` of any kind and imports no backend module. It reads the sidecar's own
 * `*FlowRegistration.ts` and `handlers.ts` sources off disk through plain
 * `fs.readdirSync`/`fs.readFileSync` rooted at `__dirname`, counts `ipcMain.handle`/`ipcMain.on`
 * call sites textually, and never requires or executes any of them -- so no
 * `electron`/`electron-store`/`pathShim` import chain exists to contain in the first place, and
 * nothing it touches resolves through `homedir()`. A `readdirSync` recount at this task's
 * execution time puts the directory at 48 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 44 below.
 *
 * `outputStreamBinding.test.ts` (IN-04, `34.2-REVIEW.md` round 1) is classified structurally
 * contained. It declares NO `jest.mock(...)` of any kind and requires exactly one real backend
 * module, `../sidecarRpc`, whose entire import surface is `node:stream` (types only),
 * `node:crypto`, `common/types/sidecarTransport` and `./electronStub` -- no path module, no
 * `homedir()`, no filesystem read or write anywhere in the chain. Its only other disk access is
 * a `readFileSync` of `sidecarRpc.ts`'s own source for the anti-vacuity pin. It cannot be an
 * `IN_SCOPE_SUITE`: it declares none of the four-element `pathShim`/`backend/logger/paths` kit
 * Block B gates on. A `readdirSync` recount at this task's execution time puts the directory at
 * 49 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 45 below.
 *
 * `sendChannelObservable.test.ts` (Phase 34.6 Plan 05, REQ-34.6-04/07/13, 2026-08-23) is
 * classified structurally contained on the same basis as `outputStreamBinding.test.ts` above.
 * It declares exactly ONE `jest.mock(...)`, `jest.mock('../../logger', ...)`, and the module
 * under test (`../sendChannelObservable`) imports only `../logger` -- no `pathShim`, no
 * `electron`/`electron-store`, no `homedir()`, no filesystem access anywhere in its chain. It
 * cannot be an `IN_SCOPE_SUITE`: it declares none of the four-element `pathShim`/
 * `backend/logger/paths` mock kit Block B gates on. A `readdirSync` recount at this plan's
 * execution time puts the directory at 50 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 46 below.
 *
 * `eosOverlayFlows.test.ts` (Phase 34.6 Plan 08, REQ-34.6-01/08/13, 2026-08-24) is classified
 * structurally contained. It declares exactly ONE `jest.mock(...)`, a full factory mock of
 * `../../storeManagers/legendary/eos_overlay/eos_overlay` -- so the real `eos_overlay.ts` (whose
 * own line 1 is `import { dialog } from 'electron'`) is NEVER required by this suite; the module
 * under test, `../eosOverlayFlowRegistration`, imports only the mocked module and `./electronStub`
 * -- no `pathShim`, no real `electron`/`electron-store`, no `homedir()`, no filesystem access
 * anywhere in its chain (its one `readFileSync` call reads its own source file for an anti-vacuity
 * pin, mirroring `flowRegistrationCensus.test.ts`'s pattern above). It cannot be an
 * `IN_SCOPE_SUITE`: it declares none of the four-element `pathShim`/`backend/logger/paths` mock
 * kit Block B gates on. A `readdirSync` recount at this plan's execution time (Phase 34.6 Plan 11,
 * after adding `rendererPathGuard.test.ts` for `T-34.5-C6-49-03`) puts the directory at 53
 * `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 49 below.
 *
 * `isPackagedSidecar.test.ts` (Phase 35 plan 04, D-14 / D-19 half (b), 2026-08-28) is classified
 * structurally contained on a READ of its import graph, not on assumption. It declares no
 * file-wide `jest.mock` at all -- every mock is a `jest.doMock` inside a test body -- and the
 * only production modules it requires are `../isPackagedSidecar` (whose sole dependency is the
 * `node:sea` builtin) and `../electronStub`. `electronStub`'s graph does reach `./pathShim`, but
 * `pathShim`'s `resolveAppDataDir()`/`homedir()` calls all live INSIDE `getPath()` and none runs
 * at module scope, so nothing in that chain resolves a path at import time; `./sidecarRpc`'s
 * module scope is likewise inert (constants and empty containers). Its `readFileSync` calls read
 * source files in this very directory for the T-35-11 one-derivation source gate, mirroring
 * `flowRegistrationCensus.test.ts`'s own self-reading pattern above. It cannot be an
 * `IN_SCOPE_SUITE`: it declares none of the four-element `pathShim`/`backend/logger/paths` mock
 * kit Block B gates on. Recount: 54 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 50 below.
 *
 * `wakeLock.test.ts` (Phase 35 plan 08, D-08/D-05 / REQ-35-06, 2026-08-29) is classified
 * structurally contained on a READ of its import graph, not on assumption. It declares exactly
 * ONE file-wide `jest.mock`, a factory mock of `../sidecarRpc`, and requires only two production
 * modules: `../electronStub` and `common/types/sidecarTransport` (the latter is pure `const`
 * declarations and types, with no imports of its own). `electronStub`'s graph reaches
 * `./pathShim`, but as `isPackagedSidecar.test.ts`'s entry above already establishes,
 * `pathShim`'s `resolveAppDataDir()`/`homedir()` calls all live INSIDE `getPath()` and none runs
 * at module scope, so nothing in that chain resolves a path at import time. It touches no
 * filesystem at all -- not even the self-reading `readFileSync` source-gate pattern several
 * entries above use. It cannot be an `IN_SCOPE_SUITE`: it declares none of the four-element
 * `pathShim`/`backend/logger/paths` mock kit Block B gates on. Recount, run rather than carried
 * forward: 56 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 52 below.
 *
 * `installedJsonWatcher.test.ts` (Phase 35 plan 10, D-18/D-05 / REQ-35-16, 2026-08-29) is
 * classified structurally contained on a READ of its import graph, not on assumption. It declares
 * exactly TWO file-wide factory mocks -- `../../storeManagers` and `../../logger` -- and requires
 * one production module, `../installedJsonWatcher`. That module's only unmocked import beyond
 * `graceful-fs` is `../storeManagers/legendary/constants`, whose module scope is a `join()` of
 * already-resolved path constants: it computes a string and performs no I/O at import time, and
 * the `backend/constants` chain beneath it resolves `electron` through the project-wide,
 * tmpdir-based `src/backend/__mocks__/electron.ts` auto-mock -- the same "contained by
 * construction, no per-suite opt-in required" floor `runnerSliceRegistration.test.ts`'s entry
 * above describes.
 *
 * It DOES touch the real filesystem, deliberately and unusually for this list, because the
 * behaviour under test is a real `fs.watch`: a mocked watch would prove only that a callback was
 * registered, which is precisely the vacuous shape the ported defect already survived. Every such
 * write is confined to a per-test `mkdtempSync(os.tmpdir(), ...)` directory removed in `afterEach`;
 * the suite never resolves the real app-data path, because the watcher takes its target path as a
 * parameter and the fixture path is passed in explicitly. It therefore needs no `jest.mock('os')`
 * -- which is the stronger position, given this repo's recorded finding that a per-suite `os` mock
 * is inert here anyway.
 *
 * It cannot be an `IN_SCOPE_SUITE`: it declares none of the four-element `pathShim`/
 * `backend/logger/paths` mock kit Block B gates on. Recount, run rather than carried forward:
 * 57 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 53 below.
 */
const STRUCTURALLY_CONTAINED_SUITES = [
  'appRootResolution.test.ts',
  'appShellFlows.test.ts',
  'appShellImportGate.test.ts',
  'bootstrap.test.ts',
  'bootstrapWirings.test.ts',
  'clipboardFlows.test.ts',
  'devSecretVault.test.ts',
  'dialogStub.test.ts',
  'downloadQueueFlows.test.ts',
  'electronReachLedger.test.ts',
  'electronUntouched.test.ts',
  'eosOverlayFlows.test.ts',
  'externalDynamicImportGate.test.ts',
  'fileStore.test.ts',
  'flowRegistrationCensus.test.ts',
  'gameDetailsImportGate.test.ts',
  'gamelibNamespaceLoad.test.ts',
  'humbleFlows.test.ts',
  'humbleLoginFlows.test.ts',
  'humbleSecretStore.test.ts',
  'installFlows.test.ts',
  'installedJsonWatcher.test.ts',
  'invokeReturnValueSweep.test.ts',
  'isPackagedSidecar.test.ts',
  'keyringTokenStore.test.ts',
  'lifecycleStub.test.ts',
  'loggerCallSiteGuard.test.ts',
  'migrationsWiring.test.ts',
  'nativeImageShim.test.ts',
  'netStub.test.ts',
  'oauthLoginCapture.test.ts',
  'onlineMonitorWiring.test.ts',
  'outputStreamBinding.test.ts',
  'pathShim.test.ts',
  'rendererPathGuard.test.ts',
  'runnerAuthFlows.test.ts',
  'runnerMiscFlows.test.ts',
  'runnerSliceRegistration.test.ts',
  'rustInvokeChannel.test.ts',
  'seamBranchParity.test.ts',
  'sendChannelObservable.test.ts',
  'settingsFlows.test.ts',
  'shellFilesFlows.test.ts',
  'shortcutsFlows.test.ts',
  'skeletonFlows.test.ts',
  'steamAuthFlows.test.ts',
  'steamFlows.test.ts',
  'steamgridSecretStore.test.ts',
  'storeEmbedFlows.test.ts',
  'storeEmbedWireContract.test.ts',
  'storeLayer.test.ts',
  'structuralContainment.test.ts',
  'testContainment.test.ts',
  'wakeLock.test.ts',
  'wineToolsFlows.test.ts'
]

describe('Block B: declared-list source gate over the four in-scope suites (34.2 gap cycle 2, plan 34.2-18)', () => {
  it('anti-vacuity: the declared in-scope list has exactly 4 entries and every file exists', () => {
    expect(IN_SCOPE_SUITES).toHaveLength(4)
    for (const name of IN_SCOPE_SUITES) {
      const filePath = join(__dirname, name)
      expect(existsSync(filePath)).toBe(true)
    }
  })

  it.each(IN_SCOPE_SUITES)(
    'anti-vacuity: comment-stripping %s materially shortens its source and leaves it non-empty',
    (name) => {
      const raw = readFileSync(join(__dirname, name), 'utf-8')
      const stripped = stripComments(raw)
      expect(stripped.length).toBeGreaterThan(0)
      expect(stripped.length).toBeLessThan(raw.length)
    }
  )

  it.each(IN_SCOPE_SUITES)(
    'REQ-34.2-07/-14: %s contains a pathShim jest.mock, matched on comment-stripped source',
    (name) => {
      const stripped = stripComments(
        readFileSync(join(__dirname, name), 'utf-8')
      )
      expect(stripped).toMatch(/jest\.mock\(\s*['"]\.\.\/pathShim['"]/)
    }
  )

  it.each(IN_SCOPE_SUITES)(
    'REQ-34.2-07/-14: %s contains a backend/logger/paths jest.mock, matched on comment-stripped source',
    (name) => {
      const stripped = stripComments(
        readFileSync(join(__dirname, name), 'utf-8')
      )
      expect(stripped).toMatch(/jest\.mock\(\s*['"]backend\/logger\/paths['"]/)
    }
  )

  it.each(IN_SCOPE_SUITES)(
    'REQ-34.2-07/-14: %s contains a containment tripwire referencing getLogFilePath, matched on comment-stripped source',
    (name) => {
      const stripped = stripComments(
        readFileSync(join(__dirname, name), 'utf-8')
      )
      expect(stripped).toMatch(/getLogFilePath\(\{\}\)/)
    }
  )

  // WR-01: this anti-claim gate matches RAW source, unlike the three
  // pattern-PRESENCE gates above (pathShim mock, backend/logger/paths mock,
  // getLogFilePath({}) tripwire), which correctly stay on `stripComments`
  // output. The claim this gate hunts for can ONLY ever be written on a
  // `*`-prefixed docblock line (see the WR-01 self-test immediately below) --
  // `stripComments` drops every such line before matching, so running this
  // gate against stripped source made it permanently vacuous (the gap-cycle-2
  // verification finding this closes). This file (`testContainment.test.ts`)
  // is not itself one of `IN_SCOPE_SUITES`, so there is no self-satisfaction
  // risk here the way there is for the three pattern-PRESENCE gates above --
  // do not "restore consistency" by moving this gate back onto stripped
  // source.
  it.each(IN_SCOPE_SUITES)(
    'REQ-34.2-07/-14: %s no longer claims "NO FILESYSTEM WRITES", matched on RAW source (WR-01)',
    (name) => {
      const raw = readFileSync(join(__dirname, name), 'utf-8')
      expect(raw.toUpperCase()).not.toContain('NO FILESYSTEM WRITES')
    }
  )

  // WR-01 gate self-test (mirrors gameDetailsImportGate.test.ts's own Gate-2
  // self-test convention): proves the OLD (stripped-source) gate could NEVER
  // fail. A synthetic source whose only occurrence of the claim sits on a
  // `*`-prefixed docblock line IS detected by the raw matcher above, but is
  // NOT detected once the same source is run through `stripComments` -- this
  // is the executable record of why the prior gate was vacuous.
  it('WR-01 gate self-test: the raw matcher detects a docblock-only "NO FILESYSTEM WRITES" claim that stripComments would hide', () => {
    const synthetic = [
      '/**',
      ' * NO FILESYSTEM WRITES occur in this suite.',
      ' */',
      "import { readFileSync } from 'fs'"
    ].join('\n')

    expect(synthetic.toUpperCase()).toContain('NO FILESYSTEM WRITES')
    expect(stripComments(synthetic).toUpperCase()).not.toContain(
      'NO FILESYSTEM WRITES'
    )
  })

  // Gate self-test (mirrors gameDetailsImportGate.test.ts's own Gate 2
  // self-test): stripComments must remove a comment-only line naming a
  // forbidden pattern before matching, proving the stripper itself works
  // rather than merely asserting a raw grep would pass.
  it("gate self-test: stripComments removes a comment-only jest.mock('../pathShim' line before matching", () => {
    const source = [
      "// this comment intentionally says: jest.mock('../pathShim', () => {})",
      "import { readFileSync } from 'fs'"
    ].join('\n')
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/jest\.mock\(\s*['"]\.\.\/pathShim['"]/)
  })
})

// RED-PROOF (recorded verbatim in 34.2-18-SUMMARY.md): temporarily renaming
// `loggerFlows.test.ts`'s own `jest.mock('../pathShim', ...)` call (backed
// up first, restored immediately afterwards, `git diff` confirmed clean)
// made exactly one Block B test fail -- the pathShim-mock-presence check
// for `loggerFlows.test.ts` -- proving Block B is not vacuous.

// ── Block C: derived readdirSync tripwire over the whole directory
// (plan 34.2-23, WR-08, T-34.2-83) ──────────────────────────────────────────

/** Every `*.test.ts` file actually present in this directory, sorted. */
function listActualTestSuites(): string[] {
  return readdirSync(__dirname)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
}

/**
 * Set-EQUALITY (not merely "no unclassified file") between `actualFiles`
 * and the union of the two declared lists above -- so this catches BOTH an
 * unclassified new suite (T-34.2-83) AND a phantom entry left behind after a
 * suite is renamed or deleted. Factored into its own function so the gate
 * below and its self-test exercise the SAME comparison code path -- a
 * self-test that reimplements the comparison would prove nothing about the
 * gate it claims to test.
 */
function diffSuiteClassification(
  actualFiles: string[],
  declaredNames: string[]
): { unclassified: string[]; phantom: string[] } {
  const actualSet = new Set(actualFiles)
  const declaredSet = new Set(declaredNames)
  const unclassified = actualFiles
    .filter((name) => !declaredSet.has(name))
    .sort()
  const phantom = declaredNames.filter((name) => !actualSet.has(name)).sort()
  return { unclassified, phantom }
}

describe('Block C: derived readdirSync tripwire over the whole directory (plan 34.2-23, WR-08)', () => {
  it('anti-vacuity: the derived directory listing has more than 20 entries and every classified name exists on disk', () => {
    const actualFiles = listActualTestSuites()
    expect(actualFiles.length).toBeGreaterThan(20)

    for (const name of [...IN_SCOPE_SUITES, ...STRUCTURALLY_CONTAINED_SUITES]) {
      expect(existsSync(join(__dirname, name))).toBe(true)
    }
  })

  it('T-34.2-83: every *.test.ts file in this directory is classified by exactly one of the two declared lists (set equality)', () => {
    const actualFiles = listActualTestSuites()
    const declared = [...IN_SCOPE_SUITES, ...STRUCTURALLY_CONTAINED_SUITES]
    const { unclassified, phantom } = diffSuiteClassification(
      actualFiles,
      declared
    )
    expect({ unclassified, phantom }).toEqual({
      unclassified: [],
      phantom: []
    })
  })

  // WR-05: both self-tests below use fully synthetic, LITERAL input arrays
  // -- neither calls listActualTestSuites(). Before this plan, both self-
  // tests derived their "actual files" input from the live directory
  // listing (listActualTestSuites() plus/minus one synthetic name), which
  // coupled them to the exact state the real gate above is itself
  // comparing. The moment the real gate's own set-equality check failed
  // (e.g. an unclassified suite added and not yet registered), BOTH
  // self-tests failed too, because listActualTestSuites() returned a
  // right-hand set the self-tests' own hardcoded expectations no longer
  // matched. Reproduced live during this plan's own arrival state (see
  // 34.2-29-SUMMARY.md): dropping loggerCallSiteGuard.test.ts unclassified
  // produced 3 failures, not 1 -- the two self-tests below failed WITH
  // misleading `expected ['zzSyntheticUnclassifiedSuite.test.ts']` /
  // `expected []` messages that named the WRONG file and actively misdirect
  // whoever is diagnosing the real failure, rather than surfacing the one
  // genuinely unclassified suite. Both self-tests still call
  // diffSuiteClassification -- the SAME function the real gate above calls
  // -- so they prove the gate's own comparison logic, not a
  // reimplementation of it; they just no longer borrow their INPUT from the
  // state under test.
  it('tripwire self-test: an unclassified synthetic file name is reported by diffSuiteClassification', () => {
    const actualFiles = ['a.test.ts', 'b.test.ts', 'zzSynthetic.test.ts']
    const declared = ['a.test.ts', 'b.test.ts']

    const { unclassified, phantom } = diffSuiteClassification(
      actualFiles,
      declared
    )
    expect(unclassified).toEqual(['zzSynthetic.test.ts'])
    expect(phantom).toEqual([])
  })

  // Tripwire self-test (phantom direction): proves the same function also
  // catches a declared name naming a file that no longer exists.
  it('tripwire self-test: a phantom declared name naming a nonexistent file is reported by diffSuiteClassification', () => {
    const actualFiles = ['a.test.ts', 'b.test.ts']
    const declared = ['a.test.ts', 'b.test.ts', 'zzPhantom.test.ts']

    const { unclassified, phantom } = diffSuiteClassification(
      actualFiles,
      declared
    )
    expect(unclassified).toEqual([])
    expect(phantom).toEqual(['zzPhantom.test.ts'])
  })
})

// TRIPWIRE RED PROOF (recorded verbatim in 34.2-23-SUMMARY.md): a real
// placeholder file, `zzTripwireProbe.test.ts`, was created in this
// directory containing one trivially-passing test; running this suite with
// the probe present made the "every *.test.ts file ... classified" test
// above fail, naming `zzTripwireProbe.test.ts` as unclassified; the probe
// was then deleted and `git status` confirmed clean.

// ── Block D: structural containment gate (plan 34.2-23, T-34.2-84) ─────────

const JEST_CONFIG_PATH = join(__dirname, '..', '..', 'jest.config.js')
const JEST_SETUP_CONTAINMENT_PATH = join(
  __dirname,
  '..',
  '..',
  'jest.setupContainment.ts'
)

/**
 * True if `source` (comment-stripped) wires a `setupFiles` entry naming
 * `jest.setupContainment` -- the single registration point plan 34.2-19
 * added to `src/backend/jest.config.js`. Shared by the real-file assertion
 * below and its own self-test, so the self-test proves the SAME logic that
 * gates the real file can fail.
 */
function hasSetupContainmentEntry(source: string): boolean {
  const stripped = stripComments(source)
  return /setupFiles\s*:\s*\[[^\]]*jest\.setupContainment/.test(stripped)
}

const REQUIRED_CONTAINMENT_ENV_VARS = [
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'XDG_STATE_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME'
]

/**
 * WR-01: true iff `source` assigns `process.env.<key> =` as an actual code
 * statement. Matches on comment-stripped source -- deliberately the OPPOSITE
 * of Block B's "NO FILESYSTEM WRITES" anti-claim gate above, which correctly
 * stays on RAW source. The two are not inconsistent: Block B's gate hunts a
 * *comment* (a claim that can only ever be written in prose, which
 * `stripComments` would hide), while this gate hunts a *code statement* (an
 * assignment that a docblock line can merely mention without making true).
 * Before this plan, this gate matched RAW source, so a docblock line merely
 * mentioning `process.env.HOME =` (e.g. in explanatory prose) satisfied it
 * identically to the real assignment actually being present -- deleting the
 * real assignment left the gate green. Do not "harmonise" this with Block
 * B's raw-source gate; a future reader must not move this back onto raw
 * source. Self-test below.
 */
function assignsContainmentEnvVar(source: string, key: string): boolean {
  return new RegExp(`process\\.env\\.${key}\\s*=`).test(stripComments(source))
}

/**
 * WR-02: true iff `source` (comment-stripped) registers the load-bearing
 * containment mechanism `jest.setupContainment.ts`'s own docstring calls
 * "THE load-bearing fix" -- the `jest.mock` module-registry substitution for
 * BOTH the bare `'os'` specifier and the `'node:os'` specifier, with a
 * `homedir` override (an arrow function) AND a `userInfo` override. Before
 * this plan, Block D gated only the eight `process.env` assignments the
 * containment module itself labels "defense-in-depth" -- deleting the
 * `jest.mock('node:os', ...)` registration (the exact CR-02 regression) left
 * Block D fully green. Self-tests below.
 */
function hasContainmentOsMock(source: string): boolean {
  const stripped = stripComments(source)
  const hasBareOsMock = /jest\.mock\(\s*['"]os['"]/.test(stripped)
  const hasNodeOsMock = /jest\.mock\(\s*['"]node:os['"]/.test(stripped)
  const hasHomedirOverride = /homedir\s*:\s*\([^)]*\)\s*=>/.test(stripped)
  const hasUserInfoOverride = /userInfo\s*:\s*\(/.test(stripped)
  return (
    hasBareOsMock && hasNodeOsMock && hasHomedirOverride && hasUserInfoOverride
  )
}

describe('Block D: structural containment gate -- gates BOTH the load-bearing os/node:os module-registry substitution (WR-02) AND the defence-in-depth process.env assignments (WR-01), on comment-stripped source (plan 34.2-23 T-34.2-84, hardened by plan 34.2-29)', () => {
  it('src/backend/jest.config.js still wires a setupFiles entry naming jest.setupContainment', () => {
    const source = readFileSync(JEST_CONFIG_PATH, 'utf-8')
    expect(hasSetupContainmentEntry(source)).toBe(true)
  })

  // Structural-gate self-test: proves hasSetupContainmentEntry (the SAME
  // function the gate above calls) can actually fail against a config that
  // lacks the entry, not just pass against the real file.
  it('structural gate self-test: a synthetic jest.config.js lacking the setupFiles entry is detected as missing', () => {
    const synthetic = [
      'module.exports = {',
      "  displayName: 'Backend',",
      "  roots: ['<rootDir>/src/backend']",
      '}'
    ].join('\n')
    expect(hasSetupContainmentEntry(synthetic)).toBe(false)
  })

  it.each(REQUIRED_CONTAINMENT_ENV_VARS)(
    'src/backend/jest.setupContainment.ts still assigns process.env.%s, matched on comment-stripped source (WR-01)',
    (key) => {
      const source = readFileSync(JEST_SETUP_CONTAINMENT_PATH, 'utf-8')
      expect(assignsContainmentEnvVar(source, key)).toBe(true)
    }
  )

  // WR-01 self-test: proves assignsContainmentEnvVar (the SAME function the
  // gate above calls) rejects a docblock-only occurrence of the assignment
  // it is supposed to require as a real code statement.
  it('WR-01 self-test: a synthetic source whose only process.env.HOME = occurrence sits on a docblock line is rejected', () => {
    const synthetic = [
      '/**',
      ' * process.env.HOME = containmentRoot',
      ' */',
      'const unrelated = 1'
    ].join('\n')
    expect(assignsContainmentEnvVar(synthetic, 'HOME')).toBe(false)
  })

  it('src/backend/jest.setupContainment.ts still registers the load-bearing os/node:os homedir+userInfo mock (WR-02)', () => {
    const source = readFileSync(JEST_SETUP_CONTAINMENT_PATH, 'utf-8')
    expect(hasContainmentOsMock(source)).toBe(true)
  })

  it("WR-02 self-test: a synthetic factory registered only for the bare 'os' specifier is rejected (documents the pre-34.2-25 CR-02 state)", () => {
    const synthetic = [
      'function mockOsFactory() {',
      "  return { homedir: () => '/tmp/fake', userInfo: () => ({ homedir: '/tmp/fake' }) }",
      '}',
      "jest.mock('os', mockOsFactory)"
    ].join('\n')
    expect(hasContainmentOsMock(synthetic)).toBe(false)
  })

  it('WR-02 self-test: a synthetic factory registered for both specifiers but with no homedir override is rejected', () => {
    const synthetic = [
      'function mockOsFactory() {',
      "  return { userInfo: () => ({ homedir: '/tmp/fake' }) }",
      '}',
      "jest.mock('os', mockOsFactory)",
      "jest.mock('node:os', mockOsFactory)"
    ].join('\n')
    expect(hasContainmentOsMock(synthetic)).toBe(false)
  })

  it('WR-02 self-test: a synthetic factory overriding homedir but not userInfo is rejected', () => {
    const synthetic = [
      'function mockOsFactory() {',
      "  return { homedir: () => '/tmp/fake' }",
      '}',
      "jest.mock('os', mockOsFactory)",
      "jest.mock('node:os', mockOsFactory)"
    ].join('\n')
    expect(hasContainmentOsMock(synthetic)).toBe(false)
  })

  it('WR-02 self-test: a synthetic factory registered for both specifiers with homedir and userInfo overrides is accepted', () => {
    const synthetic = [
      'function mockOsFactory() {',
      "  return { homedir: () => '/tmp/fake', userInfo: () => ({ homedir: '/tmp/fake' }) }",
      '}',
      "jest.mock('os', mockOsFactory)",
      "jest.mock('node:os', mockOsFactory)"
    ].join('\n')
    expect(hasContainmentOsMock(synthetic)).toBe(true)
  })
})

// STRUCTURAL GATE RED PROOF (recorded verbatim in 34.2-23-SUMMARY.md): the
// `setupFiles` entry in `src/backend/jest.config.js` was temporarily
// commented out; running this suite made the "still wires a setupFiles
// entry" test above fail; the entry was restored and
// `git diff --exit-code src/backend/jest.config.js` returned 0.

// ── Block E: cross-project containment scope gate (plan 34.2-29,
// CR-02 secondary) ───────────────────────────────────────────────────────
//
// `src/backend/jest.config.js`'s `setupFiles` comment justifies registering
// `jest.setupContainment.ts` on the Backend project ONLY by asserting the
// destruction path is "reachable only from `src/backend`, so the
// frontend/common/preload/meta jest projects are deliberately untouched" --
// true today, hand-maintained, and previously UNENFORCED: nothing failed if
// a `meta` or `preload` suite started importing `backend/logger` tomorrow.
// This block enforces that assumption AT DEPTH 1: if a
// frontend/common/preload/meta test file ever imports one of the four
// containment-relevant module specifiers below DIRECTLY, it would run WITHOUT
// the containment `setupFiles` entry (that entry is registered on the Backend
// jest project only), reopening the destruction path in a project nobody is
// watching for it.
//
// IN-08 (gap cycle 4, corrected 2026-08-23): this used to say the block
// "converts that assumption into an enforced invariant", full stop, which
// overstates what it does. `importsContainmentModule` reads the import
// specifiers of the test file ITSELF and nothing further. A frontend test that
// imports a frontend module which in turn imports `backend/logger` is
// invisible to this gate.
//
// Deliberately NOT made transitive, and the reasoning is worth recording so
// the decision is not re-litigated as an oversight. Going transitive here
// means resolving the full import graph of every `*.test.ts(x)` file across
// four whole project trees, on every run of this suite, with a hand-rolled
// resolver that would have to understand this repo's path aliases, its `.tsx`
// and `index.ts` resolution, and its `node_modules` boundary -- a resolver
// whose own bugs fail SILENTLY in the passing direction, which is the defect
// class this entire gap cycle exists to close. The narrow gate catches the
// direct import, which is how every real instance of this has actually
// appeared, and the structural `setupFiles` containment remains the mechanism
// that makes a missed one non-destructive rather than merely undetected.
// (`structuralContainment.test.ts`'s WR-05 block does walk an import graph
// transitively, but over ONE file's imports, not four project trees -- and it
// throws rather than skips on anything it cannot resolve, which is affordable
// at that scale and would be a permanent maintenance tax at this one.) `meta/__tests__/buildSidecarSea.test.ts` reads backend
// source as TEXT only (an esbuild `--alias:electron=./src/backend/...`
// CLI-arg string) -- this gate matches only quoted import/require
// specifiers, never an arbitrary string mention, so that file continues to
// be allowed.

/** Module specifiers whose real implementation reaches the destruction path
 * `jest.setupContainment.ts` exists to contain (`os.homedir()` /
 * `getBaseLogPath()` / `resolveAppDataDir()`). */
const CONTAINMENT_MODULE_SPECIFIERS = [
  'backend/logger',
  'backend/logger/paths',
  'backend/constants/paths',
  'backend/sidecar/pathShim'
]

/**
 * True if comment-stripped `source` contains an `import ... from` or
 * `require(...)` specifier naming `moduleSpecifier`, either as the bare
 * form (`'backend/logger'`, resolved via this project's `baseUrl`) or a
 * relative form ending in the same path (`'../../../backend/logger'`, any
 * number of `../` segments). Matches only within a quoted import/require
 * specifier -- never an arbitrary string mention elsewhere in the file.
 */
function importsContainmentModule(
  source: string,
  moduleSpecifier: string
): boolean {
  // IN-08 (gap cycle 4, fixed 2026-08-23): `stripComments` alone left TRAILING
  // comments in place, so `const x = 1 // import a from 'backend/logger'` was
  // reported as a violation. Measured before the fix, and it is a FALSE
  // POSITIVE -- the direction that makes someone weaken a gate to get a green
  // run.
  //
  // The review prescribed "fix the shared stripper per CR-01". That remedy is
  // wrong: CR-01's fix HAS landed (this gate already calls the shared util),
  // and that util deliberately does NOT strip trailing comments, because a
  // naive `/\/\/.*$/gm` pass is the WR-08 regression class that cut six
  // `main.rs` lines containing `"https://"` literals in half. Its docstring
  // says so, and directs callers needing trailing-comment stripping to layer
  // one on top -- which is what happens here.
  //
  // `stripTrailingLineCommentTs`, not `stripTrailingLineComment`: the latter
  // tracks double quotes only, because Rust lifetimes (`&'a str`) put unpaired
  // single quotes in ordinary code. Applied to TypeScript it would truncate
  // `const a = 'https://x'` at the `//`.
  const stripped = stripComments(source)
    .split('\n')
    .map(stripTrailingLineCommentTs)
    .join('\n')
  const escaped = moduleSpecifier.replace(/\//g, '\\/')
  const pattern = new RegExp(
    `(?:from\\s+|require\\(\\s*)['"](?:\\.\\./)*${escaped}['"]`
  )
  return pattern.test(stripped)
}

/** Recursively collects every `*.test.ts`/`*.test.tsx` file under `rootDir`,
 * skipping `node_modules`. Returns `[]` for a directory that does not
 * exist, so a project that has not yet grown any tests does not crash the
 * gate. */
function collectTestFilesRecursive(rootDir: string): string[] {
  if (!existsSync(rootDir)) return []
  const results: string[] = []
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTestFilesRecursive(fullPath))
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const EXTERNAL_PROJECT_DIRS = [
  join(REPO_ROOT, 'src', 'frontend'),
  join(REPO_ROOT, 'src', 'common'),
  join(REPO_ROOT, 'src', 'preload'),
  join(REPO_ROOT, 'meta')
]

interface ContainmentImportViolation {
  file: string
  specifier: string
}

/** Every (file, specifier) pair where a frontend/common/preload/meta
 * `*.test.ts(x)` file imports a containment-relevant backend module. */
function findCrossProjectContainmentViolations(): ContainmentImportViolation[] {
  const violations: ContainmentImportViolation[] = []
  for (const projectDir of EXTERNAL_PROJECT_DIRS) {
    for (const filePath of collectTestFilesRecursive(projectDir)) {
      const source = readFileSync(filePath, 'utf-8')
      for (const specifier of CONTAINMENT_MODULE_SPECIFIERS) {
        if (importsContainmentModule(source, specifier)) {
          violations.push({ file: relative(REPO_ROOT, filePath), specifier })
        }
      }
    }
  }
  return violations
}

describe('Block E: cross-project containment scope gate (plan 34.2-29, CR-02 secondary)', () => {
  it('no frontend/common/preload/meta *.test.ts(x) file imports a containment-relevant backend module', () => {
    expect(findCrossProjectContainmentViolations()).toEqual([])
  })

  it('self-test: a synthetic source importing backend/logger is detected', () => {
    const synthetic = "import { logInfo } from 'backend/logger'\n"
    expect(importsContainmentModule(synthetic, 'backend/logger')).toBe(true)
  })

  it('self-test: a synthetic source importing an unrelated backend module is accepted (not flagged by any containment specifier)', () => {
    const synthetic = "import type { ValidStoreName } from 'common/types'\n"
    for (const specifier of CONTAINMENT_MODULE_SPECIFIERS) {
      expect(importsContainmentModule(synthetic, specifier)).toBe(false)
    }
  })

  it('self-test (IN-08): a TRAILING comment naming a containment module is NOT a violation', () => {
    // Measured as a false positive before the fix. The failure direction
    // matters: a gate that reports work nobody did is the kind someone
    // eventually weakens to get a green run.
    const synthetic = "const x = 1 // import a from 'backend/logger'\n"
    expect(importsContainmentModule(synthetic, 'backend/logger')).toBe(false)
  })

  it('self-test (IN-08): a real import on the SAME line as a //-bearing string literal is still detected', () => {
    // The other direction, and the reason `stripTrailingLineCommentTs` exists
    // rather than a naive `/\/\/.*$/`. A naive pass cuts at the `//` inside
    // the single-quoted URL and loses the import that follows it.
    const synthetic =
      "const u = 'https://example.com'; import { logInfo } from 'backend/logger'\n"
    expect(importsContainmentModule(synthetic, 'backend/logger')).toBe(true)
  })

  it('self-test (IN-08): a //-bearing literal does not by itself trip the gate', () => {
    // Non-vacuity for the test above: it must pass because of the import, not
    // because the URL happens to contain the specifier-ish text.
    const synthetic = "const u = 'https://example.com/backend/logger'\n"
    expect(importsContainmentModule(synthetic, 'backend/logger')).toBe(false)
  })

  it('self-test: a relative-form import (../../../backend/logger/paths) is detected the same as the bare form', () => {
    const synthetic =
      "import { getLogFilePath } from '../../../backend/logger/paths'\n"
    expect(importsContainmentModule(synthetic, 'backend/logger/paths')).toBe(
      true
    )
  })
})

// BLOCK E DELIBERATE-BREAK PROOF (recorded verbatim in 34.2-29-SUMMARY.md):
// a real `import { getLogFilePath } from 'backend/logger/paths'` line was
// temporarily added to `src/common/types/__tests__/storePolicy.test.ts`;
// running this suite made the real-file gate above fail, naming that exact
// file and specifier; the line was reverted and
// `git status --porcelain` confirmed clean.
