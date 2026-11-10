import React, { PureComponent } from 'react'

import { GameInfo, GameStatus, Runner, Status } from 'common/types'
import { withTranslation } from 'react-i18next'
import { getLegendaryConfig } from '../helpers'
import { i18n, TFunction } from 'i18next'

import ContextProvider from './ContextProvider'

import {
  gogConfigStore,
  gogInstalledGamesStore,
  gogLibraryStore,
  libraryStore,
  nileConfigStore,
  nileLibraryStore,
  sideloadLibrary,
  steamConfigStore,
  steamLibraryStore
} from '../helpers/stores'
import type { IpcRendererEvent } from 'backend/platform'
import type { SteamSyncStatus } from 'common/types/ipc'
import useAuthState from './authState'
import useLibraryState, {
  installLibraryBridgeSlots,
  type RefreshLibraryOptions
} from './libraryState'
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
  refreshAmazonUserInfo,
  registerControllerListener,
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
  // Phase 69 (69-13): identities, the Humble session and the sign-in notice
  // state moved to authState; the class keeps only the libraries.
  epic: {
    library: GameInfo[]
  }
  gog: {
    library: GameInfo[]
  }
  amazon: {
    library: GameInfo[]
  }
  steam: {
    library: GameInfo[]
  }
  gameUpdates: string[]
  libraryStatus: GameStatus[]
  refreshing: boolean
  refreshingInTheBackground: boolean
  // debug/login-logout-wipes-library: per-runner scoped refresh tracking, kept
  // SEPARATE from the two global flags above. A single-runner refresh (login/
  // logout of ONE platform) writes here instead of `refreshing`/
  // `refreshingInTheBackground` -- those two remain reserved for a genuine
  // all-runners refresh (mount-time load, manual "Refresh Library"), so
  // Library/index.tsx's merged-grid gate never blanks every platform's games
  // just because one platform logged in or out.
  refreshingByRunner: Partial<Record<Runner, boolean>>
  steamMetadataSyncing: boolean
  // Phase 34.15 (34.15-02), D-06: REPLACES the old background-refresh
  // boolean (see the constructor default and its post-refresh reset,
  // `:308`/`:1080` below) as the driver of the Steam sync indicator. That
  // boolean defaults `true` and is reset to `true` after EVERY unscoped
  // refresh, so it never actually means "a refresh is running" -- the old
  // guard reduced to "Steam is logged in AND the Steam library is empty",
  // permanently, on failure and on a genuinely empty library alike. A
  // tri-state makes the terminal state STRUCTURAL rather than a boolean
  // that happens to clear. `refreshingByRunner.steam` was rejected as the
  // carrier because it is a boolean (cannot distinguish "failed" from
  // "succeeded-and-empty"), and the mount-time refresh is UNSCOPED, so it
  // would never be set on the path where the bug reproduces.
  steamSyncStatus: SteamSyncStatus
  sideloadedLibrary: GameInfo[]
}

import { attachGameOverrides } from '../helpers/gameOverrides'

type GameOverride = NonNullable<GameInfo['overrides']>

const currentOverrides = () => useLibraryState.getState().gameOverrides

