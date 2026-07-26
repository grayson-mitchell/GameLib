/**
 * Unit tests for the sidecar's real `Notification`/`shell`/`app` lifecycle forwards (Phase 33
 * Plan 04, D-05), plus the D-08/D-09 logged-no-op upgrades (`powerSaveBlocker`/`session`).
 *
 * There is no real Rust process here — `requestRustInvoke` (from `../sidecarRpc`) is mocked
 * with a small in-memory per-channel program, mirroring `dialogStub.test.ts`'s convention, so
 * each test can script a resolve/reject outcome and assert on exactly what was called and
 * returned.
 *
 * `jest.mock('electron', ...)` routes Jest's own module resolution at the REAL `electronStub.ts`
 * (mirrors `dialogStub.test.ts`/`skeletonFlows.test.ts`'s three-way mock preamble) so the
 * lifecycle members' actual forwarding logic runs, not the generic backend-wide manual mock.
 * `jest.mock('os', ...)` keeps any import-time path resolution inside electronStub.ts's module
 * graph away from the developer's real config directory (same gotcha
 * `electronUntouched.test.ts`'s header documents).
 *
 * Several members under test (`Notification.show()`, `shell.showItemInFolder()`,
 * `app.quit/exit/relaunch()`) are fire-and-forget void-returning calls that internally chain a
 * `.catch()` onto their `requestRustInvoke` promise rather than awaiting it — a test asserting
 * the logged-on-failure behavior must flush the microtask queue (`await flushMicrotasks()`)
 * after invoking them before checking `console.warn`.
 */

// ── os — per-pid tmp home, same convention as dialogStub.test.ts / skeletonFlows.test.ts
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-lifecyclestub-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc mock — fake Rust responder, in-memory program (mirrors dialogStub.test.ts)
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  Notification,
  app,
  clipboard,
  net,
  powerSaveBlocker,
  session,
  shell
} from '../electronStub'
import { requestRustInvoke } from '../sidecarRpc'
import {
  RUST_APP_EXIT,
  RUST_APP_RELAUNCH,
  RUST_CLIPBOARD_READ_TEXT,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_INVOKE_CHANNELS,
  RUST_NOTIFICATION_SHOW,
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER
} from 'common/types/sidecarTransport'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: ProgrammedOutcome | null = null
let callLog: Array<{ channel: string; args: unknown[] }> = []
let warnSpy: jest.SpyInstance

