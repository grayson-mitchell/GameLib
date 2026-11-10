import React, { PureComponent } from 'react'

import { GameStatus, Status } from 'common/types'
import { withTranslation } from 'react-i18next'
import { i18n, TFunction } from 'i18next'

import ContextProvider from './ContextProvider'

import useAuthState from './authState'
import useLibraryState from './libraryState'
import { applySavedFonts } from './settingsState'
import {
  bridgedAccounts,
  bridgedContextSlice,
  subscribeBridge
} from './bridgeContextValue'
import {
  followConnectivity,
  hydrateDismissedSignInNotices,
  pullSignInProbeOutcomes,
  readMountStoreUsers,
  refreshAmazonUserInfo,
  runMountLibraryRefresh,
  registerControllerListener,
  restoreStoredGameUpdates,
  seedAndFollowWindowChrome,
  seedEpicUserInfo
} from './initStateSubscriptions'
import { useBottleLaunchWaiting } from './BottleLaunchWaiting'
import { isStore } from 'common/storeCapabilities'

const storage: Storage = window.localStorage

type T = TFunction<'gamepage'> & TFunction<'translations'>

interface Props {
  children: React.ReactNode
  i18n: i18n
  t: T
}

interface StateProps {
  // Phase 69: identities, the libraries, the update list and the refresh flags
  // live in authState/libraryState; the class keeps only the per-game status.
  libraryStatus: GameStatus[]
}

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
// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- the
// only outside reference is inside a source-text search marker (see the
// comment above the function below), which depends on THAT function's own
// `export` keyword, not on this type's).
//
// DELIBERATE: this comment must never spell out the marker string verbatim
// on one unbroken line -- GlobalStateSleepAssertionClassification.test.ts's
// `extractFunctionSource` does a plain substring search, and a comment
// containing an exact copy of the marker would match FIRST, extracting this
// comment's own text instead of the real function below (caught empirically
// while writing this edit: reconcileSleepAssertionCalls' marker did exactly
// that against its own doc comment, and had to be reworded the same way).
type SleepAssertionKind = 'display' | 'system' | null

// Consumed by
// src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts,
// which reads this file's SOURCE TEXT at test time (this file cannot be
// `import`-ed under the frontend jest project's jsdom-less config -- see
// that test's own docstring) and does a plain substring search for this
// function's full declaration line (starting with the `export` keyword
// through the open brace) to extract and transpile the real function body.
// Dropping `export` breaks that search. Do not spell that declaration line
// out verbatim anywhere in a comment above this function -- see the
// DELIBERATE note above reconcileSleepAssertionCalls below for why.
/** @public consumed by GlobalStateSleepAssertionClassification.test.ts, which reads this file's source text and extracts the function body; dropping the export breaks that extraction. */
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

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- the
// test suite that exercises this file declares its OWN separate, identically
// named local type rather than importing this one -- see
// GlobalStateSleepAssertionClassification.test.ts:148, a coincidental match,
// not a consumer).
interface SleepAssertionState {
  display: boolean
  system: boolean
}

// Not exported: same reasoning as SleepAssertionState above --
// GlobalStateSleepAssertionClassification.test.ts:149 declares its own
// separate, identically named local type.
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
// Consumed by
// src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts,
// which reads this file's SOURCE TEXT at test time and does a plain
// substring search for this function's declaration line (starting with the
// `export` keyword through the open paren) to extract and transpile the
// real function body. Dropping `export` breaks that search.
//
// DELIBERATE: do not spell that declaration line out verbatim anywhere in
// this comment block -- the test's search is a plain substring match, so a
// comment reproducing it exactly would be found FIRST and extracted instead
// of the real function below (measured while writing this edit: an earlier
// revision of this exact comment did precisely that).
/** @public consumed by GlobalStateSleepAssertionClassification.test.ts, which reads this file's source text and extracts the function body; dropping the export breaks that extraction. */
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

class GlobalState extends PureComponent<Props> {
  /**
   * Which sleep-assertion KINDS were active as of the previous `componentDidUpdate` call --
   * the `previous` argument `reconcileSleepAssertionCalls` needs to detect a kind turning off.
   */
  sleepAssertionState: SleepAssertionState = {
    display: false,
    system: false
  }

  state: StateProps = {
    libraryStatus: []
  }

