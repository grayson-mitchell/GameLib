import type { Status } from 'common/types'
import useLibraryState from './libraryState'

type SleepAssertionKind = 'display' | 'system' | null

/**
 * Which OS sleep-assertion KIND (if any) a given operation `Status` should block, answered
 * SEPARATELY from "is an operation pending at all?" (Phase 35 gap-closure 35-27, REQ-35-20,
 * closes `D-35-08-02` / live-gate criterion 16).
 *
 * Before this, `componentDidUpdate`'s single `allowedPendingOps` array answered both questions
 * with one membership test, and `'launching'`/`'playing'` sat in the SAME list as every
 * download-shaped status. That meant a running game (kind: display) kept `pendingOps` above
 * zero even after a download (kind: system) had finished, and `window.api.unlock()` — gated on
 * `pendingOps === 0` — never released the download's own `'prevent-app-suspension'` assertion
 * until the game itself quit. Measured on the packaged gate: 108s of the download's assertion
 * surviving past the download that named it.
 *
 * This function is exhaustive over `Status` on purpose, mirroring REQ-35-06's existing rule for
 * the Rust-side wake-lock arms ("an unrecognised kind is rejected rather than defaulted"): a
 * `Status` this switch does not recognise throws instead of silently falling into `null` (no
 * assertion) or either real kind. TypeScript's own exhaustiveness check (the `never` assignment
 * in `default`) fails the build if a future `Status` member is added without being classified
 * here; the throw is the runtime backstop for a value that reaches this function despite that,
 * e.g. via an `as Status` cast on untrusted data.
 */
export function classifySleepAssertionKind(status: Status): SleepAssertionKind {
  switch (status) {
    case 'launching':
    case 'playing':
      return 'display'
    case 'installing':
    case 'updating':
    case 'redist':
    case 'drm-setup':
    case 'engine-download':
    case 'steam-starting':
    case 'winetricks':
    case 'extracting':
    case 'repairing':
    case 'moving':
    case 'syncing-saves':
    case 'uninstalling':
      return 'system'
    case 'importing':
    case 'done':
    case 'canceled':
    case 'queued':
    case 'error':
    case 'notAvailable':
    case 'notSupportedGame':
    case 'notInstalled':
    case 'installed':
      return null
    default: {
      const unrecognised: never = status
      throw new Error(
        `classifySleepAssertionKind: unrecognised operation status ${JSON.stringify(unrecognised)} -- refusing to default it to a sleep kind (mirrors REQ-35-06's reject-unknown rule)`
      )
    }
  }
}

export interface SleepAssertionState {
  display: boolean
  system: boolean
}

interface SleepAssertionCall {
  channel: 'lock' | 'unlock'
  playing?: boolean
}

/**
 * Computes the exact `window.api.lock`/`window.api.unlock` calls to issue when the set of
 * active sleep-assertion kinds transitions from `previous` to `next`.
 *
 * `window.api.unlock()` has NO per-kind selector -- it always releases BOTH assertions -- and
 * Option-a (`35-27-PLAN.md`, chosen over option-b specifically to avoid a wire-contract change
 * this close to `35-21`'s CR-02 landing in the same sidecar file) keeps it that way. So the only
 * way to release just the kind that ended is to unlock everything and immediately re-lock
 * whichever kind is STILL wanted, in the same reconciliation pass -- which is also exactly why
 * this can't over-release the surviving kind (the inverse over-correction, bullet (d) of this
 * plan's acceptance criteria): it is re-acquired before this function returns its call list.
 *
 * Pure and DOM-free on purpose: this project's frontend jest project has no jsdom
 * (`src/frontend/jest.config.js`), and `componentDidUpdate` itself calls
 * `document.body.classList.toggle(...)`, so it cannot be unit-tested directly. Extracting the
 * decision here is what makes it testable at all.
 */
export function reconcileSleepAssertionCalls(
  previous: SleepAssertionState,
  next: SleepAssertionState
): SleepAssertionCall[] {
  const systemKindJustEnded = previous.system && !next.system
  const displayKindJustEnded = previous.display && !next.display

  if (systemKindJustEnded || displayKindJustEnded) {
    const calls: SleepAssertionCall[] = [{ channel: 'unlock' }]
    if (next.system) {
      calls.push({ channel: 'lock', playing: false })
    }
    if (next.display) {
      calls.push({ channel: 'lock', playing: true })
    }
    return calls
  }

  if (next.system || next.display) {
    const calls: SleepAssertionCall[] = []
    // `lock`'s two branches are mutually exclusive per call (both gated on the SAME `playing`
    // argument), so a kind newly turning on -- or simply remaining on -- needs its own call;
    // each only ever touches its own assertion id, never the other's.
    if (next.system) {
      calls.push({ channel: 'lock', playing: false })
    }
    if (next.display) {
      calls.push({ channel: 'lock', playing: true })
    }
    return calls
  }

  return [{ channel: 'unlock' }]
}

/**
 * Which sleep-assertion KINDS were active as of the previous reconcile pass --
 * the `previous` argument `reconcileSleepAssertionCalls` needs to detect a kind
 * turning off.
 */
let sleepAssertionState: SleepAssertionState = {
  display: false,
  system: false
}

/** Test-only: restores the module's "previous" snapshot to idle. */
export function __resetSleepAssertionStateForTests(): void {
  sleepAssertionState = { display: false, system: false }
}

/**
 * D-08: drives lock/unlock from a libraryStatus subscription. It fires
 * immediately to reproduce the class's first componentDidUpdate pass after
 * mount (which unlocked while idle).
 *
 * REQ-35-20 / D-35-08-02 / gate criterion 16 (Phase 35 gap-closure 35-27,
 * option-a): the two questions "is an operation pending?" and "which sleep kind
 * should it block?" are two independent predicates over the same
 * `libraryStatus` array, classified by `classifySleepAssertionKind` -- a game
 * (`'launching'`/`'playing'`) is display-kind ONLY, a download-shaped operation
 * is system-kind ONLY.
 *
 * Returns the unsubscribe handle (the boot caller ignores it: D-07, app-lifetime).
 */
export function registerSleepAssertionSubscriber(): () => void {
  return useLibraryState.subscribe(
    (s) => s.libraryStatus,
    (libraryStatus) => {
      const displayKindActive = libraryStatus.some(
        (game) => classifySleepAssertionKind(game.status) === 'display'
      )
      const systemKindActive = libraryStatus.some(
        (game) => classifySleepAssertionKind(game.status) === 'system'
      )

      const nextSleepAssertionState: SleepAssertionState = {
        display: displayKindActive,
        system: systemKindActive
      }
      const calls = reconcileSleepAssertionCalls(
        sleepAssertionState,
        nextSleepAssertionState
      )
      for (const call of calls) {
        if (call.channel === 'lock') {
          window.api.lock(call.playing as boolean)
        } else {
          window.api.unlock()
        }
      }

      sleepAssertionState = nextSleepAssertionState
    },
    { fireImmediately: true }
  )
}
