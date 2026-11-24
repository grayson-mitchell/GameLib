/**
 * The known-fix registry oracle (88-06, D-11, D-14, D-25): `validateRegistryFixes`,
 * `dllOverridesToRegistryFixes`, `knownFixProfileRegistryFixes`, `buildRegistryFixCommandParts`,
 * `wineRegistryValueIsSet`, `knownFixPrefixDir`, `applyRegistryFixes` and `applyKnownFixProfileRegistry`,
 * driven on a fresh fake HOME and recorded as the golden the Rust registry fixes (88-09) have to
 * reproduce. The golden exists before any Rust for it does.
 *
 * Slice `gamelib-knownfix/tests/fixtures/golden/registry/`:
 *   cases.json      built in `knownFixRegistry.cases.ts` (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19)
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what each step answered (paths normalised)
 *   expected/<case>/events.json   every `logWarning` / `logInfo` line the module made, with its prefix
 *   expected/<case>/calls.json    the seams in call order: each `reg add` the run seam received with the
 *                                 options it carried, each child kill, and (real runner) the options the
 *                                 command runner gave the process runner
 *   expected/<case>/spawns.json   (real runner only) every wine spawn: program, argv, FULL env, cwd, with the
 *                                 spawn class from `golden/classes.json` attached
 *   expected/<case>/tree.json     (real runner only) the fake HOME afterwards
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Every case runs on a fresh fake HOME with `withPinnedBaseEnv` and an injected platform; nothing reads the
 * real HOME and no wine binary is executed (the spawn tracer answers from a script). The tracer's base env is
 * empty, so `env` in a spawn is the whole environment the game's `reg add` was given. Goldens are recorded on
 * a POSIX host.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  attachSpawnClass,
  loadClasses,
  type SpawnClass
} from 'backend/testUtils/launchOracle/spawnClass'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import { createCommandRunner } from 'backend/commandRunner'
import {
  setupEnvVars,
  setupWineEnvVars,
  verifyWinePrefix
} from 'backend/launcher'
import { isUmuSupported, getUmuPath } from 'backend/utils/compatibility_layers'
import {
  applyKnownFixProfileRegistry,
  applyRegistryFixes,
  buildRegistryFixCommandParts,
  dllOverridesToRegistryFixes,
  knownFixPrefixDir,
  knownFixProfileRegistryFixes,
  REGISTRY_FIX_TIMEOUT_MS,
  validateRegistryFixes,
  wineRegistryValueIsSet,
  type ValidRegistryFix
} from 'backend/knownFixesRegistry'
import type {
  GameSettings,
  WineCommandArgs,
  WineInstallation
} from 'common/types'
import type { ChildHandle } from 'backend/process/types'
import {
  dropRealpathPrefix,
  json,
  spyLogs,
  withFakeClock,
  type LogLine
} from './oracleCommon'
import {
  buildCases,
  type Outcome,
  type RegistryCase,
  type Step
} from './knownFixRegistry.cases'

const CRATE = 'gamelib-knownfix'
const SLICE = 'registry'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const REGISTRY_FLOOR = 1
/** The call site of every `reg add` a profile registry fix spawns; its class is in `golden/classes.json`. */
const REG_ADD_SITE = 'knownfix.registry.reg_add'

const mode = engineWineOracleMode()

/**
 * `validWine` for the wine types a registry case uses: the binary (and, for plain wine, the wineserver)
 * has to exist. The launcher's own function is a shim over the Rust `wine_valid` since Phase 87, so the
 * recorded cases are driven through this body, as the wine command oracle does.
 */
function validWine(wineVersion: WineInstallation): Promise<boolean> {
  if (!wineVersion) return Promise.resolve(false)
  const { bin, wineserver, type } = wineVersion
  const necessary = type === 'wine' ? [bin, wineserver] : [bin]
  return Promise.resolve(necessary.every((b) => existsSync(b as string)))
}

const oracleRustInvoke = (
  _channel: string,
  args: unknown[]
): Promise<unknown> => validWine(args[0] as WineInstallation)

