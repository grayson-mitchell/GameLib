/**
 * The boot-owned engine runtime (66.4-05, D-05).
 *
 * The engine family's former module-level state (running-games ledger, selection registry, launch
 * overlay contexts, bottle-creation / pinned-download single-flight maps, the CrossOver bin-dir memo) lives in per-file
 * `createX()` closures. This bundle builds one of each, once per boot, in the 'engine-runtime' boot
 * step, and consumers reach it through `Pick<EngineRuntime, ...>` slices (D-01).
 *
 * Construction only allocates empty maps: it does no I/O and arms no timer (sidecar exit contract).
 */
import type { AppPaths } from 'backend/process/context'
import { createBottleLedger } from './bottleLedger'
import type { BottleLedger } from './bottleLedger'
import { createCrossoverLocator } from './crossoverLocation'
import type { CrossoverLocator } from './crossoverLocation'
import { createEngineRegistry } from './engineRegistry'
import type { SelectionStore } from './engineRegistry'
import type { EngineRegistry } from './engineRegistry'
import { createFallbackEngine } from './fallbackEngine'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { FallbackEngine } from './fallbackEngine'
import { createLaunchSettingsRegistry } from './launchSettings'
import type { LaunchSettingsRegistry } from './launchSettings'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createPerGameBottleFlights } from './perGameBottle'
import type { PerGameBottleFlights } from './perGameBottle'

export interface EngineRuntime {
  ledger: BottleLedger
  crossover: CrossoverLocator
  registry: EngineRegistry
  fallback: FallbackEngine
  launchSettings: LaunchSettingsRegistry
  perGameBottle: PerGameBottleFlights
  /** The sidecar -> Rust transport the engine's bottle, ledger and selection shims send through (87-42). */
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
}

export interface EngineRuntimeDeps {
  paths: Pick<AppPaths, 'userHome' | 'toolsPath'>
  /** The boot-owned abort registry the Steam engine download registers in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create' | 'delete'>
  /** The host's sidecar -> Rust transport (D-17): the engine marker's version gate asks Rust. */
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
  /**
   * Where the selections live. The boot passes `engineSelectionView` (87-42, D-24), the write-through mirror of Rust's
   * registry the synchronous bridge reads share; omitted, the runtime gets a private map (tests).
   */
  selections?: SelectionStore
}

export function createEngineRuntime(deps: EngineRuntimeDeps): EngineRuntime {
  const registry = createEngineRegistry(deps.selections)
  return {
    ledger: createBottleLedger(),
    crossover: createCrossoverLocator({
      paths: deps.paths,
      requestRustInvoke: deps.requestRustInvoke
    }),
    registry,
    fallback: createFallbackEngine({ paths: deps.paths, aborts: deps.aborts }),
    launchSettings: createLaunchSettingsRegistry({
      registry,
      paths: deps.paths
    }),
    perGameBottle: createPerGameBottleFlights(),
    requestRustInvoke: deps.requestRustInvoke
  }
}
