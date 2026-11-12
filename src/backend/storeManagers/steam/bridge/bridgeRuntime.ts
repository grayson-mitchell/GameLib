/**
 * The boot-owned Steam bridge runtime (66.4-08, D-05).
 *
 * The bridge's single-flight clone maps, the entitlement plist counter and the shared-redist install
 * map plus ledger tmp sequence live in per-file `createX()` closures. This bundle builds one of each,
 * once per boot, in the 'steam-bridge-runtime' boot step; consumers reach it through `Pick<>` slices
 * on ManagerDeps (D-01).
 *
 * Construction only allocates empty maps and counters: no I/O, no timer, no handle (sidecar exit
 * contract).
 */
import type { StoreVersioning } from 'backend/storeVersioning/engine'
import { createRunnerCloneFlights } from './drm/runnerClone'
import type { RunnerCloneFlights } from './drm/runnerClone'
import { createRunnerEntitlementSigner } from './drm/runnerEntitlements'
import type { RunnerEntitlementSigner } from './drm/runnerEntitlements'
import { createOverlayRunnerCloneFlights } from './overlay/overlayRunnerClone'
import type { OverlayRunnerCloneFlights } from './overlay/overlayRunnerClone'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { createSharedRedistInstaller } from './sharedRedistInstall'
import type { SharedRedistInstaller } from './sharedRedistInstall'

export interface BridgeRuntime {
  signer: RunnerEntitlementSigner
  runnerClone: RunnerCloneFlights
  overlayRunnerClone: OverlayRunnerCloneFlights
  sharedRedist: SharedRedistInstaller
}

export function createBridgeRuntime(deps: {
  /** The boot-owned abort registry the runner clones register in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create' | 'delete'>
  /** The boot's store-versioning engine: the shared-redist ledger is migrated through it. */
  versioning: StoreVersioning
}): BridgeRuntime {
  const signer = createRunnerEntitlementSigner()
  return {
    signer,
    runnerClone: createRunnerCloneFlights({ signer, aborts: deps.aborts }),
    overlayRunnerClone: createOverlayRunnerCloneFlights({
      signer,
      aborts: deps.aborts
    }),
    sharedRedist: createSharedRedistInstaller({ versioning: deps.versioning })
  }
}
