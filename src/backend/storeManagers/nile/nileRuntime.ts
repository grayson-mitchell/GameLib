/**
 * The Nile (Amazon) per-boot state (D-05, 66.4-11): the login-data single-flight slot and the e2e nile
 * stub slot. Both were module-level state (user.ts, e2eMock.ts); they are now closure fields of the
 * factories below, built once by the 'nile-runtime' boot step and read through ManagerDeps.nileRuntime.
 *
 * Construction allocates no I/O, timer or handle (sidecar exit contract). Light module: no value
 * imports besides the stub factory.
 */
import type { NileLoginData } from 'common/types/nile'
import { createNileStubs, type NileStubs } from './e2eMock'

/**
 * Single-flight around `nile auth --login --non-interactive`. Deliberately NO value cache and NO TTL:
 * `NileLoginData` carries single-use PKCE material (`code_verifier`, `serial`) consumed exactly once
 * by the `authAmazon` exchange, so a settled read must never be replayed.
 */
interface NileLoginFlight {
  /** The in-flight read, if one is running. */
  current(): Promise<NileLoginData> | null
  /**
   * Joins the in-flight read, or starts `start` as that read. The slot clears when it settles, unless
   * a newer read has already replaced it.
   */
  run(start: () => Promise<NileLoginData>): Promise<NileLoginData>
}

function createNileLoginFlight(): NileLoginFlight {
  let inFlight: Promise<NileLoginData> | null = null
  return {
    current: () => inFlight,
    async run(start) {
      if (inFlight) return inFlight
      const started = start()
      inFlight = started
      try {
        return await started
      } finally {
        if (inFlight === started) inFlight = null
      }
    }
  }
}

export interface NileRuntime {
  loginFlight: NileLoginFlight
  stubs: NileStubs
}

export function createNileRuntime(): NileRuntime {
  return {
    loginFlight: createNileLoginFlight(),
    stubs: createNileStubs()
  }
}
