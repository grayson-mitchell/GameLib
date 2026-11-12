/**
 * The boot-owned app runtime (66.4-17, D-05).
 *
 * The launch / known-fixes / CrossOver-index long tail's former module-level state (the backend
 * event bus, the frontend-ready flag, the launch single-flight table, the image-fetch dedupe map,
 * the CrossOver index failure backoff and maps memo, the known-fix overlay install single-flight)
 * lives in per-file `createX()` closures. This bundle builds one of each, once per boot, in the
 * 'app-runtime' boot step, and consumers reach it through `Pick<AppRuntime, ...>` slices (D-01).
 *
 * Construction only allocates empty maps and an emitter: it does no I/O, arms no timer and adds no
 * listener (sidecar exit contract). The index failure backoff reads the injected clock.
 */
import type { AppPaths } from 'backend/process/context'
import type { Clock } from 'backend/process/types'
import type { FrontendMessageDeps } from 'backend/host/frontendMessage'
import { createBackendEvents } from './backend_events'
import type { BackendEventBus } from './backend_events'
import { createCrossoverIndexFetcher } from './crossover_index/fetcher'
import type { CrossoverIndexFetcher } from './crossover_index/fetcher'
import { createCrossoverIndex } from './crossover_index'
import type { CrossoverIndexLookups } from './crossover_index'
import { createImageFetches } from './images_cache'
import type { ImageFetches } from './images_cache'
import { createKnownFixOverlayInstalls } from './knownFixOverlayInstall'
import type { KnownFixOverlayInstalls } from './knownFixOverlayInstall'
import { createLaunchFlights } from './launchSingleFlight'
import type { LaunchFlights } from './launchSingleFlight'
import { createProtocolState } from './protocol'
import type { ProtocolState } from './protocol'

export interface AppRuntime {
  /** The typed backend event bus: one emitter per boot. */
  events: BackendEventBus
  /** The renderer-ready flag the protocol handler reads to tell a cold-start link. */
  protocol: ProtocolState
  /** The per `runner:appName` launch single-flight table. */
  launchFlights: LaunchFlights
  /** The image cache and its pending-download dedupe map. */
  imageFetches: ImageFetches
  /** The CrossOver index fetch layer with its per-descriptor failure backoff. */
  crossoverFetcher: CrossoverIndexFetcher
  /** The CrossOver index lookups with their memoized maps. */
  crossoverIndex: CrossoverIndexLookups
  /** The known-fix overlay install single-flight table. */
  overlayInstalls: KnownFixOverlayInstalls
}

export interface AppRuntimeDeps {
  clock: Pick<Clock, 'now'>
  paths: Pick<AppPaths, 'appFolder' | 'publicDir'>
}

export function createAppRuntime(deps: AppRuntimeDeps): AppRuntime {
  const crossoverFetcher = createCrossoverIndexFetcher({
    clock: deps.clock,
    paths: deps.paths
  })
  return {
    events: createBackendEvents(),
    protocol: createProtocolState(),
    launchFlights: createLaunchFlights(),
    imageFetches: createImageFetches({ paths: deps.paths }),
    crossoverFetcher,
    crossoverIndex: createCrossoverIndex({ fetcher: crossoverFetcher }),
    overlayInstalls: createKnownFixOverlayInstalls()
  }
}

/** What a consumer reads from the boot's app runtime: exactly the members it uses (D-01 slice). */
export interface AppRuntimeSlice<K extends keyof AppRuntime> {
  appRuntime: Pick<AppRuntime, K>
}

/**
 * What the game-status and progress helpers (`sendGameStatusUpdate`, `sendProgressUpdate`) need: the
 * renderer push and the boot's event bus. The bus half feeds the install stall watchdog.
 */
export type StatusUpdateDeps = FrontendMessageDeps & AppRuntimeSlice<'events'>
