/**
 * Behavioural gate for the store's `steamLogout` (Phase 34.4 gap fix,
 * REQ-34.4-02 / live-gate item 2; Phase 69-14 moved the action into authState).
 *
 * The stale G-30-01 guard short-circuited BEFORE `window.api.logoutSteam()`
 * was ever reached, so under Tauri sign-out silently did nothing. This gate
 * drives the real `useAuthState.getState().steamLogout()` against a recording
 * fake `window.api` and asserts the observable contract:
 *  - `logoutSteam` is reached unconditionally (the real channel, no guard);
 *  - sign-out confirmed -> identity and library cleared, no dialog;
 *  - never confirmed -> state untouched and the failure dialog shown.
 *
 * Anti-vacuity: `steamLogoutViolations` is run against the real action AND
 * against a near-miss variant that short-circuits before the channel (the
 * stale guard) and a variant that clears state on failure; both must be
 * convicted.
 */
import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useAuthState from '../authState'
import useLibraryState from '../libraryState'
import useUiState from '../uiState'

interface Recording {
  calls: string[]
  resets: string[]
  dialogs: number
}

let rec: Recording
let signedOutOnPoll: boolean

function install(): void {
  rec = { calls: [], resets: [], dialogs: 0 }
  ;(window as unknown as { api: unknown }).api = {
    storeNew: () => undefined,
    storeHas: () => false,
    storeGet: (_n: string, _k: string, fallback?: unknown) => fallback,
    setSetting: () => undefined,
    logError: () => undefined,
    logoutSteam: () => {
      rec.calls.push('logoutSteam')
    },
    getSteamUserInfo: async () =>
      signedOutOnPoll ? undefined : { username: 'sName' }
  }
  useLibraryState.setState({ refreshLibrary: async () => undefined })
  useLibraryState.setState({
    resetRunnerLibrary: (runner) => {
      rec.resets.push(runner)
    },
    setRefreshing: () => undefined
  })
  useUiState.setState({
    showDialogModal: (() => {
      rec.dialogs++
    }) as never
  })
}

type SteamLogout = () => Promise<void>

/** The contract; returns the list of violated rules (empty = conforming). */
async function steamLogoutViolations(steamLogout: SteamLogout) {
  const violations: string[] = []
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.useFakeTimers()
  try {
    // confirmed path
    signedOutOnPoll = true
    install()
    const keep = { app_name: 'x', is_installed: true }
    useLibraryState.setState({
      steamLibrary: [keep, { app_name: 'y', is_installed: false }] as never
    })
    useAuthState.setState({ steamUsername: 'sName' })
    await steamLogout()
    if (!rec.calls.includes('logoutSteam')) {
      violations.push('never reached window.api.logoutSteam')
    }
    if (useAuthState.getState().steamUsername !== null) {
      violations.push('identity not cleared after confirmed sign-out')
    }
    const kept = useLibraryState.getState().steamLibrary
    if (kept.length !== 1 || kept[0]!.app_name !== 'x' || rec.dialogs !== 0) {
      violations.push('confirmed path library/dialog wrong')
    }

    // unconfirmed path
    signedOutOnPoll = false
    install()
    useLibraryState.setState({
      steamLibrary: [{ app_name: 'y', is_installed: false }] as never
    })
    useAuthState.setState({ steamUsername: 'sName' })
    const pending = steamLogout()
    await jest.advanceTimersByTimeAsync(20 * 150)
    await pending
    if (useAuthState.getState().steamUsername !== 'sName') {
      violations.push('state cleared although sign-out never confirmed')
    }
    if (
      rec.resets.length !== 0 ||
      useLibraryState.getState().steamLibrary.length !== 1
    ) {
      violations.push('library cleared although sign-out never confirmed')
    }
    if (rec.dialogs !== 1) {
      violations.push('failure dialog not shown exactly once')
    }
  } finally {
    jest.useRealTimers()
    warn.mockRestore()
  }
  return violations
}

describe('authState.steamLogout reaches the real logoutSteam channel unconditionally (item 1)', () => {
  afterEach(() => {
    resetAllStores()
  })

  it('the real action conforms to the contract', async () => {
    expect(
      await steamLogoutViolations(() => useAuthState.getState().steamLogout())
    ).toEqual([])
  })

  it('self-test: a stale guard that returns before the channel is convicted', async () => {
    const stale: SteamLogout = async () => {
      useUiState.getState().showDialogModal({} as never)
    }
    const violations = await steamLogoutViolations(stale)
    expect(violations).toContain('never reached window.api.logoutSteam')
  })

  it('self-test: a variant that clears state on failure is convicted', async () => {
    const clearsOnFailure: SteamLogout = async () => {
      window.api.logoutSteam()
      useAuthState.setState({ steamUsername: null })
    }
    const violations = await steamLogoutViolations(clearsOnFailure)
    expect(violations).toContain(
      'state cleared although sign-out never confirmed'
    )
  })
})
