/**
 * Gap cycle 2 / CR-01 renderer half (REQ-34.2-12, REQ-34.2-14).
 *
 * Direct proof of reportRepairFailure()'s three independent failure signals
 * (console.error, window.api.logError, an ERROR showDialogModal call), plus
 * the T-34.2-52 information-disclosure guard: the dialog message must never
 * contain the raw error text.
 *
 * No jsdom is installed in this project (testEnvironment: 'node', see
 * src/frontend/jest.config.js) -- reportRepairFailure is a plain function,
 * not a component, so it is called directly with no rendering required.
 */
import { reportRepairFailure } from '../repairFailure'

describe('reportRepairFailure (gap cycle 2, CR-01 renderer half)', () => {
  let logErrorMock: jest.Mock
  let showDialogModalMock: jest.Mock
  let consoleErrorSpy: jest.SpyInstance
  const t = ((key: string, defaultValue: string) => defaultValue) as never

  beforeEach(() => {
    logErrorMock = jest.fn()
    showDialogModalMock = jest.fn()

    const globalWithWindow = globalThis as unknown as { window?: unknown }
    if (!globalWithWindow.window) {
      globalWithWindow.window = {}
    }
    ;(globalThis as unknown as { window: { api: { logError: jest.Mock } } }).window.api =
      { logError: logErrorMock }

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  // RED-PROOF: covers side effect 1 (console.error). Deleting the
  // console.error call in repairFailure.ts fails only this test.
  it('calls console.error exactly once, with a message containing the appName', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: new Error('boom'),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    const [message] = consoleErrorSpy.mock.calls[0] as [string]
    expect(message).toContain('MyGame')
  })

  // RED-PROOF: covers side effect 2 (window.api.logError). Deleting the
  // logError call in repairFailure.ts fails only this test.
  it('calls window.api.logError exactly once with a string containing the appName and the error text', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: new Error('boom'),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [message] = logErrorMock.mock.calls[0] as [string]
    expect(message).toContain('MyGame')
    expect(message).toContain('boom')
  })

  // RED-PROOF: covers side effect 3 (showDialogModal) AND the T-34.2-52
  // information-disclosure guard in a single test, since both assertions
  // read the SAME showDialogModal call. Deliberately kept as one test (not
  // split across two `it` blocks) so that deleting the single
  // showDialogModal call in repairFailure.ts fails EXACTLY one test in this
  // suite, per this plan's own RED spot-check requirement -- spot-checked
  // by hand, see 34.2-17-SUMMARY.md.
  it('calls showDialogModal exactly once with showDialog true, type ERROR, a non-empty title/message, and never includes the raw error text (T-34.2-52)', () => {
    const secretToken = 'SENTINEL-TOKEN-9f3a2c-/Users/secret/path'

    reportRepairFailure({
      appName: 'MyGame',
      error: new Error(secretToken),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(showDialogModalMock).toHaveBeenCalledTimes(1)
    const [options] = showDialogModalMock.mock.calls[0] as [
      { showDialog: boolean; type: string; title: string; message: string }
    ]
    expect(options.showDialog).toBe(true)
    expect(options.type).toBe('ERROR')
    expect(options.title.length).toBeGreaterThan(0)
    expect(options.message.length).toBeGreaterThan(0)
    // Information-disclosure guard: the FIXED translated string only, never
    // the raw error text (which may carry absolute paths or credential-
    // adjacent detail).
    expect(options.message).not.toContain(secretToken)
  })

  // Independent 4th test (not tied to the showDialogModal call): proves the
  // console.error/logError signals also fire for a plain-string thrown
  // value. This is a real, unremarkable scenario (e.g. `throw 'timed out'`)
  // -- NOT a hostile one. It never exercises the `${error}` primitive-
  // conversion throw path (a plain string is already a primitive), so it
  // must not be read as covering the WR-03 hostile-reason class; that
  // claim belongs solely to the three tests below.
  it('still reports console.error and window.api.logError for a plain-string thrown value (non-hostile baseline)', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: 'a plain string rejection',
      showDialogModal: showDialogModalMock,
      t
    })

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [logMessage] = logErrorMock.mock.calls[0] as [string]
    expect(logMessage).toContain('a plain string rejection')
  })

  // WR-03 hostile-reason regression cases (gap cycle 3).
  //
  // repairFailure.ts:45 interpolates `${error}` where `error: unknown`, with
  // no try/catch -- the identical defect class plan 34.2-15 removed from
  // processGuards.ts, reintroduced here. For a null-prototype reason, or one
  // whose `toString`/`Symbol.toPrimitive` throws, that interpolation throws
  // `TypeError: Cannot convert object to primitive value` BEFORE reaching
  // the showDialogModal call two lines below -- so the ERROR dialog
  // REQ-34.2-12 exists to guarantee never renders, and the throw escapes
  // onRepairYesClick's catch into the un-awaited dialog-button handler at
  // index.tsx:158 as an unhandled renderer rejection.
  //
  // These three constructions are the same shapes plan 34.2-15 used in
  // src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts (Group 2,
  // lines 577-628), so both suites exercise an identical adversary.
  //
  // RED-PROOF (confirmed by hand 2026-07-26 against the pre-fix
  // implementation, before Task 2's hardening): all three tests below FAILED
  // with `TypeError: Cannot convert object to primitive value` thrown out of
  // `reportRepairFailure` itself, and `showDialogModalMock` was never
  // called. See 34.2-21-SUMMARY.md for the verbatim jest output. Do not
  // weaken these constructions to something jest's own conversions can
  // tolerate -- that is exactly how the previous 4th test came to pass
  // vacuously (see the baseline test above).
  const hostileReasons: Array<[string, unknown]> = [
    ['a null-prototype object', Object.create(null) as unknown],
    [
      'an object whose toString throws',
      {
        toString() {
          throw new Error('toString exploded')
        }
      }
    ],
    [
      'an object whose Symbol.toPrimitive throws',
      {
        [Symbol.toPrimitive]() {
          throw new Error('toPrimitive exploded')
        }
      }
    ]
  ]

  it.each(hostileReasons)(
    'does not throw and still calls showDialogModal with type ERROR for %s',
    (_label, error) => {
      expect(() =>
        reportRepairFailure({
          appName: 'MyGame',
          error,
          showDialogModal: showDialogModalMock,
          t
        })
      ).not.toThrow()

      expect(showDialogModalMock).toHaveBeenCalledTimes(1)
      const [options] = showDialogModalMock.mock.calls[0] as [
        { type: string }
      ]
      expect(options.type).toBe('ERROR')
    }
  )

  it.each(hostileReasons)(
    'still calls window.api.logError exactly once for %s (signal 2 degrades to a fallback string, never disappears)',
    (_label, error) => {
      reportRepairFailure({
        appName: 'MyGame',
        error,
        showDialogModal: showDialogModalMock,
        t
      })

      expect(logErrorMock).toHaveBeenCalledTimes(1)
    }
  )

  it.each(hostileReasons)(
    'still calls console.error exactly once for %s (signal 1 is unaffected)',
    (_label, error) => {
      reportRepairFailure({
        appName: 'MyGame',
        error,
        showDialogModal: showDialogModalMock,
        t
      })

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    }
  )

  it('showDialogModal message is still the fixed translated string only, for a hostile reason (T-34.2-52 survives the hardening)', () => {
    const [, hostileError] = hostileReasons[1]

    reportRepairFailure({
      appName: 'MyGame',
      error: hostileError,
      showDialogModal: showDialogModalMock,
      t
    })

    expect(showDialogModalMock).toHaveBeenCalledTimes(1)
    const [options] = showDialogModalMock.mock.calls[0] as [
      { message: string }
    ]
    expect(options.message).toBe('Repair failed. See the log for details.')
  })

  // WR-06 (gap cycle 4, plan 34.2-27, REQ-34.2-12/-14).
  //
  // repairFailure.ts wraps `window.api.logError(...)` (signal 2) in an empty
  // catch. Under Tauri the single most likely failure of that call is that
  // the preload factory did not attach it (`window.api` or `.logError`
  // undefined) -- a TypeError, not a log-write failure -- and today it is
  // discarded with zero trace: the exact silent-void class this phase exists
  // to close, reproduced inside the very function written to close it.
  // Separately, signal 3's `showDialogModal`/`t` calls are unguarded, so a
  // throwing caller-supplied dependency still escapes `reportRepairFailure`
  // into the un-awaited dialog-button handler at `index.tsx:158`.
  describe('WR-06: individually-diagnosed signals, dialog survives a throwing t/showDialogModal', () => {
    // RED-PROOF (confirmed by hand against unmodified repairFailure.ts): the
    // empty catch means console.error is called once, not twice -- this test
    // failed on the toHaveBeenCalledTimes(2) assertion.
    it('Test 1: still calls showDialogModal once and diagnoses the log-signal failure when window.api.logError throws', () => {
      logErrorMock.mockImplementation(() => {
        throw new Error('no api')
      })

      expect(() =>
        reportRepairFailure({
          appName: 'MyGame',
          error: new Error('boom'),
          showDialogModal: showDialogModalMock,
          t
        })
      ).not.toThrow()

      expect(showDialogModalMock).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
      const diagnosticCall = consoleErrorSpy.mock.calls.find(([first]) =>
        typeof first === 'string' &&
        first.includes('repair-failure log signal unavailable')
      )
      expect(diagnosticCall).toBeDefined()
    })

    // RED-PROOF (confirmed by hand): with the empty catch, no diagnostic is
    // ever emitted for an absent window.api -- this test failed on the
    // diagnostic-presence assertion.
    it('Test 2: still calls showDialogModal once and diagnoses the log-signal failure when window.api is entirely absent', () => {
      const globalWithWindow = globalThis as unknown as {
        window: { api?: { logError: jest.Mock } }
      }
      const savedApi = globalWithWindow.window.api
      delete globalWithWindow.window.api

      try {
        expect(() =>
          reportRepairFailure({
            appName: 'MyGame',
            error: new Error('boom'),
            showDialogModal: showDialogModalMock,
            t
          })
        ).not.toThrow()

        expect(showDialogModalMock).toHaveBeenCalledTimes(1)
        const diagnosticCall = consoleErrorSpy.mock.calls.find(([first]) =>
          typeof first === 'string' &&
          first.includes('repair-failure log signal unavailable')
        )
        expect(diagnosticCall).toBeDefined()
      } finally {
        globalWithWindow.window.api = savedApi
      }
    })

    // RED-PROOF (confirmed by hand): the throw from `t` escapes
    // reportRepairFailure entirely before showDialogModal is ever reached --
    // this test failed with the thrown error visible in the failure output,
    // not as an assertion diff.
    it('Test 3: still renders a non-empty dialog title/message when t throws on the title key', () => {
      const throwingT = ((key: string, defaultValue: string) => {
        if (key === 'box.error.title') {
          throw new Error('translation exploded')
        }
        return defaultValue
      }) as never

      expect(() =>
        reportRepairFailure({
          appName: 'MyGame',
          error: new Error('boom'),
          showDialogModal: showDialogModalMock,
          t: throwingT
        })
      ).not.toThrow()

      expect(showDialogModalMock).toHaveBeenCalledTimes(1)
      const [options] = showDialogModalMock.mock.calls[0] as [
        { title: string; message: string }
      ]
      expect(options.title.length).toBeGreaterThan(0)
      expect(options.message.length).toBeGreaterThan(0)
    })

    // RED-PROOF (confirmed by hand): the throw from showDialogModal
    // propagates straight out of reportRepairFailure -- this test failed
    // with the thrown error visible in the failure output, not as an
    // assertion diff.
    it('Test 4: does not throw and diagnoses the dialog-signal failure when showDialogModal throws', () => {
      const throwingShowDialogModal = jest.fn(() => {
        throw new Error('dialog exploded')
      })

      expect(() =>
        reportRepairFailure({
          appName: 'MyGame',
          error: new Error('boom'),
          showDialogModal: throwingShowDialogModal,
          t
        })
      ).not.toThrow()

      const diagnosticCall = consoleErrorSpy.mock.calls.find(([first]) =>
        typeof first === 'string' &&
        first.includes('repair-failure dialog signal unavailable')
      )
      expect(diagnosticCall).toBeDefined()
    })

    // Must stay GREEN before and after Task 2: a regression guard on the
    // change, not a new capability.
    it('Test 5: T-34.2-52 survives even when window.api.logError throws (dialog message never carries the raw error text)', () => {
      const secretToken = 'SENTINEL-TOKEN-9f3a2c-/Users/secret/path'
      logErrorMock.mockImplementation(() => {
        throw new Error('no api')
      })

      reportRepairFailure({
        appName: 'MyGame',
        error: new Error(secretToken),
        showDialogModal: showDialogModalMock,
        t
      })

      expect(showDialogModalMock).toHaveBeenCalledTimes(1)
      const [options] = showDialogModalMock.mock.calls[0] as [
        { message: string }
      ]
      expect(options.message).not.toContain(secretToken)
    })
  })
})
