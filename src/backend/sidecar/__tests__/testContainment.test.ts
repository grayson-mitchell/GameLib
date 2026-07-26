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

const TMP_ROOT_NAME = `gamelib-testcontainment-test-home-${process.pid}`

// ── os — redirect homedir() to a disposable per-process tmp directory
// (mirrors the four in-scope suites' own kit) ───────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), TMP_ROOT_NAME)
  }
})

// ── pathShim — the SAME mock shape the four in-scope suites use: no
// platform branch, no environment variable participating. Block A's whole
// point is proving THIS shape stays safe even when `process.platform` and
// every relevant env var are adversarial. ───────────────────────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-testcontainment-test-home-${process.pid}`
  )
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
  const actualOs = jest.requireActual('os')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-testcontainment-test-home-${process.pid}`
  )
  const logBaseDir = actualPath.join(tmpRoot, 'logs')
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
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── electron / electron-store — constants/paths.ts imports `app` from
// 'electron' at module scope; route Jest's own module resolution at the
// REAL sidecar shims (mirrors the four in-scope suites' own kit) ───────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

/** Strips `//`, `/* ... *\/`-continuation, and `*`-prefixed docblock lines
 * before matching, so an explanatory comment naming a forbidden/required
 * pattern cannot self-satisfy its own gate (mirrors
 * `gameDetailsImportGate.test.ts`'s own `stripComments`). */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

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
 * The directory holds 26 `*.test.ts` files as of this plan (25 before gap
 * cycle 4 plan 34.2-26 added `loggerCallSiteGuard.test.ts`, itself
 * classified here rather than left as the deliberately-open Block C failure
 * that plan left as live evidence the tripwire fires); 4 are
 * `IN_SCOPE_SUITES` and the 22 below account for the rest (counts
 * recomputed from `readdirSync` by this plan, not carried forward by
 * hand -- see Block C's own anti-vacuity test, which asserts every name
 * declared here still exists on disk).
 *
 * `loggerCallSiteGuard.test.ts` (plan 34.2-26) is classified as
 * structurally contained: it carries no `os`/`pathShim` mock of its own and
 * relies entirely on the `setupFiles` mechanism, mocking only
 * `backend/logger/paths` (a module below the code it tests) plus
 * `electron`/`backend/config`.
 */
const STRUCTURALLY_CONTAINED_SUITES = [
  'appShellFlows.test.ts',
  'appShellImportGate.test.ts',
  'bootstrap.test.ts',
  'bootstrapWirings.test.ts',
  'dialogStub.test.ts',
  'downloadQueueFlows.test.ts',
  'electronReachLedger.test.ts',
  'electronUntouched.test.ts',
  'fileStore.test.ts',
  'gameDetailsImportGate.test.ts',
  'installFlows.test.ts',
  'keyringTokenStore.test.ts',
  'lifecycleStub.test.ts',
  'loggerCallSiteGuard.test.ts',
  'onlineMonitorWiring.test.ts',
  'rustInvokeChannel.test.ts',
  'settingsFlows.test.ts',
  'skeletonFlows.test.ts',
  'steamAuthFlows.test.ts',
  'storeLayer.test.ts',
  'structuralContainment.test.ts',
  'testContainment.test.ts'
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
      expect(stripped).toMatch(
        /jest\.mock\(\s*['"]backend\/logger\/paths['"]/
      )
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
  it('gate self-test: stripComments removes a comment-only jest.mock(\'../pathShim\' line before matching', () => {
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
  const phantom = declaredNames
    .filter((name) => !actualSet.has(name))
    .sort()
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