  handleGameStatus = async ({
    appName,
    status,
    folder,
    context,
    progress,
    runner,
    managedBySteam
  }: GameStatus) => {
    const { libraryStatus } = this.state
    const { gameUpdates } = useLibraryState.getState()

    // Phase 51 Plan 08 (D-51-16, folded todo): the "waiting for Steam"
    // state ends either way the launch resolves -- the game's own process
    // appearing (playing) or the launch itself ending (done). Runs before
    // every other branch below (including the !currentApp early return) so
    // neither path can skip it.
    if (status === 'playing' || status === 'done') {
      useBottleLaunchWaiting.getState().clear(appName)
    }

    const currentApp = libraryStatus.find((game) => game.appName === appName)

    // add app to libraryStatus if it was not present
    if (!currentApp) {
      return this.setState({
        libraryStatus: [
          ...libraryStatus,
          {
            appName,
            status,
            folder,
            context,
            progress,
            runner,
            ...(managedBySteam ? { managedBySteam } : {})
          }
        ]
      })
    }

    // if the app's status didn't change, do nothing
    if (
      currentApp.status === status &&
      currentApp.context === context &&
      !!currentApp.managedBySteam === !!managedBySteam
    ) {
      return
    }

    // if the app's status did change, remove it from the current list and then handle the new status
    const newLibraryStatus = libraryStatus.filter(
      (game) => game.appName !== appName
    )

    // in these cases we just add the new status
    if (
      [
        'installing',
        'updating',
        'playing',
        'extracting',
        'launching',
        'winetricks',
        'redist',
        'drm-setup',
        'engine-download',
        'steam-starting',
        'queued'
      ].includes(status)
    ) {
      newLibraryStatus.push({
        appName,
        status,
        folder,
        context,
        progress,
        runner,
        ...(managedBySteam ? { managedBySteam } : {})
      })
      this.setState({ libraryStatus: newLibraryStatus })
    }

    // when error or done we remove it from the status info
    if (['error', 'done'].includes(status)) {
      // also remove from updates if it was updating
      if (currentApp.status === 'updating') {
        const updatedGamesUpdates = gameUpdates.filter(
          (game) => game !== appName
        )
        // This avoids calling legendary again before the previous process is killed when canceling
        void useLibraryState.getState().refreshLibrary({
          checkForUpdates: true,
          runInBackground: true,
          library: runner,
          origin: 'game-status'
        })

        storage.setItem('updates', JSON.stringify(updatedGamesUpdates))
        useLibraryState.setState({ gameUpdates: updatedGamesUpdates })
        return this.setState({ libraryStatus: newLibraryStatus })
      }

      void useLibraryState.getState().refreshLibrary({
        runInBackground: true,
        library: runner,
        origin: 'game-status'
      })

      this.setState({ libraryStatus: newLibraryStatus })
    }
  }

  async componentDidMount() {
    // Phase 69 D-09 bridge: re-render when a store-owned context field changes.
    subscribeBridge(() => this.forceUpdate())
    // catches store changes between the first render and mount
    this.forceUpdate()

    window.api.handleGameStatus((e, args) => {
      this.handleGameStatus({ ...args })
    })

    // R10: seed isFullscreen/isFrameless, then follow the pushes (initStateSubscriptions).
    await seedAndFollowWindowChrome()

    const { gogUser, amazonUser, steamUser } = readMountStoreUsers()

    // F-49-R1-1 (Phase 49 live gate Run 1): this used to be gated on
    // `legendaryUser` (the mirror already holding `userInfo`). legendary
    // 0.21.0 deletes `user.json` when a refresh token is rejected, the backend
    // then purges `userInfo` (`legendary/user.ts:713`), and once it was gone
    // nothing ever asked for it back, even after the file returned. The
    // backend's `getUserInfo()` is self-healing in both directions (rebuilds
    // from the file when present, purges when absent), so call it on every
    // mount and seed the username from its answer when the mirror had none.
    // The cold-boot expired path does not depend on this: the latched flag
    // wins in `resolveSignInState` branch 1 (measured live 2026-10-09).
    const legendaryUser = await seedEpicUserInfo()

    await refreshAmazonUserInfo(amazonUser)

    restoreStoredGameUpdates()

    runMountLibraryRefresh({ legendaryUser, gogUser, amazonUser, steamUser })

    registerControllerListener()

    followConnectivity()

    // 49-07 (D-08, Pitfall 11): pull once on mount, because the outcomes push
    // can precede the listener above. Read-only getter -- nothing here starts
    // a probe (P3).
    pullSignInProbeOutcomes()

    // F-49-R1-3: hydrate the dismissed set from the backend's settings, as a
    // read (see hydrateDismissedSignInNotices).
    void hydrateDismissedSignInNotices()

    useAuthState.getState().rearmFromCurrentState()

    applySavedFonts()

    window.api.frontendReady()
  }

  componentDidUpdate() {
    const { libraryStatus } = this.state

    // REQ-35-20 / D-35-08-02 / gate criterion 16 (Phase 35 gap-closure 35-27, option-a): the two
    // questions "is an operation pending?" and "which sleep kind should it block?" used to be
    // ONE `allowedPendingOps` list. They are now two independent predicates over the same
    // `libraryStatus` array, classified by `classifySleepAssertionKind` -- a game (`'launching'`/
    // `'playing'`) is display-kind ONLY, a download-shaped operation is system-kind ONLY.
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
      this.sleepAssertionState,
      nextSleepAssertionState
    )
    for (const call of calls) {
      if (call.channel === 'lock') {
        window.api.lock(call.playing as boolean)
      } else {
        window.api.unlock()
      }
    }

    this.sleepAssertionState = nextSleepAssertionState
  }

  render() {
    const { libraryStatus } = this.state

    const installingEpicGame = libraryStatus.some(
      (game) => game.status === 'installing' && isStore(game, 'legendary')
    )

    return (
      <ContextProvider.Provider
        value={{
          ...this.state,
          ...bridgedContextSlice(),
          ...bridgedAccounts(),
          installingEpicGame
        }}
      >
        {this.props.children}
      </ContextProvider.Provider>
    )
  }
}

export default withTranslation()(GlobalState)
