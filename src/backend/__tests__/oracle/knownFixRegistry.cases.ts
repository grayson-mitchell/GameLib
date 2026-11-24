/**
 * The case list of the known-fix registry oracle (88-06, D-11, D-14). Not a test:
 * `knownFixRegistry.oracle.test.ts` builds `cases.json` from this module in write mode and compares the
 * committed file against it in compare mode, so the list the Rust replay (88-09) reads and the list that
 * was recorded cannot drift.
 *
 * A case is an id and a list of steps run in order on one fresh fake HOME. A step first removes paths,
 * then seeds files, then does its `op`:
 *   validate       `validateRegistryFixes(raw)`
 *   dllCompile     `dllOverridesToRegistryFixes(raw)` (and, with `thenValidate`, `validateRegistryFixes` over it)
 *   profileFixes   `knownFixProfileRegistryFixes(profile)`
 *   commandParts   `buildRegistryFixCommandParts(fix, view)`
 *   regIsSet       `wineRegistryValueIsSet(regText, fix, view)`
 *   prefixDir      `knownFixPrefixDir({ paths }, settings)`
 *   timeout        the `REGISTRY_FIX_TIMEOUT_MS` constant
 *   apply          `applyRegistryFixes(raw, ctx, run, prefix)` with a scripted run seam (`outcomes`, one per
 *                  `run` call, in call order); `seam: 'bridge'` hands the seam the options the Steam bridge
 *                  passes (wait false, protonVerb run, skipPrefixCheckIKnowWhatImDoing true)
 *   profileApply   `applyKnownFixProfileRegistry(deps, appName, runner, settings)`; `seam: 'scripted'` answers
 *                  `runWineCommand` from `outcomes`, `seam: 'real'` goes through the real `createCommandRunner`
 *                  over the spawn tracer (`scripted` at case level answers the spawned programs)
 * Seed and remove paths start with a placeholder. The three layers are
 *   local    `<APPFOLDER>/fixes/local`   bundled `<HOME>/public/fixes`   remote `<APPFOLDER>/fixes`
 * and a tier-2 profile is `<id>-<store>.profile.json` in one of them.
 *
 * An `outcome` scripts one `run` call: `code` (default) settles with `{ code }`, `undefined` with nothing,
 * `reject` throws `message`, and `never` does not settle (the case advances a fake clock past the 15 s
 * deadline). `child` makes the seam hand `onSpawn` a child handle whose `kill` is recorded.
 */
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { slug } from 'backend/testUtils/launchOracle/census'
import { fix as layerFile } from './knownFixReader.cases'

export type View = 32 | 64

export interface FixInput {
  key: string
  name: string
  type: 'REG_DWORD' | 'REG_SZ'
  data: string
  views: View[]
}

export interface Outcome {
  result?: 'code' | 'undefined' | 'reject' | 'never'
  code?: number
  message?: string
  child?: { pid: number; exitCode: number | null }
}

export interface ScriptedSpawn {
  program: string
  argv?: string[]
  code?: number
  stdout?: string
  stderr?: string
  repeat?: true
}

type StepBody =
  | { op: 'validate'; raw?: unknown }
  | { op: 'dllCompile'; raw?: unknown; thenValidate?: true }
  | { op: 'profileFixes'; profile: Record<string, unknown> }
  | { op: 'commandParts'; fix: FixInput; view: View }
  | { op: 'regIsSet'; regText: string; fix: FixInput; view: View }
  | { op: 'prefixDir'; settings: Record<string, unknown> }
  | { op: 'timeout' }
  | {
      op: 'apply'
      raw: unknown
      label: string
      logPrefix: 'Backend' | 'Steam'
      seam: 'plain' | 'bridge'
      /** A path with a placeholder, or absent for no prefix directory. */
      prefix?: string
      outcomes: Outcome[]
    }
  | {
      op: 'profileApply'
      appName: string
      runner: Runner
      settings: Record<string, unknown>
      seam: 'scripted' | 'real'
      outcomes?: Outcome[]
      /** What every call after `outcomes` runs out does (default: succeeds with code 0). */
      otherwise?: Outcome
    }