/** Flushes the microtask queue so a fire-and-forget `.catch()` chain has had a chance to run. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  program = null
  callLog = []
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  // resetMocks: true (jest.config.js) wipes even a factory-supplied implementation before every
  // test (same gotcha dialogStub.test.ts documents) — re-wire here.
  mockRequestRustInvoke.mockImplementation(
    (channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      if (!program) {
        return Promise.reject(
          new Error(`no outcome programmed for channel: ${channel}`)
        )
      }
      return program.type === 'resolve'
        ? Promise.resolve(program.value)
        : Promise.reject(program.error)
    }
  )
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('new lifecycle channels are allowlisted (else requestRustInvoke pre-rejects)', () => {
  it('RUST_NOTIFICATION_SHOW / RUST_SHELL_SHOW_ITEM_IN_FOLDER / RUST_SHELL_OPEN_PATH / RUST_APP_EXIT / RUST_APP_RELAUNCH / RUST_CLIPBOARD_WRITE_TEXT / RUST_CLIPBOARD_READ_TEXT are all members of RUST_INVOKE_CHANNELS', () => {
    const channels = RUST_INVOKE_CHANNELS as readonly string[]
    expect(channels).toEqual(
      expect.arrayContaining([
        RUST_NOTIFICATION_SHOW,
        RUST_SHELL_SHOW_ITEM_IN_FOLDER,
        RUST_SHELL_OPEN_PATH,
        RUST_APP_EXIT,
        RUST_APP_RELAUNCH,
        RUST_CLIPBOARD_WRITE_TEXT,
        RUST_CLIPBOARD_READ_TEXT
      ])
    )
  })
})

describe('electronStub Notification (Phase 33 Plan 04, D-05)', () => {
  it('isSupported() returns true', () => {
    expect(Notification.isSupported()).toBe(true)
  })

  it('show() forwards {title, body} via RUST_NOTIFICATION_SHOW', async () => {
    program = { type: 'resolve', value: null }

    const notification = new Notification({
      title: 'GameLib',
      body: 'Install complete'
    })
    notification.show()
    await flushMicrotasks()

    expect(callLog).toEqual([
      {
        channel: RUST_NOTIFICATION_SHOW,
        args: [{ title: 'GameLib', body: 'Install complete' }]
      }
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('show() never throws and logs a warning when requestRustInvoke rejects', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    const notification = new Notification({ title: 'Title', body: 'Body' })
    expect(() => notification.show()).not.toThrow()
    await flushMicrotasks()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_NOTIFICATION_SHOW)
  })

  it('close() and on() are safe no-ops', () => {
    const notification = new Notification()
    expect(() => notification.close()).not.toThrow()
    expect(notification.on()).toBe(notification)
  })
})

describe('electronStub shell.showItemInFolder / shell.openPath (Phase 33 Plan 04, D-05)', () => {
  it('showItemInFolder forwards the path via RUST_SHELL_SHOW_ITEM_IN_FOLDER', async () => {
    program = { type: 'resolve', value: null }

    shell.showItemInFolder('/Users/dev/Games/game.exe')
    await flushMicrotasks()

    expect(callLog).toEqual([
      {
        channel: RUST_SHELL_SHOW_ITEM_IN_FOLDER,
        args: ['/Users/dev/Games/game.exe']
      }
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('showItemInFolder never throws and logs a warning when requestRustInvoke rejects', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    expect(() =>
      shell.showItemInFolder('/Users/dev/Games/game.exe')
    ).not.toThrow()
    await flushMicrotasks()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_SHELL_SHOW_ITEM_IN_FOLDER)
  })

  it('openPath forwards the path via RUST_SHELL_OPEN_PATH and resolves an empty string on success', async () => {
    program = { type: 'resolve', value: null }

    await expect(shell.openPath('/Users/dev/Games/game.exe')).resolves.toBe('')

    expect(callLog).toEqual([
      { channel: RUST_SHELL_OPEN_PATH, args: ['/Users/dev/Games/game.exe'] }
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('openPath never rejects -- resolves the error message string and logs a warning on transport failure', async () => {
    program = {
      type: 'reject',
      error: new Error('rustInvoke: channel not allowed')
    }

    await expect(shell.openPath('/Users/dev/Games/game.exe')).resolves.toBe(
      'rustInvoke: channel not allowed'
    )
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_SHELL_OPEN_PATH)
  })
})

describe('electronStub shell.trashItem stays a LOGGED no-op (D-05, no vetted Tauri v2 trash plugin)', () => {
  it('never throws and logs a warning declaring the accepted gap', async () => {
    await expect(shell.trashItem()).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain('trashItem')
    expect(String(warningArg)).toContain('D-05')
  })
})

describe('electronStub clipboard.writeText real forwarding (Phase 34.3 Plan 05, REQ-34.3-03/04)', () => {
  it("writeText('x') produces exactly one recorded call { channel: RUST_CLIPBOARD_WRITE_TEXT, args: ['x'] }", async () => {
    program = { type: 'resolve', value: null }

    clipboard.writeText('x')
    await flushMicrotasks()

    expect(callLog).toEqual([
      { channel: RUST_CLIPBOARD_WRITE_TEXT, args: ['x'] }
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not throw when the RPC rejects, and warns with the channel name', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    expect(() => clipboard.writeText('x')).not.toThrow()
    await flushMicrotasks()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      RUST_CLIPBOARD_WRITE_TEXT
    )
  })
})

describe('electronStub app.exit / app.quit / app.relaunch (Phase 33 Plan 04, D-05 app lifecycle)', () => {
  it('exit() forwards via RUST_APP_EXIT', async () => {
    program = { type: 'resolve', value: null }

    app.exit()
    await flushMicrotasks()

    expect(callLog).toEqual([{ channel: RUST_APP_EXIT, args: [] }])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('quit() also forwards via RUST_APP_EXIT', async () => {
    program = { type: 'resolve', value: null }

    app.quit()
    await flushMicrotasks()

    expect(callLog).toEqual([{ channel: RUST_APP_EXIT, args: [] }])
  })

  // Ordering note (Phase 34.3 Plan 05, D-06): this describe block shares ONE electronStub module
  // instance across all its `it`s (no `jest.resetModules()` in this file), so the module-scope
  // `relaunchInFlight` flag set by relaunch() is NOT reset between tests. Both tests below call
  // relaunch() at least once, which permanently flips the flag for every test that runs after
  // them in this file -- so this test (whose OWN exit() assertion below requires the flag still
  // be false) is declared BEFORE the "relaunch() forwards..." test rather than after it. See
  // `electronStub app.relaunch/quit race guard` (below) for the dedicated, isolated coverage of
  // the guard itself.
  it('exit()/relaunch() never throw and log a warning when requestRustInvoke rejects', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    expect(() => app.exit()).not.toThrow()
    await flushMicrotasks()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain(RUST_APP_EXIT)

    warnSpy.mockClear()
    expect(() => app.relaunch()).not.toThrow()
    await flushMicrotasks()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain(RUST_APP_RELAUNCH)
  })

  it('relaunch() forwards via RUST_APP_RELAUNCH', async () => {
    program = { type: 'resolve', value: null }

    app.relaunch()
    await flushMicrotasks()

    expect(callLog).toEqual([{ channel: RUST_APP_RELAUNCH, args: [] }])
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('electronStub net.isOnline (fix/steam-native-install-stability, 33-05 live-gate gap)', () => {
  // `initOnlineMonitor()` (backend/online_monitor.ts) reads `net.isOnline()` to pick its
  // INITIAL connectivity status before its own authoritative `pingSites()` ping ever runs --
  // this member did not exist on the sidecar's electron stub at all, so the destructured
  // `import { net } from 'electron'` resolved `net.isOnline` to `undefined`, and calling it
  // threw a TypeError the very first time `initOnlineMonitor()` ran under the sidecar.
  it('exists and returns true, letting initOnlineMonitor fall through to the real ping', () => {
    expect(typeof net.isOnline).toBe('function')
    expect(net.isOnline()).toBe(true)
  })

  it('request() member is unchanged (still a safe no-op transport stub)', () => {
    const req = net.request()
    expect(() => req.on()).not.toThrow()
    expect(() => req.end()).not.toThrow()
    expect(() => req.write()).not.toThrow()
    expect(() => req.setHeader()).not.toThrow()
  })
})

describe('electronStub session / powerSaveBlocker stay accepted no-ops but now LOG (D-08/D-09)', () => {
  it('session.fromPartition logs a warning instead of silently returning undefined', () => {
    const result = session.fromPartition('persist:epicstore')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain('session.fromPartition')
    expect(String(warningArg)).toContain('D-09')
    expect(result).toBeDefined()
  })

  it('powerSaveBlocker.start logs a warning and returns the documented safe default (-1)', () => {
    const result = powerSaveBlocker.start()

    expect(result).toBe(-1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain('powerSaveBlocker.start')
    expect(String(warningArg)).toContain('D-08')
  })

  it('powerSaveBlocker.stop/isStarted stay silent, side-effect-free no-ops (unchanged)', () => {
    expect(() => powerSaveBlocker.stop()).not.toThrow()
    expect(powerSaveBlocker.isStarted()).toBe(false)
  })
})

describe('electronStub app.relaunch/quit race guard (Phase 34.3 Plan 05, D-06, REQ-34.3-07)', () => {
  /**
   * Isolation note (mirrors `bootstrapWirings.test.ts`'s single precedent use of this exact
   * pattern, itself following `appShellFlows.test.ts`): every OTHER describe block in this file
   * shares ONE electronStub module instance (no `jest.resetModules()` anywhere), and several of
   * them call `app.relaunch()` -- which permanently flips the module-scope `relaunchInFlight`
   * flag (by design, D-06: never reset in production). A test asserting "quit() with NO prior
   * relaunch() still forwards" would silently pass or fail for the WRONG reason if it reused
   * that already-poisoned shared instance (the flag would already be `true` from an earlier
   * describe block, indistinguishable from a real regression). `jest.isolateModules()` gives
   * each case below its own FRESH copy of `electronStub` (and, transitively, a fresh
   * `../sidecarRpc` mock instance) with `relaunchInFlight` back at its `false` initial value --
   * exactly like a fresh process. `require()` (not `import()`) is required here because
   * `jest.isolateModules()`'s callback must run synchronously.
   */
  function loadFreshApp(): {
    app: typeof import('../electronStub').app
    mockInvoke: jest.Mock
  } {
    let result!: {
      app: typeof import('../electronStub').app
      mockInvoke: jest.Mock
    }
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const sidecarRpc = require('../sidecarRpc') as {
        requestRustInvoke: jest.Mock
      }
      const freshElectronStub =
        require('../electronStub') as typeof import('../electronStub')
      /* eslint-enable @typescript-eslint/no-require-imports */
      sidecarRpc.requestRustInvoke.mockImplementation(() =>
        Promise.resolve(null)
      )
      result = {
        app: freshElectronStub.app,
        mockInvoke: sidecarRpc.requestRustInvoke
      }
    })
    return result
  }

  it('relaunch() then quit() records ONLY the RUST_APP_RELAUNCH call, and quit() emits a suppression warning', async () => {
    const { app: freshApp, mockInvoke } = loadFreshApp()

    freshApp.relaunch()
    await flushMicrotasks()
    freshApp.quit()
    await flushMicrotasks()

    const calls = mockInvoke.mock.calls.map(([channel, args]) => ({
      channel,
      args
    }))
    expect(calls).toEqual([{ channel: RUST_APP_RELAUNCH, args: [] }])
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('a relaunch is already in flight')
    )
  })

  it('quit() alone with no prior relaunch() still records RUST_APP_EXIT (over-suppression regression guard)', async () => {
    const { app: freshApp, mockInvoke } = loadFreshApp()

    freshApp.quit()
    await flushMicrotasks()

    const calls = mockInvoke.mock.calls.map(([channel, args]) => ({
      channel,
      args
    }))
    expect(calls).toEqual([{ channel: RUST_APP_EXIT, args: [] }])
  })

  it('CR-01: quit() after a FAILED relaunch() is NOT suppressed — the app must stay quittable', async () => {
    // Every other case in this describe resolves the mock, so the failed-relaunch path was
    // uncovered. On the success path the relaunch promise never settles (Rust sends no response
    // and the process is replaced first), so a REJECTION means the relaunch did not happen and
    // this process survives. If the guard stayed set, app.quit()/exit() would be permanent no-ops
    // and the app could only be closed by force-quit. resetHeroic() runs this on every reset.
    let result!: {
      app: typeof import('../electronStub').app
      mockInvoke: jest.Mock
    }
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const sidecarRpc = require('../sidecarRpc') as {
        requestRustInvoke: jest.Mock
      }
      const freshElectronStub =
        require('../electronStub') as typeof import('../electronStub')
      /* eslint-enable @typescript-eslint/no-require-imports */
      // Only the relaunch dispatch fails; a subsequent exit dispatch must still go through.
      sidecarRpc.requestRustInvoke.mockImplementation((channel: string) =>
        channel === RUST_APP_RELAUNCH
          ? Promise.reject(new Error('synthetic relaunch transport failure'))
          : Promise.resolve(null)
      )
      result = {
        app: freshElectronStub.app,
        mockInvoke: sidecarRpc.requestRustInvoke
      }
    })
    const { app: freshApp, mockInvoke } = result

    freshApp.relaunch()
    await flushMicrotasks()
    freshApp.quit()
    await flushMicrotasks()

    const calls = mockInvoke.mock.calls.map(([channel, args]) => ({
      channel,
      args
    }))
    // The exit frame MUST be dispatched — this is the whole point of the fix.
    expect(calls).toEqual([
      { channel: RUST_APP_RELAUNCH, args: [] },
      { channel: RUST_APP_EXIT, args: [] }
    ])
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('a relaunch is already in flight')
    )
  })

  it('exit() after relaunch() is also suppressed', async () => {
    const { app: freshApp, mockInvoke } = loadFreshApp()

    freshApp.relaunch()
    await flushMicrotasks()
    freshApp.exit()
    await flushMicrotasks()

    const calls = mockInvoke.mock.calls.map(([channel, args]) => ({
      channel,
      args
    }))
    expect(calls).toEqual([{ channel: RUST_APP_RELAUNCH, args: [] }])
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('a relaunch is already in flight')
    )
  })
})
