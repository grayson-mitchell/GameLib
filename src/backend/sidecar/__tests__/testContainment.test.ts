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
 * This gate does NOT cover the whole `src/backend/sidecar/__tests__/`
 * directory -- see the docstring above `IN_SCOPE_SUITES` below for the
 * explicit list of what remains uncovered and why.
 */

import { existsSync, readFileSync } from 'fs'
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

// ── backend/constants/environment — deterministic pin (mirrors the four
// in-scope suites' own kit), kept even though pathShim.ts/logger/paths.ts
// read `process.platform`/`process.env` directly rather than this module --
// included for parity with the mock kit this suite is proving. ─────────────
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
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}
  const sentinelPaths: Record<(typeof ENV_KEYS)[number], string> =
    {} as Record<(typeof ENV_KEYS)[number], string>
  let originalPlatform: string

  beforeAll(() => {
    originalPlatform = process.platform

    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      // Absolute, guaranteed-not-to-exist, OUTSIDE os.tmpdir() -- a sentinel
      // INSIDE tmpdir would make every assertion below vacuous, since an
      // uncontained resolution would still land inside tmpdir and pass.
      const sentinel = `/gamelib-containment-sentinel-${process.pid}-${key}`
      expect(existsSync(sentinel)).toBe(false)
      sentinelPaths[key] = sentinel
      process.env[key] = sentinel
    }

    // RED PROPERTY (see module docstring): force the non-darwin resolution
    // branch pathShim.ts's real resolveAppDataDir() / logger/paths.ts's real
    // getBaseLogPath() would take on Windows/Linux. Without this, on THIS
    // macOS host, both real resolvers' darwin branch never consults any of
    // the four env vars above -- the sentinel values alone would exercise
    // nothing, and removing either mock below would NOT fail here. Mirrors
    // `overrideProcessPlatform` in `src/backend/__tests__/constants.test.ts`.
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    })
  })

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  })

  it('precondition: none of the four sentinel paths pre-exist on disk', () => {
    for (const key of ENV_KEYS) {
      expect(existsSync(sentinelPaths[key])).toBe(false)
    }
  })

  it('precondition: every sentinel path is OUTSIDE os.tmpdir()', () => {
    const tmpRoot = resolve(tmpdir())
    for (const key of ENV_KEYS) {
      const rel = relative(tmpRoot, resolve(sentinelPaths[key]))
      expect(rel.startsWith('..') || isAbsolute(rel)).toBe(true)
    }
  })

  it('REQ-34.2-07/-14: a freshly-required constants/paths still yields appFolder/userDataPath/fixesPath inside os.tmpdir()', () => {
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

  it('REQ-34.2-07/-14: getLogFilePath({}) still resolves inside os.tmpdir()', () => {
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

  // RED-PROOF (recorded verbatim in 34.2-18-SUMMARY.md): commenting out the
  // `jest.mock('../pathShim', ...)` block above makes the first assertion
  // test fail on THIS macOS host (appFolder/userDataPath/fixesPath resolve
  // to a path under the `XDG_CONFIG_HOME` sentinel instead), because
  // `beforeAll` above has already forced `process.platform` to `'linux'`.
  // Restored immediately afterwards, `git diff` confirmed clean.
  //
  // RED-PROOF 2 (recorded verbatim in 34.2-18-SUMMARY.md): commenting out
  // the `jest.mock('backend/logger/paths', ...)` block above makes ONLY the
  // `getLogFilePath({})` assertion test fail, for the same reason -- the
  // real `getBaseLogPath()` reads the `LOCALAPPDATA`/`XDG_STATE_HOME`
  // sentinel directly once `process.platform` is forced non-mac/non-win.
  // Restored immediately afterwards, `git diff` confirmed clean.
})

// ── Block B: declared-list source gate ──────────────────────────────────────

/**
 * The four suites this gate holds to the full containment kit. DECLARED, not
 * derived (this repo's own D-13 precedent, `gameDetailsImportGate.test.ts`) --
 * a `readdirSync`-derived list would silently shrink to fit whatever exists,
 * defeating the anti-vacuity purpose of pinning an exact count below.
 */
const IN_SCOPE_SUITES = [
  'gameDetailsFlows.test.ts',
  'enrichmentFlows.test.ts',
  'sidecarRejectionGuard.test.ts',
  'loggerFlows.test.ts'
]

/**
 * What this gate does NOT cover (verified against the tree at plan
 * execution time, 2026-07-26): every OTHER sidecar suite that also drives
 * `bootstrap.init()` carries the SAME pre-existing env-bypass risk class
 * (`tests-clobbering-real-steam-store`) and is NOT gated here. Recorded as
 * declared debt in this phase's `deferred-items.md`. No reader may take
 * `IN_SCOPE_SUITES` above, or this gate passing, as proof that the whole
 * `src/backend/sidecar/__tests__/` directory is contained.
 */
const KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES = [
  'appShellFlows.test.ts',
  'bootstrapWirings.test.ts',
  'bootstrap.test.ts',
  'downloadQueueFlows.test.ts',
  'electronUntouched.test.ts',
  'onlineMonitorWiring.test.ts',
  'installFlows.test.ts',
  'skeletonFlows.test.ts',
  'settingsFlows.test.ts',
  'rustInvokeChannel.test.ts',
  'steamAuthFlows.test.ts'
]

describe('Block B: declared-list source gate over the four in-scope suites (34.2 gap cycle 2, plan 34.2-18)', () => {
  it('anti-vacuity: the declared list has exactly 4 entries and every file exists', () => {
    expect(IN_SCOPE_SUITES).toHaveLength(4)
    for (const name of IN_SCOPE_SUITES) {
      const filePath = join(__dirname, name)
      expect(existsSync(filePath)).toBe(true)
    }
  })

  it('anti-vacuity: the declared uncovered list has exactly 11 entries and every file exists', () => {
    expect(KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES).toHaveLength(11)
    for (const name of KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES) {
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

  it.each(IN_SCOPE_SUITES)(
    'REQ-34.2-07/-14: %s no longer claims "NO FILESYSTEM WRITES", matched on comment-stripped source',
    (name) => {
      const stripped = stripComments(
        readFileSync(join(__dirname, name), 'utf-8')
      )
      expect(stripped.toUpperCase()).not.toContain('NO FILESYSTEM WRITES')
    }
  )

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