/** Expands every placeholder in every string of a JSON-shaped value onto the profile. */
function expandDeep<T>(value: T, profile: EngineOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return expandPlaceholders(node, profile)
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

interface CallLine {
  step: number
  kind: 'runWineCommand' | 'run' | 'kill' | 'runner.run'
  [field: string]: unknown
}

const fakeChild = (
  spec: { pid: number; exitCode: number | null },
  calls: CallLine[],
  step: () => number
): ChildHandle => ({
  pid: spec.pid,
  exitCode: spec.exitCode,
  signalCode: null,
  kill: (signal?: NodeJS.Signals | number) => {
    calls.push({
      step: step(),
      kind: 'kill',
      pid: spec.pid,
      signal: signal ?? null
    })
    return true
  }
})

async function recordCase(
  c: RegistryCase,
  classes: Readonly<Record<string, SpawnClass>>
): Promise<{
  result: unknown
  events: LogLine[]
  calls: CallLine[]
  spawns: unknown[] | undefined
  tree: unknown[] | undefined
}> {
  return withEngineOracleProfile(async (profile) => {
    const deps = {
      paths: {
        ...profile.paths,
        bundledFixesPath: join(profile.home, 'public', 'fixes')
      }
    }
    const events: LogLine[] = []
    const calls: CallLine[] = []
    let step = 0
    const stepOf = () => step
    const flags = { never: false }

    const usesRealRunner = c.steps.some(
      (s) => s.op === 'profileApply' && s.seam === 'real'
    )
    const tracer = usesRealRunner
      ? createSpawnTracer({
          // An empty base: a spawn's `set` is its whole environment.
          baseEnv: {},
          scripted: (c.scripted ?? []).map((s) => ({
            ...s,
            program: expandPlaceholders(s.program, profile),
            argv: s.argv?.map((a) => expandPlaceholders(a, profile))
          }))
        })
      : null

    /** The settings the step under way runs with: the real runner's `getDefaultSettings` answers them. */
    let currentSettings: GameSettings | null = null

    // The real verifyWinePrefix calls back into the runner it is part of.
    const self: { runner?: ReturnType<typeof createCommandRunner> } = {}
    const realRunner = tracer
      ? createCommandRunner({
          runner: {
            ...tracer.runner,
            run: (program, argv, opts) => {
              calls.push({
                step,
                kind: 'runner.run',
                program,
                replaceEnv: opts?.replaceEnv ?? null,
                track: opts?.track ?? null,
                resolveOn: opts?.resolveOn ?? null,
                timeoutNone: opts?.timeout?.none === true,
                windowsHide: opts?.windowsHide ?? null,
                cwd: opts?.cwd ?? null
              })
              return tracer.runner.run(program, argv, opts)
            }
          },
          platform: c.platform === 'linux' ? 'linux' : 'darwin',
          logger: {
            logInfo: ((m: unknown) => {
              events.push({
                step,
                level: 'info',
                prefix: 'commandRunner',
                text: String(m)
              })
            }) as never,
            logWarning: ((m: unknown) => {
              events.push({
                step,
                level: 'warning',
                prefix: 'commandRunner',
                text: String(m)
              })
            }) as never,
            logError: (() => undefined) as never,
            logDebug: () => undefined,
            backendPrefix: 'Backend' as never
          },
          getRunnerLogWriter: () => {
            throw new Error('not used by runWineCommand')
          },
          abort: {
            create: () => new AbortController(),
            remove: () => undefined
          },
          errorHandler: () => undefined,
          searchForExecutableOnPath: () => Promise.resolve(null),
          commandToArgsArray: () => [],
          wine: {
            getDefaultSettings: () => currentSettings as GameSettings,
            verifyWinePrefix: (s) =>
              verifyWinePrefix(
                {
                  commandRunner: {
                    runWineCommand: (a) => self.runner!.runWineCommand(a)
                  },
                  paths: profile.paths,
                  requestRustInvoke: oracleRustInvoke as never
                },
                s
              ),
            validWine,
            setupEnvVars,
            setupWineEnvVars: (s, gameId) =>
              setupWineEnvVars({ paths: profile.paths }, s, gameId),
            isUmuSupported: (s) => isUmuSupported({ paths: profile.paths }, s),
            getUmuPath: () => getUmuPath({ paths: profile.paths })
          }
        })
      : null
    self.runner = realRunner ?? undefined

    /** One scripted `run` call: what it records and how it settles. */
    const settle = (
      outcome: Outcome | undefined,
      onSpawn: ((child: ChildHandle) => void) | undefined
    ): Promise<
      { stdout: string; stderr: string; code?: number } | undefined
    > => {
      const o = outcome ?? {}
      if (o.child && onSpawn) onSpawn(fakeChild(o.child, calls, stepOf))
      switch (o.result ?? 'code') {
        case 'undefined':
          return Promise.resolve(undefined)
        case 'reject':
          return Promise.reject(new Error(o.message ?? 'rejected'))
        case 'never':
          flags.never = true
          return new Promise<never>(() => undefined)
        default:
          return Promise.resolve({
            stdout: '',
            stderr: '',
            code: o.code ?? 0
          })
      }
    }

    const recordWine = (args: WineCommandArgs, settings: GameSettings) => {
      calls.push({
        step,
        kind: 'runWineCommand',
        commandParts: [...args.commandParts],
        wait: args.wait,
        protonVerb: args.protonVerb ?? null,
        skipPrefixCheckIKnowWhatImDoing:
          args.skipPrefixCheckIKnowWhatImDoing ?? null,
        hasOnSpawn: typeof args.onSpawn === 'function',
        gameSettingsIsTheCallers: args.gameSettings === settings,
        winePrefix: args.gameSettings?.winePrefix ?? null
      })
    }

    const run = async (s: Step): Promise<unknown> => {
      switch (s.op) {
        case 'validate': {
          const ctx = { label: 'gog 123', logPrefix: 'Backend' as never }
          return {
            op: s.op,
            raw: s.raw ?? null,
            result: validateRegistryFixes(s.raw, ctx)
          }
        }
        case 'dllCompile': {
          const ctx = { label: 'gog 123', logPrefix: 'Backend' as never }
          const compiled = dllOverridesToRegistryFixes(s.raw, ctx)
          return {
            op: s.op,
            raw: s.raw ?? null,
            compiled,
            ...(s.thenValidate
              ? { validated: validateRegistryFixes(compiled, ctx) }
              : {})
          }
        }
        case 'profileFixes': {
          const ctx = { label: 'gog 123', logPrefix: 'Backend' as never }
          const got = knownFixProfileRegistryFixes(s.profile as never, ctx)
          return {
            op: s.op,
            profile: s.profile,
            result: got ?? null,
            isUndefined: got === undefined,
            isTheProfileRegistry: got === s.profile.registry
          }
        }
        case 'commandParts':
          return {
            op: s.op,
            fix: s.fix,
            view: s.view,
            parts: buildRegistryFixCommandParts(
              s.fix as ValidRegistryFix,
              s.view
            )
          }
        case 'regIsSet':
          return {
            op: s.op,
            fix: s.fix,
            view: s.view,
            isSet: wineRegistryValueIsSet(
              s.regText,
              s.fix as ValidRegistryFix,
              s.view
            )
          }
        case 'prefixDir': {
          const settings = expandDeep(
            s.settings,
            profile
          ) as unknown as GameSettings
          return {
            op: s.op,
            settings: s.settings,
            dir: knownFixPrefixDir(deps, settings) ?? null
          }
        }
        case 'timeout':
          return { op: s.op, ms: REGISTRY_FIX_TIMEOUT_MS }
        case 'apply': {
          const outcomes = [...s.outcomes]
          const prefixDir = s.prefix
            ? expandPlaceholders(s.prefix, profile)
            : undefined
          const settings = {
            winePrefix: prefixDir ?? null
          } as unknown as GameSettings
          const runSeam = (
            commandParts: string[],
            onSpawn: (child: ChildHandle) => void
          ) => {
            if (s.seam === 'bridge') {
              const args: WineCommandArgs = {
                commandParts,
                gameSettings: settings,
                wait: false,
                protonVerb: 'run',
                skipPrefixCheckIKnowWhatImDoing: true,
                onSpawn
              }
              recordWine(args, settings)
            } else {
              calls.push({ step, kind: 'run', commandParts: [...commandParts] })
            }
            return settle(outcomes.shift(), onSpawn)
          }
          const apply = () =>
            applyRegistryFixes(
              s.raw,
              { label: s.label, logPrefix: s.logPrefix as never },
              runSeam,
              prefixDir
            )
          const clock = s.outcomes.some((o) => o.result === 'never')
          if (clock) {
            await withFakeClock(apply, () => {
              if (!flags.never) return null
              flags.never = false
              return REGISTRY_FIX_TIMEOUT_MS
            })
          } else {
            await apply()
          }
          return {
            op: s.op,
            raw: s.raw,
            label: s.label,
            logPrefix: s.logPrefix,
            seam: s.seam,
            prefix: s.prefix ?? null,
            settled: true,
            outcomesLeft: outcomes.length
          }
        }
        case 'profileApply': {
          const settings = expandDeep(
            s.settings,
            profile
          ) as unknown as GameSettings
          currentSettings = settings
          const outcomes = [...(s.outcomes ?? [])]
          const inner =
            s.seam === 'real' && realRunner
              ? realRunner
              : {
                  runWineCommand: (a: WineCommandArgs) =>
                    settle(
                      outcomes.length ? outcomes.shift() : s.otherwise,
                      a.onSpawn
                    )
                }
          const commandRunner = {
            runWineCommand: (a: WineCommandArgs) => {
              recordWine(a, settings)
              return (
                inner as {
                  runWineCommand: (a: WineCommandArgs) => Promise<unknown>
                }
              ).runWineCommand(a)
            }
          }
          const apply = () =>
            applyKnownFixProfileRegistry(
              { commandRunner: commandRunner as never, paths: deps.paths },
              s.appName,
              s.runner,
              settings
            )
          const clock = [...(s.outcomes ?? []), s.otherwise ?? {}].some(
            (o) => o.result === 'never'
          )
          if (clock) {
            await withFakeClock(apply, () => {
              if (!flags.never) return null
              flags.never = false
              return REGISTRY_FIX_TIMEOUT_MS
            })
          } else {
            await apply()
          }
          return {
            op: s.op,
            appName: s.appName,
            runner: s.runner,
            seam: s.seam,
            settled: true
          }
        }
      }
    }

    const results: unknown[] = []
    const restoreLogs = spyLogs(events, stepOf, ['info', 'warning'])
    await withInjected([injectPlatform(c.platform ?? 'mac'), restoreLogs], () =>
      withPinnedBaseEnv(profile.fake, async () => {
        for (const [index, s] of c.steps.entries()) {
          step = index
          for (const path of s.remove ?? []) {
            rmSync(expandPlaceholders(path, profile), {
              recursive: true,
              force: true
            })
          }
          if (s.seed) seedProfile(profile, s.seed)
          results.push(await run(s))
        }
      })
    )

    const spawns = tracer
      ? attachSpawnClass(
          tracer.records.map((r) => {
            if (!r.argv.includes('reg') || !r.argv.includes('add')) {
              throw new Error(
                `registry oracle: a spawn that is not a reg add (${r.program} ${r.argv.join(' ')}) has no call site`
              )
            }
            return {
              callSite: REG_ADD_SITE,
              program: r.program,
              argv: r.argv,
              env: r.envDiff.set,
              unsetEnv: r.envDiff.unset,
              cwd: r.cwd,
              stdin: r.stdin,
              via: r.via,
              result: r.result
            }
          }),
          classes
        )
      : undefined
    return {
      result: dropRealpathPrefix(normalisePaths({ steps: results }, profile)),
      events: dropRealpathPrefix(normalisePaths(events, profile)),
      calls: dropRealpathPrefix(normalisePaths(calls, profile)),
      spawns: spawns
        ? dropRealpathPrefix(normalisePaths(spawns, profile))
        : undefined,
      tree: usesRealRunner
        ? dropRealpathPrefix(
            normalisePaths(snapshotTree(profile.home), profile)
          )
        : undefined
    }
  })
}

describeSkipOnWindows('known-fix registry oracle (88-06)', () => {
  const built = buildCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
  }
  const cases = loadCases<RegistryCase>(CRATE, SLICE)
  const classes = loadClasses(CRATE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('classes.json gives the reg add call site the helper class', () => {
    expect(classes[REG_ADD_SITE]).toBe('helper')
  })

  it.each(cases)('$id', async (c) => {
    const { result, events, calls, spawns, tree } = await recordCase(c, classes)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result,
      events,
      extra: { 'calls.json': calls },
      ...(spawns ? { spawns } : {}),
      ...(tree ? { after: tree } : {})
    })
  })

  it('every title of knownFixesRegistry.test.ts is a named case, one for one', () => {
    const ids = cases
      .filter((c) => c.id.startsWith('knownFixesRegistry--'))
      .map((c) => c.id.slice('knownFixesRegistry--'.length))
    const titles = tsTestTitles(
      join(__dirname, '..', 'knownFixesRegistry.test.ts')
    )
    assertCasesCoverTitles(ids, titles, {})
    expect([...ids].sort()).toEqual(titles.map(slug).sort())
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, REGISTRY_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, REGISTRY_FLOOR)
  })
})
