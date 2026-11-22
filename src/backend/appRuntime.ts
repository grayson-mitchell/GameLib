/**
 * The boot-owned app runtime (66.4-17, D-05).
 *
 * The launch / known-fixes long tail's former module-level state (the backend
 * event bus, the frontend-ready flag, the launch single-flight table,
 * the known-fix overlay install single-flight) lives in per-file `createX()` closures. The CrossOver
 * index fetch layer and lookups were Rust's from 86-19 and left this bundle with the TS module (86-24).
 * This bundle builds one of each, once per boot, in the 'app-runtime' boot step, and consumers reach it through `Pick<AppRuntime, ...>` slices (D-01).
 *
 * Construction only allocates empty maps and an emitter: it does no I/O, arms no timer and adds no
 * listener (sidecar exit contract).
 */
import type { FrontendMessageDeps } from 'backend/host/frontendMessage'
import { createBackendEvents } from './backend_events'
import type { BackendEventBus } from './backend_events'
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
  /** The known-fix overlay install single-flight table. */
  overlayInstalls: KnownFixOverlayInstalls
}

export function createAppRuntime(): AppRuntime {
  return {
    events: createBackendEvents(),
    protocol: createProtocolState(),
    launchFlights: createLaunchFlights(),
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