const applyGameOverrides = (
  lib: GameInfo[],
  overrides: Record<string, GameOverride> = currentOverrides()
) => attachGameOverrides(lib, overrides)

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
  constructor(props: Props) {
    super(props)
    // Phase 69 D-09 reverse bridge: authState reaches the library through
    // these slots until the library wave moves the implementations into
    // libraryState (69-16..69-19).
    installLibraryBridgeSlots({
      refreshLibrary: this.refreshLibrary,
      resetRunnerLibrary: (runner) => {
        const key = (
          {
            legendary: 'epic',
            gog: 'gog',
            nile: 'amazon',
            steam: 'steam'
          } as Partial<Record<Runner, 'epic' | 'gog' | 'amazon' | 'steam'>>
        )[runner]
        if (key) this.setState({ [key]: { library: [] } })
      },
      setRefreshing: (value) => this.setState({ refreshing: value })
    })
  }

  /**
   * Which sleep-assertion KINDS were active as of the previous `componentDidUpdate` call --
   * the `previous` argument `reconcileSleepAssertionCalls` needs to detect a kind turning off.
   */
  sleepAssertionState: SleepAssertionState = {
    display: false,
    system: false
  }

  loadLegendaryLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = libraryStore.get('library', [])
    return applyGameOverrides(games, overrides)
  }

  loadGOGLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = gogLibraryStore.get('games', [])

    const installedGames = gogInstalledGamesStore.get('installed', [])
    for (const game of games) {
      for (const installedGame of installedGames) {
        if (installedGame.appName === game.app_name) {
          game.install = installedGame
          game.is_installed = true
        }
      }
    }

    return applyGameOverrides(games, overrides)
  }
  loadAmazonLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = nileLibraryStore.get('library', [])

    return applyGameOverrides(games, overrides)
  }

  loadSteamLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = steamLibraryStore.get('games', [])
    return applyGameOverrides(games, overrides)
  }

  state: StateProps = {
    epic: {
      library: this.loadLegendaryLibrary()
    },
    gog: {
      library: this.loadGOGLibrary()
    },
    amazon: {
      library: this.loadAmazonLibrary()
    },
    steam: {
      library: this.loadSteamLibrary()
    },
    gameUpdates: [],
    libraryStatus: [],
    refreshing: false,
    refreshingInTheBackground: true,
    refreshingByRunner: {},
    steamMetadataSyncing: false,
    steamSyncStatus: 'idle',
    sideloadedLibrary: applyGameOverrides(sideloadLibrary.get('games', []))
  }

  updateGameOverrides = (overrides: Record<string, GameOverride>) => {
    useLibraryState.getState().setGameOverrides(overrides)
    this.setState({
      epic: {
        ...this.state.epic,
        library: this.loadLegendaryLibrary(overrides)
      },
      gog: {
        ...this.state.gog,
        library: this.loadGOGLibrary(overrides)
      },
      amazon: {
        ...this.state.amazon,
        library: this.loadAmazonLibrary(overrides)
      },
      sideloadedLibrary: applyGameOverrides(
        sideloadLibrary.get('games', []),
        overrides
      )
    })
  }

  refresh = async (
    library?: Runner | 'all',
    checkUpdates = false,
    overridesArg?: Record<string, GameOverride>
  ): Promise<void> => {
    console.log('refreshing')

    const { epic, gog, amazon, gameUpdates } = this.state
    const auth = useAuthState.getState()

    const overrides = overridesArg || currentOverrides()

    // debug/login-logout-wipes-library: `library` names the ONE runner this
    // refresh is scoped to. `undefined` here means "no scope" -- either the
    // caller passed no `library` at all, or explicitly passed `'all'` (both
    // mean the same thing to this function, matching the pre-existing
    // no-argument behavior exactly). Every `includesX` below reads as "no
    // scope => touch everything, same as before this fix".
    const scopedRunner = library && library !== 'all' ? library : undefined
    const includesEpic = !scopedRunner || isStore(scopedRunner, 'legendary')
    const includesGog = !scopedRunner || isStore(scopedRunner, 'gog')
    const includesAmazon = !scopedRunner || isStore(scopedRunner, 'nile')

    let updates = gameUpdates
    if (checkUpdates) {
      try {
        updates = await window.api.checkGameUpdates()
      } catch (error) {
        window.api.logError(`Game update check failed: ${String(error)}`)
      }
    }

    const currentLibraryLength = epic.library?.length

    // Each of the four blocks below asks the same question: "is the CACHE empty, and do we
    // therefore have to go fetch the library?" All four used to also test
    // `!<runner>.library.length` — the length of REACT STATE — and refetch when that was
    // empty even though the cache was full.
    //
    // That second clause was pure cost. React state is only written by the `setState` at
    // the END of this same function, so on any path that deliberately empties state — most
    // obviously a fresh login, where `gogLogin`/`completeOAuthLogin` set
    // `{library: [], username}` before triggering this refresh — it is guaranteed empty
    // here while the cache is already correct. The refetch then went to the network for
    // data the very next line already had in hand.
    //
    // Measured (debug/resolved/gog-login-ui-never-updates.md, live log 2026-08-03):
    // at 01:40:14 the GOG cache held 7 games and React state held 0, so this fired a full
    // second GOG library fetch that finished at 01:40:24 — ~10 seconds, for nothing.
    //
    // Dropping it is safe because freshness is already guaranteed by the CALLER: the
    // post-login path is `handleSuccessfulLogin` -> `refreshLibrary({library: runner})`,
    // whose own `await window.api.refreshLibrary(library)` (see `refreshLibrary` below)
    // has just repopulated the backend store — including for a DIFFERENT account than the
    // cache previously held. A genuinely empty cache still refetches, which is the case
    // this guard exists for.
    //
    // Fixed at all three call sites at once, deliberately. Two of them (epic,
    // amazon) had no reported symptom — only GOG was diagnosed — but they are the same
    // defect and fixing one would have left two latent.
    //
    // debug/login-logout-wipes-library: each block is now ALSO gated on its
    // `includesX` flag. A runner-scoped call (e.g. `library: 'gog'`) no
    // longer re-reads the other three runners' caches at all — previously
    // pure waste on a scoped call, and now load-bearing: the final
    // `setState` below only writes the slice(s) `includesX` allowed, so a
    // variable that was never (re)computed here must default to the
    // UNCHANGED current value, never an empty/stale placeholder.
    let epicLibrary = epic.library
    if (includesEpic) {
      epicLibrary = libraryStore.get('library', [])
      if (auth.epicUsername && !epicLibrary.length) {
        window.api.logInfo('No cache found, getting data from legendary...')
        const { library: legendaryLibrary } = await getLegendaryConfig()
        epicLibrary = legendaryLibrary
      }
    }

    let gogLibrary = gog.library
    if (includesGog) {
      gogLibrary = this.loadGOGLibrary(overrides)
      if (auth.gogUsername && !gogLibrary.length) {
        window.api.logInfo('No cache found, getting data from gog...')
        await window.api.refreshLibrary('gog')
        gogLibrary = this.loadGOGLibrary(overrides)
      }
    }

    let amazonLibrary = amazon.library
    if (includesAmazon) {
      amazonLibrary = nileLibraryStore.get('library', [])
      if (auth.amazonUserId && !amazonLibrary.length) {
        window.api.logInfo('No cache found, getting data from nile...')
        await window.api.refreshLibrary('nile')
        amazonLibrary = this.loadAmazonLibrary(overrides)
      }
    }

    const updatedSideload = sideloadLibrary.get('games', [])

    // debug/login-logout-wipes-library: the functional form (matching the
    // existing precedent in `handleGamePush`'s steam branch) reads the
    // LATEST `refreshingByRunner` map at commit time, not the snapshot
    // captured when this async function started — required because two
    // scoped refreshes (e.g. Epic and GOG logging in back-to-back) can have
    // overlapping in-flight windows, and a direct-object merge here would
    // silently drop whichever one's flag got applied first.
    this.setState((prevState: StateProps) => {
      const next: Partial<StateProps> = {
        gameUpdates: updates,
        sideloadedLibrary: applyGameOverrides(updatedSideload, overrides)
      }

      if (includesEpic) {
        next.epic = {
          library: applyGameOverrides(epicLibrary, overrides)
        }
      }
      if (includesGog) {
        next.gog = {
          library: gogLibrary
        }
      }
      if (includesAmazon) {
        next.amazon = {
          library: amazonLibrary
        }
      }

      // debug/login-logout-wipes-library: the final write is scoped exactly
      // like the fetch blocks above. A no-scope ('all'/mount/manual-refresh)
      // call clears the two GLOBAL flags exactly as before this fix. A
      // single-runner call clears ONLY that runner's own `refreshingByRunner`
      // entry — the global flags are never touched, so Library/index.tsx's
      // merged-grid gate (which reads only the two global flags) is
      // completely unaffected by one platform's login/logout finishing.
      if (!scopedRunner) {
        next.refreshing = false
        next.refreshingInTheBackground = true
      } else {
        next.refreshingByRunner = {
          ...prevState.refreshingByRunner,
          [scopedRunner]: false
        }
      }

      return next
    })

    if (currentLibraryLength !== epicLibrary.length) {
      window.api.logInfo('Force Update')
      this.forceUpdate()
    }
  }

  refreshLibrary = async ({
    checkForUpdates,
    runInBackground = true,
    library = undefined,
    origin = 'unknown'
  }: RefreshLibraryOptions): Promise<void> => {
    if (this.state.refreshing) return

    // GAP CYCLE 4 (34.5-33, item 2): this line used to be
    // `Refreshing ${library} Library`, which printed the literal word
    // `undefined` whenever `library` was omitted — indistinguishable from a
    // genuine runner name in a live log. `library ?? 'all'` matches the
    // semantics `window.api.refreshLibrary(undefined)` already carries at
    // main.ts:1051 and (gap cycle 4, plan 34.5-33) now carries in the
    // sidecar handler too — the runner-less case IS "all", never a mystery
    // value. `origin` names the call site so a live log can attribute a
    // refresh to its trigger.
    const runnerScope = library ?? 'all'
    window.api.logInfo(
      `[refreshLibrary] runner=${runnerScope} origin=${origin}`
    )

    // debug/login-logout-wipes-library: a SCOPED call (a specific runner,
    // never `undefined`/`'all'`) tracks its own `refreshingByRunner` entry
    // instead of the two GLOBAL flags below — see `.refresh()`'s matching
    // final `setState` and `StateProps.refreshingByRunner`'s doc comment for
    // why. The guard mirrors the top-of-function `if (this.state.refreshing)
    // return` above, but scoped to this ONE runner, so two overlapping
    // scoped refreshes of the SAME runner (e.g. a double-click) can't step
    // on each other; it does NOT block a DIFFERENT runner's scoped refresh
    // from starting concurrently — that's the whole point of this fix.
    const scopedRunner = library && library !== 'all' ? library : undefined
    if (scopedRunner && this.state.refreshingByRunner[scopedRunner]) return

    if (scopedRunner) {
      this.setState((prevState: StateProps) => ({
        refreshingByRunner: {
          ...prevState.refreshingByRunner,
          [scopedRunner]: true
        }
      }))
    } else {
      this.setState({
        refreshing: true,
        refreshingInTheBackground: runInBackground
      })
    }

    try {
      await window.api.refreshLibrary(library, origin)
      await this.refresh(library, checkForUpdates)
      // Quick 261029-quw item 2: every login triggers a refresh, so a login
      // that finished in the backend heals here at the latest.
      useAuthState.getState().resyncSignInIdentityFromStores()
      return
    } catch (error) {
      window.api.logError(`Library refresh failed: ${String(error)}`)
      // debug/steam-relogin-no-autorefresh: this method's own guard above
      // (`if (this.state.refreshing) return`) means a failure here — from
      // ANY store, not just the one that just errored — permanently wedges
      // every future refreshLibrary() call (including the automatic
      // post-login refresh AND the manual Refresh button in the Games
      // tier-2 panel's Header, which calls this exact method) until
      // something outside this
      // function happens to reset `refreshing`. Reset it here so a failed
      // refresh never blocks the next attempt.
      this.setState({ refreshing: false })
      // debug/login-logout-wipes-library: mirror that same never-wedge
      // guarantee for the scoped path — a failed scoped refresh must clear
      // its OWN `refreshingByRunner` entry, or that one runner's future
      // scoped refreshes wedge forever behind the guard just above.
      if (scopedRunner) {
        this.setState((prevState: StateProps) => ({
          refreshingByRunner: {
            ...prevState.refreshingByRunner,
            [scopedRunner]: false
          }
        }))
      }
    }
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
    const { libraryStatus, gameUpdates } = this.state

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
        this.refreshLibrary({
          checkForUpdates: true,
          runInBackground: true,
          library: runner,
          origin: 'game-status'
        })

        storage.setItem('updates', JSON.stringify(updatedGamesUpdates))
        return this.setState({
          gameUpdates: updatedGamesUpdates,
          libraryStatus: newLibraryStatus
        })
      }

      this.refreshLibrary({
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

    const { epic, gog, amazon, gameUpdates = [] } = this.state

    window.api.handleGameStatus((e, args) => {
      this.handleGameStatus({ ...args })
    })

    window.api.handleSteamMetadataSyncing((e, { syncing }) => {
      this.setState({ steamMetadataSyncing: syncing })
    })

    // Phase 34.15 (34.15-02), D-06/D-07: mirrors handleSteamMetadataSyncing
    // above. Deliberately does NOT read or touch the old background-refresh
    // flag it replaces (see StateProps.steamSyncStatus doc comment). The
    // payload's `reason` is not stored here; the resolver's mode is what
    // drives rendering (Plan 06) and the notice copy is reason-agnostic in
    // its first form.
    window.api.handleSteamSyncStatus((e, { status }) => {
      this.setState({ steamSyncStatus: status })
    })

    window.api.handleRefreshLibrary((e, runner) => {
      this.refreshLibrary({
        checkForUpdates: false,
        runInBackground: true,
        library: runner,
        origin: 'push'
      })
    })

    window.api.handleMetadataChanged((e, overrides) => {
      this.updateGameOverrides(overrides)
    })

    window.api.handleGamePush((e: IpcRendererEvent, args: GameInfo) => {
      if (!args.app_name) return
      if (isStore(args, 'gog')) {
        const library = [...this.state.gog.library]
        const index = library.findIndex(
          (game) => game.app_name === args.app_name
        )
        if (index !== -1) {
          library[index] = args
        } else {
          library.push(args)
        }
        this.setState({
          gog: {
            library: [...library]
          }
        })
      } else if (isStore(args, 'legendary')) {
        this.setState((prevState: StateProps) => {
          const library = [...prevState.epic.library]
          const index = library.findIndex(
            (game) => game.app_name === args.app_name
          )
          if (index !== -1) {
            library[index] = args
          } else {
            library.push(args)
          }
          return {
            epic: {
              library
            }
          }
        })
      } else if (isStore(args, 'steam')) {
        this.setState((prevState: StateProps) => {
          const library = [...prevState.steam.library]
          const index = library.findIndex(
            (game) => game.app_name === args.app_name
          )
          if (index !== -1) {
            library[index] = args
          } else {
            library.push(args)
          }
          return {
            steam: {
              library
            }
          }
        })
      }
    })

    // R10: seed isFullscreen/isFrameless, then follow the pushes (initStateSubscriptions).
    await seedAndFollowWindowChrome()

    const gogUser = gogConfigStore.has('userData')
    const amazonUser = nileConfigStore.has('userData')
    // debug/steam-refresh-hung-on-startup: a Steam-only login (no Epic/GOG/
    // Amazon account) was previously excluded from the mount-time
    // "refresh everything" gate below entirely, so SteamLibraryManager.refresh()
    // never ran on startup and the "Syncing your Steam library…" spinner
    // (true by default: steam.username seeded synchronously above,
    // refreshingInTheBackground defaults true, steam.library starts empty)
    // spun forever with no errors, since nothing was ever running to clear it.
    const steamUser = steamConfigStore.has('userData')

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

    if (!gameUpdates.length) {
      const storedGameUpdates = JSON.parse(storage.getItem('updates') || '[]')
      this.setState({ gameUpdates: storedGameUpdates })
    }

    if (legendaryUser || gogUser || amazonUser || steamUser) {
      this.refreshLibrary({
        checkForUpdates: true,
        runInBackground:
          epic.library.length !== 0 ||
          gog.library.length !== 0 ||
          amazon.library.length !== 0 ||
          this.state.steam.library.length !== 0,
        origin: 'mount'
      })
    }

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
    const { gameUpdates, libraryStatus } = this.state

    storage.setItem('updates', JSON.stringify(gameUpdates))

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
    const { epic, gog, amazon, steam, libraryStatus } = this.state

    const installingEpicGame = libraryStatus.some(
      (game) => game.status === 'installing' && isStore(game, 'legendary')
    )

    return (
      <ContextProvider.Provider
        value={{
          ...this.state,
          ...bridgedContextSlice(),
          ...bridgedAccounts({
            epicLibrary: epic.library,
            gogLibrary: gog.library,
            amazonLibrary: amazon.library,
            steamLibrary: steam.library
          }),
          installingEpicGame,
          refresh: this.refresh,
          refreshLibrary: this.refreshLibrary
        }}
      >
        {this.props.children}
      </ContextProvider.Provider>
    )
  }
}

export default withTranslation()(GlobalState)