export type Step = StepBody & { seed?: SeedEntry[]; remove?: string[] }

export interface RegistryCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  platform?: 'mac' | 'linux'
  /** Answers for the programs the real command runner spawns (only a `real` profileApply spawns). */
  scripted?: ScriptedSpawn[]
  steps: Step[]
}

// ---------------------------------------------------------------------------------------------
// Shared inputs
// ---------------------------------------------------------------------------------------------

export const CROSSOVER_BIN =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
export const CROSSOVER_SERVER =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineserver'
const BOTTLES = '<HOME>/Library/Application Support/CrossOver/Bottles'

/** `GameSettings` with every field the env builders read, as the wine_command goldens carry them. */
export const settingsOf = (
  wineVersion: Record<string, unknown>,
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  nvidiaPrime: false,
  showFps: false,
  enviromentOptions: [],
  winePrefix: '<HOME>/Games/prefix',
  wineCrossoverBottle: '',
  enableDXVKFpsLimit: false,
  DXVKFpsCap: '60',
  enableFSR: false,
  enableEsync: false,
  enableMsync: false,
  enableFsync: false,
  enableWineWayland: false,
  enableHDR: false,
  enableWoW64: false,
  autoInstallDxvkNvapi: false,
  eacRuntime: false,
  battlEyeRuntime: false,
  verboseLogs: false,
  preferSystemLibs: false,
  advertiseAvxForRosetta: false,
  disableUMU: true,
  wineVersion,
  ...over
})

const crossoverSettings = (bottle = 'GameLibSteam') =>
  settingsOf(
    {
      type: 'crossover',
      name: 'CrossOver - 24.0.0',
      bin: CROSSOVER_BIN,
      wineserver: CROSSOVER_SERVER
    },
    { wineCrossoverBottle: bottle }
  )

const crossoverSeed: SeedEntry[] = [
  { path: CROSSOVER_BIN, text: '' },
  { path: CROSSOVER_SERVER, text: '' }
]

/** A Wine `.reg` header with no section in it: nothing is set. */
const EMPTY_REG =
  'WINE REGISTRY Version 2\n;; All keys relative to REGISTRY\\\\Machine\n\n#arch=win64\n\n'

const ENTRY = {
  key: 'HKCU\\Software\\Foo',
  name: 'Bar',
  type: 'REG_DWORD',
  value: 1
}

/** A tier-2 profile in a layer, for the id and runner the TS test used. */
const profileIn = (
  layer: 'local' | 'bundled' | 'remote',
  body: unknown,
  app = 'GOGAPP',
  runner: Runner = 'gog'
): SeedEntry => layerFile(layer, app, runner, 2, body)

// ---------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------

/** The ids of every case that stands for a test title, to keep `named` honest. */
export const named = (
  prefix: string,
  title: string,
  steps: Step[],
  more: Partial<RegistryCase> = {}
): RegistryCase => ({
  id: `knownFixesRegistry--${slug(`${prefix}${title}`)}`,
  title: `${prefix}${title}`,
  steps,
  ...more
})

export function buildCases(): RegistryCase[] {
  return [
    // The tracer: a profile registry fix and a dllOverrides entry applied through the real command runner
    // on the spawn tracer, so the recording runs from the tier-2 file to the wine spawn.
    {
      id: 'launcher-path-crossover-registry-and-dll-override',
      platform: 'mac',
      scripted: [{ program: CROSSOVER_BIN, code: 0, repeat: true }],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: crossoverSettings(),
          seam: 'real',
          seed: [
            ...crossoverSeed,
            profileIn('bundled', {
              title: 't',
              registry: [ENTRY],
              dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]
            }),
            { path: `${BOTTLES}/GameLibSteam/system.reg`, text: EMPTY_REG },
            { path: `${BOTTLES}/GameLibSteam/user.reg`, text: EMPTY_REG }
          ]
        }
      ]
    }
  ]
}
