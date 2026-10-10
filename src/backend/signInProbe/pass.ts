/**
 * Phase 49 (49-08, R3): the one bounded boot probe pass.
 *
 * Five probes (Epic, GOG, Amazon, Humble, Steam) run in PARALLEL inside one
 * window of `SIGN_IN_PROBE_BOUND_MS` (D-02). The pass starts AFTER the
 * `READY_SENTINEL` write and only once the sidecar is online (R3, SPEC "READY
 * first"), and re-runs only on a later non-online -> online edge (D-03). It is
 * single-flight: a transition during a running pass queues at most one re-run,
 * so passes never overlap (RESEARCH Pitfall 7). It runs nothing on sign-in, a
 * Steam trigger, Library mount, navigation or a timer, and no renderer channel
 * can start one (P3, T-49-23).
 *
 * Writes go ONLY through `applySignInVerdict` (49-04), an outcome is recorded
 * only when that verdict was not `stale`, and the outcome map is published
 * immediately after that store's own recorded outcome -- not batched to the
 * end of the pass (D-08, revised 2026-10-10: a mid-session `cleared` verdict
 * on a fast store must not wait on a slower sibling probe in the same pass;
 * see `.planning/debug/resolved/stale-signin-row-remount.md`). A `stale` or
 * errored verdict records nothing, so it publishes nothing. This module never
 * touches AppSettings (D-10, T-49-25).
 *
 * D-01: the bound is exactly Rust's `KEYRING_READ_TIMEOUT`
 * (`src-tauri/src/main.rs:3079`), the floor REQ-34.4.1-GAP-11 names. The
 * sidecar's own 60 s `RUST_INVOKE_TIMEOUT_MS` is the CEILING for a keyring
 * invoke, not the bound. A probe that has not resolved at the bound yields
 * `unknown`, which never writes (P1): a timeout is not evidence of a signed-out
 * store.
 *
 * D-04: one code path on every platform and build. This module reads no env var
 * except the `JEST_WORKER_ID` test-worker guard and branches on neither the
 * platform nor `NODE_ENV`. The dev-build Keychain prompts belong to
 * `GAMELIB_DEV_SECRET_VAULT=1`, not to this module.
 *
 * D-20: `meta/sidecarStartupSmoke.cjs` (30 s) measures a COLD profile, where
 * nothing is logged in and nothing is probed. On a warm local profile a run can
 * exceed 30 s only because a bounded probe is still draining toward its 45 s
 * abort. That is not fixed by shortening the bound.
 *
 * Sidecar exit contract -- every handle the pass creates, and what bounds it:
 *   - first-run `setImmediate` (only if already online): `.unref?.()` at
 *     creation, fires once.
 *   - per-probe bound timer: `.unref?.()` at creation, `clearTimeout` in
 *     `finally`.
 *   - runner child (`legendary status`, `gogdl auth`, `nile list-updates`):
 *     `callRunner` does not `unref()` it, so it is in-flight work and is
 *     bounded here: at the bound the pass calls
 *     `callAbortController(SIGN_IN_PROBE_ABORT_IDS[store])`.
 *   - `keyring_get` invoke (Steam, Humble): rides the sidecar RPC timer, which
 *     is already `unref()`'d; bounded by Rust's 45 s and the 60 s invoke
 *     ceiling, and the pass resolves `unknown` at the bound.
 *   - Humble `getGamekeys` HTTP request: bounded by `REQUEST_TIMEOUT_MS`.
 *   - connectivity listener: an `EventEmitter` listener holds no libuv handle.
 * There is no `setInterval` and no re-run timer; exit stays by event-loop drain
 * at stdin EOF.
 *
 * Logging carries store ids, outcome labels and elapsed milliseconds only --
 * never a token, cookie, captured runner output or error text (T-49-24).
 */
import { logInfo, LogPrefix } from 'backend/logger'
import { isOnline, onConnectivityChange } from 'backend/online_monitor'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { LegendaryUser } from 'backend/storeManagers/legendary/user'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { NileUser } from 'backend/storeManagers/nile/user'
import { HumbleUser } from 'backend/humble/user'
import { SteamUser } from 'backend/storeManagers/steam/user'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { SIGN_IN_STORES } from 'common/signInState'
import {
  recordSignInProbeOutcome,
  publishSignInProbeOutcomes
} from './outcomes'
import {
  probeGogSession,
  probeLegendarySession,
  probeNileSession,
  SIGN_IN_PROBE_ABORT_IDS
} from './runnerProbes'
import { captureSignInEpoch } from './sessionEpoch'
import { applySignInVerdict } from './verdict'
import type { SignInVerdictResult } from './verdict'

