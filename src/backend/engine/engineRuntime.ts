/**
 * The boot-owned engine runtime (66.4-05, D-05).
 *
 * The engine family's former module-level state (running-games ledger, selection registry, launch
 * overlay contexts, launch deadlines, switch / bottle-creation / pinned-download single-flight maps,
 * the CrossOver bin-dir memo, the per-launch bookkeeping of launchEngine) lives in per-file
 * `createX()` closures. This bundle builds one of each, once per boot, in the 'engine-runtime' boot
 * step, and consumers reach it through `Pick<EngineRuntime, ...>` slices (D-01).
 *
 * Construction only allocates empty maps: it does no I/O and arms no timer (sidecar exit contract).
 * Launch deadlines run on the injected clock, whose timers are unref'd by default.
 */
import type { AppPaths } from 'backend/process/context'
import type { Clock } from 'backend/process/types'
import { createBottleLedger } from './bottleLedger'
import type { BottleLedger } from './bottleLedger'
import { createCrossoverLocator } from './crossoverLocation'
import type { CrossoverLocator } from './crossoverLocation'
import { createEngineRegistry } from './engineRegistry'
import type { EngineRegistry } from './engineRegistry'
import { createEngineSwitcher } from './engineSwitch'
import type { EngineSwitcher } from './engineSwitch'
import { createFallbackEngine } from './fallbackEngine'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { FallbackEngine } from './fallbackEngine'
import { createLaunchDeadlines } from './launchDeadline'
import type { LaunchDeadlines } from './launchDeadline'
import { createLaunchEngineState } from './launchEngine'
import type { LaunchEngineState } from './launchEngine'
import { createLaunchSettingsRegistry } from './launchSettings'
import type { LaunchSettingsRegistry } from './launchSettings'
import { createPerGameBottleFlights } from './perGameBottle'
import type { PerGameBottleFlights } from './perGameBottle'

export interface EngineRuntime {
  ledger: BottleLedger
  crossover: CrossoverLocator
  registry: EngineRegistry
  switcher: EngineSwitcher
  fallback: FallbackEngine
  deadlines: LaunchDeadlines
  launchState: LaunchEngineState
  launchSettings: LaunchSettingsRegistry
  perGameBottle: PerGameBottleFlights
}

export interface EngineRuntimeDeps {
  clock: Clock
  paths: Pick<AppPaths, 'userHome' | 'toolsPath'>
  /** The boot-owned abort registry the Steam engine download registers in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create' | 'delete'>
}

export function createEngineRuntime(deps: EngineRuntimeDeps): EngineRuntime {
  const registry = createEngineRegistry()
  return {
    ledger: createBottleLedger(),
    crossover: createCrossoverLocator({ paths: deps.paths }),
    registry,
    switcher: createEngineSwitcher(),
    fallback: createFallbackEngine({ paths: deps.paths, aborts: deps.aborts }),
    deadlines: createLaunchDeadlines({ clock: deps.clock }),
    launchState: createLaunchEngineState(),
    launchSettings: createLaunchSettingsRegistry({
      registry,
      paths: deps.paths
    }),
    perGameBottle: createPerGameBottleFlights()
  }
}