/**
 * The single bound for every store's probe. Exactly Rust's
 * `KEYRING_READ_TIMEOUT` (`src-tauri/src/main.rs:3079`): the floor
 * REQ-34.4.1-GAP-11 names. The sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS` is the
 * ceiling for a keyring invoke, not the bound.
 */
export const SIGN_IN_PROBE_BOUND_MS = 45_000

export interface SignInProbeRegistration {
  /** The store's own logged-in flag; a store that is not logged in is not probed. */
  isLoggedIn: () => boolean
  probe: () => Promise<SignInProbeOutcome>
  /** Set for spawn-based probes: aborted at the bound so the child cannot outlive it. */
  abortId?: string
}

export interface SignInProbePassDeps {
  registrations: Record<SignInStore, SignInProbeRegistration>
}

function defaultDeps(): SignInProbePassDeps {
  return {
    registrations: {
      legendary: {
        isLoggedIn: () => Boolean(LegendaryUser.isLoggedIn()),
        probe: probeLegendarySession,
        abortId: SIGN_IN_PROBE_ABORT_IDS.legendary
      },
      gog: {
        isLoggedIn: () => Boolean(GOGUser.isLoggedIn()),
        probe: probeGogSession,
        abortId: SIGN_IN_PROBE_ABORT_IDS.gog
      },
      nile: {
        isLoggedIn: () => Boolean(NileUser.isLoggedIn()),
        probe: probeNileSession,
        abortId: SIGN_IN_PROBE_ABORT_IDS.nile
      },
      // D-15: the Humble read carries `trigger=boot-probe` through `readSecret`.
      humble: {
        isLoggedIn: () => Boolean(HumbleUser.isLoggedIn()),
        probe: () => HumbleUser.probeSession('boot-probe')
      },
      // D-14, D-21: credential presence only -- never opens the Steam CM.
      steam: {
        isLoggedIn: () => Boolean(SteamUser.isLoggedIn()),
        probe: () => SteamUser.probeCredentialPresence()
      }
    }
  }
}

/**
 * Races `run` against the bound. Returns `unknown` when `run` rejects, throws,
 * or has not settled by the bound, and ALSO when it settled at or after the
 * bound: the boundary is decided by elapsed time, not by which side of the race
 * happened to win (RESEARCH Pattern 3), so a probe resolving exactly at the
 * bound is `unknown` on every scheduler.
 *
 * `onBound` runs once, only if the bound timer fires first. The timer is
 * `unref()`'d at creation and cleared in `finally`.
 */
export async function boundedSignInProbe(
  run: () => Promise<SignInProbeOutcome>,
  onBound: () => void
): Promise<SignInProbeOutcome> {
  const startedAt = Date.now()
  let boundTimer: ReturnType<typeof setTimeout> | undefined
  let boundFired = false

  const bound = new Promise<SignInProbeOutcome>((resolve) => {
    boundTimer = setTimeout(() => {
      boundFired = true
      try {
        onBound()
      } catch {
        // Aborting is best-effort; the bound still resolves `unknown`.
      }
      resolve('unknown')
    }, SIGN_IN_PROBE_BOUND_MS)
    boundTimer.unref?.()
  })

  let settledAfterMs = 0
  const settled = (async (): Promise<SignInProbeOutcome> => {
    try {
      return await run()
    } catch {
      return 'unknown'
    } finally {
      settledAfterMs = Date.now() - startedAt
    }
  })()

  try {
    const outcome = await Promise.race([settled, bound])
    if (boundFired || settledAfterMs >= SIGN_IN_PROBE_BOUND_MS) {
      return 'unknown'
    }
    return outcome
  } finally {
    clearTimeout(boundTimer)
  }
}

function loggedInStores(deps: SignInProbePassDeps): SignInStore[] {
  return SIGN_IN_STORES.filter((store) => {
    try {
      return deps.registrations[store].isLoggedIn()
    } catch {
      return false
    }
  })
}

/**
 * One pass: probe every logged-in store in parallel; each store applies,
 * records and publishes its own outcome the instant it is known, so a fast
 * store's verdict reaches the renderer without waiting on a slower sibling.
 */
export async function runSignInProbePass(
  deps: SignInProbePassDeps = defaultDeps()
): Promise<void> {
  const stores = loggedInStores(deps)
  logInfo(
    `[signInProbe] pass started stores=${stores.join(',')}`,
    LogPrefix.Backend
  )

  const labels = await Promise.all(
    stores.map(async (store) => {
      const registration = deps.registrations[store]
      // Captured before the probe starts: a sign-in that completes while it is
      // in flight moves the epoch and the verdict is refused (T-49-10).
      const epoch = captureSignInEpoch(store)
      const startedAt = Date.now()

      const outcome = await boundedSignInProbe(registration.probe, () => {
        logInfo(`[signInProbe] ${store} bound reached`, LogPrefix.Backend)
        if (registration.abortId) {
          callAbortController(registration.abortId)
        }
      })
      logInfo(
        `[signInProbe] ${store} outcome=${outcome} elapsed=${Date.now() - startedAt}ms`,
        LogPrefix.Backend
      )

      let result: SignInVerdictResult
      try {
        result = applySignInVerdict(store, outcome, epoch)
      } catch {
        // A failed store write must not fail the pass; nothing is recorded.
        return `${store}:error`
      }
      if (result === 'stale') {
        return `${store}:stale`
      }
      recordSignInProbeOutcome(store, outcome)
      // Publish per-store, immediately: a fast store's own verdict must reach
      // the renderer without waiting for slower siblings in the same pass
      // (F-49-R1-2 -- a stale Library sign-in row persisted ~70s behind a
      // once-per-pass publish gated on the slowest probe).
      publishSignInProbeOutcomes()
      return `${store}:${outcome}`
    })
  )

  logInfo(
    `[signInProbe] pass complete outcomes=${labels.join(',')}`,
    LogPrefix.Backend
  )
}

let passInFlight = false
let rerunPending = false
let started = false
let lastStatus: string | undefined
let configuredDeps: SignInProbePassDeps | undefined

/**
 * Single-flight request. While a pass is in flight this only sets a flag; the
 * pass runs once more when it settles, however many requests arrived.
 */
export function requestSignInProbePass(
  deps: SignInProbePassDeps | undefined = configuredDeps
): void {
  if (passInFlight) {
    rerunPending = true
    return
  }
  passInFlight = true
  void runSignInProbePass(deps)
    .catch(() => {
      // Never reject out of a fire-and-forget pass; per-probe failures are
      // already `unknown`.
    })
    .finally(() => {
      passInFlight = false
      if (rerunPending) {
        rerunPending = false
        requestSignInProbePass(deps)
      }
    })
}

/**
 * Registration only: one connectivity listener and, if already online, one
 * `unref()`'d immediate. Called once from `init()` after the READY write.
 *
 * Under jest it does nothing unless `allowInTestWorker` is set, because many
 * suites call `init()` with logged-in fixtures and must never run real probes
 * (the Block C precedent).
 */
export function startSignInProbePass(
  options: { allowInTestWorker?: boolean; deps?: SignInProbePassDeps } = {}
): void {
  if (process.env.JEST_WORKER_ID !== undefined && !options.allowInTestWorker) {
    return
  }
  if (started) {
    return
  }
  started = true
  configuredDeps = options.deps
  lastStatus = isOnline() ? 'online' : 'offline'

  // D-03: only a non-online -> online EDGE starts a pass. A repeated `online`
  // is not an edge (RESEARCH Pitfall 7).
  onConnectivityChange((status) => {
    const edge = status === 'online' && lastStatus !== 'online'
    lastStatus = status
    if (edge) {
      requestSignInProbePass()
    }
  })

  if (isOnline()) {
    setImmediate(() => requestSignInProbePass()).unref?.()
  }
}

export function __resetSignInProbePassForTests(): void {
  passInFlight = false
  rerunPending = false
  started = false
  lastStatus = undefined
  configuredDeps = undefined
}
